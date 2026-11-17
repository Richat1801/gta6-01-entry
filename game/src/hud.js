// Solmar Bay — HUD: wanted stars, health, cash, clock, speed, objective,
// toasts, canvas minimap and the menu screens. One job: everything 2D.

import { WORLD, formatMoney } from './config.js';

export class Hud {
  constructor() {
    this.el = (id) => document.getElementById(id);
    this.starsEl = this.el('stars');
    this.healthFill = this.el('health-fill');
    this.healthText = this.el('health-text');
    this.cashEl = this.el('cash');
    this.clockEl = this.el('clock');
    this.speedEl = this.el('speed');
    this.objectiveEl = this.el('objective');
    this.toastEl = this.el('toast');
    this.ammoEl = this.el('ammo');
    this.crosshair = this.el('crosshair');
    this.minimap = this.el('minimap');
    this.mm = this.minimap.getContext('2d');
    this.toastTimer = null;
    this.hudEl = this.el('hud');
  }

  setWanted(n) {
    let s = '';
    for (let i = 0; i < 5; i++) s += i < n ? '★' : '☆';
    this.starsEl.textContent = s;
    this.starsEl.classList.toggle('hot', n >= 3);
  }

  setHealth(h) {
    const pct = Math.max(0, Math.min(100, h));
    this.healthFill.style.width = pct + '%';
    this.healthText.textContent = Math.ceil(pct);
    this.healthFill.classList.toggle('low', pct < 30);
  }

  setCash(c) { this.cashEl.textContent = formatMoney(c); }
  setClock(text) { this.clockEl.textContent = text; }
  setAmmo(ammo, reloading) {
    this.ammoEl.textContent = reloading ? 'RELOADING…' : ('🔫 ' + ammo + ' / 12');
  }
  setSpeed(kmh, inCar) {
    this.speedEl.style.display = inCar ? 'block' : 'none';
    if (inCar) this.speedEl.innerHTML = Math.round(kmh) + '<span> km/h</span>';
  }
  setObjective(text) { this.objectiveEl.textContent = text; }
  setCrosshair(on) { this.crosshair.style.display = on ? 'block' : 'none'; }

  toast(msg, ms) {
    this.toastEl.textContent = msg;
    this.toastEl.classList.add('show');
    if (this.toastTimer) clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => this.toastEl.classList.remove('show'), ms || 4200);
  }

  showScreen(name) {
    for (const id of ['screen-title', 'screen-pause', 'screen-busted', 'screen-win']) {
      this.el(id).classList.toggle('show', id === 'screen-' + name);
    }
    this.hudEl.classList.toggle('hidden', name === 'title');
  }

  flashDamage() {
    const d = this.el('damage');
    d.classList.remove('flash');
    void d.offsetWidth;
    d.classList.add('flash');
  }

  // Draw the live minimap: city blocks, water, player arrow, cars, police,
  // rivals and the gold mission marker.
  drawMinimap(view) {
    const ctx = this.mm;
    const S = this.minimap.width;
    const span = WORLD.half * 2 + 130;
    const toX = (x) => ((x + span / 2) / span) * S;
    const toY = (z) => ((z + span / 2) / span) * S;
    ctx.clearRect(0, 0, S, S);
    ctx.fillStyle = '#274b2e';
    ctx.fillRect(0, 0, S, S);
    // Sea (south edge) and sand.
    ctx.fillStyle = '#1e6f8e';
    ctx.fillRect(0, toY(WORLD.waterStart), S, S - toY(WORLD.waterStart));
    ctx.fillStyle = '#e8d5a4';
    ctx.fillRect(0, toY(WORLD.beachStart), S, toY(WORLD.sandEnd) - toY(WORLD.beachStart));
    // Roads.
    ctx.fillStyle = '#3a3d44';
    for (let i = 0; i <= WORLD.blocks; i++) {
      const c = WORLD.roadCenter(i);
      ctx.fillRect(toX(c) - 3, 0, 6, toY(WORLD.half));
      ctx.fillRect(0, toY(c) - 3, S, 6);
    }
    // Blocks.
    ctx.fillStyle = '#6a6f75';
    for (let bx = 0; bx < WORLD.blocks; bx++) {
      for (let bz = 0; bz < WORLD.blocks; bz++) {
        const cx = WORLD.blockCenter(bx), cz = WORLD.blockCenter(bz);
        ctx.fillRect(toX(cx - 17), toY(cz - 17), 34 * (S / span), 34 * (S / span));
      }
    }
    const dot = (x, z, color, r) => {
      ctx.fillStyle = color;
      ctx.beginPath(); ctx.arc(toX(x), toY(z), r, 0, Math.PI * 2); ctx.fill();
    };
    for (const c of view.cars || []) dot(c.x, c.z, c.police ? '#ff4040' : '#ffd75e', c.police ? 4 : 3);
    for (const p of view.peds || []) dot(p.x, p.z, '#c8c8c8', 1.6);
    for (const r of view.rivals || []) dot(r.x, r.z, '#ff2020', 3.5);
    if (view.marker) {
      const pulse = 5 + Math.sin(view.time * 4) * 2;
      dot(view.marker.x, view.marker.z, '#ffd700', pulse);
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(toX(view.marker.x), toY(view.marker.z), pulse + 3, 0, Math.PI * 2); ctx.stroke();
    }
    // Player arrow.
    const px = toX(view.player.x), py = toY(view.player.z);
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(view.player.yaw);
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#111111';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(0, -8); ctx.lineTo(5.5, 6); ctx.lineTo(0, 3); ctx.lineTo(-5.5, 6);
    ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.restore();
  }
}
