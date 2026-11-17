// Solmar Bay audio: every sound is synthesised with WebAudio — no audio files.
// One job: engine hum, sirens, gunshots, chimes and the ambient music loop.

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

  /** Must be called from a user gesture (click / key) — browsers block audio before that. */
  init() {
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

    // Engine hum: two detuned saws through a lowpass, pitch follows speed.
    this.engineOsc = this.ctx.createOscillator();
    this.engineOsc.type = 'sawtooth';
    this.engineOsc.frequency.value = 55;
    const engineFilter = this.ctx.createBiquadFilter();
    engineFilter.type = 'lowpass';
    engineFilter.frequency.value = 420;
    this.engineGain = this.ctx.createGain();
    this.engineGain.gain.value = 0;
    this.engineOsc.connect(engineFilter);
    engineFilter.connect(this.engineGain);
    this.engineGain.connect(this.master);
    this.engineOsc.start();

    // Siren: a triangle that wails between two tones.
    this.sirenOsc = this.ctx.createOscillator();
    this.sirenOsc.type = 'triangle';
    this.sirenOsc.frequency.value = 750;
    this.sirenGain = this.ctx.createGain();
    this.sirenGain.gain.value = 0;
    this.sirenOsc.connect(this.sirenGain);
    this.sirenGain.connect(this.master);
    this.sirenOsc.start();
    this.sirenLfo = this.ctx.createOscillator();
    this.sirenLfo.frequency.value = 0.55;
    const lfoGain = this.ctx.createGain();
    lfoGain.gain.value = 220;
    this.sirenLfo.connect(lfoGain);
    lfoGain.connect(this.sirenOsc.frequency);
    this.sirenLfo.start();

    this.startMusicLoop();
  }

  /** Engine pitch/volume from the car's speed (0..1). Silent on foot. */
  setEngine(speedNorm, driving) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.engineGain.gain.setTargetAtTime(driving ? 0.05 + speedNorm * 0.09 : 0, t, 0.1);
    this.engineOsc.frequency.setTargetAtTime(52 + speedNorm * 130, t, 0.1);
  }

  /** Siren on while the wanted level is above zero. */
  setSiren(on) {
    if (!this.ctx) return;
    this.sirenGain.gain.setTargetAtTime(on ? 0.045 : 0, this.ctx.currentTime, 0.3);
  }

  /** Short noise burst: a gunshot. `distant` lowers it for rival fire. */
  playShot(volume = 1, distant = false) {
    if (!this.ctx) return;
    const dur = 0.14;
    const buf = this.ctx.createBuffer(1, this.ctx.sampleRate * dur, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / data.length, 2.2);
    }
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const g = this.ctx.createGain();
    g.gain.value = (distant ? 0.25 : 0.6) * volume;
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = distant ? 1200 : 3200;
    src.connect(f);
    f.connect(g);
    g.connect(this.master);
    src.start();
  }

  /** Dull thud for a punch. */
  playPunch() {
    if (!this.ctx) return;
    const o = this.ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(140, this.ctx.currentTime);
    o.frequency.exponentialRampToValueAtTime(55, this.ctx.currentTime + 0.12);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.5, this.ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.14);
    o.connect(g);
    g.connect(this.master);
    o.start();
    o.stop(this.ctx.currentTime + 0.15);
  }

  /** Two-note pickup chime for objectives and payouts. */
  playChime() {
    if (!this.ctx) return;
    [660, 990].forEach((freq, i) => {
      const o = this.ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = freq;
      const g = this.ctx.createGain();
      const t = this.ctx.currentTime + i * 0.09;
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.35, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.01, t + 0.4);
      o.connect(g);
      g.connect(this.master);
      o.start(t);
      o.stop(t + 0.45);
    });
  }

  /** Car door / steal click. */
  playClick() {
    if (!this.ctx) return;
    const o = this.ctx.createOscillator();
    o.type = 'square';
    o.frequency.value = 220;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.18, this.ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.08);
    o.connect(g);
    g.connect(this.master);
    o.start();
    o.stop(this.ctx.currentTime + 0.09);
  }

  /** Laid-back synthwave loop: warm pad chords over a soft bass pulse. */
  startMusicLoop() {
    if (!this.ctx || this.musicTimer) return;
    const chords = [
      [130.81, 164.81, 196.0],
      [110.0, 164.81, 196.0],
      [98.0, 146.83, 196.0],
      [123.47, 164.81, 207.65],
    ];
    const bassNotes = [65.41, 55.0, 49.0, 61.74];
    this.musicTimer = setInterval(() => {
      if (!this.ctx || this.ctx.state !== 'running') return;
      const step = this.musicStep++;
      const chord = chords[step % chords.length];
      const t = this.ctx.currentTime;
      for (const freq of chord) {
        const o = this.ctx.createOscillator();
        o.type = 'triangle';
        o.frequency.value = freq;
        const g = this.ctx.createGain();
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(0.045, t + 0.4);
        g.gain.setValueAtTime(0.045, t + 1.5);
        g.gain.linearRampToValueAtTime(0, t + 2.1);
        o.connect(g);
        g.connect(this.master);
        o.start(t);
        o.stop(t + 2.2);
      }
      const b = this.ctx.createOscillator();
      b.type = 'sine';
      b.frequency.value = bassNotes[step % bassNotes.length];
      const bg = this.ctx.createGain();
      bg.gain.setValueAtTime(0.09, t);
      bg.gain.exponentialRampToValueAtTime(0.01, t + 1.9);
      b.connect(bg);
      bg.connect(this.master);
      b.start(t);
      b.stop(t + 2);
    }, 2000);
  }
}
