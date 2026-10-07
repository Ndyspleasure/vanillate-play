import { median, smoothFactor } from '../math';
import type { BodyFrame } from '../motion/features';

/** Standing baseline for one player, captured automatically while they stand still. */
export interface BodyCalibration {
  centerX: number;
  shoulderY: number;
  hipY: number;
  noseY: number;
  ankleY: number | null;
  torso: number;
  shoulderWidth: number;
  fullBody: boolean;
  t: number;
}

export type BodyIssue = 'too-close' | 'too-far' | 'feet-hidden' | 'head-hidden' | 'hips-hidden' | 'moving' | 'arms-up';

/** Wrist height above the shoulder line (torso units) that counts as "arms up" during setup. */
const ARMS_UP = 0.3;

/** How long a player must stand naturally before the baseline locks in. */
export const CALIBRATION_MS = 800;

/** Quick framing diagnostics used by camera check / lobby guidance. */
export function bodyIssues(f: BodyFrame, energy: number): BodyIssue[] {
  const issues: BodyIssue[] = [];
  if (f.torso > 0.33 || (f.noseVisible && f.nose.y < 0.04)) issues.push('too-close');
  else if (f.torso < 0.085) issues.push('too-far');
  if (!f.noseVisible) issues.push('head-hidden');
  if (!f.hipsVisible) issues.push('hips-hidden');
  else if (!f.anklesVisible) issues.push('feet-hidden');
  if (energy > 0.9) issues.push('moving');
  if ((f.lWristVisible && f.lWr.y < f.shC.y - f.torso * ARMS_UP) || (f.rWristVisible && f.rWr.y < f.shC.y - f.torso * ARMS_UP)) issues.push('arms-up');
  return issues;
}

export class CalibrationTracker {
  calibration: BodyCalibration | null = null;
  /** 0..1 while collecting samples. */
  progress = 0;
  private samples: BodyFrame[] = [];
  private stableMs = 0;
  private lastT = 0;
  private scaleDriftMs = 0;

  reset(): void {
    this.calibration = null;
    this.progress = 0;
    this.samples = [];
    this.stableMs = 0;
    this.lastT = 0;
  }

  get done(): boolean {
    return this.calibration !== null;
  }

  private isNeutral(f: BodyFrame, energy: number): boolean {
    // The baseline doesn't depend on the arms, so only clearly raised hands (well above the
    // shoulders) block calibration. Hands outside the frame (common when close) count as down.
    const down = (wr: { y: number }, visible: boolean) => !visible || wr.y > f.shC.y - f.torso * ARMS_UP;
    const handsDown = down(f.lWr, f.lWristVisible) && down(f.rWr, f.rWristVisible);
    const upright = Math.abs(f.shC.x - f.hipC.x) < f.torso * 0.18;
    return energy < 0.45 && handsDown && upright && f.quality > 0.55;
  }

  /** Feed a frame while not yet calibrated. Returns true when calibration completes. */
  collect(f: BodyFrame, energy: number): boolean {
    if (this.calibration) return false;
    const dt = this.lastT ? Math.min(200, f.t - this.lastT) : 0;
    this.lastT = f.t;
    const tooClose = f.torso > 0.36;
    if (this.isNeutral(f, energy) && !tooClose) {
      this.stableMs += dt;
      this.samples.push(f);
      if (this.samples.length > 40) this.samples.shift();
    } else {
      this.stableMs = Math.max(0, this.stableMs - dt * 2);
      if (this.stableMs === 0) this.samples = [];
    }
    this.progress = Math.min(1, this.stableMs / CALIBRATION_MS);
    if (this.stableMs >= CALIBRATION_MS && this.samples.length >= 4) {
      this.calibration = this.compute(this.samples, f.t);
      this.progress = 1;
      return true;
    }
    return false;
  }

  private compute(samples: BodyFrame[], t: number): BodyCalibration {
    const anklesOk = samples.filter((s) => s.anklesVisible);
    return {
      centerX: median(samples.map((s) => s.center.x)),
      shoulderY: median(samples.map((s) => s.shC.y)),
      hipY: median(samples.map((s) => s.hipC.y)),
      noseY: median(samples.map((s) => s.nose.y)),
      ankleY: anklesOk.length > samples.length / 2 ? median(anklesOk.map((s) => (s.lAnk.y + s.rAnk.y) / 2)) : null,
      torso: median(samples.map((s) => s.torso)),
      shoulderWidth: median(samples.map((s) => s.shoulderWidth)),
      fullBody: anklesOk.length > samples.length / 2,
      t,
    };
  }

  /** Force a calibration from the current frame (used by simulated players and tests). */
  force(f: BodyFrame): void {
    this.calibration = this.compute([f], f.t);
    this.progress = 1;
  }

  /**
   * Slowly follow the player's neutral stance so the baseline survives small drifts (stepping
   * closer/farther from the camera). Large, sustained scale changes re-baseline immediately.
   */
  adapt(f: BodyFrame, energy: number, active: boolean, dtSec: number): void {
    const c = this.calibration;
    if (!c || !this.isNeutral(f, energy) || active) {
      this.scaleDriftMs = 0;
      return;
    }
    const ratio = f.torso / c.torso;
    if (ratio > 1.25 || ratio < 0.8) {
      this.scaleDriftMs += dtSec * 1000;
      if (this.scaleDriftMs > 1500) {
        this.calibration = this.compute([f], f.t);
        this.scaleDriftMs = 0;
      }
      return;
    }
    this.scaleDriftMs = 0;
    const a = smoothFactor(dtSec, 3.5);
    // Only re-centre while the player stands near their spot: someone waiting in the left or right
    // zone must not drag the baseline along (that made later left/right moves stop registering).
    if (Math.abs(f.center.x - c.centerX) < c.torso * 0.2) c.centerX += (f.center.x - c.centerX) * a;
    c.shoulderY += (f.shC.y - c.shoulderY) * a;
    c.hipY += (f.hipC.y - c.hipY) * a;
    c.noseY += (f.nose.y - c.noseY) * a;
    c.torso += (f.torso - c.torso) * a;
    c.shoulderWidth += (f.shoulderWidth - c.shoulderWidth) * a;
    if (c.ankleY !== null && f.anklesVisible) c.ankleY += ((f.lAnk.y + f.rAnk.y) / 2 - c.ankleY) * a;
  }
}
