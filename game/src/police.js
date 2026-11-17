// Solmar Bay — the Solmar Bay Police Department: patrol cars that chase and
// ram, and officers on foot who chase and brawl. Wanted level drives spawns;
// hiding and time cool the heat down.
import * as THREE from 'three';
import { CITY, makeRng, pick, clampCity, resolveCollisions } from './config.js';
import { makeCarMesh, Car } from './vehicles.js';

function makeOfficerMesh() {
  const g = new THREE.Group();
  const navy = new THREE.MeshStandardMaterial({ color: 0x1c2f5e, roughness: 0.85 });
  const skin = new THREE.MeshStandardMaterial({ color: 0xe0ac69, roughness: 0.8 });
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.32, 10, 10), skin);
  head.position.y = 1.62;
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.36, 0.14, 10), navy);
  cap.position.y = 1.88;
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.66, 0.78, 0.36), navy);
  torso.position.y = 1.05;
  const legs = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.7, 0.3), navy);
  legs.position.y = 0.35;
  head.castShadow = torso.castShadow = true;
  g.add(head, cap, torso, legs);
  return g;
}

export class PoliceManager {
  constructor(scene, colliders, audio) {
    this.scene = scene;
    this.colliders = colliders;
    this.audio = audio;
    this.rng = makeRng(99);
    this.cars = [];      // Car instances (police)
    this.officers = [];  // {mesh,pos,heading,speed,attackCd}
    this.heatTimer = 0;  // wanted decay
    this.spawnTimer = 0;
    this.lightPhase = 0;
  }

  wantedCarCount(wanted) {
    return wanted <= 0 ? 0 : wanted <= 1 ? 1 : wanted <= 2 ? 2 : wanted <= 3 ? 3 : 4;
  }
  wantedOfficerCount(wanted) {
    return wanted <= 1 ? 0 : wanted <= 2 ? 2 : wanted <= 3 ? 4 : 6;
  }

  spawnCarNear(playerPos) {
    const line = pick(this.rng, CITY.roadLines);
    const horizontal = this.rng() < 0.5;
    const off = (this.rng() < 0.5 ? -1 : 1) * (55 + this.rng() * 40);
    const x = horizontal ? playerPos.x + off : line;
    const z = horizontal ? line : playerPos.z + off;
    const mesh = makeCarMesh(0xf2f2f2, true);
    const car = new Car(mesh, THREE.MathUtils.clamp(x, -200, 200), THREE.MathUtils.clamp(z, -200, 200), 0, 'SBPD Cruiser');
    car.police = true;
    this.scene.add(mesh);
    this.cars.push(car);
    return car;
  }

  spawnOfficerNear(playerPos) {
    const mesh = makeOfficerMesh();
    const a = this.rng() * Math.PI * 2;
    const x = playerPos.x + Math.sin(a) * (14 + this.rng() * 10);
    const z = playerPos.z + Math.cos(a) * (14 + this.rng() * 10);
    mesh.position.set(THREE.MathUtils.clamp(x, -205, 205), 0, THREE.MathUtils.clamp(z, -205, 225));
    this.scene.add(mesh);
    this.officers.push({ mesh, pos: mesh.position, heading: 0, speed: 6.5, attackCd: 0, walkPhase: 0 });
  }

  removeFar(playerPos) {
    for (let i = this.cars.length - 1; i >= 0; i--) {
      if (this.cars[i].pos.distanceTo(playerPos) > 190) {
        this.scene.remove(this.cars[i].mesh);
        this.cars.splice(i, 1);
      }
    }
    for (let i = this.officers.length - 1; i >= 0; i--) {
      if (this.officers[i].pos.distanceTo(playerPos) > 120) {
        this.scene.remove(this.officers[i].mesh);
        this.officers.splice(i, 1);
      }
    }
  }

  update(dt, playerPos, playerSpeed, wanted, onFoot, onCrime) {
    this.lightPhase += dt * 6;
    const wantCars = this.wantedCarCount(wanted);
    const wantOfficers = onFoot ? this.wantedOfficerCount(wanted) : 0;
    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0) {
      this.spawnTimer = 1.2;
      if (this.cars.length < wantCars) this.spawnCarNear(playerPos);
      if (this.officers.length < wantOfficers) this.spawnOfficerNear(playerPos);
    }
    if (wanted === 0) {
      // Stand down: cars drive off, officers walk away.
      for (let i = this.cars.length - 1; i >= 0; i--) {
        const c = this.cars[i];
        c.speed = Math.min(c.speed + 8 * dt, 20);
        const away = Math.atan2(c.pos.x - playerPos.x, c.pos.z - playerPos.z);
        c.heading += (away - c.heading) * 0.02;
        c.pos.x += Math.sin(c.heading) * c.speed * dt;
        c.pos.z += Math.cos(c.heading) * c.speed * dt;
        c.mesh.position.copy(c.pos); c.mesh.rotation.y = c.heading;
        if (c.pos.distanceTo(playerPos) > 150) { this.scene.remove(c.mesh); this.cars.splice(i, 1); }
      }
      for (let i = this.officers.length - 1; i >= 0; i--) {
        const o = this.officers[i];
        o.pos.x += Math.sin(o.heading) * 2 * dt;
        o.pos.z += Math.cos(o.heading) * 2 * dt;
        if (o.pos.distanceTo(playerPos) > 90) { this.scene.remove(o.mesh); this.officers.splice(i, 1); }
      }
      return null;
    }
    // Chase: police cars steer toward the player and ram.
    let nearest = null;
    for (const c of this.cars) {
      const dx = playerPos.x - c.pos.x, dz = playerPos.z - c.pos.z;
      const dist = Math.hypot(dx, dz);
      if (nearest === null || dist < nearest) nearest = dist;
      const targetHeading = Math.atan2(dx, dz);
      let dh = targetHeading - c.heading;
      while (dh > Math.PI) dh -= Math.PI * 2;
      while (dh < -Math.PI) dh += Math.PI * 2;
      c.heading += THREE.MathUtils.clamp(dh, -1.6 * dt, 1.6 * dt);
      const chaseSpeed = Math.min(34 + wanted * 2.5, 46);
      c.speed += ((dist > 8 ? chaseSpeed : 12) - c.speed) * Math.min(1, dt * 1.5);
      c.pos.x += Math.sin(c.heading) * c.speed * dt;
      c.pos.z += Math.cos(c.heading) * c.speed * dt;
      clampCity(c.pos, 3);
      resolveCollisions(c.pos, 2.1, this.colliders);
      c.mesh.position.copy(c.pos);
      c.mesh.rotation.y = c.heading;
      if (dist < 4.5) {
        // Ram: shove the player and count as a hit.
        c.speed *= 0.5;
        onCrime('rammed', c.pos);
      }
      // Flashing light bar.
      if (c.mesh.userData.lightbar) {
        const on = Math.sin(this.lightPhase) > 0;
        c.mesh.userData.lightbar[0].material.emissiveIntensity = on ? 2.2 : 0.2;
        c.mesh.userData.lightbar[1].material.emissiveIntensity = on ? 0.2 : 2.2;
      }
    }
    // Officers chase on foot and brawl up close.
    for (const o of this.officers) {
      o.attackCd -= dt;
      const dx = playerPos.x - o.pos.x, dz = playerPos.z - o.pos.z;
      const dist = Math.hypot(dx, dz);
      o.heading = Math.atan2(dx, dz);
      if (dist > 1.6) {
        o.pos.x += Math.sin(o.heading) * o.speed * dt;
        o.pos.z += Math.cos(o.heading) * o.speed * dt;
        o.walkPhase += dt * 8;
        o.mesh.position.y = Math.abs(Math.sin(o.walkPhase)) * 0.06;
      } else if (o.attackCd <= 0) {
        o.attackCd = 1.1;
        onCrime('beaten', o.pos);
      }
      resolveCollisions(o.pos, 0.5, this.colliders);
      o.mesh.position.copy(o.pos);
      o.mesh.rotation.y = o.heading;
    }
    this.removeFar(playerPos);
    return nearest;
  }

  /** Wanted decay: called every frame; returns nothing, mutates state via callback. */
  decay(dt, wanted, playerSpeed, hidden, setWanted) {
    if (wanted <= 0) return;
    this.heatTimer += dt;
    const rate = hidden ? 1 : 0.35;
    if (this.heatTimer > 6 / rate) {
      this.heatTimer = 0;
      setWanted(Math.max(0, wanted - 1));
    }
  }

  clearAll() {
    for (const c of this.cars) this.scene.remove(c.mesh);
    for (const o of this.officers) this.scene.remove(o.mesh);
    this.cars = []; this.officers = [];
  }
}
