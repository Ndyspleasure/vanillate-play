import { CameraManager } from '../camera/CameraManager';
import { CalibrationTracker, bodyIssues, type BodyIssue } from '../calibration/Calibration';
import { KeyboardController } from '../input/KeyboardController';
import { MotionRecognizer } from '../motion/MotionRecognizer';
import { SENSITIVITY_FACTOR, type MotionState, type Sensitivity, type TimedEvent } from '../motion/types';
import { PlayerTracker, type PlayerSlot, type TrackedPose } from '../players/PlayerTracker';
import { MediaPipeProvider, type InputQuality } from '../tracking/MediaPipeProvider';
import { SimulatedProvider } from '../tracking/SimulatedProvider';
import type { PoseFrame, PoseProvider, ProviderStatus } from '../tracking/types';

export type SessionMode = 'off' | 'camera' | 'simulated';
export type TrackingHealth = 'ok' | 'weak' | 'lost';

export interface SessionPlayer {
  index: number;
  recognizer: MotionRecognizer;
  calibration: CalibrationTracker;
  queue: TimedEvent[];
  issues: BodyIssue[];
  /** Latest and previous poses, for render-time extrapolation. */
  lastPose: TrackedPose | null;
  prevPose: TrackedPose | null;
}

export interface SessionPerf {
  trackFps: number;
  inferMs: number;
}

const MAX_PLAYERS = 4;

/**
 * The long-lived motion session: camera + pose provider + identity tracking + calibration + motion
 * recognition. It survives game changes so rematches and switching games never re-ask for the
 * camera or re-run setup (calibration is kept while the same players stay in frame).
 */
export class MotionSession {
  mode: SessionMode = 'off';
  readonly camera = new CameraManager();
  readonly tracker = new PlayerTracker(MAX_PLAYERS);
  readonly players: SessionPlayer[];
  provider: PoseProvider | null = null;
  sim: SimulatedProvider | null = null;
  keyboard: KeyboardController | null = null;
  status: ProviderStatus = { phase: 'idle' };
  perf: SessionPerf = { trackFps: 0, inferMs: 0 };
  brightness: number | null = null;
  quality: InputQuality = 'balanced';
  /** Minimum ms between pose detections (raised automatically on slow devices). */
  minInterval = 0;
  private running = false;
  private inFlight = false;
  private lastProcessed = 0;
  private lastDetect = 0;
  private lastBrightness = 0;
  private simTimer: ReturnType<typeof setInterval> | null = null;
  private listeners = new Set<() => void>();
  private statusListeners = new Set<(s: ProviderStatus) => void>();
  private sensitivity: Sensitivity = 'normal';

  constructor() {
    this.players = Array.from({ length: MAX_PLAYERS }, (_, index) => ({
      index,
      recognizer: new MotionRecognizer(),
      calibration: new CalibrationTracker(),
      queue: [],
      issues: [],
      lastPose: null,
      prevPose: null,
    }));
    this.tracker.onSwap = (a, b) => {
      const pa = this.players[a];
      const pb = this.players[b];
      this.players[a] = pb;
      this.players[b] = pa;
      pb.index = a;
      pa.index = b;
    };
    this.camera.onEnded = () => this.setStatus({ phase: 'error', message: 'camera-ended' });
  }

  get required(): number {
    return this.tracker.requiredPlayers;
  }

  onFrame(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  onStatus(fn: (s: ProviderStatus) => void): () => void {
    this.statusListeners.add(fn);
    return () => this.statusListeners.delete(fn);
  }

  private setStatus(s: ProviderStatus): void {
    this.status = s;
    for (const fn of this.statusListeners) fn(s);
  }

  setSensitivity(s: Sensitivity): void {
    this.sensitivity = s;
    for (const p of this.players) p.recognizer.k = SENSITIVITY_FACTOR[s];
  }

  setQuality(q: InputQuality): void {
    this.quality = q;
    if (this.provider instanceof MediaPipeProvider) this.provider.setQuality(q);
    this.minInterval = q === 'performance' ? 1000 / 20 : 0;
  }

  /** Number of players the current game needs. */
  configure(required: number): void {
    const prev = this.tracker.requiredPlayers;
    this.tracker.setRequired(required);
    if (required !== prev) {
      for (let i = required; i < MAX_PLAYERS; i++) this.resetPlayer(i);
    }
    this.provider?.setNumPoses(this.mode === 'camera' ? Math.min(MAX_PLAYERS, required + (required <= 2 ? 1 : 0)) : required);
    if (this.keyboard) this.keyboard.humanCount = Math.min(2, required);
  }

  lock(locked: boolean): void {
    this.tracker.setLocked(locked);
  }

  private resetPlayer(i: number): void {
    const p = this.players[i];
    p.recognizer.reset();
    p.calibration.reset();
    p.queue.length = 0;
    p.prevPose = null;
    p.lastPose = null;
    p.issues = [];
  }

  recalibrate(i?: number): void {
    const list = i === undefined ? this.players.map((_, j) => j) : [i];
    for (const j of list) {
      this.players[j].calibration.reset();
      this.players[j].recognizer.reset();
    }
  }

  async startCamera(): Promise<void> {
    this.stop();
    this.mode = 'camera';
    this.setStatus({ phase: 'loading', message: 'Starting camera', progress: 0 });
    try {
      await this.camera.start();
    } catch (err) {
      this.mode = 'off';
      this.setStatus({ phase: 'error', message: 'camera' });
      throw err;
    }
    const provider = new MediaPipeProvider();
    provider.setQuality(this.quality);
    this.provider = provider;
    try {
      await provider.init(Math.min(MAX_PLAYERS, this.required + 1), (s) => this.setStatus(s));
    } catch (err) {
      this.setStatus({ phase: 'error', message: 'model' });
      throw err;
    }
    this.configure(this.required);
    this.running = true;
    this.scheduleCamera();
  }

  async startSimulated(): Promise<void> {
    this.stop();
    this.mode = 'simulated';
    const sim = new SimulatedProvider(MAX_PLAYERS);
    this.sim = sim;
    this.provider = sim;
    await sim.init(this.required, (s) => this.setStatus(s));
    this.keyboard = new KeyboardController(sim);
    this.keyboard.humanCount = Math.min(2, this.required);
    this.keyboard.attach();
    this.running = true;
    this.simTimer = setInterval(() => {
      const now = performance.now();
      this.keyboard?.tickBots(now);
      void sim.detect(null, now).then((f) => this.process(f));
    }, 1000 / 30);
  }

  stop(): void {
    this.running = false;
    if (this.simTimer) clearInterval(this.simTimer);
    this.simTimer = null;
    this.keyboard?.detach();
    this.keyboard = null;
    this.provider?.dispose();
    this.provider = null;
    this.sim = null;
    this.camera.stop();
    this.tracker.reset();
    for (let i = 0; i < MAX_PLAYERS; i++) this.resetPlayer(i);
    this.mode = 'off';
    this.inFlight = false;
    this.setStatus({ phase: 'idle' });
  }

  private scheduleCamera(): void {
    if (!this.running || this.mode !== 'camera') return;
    const video = this.camera.video;
    const next = () => this.scheduleCamera();
    if ('requestVideoFrameCallback' in video) {
      video.requestVideoFrameCallback(() => {
        this.tickCamera();
        next();
      });
    } else {
      requestAnimationFrame(() => {
        this.tickCamera();
        next();
      });
    }
  }

  private tickCamera(): void {
    const now = performance.now();
    if (this.inFlight || !this.provider || now - this.lastDetect < this.minInterval) return;
    this.inFlight = true;
    this.lastDetect = now;
    this.provider
      .detect(this.camera.video, now)
      .then((frame) => {
        if (frame && this.running) this.process(frame);
      })
      .catch((err) => console.warn('[tracking] detect failed', err))
      .finally(() => {
        this.inFlight = false;
      });
    if (now - this.lastBrightness > 1000) {
      this.lastBrightness = now;
      this.brightness = this.camera.brightness();
    }
  }

  /** Process one pose frame through identity tracking, calibration and motion recognition. */
  process(frame: PoseFrame): void {
    const now = frame.t;
    if (this.lastProcessed) {
      const fps = 1000 / Math.max(1, now - this.lastProcessed);
      this.perf.trackFps = this.perf.trackFps ? this.perf.trackFps * 0.9 + fps * 0.1 : fps;
    }
    this.perf.inferMs = this.perf.inferMs * 0.9 + frame.inferenceMs * 0.1;
    const dt = this.lastProcessed ? Math.min(0.25, (now - this.lastProcessed) / 1000) : 0.033;
    this.lastProcessed = now;

    this.tracker.update(frame);
    for (let i = 0; i < this.required; i++) {
      const slot = this.tracker.slots[i];
      const p = this.players[i];
      if (!slot.fresh || !slot.pose) {
        if (slot.state === 'lost' || slot.state === 'empty') p.issues = [];
        continue;
      }
      const calib = p.calibration.calibration;
      const events: TimedEvent[] = [];
      const st = p.recognizer.update(slot.pose, calib, events);
      const body = p.recognizer.lastFrame!;
      p.issues = bodyIssues(body, st.energy);
      if (!calib) {
        if (p.calibration.collect(body, st.energy)) p.recognizer.reset();
      } else {
        const active = st.steppedLeft || st.steppedRight || st.squatting || st.airborne || st.ducking;
        p.calibration.adapt(body, st.energy, active, dt);
        for (const e of events) p.queue.push(e);
        if (p.queue.length > 64) p.queue.splice(0, p.queue.length - 64);
      }
      p.prevPose = p.lastPose;
      p.lastPose = slot.pose;
    }
    for (const fn of this.listeners) fn();
  }

  slot(i: number): PlayerSlot {
    return this.tracker.slots[i];
  }

  state(i: number): MotionState {
    return this.players[i].recognizer.state;
  }

  health(i: number): TrackingHealth {
    const slot = this.tracker.slots[i];
    if (slot.state === 'empty' || slot.state === 'lost') return 'lost';
    if (slot.state === 'grace' || slot.quality < 0.55) return 'weak';
    return 'ok';
  }

  /** A player is ready to play when tracked and calibrated. */
  isReady(i: number): boolean {
    return this.health(i) !== 'lost' && this.players[i].calibration.done;
  }

  allReady(): boolean {
    for (let i = 0; i < this.required; i++) if (!this.isReady(i)) return false;
    return true;
  }

  drainEvents(i: number): TimedEvent[] {
    const q = this.players[i].queue;
    if (q.length === 0) return EMPTY;
    const out = q.slice();
    q.length = 0;
    return out;
  }

  clearEvents(): void {
    for (const p of this.players) p.queue.length = 0;
  }

  get sensitivityLevel(): Sensitivity {
    return this.sensitivity;
  }
}

const EMPTY: TimedEvent[] = [];
