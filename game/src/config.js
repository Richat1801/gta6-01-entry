// Solmar Bay — shared constants, seeded random and city layout helpers.
// The city is a 7x7 grid of blocks on a 58-unit pitch, ringed by a highway
// loop, with a beach and ocean along its south edge (positive Z).
import * as THREE from 'three';

export const CITY = {
  pitch: 58,
  roadHalf: 7,
  roadLines: [-174, -116, -58, 0, 58, 116, 174],
  half: 210,
  beachZ: 205,
  oceanZ: 232,
  blockHalf: 20,
};

export const GAME = {
  title: 'SOLMAR BAY',
  subtitle: 'Heat of the Coast',
  saveKey: 'solmarbay-save-v1',
  walkSpeed: 7,
  runSpeed: 11,
  carTopSpeed: 46,
  maxWanted: 5,
  startCash: 250,
};

/** Deterministic mulberry32 RNG so the city is identical every load. */
export function makeRng(seed) {
  let a = seed >>> 0;
  return function rng() {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Pick one element of an array with the given rng. */
export function pick(rng, arr) { return arr[Math.floor(rng() * arr.length)]; }

/** Is the point on (or very near) a road line? */
export function isOnRoad(x, z) {
  const d = (v) => {
    let best = 1e9;
    for (const l of CITY.roadLines) best = Math.min(best, Math.abs(v - l));
    return best;
  };
  return d(x) <= CITY.roadHalf + 1.5 || d(z) <= CITY.roadHalf + 1.5;
}

/** Nearest road-line coordinate on one axis. */
export function nearestRoad(v) {
  let best = CITY.roadLines[0];
  for (const l of CITY.roadLines) if (Math.abs(v - l) < Math.abs(v - best)) best = l;
  return best;
}

/** Clamp a point inside the drivable city (ocean edge blocks cars on foot too). */
export function clampCity(p, margin = 4) {
  p.x = THREE.MathUtils.clamp(p.x, -CITY.half + margin, CITY.half - margin);
  p.z = THREE.MathUtils.clamp(p.z, -CITY.half + margin, CITY.oceanZ - 6);
  return p;
}

/** Circle-vs-AABB test used by cars, player and peds. Returns push-out or null. */
export function circleVsBox(px, pz, r, box) {
  const cx = THREE.MathUtils.clamp(px, box.minX, box.maxX);
  const cz = THREE.MathUtils.clamp(pz, box.minZ, box.maxZ);
  const dx = px - cx, dz = pz - cz;
  const d2 = dx * dx + dz * dz;
  if (d2 >= r * r) return null;
  if (d2 > 1e-6) {
    const d = Math.sqrt(d2);
    return { x: (dx / d) * (r - d), z: (dz / d) * (r - d) };
  }
  // Centre inside the box: push out along the smallest penetration axis.
  const pl = px - box.minX, pr = box.maxX - px, pt = pz - box.minZ, pb = box.maxZ - pz;
  const m = Math.min(pl, pr, pt, pb);
  if (m === pl) return { x: -(pl + r), z: 0 };
  if (m === pr) return { x: pr + r, z: 0 };
  if (m === pt) return { x: 0, z: -(pt + r) };
  return { x: 0, z: pb + r };
}

/** Resolve a circle against every building collider, mutating the position. */
export function resolveCollisions(p, r, colliders) {
  for (const box of colliders) {
    const push = circleVsBox(p.x, p.z, r, box);
    if (push) { p.x += push.x; p.z += push.z; }
  }
}

/** Angle lerp that wraps correctly. */
export function lerpAngle(a, b, t) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

export function fmtCash(n) { return '$' + Math.round(n).toLocaleString('en-US'); }
export function fmtTime(sec) {
  const m = Math.floor(sec / 60) % 60, s = Math.floor(sec) % 60;
  return String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
}
/** Time of day (seconds since midnight) as HH:MM. */
export function fmtClock(sec) {
  const h = Math.floor(sec / 3600) % 24, m = Math.floor(sec / 60) % 60;
  return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0');
}
