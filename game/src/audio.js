// Solmar Bay — all sound is synthesized with WebAudio. No audio files.
// One job: engine hum, sirens, gunshots, punches and pickup jingles.

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.engineOsc = null;
    this.engineOsc2 = null;
    this.engineGain = null;
    this.sirenOsc = null;
    this.sirenGain = null;
    this.sirenTimer = null;
    this.sirenOn = false;
    this.muted = false;
  }

  ensure() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
      return;
    }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.5;
      this.master.connect(this.ctx.destination);
    } catch (e) { this.ctx = null; }
  }

  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.value = m ? 0 : 0.5;
  }

  // Continuous engine hum whose pitch follows driving speed (0..1).
  startEngine() {
    this.ensure();
    if (!this.ctx || this.engineOsc) return;
    this.engineOsc = this.ctx.createOscillator();
    this.engineOsc.type = 'sawtooth';
    this.engineOsc.frequency.value = 55;
    this.engineOsc2 = this.ctx.createOscillator();
    this.engineOsc2.type = 'square';
    this.engineOsc2.frequency.value = 28;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 420;
    this.engineGain = this.ctx.createGain();
    this.engineGain.gain.value = 0.0;
    this.engineOsc.connect(filter);
    this.engineOsc2.connect(filter);
    filter.connect(this.engineGain);
    this.engineGain.connect(this.master);
    this.engineOsc.start();
    this.engineOsc2.start();
  }

  setEngineSpeed(ratio, on) {
    if (!this.ctx || !this.engineOsc) return;
    const t = this.ctx.currentTime;
    this.engineGain.gain.setTargetAtTime(on ? 0.05 + ratio * 0.09 : 0.0, t, 0.1);
    this.engineOsc.frequency.setTargetAtTime(55 + ratio * 165, t, 0.08);
    this.engineOsc2.frequency.setTargetAtTime(28 + ratio * 82, t, 0.08);
  }

  stopEngine() {
    if (!this.ctx || !this.engineOsc) return;
    try { this.engineOsc.stop(); this.engineOsc2.stop(); } catch (e) {}
    this.engineOsc = null;
    this.engineOsc2 = null;
    this.engineGain = null;
  }

  // Two-tone police siren while any cruiser is chasing.
  setSiren(on) {
    if (on === this.sirenOn) return;
    this.sirenOn = on;
    this.ensure();
    if (!this.ctx) return;
    if (on) {
      this.sirenOsc = this.ctx.createOscillator();
      this.sirenOsc.type = 'triangle';
      this.sirenOsc.frequency.value = 720;
      this.sirenGain = this.ctx.createGain();
      this.sirenGain.gain.value = 0.045;
      this.sirenOsc.connect(this.sirenGain);
      this.sirenGain.connect(this.master);
      this.sirenOsc.start();
      let high = false;
      this.sirenTimer = setInterval(() => {
        if (!this.sirenOsc) return;
        high = !high;
        this.sirenOsc.frequency.setTargetAtTime(high ? 960 : 720, this.ctx.currentTime, 0.05);
      }, 420);
    } else {
      if (this.sirenTimer) clearInterval(this.sirenTimer);
      this.sirenTimer = null;
      if (this.sirenOsc) { try { this.sirenOsc.stop(); } catch (e) {} }
      this.sirenOsc = null;
      this.sirenGain = null;
    }
  }

  blip(freq, dur, type, vol, when) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + (when || 0);
    const o = this.ctx.createOscillator();
    o.type = type || 'sine';
    o.frequency.value = freq;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol || 0.15, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(this.master);
    o.start(t); o.stop(t + dur + 0.02);
  }

  noiseBurst(dur, vol, freq) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const len = Math.max(1, Math.floor(this.ctx.sampleRate * dur));
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass'; f.frequency.value = freq || 1800;
    const g = this.ctx.createGain();
    g.gain.value = vol || 0.3;
    src.connect(f); f.connect(g); g.connect(this.master);
    src.start(t);
  }

  shot() { this.noiseBurst(0.14, 0.35, 2600); this.blip(160, 0.08, 'square', 0.12); }
  enemyShot() { this.noiseBurst(0.1, 0.14, 1400); }
  punch() { this.noiseBurst(0.09, 0.3, 500); this.blip(90, 0.1, 'sine', 0.25); }
  pickup() { this.blip(660, 0.12, 'sine', 0.2); this.blip(880, 0.14, 'sine', 0.2, 0.1); this.blip(1320, 0.2, 'sine', 0.2, 0.2); }
  missionDone() {
    [523, 659, 784, 1047].forEach((f, i) => this.blip(f, 0.18, 'triangle', 0.2, i * 0.11));
  }
  busted() { this.blip(392, 0.3, 'sawtooth', 0.15); this.blip(311, 0.5, 'sawtooth', 0.15, 0.28); }
  click() { this.blip(1200, 0.05, 'square', 0.08); }
  carDoor() { this.noiseBurst(0.08, 0.2, 900); this.blip(220, 0.07, 'square', 0.1); }
}
