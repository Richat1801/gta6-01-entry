// HUD: cash, health, wanted stars, clock, objective text, message feed,
// screens (start / pause / busted) and the live canvas minimap.

import { CONFIG, PLACES } from './config.js';

export class Hud {
  constructor() {
    this.cashEl = document.getElementById('cash');
    this.healthFill = document.getElementById('health-fill');
    this.healthText = document.getElementById('health-text');
    this.starsEl = document.getElementById('stars');
    this.clockEl = document.getElementById('clock');
    this.objectiveEl = document.getElementById('objective');
    this.messageEl = document.getElementById('messages');
    this.crosshairEl = document.getElementById('crosshair');
    this.hitmarkerEl = document.getElementById('hitmarker');
    this.damageEl = document.getElementById('damage-flash');
    this.minimap = document.getElementById('minimap');
    this.mmCtx = this.minimap.getContext('2d');
    this.startScreen = document.getElementById('start-screen');
    this.pauseScreen = document.getElementById('pause-screen');
    this.bustedScreen = document.getElementById('busted-screen');
    this.speedEl = document.getElementById('speed');
    this.messageTimer = null;
    this.lastCash = -1;
  }

  setCash(cash) {
    if (cash !== this.lastCash) {
      this.cashEl.textContent = `$${cash.toLocaleString('en-US')}`;
      this.lastCash = cash;
    }
  }

  setHealth(health) {
    const pct = Math.max(0, Math.round(health));
    this.healthFill.style.width = `${pct}%`;
    this.healthFill.style.background = pct > 50 ? '#2ea86a' : pct > 25 ? '#f2a230' : '#d23c2e';
    this.healthText.textContent = `${pct}`;
  }

  setWanted(stars) {
    let out = '';
    for (let i = 0; i < CONFIG.maxWanted; i++) {
      out += i < stars ? '★' : '☆';
    }
    this.starsEl.textContent = out;
    this.starsEl.classList.toggle('hot', stars >= 3);
  }

  setClock(minutes) {
    const h = Math.floor(minutes / 60) % 24;
    const m = Math.floor(minutes % 60);
    this.clockEl.textContent = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }

  setObjective(text) {
    if (this.objectiveEl.textContent !== text) this.objectiveEl.textContent = text;
  }

  setSpeed(kmh, inCar) {
    this.speedEl.style.display = inCar ? 'block' : 'none';
    if (inCar) this.speedEl.textContent = `${Math.round(kmh)} km/h`;
  }

  setCrosshair(visible, pistol) {
    this.crosshairEl.style.display = visible ? 'block' : 'none';
    this.crosshairEl.textContent = pistol ? '＋' : '·';
  }

  showHitmarker() {
    this.hitmarkerEl.style.opacity = '1';
    setTimeout(() => { this.hitmarkerEl.style.opacity = '0'; }, 140);
  }

  flashDamage() {
    this.damageEl.style.opacity = '0.45';
    setTimeout(() => { this.damageEl.style.opacity = '0'; }, 160);
  }

  showMessage(text, ms = 4200) {
    const div = document.createElement('div');
    div.className = 'message';
    div.textContent = text;
    this.messageEl.appendChild(div);
    while (this.messageEl.children.length > 4) {
      this.messageEl.removeChild(this.messageEl.firstChild);
    }
    setTimeout(() => { if (div.parentNode) div.parentNode.removeChild(div); }, ms);
  }

  showScreen(name) {
    this.startScreen.classList.toggle('hidden', name !== 'start');
    this.pauseScreen.classList.toggle('hidden', name !== 'pause');
    this.bustedScreen.classList.toggle('hidden', name !== 'busted');
    const inGame = name === null;
    document.getElementById('hud').classList.toggle('hidden', !inGame);
    this.crosshairEl.style.display = inGame ? 'block' : 'none';
  }

  setBustedStats(cash, missionsDone) {
    document.getElementById('busted-stats').textContent =
      `Cash kept: $${cash.toLocaleString('en-US')} · Missions done: ${missionsDone}/5`;
  }

  // Live minimap: roads, beach, sea, player arrow, cars, police, marker.
  drawMinimap(view) {
    const ctx = this.mmCtx;
    const size = this.minimap.width;
    const range = 260; // world units shown across the map
    const toMap = (x, z) => [
      size / 2 + (x - view.playerX) * (size / range),
      size / 2 + (z - view.playerZ) * (size / range),
    ];
    ctx.clearRect(0, 0, size, size);
    // Sea and beach on the east edge
    ctx.fillStyle = '#1e7fa8';
    ctx.fillRect(size, 0, 0, 0);
    const [seaX] = toMap(CONFIG.beachStart, 0);
    if (seaX < size) {
      ctx.fillStyle = '#1e7fa8';
      ctx.fillRect(Math.max(0, seaX), 0, size, size);
      ctx.fillStyle = '#e8d3a2';
      const [bX] = toMap(CONFIG.beachStart - 54, 0);
      ctx.fillRect(Math.max(0, bX), 0, Math.max(0, seaX - bX), size);
    }
    // City ground
    ctx.fillStyle = '#3a3f46';
    ctx.fillRect(0, 0, size, size);
    // Blocks
    ctx.fillStyle = '#8a8f98';
    const half = CONFIG.cityHalf;
    for (let bx = 0; bx < CONFIG.blocks; bx++) {
      for (let bz = 0; bz < CONFIG.blocks; bz++) {
        const cx = -half + CONFIG.pitch / 2 + bx * CONFIG.pitch;
        const cz = -half + CONFIG.pitch / 2 + bz * CONFIG.pitch;
        const [mx, mz] = toMap(cx, cz);
        const s = (CONFIG.blockSize * size) / range;
        ctx.fillRect(mx - s / 2, mz - s / 2, s, s);
      }
    }
    // Mission marker: pink diamond
    if (view.marker) {
      const [mx, mz] = toMap(view.marker.x, view.marker.z);
      ctx.fillStyle = '#ff2e88';
      ctx.beginPath();
      ctx.moveTo(mx, mz - 8);
      ctx.lineTo(mx + 7, mz);
      ctx.lineTo(mx, mz + 8);
      ctx.lineTo(mx - 7, mz);
      ctx.closePath();
      ctx.fill();
    }
    // Traffic + parked cars: yellow dots
    ctx.fillStyle = '#f2c230';
    for (const car of view.cars) {
      const [mx, mz] = toMap(car.x, car.z);
      ctx.fillRect(mx - 2, mz - 2, 4, 4);
    }
    // Police: flashing blue/red dots
    const policeColor = Math.floor(performance.now() / 300) % 2 === 0 ? '#2040ff' : '#ff2020';
    ctx.fillStyle = policeColor;
    for (const p of view.police) {
      const [mx, mz] = toMap(p.x, p.z);
      ctx.beginPath();
      ctx.arc(mx, mz, 3.5, 0, Math.PI * 2);
      ctx.fill();
    }
    // Rivals: red dots
    ctx.fillStyle = '#ff4040';
    for (const r of view.rivals) {
      const [mx, mz] = toMap(r.x, r.z);
      ctx.beginPath();
      ctx.arc(mx, mz, 3, 0, Math.PI * 2);
      ctx.fill();
    }
    // Player: white arrow pointing along the heading
    const cx = size / 2;
    const cy = size / 2;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(view.heading);
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#222222';
    ctx.beginPath();
    ctx.moveTo(0, -9);
    ctx.lineTo(6, 7);
    ctx.lineTo(0, 3);
    ctx.lineTo(-6, 7);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
    // North tick
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 11px sans-serif';
    ctx.fillText('N', size - 14, 14);
  }
}
