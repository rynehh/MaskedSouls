
// Import any other script files here, e.g.:
// import * as myModule from "./mymodule.js";

runOnStartup(async runtime => {
	// Code to run on the loading screen.
	// Note layouts, objects etc. are not yet available.

	runtime.addEventListener("beforeprojectstart", () => OnBeforeProjectStart(runtime));
});

async function OnBeforeProjectStart(runtime: IRuntime) {
	// Code to run just before 'On start of layout' on
	// the first layout. Loading has finished and initial
	// instances are created and available to use here.

	runtime.addEventListener("tick", () => Tick(runtime));
}

let spawnTimer = 0;

function Tick(runtime: IRuntime) {
    const players = runtime.objects.Player.getAllInstances();
    const mouse = runtime.mouse;
    const keyboard = runtime.keyboard;

    // --- 1. LÓGICA DE DISPARO DE LOS JUGADORES ---
    for (const p of players) {
        const player = p as any;
        const timer = player.behaviors.Timer;
        
        // Validación básica
        if (!player || !timer) continue;

        // Función auxiliar para disparar (evita repetir código)
        const fireBullet = (angle: number) => {
            if (!timer.isTimerRunning("fire")) {
                const bullet = runtime.objects.Bullet_Type.createInstance("Layer 0", player.x, player.y) as any;
                
                bullet.angle = angle;
                if (bullet.behaviors.Bullet) {
                    bullet.behaviors.Bullet.angle = angle;
                }
                
                // Heredar stats del jugador
                bullet.instVars.Damage = player.instVars.Damage;
                bullet.instVars.IgnoreUID = player.uid; // Importante para que no se disparen a sí mismos
                
				// NUEVO: Guardamos qué máscara traía y quién disparó
                bullet.instVars.ActiveMask = player.instVars.ActiveMask || "Normal"; // Fallback a "Normal" por si es null
                bullet.instVars.OwnerUID = player.uid;

                // Iniciar cooldown
                timer.startTimer(player.instVars.AttackSpeed, "fire");
            }
        };

        // CONTROLES JUGADOR 1 (Mouse)
        // Asumimos que PlayerID 1 es el del Mouse/WASD
        if (player.instVars.PlayerID === 1 && mouse && mouse.isMouseButtonDown(0)) {
            const mousePos = mouse.getMousePosition();
            const angleToMouse = Math.atan2(mousePos[1] - player.y, mousePos[0] - player.x);
            fireBullet(angleToMouse);
        }

        // CONTROLES JUGADOR 2 (Teclado)
        // Asumimos que PlayerID 2 usa IJKL y dispara con 'O' o 'Espacio'
        // Dispara hacia donde esté mirando el personaje (player.angle)
        if (player.instVars.PlayerID === 2 && keyboard && keyboard.isKeyDown("KeyO")) { // Puedes cambiar "KeyO" por "Space"
            fireBullet(player.angle);
        }
    }

    // --- 2. SPAWN DE ENEMIGOS ---
    spawnTimer += runtime.dt;
    // He aumentado el límite de enemigos a 10 para probar, ajusta según necesites
    if (spawnTimer >= 1 && runtime.objects.Enemy.getAllInstances().length < 10) {
        const x = Math.random() * runtime.layout.width;
        const y = Math.random() * runtime.layout.height;
        // Evitar spawnear muy cerca de los jugadores (opcional, pero recomendado)
        const enemy = runtime.objects.Enemy.createInstance("Layer 0", x, y) as any;
        spawnTimer = 0;
    }

    // --- 3. IA DE ENEMIGOS (BUSCAR AL JUGADOR MÁS CERCANO) ---
    const DISTANCIA_IDEAL = 400;
    const RANGO_DISPARO = 600;

    for (const enemy of runtime.objects.Enemy.instances()) {
        const e = enemy as any;
        
        if (!e || e.instVars.IsFrozen) continue;

        // Encontrar al jugador más cercano
        let targetPlayer: any = null;
        let minDistance = Infinity;

        for (const p of players) {
            const pInst = p as any;
            // Solo considerar jugadores vivos (HP > 0 si tienes esa lógica, o simplemente que existan)
            const d = Math.hypot(pInst.x - e.x, pInst.y - e.y);
            if (d < minDistance) {
                minDistance = d;
                targetPlayer = pInst;
            }
        }

        // Si encontramos un objetivo válido
        if (targetPlayer) {
            const angleToTarget = Math.atan2(targetPlayer.y - e.y, targetPlayer.x - e.x);

            // Movimiento
            if (minDistance > DISTANCIA_IDEAL) {
                e.angle = angleToTarget;
            } else {
                // Orbitar / Moverse lateralmente si está muy cerca
                e.angle = angleToTarget + 1.57;
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

            if (minDistance < RANGO_DISPARO) {
                const timer = e.behaviors.Timer;
                if (timer && !timer.isTimerRunning("enemy_fire")) {
                    const eb = runtime.objects.Enemy_Bullet.createInstance("Layer 0", e.x, e.y) as any;
                    eb.angle = angleToTarget; 
                    if (eb.behaviors && eb.behaviors.Bullet) {
                         eb.behaviors.Bullet.angle = angleToTarget;
                    }

                    timer.startTimer(1.5, "enemy_fire");
                }
            }
        }
    }
}

export function updatePlayerStats(Player: any, maskId: string) {
	Player.instVars.ActiveMask = maskId;

	switch (maskId) {
		case "Fuego":
			Player.instVars.AttackSpeed = 0.2;
			Player.instVars.Damage = 15;
			break;
		case "Hielo":
			Player.instVars.AttackSpeed = 0.5;
			Player.instVars.Damage = 30;
			break;
		case "Nube":
			Player.instVars.AttackSpeed = 0.05;
			Player.instVars.Damage = 5;
			break;
		case "Rayo":
			Player.instVars.AttackSpeed = 0.4;
			Player.instVars.Damage = 20;
			break;
		case "Peste":
			Player.instVars.AttackSpeed = 0.6;
			Player.instVars.Damage = 10;
			break;
		case "Luz":
			Player.instVars.AttackSpeed = 0.8;
			Player.instVars.Damage = 10;
			break;
		default:
			Player.instVars.AttackSpeed = 0.8;
			Player.instVars.Damage = 10;
			Player.instVars.ActiveMask = "Normal";
	}
}