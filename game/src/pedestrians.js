// Solmar Bay: pedestrians. One job: 26 walkers on the sidewalks who stroll,
// cross at corners, and flee when scared (gunfire, a speeding car, a punch).

import * as THREE from 'three';
import { CITY, rand, randInt, pick, dist2, roadCentres } from './config.js';

const SHIRTS = [0xe74c3c, 0x3498db, 0x2ecc71, 0xf39c12, 0x9b59b6, 0x1abc9c, 0xecf0f1, 0xfd79a8, 0x00cec9, 0x6c5ce7];
const SKINS = [0xf1c27d, 0xe0ac69, 0xc68642, 0x8d5524, 0xffdbac];

function makePedestrianMesh() {
  const g = new THREE.Group();
  const skin = pick(SKINS);
  const shirt = pick(SHIRTS);
  const legs = new THREE.Mesh(
    new THREE.BoxGeometry(0.34, 0.8, 0.2),
    new THREE.MeshLambertMaterial({ color: pick([0x2c3e50, 0x5d4037, 0x37474f]) })
  );
  legs.position.y = 0.4;
  g.add(legs);
  const torso = new THREE.Mesh(
    new THREE.BoxGeometry(0.46, 0.62, 0.26),
    new THREE.MeshLambertMaterial({ color: shirt })
  );
  torso.position.y = 1.11;
  torso.castShadow = true;
  g.add(torso);
  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.19, 10, 8),
    new THREE.MeshLambertMaterial({ color: skin })
  );
  head.position.y = 1.62;
  head.castShadow = true;
  g.add(head);
  const hair = new THREE.Mesh(
    new THREE.SphereGeometry(0.2, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2),
    new THREE.MeshLambertMaterial({ color: pick([0x1a1a1a, 0x4a2c14, 0x888888, 0xd4a017]) })
  );
  hair.position.y = 1.66;
  g.add(hair);
  return g;
}

export class PedestrianSystem {
  constructor(scene) {
    this.scene = scene;
    this.peds = [];
    const centres = roadCentres();
    for (let i = 0; i < 26; i++) {
      const mesh = makePedestrianMesh();
      const horizontal = Math.random() < 0.5;
      const road = pick(centres);
      const side = Math.random() < 0.5 ? 1 : -1;
      const along = rand(-195, 195);
      mesh.position.set(
        horizontal ? along : road + side * (6 + 12 / 2 + 1.5),
        0,
        horizontal ? road + side * (6 + 12 / 2 + 1.5) : along
      );
      mesh.rotation.y = rand(0, Math.PI * 2);
      this.scene.add(mesh);
      this.peds.push({
        mesh, horizontal, road, side,
        dir: Math.random() < 0.5 ? 1 : -1,
        speed: rand(0.9, 1.9),
        fleeing: false,
        fleeX: 0, fleeZ: 0,
        fleeTimer: 0,
        down: false,
        downTimer: 0,
        walkPhase: rand(0, Math.PI * 2),
      });
    }
  }

  scare(x, z, radius) {
    for (const p of this.peds) {
      if (p.down) continue;
      const d = dist2(x, z, p.mesh.position.x, p.mesh.position.z);
      if (d < radius) {
        p.fleeing = true;
        p.fleeTimer = rand(2.5, 5);
        const dx = p.mesh.position.x - x, dz = p.mesh.position.z - z;
        const len = Math.max(0.01, Math.hypot(dx, dz));
        p.fleeX = dx / len; p.fleeZ = dz / len;
      }
    }
  }

  knockDown(ped) {
    ped.down = true;
    ped.downTimer = 4;
    ped.mesh.rotation.x = Math.PI / 2 - 0.15;
    ped.mesh.position.y = 0.25;
  }

  update(dt, time) {
    for (const p of this.peds) {
      if (p.down) {
        p.downTimer -= dt;
        if (p.downTimer <= 0) {
          p.down = false;
          p.mesh.rotation.x = 0;
          p.mesh.position.y = 0;
          p.fleeing = true;
          p.fleeTimer = 3;
          p.fleeX = rand(-1, 1); p.fleeZ = rand(-1, 1);
        }
        continue;
      }
      p.walkPhase += dt * (p.fleeing ? 14 : 7);
      p.mesh.position.y = Math.abs(Math.sin(p.walkPhase)) * 0.05;
      if (p.fleeing) {
        p.fleeTimer -= dt;
        const speed = 5.2;
        p.mesh.position.x += p.fleeX * speed * dt;
        p.mesh.position.z += p.fleeZ * speed * dt;
        p.mesh.rotation.y = Math.atan2(p.fleeX, p.fleeZ);
        if (p.fleeTimer <= 0) p.fleeing = false;
      } else {
        const step = p.speed * p.dir * dt;
        if (p.horizontal) {
          p.mesh.position.x += step;
          p.mesh.rotation.y = p.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
          if (Math.abs(p.mesh.position.x) > 198) p.dir *= -1;
        } else {
          p.mesh.position.z += step;
          p.mesh.rotation.y = p.dir > 0 ? 0 : Math.PI;
          if (Math.abs(p.mesh.position.z) > 198) p.dir *= -1;
        }
        // At a block corner, sometimes turn onto the crossing sidewalk.
        if (Math.random() < dt * 0.06) {
          p.horizontal = !p.horizontal;
          p.dir = Math.random() < 0.5 ? 1 : -1;
          p.side = Math.random() < 0.5 ? 1 : -1;
        }
      }
      p.mesh.position.x = Math.max(-205, Math.min(205, p.mesh.position.x));
      p.mesh.position.z = Math.max(-205, Math.min(205, p.mesh.position.z));
    }
  }
}
