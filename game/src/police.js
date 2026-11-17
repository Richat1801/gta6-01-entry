// Police and the wanted system: 1–5 stars, cruisers that chase and ram,
// officers on foot who run the player down and make the arrest (BUSTED).
// Wanted rises on crimes and decays when the player stays hidden and quiet.

import * as THREE from 'three';
import { CONFIG, clamp, rand, distance2D, angleLerp } from './config.js';
import { buildCarMesh } from './vehicles.js';

const POLICE_MODEL = { name: 'Intercept Cruiser', length: 4.8, width: 2.0, height: 0.72, cabin: 0.6, sporty: false };

export class PoliceForce {
  constructor(scene) {
    this.scene = scene;
    this.cruisers = [];
    this.officers = [];
    this.sirenPhase = 0;
    this.arrestTimer = 0;
    this.lightMatA = new THREE.MeshStandardMaterial({ color: 0xff2020, emissive: 0xff1010, emissiveIntensity: 2 });
    this.lightMatB = new THREE.MeshStandardMaterial({ color: 0x2040ff, emissive: 0x1020ff, emissiveIntensity: 2 });
  }

  wantedCount() {
    return this.cruisers.length + this.officers.length;
  }

  // Keep the number of active units proportional to the wanted level.
  syncToWanted(wanted, playerX, playerZ) {
    const wantCruisers = wanted === 0 ? 0 : Math.min(1 + Math.floor(wanted / 2), 4);
    const wantOfficers = wanted >= 2 ? Math.min(wanted - 1, 3) : 0;
    while (this.cruisers.length < wantCruisers) {
      this.spawnCruiser(playerX, playerZ);
    }
    while (this.cruisers.length > wantCruisers) {
      const c = this.cruisers.pop();
      this.scene.remove(c.mesh);
    }
    while (this.officers.length < wantOfficers) {
      this.spawnOfficer(playerX, playerZ);
    }
    while (this.officers.length > wantOfficers) {
      const o = this.officers.pop();
      this.scene.remove(o.mesh);
    }
  }

  spawnCruiser(px, pz) {
    const car = buildCarMesh(POLICE_MODEL, 0x14181d);
    // Light bar on the roof: alternating red/blue beacons.
    const bar = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.16, 0.4),
      new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.5 }));
    bar.position.set(0, 1.55, 0);
    car.add(bar);
    const beaconR = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.14, 0.42), this.lightMatA);
    beaconR.position.set(-0.28, 1.66, 0);
    car.add(beaconR);
    const beaconB = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.14, 0.42), this.lightMatB);
    beaconB.position.set(0.28, 1.66, 0);
    car.add(beaconB);
    const angle = rand(0, Math.PI * 2);
    const dist = rand(38, 55);
    car.position.set(px + Math.cos(angle) * dist, 0, pz + Math.sin(angle) * dist);
    const heading = Math.atan2(px - car.position.x, pz - car.position.z);
    car.rotation.y = heading;
    this.scene.add(car);
    this.cruisers.push({
      mesh: car, heading, speed: 0, beaconR, beaconB,
      ramCooldown: 0, sirenOn: true,
    });
  }

  spawnOfficer(px, pz) {
    const group = new THREE.Group();
    const navy = new THREE.MeshStandardMaterial({ color: 0x1a2a4a, roughness: 0.85 });
    const skin = new THREE.MeshStandardMaterial({ color: 0xd9a066, roughness: 0.8 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.8, 0.34), navy);
    body.position.y = 1.05;
    group.add(body);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 8), skin);
    head.position.y = 1.62;
    group.add(head);
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.23, 0.24, 0.1, 10), navy);
    cap.position.y = 1.8;
    group.add(cap);
    const legL = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.65, 0.22), navy);
    legL.position.set(-0.14, 0.33, 0);
    group.add(legL);
    const legR = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.65, 0.22), navy);
    legR.position.set(0.14, 0.33, 0);
    group.add(legR);
    const angle = rand(0, Math.PI * 2);
    const dist = rand(18, 30);
    group.position.set(px + Math.cos(angle) * dist, 0, pz + Math.sin(angle) * dist);
    this.scene.add(group);
    this.officers.push({ mesh: group, legL, legR, phase: rand(0, 6), speed: rand(5.4, 6.4) });
  }

  // Chase the player; cruisers ram, officers close in for the arrest.
  // Returns 'busted' when an officer holds the player long enough.
  update(dt, wanted, playerX, playerZ, playerInCar, playerSpeed, onArrestTick) {
    this.sirenPhase += dt;
    const flash = Math.sin(this.sirenPhase * 9) > 0;
    for (const c of this.cruisers) {
      c.beaconR.material.emissiveIntensity = flash ? 3 : 0.15;
      c.beaconB.material.emissiveIntensity = flash ? 0.15 : 3;
      const dx = playerX - c.mesh.position.x;
      const dz = playerZ - c.mesh.position.z;
      const dist = Math.hypot(dx, dz);
      const desired = Math.atan2(dx, dz);
      c.heading = angleLerp(c.heading, desired, Math.min(1, dt * 2.2));
      const targetSpeed = dist > 60 ? 34 : dist > 18 ? 26 : 15;
      c.speed += clamp(targetSpeed - c.speed, -30 * dt, 18 * dt);
      const step = c.speed * dt;
      let nx = c.mesh.position.x + Math.sin(c.heading) * step;
      let nz = c.mesh.position.z + Math.cos(c.heading) * step;
      nx = clamp(nx, -CONFIG.cityHalf - 8, CONFIG.beachEnd - 4);
      nz = clamp(nz, -CONFIG.cityHalf - 8, CONFIG.cityHalf + 8);
      c.mesh.position.set(nx, 0, nz);
      c.mesh.rotation.y = c.heading;
      for (const w of c.mesh.userData.wheels) w.rotation.x += (c.speed * dt) / 0.36;
      // Ram: slow the player's car on contact, or shove the player on foot.
      if (dist < 3.4 && c.ramCooldown <= 0) {
        c.ramCooldown = 1.2;
        c.speed *= 0.4;
        if (onArrestTick) onArrestTick('ram');
      }
      c.ramCooldown -= dt;
    }
    let officerNear = false;
    for (const o of this.officers) {
      const dx = playerX - o.mesh.position.x;
      const dz = playerZ - o.mesh.position.z;
      const dist = Math.hypot(dx, dz);
      const desired = Math.atan2(dx, dz);
      o.mesh.rotation.y = desired;
      const step = o.speed * dt;
      if (dist > 1.6) {
        o.mesh.position.x += Math.sin(desired) * step;
        o.mesh.position.z += Math.cos(desired) * step;
      }
      o.phase += dt * o.speed * 2.4;
      const swing = Math.sin(o.phase) * 0.6;
      o.legL.rotation.x = swing;
      o.legR.rotation.x = -swing;
      if (dist < 2.4 && !playerInCar) officerNear = true;
    }
    if (officerNear) {
      this.arrestTimer += dt;
      if (this.arrestTimer > 1.6) {
        this.arrestTimer = 0;
        return 'busted';
      }
    } else {
      this.arrestTimer = Math.max(0, this.arrestTimer - dt * 2);
    }
    return null;
  }

  clearAll() {
    for (const c of this.cruisers) this.scene.remove(c.mesh);
    for (const o of this.officers) this.scene.remove(o.mesh);
    this.cruisers = [];
    this.officers = [];
    this.arrestTimer = 0;
  }
}

// Wanted-level bookkeeping: crimes add stars, quiet time sheds them.
export class WantedSystem {
  constructor() {
    this.stars = 0;
    this.quietTimer = 0;
    this.decayTimer = 0;
  }

  addCrime(stars, reason) {
    this.stars = clamp(this.stars + stars, 0, CONFIG.maxWanted);
    this.quietTimer = 0;
    this.decayTimer = 0;
    return { stars: this.stars, reason };
  }

  setStars(n) {
    this.stars = clamp(n, 0, CONFIG.maxWanted);
    this.quietTimer = 0;
    this.decayTimer = 0;
  }

  update(dt, policeNear) {
    if (this.stars === 0) return;
    if (policeNear) {
      this.quietTimer = 0;
      this.decayTimer = 0;
      return;
    }
    this.quietTimer += dt;
    if (this.quietTimer > CONFIG.wantedDecayDelay) {
      this.decayTimer += dt;
      if (this.decayTimer > CONFIG.wantedDecayStep) {
        this.decayTimer = 0;
        this.stars -= 1;
      }
    }
  }
}
