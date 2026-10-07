import { mean } from '../../core/math';
import { comparePoses, poseActivity, type PoseVector } from '../../core/motion/pose';
import { C, text } from '../../engine/draw';
import { coopResult, scoreHeader } from '../../engine/hud';
import type { GameFactory } from '../../engine/types';
import { L, tx } from '../kits/text';
import { bubble, zoneMeter } from '../kits/ui';

/**
 * Mirror Challenge (GAMES.md 6.14 / 6.34) — the leader moves freely, the follower copies in real
 * time, then swap. Follower poses are compared to the leader's recent poses (up to 0.8 s of lag
 * allowed) so natural reaction delay is fine. Result: one sync percentage.
 */
const ROUND = 20;
const MAX_LAG = 0.8;
const IDEAS_EN = ['Wave your arms', 'Lean side to side', 'Squat slowly', 'Make a big T', 'Point up high', 'Flex!'];
const IDEAS_ID = ['Lambaikan lengan', 'Condong kiri-kanan', 'Jongkok pelan', 'Bentuk huruf T', 'Tunjuk ke atas', 'Pamer otot!'];

const factory: GameFactory = (ctx) => {
  let round = 0;
  let leader = 0;
  let t = 0;
  let phase: 'intro' | 'play' = 'intro';
  const samples: number[][] = [[], []];
  let history: { t: number; v: PoseVector; active: boolean }[] = [];
  let live = 0;
  let idle = 0;
  let finished = false;

  const start = () => {
    round++;
    if (round > 2) {
      finished = true;
      const all = [...samples[0], ...samples[1]];
      const m = all.length ? mean(all) : 0;
      const sd = all.length ? Math.sqrt(mean(all.map((x) => (x - m) ** 2))) : 1;
      const pct = (m * 0.9 + Math.max(0, 1 - sd * 2) * 0.1) * 100;
      ctx.end(
        coopResult(ctx, pct, {
          stats: ctx.players.map((p, i) => ({ label: `${p.name} → ${L(ctx, 'follower', 'pengikut')}`, values: [`${Math.round(mean(samples[i].length ? samples[i] : [0]) * 100)}%`] })),
        }),
      );
      return;
    }
    leader = round === 1 ? 0 : 1;
    phase = 'intro';
    t = 0;
    history = [];
    ctx.banner(`${ctx.players[leader].name} = ${tx(ctx, 'leader')}`, `${ctx.players[1 - leader].name} = ${tx(ctx, 'follower')}`, 1.8);
  };

  start();

  return {
    view: { camera: 'full', dim: 0.1, skeleton: true },
    update(dt) {
      if (finished) return;
      t += dt;
      if (phase === 'intro') {
        if (t > 2) {
          phase = 'play';
          t = 0;
          ctx.audio.music.play('chill');
        }
        return;
      }
      const L0 = ctx.input(leader);
      const F = ctx.input(1 - leader);
      const active = poseActivity(L0.pose) > 0.18 || L0.state.energy > 0.35;
      history.push({ t, v: { angles: { ...L0.pose.angles }, legs: L0.pose.legs }, active });
      while (history.length && t - history[0].t > MAX_LAG) history.shift();
      idle = active ? 0 : idle + dt;
      if (active && F.health !== 'lost') {
        let best = 0;
        for (const h of history) {
          const lag = t - h.t;
          const s = comparePoses(h.v, F.pose) * (1 - (lag / MAX_LAG) * 0.15);
          if (s > best) best = s;
        }
        live = live * 0.85 + best * 0.15;
        samples[1 - leader].push(best);
      }
      if (t >= ROUND) {
        ctx.audio.music.stop(300);
        start();
      }
    },
    destroy() {
      ctx.audio.music.stop(100);
    },
    render(g) {
      scoreHeader(g, ctx, ctx.players.map((_p, i) => (i === leader ? tx(ctx, 'leader') : `${Math.round(live * 100)}%`)), {
        timer: phase === 'play' ? ROUND - t : undefined,
        center: tx(ctx, 'round', { n: Math.min(round, 2) }),
      });
      if (phase !== 'play') return;
      bubble(g, ctx.input(leader), `👑 ${tx(ctx, 'leader')}`, C.gold);
      bubble(g, ctx.input(1 - leader), `🪞 ${tx(ctx, 'follower')}`, ctx.players[1 - leader].color);
      zoneMeter(g, ctx, 1 - leader, live, tx(ctx, 'syncPct', { p: Math.round(live * 100) }));
      if (idle > 1.5) {
        const ideas = ctx.lang === 'id' ? IDEAS_ID : IDEAS_EN;
        text(g, `${L(ctx, 'Leader, move!', 'Pemimpin, bergerak!')} ${ideas[Math.floor(t / 2) % ideas.length]}`, ctx.width / 2, ctx.height * 0.22, { size: 30, color: C.warn });
      }
    },
    inspect: () => ({ leader, phase, round }),
  };
};

export default factory;
