// Generative soundscape built entirely with the Web Audio API: no sample files.
// Drone + air bed + slow pad notes, plus UI sounds (hover, click, whoosh, louver clicks).

const SCALE = [220.0, 246.94, 261.63, 329.63, 392.0, 440.0, 493.88, 523.25];

export class Sound {
  constructor() {
    this.ctx = null;
    this.enabled = false;
    this.data = null;
  }

  init() {
    if (this.ctx) {
      if (this.enabled) this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = (this.ctx = new AC());

    this.master = ctx.createGain();
    this.master.gain.value = 0;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -20;
    comp.ratio.value = 3;
    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = 256;
    this.data = new Uint8Array(this.analyser.fftSize);
    this.master.connect(comp);
    comp.connect(this.analyser);
    this.analyser.connect(ctx.destination);

    this.verb = ctx.createConvolver();
    this.verb.buffer = this.impulse(4.2, 2.8);
    this.verbIn = ctx.createGain();
    this.verbIn.connect(this.verb);
    const vOut = ctx.createGain();
    vOut.gain.value = 0.6;
    this.verb.connect(vOut);
    vOut.connect(this.master);

    this.noise = this.noiseBuffer(2);
    this.ambient();

    document.addEventListener('visibilitychange', () => {
      if (!this.ctx) return;
      if (document.hidden) this.ctx.suspend();
      else if (this.enabled) this.ctx.resume();
    });
  }

  impulse(sec, decay) {
    const rate = this.ctx.sampleRate;
    const len = Math.floor(rate * sec);
    const buf = this.ctx.createBuffer(2, len, rate);
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
    return buf;
  }

  noiseBuffer(sec) {
    const rate = this.ctx.sampleRate;
    const buf = this.ctx.createBuffer(1, Math.floor(rate * sec), rate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  lfo(freq, depth, target) {
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.frequency.value = freq;
    g.gain.value = depth;
    o.connect(g);
    g.connect(target);
    o.start();
  }

  ambient() {
    const ctx = this.ctx;
    // drone
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 340;
    lp.Q.value = 0.9;
    this.lfo(0.05, 150, lp.frequency);
    const drone = ctx.createGain();
    drone.gain.value = 0.07;
    lp.connect(drone);
    drone.connect(this.master);
    drone.connect(this.verbIn);
    [
      [55, -6, 'sawtooth'],
      [55.2, 7, 'sawtooth'],
      [82.41, 0, 'triangle'],
      [110, 4, 'sawtooth'],
    ].forEach(([f, det, type]) => {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.value = f;
      o.detune.value = det;
      const g = ctx.createGain();
      g.gain.value = 0.25;
      o.connect(g);
      g.connect(lp);
      o.start();
    });
    const sub = ctx.createOscillator();
    sub.frequency.value = 55;
    const subG = ctx.createGain();
    subG.gain.value = 0.05;
    sub.connect(subG);
    subG.connect(this.master);
    sub.start();

    // air
    const n = ctx.createBufferSource();
    n.buffer = this.noise;
    n.loop = true;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 700;
    bp.Q.value = 0.5;
    this.lfo(0.04, 420, bp.frequency);
    const air = ctx.createGain();
    air.gain.value = 0.02;
    n.connect(bp);
    bp.connect(air);
    air.connect(this.master);
    air.connect(this.verbIn);
    n.start();

    this.schedulePad();
  }

  schedulePad() {
    const next = 2600 + Math.random() * 4200;
    setTimeout(() => {
      if (this.ctx && this.ctx.state === 'running' && this.enabled) this.pad();
      this.schedulePad();
    }, next);
  }

  pad() {
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const f = SCALE[Math.floor(Math.random() * SCALE.length)] * (Math.random() < 0.5 ? 0.5 : 1);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.03, t + 2.4);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 8);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 1400;
    const pan = ctx.createStereoPanner();
    pan.pan.value = Math.random() * 1.4 - 0.7;
    ['sine', 'triangle'].forEach((type, i) => {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.value = f;
      o.detune.value = i ? 6 : -6;
      o.connect(lp);
      o.start(t);
      o.stop(t + 8.2);
    });
    lp.connect(g);
    g.connect(pan);
    pan.connect(this.verbIn);
    const dry = ctx.createGain();
    dry.gain.value = 0.35;
    pan.connect(dry);
    dry.connect(this.master);
  }

  setEnabled(on) {
    this.enabled = on;
    if (!this.ctx) return;
    if (on) this.ctx.resume();
    const g = this.master.gain;
    g.cancelScheduledValues(this.ctx.currentTime);
    g.setTargetAtTime(on ? 0.9 : 0, this.ctx.currentTime, on ? 0.5 : 0.15);
  }

  ready() {
    return this.ctx && this.enabled && this.ctx.state === 'running';
  }

  hover(i = 0) {
    if (!this.ready()) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const f = SCALE[Math.abs(i) % SCALE.length] * 2;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.045, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.4);
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.value = f;
    const o2 = ctx.createOscillator();
    o2.type = 'triangle';
    o2.frequency.value = f * 3;
    const g2 = ctx.createGain();
    g2.gain.value = 0.15;
    o.connect(g);
    o2.connect(g2);
    g2.connect(g);
    g.connect(this.master);
    const send = ctx.createGain();
    send.gain.value = 0.3;
    g.connect(send);
    send.connect(this.verbIn);
    o.start(t);
    o2.start(t);
    o.stop(t + 0.45);
    o2.stop(t + 0.45);
  }

  click() {
    if (!this.ready()) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.frequency.setValueAtTime(1320, t);
    o.frequency.exponentialRampToValueAtTime(520, t + 0.08);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.06, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
    o.connect(g);
    g.connect(this.master);
    o.start(t);
    o.stop(t + 0.14);
    this.burst(t, 3200, 0.05, 0);
  }

  burst(t, freq, gain, pan) {
    const ctx = this.ctx;
    const n = ctx.createBufferSource();
    n.buffer = this.noise;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = freq;
    bp.Q.value = 6;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.035);
    const p = ctx.createStereoPanner();
    p.pan.value = pan;
    n.connect(bp);
    bp.connect(g);
    g.connect(p);
    p.connect(this.master);
    n.start(t, Math.random() * 1.5, 0.05);
  }

  woosh(dir = 1, amount = 1) {
    if (!this.ready()) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const n = ctx.createBufferSource();
    n.buffer = this.noise;
    n.loop = true;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = 1.1;
    bp.frequency.setValueAtTime(220, t);
    bp.frequency.exponentialRampToValueAtTime(1700, t + 0.55);
    bp.frequency.exponentialRampToValueAtTime(260, t + 1.4);
    const p = ctx.createStereoPanner();
    p.pan.setValueAtTime(-0.7 * dir, t);
    p.pan.linearRampToValueAtTime(0.7 * dir, t + 1.4);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.24 * amount, t + 0.45);
    g.gain.linearRampToValueAtTime(0, t + 1.45);
    n.connect(bp);
    bp.connect(g);
    g.connect(p);
    p.connect(this.master);
    p.connect(this.verbIn);
    n.start(t);
    n.stop(t + 1.5);
  }

  // mechanical clicks that follow the slat wave across the stereo field
  louvers(dur = 1.7, count = 24, dir = 1) {
    if (!this.ready()) return;
    const t0 = this.ctx.currentTime + 0.05;
    for (let k = 0; k < count; k++) {
      const f = k / (count - 1);
      const t = t0 + dur * 0.75 * f + Math.random() * 0.03;
      this.burst(t, 1800 + Math.random() * 2600, 0.03 + Math.random() * 0.025, (f * 1.6 - 0.8) * dir);
    }
  }

  tick(p = 0.5) {
    if (!this.ready()) return;
    this.burst(this.ctx.currentTime, 2200 + p * 1800, 0.035, p * 1.4 - 0.7);
  }

  swell() {
    if (!this.ready()) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(41, t);
    o.frequency.exponentialRampToValueAtTime(110, t + 2.6);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.16, t + 1.2);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 4);
    o.connect(g);
    g.connect(this.master);
    g.connect(this.verbIn);
    o.start(t);
    o.stop(t + 4.1);
    this.woosh(1, 1.3);
  }

  wave() {
    if (!this.analyser || !this.enabled) return null;
    this.analyser.getByteTimeDomainData(this.data);
    return this.data;
  }

  level() {
    const d = this.wave();
    if (!d) return 0;
    let sum = 0;
    for (let i = 0; i < d.length; i++) {
      const v = (d[i] - 128) / 128;
      sum += v * v;
    }
    return Math.min(1, Math.sqrt(sum / d.length) * 4);
  }
}
