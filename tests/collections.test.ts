import { describe, expect, it } from 'vitest';
import type { MatchResult } from '../src/engine/types';
import { gameById, playersForMode } from '../src/games/catalog';
import {
  COLLECTIONS,
  gameUrl,
  newRun,
  pointsFor,
  recordResult,
  resolveMode,
  standings,
} from '../src/games/collections';

const vs = (scores: number[], winner: number | null, ranking?: number[]): MatchResult => ({
  kind: scores.length > 2 ? 'party' : 'versus',
  winner,
  ranking:
    ranking ??
    scores
      .map((s, i) => ({ s, i }))
      .sort((a, b) => b.s - a.s)
      .map((x) => x.i),
  scores: scores.map((s, i) => ({ player: i, score: s })),
  headline: 'x',
  stats: [],
  shareText: '',
});

describe('party collections', () => {
  it('every game exists and supports its mode for every allowed player count', () => {
    for (const c of COLLECTIONS) {
      expect(c.games.length, c.id).toBeGreaterThanOrEqual(4);
      for (let n = c.players[0]; n <= c.players[1]; n++) {
        for (const g of c.games) {
          const meta = gameById(g.id);
          expect(meta, `${c.id}/${g.id}`).toBeTruthy();
          const mode = resolveMode(g, n);
          expect(meta!.modes, `${c.id}/${g.id} ${mode}`).toContain(mode);
          expect(playersForMode(meta!, mode, n), `${c.id}/${g.id} with ${n}`).toBe(n);
          for (const [k, v] of Object.entries(g.options ?? {})) {
            const opt = meta!.options?.find((o) => o.id === k);
            expect(
              opt?.choices.some((ch) => ch.value === v),
              `${c.id}/${g.id} ${k}=${v}`,
            ).toBe(true);
          }
        }
      }
    }
  });

  it('builds play URLs that carry the run', () => {
    const c = COLLECTIONS.find((x) => x.id === 'family-fun')!;
    const u = new URL(gameUrl(c, 1, 2, 'hard'), 'http://x');
    expect(u.pathname).toBe('/play/crazy-catch');
    expect(u.searchParams.get('mode')).toBe('versus');
    expect(u.searchParams.get('set')).toBe('family-fun');
    expect(u.searchParams.get('level')).toBe('hard');
    expect(new URL(gameUrl(c, 1, 4), 'http://x').searchParams.get('mode')).toBe('party');
  });

  it('awards placement points: n-1 for first, 0 for last, ties share', () => {
    expect(pointsFor(vs([10, 30, 20, 0], 1), 4).points).toEqual([1, 3, 2, 0]);
    expect(pointsFor(vs([5, 5, 1], null), 3).points).toEqual([2, 2, 0]);
    expect(pointsFor(vs([3, 3], null), 2).points).toEqual([1, 1]);
    // A game that names its winner (rounds won) beats the raw score ranking.
    expect(pointsFor(vs([80, 120], 0), 2).points).toEqual([1, 0]);
  });

  it('co-op games feed the team score instead of placements', () => {
    const coop: MatchResult = {
      kind: 'coop',
      winner: null,
      scores: [
        { player: 0, score: 84 },
        { player: 1, score: 84 },
      ],
      headline: 'x',
      stats: [],
      shareText: '',
    };
    const c = COLLECTIONS.find((x) => x.id === 'date-night')!;
    let run = newRun(c, 2);
    run = recordResult(run, 'sync-challenge', coop);
    run = recordResult(run, 'mirror-battle', vs([3, 5], 1));
    run = recordResult(run, 'couple-challenge', {
      ...coop,
      scores: coop.scores.map((s) => ({ ...s, score: 70 })),
    });
    const st = standings(run);
    expect(st.team).toBe(77);
    expect(st.totals).toEqual([0, 1]);
    expect(st.leader).toBe(1);
    expect(st.order).toEqual([1, 0]);
  });

  it('no leader on a tie at the top', () => {
    const c = COLLECTIONS[0];
    let run = newRun(c, 3);
    run = recordResult(run, 'a', vs([3, 2, 1], 0));
    run = recordResult(run, 'b', vs([1, 3, 2], 1));
    const st = standings(run);
    expect(st.totals).toEqual([2, 3, 1]);
    run = recordResult(run, 'c', vs([2, 1, 3], 2));
    expect(standings(run).totals).toEqual([3, 3, 3]);
    expect(standings(run).leader).toBeNull();
  });
});
