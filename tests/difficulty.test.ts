import { describe, expect, it } from 'vitest';
import { recordKey, tuneFor } from '../src/engine/hud';
import { LEVELS } from '../src/engine/types';
import { GAMES, gameById, playersForMode } from '../src/games/catalog';
import { createHarness } from './gameHarness';

describe('difficulty levels', () => {
  it('picks the value for each level', () => {
    expect(LEVELS.map((l) => tuneFor(l, 1, 2, 3))).toEqual([1, 2, 3]);
  });

  it('keeps personal bests per level apart from normal', () => {
    expect(recordKey('motion-runner', 'solo')).toBe('motion-runner:solo');
    expect(recordKey('motion-runner', 'solo', 'normal')).toBe('motion-runner:solo');
    expect(recordKey('motion-runner', 'solo', 'hard')).toBe('motion-runner:solo:hard');
  });

  for (const level of ['easy', 'hard'] as const) {
    it(`every game runs on ${level}`, async () => {
      for (const meta of GAMES) {
        const mod = await meta.load();
        const mode = meta.defaultMode;
        const h = createHarness(meta, mod.default, mode, playersForMode(meta, mode), {}, 3, level);
        h.run(45, (t, hh) => {
          if (Math.floor(t * 30) % 20 === 0) for (const inp of hh.inputs) hh.emit(inp.index, 'JUMP');
        });
        if (h.result?.record) expect(h.result.record.key.endsWith(`:${level}`)).toBe(true);
      }
    }, 60_000);
  }

  it('hard makes the solo runner faster than easy', async () => {
    const meta = gameById('motion-runner')!;
    const mod = await meta.load();
    const speed = (level: 'easy' | 'hard') => {
      const h = createHarness(meta, mod.default, 'solo', 1, {}, 5, level);
      h.run(2);
      return (h.game.inspect?.() as { baseSpeed: number }).baseSpeed;
    };
    expect(speed('hard')).toBeGreaterThan(speed('easy') * 1.3);
  });

  it('easy gives dodgers a longer warning than hard', async () => {
    const meta = gameById('motion-dodge')!;
    const mod = await meta.load();
    const firstWarn = (level: 'easy' | 'hard') => {
      const h = createHarness(meta, mod.default, 'solo', 1, {}, 9, level);
      let warn = 0;
      h.run(6, () => {
        const w = (h.game.inspect?.() as { warn?: number } | undefined)?.warn;
        if (!warn && w) warn = w;
      });
      return warn;
    };
    expect(firstWarn('easy')).toBeGreaterThan(firstWarn('hard'));
  });
});
