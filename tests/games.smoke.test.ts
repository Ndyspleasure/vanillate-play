import { describe, expect, it } from 'vitest';
import { GAMES, playersForMode } from '../src/games/catalog';
import type { MotionEvent } from '../src/core/motion/types';
import { createHarness } from './gameHarness';

const RANDOM_EVENTS: MotionEvent[] = ['JUMP', 'SQUAT', 'HANDS_UP', 'PUNCH_LEFT', 'PUNCH_RIGHT', 'MOVE_LEFT', 'MOVE_RIGHT', 'LEAN_LEFT', 'LEAN_RIGHT', 'KICK_LEFT', 'KICK_RIGHT', 'FLAP', 'BLOCK', 'STEP'];

describe('every game runs headless in every mode', () => {
  for (const meta of GAMES) {
    for (const mode of meta.modes) {
      it(`${meta.id} · ${mode}`, async () => {
        const mod = await meta.load();
        const count = playersForMode(meta, mode);
        const h = createHarness(meta, mod.default, mode, count);
        let seed = 7;
        const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
        h.run(240, (_t, hh) => {
          for (const inp of hh.inputs) {
            if (rnd() < 0.06) hh.emit(inp.index, RANDOM_EVENTS[Math.floor(rnd() * RANDOM_EVENTS.length)]);
            inp.state.energy = rnd() < 0.5 ? 0.1 : 1.2;
            inp.leftHand.x += (rnd() - 0.5) * 40;
            inp.leftHand.y += (rnd() - 0.5) * 40;
            inp.rightHand.x += (rnd() - 0.5) * 40;
            inp.rightHand.y += (rnd() - 0.5) * 40;
            inp.leftHand.x = Math.max(0, Math.min(1280, inp.leftHand.x));
            inp.rightHand.x = Math.max(0, Math.min(1280, inp.rightHand.x));
            inp.leftHand.y = Math.max(0, Math.min(720, inp.leftHand.y));
            inp.rightHand.y = Math.max(0, Math.min(720, inp.rightHand.y));
          }
        });
        if (h.result) {
          expect(h.result.headline.length).toBeGreaterThan(0);
          expect(Array.isArray(h.result.stats)).toBe(true);
          expect(typeof h.result.shareText).toBe('string');
        }
      });
    }
  }
});

describe('catalog', () => {
  it('has no placeholder implementations left', async () => {
    const { readFileSync } = await import('node:fs');
    const bad = GAMES.filter((g) => readFileSync(`src/games/${g.id}/index.ts`, 'utf8').includes('PLACEHOLDER')).map((g) => g.id);
    expect(bad).toEqual([]);
  });
});
