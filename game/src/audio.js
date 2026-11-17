// Audio: every sound is synthesized with WebAudio — no audio files.
// Engine hum, two-tone sirens, gunshots, pickup chimes and a low ambient
// music loop built from detuned pads and a soft bass line.

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.musicGain = null;
    this.engineOsc = null;
    this.engineOsc2 = null;
    this.engineGain = null;
    this.sirenOsc = null;
    this.sirenGain = null;
    this.sirenTimer = 0;
    this.musicTimer = null;
    this.musicStep = 0;
    this.started = false;
    this.muted = false;
  }

  // Must be called from a user gesture (click / keypress).
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
    this.startEngineHum();
    this.startMusicLoop();
    this.started = true;
  }

  setMuted(muted) {
    this.muted = muted;
    if (this.master) this.master.gain.value = muted ? 0 : 0.5;
  }

  startEngineHum() {
    this.engineOsc = this.ctx.createOscillator();
    this.engineOsc.type = 'sawtooth';
    this.engineOsc.frequency.value = 42;
    this.engineOsc2 = this.ctx.createOscillator();
    this.engineOsc2.type = 'square';
    this.engineOsc2.frequency.value = 84;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 320;
    this.engineGain = this.ctx.createGain();
    this.engineGain.gain.value = 0;
    this.engineOsc.connect(filter);
    this.engineOsc2.connect(filter);
    filter.connect(this.engineGain);
    this.engineGain.connect(this.master);
    this.engineOsc.start();
    this.engineOsc2.start();
  }

  // Engine pitch and loudness follow the car's speed (0..1).
  setEngine(speedNorm, inCar) {
    if (!this.ctx || !this.engineGain) return;
    const target = inCar ? 0.05 + speedNorm * 0.09 : 0;
    this.engineGain.gain.setTargetAtTime(target, this.ctx.currentTime, 0.12);
    const freq = 42 + speedNorm * 110;
    this.engineOsc.frequency.setTargetAtTime(freq, this.ctx.currentTime, 0.1);
    this.engineOsc2.frequency.setTargetAtTime(freq * 2, this.ctx.currentTime, 0.1);
  }

  // Two-tone police siren, on while any cruiser is active.
  setSiren(on) {
    if (!this.ctx) return;
    if (on && !this.sirenOsc) {
      this.sirenOsc = this.ctx.createOscillator();
      this.sirenOsc.type = 'triangle';
      this.sirenOsc.frequency.value = 720;
      this.sirenGain = this.ctx.createGain();
      this.sirenGain.gain.value = 0.035;
      this.sirenOsc.connect(this.sirenGain);
      this.sirenGain.connect(this.master);
      this.sirenOsc.start();
    } else if (!on && this.sirenOsc) {
      this.sirenOsc.stop();
      this.sirenOsc.disconnect();
      this.sirenOsc = null;
      this.sirenGain = null;
    }
  }

  updateSiren(dt) {
    if (!this.sirenOsc) return;
    this.sirenTimer += dt;
    const high = Math.floor(this.sirenTimer * 1.8) % 2 === 0;
    this.sirenOsc.frequency.setTargetAtTime(high ? 920 : 660, this.ctx.currentTime, 0.05);
  }

  // Short noise burst through a lowpass: a gunshot.
  gunshot(kind) {
    if (!this.ctx) return;
    const dur = kind === 'punch' ? 0.08 : 0.16;
    const buffer = this.ctx.createBuffer(1, this.ctx.sampleRate * dur, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / data.length, 2.2);
    }
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = kind === 'punch' ? 500 : 2400;
    const gain = this.ctx.createGain();
    gain.gain.value = kind === 'punch' ? 0.3 : 0.5;
    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.master);
    src.start();
  }

  // Bright three-note chime for pickups and mission payouts.
  chime(notes = [523.25, 659.25, 783.99]) {
    if (!this.ctx) return;
    notes.forEach((freq, i) => {
      const osc = this.ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = freq;
      const gain = this.ctx.createGain();
      const t0 = this.ctx.currentTime + i * 0.09;
      gain.gain.setValueAtTime(0, t0);
      gain.gain.linearRampToValueAtTime(0.22, t0 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, t0 + 0.5);
      osc.connect(gain);
      gain.connect(this.master);
      osc.start(t0);
      osc.stop(t0 + 0.55);
    });
  }

  // Low thud for a crash or a ram.
  thud() {
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(110, this.ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(38, this.ctx.currentTime + 0.18);
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.4, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.22);
    osc.connect(gain);
    gain.connect(this.master);
    osc.start();
    osc.stop(this.ctx.currentTime + 0.25);
  }

  // Ambient music: a slow four-chord pad loop (Am – F – C – G voicings),
  // each chord a pair of detuned triangle waves, very low in the mix.
  startMusicLoop() {
    this.musicGain = this.ctx.createGain();
    this.musicGain.gain.value = 0.05;
    this.musicGain.connect(this.master);
    const chords = [
      [220.0, 261.63, 329.63],
      [174.61, 220.0, 261.63],
      [196.0, 246.94, 293.66],
      [130.81, 164.81, 196.0],
    ];
    const playChord = () => {
      if (!this.ctx) return;
      const chord = chords[this.musicStep % chords.length];
      this.musicStep += 1;
      const now = this.ctx.currentTime;
      for (const freq of chord) {
        for (const detune of [-4, 4]) {
          const osc = this.ctx.createOscillator();
          osc.type = 'triangle';
          osc.frequency.value = freq;
          osc.detune.value = detune;
          const gain = this.ctx.createGain();
          gain.gain.setValueAtTime(0, now);
          gain.gain.linearRampToValueAtTime(0.5, now + 1.2);
          gain.gain.setValueAtTime(0.5, now + 2.6);
          gain.gain.linearRampToValueAtTime(0, now + 4);
          osc.connect(gain);
          gain.connect(this.musicGain);
          osc.start(now);
          osc.stop(now + 4.1);
        }
      }
      // Soft bass root on the beat.
      const bass = this.ctx.createOscillator();
      bass.type = 'sine';
      bass.frequency.value = chord[0] / 2;
      const bgain = this.ctx.createGain();
      bgain.gain.setValueAtTime(0.5, now);
      bgain.gain.exponentialRampToValueAtTime(0.001, now + 3.8);
      bass.connect(bgain);
      bgain.connect(this.musicGain);
      bass.start(now);
      bass.stop(now + 3.9);
    };
    playChord();
    this.musicTimer = setInterval(playChord, 4000);
  }
}
