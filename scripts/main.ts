// ==========================================
// MAIN.TS FINAL - CORREGIDO
// ==========================================

runOnStartup(async runtime => {
    runtime.addEventListener("beforeprojectstart", () => OnBeforeProjectStart(runtime));
});

async function OnBeforeProjectStart(runtime: IRuntime) {
    runtime.addEventListener("tick", () => Tick(runtime));
}

// Variables Globales del Juego
let gameTime = 0;
let gameHour = 0;
const HOUR_DURATION = 60;
let score = 0;

// Configuración Oleadas
let waveState = "ESPERANDO";
let enemiesToSpawn = 0;
let enemiesAlive = 0;
let timeBetweenWaves = 7;
let waveTimer = 0;
let spawnRateTimer = 0;
let waveCount = 1;

const MAP_SIZE = 60;

// Variable para detectar cambio de escena manualmente
let lastLayoutName = "";

const MASK_FRAMES: any = {
    "Normal": 0, "Fuego": 1, "Hielo": 2, "Rayo": 3, "Peste": 4, "Luz": 5, "Nube": 6
};

// Función para reiniciar variables (Se llama automáticamente al detectar Escena 1)
function InitGameVariables(runtime: IRuntime) {
    console.log("¡Entrando a Escena 1! Reiniciando juego...");
    gameTime = 0;
    gameHour = 0;
    score = 0;
    waveState = "ESPERANDO";
    enemiesToSpawn = 0;
    enemiesAlive = 0;
    waveTimer = 0;
    spawnRateTimer = 0;
    waveCount = 1;

    const players = runtime.objects.Player.getAllInstances();
    for (const p of players) {
        const player = p as any;
        // Forzamos los valores iniciales para que dispare lento al inicio
        player.instVars.ActiveMask = "Default";
        player.instVars.AttackSpeed = 0.8; // Cadencia inicial (casi 1 segundo)
        player.instVars.Damage = 10;

        // Reiniciar vida si hace falta
        player.instVars.HP = 200;
        player.instVars.Score = 0;
    }
}

function Tick(runtime: IRuntime) {
    // 1. DETECCIÓN DE CAMBIO DE LAYOUT (FIX DEL ERROR DE TYPESCRIPT)
    if (runtime.layout.name !== lastLayoutName) {
        lastLayoutName = runtime.layout.name;
        // Si acabamos de entrar a Escena 1, reiniciamos todo
        if (runtime.layout.name === "Escena 1") {
            InitGameVariables(runtime);
        }
    }

    // 2. SI NO ESTAMOS EN EL JUEGO, CORTAMOS AQUÍ
    if (runtime.layout.name !== "Escena 1") return;

    // ==========================================
    // 0. RECOLECTOR DE CADÁVERES (MEJORADO)
    // ==========================================

    // A. ENEMIGOS
    for (const e of runtime.objects.Enemy.instances()) {
        const enemy = e as any;
        if (enemy.instVars.IsDead) {
            if (enemy.animationName !== "Death") enemy.setAnimation("Death");

            // CONDICIÓN 1: Terminó la animación
            const animFinished = enemy.animationFrame >= enemy.animationFrameCount - 1;

            // CONDICIÓN 2 (RESPALDO): Si lleva mucho tiempo muerto (ej. animación trabada)
            // Nota: Esto asume que tienes un Timer 'death_timer' que iniciaremos abajo
            const timer = enemy.behaviors.Timer;
            const timeOut = timer && timer.hasFinished("death_cleanup");

            if (animFinished || timeOut) {
                enemy.destroy();
            }
        }
    }

    if (runtime.objects.Enemy2) {
        for (const e of runtime.objects.Enemy2.instances()) {
            const enemy = e as any;
            if (enemy.instVars.IsDead) {
                if (enemy.animationName !== "Death") enemy.setAnimation("Death");

                const animFinished = enemy.animationFrame >= enemy.animationFrameCount - 1;
                const timer = enemy.behaviors.Timer;
                const timeOut = timer && timer.hasFinished("death_cleanup");

                if (animFinished || timeOut) enemy.destroy();
            }
        }
    }


    // B. JUGADORES (Lo mismo)
    for (const p of runtime.objects.Player.instances()) {
        const player = p as any;
        if (player.instVars.IsDead) {
            if (player.animationName !== "Death") player.setAnimation("Death");

            const animFinished = player.animationFrame >= player.animationFrameCount - 1;
            const timer = player.behaviors.Timer;
            const timeOut = timer && timer.hasFinished("death_cleanup");

            if (animFinished || timeOut) {
                player.destroy();
            }
        }
    }

    // --- DE AQUÍ PARA ABAJO ES LA LÓGICA DEL JUEGO ---

    const players = runtime.objects.Player.getAllInstances();
    const mouse = runtime.mouse;
    const keyboard = runtime.keyboard;
    const tilemap = runtime.objects.MapaDeTeselas.getFirstInstance();

    // Fix spawn infinito de máscaras
    const currentMasks = runtime.objects.Mask.getAllInstances().length;
    if (currentMasks < 6 && Math.random() < 0.01) {
        spawnMaskReward(runtime);
    }

    let playerIndex = 0;
    for (const p of players) {
        const player = p as any;

        if (!player.instVars.IsDead) {

            if (playerIndex === 0) {
                let angleToAim = 0;
                if (mouse) {
                    const mousePos = mouse.getMousePosition();
                    angleToAim = Math.atan2(mousePos[1] - player.y, mousePos[0] - player.x);

                    if (mousePos[0] < player.x) {
                        player.width = -Math.abs(player.width);
                    } else {
                        player.width = Math.abs(player.width);
                    }
                    player.angle = 0;
                }

                if (mouse && mouse.isMouseButtonDown(0)) {
                    tryShoot(runtime, player, angleToAim);
                }
            }

            else if (playerIndex === 1) {
                const closestEnemy = getClosestEnemy(player, runtime);
                let angleToAim = 0;

                if (closestEnemy) {
                    angleToAim = Math.atan2(closestEnemy.y - player.y, closestEnemy.x - player.x);

                    if (closestEnemy.x < player.x) {
                        player.width = -Math.abs(player.width);
                    } else {
                        player.width = Math.abs(player.width);
                    }
                } else {
                    player.width = Math.abs(player.width);
                }
                player.angle = 0;

                if (keyboard && keyboard.isKeyDown("Space")) {
                    tryShoot(runtime, player, angleToAim);
                }
            }

            // ==================================================
            // --- MÁSCARA VISUAL (Mask_Player) ---
            // ==================================================
            const currentMaskID = player.instVars.ActiveMask || "Default";

            // 1. Recuperamos el sombrero guardado en el jugador
            let visual = player.myVisualHat;

            // 2. Si no existe o se destruyó, creamos uno nuevo usando Mask_Player
            // Verificamos "runtime.objects.Mask_Player" para que no de error si olvidaste crearlo en el editor
            if ((!visual || visual.isDestroyed) && runtime.objects.Mask_Player) {
                visual = runtime.objects.Mask_Player.createInstance("Layer 0", player.x, player.y);
                visual.collisionsEnabled = false; // IMPORTANTE: Apagar colisiones para que no estorbe
                player.myVisualHat = visual;      // Guardamos la referencia en el jugador
            }

            // 3. Actualizamos posición y animación
            if (visual) {
                visual.x = player.x;
                visual.y = player.y - 4; // <--- AJUSTA ESTE NÚMERO (-25, -30) PARA LA ALTURA
                visual.zElevation = (player.zElevation || 0) + 0.5; // Z-Order: Siempre encima del jugador

                // Sincronizar animación
                if (visual.animationName !== currentMaskID) {
                    // Si es "Normal", lo hacemos invisible (opacity 0) o ponemos una anim vacía
                    if (currentMaskID === "Default") {
                        visual.opacity = 0;
                    } else {
                        visual.opacity = 1;
                        visual.setAnimation(currentMaskID);
                    }
                }
            }
            // ==================================================
            const mask = runtime.objects.Mask.getAllInstances().find(m => player.testOverlap(m));
            if (mask) {
                updatePlayerStats(player, (mask as any).instVars.MaskID);
                mask.destroy();
                player.instVars.Score = (player.instVars.Score || 0) + 500;
            }
        }

        playerIndex++;
    }

    for (const b of runtime.objects.Bullet_Type.instances()) {
        if (tilemap && b.testOverlap(tilemap)) { b.destroy(); }
    }

    // Balas vs Jugador

    for (const b of runtime.objects.Enemy_Bullet.instances()) {
        const bullet = b as any;

        if (tilemap && bullet.testOverlap(tilemap)) { bullet.destroy(); continue; }

        for (const p of players) {
            const player = p as any;
            if (bullet.testOverlap(player)) {

                // Si ya está herido, ignoramos (para que no le peguen 2 veces en un frame)
                if (!player.instVars.IsHurt) {
                    player.instVars.HP -= 10;
                    bullet.destroy();

                    // --- ANIMACIÓN DE DAÑO ---
                    player.setAnimation("Hurt");
                    player.instVars.IsHurt = true; // Bloqueamos lógica para que se vea la anim

                    // Timer para quitar el estado de herido (0.5 segundos)
                    setTimeout(() => {
                        if (player && !player.isDestroyed) {
                            player.instVars.IsHurt = false;
                            // Opcional: regresar color a normal si usabas tintes
                            // player.colorRgb = [1, 1, 1]; 
                        }
                    }, 500);
                }

                if (player.instVars.HP <= 0) {
                    if (!player.instVars.IsDead) {
                        player.instVars.IsDead = true; // <--- ¡MARCAR COMO MUERTO!
                        player.setAnimation("Death");
                        player.myVisualHat.destroy();

                        // Importante: Desactivar comportamiento para que no se mueva
                        if (player.behaviors["8Direction"]) player.behaviors["8Direction"].enabled = false;
                        player.collisionsEnabled = false;

                        if (player.behaviors.Timer) player.behaviors.Timer.startTimer(1.0, "death_cleanup");
                    }
                }
                break;
            }
        }
    }

    // ==========================================
    // CONTROL DE ANIMACIÓN DE BALAS (LOOP CUSTOM)
    // ==========================================
    for (const b of runtime.objects.Bullet_Type.instances()) {
        const bullet = b as any;

        // Lógica para la bala "Default" (y las demás si siguen el mismo patrón)
        // Si la animación actual es "Default" (o la que estés usando)
        if (bullet.animationName === "Default") {
            // Si llegamos al último frame (6), forzamos el regreso al 4
            // Nota: Asegúrate que en el editor la velocidad de animación NO sea 0.
            if (bullet.animationFrame >= 6) {
                bullet.animationFrame = 4;
            }
        }

        if (bullet.animationName === "Rayo") {
            if (bullet.animationFrame >= 8) {
                bullet.animationFrame = 0;
            }
        }

        if (bullet.animationName === "Peste") {
            if (bullet.animationFrame >= 7) {
                bullet.animationFrame = 5;
            }
        }

        if (bullet.animationName === "Nube") {
            if (bullet.animationFrame >= 8) {
                bullet.animationFrame = 5;
            }
        }

        if (bullet.animationName === "Hielo") {
            if (bullet.instVars.IsExploding) {
                if (bullet.animationFrame >= 8) {
                    bullet.destroy();
                }
            } else {
                if (bullet.animationFrame >= 3) {
                    bullet.animationFrame = 0;
                }
            }
        }

    }

    for (const b of runtime.objects.Enemy_Bullet.instances()) {
        const bullet = b as any;

        // Lógica para la bala "Default" (y las demás si siguen el mismo patrón)
        // Si la animación actual es "Default" (o la que estés usando)
        if (bullet.animationName === "Default") {
            // Si llegamos al último frame (6), forzamos el regreso al 4
            // Nota: Asegúrate que en el editor la velocidad de animación NO sea 0.
            if (bullet.animationFrame >= 6) {
                bullet.animationFrame = 3;
            }
        }


    }

    // ==========================================
    // COLISIONES BALAS vs ENEMIGOS (EFECTOS + DAÑO)
    // ==========================================
    for (const b of runtime.objects.Bullet_Type.instances()) {
        const bullet = b as any;

        if (bullet.instVars.IsExploding) continue;

        const enemy = runtime.objects.Enemy.getAllInstances().find(e => bullet.testOverlap(e));

        if (enemy && bullet.instVars.IgnoreUID !== enemy.uid) {
            const e = enemy as any;
            const maskType = bullet.animationName;

            // 1. APLICAR DAÑO BASE
            e.instVars.HP -= bullet.instVars.Damage;

            // --- CAMBIO AQUÍ: DAÑO CON TIMER ---
            if (!e.instVars.IsFrozen) {
                e.setAnimation("Hurt");
                // Forzamos que se quede "atontado" 0.3 segundos (ajusta este tiempo si quieres)
                if (e.behaviors.Timer) e.behaviors.Timer.startTimer(0.3, "stun");
            }
            // ------------------------------------

            // --- NUEVO: ACTIVAR ANIMACIÓN DE DAÑO ---
            // Solo si no está congelado (para no romper el efecto de hielo)
            if (!e.instVars.IsFrozen) {
                e.setAnimation("Hurt");
            }
            // ----------------------------------------

            // 2. APLICAR EFECTOS ESPECIALES
            if (maskType === "Fuego") {
                if (e.behaviors.Timer) e.behaviors.Timer.startTimer(3, "burn", "regular");
                e.instVars.BurnTicks = 6;
            }
            else if (maskType === "Hielo") {
                e.instVars.IsFrozen = true;
                e.colorRgb = [0.4, 0.4, 1];
                if (e.behaviors.Timer) e.behaviors.Timer.startTimer(3, "Thaw");
            }
            else if (maskType === "Rayo" && (bullet.instVars.Bounces || 0) > 0) {
                const allEnemies = runtime.objects.Enemy.getAllInstances();
                const target = allEnemies
                    .filter(en => en !== e)
                    .sort((a, bDist) => Math.hypot(a.x - e.x, a.y - e.y) - Math.hypot(bDist.x - e.x, bDist.y - e.y))[0];

                if (target && Math.hypot(target.x - e.x, target.y - e.y) < 600) {
                    const angleToTarget = Math.atan2(target.y - e.y, target.x - e.x);
                    const chain = runtime.objects.Bullet_Type.createInstance("Layer 0", e.x, e.y) as any;

                    chain.angle = angleToTarget;
                    if (chain.behaviors.Bullet) chain.behaviors.Bullet.angle = angleToTarget;

                    chain.instVars.IgnoreUID = e.uid;
                    chain.instVars.Bounces = (bullet.instVars.Bounces || 0) - 1;
                    chain.instVars.Damage = bullet.instVars.Damage;
                    chain.setAnimation("Rayo");
                    chain.instVars.OwnerUID = bullet.instVars.OwnerUID;
                }
            }
            else if (maskType === "Peste") {
                if (runtime.objects.VenomPool) {
                    const pool = runtime.objects.VenomPool.createInstance("Layer 0", e.x, e.y);
                    pool.moveToBottom();
                }
            }
            else if (maskType === "Luz") {
                const owner = players.find(p => p.uid === bullet.instVars.OwnerUID);
                if (owner) {
                    const pOwner = owner as any;
                    pOwner.instVars.HP = Math.min(100, (pOwner.instVars.HP || 0) + 5);
                }
            }

            // 3. DECIDIR DESTINO BALA
            if (maskType === "Hielo") {
                bullet.instVars.IsExploding = true;
                if (bullet.behaviors.Bullet) bullet.behaviors.Bullet.enabled = false;
                bullet.animationFrame = 3;
            } else {
                bullet.destroy();
            }

            // 4. CHECK DE MUERTE DEL ENEMIGO
            if (e.instVars.HP <= 0) {
                if (!e.instVars.IsDead) { // Si aún no estaba muerto
                    e.instVars.IsDead = true; // <--- ¡MARCAR COMO MUERTO!
                    e.setAnimation("Death");
                    e.collisionsEnabled = false;

                    if (e.behaviors["8Direction"]) e.behaviors["8Direction"].enabled = false;
                    if (e.behaviors.Timer) e.behaviors.Timer.stopAllTimers();

                    if (e.behaviors.Timer) e.behaviors.Timer.startTimer(1.0, "death_cleanup");

                    score += 50 * (gameHour + 1) + 10;
                }
            }
        }
    }

    const VELOCIDAD_NORMAL = 200;
    const VELOCIDAD_LENTA = 150;

    for (const p of players) {
        const player = p as any;
        const movement = player.behaviors["8Direction"];

        if (movement) {
            movement.maxSpeed = VELOCIDAD_NORMAL;
        }

        // Trampas
        if (runtime.objects.Sprite3) {
            for (const trap of runtime.objects.Sprite3.instances()) {
                const t = trap as any;
                if (t.animationFrame >= 2 && t.animationFrame <= 6) {
                    if (t.testOverlap(player)) {
                        if (movement) movement.maxSpeed = VELOCIDAD_LENTA;

                        // Si NO está herido, aplicamos daño
                        if (!player.instVars.IsHurt) {
                            player.instVars.HP -= 5;

                            // --- ANIMACIÓN DE DAÑO ---
                            player.setAnimation("Hurt");
                            player.instVars.IsHurt = true;

                            if (player.instVars.HP <= 0) {
                                if (!player.instVars.IsDead) {
                                    player.instVars.IsDead = true; // <--- ¡MARCAR COMO MUERTO!
                                    player.setAnimation("Death");
                                    player.myVisualHat.destroy();

                                    // Importante: Desactivar comportamiento para que no se mueva
                                    if (player.behaviors["8Direction"]) player.behaviors["8Direction"].enabled = false;
                                    player.collisionsEnabled = false;

                                    if (player.behaviors.Timer) player.behaviors.Timer.startTimer(1.0, "death_cleanup");
                                }
                            }

                            // Tiempo de invulnerabilidad / Animación (1 segundo en trampas)
                            setTimeout(() => {
                                if (player && !player.isDestroyed) {
                                    player.instVars.IsHurt = false;
                                }
                            }, 1000);
                        }
                    }
                }
            }
        }
    }

    // Filtramos solo los jugadores que NO están muertos
    const livingPlayers = players.filter((p: any) => !p.instVars.IsDead);

    if (livingPlayers.length === 0 && waveState !== "GAMEOVER") {
        console.log("GAME OVER");
        waveState = "GAMEOVER";
        const txtAnuncio = runtime.objects.TxtAnuncio ? runtime.objects.TxtAnuncio.getFirstInstance() : null;
        if (txtAnuncio) {
            txtAnuncio.text = "Game Over";
            txtAnuncio.opacity = 1;
            txtAnuncio.fontColor = [1, 0, 0];
        }
    }

    if (players.length > 0) {
        gameTime += runtime.dt;
        const currentHour = Math.floor(gameTime / HOUR_DURATION);

        if (currentHour > gameHour) {
            gameHour = currentHour;
            for (const p of players) {
                const pl = p as any;
                pl.instVars.HP = Math.min(200, (pl.instVars.HP || 0) + 20);
            }
        }
    }

    const currentEnemies = runtime.objects.Enemy.getAllInstances();

    const count1 = currentEnemies.filter((e: any) => !e.instVars.IsDead).length;

    // Contamos Enemy2 también
    let count2 = 0;
    if (runtime.objects.Enemy2) {
        const currentEnemies2 = runtime.objects.Enemy2.getAllInstances();
        count2 = currentEnemies2.filter((e: any) => !e.instVars.IsDead).length;
    }

    enemiesAlive = count1 + count2;
    const txtAnuncio = runtime.objects.TxtAnuncio ? runtime.objects.TxtAnuncio.getFirstInstance() : null;

    if (waveState !== "GAMEOVER") {
        switch (waveState) {
            case "ESPERANDO":
                waveTimer += runtime.dt;
                if (txtAnuncio && players.length > 0) {
                    const timeLeft = Math.ceil(timeBetweenWaves - waveTimer);
                    txtAnuncio.text = "Wave " + waveCount + "\nCOMIENZA EN " + timeLeft;

                    if (waveTimer > timeBetweenWaves - 1) {
                        txtAnuncio.opacity = timeBetweenWaves - waveTimer;
                    } else {
                        txtAnuncio.opacity = 1;
                    }
                }

                if (waveTimer >= timeBetweenWaves) {
                    const playerCountMult = players.length > 1 ? 1.5 : 1;
                    enemiesToSpawn = Math.floor((3 + (gameHour * 2) + Math.floor(waveCount / 2)) * playerCountMult);
                    waveState = "SPAWNEANDO";
                    waveTimer = 0;
                    if (txtAnuncio) txtAnuncio.opacity = 0;
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
    // 3. IA ENEMIGOS (CON PRIORIDAD: HURT > ATTACK > WALK)
    // =================================================
    const DISTANCIA_IDEAL = 250;
    const RANGO_DISPARO = 600;

    for (const enemy of runtime.objects.Enemy.instances()) {
        const e = enemy as any;

        if (!e.instVars.IsFrozen && !e.instVars.IsDead) {

            if (!e.instVars.IsFrozen) {
                let targetPlayer = null;
                let minDistance = 999999;

                // Buscar jugador más cercano (QUE ESTÉ VIVO)
                for (const p of players) {
                    const pl = p as any;
                    // Agregamos: && pl.animationName !== "Death"
                    if (pl.animationName !== "Death") {
                        const dist = Math.hypot(pl.x - e.x, pl.y - e.y);
                        if (dist < minDistance) {
                            minDistance = dist;
                            targetPlayer = pl;
                        }
                    }
                }

                if (targetPlayer) {
                    const angleToPlayer = Math.atan2(targetPlayer.y - e.y, targetPlayer.x - e.x);
                    let moveAngle = angleToPlayer;

                    if (minDistance <= DISTANCIA_IDEAL) moveAngle = angleToPlayer + 1.57;

                    // --- SISTEMA DE ESTADOS (CORREGIDO) ---

                    // Ahora "isHurt" depende del tiempo, no de la animación. ¡Mucho más estable!
                    const timer = e.behaviors.Timer;
                    const isHurt = timer && timer.isTimerRunning("stun");

                    // isAttacking se queda igual, ese funcionaba bien
                    const isAttacking = (e.animationName === "Attack" && e.animationFrame < e.animationFrameCount - 1);

                    // PRIORIDAD 1: ¿Está herido/aturdido?
                    if (isHurt) {
                        // Nos aseguramos que la animación visual sea Hurt
                        if (e.animationName !== "Hurt") e.setAnimation("Hurt");

                        // SE QUEDA QUIETO (No llamamos a simulateControl)
                    }

                    // PRIORIDAD 2: ¿Está atacando?
                    else if (isAttacking) {
                        // Se queda quieto para disparar (Mejora la visibilidad de la animación)
                        // Si quieres que gire mientras ataca, descomenta la siguiente línea:
                        // e.angle = 0; if (targetPlayer.x < e.x) e.width = -Math.abs(e.width); else e.width = Math.abs(e.width);
                    }

                    // PRIORIDAD 3: Movimiento normal (Walk/Idle)
                    else {
                        // MOVIMIENTO FÍSICO
                        const behavior8Dir = e.behaviors["8Direction"];
                        if (behavior8Dir) {
                            const vx = Math.cos(moveAngle);
                            const vy = Math.sin(moveAngle);

                            if (vx > 0.1) behavior8Dir.simulateControl("right");
                            if (vx < -0.1) behavior8Dir.simulateControl("left");
                            if (vy > 0.1) behavior8Dir.simulateControl("down");
                            if (vy < -0.1) behavior8Dir.simulateControl("up");

                            // ANIMACIÓN Y ROTACIÓN
                            e.angle = 0;
                            if (targetPlayer.x < e.x) e.width = -Math.abs(e.width);
                            else e.width = Math.abs(e.width);

                            if (behavior8Dir.speed > 10) {
                                if (e.animationName !== "Walk") e.setAnimation("Walk");
                            } else {
                                if (e.animationName !== "Idle") e.setAnimation("Idle");
                            }
                        }
                    }

                    // --- DISPARO ---
                    // Solo dispara si no está herido y si está en rango
                    if (!isHurt && minDistance < RANGO_DISPARO) {
                        const timer = e.behaviors.Timer;
                        if (timer && !timer.isTimerRunning("enemy_fire")) {
                            const eb = runtime.objects.Enemy_Bullet.createInstance("Layer 0", e.x, e.y) as any;
                            eb.angle = angleToPlayer;

                            // INICIAR ATAQUE
                            e.setAnimation("Attack");

                            timer.startTimer(1.5, "enemy_fire");
                        }
                    }
                }
            }
        }
    }
    updateUI(runtime, gameTime, players);
}

function tryShoot(runtime: IRuntime, player: any, angle: number) {
    const timer = player.behaviors.Timer;
    if (timer && !timer.isTimerRunning("fire")) {
        const bullet = runtime.objects.Bullet_Type.createInstance("Layer 0", player.x, player.y) as any;
        bullet.angle = angle;

        if (bullet.behaviors.Bullet) bullet.behaviors.Bullet.angle = angle;

        // --- TRANSFERENCIA DE DATOS (Stats) ---
        bullet.instVars.Damage = player.instVars.Damage || 10;
        bullet.instVars.OwnerUID = player.uid; // IMPORTANTE PARA LUZ (Saber a quién curar)
        bullet.instVars.Bounces = 3;           // IMPORTANTE PARA RAYO (Cantidad de rebotes)

        const currentMask = player.instVars.ActiveMask || "Normal";
        bullet.instVars.ActiveMask = currentMask; // Guardamos qué tipo es
        bullet.setAnimation(currentMask);

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
    // 1. UI de Tiempo
    const txtTime = runtime.objects.TxtTime ? runtime.objects.TxtTime.getFirstInstance() : null;
    if (txtTime) {
        const minutes = Math.floor(gameTime / 60);
        const seconds = Math.floor(gameTime % 60);
        txtTime.text = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    }

    // 2. UI por Jugador
    for (const p of players) {
        const player = p as any;
        const currentID = (player.instVars && player.instVars.PlayerID !== undefined) ? player.instVars.PlayerID : 0;

        // --- A. PUNTAJE ---
        const scoreTexts = runtime.objects.TxtPuntaje ? runtime.objects.TxtPuntaje.getAllInstances() : [];
        const myScoreTxt = scoreTexts.find((t: any) => t.instVars && t.instVars.PlayerID === currentID);
        if (myScoreTxt) myScoreTxt.text = "Pts: " + (player.instVars.Score || 0);

        // --- B. NOMBRE MÁSCARA ---
        const maskTexts = runtime.objects.TxtNombreMascara ? runtime.objects.TxtNombreMascara.getAllInstances() : [];
        const myMaskTxt = maskTexts.find((t: any) => t.instVars && t.instVars.PlayerID === currentID);
        if (myMaskTxt) {
            const currentMask = String(player.instVars.ActiveMask || "Normal");
            myMaskTxt.text = currentMask;
            if (currentMask === "Fuego") myMaskTxt.fontColor = [1, 0.2, 0.2];
            else if (currentMask === "Hielo") myMaskTxt.fontColor = [0.2, 0.8, 1];
            else myMaskTxt.fontColor = [1, 1, 1];
        }

        // --- C. ICONO (ACTUALIZADO) ---
        const iconMasks = runtime.objects.UI_Icono ? runtime.objects.UI_Icono.getAllInstances() : [];
        const myIconMask = iconMasks.find((i: any) => i.instVars && i.instVars.PlayerID === currentID);

        if (myIconMask) {
            const currentMask = String(player.instVars.ActiveMask || "Normal");
            // Usamos setAnimation para que coincida con los sprites del juego
            // ¡Asegúrate de que UI_Icono tenga animaciones llamadas "Fuego", "Hielo", etc.!
            if (myIconMask.animationName !== currentMask) {
                myIconMask.setAnimation(currentMask);
            }
        }

        // ===============================================
        // D. CORAZONES (DEBUG Y FIX)
        // ===============================================
        const allHearts = runtime.objects.CorazonUI ? runtime.objects.CorazonUI.getAllInstances() : [];
        const myHearts = allHearts.filter((h: any) => h.instVars && h.instVars.PlayerID === currentID);

        if (myHearts.length > 0) {
            // Ordenar de izquierda a derecha
            myHearts.sort((a, b) => a.x - b.x);

            const hp = player.instVars.HP || 0;

            myHearts.forEach((heart, index) => {
                const h = heart as any;

                // 1. Aseguramos que se vea normal
                h.blendMode = "normal";
                h.isVisible = true;
                h.opacity = 1;

                // 2. DETENEMOS cualquier reproducción automática
                // Si la animación se llama "Default", usa "Default". Si no, el nombre que tenga.
                h.setAnimation("Default");
                h.stopAnimation();

                // 3. Lógica del Umbral
                const threshold = index * 40;

                if (hp > threshold) {
                    // Vida suficiente: Corazón Lleno
                    if (h.animationFrame !== 0) h.animationFrame = 0;
                } else {
                    // Poca vida: Corazón Vacío
                    if (h.animationFrame !== 1) {
                        h.animationFrame = 1;
                        // Si no tienes frame 2, usa opacidad como plan B:
                        // h.opacity = 0.3; 
                    }
                }
            });
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
    mask.setAnimation(selectedMask);
}