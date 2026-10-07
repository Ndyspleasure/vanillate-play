import { clamp01, mean } from '../../core/math';
import { comparePoses, matchPose, poseById, poseName, UPPER_BODY_POSES, type PoseDef, type PoseVector } from '../../core/motion/pose';
import { C, ghost, text } from '../../engine/draw';
import { coopResult, scoreHeader } from '../../engine/hud';
import type { GameFactory } from '../../engine/types';
import { BASIC_COMMANDS, COMMANDS, cmdLabel, isFalseStart, performed, type Command } from '../kits/commands';
import { FreezeMonitor } from '../kits/freeze';
import { L, tx } from '../kits/text';
import { bigCommand, bubble, zoneMeter } from '../kits/ui';

/**
 * Couple Challenge (GAMES.md 6.35) — a menu of short couple rounds played back to back.
 * Each round scores 0–100% together; the result shows COUPLE SCORE and BEST SYNC.
 */
type RoundId = 'syncJump' | 'mirrorPose' | 'reactionDuo' | 'freeze' | 'sameMove' | 'follow' | 'heart';
const ROUNDS: RoundId[] = ['syncJump', 'mirrorPose', 'reactionDuo', 'freeze', 'sameMove', 'follow', 'heart'];
const TITLES: Record<RoundId, [string, string]> = {
  syncJump: ['SYNC JUMP', 'LOMPAT SINKRON'],
  mirrorPose: ['MIRROR POSE', 'POSE CERMIN'],
  reactionDuo: ['REACTION DUO', 'REAKSI BERDUA'],
  freeze: ['FREEZE TOGETHER', 'DIAM BERSAMA'],
  sameMove: ['SAME MOVE', 'GERAKAN SAMA'],
  follow: ['FOLLOW THE LEADER', 'IKUTI PEMIMPIN'],
  heart: ['MAKE A BIG HEART', 'BUAT HATI BESAR'],
};

const factory: GameFactory = (ctx) => {
  const results: number[] = [];
  let ri = -1;
  let phase: 'intro' | 'run' | 'result' = 'intro';
  let t = 0;
  let times: (number | null)[] = [null, null];
  let samples: number[] = [];
  let pose: PoseDef = UPPER_BODY_POSES[0];
  let cmd: Command = COMMANDS.jump;
  let waitFor = 2;
  let shownAt = 0;
  let falseStart = [false, false];
  let roundScore = 0;
  let hold = 0;
  const freeze = new FreezeMonitor(2, 0.55, 0.4, 0.2);
  let caught = [false, false];
  let history: { t: number; v: PoseVector }[] = [];
  let finished = false;

  const id = () => ROUNDS[ri];

  const next = () => {
    ri++;
    if (ri >= ROUNDS.length) {
      finished = true;
      const pct = mean(results) * 100;
      const best = Math.max(...results) * 100;
      ctx.end(
        coopResult(ctx, pct, {
          headline: L(ctx, 'COUPLE SCORE', 'SKOR PASANGAN'),
          stats: [
            { label: L(ctx, 'Best sync', 'Sinkron terbaik'), values: [`${Math.round(best)}%`] },
            ...ROUNDS.map((r, k) => ({ label: TITLES[r][ctx.lang === 'id' ? 1 : 0], values: [`${Math.round(results[k] * 100)}%`] })),
          ],
          shareLine: L(ctx, `COUPLE SCORE ${Math.round(pct)}% · BEST SYNC ${Math.round(best)}% 💑`, `SKOR PASANGAN ${Math.round(pct)}% · SINKRON TERBAIK ${Math.round(best)}% 💑`),
        }),
      );
      return;
    }
    phase = 'intro';
    t = 0;
    times = [null, null];
    samples = [];
    hold = 0;
    falseStart = [false, false];
    caught = [false, false];
    history = [];
    pose = id() === 'heart' ? poseById('heart') : ctx.rng.pick(UPPER_BODY_POSES);
    cmd = id() === 'syncJump' ? COMMANDS.jump : COMMANDS[ctx.rng.pick(BASIC_COMMANDS)];
    waitFor = ctx.rng.range(1.2, 2.8);
    ctx.audio.play('heart');
  };

  const done = (score: number) => {
    roundScore = clamp01(score);
    results.push(roundScore);
    phase = 'result';
    t = 0;
    const pct = Math.round(roundScore * 100);
    ctx.audio.play(pct >= 80 ? 'perfect' : pct >= 50 ? 'success' : 'fail');
    if (pct >= 80) ctx.fx.burst(ctx.width / 2, ctx.height * 0.4, ['#ff4d8d', '#ff9ec7', '#fff'], 36, { shape: 'star' });
  };

  const timingScore = () => {
    const [a, b] = times;
    if (a === null || b === null) return 0;
    return clamp01(1 - Math.max(0, Math.abs(a - b) - 60) / 700);
  };

  next();

  return {
    view: { camera: 'dim', dim: 0.2, skeleton: true },
    update(dt) {
      if (finished) return;
      t += dt;
      const now = performance.now();
      if (phase === 'intro') {
        if (t > 1.8) {
          phase = 'run';
          t = 0;
          shownAt = now;
          if (id() === 'freeze') freeze.reset();
        }
        return;
      }
      if (phase === 'result') {
        if (t > 1.6) next();
        return;
      }
      const A = ctx.input(0);
      const B = ctx.input(1);
      switch (id()) {
        case 'syncJump':
        case 'sameMove': {
          for (let i = 0; i < 2; i++) if (times[i] === null && t > 0.15) times[i] = performed(cmd, ctx.input(i), now, t > 0.3);
          if (times[0] !== null && times[1] !== null) samples.push(comparePoses(A.pose, B.pose));
          if ((times[0] !== null && times[1] !== null && samples.length > 10) || t > 4) done(timingScore() * 0.75 + (samples.length ? mean(samples) : 0) * 0.25);
          break;
        }
        case 'reactionDuo': {
          if (t < waitFor) {
            for (let i = 0; i < 2; i++) if (t > 0.4 && isFalseStart(ctx.input(i))) falseStart[i] = true;
            shownAt = now;
            break;
          }
          for (let i = 0; i < 2; i++) if (times[i] === null) times[i] = performed(cmd, ctx.input(i), now, t - waitFor > 0.15);
          if ((times[0] !== null && times[1] !== null) || t - waitFor > 2.5) {
            const ms = times.map((x) => (x === null ? 2500 : Math.max(150, x - shownAt)));
            const speed = clamp01(1 - (mean(ms) - 300) / 1400);
            const penalty = falseStart.filter(Boolean).length * 0.3;
            done(speed * 0.6 + timingScore() * 0.4 - penalty);
          }
          break;
        }
        case 'freeze': {
          for (const i of freeze.update(dt, ctx.input, (k) => !caught[k])) {
            caught[i] = true;
            ctx.audio.play('boing');
          }
          if (t > 3.2) done(caught.filter((c) => !c).length / 2);
          break;
        }
        case 'mirrorPose':
        case 'heart': {
          const sa = matchPose(pose, A.state, A.pose);
          const sb = matchPose(pose, B.state, B.pose);
          samples.push(Math.min(sa, sb));
          if (sa > 0.7 && sb > 0.7) hold += dt;
          if (hold >= 1 || t > 6) done(hold >= 1 ? Math.max(...samples.slice(-30)) * 0.7 + clamp01(1 - t / 6) * 0.3 : Math.max(0, ...samples) * 0.6);
          break;
        }
        case 'follow': {
          history.push({ t, v: { angles: { ...A.pose.angles }, legs: A.pose.legs } });
          while (history.length && t - history[0].t > 0.8) history.shift();
          let best = 0;
          for (const h of history) best = Math.max(best, comparePoses(h.v, B.pose));
          samples.push(best);
          if (t > 8) done(mean(samples));
          break;
        }
      }
    },
    render(g) {
      scoreHeader(g, ctx, [`${results.length ? Math.round(mean(results) * 100) : 0}%`, `${Math.min(ri + 1, ROUNDS.length)}/${ROUNDS.length}`], {
        labels: [L(ctx, 'COUPLE', 'PASANGAN'), L(ctx, 'ROUND', 'RONDE')],
      });
      if (finished) return;
      const title = TITLES[id()][ctx.lang === 'id' ? 1 : 0];
      if (phase === 'intro') {
        bigCommand(g, ctx, title, '💑', C.vanilla, 0.8);
        return;
      }
      if (phase === 'result') {
        bigCommand(g, ctx, tx(ctx, 'syncPct', { p: Math.round(roundScore * 100) }), roundScore >= 0.8 ? '💞' : '❤️', roundScore >= 0.8 ? C.gold : C.ink, 0.9);
        return;
      }
      switch (id()) {
        case 'syncJump':
        case 'sameMove':
          bigCommand(g, ctx, tx(ctx, 'together', { x: cmdLabel(ctx, cmd).replace('!', '') }), cmd.emoji, cmd.color);
          for (let i = 0; i < 2; i++) if (times[i] !== null) bubble(g, ctx.input(i), '✓', C.good);
          break;
        case 'reactionDuo':
          if (t < waitFor) bigCommand(g, ctx, tx(ctx, 'wait'), '⏱️', C.bad);
          else bigCommand(g, ctx, cmdLabel(ctx, cmd), cmd.emoji, cmd.color);
          for (let i = 0; i < 2; i++) if (falseStart[i]) bubble(g, ctx.input(i), tx(ctx, 'falseStart'), C.bad);
          break;
        case 'freeze':
          bigCommand(g, ctx, tx(ctx, 'cmdFreeze'), '🧊', '#8be9ff');
          for (let i = 0; i < 2; i++) bubble(g, ctx.input(i), caught[i] ? tx(ctx, 'caught') : '✓', caught[i] ? C.bad : C.good);
          break;
        case 'mirrorPose':
        case 'heart':
          ghost(g, pose, ctx.width / 2, ctx.height * 0.36, 50, C.vanilla);
          text(g, poseName(pose, ctx.lang), ctx.width / 2, ctx.height * 0.62, { size: 30, color: C.vanilla });
          zoneMeter(g, ctx, 0, hold, tx(ctx, 'holdIt'), C.good);
          break;
        case 'follow':
          bubble(g, ctx.input(0), `👑 ${tx(ctx, 'leader')}`, C.gold);
          bubble(g, ctx.input(1), `🪞 ${tx(ctx, 'follower')}`, ctx.players[1].color);
          zoneMeter(g, ctx, 1, samples.length ? samples[samples.length - 1] : 0, `${8 - Math.floor(t)}s`);
          break;
      }
    },
    inspect: () => ({ round: id(), phase, cmd: cmd.id }),
  };
};

export default factory;
