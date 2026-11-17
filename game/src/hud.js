// Solmar Bay — HUD: health bar, cash, wanted stars, clock, speed, mission
// tracker, dialogue banner, toasts, and the live canvas minimap (player,
// cars, police, mission marker, beach and road grid).
import { CITY, fmtCash, fmtTime } from './config.js';

export class Hud {
  constructor() {
    this.el = {
      health: document.getElementById('health-fill'),
      healthText: document.getElementById('health-text'),
      cash: document.getElementById('cash'),
      stars: document.getElementById('stars'),
      clock: document.getElementById('clock'),
      speed: document.getElementById('speed'),
      speedLabel: document.getElementById('speed-label'),
      objective: document.getElementById('objective'),
      missionName: document.getElementById('mission-name'),
      dialogue: document.getElementById('dialogue'),
      toast: document.getElementById('toast'),
      crosshair: document.getElementById('crosshair'),
      minimap: document.getElementById('minimap'),
      banner: document.getElementById('banner'),
      bannerTitle: document.getElementById('banner-title'),
      bannerSub: document.getElementById('banner-sub'),
      wantedLabel: document.getElementById('wanted-label'),
    };
    this.mapCtx = this.el.minimap.getContext('2d');
    this.dialogueTimer = 0;
    this.toastTimer = 0;
    this.bannerTimer = 0;
    this.dialogueQueue = [];
  }

  setHealth(hp) {
    const pct = Math.max(0, Math.min(100, hp));
    this.el.health.style.width = pct + '%';
    this.el.health.style.background = pct > 50 ? '#37d67a' : pct > 25 ? '#f5a623' : '#e84a5f';
    this.el.healthText.textContent = Math.round(pct) + ' HP';
  }

  setCash(cash) { this.el.cash.textContent = fmtCash(cash); }

  setWanted(w) {
    let s = '';
    for (let i = 0; i < 5; i++) s += i < w ? '★' : '☆';
    this.el.stars.textContent = s;
    this.el.stars.className = w >= 3 ? 'stars hot' : 'stars';
    this.el.wantedLabel.textContent = w === 0 ? 'CLEAN' : w <= 2 ? 'WANTED' : 'MANHUNT';
  }

  setClock(text) { this.el.clock.textContent = text; }

  setSpeed(kmh, inCar) {
    this.el.speed.textContent = inCar ? String(Math.round(Math.abs(kmh))) : '—';
    this.el.speedLabel.textContent = inCar ? 'KM/H' : 'ON FOOT';
  }

  setObjective(missionName, objective, timerText) {
    this.el.missionName.textContent = missionName;
    this.el.objective.textContent = objective + (timerText ? '  •  ' + timerText : '');
  }

  showDialogue(lines) {
    this.dialogueQueue = lines.slice();
    this.nextDialogue();
  }

  nextDialogue() {
    if (this.dialogueQueue.length === 0) {
      this.el.dialogue.classList.add('hidden');
      return;
    }
    this.el.dialogue.textContent = this.dialogueQueue.shift();
    this.el.dialogue.classList.remove('hidden');
    this.dialogueTimer = 4.5;
  }

  toast(msg, ms = 3500) {
    this.el.toast.textContent = msg;
    this.el.toast.classList.remove('hidden');
    this.toastTimer = ms / 1000;
  }

  banner(title, sub, ms = 3200) {
    this.el.bannerTitle.textContent = title;
    this.el.bannerSub.textContent = sub || '';
    this.el.banner.classList.remove('hidden');
    this.bannerTimer = ms / 1000;
  }

  showCrosshair(show) { this.el.crosshair.classList.toggle('hidden', !show); }

  update(dt) {
    if (this.dialogueTimer > 0) {
      this.dialogueTimer -= dt;
      if (this.dialogueTimer <= 0) this.nextDialogue();
    }
    if (this.toastTimer > 0) {
      this.toastTimer -= dt;
      if (this.toastTimer <= 0) this.el.toast.classList.add('hidden');
    }
    if (this.bannerTimer > 0) {
      this.bannerTimer -= dt;
      if (this.bannerTimer <= 0) this.el.banner.classList.add('hidden');
    }
  }

  /** Draw the minimap: roads, beach, plaza, cars, police, peds, marker, player. */
  drawMinimap(state) {
    const ctx = this.mapCtx;
    const S = 200, half = CITY.half + 30;
    const toMap = (x, z) => [((x + half) / (half * 2)) * S, ((z + half) / (half * 2)) * S];
    ctx.clearRect(0, 0, S, S);
    ctx.fillStyle = '#1d2b1f';
    ctx.fillRect(0, 0, S, S);
    // Beach + ocean strip.
    const [, beachY] = toMap(0, CITY.beachZ);
    ctx.fillStyle = '#e8d49a';
    ctx.fillRect(0, beachY, S, 8);
    ctx.fillStyle = '#1e7fa8';
    ctx.fillRect(0, beachY + 8, S, S - beachY - 8);
    // Roads.
    ctx.strokeStyle = '#4a4f57';
    ctx.lineWidth = 5;
    for (const l of CITY.roadLines) {
      const [ax] = toMap(l, 0);
      ctx.beginPath(); ctx.moveTo(ax, 0); ctx.lineTo(ax, S); ctx.stroke();
      const [, az] = toMap(0, l);
      ctx.beginPath(); ctx.moveTo(0, az); ctx.lineTo(S, az); ctx.stroke();
    }
    // Plaza.
    const [px, pz] = toMap(0, 0);
    ctx.fillStyle = '#7fb2d9';
    ctx.beginPath(); ctx.arc(px, pz, 5, 0, Math.PI * 2); ctx.fill();
    // Mission marker.
    if (state.marker) {
      const [mx, mz] = toMap(state.marker.x, state.marker.z);
      const pulse = 6 + Math.sin(performance.now() / 200) * 2;
      ctx.fillStyle = '#ffd23e';
      ctx.beginPath(); ctx.arc(mx, mz, pulse, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#222';
      ctx.font = 'bold 10px sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('!', mx, mz);
    }
    // Traffic cars (white), police (blue/red flash), peds (grey).
    ctx.fillStyle = '#ffffff';
    for (const p of state.cars) {
      const [x, y] = toMap(p.x, p.z);
      ctx.fillRect(x - 1.5, y - 1.5, 3, 3);
    }
    const flash = Math.sin(performance.now() / 150) > 0;
    ctx.fillStyle = flash ? '#3a7bff' : '#ff3b30';
    for (const p of state.police) {
      const [x, y] = toMap(p.x, p.z);
      ctx.beginPath(); ctx.arc(x, y, 3.5, 0, Math.PI * 2); ctx.fill();
    }
    ctx.fillStyle = '#9aa0a6';
    for (const p of state.peds) {
      const [x, y] = toMap(p.x, p.z);
      ctx.fillRect(x - 1, y - 1, 2, 2);
    }
    // Player arrow.
    const [ux, uy] = toMap(state.player.x, state.player.z);
    ctx.save();
    ctx.translate(ux, uy);
    ctx.rotate(state.heading);
    ctx.fillStyle = '#37d67a';
    ctx.beginPath();
    ctx.moveTo(0, -7); ctx.lineTo(5, 6); ctx.lineTo(-5, 6);
    ctx.closePath(); ctx.fill();
    ctx.restore();
    // North + border.
    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    ctx.lineWidth = 2;
    ctx.strokeRect(1, 1, S - 2, S - 2);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 11px sans-serif';
    ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    ctx.fillText('N', 6, 5);
  }
}
