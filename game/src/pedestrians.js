// Pedestrians: 26 walkers strolling the sidewalks. They wander block to
// block, and flee from speeding cars, gunfire and the player when scared.

import * as THREE from 'three';
import { CONFIG, rand, randPick, clamp, distance2D } from './config.js';
import { blockCenter } from './city.js';

const SHIRT_COLORS = [0xe85d75, 0x2e6fd2, 0xf2c230, 0x2ea86a, 0x8a4fd2, 0xe8e8e8, 0xe87a2e, 0x4dc8c8];
const PANTS_COLORS = [0x2c3e50, 0x3a3f46, 0x6b4a2f, 0x1f2a44];

export class Pedestrian {
  constructor(x, z) {
    this.mesh = buildPedMesh();
    this.mesh.position.set(x, 0, z);
    this.heading = rand(0, Math.PI * 2);
    this.speed = rand(1.2, 2.2);
    this.target = pickSidewalkTarget(x, z);
    this.state = 'walk'; // 'walk' | 'flee' | 'down'
    this.fleeTimer = 0;
    this.downTimer = 0;
    this.walkPhase = rand(0, Math.PI * 2);
    this.scaredBy = null;
  }
}

function buildPedMesh() {
  const group = new THREE.Group();
  const shirt = new THREE.MeshStandardMaterial({ color: randPick(SHIRT_COLORS), roughness: 0.9 });
  const pants = new THREE.MeshStandardMaterial({ color: randPick(PANTS_COLORS), roughness: 0.9 });
  const skin = new THREE.MeshStandardMaterial({ color: randPick([0xf2c9a0, 0xd9a066, 0x8a5a34, 0xf7d7b5]), roughness: 0.8 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.75, 0.32), shirt);
  body.position.y = 1.05;
  body.castShadow = true;
  group.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 8), skin);
  head.position.y = 1.62;
  head.castShadow = true;
  group.add(head);
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.65, 0.22), pants);
  legL.position.set(-0.14, 0.33, 0);
  group.add(legL);
  const legR = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.65, 0.22), pants);
  legR.position.set(0.14, 0.33, 0);
  group.add(legR);
  const armL = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.6, 0.16), shirt);
  armL.position.set(-0.36, 1.05, 0);
  group.add(armL);
  const armR = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.6, 0.16), shirt);
  armR.position.set(0.36, 1.05, 0);
  group.add(armR);
  group.userData = { legL, legR, armL, armR };
  return group;
}

// A sidewalk point: near a random block's edge, on the pavement.
export function pickSidewalkTarget(x, z) {
  const bx = Math.floor(Math.random() * CONFIG.blocks);
  const bz = Math.floor(Math.random() * CONFIG.blocks);
  const c = blockCenter(bx, bz);
  const edge = Math.floor(Math.random() * 4);
  const off = rand(-19, 19);
  if (edge === 0) return { x: c.x + off, z: c.z - 21 };
  if (edge === 1) return { x: c.x + off, z: c.z + 21 };
  if (edge === 2) return { x: c.x - 21, z: c.z + off };
  return { x: c.x + 21, z: c.z + off };
}

export function spawnPedestrians(scene) {
  const peds = [];
  for (let i = 0; i < CONFIG.pedestrians; i++) {
    const t = pickSidewalkTarget(0, 0);
    const ped = new Pedestrian(t.x, t.z);
    scene.add(ped.mesh);
    peds.push(ped);
  }
  return peds;
}

// Scare every pedestrian within radius of a point (gunshot, crash, siren).
export function scarePedestrians(peds, x, z, radius) {
  for (const ped of peds) {
    if (ped.state === 'down') continue;
    if (distance2D(ped.mesh.position.x, ped.mesh.position.z, x, z) < radius) {
      ped.state = 'flee';
      ped.fleeTimer = rand(2.5, 4.5);
      ped.scaredBy = { x, z };
    }
  }
}

export function updatePedestrian(ped, dt, playerPos, playerCarSpeed) {
  const pos = ped.mesh.position;
  if (ped.state === 'down') {
    ped.downTimer -= dt;
    ped.mesh.rotation.x = -Math.PI / 2; // lying flat
    if (ped.downTimer <= 0) {
      ped.state = 'walk';
      ped.mesh.rotation.x = 0;
      ped.target = pickSidewalkTarget(pos.x, pos.z);
    }
    return;
  }
  let speed = ped.speed;
  let tx = ped.target.x;
  let tz = ped.target.z;
  if (ped.state === 'flee') {
    ped.fleeTimer -= dt;
    speed = 5.2;
    // Run directly away from what scared them.
    const dx = pos.x - ped.scaredBy.x;
    const dz = pos.z - ped.scaredBy.z;
    const d = Math.max(0.1, Math.hypot(dx, dz));
    tx = pos.x + (dx / d) * 30;
    tz = pos.z + (dz / d) * 30;
    if (ped.fleeTimer <= 0) {
      ped.state = 'walk';
      ped.target = pickSidewalkTarget(pos.x, pos.z);
    }
  }
  const dx = tx - pos.x;
  const dz = tz - pos.z;
  const dist = Math.hypot(dx, dz);
  if (dist < 1.5) {
    if (ped.state === 'walk') ped.target = pickSidewalkTarget(pos.x, pos.z);
    return;
  }
  const desired = Math.atan2(dx, dz);
  let dh = desired - ped.heading;
  while (dh > Math.PI) dh -= Math.PI * 2;
  while (dh < -Math.PI) dh += Math.PI * 2;
  ped.heading += clamp(dh, -3.2 * dt, 3.2 * dt);
  pos.x += Math.sin(ped.heading) * speed * dt;
  pos.z += Math.cos(ped.heading) * speed * dt;
  pos.x = clamp(pos.x, -CONFIG.cityHalf - 6, CONFIG.beachEnd - 4);
  pos.z = clamp(pos.z, -CONFIG.cityHalf - 6, CONFIG.cityHalf + 6);
  ped.mesh.rotation.y = ped.heading;
  // Walk-cycle swing on the limbs.
  ped.walkPhase += dt * speed * 3.2;
  const swing = Math.sin(ped.walkPhase) * 0.55;
  ped.mesh.userData.legL.rotation.x = swing;
  ped.mesh.userData.legR.rotation.x = -swing;
  ped.mesh.userData.armL.rotation.x = -swing * 0.7;
  ped.mesh.userData.armR.rotation.x = swing * 0.7;
  // A fast car bearing down on a walker knocks them down (and counts as a crime).
  if (playerCarSpeed > 8) {
    const pd = distance2D(pos.x, pos.z, playerPos.x, playerPos.z);
    if (pd < 2.2) {
      ped.state = 'down';
      ped.downTimer = 6;
      return 'hit';
    }
  }
  return null;
}
