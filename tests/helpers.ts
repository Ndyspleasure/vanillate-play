import { MotionSession } from '../src/core/session/MotionSession';
import { SimulatedProvider } from '../src/core/tracking/SimulatedProvider';
import type { MotionEvent } from '../src/core/motion/types';

/** Drives a MotionSession with simulated bodies at 30 fps of virtual time. */
export class SimRig {
  readonly session = new MotionSession();
  readonly sim: SimulatedProvider;
  now = 1000;
  readonly events: MotionEvent[][] = [[], [], [], []];

  constructor(players = 2) {
    this.sim = new SimulatedProvider(4);
    this.session.configure(players);
    this.sim.setNumPoses(players);
    this.session.mode = 'simulated';
    this.session.provider = this.sim;
  }

  async step(seconds: number): Promise<void> {
    const frames = Math.round(seconds * 30);
    for (let i = 0; i < frames; i++) {
      this.now += 1000 / 30;
      const frame = await this.sim.detect(null, this.now);
      this.session.process(frame);
      for (let p = 0; p < 4; p++) {
        for (const e of this.session.drainEvents(p)) this.events[p].push(e.type);
      }
    }
  }

  /** Stand still until calibrated. */
  async calibrate(): Promise<void> {
    await this.step(1.4);
    this.clear();
  }

  clear(): void {
    for (const e of this.events) e.length = 0;
  }

  body(i: number) {
    return this.sim.bodies[i];
  }
}
