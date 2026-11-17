// Solmar Bay — pedestrians: sidewalk walkers who stroll the grid, cross at
// intersections, flee from gunfire and dive out of the way of speeding cars.
import * as THREE from 'three';
import { CITY, makeRng, pick } from './config.js';

const SHIRTS = [0xe84a5f, 0x4a90e8, 0x50c878, 0xf2a541, 0x9b59b6, 0xe8e8e8, 0x34495e, 0xff8c69];
const SKINS = [0xf1c27d, 0xe0ac69, 0xc68642, 0x8d5524, 0xffdbac];

function makePedMesh(rng) {
  const g = new THREE.Group();
  const skin = new THREE.MeshStandardMaterial({ color: pick(rng, SKINS), roughness: 0.8 });
  const shirt = new THREE.MeshStandardMaterial({ color: pick(rng, SHIRTS), roughness: 0.9 });
  const pants = new THREE.MeshStandardMaterial({ color: pick(rng, [0x2c3e50, 0x5d4037, 0x37474f]), roughness: 0.9 });
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.32, 10, 10), skin);
  head.position.y = 1.62;
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.75, 0.34), shirt);
  torso.position.y = 1.05;
  const legs = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.7, 0.3), pants);
  legs.position.y = 0.35;
  head.castShadow = torso.castShadow = true;
  g.add(head, torso, legs);
  return g;
}

export class PedestrianManager {
  constructor(scene, colliders) {
    this.scene = scene;
    this.colliders = colliders;
    this.rng = makeRng(4242);
    this.peds = [];
    for (let i = 0; i < 26; i++) this.spawn();
  }

  spawn() {
    const mesh = makePedMesh(this.rng);
    const line = pick(this.rng, CITY.roadLines);
    const horizontal = this.rng() < 0.5;
    const along = -190 + this.rng() * 380;
    const x = horizontal ? along : line + (this.rng() < 0.5 ? 10.5 : -10.5);
    const z = horizontal ? line + (this.rng() < 0.5 ? 10.5 : -10.5) : along;
    mesh.position.set(x, 0, z);
    this.scene.add(mesh);
    this.peds.push({
      mesh, pos: mesh.position,
      heading: this.rng() * Math.PI * 2,
      speed: 1.2 + this.rng() * 1.1,
      state: 'walk',
      panic: 0,
      walkPhase: this.rng() * 10,
    });
  }

  /** Flee from a point (gunshot / crash). */
  scare(pos, radius) {
    for (const p of this.peds) {
      if (p.pos.distanceTo(pos) < radius) {
        p.state = 'flee';
        p.panic = 4 + this.rng() * 3;
        p.heading = Math.atan2(p.pos.x - pos.x, p.pos.z - pos.z);
      }
    }
  }

  update(dt, playerPos, playerSpeed) {
    for (const p of this.peds) {
      if (p.state === 'flee') {
        p.panic -= dt;
        if (p.panic <= 0) p.state = 'walk';
      }
      const speed = p.state === 'flee' ? 5.5 : p.speed;
      // Dodge a fast car heading at them.
      if (playerSpeed > 12 && p.pos.distanceTo(playerPos) < 9) {
        p.state = 'flee'; p.panic = 2;
        p.heading = Math.atan2(p.pos.x - playerPos.x, p.pos.z - playerPos.z);
      }
      p.pos.x += Math.sin(p.heading) * speed * dt;
      p.pos.z += Math.cos(p.heading) * speed * dt;
      // Keep on sidewalks: steer back onto the grid when off-road.
      if (Math.abs(p.pos.x) > 208 || Math.abs(p.pos.z) > 208 || p.pos.z > 226) {
        p.heading += Math.PI * (0.5 + this.rng() * 0.5);
      }
      if (this.rng() < dt * 0.08) p.heading += (this.rng() - 0.5) * 1.8;
      p.walkPhase += dt * speed * 3;
      p.mesh.rotation.y = p.heading;
      p.mesh.position.y = Math.abs(Math.sin(p.walkPhase)) * 0.05;
    }
  }

  /** Peds near a point (for hit detection / crime). */
  near(pos, radius) {
    return this.peds.filter((p) => p.pos.distanceTo(pos) < radius);
  }
}
