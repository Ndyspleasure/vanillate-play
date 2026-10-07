import type { Point } from '../../core/math';
import { clamp } from '../../core/math';
import { C, circle, emoji, text } from '../../engine/draw';
import { scoreHeader, soloResult, versusResult } from '../../engine/hud';
import type { GameFactory } from '../../engine/types';
import { L, tx } from '../kits/text';

/**
 * Motion Basketball (GAMES.md 6.31) — dip, then throw both hands up to shoot. Release speed sets
 * power, hand drift sets direction; a gentle aim assist keeps it fun. Modes: free throw, 3-point,
 * moving hoop, time attack. Duo players alternate shots.
 */
interface Ball {
  x: number;
  y: number;
  vx: number;
  vy: number;
  owner: number;
  scored: boolean;
  dead: boolean;
  rimHits: number;
}

const factory: GameFactory = (ctx) => {
  const variant = ctx.options.variant ?? 'free';
  const n = ctx.players.length;
  const shotsEach = variant === 'time' ? 999 : 10;
  const timeEach = variant === 'time' ? (n === 1 ? 60 : 30) : 9999;
  const pts = variant === 'three' ? 3 : 2;
  const score = new Array(n).fill(0);
  const made = new Array(n).fill(0);
  const taken = new Array(n).fill(0);
  let shooter = 0;
  let balls: Ball[] = [];
  let cool = 0;
  let turnT = 0;
  let time = 0;
  let streak = 0;
  let finished = false;
  const hist: { t: number; y: number; x: number }[] = [];

  const hoop = (): Point & { r: number } => {
    const base = variant === 'three' ? 0.18 : 0.24;
    const x = variant === 'moving' ? ctx.width / 2 + Math.sin(time * 0.9) * ctx.width * 0.28 : ctx.width / 2;
    return { x, y: ctx.height * base, r: variant === 'three' ? 44 : 56 };
  };
  const G = () => ctx.height * 1.6;

  const shoot = (from: Point, power: number, drift: number) => {
    const h = hoop();
    // Ideal arc: time of flight T from apex height.
    const T = 1.0;
    const ivx = (h.x - from.x) / T;
    const ivy = (h.y - from.y - 0.5 * G() * T * T) / T;
    const err = clamp(power, 0.5, 1.6);
    const assist = variant === 'three' ? 0.75 : 0.85;
    const vx = ivx * (assist + (1 - assist) * err) + drift * (1 - assist) * 600;
    const vy = ivy * (assist + (1 - assist) * err);
    balls.push({ x: from.x, y: from.y, vx, vy, owner: shooter, scored: false, dead: false, rimHits: 0 });
    taken[shooter]++;
    cool = 0.9;
    ctx.audio.play('whoosh');
  };

  const nextShooter = () => {
    if (n === 1) return;
    shooter = (shooter + 1) % n;
    turnT = 0;
  };

  const finish = () => {
    if (finished) return;
    finished = true;
    const stats = [
      { label: tx(ctx, 'statShots'), values: made.map((m, i) => `${m}/${taken[i]}`) },
      { label: tx(ctx, 'statAccuracy'), values: made.map((m, i) => (taken[i] ? `${Math.round((m / taken[i]) * 100)}%` : '—')) },
    ];
    if (n === 1) ctx.end(soloResult(ctx, score[0], { stats }));
    else ctx.end(versusResult(ctx, score, { stats }));
  };

  return {
    view: { camera: 'dim', dim: 0.25, skeleton: true },
    update(dt) {
      if (finished) return;
      time += dt;
      turnT += dt;
      cool = Math.max(0, cool - dt);
      const inp = ctx.input(shooter);
      const hy = (inp.leftHand.y + inp.rightHand.y) / 2;
      const hx = (inp.leftHand.x + inp.rightHand.x) / 2;
      hist.push({ t: time, y: hy, x: hx });
      while (hist.length && time - hist[0].t > 0.3) hist.shift();
      const canShoot = cool === 0 && taken[shooter] < shotsEach && turnT < timeEach;
      if (canShoot && inp.any('HANDS_UP', 'FLAP', 'JUMP')) {
        const old = hist[0];
        const rise = old ? (old.y - hy) / Math.max(0.05, time - old.t) / Math.max(60, inp.torsoPx) : 1.5;
        const drift = old ? clamp((hx - old.x) / Math.max(60, inp.torsoPx), -1, 1) : 0;
        shoot({ x: hx, y: Math.min(hy, inp.head.y) }, clamp(rise / 3, 0.6, 1.5), drift);
      }
      const h = hoop();
      for (const b of balls) {
        if (b.dead) continue;
        const py = b.y;
        b.vy += G() * dt;
        b.x += b.vx * dt;
        b.y += b.vy * dt;
        // Rim contacts
        for (const rx of [h.x - h.r, h.x + h.r]) {
          if (Math.hypot(b.x - rx, b.y - h.y) < 22 && b.rimHits < 3) {
            b.rimHits++;
            b.vx = (b.x - rx) * 6;
            b.vy = -Math.abs(b.vy) * 0.45;
            ctx.audio.play('block', { volume: 0.5 });
          }
        }
        if (!b.scored && py < h.y && b.y >= h.y && Math.abs(b.x - h.x) < h.r - 12 && b.vy > 0) {
          b.scored = true;
          const p = b.owner;
          made[p]++;
          const bonus = b.rimHits === 0 ? 1 : 0;
          score[p] += pts + bonus;
          streak++;
          ctx.audio.play('swish');
          ctx.fx.burst(h.x, h.y + 20, [ctx.players[p].color, C.gold, '#fff'], 26);
          ctx.fx.text(bonus ? `${tx(ctx, 'swish')} +${pts + 1}` : `+${pts}`, h.x, h.y - 40, C.gold, 38);
        }
        if (b.y > ctx.height + 80) {
          b.dead = true;
          if (!b.scored) streak = 0;
          if (n > 1 && variant !== 'time') nextShooter();
        }
      }
      balls = balls.filter((b) => !b.dead);
      if (variant === 'time' && n > 1 && turnT >= timeEach && balls.length === 0) nextShooter();
      const allDone = ctx.players.every((p) => (variant === 'time' ? false : taken[p.index] >= shotsEach));
      const timeDone = variant === 'time' && (n === 1 ? time >= timeEach : time >= timeEach * n + 2);
      if ((allDone || timeDone) && balls.length === 0) finish();
    },
    render(g) {
      const h = hoop();
      // Backboard + hoop
      g.fillStyle = 'rgba(255,255,255,0.9)';
      g.fillRect(h.x - h.r * 1.6, h.y - h.r * 1.9, h.r * 3.2, h.r * 1.8);
      g.strokeStyle = '#ff4d6d';
      g.lineWidth = 4;
      g.strokeRect(h.x - h.r * 0.6, h.y - h.r * 1.2, h.r * 1.2, h.r * 0.9);
      g.strokeStyle = 'rgba(255,255,255,0.8)';
      g.lineWidth = 2;
      for (let k = -3; k <= 3; k++) {
        g.beginPath();
        g.moveTo(h.x + (k * h.r) / 3.5, h.y);
        g.lineTo(h.x + (k * h.r) / 6, h.y + h.r * 1.1);
        g.stroke();
      }
      g.strokeStyle = '#ff7a00';
      g.lineWidth = 7;
      g.beginPath();
      g.ellipse(h.x, h.y, h.r, h.r * 0.22, 0, 0, Math.PI * 2);
      g.stroke();
      for (const b of balls) emoji(g, '🏀', b.x, b.y, 54);
      const inp = ctx.input(shooter);
      if (cool === 0 && inp.health !== 'lost') {
        const hx = (inp.leftHand.x + inp.rightHand.x) / 2;
        const hy = (inp.leftHand.y + inp.rightHand.y) / 2;
        emoji(g, '🏀', hx, hy, 50);
        circle(g, hx, hy, 34, undefined, ctx.players[shooter].color, 3);
      }
      const center = variant === 'time' ? `${Math.max(0, Math.ceil((n === 1 ? timeEach - time : timeEach - turnT)))}s` : `${ctx.players[shooter].name}: ${Math.min(shotsEach, taken[shooter] + 1)}/${shotsEach}`;
      scoreHeader(g, ctx, score, { center });
      if (time < 5) text(g, L(ctx, 'Dip low, then throw both hands up to shoot!', 'Turunkan bola, lalu lempar kedua tangan ke atas!'), ctx.width / 2, ctx.height - 36, { size: 22, color: C.vanilla });
      if (streak >= 3) text(g, `🔥 ${streak}`, ctx.width - 60, ctx.height - 40, { size: 30, color: C.gold });
    },
    inspect: () => ({ shooter, taken: [...taken], score: [...score], balls: balls.length }),
  };
};

export default factory;
