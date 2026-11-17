// Solmar Bay combat: fists, pistol, muzzle flash, hit markers and the rival gang.
// One job: fights — who shoots, who falls, and what it pays.

import * as THREE from 'three';
import { COMBAT, WORLD, rand, randInt, clamp, distance2D } from './config.js';
import { buildPedestrianMesh } from './pedestrians.js';

/** A red-gang rival: tougher walker with a pistol arm and a health bar sprite. */
export function spawnRivalGang(scene, x, z, count) {
  const rivals = [];
  for (let i = 0; i < count; i++) {
    const mesh = buildPedestrianMesh();
    const red = new THREE.MeshLambertMaterial({ color: 0x8e1f1f });
    mesh.children.forEach((child) => {
      if (child.geometry && child.geometry.type === 'BoxGeometry' && child.position.y > 0.9 && child.position.y < 1.3) {
        child.material = red;
      }
    });
    const gun = new THREE.Mesh(
      new THREE.BoxGeometry(0.08, 0.12, 0.5),
      new THREE.MeshLambertMaterial({ color: 0x111111 })
    );
    gun.position.set(0.36, 1.15, 0.3);
    mesh.add(gun);
    const rx = x + rand(-8, 8);
    const rz = z + rand(-8, 8);
    mesh.position.set(rx, 0, rz);
    scene.add(mesh);
    rivals.push({
      mesh, x: rx, z: rz, angle: rand(0, Math.PI * 2),
      health: COMBAT.rivalHealth, alive: true,
      shootTimer: rand(0.5, 1.5), moveTimer: 0, phase: rand(0, 6),
    });
  }
  return rivals;
}

/** Punch: short-range swing that hurts the nearest rival or pedestrian. */
export function punchAttack(state, rivals, peds) {
  const px = state.player.x;
  const pz = state.player.z;
  const fx = Math.sin(state.player.angle);
  const fz = Math.cos(state.player.angle);
  let best = null;
  let bestD = COMBAT.punchRange;
  for (const r of rivals) {
    if (!r.alive) continue;
    const d = distance2D(px, pz, r.x, r.z);
    const dot = ((r.x - px) * fx + (r.z - pz) * fz) / Math.max(d, 0.01);
    if (d < bestD && dot > 0.3) { best = r; bestD = d; }
  }
  if (best) {
    best.health -= COMBAT.punchDamage;
    best.x += fx * 1.2;
    best.z += fz * 1.2;
    if (best.health <= 0) killRival(state, best);
    return { hit: true, kind: 'rival' };
  }
  for (const p of peds) {
    if (p.down) continue;
    const d = distance2D(px, pz, p.x, p.z);
    if (d < COMBAT.punchRange) {
      p.down = true;
      p.downTimer = 3;
      p.mesh.rotation.x = -Math.PI / 2;
      p.mesh.position.y = 0.3;
      return { hit: true, kind: 'ped' };
    }
  }
  return { hit: false, kind: null };
}

function killRival(state, rival) {
  rival.alive = false;
  rival.mesh.rotation.x = -Math.PI / 2;
  rival.mesh.position.y = 0.3;
  state.cash += 50;
  state.kills = (state.kills || 0) + 1;
}

/**
 * Hitscan pistol shot from the player toward a world point.
 * Returns { hit, rival } and spawns a tracer + muzzle flash in the scene.
 */
export function firePistol(state, scene, targetPoint, rivals, camera) {
  const origin = new THREE.Vector3(state.player.x, 1.5, state.player.z);
  const dir = new THREE.Vector3().copy(targetPoint).sub(origin).normalize();
  const ray = new THREE.Raycaster(origin, dir, 0.1, COMBAT.pistolRange);
  const meshes = rivals.filter((r) => r.alive).map((r) => r.mesh);
  const hits = ray.intersectObjects(meshes, true);
  let hitRival = null;
  let endPoint = origin.clone().add(dir.clone().multiplyScalar(COMBAT.pistolRange));
  if (hits.length > 0) {
    const h = hits[0];
    endPoint = h.point.clone();
    let obj = h.object;
    while (obj && !rivals.some((r) => r.mesh === obj)) obj = obj.parent;
    hitRival = rivals.find((r) => r.mesh === obj) || null;
    if (hitRival) {
      hitRival.health -= COMBAT.pistolDamage;
      if (hitRival.health <= 0) killRival(state, hitRival);
    }
  }
  // Tracer line.
  const tracerGeo = new THREE.BufferGeometry().setFromPoints([origin, endPoint]);
  const tracer = new THREE.Line(tracerGeo, new THREE.LineBasicMaterial({ color: 0xffe066, transparent: true, opacity: 0.9 }));
  scene.add(tracer);
  state.effects.push({ kind: 'tracer', mesh: tracer, ttl: 0.09 });
  // Muzzle flash.
  const flash = new THREE.PointLight(0xffc861, 30, 14);
  flash.position.copy(origin).add(dir.clone().multiplyScalar(1.2));
  scene.add(flash);
  state.effects.push({ kind: 'flash', mesh: flash, ttl: 0.06 });
  return { hit: !!hitRival, rival: hitRival, endPoint };
}

/** Rivals advance on the player, strafe, and shoot back with shaky aim. */
export function updateRivals(state, rivals, dt, time) {
  const px = state.player.x;
  const pz = state.player.z;
  for (const r of rivals) {
    if (!r.alive) continue;
    const dist = distance2D(r.x, r.z, px, pz);
    r.moveTimer -= dt;
    if (dist > 26) {
      // Close the distance.
      const a = Math.atan2(px - r.x, pz - r.z);
      r.angle = a;
      r.x += Math.sin(a) * 4.4 * dt;
      r.z += Math.cos(a) * 4.4 * dt;
    } else if (r.moveTimer <= 0) {
      r.moveTimer = rand(0.8, 2);
      r.strafe = rand(-1, 1);
    } else {
      const a = Math.atan2(px - r.x, pz - r.z) + Math.PI / 2;
      r.angle = Math.atan2(px - r.x, pz - r.z);
      r.x += Math.sin(a) * (r.strafe || 0) * 2 * dt;
      r.z += Math.cos(a) * (r.strafe || 0) * 2 * dt;
    }
    r.x = clamp(r.x, WORLD.beachStart - 10, WORLD.maxX - 10);
    r.z = clamp(r.z, 10, WORLD.citySpan - 10);
    r.mesh.position.set(r.x, 0, r.z);
    r.mesh.rotation.y = r.angle;
    const swing = Math.sin(time * 9 + r.phase) * 0.6;
    const limbs = r.mesh.userData.limbs;
    if (limbs) {
      limbs.legL.rotation.x = swing;
      limbs.legR.rotation.x = -swing;
    }
    // Shoot back.
    r.shootTimer -= dt;
    if (r.shootTimer <= 0 && dist < 34 && state.player.health > 0) {
      r.shootTimer = rand(1.0, 1.9);
      const hitChance = dist < 12 ? 0.42 : dist < 22 ? 0.28 : 0.16;
      if (Math.random() < hitChance) {
        state.player.health = Math.max(0, state.player.health - COMBAT.rivalShotDamage);
        state.lastDamageAt = state.time;
        state.damageFlash = 1;
      }
      // Rival muzzle flash.
      const flash = new THREE.PointLight(0xffc861, 16, 10);
      flash.position.set(r.x, 1.4, r.z);
      state.scene.add(flash);
      state.effects.push({ kind: 'flash', mesh: flash, ttl: 0.05 });
      if (state.audio) state.audio.playShot(0.4, true);
    }
  }
  return rivals.filter((r) => r.alive).length;
}

/** Tick short-lived combat effects (tracers, flashes) out of the scene. */
export function updateCombatEffects(state, dt) {
  for (let i = state.effects.length - 1; i >= 0; i--) {
    const e = state.effects[i];
    e.ttl -= dt;
    if (e.ttl <= 0) {
      state.scene.remove(e.mesh);
      if (e.mesh.geometry) e.mesh.geometry.dispose();
      state.effects.splice(i, 1);
    }
  }
}
