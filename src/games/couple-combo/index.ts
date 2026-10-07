import { C, emoji, panel, text } from '../../engine/draw';
import { coopResult, scoreHeader } from '../../engine/hud';
import type { GameFactory } from '../../engine/types';
import { COMMANDS, cmdLabel, performed, type CommandId } from '../kits/commands';
import { L, tx } from '../kits/text';
import { bubble, timerRing } from '../kits/ui';

/**
 * Couple Combo (GAMES.md 6.15) — a shared sequence where each step belongs to one of you (or BOTH).
 * Hit your step in time to grow the team combo; a miss halves it.
 */
const STEPS = 30;
const POOL: CommandId[] = ['jump', 'squat', 'handsUp', 'left', 'right', 'punch', 'leftHand', 'rightHand'];

interface Step {
  who: 0 | 1 | 2; // 2 = both
  cmd: CommandId;
  done: [boolean, boolean];
}

const factory: GameFactory = (ctx) => {
  const steps: Step[] = [];
  let prev: CommandId | null = null;
  for (let k = 0; k < STEPS; k++) {
    const cmd: CommandId = ctx.rng.pickNot(POOL, prev);
    prev = cmd;
    const who = (k > 4 && ctx.rng.chance(0.22) ? 2 : k % 2) as 0 | 1 | 2;
    steps.push({ who, cmd, done: [false, false] });
  }
  let idx = 0;
  let t = 0;
  let combo = 0;
  let best = 0;
  let score = 0;
  let ok = 0;
  let finished = false;
  const windowFor = () => Math.max(1.5, 2.8 - idx * 0.045);

  const finishStep = (success: boolean) => {
    if (success) {
      ok++;
      combo++;
      best = Math.max(best, combo);
      score += 10 * combo;
      ctx.audio.play('combo', { pitch: 1 + Math.min(0.8, combo * 0.04) });
      ctx.fx.text(tx(ctx, 'combo', { n: combo }), ctx.width / 2, ctx.height * 0.55, C.gold, 34);
    } else {
      combo = Math.floor(combo / 2);
      ctx.audio.play('fail');
      ctx.fx.text(tx(ctx, 'miss'), ctx.width / 2, ctx.height * 0.55, C.bad, 34);
    }
    idx++;
    t = 0;
    if (idx >= STEPS) {
      finished = true;
      ctx.end(
        coopResult(ctx, (ok / STEPS) * 100, {
          stats: [
            { label: tx(ctx, 'statComboTeam'), values: [String(best)] },
            { label: L(ctx, 'Steps hit', 'Langkah berhasil'), values: [`${ok}/${STEPS}`] },
            { label: L(ctx, 'Team score', 'Skor tim'), values: [String(score)] },
          ],
          shareLine: L(ctx, `TEAM COMBO ×${best} 🔗`, `COMBO TIM ×${best} 🔗`),
        }),
      );
    }
  };

  return {
    view: { camera: 'dim', dim: 0.25, skeleton: true },
    update(dt) {
      if (finished) return;
      t += dt;
      const s = steps[idx];
      const cmd = COMMANDS[s.cmd];
      const now = performance.now();
      for (const p of [0, 1] as const) {
        if (s.who !== 2 && s.who !== p) continue;
        if (!s.done[p] && t > 0.15 && performed(cmd, ctx.input(p), now, t > 0.3) !== null) {
          s.done[p] = true;
          ctx.audio.play('pop', { pitch: p ? 1.2 : 1 });
        }
      }
      const complete = s.who === 2 ? s.done[0] && s.done[1] : s.done[s.who];
      if (complete) finishStep(true);
      else if (t > windowFor()) finishStep(false);
    },
    render(g) {
      scoreHeader(g, ctx, [score, `×${combo}`], { labels: [L(ctx, 'TEAM SCORE', 'SKOR TIM'), 'COMBO'], center: `${Math.min(idx + 1, STEPS)}/${STEPS}` });
      if (finished) return;
      // Upcoming steps strip
      const cw = Math.min(150, ctx.width / 6);
      for (let k = 0; k < 4 && idx + k < STEPS; k++) {
        const s = steps[idx + k];
        const x = ctx.width / 2 - cw * 1.6 + k * cw * 1.1;
        const y = ctx.height * 0.22;
        const color = s.who === 2 ? C.gold : ctx.players[s.who].color;
        const big = k === 0;
        const w = big ? cw * 1.25 : cw * 0.9;
        panel(g, x - w / 2, y - w / 2, w, w * 1.15, { fill: big ? 'rgba(20,10,40,0.9)' : 'rgba(20,10,40,0.6)', stroke: color, lineWidth: big ? 5 : 2, r: 18 });
        emoji(g, COMMANDS[s.cmd].emoji, x, y - w * 0.08, w * 0.45);
        text(g, cmdLabel(ctx, COMMANDS[s.cmd]), x, y + w * 0.33, { size: big ? 16 : 12, maxWidth: w - 10, stroke: 0 });
        text(g, s.who === 2 ? tx(ctx, 'both') : ctx.players[s.who].name, x, y + w * 0.52, { size: big ? 15 : 11, color, stroke: 0, maxWidth: w - 10 });
        if (big) timerRing(g, x + w / 2, y - w / 2, 16, 1 - t / windowFor(), color);
      }
      const s = steps[idx];
      for (const p of [0, 1] as const) {
        if (s.who === p || s.who === 2) bubble(g, ctx.input(p), s.done[p] ? '✓' : cmdLabel(ctx, COMMANDS[s.cmd]), s.done[p] ? C.good : ctx.players[p].color);
      }
    },
    inspect: () => ({ idx, who: steps[idx]?.who, cmd: steps[idx]?.cmd, combo }),
  };
};

export default factory;
