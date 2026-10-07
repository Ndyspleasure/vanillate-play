import type { Point } from '../math';

/** Semantic motion events — the only "controller buttons" games ever see. */
export const MOTION_EVENTS = [
  'MOVE_LEFT',
  'MOVE_RIGHT',
  'MOVE_UP',
  'MOVE_DOWN',
  'LEAN_LEFT',
  'LEAN_RIGHT',
  'CENTER',
  'STEP_LEFT',
  'STEP_RIGHT',
  'JUMP',
  'LAND',
  'SQUAT',
  'STAND',
  'DUCK',
  'DODGE_LEFT',
  'DODGE_RIGHT',
  'STILL',
  'MOVE',
  'HAND_LEFT_UP',
  'HAND_RIGHT_UP',
  'HANDS_UP',
  'HANDS_DOWN',
  'PUNCH_LEFT',
  'PUNCH_RIGHT',
  'BLOCK',
  'REACH',
  'POINT',
  'KICK_LEFT',
  'KICK_RIGHT',
  'KNEE_LEFT',
  'KNEE_RIGHT',
  'STEP',
  'FLAP',
  'CLAP',
] as const;

export type MotionEvent = (typeof MOTION_EVENTS)[number];

export interface TimedEvent {
  type: MotionEvent;
  /** Tracking-frame capture time (performance.now domain, ms). */
  t: number;
}

/** Continuous per-player body state, in view space and normalized "torso units". */
export interface MotionState {
  t: number;
  // Key points in view space (x in 0..aspect, y in 0..1)
  nose: Point;
  shoulderC: Point;
  hipC: Point;
  center: Point;
  leftShoulder: Point;
  rightShoulder: Point;
  leftElbow: Point;
  rightElbow: Point;
  leftWrist: Point;
  rightWrist: Point;
  leftHip: Point;
  rightHip: Point;
  leftKnee: Point;
  rightKnee: Point;
  leftAnkle: Point;
  rightAnkle: Point;
  /** Torso length in view units. */
  torso: number;
  // Normalized measures (torso units relative to the calibrated standing baseline)
  offsetX: number;
  rise: number;
  drop: number;
  headDrop: number;
  lean: number;
  leftHandHeight: number;
  rightHandHeight: number;
  leftArmExt: number;
  rightArmExt: number;
  leftKneeHeight: number;
  rightKneeHeight: number;
  /** Whole-body motion energy (torso units / second, smoothed). */
  energy: number;
  /** Body-center velocity in torso units / second. */
  velocity: Point;
  // Flags
  leaningLeft: boolean;
  leaningRight: boolean;
  steppedLeft: boolean;
  steppedRight: boolean;
  airborne: boolean;
  squatting: boolean;
  ducking: boolean;
  leftHandUp: boolean;
  rightHandUp: boolean;
  handsUp: boolean;
  blocking: boolean;
  reachingLeft: boolean;
  reachingRight: boolean;
  kneeUpLeft: boolean;
  kneeUpRight: boolean;
  still: boolean;
  moving: boolean;
  hipsVisible: boolean;
  legsVisible: boolean;
  calibrated: boolean;
  /** Tracking quality 0..1 */
  confidence: number;
}

export type Sensitivity = 'gentle' | 'normal' | 'athletic';

export const SENSITIVITY_FACTOR: Record<Sensitivity, number> = {
  gentle: 0.72,
  normal: 1,
  athletic: 1.25,
};
