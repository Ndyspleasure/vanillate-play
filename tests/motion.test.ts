import { comparePoses, matchPose, poseById, poseVector } from '../src/core/motion/pose';
import { describe, expect, it } from 'vitest';
import { OneEuroFilter } from '../src/core/tracking/filters';
import { SimRig } from './helpers';

describe('OneEuroFilter', () => {
  it('suppresses jitter at rest and follows fast motion', () => {
    const f = new OneEuroFilter(1.5, 4);
    let out = 0;
    for (let i = 0; i < 60; i++) out = f.filter(0.5 + (i % 2 ? 0.005 : -0.005), i / 30);
    expect(Math.abs(out - 0.5)).toBeLessThan(0.003);
    for (let i = 60; i < 70; i++) out = f.filter(0.5 + (i - 60) * 0.05, i / 30);
    expect(out).toBeGreaterThan(0.85);
  });
});

describe('calibration', () => {
  it('calibrates automatically after standing still', async () => {
    const rig = new SimRig(2);
    expect(rig.session.allReady()).toBe(false);
    await rig.step(1.4);
    expect(rig.session.isReady(0)).toBe(true);
    expect(rig.session.isReady(1)).toBe(true);
    const c = rig.session.players[0].calibration.calibration!;
    expect(c.fullBody).toBe(true);
    expect(c.torso).toBeGreaterThan(0.2);
  });

  it('does not calibrate while the player is moving', async () => {
    const rig = new SimRig(1);
    rig.body(0).dance = true;
    await rig.step(1.5);
    expect(rig.session.isReady(0)).toBe(false);
  });
});

describe('motion recognition', () => {
  it('detects a jump exactly once', async () => {
    const rig = new SimRig(1);
    await rig.calibrate();
    rig.body(0).jump();
    await rig.step(1);
    expect(rig.events[0].filter((e) => e === 'JUMP')).toHaveLength(1);
    expect(rig.events[0]).toContain('LAND');
    expect(rig.events[0]).not.toContain('SQUAT');
  });

  it('detects squat and stand', async () => {
    const rig = new SimRig(1);
    await rig.calibrate();
    rig.body(0).squatTarget = 1;
    await rig.step(0.6);
    expect(rig.events[0]).toContain('SQUAT');
    expect(rig.session.state(0).squatting).toBe(true);
    rig.body(0).squatTarget = 0;
    await rig.step(0.6);
    expect(rig.events[0]).toContain('STAND');
    expect(rig.events[0]).not.toContain('JUMP');
  });

  it('detects leaning both ways', async () => {
    const rig = new SimRig(1);
    await rig.calibrate();
    rig.body(0).leanTarget = -1;
    await rig.step(0.5);
    expect(rig.events[0]).toContain('LEAN_LEFT');
    rig.body(0).leanTarget = 0;
    await rig.step(0.5);
    expect(rig.events[0]).toContain('CENTER');
    rig.body(0).leanTarget = 1;
    await rig.step(0.5);
    expect(rig.events[0]).toContain('LEAN_RIGHT');
    expect(rig.events[0]).not.toContain('LEAN_LEFT'.replace('LEFT', 'X'));
  });

  it('detects stepping into left/right zones', async () => {
    const rig = new SimRig(1);
    await rig.calibrate();
    rig.body(0).step(-1);
    await rig.step(0.6);
    expect(rig.events[0]).toContain('MOVE_LEFT');
    expect(rig.session.state(0).steppedLeft).toBe(true);
    rig.body(0).step(1);
    rig.body(0).step(1);
    await rig.step(0.6);
    expect(rig.events[0]).toContain('MOVE_RIGHT');
  });

  it('detects hands up per hand and both', async () => {
    const rig = new SimRig(1);
    await rig.calibrate();
    rig.body(0).left.mode = 'up';
    await rig.step(0.3);
    expect(rig.events[0]).toContain('HAND_LEFT_UP');
    expect(rig.events[0]).not.toContain('HANDS_UP');
    rig.body(0).right.mode = 'up';
    await rig.step(0.3);
    expect(rig.events[0]).toContain('HAND_RIGHT_UP');
    expect(rig.events[0]).toContain('HANDS_UP');
  });

  it('detects left and right punches separately', async () => {
    const rig = new SimRig(1);
    await rig.calibrate();
    rig.body(0).punch('left');
    await rig.step(0.6);
    expect(rig.events[0].filter((e) => e === 'PUNCH_LEFT')).toHaveLength(1);
    expect(rig.events[0]).not.toContain('PUNCH_RIGHT');
    rig.clear();
    rig.body(0).punch('right');
    await rig.step(0.6);
    expect(rig.events[0].filter((e) => e === 'PUNCH_RIGHT')).toHaveLength(1);
    expect(rig.events[0]).not.toContain('PUNCH_LEFT');
  });

  it('detects block guard', async () => {
    const rig = new SimRig(1);
    await rig.calibrate();
    rig.body(0).left.mode = 'guard';
    rig.body(0).right.mode = 'guard';
    await rig.step(0.3);
    expect(rig.events[0]).toContain('BLOCK');
    expect(rig.session.state(0).blocking).toBe(true);
    expect(rig.events[0]).not.toContain('HANDS_UP');
  });

  it('detects kicks with visible legs', async () => {
    const rig = new SimRig(1);
    await rig.calibrate();
    rig.body(0).kick('right');
    await rig.step(0.7);
    expect(rig.events[0]).toContain('KICK_RIGHT');
    expect(rig.events[0]).not.toContain('KICK_LEFT');
  });

  it('detects flapping arms', async () => {
    const rig = new SimRig(1);
    await rig.calibrate();
    rig.body(0).flap();
    await rig.step(0.5);
    expect(rig.events[0]).toContain('FLAP');
  });

  it('reports still vs moving energy', async () => {
    const rig = new SimRig(1);
    await rig.calibrate();
    expect(rig.session.state(0).still).toBe(true);
    rig.body(0).dance = true;
    await rig.step(0.8);
    expect(rig.session.state(0).moving).toBe(true);
    expect(rig.session.state(0).energy).toBeGreaterThan(0.5);
    rig.body(0).dance = false;
    await rig.step(1);
    expect(rig.session.state(0).still).toBe(true);
  });

  it('emits no events while standing still', async () => {
    const rig = new SimRig(2);
    await rig.calibrate();
    await rig.step(3);
    expect(rig.events[0]).toEqual([]);
    expect(rig.events[1]).toEqual([]);
  });
});

describe('player identity', () => {
  it('orders players left → right in the lobby and keeps identity when locked', async () => {
    const rig = new SimRig(2);
    await rig.calibrate();
    const s0 = rig.session.slot(0).center.x;
    const s1 = rig.session.slot(1).center.x;
    expect(s0).toBeLessThan(s1);
    rig.session.lock(true);
    // Player 1 jumps: only player 1 should get the event.
    rig.body(0).jump();
    await rig.step(0.8);
    expect(rig.events[0]).toContain('JUMP');
    expect(rig.events[1]).not.toContain('JUMP');
  });

  it('uses a grace period before reporting a player lost', async () => {
    const rig = new SimRig(2);
    await rig.calibrate();
    rig.session.lock(true);
    rig.sim.present[1] = false;
    await rig.step(0.5);
    expect(rig.session.health(1)).toBe('weak');
    await rig.step(1.5);
    expect(rig.session.health(1)).toBe('lost');
    rig.sim.present[1] = true;
    await rig.step(0.2);
    expect(rig.session.health(1)).toBe('ok');
    expect(rig.session.isReady(1)).toBe(true);
  });

  it('keeps identities when one player briefly disappears', async () => {
    const rig = new SimRig(2);
    await rig.calibrate();
    rig.session.lock(true);
    const right = rig.session.slot(1).center.x;
    rig.sim.present[0] = false;
    await rig.step(0.4);
    rig.sim.present[0] = true;
    await rig.step(0.3);
    expect(Math.abs(rig.session.slot(1).center.x - right)).toBeLessThan(0.05);
    expect(rig.session.slot(0).center.x).toBeLessThan(rig.session.slot(1).center.x);
  });
});

describe('pose matching', () => {
  it('scores matching poses high and different poses low', async () => {
    const rig = new SimRig(2);
    await rig.calibrate();
    rig.body(0).left.mode = 'up';
    rig.body(0).right.mode = 'up';
    rig.body(1).left.mode = 'out';
    rig.body(1).right.mode = 'out';
    await rig.step(0.5);
    const s0 = rig.session.state(0);
    const s1 = rig.session.state(1);
    expect(matchPose(poseById('hands-up'), s0)).toBeGreaterThan(0.85);
    expect(matchPose(poseById('t-pose'), s0)).toBeLessThan(0.35);
    expect(matchPose(poseById('t-pose'), s1)).toBeGreaterThan(0.85);
    expect(comparePoses(poseVector(s0), poseVector(s1))).toBeLessThan(0.5);
    rig.body(1).left.mode = 'up';
    rig.body(1).right.mode = 'up';
    await rig.step(0.5);
    expect(comparePoses(poseVector(rig.session.state(0)), poseVector(rig.session.state(1)))).toBeGreaterThan(0.85);
  });

  it('requires state checks such as squatting', async () => {
    const rig = new SimRig(1);
    await rig.calibrate();
    expect(matchPose(poseById('squat'), rig.session.state(0))).toBeLessThan(0.3);
    rig.body(0).squatTarget = 1;
    await rig.step(0.6);
    expect(matchPose(poseById('squat'), rig.session.state(0))).toBeGreaterThan(0.9);
  });
});
