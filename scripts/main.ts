runOnStartup(async runtime => {
    runtime.addEventListener("beforeprojectstart", () => OnBeforeProjectStart(runtime));
});

async function OnBeforeProjectStart(runtime: IRuntime) {
    runtime.addEventListener("tick", () => Tick(runtime));
}

// ================================
// CONFIGURACIÓN GLOBAL
// ================================
let gameTime = 0;
let gameHour = 0;
const HOUR_DURATION = 60; 
let score = 0;

// ================================
// CONFIGURACIÓN DE OLEADAS
// ================================
let waveState = "ESPERANDO"; 
let enemiesToSpawn = 0;      
let enemiesAlive = 0;     
let timeBetweenWaves = 7;    
let waveTimer = 0;          
let spawnRateTimer = 0;      
let waveCount = 1;           

const MAP_SIZE = 60; 

// AÑADIDO "Nube" al mapeo para que coincida con tu LootTable
const MASK_FRAMES: any = {
    "Normal": 0, "Fuego": 1, "Hielo": 2, "Rayo": 3, "Peste": 4, "Luz": 5, "Nube": 6
};

function Tick(runtime: IRuntime) {
    const players = runtime.objects.Player.getAllInstances();
    const mouse = runtime.mouse;
    const keyboard = runtime.keyboard;
    const tilemap = runtime.objects.MapaDeTeselas.getFirstInstance();

    // Variable para contar cuántos siguen vivos en este frame
    let playersAliveCount = 0;

    // =================================================
    // 0. CONTROL DE MÁSCARAS
    // =================================================
    if (runtime.objects.Mask.getAllInstances().length < 6) {
        spawnMaskReward(runtime);
    }

    // =================================================
    // 1. JUGADORES – LÓGICA PRINCIPAL
    // =================================================
    for (const p of players) {
        const player = p as any;
        
        // --- ESTADO DE VIDA ---
        if (player.instVars.HP > 0) {
            playersAliveCount++; // Contamos que este está vivo
            player.opacity = 1;  
        } else {
            player.opacity = 0.3; // Fantasma
        }







        const timer = player.behaviors.Timer;
        if (!timer) continue;

        // --- FUNCION DE DISPARO ---
        const fireBullet = (angle: number) => {
            if (timer.isTimerRunning("fire")) return;

            const bullet = runtime.objects.Bullet_Type.createInstance(
                "Layer 0", player.x, player.y
            ) as any;

            bullet.angle = angle;
            bullet.behaviors.Bullet?.setAngle(angle);

            bullet.instVars.Damage = player.instVars.Damage || 10;
            bullet.instVars.IgnoreUID = player.uid;
            bullet.instVars.OwnerUID = player.uid; 
            bullet.instVars.ActiveMask = player.instVars.ActiveMask || "Normal";

            timer.startTimer(player.instVars.AttackSpeed || 0.5, "fire");
        };

        // Player 1 – Mouse
        if (player.instVars.PlayerID === 1 && mouse?.isMouseButtonDown(0)) {
            const [mx, my] = mouse.getMousePosition();
            fireBullet(Math.atan2(my - player.y, mx - player.x));
        }

        // Player 2 – Teclado
        if (player.instVars.PlayerID === 2 && keyboard?.isKeyDown("KeyO")) {
            fireBullet(player.angle);
        }

        // --- COLISIONES (Recibir Daño) ---
        for (const b of runtime.objects.Enemy_Bullet.instances()) {
            const bullet = b as any;
            if (tilemap && bullet.testOverlap(tilemap)) { bullet.destroy(); continue; }
            if (bullet.isDestroyed) continue;

            if (bullet.testOverlap(player)) {
                player.instVars.HP -= 10;
                bullet.destroy();
                player.colorRgb = [10, 0, 0];
                setTimeout(() => player && (player.colorRgb = [1, 1, 1]), 100);
                break;
            }
        }
        
        // --- RECOGER MÁSCARAS ---
        const mask = runtime.objects.Mask.getAllInstances().find(m => player.testOverlap(m));
        if (mask) {
            updatePlayerStats(player, (mask as any).instVars.MaskID);
            mask.destroy();
            score += 500;
        }
    }

    // =================================================
    // 2. CHECK DE GAME OVER (FUERA DEL BUCLE)
    // =================================================
    // Si el contador de vivos es 0, mostramos el mensaje.
    if (playersAliveCount === 0) {
        const txt = runtime.objects.TxtAnuncio.getFirstInstance();
        if (txt) {
            txt.text = "¡FIN DEL JUEGO!";
            txt.opacity = 1;
            txt.fontColor = [1, 0, 0];
        }
    }

    // =================================================
    // 3. TIEMPO, OLEADAS Y RESURRECCIÓN
    // =================================================
    gameTime += runtime.dt;
    const currentHour = Math.floor(gameTime / HOUR_DURATION);

    // Cambio de hora: Curar y REVIVIR
    if (currentHour > gameHour) {
        gameHour = currentHour;
        spawnMaskReward(runtime);
        players.forEach(p => {
            const pl = p as any;
            pl.instVars.HP += 20; 
            if(pl.instVars.HP > 100) pl.instVars.HP = 100;
        });
        
        // Limpiamos mensaje de Game Over si revivieron
        const txt = runtime.objects.TxtAnuncio.getFirstInstance();
        if (txt && playersAliveCount > 0) txt.opacity = 0; 
    }

    const enemiesAlive = runtime.objects.Enemy.getAllInstances().length;
    const txtAnuncio = runtime.objects.TxtAnuncio.getFirstInstance();
    
    // Solo mostramos texto de oleada si NO es Game Over
    if (playersAliveCount > 0) {
        switch (waveState) {
            case "ESPERANDO":
                waveTimer += runtime.dt;
                if (txtAnuncio) {
                    txtAnuncio.text = `OLEADA ${waveCount}\nCOMIENZA EN ${Math.ceil(timeBetweenWaves - waveTimer)}`;
                    txtAnuncio.opacity = 1;
                    txtAnuncio.fontColor = [1, 1, 1]; // Reset color por si estaba rojo
                }
                if (waveTimer >= timeBetweenWaves) {
                    const baseEnemies = 3 + gameHour * 2 + Math.floor(waveCount / 2);
                    // Más enemigos si hay 2 jugadores
                    enemiesToSpawn = Math.floor(baseEnemies * (1 + (players.length - 1) * 0.5)); 
                    waveState = "SPAWNEANDO";
                    waveTimer = 0;
                }
                break;

            case "SPAWNEANDO":
                spawnRateTimer += runtime.dt;
                if (spawnRateTimer >= 0.5 && enemiesToSpawn > 0) {
                    const sp = getValidSpawnPoint(runtime);
                    if (sp) {
                        runtime.objects.Enemy.createInstance("Layer 0", sp.x, sp.y);
                        enemiesToSpawn--;
                        spawnRateTimer = 0;
                    }
                }
                if (enemiesToSpawn <= 0) waveState = "PELEANDO";
                break;

            case "PELEANDO":
                if (txtAnuncio) txtAnuncio.opacity = 0; // Ocultar texto durante pelea
                if (enemiesAlive === 0) {
                    waveCount++;
                    waveState = "ESPERANDO";
                    waveTimer = 0;
                    // Revivir un poco al pasar oleada
                    players.forEach(p => {
                        const pl = p as any;
                        if (pl.instVars.HP <= 0) pl.instVars.HP = 50; 
                    });
                }
                break;
        }
    }

    // =================================================
    // 4. IA DE ENEMIGOS
    // =================================================
    const DISTANCIA_IDEAL = 400;
    const RANGO_DISPARO = 600;

    for (const enemy of runtime.objects.Enemy.instances()) {
        const e = enemy as any;
        if (e.instVars.IsFrozen) continue;

        let target: any = null;
        let minDist = Infinity;

        for (const p of players) {
            const pl = p as any;
            // Enemigos ignoran a muertos
            if (pl.instVars.HP <= 0) continue; 

            const d = Math.hypot(pl.x - e.x, pl.y - e.y);
            if (d < minDist) {
                minDist = d;
                target = pl;
            }
        }

        if (!target) continue; 

        const angle = Math.atan2(target.y - e.y, target.x - e.x);
        e.angle = minDist > DISTANCIA_IDEAL ? angle : angle + 1.57;

        const move = e.behaviors["8Direction"];
        if (move) {
            move.simulateControl(Math.cos(e.angle) > 0 ? "right" : "left");
            move.simulateControl(Math.sin(e.angle) > 0 ? "down" : "up");
        }

        if (minDist < RANGO_DISPARO) {
            const timer = e.behaviors.Timer;
            if (timer && !timer.isTimerRunning("enemy_fire")) {
                const eb = runtime.objects.Enemy_Bullet.createInstance("Layer 0", e.x, e.y) as any;
                eb.angle = angle;
                eb.behaviors.Bullet?.setAngle(angle);
                timer.startTimer(1.5, "enemy_fire");
            }
        }
    }
}


export function updatePlayerStats(Player: any, maskId: string) {
    // 1. Actualizar Stats del Jugador (Esto estaba bien)
    Player.instVars.ActiveMask = maskId;
    const runtime = Player.runtime;
    
    switch (maskId) {
        case "Fuego": Player.instVars.AttackSpeed = 0.2; Player.instVars.Damage = 15; break;
        case "Hielo": Player.instVars.AttackSpeed = 0.5; Player.instVars.Damage = 30; break;
        case "Nube":  Player.instVars.AttackSpeed = 0.05; Player.instVars.Damage = 5; break;
        case "Rayo":  Player.instVars.AttackSpeed = 0.4; Player.instVars.Damage = 20; break;
        case "Peste": Player.instVars.AttackSpeed = 0.6; Player.instVars.Damage = 10; break;
        case "Luz":   Player.instVars.AttackSpeed = 0.8; Player.instVars.Damage = 10; break;
        default:      Player.instVars.AttackSpeed = 0.8; Player.instVars.Damage = 10; Player.instVars.ActiveMask = "Normal";
    }

    // 2. LOGICA UI CORREGIDA PARA 2 JUGADORES
    // Obtenemos el ID del jugador que recogió la máscara (1 o 2)a
    const pID = Player.instVars.PlayerID;

    // Buscamos TODOS los textos de máscara
    const allTexts = runtime.objects.TxtNombreMascara.getAllInstances();

    // Filtramos para encontrar SOLO el texto que tiene el mismo ID que el jugador
    const uiText = allTexts.find((t: any) => t.instVars.PlayerID === pID);

    if (uiText) {
        const txtObj = uiText as any;
        
        // Opcional: Actualizamos el texto para que diga el nombre de la máscara
        txtObj.text = maskId.toUpperCase(); 

        // Cambiamos el color según la máscara
        if (maskId === "Fuego") txtObj.fontColor = [1, 0.2, 0.2];      
        else if (maskId === "Hielo") txtObj.fontColor = [0.2, 0.8, 1]; 
        else if (maskId === "Peste") txtObj.fontColor = [0.2, 1, 0.2]; 
        else if (maskId === "Rayo")  txtObj.fontColor = [1, 1, 0];      
        else if (maskId === "Luz")   txtObj.fontColor = [1, 0.9, 0.6]; // Color para Luz
        else if (maskId === "Nube")  txtObj.fontColor = [0.8, 0.8, 0.8]; // Color para Nube
        else txtObj.fontColor = [1, 1, 1];                             
    }
}


function getValidSpawnPoint(runtime: IRuntime) {
    const tilemap = runtime.objects.MapaDeTeselas.getFirstInstance() as any;
    // CAMBIO 1: Obtenemos todos los jugadores en lugar de solo el primero
    const players = runtime.objects.Player.getAllInstances();
    
    // Si no hay mapa o no hay jugadores vivos, no hacemos nada
    if (!tilemap || players.length === 0) return null;

    const MIN_DIST_SPAWN = 500; 

    for (let i = 0; i < 30; i++) { 
        const gridX = Math.floor(Math.random() * MAP_SIZE); 
        const gridY = Math.floor(Math.random() * MAP_SIZE); 
        const tileID = tilemap.getTileAt(gridX, gridY);

        if (tileID === 2) { 
            const realX = gridX * 32 + 16;
            const realY = gridY * 32 + 16;
            
            // CAMBIO 2: Lógica de validación para MULTIJUGADOR
            let isSafe = true;

            for (const p of players) {
                const player = p as any;
                const dist = Math.hypot(realX - player.x, realY - player.y);
                
                // Si está demasiado cerca de CUALQUIER jugador, el punto no es válido
                if (dist < MIN_DIST_SPAWN) {
                    isSafe = false;
                    break; // Dejamos de comprobar, ya falló con uno
                }
            }

            // Solo retornamos el punto si es seguro para TODOS los jugadores
            if (isSafe) {
                return { x: realX, y: realY };
            }
        }
    }
    return null; 
}

// NUEVA FUNCIÓN CON TU TABLA DE PROBABILIDADES
function spawnMaskReward(runtime: IRuntime) {
    const point = getValidSpawnPoint(runtime);
    if (!point) return;

    // Tu tabla personalizada
    const lootTable: any = {
        "Fuego": 30,
        "Hielo": 10,
        "Peste": 25,
        "Rayo":  15,
        "Luz":   10,
        "Nube":  5
    };

    let totalWeight = 0;
    for (const key in lootTable) totalWeight += lootTable[key];

    let randomValue = Math.random() * totalWeight;
    let selectedMask = "Fuego"; 

    for (const key in lootTable) {
        if (randomValue < lootTable[key]) {
            selectedMask = key;
            break;
        }
        randomValue -= lootTable[key];
    }

    const mask = runtime.objects.Mask.createInstance("Layer 0", point.x, point.y) as any;
    mask.instVars.MaskID = selectedMask;
    
    // Forzamos visuales para que se vean bien
    mask.width = 32; 
    mask.height = 32;
    mask.zElevation = 0.5; 
    
    // Asignamos el frame visual correspondiente
    mask.animationFrame = MASK_FRAMES[selectedMask] || 0;
    
    // console.log(`Spawn de Máscara: ${selectedMask}`);
}


