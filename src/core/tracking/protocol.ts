/** Message protocol between the main thread and the pose worker. */

export interface WorkerInit {
  type: 'init';
  wasmBase: string;
  model: ArrayBuffer;
  numPoses: number;
  preferGpu: boolean;
}

export interface WorkerFrame {
  type: 'frame';
  bitmap: ImageBitmap;
  t: number;
}

export interface WorkerOptions {
  type: 'options';
  numPoses: number;
}

export type WorkerRequest = WorkerInit | WorkerFrame | WorkerOptions | { type: 'close' };

export interface WorkerReady {
  type: 'ready';
  delegate: 'GPU' | 'CPU';
}

export interface WorkerResult {
  type: 'result';
  t: number;
  count: number;
  /** count × 33 × 4 (x, y, z, visibility) */
  image: Float32Array;
  /** count × 33 × 4, or empty when unavailable */
  world: Float32Array;
  ms: number;
  width: number;
  height: number;
}

export interface WorkerError {
  type: 'error';
  message: string;
  fatal: boolean;
}

export type WorkerResponse = WorkerReady | WorkerResult | WorkerError;

export const STRIDE = 33 * 4;

interface LmLike {
  x: number;
  y: number;
  z: number;
  visibility?: number;
}

export function packLandmarks(list: LmLike[][]): Float32Array {
  const out = new Float32Array(list.length * STRIDE);
  list.forEach((pose, p) => {
    for (let i = 0; i < 33 && i < pose.length; i++) {
      const o = p * STRIDE + i * 4;
      const l = pose[i];
      out[o] = l.x;
      out[o + 1] = l.y;
      out[o + 2] = l.z;
      out[o + 3] = l.visibility ?? 1;
    }
  });
  return out;
}
