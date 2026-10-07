import { easeOutBack } from '../../core/math';
import { C, panel, text } from '../../engine/draw';
import { scoreHeader, versusResult } from '../../engine/hud';
import type { GameContext, GameFactory, GameInstance } from '../../engine/types';
import { FreezeMonitor } from '../kits/freeze';
import { tx } from '../kits/text';
import { bigCommand, bubble, hearts } from '../kits/ui';

/**
 * Freeze Battle (GAMES.md 6.6) and its variants:
 *  - Freeze Party (6.20): instant elimination for 2–4 players.
 *  - Freeze Challenge (6.36): random dance lengths + dramatic freeze-frame zoom on whoever gets caught.
 */
export interface FreezeConfig {
  lives: number;
  viral?: boolean;
  maxRounds?: number;
}

export function createFreeze(ctx: GameContext, cfg: FreezeConfig): GameInstance {
  const n = ctx.players.length;
  const lives = new Array(n).fill(cfg.lives);
  const dance = new Array(n).fill(0);
  const caughtCount = new Array(n).fill(0);
  const idle = new Array(n).fill(0);
  const monitor = new FreezeMonitor(n, 0.55, 0.45, 0.2);
  const maxRounds = cfg.maxRounds ?? 8;
  const effects = cfg.viral && ctx.options.effects !== 'off';
  let round = 0;
  let phase: 'dance' | 'freeze' | 'reveal' = 'dance';
  let t = 0;
  let len = 4;
  let caughtNow: number[] = [];
  let replay: { player: number; img: HTMLCanvasElement | null; t: number } | null = null;
  let finished = false;

  const alive = (i: number) => lives[i] > 0;
  const aliveCount = () => lives.filter((l) => l > 0).length;

  const startDance = () => {
    round++;
    if (round > maxRounds || aliveCount() <= (n > 1 ? 1 : 0)) return finish();
    phase = 'dance';
    t = 0;
    len = cfg.viral ? ctx.rng.range(1.6, 8.5) : ctx.rng.range(3.2, 6.5) - Math.min(1.5, round * 0.15);
    idle.fill(0);
    ctx.audio.music.play('party', 116 + round * 4);
  };

  const startFreeze = () => {
    phase = 'freeze';
    t = 0;
    caughtNow = [];
    monitor.reset();
    ctx.audio.music.stop(40);
    ctx.audio.play('freeze');
    ctx.fx.flash('#bdeeff', 0.35);
  };

  const finish = () => {
    if (finished) return;
    finished = true;
    ctx.audio.music.stop(300);
    const scores = lives.map((l, i) => Math.max(0, l) * 1000 + Math.round(dance[i]));
    ctx.end(
      versusResult(ctx, scores, {
        display: (v) => `${Math.floor(v / 1000)}❤️ ${v % 1000}`,
        stats: [
          { label: tx(ctx, 'statCaught'), values: caughtCount.map(String) },
          { label: tx(ctx, 'statDance'), values: dance.map((d) => String(Math.round(d))) },
        ],
      }),
    );
  };

  startDance();

  return {
    view: { camera: 'full', dim: 0.15, skeleton: true },
    update(dt) {
      if (finished) return;
      t += dt;
      if (replay) {
        replay.t += dt;
        if (replay.t > 1.8) replay = null;
      }
      if (phase === 'dance') {
        for (let i = 0; i < n; i++) {
          if (!alive(i)) continue;
          const e = ctx.input(i).state.energy;
          dance[i] += Math.min(e, 2.2) * 12 * dt;
          idle[i] = e < 0.3 ? idle[i] + dt : 0;
        }
        if (t >= len) startFreeze();
      } else if (phase === 'freeze') {
        const caught = monitor.update(dt, ctx.input, alive);
        for (const i of caught) {
          lives[i]--;
          caughtCount[i]++;
          caughtNow.push(i);
          const inp = ctx.input(i);
          ctx.audio.play(effects ? 'boing' : 'buzzer');
          ctx.fx.text(lives[i] > 0 ? tx(ctx, 'caught') : tx(ctx, 'eliminated'), inp.head.x, inp.head.y - 70, C.bad, 40);
          ctx.fx.shake(8, 0.3);
          if (effects && !replay) {
            const half = inp.torsoPx * 1.6;
            const img = ctx.snapshot({ x: inp.center.x - half, y: inp.head.y - half * 0.6, w: half * 2, h: half * 2.2 });
            replay = { player: i, img, t: 0 };
            ctx.setTimeScale(0.4, 0.6);
          }
        }
        if (t > 2.6 + Math.min(1, round * 0.1)) {
          phase = 'reveal';
          t = 0;
          for (let i = 0; i < n; i++) if (alive(i) && !caughtNow.includes(i)) ctx.fx.text(tx(ctx, 'safe'), ctx.input(i).head.x, ctx.input(i).head.y - 70, C.good, 32);
          if (caughtNow.length === 0) ctx.audio.play('success');
        }
      } else if (t > 1.3) startDance();
    },
    onPause() {
      ctx.audio.music.pause();
    },
    onResume() {
      if (phase === 'dance') ctx.audio.music.resume();
    },
    destroy() {
      ctx.audio.music.stop(100);
    },
    render(g) {
      scoreHeader(g, ctx, dance.map((d) => Math.round(d)), { center: tx(ctx, 'round', { n: round }) });
      ctx.players.forEach((_p, i) => {
        const z = ctx.zone(i);
        hearts(g, z.x + z.w / 2, 110, Math.max(0, lives[i]), cfg.lives, 22, 'center');
      });
      if (phase === 'dance') {
        const beat = Math.abs(Math.sin(t * 7));
        bigCommand(g, ctx, tx(ctx, 'danceNow'), '🎵', '#ff6ec7', 0.8 + beat * 0.08, ctx.height * 0.24);
      } else if (phase === 'freeze') {
        bigCommand(g, ctx, tx(ctx, 'cmdFreeze'), '🧊', '#8be9ff', 1 + Math.max(0, 0.3 - t), ctx.height * 0.24);
        g.fillStyle = 'rgba(160,230,255,0.10)';
        g.fillRect(0, 0, ctx.width, ctx.height);
      }
      for (let i = 0; i < n; i++) {
        const inp = ctx.input(i);
        if (!alive(i)) bubble(g, inp, tx(ctx, 'out'), C.muted);
        else if (phase === 'dance' && idle[i] > 1.2) bubble(g, inp, tx(ctx, 'keepDancing'), C.warn);
        else if (phase === 'freeze' && monitor.t > monitor.grace) {
          const still = monitor.stillness(inp);
          bubble(g, inp, caughtNow.includes(i) ? tx(ctx, 'caught') : `${Math.round(still * 100)}%`, caughtNow.includes(i) ? C.bad : still > 0.6 ? C.good : C.warn);
        }
      }
      if (replay) {
        const u = Math.min(1, replay.t / 0.35);
        const s = easeOutBack(u);
        const w = Math.min(ctx.width * 0.42, 460) * s;
        const h = w * 1.1;
        const x = ctx.width / 2 - w / 2;
        const y = ctx.height * 0.5 - h / 2 + 30;
        g.save();
        g.translate(ctx.width / 2, ctx.height / 2);
        g.rotate(-0.06);
        g.translate(-ctx.width / 2, -ctx.height / 2);
        panel(g, x - 10, y - 10, w + 20, h + 60, { fill: '#fff7e8', r: 10 });
        if (replay.img) g.drawImage(replay.img, x, y, w, h);
        else {
          g.fillStyle = ctx.players[replay.player].color;
          g.fillRect(x, y, w, h);
        }
        text(g, `📸 ${tx(ctx, 'caught')}`, ctx.width / 2, y + h + 26, { size: 30, color: '#140b2e', stroke: 0, weight: 800 });
        g.restore();
      }
    },
    inspect: () => ({ phase, round, lives: [...lives] }),
  };
}

const factory: GameFactory = (ctx) => createFreeze(ctx, { lives: 3 });
export default factory;
