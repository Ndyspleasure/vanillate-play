/**
 * Tracking-layer data types. Everything here is provider-agnostic: MediaPipe and the
 * simulated (keyboard) provider both emit the same `PoseFrame` structure.
 */

/** A single landmark. Image landmarks are normalized to the source frame (0..1, unmirrored). */
export interface Landmark {
  x: number;
  y: number;
  z: number;
  /** Visibility / presence likelihood 0..1 */
  v: number;
}

export interface DetectedPose {
  /** 33 landmarks, normalized to the source image (x: 0..1 left→right of the raw camera image). */
  image: Landmark[];
  /** 33 world landmarks in meters, origin between the hips (y down, z towards the camera is negative). */
  world: Landmark[] | null;
}

export interface PoseFrame {
  /** Capture timestamp (performance.now() domain, ms). */
  t: number;
  /** Source frame size in pixels; used for aspect ratio. */
  width: number;
  height: number;
  poses: DetectedPose[];
  /** Time spent on inference for this frame (ms). */
  inferenceMs: number;
}

export type ProviderKind = 'camera' | 'simulated';

export interface ProviderStatus {
  phase: 'idle' | 'loading' | 'ready' | 'error';
  message?: string;
  /** 0..1 loading progress where known. */
  progress?: number;
  /** Which backend actually runs inference (e.g. "GPU · worker"). */
  backend?: string;
}

export interface PoseProvider {
  readonly kind: ProviderKind;
  init(numPoses: number, onStatus?: (s: ProviderStatus) => void): Promise<void>;
  setNumPoses(n: number): void;
  /** Detect poses on the current frame. Resolves `null` if the frame was skipped. */
  detect(source: HTMLVideoElement | null, now: number): Promise<PoseFrame | null>;
  dispose(): void;
}
