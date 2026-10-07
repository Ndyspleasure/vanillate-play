import type { MoveHint } from '../../engine/types';
import type { MotionEvent } from './types';

/** One "try this move" step of the pre-game tutorial. */
export interface PracticeStep {
  id: 'left' | 'right' | 'jump' | 'squat' | 'punch' | 'block' | 'hands' | 'reach' | 'kick' | 'flap' | 'dance' | 'run';
  /** Any of these events completes the step. */
  events: readonly MotionEvent[];
}

const STEPS: Record<PracticeStep['id'], readonly MotionEvent[]> = {
  left: ['MOVE_LEFT', 'STEP_LEFT', 'LEAN_LEFT'],
  right: ['MOVE_RIGHT', 'STEP_RIGHT', 'LEAN_RIGHT'],
  jump: ['JUMP'],
  squat: ['SQUAT', 'DUCK'],
  punch: ['PUNCH_LEFT', 'PUNCH_RIGHT'],
  block: ['BLOCK'],
  hands: ['HANDS_UP', 'HAND_LEFT_UP', 'HAND_RIGHT_UP'],
  reach: ['REACH', 'HAND_LEFT_UP', 'HAND_RIGHT_UP'],
  kick: ['KICK_LEFT', 'KICK_RIGHT', 'KNEE_LEFT', 'KNEE_RIGHT'],
  flap: ['FLAP'],
  dance: ['MOVE'],
  run: ['STEP', 'MOVE'],
};

const FROM_HINT: Partial<Record<MoveHint, PracticeStep['id'][]>> = {
  lean: ['left', 'right'],
  step: ['left', 'right'],
  jump: ['jump'],
  squat: ['squat'],
  punch: ['punch'],
  block: ['block'],
  hands: ['hands'],
  pose: ['hands'],
  reach: ['reach'],
  kick: ['kick'],
  flap: ['flap'],
  dance: ['dance'],
  run: ['run'],
};

export const MAX_PRACTICE_STEPS = 4;

/** The short list of moves a game's tutorial asks players to try, in the game's priority order. */
export function practiceSteps(moves: readonly MoveHint[]): PracticeStep[] {
  const ids: PracticeStep['id'][] = [];
  for (const m of moves) {
    // Moves are added as a group so a left/right pair is never cut in half.
    const group = (FROM_HINT[m] ?? []).filter((id) => !ids.includes(id));
    if (group.length && ids.length + group.length <= MAX_PRACTICE_STEPS) ids.push(...group);
  }
  if (ids.length === 0) ids.push('hands');
  return ids.map((id) => ({ id, events: STEPS[id] }));
}

/** Tracks which practice steps each player has completed. */
export class PracticeTracker {
  readonly done: boolean[][];

  constructor(
    readonly steps: readonly PracticeStep[],
    readonly players: number,
  ) {
    this.done = Array.from({ length: players }, () => steps.map(() => false));
  }

  /** Feed one player's events; returns the indexes of steps completed by this call. */
  feed(player: number, events: readonly MotionEvent[]): number[] {
    const row = this.done[player];
    if (!row) return [];
    const completed: number[] = [];
    this.steps.forEach((s, i) => {
      if (!row[i] && events.some((e) => s.events.includes(e))) {
        row[i] = true;
        completed.push(i);
      }
    });
    return completed;
  }

  playerDone(player: number): boolean {
    return this.done[player]?.every(Boolean) ?? false;
  }

  get allDone(): boolean {
    return this.done.every((row) => row.every(Boolean));
  }

  /** Index of the first step this player still has to do (or -1). */
  current(player: number): number {
    return this.done[player]?.findIndex((d) => !d) ?? -1;
  }
}
