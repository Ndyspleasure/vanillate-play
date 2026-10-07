import { formatMs, mean } from '../../core/math';
import { C } from '../../engine/draw';
import { centerText, scoreHeader, soloResult, versusResult } from '../../engine/hud';
import type { GameContext, GameFactory, GameInstance } from '../../engine/types';
import type { MotionEvent } from '../../core/motion/types';
import { COMMANDS, cmdLabel, isFalseStart, performed, type Command, type CommandId } from '../kits/commands';
import { FreezeMonitor } from '../kits/freeze';
import { tx } from '../kits/text';
import { bigCommand, bubble, hearts } from '../kits/ui';

/**
 * Reaction Battle (GAMES.md 6.5) — WAIT… then a sudden command; fastest correct reaction scores.
 * Variants: fastest, elimination (3 lives), fake commands. Also powers Reaction Party.
 */

type Phase = 'wait' | 'go' | 'freeze' | 'reveal';
type Outcome = { kind: 'ok'; ms: number } | { kind: 'wrong' } | { kind: 'late' } | { kind: 'false' } | { kind: 'held' } | { kind: 'moved' };

export interface ReactionConfig {
  party?: boolean;
}

const POOL: CommandId[] = ['jump', 'squat', 'handsUp', 'left', 'right', 'punch'];

/** Clear, deliberate actions that count as a wrong reaction (natural co-movements are ignored). */
const STRONG: Record<string, MotionEvent[]> = {
  jump: ['JUMP'],
  squat: ['SQUAT'],
  handsUp: ['HANDS_UP'],
  punch: ['PUNCH_LEFT', 'PUNCH_RIGHT'],
  left: ['MOVE_LEFT'],
  right: ['MOVE_RIGHT'],
};
const COMPATIBLE: Partial<Record<CommandId, CommandId[]>> = {
  jump: ['handsUp'],
  handsUp: ['jump'],
  squat: ['punch'],
  left: [],
  right: [],
};

function wrongEvents(id: CommandId): MotionEvent[] {
  const out: MotionEvent[] = [];
  for (const [k, evs] of Object.entries(STRONG)) {
    if (k === id || COMPATIBLE[id]?.includes(k as CommandId)) continue;
    out.push(...evs);
  }
  return out;
}

export function createReaction(ctx: GameContext, cfg: ReactionConfig = {}): GameInstance {
  const n = ctx.players.length;
  const variant = cfg.party ? 'party' : (ctx.options.variant ?? 'fastest');
  const solo = n === 1;
  const totalRounds = variant === 'elimination' ? 15 : 10;
  const points = new Array(n).fill(0);
  const lives = new Array(n).fill(3);
  const times: number[][] = Array.from({ length: n }, () => []);
  const falseStarts = new Array(n).fill(0);
  const outcomes: (Outcome | null)[] = new Array(n).fill(null);
  const freeze = new FreezeMonitor(n, 0.6, 0.4, 0.2);
  let round = 0;
  let phase: Phase = 'wait';
  let phaseT = 0;
  let waitFor = 2;
  let cmd: Command = COMMANDS.jump;
  let fake = false;
  let shownAt = 0;
  let prevCmd: CommandId | null = null;
  let finished = false;
  let roundMsg = '';

  const alive = (i: number) => variant !== 'elimination' || lives[i] > 0;

  const nextRound = () => {
    round++;
    if (round > totalRounds || (variant === 'elimination' && lives.filter((l) => l > 0).length <= (solo ? 0 : 1))) {
      finish();
      return;
    }
    phase = 'wait';
    phaseT = 0;
    waitFor = ctx.rng.range(1.3, 3.2);
    outcomes.fill(null);
    roundMsg = '';
  };

  const startCommand = () => {
    const useFreeze = round > 2 && ctx.rng.chance(0.14);
    fake = variant === 'fake' && !useFreeze && ctx.rng.chance(0.35);
    if (useFreeze) {
      phase = 'freeze';
      freeze.reset();
      ctx.audio.play('freeze');
    } else {
      const id = ctx.rng.pickNot(POOL, prevCmd);
      prevCmd = id;
      cmd = COMMANDS[id];
      phase = 'go';
      ctx.audio.play(fake ? 'warn' : 'go');
    }
    phaseT = 0;
    shownAt = performance.now();
  };

  const award = () => {
    // Score the round from outcomes.
    const ok = outcomes
      .map((o, i) => ({ o, i }))
      .filter((x) => x.o?.kind === 'ok')
      .sort((a, b) => (a.o as { ms: number }).ms - (b.o as { ms: number }).ms);
    if (solo) {
      const o = outcomes[0];
      if (o?.kind === 'ok') points[0] += Math.max(50, Math.round(1000 - o.ms));
      else if (o?.kind === 'held') points[0] += 500;
      else if (o?.kind === 'false' || o?.kind === 'wrong' || o?.kind === 'moved') points[0] = Math.max(0, points[0] - 200);
      return;
    }
    if (variant === 'elimination') {
      for (let i = 0; i < n; i++) {
        if (!alive(i)) continue;
        const o = outcomes[i];
        if (!o || o.kind === 'wrong' || o.kind === 'false' || o.kind === 'late' || o.kind === 'moved') lives[i]--;
      }
      // Slowest correct player also loses a life (only if someone was faster).
      if (ok.length > 1 && phase !== 'freeze') lives[ok[ok.length - 1].i]--;
      return;
    }
    const party = variant === 'party' || n > 2;
    ok.forEach((x, rank) => {
      points[x.i] += party ? [4, 2, 1, 1][rank] : rank === 0 ? 3 : 1;
    });
    for (let i = 0; i < n; i++) {
      const o = outcomes[i];
      if (o?.kind === 'held') points[i] += party ? 2 : 1;
      if (o?.kind === 'false' || o?.kind === 'wrong' || o?.kind === 'moved') points[i] -= fake ? 2 : 1;
    }
    const first = ok[0];
    if (first && phase === 'go') {
      roundMsg = `${ctx.players[first.i].name.toUpperCase()} ${formatMs((first.o as { ms: number }).ms)}`;
      ctx.fx.burst(ctx.input(first.i).head.x, ctx.input(first.i).head.y, ctx.players[first.i].color, 24);
    }
  };

  const finish = () => {
    if (finished) return;
    finished = true;
    const avg = times.map((list) => (list.length ? mean(list) : 9999));
    const best = times.map((list) => (list.length ? Math.min(...list) : 0));
    const stats = [
      { label: tx(ctx, 'statAvgReaction'), values: avg.map((a) => (a < 9999 ? formatMs(a) : '—')) },
      { label: tx(ctx, 'statBestReaction'), values: best.map((b) => (b ? formatMs(b) : '—')) },
      { label: tx(ctx, 'statFalseStarts'), values: falseStarts.map(String) },
    ];
    if (solo) {
      ctx.end({
        ...soloResult(ctx, avg[0] < 9999 ? Math.round(avg[0]) : 9999, {
          display: avg[0] < 9999 ? formatMs(avg[0]) : '—',
          headline: ctx.lang === 'id' ? 'WAKTU REAKSI' : 'REACTION TIME',
          subline: tx(ctx, 'points', { n: points[0] }),
          stats,
          lowerIsBetter: true,
          recordLabel: tx(ctx, 'statAvgReaction'),
        }),
      });
      return;
    }
    if (variant === 'elimination') {
      // Most lives left wins (a tie is a draw); times break nothing — it's about survival.
      ctx.end(versusResult(ctx, lives.map((l) => Math.max(0, l)), { display: (v) => `${v} ❤️`, stats }));
      return;
    }
    const fastest = avg.indexOf(Math.min(...avg));
    ctx.end(
      versusResult(ctx, points, {
        stats,
        shareLine:
          avg[fastest] < 9999
            ? `REACTION TIME\n${avg.map((a, i) => `${ctx.players[i].name}: ${a < 9999 ? formatMs(a) : '—'}`).join('\n')}\n${ctx.players[fastest].name.toUpperCase()} IS FASTER ⚡`
            : undefined,
      }),
    );
  };

  nextRound();

  return {
    view: { camera: 'dim', dim: 0.3, skeleton: true },
    update(dt) {
      if (finished) return;
      phaseT += dt;
      const now = performance.now();
      switch (phase) {
        case 'wait':
          for (let i = 0; i < n; i++) {
            if (!alive(i) || outcomes[i]) continue;
            if (phaseT > 0.4 && isFalseStart(ctx.input(i))) {
              outcomes[i] = { kind: 'false' };
              falseStarts[i]++;
              ctx.audio.play('buzzer');
              ctx.fx.text(tx(ctx, 'falseStart'), ctx.input(i).head.x, ctx.input(i).head.y - 60, C.bad, 30);
            }
          }
          if (phaseT >= waitFor) startCommand();
          break;
        case 'go': {
          for (let i = 0; i < n; i++) {
            if (!alive(i) || outcomes[i]) continue;
            const inp = ctx.input(i);
            const t = performed(cmd, inp, now, phaseT > 0.12);
            if (fake) {
              if (t !== null && phaseT > 0.1) {
                outcomes[i] = { kind: 'wrong' };
                ctx.audio.play('boing');
                ctx.fx.text(tx(ctx, 'gotcha'), inp.head.x, inp.head.y - 60, C.bad, 30);
              }
              continue;
            }
            if (t !== null) {
              const ms = Math.max(80, t - shownAt);
              outcomes[i] = { kind: 'ok', ms };
              times[i].push(ms);
              ctx.audio.play('success', { pitch: 1 + (outcomes.filter((o) => o?.kind === 'ok').length === 1 ? 0.2 : 0) });
              continue;
            }
            const wrong = wrongEvents(cmd.id).some((e) => inp.has(e));
            if (wrong && phaseT > 0.15) {
              outcomes[i] = { kind: 'wrong' };
              ctx.audio.play('fail');
            }
          }
          const pending = ctx.players.filter((p) => alive(p.index) && !outcomes[p.index]).length;
          const anyOk = outcomes.some((o) => o?.kind === 'ok');
          const limit = fake ? 1.6 : 2.6;
          if (pending === 0 || phaseT > limit || (anyOk && phaseT > 1.4 && n > 1)) {
            for (let i = 0; i < n; i++) if (alive(i) && !outcomes[i]) outcomes[i] = fake ? { kind: 'held' } : { kind: 'late' };
            award();
            phase = 'reveal';
            phaseT = 0;
          }
          break;
        }
        case 'freeze': {
          const caught = freeze.update(dt, ctx.input, (i) => alive(i) && !outcomes[i]);
          for (const i of caught) {
            outcomes[i] = { kind: 'moved' };
            ctx.audio.play('boing');
            ctx.fx.text(tx(ctx, 'moved'), ctx.input(i).head.x, ctx.input(i).head.y - 60, C.bad, 30);
          }
          if (phaseT > 2.2) {
            for (let i = 0; i < n; i++) if (alive(i) && !outcomes[i]) outcomes[i] = { kind: 'held' };
            award();
            phase = 'reveal';
            phaseT = 0;
          }
          break;
        }
        case 'reveal':
          if (phaseT > 1.6) nextRound();
          break;
      }
    },
    inspect: () => ({ phase, cmd: cmd.id, fake, round }),
    render(g) {
      const showLives = variant === 'elimination';
      scoreHeader(
        g,
        ctx,
        ctx.players.map((p) => (solo ? `${points[0]}` : showLives ? '' : String(points[p.index]))),
        { center: tx(ctx, 'roundOf', { n: Math.min(round, totalRounds), m: totalRounds }) },
      );
      if (showLives) {
        ctx.players.forEach((_p, i) => {
          const x = n === 2 ? (i === 0 ? 36 : ctx.width - 36) : 36 + i * ((ctx.width - 72) / Math.max(1, n - 1));
          hearts(g, x, 58, Math.max(0, lives[i]), 3, 24, n === 2 && i === 1 ? 'right' : 'left');
        });
      }
      if (phase === 'wait') {
        const pulse = 1 + Math.sin(phaseT * 6) * 0.04;
        centerText(g, ctx, tx(ctx, 'wait'), tx(ctx, 'stayStill'), C.bad, pulse, ctx.height * 0.32);
      } else if (phase === 'go') {
        if (fake) bigCommand(g, ctx, tx(ctx, 'cmdDont', { x: cmdLabel(ctx, cmd).replace('!', '') }), '🚫', C.bad);
        else bigCommand(g, ctx, cmdLabel(ctx, cmd), cmd.emoji, cmd.color, 1 + Math.max(0, 0.25 - phaseT));
      } else if (phase === 'freeze') {
        bigCommand(g, ctx, tx(ctx, 'cmdFreeze'), '🧊', '#8be9ff');
      } else if (phase === 'reveal' && roundMsg) {
        centerText(g, ctx, '⚡ ' + roundMsg, undefined, C.vanilla, 0.55, ctx.height * 0.3);
      }
      for (let i = 0; i < n; i++) {
        const o = outcomes[i];
        const inp = ctx.input(i);
        if (!alive(i)) {
          bubble(g, inp, tx(ctx, 'out'), C.muted);
          continue;
        }
        if (!o) continue;
        if (o.kind === 'ok') bubble(g, inp, `✓ ${formatMs(o.ms)}`, C.good);
        else if (o.kind === 'false') bubble(g, inp, tx(ctx, 'falseStart'), C.bad);
        else if (o.kind === 'wrong') bubble(g, inp, fake ? tx(ctx, 'gotcha') : tx(ctx, 'wrong'), C.bad);
        else if (o.kind === 'late') bubble(g, inp, tx(ctx, 'tooSlow'), C.warn);
        else if (o.kind === 'held') bubble(g, inp, tx(ctx, 'steady'), C.good);
        else if (o.kind === 'moved') bubble(g, inp, tx(ctx, 'moved'), C.bad);
      }
    },
  };
}

const factory: GameFactory = (ctx) => createReaction(ctx);
export default factory;
