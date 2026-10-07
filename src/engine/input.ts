import type { Point } from '../core/math';
import { poseVector, type PoseVector } from '../core/motion/pose';
import type { MotionEvent, MotionState } from '../core/motion/types';
import type { MotionSession, TrackingHealth } from '../core/session/MotionSession';
import { LM } from '../core/tracking/landmarks';
import type { Landmark } from '../core/tracking/types';
import type { StageMapper } from './stage';
import type { PlayerInput } from './types';

/** Mutable PlayerInput implementation (also used directly by tests and AI-driven players). */
export class MutableInput implements PlayerInput {
  health: TrackingHealth = 'ok';
  events: MotionEvent[] = [];
  eventTimes = new Map<MotionEvent, number>();
  state: MotionState;
  pose: PoseVector;
  head: Point = { x: 0, y: 0 };
  headRadius = 30;
  leftHand: Point = { x: 0, y: 0 };
  rightHand: Point = { x: 0, y: 0 };
  leftElbow: Point = { x: 0, y: 0 };
  rightElbow: Point = { x: 0, y: 0 };
  leftFoot: Point = { x: 0, y: 0 };
  rightFoot: Point = { x: 0, y: 0 };
  leftKnee: Point = { x: 0, y: 0 };
  rightKnee: Point = { x: 0, y: 0 };
  shoulders: Point = { x: 0, y: 0 };
  hips: Point = { x: 0, y: 0 };
  center: Point = { x: 0, y: 0 };
  torsoPx = 100;
  skeleton: (Point | null)[] = new Array(33).fill(null);

  constructor(
    readonly index: number,
    state: MotionState,
  ) {
    this.state = state;
    this.pose = poseVector(state);
  }

  has(e: MotionEvent): boolean {
    return this.events.includes(e);
  }

  any(...e: MotionEvent[]): boolean {
    for (const x of e) if (this.events.includes(x)) return true;
    return false;
  }

  push(e: MotionEvent, t = performance.now()): void {
    this.events.push(e);
    this.eventTimes.set(e, t);
  }

  clearEvents(): void {
    this.events.length = 0;
    this.eventTimes.clear();
  }
}

/** How far ahead (ms) a pose may be predicted from its last two samples. */
const EXTRAPOLATE_MS = 60;
/** Render smoothing time constant (s): tracking arrives at 15–30 fps, rendering at 60+. */
const SMOOTH_TAU = 0.035;

/**
 * Builds per-frame PlayerInputs from the motion session, mapped to stage pixels.
 *
 * Tracking runs slower than rendering, so drawing the latest pose directly looks choppy. Each
 * render frame the skeleton is predicted slightly ahead from the last two tracking samples
 * (hiding inference latency) and then eased towards that target, which gives continuous motion
 * without teleporting; a freshly (re)acquired player snaps into place instead of sliding in.
 */
export class InputHub {
  private inputs: MutableInput[] = [];
  /** Smoothed view-space landmark positions per player (x, y pairs). */
  private display: (Float32Array | null)[] = [];
  private lastNow: number[] = [];

  constructor(
    private session: MotionSession,
    private mapper: StageMapper,
  ) {}

  get(i: number): MutableInput {
    let inp = this.inputs[i];
    if (!inp) {
      inp = new MutableInput(i, this.session.state(i));
      this.inputs[i] = inp;
    }
    return inp;
  }

  /** Refresh all inputs; `consume` drains queued motion events into this frame. */
  frame(count: number, now: number, consume: boolean): void {
    for (let i = 0; i < count; i++) {
      const inp = this.get(i);
      const sp = this.session.players[i];
      inp.health = this.session.health(i);
      inp.state = this.session.state(i);
      inp.clearEvents();
      if (consume) {
        for (const e of this.session.drainEvents(i)) {
          inp.events.push(e.type);
          inp.eventTimes.set(e.type, e.t);
        }
      }
      const cur = sp.lastPose;
      if (!cur) {
        this.display[i] = null;
        continue;
      }
      inp.pose = poseVector(inp.state);
      const prev = sp.prevPose;
      let k = 0;
      if (prev && inp.health === 'ok') {
        const span = cur.t - prev.t;
        if (span > 5 && span < 150) k = (Math.min(now - cur.t, EXTRAPOLATE_MS, span) * 0.8) / span;
        if (k < 0) k = 0;
      }
      const pts = cur.pts;
      const ppts = prev?.pts;

      // Ease the displayed skeleton towards the (predicted) target.
      let disp = this.display[i];
      const dt = this.lastNow[i] ? Math.min(0.1, Math.max(0, (now - this.lastNow[i]) / 1000)) : 0;
      this.lastNow[i] = now;
      const reacquired = !disp;
      if (!disp) {
        disp = new Float32Array(66);
        this.display[i] = disp;
      }
      const a = reacquired || dt === 0 ? 1 : 1 - Math.exp(-dt / SMOOTH_TAU);
      // Large jumps (identity re-acquired elsewhere) snap rather than glide across the screen.
      const snapDist = Math.max(0.05, inp.state.torso * 1.5);
      for (let j = 0; j < 33; j++) {
        const p = pts[j];
        const b = ppts ? ppts[j] : p;
        const tx = p.x + (p.x - b.x) * k;
        const ty = p.y + (p.y - b.y) * k;
        const dx = tx - disp[j * 2];
        const dy = ty - disp[j * 2 + 1];
        const f = a === 1 || Math.abs(dx) + Math.abs(dy) > snapDist ? 1 : a;
        disp[j * 2] += dx * f;
        disp[j * 2 + 1] += dy * f;
      }
      const map = (idx: number, out: Point): Point => {
        out.x = this.mapper.offX + disp[idx * 2] * this.mapper.scale;
        out.y = this.mapper.offY + disp[idx * 2 + 1] * this.mapper.scale;
        return out;
      };
      for (let j = 0; j < 33; j++) {
        const lm: Landmark = pts[j];
        if (lm.v < 0.4) {
          inp.skeleton[j] = null;
          continue;
        }
        inp.skeleton[j] = map(j, inp.skeleton[j] ?? { x: 0, y: 0 });
      }
      map(LM.nose, inp.head);
      map(LM.leftWrist, inp.leftHand);
      map(LM.rightWrist, inp.rightHand);
      map(LM.leftElbow, inp.leftElbow);
      map(LM.rightElbow, inp.rightElbow);
      map(LM.leftAnkle, inp.leftFoot);
      map(LM.rightAnkle, inp.rightFoot);
      map(LM.leftKnee, inp.leftKnee);
      map(LM.rightKnee, inp.rightKnee);
      const ls = map(LM.leftShoulder, this.tmpA);
      const rs = map(LM.rightShoulder, this.tmpB);
      inp.shoulders.x = (ls.x + rs.x) / 2;
      inp.shoulders.y = (ls.y + rs.y) / 2;
      inp.torsoPx = inp.state.torso * this.mapper.scale;
      inp.hips.x = this.mapper.offX + inp.state.hipC.x * this.mapper.scale;
      inp.hips.y = this.mapper.offY + inp.state.hipC.y * this.mapper.scale;
      inp.center.x = (inp.shoulders.x + inp.hips.x) / 2;
      inp.center.y = (inp.shoulders.y + inp.hips.y) / 2;
      inp.headRadius = Math.max(14, inp.torsoPx * 0.3);
      // Lift the head marker from the nose to the middle of the head.
      inp.head.y -= inp.headRadius * 0.25;
    }
  }

  private tmpA: Point = { x: 0, y: 0 };
  private tmpB: Point = { x: 0, y: 0 };
}
