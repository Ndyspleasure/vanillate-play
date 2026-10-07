import type { Point } from '../../core/math';
import { clamp, lerp } from '../../core/math';
import { C, circle, emoji, roundRect, text } from '../../engine/draw';
import type { GameContext, PlayerInput } from '../../engine/types';

/** Shared penalty scene: goal, keeper hitbox, aiming and ball flight (Penalty Duel, Motion Soccer). */

export interface GoalLayout {
  gx: number;
  gy: number;
  gw: number;
  gh: number;
  spot: Point;
}

export function goalLayout(ctx: GameContext): GoalLayout {
  const gw = Math.min(ctx.width * 0.62, ctx.height * 1.35);
  const gh = gw * 0.36;
  return { gx: (ctx.width - gw) / 2, gy: ctx.height * 0.2, gw, gh, spot: { x: ctx.width / 2, y: ctx.height * 0.86 } };
}

export interface KeeperState {
  /** -1..1 across the goal */
  x: number;
  /** 0..1 how high the hands reach */
  reach: number;
  /** -1..1 dive direction/strength */
  dive: number;
}

/** Map a human keeper's body to keeper state. */
export function keeperFromInput(inp: PlayerInput, prev: KeeperState, dt: number, diveUntil: number, now: number): KeeperState {
  const s = inp.state;
  const target = clamp(s.offsetX * 0.9 + s.lean * 1.4, -1, 1);
  const x = lerp(prev.x, target, 1 - Math.exp(-dt / 0.08));
  const reach = s.handsUp ? 1 : s.leftHandUp || s.rightHandUp ? 0.8 : s.airborne ? 0.85 : 0.55;
  let dive = 0;
  if (now < diveUntil) dive = s.lean >= 0 ? 1 : -1;
  else if (Math.abs(s.lean) > 0.3) dive = Math.sign(s.lean) * 0.6;
  return { x, reach, dive };
}

export function keeperRect(L: GoalLayout, k: KeeperState): { x0: number; x1: number; y0: number; y1: number } {
  const cx = L.gx + L.gw / 2 + k.x * L.gw * 0.42;
  const half = L.gw * (0.09 + Math.abs(k.dive) * 0.1);
  const shift = k.dive * L.gw * 0.1;
  const y1 = L.gy + L.gh;
  const y0 = y1 - L.gh * (0.55 + k.reach * 0.45);
  return { x0: cx - half + shift, x1: cx + half + shift, y0, y1 };
}

export function saved(L: GoalLayout, k: KeeperState, p: Point): boolean {
  const r = keeperRect(L, k);
  return p.x >= r.x0 - 14 && p.x <= r.x1 + 14 && p.y >= r.y0 - 14 && p.y <= r.y1;
}

/** Aim point inside the goal from -1..1 coordinates. */
export function aimPoint(L: GoalLayout, ax: number, ay: number): Point {
  return { x: L.gx + L.gw / 2 + ax * L.gw * 0.46, y: L.gy + L.gh * (0.5 - ay * 0.42) };
}

export function drawPitch(g: CanvasRenderingContext2D, ctx: GameContext, L: GoalLayout): void {
  const grad = g.createLinearGradient(0, 0, 0, ctx.height);
  grad.addColorStop(0, '#1b4332');
  grad.addColorStop(1, '#2d6a4f');
  g.fillStyle = grad;
  g.fillRect(0, 0, ctx.width, ctx.height);
  for (let i = 0; i < 8; i++) {
    g.fillStyle = i % 2 ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.04)';
    g.fillRect(0, (ctx.height / 8) * i, ctx.width, ctx.height / 8);
  }
  g.strokeStyle = 'rgba(255,255,255,0.6)';
  g.lineWidth = 4;
  g.strokeRect(L.gx - L.gw * 0.25, L.gy + L.gh, L.gw * 1.5, ctx.height * 0.36);
  circle(g, L.spot.x, L.spot.y, 6, '#fff');
  // Net
  g.fillStyle = 'rgba(255,255,255,0.08)';
  g.fillRect(L.gx, L.gy, L.gw, L.gh);
  g.strokeStyle = 'rgba(255,255,255,0.25)';
  g.lineWidth = 1;
  for (let x = L.gx; x <= L.gx + L.gw; x += 18) {
    g.beginPath();
    g.moveTo(x, L.gy);
    g.lineTo(x, L.gy + L.gh);
    g.stroke();
  }
  for (let y = L.gy; y <= L.gy + L.gh; y += 18) {
    g.beginPath();
    g.moveTo(L.gx, y);
    g.lineTo(L.gx + L.gw, y);
    g.stroke();
  }
  g.strokeStyle = '#fff';
  g.lineWidth = 10;
  g.beginPath();
  g.moveTo(L.gx, L.gy + L.gh);
  g.lineTo(L.gx, L.gy);
  g.lineTo(L.gx + L.gw, L.gy);
  g.lineTo(L.gx + L.gw, L.gy + L.gh);
  g.stroke();
}

export function drawKeeper(g: CanvasRenderingContext2D, L: GoalLayout, k: KeeperState, color: string, label?: string): void {
  const r = keeperRect(L, k);
  const cx = (r.x0 + r.x1) / 2;
  const tilt = k.dive * 0.5;
  g.save();
  g.translate(cx, r.y1);
  g.rotate(tilt);
  const h = r.y1 - r.y0;
  const w = Math.min(r.x1 - r.x0, L.gw * 0.16);
  roundRect(g, -w * 0.35, -h * 0.72, w * 0.7, h * 0.5, 12);
  g.fillStyle = color;
  g.fill();
  g.strokeStyle = '#140b2e';
  g.lineWidth = 3;
  g.stroke();
  circle(g, 0, -h * 0.8, w * 0.22, '#ffcf9e', '#140b2e', 3);
  g.strokeStyle = color;
  g.lineWidth = 12;
  g.lineCap = 'round';
  const armY = -h * (0.6 + k.reach * 0.25);
  g.beginPath();
  g.moveTo(-w * 0.3, -h * 0.65);
  g.lineTo(-w * 0.75 - Math.max(0, -k.dive) * w, armY);
  g.moveTo(w * 0.3, -h * 0.65);
  g.lineTo(w * 0.75 + Math.max(0, k.dive) * w, armY);
  g.moveTo(-w * 0.15, -h * 0.22);
  g.lineTo(-w * 0.3, 0);
  g.moveTo(w * 0.15, -h * 0.22);
  g.lineTo(w * 0.3, 0);
  g.stroke();
  circle(g, -w * 0.75 - Math.max(0, -k.dive) * w, armY, 10, '#fff7e8', '#140b2e', 2);
  circle(g, w * 0.75 + Math.max(0, k.dive) * w, armY, 10, '#fff7e8', '#140b2e', 2);
  g.restore();
  if (label) text(g, label, cx, r.y1 + 22, { size: 16, color });
}

export interface Shot {
  from: Point;
  to: Point;
  t: number;
  dur: number;
  done: boolean;
}

export function drawBall(g: CanvasRenderingContext2D, s: Shot | null, L: GoalLayout): void {
  if (!s) {
    emoji(g, '⚽', L.spot.x, L.spot.y - 24, 52);
    return;
  }
  const u = clamp(s.t / s.dur, 0, 1);
  const x = lerp(s.from.x, s.to.x, u);
  const y = lerp(s.from.y, s.to.y, u) - Math.sin(u * Math.PI) * 60;
  const size = lerp(52, 30, u);
  emoji(g, '⚽', x, y, size);
}

export function drawAim(g: CanvasRenderingContext2D, p: Point, color: string): void {
  circle(g, p.x, p.y, 22, undefined, color, 4);
  g.strokeStyle = color;
  g.lineWidth = 3;
  g.beginPath();
  g.moveTo(p.x - 32, p.y);
  g.lineTo(p.x + 32, p.y);
  g.moveTo(p.x, p.y - 32);
  g.lineTo(p.x, p.y + 32);
  g.stroke();
  circle(g, p.x, p.y, 5, C.gold);
}

/** Kicker aim from body lean/offset (-1..1). */
export function aimFromInput(inp: PlayerInput): number {
  return clamp(inp.state.lean * 2 + inp.state.offsetX * 0.8, -1, 1);
}

export const kicked = (inp: PlayerInput): boolean => inp.any('KICK_LEFT', 'KICK_RIGHT', 'PUNCH_LEFT', 'PUNCH_RIGHT');
