import type { Rect } from '../../core/math';
import { soloResult, versusResult } from '../../engine/hud';
import type { GameContext, GameFactory, GameInstance } from '../../engine/types';
import { buildPipes, Flyer, renderFlight, type Pipe } from '../kits/flap';
import { L, tx } from '../kits/text';

/**
 * Body Flap (GAMES.md 6.26) and Body Flap Challenge (6.37).
 * Flap your arms (or jump) to fly; Glide mode follows your body height.
 * Challenge: race distance (60 s, crashes cost time), sudden death, or 30 s high score.
 */
type Mode = 'endless' | 'race' | 'sudden' | 'score';

export function createFlap(ctx: GameContext, mode: Mode): GameInstance {
  const n = ctx.players.length;
  const glide = ctx.options.control === 'glide';
  // Same pipe layout for everyone (fair challenge), each with its own pass-state.
  const layout = buildPipes(ctx.rng, 220);
  const tracks: Pipe[][] = ctx.players.map(() => layout.map((p) => ({ ...p })));
  const flyers = ctx.players.map(() => new Flyer(0.3, glide));
  const crashes = new Array(n).fill(0);
  const stun = new Array(n).fill(0);
  const out = new Array(n).fill(false);
  const duration = mode === 'race' ? 60 : mode === 'score' ? 30 : 9999;
  let time = 0;
  let finished = false;

  const finish = () => {
    if (finished) return;
    finished = true;
    const stats = [
      { label: tx(ctx, 'statPipes'), values: flyers.map((f) => String(f.pipes)) },
      { label: tx(ctx, 'statDistance'), values: flyers.map((f) => `${Math.round(f.dist * 10)} m`) },
      { label: L(ctx, 'Crashes', 'Jatuh'), values: crashes.map(String) },
    ];
    if (n === 1) ctx.end(soloResult(ctx, flyers[0].pipes, { stats }));
    else {
      const scores = mode === 'race' ? flyers.map((f) => Math.round(f.dist * 10)) : mode === 'sudden' ? flyers.map((f, i) => (out[i] ? 0 : 1000) + f.pipes) : flyers.map((f) => f.pipes);
      ctx.end(versusResult(ctx, scores, { display: (v) => String(mode === 'sudden' ? v % 1000 : v), stats }));
    }
  };

  return {
    view: { camera: 'pip', skeleton: false },
    update(dt) {
      if (finished) return;
      time += dt;
      for (let i = 0; i < n; i++) {
        if (out[i]) continue;
        const f = flyers[i];
        if (stun[i] > 0) {
          stun[i] -= dt;
          if (stun[i] <= 0) f.respawn();
          continue;
        }
        if (f.control(ctx.input(i), dt)) ctx.audio.play('jump', { volume: 0.4, pitch: 1.3 });
        f.speed = 0.3 + Math.min(0.15, time * 0.002);
        const ev = f.update(dt, tracks[i]);
        if (ev === 'pass') ctx.audio.play('coin', { volume: 0.6 });
        if (ev === 'crash') {
          crashes[i]++;
          ctx.audio.play('thud');
          ctx.fx.shake(6, 0.2);
          if (mode === 'endless' || mode === 'sudden') out[i] = true;
          else stun[i] = mode === 'race' ? 1.5 : 0.6;
        }
      }
      const living = out.filter((o) => !o).length;
      if (time >= duration || living === 0 || (mode === 'sudden' && n > 1 && living <= 1)) finish();
    },
    renderBackground(g) {
      g.fillStyle = '#120a2c';
      g.fillRect(0, 0, ctx.width, ctx.height);
    },
    render(g) {
      const pad = 12;
      const w = (ctx.width - pad * (n + 1)) / n;
      for (let i = 0; i < n; i++) {
        const r: Rect = { x: pad + i * (w + pad), y: pad, w, h: ctx.height - pad * 2 };
        renderFlight(g, r, flyers[i], tracks[i], ctx.players[i].color, `${ctx.players[i].name}${out[i] ? ` · ${tx(ctx, 'out')}` : ''}`);
      }
      if (duration < 900) {
        const left = Math.max(0, Math.ceil(duration - time));
        g.font = '800 30px system-ui';
        g.fillStyle = '#fff';
        g.textAlign = 'center';
        g.fillText(`${left}s`, ctx.width / 2, ctx.height - 30);
      }
    },
    inspect: () => ({ y: flyers.map((f) => f.y), pipes: flyers.map((f) => f.pipes) }),
  };
}

const factory: GameFactory = (ctx) => createFlap(ctx, 'endless');
export default factory;
