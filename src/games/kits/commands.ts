import type { MotionEvent } from '../../core/motion/types';
import type { PlayerInput } from '../../engine/types';
import { tx, type TxKey } from './text';

/** Body commands used by reaction, combo, sync and party games. */
export type CommandId =
  | 'jump'
  | 'squat'
  | 'handsUp'
  | 'left'
  | 'right'
  | 'punch'
  | 'leanLeft'
  | 'leanRight'
  | 'leftHand'
  | 'rightHand'
  | 'kick'
  | 'clap'
  | 'block';

export interface Command {
  id: CommandId;
  /** In-game text key (see kits/text.ts). */
  key: TxKey;
  emoji: string;
  color: string;
  /** Events that count as performing this command. */
  events: MotionEvent[];
  /** Continuous state that also counts (forgiving for slightly late detections). */
  state?: (inp: PlayerInput) => boolean;
  legs?: boolean;
}

export const COMMANDS: Record<CommandId, Command> = {
  jump: { id: 'jump', key: 'cmdJump', emoji: '⬆️', color: '#7dff6b', events: ['JUMP'], state: (i) => i.state.airborne },
  squat: { id: 'squat', key: 'cmdSquat', emoji: '⬇️', color: '#3dd6ff', events: ['SQUAT', 'DUCK'], state: (i) => i.state.squatting || i.state.ducking },
  handsUp: { id: 'handsUp', key: 'cmdHandsUp', emoji: '🙌', color: '#ffd23d', events: ['HANDS_UP'], state: (i) => i.state.handsUp },
  left: {
    id: 'left',
    key: 'cmdLeft',
    emoji: '⬅️',
    color: '#ff9f1c',
    events: ['MOVE_LEFT', 'STEP_LEFT', 'LEAN_LEFT', 'DODGE_LEFT'],
    state: (i) => i.state.steppedLeft || i.state.leaningLeft,
  },
  right: {
    id: 'right',
    key: 'cmdRight',
    emoji: '➡️',
    color: '#ff9f1c',
    events: ['MOVE_RIGHT', 'STEP_RIGHT', 'LEAN_RIGHT', 'DODGE_RIGHT'],
    state: (i) => i.state.steppedRight || i.state.leaningRight,
  },
  punch: { id: 'punch', key: 'cmdPunch', emoji: '👊', color: '#ff4d6d', events: ['PUNCH_LEFT', 'PUNCH_RIGHT'] },
  leanLeft: { id: 'leanLeft', key: 'cmdLeanLeft', emoji: '↖️', color: '#b98cff', events: ['LEAN_LEFT'], state: (i) => i.state.leaningLeft },
  leanRight: { id: 'leanRight', key: 'cmdLeanRight', emoji: '↗️', color: '#b98cff', events: ['LEAN_RIGHT'], state: (i) => i.state.leaningRight },
  leftHand: {
    id: 'leftHand',
    key: 'cmdLeftHand',
    emoji: '🤚',
    color: '#ff6ec7',
    events: ['HAND_LEFT_UP'],
    state: (i) => i.state.leftHandUp && !i.state.rightHandUp,
  },
  rightHand: {
    id: 'rightHand',
    key: 'cmdRightHand',
    emoji: '✋',
    color: '#ff6ec7',
    events: ['HAND_RIGHT_UP'],
    state: (i) => i.state.rightHandUp && !i.state.leftHandUp,
  },
  kick: { id: 'kick', key: 'cmdKick', emoji: '🦵', color: '#06d6a0', events: ['KICK_LEFT', 'KICK_RIGHT', 'KNEE_LEFT', 'KNEE_RIGHT'], legs: true },
  clap: { id: 'clap', key: 'cmdClap', emoji: '👏', color: '#ffbe0b', events: ['CLAP'] },
  block: { id: 'block', key: 'cmdBlock', emoji: '🛡️', color: '#8ecae6', events: ['BLOCK'], state: (i) => i.state.blocking },
};

/** Did the player perform the command this frame? Returns the capture time or null. */
export function performed(cmd: Command, inp: PlayerInput, now: number, allowState = true): number | null {
  for (const e of cmd.events) {
    if (inp.has(e)) return inp.eventTimes.get(e) ?? now;
  }
  if (allowState && cmd.state?.(inp)) return now;
  return null;
}

/** Which (other) command did the player perform — used to detect wrong reactions. */
export function performedAny(inp: PlayerInput, list: readonly Command[]): Command | null {
  for (const c of list) for (const e of c.events) if (inp.has(e)) return c;
  return null;
}

/** Significant movement during a "wait" phase (false start). */
export function isFalseStart(inp: PlayerInput): boolean {
  return (
    inp.any('JUMP', 'SQUAT', 'HANDS_UP', 'PUNCH_LEFT', 'PUNCH_RIGHT', 'MOVE_LEFT', 'MOVE_RIGHT', 'KICK_LEFT', 'KICK_RIGHT') ||
    inp.state.energy > 1.6
  );
}

export const BASIC_COMMANDS: CommandId[] = ['jump', 'squat', 'handsUp', 'left', 'right', 'punch'];
export const UPPER_COMMANDS: CommandId[] = ['handsUp', 'left', 'right', 'punch', 'leftHand', 'rightHand'];

export function commandList(ids: CommandId[]): Command[] {
  return ids.map((i) => COMMANDS[i]);
}

/** Localized command label, e.g. "JUMP!" / "LOMPAT!". */
export function cmdLabel(ctx: { lang: 'en' | 'id' }, cmd: Command): string {
  return tx(ctx, cmd.key);
}
