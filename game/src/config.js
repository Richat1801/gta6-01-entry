// Solmar Bay — Heat of the Coast: shared tuning, palette and math helpers.
// One job: every number the rest of the game agrees on lives here.

export const CITY = {
  blocks: 8,            // 8 x 8 blocks
  blockSize: 40,        // building block, metres
  roadWidth: 12,        // road surface, metres
  pitch: 52,            // block + road
  half: 208,            // half-extent of the road grid (8 * 52 / 2)
  beachX: 208,          // sand starts here (east edge)
  seaX: 268,            // water starts here
  worldHalf: 340,       // hard playfield clamp
};

export const PLAYER = {
  walkSpeed: 6.5,
  sprintSpeed: 11,
  jumpSpeed: 8.5,
  gravity: 24,
  radius: 0.6,
  height: 1.8,
  maxHealth: 100,
};

export const CAR = {
  accel: 22,
  brake: 34,
  reverseAccel: 12,
  maxSpeed: 38,
  maxReverse: 10,
  turnRate: 1.9,
  drag: 0.6,
};

export const WANTED = {
  decaySeconds: 26,     // quiet seconds before one star fades
  maxStars: 5,
  stealStars: 1,
  hitPedStars: 2,
  shootStars: 1,
  killStars: 2,
};

export const PALETTE = {
  sky: 0x8ec9e8,
  fog: 0xa8d4e6,
  sun: 0xfff2d8,
  ground: 0x9aa08a,
  road: 0x3a3f46,
  sidewalk: 0xb9b3a4,
  sand: 0xe8d29a,
  sea: 0x1e7fa8,
  building: [0xe8b48a, 0xd98a7a, 0x9ab8c9, 0xc9c2a8, 0xb08a9e, 0x8fb8a0, 0xe0d0b0, 0x7a9cc0],
  car: [0xc0392b, 0x2e86c1, 0xf1c40f, 0x27ae60, 0x8e44ad, 0xe67e22, 0xecf0f1, 0x1a1a2e],
  palm: 0x2e8b57,
  lightPole: 0x2c3e50,
};

// --- small math helpers -----------------------------------------------------

export function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
export function lerp(a, b, t) { return a + (b - a) * t; }
export function rand(a = 1, b) {
  if (b === undefined) { b = a; a = 0; }
  return a + Math.random() * (b - a);
}
export function randInt(a, b) { return Math.floor(rand(a, b + 1)); }
export function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
export function dist2(ax, az, bx, bz) {
  const dx = ax - bx, dz = az - bz;
  return Math.sqrt(dx * dx + dz * dz);
}
export function angleLerp(a, b, t) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}
export function formatCash(n) {
  return '$' + Math.floor(n).toLocaleString('en-US');
}
export function formatClock(minutes) {
  const h = Math.floor(minutes / 60) % 24;
  const m = Math.floor(minutes % 60);
  return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0');
}

// Road centre lines: roads run between blocks, at x or z = (i - 3.5) * pitch.
export function roadCentres() {
  const out = [];
  for (let i = 0; i < CITY.blocks; i++) out.push((i - 3.5) * CITY.pitch);
  return out;
}
export function nearestRoadCentre(v) {
  let best = roadCentres()[0], bd = Infinity;
  for (const c of roadCentres()) {
    const d = Math.abs(v - c);
    if (d < bd) { bd = d; best = c; }
  }
  return best;
}
