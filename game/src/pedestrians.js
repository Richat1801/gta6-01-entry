// Solmar Bay — pedestrians: 26 walkers on the sidewalks.
// One job: make the city feel lived-in.

import * as THREE from 'three';
import { WORLD, mulberry32, pick, clamp } from './config.js';

const SHIRTS = [0xe85d3d, 0x3d8fe8, 0xf2c14e, 0x7bc47f, 0xe8e8e8, 0x8e44ad, 0x16a085, 0xd35400];
const PANTS = [0x2e3138, 0x4a3a2a, 0x3d5a80, 0x5d6d7d];

function makePedMesh(shirt, pants, skin) {
  const g = new THREE.Group();
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.32, 0.55, 4, 8),
    new THREE.MeshStandardMaterial({ color: shirt, roughness: 0.9 }));
  torso.position.y = 1.05; torso.castShadow = true;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.24, 10, 8),
    new THREE.MeshStandardMaterial({ color: skin, roughness: 0.8 }));
  head.position.y = 1.75; head.castShadow = true;
  const legMat = new THREE.MeshStandardMaterial({ color: pants, roughness: 0.9 });
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.7, 0.2), legMat);
  legL.position.set(-0.14, 0.35, 0);
  const legR = legL.clone();
  legR.position.x = 0.14;
  g.add(torso); g.add(head); g.add(legL); g.add(legR);
  g.userData.legL = legL; g.userData.legR = legR;
  return g;
}

export class PedestrianSystem {
  constructor(scene) {
    const rng = mulberry32(31337);
    this.peds = [];
    for (let i = 0; i < 26; i++) {
      const shirt = pick(rng, SHIRTS);
      const pants = pick(rng, PANTS);
      const skin = pick(rng, [0xe8b98a, 0xc98a5a, 0x8a5a3a, 0xf2c9a0]);
      const mesh = makePedMesh(shirt, pants, skin);
      const bx = Math.floor(rng() * 8), bz = Math.floor(rng() * 8);
      const x = WORLD.blockCenter(bx) + (rng() - 0.5) * 30;
      const z = WORLD.blockCenter(bz) + (rng() - 0.5) * 30;
      mesh.position.set(x, 0, z);
      scene.add(mesh);
      this.peds.push({
        mesh,
        pos: mesh.position,
        yaw: rng() * Math.PI * 2,
        speed: 1.1 + rng() * 0.9,
        target: null,
        idle: rng() * 2,
        walkPhase: rng() * 6,
        scared: 0,
        alive: true,
      });
    }
    this.rng = rng;
  }

  pickSidewalkTarget(p) {
    const bx = Math.floor(this.rng() * 8), bz = Math.floor(this.rng() * 8);
    return {
      x: WORLD.blockCenter(bx) + (this.rng() - 0.5) * 30,
      z: WORLD.blockCenter(bz) + (this.rng() - 0.5) * 30,
    };
  }

  update(dt, playerPos, gunfireAt) {
    for (const p of this.peds) {
      if (!p.alive) continue;
      if (gunfireAt) {
        const d = Math.hypot(p.pos.x - gunfireAt.x, p.pos.z - gunfireAt.z);
        if (d < 30) p.scared = 3;
      }
      if (p.scared > 0) {
        p.scared -= dt;
        // Flee away from the player.
        const dx = p.pos.x - playerPos.x, dz = p.pos.z - playerPos.z;
        const d = Math.hypot(dx, dz) || 1;
        p.pos.x += (dx / d) * 5 * dt;
        p.pos.z += (dz / d) * 5 * dt;
        p.yaw = Math.atan2(dx, dz);
        p.walkPhase += dt * 12;
      } else if (p.idle > 0) {
        p.idle -= dt;
      } else {
        if (!p.target) p.target = this.pickSidewalkTarget(p);
        const dx = p.target.x - p.pos.x, dz = p.target.z - p.pos.z;
        const d = Math.hypot(dx, dz);
        if (d < 1) { p.target = null; p.idle = 1 + this.rng() * 4; continue; }
        p.yaw = Math.atan2(dx, dz);
        p.pos.x += (dx / d) * p.speed * dt;
        p.pos.z += (dz / d) * p.speed * dt;
        p.walkPhase += dt * 7;
      }
      p.pos.x = clamp(p.pos.x, -WORLD.half, WORLD.half);
      p.pos.z = clamp(p.pos.z, -WORLD.half, WORLD.beachStart + 20);
      p.mesh.rotation.y = p.yaw;
      const s = Math.sin(p.walkPhase) * 0.45;
      p.mesh.userData.legL.rotation.x = s;
      p.mesh.userData.legR.rotation.x = -s;
      p.mesh.position.y = Math.abs(Math.sin(p.walkPhase)) * 0.05;
    }
  }

  // Nearest living pedestrian to a point.
  nearest(x, z, range) {
    let best = null, bestD = range;
    for (const p of this.peds) {
      if (!p.alive) continue;
      const d = Math.hypot(p.pos.x - x, p.pos.z - z);
      if (d < bestD) { bestD = d; best = p; }
    }
    return best;
  }

  all() { return this.peds; }
}
