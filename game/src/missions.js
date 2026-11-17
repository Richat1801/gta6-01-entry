// Solmar Bay missions: Rico Vane's five-job story chain, markers and rewards.
// One job: what the player has to do next, and paying them when it is done.

import * as THREE from 'three';
import { MISSIONS, WORLD, roadCenter, clamp, distance2D, formatCash } from './config.js';
import { buildCarMesh } from './vehicles.js';
import { spawnRivalGang } from './combat.js';

/** Create the mission manager. Holds the active job, step and marker beacon. */
export function createMissionManager(scene) {
  const beaconGeo = new THREE.CylinderGeometry(2.6, 2.6, 30, 20, 1, true);
  const beaconMat = new THREE.MeshBasicMaterial({
    color: 0xffd23e, transparent: true, opacity: 0.28, side: THREE.DoubleSide, depthWrite: false,
  });
  const beacon = new THREE.Mesh(beaconGeo, beaconMat);
  beacon.visible = false;
  scene.add(beacon);
  const ringGeo = new THREE.TorusGeometry(3, 0.22, 8, 32);
  const ringMat = new THREE.MeshBasicMaterial({ color: 0xffd23e });
  const ring = new THREE.Mesh(ringGeo, ringMat);
  ring.rotation.x = Math.PI / 2;
  ring.visible = false;
  scene.add(ring);
  return {
    scene, beacon, ring,
    missionIndex: 0, // next mission to start (0-based)
    active: null, // { def, stepIndex, step, holdTimer, courier, rivals }
    done: false,
    toast: '',
  };
}

/** Start mission number n (1-based). Returns false when there is no such mission. */
export function startMission(mgr, n, state) {
  const def = MISSIONS[n - 1];
  if (!def) return false;
  mgr.missionIndex = n - 1;
  mgr.active = { def, stepIndex: 0, step: def.steps[0], holdTimer: 0, courier: null, rivals: [] };
  mgr.done = false;
  setupStep(mgr, state);
  return true;
}

function setupStep(mgr, state) {
  const step = mgr.active.step;
  mgr.active.holdTimer = 0;
  if (step.type === 'chase') {
    const { group } = buildCarMesh('sedan', 0x8e1f1f);
    const x = clamp(state.player.x + 40, 20, WORLD.citySpan - 20);
    const z = clamp(state.player.z + 20, 20, WORLD.citySpan - 20);
    group.position.set(x, 0, z);
    mgr.scene.add(group);
    mgr.active.courier = {
      mesh: group, x, z, angle: 0, speed: 15,
      wpX: roadCenter(4), wpZ: roadCenter(6),
    };
  }
  if (step.type === 'shootout') {
    mgr.active.rivals = spawnRivalGang(mgr.scene, step.x, step.z, step.rivals || 4);
    state.rivals = mgr.active.rivals;
    if (state.audio) state.audio.playChime();
  }
  if (step.type === 'escape') {
    state.wanted = Math.max(state.wanted, 3);
    state.lastCrimeAt = state.time;
    state.hiddenTimer = 0;
  }
  updateMarker(mgr, state);
}

/** Where the current objective points: { x, z } or null. */
export function currentMarkerPos(mgr) {
  if (!mgr.active) return null;
  const step = mgr.active.step;
  if (step.type === 'enterCar') {
    const car = mgr.active.carRef;
    return car ? { x: car.x, z: car.z } : { x: step.x || 0, z: step.z || 0 };
  }
  if (step.type === 'chase' && mgr.active.courier) {
    return { x: mgr.active.courier.x, z: mgr.active.courier.z };
  }
  return { x: step.x, z: step.z };
}

function updateMarker(mgr, state) {
  const pos = currentMarkerPos(mgr);
  if (!pos) {
    mgr.beacon.visible = false;
    mgr.ring.visible = false;
    return;
  }
  mgr.beacon.visible = true;
  mgr.ring.visible = true;
  mgr.beacon.position.set(pos.x, 15, pos.z);
  mgr.ring.position.set(pos.x, 0.25, pos.z);
}

/** One-line objective text for the HUD, with distance. */
export function objectiveText(mgr, state) {
  if (!mgr.active) {
    if (mgr.done) return 'Story complete — free roam Solmar Bay. Press M for the next job.';
    return 'No active job — find Rico Vane. Press M to start a mission.';
  }
  const step = mgr.active.step;
  const pos = currentMarkerPos(mgr);
  const dist = pos ? Math.round(distance2D(state.player.x, state.player.z, pos.x, pos.z)) : 0;
  return `MISSION ${mgr.active.def.id}: ${mgr.active.def.name} — ${step.label} (${dist}m)`;
}

/** Advance the active mission one tick. Returns 'complete' when a job pays out. */
export function updateMissions(mgr, state, dt) {
  if (!mgr.active) return null;
  const step = mgr.active.step;
  const px = state.player.x;
  const pz = state.player.z;

  if (step.type === 'enterCar') {
    const car = state.parkedCars[step.carIndex];
    mgr.active.carRef = car;
    updateMarker(mgr, state);
    if (state.driving && state.playerCar === car) {
      advanceStep(mgr, state);
    }
    return null;
  }
  if (step.type === 'goto') {
    if (distance2D(px, pz, step.x, step.z) < step.radius) advanceStep(mgr, state);
    return null;
  }
  if (step.type === 'channel') {
    if (distance2D(px, pz, step.x, step.z) < step.radius) {
      mgr.active.holdTimer += dt;
      if (mgr.active.holdTimer >= step.holdSeconds) advanceStep(mgr, state);
    } else {
      mgr.active.holdTimer = 0;
    }
    return null;
  }
  if (step.type === 'chase') {
    const c = mgr.active.courier;
    if (!c) return null;
    // Courier loops the road grid at a steady cruise.
    const dx = c.wpX - c.x;
    const dz = c.wpZ - c.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 6) {
      c.wpX = roadCenter(Math.floor(Math.random() * WORLD.gridBlocks));
      c.wpZ = roadCenter(Math.floor(Math.random() * WORLD.gridBlocks));
    } else {
      const a = Math.atan2(dx, dz);
      let d = a - c.angle;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      c.angle += clamp(d, -2 * dt, 2 * dt);
      c.x += Math.sin(c.angle) * c.speed * dt;
      c.z += Math.cos(c.angle) * c.speed * dt;
      c.mesh.position.set(c.x, 0, c.z);
      c.mesh.rotation.y = c.angle;
    }
    updateMarker(mgr, state);
    const pd = distance2D(px, pz, c.x, c.z);
    if (pd < step.maxDistance) {
      mgr.active.holdTimer += dt;
      if (mgr.active.holdTimer >= step.holdSeconds) advanceStep(mgr, state);
    } else {
      mgr.active.holdTimer = Math.max(0, mgr.active.holdTimer - dt * 0.5);
    }
    return null;
  }
  if (step.type === 'shootout') {
    updateMarker(mgr, state);
    const alive = (mgr.active.rivals || []).filter((r) => r.alive).length;
    if (alive === 0) advanceStep(mgr, state);
    return null;
  }
  if (step.type === 'escape') {
    if (distance2D(px, pz, step.x, step.z) < step.radius) {
      state.wanted = 0;
      state.hiddenTimer = 0;
      advanceStep(mgr, state);
    }
    return null;
  }
  return null;
}

function advanceStep(mgr, state) {
  const m = mgr.active;
  if (m.stepIndex + 1 < m.def.steps.length) {
    m.stepIndex += 1;
    m.step = m.def.steps[m.stepIndex];
    setupStep(mgr, state);
    if (state.audio) state.audio.playChime();
    return;
  }
  completeMission(mgr, state);
}

function completeMission(mgr, state) {
  const def = mgr.active.def;
  state.cash += def.reward;
  mgr.toast = `Job done: ${def.name} — +${formatCash(def.reward)}`;
  mgr.missionIndex = def.id; // next mission number (0-based count)
  if (mgr.active.courier) {
    mgr.scene.remove(mgr.active.courier.mesh);
    mgr.active.courier = null;
  }
  mgr.active = null;
  mgr.beacon.visible = false;
  mgr.ring.visible = false;
  if (def.id >= MISSIONS.length) {
    mgr.done = true;
  }
  if (state.audio) state.audio.playChime();
  if (state.saveGame) state.saveGame();
}

/** Start the next unplayed mission, or replay the chain from the top when done. */
export function startNextMission(mgr, state) {
  if (mgr.active) return false;
  const next = mgr.done ? 1 : mgr.missionIndex + 1;
  return startMission(mgr, Math.min(next, MISSIONS.length), state);
}
