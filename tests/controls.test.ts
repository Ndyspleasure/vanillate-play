import { describe, expect, it } from 'vitest';
import { GestureHold } from '../src/core/motion/gesture';
import { PracticeTracker, practiceSteps } from '../src/core/motion/practice';
import { limitJumps } from '../src/core/players/PlayerTracker';
import { MutableInput } from '../src/engine/input';
import { Runner } from '../src/games/kits/lanes';
import { SimRig } from './helpers';

describe('GestureHold (raise a hand to start)', () => {
  const dt = 1 / 30;
  const run = (g: GestureHold, secs: number, active: boolean) => {
    let fired = 0;
    for (let i = 0; i < Math.round(secs / dt); i++) if (g.update(dt, active)) fired++;
    return fired;
  };

  it('never fires from a single frame', () => {
    const g = new GestureHold(1, 0.3);
    expect(g.update(dt, true)).toBe(false);
    expect(run(g, 0.5, false)).toBe(0);
    expect(g.progress).toBe(0);
  });

  it('fires exactly once after holding, then needs a release', () => {
    const g = new GestureHold(1, 0.3);
    expect(run(g, 1.2, true)).toBe(1);
    expect(run(g, 3, true)).toBe(0);
    run(g, 0.2, false);
    expect(run(g, 1.2, true)).toBe(1);
  });

  it('forgives short tracking dropouts', () => {
    const g = new GestureHold(1, 0.3);
    run(g, 0.6, true);
    run(g, 0.15, false);
    expect(run(g, 0.5, true)).toBe(1);
  });

  it('requires hands to come down first when armed with requireRelease', () => {
    const g = new GestureHold(1, 0.3, true);
    expect(run(g, 2, true)).toBe(0);
    run(g, 0.1, false);
    expect(run(g, 1.1, true)).toBe(1);
  });
});

describe('tutorial practice', () => {
  it('turns a game’s moves into a short list of steps, keeping left/right together', () => {
    expect(practiceSteps(['lean', 'jump', 'squat']).map((s) => s.id)).toEqual(['left', 'right', 'jump', 'squat']);
    expect(practiceSteps(['punch', 'block', 'lean']).map((s) => s.id)).toEqual(['punch', 'block', 'left', 'right']);
    expect(practiceSteps(['punch', 'block', 'jump', 'lean']).map((s) => s.id)).toEqual(['punch', 'block', 'jump']);
    expect(practiceSteps(['dance', 'still']).map((s) => s.id)).toEqual(['dance']);
    expect(practiceSteps(['still']).map((s) => s.id)).toEqual(['hands']);
  });

  it('checks off moves per player from real recognized motion', async () => {
    const rig = new SimRig(2);
    await rig.calibrate();
    const tracker = new PracticeTracker(practiceSteps(['lean', 'jump']), 2);
    const feed = () => {
      for (let p = 0; p < 2; p++) tracker.feed(p, rig.events[p]);
      rig.clear();
    };
    rig.body(0).step(-1);
    await rig.step(0.5);
    feed();
    expect(tracker.done[0]).toEqual([true, false, false]);
    expect(tracker.done[1]).toEqual([false, false, false]);
    rig.body(0).step(1);
    rig.body(0).step(1);
    rig.body(0).jump();
    rig.body(1).leanTarget = -1;
    await rig.step(0.8);
    feed();
    expect(tracker.playerDone(0)).toBe(true);
    expect(tracker.done[1]).toEqual([true, false, false]);
    expect(tracker.allDone).toBe(false);
  });
});

describe('left / right zones', () => {
  it('emits exactly one MOVE_LEFT for a step + lean to the left', async () => {
    const rig = new SimRig(1);
    await rig.calibrate();
    rig.body(0).step(-1);
    rig.body(0).leanTarget = -1;
    await rig.step(0.8);
    expect(rig.events[0].filter((e) => e === 'MOVE_LEFT')).toHaveLength(1);
    expect(rig.events[0]).not.toContain('MOVE_RIGHT');
    expect(rig.session.state(0).zone).toBe(-1);
  });

  it('returns to centre with CENTER and goes right with MOVE_RIGHT', async () => {
    const rig = new SimRig(1);
    await rig.calibrate();
    rig.body(0).step(-1);
    await rig.step(0.6);
    rig.clear();
    rig.body(0).step(1);
    await rig.step(0.6);
    expect(rig.events[0].filter((e) => e === 'CENTER')).toHaveLength(1);
    expect(rig.events[0]).not.toContain('MOVE_RIGHT');
    expect(rig.events[0]).not.toContain('MOVE_LEFT');
    expect(rig.session.state(0).zone).toBe(0);
    rig.body(0).step(1);
    await rig.step(0.6);
    expect(rig.events[0].filter((e) => e === 'MOVE_RIGHT')).toHaveLength(1);
    expect(rig.session.state(0).zone).toBe(1);
  });

  it('keeps the standing spot while a player waits in a side zone', async () => {
    const rig = new SimRig(1);
    await rig.calibrate();
    rig.body(0).step(-1);
    await rig.step(6);
    expect(rig.session.state(0).zone).toBe(-1);
    rig.clear();
    rig.body(0).step(1);
    rig.body(0).step(1);
    await rig.step(0.6);
    expect(rig.events[0]).toContain('MOVE_RIGHT');
  });

  it('drives runner lanes from where the body stands (never two lanes per step)', async () => {
    const rig = new SimRig(1);
    await rig.calibrate();
    const runner = new Runner();
    const inp = new MutableInput(0, rig.session.state(0));
    const tick = async (secs: number) => {
      for (let i = 0; i < Math.round(secs * 30); i++) {
        await rig.step(1 / 30);
        inp.state = rig.session.state(0);
        inp.clearEvents();
        for (const e of rig.session.drainEvents(0)) inp.push(e.type, e.t);
        runner.control(inp);
      }
    };
    await tick(0.3);
    expect(runner.lane).toBe(1);
    rig.body(0).step(-1);
    rig.body(0).leanTarget = -1;
    await tick(0.6);
    expect(runner.lane).toBe(0);
    rig.body(0).leanTarget = 0;
    rig.body(0).step(1);
    await tick(0.6);
    expect(runner.lane).toBe(1);
    rig.body(0).step(1);
    await tick(0.6);
    expect(runner.lane).toBe(2);
  });
});

describe('jump robustness', () => {
  it('does not report a jump when the player walks towards the camera', async () => {
    const rig = new SimRig(1);
    await rig.calibrate();
    const body = rig.body(0);
    // Camera at chest height: getting closer scales the body around the middle of the frame.
    const t0 = body.torso;
    const g0 = body.ground;
    for (let i = 1; i <= 15; i++) {
      const s = 1 + i * 0.02;
      body.torso = t0 * s;
      body.ground = 0.5 + (g0 - 0.5) * s;
      await rig.step(1 / 30);
    }
    await rig.step(0.5);
    expect(rig.events[0]).not.toContain('JUMP');
  });

  it('detects consecutive jumps once each', async () => {
    const rig = new SimRig(1);
    await rig.calibrate();
    for (let n = 0; n < 3; n++) {
      rig.body(0).jump();
      await rig.step(0.9);
    }
    expect(rig.events[0].filter((e) => e === 'JUMP')).toHaveLength(3);
  });
});

describe('hand raise', () => {
  it('reports a single raised hand for the start gesture', async () => {
    const rig = new SimRig(1);
    await rig.calibrate();
    expect(rig.session.state(0).handRaised).toBe(false);
    rig.body(0).right.mode = 'up';
    await rig.step(0.3);
    expect(rig.session.state(0).handRaised).toBe(true);
    expect(rig.session.state(0).handsUp).toBe(false);
  });
});

describe('rematch reset', () => {
  it('keeps calibration and identities but clears queued events and latches', async () => {
    const rig = new SimRig(2);
    await rig.calibrate();
    rig.body(0).left.mode = 'up';
    rig.body(0).right.mode = 'up';
    await rig.step(0.3);
    rig.session.resetMatch();
    expect(rig.session.allReady()).toBe(true);
    expect(rig.session.drainEvents(0)).toHaveLength(0);
    expect(rig.session.state(0).handsUp).toBe(false);
    rig.body(0).left.mode = 'down';
    rig.body(0).right.mode = 'down';
    rig.body(0).jump();
    await rig.step(0.9);
    expect(rig.events[0]).toContain('JUMP');
  });
});

describe('landmark outlier limiting', () => {
  it('limits jumps of low-visibility landmarks only', () => {
    const prev = [
      { x: 0.5, y: 0.5, z: 0, v: 0.9 },
      { x: 0.5, y: 0.5, z: 0, v: 0.2 },
    ];
    const pts = [
      { x: 0.9, y: 0.5, z: 0, v: 0.9 },
      { x: 0.9, y: 0.5, z: 0, v: 0.2 },
    ];
    limitJumps(pts, prev, 0.1);
    expect(pts[0].x).toBeCloseTo(0.9);
    expect(pts[1].x).toBeCloseTo(0.6);
  });
});
