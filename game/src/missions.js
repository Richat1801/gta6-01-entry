// Missions: the five chained story jobs from fixer Rico Vane. A mission is
// a list of steps (steal / drive / goto / pickup / survive / eliminate /
// grab / escape); this module tracks the active step, its marker and its
// completion, and pays the reward in cash.

import * as THREE from 'three';
import { MISSION_DEFS, distance2D } from './config.js';

export class MissionManager {
  constructor(scene, hooks) {
    this.scene = scene;
    this.hooks = hooks; // { onCash, onMessage, onMissionComplete, onCrime }
    this.activeIndex = 0; // index into MISSION_DEFS, or -1 when the story is done
    this.stepIndex = 0;
    this.stepTimer = 0;
    this.stepState = null;
    this.completedCount = 0;
    this.marker = buildMarkerMesh();
    this.marker.visible = false;
    scene.add(this.marker);
    this.beacon = buildBeaconMesh();
    this.beacon.visible = false;
    scene.add(this.beacon);
    this.startMission(0);
  }

  currentDef() {
    return this.activeIndex >= 0 ? MISSION_DEFS[this.activeIndex] : null;
  }

  currentStep() {
    const def = this.currentDef();
    return def ? def.steps[this.stepIndex] : null;
  }

  objectiveText() {
    const def = this.currentDef();
    if (!def) return 'Story complete — Solmar Bay is yours. Free roam!';
    const step = this.currentStep();
    let text = `M${def.id} ${def.title}: ${step.text}`;
    if (step.type === 'survive') {
      text += ` (${Math.max(0, Math.ceil(step.seconds - this.stepTimer))}s)`;
    }
    if (step.type === 'eliminate') {
      const left = step.count - (this.stepState?.kills || 0);
      text = `M${def.id} ${def.title}: Eliminate the rival crew (${left} left)`;
    }
    return text;
  }

  startMission(index) {
    this.activeIndex = index;
    this.stepIndex = 0;
    this.stepTimer = 0;
    this.stepState = null;
    const def = this.currentDef();
    if (def) {
      this.hooks.onMessage(`${def.giver}: ${def.intro}`);
      this.hooks.onMessage(`Mission ${def.id} — ${def.title} ($${def.reward})`);
    }
    this.refreshMarker();
  }

  // Move the ground marker + sky beacon to the current step's target.
  refreshMarker() {
    const step = this.currentStep();
    if (!step || !step.pos) {
      this.marker.visible = false;
      this.beacon.visible = false;
      return;
    }
    this.marker.visible = true;
    this.beacon.visible = true;
    this.marker.position.set(step.pos.x, 0.3, step.pos.z);
    this.beacon.position.set(step.pos.x, 30, step.pos.z);
  }

  markerPosition() {
    const step = this.currentStep();
    return step && step.pos ? { x: step.pos.x, z: step.pos.z } : null;
  }

  // Called when the player steals a car (mission 1, step 1).
  onCarStolen() {
    const step = this.currentStep();
    if (step && step.type === 'steal') this.completeStep();
  }

  // Called when a rival is eliminated (mission 4).
  onRivalKilled() {
    const step = this.currentStep();
    if (!step || step.type !== 'eliminate') return;
    this.stepState = this.stepState || { kills: 0 };
    this.stepState.kills += 1;
    if (this.stepState.kills >= step.count) this.completeStep();
  }

  completeStep() {
    const def = this.currentDef();
    const step = this.currentStep();
    this.hooks.onMessage(`Objective complete: ${step.text}`);
    this.stepIndex += 1;
    this.stepTimer = 0;
    this.stepState = null;
    if (this.stepIndex >= def.steps.length) {
      this.completeMission(def);
    } else {
      this.refreshMarker();
    }
  }

  completeMission(def) {
    this.hooks.onCash(def.reward);
    this.hooks.onMessage(`Mission complete: ${def.title} — +$${def.reward}`);
    this.completedCount += 1;
    this.hooks.onMissionComplete(def);
    if (this.activeIndex + 1 < MISSION_DEFS.length) {
      this.startMission(this.activeIndex + 1);
    } else {
      this.activeIndex = -1;
      this.marker.visible = false;
      this.beacon.visible = false;
      this.hooks.onMessage('All missions complete! Solmar Bay is yours, boss.');
    }
  }

  // Per-frame mission logic. ctx: { playerX, playerZ, inCar, wanted }.
  update(dt, ctx) {
    // Pulse the marker and spin the beacon.
    if (this.marker.visible) {
      const s = 1 + Math.sin(performance.now() * 0.004) * 0.12;
      this.marker.scale.set(s, 1, s);
      this.beacon.rotation.y += dt * 0.8;
    }
    const def = this.currentDef();
    if (!def) return;
    const step = this.currentStep();
    if (!step) return;
    const px = ctx.playerX;
    const pz = ctx.playerZ;
    switch (step.type) {
      case 'steal':
        // Completed via onCarStolen(); nothing to poll.
        break;
      case 'drive':
      case 'goto':
      case 'grab': {
        if (step.pos && distance2D(px, pz, step.pos.x, step.pos.z) < step.radius) {
          if (step.type === 'grab') {
            this.hooks.onMessage('Cash grabbed! Get out of here!');
          }
          this.completeStep();
        }
        break;
      }
      case 'survive': {
        if (ctx.wanted < (step.wanted || 1)) {
          // Heat dropped too early: restart the timer.
          this.stepTimer = 0;
        } else {
          this.stepTimer += dt;
          if (this.stepTimer >= step.seconds) this.completeStep();
        }
        break;
      }
      case 'escape': {
        if (step.pos && distance2D(px, pz, step.pos.x, step.pos.z) < step.radius) {
          this.completeStep();
        }
        break;
      }
      case 'eliminate':
        // Completed via onRivalKilled(); nothing to poll.
        break;
      default:
        break;
    }
  }
}

function buildMarkerMesh() {
  const group = new THREE.Group();
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(2.2, 3.2, 32),
    new THREE.MeshBasicMaterial({ color: 0xff2e88, transparent: true, opacity: 0.85, side: THREE.DoubleSide }),
  );
  ring.rotation.x = -Math.PI / 2;
  group.add(ring);
  const disc = new THREE.Mesh(
    new THREE.CircleGeometry(2.2, 32),
    new THREE.MeshBasicMaterial({ color: 0xff2e88, transparent: true, opacity: 0.25, side: THREE.DoubleSide }),
  );
  disc.rotation.x = -Math.PI / 2;
  disc.position.y = 0.05;
  group.add(disc);
  return group;
}

function buildBeaconMesh() {
  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(0.7, 1.4, 60, 12, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xff2e88, transparent: true, opacity: 0.28, side: THREE.DoubleSide, depthWrite: false }),
  );
  beam.position.y = 0;
  const group = new THREE.Group();
  group.add(beam);
  return group;
}
