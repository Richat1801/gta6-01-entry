// Solmar Bay — combat: pistol, punch, rival-gang AI that shoots back.
// One job: shooting, melee, enemy health and the gang shootouts missions use.

import * as THREE from 'three';
import { clamp, mulberry32, pick } from './config.js';

function makeRivalMesh(isBoss) {
  const g = new THREE.Group();
  const shirt = isBoss ? 0x8a1a1a : 0x3a3a4a;
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(isBoss ? 0.4 : 0.32, 0.6, 4, 8),
    new THREE.MeshStandardMaterial({ color: shirt, roughness: 0.9 }));
  torso.position.y = 1.05; torso.castShadow = true;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.24, 10, 8),
    new THREE.MeshStandardMaterial({ color: 0xc98a5a, roughness: 0.8 }));
  head.position.y = 1.78;
  const gun = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.5),
    new THREE.MeshStandardMaterial({ color: 0x181818, roughness: 0.4, metalness: 0.6 }));
  gun.position.set(0.35, 1.15, 0.4);
  // Health bar above the head: green box that shrinks with damage.
  const barBg = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.12, 0.02),
    new THREE.MeshBasicMaterial({ color: 0x222222 }));
  barBg.position.y = 2.25;
  const bar = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.08, 0.03),
    new THREE.MeshBasicMaterial({ color: isBoss ? 0xff3030 : 0x40d040 }));
  bar.position.y = 2.25;
  g.add(torso); g.add(head); g.add(gun); g.add(barBg); g.add(bar);
  g.userData.bar = bar;
  g.userData.barBg = barBg;
  return g;
}

export class CombatSystem {
  constructor(scene, audio) {
    this.scene = scene;
    this.audio = audio;
    this.ammo = 12;
    this.ammoMax = 12;
    this.reloadTimer = 0;
    this.shootCooldown = 0;
    this.punchCooldown = 0;
    this.rivals = [];
    this.raycaster = new THREE.Raycaster();
    this.tracers = [];
    this.rng = mulberry32(2026);
    this.onRivalDown = null; // callback(rival) for missions
  }

  spawnRivals(count, cx, cz, isBossFight) {
    const made = [];
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2 + this.rng() * 0.8;
      const r = 16 + this.rng() * 8;
      const x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
      const isBoss = isBossFight && i === 0;
      const mesh = makeRivalMesh(isBoss);
      mesh.position.set(x, 0, z);
      this.scene.add(mesh);
      const rival = {
        mesh, pos: mesh.position, yaw: 0,
        health: isBoss ? 220 : 60,
        maxHealth: isBoss ? 220 : 60,
        isBoss,
        name: isBoss ? 'Marlo Kane' : pick(this.rng, ['Dagger', 'Rook', 'Vex', 'Hondo', 'Sable']),
        shootTimer: 1 + this.rng() * 1.5,
        moveTimer: 0,
        alive: true,
      };
      this.rivals.push(rival);
      made.push(rival);
    }
    return made;
  }

  livingRivals() { return this.rivals.filter((r) => r.alive); }

  clearRivals() {
    for (const r of this.rivals) this.scene.remove(r.mesh);
    this.rivals = [];
  }

  addTracer(from, to, color) {
    const geo = new THREE.BufferGeometry().setFromPoints([from.clone(), to.clone()]);
    const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: color || 0xffe9a0, transparent: true, opacity: 0.9 }));
    this.scene.add(line);
    this.tracers.push({ line, life: 0.12 });
  }

  // Player fires the pistol from `origin` along `dir`. Returns the rival hit, if any.
  shoot(origin, dir, damagePlayer) {
    if (this.shootCooldown > 0 || this.reloadTimer > 0) return null;
    if (this.ammo <= 0) { this.startReload(); return null; }
    this.shootCooldown = 0.22;
    this.ammo -= 1;
    this.audio.shot();
    const targets = this.livingRivals().map((r) => r.mesh);
    this.raycaster.set(origin, dir);
    this.raycaster.far = 80;
    const hits = this.raycaster.intersectObjects(targets, true);
    const end = origin.clone().add(dir.clone().multiplyScalar(80));
    if (hits.length > 0) {
      const hit = hits[0];
      end.copy(hit.point);
      let rival = null;
      for (const r of this.livingRivals()) {
        if (r.mesh === hit.object || r.mesh.children.includes(hit.object) || hit.object.parent === r.mesh) { rival = r; break; }
      }
      if (!rival) {
        // Walk up the parent chain to find the rival group.
        let o = hit.object;
        while (o && !rival) {
          for (const r of this.livingRivals()) if (r.mesh === o) { rival = r; break; }
          o = o.parent;
        }
      }
      if (rival) {
        this.damageRival(rival, 34);
        this.addTracer(origin, end, 0xffd070);
        return rival;
      }
    }
    this.addTracer(origin, end, 0xfff2b0);
    return null;
  }

  damageRival(rival, dmg) {
    if (!rival.alive) return;
    rival.health -= dmg;
    const frac = clamp(rival.health / rival.maxHealth, 0, 1);
    rival.mesh.userData.bar.scale.x = Math.max(0.01, frac);
    rival.mesh.userData.bar.position.x = -(1 - frac) * 0.5;
    if (rival.health <= 0) {
      rival.alive = false;
      rival.mesh.rotation.z = Math.PI / 2;
      rival.mesh.position.y = 0.4;
      rival.mesh.userData.bar.visible = false;
      rival.mesh.userData.barBg.visible = false;
      if (this.onRivalDown) this.onRivalDown(rival);
    }
  }

  // Punch: hits the nearest living rival within 2.6m of a point.
  punch(fromPos) {
    if (this.punchCooldown > 0) return null;
    this.punchCooldown = 0.45;
    this.audio.punch();
    let best = null, bestD = 2.6;
    for (const r of this.livingRivals()) {
      const d = Math.hypot(r.pos.x - fromPos.x, r.pos.z - fromPos.z);
      if (d < bestD) { bestD = d; best = r; }
    }
    if (best) this.damageRival(best, 25);
    return best;
  }

  startReload() {
    if (this.reloadTimer > 0 || this.ammo === this.ammoMax) return;
    this.reloadTimer = 1.1;
  }

  // Rival AI: strafe toward the player and shoot back with inaccuracy.
  update(dt, playerPos, playerAlive, damagePlayer) {
    this.shootCooldown = Math.max(0, this.shootCooldown - dt);
    this.punchCooldown = Math.max(0, this.punchCooldown - dt);
    if (this.reloadTimer > 0) {
      this.reloadTimer -= dt;
      if (this.reloadTimer <= 0) { this.ammo = this.ammoMax; this.reloadTimer = 0; }
    }
    for (const t of this.tracers) {
      t.life -= dt;
      if (t.life <= 0) { this.scene.remove(t.line); t.line.geometry.dispose(); }
    }
    this.tracers = this.tracers.filter((t) => t.life > 0);
    if (!playerAlive) return;
    for (const r of this.livingRivals()) {
      const dx = playerPos.x - r.pos.x, dz = playerPos.z - r.pos.z;
      const d = Math.hypot(dx, dz);
      r.yaw = Math.atan2(dx, dz);
      r.mesh.rotation.y = r.yaw;
      r.moveTimer -= dt;
      if (d > 14) {
        // Close the distance.
        r.pos.x += (dx / d) * 4.2 * dt;
        r.pos.z += (dz / d) * 4.2 * dt;
      } else if (d < 6) {
        r.pos.x -= (dx / d) * 2 * dt;
        r.pos.z -= (dz / d) * 2 * dt;
      } else if (r.moveTimer <= 0) {
        r.moveTimer = 0.8 + this.rng() * 1.2;
        r.strafe = this.rng() < 0.5 ? -1 : 1;
      }
      if (r.strafe && d <= 14 && d >= 6) {
        r.pos.x += Math.cos(r.yaw) * r.strafe * 2.4 * dt;
        r.pos.z -= Math.sin(r.yaw) * r.strafe * 2.4 * dt;
      }
      r.shootTimer -= dt;
      if (r.shootTimer <= 0 && d < 45) {
        r.shootTimer = (r.isBoss ? 0.9 : 1.5) + this.rng() * 1.2;
        this.audio.enemyShot();
        const from = r.pos.clone(); from.y = 1.3;
        const to = new THREE.Vector3(playerPos.x + (this.rng() - 0.5) * 3, 1.2, playerPos.z + (this.rng() - 0.5) * 3);
        this.addTracer(from, to, 0xff5040);
        // Inaccuracy: only some shots land.
        if (this.rng() < (r.isBoss ? 0.45 : 0.28)) damagePlayer(r.isBoss ? 14 : 9);
      }
    }
  }
}
