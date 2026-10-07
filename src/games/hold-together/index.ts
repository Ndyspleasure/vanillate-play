import { clamp, mean } from '../../core/math';
import { matchPose, poseById } from '../../core/motion/pose';
import { C, circle, text } from '../../engine/draw';
import { coopResult, scoreHeader } from '../../engine/hud';
import type { GameFactory, PlayerInput } from '../../engine/types';
import { L } from '../kits/text';
import { bubble, zoneMeter } from '../kits/ui';

/**
 * Hold Together (GAMES.md 6.16) — keep a shared condition alive for as long as possible.
 * Score = stability (time both held it) + synchronization (held together vs alone).
 */
type ChallengeId = 'handsUp' | 'spots' | 'slide' | 'freeze' | 'tpose' | 'squat';
const ORDER: ChallengeId[] = ['handsUp', 'spots', 'freeze', 'tpose', 'slide', 'squat'];
const DURATION = 8;

const NAMES: Record<ChallengeId, [string, string]> = {
  handsUp: ['BOTH HANDS UP', 'KEDUA TANGAN NAIK'],
  spots: ['STAND ON YOUR SPOT', 'BERDIRI DI TITIKMU'],
  slide: ['SLIDE LEFT TOGETHER', 'GESER KIRI BERSAMA'],
  freeze: ['FREEZE TOGETHER', 'DIAM BERSAMA'],
  tpose: ['T-POSE TOGETHER', 'POSE T BERSAMA'],
  squat: ['HOLD THE SQUAT', 'TAHAN JONGKOK'],
};

const factory: GameFactory = (ctx) => {
  let ci = -1;
  let t = 0;
  let phase: 'intro' | 'hold' = 'intro';
  let both = 0;
  let any = 0;
  const held: number[] = [];
  const syncs: number[] = [];
  let spots = [0, 0];
  let finished = false;

  const spotX = (i: number) => spots[i] - (ORDER[ci] === 'slide' && phase === 'hold' ? t * ctx.width * 0.025 : 0);

  const ok = (i: number, inp: PlayerInput): boolean => {
    switch (ORDER[ci]) {
      case 'handsUp':
        return inp.state.handsUp;
      case 'spots':
      case 'slide':
        return Math.abs(inp.center.x - spotX(i)) < Math.max(50, inp.torsoPx * 0.6);
      case 'freeze':
        return inp.state.energy < 0.4;
      case 'tpose':
        return matchPose(poseById('t-pose'), inp.state, inp.pose) > 0.7;
      case 'squat':
        return inp.state.squatting || inp.state.drop > 0.22;
    }
  };

  const next = () => {
    if (ci >= 0) {
      held.push(clamp(both / DURATION, 0, 1));
      syncs.push(any > 0 ? both / any : 0);
    }
    ci++;
    if (ci >= ORDER.length) {
      finished = true;
      const pct = (mean(held) * 0.8 + mean(syncs) * 0.2) * 100;
      ctx.end(
        coopResult(ctx, pct, {
          stats: [
            { label: L(ctx, 'Held together', 'Bertahan bersama'), values: [`${Math.round(mean(held) * 100)}%`] },
            { label: L(ctx, 'Sync', 'Sinkron'), values: [`${Math.round(mean(syncs) * 100)}%`] },
          ],
        }),
      );
      return;
    }
    phase = 'intro';
    t = 0;
    both = 0;
    any = 0;
    spots = [0, 1].map((i) => {
      const z = ctx.zone(i);
      return z.x + z.w * ctx.rng.range(0.35, 0.65) + (ORDER[ci] === 'slide' ? z.w * 0.15 : 0);
    });
  };

  next();

  return {
    view: { camera: 'dim', dim: 0.25, skeleton: true },
    update(dt) {
      if (finished) return;
      t += dt;
      if (phase === 'intro') {
        if (t > 1.6) {
          phase = 'hold';
          t = 0;
          ctx.audio.play('go');
        }
        return;
      }
      const a = ok(0, ctx.input(0));
      const b = ok(1, ctx.input(1));
      if (a && b) {
        both += dt;
        if (Math.floor((both - dt) * 2) !== Math.floor(both * 2)) ctx.audio.play('heart', { volume: 0.4 });
      }
      if (a || b) any += dt;
      if (t >= DURATION) {
        ctx.audio.play(both / DURATION > 0.7 ? 'success' : 'fail');
        next();
      }
    },
    render(g) {
      if (finished) return;
      const id = ORDER[ci];
      scoreHeader(g, ctx, [`${Math.round(mean(held.length ? held : [0]) * 100)}%`, `${ci + 1}/${ORDER.length}`], {
        labels: [L(ctx, 'HELD', 'BERTAHAN'), L(ctx, 'CHALLENGE', 'TANTANGAN')],
        timer: phase === 'hold' ? DURATION - t : undefined,
      });
      text(g, NAMES[id][ctx.lang === 'id' ? 1 : 0], ctx.width / 2, ctx.height * 0.24, { size: 44, color: C.vanilla, weight: 800 });
      if (id === 'spots' || id === 'slide') {
        for (let i = 0; i < 2; i++) {
          const x = spotX(i);
          circle(g, x, ctx.height * 0.88, 50, 'rgba(255,255,255,0.15)', ctx.players[i].color, 5);
          g.strokeStyle = ctx.players[i].color;
          g.setLineDash([8, 8]);
          g.lineWidth = 3;
          g.beginPath();
          g.moveTo(x, 120);
          g.lineTo(x, ctx.height * 0.88);
          g.stroke();
          g.setLineDash([]);
        }
      }
      if (phase === 'hold') {
        zoneMeter(g, ctx, 0, both / DURATION, L(ctx, 'Together', 'Bersama'), C.good);
        for (let i = 0; i < 2; i++) bubble(g, ctx.input(i), ok(i, ctx.input(i)) ? '✓' : '…', ok(i, ctx.input(i)) ? C.good : C.warn);
      }
    },
    inspect: () => ({ challenge: ORDER[ci], phase }),
  };
};

export default factory;
