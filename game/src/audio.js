// Solmar Bay: synthesised WebAudio sound. One job: every sound is generated,
// no audio files. Engine hum, sirens, gunshots, chimes and an ambient loop.

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.engineOsc = null;
    this.engineGain = null;
    this.sirenOsc = null;
    this.sirenGain = null;
    this.musicTimer = null;
    this.musicStep = 0;
    this.enabled = true;
  }

  // Must be called from a user gesture at least once.
  ensure() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.5;
    this.master.connect(this.ctx.destination);
    // Engine: low sawtooth whose pitch follows speed.
    this.engineOsc = this.ctx.createOscillator();
    this.engineOsc.type = 'sawtooth';
    this.engineOsc.frequency.value = 55;
    this.engineGain = this.ctx.createGain();
    this.engineGain.gain.value = 0;
    const engineFilter = this.ctx.createBiquadFilter();
    engineFilter.type = 'lowpass';
    engineFilter.frequency.value = 420;
    this.engineOsc.connect(engineFilter);
    engineFilter.connect(this.engineGain);
    this.engineGain.connect(this.master);
    this.engineOsc.start();
    // Siren: two-tone triangle, toggled by an LFO-style timer in update().
    this.sirenOsc = this.ctx.createOscillator();
    this.sirenOsc.type = 'triangle';
    this.sirenOsc.frequency.value = 750;
    this.sirenGain = this.ctx.createGain();
    this.sirenGain.gain.value = 0;
    this.sirenOsc.connect(this.sirenGain);
    this.sirenGain.connect(this.master);
    this.sirenOsc.start();
    this._sirenOn = false;
    this._sirenPhase = 0;
    this.startMusic();
  }

  setEngine(speed01, driving) {
    if (!this.ctx) return;
    const target = driving ? 0.05 + speed01 * 0.09 : 0.0;
    this.engineGain.gain.setTargetAtTime(target, this.ctx.currentTime, 0.08);
    this.engineOsc.frequency.setTargetAtTime(55 + speed01 * 130, this.ctx.currentTime, 0.1);
  }

  setSiren(on) {
    if (!this.ctx) return;
    this._sirenOn = on;
    if (!on) this.sirenGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.1);
  }

  updateSiren(dt) {
    if (!this.ctx || !this._sirenOn) return;
    this._sirenPhase += dt;
    const hi = Math.floor(this._sirenPhase * 2.2) % 2 === 0;
    this.sirenOsc.frequency.setTargetAtTime(hi ? 880 : 620, this.ctx.currentTime, 0.05);
    this.sirenGain.gain.setTargetAtTime(0.035, this.ctx.currentTime, 0.1);
  }

  _blip(freq, dur, type, vol, slideTo) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(this.master);
    o.start(t); o.stop(t + dur + 0.02);
  }

  _noise(dur, vol, filterFreq) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const len = Math.max(1, Math.floor(this.ctx.sampleRate * dur));
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass'; f.frequency.value = filterFreq;
    const g = this.ctx.createGain();
    g.gain.value = vol;
    src.connect(f); f.connect(g); g.connect(this.master);
    src.start(t);
  }

  gunshot() { this._noise(0.16, 0.5, 2600); this._blip(160, 0.1, 'square', 0.25, 60); }
  enemyShot() { this._noise(0.12, 0.22, 1800); }
  punch() { this._noise(0.08, 0.3, 900); }
  chime() { this._blip(880, 0.18, 'sine', 0.25); setTimeout(() => this._blip(1318, 0.3, 'sine', 0.22), 110); }
  click() { this._blip(660, 0.06, 'sine', 0.15); }
  error() { this._blip(220, 0.2, 'square', 0.12, 140); }
  crash() { this._noise(0.3, 0.45, 700); this._blip(90, 0.25, 'sawtooth', 0.2, 45); }
  sirenWhoop() { this._blip(700, 0.4, 'triangle', 0.12, 1100); }
  missionStart() {
    this._blip(523, 0.14, 'sine', 0.22);
    setTimeout(() => this._blip(659, 0.14, 'sine', 0.22), 130);
    setTimeout(() => this._blip(784, 0.28, 'sine', 0.24), 260);
  }

  // Lazy coastal groove: soft pad chords, one note per step, no files.
  startMusic() {
    if (!this.ctx || this.musicTimer) return;
    const chords = [
      [261.6, 329.6, 392.0], [196.0, 246.9, 293.7],
      [220.0, 277.2, 329.6], [174.6, 220.0, 261.6],
    ];
    this.musicTimer = setInterval(() => {
      if (!this.ctx || !this.enabled) return;
      const chord = chords[this.musicStep % chords.length];
      const note = chord[this.musicStep % chord.length];
      this._blip(note * 2, 0.9, 'sine', 0.045);
      if (this.musicStep % 2 === 0) this._blip(chord[0], 1.4, 'triangle', 0.03);
      this.musicStep++;
    }, 420);
  }
}
