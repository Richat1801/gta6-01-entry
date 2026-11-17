// Solmar Bay — story missions: five chained jobs for fixer Rico Vane, from a
// first meeting at the marina to a turf shootout at the warehouse. Each
// mission is a small state machine: objective text, map marker, dialogue,
// completion test and cash reward.
import * as THREE from 'three';

export const MISSION_DEFS = [
  {
    id: 'meet-rico',
    name: '1 — The Fixer',
    intro: 'Rico Vane runs Solmar Bay from a folding chair on the marina. He has work for a driver with no questions.',
    objective: 'Meet Rico at the Marina pier',
    marker: 'marina',
    reward: 150,
    hint: 'Follow the yellow marker. Walk or grab a car — E steals one.',
    dialogue: [
      'RICO: "You\'re the new kid. Good. Solmar Bay eats the slow."',
      'RICO: "First rule: the cops own the day. We own the night."',
      'RICO: "Prove you can drive and this city is yours."',
    ],
  },
  {
    id: 'borrowed-wheels',
    name: '2 — Borrowed Wheels',
    intro: 'Rico needs a clean ride for a client. "Borrow" any car on the street and bring it to the garage.',
    objective: 'Steal a car (E) and drive it to Rico\'s Garage',
    marker: 'garage',
    reward: 400,
    hint: 'Press E near a parked car to take it. Don\'t let the cops see you.',
    dialogue: [
      'RICO: "Nice. The client pays cash, no names."',
      'RICO: "One more job and you\'re not a tourist anymore."',
    ],
  },
  {
    id: 'sunset-run',
    name: '3 — Sunset Run',
    intro: 'A package has to reach the beach kiosk before the sun drops. The clock is already running.',
    objective: 'Deliver the package to the Beach Kiosk — 90 seconds',
    marker: 'kiosk',
    reward: 600,
    timeLimit: 90,
    hint: 'Drive fast, cut corners, ignore the traffic. Shift is boost.',
    dialogue: [
      'RICO: "Ninety seconds. The kiosk guy closes at sunset."',
      'RICO: "If the cops light you up, lose them first."',
    ],
  },
  {
    id: 'heat-wave',
    name: '4 — Heat Wave',
    intro: 'The Sunset Run was spotted. SBPD has your plate. Shake the heat — get your wanted level to zero.',
    objective: 'Lose the cops — get to 0 stars',
    marker: null,
    reward: 800,
    forceWanted: 3,
    hint: 'Hide in the back streets, keep moving, wait for the stars to fade.',
    dialogue: [
      'RICO: "They made the car. Lay low, kid. Don\'t come back hot."',
      'DISPATCH (radio): "All units, suspect last seen downtown Solmar."',
    ],
  },
  {
    id: 'turf-war',
    name: '5 — Turf War',
    intro: 'The Red Tide crew jumped Rico\'s warehouse. Take the docks back — and make it stick.',
    objective: 'Clear the Warehouse of Red Tide rivals (0 left)',
    marker: 'warehouse',
    reward: 2500,
    enemies: 6,
    hint: 'Click to shoot, F to punch. Use the crates as cover.',
    dialogue: [
      'RICO: "They took my warehouse. Take it back and it\'s yours too."',
      'RICO: "No cops this time — just you and them."',
    ],
  },
];

export class MissionManager {
  constructor(spawnPoints, callbacks) {
    this.spawnPoints = spawnPoints;
    this.cb = callbacks; // {onStart, onComplete, onFail, onDialogue, setWanted, spawnEnemies, clearEnemies, getState}
    this.index = 0;
    this.active = false;
    this.stage = 'idle'; // idle | go | done
    this.timer = 0;
    this.markerPos = null;
    this.enemiesLeft = 0;
    this.startedOnce = false;
  }

  get current() { return MISSION_DEFS[this.index] || null; }
  get done() { return this.index >= MISSION_DEFS.length; }

  markerPosition() {
    const def = this.current;
    if (!def || !def.marker) return null;
    return this.spawnPoints[def.marker];
  }

  start() {
    const def = this.current;
    if (!def || this.active) return;
    this.active = true;
    this.stage = 'go';
    this.startedOnce = true;
    this.timer = def.timeLimit || 0;
    this.markerPos = this.markerPosition();
    if (def.forceWanted) this.cb.setWanted(def.forceWanted);
    if (def.enemies) {
      this.cb.spawnEnemies(this.spawnPoints.warehouse, def.enemies);
      this.enemiesLeft = def.enemies;
    }
    this.cb.onStart(def);
  }

  /** Per-frame progress checks. ctx: {pos, inCar, wanted, enemiesLeft}. */
  update(dt, ctx) {
    if (!this.active) return;
    const def = this.current;
    if (def.timeLimit) {
      this.timer -= dt;
      if (this.timer <= 0) { this.fail('Out of time — the package never arrived.'); return; }
    }
    if (def.id === 'meet-rico' && this.markerPos && ctx.pos.distanceTo(this.markerPos) < 6) {
      this.complete(); return;
    }
    if (def.id === 'borrowed-wheels' && ctx.inCar && this.markerPos && ctx.pos.distanceTo(this.markerPos) < 8) {
      this.complete(); return;
    }
    if (def.id === 'sunset-run' && this.markerPos && ctx.pos.distanceTo(this.markerPos) < 8) {
      this.complete(); return;
    }
    if (def.id === 'heat-wave' && ctx.wanted === 0) {
      this.complete(); return;
    }
    if (def.id === 'turf-war') {
      this.enemiesLeft = ctx.enemiesLeft;
      if (this.enemiesLeft <= 0 && ctx.pos.distanceTo(this.spawnPoints.warehouse) < 30) {
        this.complete(); return;
      }
    }
  }

  complete() {
    const def = this.current;
    this.active = false;
    this.stage = 'done';
    this.index++; // advance BEFORE the callback, so its save records the new index
    this.cb.clearEnemies();
    this.cb.onComplete(def);
    this.markerPos = this.markerPosition();
  }

  fail(reason) {
    const def = this.current;
    this.active = false;
    this.stage = 'idle';
    this.cb.clearEnemies();
    this.cb.onFail(def, reason);
  }

  /** Skip to the next mission (used after a fail, or R restarts the current one). */
  retry() {
    this.active = false;
    this.stage = 'idle';
    this.start();
  }

  stateForSave() { return { index: this.index, active: this.active }; }
  loadState(s) {
    if (!s) return;
    this.index = Math.min(s.index || 0, MISSION_DEFS.length);
    this.active = false;
    this.markerPos = this.markerPosition();
  }
}
