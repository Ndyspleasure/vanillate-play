import { clamp } from '../../core/math';
import { C, emoji, withAlpha } from '../../engine/draw';
import type { PlayerInput } from '../../engine/types';

/**
 * Telegraphed hazards for dodge games. Each hazard warns first, then resolves against the player's
 * semantic state at impact (duck / jump / step aside), which is far more forgiving and reliable
 * than pixel-perfect collision on noisy pose data.
 */

export type HazardKind = 'high' | 'low' | 'body' | 'wall';

export interface Hazard {
  kind: HazardKind;
  owner: number;
  /** Seconds until impact. */
  t: number;
  warn: number;
  /** Stage-space impact point (x for body/wall, y for high/low). */
  x: number;
  y: number;
  /** Direction the projectile flies from (-1 = from left, 1 = from right, 0 = from above/front). */
  from: -1 | 0 | 1;
  style: 'laser' | 'ball' | 'fist' | 'star' | 'meteor';
  resolved: boolean;
  hit: boolean;
  /** Visual time after resolution. */
  after: number;
  width: number;
}

export interface HazardResult {
  hazard: Hazard;
  hit: boolean;
}

/** Is the player safe from this hazard right now? */
export function dodged(h: Hazard, inp: PlayerInput): boolean {
  if (inp.health === 'lost') return true; // never punish tracking loss
  const s = inp.state;
  switch (h.kind) {
    case 'high':
      return s.ducking || s.squatting || inp.head.y > h.y + inp.headRadius * 0.4;
    case 'low':
      return s.airborne;
    case 'body':
    case 'wall': {
      const half = Math.max(inp.torsoPx * 0.42, 30) + h.width / 2;
      const bodyX = (inp.head.x + inp.shoulders.x + inp.hips.x) / 3;
      return Math.abs(bodyX - h.x) > half;
    }
  }
}

export class HazardField {
  list: Hazard[] = [];

  add(h: Omit<Hazard, 'resolved' | 'hit' | 'after' | 'width'> & { width?: number }): Hazard {
    const hz: Hazard = { ...h, resolved: false, hit: false, after: 0, width: h.width ?? 24 };
    this.list.push(hz);
    return hz;
  }

  update(dt: number, input: (i: number) => PlayerInput): HazardResult[] {
    const out: HazardResult[] = [];
    for (const h of this.list) {
      if (!h.resolved) {
        h.t -= dt;
        if (h.t <= 0) {
          h.resolved = true;
          h.hit = !dodged(h, input(h.owner));
          out.push({ hazard: h, hit: h.hit });
        }
      } else h.after += dt;
    }
    this.list = this.list.filter((h) => !h.resolved || h.after < 0.5);
    return out;
  }

  get pending(): number {
    return this.list.filter((h) => !h.resolved).length;
  }

  clear(): void {
    this.list = [];
  }

  render(g: CanvasRenderingContext2D, zoneOf: (owner: number) => { x: number; w: number }, height: number): void {
    const now = performance.now() / 1000;
    for (const h of this.list) {
      const z = zoneOf(h.owner);
      const blink = h.t > 0 && Math.sin(now * 22) > 0;
      const prog = clamp(1 - h.t / h.warn, 0, 1);
      if (h.kind === 'high' || h.kind === 'low') {
        if (!h.resolved) {
          g.strokeStyle = withAlpha(C.bad, blink ? 0.9 : 0.45);
          g.setLineDash([14, 10]);
          g.lineWidth = 4;
          g.beginPath();
          g.moveTo(z.x + 10, h.y);
          g.lineTo(z.x + z.w - 10, h.y);
          g.stroke();
          g.setLineDash([]);
          emoji(g, h.kind === 'high' ? '⬇️' : '⬆️', z.x + 40, h.y - 34, 34);
          if (h.style !== 'laser') {
            const sx = h.from < 0 ? z.x - 40 + (z.w * 0.5 + 40) * prog : z.x + z.w + 40 - (z.w * 0.5 + 40) * prog;
            emoji(g, h.style === 'star' ? '✴️' : h.style === 'fist' ? '👊' : '🔥', sx, h.y, 54);
          }
        } else {
          const a = 1 - h.after / 0.5;
          g.fillStyle = withAlpha(h.hit ? C.bad : '#ff7ab8', a * 0.9);
          g.fillRect(z.x, h.y - 9, z.w, 18);
          g.fillStyle = withAlpha('#ffffff', a);
          g.fillRect(z.x, h.y - 3, z.w, 6);
        }
      } else {
        if (!h.resolved) {
          g.fillStyle = withAlpha(C.bad, blink ? 0.28 : 0.12);
          g.fillRect(h.x - h.width / 2 - 30, 90, h.width + 60, height - 120);
          if (h.kind === 'wall') {
            g.strokeStyle = withAlpha(C.bad, 0.8);
            g.lineWidth = 3;
            g.strokeRect(h.x - h.width / 2, 90, h.width, height - 120);
          }
          const size = 40 + 50 * prog;
          const sy = h.from === 0 ? 60 + (height * 0.45 - 60) * prog : height * 0.45;
          const sx = h.from === 0 ? h.x : h.from < 0 ? z.x + (h.x - z.x) * prog : z.x + z.w - (z.x + z.w - h.x) * prog;
          if (h.kind === 'body') emoji(g, h.style === 'fist' ? '👊' : h.style === 'star' ? '✴️' : h.style === 'meteor' ? '☄️' : '🔥', sx, sy, size);
        } else {
          const a = 1 - h.after / 0.5;
          g.fillStyle = withAlpha(h.hit ? C.bad : '#ffffff', a * 0.6);
          g.fillRect(h.x - h.width / 2, 80, h.width, height - 100);
        }
      }
    }
  }
}
