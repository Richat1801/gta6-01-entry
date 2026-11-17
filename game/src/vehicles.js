// Solmar Bay: vehicles. One job: build car meshes, park the 14 stealable cars,
// drive the player's car, and run the traffic AI on the road grid.

import * as THREE from 'three';
import { CAR, PALETTE, clamp, lerp, rand, randInt, pick, roadCentres, dist2, angleLerp } from './config.js';
import { resolveColliderPush } from './city.js';

const MODELS = {
  sedan: { w: 1.9, l: 4.4, h: 0.75, cabin: 0.62 },
  coupe: { w: 1.8, l: 4.0, h: 0.6, cabin: 0.5 },
  suv: { w: 2.0, l: 4.8, h: 1.0, cabin: 0.85 },
  truck: { w: 2.1, l: 5.6, h: 1.1, cabin: 0.9 },
  cruiser: { w: 1.95, l: 4.6, h: 0.78, cabin: 0.62 },
};

export function createCarMesh(modelName, color, police = false) {
  const m = MODELS[modelName] || MODELS.sedan;
  const car = new THREE.Group();
  car.name = 'car-' + modelName;
  const paint = new THREE.MeshLambertMaterial({ color: police ? 0xf2f3f4 : color });
  const body = new THREE.Mesh(new THREE.BoxGeometry(m.w, m.h, m.l), paint);
  body.position.y = 0.55;
  body.castShadow = true;
  car.add(body);
  const glass = new THREE.MeshLambertMaterial({ color: 0x1c2733 });
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(m.w * 0.86, m.cabin, m.l * 0.5), glass);
  cabin.position.set(0, 0.55 + m.h / 2 + m.cabin / 2 - 0.06, -m.l * 0.06);
  cabin.castShadow = true;
  car.add(cabin);
  const wheelGeo = new THREE.CylinderGeometry(0.36, 0.36, 0.28, 12);
  const wheelMat = new THREE.MeshLambertMaterial({ color: 0x141414 });
  car.userData.wheels = [];
  for (const [wx, wz] of [[-m.w / 2, m.l * 0.32], [m.w / 2, m.l * 0.32], [-m.w / 2, -m.l * 0.32], [m.w / 2, -m.l * 0.32]]) {
    const wheel = new THREE.Mesh(wheelGeo, wheelMat);
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(wx, 0.36, wz);
    car.add(wheel);
    car.userData.wheels.push(wheel);
  }
  const headMat = new THREE.MeshBasicMaterial({ color: 0xfff6c8 });
  for (const s of [-1, 1]) {
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.16, 0.08), headMat);
    head.position.set(s * m.w * 0.32, 0.62, m.l / 2 + 0.02);
    car.add(head);
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.16, 0.08), new THREE.MeshBasicMaterial({ color: 0xff2d2d }));
    tail.position.set(s * m.w * 0.32, 0.62, -m.l / 2 - 0.02);
    car.add(tail);
  }
  if (police) {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.18, 0.3), new THREE.MeshLambertMaterial({ color: 0x111111 }));
    bar.position.set(0, 0.55 + m.h / 2 + m.cabin + 0.05, 0);
    car.add(bar);
    const red = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.16, 0.32), new THREE.MeshBasicMaterial({ color: 0xff2020 }));
    red.position.set(-0.28, 0.55 + m.h / 2 + m.cabin + 0.16, 0);
    car.add(red);
    const blue = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.16, 0.32), new THREE.MeshBasicMaterial({ color: 0x2040ff }));
    blue.position.set(0.28, 0.55 + m.h / 2 + m.cabin + 0.16, 0);
    car.add(blue);
    car.userData.lightRed = red;
    car.userData.lightBlue = blue;
    const door = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.5, 1.4), new THREE.MeshBasicMaterial({ color: 0x1a1a1a }));
    door.position.set(-m.w / 2 - 0.02, 0.6, 0);
    car.add(door);
  }
  car.userData.model = modelName;
  car.userData.length = m.l;
  return car;
}

export class VehicleSystem {
  constructor(scene, colliders, onCrime) {
    this.scene = scene;
    this.colliders = colliders;
    this.onCrime = onCrime; // (stars, reason) => void
    this.parked = [];        // stealable cars the player can take
    this.traffic = [];       // AI cars on the roads
    this.playerCar = null;   // the car the player is driving, or null
    this._buildParked();
    this._buildTraffic();
  }

  _parkedSpot(i) {
    const centres = roadCentres();
    const c = centres[i % centres.length];
    const along = -180 + ((i * 53) % 360);
    const horizontal = i % 2 === 0;
    const off = (i % 3 === 0 ? -1 : 1) * 4.2;
    return horizontal
      ? { x: along, z: c + off, yaw: off > 0 ? Math.PI / 2 : -Math.PI / 2 }
      : { x: c + off, z: along, yaw: off > 0 ? 0 : Math.PI };
  }

  _buildParked() {
    const models = ['sedan', 'coupe', 'suv', 'truck', 'sedan', 'coupe', 'suv', 'sedan', 'truck', 'coupe', 'sedan', 'suv', 'sedan', 'coupe'];
    for (let i = 0; i < 14; i++) {
      const spot = this._parkedSpot(i);
      const mesh = createCarMesh(models[i], pick(PALETTE.car));
      mesh.position.set(spot.x, 0, spot.z);
      mesh.rotation.y = spot.yaw;
      this.scene.add(mesh);
      this.parked.push({ mesh, model: models[i], yaw: spot.yaw, speed: 0, taken: false });
    }
  }

  _buildTraffic() {
    const centres = roadCentres();
    for (let i = 0; i < 10; i++) {
      const horizontal = i % 2 === 0;
      const c = pick(centres);
      const mesh = createCarMesh(pick(['sedan', 'coupe', 'suv']), pick(PALETTE.car));
      const along = rand(-190, 190);
      mesh.position.set(horizontal ? along : c, 0, horizontal ? c : along);
      const dir = Math.random() < 0.5 ? 1 : -1;
      mesh.rotation.y = horizontal ? (dir > 0 ? Math.PI / 2 : -Math.PI / 2) : (dir > 0 ? 0 : Math.PI);
      this.scene.add(mesh);
      this.traffic.push({
        mesh, horizontal, road: c, dir, speed: rand(7, 12),
        targetSpeed: rand(7, 12), waitAt: 0, stopped: false,
      });
    }
  }

  nearestParked(x, z, maxDist) {
    let best = null, bd = maxDist;
    for (const p of this.parked) {
      if (p.taken) continue;
      const d = dist2(x, z, p.mesh.position.x, p.mesh.position.z);
      if (d < bd) { bd = d; best = p; }
    }
    return best;
  }

  stealCar(parkedCar) {
    parkedCar.taken = true;
    this.playerCar = parkedCar;
    this.onCrime(1, 'car theft');
    return parkedCar;
  }

  exitCar() {
    if (!this.playerCar) return null;
    const car = this.playerCar;
    car.speed = 0;
    this.playerCar = null;
    this.parked.push(car); // it stays parked where it stopped, stealable again
    return car;
  }

  updatePlayerCar(dt, axes, colliders, peds, onPedHit) {
    const car = this.playerCar;
    if (!car) return 0;
    const mesh = car.mesh;
    const fwd = axes.y;
    const steer = axes.x;
    if (fwd > 0) car.speed += CAR.accel * dt;
    else if (fwd < 0) car.speed -= (car.speed > 0.5 ? CAR.brake : CAR.reverseAccel) * dt;
    else car.speed -= Math.sign(car.speed) * CAR.drag * 4 * dt;
    if (Math.abs(car.speed) < 0.15 && fwd === 0) car.speed = 0;
    car.speed = clamp(car.speed, -CAR.maxReverse, CAR.maxSpeed);
    const steerAmount = steer * CAR.turnRate * dt * clamp(Math.abs(car.speed) / 8, 0, 1) * Math.sign(car.speed || 1);
    car.yaw -= steerAmount;
    mesh.rotation.y = car.yaw;
    const nx = mesh.position.x + Math.sin(car.yaw) * car.speed * dt;
    const nz = mesh.position.z + Math.cos(car.yaw) * car.speed * dt;
    const pushed = resolveColliderPush(nx, nz, 1.6, colliders);
    if (pushed.x !== nx || pushed.z !== nz) {
      car.speed *= 0.4;
      if (Math.abs(car.speed) > 6) this.onCrime(0, 'crash');
    }
    mesh.position.x = clamp(pushed.x, -335, 335);
    mesh.position.z = clamp(pushed.z, -335, 335);
    // Wheels spin.
    for (const w of mesh.userData.wheels) w.rotation.x += car.speed * dt * 2.2;
    // Running over a pedestrian at speed is a crime.
    if (Math.abs(car.speed) > 8) {
      for (const ped of peds) {
        if (!ped.down && dist2(mesh.position.x, mesh.position.z, ped.mesh.position.x, ped.mesh.position.z) < 2.2) {
          onPedHit(ped);
        }
      }
    }
    return car.speed;
  }

  updateTraffic(dt, playerPos, playerCar) {
    const centres = roadCentres();
    for (const t of this.traffic) {
      // Stop for a car ahead on the same lane.
      let ahead = Infinity;
      const others = [...this.traffic];
      if (playerCar) others.push({ mesh: playerCar.mesh, horizontal: t.horizontal, road: t.road, dir: t.dir, speed: Math.abs(playerCar.speed || 0) });
      for (const o of others) {
        if (o === t) continue;
        if (o.horizontal !== t.horizontal) continue;
        if (Math.abs((o.horizontal ? o.mesh.position.z : o.mesh.position.x) - t.road) > 3) continue;
        const alongT = t.horizontal ? t.mesh.position.x : t.mesh.position.z;
        const alongO = o.horizontal ? o.mesh.position.x : o.mesh.position.z;
        const rel = (alongO - alongT) * t.dir;
        if (rel > 0 && rel < ahead) ahead = rel;
      }
      t.stopped = ahead < 9;
      const target = t.stopped ? 0 : t.targetSpeed;
      t.speed = lerp(t.speed, target, clamp(dt * 2, 0, 1));
      // At an intersection, sometimes turn onto the crossing road.
      const along = t.horizontal ? t.mesh.position.x : t.mesh.position.z;
      const nearCentre = centres.find((c) => Math.abs(along - c) < t.speed * dt + 0.6);
      if (nearCentre !== undefined && Math.random() < dt * 0.25) {
        t.horizontal = !t.horizontal;
        t.road = nearCentre;
        t.dir = Math.random() < 0.5 ? 1 : -1;
      }
      const step = t.speed * t.dir * dt;
      if (t.horizontal) {
        t.mesh.position.x = clamp(t.mesh.position.x + step, -200, 200);
        t.mesh.position.z = t.road;
        t.mesh.rotation.y = t.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
      } else {
        t.mesh.position.z = clamp(t.mesh.position.z + step, -200, 200);
        t.mesh.position.x = t.road;
        t.mesh.rotation.y = t.dir > 0 ? 0 : Math.PI;
      }
      for (const w of t.mesh.userData.wheels) w.rotation.x += t.speed * dt * 2.2;
    }
  }

  _nearPlayer(t, playerPos) {
    if (!playerPos) return false;
    return dist2(t.mesh.position.x, t.mesh.position.z, playerPos.x, playerPos.z) < 16;
  }
}
