import { formatTime } from '../core/math';
import { bar, C, FONT, panel, text, topShade } from './draw';
import { tx } from '../games/kits/text';
import type { GameContext, Grade, MatchResult } from './types';

/** Shared HUD + result builders so every game looks and reports consistently. */

export function scoreHeader(
  g: CanvasRenderingContext2D,
  ctx: GameContext,
  values: (string | number)[],
  opts: { timer?: number; center?: string; labels?: string[] } = {},
): void {
  const w = ctx.width;
  topShade(g, w, 130);
  const n = values.length;
  const pw = Math.min(260, (w - 160) / Math.max(2, n));
  const size = Math.max(18, Math.min(30, w / 40));
  values.forEach((v, i) => {
    const p = ctx.players[i];
    let x: number;
    if (n === 1) x = 20;
    else if (n === 2) x = i === 0 ? 20 : w - pw - 20;
    else x = 20 + i * ((w - 40 - pw) / (n - 1));
    if (n > 2 && opts.timer !== undefined && Math.abs(x + pw / 2 - w / 2) < pw) x += i < n / 2 ? -pw * 0.6 : pw * 0.6;
    panel(g, x, 14, pw, size * 2.4, { fill: 'rgba(20,10,40,0.7)', stroke: p?.color ?? '#fff', r: 18, lineWidth: 3 });
    text(g, opts.labels?.[i] ?? p?.name ?? `P${i + 1}`, x + 16, 14 + size * 0.75, {
      size: size * 0.62,
      align: 'left',
      color: p?.color ?? '#fff',
      stroke: 0,
      maxWidth: pw - 32,
    });
    text(g, String(v), x + 16, 14 + size * 1.65, { size, align: 'left', weight: 800, stroke: 0, maxWidth: pw - 32 });
  });
  if (opts.timer !== undefined) {
    const t = opts.timer;
    panel(g, w / 2 - 54, 14, 108, size * 2.4, { fill: 'rgba(20,10,40,0.75)', r: 18 });
    text(g, formatTime(t), w / 2, 14 + size * 1.2, { size: size * 1.2, color: t <= 5 ? C.bad : C.ink, weight: 800, stroke: 0 });
  }
  if (opts.center) text(g, opts.center, w / 2, 14 + size * 3.2, { size: size * 0.7, color: C.vanilla });
}

export function hpBars(g: CanvasRenderingContext2D, ctx: GameContext, hp: number[], max: number, ghost?: number[]): void {
  const w = ctx.width;
  const bw = Math.min(420, w * 0.36);
  const y = 74;
  hp.forEach((v, i) => {
    const x = i === 0 ? 20 : w - bw - 20;
    bar(g, x, y, bw, 18, v / max, ctx.players[i].color, { reverse: i === 1, ghost: ghost ? ghost[i] / max : undefined });
  });
}

export function centerText(
  g: CanvasRenderingContext2D,
  ctx: GameContext,
  main: string,
  sub?: string,
  color: string = C.ink,
  scale = 1,
  y = ctx.height * 0.42,
): void {
  const size = Math.min(ctx.width / Math.max(6, main.length * 0.62), 120) * scale;
  text(g, main, ctx.width / 2, y, { size, color, weight: 800, stroke: Math.max(6, size / 9) });
  if (sub) text(g, sub, ctx.width / 2, y + size * 0.75, { size: Math.max(18, size * 0.32), color: C.vanilla });
}

export function instruction(g: CanvasRenderingContext2D, ctx: GameContext, msg: string, y = ctx.height - 46): void {
  g.font = `700 22px ${FONT}`;
  const w = Math.min(ctx.width - 40, g.measureText(msg).width + 48);
  panel(g, ctx.width / 2 - w / 2, y - 22, w, 44, { fill: 'rgba(20,10,40,0.72)', r: 22 });
  text(g, msg, ctx.width / 2, y + 1, { size: 22, stroke: 0, maxWidth: w - 24 });
}

export function gradeFor(pct: number): Grade {
  if (pct >= 95) return 'PERFECT';
  if (pct >= 85) return 'GREAT';
  if (pct >= 70) return 'GOOD';
  if (pct >= 45) return 'MISS';
  return 'FAIL';
}

const name = (ctx: GameContext, i: number) => ctx.players[i]?.name ?? `P${i + 1}`;

export function versusResult(
  ctx: GameContext,
  scores: number[],
  opts: {
    display?: (v: number) => string;
    lowerIsBetter?: boolean;
    stats?: { label: string; values: string[] }[];
    headline?: string;
    subline?: string;
    winner?: number | null;
    shareLine?: string;
  } = {},
): MatchResult {
  const better = (a: number, b: number) => (opts.lowerIsBetter ? a < b : a > b);
  let winner: number | null = opts.winner !== undefined ? opts.winner : 0;
  if (opts.winner === undefined) {
    for (let i = 1; i < scores.length; i++) if (better(scores[i], scores[winner!])) winner = i;
    if (scores.filter((s) => s === scores[winner!]).length > 1) winner = null;
  }
  const ranking = scores
    .map((s, i) => ({ s, i }))
    .sort((a, b) => (opts.lowerIsBetter ? a.s - b.s : b.s - a.s))
    .map((x) => x.i);
  const disp = opts.display ?? ((v: number) => String(Math.round(v)));
  const headline = opts.headline ?? (winner === null ? tx(ctx, 'draw') : tx(ctx, 'wins', { name: name(ctx, winner).toUpperCase() }));
  const line = scores.map((s, i) => `${name(ctx, i)} ${disp(s)}`).join(' · ');
  return {
    kind: scores.length > 2 ? 'party' : 'versus',
    winner,
    ranking,
    scores: scores.map((s, i) => ({ player: i, score: s, display: disp(s) })),
    headline,
    subline: opts.subline,
    stats: opts.stats ?? [],
    shareText: `${ctx.meta.emoji} ${ctx.meta.name.toUpperCase()}\n${line}\n${opts.shareLine ?? headline}\n— Vanillate Motion`,
  };
}

export function coopResult(
  ctx: GameContext,
  pct: number,
  opts: { headline?: string; subline?: string; stats?: { label: string; values: string[] }[]; shareLine?: string; big?: string } = {},
): MatchResult {
  const p = Math.round(pct);
  const grade = gradeFor(p);
  const headline =
    opts.headline ??
    tx(ctx, grade === 'PERFECT' ? 'perfectSync' : grade === 'GREAT' ? 'greatSync' : grade === 'GOOD' ? 'goodSync' : 'keepPracticing');
  const sub =
    opts.subline ??
    tx(ctx, grade === 'PERFECT' ? 'perfectCouple' : grade === 'GREAT' ? 'greatTeam' : grade === 'GOOD' ? 'niceTeam' : 'syncUp');
  return {
    kind: 'coop',
    winner: null,
    scores: ctx.players.map((pl) => ({ player: pl.index, score: p, display: `${p}%` })),
    big: opts.big ?? `${p}%`,
    headline,
    subline: sub,
    grade,
    stats: opts.stats ?? [],
    shareText: `${ctx.meta.emoji} ${ctx.meta.name.toUpperCase()}\n${opts.shareLine ?? tx(ctx, 'inSync', { p })}\n${ctx.players
      .map((pl) => pl.name)
      .join(' + ')}\n— Vanillate Motion`,
    record: { key: `${ctx.meta.id}:${ctx.mode}`, value: p, label: tx(ctx, 'bestSync'), display: `${p}%` },
  };
}

export function soloResult(
  ctx: GameContext,
  score: number,
  opts: {
    display?: string;
    headline?: string;
    subline?: string;
    stats?: { label: string; values: string[] }[];
    lowerIsBetter?: boolean;
    recordLabel?: string;
    grade?: Grade;
  } = {},
): MatchResult {
  const disp = opts.display ?? String(Math.round(score));
  return {
    kind: 'solo',
    winner: null,
    scores: [{ player: 0, score, display: disp }],
    big: disp,
    headline: opts.headline ?? tx(ctx, 'gameOver'),
    subline: opts.subline,
    grade: opts.grade,
    stats: opts.stats ?? [],
    shareText: `${ctx.meta.emoji} ${ctx.meta.name.toUpperCase()}\n${name(ctx, 0)}: ${disp}\n${tx(ctx, 'canYouBeat')}\n— Vanillate Motion`,
    record: {
      key: `${ctx.meta.id}:${ctx.mode}`,
      value: score,
      label: opts.recordLabel ?? tx(ctx, 'bestScore'),
      lowerIsBetter: opts.lowerIsBetter,
      display: disp,
    },
  };
}
