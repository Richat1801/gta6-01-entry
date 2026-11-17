// Solmar Bay — shared constants and small helpers.
// One job: the numbers and pure helpers every other module uses.

export const WORLD = {
  blocks: 8,
  block: 36,
  road: 14,
  pitch: 50,
  half: 207,
  beachStart: 207,
  sandEnd: 246,
  waterStart: 246,
  // City grid helpers: block centres run -175 .. +175, road centres -200 .. +200.
  blockCenter(i) { return -175 + i * 50; },
  roadCenter(i) { return -200 + i * 50; },
};

export const PLAYER = {
  walkSpeed: 6,
  runSpeed: 10,
  radius: 0.6,
  maxHealth: 100,
};

export const CAR = {
  topSpeed: 34, // m/s, about 122 km/h
  accel: 16,
  brake: 30,
  reverseTop: 10,
  steer: 1.9,
};

export const MISSION_REWARDS = [150, 250, 400, 600, 1000];
export const SAVE_KEY = 'solmar-bay-save-v1';
export const START_CASH = 40;

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }
export function lerp(a, b, t) { return a + (b - a) * t; }
export function dist2D(ax, az, bx, bz) { return Math.hypot(ax - bx, az - bz); }
export function angleLerp(a, b, t) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

// Format a game-clock reading from raw seconds, exactly once. The input is
// always a number of seconds; never pass an already-formatted string here.
export function formatClock(totalSeconds) {
  const s = ((Math.floor(totalSeconds) % 86400) + 86400) % 86400;
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0');
}

export function formatMoney(n) {
  return '$' + Math.floor(n).toLocaleString('en-US');
}

export function pick(rng, arr) { return arr[Math.floor(rng() * arr.length)]; }
