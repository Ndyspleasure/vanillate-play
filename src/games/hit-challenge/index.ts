import type { Point } from '../../core/math';
import { clamp, lerp } from '../../core/math';
import { C, circle, emoji, text } from '../../engine/draw';
import { scoreHeader, versusResult } from '../../engine/hud';
import type { GameFactory } from '../../engine/types';
import { L, tx } from '../kits/text';
import { bubble } from '../kits/ui';

/**
 * Hit Challenge (GAMES.md 6.11) — sparring pads pop up around your rival, marked L or R.
 * Throw the matching punch before the pad vanishes; your fist flies across the screen.
 * Variants: speed, combo chains, sudden death.
 */
interface Pad {
  owner: number; // who must hit it
  side: 'L' | 'R';
  slot: number;
  born: number;
  life: number;
  dead: boolean;
}

interface Fist {
  from: Point;
  pad: Pad;
  t: number;
  color: string;
}

const SLOTS: Point[] = [
  { x: -1.25, y: -0.35 },
  { x: 1.25, y: -0.35 },
  { x: -1.35, y: 0.55 },
  { x: 1.35, y: 0.55 },
  { x: 0, y: -1.1 },
];

const factory: GameFactory = (ctx) => {
  const variant = ctx.options.variant ?? 'speed';
  const score = [0, 0];
  const hits = [0, 0];
  const wrong = [0, 0];
  const streak = [0, 0];
  const best = [0, 0];
  const out = [false, false];
  const pads: Pad[] = [];
  let fists: Fist[] = [];
  let time = 0;
  let finished = false;
  const DURATION = variant === 'sudden' ? 90 : 45;
  const rival = (i: number) => 1 - i;

  const padPos = (p: Pad): Point => {
    const target = ctx.input(rival(p.owner));
    const T = Math.max(70, target.torsoPx);
    const s = SLOTS[p.slot];
    return { x: target.shoulders.x + s.x * T, y: target.shoulders.y + s.y * T };
  };

  const spawn = (i: number) => {
    const used = pads.filter((p) => !p.dead && p.owner === i).map((p) => p.slot);
    const free = [0, 1, 2, 3, 4].filter((s) => !used.includes(s));
    const slot = ctx.rng.pick(free);
    const life = variant === 'sudden' ? Math.max(1.1, 2 - time * 0.015) : variant === 'combo' ? 1.6 : 2.3;
    pads.push({ owner: i, side: ctx.rng.chance(0.5) ? 'L' : 'R', slot, born: time, life, dead: false });
  };

  const finish = () => {
    if (finished) return;
    finished = true;
    const scores = variant === 'sudden' ? score.map((s, i) => (out[i] ? s : s + 100000)) : score;
    ctx.end(
      versusResult(ctx, scores, {
        display: (v) => String(v % 100000),
        stats: [
          { label: tx(ctx, 'statHits'), values: hits.map(String) },
          { label: L(ctx, 'Wrong hand', 'Tangan salah'), values: wrong.map(String) },
          { label: tx(ctx, 'statBestCombo'), values: best.map(String) },
        ],
      }),
    );
  };

  return {
    view: { camera: 'dim', dim: 0.2, skeleton: true },
    update(dt) {
      if (finished) return;
      time += dt;
      for (const p of pads) {
        if (!p.dead && time - p.born > p.life) {
          p.dead = true;
          streak[p.owner] = 0;
          if (variant === 'sudden') {
            out[p.owner] = true;
            ctx.audio.play('buzzer');
          }
        }
      }
      for (let i = 0; i < 2; i++) {
        if (out[i]) continue;
        const inp = ctx.input(i);
        const side = inp.has('PUNCH_LEFT') ? 'L' : inp.has('PUNCH_RIGHT') ? 'R' : null;
        if (side) {
          const mine = pads.filter((p) => !p.dead && p.owner === i).sort((a, b) => a.born - b.born);
          const match = mine.find((p) => p.side === side);
          if (match) {
            match.dead = true;
            fists.push({ from: { ...(side === 'L' ? inp.leftHand : inp.rightHand) }, pad: match, t: 0, color: ctx.players[i].color });
            ctx.audio.play('whoosh');
            const age = time - match.born;
            streak[i]++;
            best[i] = Math.max(best[i], streak[i]);
            hits[i]++;
            const combo = variant === 'combo' ? Math.min(4, 1 + Math.floor(streak[i] / 3)) : 1;
            score[i] += Math.round((60 + 60 * clamp(1 - age / match.life, 0, 1)) * combo);
          } else if (mine.length) {
            wrong[i]++;
            streak[i] = 0;
            score[i] = Math.max(0, score[i] - 20);
            ctx.audio.play('fail');
            ctx.fx.text(tx(ctx, 'wrong'), inp.head.x, inp.head.y - 70, C.bad, 28);
            if (variant === 'sudden') out[i] = true;
          }
        }
        const want = variant === 'combo' ? 3 : time > 20 ? 2 : 1;
        if (pads.filter((p) => !p.dead && p.owner === i).length < want) spawn(i);
      }
      for (const f of fists) {
        f.t += dt / 0.22;
        if (f.t >= 1) {
          const p = padPos(f.pad);
          ctx.audio.play('punch');
          ctx.fx.burst(p.x, p.y, [f.color, '#fff'], 16, { speed: 300 });
          ctx.fx.ring(p.x, p.y, f.color, 10, 70);
        }
      }
      fists = fists.filter((f) => f.t < 1);
      for (let k = pads.length - 1; k >= 0; k--) if (pads[k].dead && time - pads[k].born > pads[k].life + 1) pads.splice(k, 1);
      if (time >= DURATION || out.some(Boolean)) finish();
    },
    render(g) {
      for (const p of pads) {
        if (p.dead) continue;
        const pos = padPos(p);
        const remain = 1 - (time - p.born) / p.life;
        const color = ctx.players[p.owner].color;
        circle(g, pos.x, pos.y, 40, 'rgba(255,255,255,0.92)', color, 6);
        circle(g, pos.x, pos.y, 46, undefined, `rgba(255,255,255,${0.3 + 0.5 * remain})`, 3);
        text(g, p.side, pos.x, pos.y + 2, { size: 38, color, stroke: 0, weight: 800 });
        g.strokeStyle = color;
        g.lineWidth = 5;
        g.beginPath();
        g.arc(pos.x, pos.y, 52, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * remain);
        g.stroke();
      }
      for (const f of fists) {
        const to = padPos(f.pad);
        emoji(g, '👊', lerp(f.from.x, to.x, f.t), lerp(f.from.y, to.y, f.t), 60 + 30 * f.t);
      }
      scoreHeader(g, ctx, score, { timer: Math.max(0, DURATION - time), center: L(ctx, 'Punch the pads around your rival', 'Pukul pad di sekitar lawanmu') });
      for (let i = 0; i < 2; i++) {
        if (out[i]) bubble(g, ctx.input(i), tx(ctx, 'out'), C.muted);
        else if (streak[i] > 2) bubble(g, ctx.input(i), tx(ctx, 'combo', { n: streak[i] }), C.gold);
      }
    },
    inspect: () => ({ pads: pads.filter((p) => !p.dead).map((p) => ({ owner: p.owner, side: p.side })), score: [...score] }),
  };
};

export default factory;
