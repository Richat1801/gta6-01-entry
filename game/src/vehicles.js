// Solmar Bay — vehicles: the player-drivable car factory and the traffic
// system. Traffic cars cruise the road grid, turn at intersections and slow
// for the car ahead; parked cars wait to be stolen.
import * as THREE from 'three';
import { CITY, makeRng, pick, resolveCollisions, clampCity } from './config.js';

const CAR_COLORS = [0xd23c2e, 0x2e6fd2, 0xe8c33a, 0x3ad2a0, 0xe8e8e8, 0x22252a, 0x8a4fd2, 0xd27f2e, 0x5a8a3a];
const CAR_NAMES = ['Comet', 'Vagabond', 'Sunrunner', 'Marlin', 'Palm GT', 'Coaster', 'Dune', 'Bayliner'];

/** Build one low-poly car mesh. `police` gives it a black-and-white livery. */
export function makeCarMesh(color, police = false) {
  const car = new THREE.Group();
  const paint = new THREE.MeshStandardMaterial({ color, roughness: 0.35, metalness: 0.55 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x14161a, roughness: 0.4, metalness: 0.3 });
  const glass = new THREE.MeshStandardMaterial({ color: 0x9fd8ef, roughness: 0.1, metalness: 0.7 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.62, 4.4), paint);
  body.position.y = 0.55; body.castShadow = true;
  car.add(body);
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.55, 2.2), police ? paint : glass);
  cabin.position.set(0, 1.1, -0.2); cabin.castShadow = true;
  car.add(cabin);
  const wheelGeo = new THREE.CylinderGeometry(0.36, 0.36, 0.3, 12);
  wheelGeo.rotateZ(Math.PI / 2);
  for (const [x, z] of [[-0.95, 1.45], [0.95, 1.45], [-0.95, -1.45], [0.95, -1.45]]) {
    const w = new THREE.Mesh(wheelGeo, dark);
    w.position.set(x, 0.36, z);
    car.add(w);
  }
  const lightMat = new THREE.MeshStandardMaterial({ color: 0xfff2b0, emissive: 0xffdf6a, emissiveIntensity: 0.8 });
  for (const x of [-0.6, 0.6]) {
    const h = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.18, 0.1), lightMat);
    h.position.set(x, 0.62, 2.21);
    car.add(h);
  }
  if (police) {
    const barMat = new THREE.MeshStandardMaterial({ color: 0x2244ff, emissive: 0x2244ff, emissiveIntensity: 1.2 });
    const barMat2 = new THREE.MeshStandardMaterial({ color: 0xff2222, emissive: 0xff2222, emissiveIntensity: 1.2 });
    const b1 = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.18, 0.3), barMat);
    b1.position.set(-0.4, 1.5, -0.2);
    const b2 = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.18, 0.3), barMat2);
    b2.position.set(0.4, 1.5, -0.2);
    car.add(b1, b2);
    car.userData.lightbar = [b1, b2];
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(2.02, 0.2, 4.42),
      new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.5 }));
    stripe.position.y = 0.72;
    car.add(stripe);
  }
  car.userData.wheels = [];
  return car;
}

/** One drivable car: arcade physics, building collision, skid state. */
export class Car {
  constructor(mesh, x, z, heading, name) {
    this.mesh = mesh;
    this.pos = new THREE.Vector3(x, 0, z);
    this.heading = heading;
    this.speed = 0;
    this.name = name || 'Car';
    this.police = false;
    this.stolen = false;
    this.skidding = false;
    this.mesh.position.copy(this.pos);
    this.mesh.rotation.y = heading;
  }

  /** Arcade drive step. input: {throttle, brake, steer, handbrake}. */
  drive(input, dt, colliders, topSpeed) {
    const accel = 22, brakeForce = 34, drag = 0.6;
    if (input.throttle) this.speed += accel * dt;
    if (input.brake) this.speed -= brakeForce * dt * Math.sign(this.speed || 1);
    if (!input.throttle && !input.brake) this.speed -= this.speed * drag * dt;
    if (input.handbrake) this.speed -= this.speed * 2.2 * dt;
    this.speed = THREE.MathUtils.clamp(this.speed, -12, topSpeed || 46);
    if (Math.abs(this.speed) < 0.05 && !input.throttle) this.speed = 0;
    const steerAmount = input.steer * (this.speed >= 0 ? 1 : -1);
    const turnRate = 1.9 * Math.min(1, Math.abs(this.speed) / 10) * (input.handbrake ? 1.5 : 1);
    this.heading -= steerAmount * turnRate * dt * Math.sign(this.speed || 1);
    this.skidding = input.handbrake && Math.abs(this.speed) > 8;
    const nx = this.pos.x + Math.sin(this.heading) * this.speed * dt;
    const nz = this.pos.z + Math.cos(this.heading) * this.speed * dt;
    const old = this.pos.clone();
    this.pos.x = nx; this.pos.z = nz;
    clampCity(this.pos, 3);
    resolveCollisions(this.pos, 2.1, colliders);
    // Hard hit on a building kills speed.
    if (this.pos.distanceTo(old) < Math.abs(this.speed) * dt * 0.55) this.speed *= 0.35;
    this.mesh.position.copy(this.pos);
    this.mesh.rotation.y = this.heading;
    this.mesh.rotation.z = this.skidding ? -steerAmount * 0.08 : 0;
  }
}

/** Traffic + parked cars. */
export class TrafficManager {
  constructor(scene, colliders) {
    this.scene = scene;
    this.colliders = colliders;
    this.rng = makeRng(777);
    this.cars = [];       // moving traffic {mesh,pos,heading,speed,axis,dir,lane}
    this.parked = [];     // stealable parked Car instances
    this.spawnParked();
    for (let i = 0; i < 14; i++) this.spawnTraffic();
  }

  spawnParked() {
    // Parked on the roads themselves (lane offset), never inside a block.
    const spots = [
      [12, 5.5, Math.PI / 2], [-40, -52.5, Math.PI / 2], [70, 63.5, -Math.PI / 2],
      [-70, -110.5, Math.PI / 2], [128, 121.5, -Math.PI / 2], [-128, 179.5, Math.PI / 2],
      [63.5, 40, 0], [-52.5, -70, Math.PI], [121.5, -24, 0], [-179.5, 70, Math.PI],
      [5.5, 121.5, Math.PI / 2], [179.5, -40, 0], [-63.5, 128, 0], [40, -63.5, -Math.PI / 2],
    ];
    for (const [x, z, h] of spots) {
      const mesh = makeCarMesh(pick(this.rng, CAR_COLORS));
      const car = new Car(mesh, x, z, h, pick(this.rng, CAR_NAMES));
      this.scene.add(mesh);
      this.parked.push(car);
    }
  }

  spawnTraffic() {
    const horizontal = this.rng() < 0.5;
    const line = pick(this.rng, CITY.roadLines);
    const dir = this.rng() < 0.5 ? 1 : -1;
    const along = -190 + this.rng() * 380;
    const mesh = makeCarMesh(pick(this.rng, CAR_COLORS));
    const heading = horizontal ? (dir > 0 ? Math.PI / 2 : -Math.PI / 2) : (dir > 0 ? 0 : Math.PI);
    mesh.position.set(horizontal ? along : line + dir * 3.2, 0, horizontal ? line + dir * 3.2 : along);
    mesh.rotation.y = heading;
    this.scene.add(mesh);
    this.cars.push({
      mesh, horizontal, line, dir, along,
      speed: 9 + this.rng() * 7,
      lane: dir * 3.2,
    });
  }

  /** Move traffic along roads, turning at intersections, slowing for cars ahead. */
  update(dt, playerPos, playerCar) {
    for (const c of this.cars) {
      let target = c.speed;
      // Slow if another car is close ahead on the same road.
      const ahead = this.cars.concat(this.parked.map((p) => ({ pos: p.pos, mesh: p.mesh })));
      for (const o of ahead) {
        if (o === c) continue;
        const op = o.pos || o.mesh.position;
        const dx = op.x - c.mesh.position.x, dz = op.z - c.mesh.position.z;
        const dist = Math.hypot(dx, dz);
        if (dist < 12) {
          const fwdX = Math.sin(c.mesh.rotation.y), fwdZ = Math.cos(c.mesh.rotation.y);
          if (dx * fwdX + dz * fwdZ > 0) target = Math.min(target, 3);
        }
      }
      if (playerCar && playerCar.pos.distanceTo(c.mesh.position) < 12) target = Math.min(target, 2);
      c.speed += (target - c.speed) * Math.min(1, dt * 2);
      c.along += c.dir * c.speed * dt;
      // Turn at a random intersection.
      const atLine = CITY.roadLines.some((l) => Math.abs(c.along - l) < c.speed * dt + 0.6);
      if (atLine && this.rng() < 0.012) {
        const cross = c.horizontal ? c.mesh.position.z : c.mesh.position.x;
        const newLine = c.line;
        c.horizontal = !c.horizontal;
        c.line = Math.round(cross / CITY.pitch) * CITY.pitch;
        c.along = newLine;
        c.dir = this.rng() < 0.5 ? 1 : -1;
      }
      if (c.along > 205) c.along = -205;
      if (c.along < -205) c.along = 205;
      const x = c.horizontal ? c.along : c.line + c.lane;
      const z = c.horizontal ? c.line + c.lane : c.along;
      c.mesh.position.set(x, 0, z);
      const heading = c.horizontal ? (c.dir > 0 ? Math.PI / 2 : -Math.PI / 2) : (c.dir > 0 ? 0 : Math.PI);
      c.mesh.rotation.y = heading;
    }
  }

  /** Nearest parked (or traffic) car within range of a point. */
  nearestCar(pos, range) {
    let best = null, bd = range;
    for (const car of this.parked) {
      const d = car.pos.distanceTo(pos);
      if (d < bd) { bd = d; best = car; }
    }
    return best;
  }

  allCarPositions() {
    return this.cars.map((c) => c.mesh.position).concat(this.parked.map((p) => p.pos));
  }
}
