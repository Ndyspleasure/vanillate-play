import { C, emoji, text } from '../../engine/draw';
import { coopResult, scoreHeader, soloResult, versusResult } from '../../engine/hud';
import type { GameFactory, PlayerInput } from '../../engine/types';
import { L, tx } from '../kits/text';
import { bubble, zoneMeter } from '../kits/ui';

/**
 * Motion Fitness (GAMES.md 6.28) — rep counting with hysteresis state machines so a rep is only
 * counted once per full down→up (or open→close) cycle. Squats, jumping jacks, high knees, lunges,
 * arm raises; circuit or single exercise; solo, versus or co-op team goal.
 */
type Ex = 'squat' | 'jacks' | 'knees' | 'lunge' | 'arms';
const ALL: Ex[] = ['squat', 'jacks', 'knees', 'lunge', 'arms'];
const NAMES: Record<Ex, [string, string, string]> = {
  squat: ['SQUATS', 'SQUAT', '⬇️'],
  jacks: ['JUMPING JACKS', 'JUMPING JACK', '🙌'],
  knees: ['HIGH KNEES', 'HIGH KNEES', '🏃'],
  lunge: ['LUNGES', 'LUNGE', '🦵'],
  arms: ['ARM RAISES', 'ANGKAT LENGAN', '💪'],
};

/** One rep counter per player. Returns 'rep' when a full repetition completes, 'shallow' for half reps. */
export class RepCounter {
  phase: 'top' | 'bottom' = 'top';
  depth = 0;
  lastKnee: 'l' | 'r' | null = null;

  reset(): void {
    this.phase = 'top';
    this.depth = 0;
    this.lastKnee = null;
  }

  update(ex: Ex, inp: PlayerInput): 'rep' | 'shallow' | null {
    const s = inp.state;
    switch (ex) {
      case 'squat':
      case 'lunge': {
        const d = s.drop;
        if (this.phase === 'top') {
          this.depth = Math.max(this.depth, d);
          if (d > (ex === 'lunge' ? 0.24 : 0.28)) this.phase = 'bottom';
          else if (d < 0.08 && this.depth > 0.16) {
            this.depth = 0;
            return 'shallow';
          } else if (d < 0.08) this.depth = 0;
          return null;
        }
        this.depth = Math.max(this.depth, d);
        if (d < 0.1) {
          this.phase = 'top';
          this.depth = 0;
          return 'rep';
        }
        return null;
      }
      case 'jacks': {
        const feetApart = !s.legsVisible || Math.abs(inp.leftFoot.x - inp.rightFoot.x) > inp.torsoPx * 0.75;
        const open = s.handsUp && feetApart;
        const closed = s.leftHandHeight < 0 && s.rightHandHeight < 0;
        if (this.phase === 'top' && open) this.phase = 'bottom';
        else if (this.phase === 'bottom' && closed) {
          this.phase = 'top';
          return 'rep';
        }
        return null;
      }
      case 'knees': {
        const k = inp.has('KNEE_LEFT') ? 'l' : inp.has('KNEE_RIGHT') ? 'r' : null;
        if (k && k !== this.lastKnee) {
          this.lastKnee = k;
          return 'rep';
        }
        return null;
      }
      case 'arms': {
        if (this.phase === 'top' && s.handsUp) this.phase = 'bottom';
        else if (this.phase === 'bottom' && s.leftHandHeight < -0.3 && s.rightHandHeight < -0.3) {
          this.phase = 'top';
          return 'rep';
        }
        return null;
      }
    }
  }
}

const factory: GameFactory = (ctx) => {
  const n = ctx.players.length;
  const coop = ctx.mode === 'coop';
  const choice = ctx.options.exercise ?? 'circuit';
  const plan: Ex[] = choice === 'circuit' ? ALL : [choice as Ex];
  const WORK = choice === 'circuit' ? 30 : 45;
  const REST = 5;
  const counters = ctx.players.map(() => new RepCounter());
  const reps = ctx.players.map(() => ALL.reduce((o, e) => ({ ...o, [e]: 0 }), {} as Record<Ex, number>));
  const total = new Array(n).fill(0);
  const shallow = new Array(n).fill(0);
  const streak = new Array(n).fill(0);
  const bestStreak = new Array(n).fill(0);
  const lastRep = new Array(n).fill(-9);
  let tip: { player: number; t: number; msg: string } | null = null;
  let idx = 0;
  let t = 0;
  let phase: 'work' | 'rest' = 'work';
  let finished = false;
  const goal = plan.length * 22;

  const finish = () => {
    if (finished) return;
    finished = true;
    const stats = plan.map((e) => ({ label: NAMES[e][ctx.lang === 'id' ? 1 : 0], values: reps.map((r) => String(r[e])) }));
    stats.push({ label: tx(ctx, 'statStreak'), values: bestStreak.map(String) });
    stats.push({ label: tx(ctx, 'statAccuracy'), values: total.map((tt, i) => `${tt + shallow[i] ? Math.round((tt / (tt + shallow[i])) * 100) : 0}%`) });
    const sum = total.reduce((a, b) => a + b, 0);
    if (coop) ctx.end(coopResult(ctx, Math.min(100, (sum / goal) * 100), { stats, big: tx(ctx, 'reps', { n: sum }), headline: L(ctx, 'TEAM GOAL', 'TARGET TIM') }));
    else if (n === 1) ctx.end(soloResult(ctx, total[0], { display: tx(ctx, 'reps', { n: total[0] }), stats, recordLabel: tx(ctx, 'statReps') }));
    else ctx.end(versusResult(ctx, total, { stats }));
  };

  return {
    view: { camera: 'full', dim: 0.15, skeleton: true },
    update(dt) {
      if (finished) return;
      t += dt;
      if (phase === 'rest') {
        if (t >= REST) {
          phase = 'work';
          t = 0;
          counters.forEach((c) => c.reset());
          ctx.audio.play('go');
        }
        return;
      }
      const ex = plan[idx];
      for (let i = 0; i < n; i++) {
        const r = counters[i].update(ex, ctx.input(i));
        if (r === 'rep') {
          reps[i][ex]++;
          total[i]++;
          streak[i] = t - lastRep[i] < 4 ? streak[i] + 1 : 1;
          bestStreak[i] = Math.max(bestStreak[i], streak[i]);
          lastRep[i] = t;
          ctx.audio.play('coin', { pitch: 1 + Math.min(0.5, streak[i] * 0.03) });
          ctx.fx.text(String(reps[i][ex]), ctx.input(i).head.x, ctx.input(i).head.y - 90, ctx.players[i].color, 44);
        } else if (r === 'shallow') {
          shallow[i]++;
          tip = { player: i, t: 0, msg: L(ctx, 'Go lower!', 'Lebih rendah!') };
        }
      }
      if (tip && (tip.t += dt) > 1.6) tip = null;
      if (t >= WORK) {
        idx++;
        if (idx >= plan.length) return finish();
        phase = 'rest';
        t = 0;
        ctx.audio.play('whistle');
        ctx.banner(tx(ctx, 'rest'), `${L(ctx, 'Next', 'Berikutnya')}: ${NAMES[plan[idx]][ctx.lang === 'id' ? 1 : 0]}`, REST - 0.5);
      }
    },
    render(g) {
      const ex = plan[Math.min(idx, plan.length - 1)];
      scoreHeader(g, ctx, total.map((x) => tx(ctx, 'reps', { n: x })), { timer: phase === 'work' ? WORK - t : REST - t, center: `${NAMES[ex][ctx.lang === 'id' ? 1 : 0]} · ${idx + 1}/${plan.length}` });
      if (phase === 'work') {
        emoji(g, NAMES[ex][2], ctx.width / 2, ctx.height * 0.24, 70);
        for (let i = 0; i < n; i++) zoneMeter(g, ctx, i, (reps[i][ex] % 10) / 10, `${reps[i][ex]} · ${tx(ctx, 'statStreak')} ${streak[i]}`);
        if (coop) text(g, `${L(ctx, 'Team goal', 'Target tim')}: ${total.reduce((a, b) => a + b, 0)} / ${goal}`, ctx.width / 2, ctx.height * 0.34, { size: 28, color: C.vanilla });
      }
      if (tip) bubble(g, ctx.input(tip.player), tip.msg, C.warn);
    },
    inspect: () => ({ ex: plan[idx], total: [...total], phase }),
  };
};

export default factory;
