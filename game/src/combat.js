// Combat: fists and pistol, rival-gang shooters, muzzle flash, hit
// markers, tracer lines and the player's health.

import * as THREE from 'three';
import { CONFIG, rand, distance2D } from './config.js';

export class Rival {
  constructor(scene, x, z) {
    this.scene = scene;
    this.health = CONFIG.rivalHealth;
    this.shootCooldown = rand(0.6, 1.6);
    this.mesh = buildRivalMesh();
    this.mesh.position.set(x, 0, z);
    scene.add(this.mesh);
    this.phase = rand(0, 6);
  }

  takeDamage(amount) {
    this.health -= amount;
    return this.health <= 0;
  }
}

function buildRivalMesh() {
  const group = new THREE.Group();
  const jacket = new THREE.MeshStandardMaterial({ color: 0x8a1f2e, roughness: 0.85 });
  const skin = new THREE.MeshStandardMaterial({ color: 0xd9a066, roughness: 0.8 });
  const pants = new THREE.MeshStandardMaterial({ color: 0x222831, roughness: 0.9 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.8, 0.34), jacket);
  body.position.y = 1.05;
  body.castShadow = true;
  group.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 8), skin);
  head.position.y = 1.62;
  group.add(head);
  const band = new THREE.Mesh(new THREE.CylinderGeometry(0.23, 0.23, 0.08, 10), jacket);
  band.position.y = 1.74;
  group.add(band);
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.65, 0.22), pants);
  legL.position.set(-0.14, 0.33, 0);
  group.add(legL);
  const legR = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.65, 0.22), pants);
  legR.position.set(0.14, 0.33, 0);
  group.add(legR);
  // Pistol in hand
  const gun = new THREE.Mesh(
    new THREE.BoxGeometry(0.08, 0.12, 0.42),
    new THREE.MeshStandardMaterial({ color: 0x14161a, roughness: 0.4, metalness: 0.6 }),
  );
  gun.position.set(0.34, 1.1, 0.2);
  group.add(gun);
  group.userData = { legL, legR };
  return group;
}

export class CombatSystem {
  constructor(scene, hooks) {
    this.scene = scene;
    this.hooks = hooks; // { onShoot, onHit, onPlayerDamage, onRivalKilled, onCrime }
    this.rivals = [];
    this.tracers = [];
    this.muzzle = buildMuzzleFlash();
    this.muzzle.visible = false;
    scene.add(this.muzzle);
    this.muzzleTimer = 0;
    this.fireCooldown = 0;
    this.punchCooldown = 0;
    this.pistolEquipped = false;
    this.raycaster = new THREE.Raycaster();
    this.flashLight = new THREE.PointLight(0xffc860, 0, 14);
    scene.add(this.flashLight);
  }

  spawnRivals(count, cx, cz) {
    for (let i = 0; i < count; i++) {
      const a = rand(0, Math.PI * 2);
      const r = rand(6, 16);
      this.rivals.push(new Rival(this.scene, cx + Math.cos(a) * r, cz + Math.sin(a) * r));
    }
  }

  clearRivals() {
    for (const r of this.rivals) this.scene.remove(r.mesh);
    this.rivals = [];
  }

  rivalCount() {
    return this.rivals.length;
  }

  // Player fires the pistol from the camera toward the crosshair.
  shoot(camera, playerPos) {
    if (this.fireCooldown > 0 || !this.pistolEquipped) return;
    this.fireCooldown = CONFIG.pistolFireDelay;
    this.hooks.onShoot();
    this.hooks.onCrime(1, 'shots fired');
    // Muzzle flash at the camera, briefly.
    this.muzzle.visible = true;
    this.muzzleTimer = 0.06;
    this.muzzle.position.copy(camera.position);
    this.muzzle.position.addScaledVector(new THREE.Vector3(0, -0.25, 0), 1);
    this.flashLight.position.copy(camera.position);
    this.flashLight.intensity = 24;
    // Raycast against rivals (sphere test on their chest).
    const dir = new THREE.Vector3();
    camera.getWorldDirection(dir);
    let hitRival = null;
    let hitDist = CONFIG.pistolRange;
    for (const rival of this.rivals) {
      const to = new THREE.Vector3().subVectors(rival.mesh.position, camera.position);
      to.y += 1.2;
      const along = to.dot(dir);
      if (along < 0 || along > hitDist) continue;
      const closest = new THREE.Vector3().copy(dir).multiplyScalar(along).add(camera.position);
      const chest = rival.mesh.position.clone();
      chest.y += 1.2;
      if (closest.distanceTo(chest) < 1.4) {
        hitRival = rival;
        hitDist = along;
      }
    }
    const end = new THREE.Vector3().copy(camera.position).addScaledVector(dir, hitDist);
    this.spawnTracer(camera.position.clone().addScaledVector(dir, 1.2), end);
    if (hitRival) {
      this.hooks.onHit();
      const dead = hitRival.takeDamage(CONFIG.pistolDamage);
      if (dead) {
        this.scene.remove(hitRival.mesh);
        this.rivals = this.rivals.filter((r) => r !== hitRival);
        this.hooks.onRivalKilled(hitRival);
      }
    }
  }

  // A close-range punch: damages the nearest rival in front of the player.
  punch(playerPos, playerHeading) {
    if (this.punchCooldown > 0) return;
    this.punchCooldown = 0.45;
    this.hooks.onShoot('punch');
    const fx = Math.sin(playerHeading);
    const fz = Math.cos(playerHeading);
    for (const rival of [...this.rivals]) {
      const dx = rival.mesh.position.x - playerPos.x;
      const dz = rival.mesh.position.z - playerPos.z;
      const d = Math.hypot(dx, dz);
      if (d > CONFIG.punchRange) continue;
      const facing = (dx * fx + dz * fz) / Math.max(d, 0.01);
      if (facing < 0.3) continue;
      const dead = rival.takeDamage(CONFIG.punchDamage);
      this.hooks.onHit();
      if (dead) {
        this.scene.remove(rival.mesh);
        this.rivals = this.rivals.filter((r) => r !== rival);
        this.hooks.onRivalKilled(rival);
      }
      return;
    }
  }

  spawnTracer(from, to) {
    const geo = new THREE.BufferGeometry().setFromPoints([from, to]);
    const line = new THREE.Line(
      geo,
      new THREE.LineBasicMaterial({ color: 0xffe9a8, transparent: true, opacity: 0.95 }),
    );
    this.scene.add(line);
    this.tracers.push({ line, life: 0.09 });
  }

  // Rivals strafe, keep distance and shoot back with wild aim.
  updateRivals(dt, playerPos, playerInCar) {
    for (const rival of this.rivals) {
      const dx = playerPos.x - rival.mesh.position.x;
      const dz = playerPos.z - rival.mesh.position.z;
      const dist = Math.hypot(dx, dz);
      rival.mesh.rotation.y = Math.atan2(dx, dz);
      // Strafe sideways while keeping roughly 10–18 units away.
      rival.phase += dt;
      const strafe = Math.sin(rival.phase * 1.4) * 2.2;
      if (dist > 18) {
        rival.mesh.position.x += (dx / dist) * 4.4 * dt;
        rival.mesh.position.z += (dz / dist) * 4.4 * dt;
      } else if (dist < 8) {
        rival.mesh.position.x -= (dx / dist) * 3 * dt;
        rival.mesh.position.z -= (dz / dist) * 3 * dt;
      }
      rival.mesh.position.x += Math.cos(rival.mesh.rotation.y) * strafe * dt;
      rival.mesh.position.z -= Math.sin(rival.mesh.rotation.y) * strafe * dt;
      const swing = Math.sin(rival.phase * 6) * 0.4;
      rival.mesh.userData.legL.rotation.x = swing;
      rival.mesh.userData.legR.rotation.x = -swing;
      // Shoot back: inaccurate, damage falls off with distance.
      rival.shootCooldown -= dt;
      if (rival.shootCooldown <= 0 && dist < 55 && !playerInCar) {
        rival.shootCooldown = rand(1.1, 2.2);
        const from = rival.mesh.position.clone();
        from.y = 1.3;
        const to = new THREE.Vector3(playerPos.x + rand(-2.5, 2.5), 1.2, playerPos.z + rand(-2.5, 2.5));
        this.spawnTracer(from, to);
        this.hooks.onShoot('rival');
        if (Math.random() < 0.42) {
          this.hooks.onPlayerDamage(rand(5, 11));
        }
      }
    }
  }

  update(dt) {
    this.fireCooldown = Math.max(0, this.fireCooldown - dt);
    this.punchCooldown = Math.max(0, this.punchCooldown - dt);
    if (this.muzzleTimer > 0) {
      this.muzzleTimer -= dt;
      if (this.muzzleTimer <= 0) this.muzzle.visible = false;
    }
    this.flashLight.intensity = Math.max(0, this.flashLight.intensity - dt * 320);
    for (const t of [...this.tracers]) {
      t.life -= dt;
      if (t.life <= 0) {
        this.scene.remove(t.line);
        t.line.geometry.dispose();
        this.tracers = this.tracers.filter((x) => x !== t);
      }
    }
  }
}

function buildMuzzleFlash() {
  const group = new THREE.Group();
  const mat = new THREE.MeshBasicMaterial({ color: 0xffd76a, transparent: true, opacity: 0.95 });
  const star = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.7), mat);
  const star2 = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.7), mat);
  star2.rotation.z = Math.PI / 4;
  group.add(star);
  group.add(star2);
  return group;
}

// Distance from the player to the nearest rival (for the HUD threat readout).
export function nearestRivalDistance(rivals, x, z) {
  let best = Infinity;
  for (const r of rivals) {
    best = Math.min(best, distance2D(x, z, r.mesh.position.x, r.mesh.position.z));
  }
  return best;
}
