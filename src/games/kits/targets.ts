import type { Point, Rect } from '../../core/math';
import { circleHit, clamp, easeOutBack } from '../../core/math';
import { circle, emoji, text } from '../../engine/draw';
import type { Rng } from '../../engine/rng';
import type { PlayerInput } from '../../engine/types';

/** Touch targets that appear inside a player's reachable area (AR on top of the camera). */

export type TargetKind = 'normal' | 'fake' | 'bonus';

export interface Target {
  id: number;
  owner: number;
  x: number;
  y: number;
  r: number;
  vx: number;
  vy: number;
  born: number;
  life: number;
  kind: TargetKind;
  /** Optional label drawn inside (e.g. "L"/"R" or an emoji). */
  label?: string;
  color: string;
  dead: boolean;
}

export interface TargetHit {
  target: Target;
  player: number;
  hand: 'left' | 'right' | 'head';
  /** Seconds the target was alive when hit. */
  age: number;
}

let nextId = 1;

/** Area a player can comfortably reach: around their shoulders, within their zone. */
export function reachArea(inp: PlayerInput, zone: Rect, height: number): Rect {
  const T = Math.max(60, inp.torsoPx);
  const cx = inp.health === 'lost' ? zone.x + zone.w / 2 : inp.shoulders.x;
  const cy = inp.health === 'lost' ? height * 0.45 : inp.shoulders.y;
  const halfW = T * 1.35;
  const x0 = clamp(cx - halfW, zone.x + 30, zone.x + zone.w - 60);
  const x1 = clamp(cx + halfW, zone.x + 60, zone.x + zone.w - 30);
  const y0 = clamp(cy - T * 1.2, 110, height - 120);
  const y1 = clamp(cy + T * 0.7, y0 + 60, height - 60);
  return { x: x0, y: y0, w: Math.max(40, x1 - x0), h: Math.max(40, y1 - y0) };
}

export class TargetField {
  targets: Target[] = [];

  spawn(owner: number, area: Rect, rng: Rng, opts: Partial<Target> & { avoid?: Point[] } = {}): Target {
    let x = 0;
    let y = 0;
    const r = opts.r ?? 42;
    for (let i = 0; i < 12; i++) {
      x = area.x + r + rng.next() * Math.max(1, area.w - 2 * r);
      y = area.y + r + rng.next() * Math.max(1, area.h - 2 * r);
      const ok =
        this.targets.every((t) => t.dead || Math.hypot(t.x - x, t.y - y) > t.r + r + 10) &&
        (opts.avoid ?? []).every((p) => Math.hypot(p.x - x, p.y - y) > r * 2.2);
      if (ok) break;
    }
    const t: Target = {
      id: nextId++,
      owner,
      x,
      y,
      r,
      vx: opts.vx ?? 0,
      vy: opts.vy ?? 0,
      born: opts.born ?? 0,
      life: opts.life ?? 3,
      kind: opts.kind ?? 'normal',
      label: opts.label,
      color: opts.color ?? '#ffd23d',
      dead: false,
    };
    this.targets.push(t);
    return t;
  }

  /** Move targets, bounce inside bounds, expire old ones. Returns expired targets. */
  update(dt: number, now: number, bounds?: (t: Target) => Rect): Target[] {
    const expired: Target[] = [];
    for (const t of this.targets) {
      if (t.dead) continue;
      t.x += t.vx * dt;
      t.y += t.vy * dt;
      if (bounds) {
        const b = bounds(t);
        if (t.x < b.x + t.r || t.x > b.x + b.w - t.r) t.vx *= -1;
        if (t.y < b.y + t.r || t.y > b.y + b.h - t.r) t.vy *= -1;
        t.x = clamp(t.x, b.x + t.r, b.x + b.w - t.r);
        t.y = clamp(t.y, b.y + t.r, b.y + b.h - t.r);
      }
      if (now - t.born > t.life) {
        t.dead = true;
        expired.push(t);
      }
    }
    this.targets = this.targets.filter((t) => !t.dead || now - t.born < t.life + 0.01);
    return expired;
  }

  /** Check hands (and optionally head) against targets owned by `player` (or any owner if null). */
  hits(player: number, inp: PlayerInput, now: number, owner: number | null = player, useHead = false): TargetHit[] {
    if (inp.health === 'lost') return [];
    const out: TargetHit[] = [];
    const hr = Math.max(18, inp.torsoPx * 0.18);
    for (const t of this.targets) {
      if (t.dead || (owner !== null && t.owner !== owner)) continue;
      let hand: TargetHit['hand'] | null = null;
      if (circleHit(inp.leftHand, hr, t, t.r)) hand = 'left';
      else if (circleHit(inp.rightHand, hr, t, t.r)) hand = 'right';
      else if (useHead && circleHit(inp.head, inp.headRadius, t, t.r)) hand = 'head';
      if (hand) {
        t.dead = true;
        out.push({ target: t, player, hand, age: now - t.born });
      }
    }
    return out;
  }

  clear(): void {
    this.targets = [];
  }

  render(g: CanvasRenderingContext2D, now: number): void {
    for (const t of this.targets) {
      if (t.dead) continue;
      const age = now - t.born;
      const s = age < 0.25 ? easeOutBack(age / 0.25) : 1;
      const remain = 1 - age / t.life;
      const r = t.r * s;
      if (t.kind === 'fake') {
        circle(g, t.x, t.y, r, 'rgba(40,10,20,0.85)', '#ff5a5a', 4);
        emoji(g, '💣', t.x, t.y, r * 1.1);
      } else {
        circle(g, t.x, t.y, r, t.kind === 'bonus' ? 'rgba(255,210,61,0.35)' : 'rgba(20,10,40,0.45)', t.color, 5);
        circle(g, t.x, t.y, r * 0.62, undefined, t.color, 4);
        circle(g, t.x, t.y, r * 0.25, t.color);
        if (t.label) text(g, t.label, t.x, t.y, { size: r * 0.8, weight: 800, color: '#fff' });
      }
      // Lifetime ring
      g.strokeStyle = 'rgba(255,255,255,0.8)';
      g.lineWidth = 3;
      g.beginPath();
      g.arc(t.x, t.y, r + 7, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * clamp(remain, 0, 1));
      g.stroke();
    }
  }
}
