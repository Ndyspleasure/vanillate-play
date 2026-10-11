import { describe, expect, it } from 'vitest';
import { GAMES } from '../src/games/catalog';
import { MAX_PAD_BUTTONS, padButtons } from '../src/ui/touchpad';

describe('touch pad buttons', () => {
  it('maps a game’s moves to their actions, in priority order', () => {
    expect(padButtons(['punch', 'block', 'lean']).map((b) => b.action)).toEqual([
      'punchL',
      'punchR',
      'block',
      'leanL',
      'leanR',
    ]);
  });

  it('never splits a left/right pair and falls back to hands up', () => {
    const acts = padButtons(['jump', 'squat', 'hands', 'step', 'punch', 'still']).map((b) => b.action);
    expect(acts).toEqual(['jump', 'squat', 'handsUp', 'stepL', 'stepR', 'punchL', 'punchR']);
    expect(padButtons(['still']).map((b) => b.action)).toEqual(['handsUp']);
  });

  it('gives every game at least one button and stays within the grid', () => {
    for (const g of GAMES) {
      const buttons = padButtons(g.moves);
      expect(buttons.length, g.id).toBeGreaterThan(0);
      expect(buttons.length, g.id).toBeLessThanOrEqual(MAX_PAD_BUTTONS);
      expect(new Set(buttons.map((b) => b.action)).size, g.id).toBe(buttons.length);
    }
  });
});
