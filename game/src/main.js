// Solmar Bay — Heat of the Coast: entry point. One job: wire every system
// together — renderer, player on foot and in a car, third-person camera,
// screens (start / pause / busted), the game loop, and the save.

import * as THREE from 'three';
import { CITY, PLAYER, clamp, dist2, formatCash, rand } from './config.js';
import { buildCity, resolveColliderPush } from './city.js';
import { VehicleSystem, createCarMesh } from './vehicles.js';
import { PedestrianSystem } from './pedestrians.js';
import { PoliceSystem } from './police.js';
import { MissionSystem } from './missions.js';
import { CombatSystem } from './combat.js';
import { HUD } from './hud.js';
import { AudioEngine } from './audio.js';
import { Input } from './input.js';
import { saveGame, loadGame, hasSave } from './save.js';

const START_CASH = 250;

function makePlayerMesh() {
  const g = new THREE.Group();
  const skin = new THREE.MeshLambertMaterial({ color: 0xe0ac69 });
  const legs = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.8, 0.22), new THREE.MeshLambertMaterial({ color: 0x2c3e50 }));
  legs.position.y = 0.4;
  g.add(legs);
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.62, 0.28), new THREE.MeshLambertMaterial({ color: 0x16a085 }));
  torso.position.y = 1.11;
  torso.castShadow = true;
  g.add(torso);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 10), skin);
  head.position.y = 1.64;
  head.castShadow = true;
  g.add(head);
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.21, 0.22, 0.12, 12), new THREE.MeshLambertMaterial({ color: 0xc0392b }));
  cap.position.y = 1.8;
  g.add(cap);
  const armL = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.55, 0.12), skin);
  armL.position.set(-0.32, 1.15, 0);
  g.add(armL);
  const armR = armL.clone();
  armR.position.x = 0.32;
  g.add(armR);
  g.userData.armL = armL;
  g.userData.armR = armR;
  return g;
}

class SolmarBayGame {
  constructor() {
    this.state = 'menu'; // menu | playing | paused | busted
    this.cash = START_CASH;
    this.health = PLAYER.maxHealth;
    this.missionIndex = 0;
    this.clockMinutes = 9 * 60 + 5; // 09:05, a bright coastal morning
    this.cameraYaw = Math.PI * 0.15;
    this.cameraPitch = 0.32;
    this.cameraDist = 9;
    this.playerYaw = 0;
    this.playerVy = 0;
    this.playerGrounded = true;
    this.inCar = false;
    this.speed = 0;
    this.lastDamageAt = -99;
    this.elapsed = 0;
    this.saveTimer = 0;
    this.bustedReason = '';
    this._lastRegenCheck = 0;

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.domElement.id = 'game-canvas';
    document.getElementById('game-root').appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 1200);

    this.input = new Input(this.renderer.domElement);
    this.audio = new AudioEngine();
    this.hud = new HUD();

    const city = buildCity(this.scene);
    this.city = city;
    this.colliders = city.colliders;
    this.spawnPoints = city.spawnPoints;

    this.player = makePlayerMesh();
    this.player.position.set(this.spawnPoints.player.x, 0, this.spawnPoints.player.z);
    this.scene.add(this.player);

    this.vehicles = new VehicleSystem(this.scene, this.colliders, (stars, reason) => {
      if (stars > 0) this.police.addStars(stars, reason);
    });
    this.peds = new PedestrianSystem(this.scene);
    this.police = new PoliceSystem(this.scene, this.colliders, {
      onBusted: (reason) => this.busted(reason),
      onDamage: (amount, reason) => this.damagePlayer(amount, reason),
      onToast: (t) => this.hud.toast(t),
    });
    this.combat = new CombatSystem(this.scene, {
      onPlayerDamage: (amount, reason) => this.damagePlayer(amount, reason),
      onGangDown: (g) => {
        this.hud.toast('Shark Boy ' + g.name + ' is down.');
        this.police.addStars(0, '');
        this.audio.chime();
      },
      onShoot: () => {
        this.audio.gunshot();
        this.peds.scare(this.player.position.x, this.player.position.z, 40);
        if (this.police.stars < 1) this.police.addStars(1, 'shots fired');
      },
      onPunch: () => this.audio.punch(),
      onEnemyShot: () => this.audio.enemyShot(),
      onPedPunched: () => this.police.addStars(2, 'assault'),
    });
    this.missions = new MissionSystem(this.scene, this.spawnPoints, {
      onMissionStart: (def) => {
        this.hud.toast(def.briefing, 6500);
        this.audio.missionStart();
      },
      onMissionComplete: (def) => {
        this.cash += def.reward;
        this.hud.toast('JOB DONE: ' + def.title + ' — +' + formatCash(def.reward), 5500);
        this.audio.chime();
        this.saveNow();
        if (this.missions.index < 5) {
          setTimeout(() => { if (this.state === 'playing') this.missions.startNext(); }, 2500);
        } else {
          this.hud.toast('STORY COMPLETE — Solmar Bay is yours. Free roam!', 7000);
        }
      },
      onMissionFailed: (def, reason) => {
        this.hud.toast('JOB FAILED: ' + def.title + ' — ' + reason + ' Talk to Rico to retry.', 6000);
        this.audio.error();
        setTimeout(() => { if (this.state === 'playing') this.missions.startNext(); }, 3000);
      },
      onPickup: (text) => { this.hud.toast(text, 4500); this.audio.chime(); },
      onAddWanted: (n) => this.police.addStars(n, 'stash grabbed'),
      onWantedNow: () => this.police.stars,
      onSpawnGang: (n, x, z, r) => this.combat.spawnGang(n, x, z, r),
      onSpawnTailCar: () => this._spawnTailCar(),
      onDespawnTailCar: () => this._despawnTailCar(),
    });
    this.missions.index = this.missionIndex;
    this.tailCar = null;

    this._bindScreens();
    this._bindResize();
    this._lastTime = performance.now();
    this._loop = this._loop.bind(this);
    requestAnimationFrame(this._loop);
    this._refreshStartScreen();
  }

  // --- screens ------------------------------------------------------------

  _bindScreens() {
    const startBtn = document.getElementById('btn-start');
    const continueBtn = document.getElementById('btn-continue');
    const resumeBtn = document.getElementById('btn-resume');
    const restartBtn = document.getElementById('btn-restart');
    const retryBtn = document.getElementById('btn-retry');
    const menuBtn = document.getElementById('btn-menu');
    if (startBtn) startBtn.addEventListener('click', () => this.startGame(false));
    if (continueBtn) continueBtn.addEventListener('click', () => this.startGame(true));
    if (resumeBtn) resumeBtn.addEventListener('click', () => this.resumeGame());
    if (restartBtn) restartBtn.addEventListener('click', () => { this.startGame(false); });
    if (retryBtn) retryBtn.addEventListener('click', () => this.retryAfterBusted());
    if (menuBtn) menuBtn.addEventListener('click', () => this.showMenu());
    this.renderer.domElement.addEventListener('click', () => {
      if (this.state === 'playing') this.input.lockPointer();
    });
  }

  _refreshStartScreen() {
    const cont = document.getElementById('btn-continue');
    const note = document.getElementById('save-note');
    const save = loadGame();
    if (cont) cont.style.display = save ? 'inline-block' : 'none';
    if (note) note.textContent = save
      ? 'Save found: ' + formatCash(save.cash) + ' — job ' + (save.missionIndex + 1) + ' of 5.'
      : 'No save yet — a fresh start in Solmar Bay.';
  }

  _show(id) {
    for (const s of ['start-screen', 'pause-screen', 'busted-screen']) {
      const el = document.getElementById(s);
      if (el) el.classList.toggle('hidden', s !== id);
    }
    const hud = document.getElementById('hud');
    if (hud) hud.classList.toggle('hidden', id !== null && id !== undefined && this.state !== 'playing' && id === 'start-screen');
    if (hud) hud.style.display = this.state === 'playing' ? 'block' : (id === 'start-screen' ? 'none' : 'block');
  }

  showMenu() {
    this.state = 'menu';
    this.input.unlockPointer();
    this._refreshStartScreen();
    this._show('start-screen');
  }

  startGame(fromSave) {
    this.audio.ensure();
    this.audio.click();
    if (fromSave) {
      const save = loadGame();
      if (save) {
        this.cash = save.cash;
        this.missionIndex = save.missionIndex;
        this.health = save.health;
        this.player.position.set(save.position.x, 0, save.position.z);
        this.playerYaw = save.yaw || 0;
      }
    } else {
      this.cash = START_CASH;
      this.missionIndex = 0;
      this.health = PLAYER.maxHealth;
      this.police.clearWanted();
      this.combat.clearGang();
      this.player.position.set(this.spawnPoints.player.x, 0, this.spawnPoints.player.z);
      this.playerYaw = 0;
      if (this.inCar) this._exitCar();
    }
    this.missions.index = this.missionIndex;
    this.missions.active = null;
    this.state = 'playing';
    this._show(null);
    this.input.lockPointer();
    this.hud.toast('Welcome to Solmar Bay. Rico Vane has work for you — follow the gold marker.', 6000);
    setTimeout(() => { if (this.state === 'playing') this.missions.startNext(); }, 1200);
  }

  resumeGame() {
    this.state = 'playing';
    this._show(null);
    this.input.lockPointer();
    this.audio.click();
  }

  pauseGame() {
    if (this.state !== 'playing') return;
    this.state = 'paused';
    this.input.unlockPointer();
    this.saveNow();
    this._show('pause-screen');
  }

  busted(reason) {
    if (this.state !== 'playing') return;
    this.state = 'busted';
    this.bustedReason = reason;
    const fine = Math.min(this.cash, 150);
    this.cash -= fine;
    this.police.clearWanted();
    this.combat.clearGang();
    if (this.inCar) this._exitCar();
    this.input.unlockPointer();
    this.audio.sirenWhoop();
    const reasonEl = document.getElementById('busted-reason');
    if (reasonEl) reasonEl.textContent = reason + ' Fine: ' + formatCash(fine) + '.';
    this._show('busted-screen');
    this.saveNow();
  }

  retryAfterBusted() {
    this.health = PLAYER.maxHealth;
    this.player.position.set(this.spawnPoints.player.x, 0, this.spawnPoints.player.z);
    this.playerYaw = 0;
    this.state = 'playing';
    this._show(null);
    this.input.lockPointer();
    this.hud.toast('Back on the street. Rico is still waiting.', 4000);
    if (!this.missions.active && this.missions.index < 5) this.missions.startNext();
  }

  saveNow() {
    saveGame({
      cash: this.cash,
      missionIndex: this.missions.index,
      health: this.health,
      playerX: this.player.position.x,
      playerY: this.player.position.y,
      playerZ: this.player.position.z,
      playerYaw: this.playerYaw,
    });
  }

  damagePlayer(amount, reason) {
    if (this.state !== 'playing') return;
    this.health -= amount;
    this.lastDamageAt = this.elapsed;
    if (this.health <= 0) {
      this.health = 0;
      this.busted('Flatlined in the street — ' + reason + '.');
    }
  }

  // --- tail-car mission support -------------------------------------------

  _spawnTailCar() {
    const mesh = createCarMesh('coupe', 0x8e44ad);
    mesh.position.set(this.spawnPoints.warehouse.x + 10, 0, this.spawnPoints.warehouse.z + 20);
    mesh.rotation.y = Math.PI / 2;
    this.scene.add(mesh);
    this.tailCar = { mesh, yaw: Math.PI / 2, speed: 0, t: 0 };
    return this.tailCar;
  }

  _despawnTailCar() {
    if (!this.tailCar) return;
    this.scene.remove(this.tailCar.mesh);
    this.tailCar = null;
  }

  _updateTailCar(dt) {
    const t = this.tailCar;
    if (!t) return;
    // The runner flees along the roads, turning at intersections.
    t.t += dt;
    t.speed = Math.min(t.speed + 8 * dt, 20);
    const centres = [-182, -130, -78, -26, 26, 78, 130, 182];
    const along = Math.abs(Math.sin(t.yaw)) > 0.5 ? t.mesh.position.x : t.mesh.position.z;
    const near = centres.find((c) => Math.abs(along - c) < t.speed * dt + 0.8);
    if (near !== undefined && Math.random() < dt * 0.5) {
      t.yaw += (Math.random() < 0.5 ? 1 : -1) * Math.PI / 2;
    }
    t.mesh.rotation.y = t.yaw;
    t.mesh.position.x += Math.sin(t.yaw) * t.speed * dt;
    t.mesh.position.z += Math.cos(t.yaw) * t.speed * dt;
    t.mesh.position.x = clamp(t.mesh.position.x, -200, 200);
    t.mesh.position.z = clamp(t.mesh.position.z, -200, 200);
  }

  // --- car enter / exit -----------------------------------------------------

  _enterCar() {
    const near = this.vehicles.nearestParked(this.player.position.x, this.player.position.z, 4);
    if (!near) { this.hud.toast('No car close enough to take.'); return; }
    this.vehicles.stealCar(near);
    this.inCar = true;
    this.player.visible = false;
    this.audio.setEngine(0, true);
    this.hud.toast('Car taken — ' + near.model.toUpperCase() + '. The owner will notice.', 3500);
  }

  _exitCar() {
    const car = this.vehicles.exitCar();
    if (!car) return;
    this.inCar = false;
    this.player.visible = true;
    const side = car.mesh.position.clone();
    side.x += Math.cos(car.yaw) * 2.2;
    side.z -= Math.sin(car.yaw) * 2.2;
    this.player.position.set(side.x, 0, side.z);
    this.playerYaw = car.yaw;
    this.audio.setEngine(0, false);
  }

  // --- per-frame ------------------------------------------------------------

  _updatePlayerOnFoot(dt) {
    const axes = this.input.moveAxes();
    const mouse = this.input.consumeMouse();
    this.cameraYaw -= mouse.dx * 0.0028;
    this.cameraPitch = clamp(this.cameraPitch + mouse.dy * 0.0022, 0.05, 1.1);
    const sprint = this.input.down('ShiftLeft') || this.input.down('ShiftRight');
    const speed = sprint ? PLAYER.sprintSpeed : PLAYER.walkSpeed;
    const sin = Math.sin(this.cameraYaw), cos = Math.cos(this.cameraYaw);
    let mx = (-sin * axes.y + cos * axes.x);
    let mz = (-cos * axes.y - sin * axes.x);
    const len = Math.hypot(mx, mz);
    if (len > 0.01) {
      mx /= len; mz /= len;
      this.playerYaw = Math.atan2(mx, mz);
      this.player.rotation.y = this.playerYaw;
    }
    let nx = this.player.position.x + mx * speed * dt;
    let nz = this.player.position.z + mz * speed * dt;
    const pushed = resolveColliderPush(nx, nz, PLAYER.radius, this.colliders);
    nx = clamp(pushed.x, -335, 335);
    nz = clamp(pushed.z, -335, 335);
    this.player.position.x = nx;
    this.player.position.z = nz;
    // Jump + gravity.
    if (this.playerGrounded && this.input.down('Space')) {
      this.playerVy = PLAYER.jumpSpeed;
      this.playerGrounded = false;
    }
    this.playerVy -= PLAYER.gravity * dt;
    let ny = this.player.position.y + this.playerVy * dt;
    if (ny <= 0) { ny = 0; this.playerVy = 0; this.playerGrounded = true; }
    this.player.position.y = ny;
    // Walk swing.
    const moving = len > 0.01;
    const swing = moving ? Math.sin(this.elapsed * (sprint ? 13 : 9)) * 0.5 : 0;
    this.player.userData.armL.rotation.x = swing;
    this.player.userData.armR.rotation.x = -swing;
    this.speed = moving ? speed : 0;
    // Enter a car.
    if (this.input.pressed('KeyE')) this._enterCar();
    // Weapons.
    if (this.input.pressed('Digit1')) { this.combat.switchWeapon('fists'); this.audio.click(); }
    if (this.input.pressed('Digit2')) {
      if (this.combat.switchWeapon('pistol')) this.audio.click();
      else this.hud.toast('No pistol yet — finish Rico\'s first job.');
    }
    // Attack with mouse click.
    if (this.input.consumeClick() && !this.input.pointerLocked) this.input.lockPointer();
    if (this.input.mouseDown) this._attack();
  }

  _attack() {
    const origin = this.camera.position.clone();
    const aim = new THREE.Vector3();
    this.camera.getWorldDirection(aim);
    aim.multiplyScalar(60).add(origin);
    aim.y = 1.2;
    const result = this.combat.playerAttack(origin, aim, this.peds, this.police);
    return result;
  }

  _updateCamera(dt) {
    const target = this.inCar && this.vehicles.playerCar
      ? this.vehicles.playerCar.mesh.position
      : this.player.position;
    let yaw, pitch, dist, height;
    if (this.inCar && this.vehicles.playerCar) {
      const car = this.vehicles.playerCar;
      yaw = car.yaw + Math.PI;
      pitch = 0.24;
      dist = 10.5;
      height = 3.4;
      this.cameraYaw = yaw;
    } else {
      yaw = this.cameraYaw;
      pitch = this.cameraPitch;
      dist = this.cameraDist;
      height = 1.9;
    }
    const cx = target.x + Math.sin(yaw) * Math.cos(pitch) * dist;
    const cz = target.z + Math.cos(yaw) * Math.cos(pitch) * dist;
    const cy = target.y + height + Math.sin(pitch) * dist;
    this.camera.position.set(cx, Math.max(cy, 1.2), cz);
    this.camera.lookAt(target.x, target.y + 1.6, target.z);
  }

  _loop(now) {
    requestAnimationFrame(this._loop);
    const dt = Math.min((now - this._lastTime) / 1000, 0.05);
    this._lastTime = now;
    this.elapsed += dt;

    if (this.state === 'playing') {
      this.clockMinutes = (this.clockMinutes + dt * 0.6) % (24 * 60);
      // Pause.
      if (this.input.pressed('KeyP') || this.input.pressed('Escape')) { this.pauseGame(); }
      else {
        if (this.inCar) {
          const axes = this.input.moveAxes();
          const mouse = this.input.consumeMouse();
          this.cameraYaw -= mouse.dx * 0.002;
          this.speed = this.vehicles.updatePlayerCar(dt, axes, this.colliders, this.peds.peds, (ped) => {
            this.peds.knockDown(ped);
            this.police.addStars(2, 'pedestrian hit');
            this.audio.crash();
            this.peds.scare(ped.mesh.position.x, ped.mesh.position.z, 25);
          });
          if (this.input.pressed('KeyE')) this._exitCar();
          if (this.input.consumeClick()) this.input.lockPointer();
          this.audio.setEngine(Math.abs(this.speed) / 38, true);
          this.audio.updateSiren(dt);
        } else {
          this._updatePlayerOnFoot(dt);
          this.audio.setEngine(0, false);
          this.audio.updateSiren(dt);
        }
        // Health regen after 10 quiet seconds.
        if (this.elapsed - this.lastDamageAt > 10 && this.health > 0 && this.health < PLAYER.maxHealth) {
          this.health = Math.min(PLAYER.maxHealth, this.health + 6 * dt);
        }
        this.vehicles.updateTraffic(dt, this.player.position, this.vehicles.playerCar);
        this.peds.update(dt, this.elapsed);
        this.police.update(dt, { x: this.player.position.x, z: this.player.position.z }, this.inCar, this.elapsed);
        this.combat.update(dt, { x: this.player.position.x, z: this.player.position.z }, this.health);
        this._updateTailCar(dt);
        this.missions.update(dt, { x: this.player.position.x, z: this.player.position.z }, this.combat.gangAlive());
        this.city.update(dt, this.elapsed);
        // Autosave every 20s.
        this.saveTimer += dt;
        if (this.saveTimer > 20) { this.saveTimer = 0; this.saveNow(); }
        // HUD.
        const target = this.missions.targetPos;
        const objectiveDist = target ? dist2(this.player.position.x, this.player.position.z, target.x, target.z) : null;
        this.hud.update({
          cash: this.cash,
          health: this.health,
          stars: this.police.stars,
          objective: this.missions.objectiveText,
          objectiveDist,
          clockMinutes: this.clockMinutes,
          speed: this.speed,
          inCar: this.inCar,
          weapon: this.combat.weapon,
          ammo: this.combat.ammo,
          hitmark: this.combat.hitmarkTimer > 0,
          lowHealth: this.health < 30,
        });
        this.hud.drawMinimap({
          player: { x: this.player.position.x, z: this.player.position.z, yaw: this.inCar && this.vehicles.playerCar ? this.vehicles.playerCar.yaw : this.playerYaw },
          traffic: this.vehicles.traffic.map((t) => ({ x: t.mesh.position.x, z: t.mesh.position.z })),
          police: [
            ...this.police.cruisers.map((c) => ({ x: c.mesh.position.x, z: c.mesh.position.z })),
            ...this.police.officers.map((o) => ({ x: o.mesh.position.x, z: o.mesh.position.z })),
          ],
          mission: target,
        });
      }
    } else if (this.state === 'menu') {
      // Slow cinematic orbit behind the start screen.
      const t = this.elapsed * 0.04;
      this.camera.position.set(Math.sin(t) * 120, 55, Math.cos(t) * 120);
      this.camera.lookAt(0, 0, 40);
      this.vehicles.updateTraffic(dt, null, null);
      this.peds.update(dt, this.elapsed);
      this.city.update(dt, this.elapsed);
    } else {
      // Paused / busted: keep the world visible but frozen.
      this.vehicles.updateTraffic(0, null, null);
    }

    if (this.state !== 'menu') this._updateCamera(dt);
    this.renderer.render(this.scene, this.camera);
  }

  _bindResize() {
    window.addEventListener('resize', () => {
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(window.innerWidth, window.innerHeight);
    });
  }
}

// --- debug / test hooks (used by the maker's own screenshots + playtest) ----
window.__solmar = {
  game: null,
  start() { if (window.__solmar.game) window.__solmar.game.startGame(false); },
  state() {
    const g = window.__solmar.game;
    if (!g) return null;
    return {
      state: g.state, cash: g.cash, health: g.health,
      stars: g.police.stars, missionIndex: g.missions.index,
      objective: g.missions.objectiveText,
      x: g.player.position.x, z: g.player.position.z,
      inCar: g.inCar, gang: g.combat.gangAlive(),
    };
  },
  teleport(x, z) {
    const g = window.__solmar.game;
    if (!g) return;
    if (g.inCar) g._exitCar();
    g.player.position.set(x, 0, z);
  },
  setWanted(n) {
    const g = window.__solmar.game;
    if (!g) return;
    g.police.stars = Math.max(0, Math.min(5, n));
  },
  giveCar() {
    const g = window.__solmar.game;
    if (!g) return;
    const near = g.vehicles.nearestParked(g.player.position.x, g.player.position.z, 500);
    if (!near) return null;
    near.mesh.position.set(g.player.position.x + 2, 0, g.player.position.z + 2);
    near.mesh.rotation.y = g.playerYaw;
    near.yaw = g.playerYaw; // physics yaw must match the mesh, or the car drives off-road
    g.vehicles.stealCar(near);
    g.inCar = true;
    g.player.visible = false;
    return near.model;
  },
  startMission(i) {
    const g = window.__solmar.game;
    if (!g) return;
    g.missions.index = i;
    g.missions.active = null;
    g.missions.startNext();
  },
  spawnGang(n) {
    const g = window.__solmar.game;
    if (!g) return;
    g.combat.spawnGang(n, g.player.position.x + 12, g.player.position.z + 8, 8);
  },
};

window.addEventListener('DOMContentLoaded', () => {
  window.__solmar.game = new SolmarBayGame();
  window.__solmarReady = true;
});
