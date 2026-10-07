import { clamp01, mean } from '../../core/math';
import { comparePoses } from '../../core/motion/pose';
import { C } from '../../engine/draw';
import { coopResult, gradeFor, scoreHeader } from '../../engine/hud';
import type { GameFactory } from '../../engine/types';
import { COMMANDS, cmdLabel, performed, type CommandId } from '../kits/commands';
import { tx } from '../kits/text';
import { bigCommand, bubble } from '../kits/ui';

/**
 * Sync Challenge (GAMES.md 6.13) — do the same move at the same time.
 * Sync = timing (60%) + pose similarity (30%) + holding it together (10%).
 */
const PROMPTS = 10;
const WINDOW = 4;
const POOL: CommandId[] = ['jump', 'squat', 'handsUp', 'leanLeft', 'leanRight', 'left', 'right', 'leftHand', 'rightHand'];
const INSTANT: ReadonlySet<CommandId> = new Set(['jump']);

const factory: GameFactory = (ctx) => {
  const results: number[] = [];
  const timings: number[] = [];
  let idx = -1;
  let cmdId: CommandId = 'jump';
  let t = 0;
  let phase: 'show' | 'act' | 'reveal' = 'show';
  let times: (number | null)[] = [null, null];
  let shownAt = 0;
  let sims: number[] = [];
  let heldTogether = 0;
  let bothAt = -1;
  let last = 0;
  let finished = false;
  let prev: CommandId | null = null;

  const next = () => {
    idx++;
    if (idx >= PROMPTS) return finish();
    cmdId = ctx.rng.pickNot(POOL, prev);
    prev = cmdId;
    phase = 'show';
    t = 0;
    times = [null, null];
    sims = [];
    heldTogether = 0;
    bothAt = -1;
  };

  const score = () => {
    const [a, b] = times;
    let s = 0;
    if (a !== null && b !== null) {
      const dt = Math.abs(a - b);
      timings.push(dt);
      const timing = clamp01(1 - Math.max(0, dt - 60) / 700);
      const pose = sims.length ? mean(sims) : 0.7;
      const dur = INSTANT.has(cmdId) ? 1 : clamp01(heldTogether / 0.8);
      s = timing * 0.6 + pose * 0.3 + dur * 0.1;
    }
    last = s;
    results.push(s);
    const pct = Math.round(s * 100);
    const grade = gradeFor(pct);
    ctx.audio.play(pct >= 85 ? 'heart' : pct >= 60 ? 'success' : 'fail');
    const mid = { x: ctx.width / 2, y: ctx.height * 0.5 };
    if (pct >= 85) ctx.fx.burst(mid.x, mid.y, ['#ff4d8d', '#ff9ec7', '#fff'], 30, { shape: 'star' });
    ctx.fx.text(`${grade} · ${tx(ctx, 'syncPct', { p: pct })}`, mid.x, mid.y, pct >= 85 ? C.gold : C.ink, 40, 1.3);
    phase = 'reveal';
    t = 0;
  };

  const finish = () => {
    if (finished) return;
    finished = true;
    const pct = mean(results) * 100;
    ctx.end(
      coopResult(ctx, pct, {
        stats: [
          { label: tx(ctx, 'bestSync'), values: [`${Math.round(Math.max(...results) * 100)}%`] },
          { label: ctx.lang === 'id' ? 'Selisih waktu rata-rata' : 'Average timing gap', values: [timings.length ? `${Math.round(mean(timings))}ms` : '—'] },
        ],
      }),
    );
  };

  next();

  return {
    view: { camera: 'dim', dim: 0.25, skeleton: true },
    update(dt) {
      if (finished) return;
      t += dt;
      const now = performance.now();
      if (phase === 'show') {
        if (t > 0.9) {
          phase = 'act';
          t = 0;
          shownAt = now;
          ctx.audio.play('go');
        }
        return;
      }
      if (phase === 'reveal') {
        if (t > 1.4) next();
        return;
      }
      const cmd = COMMANDS[cmdId];
      for (let i = 0; i < 2; i++) {
        if (times[i] !== null) continue;
        const at = performed(cmd, ctx.input(i), now, t > 0.15);
        if (at !== null) {
          times[i] = Math.max(at, shownAt);
          ctx.audio.play('pop', { pitch: i ? 1.2 : 1 });
        }
      }
      if (times[0] !== null && times[1] !== null) {
        if (bothAt < 0) bothAt = t;
        sims.push(comparePoses(ctx.input(0).pose, ctx.input(1).pose));
        const both = cmd.state ? cmd.state(ctx.input(0)) && cmd.state(ctx.input(1)) : true;
        if (both) heldTogether += dt;
        const settle = INSTANT.has(cmdId) ? 0.35 : 0.9;
        if (t - bothAt > settle) score();
      } else if (t > WINDOW) score();
    },
    render(g) {
      scoreHeader(g, ctx, [`${results.length ? Math.round(mean(results) * 100) : 0}%`, `${idx + 1}/${PROMPTS}`], {
        labels: [ctx.lang === 'id' ? 'SINKRON' : 'SYNC', ctx.lang === 'id' ? 'TANTANGAN' : 'CHALLENGE'],
      });
      const cmd = COMMANDS[cmdId];
      const label = tx(ctx, 'together', { x: cmdLabel(ctx, cmd).replace('!', '') });
      if (phase === 'show') bigCommand(g, ctx, label, cmd.emoji, C.vanilla, 0.7 + t * 0.3);
      else if (phase === 'act') bigCommand(g, ctx, label, cmd.emoji, cmd.color, 1);
      else bigCommand(g, ctx, tx(ctx, 'syncPct', { p: Math.round(last * 100) }), last >= 0.85 ? '💞' : '❤️', last >= 0.85 ? C.gold : C.ink, 0.9);
      for (let i = 0; i < 2; i++) if (times[i] !== null && phase === 'act') bubble(g, ctx.input(i), '✓', C.good);
    },
    inspect: () => ({ phase, cmd: cmdId, idx }),
  };
};

export default factory;
