/**
 * Hold-to-confirm gesture (e.g. "raise a hand to start"). A single frame never triggers: the pose
 * must be held for `holdS` seconds. Short tracking dropouts (< `graceS`) don't reset the progress,
 * and after firing (or when created with `requireRelease`) the pose must be released before the
 * gesture can fire again — so hands still up from a celebration can't start the next round.
 */
export class GestureHold {
  /** Seconds the pose has been held so far. */
  held = 0;
  private gap = 0;
  armed: boolean;

  constructor(
    public holdS = 1.2,
    public graceS = 0.3,
    private requireRelease = false,
  ) {
    this.armed = !requireRelease;
  }

  /** 0..1 progress for UI meters. */
  get progress(): number {
    return this.armed ? Math.min(1, this.held / this.holdS) : 0;
  }

  reset(requireRelease = this.requireRelease): void {
    this.held = 0;
    this.gap = 0;
    this.armed = !requireRelease;
  }

  /**
   * @param active  everyone currently holds the pose
   * @param released nobody holds the pose (arms the gesture after a previous fire)
   * @returns true exactly once when the hold completes
   */
  update(dt: number, active: boolean, released = !active): boolean {
    if (!this.armed) {
      if (released) this.armed = true;
      return false;
    }
    if (active) {
      this.held += dt;
      this.gap = 0;
    } else if (this.held > 0) {
      this.gap += dt;
      if (this.gap > this.graceS) this.held = Math.max(0, this.held - dt * 2.5);
    }
    if (this.held >= this.holdS) {
      this.held = 0;
      this.gap = 0;
      this.armed = false;
      return true;
    }
    return false;
  }
}
