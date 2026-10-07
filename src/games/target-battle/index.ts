import { clamp, formatDuration, mean } from '../../core/math';
import { C } from '../../engine/draw';
import { scoreHeader, soloResult, versusResult } from '../../engine/hud';
import type { GameContext, GameFactory, GameInstance } from '../../engine/types';
import { reachArea, TargetField, type Target } from '../kits/targets';
import { L, tx } from '../kits/text';
import { bubble } from '../kits/ui';

/**
 * Motion Target Battle (GAMES.md 6.3) + Motion Target Practice (6.24).
 * Battle variants: 30 s, 60 s, sudden death, moving targets, fake targets.
 * Practice modes: timed, accuracy (shrinking), speed (20 targets), endless (3 misses).
 */
type Variant = '30s' | '60s' | 'sudden' | 'moving' | 'fake' | 'timed' | 'accuracy' | 'speed' | 'endless';

export function createTargets(ctx: GameContext, variant: Variant): GameInstance {
  const n = ctx.players.length;
  const field = new TargetField();
  const score = new Array(n).fill(0);
  const hits = new Array(n).fill(0);
  const misses = new Array(n).fill(0);
  const bombs = new Array(n).fill(0);
  const streak = new Array(n).fill(0);
  const best = new Array(n).fill(0);
  const reactions: number[][] = Array.from({ length: n }, () => []);
  const out = new Array(n).fill(false);
  const duration = variant === '60s' ? 60 : variant === 'sudden' ? 90 : variant === 'timed' ? 30 : variant === 'endless' || variant === 'speed' || variant === 'accuracy' ? 999 : 30;
  let time = 0;
  let spawned = new Array(n).fill(0);
  let finished = false;

  const lifeFor = () => {
    if (variant === 'sudden') return Math.max(1.3, 2.4 - time * 0.02);
    if (variant === 'endless') return Math.max(1.2, 3 - time * 0.03);
    if (variant === 'accuracy') return 2.6;
    return 3;
  };
  const radiusFor = () => (variant === 'accuracy' ? Math.max(18, 48 - spawned[0] * 1.2) : 42);

  const spawn = (i: number) => {
    const inp = ctx.input(i);
    const area = reachArea(inp, ctx.zone(i), ctx.height);
    const fake = variant === 'fake' && ctx.rng.chance(0.3);
    const moving = variant === 'moving';
    const sp = moving ? ctx.rng.range(90, 170) : 0;
    const a = ctx.rng.range(0, Math.PI * 2);
    field.spawn(i, area, ctx.rng, {
      born: time,
      life: fake ? 2 : lifeFor(),
      kind: fake ? 'fake' : 'normal',
      r: radiusFor(),
      vx: Math.cos(a) * sp,
      vy: Math.sin(a) * sp,
      color: ctx.players[i].color,
      avoid: [inp.head],
    });
    if (!fake) spawned[i]++;
  };

  const active = (i: number) => field.targets.filter((t) => !t.dead && t.owner === i && t.kind !== 'fake').length;

  const finish = () => {
    if (finished) return;
    finished = true;
    const acc = (i: number) => (hits[i] + misses[i] ? Math.round((hits[i] / (hits[i] + misses[i])) * 100) : 0);
    const stats = [
      { label: tx(ctx, 'statHits'), values: hits.map(String) },
      { label: tx(ctx, 'statAccuracy'), values: ctx.players.map((p) => `${acc(p.index)}%`) },
      { label: tx(ctx, 'statBestCombo'), values: best.map(String) },
      { label: L(ctx, 'Avg reaction', 'Rata-rata reaksi'), values: reactions.map((r) => (r.length ? `${Math.round(mean(r) * 1000)}ms` : '—')) },
    ];
    if (variant === 'fake') stats.push({ label: tx(ctx, 'statBombs'), values: bombs.map(String) });
    if (n === 1) {
      if (variant === 'speed') ctx.end(soloResult(ctx, Math.round(time * 10) / 10, { display: formatDuration(time), headline: L(ctx, '20 TARGETS', '20 TARGET'), stats, lowerIsBetter: true, recordLabel: tx(ctx, 'statTime') }));
      else if (variant === 'accuracy') ctx.end(soloResult(ctx, acc(0), { display: `${acc(0)}%`, headline: tx(ctx, 'statAccuracy').toUpperCase(), stats }));
      else ctx.end(soloResult(ctx, score[0], { stats }));
      return;
    }
    if (variant === 'sudden') {
      const alive = out.map((o) => !o);
      const scores = score.map((s, i) => (alive[i] ? s + 100000 : s));
      ctx.end(versusResult(ctx, scores, { display: (v) => String(v % 100000), stats }));
    } else ctx.end(versusResult(ctx, score, { stats }));
  };

  return {
    view: { camera: 'dim', dim: 0.2, skeleton: true, hands: true },
    update(dt) {
      if (finished) return;
      time += dt;
      const bounds = (t: Target) => reachArea(ctx.input(t.owner), ctx.zone(t.owner), ctx.height);
      for (const t of field.update(dt, time, bounds)) {
        if (t.kind === 'fake') continue;
        misses[t.owner]++;
        streak[t.owner] = 0;
        if (variant === 'sudden' || variant === 'endless') {
          if (variant === 'endless' && misses[t.owner] < 3) continue;
          out[t.owner] = true;
          ctx.audio.play('buzzer');
          ctx.fx.text(tx(ctx, 'out'), ctx.input(t.owner).head.x, ctx.input(t.owner).head.y - 80, C.bad, 40);
        }
      }
      for (let i = 0; i < n; i++) {
        if (out[i]) continue;
        const inp = ctx.input(i);
        for (const h of field.hits(i, inp, time)) {
          const t = h.target;
          if (t.kind === 'fake') {
            score[i] = Math.max(0, score[i] - 50);
            bombs[i]++;
            streak[i] = 0;
            ctx.audio.play('explosion');
            ctx.fx.burst(t.x, t.y, ['#ff5a5a', '#ffb020', '#333'], 30, { speed: 400 });
            ctx.fx.text('-50', t.x, t.y, C.bad, 34);
            ctx.fx.shake(10, 0.25);
            continue;
          }
          hits[i]++;
          streak[i]++;
          best[i] = Math.max(best[i], streak[i]);
          reactions[i].push(h.age);
          const speedBonus = Math.round(50 * clamp(1 - h.age / t.life, 0, 1));
          const pts = 50 + speedBonus + Math.min(50, (streak[i] - 1) * 10);
          score[i] += pts;
          ctx.audio.play('pop', { pitch: 1 + Math.min(0.6, streak[i] * 0.05) });
          ctx.fx.burst(t.x, t.y, [ctx.players[i].color, '#fff', C.gold], 18, { gravity: 200 });
          ctx.fx.text(streak[i] > 2 ? `+${pts} ×${streak[i]}` : `+${pts}`, t.x, t.y - 20, streak[i] > 2 ? C.gold : '#fff', 30);
        }
        const want = variant === 'fake' ? 2 : 1 + (time > 20 && variant !== 'accuracy' ? 1 : 0);
        if (active(i) < want && !(variant === 'speed' && spawned[i] >= 20) && !(variant === 'accuracy' && spawned[i] >= 25)) spawn(i);
        if (variant === 'fake' && ctx.rng.chance(dt * 0.3)) spawn(i);
      }
      const doneSpeed = variant === 'speed' && hits[0] + misses[0] >= 20;
      const doneAcc = variant === 'accuracy' && hits[0] + misses[0] >= 25;
      const alive = out.filter((o) => !o).length;
      if (time >= duration || doneSpeed || doneAcc || (out.some(Boolean) && alive <= (n > 1 ? 1 : 0))) finish();
    },
    render(g) {
      field.render(g, time);
      const timer = duration < 900 ? Math.max(0, duration - time) : undefined;
      const center =
        variant === 'speed' ? `${hits[0] + misses[0]}/20 · ${formatDuration(time)}` : variant === 'accuracy' ? `${hits[0] + misses[0]}/25` : variant === 'endless' ? `${L(ctx, 'Misses', 'Meleset')} ${misses[0]}/3` : undefined;
      scoreHeader(g, ctx, score, { timer, center });
      for (let i = 0; i < n; i++) if (out[i]) bubble(g, ctx.input(i), tx(ctx, 'out'), C.muted);
    },
    inspect: () => ({ score: [...score], targets: field.targets.filter((t) => !t.dead).map((t) => ({ owner: t.owner, x: t.x, y: t.y, kind: t.kind })) }),
  };
}

const factory: GameFactory = (ctx) => createTargets(ctx, (ctx.options.variant as Variant) ?? '30s');
export default factory;
