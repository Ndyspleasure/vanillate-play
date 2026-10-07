import type { Point } from '../math';
import { jointAngle } from '../math';
import type { TrackedPose } from '../players/PlayerTracker';
import { LM, VISIBLE } from '../tracking/landmarks';
import type { Landmark } from '../tracking/types';

/** Geometric measurements of one body in one frame (view space). */
export interface BodyFrame {
  t: number;
  nose: Point;
  lSh: Point;
  rSh: Point;
  shC: Point;
  lEl: Point;
  rEl: Point;
  lWr: Point;
  rWr: Point;
  lHip: Point;
  rHip: Point;
  hipC: Point;
  center: Point;
  lKnee: Point;
  rKnee: Point;
  lAnk: Point;
  rAnk: Point;
  hipsVisible: boolean;
  kneesVisible: boolean;
  anklesVisible: boolean;
  noseVisible: boolean;
  torso: number;
  shoulderWidth: number;
  lArmExt: number;
  rArmExt: number;
  /** Wrist position relative to its shoulder in world meters (view oriented), if available. */
  lWristRel: [number, number, number] | null;
  rWristRel: [number, number, number] | null;
  lKneeAngle: number | null;
  rKneeAngle: number | null;
  quality: number;
}

const P = (l: Landmark): Point => ({ x: l.x, y: l.y });
const vis = (l: Landmark) => l.v >= VISIBLE;

function ext3(s: Landmark, e: Landmark, w: Landmark): number {
  const a = Math.hypot(e.x - s.x, e.y - s.y, e.z - s.z);
  const b = Math.hypot(w.x - e.x, w.y - e.y, w.z - e.z);
  const c = Math.hypot(w.x - s.x, w.y - s.y, w.z - s.z);
  return a + b > 1e-6 ? c / (a + b) : 0;
}

function ext2(s: Point, e: Point, w: Point): number {
  const a = Math.hypot(e.x - s.x, e.y - s.y);
  const b = Math.hypot(w.x - e.x, w.y - e.y);
  const c = Math.hypot(w.x - s.x, w.y - s.y);
  return a + b > 1e-6 ? c / (a + b) : 0;
}

/**
 * Extract a BodyFrame. `torsoHint` (from calibration) is used to estimate hip positions when the
 * hips are out of frame, so upper-body-only play still works.
 */
export function extractBody(pose: TrackedPose, torsoHint: number | null): BodyFrame {
  const p = pose.pts;
  const lSh = P(p[LM.leftShoulder]);
  const rSh = P(p[LM.rightShoulder]);
  const shC = { x: (lSh.x + rSh.x) / 2, y: (lSh.y + rSh.y) / 2 };
  const shoulderWidth = Math.hypot(lSh.x - rSh.x, lSh.y - rSh.y);
  const hipsVisible = vis(p[LM.leftHip]) && vis(p[LM.rightHip]);
  let lHip = P(p[LM.leftHip]);
  let rHip = P(p[LM.rightHip]);
  let hipC = { x: (lHip.x + rHip.x) / 2, y: (lHip.y + rHip.y) / 2 };
  let torso = hipsVisible ? Math.hypot(shC.x - hipC.x, shC.y - hipC.y) : (torsoHint ?? shoulderWidth * 1.3);
  if (!hipsVisible) {
    hipC = { x: shC.x, y: shC.y + torso };
    lHip = { x: hipC.x - shoulderWidth * 0.35, y: hipC.y };
    rHip = { x: hipC.x + shoulderWidth * 0.35, y: hipC.y };
  }
  torso = Math.max(torso, 0.02);
  const kneesVisible = vis(p[LM.leftKnee]) && vis(p[LM.rightKnee]);
  const anklesVisible = vis(p[LM.leftAnkle]) && vis(p[LM.rightAnkle]);

  const w = pose.world;
  let lArmExt: number;
  let rArmExt: number;
  let lWristRel: [number, number, number] | null = null;
  let rWristRel: [number, number, number] | null = null;
  if (w) {
    lArmExt = ext3(w[LM.leftShoulder], w[LM.leftElbow], w[LM.leftWrist]);
    rArmExt = ext3(w[LM.rightShoulder], w[LM.rightElbow], w[LM.rightWrist]);
    lWristRel = [
      w[LM.leftWrist].x - w[LM.leftShoulder].x,
      w[LM.leftWrist].y - w[LM.leftShoulder].y,
      w[LM.leftWrist].z - w[LM.leftShoulder].z,
    ];
    rWristRel = [
      w[LM.rightWrist].x - w[LM.rightShoulder].x,
      w[LM.rightWrist].y - w[LM.rightShoulder].y,
      w[LM.rightWrist].z - w[LM.rightShoulder].z,
    ];
  } else {
    lArmExt = ext2(lSh, P(p[LM.leftElbow]), P(p[LM.leftWrist]));
    rArmExt = ext2(rSh, P(p[LM.rightElbow]), P(p[LM.rightWrist]));
  }

  const lKnee = P(p[LM.leftKnee]);
  const rKnee = P(p[LM.rightKnee]);
  const lAnk = P(p[LM.leftAnkle]);
  const rAnk = P(p[LM.rightAnkle]);
  const center = hipsVisible ? { x: (shC.x + hipC.x) / 2, y: (shC.y + hipC.y) / 2 } : shC;

  return {
    t: pose.t,
    nose: P(p[LM.nose]),
    lSh,
    rSh,
    shC,
    lEl: P(p[LM.leftElbow]),
    rEl: P(p[LM.rightElbow]),
    lWr: P(p[LM.leftWrist]),
    rWr: P(p[LM.rightWrist]),
    lHip,
    rHip,
    hipC,
    center,
    lKnee,
    rKnee,
    lAnk,
    rAnk,
    hipsVisible,
    kneesVisible,
    anklesVisible,
    noseVisible: vis(p[LM.nose]),
    torso,
    shoulderWidth,
    lArmExt,
    rArmExt,
    lWristRel,
    rWristRel,
    lKneeAngle: hipsVisible && kneesVisible && anklesVisible ? jointAngle(lHip, lKnee, lAnk) : null,
    rKneeAngle: hipsVisible && kneesVisible && anklesVisible ? jointAngle(rHip, rKnee, rAnk) : null,
    quality:
      (p[LM.leftShoulder].v + p[LM.rightShoulder].v + p[LM.nose].v + p[LM.leftWrist].v + p[LM.rightWrist].v) / 5,
  };
}
