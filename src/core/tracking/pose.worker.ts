/// <reference lib="webworker" />
/**
 * Pose inference worker. Keeps MediaPipe off the main thread so rendering stays smooth.
 * Frames arrive as transferred ImageBitmaps; landmarks go back as packed Float32Arrays.
 */
import { FilesetResolver, PoseLandmarker } from '@mediapipe/tasks-vision';
import { packLandmarks, type WorkerRequest, type WorkerResponse } from './protocol';

declare const self: DedicatedWorkerGlobalScope;

let landmarker: PoseLandmarker | null = null;
let lastT = 0;

function post(msg: WorkerResponse, transfer: Transferable[] = []): void {
  self.postMessage(msg, transfer);
}

async function create(
  wasmBase: string,
  model: ArrayBuffer,
  numPoses: number,
  preferGpu: boolean,
): Promise<'GPU' | 'CPU'> {
  const fileset = await FilesetResolver.forVisionTasks(wasmBase, true);
  const delegates: Array<'GPU' | 'CPU'> = preferGpu ? ['GPU', 'CPU'] : ['CPU'];
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
      return delegate;
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

self.onmessage = async (ev: MessageEvent<WorkerRequest>) => {
  const msg = ev.data;
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
        const t = msg.t > lastT ? msg.t : lastT + 1;
        lastT = t;
        const start = performance.now();
        const res = landmarker.detectForVideo(bitmap, t);
        const ms = performance.now() - start;
        const width = bitmap.width;
        const height = bitmap.height;
        bitmap.close();
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
};
