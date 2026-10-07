/**
 * One Euro Filter (Casiez et al. 2012): adaptive low-pass filter that removes jitter at rest
 * while keeping latency low during fast movement — ideal for body landmarks.
 */
export class OneEuroFilter {
  private x: number | null = null;
  private dx = 0;
  private t = 0;

  constructor(
    public minCutoff = 1.5,
    public beta = 4,
    public dCutoff = 1,
  ) {}

  private static alpha(cutoff: number, dt: number): number {
    const tau = 1 / (2 * Math.PI * cutoff);
    return 1 / (1 + tau / dt);
  }

  reset(): void {
    this.x = null;
    this.dx = 0;
  }

  /** @param t time in seconds */
  filter(value: number, t: number): number {
    if (this.x === null) {
      this.x = value;
      this.t = t;
      this.dx = 0;
      return value;
    }
    const dt = Math.max(1e-3, t - this.t);
    this.t = t;
    const rawDx = (value - this.x) / dt;
    const aD = OneEuroFilter.alpha(this.dCutoff, dt);
    this.dx = this.dx + aD * (rawDx - this.dx);
    const cutoff = this.minCutoff + this.beta * Math.abs(this.dx);
    const a = OneEuroFilter.alpha(cutoff, dt);
    this.x = this.x + a * (value - this.x);
    return this.x;
  }
}

/** A bank of filters for N landmarks × (x, y, z). */
export class LandmarkFilterBank {
  private filters: OneEuroFilter[];

  constructor(
    count: number,
    minCutoff: number,
    beta: number,
  ) {
    this.filters = Array.from({ length: count * 3 }, () => new OneEuroFilter(minCutoff, beta));
  }

  reset(): void {
    for (const f of this.filters) f.reset();
  }

  apply(points: { x: number; y: number; z: number }[], tSeconds: number): void {
    const n = Math.min(points.length, this.filters.length / 3);
    for (let i = 0; i < n; i++) {
      const p = points[i];
      p.x = this.filters[i * 3].filter(p.x, tSeconds);
      p.y = this.filters[i * 3 + 1].filter(p.y, tSeconds);
      p.z = this.filters[i * 3 + 2].filter(p.z, tSeconds);
    }
  }
}
