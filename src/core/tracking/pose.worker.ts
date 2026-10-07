/// <reference lib="webworker" />
/**
 * Pose inference worker. Keeps MediaPipe off the main thread so rendering stays smooth.
 * Frames arrive as transferred ImageBitmaps; landmarks go back as packed Float32Arrays.
 * Messages are handled strictly one at a time so option changes never overlap an inference.
 */
import { FilesetResolver, PoseLandmarker } from '@mediapipe/tasks-vision';
import { packLandmarks, type WorkerRequest, type WorkerResponse } from './protocol';

declare const self: DedicatedWorkerGlobalScope;

// MediaPipe's WASM runtime writes informational logs (e.g. "INFO: Created TensorFlow Lite XNNPACK
// delegate") to stderr, which surfaces as console.error. Keep those out of the error console.
const consoleError = console.error.bind(console);
console.error = (...args: unknown[]) => {
  if (typeof args[0] === 'string' && /^(INFO:|[IW]\d{4} )/.test(args[0])) console.debug(...args);
  else consoleError(...args);
};

let landmarker: PoseLandmarker | null = null;
let lastT = 0;
let queue: Promise<void> = Promise.resolve();

function post(msg: WorkerResponse, transfer: Transferable[] = []): void {
  self.postMessage(msg, transfer);
}

function nextT(t: number): number {
  lastT = t > lastT ? t : lastT + 1;
  return lastT;
}

/**
 * MediaPipe's GPU delegate on a software WebGL renderer (SwiftShader / llvmpipe, used when the real
 * GPU is blocklisted) is many times slower than the CPU delegate — prefer CPU there.
 */
function softwareGl(): boolean {
  try {
    const gl = new OffscreenCanvas(1, 1).getContext('webgl2') ?? new OffscreenCanvas(1, 1).getContext('webgl');
    if (!gl) return true;
    const info = gl.getExtension('WEBGL_debug_renderer_info');
    const renderer = String(gl.getParameter(info ? info.UNMASKED_RENDERER_WEBGL : gl.RENDERER));
    return /swiftshader|llvmpipe|software|basic render/i.test(renderer);
  } catch {
    return false;
  }
}

async function create(
  wasmBase: string,
  model: ArrayBuffer,
  numPoses: number,
  preferGpu: boolean,
): Promise<'GPU' | 'CPU'> {
  const fileset = await FilesetResolver.forVisionTasks(wasmBase, true);
  const delegates: Array<'GPU' | 'CPU'> = preferGpu && !softwareGl() ? ['GPU', 'CPU'] : ['CPU'];
  let lastError: unknown = null;
  for (const delegate of delegates) {
    try {
      landmarker = await PoseLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetBuffer: new Uint8Array(model.slice(0)), delegate },
        runningMode: 'VIDEO',
        numPoses,
        minPoseDetectionConfidence: 0.5,
        minPosePresenceConfidence: 0.5,
        minTrackingConfidence: 0.5,
      });
      warmUp();
      return delegate;
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

/** Run one inference on a blank frame so shaders/kernels are compiled before the first real frame. */
function warmUp(): void {
  if (!landmarker || typeof OffscreenCanvas === 'undefined') return;
  try {
    const c = new OffscreenCanvas(256, 256);
    c.getContext('2d')?.fillRect(0, 0, 256, 256);
    landmarker.detectForVideo(c, nextT(1));
  } catch {
    /* warm-up is best effort */
  }
}

async function handle(msg: WorkerRequest): Promise<void> {
  try {
    switch (msg.type) {
      case 'init': {
        const delegate = await create(msg.wasmBase, msg.model, msg.numPoses, msg.preferGpu);
        post({ type: 'ready', delegate });
        break;
      }
      case 'options':
        await landmarker?.setOptions({ numPoses: msg.numPoses });
        break;
      case 'frame': {
        const { bitmap } = msg;
        if (!landmarker) {
          bitmap.close();
          post({ type: 'error', message: 'Pose model not ready', fatal: false });
          return;
        }
        const t = nextT(msg.t);
        const { width, height } = bitmap;
        const start = performance.now();
        let res;
        try {
          res = landmarker.detectForVideo(bitmap, t);
        } finally {
          bitmap.close();
        }
        const ms = performance.now() - start;
        const image = packLandmarks(res.landmarks);
        const world = packLandmarks(res.worldLandmarks);
        post(
          { type: 'result', t: msg.t, count: res.landmarks.length, image, world, ms, width, height },
          [image.buffer, world.buffer],
        );
        break;
      }
      case 'close':
        landmarker?.close();
        landmarker = null;
        self.close();
        break;
    }
  } catch (err) {
    post({ type: 'error', message: err instanceof Error ? err.message : String(err), fatal: msg.type === 'init' });
  }
}

self.onmessage = (ev: MessageEvent<WorkerRequest>) => {
  const msg = ev.data;
  queue = queue.then(() => handle(msg));
};
