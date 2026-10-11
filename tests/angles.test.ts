import { describe, expect, it } from 'vitest';
import { SimRig } from './helpers';

/**
 * Gesture recognition across camera placements. The simulator's `pitch` foreshortens the body
 * vertically like a camera on a high shelf or on the floor; `kickStyle: 'front'` kicks towards the
 * camera (tiny on-screen lift, large depth change).
 */
describe('camera angles', () => {
  for (const pitch of [0.3, 0.45]) {
    it(`a pitched camera (${pitch}) does not turn a weight shift into a step`, async () => {
      const rig = new SimRig(1);
      const b = rig.body(0);
      b.pitch = pitch;
      await rig.calibrate();
      // Shift the body ~0.32 torso lengths sideways: below the step threshold (0.42) in real units.
      b.baseX -= 0.32 * b.torso;
      await rig.step(1);
      b.baseX += 0.64 * b.torso;
      await rig.step(1);
      expect(rig.events[0]).not.toContain('MOVE_LEFT');
      expect(rig.events[0]).not.toContain('MOVE_RIGHT');
    });

    it(`a pitched camera (${pitch}) still sees steps, jumps and punches`, async () => {
      const rig = new SimRig(1);
      rig.body(0).pitch = pitch;
      await rig.calibrate();
      rig.body(0).step(-1);
      await rig.step(0.6);
      expect(rig.events[0]).toContain('MOVE_LEFT');
      rig.body(0).step(1);
      await rig.step(0.6);
      rig.clear();
      rig.body(0).jump();
      await rig.step(1);
      expect(rig.events[0].filter((e) => e === 'JUMP')).toHaveLength(1);
      rig.body(0).punch('right');
      await rig.step(0.6);
      expect(rig.events[0]).toContain('PUNCH_RIGHT');
    });
  }

  it('detects front kicks towards the camera', async () => {
    const rig = new SimRig(1);
    rig.body(0).kickStyle = 'front';
    await rig.calibrate();
    rig.body(0).kick('left');
    await rig.step(0.7);
    expect(rig.events[0].filter((e) => e === 'KICK_LEFT')).toHaveLength(1);
    expect(rig.events[0]).not.toContain('KICK_RIGHT');
    rig.clear();
    rig.body(0).kick('right');
    await rig.step(0.7);
    expect(rig.events[0].filter((e) => e === 'KICK_RIGHT')).toHaveLength(1);
  });

  it('standing still with a front-kick-capable recognizer emits no kicks', async () => {
    const rig = new SimRig(1);
    rig.body(0).sway = 2;
    await rig.calibrate();
    await rig.step(3);
    expect(rig.events[0]).not.toContain('KICK_LEFT');
    expect(rig.events[0]).not.toContain('KICK_RIGHT');
  });
});

describe('cropped camera views (portrait phones, creator mode)', () => {
  it('assigns two players standing close together inside a narrow visible crop', async () => {
    const rig = new SimRig(2);
    rig.sim.spread = 0.3;
    rig.sim.layout(2);
    rig.session.tracker.setVisibleRange(0.34, 0.66);
    await rig.step(1.6);
    expect(rig.session.isReady(0)).toBe(true);
    expect(rig.session.isReady(1)).toBe(true);
    expect(rig.session.tracker.extraPeople).toBe(0);
    // Player 1 is still the one on the left.
    expect(rig.session.slot(0).center.x).toBeLessThan(rig.session.slot(1).center.x);
  });
});
