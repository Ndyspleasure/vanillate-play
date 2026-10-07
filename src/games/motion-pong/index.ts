import { clamp, lerp, smoothFactor } from '../../core/math';
import { C, circle, roundRect, withAlpha } from '../../engine/draw';
import { scoreHeader, soloResult, versusResult } from '../../engine/hud';
import type { GameFactory, PlayerInput } from '../../engine/types';

/**
 * Motion Pong (GAMES.md 6.25) — the simplest technical demo: your highest hand is the paddle.
 * Validates tracking stability, latency, player separation and smoothing.
 */
const WIN = 7;

const factory: GameFactory = (ctx) => {
  const solo = ctx.players.length === 1;
  const score = [0, 0];
  const paddleY = [ctx.height / 2, ctx.height / 2];
  const hits = [0, 0];
  let longestRally = 0;
  let rally = 0;
  const ball = { x: ctx.width / 2, y: ctx.height / 2, vx: 0, vy: 0, r: 16 };
  const trail: { x: number; y: number }[] = [];
  let serveIn = 1.2;
  let serveDir = ctx.rng.chance(0.5) ? -1 : 1;
  let finished = false;
  let aiError = 0;

  const top = () => 110;
  const bottom = () => ctx.height - 24;
  const ph = () => Math.max(110, ctx.height * 0.22);
  const px = (i: number) => (i === 0 ? 46 : ctx.width - 46);

  const handTarget = (inp: PlayerInput): number => {
    const y = Math.min(inp.leftHand.y, inp.rightHand.y);
    return y;
  };

  const serve = () => {
    const speed = Math.max(380, ctx.width * 0.38);
    const angle = ctx.rng.range(-0.5, 0.5);
    ball.x = ctx.width / 2;
    ball.y = (top() + bottom()) / 2;
    ball.vx = Math.cos(angle) * speed * serveDir;
    ball.vy = Math.sin(angle) * speed;
    rally = 0;
    ctx.audio.play('whoosh');
  };

  const point = (scorer: number) => {
    score[scorer]++;
    longestRally = Math.max(longestRally, rally);
    ctx.audio.play(solo && scorer === 1 ? 'fail' : 'coin');
    ctx.fx.flash(ctx.players[scorer]?.color ?? C.bad, 0.25);
    ctx.fx.text(scorer === 1 && solo ? 'CPU +1' : `${ctx.players[scorer].name} +1`, ctx.width / 2, ctx.height / 2, ctx.players[scorer]?.color ?? C.bad, 44);
    serveDir = scorer === 0 ? 1 : -1;
    serveIn = 1.2;
    ball.vx = 0;
    ball.vy = 0;
    ball.x = ctx.width / 2;
    if (score[scorer] >= WIN) {
      finished = true;
      const stats = [
        { label: 'Paddle hits', values: solo ? [String(hits[0])] : hits.map(String) },
        { label: 'Longest rally', values: [String(longestRally)] },
      ];
      if (solo) {
        const won = score[0] > score[1];
        ctx.end(
          soloResult(ctx, score[0] * 100 + hits[0], {
            display: `${score[0]} – ${score[1]}`,
            headline: won ? 'YOU BEAT THE CPU!' : 'CPU WINS',
            subline: won ? 'Unstoppable paddle!' : 'Rematch the machine!',
            stats,
            recordLabel: 'Best match score',
          }),
        );
      } else ctx.end(versusResult(ctx, score, { stats }));
    }
  };

  return {
    view: { camera: 'dim', dim: 0.35, skeleton: true, hands: true },
    update(dt) {
      if (finished) return;
      const half = ph() / 2;
      for (let i = 0; i < 2; i++) {
        let target: number;
        if (i === 1 && solo) {
          // AI: follow the ball with limited speed and a little human-like error.
          aiError += (ctx.rng.range(-1, 1) * 60 - aiError) * smoothFactor(dt, 0.8);
          const goal = ball.vx > 0 ? ball.y + aiError : (top() + bottom()) / 2;
          const maxV = 420 + score[0] * 40;
          target = paddleY[1] + clamp(goal - paddleY[1], -maxV * dt, maxV * dt);
          paddleY[1] = target;
        } else {
          const inp = ctx.input(i);
          if (inp.health !== 'lost') {
            target = handTarget(inp);
            paddleY[i] = lerp(paddleY[i], target, smoothFactor(dt, 0.05));
          }
        }
        paddleY[i] = clamp(paddleY[i], top() + half, bottom() - half);
      }

      if (serveIn > 0) {
        serveIn -= dt;
        if (serveIn <= 0) serve();
        return;
      }
      ball.x += ball.vx * dt;
      ball.y += ball.vy * dt;
      trail.push({ x: ball.x, y: ball.y });
      if (trail.length > 14) trail.shift();
      if (ball.y < top() + ball.r) {
        ball.y = top() + ball.r;
        ball.vy = Math.abs(ball.vy);
        ctx.audio.play('pop', { pitch: 0.8 });
      } else if (ball.y > bottom() - ball.r) {
        ball.y = bottom() - ball.r;
        ball.vy = -Math.abs(ball.vy);
        ctx.audio.play('pop', { pitch: 0.8 });
      }
      for (let i = 0; i < 2; i++) {
        const x = px(i);
        const dir = i === 0 ? -1 : 1;
        if (Math.sign(ball.vx) !== dir) continue;
        const within = i === 0 ? ball.x - ball.r <= x + 12 && ball.x > x - 30 : ball.x + ball.r >= x - 12 && ball.x < x + 30;
        if (within && Math.abs(ball.y - paddleY[i]) <= half + ball.r) {
          const off = clamp((ball.y - paddleY[i]) / half, -1, 1);
          const speed = Math.min(Math.hypot(ball.vx, ball.vy) * 1.06, ctx.width * 1.2);
          const ang = off * 1.0;
          ball.vx = Math.cos(ang) * speed * -dir;
          ball.vy = Math.sin(ang) * speed;
          ball.x = x - dir * 14 + -dir * ball.r;
          hits[i]++;
          rally++;
          ctx.audio.play('hit', { pitch: 1 + rally * 0.03, pan: dir * 0.6 });
          ctx.fx.burst(ball.x, ball.y, solo && i === 1 ? '#ffffff' : ctx.players[i].color, 12, { speed: 220, gravity: 0 });
          if (rally > 0 && rally % 5 === 0) ctx.fx.text(`RALLY ${rally}!`, ctx.width / 2, ctx.height * 0.3, C.vanilla, 36);
        }
      }
      if (ball.x < -ball.r * 2) point(1);
      else if (ball.x > ctx.width + ball.r * 2) point(0);
    },
    render(g) {
      // Center line
      g.setLineDash([16, 18]);
      g.strokeStyle = 'rgba(255,255,255,0.35)';
      g.lineWidth = 4;
      g.beginPath();
      g.moveTo(ctx.width / 2, top());
      g.lineTo(ctx.width / 2, bottom());
      g.stroke();
      g.setLineDash([]);
      // Paddles
      for (let i = 0; i < 2; i++) {
        const color = solo && i === 1 ? '#e0e0ff' : ctx.players[i].color;
        const h = ph();
        g.shadowColor = color;
        g.shadowBlur = 22;
        roundRect(g, px(i) - 12, paddleY[i] - h / 2, 24, h, 12);
        g.fillStyle = color;
        g.fill();
        g.shadowBlur = 0;
      }
      // Ball + trail
      trail.forEach((p, i) => circle(g, p.x, p.y, ball.r * (i / trail.length), withAlpha('#ffe9b8', (i / trail.length) * 0.5)));
      circle(g, ball.x, ball.y, ball.r, '#fff7e8', '#ffd23d', 4);
      scoreHeader(g, ctx, [score[0], score[1]], {
        labels: solo ? [ctx.players[0].name, 'CPU'] : undefined,
        center: `First to ${WIN}`,
      });
    },
  };
};

export default factory;
