import type { PoseLandmarker } from '@mediapipe/tasks-vision';
import type { DetectedPose, Landmark, PoseFrame, PoseProvider, ProviderStatus } from './types';
import { STRIDE, packLandmarks, type WorkerResponse, type WorkerResult } from './protocol';

export const MODEL_URL = '/models/pose_landmarker_lite.task';
export const WASM_BASE = '/mediapipe/wasm';

export type InputQuality = 'performance' | 'balanced' | 'quality';

const INPUT_WIDTH: Record<InputQuality, number> = {
  performance: 480,
  balanced: 640,
  quality: 960,
};

/** Downloads a file with progress reporting. */
async function fetchWithProgress(url: string, onProgress: (loaded: number, total: number) => void): Promise<ArrayBuffer> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to download ${url} (${res.status})`);
  const total = Number(res.headers.get('content-length')) || 0;
  if (!res.body) {
    const buf = await res.arrayBuffer();
    onProgress(buf.byteLength, buf.byteLength);
    return buf;
  }
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let loaded = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    loaded += value.byteLength;
    onProgress(loaded, total);
  }
  const out = new Uint8Array(loaded);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.byteLength;
  }
  return out.buffer;
}

/** Approximate download sizes, used until the server reports Content-Length. */
const MODEL_BYTES = 5_800_000;
const WASM_BYTES = 11_800_000;

type Progress = (loaded: number, total: number) => void;

/**
 * Tracking assets are downloaded at most once per page visit: the model bytes stay in memory so a
 * worker restart (or a second provider) never downloads them again. The service worker additionally
 * keeps both files in Cache Storage across visits.
 */
const downloads = new Map<string, { promise: Promise<ArrayBuffer>; listeners: Set<Progress>; last: [number, number] }>();

function download(url: string, onProgress: Progress, required = true): Promise<ArrayBuffer | null> {
  let entry = downloads.get(url);
  if (!entry) {
    const listeners = new Set<Progress>();
    const created = {
      listeners,
      last: [0, 0] as [number, number],
      promise: fetchWithProgress(url, (l, t) => {
        created.last = [l, t];
        for (const fn of listeners) fn(l, t);
      }),
    };
    entry = created;
    downloads.set(url, entry);
    created.promise.catch(() => downloads.delete(url));
  }
  const e = entry;
  e.listeners.add(onProgress);
  if (e.last[0]) onProgress(e.last[0], e.last[1]);
  const p = e.promise.finally(() => e.listeners.delete(onProgress));
  return required ? p : p.catch(() => null);
}

function unpack(image: Float32Array, world: Float32Array, count: number): DetectedPose[] {
  const poses: DetectedPose[] = [];
  for (let p = 0; p < count; p++) {
    const img: Landmark[] = new Array(33);
    const wld: Landmark[] | null = world.length >= (p + 1) * STRIDE ? new Array(33) : null;
    for (let i = 0; i < 33; i++) {
      const o = p * STRIDE + i * 4;
      img[i] = { x: image[o], y: image[o + 1], z: image[o + 2], v: image[o + 3] };
      if (wld) wld[i] = { x: world[o], y: world[o + 1], z: world[o + 2], v: image[o + 3] };
    }
    poses.push({ image: img, world: wld });
  }
  return poses;
}

/**
 * No answer from the worker for this long = it hung (or crashed silently): rebuild it. Generous on
 * purpose — slow devices legitimately take a few hundred ms per frame.
 */
const HANG_MS = 5000;
/** Consecutive failed inferences after which the inference backend is rebuilt. */
const MAX_FAILURES = 5;
/** Give up rebuilding after this many restarts (the device can't run the model reliably). */
const MAX_RECOVERIES = 3;

/**
 * Camera pose provider backed by MediaPipe Pose Landmarker. Prefers a module Web Worker with the GPU
 * delegate, and falls back to main-thread inference and/or CPU when the browser can't do that.
 *
 * The provider is long-lived: it is created once per visit and survives camera restarts, rematches
 * and game changes. A worker that hangs or crashes is rebuilt automatically from the cached model.
 */
export class MediaPipeProvider implements PoseProvider {
  readonly kind = 'camera' as const;
  private worker: Worker | null = null;
  private main: PoseLandmarker | null = null;
  private model: ArrayBuffer | null = null;
  private busy = false;
  private pending: ((r: WorkerResult | null) => void) | null = null;
  private numPoses = 2;
  private lastT = 0;
  private inputWidth = INPUT_WIDTH.balanced;
  private canResize = true;
  private failures = 0;
  private recoveries = 0;
  private recovering: Promise<void> | null = null;
  private disposed = false;
  backend = '';
  ready = false;
  /** Called when the provider rebuilds its worker after a failure (for diagnostics/UI). */
  onRecover: (() => void) | null = null;
  /** Called when the provider gave up: pose tracking can't run reliably on this device. */
  onFatal: (() => void) | null = null;

  setQuality(q: InputQuality): void {
    this.inputWidth = INPUT_WIDTH[q];
  }

  async init(numPoses: number, onStatus?: (s: ProviderStatus) => void): Promise<void> {
    this.numPoses = numPoses;
    const report = (s: ProviderStatus) => onStatus?.(s);
    report({ phase: 'loading', message: 'Downloading motion model', progress: 0 });

    // The model (~5.7 MB) is fetched here so we can show progress; the WASM runtime is warmed in parallel.
    const sizes = { model: [0, MODEL_BYTES], wasm: [0, WASM_BYTES] };
    const update = () => {
      const loaded = sizes.model[0] + sizes.wasm[0];
      const total = sizes.model[1] + sizes.wasm[1];
      report({ phase: 'loading', message: 'Downloading motion model', progress: Math.min(0.95, loaded / total) });
    };
    const useWorker = typeof Worker !== 'undefined' && typeof OffscreenCanvas !== 'undefined' && 'createImageBitmap' in window;
    const wasmFile = useWorker ? 'vision_wasm_module_internal.wasm' : 'vision_wasm_internal.wasm';
    const [model] = await Promise.all([
      download(MODEL_URL, (l, t) => {
        sizes.model = [l, t || sizes.model[1]];
        update();
      }) as Promise<ArrayBuffer>,
      download(
        `${WASM_BASE}/${wasmFile}`,
        (l, t) => {
          sizes.wasm = [l, t || sizes.wasm[1]];
          update();
        },
        false,
      ),
    ]);
    this.model = model;

    report({ phase: 'loading', message: 'Starting motion engine', progress: 0.97 });
    if (useWorker) {
      try {
        const delegate = await this.initWorker(model, numPoses);
        this.backend = `${delegate} · worker`;
        this.ready = true;
        report({ phase: 'ready', backend: this.backend, progress: 1 });
        return;
      } catch (err) {
        console.warn('[tracking] worker init failed, falling back to main thread', err);
        this.killWorker();
      }
    }
    const delegate = await this.initMain(model, numPoses);
    this.backend = `${delegate} · main`;
    this.ready = true;
    report({ phase: 'ready', backend: this.backend, progress: 1 });
  }

  private initWorker(model: ArrayBuffer, numPoses: number): Promise<'GPU' | 'CPU'> {
    const worker = new Worker(new URL('./pose.worker.ts', import.meta.url), { type: 'module', name: 'pose' });
    this.worker = worker;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Pose worker timed out')), 45_000);
      worker.onerror = (e) => {
        clearTimeout(timer);
        reject(new Error(e.message || 'Pose worker failed to load'));
      };
      worker.onmessage = (ev: MessageEvent<WorkerResponse>) => {
        const msg = ev.data;
        if (msg.type === 'ready') {
          clearTimeout(timer);
          worker.onmessage = (e: MessageEvent<WorkerResponse>) => this.onWorkerMessage(e.data);
          // A crash after start-up must not leave a detection waiting forever.
          worker.onerror = (e) => {
            e.preventDefault();
            console.warn('[tracking] worker crashed', e.message);
            this.settle(null);
            void this.recover();
          };
          resolve(msg.delegate);
        } else if (msg.type === 'error') {
          clearTimeout(timer);
          reject(new Error(msg.message));
        }
      };
      worker.postMessage({
        type: 'init',
        wasmBase: new URL(WASM_BASE, location.href).href,
        model: model.slice(0),
        numPoses,
        preferGpu: true,
      });
    });
  }

  private settle(r: WorkerResult | null): void {
    const fn = this.pending;
    this.pending = null;
    fn?.(r);
  }

  private onWorkerMessage(msg: WorkerResponse): void {
    if (msg.type === 'result') {
      this.settle(msg);
    } else if (msg.type === 'error') {
      console.warn('[tracking] worker error', msg.message);
      this.settle(null);
    }
  }

  private async initMain(model: ArrayBuffer, numPoses: number): Promise<'GPU' | 'CPU'> {
    const { FilesetResolver, PoseLandmarker } = await import('@mediapipe/tasks-vision');
    const fileset = await FilesetResolver.forVisionTasks(new URL(WASM_BASE, location.href).href, false);
    let lastErr: unknown;
    for (const delegate of ['GPU', 'CPU'] as const) {
      try {
        this.main = await PoseLandmarker.createFromOptions(fileset, {
          baseOptions: { modelAssetBuffer: new Uint8Array(model.slice(0)), delegate },
          runningMode: 'VIDEO',
          numPoses,
          minPoseDetectionConfidence: 0.5,
          minPosePresenceConfidence: 0.5,
          minTrackingConfidence: 0.5,
        });
        try {
          // Warm-up inference so the first real frame isn't slowed by shader compilation.
          const c = document.createElement('canvas');
          c.width = c.height = 256;
          this.main.detectForVideo(c, this.nextT(1));
        } catch {
          /* best effort */
        }
        return delegate;
      } catch (err) {
        lastErr = err;
      }
    }
    throw lastErr instanceof Error ? lastErr : new Error('Could not start pose tracking');
  }

  /** Rebuild the inference backend from the cached model (after a hang or crash). */
  private recover(): Promise<void> {
    if (this.recovering || this.disposed || !this.model) return this.recovering ?? Promise.resolve();
    if (++this.recoveries > MAX_RECOVERIES) {
      this.ready = false;
      this.killWorker();
      this.onFatal?.();
      return Promise.resolve();
    }
    const model = this.model;
    this.recovering = (async () => {
      console.warn('[tracking] restarting pose engine');
      this.onRecover?.();
      const hadWorker = !!this.worker;
      this.killWorker();
      try {
        if (hadWorker) {
          const delegate = await this.initWorker(model, this.numPoses);
          this.backend = `${delegate} · worker`;
        } else {
          this.main?.close();
          this.main = null;
          const delegate = await this.initMain(model, this.numPoses);
          this.backend = `${delegate} · main`;
        }
        if (this.disposed) this.killWorker();
      } catch (err) {
        console.warn('[tracking] recovery failed', err);
        this.killWorker();
        if (!this.main) {
          try {
            this.backend = `${await this.initMain(model, this.numPoses)} · main`;
          } catch {
            this.ready = false;
          }
        }
      } finally {
        this.failures = 0;
        this.recovering = null;
      }
    })();
    return this.recovering;
  }

  private killWorker(): void {
    const worker = this.worker;
    this.worker = null;
    this.settle(null);
    if (worker) {
      worker.onmessage = null;
      worker.onerror = null;
      worker.terminate();
    }
  }

  private nextT(now: number): number {
    this.lastT = now > this.lastT ? now : this.lastT + 1;
    return this.lastT;
  }

  setNumPoses(n: number): void {
    if (n === this.numPoses) return;
    this.numPoses = n;
    this.worker?.postMessage({ type: 'options', numPoses: n });
    void this.main?.setOptions({ numPoses: n });
  }

  private noteResult(ok: boolean): void {
    if (ok) {
      this.failures = 0;
      return;
    }
    if (this.recovering) return;
    if (++this.failures >= MAX_FAILURES) void this.recover();
  }

  async detect(video: HTMLVideoElement | null, now: number): Promise<PoseFrame | null> {
    if (!video || this.busy || this.recovering || video.readyState < 2 || video.videoWidth === 0) return null;
    this.busy = true;
    try {
      const t = this.nextT(now);
      if (this.worker) {
        const worker = this.worker;
        const vw = video.videoWidth;
        const vh = video.videoHeight;
        const w = Math.min(this.inputWidth, vw);
        const h = Math.round((w / vw) * vh);
        let bitmap: ImageBitmap;
        try {
          bitmap = this.canResize
            ? await createImageBitmap(video, { resizeWidth: w, resizeHeight: h, resizeQuality: 'low' })
            : await createImageBitmap(video);
        } catch {
          this.canResize = false;
          bitmap = await createImageBitmap(video);
        }
        if (worker !== this.worker) {
          bitmap.close();
          return null;
        }
        const result = await new Promise<WorkerResult | null>((resolve) => {
          const timer = setTimeout(() => {
            if (this.pending !== done) return;
            this.pending = null;
            resolve(null);
            console.warn('[tracking] pose worker stopped answering');
            void this.recover();
          }, HANG_MS);
          const done = (r: WorkerResult | null) => {
            clearTimeout(timer);
            resolve(r);
          };
          this.settle(null);
          this.pending = done;
          worker.postMessage({ type: 'frame', bitmap, t }, [bitmap]);
        });
        this.noteResult(!!result);
        if (!result) return null;
        return {
          t,
          width: result.width,
          height: result.height,
          poses: unpack(result.image, result.world, result.count),
          inferenceMs: result.ms,
        };
      }
      if (this.main) {
        const start = performance.now();
        const res = this.main.detectForVideo(video, t);
        const ms = performance.now() - start;
        const image = packLandmarks(res.landmarks);
        const world = packLandmarks(res.worldLandmarks);
        this.noteResult(true);
        return {
          t,
          width: video.videoWidth,
          height: video.videoHeight,
          poses: unpack(image, world, res.landmarks.length),
          inferenceMs: ms,
        };
      }
      return null;
    } catch (err) {
      this.noteResult(false);
      throw err;
    } finally {
      this.busy = false;
    }
  }

  dispose(): void {
    this.disposed = true;
    this.ready = false;
    this.settle(null);
    const worker = this.worker;
    this.worker = null;
    if (worker) {
      worker.onerror = null;
      worker.postMessage({ type: 'close' });
      setTimeout(() => worker.terminate(), 500);
    }
    this.main?.close();
    this.main = null;
  }
}
