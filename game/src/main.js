// Solmar Bay — main game: player on foot and by car, chase camera, input,
// wanted/crime wiring, pickups, busted/wasted, pause/save, start screen and
// the demo hooks the screenshot run uses (?demo=chase|mission|city|start).
import * as THREE from 'three';
import { CITY, GAME, makeRng, clampCity, resolveCollisions, lerpAngle, fmtTime, fmtClock } from './config.js';
import { buildCity } from './city.js';
import { TrafficManager, Car } from './vehicles.js';
import { PedestrianManager } from './pedestrians.js';
import { PoliceManager } from './police.js';
import { CombatManager, ParticleSystem, TracerSystem } from './combat.js';
import { MissionManager, MISSION_DEFS } from './missions.js';
import { Hud } from './hud.js';
import { AudioEngine } from './audio.js';
import { saveGame, loadGame, hasSave, clearSave } from './save.js';

const $ = (id) => document.getElementById(id);

function makePlayerMesh() {
  const g = new THREE.Group();
  const skin = new THREE.MeshStandardMaterial({ color: 0xe0ac69, roughness: 0.8 });
  const jacket = new THREE.MeshStandardMaterial({ color: 0xffd23e, roughness: 0.85 });
  const pants = new THREE.MeshStandardMaterial({ color: 0x2c3e50, roughness: 0.9 });
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.33, 12, 12), skin);
  head.position.y = 1.64;
  const hair = new THREE.Mesh(new THREE.SphereGeometry(0.34, 12, 12, 0, Math.PI * 2, 0, 1.2), new THREE.MeshStandardMaterial({ color: 0x1a1a1a }));
  hair.position.y = 1.68;
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.66, 0.78, 0.36), jacket);
  torso.position.y = 1.06;
  const legs = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.72, 0.32), pants);
  legs.position.y = 0.36;
  // Pistol in the right hand.
  const gun = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.14, 0.42), new THREE.MeshStandardMaterial({ color: 0x181818, metalness: 0.6, roughness: 0.4 }));
  gun.position.set(0.42, 1.0, 0.25);
  gun.name = 'pistol';
  head.castShadow = torso.castShadow = true;
  g.add(head, hair, torso, legs, gun);
  return g;
}

class SolmarBayGame {
  constructor() {
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    $('game-canvas').appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 900);
    this.clock = new THREE.Clock();

    const city = buildCity(this.scene);
    this.colliders = city.colliders;
    this.spawnPoints = city.spawnPoints;

    this.audio = new AudioEngine();
    this.hud = new Hud();
    this.particles = new ParticleSystem(this.scene);
    this.tracers = new TracerSystem(this.scene);
    this.traffic = new TrafficManager(this.scene, this.colliders);
    this.peds = new PedestrianManager(this.scene, this.colliders);
    this.police = new PoliceManager(this.scene, this.colliders, this.audio);
    this.combat = new CombatManager(this.scene, this.particles, this.tracers, this.audio);

    this.missions = new MissionManager(this.spawnPoints, {
      onStart: (def) => {
        this.audio.missionStart();
        this.hud.banner(def.name, def.intro, 4200);
        this.hud.showDialogue(def.dialogue);
        this.hud.toast('New mission: ' + def.name);
      },
      onComplete: (def) => {
        this.cash += def.reward;
        this.audio.missionDone();
        this.hud.banner('MISSION COMPLETE', def.name + '  •  +$' + def.reward, 3600);
        this.hud.toast('Earned $' + def.reward + ' — next job unlocked');
        this.updateMissionMarker();
        if (this.missions.done) {
          this.storyDone = true;
          this.hud.banner('STORY COMPLETE', 'You own Solmar Bay now. Free roam — keep the hustle going.', 6000);
        }
        this.save();
      },
      onFail: (def, reason) => {
        this.audio.denied();
        this.hud.banner('MISSION FAILED', reason, 3600);
        this.hud.toast('Press R to retry the mission');
      },
      onDialogue: () => {},
      setWanted: (w) => this.setWanted(w),
      spawnEnemies: (pos, n) => this.combat.spawnEnemies(pos, n),
      clearEnemies: () => this.combat.clearEnemies(),
      getState: () => ({}),
    });

    // Player state.
    this.playerMesh = makePlayerMesh();
    this.scene.add(this.playerMesh);
    this.pos = new THREE.Vector3(0, 0, 24);
    this.heading = Math.PI;
    this.velY = 0;
    this.onGround = true;
    this.health = 100;
    this.cash = GAME.startCash;
    this.wanted = 0;
    this.inCar = null;         // Car instance or null
    this.playerSpeed = 0;
    this.gameClock = 16.5 * 3600; // 16:30, golden hour
    this.started = false;
    this.paused = false;
    this.over = false;
    this.bustedTimer = 0;
    this.camYaw = Math.PI;     // camera orbit offset
    this.camPitch = 0.32;
    this.keys = {};
    this.mouseDown = false;
    this.storyDone = false;
    this.crimeCooldown = 0;
    this.regenTimer = 0;

    // Mission marker beacon (cylinder of light + bobbing diamond).
    this.beacon = new THREE.Group();
    const beam = new THREE.Mesh(
      new THREE.CylinderGeometry(1.6, 2.6, 60, 12, 1, true),
      new THREE.MeshBasicMaterial({ color: 0xffd23e, transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false })
    );
    beam.position.y = 30;
    const diamond = new THREE.Mesh(
      new THREE.OctahedronGeometry(1.1),
      new THREE.MeshBasicMaterial({ color: 0xffd23e })
    );
    diamond.position.y = 9;
    this.beacon.add(beam, diamond);
    this.beacon.visible = false;
    this.scene.add(this.beacon);
    this.beaconDiamond = diamond;

    // Cash pickups scattered along sidewalks (road line +- 10.5), always reachable.
    this.pickups = [];
    const rng = makeRng(2026);
    const pickupGeo = new THREE.BoxGeometry(1.1, 0.7, 0.3);
    for (let i = 0; i < 10; i++) {
      const line = CITY.roadLines[Math.floor(rng() * CITY.roadLines.length)];
      const along = -190 + rng() * 380;
      const side = rng() < 0.5 ? 10.5 : -10.5;
      const horizontal = rng() < 0.5;
      const x = horizontal ? line + side : along;
      const z = horizontal ? along : line + side;
      const m = new THREE.Mesh(pickupGeo, new THREE.MeshStandardMaterial({ color: 0x37d67a, emissive: 0x1a7a3a, emissiveIntensity: 0.8 }));
      m.position.set(THREE.MathUtils.clamp(x, -200, 200), 1, THREE.MathUtils.clamp(z, -200, 220));
      m.castShadow = true;
      this.scene.add(m);
      this.pickups.push({ mesh: m, taken: false, phase: rng() * 6 });
    }

    this.bindInput();
    this.bindMenus();
    this.updateMissionMarker();
    this.hud.setCash(this.cash);
    this.hud.setHealth(this.health);
    this.hud.setWanted(0);
    this.hud.setObjective('Free Roam', 'Start a mission at the Marina — or explore Solmar Bay', '');
    window.__solmar = this; // playtest hook
    this.applyDemoMode();
    this.renderer.setAnimationLoop(() => this.frame());
  }

  // ------------------------------------------------------------ input
  bindInput() {
    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      this.keys[e.code] = true;
      this.audio.ensure();
      if (e.code === 'Escape') { this.togglePause(); return; }
      if (!this.started || this.paused || this.over) return;
      if (e.code === 'KeyE') this.toggleCar();
      if (e.code === 'Space') { if (!this.inCar) this.jump(); e.preventDefault(); }
      if (e.code === 'KeyF') this.punch();
      if (e.code === 'KeyR') this.retryMission();
      if (e.code === 'KeyM') {
        this.audio.setMuted(!this.audio.muted);
        this.hud.toast(this.audio.muted ? 'Sound muted (M to unmute)' : 'Sound on');
      }
    });
    window.addEventListener('keyup', (e) => { this.keys[e.code] = false; });
    const canvas = this.renderer.domElement;
    canvas.addEventListener('mousedown', (e) => {
      this.audio.ensure();
      if (!this.started || this.paused || this.over) return;
      if (e.button === 0) { this.mouseDown = true; this.shoot(); }
      if (document.pointerLockElement !== canvas) canvas.requestPointerLock?.();
    });
    window.addEventListener('mouseup', (e) => { if (e.button === 0) this.mouseDown = false; });
    window.addEventListener('mousemove', (e) => {
      if (document.pointerLockElement === canvas) {
        this.camYaw -= e.movementX * 0.0028;
        this.camPitch = THREE.MathUtils.clamp(this.camPitch + e.movementY * 0.002, 0.08, 0.9);
      }
    });
    window.addEventListener('resize', () => {
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(window.innerWidth, window.innerHeight);
    });
  }

  bindMenus() {
    $('start-btn').addEventListener('click', () => { this.audio.ensure(); this.startGame(false); });
    $('continue-btn').addEventListener('click', () => { this.audio.ensure(); this.startGame(true); });
    $('resume-btn').addEventListener('click', () => this.togglePause());
    $('restart-mission-btn').addEventListener('click', () => { this.togglePause(); this.retryMission(); });
    $('quit-btn').addEventListener('click', () => { this.save(); location.reload(); });
    $('retry-btn').addEventListener('click', () => { this.over = false; $('end-screen').classList.add('hidden'); this.respawn(); });
    $('end-continue-btn').addEventListener('click', () => { this.over = false; $('end-screen').classList.add('hidden'); this.respawn(); });
    if (hasSave()) $('continue-btn').classList.remove('hidden');
  }

  // ------------------------------------------------------------ flow
  startGame(fromSave) {
    $('start-screen').classList.add('hidden');
    this.started = true;
    if (fromSave) {
      const s = loadGame();
      if (s) {
        this.cash = s.cash; this.health = s.health || 100;
        this.pos.set(s.pos[0], 0, s.pos[1]); this.heading = s.heading || 0;
        this.gameClock = s.clock || this.gameClock;
        this.missions.loadState({ index: s.missionIndex });
        this.storyDone = !!s.storyDone;
        this.setWanted(0);
        this.hud.toast('Save loaded — welcome back to Solmar Bay');
      }
    }
    this.updateMissionMarker();
    if (!this.missions.active && !this.missions.done) this.missions.start();
    this.save();
  }

  togglePause() {
    if (!this.started || this.over) return;
    this.paused = !this.paused;
    $('pause-screen').classList.toggle('hidden', !this.paused);
    if (this.paused) this.save();
  }

  retryMission() {
    if (!this.started) return;
    if (this.missions.active || (!this.missions.done && this.missions.stage !== 'idle')) {
      this.missions.retry();
      this.hud.toast('Mission restarted: ' + (this.missions.current?.name || ''));
    } else if (!this.missions.done) {
      this.missions.start();
    }
  }

  respawn() {
    this.health = 100;
    this.pos.set(0, 0, 24);
    this.heading = Math.PI;
    this.setWanted(0);
    this.police.clearAll();
    this.hud.setHealth(100);
    this.save();
  }

  endGame(kind) {
    this.over = true;
    this.audio.busted();
    if (kind === 'busted') {
      this.cash = Math.max(0, this.cash - 200);
      $('end-title').textContent = 'BUSTED';
      $('end-sub').textContent = 'SBPD took you in. Bail cost you $200. The city is still yours — go get it back.';
    } else {
      $('end-title').textContent = 'WASTED';
      $('end-sub').textContent = 'You flatlined on the streets of Solmar Bay. The ambulance bill stings, but the story goes on.';
    }
    $('end-screen').classList.remove('hidden');
    this.save();
  }

  save() {
    saveGame({
      cash: this.cash, missionIndex: this.missions.index, missionActive: this.missions.active,
      health: this.health, wanted: this.wanted, pos: this.pos, heading: this.heading,
      clock: this.gameClock, storyDone: this.storyDone,
    });
  }

  // ------------------------------------------------------------ wanted / crime
  setWanted(w) {
    this.wanted = THREE.MathUtils.clamp(w, 0, GAME.maxWanted);
    this.hud.setWanted(this.wanted);
  }

  addWanted(n, reason) {
    if (this.crimeCooldown > 0) return;
    this.crimeCooldown = 1.2;
    if (this.wanted < GAME.maxWanted) {
      this.setWanted(this.wanted + n);
      if (reason) this.hud.toast(reason + ' — wanted level up!');
    }
  }

  onPoliceContact(kind, pos) {
    if (kind === 'rammed') {
      this.damage(6, pos);
      this.particles.burst(this.pos.clone().setY(1), 0xffcc66, 10, 5);
      this.audio.skid();
    } else if (kind === 'beaten') {
      this.damage(9, pos);
      this.audio.punch();
      this.hud.toast('SBPD officer is beating you down!');
      this.bustedTimer += 1;
      if (this.wanted >= 2 && this.bustedTimer > 2.2) {
        this.bustedTimer = 0;
        this.endGame('busted');
      }
    }
  }

  damage(amount, fromPos) {
    if (this.over) return;
    this.health -= amount;
    this.regenTimer = 0;
    this.hud.setHealth(this.health);
    if (this.health <= 0) {
      this.health = 0;
      this.endGame('wasted');
    }
  }

  // ------------------------------------------------------------ actions
  jump() {
    if (this.onGround) { this.velY = 8.5; this.onGround = false; }
  }

  toggleCar() {
    if (this.inCar) {
      const car = this.inCar;
      this.inCar = null;
      this.pos.copy(car.pos).add(new THREE.Vector3(Math.cos(car.heading) * 2.6, 0, -Math.sin(car.heading) * 2.6));
      this.pos.y = 0;
      this.heading = car.heading;
      this.playerMesh.visible = true;
      this.traffic.parked.push(car);
      this.hud.toast('You left the ' + car.name);
      this.audio.setEngine(0, false);
      return;
    }
    const car = this.traffic.nearestCar(this.pos, 5.5);
    if (!car) { this.hud.toast('No car close enough — walk to a parked car and press E'); return; }
    this.inCar = car;
    this.traffic.parked.splice(this.traffic.parked.indexOf(car), 1);
    this.playerMesh.visible = false;
    car.stolen = true;
    this.addWanted(1, 'Grand theft auto');
    this.hud.toast('You stole the ' + car.name + '!');
    this.audio.pickup();
  }

  shoot() {
    if (this.inCar || this.combat.fireCd > 0 || !this.started || this.paused || this.over) return;
    const origin = this.camera.position.clone();
    const dir = new THREE.Vector3();
    this.camera.getWorldDirection(dir);
    const muzzle = this.pos.clone().setY(1.3);
    const result = this.combat.playerShoot(muzzle, dir, this.peds, this.police);
    if (result.kind === 'ped') {
      this.addWanted(1, 'You shot a pedestrian');
      this.peds.scare(result.point, 40);
    } else if (result.kind === 'police') {
      this.addWanted(1, 'You shot an officer');
    } else if (result.kind === 'enemy') {
      this.peds.scare(result.point, 30);
      if (result.killed) this.hud.toast('Rival down!');
    } else {
      this.peds.scare(this.pos, 25);
    }
  }

  punch() {
    if (this.inCar || !this.started || this.paused || this.over) return;
    const hit = this.combat.playerPunch(this.pos, this.heading, this.peds, this.police);
    if (hit?.kind === 'ped') this.addWanted(1, 'You punched a pedestrian');
    if (hit?.kind === 'police') this.addWanted(1, 'You punched an officer');
    if (hit?.kind === 'enemy' && hit.killed) this.hud.toast('Rival down!');
  }

  updateMissionMarker() {
    const def = this.missions.current;
    const mp = this.missions.markerPosition();
    this.beacon.visible = !!mp && !this.missions.done;
    if (mp) this.beacon.position.set(mp.x, 0, mp.z);
    if (this.missions.done) {
      this.hud.setObjective('Story Complete', 'Free roam — pick up cash, steal cars, dodge SBPD', '');
    } else if (def) {
      const timer = def.timeLimit && this.missions.active ? fmtTime(Math.max(0, this.missions.timer)) : '';
      const objective = def.id === 'turf-war' && this.missions.active
        ? def.objective.replace('(0 left)', `(${this.combat.enemies.length} left)`)
        : def.objective;
      this.hud.setObjective(def.name, (this.missions.active ? objective : def.name + ' — press R to start'), timer);
    }
  }

  // ------------------------------------------------------------ demo modes (screenshots)
  applyDemoMode() {
    const q = new URLSearchParams(location.search);
    const demo = q.get('demo');
    if (!demo || demo === 'start') return; // 'start' leaves the title screen up.
    this.started = true;
    $('start-screen').classList.add('hidden');
    if (demo === 'chase') {
      // Cover shot: driving fast with 3 stars and cruisers in pursuit.
      const car = this.traffic.parked[0];
      this.traffic.parked.splice(0, 1);
      this.inCar = car;
      car.pos.set(-40, 0, 0); car.heading = Math.PI / 2; car.speed = 30;
      car.mesh.children[0].material.color.setHex(0xd23c2e); // bright red cover car
      this.pos.copy(car.pos);
      this.playerMesh.visible = false;
      this.setWanted(3);
      // Cruisers in frame: ahead in the next lane, same direction, in pursuit.
      const c1 = this.police.spawnCarNear(this.pos);
      c1.pos.set(28, 0, -5); c1.heading = Math.PI / 2; c1.speed = 26;
      const c2 = this.police.spawnCarNear(this.pos);
      c2.pos.set(6, 0, 6); c2.heading = Math.PI / 2; c2.speed = 30;
      this.missions.index = 2; this.missions.active = true; this.missions.timer = 62;
      this.updateMissionMarker();
      this.hud.banner('MISSION 3 — SUNSET RUN', 'Deliver the package to the Beach Kiosk', 600);
      this.hud.toast('SBPD is on your tail — lose them!');
    } else if (demo === 'mission') {
      // Shootout at the warehouse, 2 stars, enemies engaged, facing the docks.
      this.missions.index = 4; this.missions.active = true; this.missions.stage = 'go';
      this.pos.set(160, 0, 110); this.heading = 1.17;
      this.camYaw = 1.17; // camera looks at the warehouse with the player
      this.setWanted(2);
      this.combat.spawnEnemies(this.spawnPoints.warehouse, 6, 12);
      this.police.spawnOfficerNear(this.pos);
      this.updateMissionMarker();
      this.hud.banner('MISSION 5 — TURF WAR', 'Clear the Warehouse of Red Tide rivals', 600);
      this.hud.showDialogue(['RICO: "They took my warehouse. Take it back."']);
    } else if (demo === 'city') {
      this.pos.set(0, 0, 30); this.heading = Math.PI;
      this.missions.index = 0;
      this.updateMissionMarker();
      this.hud.toast('Welcome to Solmar Bay — free roam');
    }
    // 'start' leaves the title screen up.
    this.hud.setCash(this.cash);
  }

  // ------------------------------------------------------------ frame
  frame() {
    const dt = Math.min(this.clock.getDelta(), 0.05);
    if (this.started && !this.paused && !this.over) this.update(dt);
    this.particles.update(dt);
    this.tracers.update(dt);
    this.updateCamera(dt);
    this.hud.update(dt);
    this.renderer.render(this.scene, this.camera);
  }

  update(dt) {
    this.gameClock = (this.gameClock + dt * 12) % 86400;
    this.crimeCooldown = Math.max(0, this.crimeCooldown - dt);
    this.hud.setClock(fmtClock(this.gameClock));

    const k = this.keys;
    if (this.inCar) {
      const car = this.inCar;
      const input = {
        throttle: !!(k.KeyW || k.ArrowUp),
        brake: !!(k.KeyS || k.ArrowDown),
        steer: (k.KeyA || k.ArrowLeft ? 1 : 0) - (k.KeyD || k.ArrowRight ? 1 : 0),
        handbrake: !!k.Space,
      };
      const boost = k.ShiftLeft || k.ShiftRight;
      car.drive(input, dt, this.colliders, boost ? 52 : GAME.carTopSpeed);
      this.pos.copy(car.pos);
      this.heading = car.heading;
      this.playerSpeed = Math.abs(car.speed);
      this.audio.setEngine(this.playerSpeed / 52, true);
      if (car.skidding && Math.random() < dt * 20) {
        this.audio.skid();
        this.particles.burst(car.pos.clone().setY(0.3), 0xcccccc, 2, 2, 1);
      }
      // Hit a pedestrian while driving?
      for (const p of this.peds.near(this.pos, 2.6)) {
        if (this.playerSpeed > 6) {
          this.peds.scare(this.pos, 30);
          this.addWanted(1, 'You hit a pedestrian');
          this.particles.burst(p.pos.clone().setY(1), 0xffcc66, 12, 5);
          this.damage(0, this.pos);
          p.pos.x += Math.sin(this.heading) * 4; p.pos.z += Math.cos(this.heading) * 4;
        }
      }
      // Bump traffic cars.
      for (const c of this.traffic.cars) {
        if (c.mesh.position.distanceTo(this.pos) < 3.4) {
          car.speed *= 0.6;
          this.particles.burst(this.pos.clone().setY(1), 0xffaa33, 6, 4);
          this.audio.noiseBurst(0.12, 0.3, 1200);
          c.along += c.dir * 2;
        }
      }
    } else {
      // On foot.
      const sprint = k.ShiftLeft || k.ShiftRight;
      const speed = sprint ? GAME.runSpeed : GAME.walkSpeed;
      let mx = 0, mz = 0;
      const fwdX = Math.sin(this.camYaw), fwdZ = Math.cos(this.camYaw);
      const rightX = Math.cos(this.camYaw), rightZ = -Math.sin(this.camYaw);
      if (k.KeyW || k.ArrowUp) { mx += fwdX; mz += fwdZ; }
      if (k.KeyS || k.ArrowDown) { mx -= fwdX; mz -= fwdZ; }
      if (k.KeyA || k.ArrowLeft) { mx -= rightX; mz -= rightZ; }
      if (k.KeyD || k.ArrowRight) { mx += rightX; mz += rightZ; }
      const len = Math.hypot(mx, mz);
      this.playerSpeed = 0;
      if (len > 0) {
        mx /= len; mz /= len;
        this.pos.x += mx * speed * dt;
        this.pos.z += mz * speed * dt;
        this.playerSpeed = speed;
        const targetHeading = Math.atan2(mx, mz);
        this.heading = lerpAngle(this.heading, targetHeading, Math.min(1, dt * 12));
        this.playerMesh.position.y = Math.abs(Math.sin(performance.now() / 90)) * 0.06;
      } else {
        this.playerMesh.position.y = 0;
      }
      // Gravity / jump.
      this.velY -= 22 * dt;
      this.pos.y += this.velY * dt;
      if (this.pos.y <= 0) { this.pos.y = 0; this.velY = 0; this.onGround = true; }
      clampCity(this.pos, 3);
      resolveCollisions(this.pos, 0.55, this.colliders);
      this.audio.setEngine(0, false);
      // Health regen when calm.
      if (this.wanted === 0 && this.health < 100) {
        this.regenTimer += dt;
        if (this.regenTimer > 2) { this.health = Math.min(100, this.health + dt * 4); this.hud.setHealth(this.health); }
      }
    }

    // Player mesh transform.
    this.playerMesh.position.set(this.pos.x, this.pos.y, this.pos.z);
    this.playerMesh.rotation.y = this.heading;

    // World systems.
    this.traffic.update(dt, this.pos, this.inCar);
    this.peds.update(dt, this.pos, this.playerSpeed);
    const nearestPolice = this.police.update(dt, this.pos, this.playerSpeed, this.wanted, !this.inCar,
      (kind, p) => this.onPoliceContact(kind, p));
    this.audio.updateSiren(dt, nearestPolice);
    this.police.decay(dt, this.wanted, this.playerSpeed, false, (w) => this.setWanted(w));
    this.combat.update(dt, this.pos, !this.over, (dmg, from) => this.damage(dmg, from));

    // Pickups.
    for (const p of this.pickups) {
      if (p.taken) continue;
      p.mesh.rotation.y += dt * 2;
      p.mesh.position.y = 1 + Math.sin(performance.now() / 300 + p.phase) * 0.25;
      if (this.pos.distanceTo(p.mesh.position) < 2.4) {
        p.taken = true;
        p.mesh.visible = false;
        this.cash += 100;
        this.hud.setCash(this.cash);
        this.audio.pickup();
        this.hud.toast('Found $100 stashed cash!');
        this.particles.burst(p.mesh.position, 0x37d67a, 14, 5);
      }
    }

    // Missions.
    this.missions.update(dt, {
      pos: this.pos, inCar: !!this.inCar, wanted: this.wanted,
      enemiesLeft: this.combat.enemies.length,
    });
    if (this.missions.active || this.missions.stage === 'done') this.updateMissionMarker();

    // Beacon bob + spin.
    if (this.beacon.visible) {
      this.beaconDiamond.rotation.y += dt * 2;
      this.beaconDiamond.position.y = 9 + Math.sin(performance.now() / 300) * 0.8;
    }

    // HUD.
    this.hud.setSpeed(this.inCar ? this.inCar.speed * 3.6 : 0, !!this.inCar);
    this.hud.setCash(this.cash);
    this.hud.showCrosshair(!this.inCar && this.started && !this.paused);
    this.hud.drawMinimap({
      player: this.pos,
      heading: this.heading,
      cars: this.traffic.allCarPositions(),
      police: this.police.cars.map((c) => c.pos).concat(this.police.officers.map((o) => o.pos)),
      peds: this.peds.peds.map((p) => p.pos),
      marker: this.beacon.visible ? this.beacon.position : null,
    });

    // Autosave every ~20s while playing.
    this._saveTimer = (this._saveTimer || 0) + dt;
    if (this._saveTimer > 20) { this._saveTimer = 0; this.save(); }
  }

  updateCamera(dt) {
    const target = this.inCar ? this.inCar.pos : this.pos;
    const dist = this.inCar ? 8.5 : 8.5;
    const height = this.inCar ? 3.2 : 3.4;
    // Camera yaw follows the player heading, plus the mouse orbit offset.
    const yaw = this.inCar ? this.heading : this.camYaw;
    const cx = target.x - Math.sin(yaw) * dist;
    const cz = target.z - Math.cos(yaw) * dist;
    const desired = new THREE.Vector3(cx, target.y + height, cz);
    this.camera.position.lerp(desired, Math.min(1, dt * 5));
    this.camera.lookAt(target.x + Math.sin(yaw) * 4, target.y + 1.6, target.z + Math.cos(yaw) * 4);
  }
}

new SolmarBayGame();
