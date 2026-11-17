// Solmar Bay police: wanted stars, chasing cruisers, arresting officers, busts.
// One job: the heat — it rises on crimes, decays when hidden, and catches you.

import * as THREE from 'three';
import { WANTED, WORLD, clamp, distance2D } from './config.js';
import { buildPoliceMesh } from './vehicles.js';
import { buildPedestrianMesh } from './pedestrians.js';
import { resolveBuildingCollision } from './city.js';

/** Add wanted stars (capped) and stamp the last-crime time. */
export function addWanted(state, n) {
  state.wanted = clamp(state.wanted + n, 0, WANTED.maxStars);
  state.lastCrimeAt = state.time;
  state.wantedDirty = true;
}

/** Decay the wanted level when the player has stayed hidden long enough. */
export function updateWantedDecay(state, dt) {
  if (state.wanted === 0) return;
  state.hiddenTimer += dt;
  const policeNear = state.police.cruisers.some((c) => distance2D(c.x, c.z, state.player.x, state.player.z) < 45);
  if (!policeNear && state.hiddenTimer > WANTED.decaySeconds) {
    state.wanted -= 1;
    state.hiddenTimer = 0;
    state.wantedDirty = true;
  }
  if (policeNear) state.hiddenTimer = 0;
}

/** Create the police pool (cruisers + officers, spawned on demand). */
export function createPolice(scene) {
  return { scene, cruisers: [], officers: [], spawnTimer: 0 };
}

function spawnCruiser(police, x, z) {
  const { group, wheels } = buildPoliceMesh();
  group.position.set(x, 0, z);
  police.scene.add(group);
  const c = { mesh: group, wheels, x, z, angle: 0, speed: 0, sirenPhase: Math.random() * 10 };
  police.cruisers.push(c);
  return c;
}

/** Test/scene hook: put a cruiser at an exact spot (used by the chase scene preset). */
export function debugSpawnCruiser(police, x, z) {
  return spawnCruiser(police, x, z);
}

function spawnOfficer(police, x, z) {
  const mesh = buildPedestrianMesh();
  const navy = new THREE.MeshLambertMaterial({ color: 0x1a2a4a });
  mesh.children.forEach((child) => {
    if (child.geometry && child.geometry.type === 'BoxGeometry' && child.position.y > 0.9 && child.position.y < 1.3) {
      child.material = navy;
    }
  });
  mesh.position.set(x, 0, z);
  police.scene.add(mesh);
  const o = { mesh, x, z, angle: 0, speed: 5.2, arrestTimer: 0, phase: Math.random() * 6 };
  police.officers.push(o);
  return o;
}

/**
 * Keep the right number of cruisers/officers for the wanted level and chase the player.
 * Returns 'busted' when an officer arrests the on-foot player, else null.
 */
export function updatePolice(police, state, dt, time) {
  const px = state.player.x;
  const pz = state.player.z;
  const wantedCruisers = state.wanted === 0 ? 0 : Math.min(state.wanted + 1, 4);
  police.spawnTimer -= dt;
  if (police.cruisers.length < wantedCruisers && police.spawnTimer <= 0) {
    police.spawnTimer = 1.2;
    const a = Math.random() * Math.PI * 2;
    spawnCruiser(police, clamp(px + Math.sin(a) * 70, 10, WORLD.citySpan - 10), clamp(pz + Math.cos(a) * 70, 10, WORLD.citySpan - 10));
  }
  if (state.wanted === 0) {
    for (const c of police.cruisers) {
      police.scene.remove(c.mesh);
    }
    police.cruisers.length = 0;
    for (const o of police.officers) police.scene.remove(o.mesh);
    police.officers.length = 0;
    return null;
  }
  // Cruisers chase: steer straight at the player, sliding around buildings.
  for (const c of police.cruisers) {
    const targetAngle = Math.atan2(px - c.x, pz - c.z);
    let d = targetAngle - c.angle;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    c.angle += clamp(d, -2.4 * dt, 2.4 * dt);
    const dist = distance2D(c.x, c.z, px, pz);
    const topSpeed = 26 + state.wanted * 3;
    c.speed = dist > 8 ? Math.min(c.speed + 14 * dt, topSpeed) : Math.max(c.speed - 20 * dt, 4);
    const pos = { x: c.x + Math.sin(c.angle) * c.speed * dt, z: c.z + Math.cos(c.angle) * c.speed * dt };
    resolveBuildingCollision(state.colliders, pos, 2.2);
    c.x = clamp(pos.x, WORLD.minX + 4, WORLD.maxX - 4);
    c.z = clamp(pos.z, WORLD.minZ + 4, WORLD.maxZ - 4);
    c.mesh.position.set(c.x, 0, c.z);
    c.mesh.rotation.y = c.angle;
    for (const w of c.wheels) w.rotation.x += (c.speed * dt) / 0.42;
    // Flashing light bar.
    const bars = c.mesh.userData.lightBar;
    if (bars) {
      const on = Math.sin(time * 10 + c.sirenPhase) > 0;
      bars[0].material.color.setHex(on ? 0xff2222 : 0x551111);
      bars[1].material.color.setHex(on ? 0x111155 : 0x2255ff);
    }
    // Ram the player's car.
    if (state.driving && dist < 3.4 && state.playerCar) {
      state.playerCar.speed *= 0.82;
      if (state.player.health > 0 && Math.random() < dt * 0.5) {
        state.player.health = Math.max(0, state.player.health - 2);
      }
    }
  }
  // Officers on foot when the heat is 2+ and the player is on foot.
  const wantedOfficers = state.wanted >= 2 && !state.driving ? Math.min(state.wanted - 1, 3) : 0;
  if (police.officers.length < wantedOfficers && police.spawnTimer <= 0) {
    police.spawnTimer = 1.5;
    const a = Math.random() * Math.PI * 2;
    spawnOfficer(police, clamp(px + Math.sin(a) * 26, 10, WORLD.citySpan - 10), clamp(pz + Math.cos(a) * 26, 10, WORLD.citySpan - 10));
  }
  for (const o of police.officers) {
    const dist = distance2D(o.x, o.z, px, pz);
    const targetAngle = Math.atan2(px - o.x, pz - o.z);
    let d = targetAngle - o.angle;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    o.angle += clamp(d, -4 * dt, 4 * dt);
    if (dist > 1.8) {
      o.x += Math.sin(o.angle) * o.speed * dt;
      o.z += Math.cos(o.angle) * o.speed * dt;
      o.arrestTimer = 0;
    } else {
      o.arrestTimer += dt;
      if (o.arrestTimer > 1.5) return 'busted';
    }
    o.mesh.position.set(o.x, 0, o.z);
    o.mesh.rotation.y = o.angle;
    const swing = Math.sin(time * 10 + o.phase) * 0.7;
    const limbs = o.mesh.userData.limbs;
    if (limbs) {
      limbs.legL.rotation.x = swing;
      limbs.legR.rotation.x = -swing;
      limbs.armL.rotation.x = -swing * 0.8;
      limbs.armR.rotation.x = swing * 0.8;
    }
  }
  return null;
}

/** A parked police car prop for the city (not a chaser). Unused by the chase pool. */
export function buildParkedPoliceCar(scene, x, z, angle) {
  const { group } = buildPoliceMesh();
  group.position.set(x, 0, z);
  group.rotation.y = angle;
  scene.add(group);
  return group;
}
