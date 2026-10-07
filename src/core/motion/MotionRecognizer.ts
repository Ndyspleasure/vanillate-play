import type { BodyCalibration } from '../calibration/Calibration';
import { smoothFactor } from '../math';
import type { TrackedPose } from '../players/PlayerTracker';
import { ENERGY_POINTS } from '../tracking/landmarks';
import { extractBody, type BodyFrame } from './features';
import type { MotionEvent, MotionState, TimedEvent } from './types';

interface Sample {
  t: number;
  f: BodyFrame;
}

const HISTORY_MS = 700;

/**
 * Movement thresholds (torso units, multiplied by the sensitivity factor). Each on/off pair forms a
 * hysteresis band so a body hovering near a threshold never flickers between states.
 */
export const THRESHOLDS = {
  /** Body-centre offset from the calibrated standing spot to count as "moved left/right". */
  stepOn: 0.42,
  stepOff: 0.26,
  /** Shoulder-over-hip lean to count as leaning. */
  leanOn: 0.2,
  leanOff: 0.12,
  /** Jump take-off: shoulder rise, hip rise and upward speed (torso units/s). */
  jumpRise: 0.15,
  jumpHipRise: 0.1,
  jumpSpeed: 0.7,
  /** Back on the ground below this rise. */
  landRise: 0.06,
  /** Wrist height above the shoulder line for a raised hand. */
  handOn: 0.6,
  handOff: 0.35,
} as const;

/** Longest a jump can last before the airborne state is considered a tracking artefact. */
const MAX_AIR_MS = 1200;

/** Hysteresis latch: turns on above `on`, off below `off`. */
function latch(current: boolean, value: number, on: number, off: number): boolean {
  return current ? value > off : value > on;
}

export function emptyState(): MotionState {
  const z = { x: 0, y: 0 };
  return {
    t: 0,
    nose: z,
    shoulderC: z,
    hipC: z,
    center: z,
    leftShoulder: z,
    rightShoulder: z,
    leftElbow: z,
    rightElbow: z,
    leftWrist: z,
    rightWrist: z,
    leftHip: z,
    rightHip: z,
    leftKnee: z,
    rightKnee: z,
    leftAnkle: z,
    rightAnkle: z,
    torso: 0.2,
    offsetX: 0,
    rise: 0,
    drop: 0,
    headDrop: 0,
    lean: 0,
    leftHandHeight: -1,
    rightHandHeight: -1,
    leftArmExt: 0.5,
    rightArmExt: 0.5,
    leftKneeHeight: -1,
    rightKneeHeight: -1,
    energy: 0,
    velocity: { x: 0, y: 0 },
    leaningLeft: false,
    leaningRight: false,
    steppedLeft: false,
    steppedRight: false,
    zone: 0,
    airborne: false,
    squatting: false,
    ducking: false,
    leftHandUp: false,
    rightHandUp: false,
    handsUp: false,
    handRaised: false,
    blocking: false,
    reachingLeft: false,
    reachingRight: false,
    kneeUpLeft: false,
    kneeUpRight: false,
    still: true,
    moving: false,
    hipsVisible: false,
    legsVisible: false,
    calibrated: false,
    confidence: 0,
  };
}

/**
 * Converts a stream of tracked poses for ONE player into a continuous MotionState plus discrete
 * semantic events. All thresholds are expressed in torso units so they work at any distance from
 * the camera, and scale with the player's chosen sensitivity.
 */
export class MotionRecognizer {
  state: MotionState = emptyState();
  /** Body measurements of the most recent frame. */
  lastFrame: BodyFrame | null = null;
  /** Threshold multiplier (lower = smaller movements trigger actions). */
  k = 1;
  private history: Sample[] = [];
  private prevPts: { x: number; y: number }[] | null = null;
  private prevT = 0;
  private cooldown = new Map<MotionEvent, number>();
  private stillMs = 0;
  private pointMs = 0;
  private emittedZone: -1 | 0 | 1 = 0;
  private jumpEmitted = false;
  private airMs = 0;
  private airBlocked = false;
  private wasLow = false;

  reset(): void {
    this.state = emptyState();
    this.lastFrame = null;
    this.history = [];
    this.prevPts = null;
    this.prevT = 0;
    this.cooldown.clear();
    this.stillMs = 0;
    this.pointMs = 0;
    this.emittedZone = 0;
    this.jumpEmitted = false;
    this.airMs = 0;
    this.airBlocked = false;
    this.wasLow = false;
  }

  /** Measure the body without emitting events (used before calibration). */
  measure(pose: TrackedPose, torsoHint: number | null): BodyFrame {
    return extractBody(pose, torsoHint);
  }

  private ready(type: MotionEvent, t: number, ms: number): boolean {
    const until = this.cooldown.get(type) ?? 0;
    if (t < until) return false;
    this.cooldown.set(type, t + ms);
    return true;
  }

  /** Motion energy: mean landmark speed (torso units/s) over the energy points. */
  private computeEnergy(pose: TrackedPose, torso: number, dt: number): number {
    const pts = pose.pts;
    let raw = 0;
    if (this.prevPts && dt > 0) {
      let sum = 0;
      let n = 0;
      for (const i of ENERGY_POINTS) {
        const a = pts[i];
        const b = this.prevPts[i];
        if (a.v < 0.5) continue;
        sum += Math.hypot(a.x - b.x, a.y - b.y);
        n++;
      }
      raw = n ? sum / n / dt / torso : 0;
    }
    this.prevPts = pts.map((p) => ({ x: p.x, y: p.y }));
    return raw;
  }

  /** Window helper: oldest sample at least `ms` old (or the oldest available). */
  private sampleAgo(ms: number, now: number): Sample | null {
    let best: Sample | null = null;
    for (let i = this.history.length - 1; i >= 0; i--) {
      best = this.history[i];
      if (now - this.history[i].t >= ms) break;
    }
    return best;
  }

  update(pose: TrackedPose, calib: BodyCalibration | null, out: TimedEvent[]): MotionState {
    const f = extractBody(pose, calib?.torso ?? null);
    this.lastFrame = f;
    const t = pose.t;
    const dt = this.prevT ? Math.max(0.001, Math.min(0.25, (t - this.prevT) / 1000)) : 0.033;
    this.prevT = t;
    const k = this.k;
    const s = this.state;
    const T = calib?.torso ?? f.torso;

    const rawEnergy = this.computeEnergy(pose, T, dt);
    s.energy += (rawEnergy - s.energy) * smoothFactor(dt, 0.15);

    this.history.push({ t, f });
    while (this.history.length > 2 && t - this.history[0].t > HISTORY_MS) this.history.shift();

    // Positions
    s.t = t;
    s.nose = f.nose;
    s.shoulderC = f.shC;
    s.hipC = f.hipC;
    s.center = f.center;
    s.leftShoulder = f.lSh;
    s.rightShoulder = f.rSh;
    s.leftElbow = f.lEl;
    s.rightElbow = f.rEl;
    s.leftWrist = f.lWr;
    s.rightWrist = f.rWr;
    s.leftHip = f.lHip;
    s.rightHip = f.rHip;
    s.leftKnee = f.lKnee;
    s.rightKnee = f.rKnee;
    s.leftAnkle = f.lAnk;
    s.rightAnkle = f.rAnk;
    s.torso = f.torso;
    s.hipsVisible = f.hipsVisible;
    s.legsVisible = f.kneesVisible && f.anklesVisible;
    s.calibrated = calib !== null;
    s.confidence = f.quality;

    const prev = this.history.length > 1 ? this.history[this.history.length - 2].f : f;
    s.velocity = { x: (f.center.x - prev.center.x) / dt / T, y: (f.center.y - prev.center.y) / dt / T };

    // Continuous measures
    s.lean = f.hipsVisible ? (f.shC.x - f.hipC.x) / f.torso : ((f.rSh.y - f.lSh.y) / Math.max(f.shoulderWidth, 1e-3)) * 0.5;
    s.leftHandHeight = (f.shC.y - f.lWr.y) / T;
    s.rightHandHeight = (f.shC.y - f.rWr.y) / T;
    s.leftArmExt = f.lArmExt;
    s.rightArmExt = f.rArmExt;
    s.leftKneeHeight = f.hipsVisible && f.kneesVisible ? (f.hipC.y - f.lKnee.y) / T : -1;
    s.rightKneeHeight = f.hipsVisible && f.kneesVisible ? (f.hipC.y - f.rKnee.y) / T : -1;
    if (calib) {
      s.offsetX = (f.center.x - calib.centerX) / T;
      s.rise = (calib.shoulderY - f.shC.y) / T;
      s.drop = f.hipsVisible ? (f.hipC.y - calib.hipY) / T : ((f.shC.y - calib.shoulderY) / T) * 0.9;
      s.headDrop = (f.nose.y - calib.noseY) / T;
    } else {
      s.offsetX = 0;
      s.rise = 0;
      s.drop = 0;
      s.headDrop = 0;
    }

    // Low confidence: keep last flags, emit nothing (anti-frustration: no aggressive false inputs).
    const trusted = f.quality >= 0.55;
    const emit = (type: MotionEvent, cooldownMs = 0) => {
      if (!trusted) return;
      if (cooldownMs && !this.ready(type, t, cooldownMs)) return;
      out.push({ type, t });
    };

    // --- Lean
    const wasLL = s.leaningLeft;
    const wasLR = s.leaningRight;
    s.leaningRight = latch(s.leaningRight, s.lean, THRESHOLDS.leanOn * k, THRESHOLDS.leanOff * k);
    s.leaningLeft = latch(s.leaningLeft, -s.lean, THRESHOLDS.leanOn * k, THRESHOLDS.leanOff * k);
    if (s.leaningRight && !wasLR) emit('LEAN_RIGHT');
    if (s.leaningLeft && !wasLL) emit('LEAN_LEFT');

    // --- Lateral zones: body position relative to the calibrated spot (needs a baseline)
    if (calib) {
      s.steppedRight = latch(s.steppedRight, s.offsetX, THRESHOLDS.stepOn * k, THRESHOLDS.stepOff * k);
      s.steppedLeft = latch(s.steppedLeft, -s.offsetX, THRESHOLDS.stepOn * k, THRESHOLDS.stepOff * k);
    }
    const goLeft = s.steppedLeft || s.leaningLeft;
    const goRight = s.steppedRight || s.leaningRight;
    if (goLeft && goRight) {
      // Conflicting cues (e.g. stepped right but leaning back left): the stronger one wins.
      s.zone = s.offsetX / THRESHOLDS.stepOn + s.lean / THRESHOLDS.leanOn < 0 ? -1 : 1;
    } else s.zone = goLeft ? -1 : goRight ? 1 : 0;
    // Zone changes are delivered exactly once, and are not lost if they happen while tracking
    // confidence is briefly low (they are sent as soon as the body is trusted again).
    if (trusted && s.zone !== this.emittedZone) {
      if (s.zone === -1) emit('MOVE_LEFT');
      else if (s.zone === 1) emit('MOVE_RIGHT');
      else emit('CENTER');
      this.emittedZone = s.zone;
    }

    // --- Fast lateral moves (step / dodge)
    const back = this.sampleAgo(260, t);
    if (back && t - back.t > 60) {
      const span = (t - back.t) / 1000;
      const dxBody = (f.center.x - back.f.center.x) / T;
      const dxHead = (f.nose.x - back.f.nose.x) / T;
      if (dxBody < -0.35 * k && -dxBody / span > 1.3 * k) emit('STEP_LEFT', 450);
      if (dxBody > 0.35 * k && dxBody / span > 1.3 * k) emit('STEP_RIGHT', 450);
      if (dxHead < -0.3 * k && -dxHead / span > 1.5 * k) emit('DODGE_LEFT', 450);
      if (dxHead > 0.3 * k && dxHead / span > 1.5 * k) emit('DODGE_RIGHT', 450);
    }

    // --- Vertical: jump, squat, duck
    if (calib) {
      const wasAir = s.airborne;
      const hipRise = f.hipsVisible ? (calib.hipY - f.hipC.y) / T : s.rise;
      // Upward shoulder speed over two windows (the shorter one catches quick hops at low FPS).
      let upSpeed = 0;
      for (const ms of [150, 250]) {
        const b = this.sampleAgo(ms, t);
        if (b && t - b.t > 30) upSpeed = Math.max(upSpeed, (b.f.shC.y - f.shC.y) / T / ((t - b.t) / 1000));
      }
      // Walking towards the camera also moves the shoulders up in the image: a real jump keeps the
      // body the same size.
      const win = this.sampleAgo(250, t);
      const growth = win ? f.shoulderWidth / Math.max(win.f.shoulderWidth, 1e-3) : 1;
      const sameSize =
        Math.abs(f.torso / calib.torso - 1) < 0.22 &&
        f.shoulderWidth / Math.max(calib.shoulderWidth, 1e-3) < 1.25 &&
        growth < 1.12;
      if (this.airBlocked && s.rise < THRESHOLDS.jumpRise * 0.6 * k) this.airBlocked = false;
      if (!s.airborne) {
        s.airborne =
          !this.airBlocked &&
          sameSize &&
          s.rise > THRESHOLDS.jumpRise * k &&
          hipRise > THRESHOLDS.jumpHipRise * k &&
          upSpeed > THRESHOLDS.jumpSpeed * k;
      } else {
        s.airborne = s.rise > THRESHOLDS.landRise * k;
      }
      this.airMs = s.airborne ? this.airMs + dt * 1000 : 0;
      if (this.airMs > MAX_AIR_MS) {
        // Nobody stays in the air this long: the baseline is off (e.g. the player moved). Stop
        // reporting a jump until the body is back near its standing height.
        s.airborne = false;
        this.airMs = 0;
        this.airBlocked = true;
      }
      if (s.airborne && !this.jumpEmitted && trusted) {
        emit('JUMP', 300);
        emit('MOVE_UP');
        this.jumpEmitted = true;
      }
      if (!s.airborne && wasAir && this.jumpEmitted) emit('LAND');
      if (!s.airborne) this.jumpEmitted = false;

      const wasSq = s.squatting;
      s.squatting = !s.airborne && latch(s.squatting, s.drop, 0.28 * k, 0.16 * k);
      if (s.squatting && !wasSq) emit('SQUAT', 250);
      if (!s.squatting && wasSq) emit('STAND');

      const wasDuck = s.ducking;
      s.ducking = !s.airborne && latch(s.ducking, s.headDrop, 0.3 * k, 0.18 * k);
      if (s.ducking && !wasDuck) emit('DUCK', 250);
      const low = s.squatting || s.ducking;
      if (low && !this.wasLow) emit('MOVE_DOWN');
      this.wasLow = low;
    }

    // --- Hands
    const wasL = s.leftHandUp;
    const wasR = s.rightHandUp;
    const wasBoth = s.handsUp;
    s.leftHandUp = latch(s.leftHandUp, s.leftHandHeight, THRESHOLDS.handOn * k, THRESHOLDS.handOff * k);
    s.rightHandUp = latch(s.rightHandUp, s.rightHandHeight, THRESHOLDS.handOn * k, THRESHOLDS.handOff * k);
    s.handsUp = s.leftHandUp && s.rightHandUp;
    s.handRaised = s.leftHandUp || s.rightHandUp;
    if (s.leftHandUp && !wasL) emit('HAND_LEFT_UP');
    if (s.rightHandUp && !wasR) emit('HAND_RIGHT_UP');
    if (s.handsUp && !wasBoth) emit('HANDS_UP');
    if (!s.leftHandUp && !s.rightHandUp && wasBoth) emit('HANDS_DOWN');

    // --- Block (guard): both wrists up near the face with elbows below the wrists
    const nearFace = (w: { x: number; y: number }, e: { x: number; y: number }) =>
      Math.abs(w.x - f.nose.x) < 0.8 * T &&
      w.y > f.nose.y - 0.45 * T &&
      w.y < f.shC.y + 0.12 * T &&
      e.y > w.y;
    const wasBlock = s.blocking;
    s.blocking = nearFace(f.lWr, f.lEl) && nearFace(f.rWr, f.rEl) && !s.handsUp;
    if (s.blocking && !wasBlock) emit('BLOCK', 300);

    // --- Punches: rapid arm extension (3D when world landmarks are available)
    this.detectPunch('left', f, t, emit);
    this.detectPunch('right', f, t, emit);

    // --- Reach / point
    const wasRL = s.reachingLeft;
    const wasRR = s.reachingRight;
    s.reachingLeft = latch(s.reachingLeft, f.lArmExt, 0.92, 0.82);
    s.reachingRight = latch(s.reachingRight, f.rArmExt, 0.92, 0.82);
    if ((s.reachingLeft && !wasRL) || (s.reachingRight && !wasRR)) emit('REACH', 200);
    const pointing =
      (s.reachingLeft && !s.reachingRight && s.rightHandHeight < 0) ||
      (s.reachingRight && !s.reachingLeft && s.leftHandHeight < 0);
    this.pointMs = pointing ? this.pointMs + dt * 1000 : 0;
    if (this.pointMs >= 250 && this.pointMs - dt * 1000 < 250) emit('POINT', 600);

    // --- Legs: knees & kicks (only with visible legs)
    if (s.legsVisible && f.hipsVisible) {
      const wasKL = s.kneeUpLeft;
      const wasKR = s.kneeUpRight;
      s.kneeUpLeft = latch(s.kneeUpLeft, s.leftKneeHeight, -0.9 + 0.45 * k, -0.9 + 0.3 * k);
      s.kneeUpRight = latch(s.kneeUpRight, s.rightKneeHeight, -0.9 + 0.45 * k, -0.9 + 0.3 * k);
      if (s.kneeUpLeft && !wasKL) {
        emit('KNEE_LEFT', 200);
        emit('STEP', 150);
      }
      if (s.kneeUpRight && !wasKR) {
        emit('KNEE_RIGHT', 200);
        emit('STEP', 150);
      }
      const b = this.sampleAgo(250, t);
      if (b && t > b.t) {
        const span = (t - b.t) / 1000;
        const liftL = (f.rAnk.y - f.lAnk.y) / T;
        const liftR = (f.lAnk.y - f.rAnk.y) / T;
        const vL = (b.f.lAnk.y - f.lAnk.y) / T / span;
        const vR = (b.f.rAnk.y - f.rAnk.y) / T / span;
        if (liftL > 0.45 * k && vL > 1.6 * k) emit('KICK_LEFT', 500);
        if (liftR > 0.45 * k && vR > 1.6 * k) emit('KICK_RIGHT', 500);
      }
    } else {
      s.kneeUpLeft = false;
      s.kneeUpRight = false;
    }

    // --- Flap (both arms swing down fast from above the shoulders) & clap
    const fb = this.sampleAgo(300, t);
    if (fb && t > fb.t) {
      const span = (t - fb.t) / 1000;
      const vl = (f.lWr.y - fb.f.lWr.y) / T / span;
      const vr = (f.rWr.y - fb.f.rWr.y) / T / span;
      const wasHigh = fb.f.lWr.y < fb.f.shC.y - 0.15 * T || fb.f.rWr.y < fb.f.shC.y - 0.15 * T;
      if (wasHigh && vl > 2.2 * k && vr > 2.2 * k) emit('FLAP', 300);
      const dNow = Math.hypot(f.lWr.x - f.rWr.x, f.lWr.y - f.rWr.y) / T;
      const dThen = Math.hypot(fb.f.lWr.x - fb.f.rWr.x, fb.f.lWr.y - fb.f.rWr.y) / T;
      if (dNow < 0.3 && dThen > 0.85) emit('CLAP', 400);
    }

    // --- Stillness
    const wasStill = s.still;
    const wasMoving = s.moving;
    if (s.energy < 0.22) this.stillMs += dt * 1000;
    else this.stillMs = 0;
    s.still = this.stillMs >= 350;
    s.moving = latch(s.moving, s.energy, 0.55, 0.3);
    if (s.still && !wasStill) emit('STILL');
    if (s.moving && !wasMoving) emit('MOVE');

    return s;
  }

  private detectPunch(
    side: 'left' | 'right',
    f: BodyFrame,
    t: number,
    emit: (type: MotionEvent, cooldownMs?: number) => void,
  ): void {
    const k = this.k;
    const ext = side === 'left' ? f.lArmExt : f.rArmExt;
    const handHeight = side === 'left' ? this.state.leftHandHeight : this.state.rightHandHeight;
    // A punch ends roughly at shoulder height; an arm dropping to the side or reaching straight up is not one.
    if (ext < 0.78 || handHeight > 1.0 || handHeight < -0.55) return;
    if (!(side === 'left' ? f.lWristVisible : f.rWristVisible)) return;
    let minExt = ext;
    let travel3 = 0;
    let travel2 = 0;
    let peak3 = 0;
    const T = Math.max(f.torso, 0.02);
    const rel = side === 'left' ? f.lWristRel : f.rWristRel;
    const wr = side === 'left' ? f.lWr : f.rWr;
    const sh = side === 'left' ? f.lSh : f.rSh;
    for (let i = this.history.length - 1; i >= 0; i--) {
      const h = this.history[i];
      if (t - h.t > 320) break;
      const e = side === 'left' ? h.f.lArmExt : h.f.rArmExt;
      if (e < minExt) minExt = e;
      const r = side === 'left' ? h.f.lWristRel : h.f.rWristRel;
      if (rel && r) {
        const d = Math.hypot(rel[0] - r[0], rel[1] - r[1], rel[2] - r[2]);
        travel3 = Math.max(travel3, d);
        const span = (t - h.t) / 1000;
        if (span > 0.03) peak3 = Math.max(peak3, d / span);
      }
      const w2 = side === 'left' ? h.f.lWr : h.f.rWr;
      const s2 = side === 'left' ? h.f.lSh : h.f.rSh;
      travel2 = Math.max(travel2, Math.hypot(wr.x - sh.x - (w2.x - s2.x), wr.y - sh.y - (w2.y - s2.y)) / T);
    }
    const extGain = ext - minExt;
    const fast3 = rel !== null && travel3 > 0.16 * k && peak3 > 1.1 * k;
    const fast2 = travel2 > 0.55 * k;
    if (extGain > 0.16 * k && (fast3 || fast2)) emit(side === 'left' ? 'PUNCH_LEFT' : 'PUNCH_RIGHT', 380);
  }
}
