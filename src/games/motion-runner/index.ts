import { C, emoji, text } from '../../engine/draw';
import { soloResult } from '../../engine/hud';
import type { GameFactory } from '../../engine/types';
import { buildTrack, renderLane, Runner, type Obstacle } from '../kits/lanes';
import { tx } from '../kits/text';
import { hearts } from '../kits/ui';

/** Motion Runner (GAMES.md 6.22) — endless lane runner. Speed rises, reaction windows shrink. */
const factory: GameFactory = (ctx) => {
  const runner = new Runner();
  runner.baseSpeed = 8;
  runner.maxSpeed = 22;
  let track: Obstacle[] = buildTrack(ctx.rng, 400, 1);
  let built = 400;
  let time = 0;
  let finished = false;
  const LIVES = 3;

  return {
    view: { camera: 'pip', skeleton: false },
    update(dt) {
      if (finished) return;
      time += dt;
      runner.baseSpeed = Math.min(18, 8 + time * 0.12);
      if (runner.z > built - 120) {
        const density = Math.min(1.8, 1 + time / 90);
        const more = buildTrack(ctx.rng, 400, density, 0).map((o) => ({ ...o, z: o.z + built }));
        track = track.filter((o) => o.z > runner.z - 5).concat(more);
        built += 400;
      }
      runner.control(ctx.input(0));
      for (const e of runner.update(dt, track, time)) {
        if (e === 'hit') {
          ctx.audio.play('thud');
          ctx.fx.shake(10, 0.3);
          ctx.fx.flash('#ff5a5a', 0.3);
        } else if (e === 'coin') ctx.audio.play('coin', { volume: 0.5 });
        else if (e === 'boost') ctx.audio.play('powerup');
        else ctx.audio.play('jump', { volume: 0.5 });
      }
      if (runner.hits >= LIVES) {
        finished = true;
        const score = Math.round(runner.z + runner.coins * 10);
        ctx.end(
          soloResult(ctx, score, {
            stats: [
              { label: tx(ctx, 'statDistance'), values: [`${Math.round(runner.z)} m`] },
              { label: tx(ctx, 'statCoins'), values: [String(runner.coins)] },
              { label: tx(ctx, 'statTime'), values: [`${Math.round(time)} s`] },
            ],
          }),
        );
      }
    },
    renderBackground(g) {
      g.fillStyle = '#120a2c';
      g.fillRect(0, 0, ctx.width, ctx.height);
    },
    render(g) {
      const w = Math.min(ctx.width - 24, ctx.height * 1.5);
      renderLane(g, { x: (ctx.width - w) / 2, y: 12, w, h: ctx.height - 24 }, runner, track, ctx.players[0].color, time, { curve: Math.sin(runner.z / 70) });
      const score = Math.round(runner.z + runner.coins * 10);
      text(g, String(score), ctx.width / 2, 50, { size: 44, color: C.vanilla });
      emoji(g, '🪙', ctx.width / 2 - 70, 92, 26);
      text(g, String(runner.coins), ctx.width / 2 - 50, 92, { size: 22, align: 'left' });
      hearts(g, ctx.width / 2 + 20, 92, LIVES - runner.hits, LIVES, 24);
    },
    inspect: () => ({ z: runner.z, hits: runner.hits }),
  };
};

export default factory;
