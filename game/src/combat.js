// Solmar Bay — combat: hitscan pistol with tracers, rival-gang enemies with
// simple chase-and-shoot AI, melee punch, and a pooled particle burst system.
import * as THREE from 'three';
import { makeRng, pick } from './config.js';

const ENEMY_SHIRTS = [0x8a1a1a, 0x5e1a8a, 0x1a5e3a];

function makeEnemyMesh(rng) {
  const g = new THREE.Group();
  const skin = new THREE.MeshStandardMaterial({ color: 0xc68642, roughness: 0.8 });
  const shirt = new THREE.MeshStandardMaterial({ color: pick(rng, ENEMY_SHIRTS), roughness: 0.9 });
  const pants = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.9 });
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.33, 10, 10), skin);
  head.position.y = 1.62;
  const band = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.12, 10),
    new THREE.MeshStandardMaterial({ color: 0x111111 }));
  band.position.y = 1.8;
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.66, 0.78, 0.36), shirt);
  torso.position.y = 1.05;
  const legs = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.7, 0.3), pants);
  legs.position.y = 0.35;
  head.castShadow = torso.castShadow = true;
  g.add(head, band, torso, legs);
  g.userData.hitRadius = 1.0;
  return g;
}

/** Pooled burst particles: small glowing boxes with velocity + gravity + fade. */
export class ParticleSystem {
  constructor(scene, max = 240) {
    this.scene = scene;
    this.pool = [];
    const geo = new THREE.BoxGeometry(0.16, 0.16, 0.16);
    for (let i = 0; i < max; i++) {
      const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true }));
      m.visible = false;
      scene.add(m);
      this.pool.push({ mesh: m, life: 0, vel: new THREE.Vector3() });
    }
  }

  burst(pos, color, count, speed, up = 2) {
    let n = 0;
    for (const p of this.pool) {
      if (p.life > 0) continue;
      p.life = 0.5 + Math.random() * 0.4;
      p.mesh.visible = true;
      p.mesh.position.copy(pos);
      p.mesh.material.color.setHex(color);
      p.mesh.material.opacity = 1;
      p.vel.set((Math.random() - 0.5) * speed, Math.random() * up + 1, (Math.random() - 0.5) * speed);
      if (++n >= count) break;
    }
  }

  update(dt) {
    for (const p of this.pool) {
      if (p.life <= 0) continue;
      p.life -= dt;
      if (p.life <= 0) { p.mesh.visible = false; continue; }
      p.vel.y -= 9 * dt;
      p.mesh.position.addScaledVector(p.vel, dt);
      p.mesh.material.opacity = Math.min(1, p.life * 2);
      p.mesh.rotation.x += dt * 5; p.mesh.rotation.y += dt * 7;
    }
  }
}

/** Tracer lines for gunfire: short-lived stretched boxes. */
export class TracerSystem {
  constructor(scene) {
    this.scene = scene;
    this.tracers = [];
    const geo = new THREE.BoxGeometry(0.06, 0.06, 1);
    this.geo = geo;
  }

  fire(from, to, color = 0xffe08a) {
    const m = new THREE.Mesh(this.geo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9 }));
    const mid = from.clone().add(to).multiplyScalar(0.5);
    m.position.copy(mid);
    m.lookAt(to);
    m.scale.z = from.distanceTo(to);
    this.scene.add(m);
    this.tracers.push({ mesh: m, life: 0.09 });
  }

  update(dt) {
    for (let i = this.tracers.length - 1; i >= 0; i--) {
      const t = this.tracers[i];
      t.life -= dt;
      if (t.life <= 0) { this.scene.remove(t.mesh); t.mesh.material.dispose(); this.tracers.splice(i, 1); }
    }
  }
}

export class CombatManager {
  constructor(scene, particles, tracers, audio) {
    this.scene = scene;
    this.particles = particles;
    this.tracers = tracers;
    this.audio = audio;
    this.rng = makeRng(31337);
    this.enemies = []; // {mesh,pos,hp,shootCd,heading,speed}
    this.fireCd = 0;
  }

  spawnEnemies(center, count, radius = 12) {
    for (let i = 0; i < count; i++) {
      const mesh = makeEnemyMesh(this.rng);
      const a = (i / count) * Math.PI * 2 + this.rng();
      const x = center.x + Math.sin(a) * (radius * 0.5 + this.rng() * radius * 0.5);
      const z = center.z + Math.cos(a) * (radius * 0.5 + this.rng() * radius * 0.5);
      mesh.position.set(x, 0, z);
      this.scene.add(mesh);
      this.enemies.push({ mesh, pos: mesh.position, hp: 100, shootCd: 1 + this.rng() * 2, heading: 0, speed: 4.2 });
    }
  }

  clearEnemies() {
    for (const e of this.enemies) this.scene.remove(e.mesh);
    this.enemies = [];
  }

  /** Player pistol shot. Returns 'enemy' | 'ped' | 'police' | 'miss' + hit point. */
  playerShoot(origin, dir, peds, police) {
    this.fireCd = 0.28;
    this.audio.gunshot();
    const ray = new THREE.Raycaster(origin, dir, 0.1, 120);
    const targets = [];
    for (const e of this.enemies) targets.push({ obj: e.mesh, kind: 'enemy', ref: e });
    for (const p of peds.peds) targets.push({ obj: p.mesh, kind: 'ped', ref: p });
    for (const o of police.officers) targets.push({ obj: o.mesh, kind: 'police', ref: o });
    const meshes = targets.map((t) => t.obj);
    const hits = ray.intersectObjects(meshes, true);
    let end = origin.clone().addScaledVector(dir, 120);
    let result = { kind: 'miss', point: end };
    if (hits.length > 0) {
      const hit = hits[0];
      end = hit.point.clone();
      let node = hit.object;
      while (node.parent && node.parent !== this.scene) node = node.parent;
      const t = targets.find((x) => x.obj === node);
      if (t) {
        result = { kind: t.kind, point: end, ref: t.ref };
        this.particles.burst(end, 0xff5544, 10, 5);
        if (t.kind === 'enemy') {
          t.ref.hp -= 34;
          if (t.ref.hp <= 0) {
            this.particles.burst(t.ref.pos.clone().setY(1), 0xff2222, 22, 7);
            this.scene.remove(t.ref.mesh);
            this.enemies.splice(this.enemies.indexOf(t.ref), 1);
            result.killed = true;
          }
        }
      }
    }
    this.tracers.fire(origin, end);
    return result;
  }

  /** Melee punch: hits the nearest enemy/ped/officer in front within 2.2 units. */
  playerPunch(pos, heading, peds, police) {
    this.audio.punch();
    const fx = Math.sin(heading), fz = Math.cos(heading);
    const check = (list, kind) => {
      for (const e of list) {
        const p = e.pos || e.mesh.position;
        const dx = p.x - pos.x, dz = p.z - pos.z;
        const d = Math.hypot(dx, dz);
        if (d < 2.4 && (dx * fx + dz * fz) / (d || 1) > 0.3) {
          this.particles.burst(p.clone().setY(1.2), 0xffcc66, 8, 4);
          return { kind, ref: e };
        }
      }
      return null;
    };
    const eHit = check(this.enemies, 'enemy');
    if (eHit) {
      eHit.ref.hp -= 50;
      if (eHit.ref.hp <= 0) {
        this.scene.remove(eHit.ref.mesh);
        this.enemies.splice(this.enemies.indexOf(eHit.ref), 1);
        eHit.killed = true;
      }
      return eHit;
    }
    return check(peds.peds, 'ped') || check(police.officers, 'police');
  }

  /** Enemy AI: close in, strafe a little, shoot with inaccuracy. Returns hits on player. */
  update(dt, playerPos, playerAlive, onPlayerHit) {
    this.fireCd = Math.max(0, this.fireCd - dt);
    for (const e of this.enemies) {
      const dx = playerPos.x - e.pos.x, dz = playerPos.z - e.pos.z;
      const dist = Math.hypot(dx, dz);
      e.heading = Math.atan2(dx, dz);
      if (dist > 14) {
        e.pos.x += Math.sin(e.heading) * e.speed * dt;
        e.pos.z += Math.cos(e.heading) * e.speed * dt;
      } else if (dist < 7) {
        e.pos.x -= Math.sin(e.heading) * e.speed * 0.5 * dt;
        e.pos.z -= Math.cos(e.heading) * e.speed * 0.5 * dt;
      }
      e.mesh.rotation.y = e.heading;
      e.shootCd -= dt;
      if (e.shootCd <= 0 && dist < 55 && playerAlive) {
        e.shootCd = 1.4 + this.rng() * 1.2;
        const from = e.pos.clone().setY(1.4);
        const to = playerPos.clone().setY(1.2);
        // Inaccurate: most shots miss, a few connect.
        const miss = this.rng() < 0.55;
        if (miss) {
          to.x += (this.rng() - 0.5) * 6; to.z += (this.rng() - 0.5) * 6;
        }
        this.tracers.fire(from, to, 0xff8866);
        this.audio.gunshot();
        if (!miss) onPlayerHit(8 + Math.floor(this.rng() * 8), e.pos);
      }
    }
  }
}
