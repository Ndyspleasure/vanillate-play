import type { Rect } from '../../core/math';
import { formatDuration } from '../../core/math';
import { MutableInput } from '../../engine/input';
import { emptyState } from '../../core/motion/MotionRecognizer';
import { bar, C, circle, text } from '../../engine/draw';
import { soloResult, versusResult } from '../../engine/hud';
import type { GameFactory, PlayerInput } from '../../engine/types';
import { buildTrack, movingLane, renderLane, Runner, type Obstacle } from '../kits/lanes';
import { tx } from '../kits/text';

/**
 * Motion Race (GAMES.md 6.2) — everyone races the same seeded track side by side.
 * Lean/step = lane, jump = hurdles, squat = slide, running in place = speed. Solo races a CPU.
 */
const LENGTH = 650;
const LIMIT = 150;

/** Simple AI that reads the track ahead and reacts with human-like reliability. */
function aiControl(r: Runner, track: Obstacle[], time: number, rngNext: () => number, out: MutableInput): void {
  out.clearEvents();
  out.state.energy = 0.9;
  for (const o of track) {
    const ahead = o.z - r.z;
    if (ahead < 2 || ahead > 7) continue;
    if (rngNext() > 0.12) {
      if (o.kind === 'hurdle' && !r.airborne) out.push('JUMP');
      if (o.kind === 'bar' && !r.sliding) out.push('SQUAT');
      if (o.kind === 'cone' && (o.moving ? movingLane(o, time) : o.lane) === Math.round(r.x)) {
        const free = [0, 1, 2].find((l) => !track.some((c) => c.kind === 'cone' && Math.abs(c.z - o.z) < 0.5 && (c.moving ? movingLane(c, time) : c.lane) === l));
        if (free !== undefined) out.push(free < r.lane ? 'MOVE_LEFT' : 'MOVE_RIGHT');
      }
    }
    break;
  }
}

const factory: GameFactory = (ctx) => {
  const humans = ctx.players.length;
  const solo = humans === 1;
  const count = solo ? 2 : humans;
  const track = buildTrack(ctx.rng, LENGTH, 1);
  const runners = Array.from({ length: count }, () => new Runner());
  const aiInput = new MutableInput(9, emptyState());
  const order: number[] = [];
  let time = 0;
  let finished = false;
  const nameOf = (i: number) => (solo && i === 1 ? tx(ctx, 'cpu') : ctx.players[i].name);
  const colorOf = (i: number) => (solo && i === 1 ? '#e0e0ff' : ctx.players[i].color);

  const finish = () => {
    if (finished) return;
    finished = true;
    const times = runners.map((r) => (r.finished ? r.finishTime : LIMIT + (LENGTH - r.z) / 5));
    const stats = [
      { label: tx(ctx, 'statLapTime'), values: runners.map((r) => (r.finished ? formatDuration(r.finishTime) : 'DNF')) },
      { label: tx(ctx, 'statCoins'), values: runners.map((r) => String(r.coins)) },
      { label: ctx.lang === 'id' ? 'Tabrakan' : 'Crashes', values: runners.map((r) => String(r.hits)) },
    ];
    if (solo) {
      const won = times[0] < times[1];
      ctx.end(
        soloResult(ctx, Math.round(times[0] * 10) / 10, {
          display: runners[0].finished ? formatDuration(times[0]) : 'DNF',
          headline: won ? tx(ctx, 'youWin') : tx(ctx, 'cpuWins'),
          stats,
          lowerIsBetter: true,
          recordLabel: tx(ctx, 'statLapTime'),
        }),
      );
    } else ctx.end(versusResult(ctx, times, { lowerIsBetter: true, display: (v) => (v >= LIMIT ? 'DNF' : formatDuration(v)), stats }));
  };

  return {
    view: { camera: 'pip', skeleton: false },
    update(dt) {
      if (finished) return;
      time += dt;
      for (let i = 0; i < count; i++) {
        const r = runners[i];
        if (r.finished) continue;
        let inp: PlayerInput;
        if (solo && i === 1) {
          aiControl(r, track, time, () => ctx.rng.next(), aiInput);
          inp = aiInput;
        } else inp = ctx.input(i);
        r.control(inp);
        for (const e of r.update(dt, track, time)) {
          if (solo && i === 1) continue;
          if (e === 'hit') ctx.audio.play('thud');
          else if (e === 'coin') ctx.audio.play('coin', { volume: 0.5 });
          else if (e === 'boost') ctx.audio.play('powerup');
          else ctx.audio.play('jump', { volume: 0.6 });
        }
        if (r.z >= LENGTH) {
          r.finished = true;
          r.finishTime = time;
          order.push(i);
          ctx.audio.play(order.length === 1 ? 'cheer' : 'success');
          ctx.fx.text(order.length === 1 ? `🏆 ${nameOf(i)}` : `#${order.length} ${nameOf(i)}`, ctx.width / 2, ctx.height * 0.4, colorOf(i), 46);
        }
      }
      const humansDone = runners.slice(0, humans).every((r) => r.finished);
      if (humansDone || time > LIMIT || (order.length > 0 && time - runners[order[0]].finishTime > 12)) finish();
    },
    renderBackground(g) {
      g.fillStyle = '#120a2c';
      g.fillRect(0, 0, ctx.width, ctx.height);
    },
    render(g) {
      const pad = 12;
      const top = 70;
      const pw = (ctx.width - pad * (count + 1)) / count;
      for (let i = 0; i < count; i++) {
        const r: Rect = { x: pad + i * (pw + pad), y: top, w: pw, h: ctx.height - top - pad };
        const rival = count === 2 ? runners[1 - i] : null;
        renderLane(g, r, runners[i], track, colorOf(i), time, {
          finish: LENGTH,
          label: `${nameOf(i)} · ${Math.round(runners[i].speed * 3.6)} km/h`,
          ghost: rival,
        });
        if (runners[i].finished) text(g, formatDuration(runners[i].finishTime), r.x + r.w / 2, r.y + r.h * 0.2, { size: 40, color: C.gold });
      }
      // Progress track
      const bw = ctx.width - 160;
      bar(g, 80, 26, bw, 14, 1, 'rgba(255,255,255,0.12)');
      for (let i = 0; i < count; i++) circle(g, 80 + bw * Math.min(1, runners[i].z / LENGTH), 33, 11, colorOf(i), '#140b2e', 3);
      text(g, '🏁', 80 + bw + 26, 33, { size: 22, stroke: 0 });
      text(g, `${Math.round(time)}s`, 40, 33, { size: 18, stroke: 0 });
    },
    inspect: () => ({ z: runners.map((r) => r.z), hits: runners.map((r) => r.hits) }),
  };
};

export default factory;
