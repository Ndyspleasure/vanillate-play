import type { Localized, MatchResult, ModeId } from '../engine/types';

/**
 * Party collections: short playlists of games played back to back with one running scoreboard.
 * Versus/party games award placement points; co-op games add to a shared team score.
 */
export interface CollectionGame {
  id: string;
  /** 'auto' = versus with 2 players, party with 3–4. */
  mode: ModeId | 'auto';
  options?: Record<string, string>;
}

export interface Collection {
  id: string;
  emoji: string;
  name: Localized;
  tagline: Localized;
  players: [number, number];
  games: CollectionGame[];
}

export const COLLECTIONS: Collection[] = [
  {
    id: 'party-night',
    emoji: '🎉',
    name: { en: 'Party Night', id: 'Malam Pesta' },
    tagline: {
      en: 'Five loud party games for 3–4 players. Most points takes the crown.',
      id: 'Lima game pesta seru untuk 3–4 pemain. Poin terbanyak jadi juara.',
    },
    players: [3, 4],
    games: [
      { id: 'reaction-party', mode: 'party' },
      { id: 'freeze-party', mode: 'party' },
      { id: 'motion-race', mode: 'party' },
      { id: 'pose-battle', mode: 'party' },
      { id: 'last-man-standing', mode: 'party' },
    ],
  },
  {
    id: 'date-night',
    emoji: '💞',
    name: { en: 'Date Night', id: 'Malam Kencan' },
    tagline: {
      en: 'Sync up, mirror each other, one friendly duel and a slow dance.',
      id: 'Kompak bersama, saling meniru, satu duel santai, dan dansa pelan.',
    },
    players: [2, 2],
    games: [
      { id: 'sync-challenge', mode: 'coop' },
      { id: 'mirror-battle', mode: 'versus' },
      { id: 'couple-challenge', mode: 'coop', options: { pack: 'date' } },
      { id: 'hold-together', mode: 'coop' },
      { id: 'dance-battle', mode: 'coop', options: { song: 'slow-jam' } },
    ],
  },
  {
    id: 'duo-showdown',
    emoji: '🥊',
    name: { en: 'Duo Showdown', id: 'Duel Berdua' },
    tagline: {
      en: 'Five head-to-head battles. Settle it once and for all.',
      id: 'Lima duel satu lawan satu. Tentukan siapa yang terbaik.',
    },
    players: [2, 2],
    games: [
      { id: 'body-boxing', mode: 'versus' },
      { id: 'reaction-battle', mode: 'versus' },
      { id: 'dodge-battle', mode: 'versus' },
      { id: 'penalty-duel', mode: 'versus', options: { attempts: '3' } },
      { id: 'target-battle', mode: 'versus' },
    ],
  },
  {
    id: 'family-fun',
    emoji: '🏠',
    name: { en: 'Family Fun', id: 'Seru Sekeluarga' },
    tagline: {
      en: 'Easy, giggly games for 2–4 players of any age.',
      id: 'Game mudah dan lucu untuk 2–4 pemain segala usia.',
    },
    players: [2, 4],
    games: [
      { id: 'freeze-party', mode: 'party' },
      { id: 'crazy-catch', mode: 'auto' },
      { id: 'reaction-party', mode: 'party' },
      { id: 'last-man-standing', mode: 'party' },
    ],
  },
  {
    id: 'sports-day',
    emoji: '🏆',
    name: { en: 'Sports Day', id: 'Hari Olahraga' },
    tagline: {
      en: 'Soccer, hoops, volleyball and a race — a mini olympics for two.',
      id: 'Sepak bola, basket, voli, dan balapan — olimpiade mini berdua.',
    },
    players: [2, 2],
    games: [
      { id: 'motion-soccer', mode: 'versus' },
      { id: 'motion-basketball', mode: 'versus' },
      { id: 'body-volleyball', mode: 'versus' },
      { id: 'motion-racing', mode: 'versus' },
    ],
  },
];

export function collectionById(id: string): Collection | undefined {
  return COLLECTIONS.find((c) => c.id === id);
}

export function resolveMode(g: CollectionGame, players: number): ModeId {
  return g.mode === 'auto' ? (players >= 3 ? 'party' : 'versus') : g.mode;
}

/** URL of one game of a collection run. */
export function gameUrl(c: Collection, index: number, players: number, level = 'normal'): string {
  const g = c.games[index];
  const qs = new URLSearchParams({
    mode: resolveMode(g, players),
    players: String(players),
    level,
    set: c.id,
  });
  for (const [k, v] of Object.entries(g.options ?? {})) qs.set(`o.${k}`, v);
  return `/play/${g.id}?${qs}`;
}

// ── Scoring ──────────────────────────────────────────────

export interface RunEntry {
  game: string;
  headline: string;
  /** Points each player earned in this game (versus/party). */
  points: number[];
  /** Co-op result percentage, if this was a co-op game. */
  team?: number;
}

export interface CollectionRun {
  id: string;
  players: number;
  level: string;
  /** Games finished so far (one entry per game, in order). */
  entries: RunEntry[];
  startedAt: number;
}

/**
 * Placement points for one result: in an n-player game 1st place earns n−1 points, last place 0;
 * a draw gives everyone 1. Co-op results earn no placement points but feed the team score.
 */
export function pointsFor(result: MatchResult, players: number): { points: number[]; team?: number } {
  const points = new Array(players).fill(0);
  if (result.kind === 'coop') return { points, team: result.scores[0]?.score ?? 0 };
  // A game that names its own winner (e.g. rounds won) overrides a score-based ranking.
  const explicit =
    result.winner !== null && result.winner !== undefined && result.ranking?.[0] !== result.winner;
  if (result.ranking && result.ranking.length && !explicit) {
    // ranking lists player indices best → worst; equal scores share the better placement.
    const score = (p: number) => result.scores.find((s) => s.player === p)?.score;
    let place = 0;
    result.ranking.forEach((p, r) => {
      if (r > 0 && score(p) !== score(result.ranking![r - 1])) place = r;
      if (p < players) points[p] = players - 1 - place;
    });
    if (result.winner === null && result.ranking.every((p) => score(p) === score(result.ranking![0])))
      return { points: points.map(() => 1) };
    return { points };
  }
  if (result.winner !== null && result.winner !== undefined) {
    points[result.winner] = players - 1;
    return { points };
  }
  return { points: points.map(() => 1) };
}

export function recordResult(run: CollectionRun, game: string, result: MatchResult): CollectionRun {
  const { points, team } = pointsFor(result, run.players);
  return { ...run, entries: [...run.entries, { game, headline: result.headline, points, team }] };
}

export interface Standings {
  totals: number[];
  /** Player indices, best first. */
  order: number[];
  /** Average co-op percentage (null when the run had no co-op games yet). */
  team: number | null;
  /** Leader index, or null on a tie at the top / no versus games. */
  leader: number | null;
}

export function standings(run: CollectionRun): Standings {
  const totals = new Array(run.players).fill(0);
  const team: number[] = [];
  for (const e of run.entries) {
    e.points.forEach((p, i) => (totals[i] += p));
    if (e.team !== undefined) team.push(e.team);
  }
  const order = totals.map((_, i) => i).sort((a, b) => totals[b] - totals[a] || a - b);
  const top = totals[order[0]] ?? 0;
  const leader = top > 0 && totals.filter((v) => v === top).length === 1 ? order[0] : null;
  return {
    totals,
    order,
    team: team.length ? Math.round(team.reduce((a, b) => a + b, 0) / team.length) : null,
    leader,
  };
}

// ── Persistence (one active run, kept across reloads) ────────────────────

const KEY = 'vm.run.v1';

export function loadRun(): CollectionRun | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const run = JSON.parse(raw) as CollectionRun;
    return collectionById(run.id) && Array.isArray(run.entries) ? run : null;
  } catch {
    return null;
  }
}

export function saveRun(run: CollectionRun | null): void {
  try {
    if (run) localStorage.setItem(KEY, JSON.stringify(run));
    else localStorage.removeItem(KEY);
  } catch {
    /* storage unavailable: the run lives for this page only */
  }
}

export function newRun(c: Collection, players: number, level = 'normal'): CollectionRun {
  return { id: c.id, players, level, entries: [], startedAt: Date.now() };
}
