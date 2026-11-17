// Solmar Bay vehicles: car meshes, the 14 stealable parked cars, traffic AI and driving.
// One job: everything with four wheels.

import * as THREE from 'three';
import { WORLD, DRIVING, TRAFFIC, PARKED_CARS, CAR_MODELS, roadCenter, nearestRoadCoord, rand, randInt, pick, clamp, angleLerp } from './config.js';
import { resolveBuildingCollision } from './city.js';

const BODY_GEO = new THREE.BoxGeometry(1, 1, 1);
const WHEEL_GEO = new THREE.CylinderGeometry(0.42, 0.42, 0.3, 12);

/** Build a stylised car mesh for a model + colour. Returns { group, wheels[] }. */
export function buildCarMesh(model, color) {
  const group = new THREE.Group();
  const paint = new THREE.MeshLambertMaterial({ color });
  const glass = new THREE.MeshLambertMaterial({ color: 0x1a2733 });
  const dark = new THREE.MeshLambertMaterial({ color: 0x1c1e22 });

  const long = model === 'van' || model === 'truck' ? 5.2 : 4.4;
  const tall = model === 'van' ? 1.5 : 0.85;
  const body = new THREE.Mesh(BODY_GEO, paint);
  body.scale.set(2, tall, long);
  body.position.y = 0.75;
  group.add(body);

  const cabin = new THREE.Mesh(BODY_GEO, model === 'van' ? paint : glass);
  cabin.scale.set(1.7, model === 'van' ? 0.9 : 0.7, model === 'truck' ? 1.2 : 2.1);
  cabin.position.set(0, tall + 0.55, model === 'truck' ? -1.2 : -0.2);
  group.add(cabin);

  if (model === 'taxi') {
    const sign = new THREE.Mesh(BODY_GEO, new THREE.MeshBasicMaterial({ color: 0xffe066 }));
    sign.scale.set(0.9, 0.28, 0.5);
    sign.position.set(0, tall + 1.05, -0.2);
    group.add(sign);
  }
  if (model === 'truck') {
    const bed = new THREE.Mesh(BODY_GEO, dark);
    bed.scale.set(1.8, 0.5, 1.8);
    bed.position.set(0, 1.35, 1.4);
    group.add(bed);
  }

  const headMat = new THREE.MeshBasicMaterial({ color: 0xfff6c0 });
  for (const s of [-1, 1]) {
    const head = new THREE.Mesh(BODY_GEO, headMat);
    head.scale.set(0.35, 0.22, 0.1);
    head.position.set(s * 0.7, 0.75, long / 2 + 0.02);
    group.add(head);
    const tail = new THREE.Mesh(BODY_GEO, new THREE.MeshBasicMaterial({ color: 0xff2a2a }));
    tail.scale.set(0.35, 0.22, 0.1);
    tail.position.set(s * 0.7, 0.75, -long / 2 - 0.02);
    group.add(tail);
  }

  const wheels = [];
  const wheelMat = new THREE.MeshLambertMaterial({ color: 0x141414 });
  for (const [wx, wz] of [[-0.95, 1.45], [0.95, 1.45], [-0.95, -1.45], [0.95, -1.45]]) {
    const w = new THREE.Mesh(WHEEL_GEO, wheelMat);
    w.rotation.z = Math.PI / 2;
    w.position.set(wx, 0.42, wz);
    group.add(w);
    wheels.push(w);
  }
  group.userData.length = long;
  return { group, wheels };
}

/** A police cruiser: black-and-white body with a light bar. */
export function buildPoliceMesh() {
  const { group, wheels } = buildCarMesh('sedan', 0x101418);
  const stripe = new THREE.Mesh(BODY_GEO, new THREE.MeshLambertMaterial({ color: 0xf2f2f2 }));
  stripe.scale.set(2.02, 0.3, 2.2);
  stripe.position.set(0, 0.95, -0.4);
  group.add(stripe);
  const bar = new THREE.Mesh(BODY_GEO, new THREE.MeshBasicMaterial({ color: 0xff2222 }));
  bar.scale.set(1.1, 0.22, 0.4);
  bar.position.set(0, 1.62, -0.2);
  group.add(bar);
  const bar2 = new THREE.Mesh(BODY_GEO, new THREE.MeshBasicMaterial({ color: 0x2255ff }));
  bar2.scale.set(1.1, 0.22, 0.4);
  bar2.position.set(0, 1.62, 0.25);
  group.add(bar2);
  group.userData.lightBar = [bar, bar2];
  return { group, wheels };
}

function roadsideSpots() {
  const spots = [];
  const seen = new Set();
  let guard = 0;
  while (spots.length < PARKED_CARS && guard++ < 400) {
    const k = randInt(0, WORLD.gridBlocks - 1);
    const along = rand(30, WORLD.citySpan - 30);
    const horizontal = Math.random() < 0.5;
    const side = Math.random() < 0.5 ? -1 : 1;
    const x = horizontal ? along : roadCenter(k) + side * 5.4;
    const z = horizontal ? roadCenter(k) + side * 5.4 : along;
    const key = Math.round(x / 14) + ',' + Math.round(z / 14);
    if (seen.has(key)) continue;
    seen.add(key);
    spots.push({ x, z, angle: horizontal ? 0 : Math.PI / 2 });
  }
  return spots;
}

/** Park the 14 stealable cars along the roads. Returns the car records. */
export function spawnParkedCars(scene) {
  const cars = [];
  const spots = roadsideSpots();
  spots.forEach((spot, i) => {
    const spec = CAR_MODELS[i % CAR_MODELS.length];
    const color = i === 0 ? 0xd83a3a : pick([0x3a7bd5, 0xd83a3a, 0xf2c230, 0x8a8f98, 0x2e8b57, 0xff7a1a, 0xe8e4da, 0x7a4a9e]);
    const { group, wheels } = buildCarMesh(spec.model, color);
    group.position.set(spot.x, 0, spot.z);
    group.rotation.y = spot.angle + (Math.random() < 0.5 ? Math.PI : 0);
    scene.add(group);
    cars.push({
      id: i, spec, color, mesh: group, wheels,
      x: spot.x, z: spot.z, angle: group.rotation.y,
      speed: 0, steer: 0, stolen: false, parked: true, marked: i === 0,
    });
    if (i === 0) {
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(3.4, 0.18, 8, 32),
        new THREE.MeshBasicMaterial({ color: 0xffd23e })
      );
      ring.rotation.x = Math.PI / 2;
      ring.position.set(spot.x, 0.25, spot.z);
      scene.add(ring);
      cars[0].markerRing = ring;
    }
  });
  return cars;
}

/** Spawn the ambient traffic cars that loop the road grid. */
export function spawnTrafficCars(scene) {
  const cars = [];
  for (let i = 0; i < TRAFFIC.count; i++) {
    const spec = pick(CAR_MODELS);
    const { group, wheels } = buildCarMesh(spec.model, pick([0x3a7bd5, 0xe8e4da, 0x8a8f98, 0x2e8b57, 0xc96a3a]));
    const horizontal = Math.random() < 0.5;
    const k = randInt(0, WORLD.gridBlocks - 1);
    const lane = Math.random() < 0.5 ? -3.6 : 3.6;
    const along = rand(20, WORLD.citySpan - 20);
    const x = horizontal ? along : roadCenter(k) + lane;
    const z = horizontal ? roadCenter(k) + lane : along;
    const dir = Math.random() < 0.5 ? 1 : -1;
    group.position.set(x, 0, z);
    scene.add(group);
    cars.push({
      mesh: group, wheels, horizontal, dir,
      speed: rand(TRAFFIC.speedMin, TRAFFIC.speedMax),
      x, z, angle: horizontal ? (dir > 0 ? Math.PI / 2 : -Math.PI / 2) : (dir > 0 ? 0 : Math.PI),
      wait: 0,
    });
  }
  return cars;
}

function carAhead(cars, self) {
  for (const o of cars) {
    if (o === self) continue;
    const dx = o.x - self.x;
    const dz = o.z - self.z;
    const forward = self.horizontal ? dx * self.dir : dz * self.dir;
    const lateral = self.horizontal ? Math.abs(dz) : Math.abs(dx);
    if (forward > 0 && forward < 9 && lateral < 3) return true;
  }
  return false;
}

/** Advance every traffic car one step along the grid; they turn at intersections. */
export function updateTrafficCars(cars, dt) {
  for (const c of cars) {
    if (c.wait > 0) {
      c.wait -= dt;
      continue;
    }
    if (carAhead(cars, c)) continue;
    const step = c.speed * dt;
    if (c.horizontal) c.x += step * c.dir;
    else c.z += step * c.dir;
    const axis = c.horizontal ? c.x : c.z;
    const near = nearestRoadCoord(axis);
    if (Math.abs(axis - near) < step && Math.random() < 0.55) {
      // At an intersection: maybe turn onto the crossing road.
      if (Math.random() < 0.5) {
        c.dir = Math.random() < 0.5 ? 1 : -1;
        if (c.horizontal) {
          c.x = near + (c.dir > 0 ? 3.6 : -3.6);
          c.horizontal = false;
        } else {
          c.z = near + (c.dir > 0 ? 3.6 : -3.6);
          c.horizontal = true;
        }
      }
      if (Math.random() < 0.12) c.wait = rand(0.8, 2.2);
    }
    // Wrap around the city edge.
    if (c.x < 0) c.x = WORLD.citySpan;
    if (c.x > WORLD.citySpan) c.x = 0;
    if (c.z < 0) c.z = WORLD.citySpan;
    if (c.z > WORLD.citySpan) c.z = 0;
    c.angle = c.horizontal ? (c.dir > 0 ? Math.PI / 2 : -Math.PI / 2) : (c.dir > 0 ? 0 : Math.PI);
    c.mesh.position.set(c.x, 0, c.z);
    c.mesh.rotation.y = c.angle;
    for (const w of c.wheels) w.rotation.x += (c.speed * dt) / 0.42;
  }
}

/**
 * Arcade driving for the player's car. `input` carries forward/back/left/right booleans.
 * Returns the speed in m/s. Handles building collision and world bounds.
 */
export function updateDrivenCar(car, input, colliders, dt, onCrash) {
  const top = car.spec.topSpeed || DRIVING.maxSpeed;
  if (input.forward) car.speed += DRIVING.accel * dt;
  else if (input.back) car.speed -= DRIVING.brake * dt * 0.8;
  else car.speed *= Math.pow(0.4, dt);
  if (input.back && car.speed < 0) car.speed = Math.max(car.speed, -DRIVING.reverseMax);
  car.speed = clamp(car.speed, -DRIVING.reverseMax, top);
  const steerTarget = (input.left ? 1 : 0) - (input.right ? 1 : 0);
  car.steer = angleLerp(car.steer, steerTarget * 0.55, Math.min(1, dt * 6));
  // Let the car begin turning as it pulls away (throttle direction when stopped).
  const rollDir = Math.abs(car.speed) > 0.2 ? Math.sign(car.speed) : (input.forward ? 1 : input.back ? -1 : 0);
  const moving = Math.abs(car.speed) > 0.2 || input.forward || input.back;
  if (moving) {
    car.angle += (car.steer * DRIVING.steerRate * dt * rollDir) * clamp(Math.abs(car.speed) / 12, 0.25, 1);
  }
  const nx = car.x + Math.sin(car.angle) * car.speed * dt;
  const nz = car.z + Math.cos(car.angle) * car.speed * dt;
  const before = { x: car.x, z: car.z };
  car.x = clamp(nx, WORLD.minX + 4, WORLD.maxX - 4);
  car.z = clamp(nz, WORLD.minZ + 4, WORLD.maxZ - 4);
  const pos = { x: car.x, z: car.z };
  if (resolveBuildingCollision(colliders, pos, 2.2)) {
    const hitSpeed = Math.abs(car.speed);
    car.x = pos.x;
    car.z = pos.z;
    if (hitSpeed > 6 && onCrash) onCrash(hitSpeed);
    car.speed *= 0.55;
  } else {
    car.x = pos.x;
    car.z = pos.z;
  }
  if (Math.abs(car.x - before.x) < 0.001 && Math.abs(car.z - before.z) < 0.001 && moving) {
    car.speed *= 0.5;
  }
  car.mesh.position.set(car.x, 0, car.z);
  car.mesh.rotation.y = car.angle;
  for (const w of car.wheels) w.rotation.x += (car.speed * dt) / 0.42;
  if (car.markerRing) {
    car.markerRing.rotation.z += dt;
    car.markerRing.material.color.setHSL(0.13, 1, 0.5 + Math.sin(performance.now() / 200) * 0.15);
  }
  return car.speed;
}
