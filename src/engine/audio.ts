/**
 * Procedural audio: every sound effect and music loop is synthesized with WebAudio, so the game
 * ships zero audio assets, works offline and makes no network requests.
 */

export type SfxName =
  | 'tick'
  | 'go'
  | 'hit'
  | 'punch'
  | 'whoosh'
  | 'block'
  | 'coin'
  | 'success'
  | 'perfect'
  | 'fail'
  | 'buzzer'
  | 'combo'
  | 'ko'
  | 'jump'
  | 'pop'
  | 'laser'
  | 'explosion'
  | 'freeze'
  | 'cheer'
  | 'boing'
  | 'click'
  | 'swish'
  | 'kick'
  | 'whistle'
  | 'win'
  | 'lose'
  | 'heart'
  | 'warn'
  | 'shoot'
  | 'splat'
  | 'thud'
  | 'powerup'
  | 'step';

export type MusicStyle = 'party' | 'dance' | 'chill' | 'tension' | 'arcade' | 'boss';

interface PlayOpts {
  pitch?: number;
  volume?: number;
  pan?: number;
}

const NOTE = (n: number) => 440 * 2 ** ((n - 69) / 12);

interface Style {
  bpm: number;
  kick: number[];
  snare: number[];
  hat: number[];
  bass: (number | null)[];
  lead: (number | null)[];
  wave: OscillatorType;
  root: number;
}

const STYLES: Record<MusicStyle, Style> = {
  party: {
    bpm: 118,
    kick: [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0],
    snare: [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 1],
    hat: [0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 1],
    bass: [0, null, 0, null, 7, null, 0, null, 5, null, 5, null, 3, null, 7, null],
    lead: [12, null, 15, null, 19, null, 15, 12, 17, null, 15, null, 14, null, 10, null],
    wave: 'square',
    root: 45,
  },
  dance: {
    bpm: 112,
    kick: [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0],
    snare: [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0],
    hat: [0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0],
    bass: [0, null, 12, null, 0, null, 12, null, 3, null, 15, null, 5, null, 17, null],
    lead: [null, null, 19, null, null, null, 17, null, null, null, 15, null, 14, null, 12, null],
    wave: 'sawtooth',
    root: 43,
  },
  chill: {
    bpm: 92,
    kick: [1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 1, 0, 0, 0, 0, 0],
    snare: [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0],
    hat: [1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0],
    bass: [0, null, null, null, 5, null, null, null, 7, null, null, null, 3, null, null, null],
    lead: [12, null, null, 16, null, null, 19, null, 17, null, null, 14, null, null, 12, null],
    wave: 'triangle',
    root: 48,
  },
  tension: {
    bpm: 128,
    kick: [1, 0, 0, 1, 0, 0, 1, 0, 1, 0, 0, 1, 0, 0, 1, 0],
    snare: [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 1, 0],
    hat: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
    bass: [0, 0, null, 0, 1, null, 0, null, 0, 0, null, 0, 3, null, 1, null],
    lead: [null, null, null, null, 12, null, 13, null, null, null, null, null, 15, null, 13, null],
    wave: 'square',
    root: 40,
  },
  arcade: {
    bpm: 136,
    kick: [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0],
    snare: [0, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0],
    hat: [0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1],
    bass: [0, null, 0, 12, 0, null, 0, 12, 5, null, 5, 17, 7, null, 7, 19],
    lead: [24, 19, 16, 19, 24, 19, 16, 19, 22, 17, 14, 17, 26, 22, 19, 22],
    wave: 'square',
    root: 45,
  },
  boss: {
    bpm: 140,
    kick: [1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 1],
    snare: [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0],
    hat: [1, 0, 1, 1, 1, 0, 1, 1, 1, 0, 1, 1, 1, 0, 1, 1],
    bass: [0, 0, 0, 0, 1, 1, 1, 1, 3, 3, 3, 3, 1, 1, 6, 6],
    lead: [12, null, 11, null, 12, null, 15, null, 13, null, 12, null, 11, null, 8, null],
    wave: 'sawtooth',
    root: 38,
  },
};

export class MusicPlayer {
  private timer: ReturnType<typeof setInterval> | null = null;
  private step = 0;
  private nextTime = 0;
  private startTime = 0;
  private fallbackStart = 0;
  private bus: GainNode | null = null;
  style: MusicStyle | null = null;
  bpm = 120;
  private paused = false;
  private pausedAt = 0;

  constructor(private engine: AudioEngine) {}

  get playing(): boolean {
    return this.style !== null && !this.paused;
  }

  play(style: MusicStyle, bpm?: number): void {
    this.stop(0);
    const s = STYLES[style];
    this.style = style;
    this.bpm = bpm ?? s.bpm;
    this.paused = false;
    this.fallbackStart = performance.now();
    const ctx = this.engine.ctx;
    if (!ctx || !this.engine.musicOut) return;
    this.bus = ctx.createGain();
    this.bus.gain.value = 1;
    this.bus.connect(this.engine.musicOut);
    this.step = 0;
    this.startTime = ctx.currentTime + 0.06;
    this.nextTime = this.startTime;
    this.timer = setInterval(() => this.schedule(), 25);
    this.schedule();
  }

  /** Current musical position in beats (works without audio via a wall clock fallback). */
  position(): number {
    const ctx = this.engine.ctx;
    if (this.paused) return this.pausedAt;
    if (ctx && this.timer) return ((ctx.currentTime - this.startTime) * this.bpm) / 60;
    return ((performance.now() - this.fallbackStart) / 1000) * (this.bpm / 60);
  }

  pause(): void {
    if (!this.style || this.paused) return;
    this.pausedAt = this.position();
    this.paused = true;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    if (this.bus && this.engine.ctx) this.bus.gain.setTargetAtTime(0, this.engine.ctx.currentTime, 0.03);
  }

  resume(): void {
    if (!this.style || !this.paused) return;
    const pos = this.pausedAt;
    this.paused = false;
    const ctx = this.engine.ctx;
    this.fallbackStart = performance.now() - (pos * 60 * 1000) / this.bpm;
    if (!ctx || !this.bus) return;
    this.bus.gain.setTargetAtTime(1, ctx.currentTime, 0.03);
    const spb = 60 / this.bpm;
    this.startTime = ctx.currentTime + 0.05 - pos * spb;
    this.step = Math.ceil(pos * 4);
    this.nextTime = this.startTime + (this.step * spb) / 4;
    this.timer = setInterval(() => this.schedule(), 25);
  }

  stop(fadeMs = 300): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    const bus = this.bus;
    const ctx = this.engine.ctx;
    if (bus && ctx) {
      bus.gain.setTargetAtTime(0, ctx.currentTime, Math.max(0.01, fadeMs / 3000));
      setTimeout(() => bus.disconnect(), fadeMs + 200);
    }
    this.bus = null;
    this.style = null;
    this.paused = false;
  }

  private schedule(): void {
    const ctx = this.engine.ctx;
    if (!ctx || !this.bus || !this.style) return;
    const s = STYLES[this.style];
    const stepDur = 60 / this.bpm / 4;
    while (this.nextTime < ctx.currentTime + 0.12) {
      const i = this.step % 16;
      const t = this.nextTime;
      const bar = Math.floor(this.step / 16) % 4;
      const shift = [0, 0, 5, 3][bar];
      if (s.kick[i]) this.engine.drum('kick', t, this.bus);
      if (s.snare[i]) this.engine.drum('snare', t, this.bus);
      if (s.hat[i]) this.engine.drum('hat', t, this.bus);
      const b = s.bass[i];
      if (b !== null) this.engine.note(NOTE(s.root + b + shift - 12), t, stepDur * 1.8, 'triangle', 0.32, this.bus);
      const l = s.lead[i];
      if (l !== null && bar !== 3) this.engine.note(NOTE(s.root + l + shift), t, stepDur * 0.9, s.wave, 0.07, this.bus);
      this.nextTime += stepDur;
      this.step++;
    }
  }
}

export class AudioEngine {
  ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private sfxOut: GainNode | null = null;
  musicOut: GainNode | null = null;
  private noiseBuf: AudioBuffer | null = null;
  readonly music = new MusicPlayer(this);
  private sfxVol = 0.8;
  private musicVol = 0.5;
  private lastPlayed = new Map<string, number>();

  /** Must be called from a user gesture (browsers block audio until then). */
  unlock(): void {
    if (typeof window === 'undefined' || !('AudioContext' in window)) return;
    if (!this.ctx) {
      try {
        this.ctx = new AudioContext({ latencyHint: 'interactive' });
      } catch {
        return;
      }
      this.master = this.ctx.createGain();
      const comp = this.ctx.createDynamicsCompressor();
      comp.threshold.value = -12;
      comp.ratio.value = 4;
      this.master.connect(comp).connect(this.ctx.destination);
      this.sfxOut = this.ctx.createGain();
      this.musicOut = this.ctx.createGain();
      this.sfxOut.connect(this.master);
      this.musicOut.connect(this.master);
      this.applyVolumes();
      const len = this.ctx.sampleRate;
      this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
  }

  setVolumes(sfx: number, music: number): void {
    this.sfxVol = sfx;
    this.musicVol = music;
    this.applyVolumes();
  }

  private applyVolumes(): void {
    if (this.sfxOut) this.sfxOut.gain.value = this.sfxVol;
    if (this.musicOut) this.musicOut.gain.value = this.musicVol * 0.6;
  }

  suspend(): void {
    void this.ctx?.suspend();
  }

  resume(): void {
    if (this.ctx?.state === 'suspended') void this.ctx.resume();
  }

  note(freq: number, t: number, dur: number, type: OscillatorType, vol: number, out: AudioNode): void {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.value = freq;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    o.connect(g).connect(out);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  drum(kind: 'kick' | 'snare' | 'hat', t: number, out: AudioNode): void {
    const ctx = this.ctx!;
    if (kind === 'kick') {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.frequency.setValueAtTime(150, t);
      o.frequency.exponentialRampToValueAtTime(42, t + 0.12);
      g.gain.setValueAtTime(0.9, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
      o.connect(g).connect(out);
      o.start(t);
      o.stop(t + 0.25);
    } else {
      const src = ctx.createBufferSource();
      src.buffer = this.noiseBuf;
      const f = ctx.createBiquadFilter();
      f.type = kind === 'hat' ? 'highpass' : 'bandpass';
      f.frequency.value = kind === 'hat' ? 7000 : 1800;
      const g = ctx.createGain();
      const dur = kind === 'hat' ? 0.04 : 0.14;
      g.gain.setValueAtTime(kind === 'hat' ? 0.12 : 0.35, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + dur);
      src.connect(f).connect(g).connect(out);
      src.start(t, Math.random() * 0.5);
      src.stop(t + dur + 0.02);
    }
  }

  private tone(
    freq: number,
    dur: number,
    type: OscillatorType,
    vol: number,
    opts: { slide?: number; delay?: number; out: AudioNode },
  ): void {
    const ctx = this.ctx!;
    const t = ctx.currentTime + (opts.delay ?? 0);
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (opts.slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, opts.slide), t + dur);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    o.connect(g).connect(opts.out);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  private noise(dur: number, vol: number, freq: number, opts: { type?: BiquadFilterType; slide?: number; delay?: number; out: AudioNode }): void {
    const ctx = this.ctx!;
    const t = ctx.currentTime + (opts.delay ?? 0);
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const f = ctx.createBiquadFilter();
    f.type = opts.type ?? 'bandpass';
    f.frequency.setValueAtTime(freq, t);
    if (opts.slide) f.frequency.exponentialRampToValueAtTime(opts.slide, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f).connect(g).connect(opts.out);
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur + 0.05);
  }

  play(name: SfxName, opts: PlayOpts = {}): void {
    const ctx = this.ctx;
    if (!ctx || !this.sfxOut || ctx.state !== 'running') return;
    // Avoid stacking the exact same sound within a few ms (e.g. both players scoring at once).
    const now = performance.now();
    if (now - (this.lastPlayed.get(name) ?? 0) < 30) return;
    this.lastPlayed.set(name, now);
    let out: AudioNode = this.sfxOut;
    if (opts.pan) {
      const p = ctx.createStereoPanner();
      p.pan.value = Math.max(-1, Math.min(1, opts.pan));
      p.connect(this.sfxOut);
      out = p;
    }
    const v = opts.volume ?? 1;
    const k = opts.pitch ?? 1;
    const o = { out };
    switch (name) {
      case 'tick':
        this.tone(880 * k, 0.1, 'square', 0.18 * v, o);
        break;
      case 'go':
        this.tone(660 * k, 0.12, 'square', 0.2 * v, o);
        this.tone(990 * k, 0.35, 'square', 0.2 * v, { ...o, delay: 0.1 });
        break;
      case 'hit':
        this.noise(0.12, 0.6 * v, 900 * k, { ...o, type: 'lowpass', slide: 200 });
        this.tone(180 * k, 0.12, 'sine', 0.5 * v, { ...o, slide: 60 });
        break;
      case 'punch':
        this.noise(0.08, 0.5 * v, 2400 * k, { ...o, slide: 400 });
        break;
      case 'whoosh':
        this.noise(0.25, 0.35 * v, 600 * k, { ...o, slide: 3000 });
        break;
      case 'block':
        this.tone(300 * k, 0.08, 'square', 0.25 * v, o);
        this.noise(0.05, 0.3 * v, 4000, o);
        break;
      case 'coin':
        this.tone(988 * k, 0.07, 'square', 0.16 * v, o);
        this.tone(1318 * k, 0.25, 'square', 0.16 * v, { ...o, delay: 0.07 });
        break;
      case 'success':
        [523, 659, 784].forEach((f, i) => this.tone(f * k, 0.18, 'triangle', 0.25 * v, { ...o, delay: i * 0.07 }));
        break;
      case 'perfect':
        [784, 988, 1175, 1568].forEach((f, i) => this.tone(f * k, 0.2, 'square', 0.13 * v, { ...o, delay: i * 0.06 }));
        break;
      case 'fail':
        this.tone(330 * k, 0.35, 'sawtooth', 0.18 * v, { ...o, slide: 110 });
        break;
      case 'buzzer':
        this.tone(140 * k, 0.45, 'sawtooth', 0.25 * v, o);
        this.tone(146 * k, 0.45, 'square', 0.15 * v, o);
        break;
      case 'combo':
        this.tone(660 * k, 0.1, 'square', 0.15 * v, { ...o, slide: 1320 * k });
        break;
      case 'ko':
        this.tone(220 * k, 0.9, 'sawtooth', 0.3 * v, { ...o, slide: 40 });
        this.noise(0.6, 0.5 * v, 300, { ...o, type: 'lowpass', slide: 60 });
        break;
      case 'jump':
        this.tone(330 * k, 0.18, 'square', 0.14 * v, { ...o, slide: 880 * k });
        break;
      case 'pop':
        this.tone(600 * k, 0.07, 'sine', 0.35 * v, { ...o, slide: 1200 * k });
        break;
      case 'laser':
        this.tone(1600 * k, 0.25, 'sawtooth', 0.12 * v, { ...o, slide: 200 });
        break;
      case 'explosion':
        this.noise(0.7, 0.8 * v, 1200 * k, { ...o, type: 'lowpass', slide: 50 });
        break;
      case 'freeze':
        this.tone(1200 * k, 0.5, 'sine', 0.2 * v, { ...o, slide: 2400 });
        this.noise(0.4, 0.2 * v, 6000, { ...o, type: 'highpass' });
        break;
      case 'cheer':
        this.noise(1.1, 0.35 * v, 1500, { ...o, slide: 2500 });
        [523, 659, 784, 1046].forEach((f, i) => this.tone(f, 0.3, 'triangle', 0.12 * v, { ...o, delay: 0.1 + i * 0.08 }));
        break;
      case 'boing':
        this.tone(150 * k, 0.5, 'sine', 0.4 * v, { ...o, slide: 600 * k });
        this.tone(300 * k, 0.3, 'triangle', 0.2 * v, { ...o, slide: 90, delay: 0.15 });
        break;
      case 'click':
        this.tone(1200 * k, 0.03, 'square', 0.1 * v, o);
        break;
      case 'swish':
        this.noise(0.3, 0.3 * v, 3000, { ...o, type: 'highpass', slide: 8000 });
        break;
      case 'kick':
        this.tone(120 * k, 0.15, 'sine', 0.6 * v, { ...o, slide: 50 });
        this.noise(0.06, 0.4 * v, 1500, o);
        break;
      case 'whistle':
        this.tone(2100 * k, 0.35, 'sine', 0.2 * v, o);
        this.tone(2300 * k, 0.15, 'sine', 0.15 * v, { ...o, delay: 0.35 });
        break;
      case 'win':
        [523, 659, 784, 1046, 784, 1046].forEach((f, i) =>
          this.tone(f * k, i === 5 ? 0.6 : 0.16, 'square', 0.15 * v, { ...o, delay: i * 0.11 }),
        );
        break;
      case 'lose':
        [392, 370, 349, 330].forEach((f, i) => this.tone(f * k, 0.3, 'triangle', 0.2 * v, { ...o, delay: i * 0.2 }));
        break;
      case 'heart':
        this.tone(523 * k, 0.15, 'sine', 0.25 * v, o);
        this.tone(784 * k, 0.3, 'sine', 0.25 * v, { ...o, delay: 0.12 });
        break;
      case 'warn':
        this.tone(520 * k, 0.12, 'square', 0.15 * v, o);
        this.tone(520 * k, 0.12, 'square', 0.15 * v, { ...o, delay: 0.18 });
        break;
      case 'shoot':
        this.tone(900 * k, 0.12, 'square', 0.12 * v, { ...o, slide: 150 });
        break;
      case 'splat':
        this.noise(0.2, 0.5 * v, 500 * k, { ...o, type: 'lowpass', slide: 100 });
        break;
      case 'thud':
        this.tone(90 * k, 0.2, 'sine', 0.6 * v, { ...o, slide: 40 });
        break;
      case 'powerup':
        [440, 554, 659, 880, 1108].forEach((f, i) => this.tone(f * k, 0.1, 'square', 0.12 * v, { ...o, delay: i * 0.05 }));
        break;
      case 'step':
        this.tone(200 * k, 0.05, 'triangle', 0.12 * v, o);
        break;
    }
  }
}
