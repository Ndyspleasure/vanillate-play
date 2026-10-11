import { describe, expect, it } from 'vitest';
import { crowdAdvice } from '../src/core/players/crowd';
import { inputWidthFor } from '../src/core/tracking/MediaPipeProvider';
import { SimRig } from './helpers';

const body = (x: number, scale = 0.17, present = true) => ({ present, center: { x, y: 0.5 }, scale });

describe('3–4 player framing advice', () => {
  it('flags neighbours standing shoulder to shoulder', () => {
    const a = crowdAdvice([body(0.3), body(0.45), body(1.0), body(1.4)], 0.44);
    expect(a.crowded).toEqual([[0, 1]]);
    expect(a.tooBig).toEqual([]);
  });

  it('asks a player who is too big for their strip to step back (3+ players only)', () => {
    expect(crowdAdvice([body(0.2), body(0.8, 0.3), body(1.4)], 0.44).tooBig).toEqual([1]);
    expect(crowdAdvice([body(0.4), body(1.3, 0.3)], 0.44).tooBig).toEqual([]);
  });

  it('ignores players who are not in frame', () => {
    expect(crowdAdvice([body(0.3), body(0.35, 0.17, false), body(1.2)], 0.5).crowded).toEqual([]);
  });

  it('gives crowds a sharper model input', () => {
    expect(inputWidthFor('balanced', 2)).toBe(640);
    expect(inputWidthFor('balanced', 4)).toBe(960);
    expect(inputWidthFor('performance', 3)).toBe(640);
    expect(inputWidthFor('quality', 4)).toBe(960);
  });
});

describe('four players in one camera', () => {
  it('detects and calibrates all four, ordered left to right', async () => {
    const rig = new SimRig(4);
    rig.sim.setNumPoses(4);
    await rig.step(1.8);
    for (let i = 0; i < 4; i++) expect(rig.session.isReady(i), `P${i + 1}`).toBe(true);
    const xs = [0, 1, 2, 3].map((i) => rig.session.slot(i).center.x);
    expect([...xs].sort((a, b) => a - b)).toEqual(xs);
  });

  it('keeps identities during a game while players move and jump', async () => {
    const rig = new SimRig(4);
    rig.sim.setNumPoses(4);
    await rig.calibrate();
    rig.session.lock(true);
    const before = [0, 1, 2, 3].map((i) => rig.session.slot(i).center.x);
    rig.body(1).step(1);
    rig.body(2).jump();
    rig.body(3).step(-1);
    await rig.step(1);
    rig.body(1).step(-1);
    rig.body(3).step(1);
    await rig.step(1);
    const after = [0, 1, 2, 3].map((i) => rig.session.slot(i).center.x);
    for (let i = 0; i < 4; i++) expect(Math.abs(after[i] - before[i]), `P${i + 1}`).toBeLessThan(0.05);
    expect(rig.events[2]).toContain('JUMP');
  });

  it('a player leaving and coming back keeps their slot', async () => {
    const rig = new SimRig(4);
    rig.sim.setNumPoses(4);
    await rig.calibrate();
    rig.session.lock(true);
    rig.sim.present[2] = false;
    await rig.step(2);
    expect(rig.session.health(2)).toBe('lost');
    expect(rig.session.health(3)).not.toBe('lost');
    rig.sim.present[2] = true;
    await rig.step(0.5);
    expect(rig.session.health(2)).not.toBe('lost');
    const xs = [0, 1, 2, 3].map((i) => rig.session.slot(i).center.x);
    expect([...xs].sort((a, b) => a - b)).toEqual(xs);
  });
});
