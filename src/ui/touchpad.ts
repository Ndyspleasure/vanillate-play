import type { Action, KeyboardController } from '../core/input/KeyboardController';
import type { MoveHint } from '../engine/types';
import { h } from './dom';
import { t, type I18nKey } from './i18n';

/**
 * On-screen buttons for keyboard mode on phones and tablets, where there is no keyboard. Each player
 * gets a pad on their side of the screen with only the moves the current game uses; the buttons
 * press the same simulated-body actions as the keys.
 */

interface PadButton {
  action: Action;
  glyph: string;
  label: I18nKey;
  side?: '←' | '→';
}

const FOR_MOVE: Partial<Record<MoveHint, PadButton[]>> = {
  step: [
    { action: 'stepL', glyph: '◀', label: 'move.left' },
    { action: 'stepR', glyph: '▶', label: 'move.right' },
  ],
  lean: [
    { action: 'leanL', glyph: '↖', label: 'move.left' },
    { action: 'leanR', glyph: '↗', label: 'move.right' },
  ],
  jump: [{ action: 'jump', glyph: '⤒', label: 'move.jump' }],
  squat: [{ action: 'squat', glyph: '⤓', label: 'move.squat' }],
  punch: [
    { action: 'punchL', glyph: '👊', label: 'move.punch', side: '←' },
    { action: 'punchR', glyph: '👊', label: 'move.punch', side: '→' },
  ],
  block: [{ action: 'block', glyph: '🛡️', label: 'move.block' }],
  hands: [{ action: 'handsUp', glyph: '🙌', label: 'move.hands' }],
  pose: [
    { action: 'handL', glyph: '✋', label: 'move.hands', side: '←' },
    { action: 'handR', glyph: '✋', label: 'move.hands', side: '→' },
  ],
  reach: [
    { action: 'handL', glyph: '✋', label: 'move.reach', side: '←' },
    { action: 'handR', glyph: '✋', label: 'move.reach', side: '→' },
  ],
  kick: [
    { action: 'kickL', glyph: '🦵', label: 'move.kick', side: '←' },
    { action: 'kickR', glyph: '🦵', label: 'move.kick', side: '→' },
  ],
  flap: [{ action: 'flap', glyph: '🪽', label: 'move.flap' }],
  dance: [{ action: 'dance', glyph: '💃', label: 'move.dance' }],
  run: [{ action: 'dance', glyph: '🏃', label: 'move.run' }],
};

/** Room for a 2×4 grid at each screen edge; side-by-side pairs are never split. */
export const MAX_PAD_BUTTONS = 8;

export function padButtons(moves: readonly MoveHint[]): PadButton[] {
  const out: PadButton[] = [];
  for (const m of moves) {
    const group = (FOR_MOVE[m] ?? []).filter((b) => !out.some((o) => o.action === b.action));
    if (group.length && out.length + group.length <= MAX_PAD_BUTTONS) out.push(...group);
  }
  if (out.length === 0) out.push(...FOR_MOVE.hands!);
  return out;
}

/** Phones and tablets: a coarse primary pointer and no hover. */
export function isTouchDevice(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
}

export class TouchPad {
  readonly el: HTMLElement;
  private keyboard: KeyboardController | null = null;
  /** Buttons currently held, so a lost pointer or hidden pad releases them. */
  private held = new Map<HTMLElement, () => void>();

  constructor(moves: readonly MoveHint[], colors: readonly string[]) {
    const buttons = padButtons(moves);
    this.el = h('div', { class: 'touchpad', hidden: true });
    for (let player = 0; player < 2; player++) {
      const pad = h('div', {
        class: `touchpad__pad touchpad__pad--p${player + 1}`,
        role: 'group',
        'aria-label': `P${player + 1}`,
        style: `--pad-color:${colors[player] ?? '#fff'}`,
      });
      for (const b of buttons) pad.appendChild(this.button(player, b));
      this.el.appendChild(pad);
    }
  }

  private button(player: number, b: PadButton): HTMLElement {
    const el = h(
      'button',
      {
        type: 'button',
        class: 'touchpad__btn',
        'aria-label': `${t(b.label)}${b.side ? ` ${b.side}` : ''}`,
        'data-action': b.action,
      },
      h('span', { 'aria-hidden': 'true' }, b.glyph),
      b.side ? h('small', { 'aria-hidden': 'true' }, b.side === '←' ? 'L' : 'R') : null,
    );
    const release = () => {
      if (!this.held.delete(el)) return;
      el.classList.remove('is-down');
      this.keyboard?.press(player, b.action, false);
    };
    el.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      try {
        el.setPointerCapture(e.pointerId);
      } catch {
        /* pointer already gone (or synthetic): pointerup still releases the button */
      }
      if (this.held.has(el)) return;
      this.held.set(el, release);
      el.classList.add('is-down');
      this.keyboard?.press(player, b.action, true);
    });
    for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture'] as const)
      el.addEventListener(ev, (e) => {
        e.stopPropagation();
        release();
      });
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    return el;
  }

  /** Show the pads for `players` people driven by `keyboard`, or hide them (null). */
  show(keyboard: KeyboardController | null, players: number): void {
    if (!keyboard) this.releaseAll();
    this.keyboard = keyboard;
    this.el.hidden = !keyboard;
    this.el.classList.toggle('touchpad--solo', players < 2);
  }

  releaseAll(): void {
    for (const release of [...this.held.values()]) release();
  }
}
