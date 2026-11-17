// Solmar Bay — the story: 5 chained missions for fixer Rico Vane.
// One job: mission definitions, step flow, markers and rewards.
// Rewards are paid by main.js, which increments the mission index and only
// then saves — so a mission can never pay twice.

import { MISSION_REWARDS } from './config.js';

function defs(P) {
  return [
    {
      title: '1 — Marina Pickup',
      brief: 'Rico Vane needs a package off the marina docks. Go get it, then bring it to his garage.',
      steps: [
        { kind: 'goto', text: 'Go to the marina docks and collect the package', x: P.marina.x, z: P.marina.z, radius: 6 },
        { kind: 'goto', text: 'Deliver the package to Rico\u2019s garage', x: P.garage.x, z: P.garage.z, radius: 7 },
      ],
    },
    {
      title: '2 — Coast Run',
      brief: 'The package is hot. Drive it downtown before the buyer walks — 100 seconds.',
      steps: [
        { kind: 'goto', text: 'Drive the package to the downtown drop-off — beat the clock!', x: 25, z: -25, radius: 8, timeLimit: 100 },
      ],
    },
    {
      title: '3 — Harbor Heat',
      brief: 'The Dagger crew jumped Rico\u2019s runners at the marina. Go settle it.',
      steps: [
        { kind: 'kill', text: 'Take out the Dagger crew at the marina (0/4)', x: P.marina.x, z: P.marina.z, radius: 26, kills: 4, spawnAt: 'marina' },
        { kind: 'goto', text: 'Report back to Rico\u2019s garage', x: P.garage.x, z: P.garage.z, radius: 7 },
      ],
    },
    {
      title: '4 — Downtown Getaway',
      brief: 'Rico wants the gold Sirocco parked downtown. Steal it — the cops will notice.',
      steps: [
        { kind: 'steal', text: 'Steal the gold Sirocco downtown (walk up and press E)', x: P.targetCarSpot.x, z: P.targetCarSpot.z, radius: 10 },
        { kind: 'escape', text: 'Lose the cops — stay hidden until your wanted level clears', x: P.garage.x, z: P.garage.z, radius: 8 },
        { kind: 'goto', text: 'Bring the Sirocco to Rico\u2019s garage', x: P.garage.x, z: P.garage.z, radius: 8 },
      ],
    },
    {
      title: '5 — Bay Kingpin',
      brief: 'Marlo Kane runs the Daggers from the marina warehouse. End him, and Solmar Bay is yours.',
      steps: [
        { kind: 'kill', text: 'Storm the warehouse — take down Marlo Kane and his guards (0/6)', x: P.warehouse.x, z: P.warehouse.z, radius: 28, kills: 6, spawnAt: 'warehouse', boss: true },
        { kind: 'goto', text: 'Return to Rico\u2019s garage and collect your cut', x: P.garage.x, z: P.garage.z, radius: 7 },
      ],
    },
  ];
}

export class MissionSystem {
  constructor(places, hooks) {
    this.places = places;
    this.hooks = hooks; // {toast, objective, reward, allDone, spawnRivals, setWanted, markTargetCar}
    this.list = defs(places);
    this.missionIndex = 0;
    this.stepIndex = 0;
    this.killsDone = 0;
    this.stepTimer = 0;
    this.active = false;
    this.finishedAll = false;
  }

  current() { return this.list[this.missionIndex] || null; }
  currentStep() {
    const m = this.current();
    return m ? m.steps[this.stepIndex] : null;
  }

  start() {
    this.active = true;
    this.stepIndex = 0;
    this.killsDone = 0;
    this.stepTimer = 0;
    this.enterStep();
  }

  // Restore saved progress exactly (used by Continue).
  restore(missionIndex, stepIndex) {
    this.missionIndex = Math.min(missionIndex, this.list.length - 1);
    this.stepIndex = stepIndex || 0;
    this.killsDone = 0;
    this.stepTimer = 0;
    this.active = true;
    this.enterStep(true);
  }

  enterStep(restoring) {
    const step = this.currentStep();
    const m = this.current();
    if (!step || !m) return;
    this.stepTimer = 0;
    if (step.kind === 'kill') {
      const at = step.spawnAt === 'warehouse' ? this.places.warehouse : this.places.marina;
      this.hooks.spawnRivals(step.kills, at.x, at.z, !!step.boss);
    }
    if (step.kind === 'steal') this.hooks.markTargetCar();
    this.hooks.objective(m.title + ' — ' + step.text);
    if (!restoring) this.hooks.toast(m.title + ': ' + m.brief);
  }

  marker() {
    const step = this.currentStep();
    if (!step || !this.active || this.finishedAll) return null;
    return { x: step.x, z: step.z, kind: step.kind };
  }

  registerKill() {
    const step = this.currentStep();
    if (!step || step.kind !== 'kill') return;
    this.killsDone += 1;
    const m = this.current();
    const left = step.kills - this.killsDone;
    this.hooks.objective(m.title + ' — ' + step.text.replace(/\(\d+\/\d+\)/, '(' + this.killsDone + '/' + step.kills + ')'));
    if (left <= 0) this.advance();
    else this.hooks.toast('Rival down — ' + left + ' to go.');
  }

  notifyCarStolen(car) {
    const step = this.currentStep();
    if (!step || step.kind !== 'steal') return;
    if (!car.target) {
      this.hooks.toast('Wrong car — Rico wants the gold Sirocco downtown.');
      return;
    }
    this.hooks.setWanted(3);
    this.hooks.toast('You stole the Sirocco! The cops are on you — lose them!');
    this.advance();
  }

  update(dt, playerPos, wanted) {
    if (!this.active || this.finishedAll) return;
    const step = this.currentStep();
    if (!step) return;
    if (step.kind === 'goto' || step.kind === 'collect') {
      const d = Math.hypot(playerPos.x - step.x, playerPos.z - step.z);
      if (d <= step.radius) {
        if (this.missionIndex === 0 && this.stepIndex === 0) this.hooks.toast('Package collected. Get it to Rico.');
        this.advance();
        return;
      }
    }
    if (step.kind === 'escape') {
      if (wanted <= 0) {
        this.hooks.toast('Clean. The heat is off — bring the car to Rico.');
        this.advance();
      }
      return;
    }
    if (step.timeLimit) {
      this.stepTimer += dt;
      const left = Math.max(0, Math.ceil(step.timeLimit - this.stepTimer));
      const m = this.current();
      this.hooks.objective(m.title + ' — ' + step.text + '  [' + left + 's]');
      if (this.stepTimer >= step.timeLimit) {
        this.hooks.toast('Too slow — the buyer walked. Rico gives you another shot.');
        this.stepIndex = 0;
        this.enterStep();
      }
    }
  }

  advance() {
    const m = this.current();
    this.stepIndex += 1;
    if (this.stepIndex >= m.steps.length) {
      this.completeMission();
    } else {
      this.enterStep();
    }
  }

  completeMission() {
    const reward = MISSION_REWARDS[this.missionIndex] || 0;
    this.hooks.reward(reward);
    this.hooks.toast('Mission complete! +' + '$' + reward);
    // main.js increments the index and saves, in that order.
    this.hooks.missionComplete(this.missionIndex, reward);
  }

  // Called by main.js after it has incremented the index and saved.
  afterComplete(nextIndex) {
    this.missionIndex = nextIndex;
    this.stepIndex = 0;
    this.killsDone = 0;
    this.stepTimer = 0;
    if (this.missionIndex >= this.list.length) {
      this.finishedAll = true;
      this.active = false;
      this.hooks.objective('Solmar Bay is yours. Thanks for playing!');
      this.hooks.allDone();
    } else {
      this.enterStep();
    }
  }
}
