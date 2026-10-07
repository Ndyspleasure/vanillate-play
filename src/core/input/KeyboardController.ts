import type { Point } from '../math';
import type { SimBody, SimulatedProvider } from '../tracking/SimulatedProvider';

/**
 * Keyboard / pointer controls for simulated players. This is the accessible fallback when no camera
 * is available: every key drives the virtual body, which then flows through the real motion engine.
 */

type Action =
  | 'stepL'
  | 'stepR'
  | 'leanL'
  | 'leanR'
  | 'jump'
  | 'squat'
  | 'punchL'
  | 'punchR'
  | 'handsUp'
  | 'handL'
  | 'handR'
  | 'block'
  | 'kickL'
  | 'kickR'
  | 'flap'
  | 'dance';

export interface KeyHelp {
  player: number;
  keys: { action: string; key: string }[];
}

const P1: Record<string, Action> = {
  KeyA: 'stepL',
  KeyD: 'stepR',
  KeyQ: 'leanL',
  KeyE: 'leanR',
  KeyW: 'jump',
  KeyS: 'squat',
  KeyF: 'punchL',
  KeyG: 'punchR',
  KeyR: 'handsUp',
  KeyZ: 'handL',
  KeyX: 'handR',
  KeyC: 'block',
  KeyV: 'kickL',
  KeyB: 'kickR',
  KeyT: 'flap',
  KeyY: 'dance',
};

const P2: Record<string, Action> = {
  KeyJ: 'stepL',
  KeyL: 'stepR',
  ArrowLeft: 'stepL',
  ArrowRight: 'stepR',
  KeyU: 'leanL',
  KeyO: 'leanR',
  KeyI: 'jump',
  ArrowUp: 'jump',
  KeyK: 'squat',
  ArrowDown: 'squat',
  KeyN: 'punchL',
  KeyM: 'punchR',
  KeyP: 'handsUp',
  Comma: 'handL',
  Period: 'handR',
  KeyH: 'block',
  BracketLeft: 'kickL',
  BracketRight: 'kickR',
  Digit9: 'flap',
  Digit0: 'dance',
};

export const KEY_HELP: KeyHelp[] = [
  {
    player: 0,
    keys: [
      { action: 'Step left / right', key: 'A / D' },
      { action: 'Lean left / right', key: 'Q / E' },
      { action: 'Jump', key: 'W' },
      { action: 'Squat (hold)', key: 'S' },
      { action: 'Punch left / right', key: 'F / G' },
      { action: 'Hands up (hold)', key: 'R' },
      { action: 'Left / right hand up', key: 'Z / X' },
      { action: 'Block (hold)', key: 'C' },
      { action: 'Kick left / right', key: 'V / B' },
      { action: 'Flap arms', key: 'T' },
      { action: 'Dance / move (hold)', key: 'Y' },
      { action: 'Move a hand', key: 'Drag mouse / touch' },
    ],
  },
  {
    player: 1,
    keys: [
      { action: 'Step left / right', key: 'J / L  or  ← / →' },
      { action: 'Lean left / right', key: 'U / O' },
      { action: 'Jump', key: 'I  or  ↑' },
      { action: 'Squat (hold)', key: 'K  or  ↓' },
      { action: 'Punch left / right', key: 'N / M' },
      { action: 'Hands up (hold)', key: 'P' },
      { action: 'Left / right hand up', key: ', / .' },
      { action: 'Block (hold)', key: 'H' },
      { action: 'Kick left / right', key: '[ / ]' },
      { action: 'Flap arms', key: '9' },
      { action: 'Dance / move (hold)', key: '0' },
    ],
  },
];

export class KeyboardController {
  private held = new Set<string>();
  private pointerBody: SimBody | null = null;
  private pointerSide: 'left' | 'right' = 'right';
  /** Bodies beyond the human-controlled ones are driven by a simple bot. */
  humanCount = 2;
  private botTimers: number[] = [0, 0, 0, 0];
  private lastBot = 0;

  constructor(
    private sim: SimulatedProvider,
    private target: Window = window,
  ) {}

  attach(): void {
    this.target.addEventListener('keydown', this.onDown);
    this.target.addEventListener('keyup', this.onUp);
    this.target.addEventListener('blur', this.onBlur);
  }

  detach(): void {
    this.target.removeEventListener('keydown', this.onDown);
    this.target.removeEventListener('keyup', this.onUp);
    this.target.removeEventListener('blur', this.onBlur);
    this.held.clear();
  }

  private bodyFor(code: string): [SimBody | null, Action | null] {
    if (P1[code]) return [this.sim.bodies[0], P1[code]];
    if (P2[code] && this.sim.activeCount > 1) return [this.sim.bodies[1], P2[code]];
    return [null, null];
  }

  private isTyping(e: KeyboardEvent): boolean {
    const t = e.target as HTMLElement | null;
    return !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);
  }

  private onDown = (e: KeyboardEvent) => {
    if (this.isTyping(e) || e.metaKey || e.ctrlKey || e.altKey) return;
    const [body, action] = this.bodyFor(e.code);
    if (!body || !action) return;
    if (e.code.startsWith('Arrow')) e.preventDefault();
    if (this.held.has(e.code)) return;
    this.held.add(e.code);
    this.apply(body, action, true);
  };

  private onUp = (e: KeyboardEvent) => {
    const [body, action] = this.bodyFor(e.code);
    this.held.delete(e.code);
    if (!body || !action) return;
    this.apply(body, action, false);
  };

  private onBlur = () => {
    for (const code of this.held) {
      const [body, action] = this.bodyFor(code);
      if (body && action) this.apply(body, action, false);
    }
    this.held.clear();
  };

  /** Programmatic control (used by on-screen buttons and tests). */
  press(player: number, action: Action, down: boolean): void {
    const body = this.sim.bodies[player];
    if (body) this.apply(body, action, down);
  }

  private apply(b: SimBody, action: Action, down: boolean): void {
    switch (action) {
      case 'stepL':
        if (down) b.step(-1);
        break;
      case 'stepR':
        if (down) b.step(1);
        break;
      case 'leanL':
        b.leanTarget = down ? -1 : 0;
        break;
      case 'leanR':
        b.leanTarget = down ? 1 : 0;
        break;
      case 'jump':
        if (down) b.jump();
        break;
      case 'squat':
        b.squatTarget = down ? 1 : 0;
        break;
      case 'punchL':
        if (down) b.punch('left');
        break;
      case 'punchR':
        if (down) b.punch('right');
        break;
      case 'handsUp':
        b.left.mode = down ? 'up' : 'down';
        b.right.mode = down ? 'up' : 'down';
        break;
      case 'handL':
        b.left.mode = down ? 'up' : 'down';
        break;
      case 'handR':
        b.right.mode = down ? 'up' : 'down';
        break;
      case 'block':
        b.left.mode = down ? 'guard' : 'down';
        b.right.mode = down ? 'guard' : 'down';
        break;
      case 'kickL':
        if (down) b.kick('left');
        break;
      case 'kickR':
        if (down) b.kick('right');
        break;
      case 'flap':
        if (down) b.flap();
        break;
      case 'dance':
        b.dance = down;
        break;
    }
  }

  /** Pointer in view space: drives the hand of the nearest simulated body. */
  pointer(p: Point | null): void {
    if (!p) {
      if (this.pointerBody) {
        this.pointerBody.left.target = null;
        this.pointerBody.right.target = null;
      }
      this.pointerBody = null;
      return;
    }
    if (!this.pointerBody) {
      let best: SimBody | null = null;
      let bestD = Infinity;
      for (let i = 0; i < Math.min(this.sim.activeCount, this.humanCount); i++) {
        const b = this.sim.bodies[i];
        const d = Math.abs(b.x - p.x);
        if (d < bestD) {
          bestD = d;
          best = b;
        }
      }
      this.pointerBody = best;
      if (best) this.pointerSide = p.x < best.x ? 'left' : 'right';
    }
    if (this.pointerBody) {
      const arm = this.pointerSide === 'left' ? this.pointerBody.left : this.pointerBody.right;
      arm.target = p;
    }
  }

  /** Drive non-human bodies with random actions (party testing / demo). */
  tickBots(now: number): void {
    const dt = this.lastBot ? (now - this.lastBot) / 1000 : 0;
    this.lastBot = now;
    for (let i = this.humanCount; i < this.sim.activeCount; i++) {
      const b = this.sim.bodies[i];
      this.botTimers[i] -= dt;
      if (this.botTimers[i] > 0) continue;
      this.botTimers[i] = 0.7 + Math.random() * 1.2;
      const r = Math.random();
      b.squatTarget = 0;
      b.leanTarget = 0;
      b.left.mode = 'down';
      b.right.mode = 'down';
      b.dance = false;
      if (r < 0.15) b.jump();
      else if (r < 0.3) b.squatTarget = 1;
      else if (r < 0.45) b.leanTarget = Math.random() < 0.5 ? -1 : 1;
      else if (r < 0.6) b.punch(Math.random() < 0.5 ? 'left' : 'right');
      else if (r < 0.72) {
        b.left.mode = 'up';
        b.right.mode = 'up';
      } else if (r < 0.85) b.dance = true;
    }
  }
}
