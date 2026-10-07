import { angleDeg, angleDiff, clamp01, type Point } from '../math';
import type { MotionState } from './types';

/**
 * Pose representation for matching: 2D direction (degrees, 0 = screen right, 90 = up) of each limb
 * segment in the mirrored view. Directions are scale- and position-invariant, so two people of
 * different heights standing anywhere in frame can be compared fairly.
 */
export const SEGMENTS = ['lUpper', 'lFore', 'rUpper', 'rFore', 'lThigh', 'lShin', 'rThigh', 'rShin', 'torso'] as const;
export type Segment = (typeof SEGMENTS)[number];

export interface PoseVector {
  angles: Record<Segment, number>;
  legs: boolean;
}

export type PoseCheck = 'squat' | 'kneeLeft' | 'kneeRight' | 'airborne' | 'handsUp';

export interface PoseDef {
  id: string;
  name: string;
  emoji: string;
  angles: Partial<Record<Segment, number>>;
  /** Extra state requirements angles can't express (e.g. knee lifted towards the camera). */
  checks?: PoseCheck[];
}

export function poseVector(s: MotionState): PoseVector {
  return {
    angles: {
      lUpper: angleDeg(s.leftShoulder, s.leftElbow),
      lFore: angleDeg(s.leftElbow, s.leftWrist),
      rUpper: angleDeg(s.rightShoulder, s.rightElbow),
      rFore: angleDeg(s.rightElbow, s.rightWrist),
      lThigh: angleDeg(s.leftHip, s.leftKnee),
      lShin: angleDeg(s.leftKnee, s.leftAnkle),
      rThigh: angleDeg(s.rightHip, s.rightKnee),
      rShin: angleDeg(s.rightKnee, s.rightAnkle),
      torso: angleDeg(s.hipC, s.shoulderC),
    },
    legs: s.legsVisible,
  };
}

const WEIGHT: Record<Segment, number> = {
  lUpper: 1,
  lFore: 0.8,
  rUpper: 1,
  rFore: 0.8,
  lThigh: 0.6,
  lShin: 0.4,
  rThigh: 0.6,
  rShin: 0.4,
  torso: 0.9,
};

const LEG_SEGMENTS: ReadonlySet<Segment> = new Set(['lThigh', 'lShin', 'rThigh', 'rShin']);

/** Map an angle error to 0..1: full marks within 15°, zero at 70°. */
export const segmentScore = (diff: number): number => clamp01(1 - Math.max(0, diff - 15) / 55);

function checkOk(c: PoseCheck, s: MotionState): boolean {
  switch (c) {
    case 'squat':
      return s.squatting || s.drop > 0.22;
    case 'kneeLeft':
      return s.kneeUpLeft;
    case 'kneeRight':
      return s.kneeUpRight;
    case 'airborne':
      return s.airborne;
    case 'handsUp':
      return s.handsUp;
  }
}

/** Similarity 0..1 of a player's pose to a target pose definition. */
export function matchPose(def: PoseDef, s: MotionState, v: PoseVector = poseVector(s)): number {
  let sum = 0;
  let wsum = 0;
  for (const seg of SEGMENTS) {
    const target = def.angles[seg];
    if (target === undefined) continue;
    if (LEG_SEGMENTS.has(seg) && !v.legs) continue;
    const w = WEIGHT[seg];
    sum += w * segmentScore(angleDiff(target, v.angles[seg]));
    wsum += w;
  }
  let score = wsum > 0 ? sum / wsum : 1;
  if (def.checks?.length) {
    const ok = def.checks.filter((c) => checkOk(c, s)).length / def.checks.length;
    score = wsum > 0 ? score * (0.15 + 0.85 * ok) : ok;
  }
  return score;
}

/** Similarity 0..1 between two players' poses (same anatomical sides, like dancing side by side). */
export function comparePoses(a: PoseVector, b: PoseVector): number {
  let sum = 0;
  let wsum = 0;
  for (const seg of SEGMENTS) {
    if (LEG_SEGMENTS.has(seg) && !(a.legs && b.legs)) continue;
    const w = WEIGHT[seg];
    sum += w * segmentScore(angleDiff(a.angles[seg], b.angles[seg]));
    wsum += w;
  }
  return wsum ? sum / wsum : 0;
}

/** How far a pose is from a relaxed standing pose (0 = neutral). Used to ignore "idle copying". */
export function poseActivity(v: PoseVector): number {
  const neutral = NEUTRAL.angles;
  let d = 0;
  for (const seg of ['lUpper', 'lFore', 'rUpper', 'rFore', 'torso'] as const) d += angleDiff(neutral[seg]!, v.angles[seg]);
  return clamp01(d / 220);
}

const ARMS_DOWN = { lUpper: -100, lFore: -95, rUpper: -80, rFore: -85 };
const LEGS_STAND = { lThigh: -95, lShin: -92, rThigh: -85, rShin: -88 };

export const NEUTRAL: PoseDef = { id: 'neutral', name: 'STAND', emoji: '🧍', angles: { ...ARMS_DOWN, torso: 90 } };

export const POSES: PoseDef[] = [
  { id: 'hands-up', name: 'HANDS UP', emoji: '🙌', angles: { lUpper: 100, lFore: 95, rUpper: 80, rFore: 85, torso: 90 } },
  { id: 't-pose', name: 'T-POSE', emoji: '✈️', angles: { lUpper: 180, lFore: 180, rUpper: 0, rFore: 0, torso: 90 } },
  { id: 'left-up', name: 'LEFT HAND UP', emoji: '🤚', angles: { lUpper: 100, lFore: 95, rUpper: -80, rFore: -85, torso: 90 } },
  { id: 'right-up', name: 'RIGHT HAND UP', emoji: '✋', angles: { lUpper: -100, lFore: -95, rUpper: 80, rFore: 85, torso: 90 } },
  { id: 'victory', name: 'VICTORY V', emoji: '✌️', angles: { lUpper: 135, lFore: 132, rUpper: 45, rFore: 48, torso: 90 } },
  { id: 'flex', name: 'FLEX', emoji: '💪', angles: { lUpper: 180, lFore: 90, rUpper: 0, rFore: 90, torso: 90 } },
  { id: 'hero', name: 'SUPERHERO', emoji: '🦸', angles: { lUpper: -135, lFore: -45, rUpper: -45, rFore: -135, torso: 90 } },
  { id: 'disco', name: 'DISCO', emoji: '🕺', angles: { lUpper: -135, lFore: -135, rUpper: 45, rFore: 45, torso: 90 } },
  { id: 'disco-2', name: 'DISCO FLIP', emoji: '🪩', angles: { lUpper: 135, lFore: 135, rUpper: -45, rFore: -45, torso: 90 } },
  {
    id: 'star',
    name: 'STAR',
    emoji: '⭐',
    angles: { lUpper: 140, lFore: 140, rUpper: 40, rFore: 40, lThigh: -118, lShin: -118, rThigh: -62, rShin: -62, torso: 90 },
  },
  { id: 'lean-left', name: 'LEAN LEFT', emoji: '↖️', angles: { lUpper: 140, lFore: 140, rUpper: 95, rFore: 110, torso: 112 } },
  { id: 'lean-right', name: 'LEAN RIGHT', emoji: '↗️', angles: { lUpper: 85, lFore: 70, rUpper: 40, rFore: 40, torso: 68 } },
  { id: 'head', name: 'HANDS ON HEAD', emoji: '🤯', angles: { lUpper: 150, lFore: -25, rUpper: 30, rFore: -155, torso: 90 } },
  { id: 'point-left', name: 'POINT LEFT', emoji: '👈', angles: { lUpper: 180, lFore: 180, rUpper: -80, rFore: -85, torso: 90 } },
  { id: 'point-right', name: 'POINT RIGHT', emoji: '👉', angles: { lUpper: -100, lFore: -95, rUpper: 0, rFore: 0, torso: 90 } },
  { id: 'robot', name: 'ROBOT', emoji: '🤖', angles: { lUpper: -100, lFore: 180, rUpper: -80, rFore: 0, torso: 90 } },
  { id: 'heart', name: 'BIG HEART', emoji: '❤️', angles: { lUpper: 130, lFore: 30, rUpper: 50, rFore: 150, torso: 90 } },
  { id: 'teapot', name: 'TEAPOT', emoji: '🫖', angles: { lUpper: -135, lFore: -45, rUpper: 45, rFore: 45, torso: 90 } },
  { id: 'sky', name: 'SKY REACH', emoji: '☝️', angles: { lUpper: -135, lFore: -45, rUpper: 85, rFore: 88, torso: 90 } },
  { id: 'squat', name: 'SQUAT', emoji: '🏋️', angles: { torso: 90 }, checks: ['squat'] },
  {
    id: 'flamingo-left',
    name: 'FLAMINGO LEFT',
    emoji: '🦩',
    angles: { lUpper: 180, lFore: 180, rUpper: 0, rFore: 0, torso: 90 },
    checks: ['kneeLeft'],
  },
  {
    id: 'flamingo-right',
    name: 'FLAMINGO RIGHT',
    emoji: '🦩',
    angles: { lUpper: 180, lFore: 180, rUpper: 0, rFore: 0, torso: 90 },
    checks: ['kneeRight'],
  },
  {
    id: 'squat-up',
    name: 'POWER SQUAT',
    emoji: '🔥',
    angles: { lUpper: 100, lFore: 95, rUpper: 80, rFore: 85 },
    checks: ['squat'],
  },
];

/** Poses that only need the upper body (safe for laptop cameras that can't see feet). */
export const UPPER_BODY_POSES = POSES.filter(
  (p) => !p.checks?.some((c) => c === 'kneeLeft' || c === 'kneeRight') && !Object.keys(p.angles).some((k) => LEG_SEGMENTS.has(k as Segment)),
);

export function poseById(id: string): PoseDef {
  return POSES.find((p) => p.id === id) ?? NEUTRAL;
}

/**
 * Build a stick-figure skeleton for a pose definition (used to draw the "ghost" target).
 * Returns points relative to the hip center with a torso length of 1 (y down).
 */
export function ghostSkeleton(def: PoseDef): Record<string, Point> {
  const a = { ...ARMS_DOWN, ...LEGS_STAND, torso: 90, ...def.angles };
  const squat = def.checks?.includes('squat');
  const dir = (deg: number, len: number): Point => ({
    x: Math.cos((deg * Math.PI) / 180) * len,
    y: -Math.sin((deg * Math.PI) / 180) * len,
  });
  const hip = { x: 0, y: squat ? 0.55 : 0 };
  const t = dir(a.torso, 1);
  const sh = { x: hip.x + t.x, y: hip.y + t.y };
  const perp = { x: -t.y, y: t.x };
  const lSh = { x: sh.x - perp.x * 0.38, y: sh.y - perp.y * 0.38 };
  const rSh = { x: sh.x + perp.x * 0.38, y: sh.y + perp.y * 0.38 };
  const add = (p: Point, d: Point): Point => ({ x: p.x + d.x, y: p.y + d.y });
  const lEl = add(lSh, dir(a.lUpper, 0.6));
  const lWr = add(lEl, dir(a.lFore, 0.55));
  const rEl = add(rSh, dir(a.rUpper, 0.6));
  const rWr = add(rEl, dir(a.rFore, 0.55));
  const lHip = { x: hip.x - 0.28, y: hip.y };
  const rHip = { x: hip.x + 0.28, y: hip.y };
  let lKnee = add(lHip, dir(a.lThigh, 0.9));
  let lAnk = add(lKnee, dir(a.lShin, 0.9));
  let rKnee = add(rHip, dir(a.rThigh, 0.9));
  let rAnk = add(rKnee, dir(a.rShin, 0.9));
  if (squat) {
    lKnee = { x: lHip.x - 0.35, y: hip.y + 0.55 };
    lAnk = { x: lHip.x - 0.2, y: 1.8 };
    rKnee = { x: rHip.x + 0.35, y: hip.y + 0.55 };
    rAnk = { x: rHip.x + 0.2, y: 1.8 };
  }
  if (def.checks?.includes('kneeLeft')) {
    lKnee = { x: lHip.x - 0.05, y: hip.y + 0.15 };
    lAnk = { x: lHip.x + 0.05, y: hip.y + 0.95 };
  }
  if (def.checks?.includes('kneeRight')) {
    rKnee = { x: rHip.x + 0.05, y: hip.y + 0.15 };
    rAnk = { x: rHip.x - 0.05, y: hip.y + 0.95 };
  }
  const head = add(sh, dir(a.torso, 0.55));
  return { hip, sh, lSh, rSh, lEl, lWr, rEl, rWr, lHip, rHip, lKnee, lAnk, rKnee, rAnk, head };
}
