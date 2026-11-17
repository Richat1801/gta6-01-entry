// Solmar Bay: wanted level + police. One job: track stars, spawn cruisers and
// officers that chase the player, and arrest (BUSTED) when an officer holds on.

import * as THREE from 'three';
import { WANTED, clamp, dist2, angleLerp, rand } from './config.js';
import { createCarMesh } from './vehicles.js';

function makeOfficerMesh() {
  const g = new THREE.Group();
  const navy = new THREE.MeshLambertMaterial({ color: 0x1b2a4a });
  const legs = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.8, 0.2), navy);
  legs.position.y = 0.4;
  g.add(legs);
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.62, 0.28), navy);
  torso.position.y = 1.11;
  torso.castShadow = true;
  g.add(torso);
  const vest = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.3, 0.3), new THREE.MeshLambertMaterial({ color: 0x111111 }));
  vest.position.y = 1.15;
  g.add(vest);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.19, 10, 8), new THREE.MeshLambertMaterial({ color: 0xe0ac69 }));
  head.position.y = 1.62;
  g.add(head);
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.21, 0.21, 0.1, 10), new THREE.MeshLambertMaterial({ color: 0x0d1b2e }));
  cap.position.y = 1.78;
  g.add(cap);
  return g;
}

export class PoliceSystem {
  constructor(scene, colliders, callbacks) {
    this.scene = scene;
    this.colliders = colliders;
    this.cb = callbacks; // { onBusted, onDamage, onToast }
    this.stars = 0;
    this.quietTimer = 0;
    this.cruisers = [];
    this.officers = [];
    this.spawnTimer = 0;
    this._flash = 0;
  }

  addStars(n, reason) {
    if (n <= 0) return;
    const before = this.stars;
    this.stars = clamp(this.stars + n, 0, WANTED.maxStars);
    this.quietTimer = 0;
    if (this.stars > before && this.cb.onToast) {
      this.cb.onToast('WANTED: ' + this.stars + ' star' + (this.stars > 1 ? 's' : '') + ' — ' + reason);
    }
  }

  clearWanted() {
    this.stars = 0;
    this.quietTimer = 0;
    for (const c of this.cruisers) this.scene.remove(c.mesh);
    for (const o of this.officers) this.scene.remove(o.mesh);
    this.cruisers = [];
    this.officers = [];
  }

  wantedCruiserCount() {
    return this.stars === 0 ? 0 : Math.min(1 + this.stars, 4);
  }

  wantedOfficerCount() {
    return this.stars >= 2 ? Math.min(this.stars, 4) : 0;
  }

  _spawnCruiserNear(x, z) {
    const mesh = createCarMesh('cruiser', 0xf2f3f4, true);
    const angle = rand(0, Math.PI * 2);
    mesh.position.set(x + Math.sin(angle) * 70, 0, z + Math.cos(angle) * 70);
    mesh.rotation.y = angle;
    this.scene.add(mesh);
    this.cruisers.push({ mesh, yaw: angle, speed: 0, sirenPhase: rand(0, 1) });
  }

  _spawnOfficerNear(x, z) {
    const mesh = makeOfficerMesh();
    const angle = rand(0, Math.PI * 2);
    mesh.position.set(x + Math.sin(angle) * 22, 0, z + Math.cos(angle) * 22);
    this.scene.add(mesh);
    this.officers.push({ mesh, arrestTimer: 0, walkPhase: rand(0, Math.PI * 2) });
  }

  update(dt, player, playerInCar, time) {
    // Wanted decay when the player stays quiet and out of sight.
    if (this.stars > 0) {
      const nearestPolice = this._nearestPoliceDist(player);
      if (nearestPolice > 45) {
        this.quietTimer += dt;
        if (this.quietTimer >= WANTED.decaySeconds) {
          this.stars--;
          this.quietTimer = 0;
          if (this.cb.onToast) this.cb.onToast(this.stars === 0 ? 'You lost the heat.' : 'Heat cooling off: ' + this.stars + ' stars.');
        }
      } else {
        this.quietTimer = 0;
      }
    }

    // Keep the right number of cruisers / officers on the street.
    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0) {
      this.spawnTimer = 1.2;
      while (this.cruisers.length < this.wantedCruiserCount()) this._spawnCruiserNear(player.x, player.z);
      while (this.cruisers.length > this.wantedCruiserCount()) {
        const c = this.cruisers.pop();
        this.scene.remove(c.mesh);
      }
      while (this.officers.length < this.wantedOfficerCount()) this._spawnOfficerNear(player.x, player.z);
      while (this.officers.length > this.wantedOfficerCount()) {
        const o = this.officers.pop();
        this.scene.remove(o.mesh);
      }
    }

    // Cruisers chase: steer toward the player, ram when close.
    this._flash += dt;
    const flashOn = Math.floor(this._flash * 6) % 2 === 0;
    for (const c of this.cruisers) {
      const dx = player.x - c.mesh.position.x;
      const dz = player.z - c.mesh.position.z;
      const d = Math.max(0.01, Math.hypot(dx, dz));
      const targetYaw = Math.atan2(dx, dz);
      c.yaw = angleLerp(c.yaw, targetYaw, clamp(dt * 1.6, 0, 1));
      c.mesh.rotation.y = c.yaw;
      const wantSpeed = this.stars >= 3 ? 30 : 24;
      c.speed = THREE.MathUtils.lerp(c.speed, d > 6 ? wantSpeed : 8, clamp(dt * 1.2, 0, 1));
      c.mesh.position.x += Math.sin(c.yaw) * c.speed * dt;
      c.mesh.position.z += Math.cos(c.yaw) * c.speed * dt;
      if (c.mesh.userData.lightRed) {
        c.mesh.userData.lightRed.visible = flashOn;
        c.mesh.userData.lightBlue.visible = !flashOn;
      }
      for (const w of c.mesh.userData.wheels) w.rotation.x += c.speed * dt * 2.2;
      // Ram the player: damage + shove.
      if (d < 3.2) {
        if (playerInCar) {
          if (this.cb.onDamage) this.cb.onDamage(20 * dt, 'rammed by a cruiser');
        } else if (this.cb.onDamage) {
          this.cb.onDamage(45 * dt, 'hit by a cruiser');
        }
      }
    }

    // Officers chase on foot and arrest when they hold the player.
    for (const o of this.officers) {
      const dx = player.x - o.mesh.position.x;
      const dz = player.z - o.mesh.position.z;
      const d = Math.max(0.01, Math.hypot(dx, dz));
      const speed = playerInCar ? 0 : 6.4; // officers cannot catch a car
      o.mesh.position.x += (dx / d) * speed * dt;
      o.mesh.position.z += (dz / d) * speed * dt;
      o.walkPhase += dt * 9;
      o.mesh.position.y = Math.abs(Math.sin(o.walkPhase)) * 0.05;
      o.mesh.rotation.y = Math.atan2(dx, dz);
      if (!playerInCar && d < 1.8) {
        o.arrestTimer += dt;
        if (o.arrestTimer > 1.4 && this.cb.onBusted) {
          this.cb.onBusted('The Solmar Bay PD caught up with you.');
        }
      } else {
        o.arrestTimer = Math.max(0, o.arrestTimer - dt * 2);
      }
    }
  }

  _nearestPoliceDist(player) {
    let best = Infinity;
    for (const c of this.cruisers) best = Math.min(best, dist2(player.x, player.z, c.mesh.position.x, c.mesh.position.z));
    for (const o of this.officers) best = Math.min(best, dist2(player.x, player.z, o.mesh.position.x, o.mesh.position.z));
    return best;
  }

  sirenActive() {
    return this.stars > 0 && this.cruisers.length > 0;
  }
}
