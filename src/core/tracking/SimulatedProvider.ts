import type { Point } from '../math';
import { clamp, lerp } from '../math';
import { LM } from './landmarks';
import type { DetectedPose, Landmark, PoseFrame, PoseProvider, ProviderStatus } from './types';

/**
 * A parametric virtual body that produces MediaPipe-shaped landmarks. Used for keyboard/touch play
 * when no camera is available, for demos, and for automated tests of the full motion pipeline.
 *
 * Coordinates are produced in "view space" (mirrored, x in 0..aspect, y in 0..1) and converted to raw
 * unmirrored image coordinates so the data flows through exactly the same code path as camera data.
 */

export type ArmMode = 'down' | 'up' | 'out' | 'guard' | 'hip' | 'point';

export interface SimArm {
  mode: ArmMode;
  /** Seconds since a punch started, or -1. */
  punchT: number;
  /** Optional pointer-controlled wrist target (view space). */
  target: Point | null;
}

export const SIM_ASPECT = 16 / 9;
const W_TORSO = 0.5; // meters

export class SimBody {
  /** Torso length in view units (fraction of frame height). */
  torso = 0.25;
  baseX: number;
  x: number;
  /** -1, 0, 1 lateral zone (stepped left / centered / stepped right). */
  zone = 0;
  leanTarget = 0;
  lean = 0;
  squatTarget = 0;
  squat = 0;
  jumpT = -1;
  dance = false;
  danceT = 0;
  left: SimArm = { mode: 'down', punchT: -1, target: null };
  right: SimArm = { mode: 'down', punchT: -1, target: null };
  kickLeftT = -1;
  kickRightT = -1;
  kneeLeft = false;
  kneeRight = false;
  flapT = -1;
  /** Small idle sway so the body never looks frozen; disabled for freeze games via `stillness`. */
  sway = 0;
  private time = 0;

  constructor(x: number) {
    this.baseX = x;
    this.x = x;
  }

  jump(): void {
    if (this.jumpT < 0) this.jumpT = 0;
  }

  punch(side: 'left' | 'right'): void {
    const arm = side === 'left' ? this.left : this.right;
    if (arm.punchT < 0 || arm.punchT > 0.3) arm.punchT = 0;
  }

  kick(side: 'left' | 'right'): void {
    if (side === 'left' && this.kickLeftT < 0) this.kickLeftT = 0;
    if (side === 'right' && this.kickRightT < 0) this.kickRightT = 0;
  }

  flap(): void {
    if (this.flapT < 0) this.flapT = 0;
  }

  step(dir: -1 | 1): void {
    this.zone = clamp(this.zone + dir, -1, 1);
  }

  update(dt: number): void {
    this.time += dt;
    const targetX = this.baseX + this.zone * this.torso * 1.1;
    this.x = lerp(this.x, targetX, 1 - Math.exp(-dt / 0.06));
    this.lean = lerp(this.lean, this.leanTarget, 1 - Math.exp(-dt / 0.06));
    this.squat = lerp(this.squat, this.squatTarget, 1 - Math.exp(-dt / 0.07));
    if (this.jumpT >= 0) {
      this.jumpT += dt;
      if (this.jumpT > 0.55) this.jumpT = -1;
    }
    for (const arm of [this.left, this.right]) {
      if (arm.punchT >= 0) {
        arm.punchT += dt;
        if (arm.punchT > 0.42) arm.punchT = -1;
      }
    }
    if (this.kickLeftT >= 0 && (this.kickLeftT += dt) > 0.5) this.kickLeftT = -1;
    if (this.kickRightT >= 0 && (this.kickRightT += dt) > 0.5) this.kickRightT = -1;
    if (this.flapT >= 0 && (this.flapT += dt) > 0.35) this.flapT = -1;
    if (this.dance) this.danceT += dt;
  }

  /** Produce view-space joints (x in 0..aspect, y 0..1) and world joints (meters, view-oriented). */
  build(): { view: Landmark[]; world: Landmark[] } {
    const T = this.torso;
    const k = W_TORSO / T; // view → meters
    const view: Landmark[] = Array.from({ length: 33 }, () => ({ x: 0, y: 0, z: 0, v: 0.98 }));
    const groundY = 0.93;
    const thigh = 0.9 * T;
    const shin = 0.9 * T;
    const hipHalf = 0.28 * T;
    const shoulderHalf = 0.38 * T;

    // Jump arc
    let lift = 0;
    if (this.jumpT >= 0) {
      const d = 0.55;
      const u = this.jumpT / d;
      lift = 4 * 0.42 * T * u * (1 - u);
    }
    let danceBounce = 0;
    let danceArm = 0;
    if (this.dance) {
      danceBounce = Math.abs(Math.sin(this.danceT * 7)) * 0.12 * T;
      danceArm = Math.sin(this.danceT * 7);
    }
    const swayX = this.sway * Math.sin(this.time * 1.7) * 0.01 * T;

    const squatDrop = this.squat * 0.62 * T + danceBounce;
    const hipY = groundY - thigh - shin + squatDrop - lift + 0.02 * T;
    const hipC = { x: this.x + swayX, y: hipY };

    // Legs
    const legs = (side: -1 | 1, kickT: number, knee: boolean) => {
      const hip = { x: hipC.x + side * hipHalf, y: hipC.y };
      const spread = this.squat * 0.32 * T;
      let ankle = { x: hip.x + side * (0.06 * T + spread * 0.6), y: Math.min(groundY - lift, hip.y + thigh + shin) };
      let kneeP = {
        x: hip.x + side * (0.04 * T + spread),
        y: hip.y + Math.sqrt(Math.max(0.0001, thigh ** 2 - (spread * 0.9) ** 2)) * (1 - this.squat * 0.35),
      };
      let ankleZ = 0;
      if (kickT >= 0) {
        const u = Math.sin((kickT / 0.5) * Math.PI);
        kneeP = { x: hip.x + side * 0.1 * T, y: hip.y + thigh * (1 - 0.55 * u) };
        ankle = { x: hip.x + side * 0.18 * T, y: hip.y + (thigh + shin) * (1 - 0.75 * u) };
        ankleZ = -0.5 * u;
      } else if (knee) {
        kneeP = { x: hip.x + side * 0.05 * T, y: hip.y + 0.15 * T };
        ankle = { x: hip.x + side * 0.08 * T, y: hip.y + 0.15 * T + shin * 0.95 };
        ankleZ = -0.2;
      }
      return { hip, knee: kneeP, ankle, ankleZ };
    };
    const L = legs(-1, this.kickLeftT, this.kneeLeft);
    const R = legs(1, this.kickRightT, this.kneeRight);

    // Upper body: rotate around hip center by lean angle (positive lean → towards screen right)
    const leanRad = (this.lean * 24 * Math.PI) / 180;
    const rot = (dx: number, dy: number): Point => ({
      x: hipC.x + dx * Math.cos(leanRad) - dy * Math.sin(leanRad),
      y: hipC.y + dx * Math.sin(leanRad) + dy * Math.cos(leanRad),
    });
    const lSh = rot(-shoulderHalf, -T);
    const rSh = rot(shoulderHalf, -T);
    const nose = rot(0, -T - 0.5 * T);

    const arm = (side: -1 | 1, a: SimArm, sh: Point) => {
      const upper = 0.6 * T;
      const fore = 0.55 * T;
      let elbow: Point;
      let wrist: Point;
      let wz = 0;
      const dir = (deg: number): Point => {
        const r = (deg * Math.PI) / 180;
        return { x: Math.cos(r), y: -Math.sin(r) };
      };
      // side -1 = player's left = screen left.
      const mirrorDeg = (deg: number) => (side === -1 ? 180 - deg : deg);
      if (a.punchT >= 0) {
        // Guard → extended forward → retract
        const u = a.punchT < 0.1 ? a.punchT / 0.1 : a.punchT < 0.22 ? 1 : Math.max(0, 1 - (a.punchT - 0.22) / 0.2);
        const guardElbow = { x: sh.x + side * 0.12 * T, y: sh.y + 0.45 * T };
        const guardWrist = { x: sh.x - side * 0.05 * T, y: sh.y - 0.12 * T };
        const extElbow = { x: sh.x - side * 0.02 * T, y: sh.y + 0.08 * T };
        const extWrist = { x: sh.x - side * 0.12 * T, y: sh.y + 0.05 * T };
        elbow = { x: lerp(guardElbow.x, extElbow.x, u), y: lerp(guardElbow.y, extElbow.y, u) };
        wrist = { x: lerp(guardWrist.x, extWrist.x, u), y: lerp(guardWrist.y, extWrist.y, u) };
        wz = -lerp(0.15, 0.62, u);
      } else if (a.target) {
        // Two-bone IK towards the pointer target, elbow bends outward/down.
        const dx = a.target.x - sh.x;
        const dy = a.target.y - sh.y;
        const d = clamp(Math.hypot(dx, dy), 0.01, upper + fore - 1e-4);
        const base = Math.atan2(dy, dx);
        const cosA = (upper * upper + d * d - fore * fore) / (2 * upper * d);
        const bend = Math.acos(clamp(cosA, -1, 1)) * (side === -1 ? 1 : -1);
        elbow = { x: sh.x + Math.cos(base + bend) * upper, y: sh.y + Math.sin(base + bend) * upper };
        wrist = { x: sh.x + (dx / Math.hypot(dx, dy)) * d, y: sh.y + (dy / Math.hypot(dx, dy)) * d };
      } else if (this.flapT >= 0) {
        const deg = lerp(60, -40, this.flapT / 0.35);
        const d1 = dir(mirrorDeg(deg));
        elbow = { x: sh.x + d1.x * upper, y: sh.y + d1.y * upper };
        wrist = { x: elbow.x + d1.x * fore, y: elbow.y + d1.y * fore };
      } else {
        let upDeg = -95;
        let foreDeg = -92;
        switch (a.mode) {
          case 'up':
            upDeg = 75;
            foreDeg = 82;
            break;
          case 'out':
            upDeg = 0;
            foreDeg = 0;
            break;
          case 'hip':
            upDeg = -45;
            foreDeg = -140;
            break;
          case 'point':
            upDeg = 20;
            foreDeg = 20;
            break;
          case 'guard':
            upDeg = -70;
            foreDeg = 100;
            break;
          default:
            if (this.dance) {
              upDeg = -40 + 70 * danceArm * side;
              foreDeg = upDeg + 30;
            }
        }
        if (a.mode === 'guard') {
          elbow = { x: sh.x + side * 0.1 * T, y: sh.y + 0.42 * T };
          wrist = { x: nose.x + side * 0.12 * T, y: nose.y + 0.15 * T };
          wz = -0.15;
        } else {
          const d1 = dir(mirrorDeg(upDeg));
          const d2 = dir(mirrorDeg(foreDeg));
          elbow = { x: sh.x + d1.x * upper, y: sh.y + d1.y * upper };
          wrist = { x: elbow.x + d2.x * fore, y: elbow.y + d2.y * fore };
        }
      }
      return { elbow, wrist, wz };
    };
    const la = arm(-1, this.left, lSh);
    const ra = arm(1, this.right, rSh);

    const set = (i: number, p: Point, z = 0) => {
      view[i].x = p.x;
      view[i].y = p.y;
      view[i].z = z;
    };
    set(LM.nose, nose, -0.1);
    const eyeDx = 0.07 * T;
    set(LM.leftEyeInner, { x: nose.x - eyeDx * 0.5, y: nose.y - 0.06 * T });
    set(LM.leftEye, { x: nose.x - eyeDx, y: nose.y - 0.06 * T });
    set(LM.leftEyeOuter, { x: nose.x - eyeDx * 1.4, y: nose.y - 0.06 * T });
    set(LM.rightEyeInner, { x: nose.x + eyeDx * 0.5, y: nose.y - 0.06 * T });
    set(LM.rightEye, { x: nose.x + eyeDx, y: nose.y - 0.06 * T });
    set(LM.rightEyeOuter, { x: nose.x + eyeDx * 1.4, y: nose.y - 0.06 * T });
    set(LM.leftEar, { x: nose.x - 0.17 * T, y: nose.y - 0.02 * T });
    set(LM.rightEar, { x: nose.x + 0.17 * T, y: nose.y - 0.02 * T });
    set(LM.mouthLeft, { x: nose.x - 0.05 * T, y: nose.y + 0.08 * T });
    set(LM.mouthRight, { x: nose.x + 0.05 * T, y: nose.y + 0.08 * T });
    set(LM.leftShoulder, lSh);
    set(LM.rightShoulder, rSh);
    set(LM.leftElbow, la.elbow, la.wz * 0.5);
    set(LM.rightElbow, ra.elbow, ra.wz * 0.5);
    set(LM.leftWrist, la.wrist, la.wz);
    set(LM.rightWrist, ra.wrist, ra.wz);
    for (const [i, w] of [
      [LM.leftPinky, la],
      [LM.leftIndex, la],
      [LM.leftThumb, la],
      [LM.rightPinky, ra],
      [LM.rightIndex, ra],
      [LM.rightThumb, ra],
    ] as const) {
      const ext = { x: w.wrist.x + (w.wrist.x - w.elbow.x) * 0.15, y: w.wrist.y + (w.wrist.y - w.elbow.y) * 0.15 };
      set(i, ext, w.wz);
    }
    set(LM.leftHip, L.hip);
    set(LM.rightHip, R.hip);
    set(LM.leftKnee, L.knee, L.ankleZ * 0.5);
    set(LM.rightKnee, R.knee, R.ankleZ * 0.5);
    set(LM.leftAnkle, L.ankle, L.ankleZ);
    set(LM.rightAnkle, R.ankle, R.ankleZ);
    set(LM.leftHeel, { x: L.ankle.x, y: L.ankle.y + 0.03 * T }, L.ankleZ);
    set(LM.rightHeel, { x: R.ankle.x, y: R.ankle.y + 0.03 * T }, R.ankleZ);
    set(LM.leftFootIndex, { x: L.ankle.x - 0.08 * T, y: L.ankle.y + 0.05 * T }, L.ankleZ);
    set(LM.rightFootIndex, { x: R.ankle.x + 0.08 * T, y: R.ankle.y + 0.05 * T }, R.ankleZ);

    // Hide anything below the frame (partial visibility like a real camera).
    for (const p of view) if (p.y > 0.995 || p.y < 0.005) p.v = 0.1;

    const world: Landmark[] = view.map((p) => ({
      x: (p.x - hipC.x) * k,
      y: (p.y - hipC.y) * k,
      z: p.z,
      v: p.v,
    }));
    return { view, world };
  }
}

export class SimulatedProvider implements PoseProvider {
  readonly kind = 'simulated' as const;
  readonly bodies: SimBody[] = [];
  private numPoses = 2;
  private lastNow = 0;
  /** Bodies that are "in frame". Allows tests to simulate players leaving the camera. */
  present: boolean[] = [true, true, true, true];

  constructor(count = 4) {
    for (let i = 0; i < count; i++) this.bodies.push(new SimBody(0));
    this.layout(2);
  }

  /** Spread the first `n` bodies evenly across the frame. */
  layout(n: number): void {
    const count = Math.max(1, Math.min(n, this.bodies.length));
    this.bodies.forEach((b, i) => {
      const x = SIM_ASPECT * ((i + 0.5) / count);
      b.baseX = x;
      b.x = x;
      b.zone = 0;
      b.torso = count > 2 ? 0.17 : 0.2;
    });
  }

  async init(numPoses: number, onStatus?: (s: ProviderStatus) => void): Promise<void> {
    this.numPoses = numPoses;
    this.layout(numPoses);
    onStatus?.({ phase: 'ready', backend: 'keyboard', progress: 1 });
  }

  setNumPoses(n: number): void {
    if (n !== this.numPoses) {
      this.numPoses = n;
      this.layout(n);
    }
  }

  get activeCount(): number {
    return this.numPoses;
  }

  async detect(_source: HTMLVideoElement | null, now: number): Promise<PoseFrame> {
    const dt = this.lastNow ? clamp((now - this.lastNow) / 1000, 0, 0.1) : 1 / 30;
    this.lastNow = now;
    const poses: DetectedPose[] = [];
    for (let i = 0; i < this.numPoses && i < this.bodies.length; i++) {
      const body = this.bodies[i];
      body.update(dt);
      if (!this.present[i]) continue;
      const { view, world } = body.build();
      poses.push({
        image: view.map((p) => ({ x: 1 - p.x / SIM_ASPECT, y: p.y, z: p.z, v: p.v })),
        world: world.map((p) => ({ x: -p.x, y: p.y, z: p.z, v: p.v })),
      });
    }
    return { t: now, width: 1280, height: 720, poses, inferenceMs: 0 };
  }

  dispose(): void {}
}
