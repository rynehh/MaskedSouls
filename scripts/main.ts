// Import any other script files here, e.g.:
// import * as myModule from "./mymodule.js";

runOnStartup(async runtime => {
    runtime.addEventListener("beforeprojectstart", () => OnBeforeProjectStart(runtime));
});

async function OnBeforeProjectStart(runtime: IRuntime) {
    runtime.addEventListener("tick", () => Tick(runtime));
}

// ================================
// VARIABLES GLOBALES DE JUEGO
// ================================
let gameTime = 0;
let gameHour = 0;
const HOUR_DURATION = 90; 

// VARIABLES DE OLEADA (WAVE SYSTEM)
let waveState = "ESPERANDO"; 
let enemiesToSpawn = 0;      
let enemiesAlive = 0;     
let timeBetweenWaves = 3;    
let waveTimer = 0;          
let spawnRateTimer = 0;      

const MAP_SIZE = 70;        

function Tick(runtime: IRuntime) {
    const player = runtime.objects.Player.getFirstInstance() as any;
    const mouse = runtime.mouse;

    if (player && mouse) {
        if (mouse.isMouseButtonDown(0)) {
            const timer = player.behaviors.Timer;
            if (timer && !timer.isTimerRunning("fire")) {
                const mousePos = mouse.getMousePosition();
                const mx = mousePos[0];
                const my = mousePos[1];
                const bullet = runtime.objects.Bullet_Type.createInstance("Layer 0", player.x, player.y) as any;
                const angleToMouse = Math.atan2(my - player.y, mx - player.x);
                
                bullet.angle = angleToMouse;
                if (bullet.behaviors.Bullet) bullet.behaviors.Bullet.angle = angleToMouse;
                
                bullet.instVars.Damage = player.instVars.Damage;
                timer.startTimer(player.instVars.AttackSpeed, "fire");
            }
        }
    }

    gameTime += runtime.dt;
    const currentHour = Math.floor(gameTime / HOUR_DURATION);

    if (currentHour > gameHour) {
        gameHour = currentHour;
        console.log("¡HA COMENZADO LA HORA " + gameHour + "!");
        
        spawnMaskReward(runtime); 
        if (player) player.instVars.HP += 20;
    }
    const currentEnemies = runtime.objects.Enemy.getAllInstances();
    enemiesAlive = currentEnemies.length;

    switch (waveState) {
        case "ESPERANDO":
            waveTimer += runtime.dt;
            if (waveTimer >= timeBetweenWaves) {
                console.log("¡Iniciando Oleada!");
                
                enemiesToSpawn = 3 + (gameHour * 2); 
                
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

            if (enemiesToSpawn <= 0) {
                waveState = "PELEANDO";
            }
            break;

        case "PELEANDO":
            if (enemiesAlive === 0) {
                console.log("¡Oleada despejada!");
                waveState = "ESPERANDO";
                waveTimer = 0;
            }
            break;
    }

    // -----------------------------------
    // 4. IA ENEMIGOS (Tu código)
    // -----------------------------------
    const DISTANCIA_IDEAL = 400;
    const RANGO_DISPARO = 600;

    for (const enemy of runtime.objects.Enemy.instances()) {
        const e = enemy as any;
        if (e && player && !e.instVars.IsFrozen) {
            const dist = Math.hypot(player.x - e.x, player.y - e.y);
            const angleToPlayer = Math.atan2(player.y - e.y, player.x - e.x);

            if (dist > DISTANCIA_IDEAL) {
                e.angle = angleToPlayer;
            } else {
                e.angle = angleToPlayer + 1.57;
            }

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
}

export function updatePlayerStats(Player: any, maskId: string) {
    Player.instVars.ActiveMask = maskId;
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
    const player = runtime.objects.Player.getFirstInstance();
    
    if (!tilemap || !player) return null;
    const MIN_DIST_SPAWN = 600; 

    for (let i = 0; i < 15; i++) { 
        const gridX = Math.floor(Math.random() * MAP_SIZE); 
        const gridY = Math.floor(Math.random() * MAP_SIZE); 

        const tileID = tilemap.getTileAt(gridX, gridY);

        if (tileID === 2) { 
            const realX = gridX * 32 + 16;
            const realY = gridY * 32 + 16;

            const dist = Math.hypot(realX - player.x, realY - player.y);

            if (dist > MIN_DIST_SPAWN) {
                return { x: realX, y: realY };
            }
        }
    }
    return null; 
}

function spawnMaskReward(runtime: IRuntime) {
    const point = getValidSpawnPoint(runtime);
    if (!point) return;
    
    const maskTypes = ["Fuego", "Hielo", "Rayo", "Peste", "Luz"];
    const randomType = maskTypes[Math.floor(Math.random() * maskTypes.length)];

    const mask = runtime.objects.Mask.createInstance("Layer 0", point.x, point.y) as any;
    mask.instVars.MaskID = randomType;
}