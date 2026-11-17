// Solmar Bay — wanted system and police: cruisers chase, officers arrest.
// One job: turn crimes into heat, and heat into a chase that can end busted.

import * as THREE from 'three';
import { WORLD, clamp, angleLerp, mulberry32 } from './config.js';
import { makeCar, updateCarVisual } from './vehicles.js';

export class PoliceSystem {
  constructor(scene, audio) {
    this.scene = scene;
    this.audio = audio;
    this.wanted = 0;
    this.crimeTimer = 0;   // time since the last crime
    this.decayTimer = 0;   // counts down to losing one star while hidden
    this.cruisers = [];
    this.officers = [];
    this.rng = mulberry32(999);
    this.arrestTimer = 0;
    this.flashT = 0;
  }

  addWanted(n) {
    this.wanted = clamp(this.wanted + n, 0, 5);
    this.crimeTimer = 0;
    this.decayTimer = 0;
    this.syncCruisers();
  }

  setWanted(n) {
    this.wanted = clamp(n, 0, 5);
    this.crimeTimer = 0;
    this.decayTimer = 0;
    this.syncCruisers();
  }

  // Cruisers on the street = wanted level (capped at 4). Officers appear at 2+.
  syncCruisers() {
    const wantCruisers = Math.min(this.wanted, 4);
    while (this.cruisers.length < wantCruisers) {
      const c = this.spawnCruiser();
      if (c) this.cruisers.push(c);
    }
    while (this.cruisers.length > wantCruisers) {
      const c = this.cruisers.pop();
      this.scene.remove(c.group);
    }
    const wantOfficers = this.wanted >= 2 ? Math.min(this.wanted - 1, 3) : 0;
    while (this.officers.length < wantOfficers) {
      const o = this.spawnOfficer();
      if (o) this.officers.push(o);
    }
    while (this.officers.length > wantOfficers) {
      const o = this.officers.pop();
      this.scene.remove(o.mesh);
    }
  }

  spawnPointNear(playerPos, minDist) {
    for (let tries = 0; tries < 12; tries++) {
      const a = this.rng() * Math.PI * 2;
      const d = minDist + this.rng() * 30;
      const x = clamp(playerPos.x + Math.cos(a) * d, -WORLD.half + 10, WORLD.half - 10);
      const z = clamp(playerPos.z + Math.sin(a) * d, -WORLD.half + 10, WORLD.half - 10);
      if (Math.hypot(x - playerPos.x, z - playerPos.z) >= minDist) return { x, z };
    }
    return { x: playerPos.x + minDist, z: playerPos.z };
  }

  spawnCruiser() {
    const p = this.playerPosRef ? this.playerPosRef() : { x: 0, z: 0 };
    const s = this.spawnPointNear(p, 45);
    const yaw = Math.atan2(p.x - s.x, p.z - s.z);
    const car = makeCar(this.scene, s.x, s.z, yaw, 0xf2f2f2, 'Police Cruiser', { police: true });
    car.speed = 0;
    car.chase = true;
    return car;
  }

  spawnOfficer() {
    const p = this.playerPosRef ? this.playerPosRef() : { x: 0, z: 0 };
    const s = this.spawnPointNear(p, 25);
    const g = new THREE.Group();
    const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.32, 0.55, 4, 8),
      new THREE.MeshStandardMaterial({ color: 0x1a2a4a, roughness: 0.9 }));
    torso.position.y = 1.05; torso.castShadow = true;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.24, 10, 8),
      new THREE.MeshStandardMaterial({ color: 0xe8b98a, roughness: 0.8 }));
    head.position.y = 1.75;
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.26, 0.12, 10),
      new THREE.MeshStandardMaterial({ color: 0x101828 }));
    cap.position.y = 1.95;
    g.add(torso); g.add(head); g.add(cap);
    g.position.set(s.x, 0, s.z);
    this.scene.add(g);
    return { mesh: g, pos: g.position, yaw: 0, speed: 5.2 };
  }

  // playerPos: {x,z}; playerInCar: bool; onBusted: callback.
  update(dt, playerPos, playerInCar, onBusted) {
    this.crimeTimer += dt;
    // Wanted decay: hidden (no cruiser within 40m) and quiet for 12s.
    if (this.wanted > 0) {
      let nearest = 1e9;
      for (const c of this.cruisers) nearest = Math.min(nearest, Math.hypot(c.pos.x - playerPos.x, c.pos.z - playerPos.z));
      for (const o of this.officers) nearest = Math.min(nearest, Math.hypot(o.pos.x - playerPos.x, o.pos.z - playerPos.z));
      if (this.crimeTimer > 12 && nearest > 40) {
        this.decayTimer += dt;
        if (this.decayTimer > 8) {
          this.decayTimer = 0;
          this.wanted = Math.max(0, this.wanted - 1);
          this.syncCruisers();
        }
      } else {
        this.decayTimer = 0;
      }
    }

    // Cruisers chase: steer toward the player, ram speed scales with stars.
    // A pacer cruiser (screenshot staging) just holds its lane and speed.
    const chaseSpeed = 16 + this.wanted * 3.2;
    for (const c of this.cruisers) {
      if (c.pacer) {
        c.pos.x += Math.sin(c.yaw) * c.speed * dt;
        c.pos.z += Math.cos(c.yaw) * c.speed * dt;
        updateCarVisual(c);
        continue;
      }
      const dx = playerPos.x - c.pos.x, dz = playerPos.z - c.pos.z;
      const d = Math.hypot(dx, dz);
      const targetYaw = Math.atan2(dx, dz);
      c.yaw = angleLerp(c.yaw, targetYaw, Math.min(1, dt * 2.2));
      c.speed = Math.min(chaseSpeed, c.speed + 12 * dt);
      if (d > 3.2) {
        c.pos.x += Math.sin(c.yaw) * c.speed * dt;
        c.pos.z += Math.cos(c.yaw) * c.speed * dt;
      } else {
        c.speed *= 0.9;
      }
      c.pos.x = clamp(c.pos.x, -WORLD.half - 10, WORLD.half + 10);
      c.pos.z = clamp(c.pos.z, -WORLD.half - 10, WORLD.half + 10);
      updateCarVisual(c);
    }
    // Light-bar flash.
    this.flashT += dt;
    const flash = Math.sin(this.flashT * 14) > 0;
    for (const c of this.cruisers) {
      if (c.group.userData.lightRed) c.group.userData.lightRed.material.emissiveIntensity = flash ? 2.2 : 0.25;
      if (c.group.userData.lightBlue) c.group.userData.lightBlue.material.emissiveIntensity = flash ? 0.25 : 2.2;
    }
    this.audio.setSiren(this.cruisers.length > 0);

    // Officers run the player down on foot and arrest at close range.
    let arresting = false;
    for (const o of this.officers) {
      const dx = playerPos.x - o.pos.x, dz = playerPos.z - o.pos.z;
      const d = Math.hypot(dx, dz);
      o.yaw = Math.atan2(dx, dz);
      if (d > 2.2) {
        o.pos.x += (dx / d) * o.speed * dt;
        o.pos.z += (dz / d) * o.speed * dt;
      }
      o.mesh.rotation.y = o.yaw;
      if (d < 2.6 && !playerInCar) arresting = true;
    }
    if (arresting) {
      this.arrestTimer += dt;
      if (this.arrestTimer > 2.0) {
        this.arrestTimer = 0;
        onBusted();
      }
    } else {
      this.arrestTimer = 0;
    }
  }

  clearAll() {
    for (const c of this.cruisers) this.scene.remove(c.group);
    for (const o of this.officers) this.scene.remove(o.mesh);
    this.cruisers = [];
    this.officers = [];
    this.wanted = 0;
    this.audio.setSiren(false);
  }

  allCruisers() { return this.cruisers; }
  allOfficers() { return this.officers; }
}
