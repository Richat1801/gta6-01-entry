// Solmar Bay — vehicles: stealable parked cars, traffic AI, police cruisers.
// One job: build car meshes and move them. Every car object ALWAYS carries a
// `.pos` Vector3 (its group position), so no reader ever meets a missing one.

import * as THREE from 'three';
import { CAR, clamp, angleLerp, mulberry32, pick } from './config.js';

const CAR_COLORS = [0xc0392b, 0x2e6fb0, 0xe8c84a, 0x7bc47f, 0xe8e8e8, 0x222831, 0x8e44ad, 0xd35400, 0x16a085, 0xb03a5b];
const CAR_NAMES = ['Vento', 'Cascada', 'Solstice', 'Marlin', 'Palm GT', 'Brisa', 'Coral', 'Tide Runner', 'Laguna', 'Sirocco'];

export function makeCarMesh(color, isPolice) {
  const g = new THREE.Group();
  const bodyMat = new THREE.MeshStandardMaterial({ color, roughness: 0.35, metalness: 0.45 });
  const glassMat = new THREE.MeshStandardMaterial({ color: 0x1a2a33, roughness: 0.15, metalness: 0.6 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.62, 4.4), bodyMat);
  body.position.y = 0.55; body.castShadow = true;
  g.add(body);
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.55, 2.2), glassMat);
  cabin.position.set(0, 1.08, -0.25); cabin.castShadow = true;
  g.add(cabin);
  const wheelGeo = new THREE.CylinderGeometry(0.36, 0.36, 0.28, 12);
  const wheelMat = new THREE.MeshStandardMaterial({ color: 0x141414, roughness: 0.9 });
  const wheels = [];
  for (const [wx, wz] of [[-0.95, 1.45], [0.95, 1.45], [-0.95, -1.45], [0.95, -1.45]]) {
    const w = new THREE.Mesh(wheelGeo, wheelMat);
    w.rotation.z = Math.PI / 2;
    w.position.set(wx, 0.36, wz);
    g.add(w); wheels.push(w);
  }
  const headMat = new THREE.MeshStandardMaterial({ color: 0xfff6c8, emissive: 0xffe9a0, emissiveIntensity: 0.9 });
  for (const hx of [-0.6, 0.6]) {
    const h = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.18, 0.08), headMat);
    h.position.set(hx, 0.62, 2.21);
    g.add(h);
  }
  const tailMat = new THREE.MeshStandardMaterial({ color: 0xc02020, emissive: 0x800000, emissiveIntensity: 0.6 });
  for (const hx of [-0.6, 0.6]) {
    const t = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.16, 0.08), tailMat);
    t.position.set(hx, 0.62, -2.21);
    g.add(t);
  }
  if (isPolice) {
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(2.02, 0.2, 4.42),
      new THREE.MeshStandardMaterial({ color: 0x14181d, roughness: 0.5 }));
    stripe.position.y = 0.62;
    g.add(stripe);
    const barBase = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.14, 0.4),
      new THREE.MeshStandardMaterial({ color: 0x222222 }));
    barBase.position.set(0, 1.42, -0.25);
    g.add(barBase);
    const red = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.16, 0.42),
      new THREE.MeshStandardMaterial({ color: 0xff2020, emissive: 0xff0000, emissiveIntensity: 1.5 }));
    red.position.set(-0.28, 1.42, -0.25);
    const blue = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.16, 0.42),
      new THREE.MeshStandardMaterial({ color: 0x2040ff, emissive: 0x0022ff, emissiveIntensity: 1.5 }));
    blue.position.set(0.28, 1.42, -0.25);
    g.add(red); g.add(blue);
    g.userData.lightRed = red; g.userData.lightBlue = blue;
  }
  g.userData.wheels = wheels;
  return g;
}

// A car is always { group, pos, yaw, speed, ... } — pos IS group.position,
// set at construction and never replaced, so readers can always use .pos.
export function makeCar(scene, x, z, yaw, color, name, opts) {
  const o = opts || {};
  const group = makeCarMesh(color, !!o.police);
  group.position.set(x, 0, z);
  group.rotation.y = yaw;
  scene.add(group);
  return {
    group,
    pos: group.position,
    yaw,
    speed: 0,
    color,
    name: name || 'Car',
    police: !!o.police,
    stolen: false,
    parked: !!o.parked,
    target: !!o.target,
    driveYaw: yaw,
    steerVis: 0,
  };
}

export function updateCarVisual(car) {
  car.group.rotation.y = car.yaw;
  const spin = car.speed * 0.5;
  for (const w of car.group.userData.wheels || []) w.rotation.x += spin * 0.016;
}

export class ParkedCars {
  constructor(scene, spots) {
    const rng = mulberry32(777);
    this.cars = spots.map((s, i) => {
      const color = CAR_COLORS[i % CAR_COLORS.length];
      return makeCar(scene, s.x, s.z, s.yaw, color, CAR_NAMES[i % CAR_NAMES.length], { parked: true });
    });
    this.rng = rng;
  }
  // Nearest stealable parked car within range of a point, or null.
  nearestStealable(x, z, range) {
    let best = null, bestD = range;
    for (const c of this.cars) {
      if (!c.parked) continue;
      const d = Math.hypot(c.pos.x - x, c.pos.z - z);
      if (d < bestD) { bestD = d; best = c; }
    }
    return best;
  }
  all() { return this.cars; }
}

export class TrafficSystem {
  constructor(scene, roadLoops) {
    const rng = mulberry32(4242);
    this.cars = [];
    const used = new Set();
    for (let i = 0; i < 10; i++) {
      let loopIdx = Math.floor(rng() * roadLoops.length);
      if (used.has(loopIdx)) loopIdx = (loopIdx + 7) % roadLoops.length;
      used.add(loopIdx);
      const loop = roadLoops[loopIdx];
      const seg = Math.floor(rng() * 4);
      const a = loop[seg], b = loop[(seg + 1) % 4];
      const t = rng();
      const x = a.x + (b.x - a.x) * t;
      const z = a.z + (b.z - a.z) * t;
      const yaw = Math.atan2(b.x - a.x, b.z - a.z);
      const color = pick(rng, CAR_COLORS);
      const car = makeCar(scene, x, z, yaw, color, 'Traffic', {});
      car.loop = loop;
      car.seg = seg;
      car.segT = t;
      car.cruise = 7 + rng() * 4;
      car.speed = car.cruise;
      this.cars.push(car);
    }
  }
  update(dt) {
    for (const c of this.cars) {
      const loop = c.loop;
      const a = loop[c.seg], b = loop[(c.seg + 1) % 4];
      const segLen = Math.hypot(b.x - a.x, b.z - a.z);
      c.segT += (c.speed * dt) / segLen;
      if (c.segT >= 1) {
        c.segT = 0;
        c.seg = (c.seg + 1) % 4;
      }
      const na = loop[c.seg], nb = loop[(c.seg + 1) % 4];
      c.pos.x = na.x + (nb.x - na.x) * c.segT;
      c.pos.z = na.z + (nb.z - na.z) * c.segT;
      const targetYaw = Math.atan2(nb.x - na.x, nb.z - na.z);
      c.yaw = angleLerp(c.yaw, targetYaw, Math.min(1, dt * 6));
      updateCarVisual(c);
    }
  }
  all() { return this.cars; }
}

// Arcade driving for the player's car. `input` is {forward, back, left, right, handbrake}.
export function driveCar(car, input, dt, colliders, resolveFn) {
  const accelInput = input.forward ? 1 : (input.back ? -0.6 : 0);
  if (accelInput > 0) car.speed += CAR.accel * dt;
  else if (accelInput < 0) car.speed -= CAR.brake * 0.55 * dt;
  else car.speed -= Math.sign(car.speed) * Math.min(Math.abs(car.speed), 6 * dt);
  if (input.handbrake) car.speed -= Math.sign(car.speed) * Math.min(Math.abs(car.speed), 22 * dt);
  car.speed = clamp(car.speed, -CAR.reverseTop, CAR.topSpeed);
  const steerDir = input.left ? 1 : (input.right ? -1 : 0);
  const spdFactor = clamp(Math.abs(car.speed) / 12, 0, 1);
  car.yaw += steerDir * CAR.steer * spdFactor * dt * Math.sign(car.speed || 1);
  const nx = car.pos.x + Math.sin(car.yaw) * car.speed * dt;
  const nz = car.pos.z + Math.cos(car.yaw) * car.speed * dt;
  const oldX = car.pos.x, oldZ = car.pos.z;
  car.pos.x = nx; car.pos.z = nz;
  if (resolveFn && resolveFn(car.pos, 1.6, colliders)) {
    // Hit a building: stop dead and slide back out.
    if (Math.abs(car.pos.x - oldX) > 0.01 || Math.abs(car.pos.z - oldZ) > 0.01) car.speed *= 0.25;
  }
  updateCarVisual(car);
  return car.speed;
}
