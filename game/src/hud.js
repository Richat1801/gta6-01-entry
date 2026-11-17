// Solmar Bay HUD: cash, health, wanted stars, objective, clock and the live minimap.
// One job: everything the player reads on screen, plus the menu screens.

import { WORLD, formatCash, formatClock, clamp } from './config.js';
import { currentMarkerPos } from './missions.js';

export class Hud {
  constructor() {
    this.el = {
      cash: document.getElementById('hud-cash'),
      healthFill: document.getElementById('hud-health-fill'),
      healthText: document.getElementById('hud-health-text'),
      stars: document.getElementById('hud-stars'),
      objective: document.getElementById('hud-objective'),
      missionTitle: document.getElementById('hud-mission-title'),
      clock: document.getElementById('hud-clock'),
      speed: document.getElementById('hud-speed'),
      carName: document.getElementById('hud-car'),
      toast: document.getElementById('hud-toast'),
      hitmarker: document.getElementById('hud-hitmarker'),
      crosshair: document.getElementById('hud-crosshair'),
      damage: document.getElementById('hud-damage'),
      minimap: document.getElementById('hud-minimap'),
      startScreen: document.getElementById('screen-start'),
      pauseScreen: document.getElementById('screen-pause'),
      bustedScreen: document.getElementById('screen-busted'),
      bustedTitle: document.getElementById('busted-title'),
      bustedText: document.getElementById('busted-text'),
      hint: document.getElementById('hud-hint'),
    };
    this.mapCtx = this.el.minimap.getContext('2d');
    this.toastTimer = 0;
    this.hitTimer = 0;
    this.lastToast = '';
  }

  /** Refresh the numbers and bars from the live state. */
  update(state, dt) {
    this.el.cash.textContent = formatCash(state.cash);
    const hp = Math.max(0, Math.round(state.player.health));
    this.el.healthFill.style.width = hp + '%';
    this.el.healthText.textContent = hp;
    this.el.healthFill.style.background = hp > 50 ? '#37c978' : hp > 25 ? '#f2a93b' : '#e74c3c';
    let stars = '';
    for (let i = 0; i < 5; i++) stars += i < state.wanted ? '★' : '☆';
    this.el.stars.textContent = stars;
    this.el.stars.classList.toggle('hot', state.wanted > 0);
    this.el.clock.textContent = formatClock(state.clockMinutes) + '  SOLMAR BAY';
    if (state.driving && state.playerCar) {
      const kmh = Math.round(Math.abs(state.playerCar.speed) * 3.6);
      this.el.speed.textContent = kmh + ' km/h';
      this.el.carName.textContent = state.playerCar.spec.label;
    } else {
      this.el.speed.textContent = '';
      this.el.carName.textContent = state.onFootWeapon === 'pistol' ? 'PISTOL — click to shoot' : 'FISTS — click / F to punch';
    }
    this.el.crosshair.style.display = state.playing && !state.driving ? 'block' : 'none';
    if (this.toastTimer > 0) {
      this.toastTimer -= dt;
      if (this.toastTimer <= 0) this.el.toast.classList.remove('show');
    }
    if (this.hitTimer > 0) {
      this.hitTimer -= dt;
      if (this.hitTimer <= 0) this.el.hitmarker.classList.remove('show');
    }
    if (state.damageFlash > 0) {
      state.damageFlash = Math.max(0, state.damageFlash - dt * 2.2);
      this.el.damage.style.opacity = String(state.damageFlash * 0.55);
    }
  }

  /** Update the mission objective line from the mission manager. */
  updateObjective(mgr, state) {
    const text = mgr.active
      ? `${mgr.active.def.name} — ${mgr.active.step.label}`
      : mgr.done
        ? 'Story complete — free roam!'
        : 'Press M — talk to Rico Vane';
    this.el.objective.textContent = text;
    this.el.missionTitle.textContent = mgr.active ? `JOB ${mgr.active.def.id}/5 · RICO VANE` : 'SOLMAR BAY';
  }

  /** Show a toast line for a few seconds. */
  showToast(text, seconds = 3.5) {
    if (text === this.lastToast && this.toastTimer > 1) return;
    this.lastToast = text;
    this.el.toast.textContent = text;
    this.el.toast.classList.add('show');
    this.toastTimer = seconds;
  }

  /** Flash the hit marker (a shot or punch landed). */
  showHitmarker() {
    this.el.hitmarker.classList.add('show');
    this.hitTimer = 0.25;
  }

  /** Show one screen and hide the others: 'start' | 'pause' | 'busted' | 'none'. */
  showScreen(name, bustedKind) {
    this.el.startScreen.classList.toggle('visible', name === 'start');
    this.el.pauseScreen.classList.toggle('visible', name === 'pause');
    this.el.bustedScreen.classList.toggle('visible', name === 'busted');
    if (name === 'busted') {
      this.el.bustedTitle.textContent = bustedKind === 'wasted' ? 'WASTED' : 'BUSTED';
      this.el.bustedText.textContent =
        bustedKind === 'wasted'
          ? 'The Coral Kings got the better of you. Rico patched you up — $50 hospital bill.'
          : 'The Solmar Bay PD hauled you in. Rico bailed you out — $100 gone.';
    }
  }

  setHint(text) {
    this.el.hint.textContent = text;
  }

  /** Draw the live minimap: sea, roads, player, cars, police, peds and the marker. */
  drawMinimap(state, time) {
    const ctx = this.mapCtx;
    const S = 180;
    const scale = S / (WORLD.maxX - WORLD.minX + 40);
    const toX = (x) => (x - WORLD.minX + 20) * scale;
    const toZ = (z) => (z - WORLD.minZ + 20) * scale;
    ctx.clearRect(0, 0, S, S);
    ctx.fillStyle = '#0e2f1e';
    ctx.fillRect(0, 0, S, S);
    // Sea.
    ctx.fillStyle = '#1e90c8';
    ctx.fillRect(toX(WORLD.seaStart), 0, S - toX(WORLD.seaStart), S);
    // Sand.
    ctx.fillStyle = '#e8d29a';
    ctx.fillRect(toX(WORLD.beachStart), 0, toX(WORLD.seaStart) - toX(WORLD.beachStart), S);
    // City ground.
    ctx.fillStyle = '#5a6b52';
    ctx.fillRect(toX(0), toZ(0), toX(WORLD.citySpan) - toX(0), toZ(WORLD.citySpan) - toZ(0));
    // Roads.
    ctx.strokeStyle = '#3c3f45';
    ctx.lineWidth = 4;
    for (let k = 0; k < WORLD.gridBlocks; k++) {
      const c = (8 + k * 56) * scale + toX(0);
      ctx.beginPath();
      ctx.moveTo(c, toZ(0));
      ctx.lineTo(c, toZ(WORLD.citySpan));
      ctx.stroke();
      const cz = (8 + k * 56) * scale + toZ(0);
      ctx.beginPath();
      ctx.moveTo(toX(0), cz);
      ctx.lineTo(toX(WORLD.citySpan), cz);
      ctx.stroke();
    }
    const dot = (x, z, color, r) => {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(toX(x), toZ(z), r, 0, Math.PI * 2);
      ctx.fill();
    };
    // Mission marker (pulsing).
    const marker = currentMarkerPos(state.missions);
    if (marker) {
      const pulse = 4 + Math.sin(time * 5) * 1.5;
      dot(marker.x, marker.z, '#ffd23e', pulse);
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(toX(marker.x), toZ(marker.z), pulse + 3, 0, Math.PI * 2);
      ctx.stroke();
    }
    // Parked cars.
    for (const c of state.parkedCars) dot(c.x, c.z, c.parked ? '#c8c8c8' : '#888888', 2);
    // Traffic.
    for (const c of state.traffic) dot(c.x, c.z, '#f2c230', 2);
    // Pedestrians.
    for (const p of state.pedestrians) dot(p.x, p.z, '#9fd8ff', 1.2);
    // Police (flashing).
    const policeColor = Math.sin(time * 10) > 0 ? '#ff3333' : '#3388ff';
    for (const c of state.police.cruisers) dot(c.x, c.z, policeColor, 3.5);
    for (const o of state.police.officers) dot(o.x, o.z, policeColor, 2.5);
    // Rivals.
    for (const r of state.rivals || []) if (r.alive) dot(r.x, r.z, '#ff2222', 2.5);
    // Player arrow.
    const px = toX(state.player.x);
    const pz = toZ(state.player.z);
    ctx.save();
    ctx.translate(px, pz);
    ctx.rotate(-state.player.angle + Math.PI);
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#111';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, -7);
    ctx.lineTo(5, 5);
    ctx.lineTo(-5, 5);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
    // North tick.
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 11px sans-serif';
    ctx.fillText('N', S - 14, 14);
  }
}
