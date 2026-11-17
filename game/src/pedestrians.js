// Solmar Bay pedestrians: 26 walkers on the sidewalks who flee when scared.
// One job: crowd life — wandering, fleeing, and getting knocked over.

import * as THREE from 'three';
import { WORLD, PEDESTRIANS, roadCenter, rand, randInt, pick, clamp, distance2D } from './config.js';

const SHIRT_COLORS = [0xe74c3c, 0x3498db, 0x2ecc71, 0xf39c12, 0x9b59b6, 0x1abc9c, 0xecf0f1, 0x34495e, 0xff8fa3, 0x7f8c8d];
const SKIN_COLORS = [0xf1c27d, 0xe0ac69, 0x8d5524, 0xffdbac, 0xc68642];

/** Build one walker mesh (torso, head, arms, legs) with a walk swing. */
export function buildPedestrianMesh() {
  const g = new THREE.Group();
  const shirt = new THREE.MeshLambertMaterial({ color: pick(SHIRT_COLORS) });
  const skin = new THREE.MeshLambertMaterial({ color: pick(SKIN_COLORS) });
  const pants = new THREE.MeshLambertMaterial({ color: pick([0x2c3e50, 0x5d4037, 0x37474f]) });
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.7, 0.32), shirt);
  torso.position.y = 1.05;
  g.add(torso);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 8), skin);
  head.position.y = 1.62;
  g.add(head);
  const hair = new THREE.Mesh(new THREE.SphereGeometry(0.23, 10, 8), new THREE.MeshLambertMaterial({ color: pick([0x1a1a1a, 0x4a2c0a, 0x777777, 0xd8b25a]) }));
  hair.position.y = 1.68;
  hair.scale.set(1, 0.6, 1);
  g.add(hair);
  const limbs = {};
  for (const [name, x, y, mat, w, h] of [
    ['armL', -0.36, 1.25, skin, 0.14, 0.6],
    ['armR', 0.36, 1.25, skin, 0.14, 0.6],
    ['legL', -0.15, 0.55, pants, 0.18, 0.7],
    ['legR', 0.15, 0.55, pants, 0.18, 0.7],
  ]) {
    const limb = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.18), mat);
    limb.position.set(x, y, 0);
    limb.geometry.translate(0, -h / 2 + 0.08, 0);
    limb.position.y = y + h / 2 - 0.08;
    g.add(limb);
    limbs[name] = limb;
  }
  g.userData.limbs = limbs;
  return g;
}

/** Spawn the sidewalk crowd. Each walker has a target intersection to stroll to. */
export function spawnPedestrians(scene) {
  const peds = [];
  for (let i = 0; i < PEDESTRIANS.count; i++) {
    const mesh = buildPedestrianMesh();
    const horizontal = Math.random() < 0.5;
    const k = randInt(0, WORLD.gridBlocks - 1);
    const side = Math.random() < 0.5 ? -1 : 1;
    const along = rand(20, WORLD.citySpan - 20);
    const x = horizontal ? along : roadCenter(k) + side * 10.5;
    const z = horizontal ? roadCenter(k) + side * 10.5 : along;
    mesh.position.set(x, 0, z);
    scene.add(mesh);
    peds.push({
      mesh, x, z,
      angle: rand(0, Math.PI * 2),
      speed: rand(PEDESTRIANS.walkMin, PEDESTRIANS.walkMax),
      targetX: rand(20, WORLD.citySpan - 20),
      targetZ: rand(20, WORLD.citySpan - 20),
      fleeing: false,
      down: false,
      downTimer: 0,
      phase: rand(0, Math.PI * 2),
    });
  }
  return peds;
}

function pickNewStrollTarget(p) {
  p.targetX = clamp(p.x + rand(-90, 90), 10, WORLD.citySpan - 10);
  p.targetZ = clamp(p.z + rand(-90, 90), 10, WORLD.citySpan - 10);
}

/** Scare every walker near a point (gunshot, speeding car): they run away. */
export function scarePedestrians(peds, x, z, radius) {
  for (const p of peds) {
    if (p.down) continue;
    if (distance2D(p.x, p.z, x, z) < radius) {
      p.fleeing = true;
      p.speed = rand(4.5, 6);
      const a = Math.atan2(p.x - x, p.z - z);
      p.targetX = clamp(p.x + Math.sin(a) * 70, 10, WORLD.citySpan - 10);
      p.targetZ = clamp(p.z + Math.cos(a) * 70, 10, WORLD.citySpan - 10);
    }
  }
}

/** Knock a walker down (hit by a car). Returns true when a walker was hit. */
export function hitPedestrian(peds, x, z, radius) {
  for (const p of peds) {
    if (p.down) continue;
    if (distance2D(p.x, p.z, x, z) < radius) {
      p.down = true;
      p.downTimer = 4;
      p.mesh.rotation.x = -Math.PI / 2;
      p.mesh.position.y = 0.3;
      scarePedestrians(peds, x, z, 26);
      return true;
    }
  }
  return false;
}

/** Advance every walker: stroll, flee, get up again after being knocked down. */
export function updatePedestrians(peds, dt, time) {
  for (const p of peds) {
    if (p.down) {
      p.downTimer -= dt;
      if (p.downTimer <= 0) {
        p.down = false;
        p.mesh.rotation.x = 0;
        p.mesh.position.y = 0;
        p.fleeing = true;
        p.speed = rand(4.5, 6);
        pickNewStrollTarget(p);
      }
      continue;
    }
    const dx = p.targetX - p.x;
    const dz = p.targetZ - p.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 2) {
      if (p.fleeing) {
        p.fleeing = false;
        p.speed = rand(PEDESTRIANS.walkMin, PEDESTRIANS.walkMax);
      }
      pickNewStrollTarget(p);
      continue;
    }
    const targetAngle = Math.atan2(dx, dz);
    let d = targetAngle - p.angle;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    p.angle += Math.max(-3 * dt, Math.min(3 * dt, d));
    p.x += Math.sin(p.angle) * p.speed * dt;
    p.z += Math.cos(p.angle) * p.speed * dt;
    p.x = clamp(p.x, 6, WORLD.citySpan - 6);
    p.z = clamp(p.z, 6, WORLD.citySpan - 6);
    p.mesh.position.set(p.x, 0, p.z);
    p.mesh.rotation.y = p.angle;
    const swing = Math.sin(time * (p.fleeing ? 11 : 7) + p.phase) * (p.fleeing ? 0.9 : 0.55);
    const limbs = p.mesh.userData.limbs;
    limbs.legL.rotation.x = swing;
    limbs.legR.rotation.x = -swing;
    limbs.armL.rotation.x = -swing * 0.8;
    limbs.armR.rotation.x = swing * 0.8;
  }
}
