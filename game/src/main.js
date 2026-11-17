// Solmar Bay — Heat of the Coast: bootstrap, game loop, player and camera.
// One job: wire every system together and run the frame.

import * as THREE from 'three';
import { WORLD, PLAYER, MISSIONS, roadCenter, clamp, lerp, angleLerp, distance2D, rand } from './config.js';
import { buildCity, resolveBuildingCollision } from './city.js';
import { spawnParkedCars, spawnTrafficCars, updateTrafficCars, updateDrivenCar } from './vehicles.js';
import { spawnPedestrians, updatePedestrians, scarePedestrians, hitPedestrian } from './pedestrians.js';
import { createPolice, updatePolice, updateWantedDecay, addWanted, debugSpawnCruiser } from './police.js';
import { createMissionManager, startMission, startNextMission, updateMissions, objectiveText } from './missions.js';
import { punchAttack, firePistol, updateRivals, updateCombatEffects } from './combat.js';
import { Hud } from './hud.js';
import { AudioEngine } from './audio.js';
import { saveGame, loadGame, hasSave } from './save.js';
import { Input } from './input.js';
import { buildPedestrianMesh } from './pedestrians.js';

const params = new URLSearchParams(location.search);

function buildPlayerMesh() {
  const mesh = buildPedestrianMesh();
  const jacket = new THREE.MeshLambertMaterial({ color: 0x14b8a6 });
  mesh.children.forEach((child) => {
    if (child.geometry && child.geometry.type === 'BoxGeometry' && child.position.y > 0.9 && child.position.y < 1.2) {
      child.material = jacket;
    }
  });
  return mesh;
}

function createState(scene) {
  const city = buildCity(scene);
  const state = {
    scene,
    time: 0,
    clockMinutes: 9 * 60,
    cash: PLAYER.startCash,
    wanted: 0,
    hiddenTimer: 0,
    lastCrimeAt: -999,
    lastDamageAt: -999,
    damageFlash: 0,
    kills: 0,
    playing: false,
    paused: false,
    screen: 'start',
    driving: false,
    playerCar: null,
    onFootWeapon: 'fists',
    colliders: city.colliders,
    seaMesh: city.seaMesh.mesh,
    effects: [],
    rivals: [],
    player: {
      mesh: null, x: 64, z: 120, y: 0, vy: 0, angle: 0, health: PLAYER.maxHealth,
      onGround: true, walkPhase: 0,
    },
    parkedCars: [],
    traffic: [],
    pedestrians: [],
    police: null,
    missions: null,
    audio: new AudioEngine(),
    hud: null,
    input: null,
    camera: { yaw: 0, pitch: 0.32, dist: 7.5 },
    mouseIdle: 99,
    saveGame: null,
  };
  state.parkedCars = spawnParkedCars(scene);
  state.traffic = spawnTrafficCars(scene);
  state.pedestrians = spawnPedestrians(scene);
  state.police = createPolice(scene);
  state.missions = createMissionManager(scene);
  state.player.mesh = buildPlayerMesh();
  state.player.mesh.position.set(state.player.x, 0, state.player.z);
  scene.add(state.player.mesh);
  state.saveGame = () => saveGame(state);
  return state;
}

function maxPlayerX(state) {
  // The pier strip (z near 400) lets the player walk out over the sea.
  if (Math.abs(state.player.z - 400) < 5) return 548;
  return WORLD.seaStart - 2;
}

function movePlayerOnFoot(state, dt) {
  const p = state.player;
  const input = state.input.walkInput();
  const camYaw = state.camera.yaw;
  const fx = Math.sin(camYaw);
  const fz = Math.cos(camYaw);
  const rx = -Math.cos(camYaw);
  const rz = Math.sin(camYaw);
  let mx = fx * ((input.forward ? 1 : 0) - (input.back ? 1 : 0)) + rx * ((input.right ? 1 : 0) - (input.left ? 1 : 0));
  let mz = fz * ((input.forward ? 1 : 0) - (input.back ? 1 : 0)) + rz * ((input.right ? 1 : 0) - (input.left ? 1 : 0));
  const len = Math.hypot(mx, mz);
  const speed = input.sprint ? PLAYER.sprintSpeed : PLAYER.walkSpeed;
  if (len > 0.01) {
    mx /= len;
    mz /= len;
    p.x += mx * speed * dt;
    p.z += mz * speed * dt;
    p.angle = angleLerp(p.angle, Math.atan2(mx, mz), Math.min(1, dt * 10));
    p.walkPhase += dt * (input.sprint ? 13 : 9);
  }
  // Jump + gravity.
  if (input.jump && p.onGround) {
    p.vy = PLAYER.jumpSpeed;
    p.onGround = false;
  }
  p.vy -= PLAYER.gravity * dt;
  p.y += p.vy * dt;
  if (p.y <= 0) {
    p.y = 0;
    p.vy = 0;
    p.onGround = true;
  }
  // Bounds + buildings.
  p.x = clamp(p.x, WORLD.minX + 2, maxPlayerX(state));
  p.z = clamp(p.z, WORLD.minZ + 2, WORLD.maxZ - 2);
  const pos = { x: p.x, z: p.z };
  resolveBuildingCollision(state.colliders, pos, PLAYER.radius);
  p.x = pos.x;
  p.z = pos.z;
  // Walk-cycle limbs.
  const swing = len > 0.01 ? Math.sin(p.walkPhase) * 0.6 : 0;
  const limbs = p.mesh.userData.limbs;
  limbs.legL.rotation.x = swing;
  limbs.legR.rotation.x = -swing;
  limbs.armL.rotation.x = -swing * 0.8;
  limbs.armR.rotation.x = swing * 0.8;
  p.mesh.position.set(p.x, p.y, p.z);
  p.mesh.rotation.y = p.angle;
}

function nearestParkedCar(state, maxDist) {
  let best = null;
  let bestD = maxDist;
  for (const car of state.parkedCars) {
    if (!car.parked) continue;
    const d = distance2D(state.player.x, state.player.z, car.x, car.z);
    if (d < bestD) {
      best = car;
      bestD = d;
    }
  }
  return best;
}

function enterCar(state, car) {
  state.driving = true;
  state.playerCar = car;
  car.parked = false;
  state.player.mesh.visible = false;
  state.audio.playClick();
  if (!car.stolen) {
    car.stolen = true;
    addWanted(state, 1);
    state.hud.showToast(`Hot-wired the ${car.spec.label}! The law noticed. (+1 ★)`);
    scarePedestrians(state.pedestrians, car.x, car.z, 20);
  } else {
    state.hud.showToast(`Driving the ${car.spec.label} — E to step out.`);
  }
  if (car.markerRing) car.markerRing.visible = false;
}

function exitCar(state) {
  const car = state.playerCar;
  if (!car) return;
  const px = car.x + Math.cos(car.angle) * 3;
  const pz = car.z - Math.sin(car.angle) * 3;
  state.player.x = clamp(px, WORLD.minX + 2, maxPlayerX(state));
  state.player.z = clamp(pz, WORLD.minZ + 2, WORLD.maxZ - 2);
  state.player.y = 0;
  state.player.vy = 0;
  state.player.angle = car.angle;
  state.player.mesh.visible = true;
  state.player.mesh.position.set(state.player.x, 0, state.player.z);
  state.driving = false;
  state.playerCar = null;
  state.audio.playClick();
  state.audio.setEngine(0, false);
}

function playerShoot(state, camera) {
  if (state.onFootWeapon === 'pistol') {
    const ray = new THREE.Raycaster();
    ray.setFromCamera(new THREE.Vector2(0, 0), camera);
    const target = ray.ray.at(45, new THREE.Vector3());
    target.y = 1.2;
    const res = firePistol(state, state.scene, target, state.rivals, camera);
    state.audio.playShot(1);
    addWanted(state, 1);
    scarePedestrians(state.pedestrians, state.player.x, state.player.z, 30);
    if (res.hit) state.hud.showHitmarker();
  } else {
    const res = punchAttack(state, state.rivals, state.pedestrians);
    state.audio.playPunch();
    if (res.hit) state.hud.showHitmarker();
  }
}

function updateCamera(state, camera, dt) {
  const cam = state.camera;
  const target = state.driving && state.playerCar
    ? { x: state.playerCar.x, z: state.playerCar.z, y: 1.2, angle: state.playerCar.angle }
    : { x: state.player.x, z: state.player.z, y: 1.4, angle: state.player.angle };
  const { dx, dy } = state.input.consumeMouse();
  if (dx !== 0 || dy !== 0) {
    cam.yaw -= dx * 0.0032;
    cam.pitch = clamp(cam.pitch + dy * 0.0022, 0.08, 0.9);
    state.mouseIdle = 0;
  } else {
    state.mouseIdle += dt;
    // Ease the camera behind the direction of travel when the mouse rests.
    if (state.mouseIdle > 2.5) cam.yaw = angleLerp(cam.yaw, target.angle, Math.min(1, dt * 1.2));
  }
  const dist = state.driving ? 11 : 7.5;
  cam.dist = lerp(cam.dist, dist, Math.min(1, dt * 3));
  const fx = Math.sin(cam.yaw);
  const fz = Math.cos(cam.yaw);
  const cp = Math.cos(cam.pitch);
  const sp = Math.sin(cam.pitch);
  camera.position.set(
    target.x - fx * cam.dist * cp,
    target.y + 1.6 + cam.dist * sp,
    target.z - fz * cam.dist * cp
  );
  camera.lookAt(target.x + fx * 4, target.y + 0.4, target.z + fz * 4);
}

function applyScenePreset(state) {
  const sceneName = params.get('scene');
  const missionParam = parseInt(params.get('mission') || '0', 10);
  if (sceneName === 'chase') {
    const car = state.parkedCars[0];
    state.player.x = 232;
    state.player.z = 120;
    car.x = 232;
    car.z = 120;
    car.angle = 0;
    car.mesh.position.set(232, 0, 120);
    car.mesh.rotation.y = 0;
    enterCar(state, car);
    state.wanted = 3;
    state.lastCrimeAt = state.time;
    debugSpawnCruiser(state.police, 232, 195);
    debugSpawnCruiser(state.police, 240, 170);
    startMission(state.missions, 2, state);
  } else if (sceneName === 'mission') {
    state.player.x = 466;
    state.player.z = 140;
    state.player.angle = Math.PI / 2;
    state.onFootWeapon = 'pistol';
    startMission(state.missions, 4, state);
  } else if (sceneName === 'city') {
    state.player.x = 232;
    state.player.z = 200;
    state.player.angle = Math.PI;
  } else if (missionParam >= 1 && missionParam <= MISSIONS.length) {
    startMission(state.missions, missionParam, state);
  }
  state.player.mesh.position.set(state.player.x, 0, state.player.z);
  state.camera.yaw = state.player.angle;
}

function startPlaying(state, fresh) {
  state.audio.init();
  state.playing = true;
  state.paused = false;
  state.screen = 'playing';
  state.hud.showScreen('none');
  state.input.requestLock();
  if (fresh) {
    startMission(state.missions, 1, state);
    state.hud.showToast('Rico Vane: Grab the marked coupe on Coral Row. Go!');
  }
}

function endRun(state, kind) {
  state.playing = false;
  state.screen = 'busted';
  state.audio.setEngine(0, false);
  state.audio.setSiren(false);
  state.input.releaseLock();
  state.hud.showScreen('busted', kind);
  state.pendingPenalty = kind === 'wasted' ? 50 : 100;
}

function respawn(state) {
  if (state.driving) {
    state.playerCar = null;
    state.driving = false;
  }
  state.player.mesh.visible = true;
  state.cash = Math.max(0, state.cash - (state.pendingPenalty || 100));
  state.pendingPenalty = 0;
  state.player.x = 64;
  state.player.z = 96;
  state.player.y = 0;
  state.player.vy = 0;
  state.player.health = PLAYER.maxHealth;
  state.player.angle = 0;
  state.player.mesh.position.set(64, 0, 96);
  state.wanted = 0;
  state.hiddenTimer = 0;
  state.playing = true;
  state.screen = 'playing';
  state.hud.showScreen('none');
  state.input.requestLock();
}

function main() {
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  document.getElementById('game-root').appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x87ceeb);
  scene.fog = new THREE.Fog(0x9fd4e8, 180, 620);

  const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 1200);
  camera.position.set(64, 12, 100);

  const hemi = new THREE.HemisphereLight(0xbfe3ff, 0x8a7a5a, 0.95);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff2d0, 1.6);
  sun.position.set(180, 260, 90);
  scene.add(sun);

  const state = createState(scene);
  state.hud = new Hud();
  state.input = new Input(renderer.domElement);
  state.camera.yaw = 0;

  // --- screen buttons -------------------------------------------------------
  const has = hasSave();
  const btnContinue = document.getElementById('btn-continue');
  btnContinue.style.display = has ? 'inline-block' : 'none';
  document.getElementById('btn-start').addEventListener('click', () => startPlaying(state, true));
  btnContinue.addEventListener('click', () => {
    const save = loadGame();
    if (save) {
      state.cash = save.cash;
      state.player.x = save.playerX;
      state.player.z = save.playerZ;
      state.player.angle = save.playerAngle || 0;
      state.player.health = save.health || PLAYER.maxHealth;
      state.clockMinutes = save.clockMinutes || 540;
      state.missions.missionIndex = save.missionIndex || 0;
      state.missions.done = !!save.missionsDone;
      state.player.mesh.position.set(state.player.x, 0, state.player.z);
      state.camera.yaw = state.player.angle;
    }
    startPlaying(state, false);
    if (save && save.missionIndex < MISSIONS.length) {
      startMission(state.missions, save.missionIndex + 1, state);
    }
  });
  document.getElementById('btn-resume').addEventListener('click', () => togglePause(state));
  document.getElementById('btn-save').addEventListener('click', () => {
    if (saveGame(state)) state.hud.showToast('Progress saved.');
  });
  document.getElementById('btn-restart-mission').addEventListener('click', () => {
    if (state.missions.active) startMission(state.missions, state.missions.active.def.id, state);
    togglePause(state);
  });
  document.getElementById('btn-quit').addEventListener('click', () => {
    saveGame(state);
    state.playing = false;
    state.paused = false;
    state.screen = 'start';
    state.input.releaseLock();
    state.hud.showScreen('start');
  });
  document.getElementById('btn-respawn').addEventListener('click', () => respawn(state));
  renderer.domElement.addEventListener('click', () => {
    if (state.playing && !state.paused) state.input.requestLock();
  });

  function togglePause(s) {
    if (!s.playing && !s.paused) return;
    s.paused = !s.paused;
    s.screen = s.paused ? 'pause' : 'playing';
    s.hud.showScreen(s.paused ? 'pause' : 'none');
    if (s.paused) {
      s.input.releaseLock();
      s.audio.setEngine(0, false);
    } else {
      s.input.requestLock();
    }
  }
  state.input.onPause = () => togglePause(state);
  state.input.onInteract = () => {
    if (!state.playing || state.paused) return;
    if (state.driving) exitCar(state);
    else {
      const car = nearestParkedCar(state, 4);
      if (car) enterCar(state, car);
      else state.hud.showToast('No car here — find a parked car (look for the yellow ring).');
    }
  };
  state.input.onAction = () => {
    if (!state.playing || state.paused || state.driving) return;
    playerShoot(state, camera);
  };

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  applyScenePreset(state);
  const autostart = params.get('autostart') === '1' || params.get('scene') === 'chase' || params.get('scene') === 'mission' || params.get('scene') === 'city' || params.get('mission');
  if (autostart) {
    startPlaying(state, params.get('scene') !== 'chase' && params.get('scene') !== 'mission' && !params.get('mission'));
    if (params.get('scene') === 'chase' || params.get('scene') === 'mission' || params.get('mission')) {
      state.hud.showScreen('none');
    }
  }

  // Debug handle for playtesting (screenshots + autopilot).
  window.__solmar = {
    version: 'solmar-bay-round4',
    state,
    startMission: (n) => startMission(state.missions, n, state),
    setWanted: (n) => { state.wanted = n; state.lastCrimeAt = state.time; },
    teleport: (x, z) => {
      if (state.driving) exitCar(state);
      state.player.x = x;
      state.player.z = z;
      state.player.mesh.position.set(x, 0, z);
    },
    getCash: () => state.cash,
    getObjective: () => objectiveText(state.missions, state),
  };

  // --- main loop ------------------------------------------------------------
  const clock = new THREE.Clock();
  let toastShown = '';
  function frame() {
    requestAnimationFrame(frame);
    const dt = Math.min(clock.getDelta(), 0.05);
    state.time += dt;
    state.clockMinutes += dt * 0.5;
    if (state.seaMesh) state.seaMesh.position.y = -0.4 + Math.sin(state.time * 0.7) * 0.08;

    if (state.playing && !state.paused) {
      // Weapons + mission hotkeys.
      if (state.input.wasPressed('KeyM')) startNextMission(state.missions, state);
      if (state.input.wasPressed('Digit1')) { state.onFootWeapon = 'fists'; state.hud.showToast('Fists out.'); }
      if (state.input.wasPressed('Digit2')) { state.onFootWeapon = 'pistol'; state.hud.showToast('Pistol out — click to shoot.'); }
      if (state.input.wasPressed('KeyF') && !state.driving) playerShoot(state, camera);

      if (state.driving && state.playerCar) {
        const speed = updateDrivenCar(state.playerCar, state.input.driveInput(), state.colliders, dt, (hitSpeed) => {
          state.hud.showToast('Crash!');
          scarePedestrians(state.pedestrians, state.playerCar.x, state.playerCar.z, 16);
        });
        state.player.x = state.playerCar.x;
        state.player.z = state.playerCar.z;
        state.player.angle = state.playerCar.angle;
        state.audio.setEngine(Math.abs(speed) / 48, true);
        // Run over pedestrians.
        if (Math.abs(speed) > 5 && hitPedestrian(state.pedestrians, state.playerCar.x, state.playerCar.z, 2.4)) {
          addWanted(state, 1);
          state.hud.showToast('You hit a pedestrian! (+1 ★)');
        }
        // Shunt traffic cars aside.
        for (const t of state.traffic) {
          if (distance2D(t.x, t.z, state.playerCar.x, state.playerCar.z) < 3.4) {
            const a = Math.atan2(t.x - state.playerCar.x, t.z - state.playerCar.z);
            t.x += Math.sin(a) * 2;
            t.z += Math.cos(a) * 2;
            state.playerCar.speed *= 0.6;
          }
        }
      } else {
        movePlayerOnFoot(state, dt);
        state.audio.setEngine(0, false);
      }

      updateTrafficCars(state.traffic, dt);
      updatePedestrians(state.pedestrians, dt, state.time);
      updateWantedDecay(state, dt);
      const busted = updatePolice(state.police, state, dt, state.time);
      if (busted === 'busted') {
        endRun(state, 'busted');
      }
      if (state.rivals.length) updateRivals(state, state.rivals, dt, state.time);
      updateMissions(state.missions, state, dt);
      updateCombatEffects(state, dt);

      // Health regen after 8s calm.
      if (state.time - state.lastDamageAt > 8 && state.player.health > 0 && state.player.health < PLAYER.maxHealth) {
        state.player.health = Math.min(PLAYER.maxHealth, state.player.health + 3 * dt);
      }
      if (state.player.health <= 0) endRun(state, 'wasted');

      // Mission toast.
      if (state.missions.toast && state.missions.toast !== toastShown) {
        toastShown = state.missions.toast;
        state.hud.showToast(state.missions.toast, 4.5);
      }
      state.hud.updateObjective(state.missions, state);
      state.hud.setHint(state.driving ? 'WASD drive · E exit · P pause' : 'WASD move · E enter car · 1 fists · 2 pistol · M mission · P pause');
      state.audio.setSiren(state.wanted > 0);
      updateCamera(state, camera, dt);
    }

    state.hud.update(state, dt);
    state.hud.drawMinimap(state, state.time);
    state.input.endFrame();
    renderer.render(scene, camera);
  }
  frame();
}

main();
