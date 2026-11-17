// Solmar Bay — Heat of the Coast: entry point. Owns the renderer, the
// player (on foot and driving), the third-person camera, the game loop,
// screens, saving and the screenshot staging hooks.

import * as THREE from 'three';
import { CONFIG, PLACES, clamp, angleLerp, distance2D } from './config.js';
import { buildCity, resolveCircleCollision } from './city.js';
import { spawnParkedCars, spawnTrafficCars, updateTrafficCar, drivePlayerCar, nearestParkedCar } from './vehicles.js';
import { spawnPedestrians, updatePedestrian, scarePedestrians } from './pedestrians.js';
import { PoliceForce, WantedSystem } from './police.js';
import { MissionManager } from './missions.js';
import { CombatSystem } from './combat.js';
import { Hud } from './hud.js';
import { AudioEngine } from './audio.js';
import { saveGame, loadGame, hasSave, clearSave } from './save.js';
import { InputManager } from './input.js';

window.__solmarError = null;
window.addEventListener('error', (e) => {
  window.__solmarError = String(e.message || e.error || 'unknown error');
});

class SolmarGame {
  constructor() {
    this.phase = 'start'; // 'start' | 'playing' | 'paused' | 'busted'
    this.cash = 250;
    this.health = CONFIG.playerMaxHealth;
    this.clockMinutes = CONFIG.clockStartMinutes;
    this.playerPos = new THREE.Vector3(PLACES.ricosGarage.x, 0, PLACES.ricosGarage.z);
    this.playerHeading = Math.PI * 0.75;
    this.playerVy = 0;
    this.onGround = true;
    this.cameraYaw = Math.PI * 0.75;
    this.cameraPitch = 0.32;
    this.currentCar = null;
    this.lastCrimeAt = 0;
    this.lastStepKey = '';
    this.saveTimer = 0;
    this.pedHitCooldown = 0;
    this.deathCause = 'busted';
    this.initThree();
    this.initWorld();
    this.initSystems();
    this.wireScreens();
    this.loop = this.loop.bind(this);
    requestAnimationFrame(this.loop);
  }

  initThree() {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    document.getElementById('game-canvas').appendChild(this.renderer.domElement);
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x87c5e8);
    this.scene.fog = new THREE.Fog(0x9fc8e8, 180, 520);
    this.camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 900);
    const sun = new THREE.DirectionalLight(0xfff2d0, 2.6);
    sun.position.set(120, 180, 60);
    this.scene.add(sun);
    const hemi = new THREE.HemisphereLight(0xbfe3ff, 0x8a7a5a, 1.1);
    this.scene.add(hemi);
    window.addEventListener('resize', () => {
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(window.innerWidth, window.innerHeight);
    });
  }

  initWorld() {
    const city = buildCity(this.scene);
    this.colliders = city.colliders;
    this.parkedCars = spawnParkedCars(this.scene);
    this.trafficCars = spawnTrafficCars(this.scene);
    this.pedestrians = spawnPedestrians(this.scene);
    this.playerMesh = buildPlayerMesh();
    this.scene.add(this.playerMesh);
  }

  initSystems() {
    this.input = new InputManager(this.renderer.domElement);
    this.input.onFirstGesture = () => this.audio.ensure();
    this.audio = new AudioEngine();
    this.hud = new Hud();
    this.wanted = new WantedSystem();
    this.police = new PoliceForce(this.scene);
    this.missions = new MissionManager(this.scene, {
      onCash: (amount) => {
        this.cash += amount;
        this.audio.chime();
        this.hud.setCash(this.cash);
        this.autosave();
      },
      onMessage: (text) => this.hud.showMessage(text),
      onMissionComplete: () => this.autosave(),
      onCrime: (stars, reason) => this.commitCrime(stars, reason),
    });
    this.combat = new CombatSystem(this.scene, {
      onShoot: (kind) => {
        this.audio.gunshot(kind || 'pistol');
        if (kind !== 'punch') {
          scarePedestrians(this.pedestrians, this.playerPos.x, this.playerPos.z, 30);
        }
      },
      onHit: () => this.hud.showHitmarker(),
      onPlayerDamage: (amount) => this.damagePlayer(amount),
      onRivalKilled: () => this.missions.onRivalKilled(),
      onCrime: (stars, reason) => this.commitCrime(stars, reason),
    });
    this.clock = new THREE.Clock();
    this.hud.setCash(this.cash);
    this.hud.setHealth(this.health);
    this.hud.setWanted(0);
    this.hud.showScreen('start');
    document.getElementById('continue-btn').style.display = hasSave() ? 'inline-block' : 'none';
  }

  wireScreens() {
    document.getElementById('start-btn').addEventListener('click', () => {
      clearSave();
      this.newGame();
    });
    document.getElementById('continue-btn').addEventListener('click', () => this.continueGame());
    document.getElementById('resume-btn').addEventListener('click', () => this.setPhase('playing'));
    document.getElementById('restart-btn').addEventListener('click', () => {
      clearSave();
      this.newGame();
    });
    document.getElementById('busted-btn').addEventListener('click', () => this.respawnAfterBusted());
    document.getElementById('mute-btn').addEventListener('click', (e) => {
      this.audio.ensure();
      const muted = !this.audio.muted;
      this.audio.setMuted(muted);
      e.target.textContent = muted ? '🔇 Sound Off' : '🔊 Sound On';
    });
  }

  newGame() {
    this.cash = 250;
    this.health = CONFIG.playerMaxHealth;
    this.clockMinutes = CONFIG.clockStartMinutes;
    this.playerPos.set(PLACES.ricosGarage.x, 0, PLACES.ricosGarage.z);
    this.playerHeading = Math.PI * 0.75;
    this.cameraYaw = Math.PI * 0.75;
    this.wanted.setStars(0);
    this.police.clearAll();
    this.combat.clearRivals();
    this.combat.pistolEquipped = false;
    this.currentCar = null;
    this.missions = this.rebuildMissions();
    this.setPhase('playing');
    this.hud.showMessage("Welcome to Solmar Bay. Rico's waiting — steal a car!");
    this.autosave();
  }

  rebuildMissions() {
    this.scene.remove(this.missions.marker);
    this.scene.remove(this.missions.beacon);
    return new MissionManager(this.scene, {
      onCash: (amount) => {
        this.cash += amount;
        this.audio.chime();
        this.hud.setCash(this.cash);
        this.autosave();
      },
      onMessage: (text) => this.hud.showMessage(text),
      onMissionComplete: () => this.autosave(),
      onCrime: (stars, reason) => this.commitCrime(stars, reason),
    });
  }

  continueGame() {
    const data = loadGame();
    if (!data) { this.newGame(); return; }
    this.newGame();
    this.cash = data.cash;
    this.health = data.health;
    this.playerPos.set(data.playerX, 0, data.playerZ);
    this.playerHeading = data.playerHeading;
    this.cameraYaw = data.playerHeading;
    this.missions.completedCount = data.missionsDone || 0;
    if (data.missionIndex > 0 && data.missionIndex < 5) {
      this.missions.startMission(data.missionIndex);
    }
    this.hud.setCash(this.cash);
    this.hud.showMessage('Welcome back to Solmar Bay.');
  }

  respawnAfterBusted() {
    this.health = CONFIG.playerMaxHealth;
    this.wanted.setStars(0);
    this.police.clearAll();
    this.combat.clearRivals();
    if (this.currentCar) {
      this.currentCar.occupied = false;
      this.currentCar.speed = 0;
      this.currentCar = null;
    }
    this.playerPos.set(PLACES.safehouse.x, 0, PLACES.safehouse.z);
    this.playerHeading = Math.PI / 2;
    this.cameraYaw = Math.PI / 2;
    this.playerMesh.visible = true;
    this.setPhase('playing');
    this.hud.showMessage('You slipped out the back. Lay low, boss.');
  }

  setPhase(phase) {
    this.phase = phase;
    if (phase === 'playing') {
      this.hud.showScreen(null);
      this.audio.ensure();
    } else if (phase === 'paused') {
      this.hud.showScreen('pause');
    } else if (phase === 'busted') {
      document.getElementById('busted-title').textContent =
        this.deathCause === 'arrested' ? 'BUSTED!' : 'TAKEN DOWN!';
      this.hud.setBustedStats(this.cash, this.missions.completedCount);
      this.hud.showScreen('busted');
    } else {
      this.hud.showScreen('start');
    }
  }

  commitCrime(stars, reason) {
    const now = performance.now();
    if (now - this.lastCrimeAt < 2500 && reason !== 'stolen') return;
    this.lastCrimeAt = now;
    const result = this.wanted.addCrime(stars, reason);
    this.hud.setWanted(result.stars);
    if (result.stars > 0) {
      this.hud.showMessage(`Wanted level ${result.stars} — ${reason}!`);
    }
  }

  damagePlayer(amount) {
    if (this.phase !== 'playing') return;
    this.health -= amount;
    this.hud.setHealth(this.health);
    this.hud.flashDamage();
    if (this.health <= 0) {
      this.health = 0;
      this.deathCause = 'shot';
      this.setPhase('busted');
    }
  }

  autosave() {
    saveGame({
      cash: this.cash,
      missionIndex: Math.max(0, this.missions.activeIndex),
      missionsDone: this.missions.completedCount,
      playerX: this.playerPos.x,
      playerZ: this.playerPos.z,
      playerHeading: this.playerHeading,
      health: this.health,
    });
  }

  // --- Interaction: enter/exit cars, punch, pistol, pause ---
  handleActions() {
    const input = this.input;
    if (input.wasPressed('KeyE')) {
      if (this.currentCar) {
        this.exitCar();
      } else {
        const car = nearestParkedCar(this.parkedCars, this.playerPos.x, this.playerPos.z, 4.5);
        if (car) this.enterCar(car);
      }
    }
    if (input.wasPressed('Digit1') && !this.currentCar) {
      this.combat.pistolEquipped = !this.combat.pistolEquipped;
      this.hud.showMessage(this.combat.pistolEquipped ? 'Pistol out — click to shoot' : 'Pistol holstered');
    }
    if (input.wasPressed('KeyF') && !this.currentCar) {
      this.combat.punch(this.playerPos, this.playerHeading);
    }
    if (input.wasPressed('KeyP') || input.wasPressed('Escape')) {
      this.setPhase(this.phase === 'playing' ? 'paused' : 'playing');
    }
    if (input.wasPressed('KeyM')) {
      this.audio.ensure();
      this.audio.setMuted(!this.audio.muted);
    }
    if (this.combat.pistolEquipped && !this.currentCar && input.shootHeld) {
      this.combat.shoot(this.camera, this.playerPos);
    }
  }

  enterCar(car) {
    this.currentCar = car;
    car.occupied = true;
    this.playerMesh.visible = false;
    if (!car.stolen) {
      car.stolen = true;
      this.commitCrime(1, 'car stolen');
      this.audio.thud();
      this.hud.showMessage(`Stole the ${car.model.name} — the heat is on!`);
    } else {
      this.hud.showMessage(`Driving the ${car.model.name}`);
    }
    this.missions.onCarStolen();
    this.autosave();
  }

  exitCar() {
    const car = this.currentCar;
    const f = car.forwardVector();
    this.playerPos.set(car.x - f.x * 3, 0, car.z - f.z * 3);
    this.playerHeading = car.heading;
    this.cameraYaw = car.heading;
    car.occupied = false;
    car.speed = 0;
    this.currentCar = null;
    this.playerMesh.visible = true;
    this.autosave();
  }

  // --- On-foot movement ---
  updateOnFoot(dt) {
    const axes = this.input.moveAxes();
    const mouse = this.input.consumeMouse();
    this.cameraYaw -= mouse.dx * 0.0028;
    this.cameraPitch = clamp(this.cameraPitch + mouse.dy * 0.0022, -0.1, 1.1);
    const speed = axes.sprint ? CONFIG.sprintSpeed : CONFIG.walkSpeed;
    let mx = 0;
    let mz = 0;
    if (axes.forward) { mx += Math.sin(this.cameraYaw); mz += Math.cos(this.cameraYaw); }
    if (axes.back) { mx -= Math.sin(this.cameraYaw); mz -= Math.cos(this.cameraYaw); }
    if (axes.left) { mx -= Math.cos(this.cameraYaw); mz += Math.sin(this.cameraYaw); }
    if (axes.right) { mx += Math.cos(this.cameraYaw); mz -= Math.sin(this.cameraYaw); }
    const len = Math.hypot(mx, mz);
    if (len > 0) {
      mx /= len;
      mz /= len;
      this.playerHeading = Math.atan2(mx, mz);
      const nx = this.playerPos.x + mx * speed * dt;
      const nz = this.playerPos.z + mz * speed * dt;
      const fixed = resolveCircleCollision(nx, nz, CONFIG.playerRadius, this.colliders);
      this.playerPos.x = clamp(fixed.x, -CONFIG.cityHalf - 8, CONFIG.beachEnd - 4);
      this.playerPos.z = clamp(fixed.z, -CONFIG.cityHalf - 8, CONFIG.cityHalf + 8);
      // Walk-cycle bob and limb swing.
      this.walkPhase = (this.walkPhase || 0) + dt * speed * 1.6;
      const swing = Math.sin(this.walkPhase) * 0.5;
      this.playerMesh.userData.legL.rotation.x = swing;
      this.playerMesh.userData.legR.rotation.x = -swing;
      this.playerMesh.userData.armL.rotation.x = -swing * 0.7;
      this.playerMesh.userData.armR.rotation.x = swing * 0.7;
    } else {
      this.playerMesh.userData.legL.rotation.x *= 0.8;
      this.playerMesh.userData.legR.rotation.x *= 0.8;
    }
    if (axes.jump && this.onGround) {
      this.playerVy = CONFIG.jumpSpeed;
      this.onGround = false;
    }
    this.playerVy -= CONFIG.gravity * dt;
    this.playerPos.y += this.playerVy * dt;
    if (this.playerPos.y <= 0) {
      this.playerPos.y = 0;
      this.playerVy = 0;
      this.onGround = true;
    }
    this.playerMesh.position.copy(this.playerPos);
    this.playerMesh.rotation.y = this.playerHeading;
  }

  // --- Driving ---
  updateDriving(dt) {
    const axes = this.input.moveAxes();
    const mouse = this.input.consumeMouse();
    this.cameraYaw -= mouse.dx * 0.0028;
    this.cameraPitch = clamp(this.cameraPitch + mouse.dy * 0.0022, 0.05, 1.0);
    const result = drivePlayerCar(this.currentCar, axes, dt, this.colliders);
    if (result.offRoad && Math.abs(this.currentCar.speed) > 20) {
      // Speeding off-road through the beach kicks up nothing; keep it simple.
    }
    this.playerPos.set(this.currentCar.x, 0, this.currentCar.z);
    this.playerHeading = this.currentCar.heading;
    this.audio.setEngine(Math.abs(this.currentCar.speed) / CONFIG.carMaxSpeed, true);
    // Hitting a pedestrian while driving is a crime.
    this.pedHitCooldown -= dt;
    for (const ped of this.pedestrians) {
      const out = updatePedestrian(ped, dt, this.playerPos, this.currentCar.speed);
      if (out === 'hit' && this.pedHitCooldown <= 0) {
        this.pedHitCooldown = 5;
        this.commitCrime(1, 'hit a pedestrian');
        this.audio.thud();
      }
    }
  }

  // --- Third-person camera ---
  updateCamera(dt) {
    const inCar = !!this.currentCar;
    const dist = inCar ? 10.5 : 7.5;
    const height = inCar ? 4.2 : 3.1;
    // When driving, the camera eases back behind the car; on foot it follows the mouse.
    if (inCar) {
      this.cameraYaw = angleLerp(this.cameraYaw, this.currentCar.heading, Math.min(1, dt * 2.5));
    }
    const cy = this.cameraYaw;
    const cx = this.playerPos.x - Math.sin(cy) * Math.cos(this.cameraPitch) * dist;
    const cz = this.playerPos.z - Math.cos(cy) * Math.cos(this.cameraPitch) * dist;
    const camY = this.playerPos.y + height * Math.sin(this.cameraPitch) + 1.6;
    this.camera.position.set(cx, Math.max(0.8, camY), cz);
    this.camera.lookAt(this.playerPos.x, this.playerPos.y + 1.5, this.playerPos.z);
  }

  // --- Mission step side-effects (heat, rival spawns) ---
  handleStepSideEffects() {
    const def = this.missions.currentDef();
    const step = this.missions.currentStep();
    if (!def || !step) return;
    const key = `${def.id}:${this.missions.stepIndex}:${step.type}`;
    if (key === this.lastStepKey) return;
    this.lastStepKey = key;
    if (step.type === 'survive' && def.id === 3) {
      this.wanted.setStars(3);
      this.hud.setWanted(3);
      this.hud.showMessage('Three stars! Lose them and reach the safehouse.');
    }
    if (step.type === 'eliminate') {
      this.combat.spawnRivals(step.count, PLACES.docks.x, PLACES.docks.z);
      this.hud.showMessage('Rival crew on the docks — take them all down!');
    }
    if (step.type === 'escape') {
      this.wanted.setStars(3);
      this.hud.setWanted(3);
    }
  }

  loop() {
    requestAnimationFrame(this.loop);
    const dt = Math.min(this.clock.getDelta(), 0.05);
    if (this.phase === 'playing') {
      this.handleActions();
      this.handleStepSideEffects();
      if (this.currentCar) this.updateDriving(dt);
      else this.updateOnFoot(dt);
      // Traffic and pedestrians keep moving.
      const allCars = [...this.trafficCars, ...this.parkedCars];
      for (const car of this.trafficCars) updateTrafficCar(car, dt, allCars, this.colliders);
      if (!this.currentCar) {
        for (const ped of this.pedestrians) {
          updatePedestrian(ped, dt, this.playerPos, 0);
        }
      }
      // Wanted + police.
      const nearestPolice = this.nearestPoliceDistance();
      this.wanted.update(dt, nearestPolice < 50);
      this.police.syncToWanted(this.wanted.stars, this.playerPos.x, this.playerPos.z);
      const busted = this.police.update(
        dt, this.wanted.stars, this.playerPos.x, this.playerPos.z,
        !!this.currentCar, this.currentCar ? this.currentCar.speed : 0,
        (kind) => { if (kind === 'ram') this.audio.thud(); },
      );
      if (busted === 'busted') {
        this.deathCause = 'arrested';
        this.setPhase('busted');
      }
      // Combat + missions.
      this.combat.update(dt);
      this.combat.updateRivals(dt, this.playerPos, !!this.currentCar);
      this.missions.update(dt, {
        playerX: this.playerPos.x,
        playerZ: this.playerPos.z,
        inCar: !!this.currentCar,
        wanted: this.wanted.stars,
      });
      // Clock, audio, HUD.
      this.clockMinutes = (this.clockMinutes + dt) % 1440;
      this.audio.updateSiren(dt);
      this.audio.setSiren(this.police.cruisers.length > 0);
      if (!this.currentCar) this.audio.setEngine(0, false);
      this.hud.setCash(this.cash);
      this.hud.setHealth(this.health);
      this.hud.setWanted(this.wanted.stars);
      this.hud.setClock(this.clockMinutes);
      this.hud.setObjective(this.missions.objectiveText());
      this.hud.setSpeed(this.currentCar ? Math.abs(this.currentCar.speed) * 3.6 : 0, !!this.currentCar);
      this.hud.setCrosshair(!this.currentCar, this.combat.pistolEquipped);
      this.hud.drawMinimap({
        playerX: this.playerPos.x,
        playerZ: this.playerPos.z,
        heading: this.playerHeading,
        cars: [...this.parkedCars, ...this.trafficCars],
        police: [...this.police.cruisers.map((c) => ({ x: c.mesh.position.x, z: c.mesh.position.z })),
          ...this.police.officers.map((o) => ({ x: o.mesh.position.x, z: o.mesh.position.z }))],
        rivals: this.combat.rivals.map((r) => ({ x: r.mesh.position.x, z: r.mesh.position.z })),
        marker: this.missions.markerPosition(),
      });
      // Autosave every 30 seconds.
      this.saveTimer += dt;
      if (this.saveTimer > 30) {
        this.saveTimer = 0;
        this.autosave();
      }
      this.updateCamera(dt);
      this.input.endFrame();
    } else if (this.phase === 'start') {
      // Slow cinematic orbit over the city behind the start screen.
      const t = performance.now() * 0.00005;
      this.camera.position.set(Math.cos(t) * 150, 70, Math.sin(t) * 150);
      this.camera.lookAt(0, 0, 0);
      for (const car of this.trafficCars) updateTrafficCar(car, dt, [...this.trafficCars, ...this.parkedCars], this.colliders);
    }
    this.renderer.render(this.scene, this.camera);
  }

  nearestPoliceDistance() {
    let best = Infinity;
    for (const c of this.police.cruisers) {
      best = Math.min(best, distance2D(this.playerPos.x, this.playerPos.z, c.mesh.position.x, c.mesh.position.z));
    }
    for (const o of this.police.officers) {
      best = Math.min(best, distance2D(this.playerPos.x, this.playerPos.z, o.mesh.position.x, o.mesh.position.z));
    }
    return best;
  }

  // --- Screenshot staging: deterministic setups for the four shots ---
  stageShot(name) {
    if (name === 'start') {
      this.setPhase('start');
      return 'start screen';
    }
    this.audio.ensure();
    if (this.phase !== 'playing') this.newGame();
    if (this.currentCar) this.exitCar();
    if (name === 'chase') {
      // Mission 3: heat on, player in a fast car on the main drag.
      this.missions.startMission(2);
      this.lastStepKey = '';
      const car = this.parkedCars[0];
      this.playerPos.set(car.x, 0, car.z);
      this.enterCar(car);
      this.currentCar.speed = 26;
      this.currentCar.heading = Math.PI / 2;
      this.currentCar.mesh.position.set(0, 0, -52);
      this.playerPos.set(0, 0, -52);
      this.cameraYaw = this.currentCar.heading;
      this.wanted.setStars(3);
      this.hud.setWanted(3);
      this.police.syncToWanted(3, 0, -52);
      // One cruiser ahead in the lane (visible in frame), one right behind.
      if (this.police.cruisers[0]) {
        this.police.cruisers[0].mesh.position.set(30, 0, -52 + 5);
        this.police.cruisers[0].heading = Math.PI / 2;
        this.police.cruisers[0].speed = 24;
      }
      if (this.police.cruisers[1]) {
        this.police.cruisers[1].mesh.position.set(-16, 0, -52 - 3);
        this.police.cruisers[1].heading = Math.PI / 2;
        this.police.cruisers[1].speed = 26;
      }
      return 'police chase, 3 stars';
    }
    if (name === 'mission') {
      // Mission 4: dockside shootout, pistol out, rivals in frame.
      this.missions.startMission(3);
      this.missions.completeStep(); // skip the "head to the docks" step: we are there
      this.lastStepKey = '';
      this.handleStepSideEffects();
      this.playerPos.set(PLACES.docks.x + 14, 0, PLACES.docks.z - 6);
      this.playerHeading = -1.17;
      this.cameraYaw = -1.17;
      this.combat.pistolEquipped = true;
      this.wanted.setStars(2);
      this.hud.setWanted(2);
      return 'dockside shootout';
    }
    if (name === 'city') {
      // On foot in Palms Plaza, traffic and pedestrians around.
      this.missions.startMission(0);
      this.playerPos.set(PLACES.palmsPlaza.x, 0, PLACES.palmsPlaza.z + 18);
      this.playerHeading = Math.PI * 0.9;
      this.cameraYaw = Math.PI * 0.9;
      this.wanted.setStars(0);
      this.hud.setWanted(0);
      this.police.clearAll();
      this.combat.pistolEquipped = false;
      return 'city on foot';
    }
    return 'unknown shot';
  }
}

function buildPlayerMesh() {
  const group = new THREE.Group();
  const jacket = new THREE.MeshStandardMaterial({ color: 0x14b8a6, roughness: 0.8 });
  const pants = new THREE.MeshStandardMaterial({ color: 0x222831, roughness: 0.9 });
  const skin = new THREE.MeshStandardMaterial({ color: 0xf2c9a0, roughness: 0.8 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.8, 0.34), jacket);
  body.position.y = 1.05;
  body.castShadow = true;
  group.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 8), skin);
  head.position.y = 1.62;
  head.castShadow = true;
  group.add(head);
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.23, 0.24, 0.1, 10),
    new THREE.MeshStandardMaterial({ color: 0xe85d75, roughness: 0.8 }));
  cap.position.y = 1.8;
  group.add(cap);
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.65, 0.22), pants);
  legL.position.set(-0.14, 0.33, 0);
  group.add(legL);
  const legR = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.65, 0.22), pants);
  legR.position.set(0.14, 0.33, 0);
  group.add(legR);
  const armL = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.6, 0.16), jacket);
  armL.position.set(-0.38, 1.05, 0);
  group.add(armL);
  const armR = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.6, 0.16), jacket);
  armR.position.set(0.38, 1.05, 0);
  group.add(armR);
  group.userData = { legL, legR, armL, armR };
  return group;
}

const game = new SolmarGame();
window.__solmar = game;
window.__solmarReady = true;
