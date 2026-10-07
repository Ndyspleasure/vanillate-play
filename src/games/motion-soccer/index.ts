import type { Point } from '../../core/math';
import { clamp, lerp } from '../../core/math';
import { C, circle, text } from '../../engine/draw';
import { scoreHeader, soloResult, versusResult } from '../../engine/hud';
import type { GameFactory } from '../../engine/types';
import { aimFromInput, aimPoint, drawAim, drawBall, drawKeeper, drawPitch, goalLayout, keeperFromInput, kicked, saved, type KeeperState, type Shot } from '../kits/goal';
import { L, tx } from '../kits/text';

/**
 * Motion Soccer (GAMES.md 6.30) — initial version per spec: shooting challenge vs an AI keeper
 * (corner targets = bonus) and goalkeeper challenge vs AI shots. Versus = alternate shooting.
 */
const SHOTS = 8;

const factory: GameFactory = (ctx) => {
  const keeperMode = ctx.options.challenge === 'keeper' && ctx.players.length === 1;
  const n = ctx.players.length;
  const shotsEach = n === 1 ? SHOTS : 5;
  const score = new Array(n).fill(0);
  const made = new Array(n).fill(0);
  const taken = new Array(n).fill(0);
  let shooter = 0;
  let phase: 'aim' | 'flight' | 'result' = 'aim';
  let t = 0;
  let time = 0;
  let aimX = 0;
  let aimY = 0;
  let shot: Shot | null = null;
  let keeper: KeeperState = { x: 0, reach: 0.5, dive: 0 };
  let diveUntil = 0;
  let aiTarget = { x: 0, y: 0 };
  let aiKickAt = 2;
  let msg = '';
  let finished = false;
  const corners: Point[] = [
    { x: -0.82, y: 0.7 },
    { x: 0.82, y: 0.7 },
  ];

  const next = () => {
    const total = taken.reduce((a, b) => a + b, 0);
    if (total >= shotsEach * n) {
      finished = true;
      const stats = [
        { label: keeperMode ? tx(ctx, 'statSaves') : tx(ctx, 'statGoals'), values: made.map(String) },
        { label: L(ctx, 'Shots', 'Tembakan'), values: taken.map(String) },
      ];
      if (n === 1) ctx.end(soloResult(ctx, score[0], { display: `${made[0]}/${shotsEach}`, subline: tx(ctx, 'points', { n: score[0] }), stats }));
      else ctx.end(versusResult(ctx, score, { stats }));
      return;
    }
    shooter = n === 1 ? 0 : total % n;
    phase = 'aim';
    t = 0;
    shot = null;
    keeper = { x: 0, reach: 0.5, dive: 0 };
    aiTarget = { x: ctx.rng.range(-0.95, 0.95), y: ctx.rng.range(-0.6, 0.8) };
    aiKickAt = ctx.rng.range(1.6, 2.8);
  };

  next();

  return {
    view: { camera: 'pip', skeleton: false },
    update(dt) {
      if (finished) return;
      time += dt;
      t += dt;
      const Lg = goalLayout(ctx);
      const me = ctx.input(shooter);
      if (keeperMode) {
        if (me.any('DODGE_LEFT', 'DODGE_RIGHT', 'STEP_LEFT', 'STEP_RIGHT', 'LEAN_LEFT', 'LEAN_RIGHT')) diveUntil = time + 0.6;
        keeper = keeperFromInput(me, keeper, dt, diveUntil, time);
      } else if (phase === 'flight' && shot) {
        // AI keeper reacts after a short delay, with a chance to guess wrong.
        const guess = shot.t > 0.18 ? (shot.to.x - (Lg.gx + Lg.gw / 2)) / (Lg.gw * 0.42) : 0;
        keeper.x = lerp(keeper.x, clamp(guess, -1, 1) * (aiTarget.x > 0.5 ? 0.7 : 1), 1 - Math.exp(-dt / 0.22));
        keeper.reach = 0.8;
      } else keeper.x = lerp(keeper.x, Math.sin(time * 1.3) * 0.25, 0.05);
      if (phase === 'aim') {
        if (keeperMode) {
          aimX = aiTarget.x;
          aimY = aiTarget.y;
          if (t > aiKickAt) {
            shot = { from: { ...Lg.spot }, to: aimPoint(Lg, aimX, aimY), t: 0, dur: 0.85, done: false };
            phase = 'flight';
            t = 0;
            ctx.audio.play('kick');
          }
        } else {
          aimX = lerp(aimX, aimFromInput(me), 1 - Math.exp(-dt / 0.1));
          aimY = Math.sin(time * 2.4) * 0.9;
          if ((t > 1 && kicked(me)) || t > 6) {
            shot = { from: { ...Lg.spot }, to: aimPoint(Lg, aimX + ctx.rng.range(-0.06, 0.06), aimY), t: 0, dur: 0.65, done: false };
            phase = 'flight';
            t = 0;
            ctx.audio.play('kick');
          }
        }
      } else if (phase === 'flight' && shot) {
        shot.t += dt;
        if (shot.t >= shot.dur) {
          taken[shooter]++;
          const isSaved = saved(Lg, keeper, shot.to);
          if (keeperMode) {
            if (isSaved) {
              made[0]++;
              score[0] += 100;
              msg = tx(ctx, 'saved');
              ctx.audio.play('cheer');
            } else {
              msg = tx(ctx, 'goal');
              ctx.audio.play('fail');
            }
          } else if (!isSaved && Math.abs(aimX) <= 1.02) {
            made[shooter]++;
            const corner = corners.some((c) => Math.abs(c.x - aimX) < 0.2 && Math.abs(c.y - aimY) < 0.35);
            score[shooter] += corner ? 250 : 100;
            msg = corner ? `${tx(ctx, 'goal')} +250` : tx(ctx, 'goal');
            ctx.audio.play('cheer');
            ctx.fx.confetti(ctx.width, corner ? 90 : 40);
          } else {
            msg = isSaved ? tx(ctx, 'saved') : tx(ctx, 'missed');
            ctx.audio.play('fail');
          }
          phase = 'result';
          t = 0;
        }
      } else if (phase === 'result' && t > 1.4) next();
    },
    renderBackground(g) {
      drawPitch(g, ctx, goalLayout(ctx));
    },
    render(g) {
      const Lg = goalLayout(ctx);
      if (!keeperMode)
        for (const c of corners) {
          const p = aimPoint(Lg, c.x, c.y);
          circle(g, p.x, p.y, 30, 'rgba(255,210,61,0.25)', C.gold, 3);
          text(g, '×2.5', p.x, p.y, { size: 14, stroke: 0, color: C.gold });
        }
      drawKeeper(g, Lg, keeper, keeperMode ? ctx.players[0].color : '#e0e0ff', keeperMode ? ctx.players[0].name : tx(ctx, 'cpu'));
      if (phase === 'aim' && !keeperMode) drawAim(g, aimPoint(Lg, aimX, aimY), ctx.players[shooter].color);
      if (phase === 'aim' && keeperMode && t > aiKickAt - 0.8) drawAim(g, aimPoint(Lg, aimX, aimY), C.bad);
      drawBall(g, shot, Lg);
      if (phase === 'result') text(g, msg, ctx.width / 2, ctx.height * 0.58, { size: 70, color: C.gold, weight: 800 });
      scoreHeader(g, ctx, score, { center: `${L(ctx, 'Shot', 'Tembakan')} ${Math.min(shotsEach, taken[shooter] + 1)}/${shotsEach}` });
      if (!keeperMode && phase === 'aim') text(g, `${ctx.players[shooter].name}: ${L(ctx, 'lean to aim, kick to shoot', 'condong untuk membidik, tendang')}`, ctx.width / 2, ctx.height - 26, { size: 20, color: C.vanilla });
    },
    inspect: () => ({ phase, score: [...score] }),
  };
};

export default factory;
