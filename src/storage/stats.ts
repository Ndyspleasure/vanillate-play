import type { MatchResult, ModeId } from '../engine/types';
import { load, remove, save } from './store';

/** Local-only statistics: nothing here ever leaves the device. */

export interface GameStats {
  plays: number;
  completions: number;
  rematches: number;
  lastPlayed: number;
  playMs: number;
}

export interface MatchRecord {
  game: string;
  mode: ModeId;
  at: number;
  headline: string;
  players: string[];
  scores: string[];
  winner: string | null;
  durationMs: number;
}

export interface PersonalBest {
  value: number;
  display: string;
  label: string;
  lowerIsBetter?: boolean;
  at: number;
}

export interface StatsData {
  version: 1;
  totalMatches: number;
  totalPlayMs: number;
  games: Record<string, GameStats>;
  /** Wins per player name (head-to-head bragging rights). */
  wins: Record<string, number>;
  bests: Record<string, PersonalBest>;
  history: MatchRecord[];
}

const KEY = 'vm.stats.v1';
const EMPTY: StatsData = { version: 1, totalMatches: 0, totalPlayMs: 0, games: {}, wins: {}, bests: {}, history: [] };

class StatsStore {
  private data: StatsData = load(KEY, structuredCloneSafe(EMPTY));

  get(): StatsData {
    return this.data;
  }

  private game(id: string): GameStats {
    return (this.data.games[id] ??= { plays: 0, completions: 0, rematches: 0, lastPlayed: 0, playMs: 0 });
  }

  started(id: string): void {
    const g = this.game(id);
    g.plays++;
    g.lastPlayed = Date.now();
    save(KEY, this.data);
  }

  rematch(id: string): void {
    this.game(id).rematches++;
    save(KEY, this.data);
  }

  /** Records a finished match; returns true when it set a new personal best. */
  completed(id: string, mode: ModeId, result: MatchResult, players: string[], durationMs: number): boolean {
    const g = this.game(id);
    g.completions++;
    g.playMs += durationMs;
    this.data.totalMatches++;
    this.data.totalPlayMs += durationMs;
    const winnerName = result.winner !== null && result.winner !== undefined ? (players[result.winner] ?? null) : null;
    if (winnerName) this.data.wins[winnerName] = (this.data.wins[winnerName] ?? 0) + 1;
    this.data.history.unshift({
      game: id,
      mode,
      at: Date.now(),
      headline: result.headline,
      players,
      scores: result.scores.map((s) => s.display ?? String(s.score)),
      winner: winnerName,
      durationMs,
    });
    this.data.history.length = Math.min(this.data.history.length, 50);
    let best = false;
    const r = result.record;
    if (r && Number.isFinite(r.value)) {
      const prev = this.data.bests[r.key];
      const better = !prev || (r.lowerIsBetter ? r.value < prev.value : r.value > prev.value);
      if (better) {
        best = !!prev;
        this.data.bests[r.key] = { value: r.value, display: r.display, label: r.label, lowerIsBetter: r.lowerIsBetter, at: Date.now() };
      }
    }
    save(KEY, this.data);
    return best;
  }

  best(key: string): PersonalBest | undefined {
    return this.data.bests[key];
  }

  reset(): void {
    this.data = structuredCloneSafe(EMPTY);
    remove(KEY);
  }
}

function structuredCloneSafe<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}

export const stats = new StatsStore();
