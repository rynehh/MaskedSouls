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
    const player = runtime.objects.Player.getFirstInstance() as any;
    const mouse = runtime.mouse;
    const tilemap = runtime.objects.MapaDeTeselas.getFirstInstance(); 

    // =================================================
    // 0. CONTROL DE MÁSCARAS (SIEMPRE MINIMO 6)
    // =================================================
    const currentMasks = runtime.objects.Mask.getAllInstances().length;
    // Si hay menos de 6, intenta crear una nueva en este frame
    if (currentMasks < 6) {
        spawnMaskReward(runtime);
    }

    // =================================================
    // 1. GAMEPLAY
    // =================================================
    if (player) {
        // A. DISPARO
        if (mouse && mouse.isMouseButtonDown(0)) {
            const timer = player.behaviors.Timer;
            if (timer && !timer.isTimerRunning("fire")) {
                const mousePos = mouse.getMousePosition();
                const angle = Math.atan2(mousePos[1] - player.y, mousePos[0] - player.x);
                
                const bullet = runtime.objects.Bullet_Type.createInstance("Layer 0", player.x, player.y) as any;
                bullet.angle = angle;
                if (bullet.behaviors.Bullet) bullet.behaviors.Bullet.angle = angle;
                
                bullet.instVars.Damage = player.instVars.Damage || 10;
                const speed = player.instVars.AttackSpeed || 0.5;
                timer.startTimer(speed, "fire");
            }
        }

        // B. BALAS JUGADOR (PAREDES)
        for (const b of runtime.objects.Bullet_Type.instances()) {
            if (tilemap && b.testOverlap(tilemap)) { b.destroy(); }
        }

        // C. BALAS ENEMIGAS
        for (const b of runtime.objects.Enemy_Bullet.instances()) {
            const bullet = b as any;
            if (tilemap && bullet.testOverlap(tilemap)) { bullet.destroy(); continue; }

            if (bullet.testOverlap(player)) {
                player.instVars.HP -= 10; 
                bullet.destroy();
                player.colorRgb = [10, 0, 0]; 
                setTimeout(() => { if(player) player.colorRgb = [1, 1, 1]; }, 100);

                if (player.instVars.HP <= 0) {
                    console.log("GAME OVER");
                    player.destroy(); 
                    const txtAnuncio = runtime.objects.TxtAnuncio.getFirstInstance();
                    if (txtAnuncio) {
                        txtAnuncio.text = "¡FIN DEL JUEGO!";
                        txtAnuncio.opacity = 1;
                        txtAnuncio.fontColor = [1, 0, 0];
                    }
                }
            }
        }
        
        // D. RECOGER MÁSCARAS
        const mask = runtime.objects.Mask.getAllInstances().find(m => player.testOverlap(m));
        if (mask) {
            updatePlayerStats(player, (mask as any).instVars.MaskID);
            mask.destroy();
            score += 500;
        }
    }

    // =================================================
    // 2. SISTEMA DE TIEMPO Y OLEADAS
    // =================================================
    if (player) {
        gameTime += runtime.dt;
        const currentHour = Math.floor(gameTime / HOUR_DURATION);
    
        if (currentHour > gameHour) {
            gameHour = currentHour;
            // Opcional: Spawnear una extra especial o curar
            if (player) player.instVars.HP = Math.min(100, (player.instVars.HP || 0) + 20);
        }
    }

    const currentEnemies = runtime.objects.Enemy.getAllInstances();
    enemiesAlive = currentEnemies.length;
    const txtAnuncio = runtime.objects.TxtAnuncio ? runtime.objects.TxtAnuncio.getFirstInstance() : null;

    switch (waveState) {
        case "ESPERANDO":
            waveTimer += runtime.dt;
            if (txtAnuncio && player) { 
                const timeLeft = Math.ceil(timeBetweenWaves - waveTimer);
                txtAnuncio.text = "OLEADA " + waveCount + "\nCOMIENZA EN " + timeLeft;
                if (waveTimer < 1) txtAnuncio.opacity = waveTimer; 
                else if (waveTimer > timeBetweenWaves - 1) txtAnuncio.opacity = timeBetweenWaves - waveTimer; 
                else txtAnuncio.opacity = 1; 
            }
            if (waveTimer >= timeBetweenWaves) {
                enemiesToSpawn = 3 + (gameHour * 2) + Math.floor(waveCount / 2); 
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

    // =================================================
    // 3. IA ENEMIGOS
    // =================================================
    const DISTANCIA_IDEAL = 400;
    const RANGO_DISPARO = 600;

    for (const enemy of runtime.objects.Enemy.instances()) {
        const e = enemy as any;
        if (e && player && !e.instVars.IsFrozen) {
            const dist = Math.hypot(player.x - e.x, player.y - e.y);
            const angleToPlayer = Math.atan2(player.y - e.y, player.x - e.x);

            if (dist > DISTANCIA_IDEAL) e.angle = angleToPlayer;
            else e.angle = angleToPlayer + 1.57;

            const behavior8Dir = e.behaviors["8Direction"];
            if (behavior8Dir) {
                const vx = Math.cos(e.angle);
                const vy = Math.sin(e.angle);
                if (vx > 0.1) behavior8Dir.simulateControl("right");
                if (vx < -0.1) behavior8Dir.simulateControl("left");
                if (vy > 0.1) behavior8Dir.simulateControl("down");
                if (vy < -0.1) behavior8Dir.simulateControl("up");
            }

            if (dist < RANGO_DISPARO) {
                const timer = e.behaviors.Timer;
                if (timer && !timer.isTimerRunning("enemy_fire")) {
                    const eb = runtime.objects.Enemy_Bullet.createInstance("Layer 0", e.x, e.y) as any;
                    eb.angle = angleToPlayer;
                    timer.startTimer(1.5, "enemy_fire");
                }
            }
        }
    }

    // =================================================
    // 4. UI 
    // =================================================
    const txtTime = runtime.objects.TxtTime ? runtime.objects.TxtTime.getFirstInstance() : null;
    const txtPuntaje = runtime.objects.TxtPuntaje ? runtime.objects.TxtPuntaje.getFirstInstance() : null;

    if (txtTime) {
        const minutes = Math.floor(gameTime / 60);
        const seconds = Math.floor(gameTime % 60);
        txtTime.text = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    }
    if (txtPuntaje) {
        txtPuntaje.text = "PTS: " + score;
    }

    const txtMask = runtime.objects.TxtNombreMascara ? runtime.objects.TxtNombreMascara.getFirstInstance() : null;
    const iconMask = runtime.objects.UI_Icono ? runtime.objects.UI_Icono.getFirstInstance() : null;
    
    if (player) {
        const currentMask = String(player.instVars.ActiveMask || "Normal");
        if (txtMask) txtMask.text = currentMask;
        if (iconMask) iconMask.animationFrame = MASK_FRAMES[currentMask] || 0;

        const hearts = runtime.objects.CorazonUI ? runtime.objects.CorazonUI.getAllInstances() : [];
        if (hearts.length > 0) {
            hearts.sort((a, b) => a.x - b.x);
            const hp = Number(player.instVars.HP || 100); 
            const maxHP = 100;
            const hpPerHeart = maxHP / hearts.length;

            hearts.forEach((heart, index) => {
                const h = heart as any;
                const thresholdHigh = (index + 1) * hpPerHeart;
                const thresholdLow = index * hpPerHeart;
                
                if (hp >= thresholdHigh) { h.animationFrame = 0; h.blendMode = "normal"; }
                else if (hp <= thresholdLow) { h.animationFrame = 2; h.blendMode = "multiply"; }
                else { h.animationFrame = 1; h.blendMode = "normal"; }
            });
        }
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
    const uiText = runtime.objects.TxtNombreMascara ? runtime.objects.TxtNombreMascara.getFirstInstance() : null;
    if (uiText) {
        if (maskId === "Fuego") uiText.fontColor = [1, 0.2, 0.2];      
        else if (maskId === "Hielo") uiText.fontColor = [0.2, 0.8, 1]; 
        else if (maskId === "Peste") uiText.fontColor = [0.2, 1, 0.2]; 
        else if (maskId === "Rayo") uiText.fontColor = [1, 1, 0];      
        else uiText.fontColor = [1, 1, 1];                             
    }
}

function getValidSpawnPoint(runtime: IRuntime) {
    const tilemap = runtime.objects.MapaDeTeselas.getFirstInstance() as any;
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