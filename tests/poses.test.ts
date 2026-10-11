import { describe, expect, it } from 'vitest';
import { angleDiff } from '../src/core/math';
import { matchPose, POSES, SEGMENTS, UPPER_BODY_POSES } from '../src/core/motion/pose';
import { emptyState } from '../src/core/motion/MotionRecognizer';

const DEFAULTS = {
  lUpper: -100,
  lFore: -95,
  rUpper: -80,
  rFore: -85,
  lThigh: -95,
  lShin: -92,
  rThigh: -85,
  rShin: -88,
  torso: 90,
};

/** Largest limb-direction difference (undefined segments = relaxed standing, like the ghost drawing). */
function distance(a: (typeof POSES)[number], b: (typeof POSES)[number]): number {
  let d = 0;
  for (const s of SEGMENTS)
    d = Math.max(d, angleDiff(a.angles[s] ?? DEFAULTS[s], b.angles[s] ?? DEFAULTS[s]));
  return d;
}

describe('pose library', () => {
  it('has unique ids and both languages', () => {
    expect(new Set(POSES.map((p) => p.id)).size).toBe(POSES.length);
    for (const p of POSES) expect(p.nameId, p.id).toBeTruthy();
    expect(POSES.length).toBeGreaterThanOrEqual(33);
    expect(UPPER_BODY_POSES.length).toBeGreaterThanOrEqual(25);
  });

  it('every pair of poses is clearly different (players can tell them apart, the matcher too)', () => {
    const close: string[] = [];
    for (let i = 0; i < POSES.length; i++)
      for (let j = i + 1; j < POSES.length; j++) {
        const a = POSES[i];
        const b = POSES[j];
        const sameChecks = JSON.stringify(a.checks ?? []) === JSON.stringify(b.checks ?? []);
        if (sameChecks && distance(a, b) < 30) close.push(`${a.id} ~ ${b.id}`);
      }
    expect(close).toEqual([]);
  });

  it('a body in exactly the target pose matches it best', () => {
    const angleOnly = UPPER_BODY_POSES.filter((p) => !p.checks?.length);
    for (const def of angleOnly) {
      const v = {
        angles: Object.fromEntries(SEGMENTS.map((s) => [s, def.angles[s] ?? 0])) as Record<
          (typeof SEGMENTS)[number],
          number
        >,
        legs: false,
      };
      const st = emptyState();
      const own = matchPose(def, st, v);
      for (const other of angleOnly) {
        if (other === def || distance(def, other) < 30) continue;
        expect(matchPose(other, st, v), `${def.id} vs ${other.id}`).toBeLessThan(own);
      }
    }
  });
});

describe('dance charts', () => {
  it('every chart uses known poses in ascending beats', async () => {
    const { CHARTS, UPPER_BODY_SWAP } = await import('../src/games/dance-battle/charts');
    const ids = new Set(POSES.map((p) => p.id));
    for (const c of CHARTS) {
      expect(c.steps.length, c.id).toBeGreaterThanOrEqual(16);
      for (let i = 0; i < c.steps.length; i++) {
        expect(ids.has(c.steps[i][1]), `${c.id}: ${c.steps[i][1]}`).toBe(true);
        if (i) expect(c.steps[i][0]).toBeGreaterThan(c.steps[i - 1][0]);
      }
    }
    for (const v of Object.values(UPPER_BODY_SWAP)) expect(ids.has(v)).toBe(true);
  });

  it('each song is offered in the catalog and plays to the end', async () => {
    const { CHARTS } = await import('../src/games/dance-battle/charts');
    const { gameById } = await import('../src/games/catalog');
    const { createHarness } = await import('./gameHarness');
    const meta = gameById('dance-battle')!;
    const song = meta.options!.find((o) => o.id === 'song')!;
    expect(song.choices.map((c) => c.value).sort()).toEqual(['freestyle', ...CHARTS.map((c) => c.id)].sort());
    const mod = await meta.load();
    for (const c of CHARTS) {
      const h = createHarness(meta, mod.default, 'versus', 2, { song: c.id });
      expect((h.game.inspect!() as { bpm: number }).bpm).toBe(c.bpm);
      h.run(120);
      expect(h.result, c.id).not.toBeNull();
    }
  });

  it('easy thins quick doubles out of a chart', async () => {
    const { chartById, thinSteps } = await import('../src/games/dance-battle/charts');
    const pop = chartById('pop-party')!;
    const easy = thinSteps(pop.steps, 2);
    expect(easy.length).toBeLessThan(pop.steps.length);
    for (let i = 1; i < easy.length; i++) expect(easy[i][0] - easy[i - 1][0]).toBeGreaterThanOrEqual(2);
  });
});
