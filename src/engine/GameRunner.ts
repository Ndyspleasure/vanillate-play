import type { Rect } from '../core/math';
import { clamp, easeOutBack } from '../core/math';
import type { MotionSession } from '../core/session/MotionSession';
import { SIM_ASPECT } from '../core/tracking/SimulatedProvider';
import type { AudioEngine } from './audio';
import { C, FONT, emoji, PLAYER_COLORS, PLAYER_TINTS, handCursor, panel, playerTag, skeleton, text } from './draw';
import { Fx, type FxQuality } from './fx';
import { InputHub } from './input';
import { Rng } from './rng';
import { StageMapper, playerZones } from './stage';
import { tx } from '../games/kits/text';
import type { GameContext, GameInstance, GameMeta, MatchResult, ModeId, PlayerInfo, PlayerInput } from './types';

export type RunnerPhase = 'loading' | 'intro' | 'countdown' | 'play' | 'paused' | 'lost' | 'resuming' | 'ended';

export interface RunnerSettings {
  names: string[];
  showSkeleton: boolean;
  reducedMotion: boolean;
  fxQuality: FxQuality | 'auto';
  showPerf: boolean;
  lang: 'en' | 'id';
  /** Skip the intro card (rematch). */
  quickStart?: boolean;
  seed?: number;
}

export interface RunnerCallbacks {
  onEnd(result: MatchResult): void;
  onPhase?(phase: RunnerPhase): void;
}

const INTRO_S = 2.2;
const COUNT_S = 3.4;

/**
 * Runs one match of one game: owns the canvas loop, lifecycle (intro → countdown → play → result),
 * automatic pause when a player leaves the frame, slow motion, banners and the effects layer.
 */
export class GameRunner {
  readonly canvas: HTMLCanvasElement;
  private g: CanvasRenderingContext2D;
  readonly mapper = new StageMapper();
  private hub: InputHub;
  readonly fx = new Fx();
  private game: GameInstance | null = null;
  phase: RunnerPhase = 'loading';
  private phaseT = 0;
  private raf = 0;
  private last = 0;
  private gameTime = 0;
  private timeScale = 1;
  private timeScaleUntil = 0;
  private result: MatchResult | null = null;
  private dpr = 1;
  private ro: ResizeObserver | null = null;
  private bannerState: { text: string; sub?: string; t: number; dur: number } | null = null;
  private presentFor = 0;
  private fps = 60;
  private slowFrames = 0;
  readonly players: PlayerInfo[];
  readonly count: number;
  private pausedFrom: RunnerPhase = 'play';
  private ctx!: GameContext;

  constructor(
    private container: HTMLElement,
    private session: MotionSession,
    private audio: AudioEngine,
    readonly meta: GameMeta,
    readonly mode: ModeId,
    readonly options: Record<string, string>,
    playerCount: number,
    private settings: RunnerSettings,
    private cb: RunnerCallbacks,
  ) {
    this.count = playerCount;
    this.players = Array.from({ length: playerCount }, (_, i) => ({
      index: i,
      name: settings.names[i]?.trim() || `Player ${i + 1}`,
      color: PLAYER_COLORS[i],
      tint: PLAYER_TINTS[i],
    }));
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'stage-canvas';
    this.canvas.setAttribute('role', 'img');
    this.canvas.setAttribute('aria-label', `${meta.name} game`);
    container.appendChild(this.canvas);
    const g = this.canvas.getContext('2d', { alpha: true });
    if (!g) throw new Error('Canvas 2D is not supported');
    this.g = g;
    this.hub = new InputHub(session, this.mapper);
    this.fx.reducedMotion = settings.reducedMotion;
    this.fx.quality = settings.fxQuality === 'auto' ? 'high' : settings.fxQuality;
    this.resize();
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(container);
  }

  get width(): number {
    return this.mapper.width;
  }

  get height(): number {
    return this.mapper.height;
  }

  private get hasCamera(): boolean {
    return this.session.mode === 'camera';
  }

  private resize(): void {
    const rect = this.container.getBoundingClientRect();
    const w = Math.max(320, Math.round(rect.width));
    const h = Math.max(240, Math.round(rect.height));
    const maxDpr = this.fx.quality === 'low' ? 1 : 2;
    this.dpr = Math.min(maxDpr, window.devicePixelRatio || 1);
    this.canvas.width = Math.round(w * this.dpr);
    this.canvas.height = Math.round(h * this.dpr);
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;
    const aspect = this.hasCamera ? this.session.camera.aspect : SIM_ASPECT;
    this.mapper.set(w, h, aspect);
  }

  async start(): Promise<void> {
    const mod = await this.meta.load();
    const factory = mod.default;
    const rng = new Rng(this.settings.seed ?? (Date.now() & 0x7fffffff));
    // eslint-disable-next-line @typescript-eslint/no-this-alias -- getters on the context read live runner state
    const runner = this;
    this.ctx = {
      meta: this.meta,
      mode: this.mode,
      options: this.options,
      players: this.players,
      get width() {
        return runner.width;
      },
      get height() {
        return runner.height;
      },
      rng,
      audio: this.audio,
      fx: this.fx,
      get time() {
        return runner.gameTime;
      },
      camera: this.hasCamera,
      reducedMotion: this.settings.reducedMotion,
      lang: this.settings.lang,
      input: (i: number): PlayerInput => this.hub.get(i),
      zone: (i: number): Rect => playerZones(this.width, this.height, this.count)[i],
      end: (r: MatchResult) => this.finish(r),
      setTimeScale: (s: number, secs?: number) => {
        this.timeScale = s;
        this.timeScaleUntil = secs ? performance.now() + secs * 1000 : 0;
      },
      snapshot: (region?: Rect) => this.snapshot(region),
      banner: (t: string, sub?: string, secs = 1.4) => {
        this.bannerState = { text: t, sub, t: 0, dur: secs };
      },
    };
    this.session.lock(true);
    this.hub.frame(this.count, performance.now(), true);
    this.game = factory(this.ctx);
    this.container.classList.toggle('stage--pip', this.game.view.camera === 'pip');
    this.setPhase(this.settings.quickStart ? 'countdown' : 'intro');
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.loop);
  }

  private setPhase(p: RunnerPhase): void {
    this.phase = p;
    this.phaseT = 0;
    this.cb.onPhase?.(p);
  }

  pause(): void {
    if (this.phase === 'play' || this.phase === 'countdown' || this.phase === 'intro' || this.phase === 'resuming') {
      this.pausedFrom = this.phase === 'resuming' ? 'play' : this.phase;
      this.setPhase('paused');
      this.game?.onPause?.();
      this.audio.music.pause();
    }
  }

  resume(): void {
    if (this.phase === 'paused') {
      this.session.clearEvents();
      if (this.pausedFrom === 'play') this.setPhase('resuming');
      else this.setPhase(this.pausedFrom);
    }
  }

  get isPaused(): boolean {
    return this.phase === 'paused' || this.phase === 'lost';
  }

  destroy(): void {
    cancelAnimationFrame(this.raf);
    this.ro?.disconnect();
    this.game?.destroy?.();
    this.game = null;
    this.audio.music.stop(200);
    this.canvas.remove();
    this.container.classList.remove('stage--pip');
    this.session.lock(false);
  }

  private finish(r: MatchResult): void {
    if (this.phase === 'ended') return;
    this.result = r;
    this.endPhoto = this.snapshot();
    this.setPhase('ended');
  }

  /** Camera frame captured at the final moment of the match (for the optional share photo). */
  endPhoto: HTMLCanvasElement | null = null;

  private snapshot(region?: Rect): HTMLCanvasElement | null {
    if (!this.hasCamera) return null;
    const video = this.session.camera.video;
    if (video.readyState < 2) return null;
    const r = region ?? { x: 0, y: 0, w: this.width, h: this.height };
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(r.w));
    c.height = Math.max(1, Math.round(r.h));
    const g = c.getContext('2d');
    if (!g) return null;
    const m = this.mapper;
    g.translate(-r.x, -r.y);
    // Mirror horizontally around the displayed video.
    g.translate(m.offX + m.scale * m.aspect, m.offY);
    g.scale(-1, 1);
    g.drawImage(video, 0, 0, m.scale * m.aspect, m.scale);
    return c;
  }

  private loop = (now: number) => {
    this.raf = requestAnimationFrame(this.loop);
    const realDt = clamp((now - this.last) / 1000, 0, 0.05);
    this.last = now;
    this.trackFps(realDt);
    if (this.timeScaleUntil && now > this.timeScaleUntil) {
      this.timeScale = 1;
      this.timeScaleUntil = 0;
    }
    const dt = realDt * this.timeScale;
    this.phaseT += realDt;

    const playing = this.phase === 'play';
    this.hub.frame(this.count, now, true);
    if (!playing) for (let i = 0; i < this.count; i++) this.hub.get(i).clearEvents();

    this.updatePhase(realDt);
    if (this.phase === 'play' && this.game) {
      this.gameTime += dt;
      try {
        this.game.update(dt);
      } catch (err) {
        console.error('[game] update failed', err);
        this.finish({
          kind: 'solo',
          winner: null,
          scores: [],
          headline: tx(this.settings, 'oops'),
          subline: tx(this.settings, 'oopsSub'),
          stats: [],
          shareText: '',
        });
      }
    } else if (this.phase === 'ended' && this.game) {
      // Let final effects play out (slow-mo KO etc.)
      this.game.update(dt);
    }
    this.fx.update(dt);
    if (this.bannerState) {
      this.bannerState.t += realDt;
      if (this.bannerState.t > this.bannerState.dur) this.bannerState = null;
    }
    this.render();
  };

  private trackFps(dt: number): void {
    if (dt <= 0) return;
    this.fps = this.fps * 0.95 + (1 / dt) * 0.05;
    if (this.settings.fxQuality !== 'auto') return;
    if (this.fps < 40) this.slowFrames++;
    else this.slowFrames = Math.max(0, this.slowFrames - 2);
    if (this.slowFrames > 180) {
      this.slowFrames = 0;
      if (this.fx.quality === 'high') this.fx.quality = 'medium';
      else if (this.fx.quality === 'medium') {
        this.fx.quality = 'low';
        this.resize();
      }
    }
  }

  private allPresent(): boolean {
    for (let i = 0; i < this.count; i++) if (this.session.health(i) === 'lost') return false;
    return true;
  }

  private updatePhase(dt: number): void {
    switch (this.phase) {
      case 'intro':
        if (this.phaseT >= INTRO_S) this.setPhase('countdown');
        break;
      case 'countdown': {
        const before = Math.floor(this.phaseT - dt);
        const nowStep = Math.floor(this.phaseT);
        if (nowStep !== before && nowStep < 3) this.audio.play('tick');
        if (nowStep === 3 && before === 2) this.audio.play('go');
        if (this.phaseT >= COUNT_S) {
          this.session.clearEvents();
          this.setPhase('play');
          this.game?.onResume?.();
        }
        break;
      }
      case 'play':
        if (!this.allPresent()) {
          this.setPhase('lost');
          this.game?.onPause?.();
          this.audio.music.pause();
          this.audio.play('warn');
        }
        break;
      case 'lost':
        if (this.allPresent()) {
          this.presentFor += dt;
          if (this.presentFor > 0.8) {
            this.presentFor = 0;
            this.setPhase('resuming');
          }
        } else this.presentFor = 0;
        break;
      case 'resuming':
        if (this.phaseT >= 1.2) {
          this.session.clearEvents();
          this.setPhase('play');
          this.game?.onResume?.();
          this.audio.music.resume();
        }
        break;
      case 'ended':
        if (this.phaseT >= 1.6 && this.result) {
          const r = this.result;
          this.result = null;
          this.cb.onEnd(r);
        }
        break;
      default:
        break;
    }
  }

  private render(): void {
    const g = this.g;
    const w = this.width;
    const h = this.height;
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    g.clearRect(0, 0, w, h);
    const game = this.game;
    if (!game) return;
    const view = game.view;
    const shake = this.fx.shakeOffset();
    g.save();
    g.translate(shake.x, shake.y);

    if (view.camera === 'pip') {
      game.renderBackground?.(g);
    } else if (!this.hasCamera) {
      this.arenaBackground(g);
      game.renderBackground?.(g);
    } else {
      const dim = view.dim ?? (view.camera === 'dim' ? 0.45 : 0.12);
      if (dim > 0) {
        g.fillStyle = `rgba(20,10,40,${dim})`;
        g.fillRect(-20, -20, w + 40, h + 40);
      }
      game.renderBackground?.(g);
    }

    const showSkel = view.camera !== 'pip' && (view.skeleton || !this.hasCamera);
    if (showSkel) {
      for (let i = 0; i < this.count; i++) {
        const inp = this.hub.get(i);
        if (inp.health === 'lost' && !this.session.players[i].lastPose) continue;
        if (!this.hasCamera) skeleton(g, inp, this.players[i].color, true, 0.95);
        else if (this.settings.showSkeleton) skeleton(g, inp, this.players[i].color, false, 0.85);
      }
    }

    game.render(g);

    if (view.hands && view.camera !== 'pip') {
      for (let i = 0; i < this.count; i++) {
        const inp = this.hub.get(i);
        if (inp.health === 'lost') continue;
        handCursor(g, inp.leftHand, this.players[i].color, Math.max(16, inp.torsoPx * 0.16));
        handCursor(g, inp.rightHand, this.players[i].color, Math.max(16, inp.torsoPx * 0.16));
      }
    }

    this.fx.render(g, w, h);
    g.restore();

    if (view.camera === 'pip') this.renderPip(g);
    this.renderOverlay(g);
    if (this.settings.showPerf) {
      text(
        g,
        `${Math.round(this.fps)} fps · tracking ${Math.round(this.session.perf.trackFps)} fps · ${this.session.perf.inferMs.toFixed(0)} ms · fx ${this.fx.quality}`,
        12,
        h - 14,
        { size: 13, align: 'left', color: C.muted, stroke: 3 },
      );
    }
  }

  private arenaBackground(g: CanvasRenderingContext2D): void {
    const w = this.width;
    const h = this.height;
    const grad = g.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, '#2a1760');
    grad.addColorStop(0.62, '#1a0f3d');
    grad.addColorStop(1, '#0e0824');
    g.fillStyle = grad;
    g.fillRect(-20, -20, w + 40, h + 40);
    const floorY = this.mapper.offY + 0.93 * this.mapper.scale;
    g.strokeStyle = 'rgba(139,92,255,0.25)';
    g.lineWidth = 1;
    for (let i = -12; i <= 12; i++) {
      g.beginPath();
      g.moveTo(w / 2 + i * 40, floorY);
      g.lineTo(w / 2 + i * 160, h + 20);
      g.stroke();
    }
    for (let j = 0; j < 6; j++) {
      const y = floorY + (h - floorY) * ((j / 6) ** 1.6);
      g.beginPath();
      g.moveTo(0, y);
      g.lineTo(w, y);
      g.stroke();
    }
  }

  private renderPip(g: CanvasRenderingContext2D): void {
    const w = this.width;
    const h = this.height;
    const pw = Math.min(260, w * 0.24);
    const ph = pw / this.mapper.aspect;
    const r = { x: w - pw - 14, y: h - ph - 14, w: pw, h: ph };
    panel(g, r.x - 4, r.y - 4, r.w + 8, r.h + 8, { fill: 'rgba(20,10,40,0.85)', r: 14 });
    g.save();
    g.beginPath();
    g.rect(r.x, r.y, r.w, r.h);
    g.clip();
    if (this.hasCamera && this.session.camera.video.readyState >= 2) {
      g.translate(r.x + r.w, r.y);
      g.scale(-1, 1);
      g.drawImage(this.session.camera.video, 0, 0, r.w, r.h);
      g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    } else {
      g.fillStyle = '#22124a';
      g.fillRect(r.x, r.y, r.w, r.h);
    }
    // Mini skeletons
    for (let i = 0; i < this.count; i++) {
      const pose = this.session.players[i].lastPose;
      if (!pose) continue;
      g.strokeStyle = this.players[i].color;
      g.lineWidth = 2;
      const pts = pose.pts;
      const map = (j: number) => this.mapper.toPip(pts[j], r);
      for (const [a, b] of [
        [11, 12],
        [11, 13],
        [13, 15],
        [12, 14],
        [14, 16],
        [11, 23],
        [12, 24],
        [23, 24],
        [23, 25],
        [25, 27],
        [24, 26],
        [26, 28],
      ]) {
        if (pts[a].v < 0.4 || pts[b].v < 0.4) continue;
        const p = map(a);
        const q = map(b);
        g.beginPath();
        g.moveTo(p.x, p.y);
        g.lineTo(q.x, q.y);
        g.stroke();
      }
    }
    g.restore();
  }

  private renderOverlay(g: CanvasRenderingContext2D): void {
    const w = this.width;
    const h = this.height;
    const t = this.phaseT;
    const big = Math.min(w, h * 1.6);

    // Player name tags during setup phases.
    if (this.phase === 'intro' || this.phase === 'countdown') {
      for (let i = 0; i < this.count; i++) {
        const inp = this.hub.get(i);
        if (inp.health === 'lost') continue;
        playerTag(g, this.players[i].name, inp.head.x, inp.head.y - inp.headRadius * 2.2, this.players[i].color);
      }
    }

    if (this.phase === 'intro') {
      const a = Math.min(1, t * 3, (INTRO_S - t) * 3);
      g.globalAlpha = Math.max(0, a);
      panel(g, w * 0.5 - Math.min(w * 0.42, 520), h * 0.3, Math.min(w * 0.84, 1040), h * 0.36, {
        fill: 'rgba(20,10,40,0.95)',
        r: 28,
      });
      emoji(g, this.meta.emoji, w / 2 - Math.min(w * 0.3, 380), h * 0.4, big * 0.08, 1, this.meta.colors[0]);
      text(g, this.meta.name.toUpperCase(), w / 2, h * 0.4, { size: big * 0.06, weight: 800 });
      const tip = this.meta.text[this.settings.lang].howTo[0] ?? '';
      text(g, tip, w / 2, h * 0.52, { size: Math.max(16, big * 0.026), color: C.vanilla, maxWidth: w * 0.78 });
      g.globalAlpha = 1;
    } else if (this.phase === 'countdown') {
      const step = Math.floor(t);
      const u = t - step;
      const label = step < 3 ? String(3 - step) : tx(this.settings, 'go');
      if (t < COUNT_S) {
        const s = easeOutBack(Math.min(1, u * 2.2));
        g.globalAlpha = step < 3 ? 1 - Math.max(0, u - 0.7) / 0.3 : 1 - u * 2;
        text(g, label, w / 2, h * 0.45, {
          size: big * 0.2 * s,
          weight: 800,
          color: step < 3 ? C.vanilla : C.good,
          stroke: big * 0.02,
        });
        g.globalAlpha = 1;
      }
    } else if (this.phase === 'lost' || this.phase === 'paused' || this.phase === 'resuming') {
      g.fillStyle = 'rgba(20,10,40,0.55)';
      g.fillRect(0, 0, w, h);
      if (this.phase === 'lost') {
        const missing = [];
        for (let i = 0; i < this.count; i++) if (this.session.health(i) === 'lost') missing.push(this.players[i].name.toUpperCase());
        text(g, tx(this.settings, 'notDetected', { names: missing.join(' & ') }), w / 2, h * 0.42, { size: big * 0.05, color: C.warn, weight: 800 });
        text(g, tx(this.settings, 'moveIntoFrame'), w / 2, h * 0.52, { size: big * 0.035, color: C.ink });
        // Zone hints
        const zones = playerZones(w, h, this.count);
        for (let i = 0; i < this.count; i++) {
          if (this.session.health(i) !== 'lost') continue;
          const z = zones[i];
          g.setLineDash([12, 10]);
          g.strokeStyle = this.players[i].color;
          g.lineWidth = 4;
          g.strokeRect(z.x + 16, z.y + 90, z.w - 32, z.h - 120);
          g.setLineDash([]);
        }
      } else if (this.phase === 'resuming') {
        text(g, tx(this.settings, 'ready'), w / 2, h * 0.45, { size: big * 0.09, color: C.good, weight: 800 });
      } else {
        text(g, tx(this.settings, 'paused'), w / 2, h * 0.45, { size: big * 0.08, weight: 800 });
      }
    }

    if (this.bannerState) {
      const b = this.bannerState;
      const u = b.t / b.dur;
      const s = easeOutBack(Math.min(1, b.t * 4));
      g.globalAlpha = u > 0.8 ? (1 - u) / 0.2 : 1;
      text(g, b.text, w / 2, h * 0.36, { size: big * 0.085 * s, weight: 800, color: C.vanilla, stroke: 10 });
      if (b.sub) text(g, b.sub, w / 2, h * 0.36 + big * 0.07, { size: big * 0.03, color: C.ink });
      g.globalAlpha = 1;
    }

    // Small tracking-health chips during play
    if (this.phase === 'play') {
      for (let i = 0; i < this.count; i++) {
        if (this.session.health(i) === 'weak') {
          const inp = this.hub.get(i);
          g.font = `700 14px ${FONT}`;
          text(g, tx(this.settings, 'tracking'), inp.head.x, inp.head.y - inp.headRadius * 2, { size: 14, color: C.warn });
        }
      }
    }
  }
}
