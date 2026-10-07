import { clamp, lerp } from '../../core/math';
import { C, text } from '../../engine/draw';
import { scoreHeader, versusResult } from '../../engine/hud';
import type { GameFactory } from '../../engine/types';
import { aimFromInput, aimPoint, drawAim, drawBall, drawKeeper, drawPitch, goalLayout, keeperFromInput, kicked, saved, type KeeperState, type Shot } from '../kits/goal';
import { L, tx } from '../kits/text';

/** Penalty Duel (GAMES.md 6.10) — kicker vs keeper, swap every shot; sudden death on a tie. */
const factory: GameFactory = (ctx) => {
  const attempts = Number(ctx.options.attempts ?? 5);
  const goals = [0, 0];
  const saves = [0, 0];
  const taken = [0, 0];
  let kicker = 0;
  let phase: 'aim' | 'flight' | 'result' = 'aim';
  let t = 0;
  let aimX = 0;
  let aimY = 0;
  let shot: Shot | null = null;
  let keeper: KeeperState = { x: 0, reach: 0.5, dive: 0 };
  let diveUntil = 0;
  let time = 0;
  let lastText = '';
  let finished = false;

  const keeperIdx = () => 1 - kicker;

  const finishCheck = (): boolean => {
    const rem0 = attempts - taken[0];
    const rem1 = attempts - taken[1];
    if (rem0 >= 0 && rem1 >= 0 && (goals[0] + rem0 < goals[1] || goals[1] + rem1 < goals[0])) return true;
    if (taken[0] === taken[1] && taken[0] >= attempts) return goals[0] !== goals[1] || taken[0] >= attempts + 5;
    return false;
  };

  const next = () => {
    if (finishCheck()) {
      finished = true;
      ctx.end(
        versusResult(ctx, goals, {
          stats: [
            { label: tx(ctx, 'statGoals'), values: goals.map(String) },
            { label: tx(ctx, 'statSaves'), values: saves.map(String) },
          ],
        }),
      );
      return;
    }
    kicker = taken[0] <= taken[1] ? 0 : 1;
    phase = 'aim';
    t = 0;
    shot = null;
    keeper = { x: 0, reach: 0.5, dive: 0 };
    ctx.banner(tx(ctx, 'yourTurn', { name: ctx.players[kicker].name.toUpperCase() }), `${tx(ctx, 'kicker')} vs ${tx(ctx, 'keeper')}`, 1.2);
  };

  next();

  return {
    view: { camera: 'pip', skeleton: false },
    update(dt) {
      if (finished) return;
      time += dt;
      t += dt;
      const Lg = goalLayout(ctx);
      const kin = ctx.input(keeperIdx());
      if (kin.any('DODGE_LEFT', 'DODGE_RIGHT', 'STEP_LEFT', 'STEP_RIGHT', 'LEAN_LEFT', 'LEAN_RIGHT')) diveUntil = time + 0.6;
      keeper = keeperFromInput(kin, keeper, dt, diveUntil, time);
      if (phase === 'aim') {
        const kinp = ctx.input(kicker);
        aimX = lerp(aimX, aimFromInput(kinp), 1 - Math.exp(-dt / 0.1));
        aimY = Math.sin(time * 2.4) * 0.9;
        if ((t > 1.3 && kicked(kinp)) || t > 6) {
          const err = ctx.rng.range(-0.08, 0.08);
          shot = { from: { ...Lg.spot }, to: aimPoint(Lg, clamp(aimX + err, -1.1, 1.1), aimY), t: 0, dur: 0.7, done: false };
          phase = 'flight';
          t = 0;
          ctx.audio.play('kick');
        }
      } else if (phase === 'flight' && shot) {
        shot.t += dt;
        if (shot.t >= shot.dur) {
          taken[kicker]++;
          const out = Math.abs(aimX) > 1.02;
          if (out) {
            lastText = tx(ctx, 'missed');
            ctx.audio.play('fail');
          } else if (saved(Lg, keeper, shot.to)) {
            saves[keeperIdx()]++;
            lastText = tx(ctx, 'saved');
            ctx.audio.play('block');
            ctx.fx.burst(shot.to.x, shot.to.y, ctx.players[keeperIdx()].color, 24);
          } else {
            goals[kicker]++;
            lastText = tx(ctx, 'goal');
            ctx.audio.play('cheer');
            ctx.fx.confetti(ctx.width, 60);
            ctx.fx.shake(6, 0.3);
          }
          phase = 'result';
          t = 0;
        }
      } else if (phase === 'result' && t > 1.6) next();
    },
    renderBackground(g) {
      drawPitch(g, ctx, goalLayout(ctx));
    },
    render(g) {
      const Lg = goalLayout(ctx);
      drawKeeper(g, Lg, keeper, ctx.players[keeperIdx()].color, `${ctx.players[keeperIdx()].name} · ${tx(ctx, 'keeper')}`);
      if (phase === 'aim') drawAim(g, aimPoint(Lg, aimX, aimY), ctx.players[kicker].color);
      drawBall(g, shot, Lg);
      text(g, `${ctx.players[kicker].name} · ${tx(ctx, 'kicker')}`, Lg.spot.x, Lg.spot.y + 34, { size: 20, color: ctx.players[kicker].color });
      if (phase === 'aim' && t > 1.3) text(g, L(ctx, 'Lean to aim · KICK (or punch) to shoot!', 'Condong untuk membidik · TENDANG (atau pukul)!'), ctx.width / 2, ctx.height - 26, { size: 20, color: C.vanilla });
      if (phase === 'result') text(g, lastText, ctx.width / 2, ctx.height * 0.55, { size: 80, color: lastText === tx(ctx, 'goal') ? C.gold : C.ink, weight: 800 });
      scoreHeader(g, ctx, goals.map((gl, i) => `${gl} (${taken[i]}/${attempts})`));
    },
    inspect: () => ({ phase, kicker, goals: [...goals], taken: [...taken] }),
  };
};

export default factory;
