// Solmar Bay — Heat of the Coast: shared tuning, layout and story data.
// Every other module reads its numbers from here so the whole game stays
// in one place when the balance changes.

export const CONFIG = {
  // City grid: 8 x 8 blocks, roads on a 52-unit pitch, 12-unit road width.
  pitch: 52,
  blocks: 8,
  roadWidth: 12,
  blockSize: 40,
  cityHalf: 208, // roads run from -208 to +208 on both axes
  beachStart: 208, // sand strip east of the city
  beachEnd: 262,
  seaStart: 262,
  seaEnd: 560,
  // Player on foot
  walkSpeed: 7,
  sprintSpeed: 12,
  jumpSpeed: 9,
  gravity: 26,
  playerRadius: 0.7,
  playerHeight: 1.8,
  // Driving
  carAccel: 26,
  carBrake: 42,
  carMaxSpeed: 38,
  carReverseMax: 12,
  carTurnRate: 1.9,
  // Wanted system
  wantedDecayDelay: 18, // seconds of quiet before a star fades
  wantedDecayStep: 12, // seconds per star once fading
  maxWanted: 5,
  // Combat
  pistolDamage: 34,
  pistolRange: 90,
  pistolFireDelay: 0.22,
  punchDamage: 20,
  punchRange: 2.4,
  playerMaxHealth: 100,
  rivalHealth: 100,
  // World population
  parkedCars: 14,
  trafficCars: 10,
  pedestrians: 26,
  // Clock: one game minute per real second, starting late morning
  clockStartMinutes: 10 * 60 + 24,
  dayLengthSeconds: 1440,
  // Save
  saveKey: 'solmar-bay-save-v1',
};

// Named places the missions and the HUD point at. All coordinates are world
// units on the ground plane (y = 0).
export const PLACES = {
  ricosGarage: { x: -156, z: -156, label: "Rico's Garage" },
  beachfront: { x: 226, z: 96, label: 'Solmar Beachfront' },
  marinaContact: { x: -104, z: 156, label: 'Marina Contact' },
  dropPoint: { x: 156, z: -104, label: 'North Drop Point' },
  safehouse: { x: -156, z: -182, label: 'Safehouse' },
  docks: { x: -182, z: 182, label: 'South Docks' },
  bayBank: { x: 26, z: 26, label: 'Bay Bank' },
  hideout: { x: -104, z: -104, label: 'Hideout' },
  palmsPlaza: { x: 26, z: 26, label: 'Palms Plaza' },
};

// The five chained story missions from fixer Rico Vane. Each mission is a
// list of steps; a step completes when the player reaches its marker (drive
// or on foot), survives its timer, or eliminates its targets.
export const MISSION_DEFS = [
  {
    id: 1,
    title: 'First Wheels',
    giver: 'Rico Vane',
    intro: 'Rico needs wheels. Steal any parked car and bring it to the beachfront.',
    reward: 500,
    steps: [
      { type: 'steal', text: 'Steal a parked car (walk up and press E)', radius: 4 },
      { type: 'drive', pos: PLACES.beachfront, text: 'Drive to the Solmar Beachfront', radius: 10 },
    ],
  },
  {
    id: 2,
    title: 'The Pickup',
    giver: 'Rico Vane',
    intro: 'A package is waiting at the marina. Pick it up and drop it north.',
    reward: 800,
    steps: [
      { type: 'goto', pos: PLACES.marinaContact, text: 'Pick up the package at the Marina', radius: 6 },
      { type: 'drive', pos: PLACES.dropPoint, text: 'Deliver the package to the North Drop', radius: 8 },
    ],
  },
  {
    id: 3,
    title: 'Hot Pursuit',
    giver: 'Rico Vane',
    intro: 'The heat is on. Lose the cops and reach the safehouse in one piece.',
    reward: 1200,
    steps: [
      { type: 'survive', seconds: 45, wanted: 3, text: 'Survive the heat for 45 seconds', radius: 0 },
      { type: 'drive', pos: PLACES.safehouse, text: 'Reach the Safehouse', radius: 10 },
    ],
  },
  {
    id: 4,
    title: 'Dockside Shootout',
    giver: 'Rico Vane',
    intro: 'Rivals moved on the docks. Clear them out — pistol ready.',
    reward: 2000,
    steps: [
      { type: 'goto', pos: PLACES.docks, text: 'Head to the South Docks', radius: 8 },
      { type: 'eliminate', count: 4, text: 'Eliminate the rival crew (4)', radius: 0 },
    ],
  },
  {
    id: 5,
    title: 'The Bay Heist',
    giver: 'Rico Vane',
    intro: 'One last job: hit the Bay Bank, grab the cash, vanish.',
    reward: 5000,
    steps: [
      { type: 'goto', pos: PLACES.bayBank, text: 'Reach the Bay Bank', radius: 8 },
      { type: 'grab', text: 'Grab the cash (stand in the vault marker)', radius: 6 },
      { type: 'escape', wanted: 3, pos: PLACES.hideout, text: 'Escape the heat — reach the Hideout', radius: 10 },
    ],
  },
];

// Warm coastal palette: sun-bleached walls, teal sea, coral accents.
export const PALETTE = {
  sky: 0x87c5e8,
  sun: 0xfff2d0,
  sea: 0x1e7fa8,
  sand: 0xe8d3a2,
  asphalt: 0x3a3f46,
  sidewalk: 0xb9b3a4,
  grass: 0x5da24a,
  buildings: [0xe8b4a0, 0xf2d8a7, 0xa7c8e8, 0xd8a7c8, 0xf5f0e6, 0x9fc8b8, 0xe8c8a0, 0xc8b8e8],
  carPaint: [0xd23c2e, 0x2e6fd2, 0xf2c230, 0x222831, 0xe8e8e8, 0x2ea86a, 0x8a4fd2, 0xe87a2e],
  palmTrunk: 0x7a5230,
  palmLeaf: 0x3f9e4d,
};

// Small math helpers shared by every module.
export function clamp(value, min, max) {
  return value < min ? min : value > max ? max : value;
}
export function lerp(a, b, t) {
  return a + (b - a) * t;
}
export function rand(min, max) {
  return min + Math.random() * (max - min);
}
export function randPick(list) {
  return list[Math.floor(Math.random() * list.length)];
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
