import type { Point } from '../../core/math';
import { lerp } from '../../core/math';
import { C, circle, emoji } from '../../engine/draw';
import { scoreHeader, soloResult, versusResult } from '../../engine/hud';
import type { GameFactory, PlayerInput } from '../../engine/types';
import { L, tx } from '../kits/text';
import { hearts } from '../kits/ui';

/**
 * Motion Shooter (GAMES.md 6.27) — your raised hand moves the crosshair; punch (or reach) to fire.
 * Pop balloons; bullseyes score double; don't hit the bombs. Range / time attack / moving / endless.
 */
interface Balloon {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  color: string;
  bomb: boolean;
  dead: boolean;
}

const COLORS = ['#ef476f', '#ffd166', '#06d6a0', '#118ab2', '#b98cff', '#ff9f1c'];

const factory: GameFactory = (ctx) => {
  const variant = ctx.options.variant ?? 'range';
  const n = ctx.players.length;
  const score = new Array(n).fill(0);
  const shots = new Array(n).fill(0);
  const hitsN = new Array(n).fill(0);
  const bulls = new Array(n).fill(0);
  const aim: Point[] = ctx.players.map(() => ({ x: ctx.width / 2, y: ctx.height / 2 }));
  const cool = new Array(n).fill(0);
  let balloons: Balloon[] = [];
  let lives = 3;
  let time = 0;
  let nextSpawn = 0;
  let finished = false;
  const DURATION = variant === 'time' ? 30 : variant === 'endless' ? 9999 : 45;

  const crossFrom = (inp: PlayerInput): Point => (inp.leftHand.y < inp.rightHand.y ? inp.leftHand : inp.rightHand);

  const spawn = () => {
    const r = ctx.rng.range(32, 50);
    const bomb = ctx.rng.chance(0.12);
    const base = { r, color: ctx.rng.pick(COLORS), bomb, dead: false };
    if (variant === 'range') balloons.push({ ...base, x: ctx.rng.range(80, ctx.width - 80), y: ctx.rng.range(150, ctx.height * 0.7), vx: 0, vy: Math.sin(time) * 10 });
    else if (variant === 'moving') {
      const left = ctx.rng.chance(0.5);
      balloons.push({ ...base, x: left ? -40 : ctx.width + 40, y: ctx.rng.range(150, ctx.height * 0.7), vx: (left ? 1 : -1) * ctx.rng.range(120, 220), vy: 0 });
    } else balloons.push({ ...base, x: ctx.rng.range(80, ctx.width - 80), y: ctx.height + 50, vx: ctx.rng.range(-30, 30), vy: -ctx.rng.range(70, 120 + time * 2) });
    nextSpawn = variant === 'range' ? 1.1 : Math.max(0.4, 1 - time * 0.01);
  };

  const finish = () => {
    if (finished) return;
    finished = true;
    const stats = [
      { label: tx(ctx, 'statHits'), values: hitsN.map(String) },
      { label: tx(ctx, 'statAccuracy'), values: shots.map((s, i) => (s ? `${Math.round((hitsN[i] / s) * 100)}%` : '—')) },
      { label: 'Bullseye', values: bulls.map(String) },
    ];
    if (n === 1) ctx.end(soloResult(ctx, score[0], { stats }));
    else ctx.end(versusResult(ctx, score, { stats }));
  };

  return {
    view: { camera: 'dim', dim: 0.35, skeleton: true },
    update(dt) {
      if (finished) return;
      time += dt;
      nextSpawn -= dt;
      const live = balloons.filter((b) => !b.dead && !b.bomb).length;
      if (nextSpawn <= 0 && (variant !== 'range' || live < 4)) spawn();
      for (const b of balloons) {
        if (b.dead) continue;
        b.x += b.vx * dt;
        b.y += variant === 'range' ? Math.sin(time * 2 + b.x) * 8 * dt : b.vy * dt;
        if (b.y < -60 || b.x < -80 || b.x > ctx.width + 80) {
          b.dead = true;
          if (variant === 'endless' && !b.bomb) {
            lives--;
            ctx.audio.play('fail');
          }
        }
      }
      for (let i = 0; i < n; i++) {
        const inp = ctx.input(i);
        cool[i] = Math.max(0, cool[i] - dt);
        if (inp.health !== 'lost') {
          const c = crossFrom(inp);
          aim[i].x = lerp(aim[i].x, c.x, 1 - Math.exp(-dt / 0.05));
          aim[i].y = lerp(aim[i].y, c.y, 1 - Math.exp(-dt / 0.05));
        }
        if (cool[i] === 0 && inp.any('PUNCH_LEFT', 'PUNCH_RIGHT', 'REACH')) {
          cool[i] = 0.3;
          shots[i]++;
          ctx.audio.play('shoot');
          const hit = balloons.find((b) => !b.dead && Math.hypot(b.x - aim[i].x, b.y - aim[i].y) < b.r + 10);
          if (hit) {
            hit.dead = true;
            if (hit.bomb) {
              score[i] = Math.max(0, score[i] - 50);
              ctx.audio.play('explosion');
              ctx.fx.text('-50', hit.x, hit.y, C.bad, 34);
              ctx.fx.shake(8, 0.2);
            } else {
              const bull = Math.hypot(hit.x - aim[i].x, hit.y - aim[i].y) < hit.r * 0.4;
              const pts = bull ? 100 : 50;
              score[i] += pts;
              hitsN[i]++;
              if (bull) bulls[i]++;
              ctx.audio.play('pop');
              ctx.fx.burst(hit.x, hit.y, [hit.color, '#fff'], 20);
              ctx.fx.text(bull ? `BULLSEYE +${pts}` : `+${pts}`, hit.x, hit.y - 20, bull ? C.gold : '#fff', bull ? 30 : 26);
            }
          } else ctx.fx.ring(aim[i].x, aim[i].y, ctx.players[i].color, 6, 30, 0.25, 3);
        }
      }
      balloons = balloons.filter((b) => !b.dead);
      if (time >= DURATION || lives <= 0) finish();
    },
    render(g) {
      for (const b of balloons) emoji(g, b.bomb ? '💣' : '🎈', b.x, b.y, b.r * 2.2, 1, b.color);
      for (let i = 0; i < n; i++) {
        const p = aim[i];
        const col = ctx.players[i].color;
        circle(g, p.x, p.y, 26, undefined, col, 4);
        circle(g, p.x, p.y, 4, col);
        g.strokeStyle = col;
        g.lineWidth = 3;
        g.beginPath();
        g.moveTo(p.x - 38, p.y);
        g.lineTo(p.x - 14, p.y);
        g.moveTo(p.x + 14, p.y);
        g.lineTo(p.x + 38, p.y);
        g.moveTo(p.x, p.y - 38);
        g.lineTo(p.x, p.y - 14);
        g.moveTo(p.x, p.y + 14);
        g.lineTo(p.x, p.y + 38);
        g.stroke();
      }
      scoreHeader(g, ctx, score, { timer: DURATION < 900 ? Math.max(0, DURATION - time) : undefined, center: L(ctx, 'Raise a hand to aim · punch to fire', 'Angkat tangan untuk membidik · pukul untuk menembak') });
      if (variant === 'endless') hearts(g, ctx.width / 2, 110, lives, 3, 26, 'center');
    },
    inspect: () => ({ balloons: balloons.length, score: [...score] }),
  };
};

export default factory;
