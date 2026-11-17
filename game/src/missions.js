// Solmar Bay: story missions. One job: the 5 chained jobs from fixer Rico Vane —
// objectives, markers, timers, rewards. The game loop asks for the active
// objective text and target; this system decides when a mission completes.

import * as THREE from 'three';
import { dist2, formatCash } from './config.js';

function makeBeacon(color) {
  const g = new THREE.Group();
  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(1.6, 1.6, 60, 12, 1, true),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false })
  );
  beam.position.y = 30;
  g.add(beam);
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(1.6, 2.4, 24),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85, side: THREE.DoubleSide })
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.15;
  g.add(ring);
  const pin = new THREE.Mesh(
    new THREE.ConeGeometry(0.7, 2.2, 8),
    new THREE.MeshBasicMaterial({ color })
  );
  pin.position.y = 4;
  pin.rotation.x = Math.PI;
  g.add(pin);
  g.userData.ring = ring;
  return g;
}

const MISSION_DEFS = [
  {
    id: 1, title: 'First Wheels', giver: 'Rico Vane',
    briefing: 'Rico Vane: "New in Solmar Bay? Prove you can drive. Get to my garage on the south side."',
    objective: 'Drive to Rico\'s garage',
    target: (sp) => ({ x: sp.garage.x, z: sp.garage.z }),
    radius: 7, reward: 150, type: 'reach',
  },
  {
    id: 2, title: 'Coast Run', giver: 'Rico Vane',
    briefing: 'Rico Vane: "Package is waiting on the pier. Grab it, then run it to the Marlin Hotel. Ninety seconds — the tide waits for no one."',
    objective: 'Pick up the package at the pier',
    target: (sp) => ({ x: sp.pier.x, z: sp.pier.z }),
    radius: 6, reward: 300, type: 'pickup-deliver', timeLimit: 90,
    secondTarget: (sp) => ({ x: sp.hotel.x, z: sp.hotel.z }),
    secondObjective: 'Deliver the package to the Marlin Hotel',
  },
  {
    id: 3, title: 'Tail the Shark', giver: 'Rico Vane',
    briefing: 'Rico Vane: "The Shark Boys skimmed my cut. Their runner is leaving the warehouse district — stay on him, don\'t lose him."',
    objective: 'Tail the Shark Boys runner — stay close',
    target: null, radius: 0, reward: 450, type: 'tail',
  },
  {
    id: 4, title: 'Warehouse Heat', giver: 'Rico Vane',
    briefing: 'Rico Vane: "Time to send a message. The Shark Boys are holed up in the north warehouse. Clear them out — pistol\'s in your hand, kid."',
    objective: 'Clear out the Shark Boys at the warehouse',
    target: (sp) => ({ x: sp.warehouse.x, z: sp.warehouse.z }),
    radius: 10, reward: 700, type: 'shootout',
  },
  {
    id: 5, title: 'Bay Escape', giver: 'Rico Vane',
    briefing: 'Rico Vane: "Last one. Grab the stash from the hideout, then lose the heat and vanish. Do this and Solmar Bay is yours."',
    objective: 'Grab the stash at the hideout',
    target: (sp) => ({ x: sp.hideout.x, z: sp.hideout.z }),
    radius: 6, reward: 1200, type: 'escape',
    secondTarget: (sp) => ({ x: sp.hotel.x, z: sp.hotel.z }),
    secondObjective: 'Lose the heat and reach the Marlin Hotel',
  },
];

export class MissionSystem {
  constructor(scene, spawnPoints, callbacks) {
    this.scene = scene;
    this.spawnPoints = spawnPoints;
    this.cb = callbacks; // { onMissionStart, onMissionComplete, onMissionFailed, onToast, onPickup }
    this.index = 0; // next mission to play (0-based); 5 = story done
    this.active = null;
    this.beacon = makeBeacon(0xffd23f);
    this.beacon.visible = false;
    this.scene.add(this.beacon);
    this.tailCar = null;
    this.tailTimer = 0;
    this.tailClose = 0;
    this.missionTimer = 0;
    this.stage = 0; // 0 = first leg, 1 = second leg (pickup/deliver, escape)
  }

  get currentDef() {
    return this.index < MISSION_DEFS.length ? MISSION_DEFS[this.index] : null;
  }

  get objectiveText() {
    if (!this.active) {
      const def = this.currentDef;
      return def ? 'Next job: ' + def.title + ' — see Rico' : 'Story complete — Solmar Bay is yours. Free roam!';
    }
    if (this.active.def.type === 'tail') {
      return this.active.def.objective + ' (' + Math.ceil(this.tailClose) + 's / 10s close)';
    }
    if (this.active.def.timeLimit && this.stage === 1) {
      return this.active.def.secondObjective + ' — ' + Math.max(0, Math.ceil(this.missionTimer)) + 's left';
    }
    if (this.stage === 1 && this.active.def.secondObjective) return this.active.def.secondObjective;
    return this.active.def.objective;
  }

  get targetPos() {
    if (!this.active) return null;
    const def = this.active.def;
    if (def.type === 'tail') return this.tailCar ? { x: this.tailCar.mesh.position.x, z: this.tailCar.mesh.position.z } : null;
    if (this.stage === 1 && def.secondTarget) return def.secondTarget(this.spawnPoints);
    if (!def.target) return null;
    return def.target(this.spawnPoints);
  }

  startNext() {
    const def = this.currentDef;
    if (!def) return false;
    this.active = { def, startedAt: performance.now() };
    this.stage = 0;
    this.missionTimer = def.timeLimit || 0;
    this.tailClose = 0;
    this.tailTimer = 0;
    if (def.type === 'tail') this._startTail();
    if (def.type === 'shootout' && this.cb.onSpawnGang) {
      // Gang holds the open street on the warehouse's south side (never inside it).
      this.cb.onSpawnGang(4, this.spawnPoints.warehouse.x, this.spawnPoints.warehouse.z + 24, 10);
    }
    if (def.type === 'escape' && this.cb.onAddWanted) this.cb.onAddWanted(0, ''); // heat comes after pickup
    const t = this.targetPos;
    if (t) this._moveBeacon(t.x, t.z);
    if (this.cb.onMissionStart) this.cb.onMissionStart(def);
    return true;
  }

  _startTail() {
    if (this.cb.onSpawnTailCar) this.tailCar = this.cb.onSpawnTailCar();
    this.tailClose = 0;
  }

  _moveBeacon(x, z) {
    this.beacon.position.set(x, 0, z);
    this.beacon.visible = true;
  }

  _hideBeacon() { this.beacon.visible = false; }

  completeActive(reason) {
    if (!this.active) return;
    const def = this.active.def;
    this.active = null;
    this._hideBeacon();
    if (def.type === 'tail' && this.cb.onDespawnTailCar) this.cb.onDespawnTailCar();
    this.index++;
    if (this.cb.onMissionComplete) this.cb.onMissionComplete(def, reason);
  }

  failActive(reason) {
    if (!this.active) return;
    const def = this.active.def;
    this.active = null;
    this._hideBeacon();
    if (def.type === 'tail' && this.cb.onDespawnTailCar) this.cb.onDespawnTailCar();
    if (this.cb.onMissionFailed) this.cb.onMissionFailed(def, reason);
  }

  // Called every frame with the player's position and gang count.
  update(dt, playerPos, gangAlive) {
    if (this.beacon.visible) {
      this.beacon.rotation.y += dt * 1.2;
      const s = 1 + Math.sin(performance.now() * 0.005) * 0.12;
      this.beacon.userData.ring.scale.set(s, s, 1);
    }
    if (!this.active) return;
    const def = this.active.def;
    const target = this.targetPos;

    if (def.type === 'reach') {
      if (target && dist2(playerPos.x, playerPos.z, target.x, target.z) < def.radius) {
        this.completeActive('Reached Rico\'s garage.');
      }
      return;
    }
    if (def.type === 'pickup-deliver') {
      if (this.stage === 0) {
        if (target && dist2(playerPos.x, playerPos.z, target.x, target.z) < def.radius) {
          this.stage = 1;
          this.missionTimer = def.timeLimit;
          if (this.cb.onPickup) this.cb.onPickup('Package secured. Run it to the Marlin Hotel!');
          const t2 = def.secondTarget(this.spawnPoints);
          this._moveBeacon(t2.x, t2.z);
        }
        return;
      }
      this.missionTimer -= dt;
      if (this.missionTimer <= 0) { this.failActive('Too slow — the buyer walked.'); return; }
      if (target && dist2(playerPos.x, playerPos.z, target.x, target.z) < def.radius) {
        this.completeActive('Package delivered on time.');
      }
      return;
    }
    if (def.type === 'tail') {
      if (!this.tailCar) { this.failActive('Lost the runner.'); return; }
      const d = dist2(playerPos.x, playerPos.z, this.tailCar.mesh.position.x, this.tailCar.mesh.position.z);
      if (d < 26) {
        this.tailClose += dt;
        if (this.tailClose >= 10) this.completeActive('You stayed on the runner. Rico knows where they hide now.');
      } else {
        this.tailClose = Math.max(0, this.tailClose - dt * 0.5);
      }
      if (d > 90) this.failActive('Lost the runner in the city.');
      return;
    }
    if (def.type === 'shootout') {
      if (gangAlive === 0) this.completeActive('Warehouse cleared. The Shark Boys got the message.');
      return;
    }
    if (def.type === 'escape') {
      if (this.stage === 0) {
        if (target && dist2(playerPos.x, playerPos.z, target.x, target.z) < def.radius) {
          this.stage = 1;
          if (this.cb.onAddWanted) this.cb.onAddWanted(3, 'stash grabbed — the whole PD is coming');
          if (this.cb.onPickup) this.cb.onPickup('Stash grabbed! Lose the heat, then reach the Marlin Hotel.');
          const t2 = def.secondTarget(this.spawnPoints);
          this._moveBeacon(t2.x, t2.z);
        }
        return;
      }
      if (target && dist2(playerPos.x, playerPos.z, target.x, target.z) < def.radius) {
        if (this.cb.onWantedNow) {
          if (this.cb.onWantedNow() > 0) return; // still hot — must lose the heat first
        }
        this.completeActive('Clean getaway. Solmar Bay is yours.');
      }
      return;
    }
  }
}
