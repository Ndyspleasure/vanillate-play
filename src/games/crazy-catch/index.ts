import type { Point } from '../../core/math';
import { C, circle, emoji, panel, text } from '../../engine/draw';
import { coopResult, scoreHeader, soloResult, versusResult } from '../../engine/hud';
import type { GameFactory, PlayerInput } from '../../engine/types';
import { L, tx } from '../kits/text';

/**
 * Crazy Catch (GAMES.md 6.19) — items fall in your zone; catch each with the body part it shows
 * (LEFT HAND, RIGHT HAND, HEAD, LEFT SIDE, RIGHT SIDE). Bombs cost points. Faster and crazier over time.
 */
type Part = 'lh' | 'rh' | 'head' | 'ls' | 'rs';
const PARTS: Part[] = ['lh', 'rh', 'head', 'ls', 'rs'];
const LABEL: Record<Part, [string, string]> = {
  lh: ['L HAND', 'TGN KIRI'],
  rh: ['R HAND', 'TGN KANAN'],
  head: ['HEAD', 'KEPALA'],
  ls: ['L SIDE', 'SISI KIRI'],
  rs: ['R SIDE', 'SISI KANAN'],
};
const FRUIT = ['🍎', '🍌', '🍊', '🍇', '🍉'];
const DURATION = 60;

interface Item {
  owner: number;
  x: number;
  y: number;
  vy: number;
  r: number;
  part: Part;
  bomb: boolean;
  fruit: string;
  dead: boolean;
}

function partPos(inp: PlayerInput, p: Part): Point {
  switch (p) {
    case 'lh':
      return inp.leftHand;
    case 'rh':
      return inp.rightHand;
    case 'head':
      return inp.head;
    case 'ls':
      return inp.leftElbow;
    case 'rs':
      return inp.rightElbow;
  }
}

const factory: GameFactory = (ctx) => {
  const n = ctx.players.length;
  const coop = ctx.mode === 'coop';
  const score = new Array(n).fill(0);
  const caught = new Array(n).fill(0);
  const bombs = new Array(n).fill(0);
  let items: Item[] = [];
  let dropped = 0;
  let time = 0;
  const nextDrop = new Array(n).fill(0.8);
  let finished = false;

  const drop = (i: number) => {
    const inp = ctx.input(i);
    const z = ctx.zone(i);
    const T = Math.max(70, inp.torsoPx);
    const cx = inp.health === 'lost' ? z.x + z.w / 2 : inp.shoulders.x;
    const x = Math.max(z.x + 40, Math.min(z.x + z.w - 40, cx + ctx.rng.range(-T * 1.2, T * 1.2)));
    const bomb = time > 10 && ctx.rng.chance(0.18);
    if (!bomb) dropped++;
    items.push({
      owner: i,
      x,
      y: 90,
      vy: ctx.height * (0.16 + time * 0.004),
      r: Math.max(26, 44 - time * 0.25),
      part: ctx.rng.pick(PARTS),
      bomb,
      fruit: ctx.rng.pick(FRUIT),
      dead: false,
    });
    nextDrop[i] = Math.max(0.55, 1.6 - time * 0.018) + ctx.rng.range(0, 0.4);
  };

  const finish = () => {
    if (finished) return;
    finished = true;
    const stats = [
      { label: tx(ctx, 'statCaughtItems'), values: caught.map(String) },
      { label: tx(ctx, 'statBombs'), values: bombs.map(String) },
    ];
    const total = score.reduce((a, b) => a + b, 0);
    if (coop) ctx.end(coopResult(ctx, (caught.reduce((a, b) => a + b, 0) / Math.max(1, dropped)) * 100, { stats, big: String(total), headline: L(ctx, 'TEAM CATCH', 'TANGKAPAN TIM') }));
    else if (n === 1) ctx.end(soloResult(ctx, score[0], { stats }));
    else ctx.end(versusResult(ctx, score, { stats }));
  };

  return {
    view: { camera: 'dim', dim: 0.2, skeleton: true, hands: true },
    update(dt) {
      if (finished) return;
      time += dt;
      for (let i = 0; i < n; i++) {
        nextDrop[i] -= dt;
        if (nextDrop[i] <= 0) drop(i);
      }
      for (const it of items) {
        if (it.dead) continue;
        it.y += it.vy * dt;
        const inp = ctx.input(it.owner);
        if (inp.health === 'lost') continue;
        if (it.bomb) {
          const pts = [inp.leftHand, inp.rightHand, inp.head];
          if (pts.some((p) => Math.hypot(p.x - it.x, p.y - it.y) < it.r + 22)) {
            it.dead = true;
            bombs[it.owner]++;
            score[it.owner] = Math.max(0, score[it.owner] - 30);
            ctx.audio.play('explosion');
            ctx.fx.burst(it.x, it.y, ['#ff5a1f', '#333', '#ffd23d'], 30);
            ctx.fx.text('-30', it.x, it.y, C.bad, 32);
          }
        } else {
          const p = partPos(inp, it.part);
          const rr = it.part === 'head' ? inp.headRadius : Math.max(26, inp.torsoPx * 0.2);
          if (Math.hypot(p.x - it.x, p.y - it.y) < it.r + rr) {
            it.dead = true;
            caught[it.owner]++;
            const pts = 10 + Math.round(time / 6);
            score[it.owner] += pts;
            ctx.audio.play('coin');
            ctx.fx.burst(it.x, it.y, [ctx.players[it.owner].color, '#fff'], 16);
            ctx.fx.text(`+${pts}`, it.x, it.y - 20, '#fff', 28);
          }
        }
        if (it.y > ctx.height + 60) it.dead = true;
      }
      items = items.filter((it) => !it.dead);
      if (time >= DURATION) finish();
    },
    render(g) {
      for (const it of items) {
        if (it.bomb) {
          emoji(g, '💣', it.x, it.y, it.r * 2.2);
          continue;
        }
        emoji(g, it.fruit, it.x, it.y, it.r * 2.2);
        const label = LABEL[it.part][ctx.lang === 'id' ? 1 : 0];
        g.font = '800 14px system-ui';
        const w = g.measureText(label).width + 16;
        panel(g, it.x - w / 2, it.y + it.r + 2, w, 22, { fill: ctx.players[it.owner].color, r: 11 });
        text(g, label, it.x, it.y + it.r + 13, { size: 13, color: '#140b2e', stroke: 0, weight: 800 });
      }
      for (let i = 0; i < n; i++) {
        const inp = ctx.input(i);
        if (inp.health === 'lost') continue;
        circle(g, inp.leftElbow.x, inp.leftElbow.y, 10, undefined, '#fff', 2);
        circle(g, inp.rightElbow.x, inp.rightElbow.y, 10, undefined, '#fff', 2);
      }
      scoreHeader(g, ctx, coop ? [score.reduce((a, b) => a + b, 0), ''] : score, { timer: Math.max(0, DURATION - time), labels: coop ? [L(ctx, 'TEAM', 'TIM'), ''] : undefined });
    },
    inspect: () => ({ items: items.length, score: [...score] }),
  };
};

export default factory;
