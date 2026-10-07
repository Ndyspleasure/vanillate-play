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

const EXTRAPOLATE_MS = 40;

/** Builds per-frame PlayerInputs from the motion session, mapped to stage pixels. */
export class InputHub {
  private inputs: MutableInput[] = [];

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
      if (!cur) continue;
      inp.pose = poseVector(inp.state);
      const prev = sp.prevPose;
      let k = 0;
      if (prev && inp.health === 'ok') {
        const span = cur.t - prev.t;
        if (span > 5 && span < 150) k = (Math.min(now - cur.t, EXTRAPOLATE_MS) * 0.8) / span;
        if (k < 0) k = 0;
      }
      const pts = cur.pts;
      const ppts = prev?.pts;
      const map = (idx: number, out: Point): Point => {
        const a = pts[idx];
        const b = ppts ? ppts[idx] : a;
        const x = a.x + (a.x - b.x) * k;
        const y = a.y + (a.y - b.y) * k;
        out.x = this.mapper.offX + x * this.mapper.scale;
        out.y = this.mapper.offY + y * this.mapper.scale;
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
      const ls = map(LM.leftShoulder, { x: 0, y: 0 });
      const rs = map(LM.rightShoulder, { x: 0, y: 0 });
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
}
