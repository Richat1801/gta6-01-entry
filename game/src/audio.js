// Solmar Bay — all sound is synthesized with WebAudio. No audio files.
export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.engineOsc = null;
    this.engineGain = null;
    this.sirenOsc = null;
    this.sirenGain = null;
    this.sirenTimer = 0;
    this.sirenHigh = false;
  }

  /** Must be called from a user gesture at least once. */
  ensure() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    // Engine hum: two detuned sawtooths through a lowpass, gain by speed.
    this.engineOsc = this.ctx.createOscillator();
    this.engineOsc.type = 'sawtooth';
    this.engineOsc.frequency.value = 55;
    const osc2 = this.ctx.createOscillator();
    osc2.type = 'square'; osc2.frequency.value = 28;
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 320;
    this.engineGain = this.ctx.createGain(); this.engineGain.gain.value = 0;
    this.engineOsc.connect(lp); osc2.connect(lp);
    lp.connect(this.engineGain); this.engineGain.connect(this.ctx.destination);
    this.engineOsc.start(); osc2.start();
    this.engineOsc2 = osc2;
    // Police siren: alternating two-tone triangle, quiet, distance-scaled.
    this.sirenOsc = this.ctx.createOscillator();
    this.sirenOsc.type = 'triangle';
    this.sirenOsc.frequency.value = 720;
    this.sirenGain = this.ctx.createGain(); this.sirenGain.gain.value = 0;
    this.sirenOsc.connect(this.sirenGain); this.sirenGain.connect(this.ctx.destination);
    this.sirenOsc.start();
  }

  setMuted(m) {
    this.muted = m;
    if (this.ctx) this.ctx.destination.gain.value = m ? 0 : 1;
  }

  /** speed 0..1 while driving; 0 silences the engine. */
  setEngine(speed01, on) {
    if (!this.ctx || !this.engineGain) return;
    const t = this.ctx.currentTime;
    this.engineGain.gain.setTargetAtTime(on ? 0.02 + speed01 * 0.05 : 0, t, 0.1);
    this.engineOsc.frequency.setTargetAtTime(55 + speed01 * 165, t, 0.08);
    this.engineOsc2.frequency.setTargetAtTime(28 + speed01 * 80, t, 0.08);
  }

  /** Siren wail; call every frame with nearest police distance (or null). */
  updateSiren(dt, nearestDist) {
    if (!this.ctx || !this.sirenGain) return;
    this.sirenTimer += dt;
    if (this.sirenTimer > 0.42) {
      this.sirenTimer = 0;
      this.sirenHigh = !this.sirenHigh;
      this.sirenOsc.frequency.setTargetAtTime(this.sirenHigh ? 880 : 660, this.ctx.currentTime, 0.05);
    }
    const vol = nearestDist === null ? 0 : Math.max(0, 0.05 * (1 - nearestDist / 120));
    this.sirenGain.gain.setTargetAtTime(vol, this.ctx.currentTime, 0.2);
  }

  blip(freq, dur, type, vol) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = type || 'sine'; o.frequency.value = freq;
    g.gain.setValueAtTime(vol || 0.12, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(this.ctx.destination);
    o.start(t); o.stop(t + dur + 0.02);
  }

  noiseBurst(dur, vol, lowpassFreq) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    const len = Math.max(1, Math.floor(this.ctx.sampleRate * dur));
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.ctx.createBufferSource(); src.buffer = buf;
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass'; f.frequency.value = lowpassFreq || 3000;
    const g = this.ctx.createGain(); g.gain.value = vol || 0.25;
    src.connect(f); f.connect(g); g.connect(this.ctx.destination);
    src.start(t);
  }

  gunshot() { this.noiseBurst(0.14, 0.5, 2400); this.blip(160, 0.08, 'square', 0.18); }
  punch() { this.noiseBurst(0.08, 0.3, 900); }
  skid() { this.noiseBurst(0.25, 0.12, 1400); }
  pickup() { this.blip(660, 0.09, 'sine', 0.15); this.blip(990, 0.12, 'sine', 0.12); }
  denied() { this.blip(140, 0.18, 'square', 0.15); }
  missionStart() { [523, 659, 784].forEach((f, i) => setTimeout(() => this.blip(f, 0.16, 'triangle', 0.16), i * 110)); }
  missionDone() { [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => this.blip(f, 0.2, 'triangle', 0.18), i * 120)); }
  busted() { [392, 311, 233].forEach((f, i) => setTimeout(() => this.blip(f, 0.3, 'sawtooth', 0.14), i * 180)); }
}
