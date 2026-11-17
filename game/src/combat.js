// Solmar Bay: combat. One job: punch + pistol for the player, rival-gang
// shooters who fight back, tracers, muzzle flash and hit markers.

import * as THREE from 'three';
import { clamp, dist2, rand, pick } from './config.js';

const GANG_NAMES = ['Vex', 'Marlo', 'Dante', 'Rook', 'Sable', 'Kane'];

function makeGangMesh() {
  const g = new THREE.Group();
  const shirt = new THREE.MeshLambertMaterial({ color: pick([0x7b241c, 0x4a235a, 0x1a1a1a]) });
  const legs = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.8, 0.2), new THREE.MeshLambertMaterial({ color: 0x222222 }));
  legs.position.y = 0.4;
  g.add(legs);
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.62, 0.28), shirt);
  torso.position.y = 1.11;
  torso.castShadow = true;
  g.add(torso);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.19, 10, 8), new THREE.MeshLambertMaterial({ color: pick([0xf1c27d, 0xc68642, 0x8d5524]) }));
  head.position.y = 1.62;
  g.add(head);
  const band = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.08, 0.4), new THREE.MeshBasicMaterial({ color: 0xd4ac0d }));
  band.position.y = 1.74;
  g.add(band);
  const gun = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.12, 0.4), new THREE.MeshLambertMaterial({ color: 0x111111 }));
  gun.position.set(0.28, 1.2, 0.3);
  g.add(gun);
  return g;
}

export class CombatSystem {
  constructor(scene, callbacks) {
    this.scene = scene;
    this.cb = callbacks; // { onPlayerDamage, onGangDown, onShoot, onScare }
    this.weapon = 'fists'; // 'fists' | 'pistol'
    this.ammo = 48;
    this.pistolUnlocked = true;
    this.cooldown = 0;
    this.gang = []; // active rival shooters
    this.tracers = [];
    this.muzzle = new THREE.PointLight(0xffc266, 0, 14);
    this.scene.add(this.muzzle);
    this.muzzleTimer = 0;
    this.hitmarkTimer = 0;
  }

  switchWeapon(name) {
    if (name === 'pistol' && !this.pistolUnlocked) return false;
    this.weapon = name;
    return true;
  }

  spawnGang(count, centreX, centreZ, radius) {
    for (let i = 0; i < count; i++) {
      const mesh = makeGangMesh();
      const a = rand(0, Math.PI * 2);
      const r = rand(2, radius);
      mesh.position.set(centreX + Math.sin(a) * r, 0, centreZ + Math.cos(a) * r);
      this.scene.add(mesh);
      this.gang.push({
        mesh, name: pick(GANG_NAMES), health: 60, shootTimer: rand(0.5, 1.5),
        moveTimer: rand(1, 3), strafeDir: Math.random() < 0.5 ? 1 : -1,
      });
    }
  }

  clearGang() {
    for (const g of this.gang) this.scene.remove(g.mesh);
    this.gang = [];
  }

  gangAlive() {
    return this.gang.length;
  }

  // Player attacks toward a world point (camera aim). Returns 'hit' | 'miss' | 'none'.
  playerAttack(origin, aimPoint, peds, police) {
    if (this.cooldown > 0) return 'none';
    if (this.weapon === 'pistol') {
      if (this.ammo <= 0) { this.cooldown = 0.4; return 'none'; }
      this.ammo--;
      this.cooldown = 0.28;
      this._fireTracer(origin, aimPoint, 0xffe08a);
      this.muzzle.position.copy(origin);
      this.muzzle.intensity = 26;
      this.muzzleTimer = 0.06;
      if (this.cb.onShoot) this.cb.onShoot(origin, aimPoint);
      const hit = this._rayHit(origin, aimPoint);
      if (hit) {
        this.hitmarkTimer = 0.25;
        return 'hit';
      }
      return 'miss';
    }
    // Fists: short arc in front of the aim point's ground position.
    this.cooldown = 0.45;
    if (this.cb.onPunch) this.cb.onPunch();
    const hit = this._meleeHit(aimPoint, peds);
    if (hit) this.hitmarkTimer = 0.25;
    return hit ? 'hit' : 'miss';
  }

  _rayHit(origin, aimPoint) {
    // Gang members first.
    let best = null, bd = Infinity;
    const dir = new THREE.Vector3().subVectors(aimPoint, origin).normalize();
    for (const g of this.gang) {
      const to = new THREE.Vector3().subVectors(g.mesh.position.clone().add(new THREE.Vector3(0, 1.2, 0)), origin);
      const along = to.dot(dir);
      if (along < 0 || along > 120) continue;
      const perp = to.clone().addScaledVector(dir, -along).length();
      if (perp < 1.1 && along < bd) { bd = along; best = { kind: 'gang', ref: g }; }
    }
    if (best) {
      best.ref.health -= 34;
      if (best.ref.health <= 0) {
        this.scene.remove(best.ref.mesh);
        this.gang.splice(this.gang.indexOf(best.ref), 1);
        if (this.cb.onGangDown) this.cb.onGangDown(best.ref);
      }
      return true;
    }
    return false;
  }

  _meleeHit(aimPoint, peds) {
    let hit = false;
    for (const g of this.gang) {
      if (dist2(aimPoint.x, aimPoint.z, g.mesh.position.x, g.mesh.position.z) < 2.4) {
        g.health -= 25;
        if (g.health <= 0) {
          this.scene.remove(g.mesh);
          this.gang.splice(this.gang.indexOf(g), 1);
          if (this.cb.onGangDown) this.cb.onGangDown(g);
        }
        hit = true;
      }
    }
    if (peds) {
      for (const p of peds.peds || []) {
        if (!p.down && dist2(aimPoint.x, aimPoint.z, p.mesh.position.x, p.mesh.position.z) < 2.2) {
          peds.knockDown(p);
          if (this.cb.onPedPunched) this.cb.onPedPunched(p);
          hit = true;
        }
      }
    }
    return hit;
  }

  _fireTracer(from, to, color) {
    const geo = new THREE.BufferGeometry().setFromPoints([from.clone(), to.clone()]);
    const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.9 }));
    this.scene.add(line);
    this.tracers.push({ line, life: 0.09 });
  }

  update(dt, playerPos, playerHealth) {
    this.cooldown = Math.max(0, this.cooldown - dt);
    this.hitmarkTimer = Math.max(0, this.hitmarkTimer - dt);
    if (this.muzzleTimer > 0) {
      this.muzzleTimer -= dt;
      if (this.muzzleTimer <= 0) this.muzzle.intensity = 0;
    }
    for (let i = this.tracers.length - 1; i >= 0; i--) {
      const t = this.tracers[i];
      t.life -= dt;
      if (t.life <= 0) {
        this.scene.remove(t.line);
        t.line.geometry.dispose();
        this.tracers.splice(i, 1);
      }
    }
    // Gang AI: strafe, keep range, shoot back.
    for (const g of this.gang) {
      const dx = playerPos.x - g.mesh.position.x;
      const dz = playerPos.z - g.mesh.position.z;
      const d = Math.max(0.01, Math.hypot(dx, dz));
      g.mesh.rotation.y = Math.atan2(dx, dz);
      g.moveTimer -= dt;
      if (g.moveTimer <= 0) {
        g.moveTimer = rand(1.5, 3.5);
        g.strafeDir *= -1;
      }
      const want = d > 16 ? 3.2 : d < 8 ? -2.4 : 0;
      g.mesh.position.x += (dx / d) * want * dt + Math.cos(g.mesh.rotation.y) * g.strafeDir * 1.6 * dt;
      g.mesh.position.z += (dz / d) * want * dt - Math.sin(g.mesh.rotation.y) * g.strafeDir * 1.6 * dt;
      g.shootTimer -= dt;
      if (g.shootTimer <= 0 && d < 42) {
        g.shootTimer = rand(0.9, 1.9);
        const from = g.mesh.position.clone().add(new THREE.Vector3(0, 1.3, 0));
        const to = new THREE.Vector3(playerPos.x + rand(-1, 1), 1.2, playerPos.z + rand(-1, 1));
        this._fireTracer(from, to, 0xff5544);
        this.muzzle.position.copy(from);
        this.muzzle.intensity = 14;
        this.muzzleTimer = 0.05;
        if (Math.random() < 0.55 && this.cb.onPlayerDamage) this.cb.onPlayerDamage(rand(4, 9), 'shot by ' + g.name);
        if (this.cb.onEnemyShot) this.cb.onEnemyShot();
      }
    }
  }
}
