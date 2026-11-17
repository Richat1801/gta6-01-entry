// Solmar Bay — Heat of the Coast: tuning constants, world layout and story data.
// One job: every number the rest of the game reads, in one place.

export const WORLD = {
  gridBlocks: 8, // roads per axis
  blockSize: 40, // building block side
  roadWidth: 16, // road strip width
  pitch: 56, // blockSize + roadWidth
  citySpan: 448, // 8 * pitch
  beachStart: 448, // sand strip begins here
  seaStart: 505, // water begins here
  minX: -24,
  maxX: 620,
  minZ: -24,
  maxZ: 472,
};

export function roadCenter(k) {
  return 8 + k * WORLD.pitch;
}

export function nearestRoadCoord(v) {
  let best = roadCenter(0);
  for (let k = 1; k < WORLD.gridBlocks; k++) {
    const c = roadCenter(k);
    if (Math.abs(c - v) < Math.abs(best - v)) best = c;
  }
  return best;
}

export const PLAYER = {
  walkSpeed: 6,
  sprintSpeed: 10,
  jumpSpeed: 8,
  gravity: 22,
  radius: 0.7,
  maxHealth: 100,
  startCash: 120,
};

export const DRIVING = {
  accel: 16,
  brake: 30,
  reverseMax: 12,
  maxSpeed: 38,
  sportMax: 48,
  steerRate: 1.9,
  grip: 0.94,
};

export const TRAFFIC = {
  count: 10,
  speedMin: 8,
  speedMax: 13,
};

export const PEDESTRIANS = {
  count: 26,
  walkMin: 1.2,
  walkMax: 2.4,
};

export const PARKED_CARS = 14;

export const WANTED = {
  maxStars: 5,
  decaySeconds: 25,
  stealStars: 1,
  hitPedStars: 1,
  shootStars: 1,
};

export const COMBAT = {
  punchRange: 2.4,
  punchDamage: 26,
  pistolDamage: 34,
  pistolRange: 60,
  rivalHealth: 100,
  rivalShotDamage: 6,
};

export const MISSIONS = [
  {
    id: 1,
    name: 'First Wheels',
    giver: 'Rico Vane',
    briefing: 'Rico needs wheels. Grab the marked coupe on Coral Row and bring it to the marina.',
    reward: 250,
    steps: [
      { type: 'enterCar', label: 'Get in the marked coupe', carIndex: 0, radius: 4 },
      { type: 'goto', label: 'Drive to the Marina Point', x: 400, z: 400, radius: 9 },
    ],
  },
  {
    id: 2,
    name: 'The Package',
    giver: 'Rico Vane',
    briefing: 'A package is waiting on Palm Court. Pick it up and drop it at the Solmar Hotel.',
    reward: 400,
    steps: [
      { type: 'goto', label: 'Pick up the package on Palm Court', x: 120, z: 64, radius: 6 },
      { type: 'goto', label: 'Deliver the package to the Solmar Hotel', x: 344, z: 344, radius: 7 },
    ],
  },
  {
    id: 3,
    name: 'Tail Job',
    giver: 'Rico Vane',
    briefing: 'A courier is running product across town. Tail his sedan — stay close, do not lose him.',
    reward: 600,
    steps: [
      { type: 'chase', label: 'Tail the courier — stay within 25m', holdSeconds: 12, maxDistance: 25 },
    ],
  },
  {
    id: 4,
    name: 'Pier Shootout',
    giver: 'Rico Vane',
    briefing: 'The Coral Kings took our pier. Take it back. Pistol out, make every shot count.',
    reward: 800,
    steps: [
      { type: 'shootout', label: 'Clear the Coral Kings off the pier', x: 478, z: 128, radius: 30, rivals: 4 },
    ],
  },
  {
    id: 5,
    name: 'The Big Score',
    giver: 'Rico Vane',
    briefing: 'One last job: the Bay Bank vault. Grab the cash, then lose the heat at the safehouse.',
    reward: 1500,
    steps: [
      { type: 'goto', label: 'Reach the Bay Bank', x: 232, z: 232, radius: 8 },
      { type: 'channel', label: 'Crack the vault — hold position', x: 232, z: 232, radius: 8, holdSeconds: 4 },
      { type: 'escape', label: 'Lose the cops — reach the safehouse', x: 64, z: 64, radius: 9 },
    ],
  },
];

export const CAR_MODELS = [
  { model: 'sedan', label: 'Solmar Sedan', color: 0x3a7bd5, topSpeed: 38 },
  { model: 'coupe', label: 'Vela Coupe', color: 0xd83a3a, topSpeed: 46 },
  { model: 'taxi', label: 'Bay Taxi', color: 0xf2c230, topSpeed: 36 },
  { model: 'van', label: 'Cargo Van', color: 0x8a8f98, topSpeed: 32 },
  { model: 'truck', label: 'Pickup', color: 0x2e8b57, topSpeed: 36 },
  { model: 'sport', label: 'Comet GT', color: 0xff7a1a, topSpeed: 48 },
];

export const PALETTE = {
  sky: 0x87ceeb,
  sun: 0xfff2d0,
  sea: 0x1e90c8,
  sand: 0xe8d29a,
  asphalt: 0x3c3f45,
  sidewalk: 0x9aa0a3,
  grass: 0x7fae62,
  building: [0xf5efe0, 0xe8b48c, 0x7fb3c8, 0xd96a5f, 0xf2d492, 0x9db8a0, 0xc98bb0, 0x8fa3c8],
  window: 0x2b3a4a,
};

// ---- small shared helpers -------------------------------------------------

export function clamp(v, a, b) {
  return v < a ? a : v > b ? b : v;
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

export function rand(a, b) {
  return a + Math.random() * (b - a);
}

export function randInt(a, b) {
  return Math.floor(rand(a, b + 1));
}

export function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

export function distance2D(ax, az, bx, bz) {
  const dx = ax - bx;
  const dz = az - bz;
  return Math.sqrt(dx * dx + dz * dz);
}

export function angleLerp(a, b, t) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

export function formatClock(totalMinutes) {
  const h = Math.floor(totalMinutes / 60) % 24;
  const m = Math.floor(totalMinutes % 60);
  return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0');
}

export function formatCash(n) {
  return '$' + Math.floor(n).toLocaleString('en-US');
}
