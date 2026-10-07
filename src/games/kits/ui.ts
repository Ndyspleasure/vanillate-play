import { C, emoji, panel, text, FONT } from '../../engine/draw';
import type { GameContext, PlayerInput } from '../../engine/types';

/** Small in-game UI pieces shared across games. */

export function bubble(g: CanvasRenderingContext2D, inp: PlayerInput, msg: string, color: string = C.ink, dy = 0): void {
  if (inp.health === 'lost') return;
  const size = Math.max(18, Math.min(30, inp.torsoPx * 0.2));
  g.font = `800 ${size}px ${FONT}`;
  const w = g.measureText(msg).width + size * 1.2;
  const x = inp.head.x;
  const y = inp.head.y - inp.headRadius * 2.2 - size + dy;
  panel(g, x - w / 2, y - size * 0.8, w, size * 1.6, { fill: 'rgba(20,10,40,0.82)', stroke: color, r: size * 0.8, lineWidth: 3 });
  text(g, msg, x, y + 1, { size, color, stroke: 0, weight: 800 });
}

export function hearts(g: CanvasRenderingContext2D, x: number, y: number, lives: number, max: number, size = 26, align: 'left' | 'right' | 'center' = 'left'): void {
  const total = max * size * 1.1;
  let sx = align === 'left' ? x : align === 'right' ? x - total : x - total / 2;
  for (let i = 0; i < max; i++) {
    emoji(g, i < lives ? '❤️' : '🖤', sx + size / 2, y, size, i < lives ? 1 : 0.5);
    sx += size * 1.1;
  }
}

export function zoneLabel(g: CanvasRenderingContext2D, ctx: GameContext, i: number, msg: string, y = ctx.height - 40): void {
  const z = ctx.zone(i);
  text(g, msg, z.x + z.w / 2, y, { size: 22, color: ctx.players[i].color });
}

export function bigCommand(g: CanvasRenderingContext2D, ctx: GameContext, label: string, icon: string, color: string, scale = 1, y = ctx.height * 0.3): void {
  const size = Math.min((ctx.width * 0.9) / Math.max(5, label.length * 0.62), 104, ctx.height * 0.14) * scale;
  // Keep the icon clear of the score header.
  y = Math.max(y, 132 + size * 1.25);
  emoji(g, icon, ctx.width / 2, y - size * 0.95, size * 0.8);
  text(g, label, ctx.width / 2, y, { size, color, weight: 800, stroke: Math.max(6, size / 8) });
}

export function timerRing(g: CanvasRenderingContext2D, x: number, y: number, r: number, value: number, color: string): void {
  g.lineWidth = 8;
  g.strokeStyle = 'rgba(255,255,255,0.2)';
  g.beginPath();
  g.arc(x, y, r, 0, Math.PI * 2);
  g.stroke();
  g.strokeStyle = color;
  g.beginPath();
  g.arc(x, y, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.max(0, Math.min(1, value)));
  g.stroke();
}

/** Meter bar drawn under a player's zone (e.g. pose match, sync). */
export function zoneMeter(g: CanvasRenderingContext2D, ctx: GameContext, i: number, value: number, label?: string, color?: string): void {
  const z = ctx.zone(i);
  const w = Math.min(z.w - 60, 320);
  const x = z.x + (z.w - w) / 2;
  const y = ctx.height - 54;
  panel(g, x - 8, y - 30, w + 16, 52, { fill: 'rgba(20,10,40,0.7)', r: 16 });
  g.fillStyle = 'rgba(255,255,255,0.15)';
  g.fillRect(x, y, w, 12);
  g.fillStyle = color ?? ctx.players[i].color;
  g.fillRect(x, y, w * Math.max(0, Math.min(1, value)), 12);
  if (label) text(g, label, x + w / 2, y - 12, { size: 16, stroke: 0, color: C.ink });
}
