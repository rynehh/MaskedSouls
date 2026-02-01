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

const MASK_FRAMES: any = {
    "Normal": 0, "Fuego": 1, "Hielo": 2, "Rayo": 3, "Peste": 4, "Luz": 5, "Nube": 6
};

function Tick(runtime: IRuntime) {
    const players = runtime.objects.Player.getAllInstances();
    const mouse = runtime.mouse;
    const keyboard = runtime.keyboard; // NECESARIO: Agrega el objeto Keyboard al proyecto
    const tilemap = runtime.objects.MapaDeTeselas.getFirstInstance();

    // =================================================
    // 0. CONTROL DE MÁSCARAS (GLOBAL)
    // =================================================
    const currentMasks = runtime.objects.Mask.getAllInstances().length;
    if (currentMasks < 6) {
        spawnMaskReward(runtime);
    }

    // =================================================
    // 1. GAMEPLAY (LOGICA POR JUGADOR)
    // =================================================
    
    // Recorremos todos los jugadores vivos
    let playerIndex = 0;
    for (const p of players) {
        const player = p as any;
        
        // --- CONTROLES JUGADOR 1 (MOUSE) ---
        if (playerIndex === 0) { 
            if (mouse && mouse.isMouseButtonDown(0)) {
                const mousePos = mouse.getMousePosition();
                const angle = Math.atan2(mousePos[1] - player.y, mousePos[0] - player.x);
                tryShoot(runtime, player, angle);
            }
        }
        
        // --- CONTROLES JUGADOR 2 (TECLADO - Autoaim al más cercano) ---
        else if (playerIndex === 1) {
            if (keyboard && keyboard.isKeyDown("Space")) { // Dispara con ESPACIO
                const closestEnemy = getClosestEnemy(player, runtime);
                let angle = player.angle; // Por defecto dispara al frente
                
                if (closestEnemy) {
                    angle = Math.atan2(closestEnemy.y - player.y, closestEnemy.x - player.x);
                }
                
                tryShoot(runtime, player, angle);
            }
        }
        

        // --- RECOGER MÁSCARAS (Cualquier jugador) ---
        const mask = runtime.objects.Mask.getAllInstances().find(m => player.testOverlap(m));
        if (mask) {
            updatePlayerStats(player, (mask as any).instVars.MaskID);
            mask.destroy();
            player.instVars.Score = (player.instVars.Score || 0) + 500; 
        }
        
        playerIndex++;
    }

    // =================================================
    // 1.1 GESTIÓN DE BALAS (GLOBAL)
    // =================================================
    
    // A. BALAS JUGADOR (Cualquiera) CONTRA PAREDES
    for (const b of runtime.objects.Bullet_Type.instances()) {
        if (tilemap && b.testOverlap(tilemap)) { b.destroy(); }
    }

    // B. BALAS ENEMIGAS Y DAÑO A JUGADORES
    for (const b of runtime.objects.Enemy_Bullet.instances()) {
        const bullet = b as any;
        
        // Chocar pared
        if (tilemap && bullet.testOverlap(tilemap)) { bullet.destroy(); continue; }

        // Chocar contra CUALQUIER jugador
        for (const p of players) {
            const player = p as any;
            if (bullet.testOverlap(player)) {
                player.instVars.HP -= 10;
                bullet.destroy();
                
                // Feedback de daño
                player.colorRgb = [10, 0, 0];
                setTimeout(() => { if (player) player.colorRgb = [1, 1, 1]; }, 100);

                if (player.instVars.HP <= 0) {
                    player.destroy(); // Muere este jugador específico
                }
                break; // La bala solo golpea a un jugador a la vez
            }
        }
    }

    // C. CHEQUEO DE GAME OVER (Si mueren TODOS)
    if (players.length === 0 && waveState !== "GAMEOVER") {
        console.log("GAME OVER - TODOS MUERTOS");
        waveState = "GAMEOVER"; // Previene loop de logs
        const txtAnuncio = runtime.objects.TxtAnuncio ? runtime.objects.TxtAnuncio.getFirstInstance() : null;
        if (txtAnuncio) {
            txtAnuncio.text = "¡FIN DEL JUEGO!";
            txtAnuncio.opacity = 1;
            txtAnuncio.fontColor = [1, 0, 0];
        }
    }

    // =================================================
    // 2. SISTEMA DE TIEMPO Y OLEADAS
    // =================================================
    // Solo avanzamos el tiempo si hay alguien vivo
    if (players.length > 0) {
        gameTime += runtime.dt;
        const currentHour = Math.floor(gameTime / HOUR_DURATION);

        if (currentHour > gameHour) {
            gameHour = currentHour;
            // Curar a todos los jugadores vivos al cambiar de hora
            for (const p of players) {
                const pl = p as any;
                pl.instVars.HP = Math.min(100, (pl.instVars.HP || 0) + 20);
            }
        }
    }

    const currentEnemies = runtime.objects.Enemy.getAllInstances();
    enemiesAlive = currentEnemies.length;
    const txtAnuncio = runtime.objects.TxtAnuncio ? runtime.objects.TxtAnuncio.getFirstInstance() : null;

    if (waveState !== "GAMEOVER") {
        switch (waveState) {
            case "ESPERANDO":
                waveTimer += runtime.dt;
                if (txtAnuncio) {
                    const timeLeft = Math.ceil(timeBetweenWaves - waveTimer);
                    txtAnuncio.text = "OLEADA " + waveCount + "\nCOMIENZA EN " + timeLeft;
                    if (waveTimer < 1) txtAnuncio.opacity = waveTimer;
                    else if (waveTimer > timeBetweenWaves - 1) txtAnuncio.opacity = timeBetweenWaves - waveTimer;
                    else txtAnuncio.opacity = 1;
                }
                if (waveTimer >= timeBetweenWaves) {
                    // Dificultad escala un poco más por ser 2 jugadores (multiplicamos base)
                    const playerCountMult = players.length > 1 ? 1.5 : 1; 
                    enemiesToSpawn = Math.floor((3 + (gameHour * 2) + Math.floor(waveCount / 2)) * playerCountMult);
                    waveState = "SPAWNEANDO";
                    waveTimer = 0;
                }
                break;

            case "SPAWNEANDO":
                spawnRateTimer += runtime.dt;
                if (spawnRateTimer >= 0.5 && enemiesToSpawn > 0) {
                    const spawnPoint = getValidSpawnPoint(runtime);
                    if (spawnPoint) {
                        runtime.objects.Enemy.createInstance("Layer 0", spawnPoint.x, spawnPoint.y);
                        enemiesToSpawn--;
                        spawnRateTimer = 0;
                    }
                }
                if (enemiesToSpawn <= 0) waveState = "PELEANDO";
                break;

            case "PELEANDO":
                if (enemiesAlive === 0) {
                    waveCount++;
                    waveState = "ESPERANDO";
                    waveTimer = 0;
                }
                break;
        }
    }

    // =================================================
    // 3. IA ENEMIGOS (BUSCAR AL JUGADOR MÁS CERCANO)
    // =================================================
    const DISTANCIA_IDEAL = 400;
    const RANGO_DISPARO = 600;

    for (const enemy of runtime.objects.Enemy.instances()) {
        const e = enemy as any;
        if (!e.instVars.IsFrozen) {
            
            // Buscar objetivo más cercano
            let targetPlayer = null;
            let minDistance = 999999;

            for(const p of players) {
                const dist = Math.hypot(p.x - e.x, p.y - e.y);
                if(dist < minDistance) {
                    minDistance = dist;
                    targetPlayer = p;
                }
            }

            if (targetPlayer) {
                const angleToPlayer = Math.atan2(targetPlayer.y - e.y, targetPlayer.x - e.x);

                if (minDistance > DISTANCIA_IDEAL) e.angle = angleToPlayer;
                else e.angle = angleToPlayer + 1.57; // Orbitar

                const behavior8Dir = e.behaviors["8Direction"];
                if (behavior8Dir) {
                    const vx = Math.cos(e.angle);
                    const vy = Math.sin(e.angle);
                    if (vx > 0.1) behavior8Dir.simulateControl("right");
                    if (vx < -0.1) behavior8Dir.simulateControl("left");
                    if (vy > 0.1) behavior8Dir.simulateControl("down");
                    if (vy < -0.1) behavior8Dir.simulateControl("up");
                }

                if (minDistance < RANGO_DISPARO) {
                    const timer = e.behaviors.Timer;
                    if (timer && !timer.isTimerRunning("enemy_fire")) {
                        const eb = runtime.objects.Enemy_Bullet.createInstance("Layer 0", e.x, e.y) as any;
                        eb.angle = angleToPlayer;
                        timer.startTimer(1.5, "enemy_fire");
                    }
                }
            }
        }
    }

    // =================================================
    // 4. UI 
    // =================================================
    updateUI(runtime, gameTime, players);
}

// =================================================
// FUNCIONES AUXILIARES
// =================================================

function tryShoot(runtime: IRuntime, player: any, angle: number) {
    const timer = player.behaviors.Timer;
    if (timer && !timer.isTimerRunning("fire")) {
        const bullet = runtime.objects.Bullet_Type.createInstance("Layer 0", player.x, player.y) as any;
        bullet.angle = angle;
        if (bullet.behaviors.Bullet) bullet.behaviors.Bullet.angle = angle;
        
        bullet.instVars.Damage = player.instVars.Damage || 10;
        const speed = player.instVars.AttackSpeed || 0.5;
        timer.startTimer(speed, "fire");
    }
}

function getClosestEnemy(player: any, runtime: IRuntime) {
    let closest = null;
    let minDst = 999999;
    for (const e of runtime.objects.Enemy.instances()) {
        const d = Math.hypot(e.x - player.x, e.y - player.y);
        if (d < minDst) {
            minDst = d;
            closest = e;
        }
    }
    return closest;
}

function updateUI(runtime: IRuntime, gameTime: number, players: any[]) {
    // 1. Actualizar Tiempo (Esto es global, está bien usar getFirstInstance)
    const txtTime = runtime.objects.TxtTime ? runtime.objects.TxtTime.getFirstInstance() : null;
    if (txtTime) {
        const minutes = Math.floor(gameTime / 60);
        const seconds = Math.floor(gameTime % 60);
        txtTime.text = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    }

    // 2. Actualizar UI Individual por Jugador
    // Recorremos cada jugador y buscamos SU interfaz correspondiente
    let pIndex = 0;
    for (const p of players) {
        const player = p as any;
        
        // Supongamos que usas la variable de instancia PlayerID en el Player también (0 y 1)
        // O simplemente usamos el índice del loop (0 para el primero, 1 para el segundo)
        const currentID = pIndex; 

        // --- PUNTAJE ---
        // Buscamos todos los textos de puntaje y filtramos el que tenga la misma ID
        const scoreTexts = runtime.objects.TxtPuntaje ? runtime.objects.TxtPuntaje.getAllInstances() : [];
        const myScoreTxt = scoreTexts.find((t: any) => t.instVars.PlayerID === currentID);
        
        if (myScoreTxt) {
            // Asegúrate de sumar el score individual en la variable del jugador
            myScoreTxt.text = "PTS: " + (player.instVars.Score || 0); 
        }

        // --- NOMBRE / MÁSCARA ---
        const maskTexts = runtime.objects.TxtNombreMascara ? runtime.objects.TxtNombreMascara.getAllInstances() : [];
        const myMaskTxt = maskTexts.find((t: any) => t.instVars.PlayerID === currentID);
        
        if (myMaskTxt) {
            const currentMask = String(player.instVars.ActiveMask || "Normal");
            myMaskTxt.text = currentMask;
            
            // Colores según máscara (Opcional)
            if (currentMask === "Fuego") myMaskTxt.fontColor = [1, 0.2, 0.2];
            else if (currentMask === "Hielo") myMaskTxt.fontColor = [0.2, 0.8, 1];
            else myMaskTxt.fontColor = [1, 1, 1];
        }

       // --- CORAZONES ---
        const allHearts = runtime.objects.CorazonUI ? runtime.objects.CorazonUI.getAllInstances() : [];
        const myHearts = allHearts.filter((h: any) => h.instVars.PlayerID === currentID);
        
        if (myHearts.length > 0) {
            myHearts.sort((a, b) => a.x - b.x); // Ordenar visualmente
            
            const hp = Number(player.instVars.HP || 100);
            const maxHP = 100;
            const hpPerHeart = maxHP / myHearts.length;

            myHearts.forEach((heart, index) => {
                const h = heart as any;
                const thresholdHigh = (index + 1) * hpPerHeart;
                const thresholdLow = index * hpPerHeart;
                
                // RECUPERAMOS LA LÓGICA DE COLOR ORIGINAL:
                if (hp >= thresholdHigh) { 
                    h.animationFrame = 0; 
                    h.blendMode = "normal"; // Se ve normal
                }      
                else if (hp <= thresholdLow) { 
                    h.animationFrame = 2; 
                    h.blendMode = "multiply"; // SE OSCURECE (Efecto visual)
                } 
                else { 
                    h.animationFrame = 1; 
                    h.blendMode = "normal"; 
                }                         
            });
        }
        
        pIndex++;
    }
}

export function updatePlayerStats(Player: any, maskId: string) {
    Player.instVars.ActiveMask = maskId;
    const runtime = Player.runtime;
    switch (maskId) {
        case "Fuego": Player.instVars.AttackSpeed = 0.2; Player.instVars.Damage = 15; break;
        case "Hielo": Player.instVars.AttackSpeed = 0.5; Player.instVars.Damage = 30; break;
        case "Nube": Player.instVars.AttackSpeed = 0.05; Player.instVars.Damage = 5; break;
        case "Rayo": Player.instVars.AttackSpeed = 0.4; Player.instVars.Damage = 20; break;
        case "Peste": Player.instVars.AttackSpeed = 0.6; Player.instVars.Damage = 10; break;
        case "Luz": Player.instVars.AttackSpeed = 0.8; Player.instVars.Damage = 10; break;
        default: Player.instVars.AttackSpeed = 0.8; Player.instVars.Damage = 10; Player.instVars.ActiveMask = "Normal";
    }
}

function getValidSpawnPoint(runtime: IRuntime) {
    const tilemap = runtime.objects.MapaDeTeselas.getFirstInstance() as any;
    // Usamos el primer jugador vivo como referencia para spawnear lejos
    const player = runtime.objects.Player.getFirstInstance();
    if (!tilemap || !player) return null;

    const MIN_DIST_SPAWN = 500;

    for (let i = 0; i < 30; i++) {
        const gridX = Math.floor(Math.random() * MAP_SIZE);
        const gridY = Math.floor(Math.random() * MAP_SIZE);
        const tileID = tilemap.getTileAt(gridX, gridY);

        if (tileID === 2) {
            const realX = gridX * 32 + 16;
            const realY = gridY * 32 + 16;
            const dist = Math.hypot(realX - player.x, realY - player.y);
            if (dist > MIN_DIST_SPAWN) return { x: realX, y: realY };
        }
    }
    return null;
}

function spawnMaskReward(runtime: IRuntime) {
    const point = getValidSpawnPoint(runtime);
    if (!point) return;

    const lootTable: any = { "Fuego": 30, "Hielo": 10, "Peste": 25, "Rayo": 15, "Luz": 10, "Nube": 5 };
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
    mask.width = 32;
    mask.height = 32;
    mask.zElevation = 0.5;
    mask.animationFrame = MASK_FRAMES[selectedMask] || 0;
}

function createFloatingText(runtime: IRuntime, x: number, y: number, text: string) {
    // Función opcional si tienes un objeto de texto para feedback
    // console.log(text);
}