import { mean } from '../../core/math';
import { comparePoses, matchPose, poseName, POSES, UPPER_BODY_POSES, type PoseDef } from '../../core/motion/pose';
import { C, ghost } from '../../engine/draw';
import { coopResult, scoreHeader, versusResult } from '../../engine/hud';
import type { GameFactory } from '../../engine/types';
import { tx } from '../kits/text';
import { bubble, zoneMeter } from '../kits/ui';

/**
 * Mirror Battle (GAMES.md 6.4) — a target pose appears; copy it fast and accurately.
 * Versus: accuracy + speed points. Couple mode: both must nail it — scored as team sync.
 */
const POSE_COUNT = 8;
const POSE_TIME = 5.5;
const MATCH = 0.72;
const HOLD = 0.4;

const factory: GameFactory = (ctx) => {
  const coop = ctx.mode === 'coop';
  const n = ctx.players.length;
  const score = new Array(n).fill(0);
  const nailed = new Array(n).fill(0);
  const accs: number[][] = Array.from({ length: n }, () => []);
  const teamSync: number[] = [];
  let idx = -1;
  let pose: PoseDef = POSES[0];
  let t = 0;
  let phase: 'pose' | 'between' = 'between';
  let hold = new Array(n).fill(0);
  let holdAcc: number[][] = [];
  let locked: (number | null)[] = [];
  let best = new Array(n).fill(0);
  let mutual: number[] = [];
  let finished = false;
  let prev: string | null = null;

  const next = () => {
    idx++;
    if (idx >= POSE_COUNT) return finish();
    const legs = ctx.players.every((p) => ctx.input(p.index).state.legsVisible);
    const pool = legs ? POSES : UPPER_BODY_POSES;
    pose = ctx.rng.pickNot(pool, pool.find((p) => p.id === prev));
    prev = pose.id;
    phase = 'pose';
    t = 0;
    hold = new Array(n).fill(0);
    holdAcc = Array.from({ length: n }, () => []);
    locked = new Array(n).fill(null);
    best = new Array(n).fill(0);
    mutual = [];
    ctx.audio.play('pop');
  };

  const closePose = () => {
    for (let i = 0; i < n; i++) {
      if (locked[i] === null) {
        score[i] += Math.round(best[i] * 40);
        accs[i].push(best[i]);
      }
    }
    if (coop) {
      const a = locked[0] !== null ? mean(holdAcc[0]) : best[0] * 0.6;
      const b = locked[1] !== null ? mean(holdAcc[1]) : best[1] * 0.6;
      teamSync.push(Math.min(a, b) * 0.6 + (mutual.length ? mean(mutual) : 0) * 0.4);
    }
    phase = 'between';
    t = 0;
  };

  const finish = () => {
    if (finished) return;
    finished = true;
    const stats = [
      { label: tx(ctx, 'statPoses'), values: nailed.map((v) => `${v}/${POSE_COUNT}`) },
      { label: tx(ctx, 'statAccuracy'), values: accs.map((a) => `${Math.round(mean(a) * 100)}%`) },
    ];
    if (coop) ctx.end(coopResult(ctx, mean(teamSync) * 100, { stats }));
    else ctx.end(versusResult(ctx, score, { stats }));
  };

  next();

  return {
    view: { camera: 'dim', dim: 0.25, skeleton: true },
    update(dt) {
      if (finished) return;
      t += dt;
      if (phase === 'between') {
        if (t > 1.1) next();
        return;
      }
      for (let i = 0; i < n; i++) {
        const inp = ctx.input(i);
        if (locked[i] !== null || inp.health === 'lost') continue;
        const sim = matchPose(pose, inp.state, inp.pose);
        best[i] = Math.max(best[i], sim);
        if (sim >= MATCH) {
          hold[i] += dt;
          holdAcc[i].push(sim);
          if (hold[i] >= HOLD) {
            const acc = mean(holdAcc[i]);
            const pts = Math.round(acc * 100 + 60 * Math.max(0, 1 - t / POSE_TIME));
            locked[i] = pts;
            score[i] += pts;
            nailed[i]++;
            accs[i].push(acc);
            ctx.audio.play(acc > 0.9 ? 'perfect' : 'success');
            ctx.fx.burst(inp.head.x, inp.head.y, ctx.players[i].color, 22);
            ctx.fx.text(acc > 0.9 ? tx(ctx, 'perfect') : tx(ctx, 'great'), inp.head.x, inp.head.y - 80, ctx.players[i].color, 34);
          }
        } else {
          hold[i] = Math.max(0, hold[i] - dt * 2);
          if (hold[i] === 0) holdAcc[i] = [];
        }
      }
      if (coop && n === 2) mutual.push(comparePoses(ctx.input(0).pose, ctx.input(1).pose));
      const allLocked = locked.every((l) => l !== null);
      if (t >= POSE_TIME || (allLocked && t > 0.6)) closePose();
    },
    render(g) {
      const size = Math.min(ctx.height * 0.11, ctx.width * 0.07);
      const cx = ctx.width / 2;
      const cy = ctx.height * 0.36;
      if (phase === 'pose') {
        const remain = Math.max(0, 1 - t / POSE_TIME);
        g.fillStyle = 'rgba(20,10,40,0.6)';
        g.beginPath();
        g.arc(cx, cy + size * 0.4, size * 2.7, 0, Math.PI * 2);
        g.fill();
        g.strokeStyle = remain < 0.3 ? C.bad : C.vanilla;
        g.lineWidth = 8;
        g.beginPath();
        g.arc(cx, cy + size * 0.4, size * 2.7, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * remain);
        g.stroke();
        ghost(g, pose, cx, cy, size, '#ffe9b8', 0.95);
      }
      scoreHeader(g, ctx, coop ? [`${Math.round(mean(teamSync.length ? teamSync : [0]) * 100)}%`, ''] : score, {
        center: phase === 'pose' ? `${poseName(pose, ctx.lang)} · ${tx(ctx, 'poseOf', { n: idx + 1, m: POSE_COUNT })}` : tx(ctx, 'matchPose'),
      });
      for (let i = 0; i < n; i++) {
        const inp = ctx.input(i);
        if (locked[i] !== null) bubble(g, inp, `✓ +${locked[i]}`, C.good);
        else if (phase === 'pose') {
          const sim = matchPose(pose, inp.state, inp.pose);
          zoneMeter(g, ctx, i, sim, `${Math.round(sim * 100)}%`, sim >= MATCH ? C.good : ctx.players[i].color);
        }
      }
    },
    inspect: () => ({ phase, pose: pose.id, idx }),
  };
};

export default factory;
