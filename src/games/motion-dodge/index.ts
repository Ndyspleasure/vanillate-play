import { C, text } from '../../engine/draw';
import { scoreHeader, soloResult, versusResult } from '../../engine/hud';
import type { GameContext, GameFactory, GameInstance } from '../../engine/types';
import { HazardField, type Hazard } from '../kits/hazards';
import { L, tx } from '../kits/text';
import { bubble, hearts } from '../kits/ui';

/**
 * Dodge survival engine: Motion Dodge (GAMES.md 6.23) and Ninja Dodge (6.29).
 * Telegraphed hazards — duck high sweeps, jump low sweeps, step/lean away from body shots.
 * Score = survival time × multiplier (grows while you stay clean). Versus: same patterns, last one standing.
 */
export function createDodge(ctx: GameContext, ninja: boolean): GameInstance {
  const n = ctx.players.length;
  const field = new HazardField();
  const lives = new Array(n).fill(3);
  const score = new Array(n).fill(0);
  const mult = new Array(n).fill(1);
  const clean = new Array(n).fill(0);
  const maxMult = new Array(n).fill(1);
  const survived = new Array(n).fill(0);
  let time = 0;
  let nextSpawn = 1.2;
  let finished = false;

  const alive = (i: number) => lives[i] > 0;

  const spawn = () => {
    const warn = Math.max(ninja ? 0.5 : 0.65, (ninja ? 1.0 : 1.2) - time * 0.008);
    const r = ctx.rng.next();
    const kind: Hazard['kind'] = r < 0.3 ? 'high' : r < 0.55 ? 'low' : ninja && r < 0.75 ? 'wall' : 'body';
    const from = ctx.rng.pick([-1, 1] as const);
    const style: Hazard['style'] = ninja ? (kind === 'body' ? 'star' : 'laser') : kind === 'body' ? 'meteor' : 'ball';
    for (let i = 0; i < n; i++) {
      if (!alive(i)) continue;
      const inp = ctx.input(i);
      const T = inp.torsoPx;
      const y = kind === 'high' ? inp.head.y + T * 0.05 : (inp.leftFoot.y + inp.rightFoot.y) / 2 - T * 0.25;
      field.add({ kind, owner: i, t: warn, warn, x: inp.center.x, y, from, style, width: kind === 'wall' ? 26 : 50 });
    }
    ctx.audio.play(ninja ? 'laser' : 'warn', { volume: 0.5 });
    nextSpawn = Math.max(ninja ? 0.75 : 0.95, (ninja ? 1.5 : 1.9) - time * 0.012) + ctx.rng.range(0, 0.4);
  };

  const finish = () => {
    if (finished) return;
    finished = true;
    const stats = [
      { label: tx(ctx, 'statSurvived'), values: survived.map((s) => `${Math.round(s)} s`) },
      { label: tx(ctx, 'statMultiplier'), values: maxMult.map((m) => `×${m}`) },
    ];
    if (n === 1) ctx.end(soloResult(ctx, Math.round(score[0]), { stats }));
    else ctx.end(versusResult(ctx, lives.map((l, i) => (l > 0 ? 100000 : 0) + Math.round(score[i])), { display: (v) => String(v % 100000), stats }));
  };

  return {
    view: { camera: 'dim', dim: ninja ? 0.4 : 0.25, skeleton: true },
    update(dt) {
      if (finished) return;
      time += dt;
      nextSpawn -= dt;
      if (nextSpawn <= 0) spawn();
      for (let i = 0; i < n; i++) {
        if (!alive(i)) continue;
        survived[i] += dt;
        clean[i] += dt;
        if (clean[i] > 10) {
          clean[i] = 0;
          mult[i]++;
          maxMult[i] = Math.max(maxMult[i], mult[i]);
          ctx.fx.text(`×${mult[i]}`, ctx.input(i).head.x, ctx.input(i).head.y - 80, C.gold, 36);
          ctx.audio.play('powerup');
        }
        score[i] += dt * 10 * mult[i];
      }
      for (const r of field.update(dt, ctx.input)) {
        const i = r.hazard.owner;
        if (!alive(i)) continue;
        const inp = ctx.input(i);
        if (r.hit) {
          lives[i]--;
          mult[i] = 1;
          clean[i] = 0;
          ctx.audio.play(ninja ? 'splat' : 'explosion');
          ctx.fx.shake(12, 0.35);
          ctx.fx.flash(C.bad, 0.3);
          ctx.fx.text(tx(ctx, 'ouch'), inp.head.x, inp.head.y - 70, C.bad, 38);
        } else {
          score[i] += 15 * mult[i];
          ctx.fx.text(`+${15 * mult[i]}`, inp.head.x, inp.head.y - 70, C.good, 26);
        }
      }
      const living = lives.filter((l) => l > 0).length;
      if (living === 0 || (n > 1 && living <= 1)) finish();
    },
    render(g) {
      field.render(g, (o) => ctx.zone(o), ctx.height);
      scoreHeader(g, ctx, score.map((s) => Math.round(s)), { center: `${Math.floor(time)} s` });
      for (let i = 0; i < n; i++) {
        const z = ctx.zone(i);
        hearts(g, z.x + z.w / 2, 112, Math.max(0, lives[i]), 3, 24, 'center');
        if (!alive(i)) bubble(g, ctx.input(i), tx(ctx, 'out'), C.muted);
        else if (mult[i] > 1) bubble(g, ctx.input(i), `×${mult[i]}`, C.gold);
      }
      if (time < 4) text(g, L(ctx, '⬇ duck high · ⬆ jump low · step away from shots', '⬇ menunduk (atas) · ⬆ lompat (bawah) · geser dari tembakan'), ctx.width / 2, ctx.height - 36, { size: 20, color: C.vanilla });
    },
    inspect: () => ({ lives: [...lives], pending: field.pending }),
  };
}

const factory: GameFactory = (ctx) => createDodge(ctx, false);
export default factory;
