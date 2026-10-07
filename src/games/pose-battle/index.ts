import { matchPose, type PoseDef } from '../../core/motion/pose';
import { C, ghost, text } from '../../engine/draw';
import { scoreHeader, versusResult } from '../../engine/hud';
import type { GameFactory } from '../../engine/types';
import { L, tx } from '../kits/text';
import { bubble, zoneMeter } from '../kits/ui';

/**
 * Pose Battle (GAMES.md 6.12) — random pose recipes (arms + body + legs). First to match it
 * accurately and hold steady takes the point. First to 5.
 */
const WIN = 5;
const MATCH = 0.75;
const HOLD = 0.5;

const ARMS: { en: string; id: string; a: PoseDef['angles'] }[] = [
  { en: 'HANDS UP', id: 'TANGAN NAIK', a: { lUpper: 100, lFore: 95, rUpper: 80, rFore: 85 } },
  { en: 'RIGHT HAND UP', id: 'TANGAN KANAN NAIK', a: { lUpper: -100, lFore: -95, rUpper: 80, rFore: 85 } },
  { en: 'LEFT HAND UP', id: 'TANGAN KIRI NAIK', a: { lUpper: 100, lFore: 95, rUpper: -80, rFore: -85 } },
  { en: 'ARMS OUT', id: 'LENGAN KE SAMPING', a: { lUpper: 180, lFore: 180, rUpper: 0, rFore: 0 } },
  { en: 'HANDS ON HIPS', id: 'TANGAN DI PINGGANG', a: { lUpper: -135, lFore: -45, rUpper: -45, rFore: -135 } },
  { en: 'FLEX', id: 'OTOT', a: { lUpper: 180, lFore: 90, rUpper: 0, rFore: 90 } },
  { en: 'DISCO', id: 'DISKO', a: { lUpper: -135, lFore: -135, rUpper: 45, rFore: 45 } },
];
const BODY = [
  { en: '', id: '', a: { torso: 90 } },
  { en: 'BODY LEFT', id: 'BADAN KE KIRI', a: { torso: 110 } },
  { en: 'BODY RIGHT', id: 'BADAN KE KANAN', a: { torso: 70 } },
];
const LEGS: { en: string; id: string; checks: PoseDef['checks'] }[] = [
  { en: '', id: '', checks: [] },
  { en: 'LEFT KNEE UP', id: 'LUTUT KIRI NAIK', checks: ['kneeLeft'] },
  { en: 'RIGHT KNEE UP', id: 'LUTUT KANAN NAIK', checks: ['kneeRight'] },
  { en: 'SQUAT', id: 'JONGKOK', checks: ['squat'] },
];

const factory: GameFactory = (ctx) => {
  const n = ctx.players.length;
  const pts = new Array(n).fill(0);
  const sims: number[][] = Array.from({ length: n }, () => []);
  let hold = new Array(n).fill(0);
  let def: PoseDef = { id: 'p', name: '', emoji: '', angles: {} };
  let parts: string[] = [];
  let t = 0;
  let round = 0;
  let phase: 'pose' | 'won' = 'won';
  let roundWinner = -1;
  let finished = false;

  const next = () => {
    if (pts.some((p) => p >= WIN) || round >= 15) return finish();
    round++;
    const legsOk = ctx.players.every((p) => ctx.input(p.index).state.legsVisible);
    const arm = ctx.rng.pick(ARMS);
    const body = round > 2 ? ctx.rng.pick(BODY) : BODY[0];
    const leg = legsOk && round > 3 && ctx.rng.chance(0.5) ? ctx.rng.pick(LEGS) : LEGS[0];
    def = { id: `pb${round}`, name: '', emoji: '', angles: { ...arm.a, ...body.a }, checks: leg.checks };
    parts = [arm, body, leg].map((x) => (ctx.lang === 'id' ? x.id : x.en)).filter(Boolean);
    hold = new Array(n).fill(0);
    t = 0;
    phase = 'pose';
    roundWinner = -1;
    ctx.audio.play('pop');
  };

  const finish = () => {
    if (finished) return;
    finished = true;
    ctx.end(
      versusResult(ctx, pts, {
        stats: [{ label: tx(ctx, 'statAccuracy'), values: sims.map((s) => (s.length ? `${Math.round((s.reduce((a, b) => a + b, 0) / s.length) * 100)}%` : '—')) }],
      }),
    );
  };

  next();

  return {
    view: { camera: 'dim', dim: 0.25, skeleton: true },
    update(dt) {
      if (finished) return;
      t += dt;
      if (phase === 'won') {
        if (t > 1.4) next();
        return;
      }
      for (let i = 0; i < n; i++) {
        const inp = ctx.input(i);
        if (inp.health === 'lost') continue;
        const s = matchPose(def, inp.state, inp.pose);
        if (s >= MATCH && inp.state.energy < 0.9) hold[i] += dt;
        else hold[i] = Math.max(0, hold[i] - dt * 1.5);
        if (hold[i] >= HOLD) {
          pts[i]++;
          sims[i].push(s);
          roundWinner = i;
          phase = 'won';
          t = 0;
          ctx.audio.play('perfect');
          ctx.fx.burst(inp.head.x, inp.head.y, [ctx.players[i].color, C.gold], 30, { shape: 'star' });
          return;
        }
      }
      if (t > 8) {
        phase = 'won';
        t = 0;
        ctx.audio.play('fail');
      }
    },
    render(g) {
      scoreHeader(g, ctx, pts, { center: tx(ctx, 'firstTo', { n: WIN }) });
      const size = Math.min(ctx.height * 0.09, 70);
      if (phase === 'pose') {
        ghost(g, def, ctx.width / 2, ctx.height * 0.4, size, C.vanilla, 0.9);
        parts.forEach((p, k) => text(g, p, ctx.width / 2, ctx.height * 0.62 + k * 34, { size: 26, color: C.vanilla }));
        for (let i = 0; i < n; i++) zoneMeter(g, ctx, i, hold[i] / HOLD, tx(ctx, 'holdIt'));
      } else if (roundWinner >= 0) bubble(g, ctx.input(roundWinner), '+1', C.gold);
      else text(g, L(ctx, 'Nobody got it!', 'Tidak ada yang berhasil!'), ctx.width / 2, ctx.height * 0.4, { size: 36 });
    },
    inspect: () => ({ def, phase, pts: [...pts] }),
  };
};

export default factory;
