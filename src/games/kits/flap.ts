import type { Rect } from '../../core/math';
import { clamp, lerp } from '../../core/math';
import { emoji, roundRect, text } from '../../engine/draw';
import type { Rng } from '../../engine/rng';
import type { PlayerInput } from '../../engine/types';

/** Flappy-style flight in a panel (Body Flap & Body Flap Challenge). Units are panel-relative. */

export interface Pipe {
  x: number; // world distance
  gapY: number; // 0..1
  gap: number; // 0..1 height
  passed: boolean;
}

export class Flyer {
  y = 0.45;
  vy = 0;
  dist = 0;
  pipes = 0;
  crashed = false;
  invuln = 0;
  flapT = 0;
  constructor(
    public speed = 0.28,
    public glide = false,
  ) {}

  control(inp: PlayerInput, dt: number): boolean {
    if (this.glide) {
      const s = inp.state;
      const target = clamp(0.45 - (s.rise * 1.4 - s.drop * 1.2) - (s.handsUp ? 0.2 : 0), 0.05, 0.95);
      this.y = lerp(this.y, target, 1 - Math.exp(-dt / 0.12));
      this.vy = 0;
      return false;
    }
    if (inp.any('FLAP', 'JUMP', 'HANDS_UP', 'HAND_LEFT_UP', 'HAND_RIGHT_UP')) {
      this.vy = -0.62;
      this.flapT = 0.25;
      return true;
    }
    return false;
  }

  update(dt: number, track: Pipe[]): 'pass' | 'crash' | null {
    this.flapT = Math.max(0, this.flapT - dt);
    this.invuln = Math.max(0, this.invuln - dt);
    if (!this.glide) {
      this.vy += 1.5 * dt;
      this.y += this.vy * dt;
    }
    this.dist += this.speed * dt;
    let ev: 'pass' | 'crash' | null = null;
    if (this.y > 0.98 || this.y < 0.02) {
      this.y = clamp(this.y, 0.02, 0.98);
      if (this.invuln <= 0) ev = 'crash';
    }
    const bx = this.dist + 0.25;
    for (const p of track) {
      if (Math.abs(p.x - bx) < 0.06) {
        const top = p.gapY - p.gap / 2;
        const bot = p.gapY + p.gap / 2;
        if ((this.y - 0.03 < top || this.y + 0.03 > bot) && this.invuln <= 0) ev = 'crash';
      }
    }
    for (const p of track) {
      if (!p.passed && p.x < bx - 0.06 && p.x > this.dist - 0.5) {
        p.passed = true;
        this.pipes++;
        ev = ev ?? 'pass';
      }
    }
    return ev;
  }

  /** Respawn in place after a crash (race modes). */
  respawn(): void {
    this.y = 0.45;
    this.vy = 0;
    this.invuln = 1.5;
  }
}

export function buildPipes(rng: Rng, count: number, start = 1.2): Pipe[] {
  const pipes: Pipe[] = [];
  let x = start;
  for (let i = 0; i < count; i++) {
    pipes.push({ x, gapY: rng.range(0.3, 0.7), gap: Math.max(0.26, 0.4 - i * 0.004), passed: false });
    x += rng.range(0.55, 0.75);
  }
  return pipes;
}

export function renderFlight(g: CanvasRenderingContext2D, r: Rect, f: Flyer, track: Pipe[], color: string, label?: string): void {
  g.save();
  roundRect(g, r.x, r.y, r.w, r.h, 18);
  g.clip();
  const sky = g.createLinearGradient(0, r.y, 0, r.y + r.h);
  sky.addColorStop(0, '#4cc9f0');
  sky.addColorStop(1, '#bdeeff');
  g.fillStyle = sky;
  g.fillRect(r.x, r.y, r.w, r.h);
  const scale = r.h; // 1 world unit = panel height
  for (let k = 0; k < 5; k++) {
    const cx = r.x + ((((k * 0.7 - f.dist * 0.3) % 3.5) + 3.5) % 3.5) * scale - scale * 0.3;
    emoji(g, '☁️', cx, r.y + r.h * (0.12 + (k % 3) * 0.12), r.h * 0.18, 0.8);
  }
  for (const p of track) {
    const x = r.x + (p.x - f.dist) * scale;
    if (x < r.x - 80 || x > r.x + r.w + 80) continue;
    const w = scale * 0.11;
    const top = r.y + (p.gapY - p.gap / 2) * r.h;
    const bot = r.y + (p.gapY + p.gap / 2) * r.h;
    g.fillStyle = '#38b000';
    g.strokeStyle = '#140b2e';
    g.lineWidth = 3;
    g.fillRect(x - w / 2, r.y - 10, w, top - r.y + 10);
    g.strokeRect(x - w / 2, r.y - 10, w, top - r.y + 10);
    g.fillRect(x - w / 2, bot, w, r.y + r.h - bot + 10);
    g.strokeRect(x - w / 2, bot, w, r.y + r.h - bot + 10);
    g.fillStyle = '#2b9348';
    g.fillRect(x - w * 0.65, top - 18, w * 1.3, 18);
    g.fillRect(x - w * 0.65, bot, w * 1.3, 18);
  }
  g.fillStyle = '#e9c46a';
  g.fillRect(r.x, r.y + r.h - 10, r.w, 10);
  const bx = r.x + 0.25 * scale;
  const by = r.y + f.y * r.h;
  const blink = f.invuln > 0 && Math.floor(f.invuln * 10) % 2 === 0;
  if (!blink) {
    g.save();
    g.translate(bx, by);
    g.rotate(clamp(f.vy * 0.8, -0.5, 0.9));
    emoji(g, '🐦', 0, 0, r.h * 0.12, 1, color);
    g.restore();
  }
  g.restore();
  roundRect(g, r.x, r.y, r.w, r.h, 18);
  g.lineWidth = 4;
  g.strokeStyle = color;
  g.stroke();
  text(g, String(f.pipes), r.x + r.w / 2, r.y + 50, { size: 54, color: '#fff' });
  if (label) text(g, label, r.x + 16, r.y + r.h - 30, { size: 18, align: 'left', color });
}
