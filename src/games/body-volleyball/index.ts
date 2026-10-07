import type { Point } from '../../core/math';
import { clamp } from '../../core/math';
import { C, circle, emoji, text } from '../../engine/draw';
import { scoreHeader, versusResult } from '../../engine/hud';
import type { GameFactory } from '../../engine/types';
import { L, tx } from '../kits/text';

/**
 * Body Volleyball (GAMES.md 6.9) — a virtual ball over a virtual net between you.
 * Hit it with your hands (or head); simple physics with friendly assists. First to 7.
 */
const WIN = 7;

const factory: GameFactory = (ctx) => {
  const score = [0, 0];
  const touches = [0, 0];
  const ball = { x: 0, y: 0, vx: 0, vy: 0, r: 34, spin: 0 };
  const prevHands: Point[][] = [[], []];
  const lastTouch = [-9, -9];
  let lastSide = -1;
  let serveIn = 1.5;
  let server = ctx.rng.chance(0.5) ? 0 : 1;
  let time = 0;
  let finished = false;
  let longest = 0;
  let rally = 0;

  const floor = () => ctx.height * 0.95;
  const netTop = () => ctx.height * 0.52;
  const G = () => ctx.height * 1.05;

  const serve = () => {
    ball.x = server === 0 ? ctx.width * 0.25 : ctx.width * 0.75;
    ball.y = ctx.height * 0.18;
    ball.vx = 0;
    ball.vy = 0;
    rally = 0;
    lastSide = -1;
    ctx.audio.play('whistle');
  };

  const point = (winner: number) => {
    score[winner]++;
    longest = Math.max(longest, rally);
    ctx.audio.play('coin');
    ctx.fx.text(`${ctx.players[winner].name} +1`, ctx.width / 2, ctx.height * 0.35, ctx.players[winner].color, 44);
    ctx.fx.burst(ball.x, floor(), ['#ffb703', '#fff'], 24);
    server = 1 - winner;
    serveIn = 1.4;
    if (score[winner] >= WIN) {
      finished = true;
      ctx.end(
        versusResult(ctx, score, {
          stats: [
            { label: L(ctx, 'Touches', 'Sentuhan'), values: touches.map(String) },
            { label: tx(ctx, 'statRally'), values: [String(longest)] },
          ],
        }),
      );
    }
  };

  return {
    view: { camera: 'dim', dim: 0.2, skeleton: true, hands: true },
    update(dt) {
      if (finished) return;
      time += dt;
      if (serveIn > 0) {
        serveIn -= dt;
        if (serveIn <= 0) serve();
        else return;
      }
      ball.vy += G() * dt * 0.75;
      ball.x += ball.vx * dt;
      ball.y += ball.vy * dt;
      ball.spin += ball.vx * dt * 0.02;
      // Walls
      if (ball.x < ball.r) {
        ball.x = ball.r;
        ball.vx = Math.abs(ball.vx) * 0.8;
      } else if (ball.x > ctx.width - ball.r) {
        ball.x = ctx.width - ball.r;
        ball.vx = -Math.abs(ball.vx) * 0.8;
      }
      if (ball.y < ball.r) {
        ball.y = ball.r;
        ball.vy = Math.abs(ball.vy) * 0.5;
      }
      // Net
      const nx = ctx.width / 2;
      if (ball.y > netTop() && Math.abs(ball.x - nx) < ball.r + 8) {
        ball.x = ball.x < nx ? nx - ball.r - 8 : nx + ball.r + 8;
        ball.vx = -ball.vx * 0.5;
        ctx.audio.play('thud', { volume: 0.5 });
      }
      // Players
      for (let i = 0; i < 2; i++) {
        const inp = ctx.input(i);
        if (inp.health === 'lost') continue;
        const colliders: Point[] = [inp.leftHand, inp.rightHand, inp.head];
        colliders.forEach((c, k) => {
          const prev = prevHands[i][k] ?? c;
          const hvx = (c.x - prev.x) / Math.max(dt, 1e-3);
          const hvy = (c.y - prev.y) / Math.max(dt, 1e-3);
          prevHands[i][k] = { x: c.x, y: c.y };
          const reach = k === 2 ? inp.headRadius : Math.max(42, inp.torsoPx * 0.3);
          if (time - lastTouch[i] < 0.3) return;
          if (Math.hypot(ball.x - c.x, ball.y - c.y) > reach + ball.r) return;
          lastTouch[i] = time;
          touches[i]++;
          if (lastSide !== i) rally++;
          lastSide = i;
          const dir = i === 0 ? 1 : -1;
          const power = clamp(Math.hypot(hvx, hvy) / 900, 0, 1);
          ball.vx = dir * (ctx.width * (0.32 + power * 0.25)) + clamp(hvx * 0.15, -200, 200);
          ball.vy = -ctx.height * (1.0 + power * 0.35) + clamp(hvy * 0.1, -150, 150);
          ctx.audio.play('hit', { pitch: 1.2 + power * 0.3, pan: dir * -0.5 });
          ctx.fx.ring(ball.x, ball.y, ctx.players[i].color, 20, 80);
        });
      }
      if (ball.y > floor() - ball.r) point(ball.x < ctx.width / 2 ? 1 : 0);
    },
    render(g) {
      const nx = ctx.width / 2;
      g.fillStyle = 'rgba(255,255,255,0.85)';
      g.fillRect(nx - 5, netTop(), 10, floor() - netTop());
      g.strokeStyle = 'rgba(255,255,255,0.5)';
      g.lineWidth = 2;
      for (let y = netTop(); y < floor(); y += 18) {
        g.beginPath();
        g.moveTo(nx - 22, y);
        g.lineTo(nx + 22, y);
        g.stroke();
      }
      g.fillStyle = 'rgba(255,183,3,0.25)';
      g.fillRect(0, floor(), ctx.width, ctx.height - floor());
      if (serveIn > 0 && ball.vy === 0) text(g, L(ctx, 'Serve!', 'Servis!'), server === 0 ? ctx.width * 0.25 : ctx.width * 0.75, ctx.height * 0.12, { size: 30, color: ctx.players[server].color });
      g.fillStyle = 'rgba(0,0,0,0.25)';
      g.beginPath();
      g.ellipse(ball.x, floor() - 4, ball.r * 0.9, 8, 0, 0, Math.PI * 2);
      g.fill();
      g.save();
      g.translate(ball.x, ball.y);
      g.rotate(ball.spin);
      emoji(g, '🏐', 0, 0, ball.r * 2.1);
      g.restore();
      if (ball.y < 0) circle(g, ball.x, 8, 8, C.gold);
      scoreHeader(g, ctx, score, { center: tx(ctx, 'firstTo', { n: WIN }) });
    },
    inspect: () => ({ ball: { ...ball }, score: [...score] }),
  };
};

export default factory;
