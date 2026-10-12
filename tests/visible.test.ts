import { describe, expect, it } from 'vitest';
import { SIM_ASPECT, SimulatedProvider } from '../src/core/tracking/SimulatedProvider';
import { StageMapper } from '../src/engine/stage';

describe('simulated players on narrow screens', () => {
  it('a portrait phone only shows the middle of the frame', () => {
    const m = new StageMapper();
    m.set(360, 680, SIM_ASPECT);
    const [a, b] = m.visibleRange();
    expect(a).toBeGreaterThan(0.3);
    expect(b).toBeLessThan(0.7);
  });

  it('keyboard players stand inside the visible part of the frame', () => {
    const sim = new SimulatedProvider(4);
    sim.visible = [0.35, 0.65];
    for (const n of [1, 2, 3, 4]) {
      sim.layout(n);
      for (const body of sim.bodies.slice(0, n)) {
        expect(body.baseX / SIM_ASPECT).toBeGreaterThan(0.35);
        expect(body.baseX / SIM_ASPECT).toBeLessThan(0.65);
      }
    }
  });

  it('the whole frame is used on a wide screen', () => {
    const sim = new SimulatedProvider(2);
    sim.layout(2);
    expect(sim.bodies.map((b) => b.baseX / SIM_ASPECT)).toEqual([0.25, 0.75]);
  });
});
