// Vehicles: stealable parked cars, arcade driving physics and the traffic
// AI that drives the road grid. A car is a THREE.Group with a body, cabin,
// wheels and lights; driving is a simple bicycle-ish arcade model.

import * as THREE from 'three';
import { CONFIG, PALETTE, clamp, rand, randPick, angleLerp, distance2D } from './config.js';
import { roadLines, resolveCircleCollision, isOnRoad } from './city.js';

const CAR_MODELS = [
  { name: 'Solmar GT', length: 4.4, width: 1.9, height: 0.62, cabin: 0.55, sporty: true },
  { name: 'Bay Cruiser', length: 4.8, width: 2.0, height: 0.72, cabin: 0.62, sporty: false },
  { name: 'Coast Pickup', length: 5.0, width: 2.0, height: 0.8, cabin: 0.6, sporty: false },
  { name: 'Sunset Coupe', length: 4.2, width: 1.85, height: 0.55, cabin: 0.5, sporty: true },
];

export function buildCarMesh(model, color) {
  const group = new THREE.Group();
  const paint = new THREE.MeshStandardMaterial({ color, roughness: 0.35, metalness: 0.55 });
  const glass = new THREE.MeshStandardMaterial({ color: 0x1a2a3a, roughness: 0.15, metalness: 0.7 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x14161a, roughness: 0.9 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(model.width, model.height, model.length), paint);
  body.position.y = 0.55;
  body.castShadow = true;
  group.add(body);
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(model.width * 0.82, model.cabin, model.length * 0.48), glass);
  cabin.position.set(0, 0.55 + model.height / 2 + model.cabin / 2 - 0.05, -model.length * 0.06);
  cabin.castShadow = true;
  group.add(cabin);
  // Wheels
  const wheelGeo = new THREE.CylinderGeometry(0.36, 0.36, 0.28, 12);
  wheelGeo.rotateZ(Math.PI / 2);
  const wheelPositions = [
    [-model.width / 2, 0.36, model.length * 0.32],
    [model.width / 2, 0.36, model.length * 0.32],
    [-model.width / 2, 0.36, -model.length * 0.32],
    [model.width / 2, 0.36, -model.length * 0.32],
  ];
  const wheels = [];
  for (const [wx, wy, wz] of wheelPositions) {
    const wheel = new THREE.Mesh(wheelGeo, dark);
    wheel.position.set(wx, wy, wz);
    group.add(wheel);
    wheels.push(wheel);
  }
  // Headlights and taillights (emissive so they read at a glance)
  const headMat = new THREE.MeshStandardMaterial({ color: 0xfff6c8, emissive: 0xffedb0, emissiveIntensity: 1.4 });
  const tailMat = new THREE.MeshStandardMaterial({ color: 0xd21f1f, emissive: 0xa01010, emissiveIntensity: 1.2 });
  for (const sx of [-1, 1]) {
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.14, 0.06), headMat);
    head.position.set(sx * model.width * 0.32, 0.62, model.length / 2 + 0.01);
    group.add(head);
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.14, 0.06), tailMat);
    tail.position.set(sx * model.width * 0.32, 0.62, -model.length / 2 - 0.01);
    group.add(tail);
  }
  group.userData.wheels = wheels;
  return group;
}

export class Car {
  constructor(model, color, x, z, heading, kind) {
    this.model = model;
    this.color = color;
    this.kind = kind; // 'parked' | 'traffic' | 'police' | 'player'
    this.mesh = buildCarMesh(model, color);
    this.mesh.position.set(x, 0, z);
    this.mesh.rotation.y = heading;
    this.heading = heading;
    this.speed = 0;
    this.steer = 0;
    this.occupied = false;
    this.stolen = false;
    this.radius = Math.max(model.length, model.width) * 0.55;
    // Traffic AI state
    this.axis = 'x';
    this.dir = 1;
    this.lane = 0;
    this.waitTimer = 0;
  }

  get x() { return this.mesh.position.x; }
  get z() { return this.mesh.position.z; }

  forwardVector() {
    return { x: Math.sin(this.heading), z: Math.cos(this.heading) };
  }
}

// Parked cars: 14 stealable cars lined along road edges across the city.
export function spawnParkedCars(scene) {
  const cars = [];
  const lines = roadLines();
  const spots = [];
  for (let i = 0; i < CONFIG.parkedCars; i++) {
    const line = lines[1 + Math.floor(Math.random() * (lines.length - 2))];
    const along = rand(-180, 180);
    const side = Math.random() < 0.5 ? -1 : 1;
    const vertical = Math.random() < 0.5;
    const x = vertical ? line + side * 4.6 : along;
    const z = vertical ? along : line + side * 4.6;
    const heading = vertical ? (side > 0 ? Math.PI : 0) : (side > 0 ? Math.PI / 2 : -Math.PI / 2);
    spots.push({ x, z, heading });
  }
  for (const s of spots) {
    const model = randPick(CAR_MODELS);
    const car = new Car(model, randPick(PALETTE.carPaint), s.x, s.z, s.heading, 'parked');
    scene.add(car.mesh);
    cars.push(car);
  }
  return cars;
}

// Traffic cars: 10 AI cars cruising the road grid, turning at intersections.
export function spawnTrafficCars(scene) {
  const cars = [];
  const lines = roadLines();
  for (let i = 0; i < CONFIG.trafficCars; i++) {
    const model = randPick(CAR_MODELS);
    const car = new Car(model, randPick(PALETTE.carPaint), 0, 0, 0, 'traffic');
    const axis = Math.random() < 0.5 ? 'x' : 'z';
    const line = randPick(lines);
    const along = rand(-190, 190);
    car.axis = axis;
    car.dir = Math.random() < 0.5 ? 1 : -1;
    car.lane = (Math.random() < 0.5 ? -1 : 1) * 3;
    if (axis === 'x') {
      car.mesh.position.set(along, 0, line + car.lane);
      car.heading = car.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
    } else {
      car.mesh.position.set(line + car.lane, 0, along);
      car.heading = car.dir > 0 ? 0 : Math.PI;
    }
    car.speed = rand(7, 11);
    scene.add(car.mesh);
    cars.push(car);
  }
  return cars;
}

// One traffic step: drive along the current road, slow for the car ahead,
// turn at a random intersection.
export function updateTrafficCar(car, dt, allCars, colliders) {
  if (car.waitTimer > 0) {
    car.waitTimer -= dt;
    return;
  }
  const lines = roadLines();
  // Slow down if another car is close ahead.
  const f = car.forwardVector();
  let nearest = Infinity;
  for (const other of allCars) {
    if (other === car) continue;
    const dx = other.x - car.x;
    const dz = other.z - car.z;
    const ahead = dx * f.x + dz * f.z;
    const side = Math.abs(dx * f.z - dz * f.x);
    if (ahead > 0 && ahead < 14 && side < 3.5) nearest = Math.min(nearest, ahead);
  }
  const targetSpeed = nearest < 14 ? 0 : rand(7, 11);
  car.speed = lerpSpeed(car.speed, targetSpeed, dt);
  const step = car.speed * dt;
  let nx = car.x + f.x * step;
  let nz = car.z + f.z * step;
  // Wrap around the city edge instead of driving into the sea.
  if (Math.abs(nx) > CONFIG.cityHalf + 4) nx = -Math.sign(nx) * (CONFIG.cityHalf + 4);
  if (Math.abs(nz) > CONFIG.cityHalf + 4) nz = -Math.sign(nz) * (CONFIG.cityHalf + 4);
  // At an intersection, sometimes turn onto the crossing road.
  const nearLine = lines.find((l) => Math.abs((car.axis === 'x' ? nx : nz) - l) < 1.2);
  if (nearLine !== undefined && Math.random() < 0.35) {
    if (car.axis === 'x') {
      car.axis = 'z';
      car.dir = Math.random() < 0.5 ? 1 : -1;
      car.lane = (Math.random() < 0.5 ? -1 : 1) * 3;
      car.mesh.position.set(nearLine + car.lane * 0 + car.lane, 0, nz);
      car.heading = car.dir > 0 ? 0 : Math.PI;
      car.waitTimer = 0.15;
    } else {
      car.axis = 'x';
      car.dir = Math.random() < 0.5 ? 1 : -1;
      car.lane = (Math.random() < 0.5 ? -1 : 1) * 3;
      car.mesh.position.set(nx, 0, nearLine + car.lane);
      car.heading = car.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
      car.waitTimer = 0.15;
    }
  } else {
    car.mesh.position.set(nx, 0, nz);
  }
  car.mesh.rotation.y = car.heading;
  // Spin wheels with speed.
  for (const w of car.mesh.userData.wheels) w.rotation.x += (car.speed * dt) / 0.36;
}

function lerpSpeed(current, target, dt) {
  const rate = target > current ? 2.2 : 4.5;
  const diff = target - current;
  const step = clamp(diff, -rate * dt * 10, rate * dt * 10);
  return current + step;
}

// Arcade driving for the player's car. input: {forward, back, left, right}.
export function drivePlayerCar(car, input, dt, colliders) {
  const accel = input.forward ? CONFIG.carAccel : 0;
  const braking = input.back ? CONFIG.carBrake : 0;
  if (input.forward) car.speed += accel * dt;
  else if (input.back) {
    car.speed -= car.speed > 0.5 ? braking * dt : CONFIG.carAccel * 0.6 * dt;
  } else {
    car.speed -= Math.sign(car.speed) * Math.min(Math.abs(car.speed), 9 * dt);
  }
  car.speed = clamp(car.speed, -CONFIG.carReverseMax, CONFIG.carMaxSpeed);
  const steerInput = (input.left ? 1 : 0) - (input.right ? 1 : 0);
  // Keep some steering authority even at low speed so U-turns and
  // parking moves stay possible; it grows with speed.
  const speedFactor = clamp(0.35 + Math.abs(car.speed) / 14, 0, 1);
  car.steer = angleLerp(car.steer, steerInput * speedFactor, Math.min(1, dt * 8));
  car.heading += car.steer * CONFIG.carTurnRate * dt * Math.sign(car.speed || 1) * (car.speed < 0 ? -1 : 1);
  const f = car.forwardVector();
  let nx = car.x + f.x * car.speed * dt;
  let nz = car.z + f.z * car.speed * dt;
  nx = clamp(nx, -CONFIG.cityHalf - 8, CONFIG.beachEnd - 6);
  nz = clamp(nz, -CONFIG.cityHalf - 8, CONFIG.cityHalf + 8);
  // Move axis by axis so the car slides along a wall instead of wedging
  // nose-first into it and stalling.
  const testX = resolveCircleCollision(nx, car.z, car.radius, colliders);
  if (testX.hit) car.speed *= 0.75;
  else car.mesh.position.x = testX.x;
  const testZ = resolveCircleCollision(car.mesh.position.x, nz, car.radius, colliders);
  if (testZ.hit) car.speed *= 0.75;
  else car.mesh.position.z = testZ.z;
  car.mesh.position.y = 0;
  car.mesh.rotation.y = car.heading;
  // Body roll and wheel spin sell the speed.
  car.mesh.rotation.z = -car.steer * 0.05 * Math.sign(car.speed || 1);
  for (const w of car.mesh.userData.wheels) w.rotation.x += (car.speed * dt) / 0.36;
  return { speed: car.speed, offRoad: !isOnRoad(car.mesh.position.x, car.mesh.position.z) };
}

// Nearest parked, unoccupied car within reach of a point.
export function nearestParkedCar(cars, x, z, maxDist) {
  let best = null;
  let bestD = maxDist;
  for (const car of cars) {
    if (car.kind !== 'parked' || car.occupied) continue;
    const d = distance2D(x, z, car.x, car.z);
    if (d < bestD) { bestD = d; best = car; }
  }
  return best;
}
