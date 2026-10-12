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

/** The overlay keeps at least this much width between the pads before it moves above them. */
const MIN_OVERLAY_WIDTH = 420;
const PAD_GAP = 8;

/** Phones and tablets: a coarse primary pointer and no hover. */
export function isTouchDevice(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
}

export class TouchPad {
  readonly el: HTMLElement;
  private keyboard: KeyboardController | null = null;
  /** Buttons currently held, so a lost pointer or hidden pad releases them. */
  private held = new Map<HTMLElement, () => void>();
  private resize: ResizeObserver | null = null;

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
    this.watchInset(!!keyboard);
  }

  /**
   * Keep the lobby and pause cards clear of the pads: the parent gets `--pad-inset-x` (room at
   * both sides, when wide enough) or `--pad-inset-b` (room at the bottom, on narrow portrait screens).
   */
  private watchInset(on: boolean): void {
    const host = this.el.parentElement;
    if (!on || !host) {
      this.resize?.disconnect();
      this.resize = null;
      host?.classList.remove('has-touchpad');
      host?.style.removeProperty('--pad-inset-x');
      host?.style.removeProperty('--pad-inset-b');
      return;
    }
    host.classList.add('has-touchpad');
    const update = () => {
      const pads = [...this.el.querySelectorAll<HTMLElement>('.touchpad__pad')].filter(
        (p) => p.offsetWidth > 0,
      );
      const box = this.el.getBoundingClientRect();
      let side = 0;
      let top = box.bottom;
      for (const p of pads) {
        const r = p.getBoundingClientRect();
        // How far the pad reaches in from its own edge of the screen.
        side = Math.max(side, Math.min(r.right - box.left, box.right - r.left));
        top = Math.min(top, r.top);
      }
      // Pads sit at both edges, so the free width is the box minus one pad width on each side.
      const wide = box.width - 2 * side >= MIN_OVERLAY_WIDTH;
      host.style.setProperty('--pad-inset-x', wide ? `${Math.ceil(side + PAD_GAP)}px` : '0px');
      host.style.setProperty('--pad-inset-b', wide ? '0px' : `${Math.ceil(box.bottom - top + PAD_GAP)}px`);
    };
    if (!this.resize && typeof ResizeObserver === 'function') {
      this.resize = new ResizeObserver(update);
      this.resize.observe(host);
      this.resize.observe(this.el);
    }
    update();
  }

  releaseAll(): void {
    for (const release of [...this.held.values()]) release();
  }

  destroy(): void {
    this.releaseAll();
    this.watchInset(false);
  }
}
