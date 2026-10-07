import type { PlayerInput } from '../../engine/types';

/**
 * Detects who is still moving after FREEZE is called. Uses whole-body motion energy with a short
 * reaction grace period and requires sustained movement (not a single noisy frame) to catch someone.
 */
export class FreezeMonitor {
  private moving: number[] = [];
  private peak: number[] = [];
  /** Seconds since freeze started. */
  t = 0;

  constructor(
    private count: number,
    /** Energy above this counts as moving (torso units / second). */
    public threshold = 0.55,
    /** Reaction grace after FREEZE appears. */
    public grace = 0.45,
    /** Seconds of sustained motion needed to be caught. */
    public sustain = 0.18,
  ) {
    this.reset();
  }

  reset(): void {
    this.t = 0;
    this.moving = new Array(this.count).fill(0);
    this.peak = new Array(this.count).fill(0);
  }

  /** Returns indices of players newly caught this frame. */
  update(dt: number, input: (i: number) => PlayerInput, active: (i: number) => boolean): number[] {
    this.t += dt;
    const caught: number[] = [];
    if (this.t < this.grace) return caught;
    for (let i = 0; i < this.count; i++) {
      if (!active(i)) continue;
      const inp = input(i);
      if (inp.health !== 'ok') {
        this.moving[i] = 0;
        continue;
      }
      const e = inp.state.energy;
      this.peak[i] = Math.max(this.peak[i], e);
      if (e > this.threshold) this.moving[i] += dt;
      else this.moving[i] = Math.max(0, this.moving[i] - dt * 0.5);
      if (this.moving[i] >= this.sustain) {
        caught.push(i);
        this.moving[i] = -999; // only once per freeze
      }
    }
    return caught;
  }

  /** Stillness 0..1 for display (1 = perfectly still). */
  stillness(inp: PlayerInput): number {
    return Math.max(0, Math.min(1, 1 - inp.state.energy / (this.threshold * 1.6)));
  }

  peakEnergy(i: number): number {
    return this.peak[i];
  }
}
