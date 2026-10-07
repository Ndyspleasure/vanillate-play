import { CameraError, CameraManager, CameraStartCancelled } from '../camera/CameraManager';
import { CalibrationTracker, bodyIssues, type BodyIssue } from '../calibration/Calibration';
import { KeyboardController } from '../input/KeyboardController';
import { MotionRecognizer } from '../motion/MotionRecognizer';
import { SENSITIVITY_FACTOR, type MotionState, type Sensitivity, type TimedEvent } from '../motion/types';
import { GRACE_MS, PlayerTracker, type PlayerSlot, type TrackedPose } from '../players/PlayerTracker';
import { MediaPipeProvider, type InputQuality } from '../tracking/MediaPipeProvider';
import { SimulatedProvider } from '../tracking/SimulatedProvider';
import type { PoseFrame, PoseProvider, ProviderStatus } from '../tracking/types';

export type SessionMode = 'off' | 'camera' | 'simulated';
export type TrackingHealth = 'ok' | 'weak' | 'lost';

/** Explicit lifecycle of the long-lived pieces (camera, model, tracking loop). */
export type CameraState = 'off' | 'starting' | 'live' | 'error';
export type ModelState = 'idle' | 'loading' | 'ready' | 'error';
export type TrackingState = 'idle' | 'starting' | 'running' | 'stalled';

export interface SessionLifecycle {
  camera: CameraState;
  model: ModelState;
  tracking: TrackingState;
  /** 0..1 model download/initialization progress. */
  modelProgress: number;
  /** Error detail for the failing piece (camera error code / 'model' / 'camera-ended'). */
  error?: string;
}

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
/** Default number of poses the model is preloaded with (duo + one extra person). */
const PRELOAD_POSES = 3;
/** No processed frame for this long while the camera is on = tracking stalled (self-heals). */
const STALL_MS = 1200;
/** Process a frame at least this often even if the browser doesn't advance video.currentTime. */
const FORCE_FRAME_MS = 120;

/**
 * The long-lived motion session: camera + pose provider + identity tracking + calibration + motion
 * recognition. It survives game changes so rematches and switching games never re-ask for the
 * camera or re-run setup (calibration is kept while the same players stay in frame).
 *
 * The pose model is loaded once per visit (and can be preloaded before the camera is even
 * requested); turning the camera off keeps the model warm, so coming back is instant.
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
  lifecycle: SessionLifecycle = { camera: 'off', model: 'idle', tracking: 'idle', modelProgress: 0 };
  perf: SessionPerf = { trackFps: 0, inferMs: 0 };
  brightness: number | null = null;
  quality: InputQuality = 'balanced';
  /** Minimum ms between pose detections (raised automatically on slow devices). */
  minInterval = 0;
  /** Number of pose frames processed since the camera started (0 = tracking not yet running). */
  framesProcessed = 0;
  private mp: MediaPipeProvider | null = null;
  private modelLoad: Promise<MediaPipeProvider> | null = null;
  private cameraStart: Promise<void> | null = null;
  /** Incremented by stop(): an in-flight camera start notices it was superseded. */
  private startGen = 0;
  private running = false;
  private inFlight = false;
  private inFlightSince = 0;
  private lastProcessed = 0;
  private lastDetect = 0;
  private lastBrightness = 0;
  private lastVideoTime = -1;
  private lastFrameAt = 0;
  private loopGen = 0;
  private loopRaf = 0;
  private watchdog: ReturnType<typeof setInterval> | null = null;
  private simTimer: ReturnType<typeof setInterval> | null = null;
  private listeners = new Set<() => void>();
  private statusListeners = new Set<(s: ProviderStatus) => void>();
  private lifecycleListeners = new Set<(l: SessionLifecycle) => void>();
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
    this.camera.onEnded = () => {
      this.stopLoop();
      this.setLifecycle({ camera: 'error', tracking: 'idle', error: 'camera-ended' });
      this.setStatus({ phase: 'error', message: 'camera-ended' });
    };
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

  onLifecycle(fn: (l: SessionLifecycle) => void): () => void {
    this.lifecycleListeners.add(fn);
    return () => this.lifecycleListeners.delete(fn);
  }

  private setLifecycle(patch: Partial<SessionLifecycle>): void {
    const next = { ...this.lifecycle, ...patch };
    if (!('error' in patch) && next.camera !== 'error' && next.model !== 'error') delete next.error;
    const l = this.lifecycle;
    if (
      l.camera === next.camera &&
      l.model === next.model &&
      l.tracking === next.tracking &&
      Math.abs(l.modelProgress - next.modelProgress) < 0.01 &&
      l.error === next.error
    )
      return;
    this.lifecycle = next;
    for (const fn of this.lifecycleListeners) fn(next);
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
    this.mp?.setQuality(q);
    this.minInterval = q === 'performance' ? 1000 / 20 : 0;
  }

  /** Number of players the current game needs. */
  configure(required: number): void {
    const prev = this.tracker.requiredPlayers;
    this.tracker.setRequired(required);
    if (required !== prev) {
      for (let i = required; i < MAX_PLAYERS; i++) this.resetPlayer(i);
    }
    this.provider?.setNumPoses(this.mode === 'camera' ? this.cameraPoses() : required);
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

  /**
   * Download and initialize the pose model without touching the camera. Safe to call repeatedly
   * (e.g. when a game page opens) — the model is only ever loaded once per visit.
   */
  preload(): Promise<MediaPipeProvider> {
    if (this.mp?.ready) return Promise.resolve(this.mp);
    if (this.modelLoad) return this.modelLoad;
    const provider = new MediaPipeProvider();
    provider.setQuality(this.quality);
    provider.onRecover = () => console.warn('[tracking] pose engine restarted');
    provider.onFatal = () => {
      // The model keeps failing on this device: surface it instead of silently not tracking.
      if (this.mp === provider) this.mp = null;
      this.stopLoop();
      this.setLifecycle({ model: 'error', tracking: 'idle', error: 'model' });
      this.setStatus({ phase: 'error', message: 'model' });
    };
    this.setLifecycle({ model: 'loading', modelProgress: 0 });
    const poses = this.mode === 'camera' ? this.cameraPoses() : PRELOAD_POSES;
    this.modelLoad = provider
      .init(poses, (st) => {
        if (st.phase === 'loading') this.setLifecycle({ modelProgress: st.progress ?? this.lifecycle.modelProgress });
        if (this.mode === 'camera') this.setStatus(st);
      })
      .then(() => {
        this.mp = provider;
        this.setLifecycle({ model: 'ready', modelProgress: 1 });
        return provider;
      })
      .catch((err: unknown) => {
        provider.dispose();
        this.setLifecycle({ model: 'error', error: 'model' });
        throw err;
      })
      .finally(() => {
        this.modelLoad = null;
      });
    return this.modelLoad;
  }

  /**
   * Turn on camera tracking. Idempotent and race-free: concurrent calls share one start, a live
   * camera stream and the loaded model are reused, and exactly one tracking loop ever runs.
   * The camera permission prompt and the model download happen in parallel.
   */
  startCamera(): Promise<void> {
    if (this.cameraStart) return this.cameraStart;
    if (this.mode === 'camera' && this.camera.active && this.mp?.ready && this.running) {
      void this.camera.ensurePlaying();
      return Promise.resolve();
    }
    const start: Promise<void> = this.doStartCamera().finally(() => {
      if (this.cameraStart === start) this.cameraStart = null;
    });
    this.cameraStart = start;
    return start;
  }

  private async doStartCamera(): Promise<void> {
    if (this.mode === 'simulated') this.stop();
    const gen = ++this.startGen;
    const cancelled = () => gen !== this.startGen;
    this.mode = 'camera';
    this.setLifecycle({ camera: 'starting', tracking: 'idle' });
    this.setStatus({ phase: 'loading', message: 'Starting camera', progress: 0 });
    const model = this.preload();
    model.catch(() => {
      /* reported below */
    });
    try {
      await this.camera.start();
    } catch (err) {
      if (cancelled() || err instanceof CameraStartCancelled) throw new CameraStartCancelled();
      this.mode = 'off';
      this.setLifecycle({ camera: 'error', error: err instanceof CameraError ? err.code : 'unknown' });
      this.setStatus({ phase: 'error', message: 'camera' });
      throw err;
    }
    if (cancelled()) throw new CameraStartCancelled();
    this.setLifecycle({ camera: 'live' });
    let provider: MediaPipeProvider;
    try {
      if (!this.mp?.ready) this.setStatus({ phase: 'loading', message: 'Downloading motion model', progress: this.lifecycle.modelProgress });
      provider = await model;
    } catch (err) {
      if (cancelled()) throw new CameraStartCancelled();
      this.camera.stop();
      this.mode = 'off';
      this.setLifecycle({ camera: 'off' });
      this.setStatus({ phase: 'error', message: 'model' });
      throw err;
    }
    if (cancelled() || this.mode !== 'camera') throw new CameraStartCancelled();
    provider.setQuality(this.quality);
    this.provider = provider;
    this.configure(this.required);
    this.setStatus({ phase: 'ready', backend: provider.backend, progress: 1 });
    this.startLoop();
  }

  /** Resolves once the tracking loop has processed its first frame (or after `timeoutMs`). */
  waitForTracking(timeoutMs = 4000): Promise<boolean> {
    if (this.framesProcessed > 0) return Promise.resolve(true);
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        off();
        resolve(this.framesProcessed > 0);
      }, timeoutMs);
      const off = this.onFrame(() => {
        clearTimeout(timer);
        off();
        resolve(true);
      });
    });
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
    this.setLifecycle({ tracking: 'running' });
    this.simTimer = setInterval(() => {
      const now = performance.now();
      this.keyboard?.tickBots(now);
      void sim.detect(null, now).then((f) => this.process(f));
    }, 1000 / 30);
  }

  /**
   * Turn the camera (or keyboard simulation) off and forget the players. The pose model stays
   * loaded so the next start is instant.
   */
  stop(): void {
    this.startGen++;
    this.cameraStart = null;
    this.stopLoop();
    if (this.simTimer) clearInterval(this.simTimer);
    this.simTimer = null;
    this.keyboard?.detach();
    this.keyboard = null;
    if (this.sim) this.sim.dispose();
    this.sim = null;
    this.provider = null;
    this.camera.stop();
    this.tracker.reset();
    for (let i = 0; i < MAX_PLAYERS; i++) this.resetPlayer(i);
    this.mode = 'off';
    this.framesProcessed = 0;
    this.lastProcessed = 0;
    this.perf = { trackFps: 0, inferMs: 0 };
    this.setLifecycle({ camera: 'off', tracking: 'idle' });
    this.setStatus({ phase: 'idle' });
  }

  /** Release everything including the pose model (page teardown / tests). */
  dispose(): void {
    this.stop();
    this.mp?.dispose();
    this.mp = null;
    this.setLifecycle({ model: 'idle', modelProgress: 0 });
  }

  /**
   * Prepare for a new match with the same players: drop queued events and transient motion latches
   * but keep identities and calibration (no re-setup on rematch).
   */
  resetMatch(): void {
    for (const p of this.players) {
      p.queue.length = 0;
      p.recognizer.reset();
    }
  }

  private cameraPoses(): number {
    const required = this.required;
    return Math.min(MAX_PLAYERS, required + (required <= 2 ? 1 : 0));
  }

  // ── Tracking loop ──────────────────────────────────────
  // One requestAnimationFrame loop guarded by a generation counter, so a restart can never leave a
  // second loop running. New camera frames are detected via video.currentTime; a watchdog restarts
  // playback/inference if frames stop arriving (e.g. the video element was paused by the browser).

  private startLoop(): void {
    this.stopLoop();
    this.running = true;
    this.inFlight = false;
    this.lastVideoTime = -1;
    this.lastFrameAt = performance.now();
    this.setLifecycle({ tracking: this.framesProcessed > 0 ? 'running' : 'starting' });
    const gen = this.loopGen;
    const tick = () => {
      if (gen !== this.loopGen || !this.running) return;
      this.loopRaf = requestAnimationFrame(tick);
      this.tickCamera();
    };
    this.loopRaf = requestAnimationFrame(tick);
    this.watchdog = setInterval(() => this.checkStall(), 400);
  }

  private stopLoop(): void {
    this.loopGen++;
    this.running = false;
    cancelAnimationFrame(this.loopRaf);
    if (this.watchdog) clearInterval(this.watchdog);
    this.watchdog = null;
    this.inFlight = false;
  }

  private checkStall(): void {
    if (!this.running || this.mode !== 'camera') return;
    const now = performance.now();
    // Background tabs throttle rAF: that is not a stall.
    if (typeof document !== 'undefined' && document.hidden) {
      this.lastFrameAt = now;
      return;
    }
    if (this.inFlight && now - this.inFlightSince > STALL_MS * 2) this.inFlight = false;
    if (now - this.lastFrameAt > STALL_MS) {
      if (this.lifecycle.tracking !== 'stalled') console.warn('[tracking] no frames — resuming camera');
      this.setLifecycle({ tracking: 'stalled' });
      void this.camera.ensurePlaying();
      // Also restart the loop itself in case the rAF chain was lost.
      if (now - this.lastFrameAt > STALL_MS * 2) {
        this.lastFrameAt = now;
        this.startLoop();
      }
    }
  }

  private tickCamera(): void {
    const now = performance.now();
    const video = this.camera.video;
    if (video.paused || video.readyState < 2) {
      void this.camera.ensurePlaying();
      return;
    }
    if (this.inFlight || !this.provider || now - this.lastDetect < this.minInterval) return;
    // Only run inference on new camera frames (the render loop is usually faster than the camera).
    if (video.currentTime === this.lastVideoTime && now - this.lastDetect < FORCE_FRAME_MS) return;
    this.lastVideoTime = video.currentTime;
    this.inFlight = true;
    this.inFlightSince = now;
    this.lastDetect = now;
    const gen = this.loopGen;
    this.provider
      .detect(video, now)
      .then((frame) => {
        if (frame && this.running && gen === this.loopGen) this.process(frame);
      })
      .catch((err) => console.warn('[tracking] detect failed', err))
      .finally(() => {
        if (gen === this.loopGen) this.inFlight = false;
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
    this.lastFrameAt = performance.now();
    this.framesProcessed++;
    if (this.lifecycle.tracking !== 'running') this.setLifecycle({ tracking: 'running' });

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
    // No frames for longer than the grace period means we know nothing about anyone: never report
    // a frozen pose as a present player (the watchdog is meanwhile restarting the camera/loop).
    if (this.running && this.mode === 'camera' && performance.now() - this.lastFrameAt > GRACE_MS) return 'lost';
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
