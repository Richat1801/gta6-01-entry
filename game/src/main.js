// Solmar Bay — Heat of the Coast. Main loop and wiring.
// One job: own the game state, the player, the camera and the update loop,
// and wire city, vehicles, pedestrians, police, combat, missions, HUD,
// audio and saves together.

import * as THREE from 'three';
import { WORLD, PLAYER, CAR, START_CASH, clamp, angleLerp, formatClock, mulberry32 } from './config.js';
import { buildCity, resolveCollisions, insideCity } from './city.js';
import { ParkedCars, TrafficSystem, makeCar, driveCar, updateCarVisual } from './vehicles.js';
import { PedestrianSystem } from './pedestrians.js';
import { PoliceSystem } from './police.js';
import { CombatSystem } from './combat.js';
import { MissionSystem } from './missions.js';
import { Hud } from './hud.js';
import { AudioEngine } from './audio.js';
import { hasSave, saveGame, loadGame, clearSave } from './save.js';

const hud = new Hud();
const audio = new AudioEngine();

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
document.getElementById('game').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87b5d6);
scene.fog = new THREE.Fog(0x9ab8cc, 180, 520);

const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 900);
camera.position.set(-120, 40, 220);

const sun = new THREE.DirectionalLight(0xffe0b0, 2.6);
sun.position.set(120, 160, 60);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -240; sun.shadow.camera.right = 240;
sun.shadow.camera.top = 240; sun.shadow.camera.bottom = -240;
sun.shadow.camera.far = 600;
scene.add(sun);
scene.add(new THREE.HemisphereLight(0xbcd8ff, 0x5a6a4a, 1.15));

// --- World ---
const city = buildCity(scene);
const parked = new ParkedCars(scene, city.parkedSpots);
const traffic = new TrafficSystem(scene, city.roadLoops);
const peds = new PedestrianSystem(scene);
const police = new PoliceSystem(scene, audio);
const combat = new CombatSystem(scene, audio);

// The gold Sirocco downtown is Rico's target car for mission 4.
let targetCar = null;
for (const c of parked.all()) {
  if (Math.abs(c.pos.x - city.targetCarSpot.x) < 2 && Math.abs(c.pos.z - city.targetCarSpot.z) < 2) {
    c.target = true;
    c.name = 'Sirocco';
    targetCar = c;
  }
}

// --- Player ---
function makePlayerMesh() {
  const g = new THREE.Group();
  const jacket = new THREE.MeshStandardMaterial({ color: 0xe86a1e, roughness: 0.85 });
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.32, 0.55, 4, 8), jacket);
  torso.position.y = 1.05; torso.castShadow = true;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.24, 10, 8),
    new THREE.MeshStandardMaterial({ color: 0xe8b98a, roughness: 0.8 }));
  head.position.y = 1.78; head.castShadow = true;
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.27, 0.12, 10),
    new THREE.MeshStandardMaterial({ color: 0x14202a }));
  cap.position.y = 1.98;
  const legMat = new THREE.MeshStandardMaterial({ color: 0x2e3138, roughness: 0.9 });
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.7, 0.2), legMat);
  legL.position.set(-0.14, 0.35, 0);
  const legR = legL.clone(); legR.position.x = 0.14;
  g.add(torso); g.add(head); g.add(cap); g.add(legL); g.add(legR);
  g.userData.legL = legL; g.userData.legR = legR;
  return g;
}

const playerMesh = makePlayerMesh();
scene.add(playerMesh);

const state = {
  mode: 'title', // title | playing | paused | busted | win
  cash: START_CASH,
  health: PLAYER.maxHealth,
  wanted: 0,
  missionIndex: 0,
  missionStep: 0,
  completedMissions: [],
  clockSeconds: 9 * 3600 + 24 * 60,
  playerYaw: 0,
  camYaw: Math.PI * 0.75,
  camPitch: 0.34,
  camDist: 8,
  walkPhase: 0,
  autosaveTimer: 0,
  time: 0,
};
const player = {
  mesh: playerMesh,
  position: playerMesh.position,
};
player.position.set(city.spawn.x, 0, city.spawn.z);
state.player = player;

// Where the player actor is in the world: the car while driving, the feet
// while on foot. Missions, police and combat must all use this, never the
// stale on-foot position while the player drives.
function actorPos() {
  return currentCar ? currentCar.pos : player.position;
}

// --- Mission marker beacon (pillar + floating diamond) ---
const beacon = new THREE.Group();
const pillar = new THREE.Mesh(
  new THREE.CylinderGeometry(1.6, 1.6, 60, 12, 1, true),
  new THREE.MeshBasicMaterial({ color: 0xffd75e, transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false }),
);
pillar.position.y = 30;
const diamond = new THREE.Mesh(
  new THREE.OctahedronGeometry(1.1),
  new THREE.MeshStandardMaterial({ color: 0xffd75e, emissive: 0xa67c00, emissiveIntensity: 0.9, roughness: 0.3 }),
);
diamond.position.y = 7;
beacon.add(pillar); beacon.add(diamond);
beacon.visible = false;
scene.add(beacon);

// Gold diamond over the mission-4 target car.
const targetDiamond = new THREE.Mesh(
  new THREE.OctahedronGeometry(0.9),
  new THREE.MeshStandardMaterial({ color: 0xffd75e, emissive: 0xa67c00, emissiveIntensity: 1.0 }),
);
targetDiamond.visible = false;
scene.add(targetDiamond);

// --- Missions ---
const missions = new MissionSystem(city, {
  toast: (m) => hud.toast(m),
  objective: (t) => hud.setObjective(t),
  reward: () => audio.missionDone(),
  missionComplete: (idx, reward) => {
    state.cash += reward;
    state.completedMissions.push(idx);
    // afterComplete increments the mission index and resets the step first;
    // only then do we save, so the save always holds the NEW index and a
    // valid step — a completed mission can never pay twice or strand a save
    // on a past-the-end step.
    missions.afterComplete(idx + 1);
    state.missionIndex = missions.missionIndex;
    state.missionStep = missions.stepIndex;
    saveGame(state);
    hud.setCash(state.cash);
  },
  allDone: () => {
    state.mode = 'win';
    hud.showScreen('win');
  },
  spawnRivals: (n, x, z, boss) => combat.spawnRivals(n, x, z, boss),
  setWanted: (n) => { police.setWanted(n); state.wanted = police.wanted; hud.setWanted(state.wanted); },
  markTargetCar: () => { targetDiamond.visible = true; },
});
combat.onRivalDown = () => missions.registerKill();
police.playerPosRef = () => { const p = actorPos(); return { x: p.x, z: p.z }; };

// --- Driving state ---
let currentCar = null;
let carSpeed = 0;

// --- Input ---
const keys = {};
let dragging = false, dragMoved = 0, dragStartT = 0, lastPX = 0, lastPY = 0, lastDragT = 0;
window.addEventListener('keydown', (e) => {
  keys[e.code] = true;
  if (e.code === 'Space') e.preventDefault();
  if (e.code === 'Escape' || e.code === 'KeyP') togglePause();
  if (e.code === 'KeyE' && state.mode === 'playing') tryInteract();
  if (e.code === 'KeyF' && state.mode === 'playing') punch();
  if (e.code === 'KeyR' && state.mode === 'playing') combat.startReload();
  if (e.code === 'KeyM') { audio.setMuted(!audio.muted); hud.toast(audio.muted ? 'Sound off (M to turn on)' : 'Sound on'); }
});
window.addEventListener('keyup', (e) => { keys[e.code] = false; });
renderer.domElement.addEventListener('pointerdown', (e) => {
  dragging = true; dragMoved = 0; dragStartT = performance.now();
  lastPX = e.clientX; lastPY = e.clientY; lastDragT = performance.now();
  audio.ensure();
});
window.addEventListener('pointermove', (e) => {
  if (!dragging) return;
  const dx = e.clientX - lastPX, dy = e.clientY - lastPY;
  lastPX = e.clientX; lastPY = e.clientY;
  dragMoved += Math.abs(dx) + Math.abs(dy);
  state.camYaw -= dx * 0.005;
  state.camPitch = clamp(state.camPitch + dy * 0.004, 0.06, 1.05);
  lastDragT = performance.now();
});
window.addEventListener('pointerup', (e) => {
  if (dragging && dragMoved < 6 && performance.now() - dragStartT < 350 && state.mode === 'playing') {
    shoot();
  }
  dragging = false;
});
renderer.domElement.addEventListener('wheel', (e) => {
  state.camDist = clamp(state.camDist + Math.sign(e.deltaY) * 1.2, 5, 16);
  e.preventDefault();
}, { passive: false });
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

function togglePause() {
  if (state.mode === 'playing') {
    state.mode = 'paused';
    hud.showScreen('pause');
    saveGame(state);
    audio.setEngineSpeed(0, false);
    audio.setSiren(false);
  } else if (state.mode === 'paused') {
    state.mode = 'playing';
    hud.showScreen('');
  }
}

function damagePlayer(dmg) {
  if (state.mode !== 'playing') return;
  state.health -= dmg;
  hud.flashDamage();
  hud.setHealth(state.health);
  if (state.health <= 0) busted('You were shot down on the streets of Solmar Bay.');
}

function busted(line) {
  if (state.mode !== 'playing') return;
  state.mode = 'busted';
  const lost = Math.floor(state.cash * 0.1);
  state.cash -= lost;
  document.getElementById('busted-line').textContent =
    line + ' You lose ' + '$' + lost + ' to bail. Rico is not impressed.';
  hud.showScreen('busted');
  audio.busted();
  audio.setEngineSpeed(0, false);
  audio.setSiren(false);
  police.clearAll();
  state.wanted = 0;
  hud.setWanted(0);
  saveGame(state);
}

function respawn() {
  exitCar(true);
  player.position.set(city.spawn.x, 0, city.spawn.z);
  state.playerYaw = city.spawn.yaw;
  state.health = PLAYER.maxHealth;
  hud.setHealth(state.health);
  hud.setCash(state.cash);
  state.mode = 'playing';
  hud.showScreen('');
  hud.toast('Back on the street. Stay out of trouble — or don\u2019t get caught.');
}

function tryInteract() {
  if (currentCar) { exitCar(false); return; }
  const near = nearestEnterableCar(3.6);
  if (!near) return;
  enterCar(near);
}

function nearestEnterableCar(range) {
  let best = null, bestD = range;
  for (const c of parked.all()) {
    const d = Math.hypot(c.pos.x - player.position.x, c.pos.z - player.position.z);
    if (d < bestD) { bestD = d; best = c; }
  }
  return best;
}

function enterCar(car) {
  currentCar = car;
  carSpeed = 0;
  if (car.police) {
    const i = police.cruisers.indexOf(car);
    if (i >= 0) police.cruisers.splice(i, 1);
  }
  const wasParked = car.parked;
  car.parked = false;
  playerMesh.visible = false;
  audio.carDoor();
  audio.startEngine();
  hud.setCrosshair(false);
  if (wasParked && !car.stolen) {
    car.stolen = true;
    const step = missions.currentStep();
    if (step && step.kind === 'steal') {
      missions.notifyCarStolen(car);
    } else {
      police.addWanted(1);
      state.wanted = police.wanted;
      hud.setWanted(state.wanted);
      hud.toast('You stole the ' + car.name + '! The cops noticed.');
    }
  } else {
    hud.toast('Driving the ' + car.name + '.');
  }
}

function exitCar(force) {
  if (!currentCar) return;
  const car = currentCar;
  currentCar = null;
  carSpeed = 0;
  const side = { x: Math.cos(car.yaw), z: -Math.sin(car.yaw) };
  player.position.set(car.pos.x + side.x * 2.2, 0, car.pos.z + side.z * 2.2);
  playerMesh.visible = true;
  audio.carDoor();
  audio.setEngineSpeed(0, false);
  hud.setCrosshair(true);
}

function shoot() {
  if (currentCar || state.mode !== 'playing') return;
  const origin = player.position.clone(); origin.y = 1.45;
  const dir = new THREE.Vector3();
  camera.getWorldDirection(dir);
  combat.shoot(origin, dir, damagePlayer);
  const gp = { x: actorPos().x, z: actorPos().z };
  peds.update(0, actorPos(), gp);
}

function punch() {
  if (currentCar || state.mode !== 'playing') return;
  const hit = combat.punch(player.position);
  if (!hit) {
    // Punching a nearby pedestrian scares the street — and the law.
    const ped = peds.nearest(player.position.x, player.position.z, 2.6);
    if (ped) {
      ped.scared = 3;
      police.addWanted(1);
      state.wanted = police.wanted;
      hud.setWanted(state.wanted);
    }
  }
}

// --- Game start / continue ---
function startFresh() {
  clearSave();
  resetRun();
  state.cash = START_CASH;
  state.missionIndex = 0;
  state.missionStep = 0;
  state.completedMissions = [];
  missions.missionIndex = 0;
  missions.finishedAll = false;
  missions.start();
  beginPlay();
  hud.toast('Rico Vane is waiting. Follow the gold marker.');
}

function resetRun() {
  combat.clearRivals();
  police.clearAll();
  state.health = PLAYER.maxHealth;
  state.wanted = 0;
  state.clockSeconds = 9 * 3600 + 24 * 60;
  player.position.set(city.spawn.x, 0, city.spawn.z);
  state.playerYaw = city.spawn.yaw;
  state.camYaw = Math.PI * 0.75;
  exitCar(true);
  playerMesh.visible = true;
  targetDiamond.visible = false;
  combat.ammo = combat.ammoMax;
  hud.setHealth(state.health);
  hud.setWanted(0);
  hud.setCash(state.cash);
}

function beginPlay() {
  state.mode = 'playing';
  hud.showScreen('');
  hud.setCrosshair(!currentCar);
  audio.ensure();
  audio.startEngine();
}

function continueGame() {
  const d = loadGame();
  if (!d) { startFresh(); return; }
  resetRun();
  state.cash = d.cash;
  state.health = d.health;
  state.wanted = d.wanted;
  state.clockSeconds = d.clock || state.clockSeconds;
  state.completedMissions = d.completed || [];
  player.position.set(d.px, 0, d.pz);
  state.playerYaw = d.pyaw || 0;
  police.setWanted(d.wanted);
  hud.setWanted(d.wanted);
  hud.setCash(state.cash);
  hud.setHealth(state.health);
  if (d.missionIndex >= missions.list.length) {
    missions.missionIndex = d.missionIndex;
    missions.finishedAll = true;
    missions.active = false;
    hud.setObjective('Solmar Bay is yours. Thanks for playing!');
  } else {
    missions.restore(d.missionIndex, d.missionStep || 0);
    state.missionIndex = d.missionIndex;
  }
  beginPlay();
  hud.toast('Welcome back to Solmar Bay.');
}

document.getElementById('btn-new').addEventListener('click', () => { audio.ensure(); audio.click(); startFresh(); });
document.getElementById('btn-continue').addEventListener('click', () => { audio.ensure(); audio.click(); continueGame(); });
document.getElementById('btn-resume').addEventListener('click', () => { audio.click(); togglePause(); });
document.getElementById('btn-quit-title').addEventListener('click', () => {
  audio.click();
  saveGame(state);
  state.mode = 'title';
  hud.showScreen('title');
  refreshContinueButton();
});
document.getElementById('btn-respawn').addEventListener('click', () => { audio.click(); respawn(); });
document.getElementById('btn-keep-playing').addEventListener('click', () => {
  audio.click();
  state.mode = 'playing';
  hud.showScreen('');
});

function refreshContinueButton() {
  document.getElementById('btn-continue').style.display = hasSave() ? '' : 'none';
}
refreshContinueButton();

// --- Per-frame update ---
const clock = new THREE.Clock();
let firstFrame = true;

function updatePlayerOnFoot(dt) {
  const run = keys['ShiftLeft'] || keys['ShiftRight'];
  const speed = run ? PLAYER.runSpeed : PLAYER.walkSpeed;
  let mx = 0, mz = 0;
  const fwd = { x: Math.sin(state.camYaw), z: Math.cos(state.camYaw) };
  const right = { x: Math.cos(state.camYaw), z: -Math.sin(state.camYaw) };
  if (keys['KeyW'] || keys['ArrowUp']) { mx += fwd.x; mz += fwd.z; }
  if (keys['KeyS'] || keys['ArrowDown']) { mx -= fwd.x; mz -= fwd.z; }
  if (keys['KeyA'] || keys['ArrowLeft']) { mx -= right.x; mz -= right.z; }
  if (keys['KeyD'] || keys['ArrowRight']) { mx += right.x; mz += right.z; }
  const len = Math.hypot(mx, mz);
  if (len > 0) {
    mx /= len; mz /= len;
    player.position.x += mx * speed * dt;
    player.position.z += mz * speed * dt;
    state.playerYaw = angleLerp(state.playerYaw, Math.atan2(mx, mz), Math.min(1, dt * 10));
    state.walkPhase += dt * (run ? 13 : 9);
    const s = Math.sin(state.walkPhase) * 0.5;
    playerMesh.userData.legL.rotation.x = s;
    playerMesh.userData.legR.rotation.x = -s;
  } else {
    playerMesh.userData.legL.rotation.x *= 0.8;
    playerMesh.userData.legR.rotation.x *= 0.8;
  }
  playerMesh.rotation.y = state.playerYaw;
  playerMesh.position.y = len > 0 ? Math.abs(Math.sin(state.walkPhase)) * 0.06 : 0;
  resolveCollisions(player.position, PLAYER.radius, city.colliders);
  if (!insideCity(player.position.x, player.position.z)) {
    player.position.x = clamp(player.position.x, -WORLD.half - 28, WORLD.half + 28);
    player.position.z = clamp(player.position.z, -WORLD.half - 28, WORLD.waterStart + 110);
  }
}

function updateDriving(dt) {
  const car = currentCar;
  const input = {
    forward: !!(keys['KeyW'] || keys['ArrowUp']),
    back: !!(keys['KeyS'] || keys['ArrowDown']),
    left: !!(keys['KeyA'] || keys['ArrowLeft']),
    right: !!(keys['KeyD'] || keys['ArrowRight']),
    handbrake: !!keys['Space'],
  };
  carSpeed = driveCar(car, input, dt, city.colliders, resolveCollisions);
  // Screenshot staging hook: hold a fixed cruise speed when set.
  if (typeof window.__solmarCruise === 'number') { car.speed = window.__solmarCruise; carSpeed = car.speed; }
  // Running over a pedestrian is a crime.
  for (const p of peds.all()) {
    if (!p.alive) continue;
    const d = Math.hypot(p.pos.x - car.pos.x, p.pos.z - car.pos.z);
    if (d < 1.9 && Math.abs(carSpeed) > 3) {
      p.alive = false;
      p.mesh.rotation.z = Math.PI / 2;
      p.mesh.position.y = 0.3;
      police.addWanted(1);
      state.wanted = police.wanted;
      hud.setWanted(state.wanted);
      hud.toast('You hit a pedestrian! The cops are coming.');
    }
  }
  // Camera follows the car's heading unless the player just dragged it.
  if (performance.now() - lastDragT > 1400) {
    state.camYaw = angleLerp(state.camYaw, car.yaw, Math.min(1, dt * 1.6));
  }
  audio.setEngineSpeed(Math.abs(carSpeed) / CAR.topSpeed, true);
}

function updateCamera(dt) {
  const target = currentCar
    ? new THREE.Vector3(currentCar.pos.x, 2.0, currentCar.pos.z)
    : new THREE.Vector3(player.position.x, 1.9, player.position.z);
  const dist = currentCar ? state.camDist + 3.5 : state.camDist;
  const cx = target.x - Math.sin(state.camYaw) * Math.cos(state.camPitch) * dist;
  const cz = target.z - Math.cos(state.camYaw) * Math.cos(state.camPitch) * dist;
  const cy = target.y + Math.sin(state.camPitch) * dist + 1.2;
  camera.position.lerp(new THREE.Vector3(cx, Math.max(cy, 1.2), cz), Math.min(1, dt * 10));
  camera.lookAt(target);
}

function updateTitleCamera(dt) {
  // Slow orbit over the city behind the title screen.
  const t = state.time * 0.03;
  camera.position.set(Math.sin(t) * 190, 55 + Math.sin(t * 0.7) * 12, Math.cos(t) * 190 + 20);
  camera.lookAt(-20, 8, 0);
}

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);
  state.time += dt;

  if (state.mode === 'title') {
    updateTitleCamera(dt);
    traffic.update(dt);
    peds.update(dt, player.position, null);
  } else if (state.mode === 'playing') {
    state.clockSeconds += dt * 30;
    if (currentCar) updateDriving(dt);
    else updatePlayerOnFoot(dt);
    traffic.update(dt);
    peds.update(dt, actorPos(), null);
    combat.update(dt, actorPos(), true, damagePlayer);
    police.update(dt, actorPos(), !!currentCar, () => busted('The Solmar Bay PD caught you.'));
    state.wanted = police.wanted;
    missions.update(dt, actorPos(), police.wanted);
    state.missionIndex = missions.missionIndex;
    state.missionStep = missions.stepIndex;

    // Mission beacon + target-car diamond.
    const marker = missions.marker();
    if (marker) {
      beacon.visible = true;
      beacon.position.set(marker.x, 0, marker.z);
      diamond.rotation.y += dt * 1.5;
      diamond.position.y = 7 + Math.sin(state.time * 2) * 0.8;
    } else {
      beacon.visible = false;
    }
    if (targetCar && targetDiamond.visible) {
      targetDiamond.position.set(targetCar.pos.x, 4.5 + Math.sin(state.time * 2.5) * 0.5, targetCar.pos.z);
      targetDiamond.rotation.y += dt * 2;
    }

    // HUD.
    hud.setClock(formatClock(state.clockSeconds));
    hud.setHealth(state.health);
    hud.setCash(state.cash);
    hud.setWanted(state.wanted);
    hud.setAmmo(combat.ammo, combat.reloadTimer > 0);
    hud.setSpeed(Math.abs(carSpeed) * 3.6, !!currentCar);
    hud.setCrosshair(!currentCar);
    const nearCar = !currentCar ? nearestEnterableCar(3.6) : null;
    const interactEl = document.getElementById('interact');
    if (nearCar) {
      interactEl.style.display = 'block';
      interactEl.textContent = nearCar.stolen ? 'Press E — drive the ' + nearCar.name : 'Press E — steal the ' + nearCar.name;
    } else if (currentCar) {
      interactEl.style.display = 'block';
      interactEl.textContent = 'Press E — get out';
    } else {
      interactEl.style.display = 'none';
    }
    hud.drawMinimap({
      player: { x: actorPos().x, z: actorPos().z, yaw: currentCar ? currentCar.yaw : state.playerYaw },
      cars: parked.all().filter((c) => c.parked).map((c) => ({ x: c.pos.x, z: c.pos.z, police: false }))
        .concat(traffic.all().map((c) => ({ x: c.pos.x, z: c.pos.z, police: false })))
        .concat(police.allCruisers().map((c) => ({ x: c.pos.x, z: c.pos.z, police: true }))),
      peds: peds.all().filter((p) => p.alive).map((p) => ({ x: p.pos.x, z: p.pos.z })),
      rivals: combat.livingRivals().map((r) => ({ x: r.pos.x, z: r.pos.z })),
      marker,
      time: state.time,
    });

    // Autosave every 30 seconds of play.
    state.autosaveTimer += dt;
    if (state.autosaveTimer > 30) { state.autosaveTimer = 0; saveGame(state); }

    updateCamera(dt);
  } else {
    // paused / busted / win: freeze the world, keep rendering.
    updateCamera(dt);
  }

  renderer.render(scene, camera);
  if (firstFrame) {
    firstFrame = false;
    window.__solmarReady = true;
  }
}
animate();

// --- Debug hooks + screenshot staging (used by the maker's own playtest) ---
function ensurePlaying() {
  if (state.mode !== 'playing') {
    resetRun();
    state.cash = 500;
    missions.missionIndex = 0;
    missions.finishedAll = false;
    missions.start();
    beginPlay();
  }
}

function putPlayerInCarAt(car, x, z, yaw, speedMs) {
  exitCar(true);
  car.pos.x = x; car.pos.z = z; car.yaw = yaw;
  car.parked = false; car.stolen = true;
  car.group.rotation.y = yaw;
  currentCar = car;
  carSpeed = speedMs;
  playerMesh.visible = false;
  audio.startEngine();
  state.camYaw = yaw;
}

window.__solmar = {
  version: '2.0.0',
  state,
  missions,
  police,
  combat,
  startGame: () => startFresh(),
  setWanted: (n) => { police.setWanted(n); state.wanted = police.wanted; hud.setWanted(state.wanted); },
  teleport: (x, z) => {
    if (currentCar) { currentCar.pos.x = x; currentCar.pos.z = z; }
    else { player.position.set(x, 0, z); }
  },
  setMission: (i, step) => { missions.missionIndex = i; missions.stepIndex = step || 0; missions.active = true; missions.killsDone = 0; missions.enterStep(); },
  stageChase: () => {
    ensurePlaying();
    missions.missionIndex = 1; missions.stepIndex = 0; missions.active = true; missions.killsDone = 0;
    missions.enterStep();
    const car = parked.all()[4];
    putPlayerInCarAt(car, 0, 150, Math.PI, 32.7);
    window.__solmarCruise = 32.7; // hold ~118 km/h for the chase shot
    police.setWanted(3); state.wanted = 3; hud.setWanted(3);
    for (let i = 0; i < 2; i++) {
      const c = makeCar(scene, -4 + i * 8, 168 + i * 14, Math.PI, 0xf2f2f2, 'Police Cruiser', { police: true });
      c.speed = 26;
      police.cruisers.push(c);
    }
    // Pacer cruiser ahead of the player, holding its lane: the chase reads
    // in frame instead of only behind the camera.
    const pacer = makeCar(scene, 7, 130, Math.PI, 0xf2f2f2, 'Police Cruiser', { police: true });
    pacer.speed = 30;
    pacer.pacer = true;
    police.cruisers.push(pacer);
    state.camYaw = Math.PI;
    state.camPitch = 0.26;
    state.camDist = 7;
  },
  stageMission: () => {
    ensurePlaying();
    missions.missionIndex = 2; missions.stepIndex = 0; missions.active = true; missions.killsDone = 0;
    missions.enterStep();
    // Line the rivals up in an arc ahead of the player so the shootout
    // reads in frame: the marina, the gold beacon and the Dagger crew.
    combat.livingRivals().forEach((r, i) => {
      r.pos.set(-168 + (i - 1.5) * 7, 0, 214 + (i % 2) * 5);
      r.yaw = Math.atan2(-158 - r.pos.x, 200 - r.pos.z);
      r.mesh.rotation.y = r.yaw;
    });
    exitCar(true);
    player.position.set(-158, 0, 200);
    state.playerYaw = 0;
    state.camYaw = 0;
    state.camPitch = 0.2;
    state.camDist = 8;
    combat.ammo = combat.ammoMax;
    police.setWanted(1); state.wanted = 1; hud.setWanted(1);
  },
  stageCity: () => {
    ensurePlaying();
    missions.missionIndex = 0; missions.stepIndex = 0; missions.active = true;
    missions.enterStep();
    const car = parked.all()[2];
    putPlayerInCarAt(car, 0, 60, Math.PI, 11);
    window.__solmarCruise = 11; // steady cruise through downtown
    // Stage traffic on the player's road: two cars ahead in the same lane,
    // one oncoming, and pedestrians on the sidewalks beside it.
    const loop44 = city.roadLoops[4 * 8 + 4];
    const loop34 = city.roadLoops[3 * 8 + 4];
    const t = traffic.all();
    if (t[0]) { t[0].loop = loop44; t[0].seg = 3; t[0].segT = 0.25; }
    if (t[1]) { t[1].loop = loop44; t[1].seg = 3; t[1].segT = 0.55; }
    if (t[2]) { t[2].loop = loop34; t[2].seg = 1; t[2].segT = 0.5; }
    const ps = peds.all();
    if (ps[0]) { ps[0].pos.set(10, 0, 28); ps[0].idle = 4; ps[0].target = null; }
    if (ps[1]) { ps[1].pos.set(-10, 0, 14); ps[1].idle = 4; ps[1].target = null; }
    police.setWanted(0); state.wanted = 0; hud.setWanted(0);
    state.camYaw = Math.PI;
    state.camPitch = 0.22;
    state.camDist = 7;
  },
};

const shot = new URLSearchParams(window.location.search).get('shot');
if (shot === 'chase') window.__solmar.stageChase();
else if (shot === 'mission') window.__solmar.stageMission();
else if (shot === 'city') window.__solmar.stageCity();
