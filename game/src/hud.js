// Solmar Bay: HUD + minimap. One job: every on-screen readout — cash, health,
// wanted stars, objective, clock, speed — and the live canvas minimap.

import { CITY, formatCash, formatClock } from './config.js';

export class HUD {
  constructor() {
    this.cashEl = document.getElementById('hud-cash');
    this.healthFill = document.getElementById('hud-health-fill');
    this.healthText = document.getElementById('hud-health-text');
    this.starsEl = document.getElementById('hud-stars');
    this.objectiveEl = document.getElementById('hud-objective');
    this.objectiveDist = document.getElementById('hud-objective-dist');
    this.clockEl = document.getElementById('hud-clock');
    this.speedEl = document.getElementById('hud-speed');
    this.ammoEl = document.getElementById('hud-ammo');
    this.weaponEl = document.getElementById('hud-weapon');
    this.toastEl = document.getElementById('hud-toast');
    this.crosshairEl = document.getElementById('hud-crosshair');
    this.hitmarkEl = document.getElementById('hud-hitmark');
    this.vignetteEl = document.getElementById('hud-vignette');
    this.minimap = document.getElementById('hud-minimap');
    this.mm = this.minimap ? this.minimap.getContext('2d') : null;
    this._toastTimer = null;
    this._lastStars = -1;
  }

  toast(text, ms = 4200) {
    if (!this.toastEl) return;
    this.toastEl.textContent = text;
    this.toastEl.classList.add('show');
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => this.toastEl.classList.remove('show'), ms);
  }

  update(state) {
    if (this.cashEl) this.cashEl.textContent = formatCash(state.cash);
    const hp = Math.max(0, Math.round(state.health));
    if (this.healthFill) this.healthFill.style.width = hp + '%';
    if (this.healthText) this.healthText.textContent = hp;
    if (this.starsEl && state.stars !== this._lastStars) {
      this._lastStars = state.stars;
      let s = '';
      for (let i = 0; i < 5; i++) s += i < state.stars ? '★' : '☆';
      this.starsEl.textContent = s;
      this.starsEl.classList.toggle('hot', state.stars > 0);
    }
    if (this.objectiveEl) this.objectiveEl.textContent = state.objective;
    if (this.objectiveDist) {
      this.objectiveDist.textContent = state.objectiveDist != null ? Math.round(state.objectiveDist) + 'm' : '';
    }
    if (this.clockEl) this.clockEl.textContent = formatClock(state.clockMinutes);
    if (this.speedEl) {
      this.speedEl.textContent = state.inCar ? Math.round(Math.abs(state.speed) * 3.6) + ' km/h' : '';
    }
    if (this.ammoEl) this.ammoEl.textContent = state.weapon === 'pistol' ? 'AMMO ' + state.ammo : '';
    if (this.weaponEl) this.weaponEl.textContent = state.weapon === 'pistol' ? 'PISTOL [2]' : 'FISTS [1]';
    if (this.crosshairEl) this.crosshairEl.style.display = state.inCar || state.weapon !== 'pistol' ? 'none' : 'block';
    if (this.hitmarkEl) this.hitmarkEl.style.opacity = state.hitmark ? '1' : '0';
    if (this.vignetteEl) this.vignetteEl.style.opacity = state.lowHealth ? '1' : '0';
  }

  // Top-down live map: roads, sea, player, cars, police, mission marker.
  drawMinimap(view) {
    if (!this.mm) return;
    const c = this.mm;
    const S = 180;
    const half = 340; // world half-extent shown
    const toMap = (x, z) => [((x + half) / (half * 2)) * S, ((z + half) / (half * 2)) * S];
    c.clearRect(0, 0, S, S);
    c.fillStyle = 'rgba(20, 28, 34, 0.82)';
    c.fillRect(0, 0, S, S);
    // Sea (east).
    const [seaX] = toMap(CITY.seaX, 0);
    c.fillStyle = '#1e7fa8';
    c.fillRect(seaX, 0, S - seaX, S);
    // Sand.
    const [beachX] = toMap(CITY.beachX, 0);
    c.fillStyle = '#e8d29a';
    c.fillRect(beachX, 0, seaX - beachX, S);
    // Roads.
    c.fillStyle = '#4a4f57';
    for (let i = 0; i < 8; i++) {
      const pos = ((i - 3.5) * 52 + half) / (half * 2) * S;
      c.fillRect(0, pos - 1.5, S, 3);
      c.fillRect(pos - 1.5, 0, 3, S);
    }
    // Mission marker (pulsing gold diamond).
    if (view.mission) {
      const [mx, my] = toMap(view.mission.x, view.mission.z);
      const pulse = 5 + Math.sin(performance.now() * 0.006) * 2;
      c.fillStyle = '#ffd23f';
      c.beginPath();
      c.moveTo(mx, my - pulse); c.lineTo(mx + pulse, my);
      c.lineTo(mx, my + pulse); c.lineTo(mx - pulse, my);
      c.closePath(); c.fill();
    }
    // Traffic cars (white dots).
    c.fillStyle = '#ffffff';
    for (const car of view.traffic || []) {
      const [x, y] = toMap(car.x, car.z);
      c.fillRect(x - 1.5, y - 1.5, 3, 3);
    }
    // Police (flashing blue/red).
    const flashBlue = Math.floor(performance.now() / 300) % 2 === 0;
    c.fillStyle = flashBlue ? '#3a86ff' : '#ff2d2d';
    for (const p of view.police || []) {
      const [x, y] = toMap(p.x, p.z);
      c.beginPath(); c.arc(x, y, 3.5, 0, Math.PI * 2); c.fill();
    }
    // Player (green arrow, rotated to heading).
    const [px, py] = toMap(view.player.x, view.player.z);
    c.save();
    c.translate(px, py);
    c.rotate(view.player.yaw);
    c.fillStyle = '#2ecc71';
    c.beginPath();
    c.moveTo(0, -7); c.lineTo(5, 5); c.lineTo(-5, 5);
    c.closePath(); c.fill();
    c.restore();
  }
}
