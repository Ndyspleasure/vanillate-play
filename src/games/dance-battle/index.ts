import { matchPose, poseById, poseName, UPPER_BODY_POSES, POSES, type PoseDef } from '../../core/motion/pose';
import { C, ghost, panel, text } from '../../engine/draw';
import { coopResult, scoreHeader, soloResult, versusResult } from '../../engine/hud';
import type { GameFactory, Grade } from '../../engine/types';
import { L, tx } from '../kits/text';
import { bubble } from '../kits/ui';
import { chartById, thinSteps, UPPER_BODY_SWAP } from './charts';

/**
 * Dance Battle (GAMES.md 6.8) — move cards slide to the beat line; strike the pose on the beat.
 * Accuracy + timing + combo = score. Versus, co-op (shared combo) and solo.
 * Songs: Freestyle (random moves every 2 beats) or a hand-made chart with its own tempo and rhythm.
 */
const FREESTYLE_BPM = 112;
const FREESTYLE_MOVES = 24;
const LEAD = 4; // beats before the first move

interface Move {
  beat: number;
  pose: PoseDef;
  judged: boolean;
  best: { grade: Grade; score: number }[];
}

const GRADE_PTS: Record<Grade, number> = { PERFECT: 300, GREAT: 200, GOOD: 100, MISS: 0, FAIL: 0 };

const factory: GameFactory = (ctx) => {
  // Difficulty-dependent tuning (easy, normal, hard).
  const WINDOW = ctx.tune(0.48, 0.38, 0.3);
  const n = ctx.players.length;
  const coop = ctx.mode === 'coop';
  const legs = ctx.players.every((p) => ctx.input(p.index).state.legsVisible);
  const chart = chartById(ctx.options.song ?? '');
  const BPM = chart?.bpm ?? FREESTYLE_BPM;
  const SPB = 60 / BPM;
  // Similarity needed per grade (harder levels want cleaner shapes).
  const simK = ctx.tune(-0.05, 0, 0.04);
  const newMove = (beat: number, pose: PoseDef): Move => ({
    beat: LEAD + beat,
    pose,
    judged: false,
    best: Array.from({ length: n }, () => ({ grade: 'MISS' as Grade, score: 0 })),
  });
  const moves: Move[] = [];
  if (chart) {
    // Easy: no move closer than 2 beats to the previous one.
    const steps = ctx.level === 'easy' ? thinSteps(chart.steps, 2) : chart.steps;
    for (const [beat, id] of steps)
      moves.push(newMove(beat, poseById(legs ? id : (UPPER_BODY_SWAP[id] ?? id))));
  } else {
    const pool = (legs ? POSES : UPPER_BODY_POSES).filter(
      (p) => !p.checks?.includes('kneeLeft') && !p.checks?.includes('kneeRight'),
    );
    let prev: PoseDef | null = null;
    for (let k = 0; k < FREESTYLE_MOVES; k++) {
      const pose: PoseDef = ctx.rng.pickNot(pool, prev);
      prev = pose;
      moves.push(newMove(k * 2, pose));
    }
  }
  const MOVES = moves.length;
  // Closest pair of moves (s): the card track is stretched so neighbouring cards never overlap.
  let minGap = 2 * SPB;
  for (let k = 1; k < moves.length; k++) minGap = Math.min(minGap, (moves[k].beat - moves[k - 1].beat) * SPB);
  const score = new Array(n).fill(0);
  const combo = new Array(n).fill(0);
  const maxCombo = new Array(n).fill(0);
  const counts: Record<Grade, number>[] = Array.from({ length: n }, () => ({
    PERFECT: 0,
    GREAT: 0,
    GOOD: 0,
    MISS: 0,
    FAIL: 0,
  }));
  let teamCombo = 0;
  let teamMax = 0;
  let time = -0.2;
  let started = false;
  let finished = false;
  const lastGrade: (Grade | null)[] = new Array(n).fill(null);
  let lastGradeT = -9;

  const judge = (m: Move) => {
    m.judged = true;
    let allHit = true;
    for (let i = 0; i < n; i++) {
      const g = m.best[i].grade;
      counts[i][g]++;
      lastGrade[i] = g;
      if (g === 'MISS') {
        combo[i] = 0;
        allHit = false;
      } else {
        combo[i]++;
        maxCombo[i] = Math.max(maxCombo[i], combo[i]);
        score[i] += Math.round(GRADE_PTS[g] * (1 + Math.min(1, combo[i] * 0.05)));
      }
    }
    if (coop) {
      teamCombo = allHit ? teamCombo + 1 : 0;
      teamMax = Math.max(teamMax, teamCombo);
    }
    lastGradeT = time;
    const top = m.best.some((b) => b.grade === 'PERFECT');
    ctx.audio.play(top ? 'perfect' : allHit ? 'success' : 'fail', { volume: 0.7 });
  };

  const finish = () => {
    if (finished) return;
    finished = true;
    ctx.audio.music.stop(400);
    const stats = [
      { label: 'PERFECT', values: counts.map((c) => String(c.PERFECT)) },
      { label: 'GREAT', values: counts.map((c) => String(c.GREAT)) },
      { label: 'GOOD', values: counts.map((c) => String(c.GOOD)) },
      { label: 'MISS', values: counts.map((c) => String(c.MISS)) },
      { label: tx(ctx, 'statBestCombo'), values: maxCombo.map(String) },
    ];
    const pct = (i: number) => (score[i] / (MOVES * 300 * 1.6)) * 100;
    if (coop)
      ctx.end(
        coopResult(ctx, ((pct(0) + pct(1)) / 2) * 1.25, {
          stats: [...stats, { label: tx(ctx, 'statComboTeam'), values: [String(teamMax)] }],
          big: String(score[0] + score[1]),
        }),
      );
    else if (n === 1) ctx.end(soloResult(ctx, score[0], { stats }));
    else ctx.end(versusResult(ctx, score, { stats }));
  };

  return {
    view: { camera: 'dim', dim: 0.3, skeleton: true },
    onPause() {
      ctx.audio.music.pause();
    },
    onResume() {
      ctx.audio.music.resume();
    },
    destroy() {
      ctx.audio.music.stop(100);
    },
    update(dt) {
      if (finished) return;
      if (!started) {
        started = true;
        ctx.audio.music.play(chart?.style ?? 'dance', BPM);
      }
      time += dt;
      for (const m of moves) {
        if (m.judged) continue;
        const mt = m.beat * SPB;
        const off = time - mt;
        if (off < -WINDOW) break;
        if (off <= WINDOW) {
          for (let i = 0; i < n; i++) {
            const inp = ctx.input(i);
            const sim = matchPose(m.pose, inp.state, inp.pose);
            const a = Math.abs(off);
            const grade: Grade =
              sim >= 0.8 + simK && a <= 0.14
                ? 'PERFECT'
                : sim >= 0.72 + simK && a <= 0.24
                  ? 'GREAT'
                  : sim >= 0.62 + simK
                    ? 'GOOD'
                    : 'MISS';
            const val = GRADE_PTS[grade] + sim;
            if (val > m.best[i].score) m.best[i] = { grade, score: val };
          }
        } else judge(m);
      }
      if (moves[moves.length - 1].judged && time > moves[moves.length - 1].beat * SPB + 1) finish();
    },
    render(g) {
      const lineX = ctx.width * 0.5;
      const y = ctx.height * 0.3;
      const T = Math.min(ctx.height * 0.055, 46, ctx.width * 0.07);
      // Wide enough that the closest two cards (and their names) never overlap.
      const pxPerSec = Math.max(ctx.width * 0.22, (T * 3.2) / minGap);
      const label = Math.max(11, Math.min(15, T * 0.4));
      panel(g, 0, y - T * 2.6, ctx.width, T * 5.2, { fill: 'rgba(20,10,40,0.55)', r: 0 });
      // Beat line pulses on the beat
      const beatPhase = (time / SPB) % 1;
      g.strokeStyle = C.vanilla;
      g.lineWidth = 6 + (1 - beatPhase) * 6;
      g.beginPath();
      g.moveTo(lineX, y - T * 2.5);
      g.lineTo(lineX, y + T * 2.5);
      g.stroke();
      for (const m of moves) {
        const x = lineX + (m.beat * SPB - time) * pxPerSec;
        if (x < -100 || x > ctx.width + 100) continue;
        const alpha = m.judged ? 0.25 : 1;
        ghost(g, m.pose, x, y - T * 0.6, T, m.judged ? '#9e9e9e' : '#ffe9b8', alpha * 0.95);
        text(g, poseName(m.pose, ctx.lang), x, y + T * 2.1, {
          size: label,
          alpha,
          stroke: 3,
          maxWidth: Math.max(40, minGap * pxPerSec - 8),
        });
      }
      scoreHeader(g, ctx, score, {
        center: coop
          ? `${tx(ctx, 'statComboTeam')} ${teamCombo}`
          : chart
            ? `♪ ${chart.name[ctx.lang]}`
            : L(ctx, 'Hit the pose on the beat!', 'Pose tepat di ketukan!'),
      });
      if (time - lastGradeT < 0.8) {
        for (let i = 0; i < n; i++) {
          const gr = lastGrade[i];
          if (!gr) continue;
          const col = gr === 'PERFECT' ? C.gold : gr === 'GREAT' ? C.good : gr === 'GOOD' ? '#3dd6ff' : C.bad;
          bubble(g, ctx.input(i), combo[i] > 2 ? `${gr} ×${combo[i]}` : gr, col);
        }
      }
    },
    inspect: () => ({
      time,
      next: moves.find((m) => !m.judged)?.pose.id,
      moves: moves.length,
      bpm: BPM,
      beatTime: (moves.find((m) => !m.judged)?.beat ?? 0) * SPB,
    }),
  };
};

export default factory;
