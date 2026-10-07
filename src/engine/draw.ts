import type { Point } from '../core/math';
import { clamp01 } from '../core/math';
import { ghostSkeleton, type PoseDef } from '../core/motion/pose';
import { SKELETON_EDGES, LM } from '../core/tracking/landmarks';
import { drawArt } from '../art/sprites';
import type { PlayerInput } from './types';

/** Canvas drawing helpers shared by all games. */

export const FONT = '"Fredoka Variable", "Nunito Variable", system-ui, -apple-system, "Segoe UI", sans-serif';
export const EMOJI_FONT = '"Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif';

export const PLAYER_COLORS = ['#ff4d8d', '#3dd6ff', '#ffd23d', '#7dff6b'];
export const PLAYER_TINTS = ['#ffb3cd', '#b3eeff', '#fff0b3', '#cfffc4'];

export const C = {
  bg: '#140b2e',
  bg2: '#22124a',
  ink: '#fff7e8',
  vanilla: '#ffe9b8',
  purple: '#8b5cff',
  good: '#7dff6b',
  bad: '#ff5a5a',
  warn: '#ffb020',
  gold: '#ffd23d',
  muted: 'rgba(255,247,232,0.65)',
};

export interface TextOpts {
  size?: number;
  color?: string;
  align?: CanvasTextAlign;
  baseline?: CanvasTextBaseline;
  weight?: number;
  stroke?: number;
  strokeColor?: string;
  maxWidth?: number;
  alpha?: number;
}

export function text(g: CanvasRenderingContext2D, str: string, x: number, y: number, o: TextOpts = {}): void {
  const size = o.size ?? 24;
  g.font = `${o.weight ?? 700} ${size}px ${FONT}`;
  g.textAlign = o.align ?? 'center';
  g.textBaseline = o.baseline ?? 'middle';
  if (o.alpha !== undefined) g.globalAlpha = o.alpha;
  if (o.stroke !== 0) {
    g.lineJoin = 'round';
    g.lineWidth = o.stroke ?? Math.max(3, size / 7);
    g.strokeStyle = o.strokeColor ?? 'rgba(20,10,40,0.85)';
    g.strokeText(str, x, y, o.maxWidth);
  }
  g.fillStyle = o.color ?? C.ink;
  g.fillText(str, x, y, o.maxWidth);
  if (o.alpha !== undefined) g.globalAlpha = 1;
}

/** Draw an icon: uses the SVG art set when available, otherwise falls back to the emoji glyph. */
export function emoji(g: CanvasRenderingContext2D, e: string, x: number, y: number, size: number, alpha = 1, color?: string): void {
  if (drawArt(g, e, x, y, size * 1.05, { alpha, color })) return;
  g.globalAlpha = alpha;
  g.font = `${Math.round(size)}px ${EMOJI_FONT}`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillStyle = '#fff';
  g.fillText(e, x, y);
  g.globalAlpha = 1;
}

export function roundRect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  const rr = Math.min(r, w / 2, h / 2);
  g.beginPath();
  g.moveTo(x + rr, y);
  g.arcTo(x + w, y, x + w, y + h, rr);
  g.arcTo(x + w, y + h, x, y + h, rr);
  g.arcTo(x, y + h, x, y, rr);
  g.arcTo(x, y, x + w, y, rr);
  g.closePath();
}

export function panel(
  g: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  o: { fill?: string; stroke?: string; r?: number; alpha?: number; lineWidth?: number } = {},
): void {
  g.globalAlpha = o.alpha ?? 1;
  roundRect(g, x, y, w, h, o.r ?? 16);
  g.fillStyle = o.fill ?? 'rgba(20,10,40,0.72)';
  g.fill();
  if (o.stroke) {
    g.lineWidth = o.lineWidth ?? 2;
    g.strokeStyle = o.stroke;
    g.stroke();
  }
  g.globalAlpha = 1;
}

export function bar(
  g: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  value: number,
  color: string,
  o: { bg?: string; reverse?: boolean; ghost?: number } = {},
): void {
  const v = clamp01(value);
  roundRect(g, x, y, w, h, h / 2);
  g.fillStyle = o.bg ?? 'rgba(255,255,255,0.15)';
  g.fill();
  if (o.ghost !== undefined && o.ghost > v) {
    const gw = w * clamp01(o.ghost);
    roundRect(g, o.reverse ? x + w - gw : x, y, gw, h, h / 2);
    g.fillStyle = 'rgba(255,255,255,0.55)';
    g.fill();
  }
  if (v > 0) {
    const vw = Math.max(h, w * v);
    roundRect(g, o.reverse ? x + w - vw : x, y, vw, h, h / 2);
    g.fillStyle = color;
    g.fill();
  }
}

export function progressRing(g: CanvasRenderingContext2D, x: number, y: number, r: number, value: number, color: string, width = 8): void {
  g.lineCap = 'round';
  g.lineWidth = width;
  g.strokeStyle = 'rgba(255,255,255,0.18)';
  g.beginPath();
  g.arc(x, y, r, 0, Math.PI * 2);
  g.stroke();
  if (value > 0) {
    g.strokeStyle = color;
    g.beginPath();
    g.arc(x, y, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * clamp01(value));
    g.stroke();
  }
  g.lineCap = 'butt';
}

export function circle(g: CanvasRenderingContext2D, x: number, y: number, r: number, fill?: string, stroke?: string, width = 3): void {
  g.beginPath();
  g.arc(x, y, Math.max(0, r), 0, Math.PI * 2);
  if (fill) {
    g.fillStyle = fill;
    g.fill();
  }
  if (stroke) {
    g.lineWidth = width;
    g.strokeStyle = stroke;
    g.stroke();
  }
}

/** Skeleton overlay on top of the camera feed. `avatar` draws a chunky body for keyboard mode. */
export function skeleton(g: CanvasRenderingContext2D, inp: PlayerInput, color: string, avatar = false, alpha = 1): void {
  const pts = inp.skeleton;
  const width = avatar ? Math.max(10, inp.torsoPx * 0.16) : Math.max(3, inp.torsoPx * 0.035);
  g.globalAlpha = alpha * (inp.health === 'ok' ? 1 : 0.45);
  g.lineCap = 'round';
  g.lineJoin = 'round';
  if (avatar) {
    // Body fill
    const ls = pts[LM.leftShoulder];
    const rs = pts[LM.rightShoulder];
    const lh = pts[LM.leftHip];
    const rh = pts[LM.rightHip];
    if (ls && rs && lh && rh) {
      g.beginPath();
      g.moveTo(ls.x, ls.y);
      g.lineTo(rs.x, rs.y);
      g.lineTo(rh.x, rh.y);
      g.lineTo(lh.x, lh.y);
      g.closePath();
      g.fillStyle = color;
      g.fill();
      g.lineWidth = width;
      g.strokeStyle = color;
      g.stroke();
    }
  }
  g.strokeStyle = color;
  g.lineWidth = width;
  for (const [a, b] of SKELETON_EDGES) {
    const p = pts[a];
    const q = pts[b];
    if (!p || !q) continue;
    g.beginPath();
    g.moveTo(p.x, p.y);
    g.lineTo(q.x, q.y);
    g.stroke();
  }
  if (!avatar) {
    g.fillStyle = '#fff';
    for (const i of [LM.leftShoulder, LM.rightShoulder, LM.leftElbow, LM.rightElbow, LM.leftHip, LM.rightHip, LM.leftKnee, LM.rightKnee]) {
      const p = pts[i];
      if (p) circle(g, p.x, p.y, width * 0.9, '#fff');
    }
  } else {
    circle(g, inp.head.x, inp.head.y, inp.headRadius * 1.05, color);
    // Eyes so the avatar feels like a character
    const er = inp.headRadius * 0.16;
    circle(g, inp.head.x - inp.headRadius * 0.35, inp.head.y - inp.headRadius * 0.05, er, '#140b2e');
    circle(g, inp.head.x + inp.headRadius * 0.35, inp.head.y - inp.headRadius * 0.05, er, '#140b2e');
    circle(g, inp.leftHand.x, inp.leftHand.y, width * 0.9, color);
    circle(g, inp.rightHand.x, inp.rightHand.y, width * 0.9, color);
  }
  g.globalAlpha = 1;
  g.lineCap = 'butt';
}

export function handCursor(g: CanvasRenderingContext2D, p: Point, color: string, r = 22, pulse = 0): void {
  circle(g, p.x, p.y, r + pulse, 'rgba(255,255,255,0.18)');
  circle(g, p.x, p.y, r * 0.62, color, '#fff', 3);
}

export function playerTag(g: CanvasRenderingContext2D, label: string, x: number, y: number, color: string, size = 18): void {
  g.font = `800 ${size}px ${FONT}`;
  const w = g.measureText(label).width + size * 1.1;
  panel(g, x - w / 2, y - size * 0.8, w, size * 1.6, { fill: color, r: size * 0.8 });
  text(g, label, x, y + 1, { size, color: '#140b2e', stroke: 0, weight: 800 });
}

/** Draw a target pose as a glowing stick figure. */
export function ghost(
  g: CanvasRenderingContext2D,
  def: PoseDef,
  x: number,
  y: number,
  torsoPx: number,
  color: string,
  alpha = 0.9,
  width?: number,
): void {
  const s = ghostSkeleton(def);
  const P = (p: Point) => ({ x: x + p.x * torsoPx, y: y + p.y * torsoPx });
  const lines: [Point, Point][] = [
    [s.lSh, s.rSh],
    [s.lSh, s.lEl],
    [s.lEl, s.lWr],
    [s.rSh, s.rEl],
    [s.rEl, s.rWr],
    [s.lSh, s.lHip],
    [s.rSh, s.rHip],
    [s.lHip, s.rHip],
    [s.lHip, s.lKnee],
    [s.lKnee, s.lAnk],
    [s.rHip, s.rKnee],
    [s.rKnee, s.rAnk],
  ];
  g.globalAlpha = alpha;
  g.lineCap = 'round';
  g.lineJoin = 'round';
  const w = width ?? Math.max(6, torsoPx * 0.14);
  for (const pass of [0, 1]) {
    g.strokeStyle = pass === 0 ? 'rgba(20,10,40,0.6)' : color;
    g.lineWidth = pass === 0 ? w + 6 : w;
    for (const [a, b] of lines) {
      const p = P(a);
      const q = P(b);
      g.beginPath();
      g.moveTo(p.x, p.y);
      g.lineTo(q.x, q.y);
      g.stroke();
    }
  }
  const h = P(s.head);
  circle(g, h.x, h.y, torsoPx * 0.28, color, 'rgba(20,10,40,0.6)', 3);
  g.globalAlpha = 1;
  g.lineCap = 'butt';
}

/** Translucent vertical gradient used behind HUD rows for legibility over camera video. */
export function topShade(g: CanvasRenderingContext2D, width: number, h = 120): void {
  const grad = g.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, 'rgba(20,10,40,0.7)');
  grad.addColorStop(1, 'rgba(20,10,40,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, width, h);
}

export function withAlpha(hex: string, a: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}
