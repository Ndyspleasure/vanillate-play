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
 * Camera pose provider backed by MediaPipe Pose Landmarker. Prefers a module Web Worker with the GPU
 * delegate, and falls back to main-thread inference and/or CPU when the browser can't do that.
 */
export class MediaPipeProvider implements PoseProvider {
  readonly kind = 'camera' as const;
  private worker: Worker | null = null;
  private main: PoseLandmarker | null = null;
  private busy = false;
  private pending: ((r: WorkerResult | null) => void) | null = null;
  private numPoses = 2;
  private lastT = 0;
  private inputWidth = INPUT_WIDTH.balanced;
  private canResize = true;
  backend = '';

  setQuality(q: InputQuality): void {
    this.inputWidth = INPUT_WIDTH[q];
  }

  async init(numPoses: number, onStatus?: (s: ProviderStatus) => void): Promise<void> {
    this.numPoses = numPoses;
    const report = (s: ProviderStatus) => onStatus?.(s);
    report({ phase: 'loading', message: 'Downloading motion model', progress: 0 });

    // The model (~5.7 MB) is fetched here so we can show progress; the WASM runtime is warmed in parallel.
    const sizes = { model: [0, 5_800_000], wasm: [0, 11_800_000] };
    const update = () => {
      const loaded = sizes.model[0] + sizes.wasm[0];
      const total = sizes.model[1] + sizes.wasm[1];
      report({ phase: 'loading', message: 'Downloading motion model', progress: Math.min(0.95, loaded / total) });
    };
    const useWorker = typeof Worker !== 'undefined' && typeof OffscreenCanvas !== 'undefined' && 'createImageBitmap' in window;
    const wasmFile = useWorker ? 'vision_wasm_module_internal.wasm' : 'vision_wasm_internal.wasm';
    const [model] = await Promise.all([
      fetchWithProgress(MODEL_URL, (l, t) => {
        sizes.model = [l, t || sizes.model[1]];
        update();
      }),
      fetchWithProgress(`${WASM_BASE}/${wasmFile}`, (l, t) => {
        sizes.wasm = [l, t || sizes.wasm[1]];
        update();
      }).catch(() => null),
    ]);

    report({ phase: 'loading', message: 'Starting motion engine', progress: 0.97 });
    if (useWorker) {
      try {
        const delegate = await this.initWorker(model, numPoses);
        this.backend = `${delegate} · worker`;
        report({ phase: 'ready', backend: this.backend, progress: 1 });
        return;
      } catch (err) {
        console.warn('[tracking] worker init failed, falling back to main thread', err);
        this.worker?.terminate();
        this.worker = null;
      }
    }
    const delegate = await this.initMain(model, numPoses);
    this.backend = `${delegate} · main`;
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
          resolve(msg.delegate);
        } else if (msg.type === 'error') {
          clearTimeout(timer);
          reject(new Error(msg.message));
        }
      };
      worker.postMessage({
        type: 'init',
        wasmBase: new URL(WASM_BASE, location.href).href,
        model,
        numPoses,
        preferGpu: true,
      });
    });
  }

  private onWorkerMessage(msg: WorkerResponse): void {
    if (msg.type === 'result') {
      this.pending?.(msg);
      this.pending = null;
    } else if (msg.type === 'error') {
      console.warn('[tracking] worker error', msg.message);
      this.pending?.(null);
      this.pending = null;
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
        return delegate;
      } catch (err) {
        lastErr = err;
      }
    }
    throw lastErr instanceof Error ? lastErr : new Error('Could not start pose tracking');
  }

  setNumPoses(n: number): void {
    if (n === this.numPoses) return;
    this.numPoses = n;
    this.worker?.postMessage({ type: 'options', numPoses: n });
    void this.main?.setOptions({ numPoses: n });
  }

  async detect(video: HTMLVideoElement | null, now: number): Promise<PoseFrame | null> {
    if (!video || this.busy || video.readyState < 2 || video.videoWidth === 0) return null;
    this.busy = true;
    try {
      const t = now > this.lastT ? now : this.lastT + 1;
      this.lastT = t;
      if (this.worker) {
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
        const result = await new Promise<WorkerResult | null>((resolve) => {
          this.pending = resolve;
          this.worker!.postMessage({ type: 'frame', bitmap, t }, [bitmap]);
        });
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
        return {
          t,
          width: video.videoWidth,
          height: video.videoHeight,
          poses: unpack(image, world, res.landmarks.length),
          inferenceMs: ms,
        };
      }
      return null;
    } finally {
      this.busy = false;
    }
  }

  dispose(): void {
    this.pending?.(null);
    this.pending = null;
    const worker = this.worker;
    this.worker = null;
    if (worker) {
      worker.postMessage({ type: 'close' });
      setTimeout(() => worker.terminate(), 500);
    }
    this.main?.close();
    this.main = null;
  }
}
