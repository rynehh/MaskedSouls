
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

				if (bullet.behaviors.Bullet) {
					bullet.behaviors.Bullet.angle = angleToMouse;
				}

				bullet.instVars.Damage = player.instVars.Damage;
				timer.startTimer(player.instVars.AttackSpeed, "fire");
			}
		}
	}

	spawnTimer += runtime.dt;

	if (spawnTimer >= 1 && runtime.objects.Enemy.getAllInstances().length < 2) {
		const x = Math.random() * runtime.layout.width;
		const y = Math.random() * runtime.layout.height;

		const enemy = runtime.objects.Enemy.createInstance("Layer 0", x, y) as any;
		spawnTimer = 0;
	}

	const players = runtime.objects.Player.getFirstInstance();
	const DISTANCIA_IDEAL = 400;
	const RANGO_DISPARO = 600;

	for (const enemy of runtime.objects.Enemy.instances()) {
		const e = enemy as any;
		if (e && players && !e.instVars.IsFrozen) {
			const dist = Math.hypot(players.x - e.x, players.y - e.y);
			const angleToPlayer = Math.atan2(players.y - e.y, players.x - e.x);

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