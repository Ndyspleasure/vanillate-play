import { matchPose, poseName, UPPER_BODY_POSES, type PoseDef } from '../../core/motion/pose';
import { C, ghost } from '../../engine/draw';
import { scoreHeader, versusResult } from '../../engine/hud';
import type { GameFactory } from '../../engine/types';
import { BASIC_COMMANDS, COMMANDS, cmdLabel, performed, type Command } from '../kits/commands';
import { FreezeMonitor } from '../kits/freeze';
import { HazardField } from '../kits/hazards';
import { L, tx } from '../kits/text';
import { bigCommand, bubble, hearts } from '../kits/ui';

/**
 * Last Man Standing (GAMES.md 6.18) — a gauntlet of mini challenges for 2–4 players:
 * freeze, reaction, duck the laser, jump the laser, strike a pose. Each failure costs a heart.
 */
type Kind = 'freeze' | 'reaction' | 'duck' | 'jump' | 'pose';
const KINDS: Kind[] = ['reaction', 'freeze', 'duck', 'jump', 'pose'];

const factory: GameFactory = (ctx) => {
  const n = ctx.players.length;
  const lives = new Array(n).fill(3);
  const survived = new Array(n).fill(0);
  const freeze = new FreezeMonitor(n, 0.6, 0.4, 0.2);
  const hazards = new HazardField();
  let kind: Kind = 'reaction';
  let t = 0;
  let round = 0;
  let phase: 'intro' | 'run' | 'reveal' = 'intro';
  let failed: boolean[] = [];
  let done: boolean[] = [];
  let cmd: Command = COMMANDS.jump;
  let pose: PoseDef = UPPER_BODY_POSES[0];
  let finished = false;
  const alive = (i: number) => lives[i] > 0;

  const next = () => {
    const living = lives.filter((l) => l > 0).length;
    if (living <= 1 || round >= 20) {
      finished = true;
      ctx.end(
        versusResult(ctx, lives.map((l, i) => Math.max(0, l) * 100 + survived[i]), {
          display: (v) => `${Math.floor(v / 100)} ❤️`,
          stats: [{ label: L(ctx, 'Challenges survived', 'Tantangan dilalui'), values: survived.map(String) }],
          headline: living === 1 ? `👑 ${ctx.players[lives.findIndex((l) => l > 0)].name.toUpperCase()}` : undefined,
        }),
      );
      return;
    }
    round++;
    kind = round <= KINDS.length ? KINDS[round - 1] : ctx.rng.pick(KINDS);
    phase = 'intro';
    t = 0;
    failed = new Array(n).fill(false);
    done = new Array(n).fill(false);
    cmd = COMMANDS[ctx.rng.pick(BASIC_COMMANDS)];
    pose = ctx.rng.pick(UPPER_BODY_POSES);
  };

  const fail = (i: number) => {
    if (failed[i] || !alive(i)) return;
    failed[i] = true;
    lives[i]--;
    ctx.audio.play('buzzer');
    ctx.fx.text(lives[i] > 0 ? '-❤️' : tx(ctx, 'eliminated'), ctx.input(i).head.x, ctx.input(i).head.y - 70, C.bad, 34);
  };

  const close = () => {
    for (let i = 0; i < n; i++) if (alive(i) && !failed[i]) survived[i]++;
    phase = 'reveal';
    t = 0;
  };

  next();

  return {
    view: { camera: 'dim', dim: 0.25, skeleton: true },
    update(dt) {
      if (finished) return;
      t += dt;
      if (phase === 'intro') {
        if (t > 1.3) {
          phase = 'run';
          t = 0;
          if (kind === 'freeze') {
            freeze.reset();
            ctx.audio.play('freeze');
          } else if (kind === 'duck' || kind === 'jump') {
            for (let i = 0; i < n; i++) {
              if (!alive(i)) continue;
              const inp = ctx.input(i);
              const y = kind === 'duck' ? inp.head.y + inp.torsoPx * 0.05 : (inp.leftFoot.y + inp.rightFoot.y) / 2 - inp.torsoPx * 0.25;
              hazards.add({ kind: kind === 'duck' ? 'high' : 'low', owner: i, t: 1.2, warn: 1.2, x: 0, y, from: -1, style: 'laser' });
            }
            ctx.audio.play('laser');
          } else ctx.audio.play('go');
        }
        return;
      }
      if (phase === 'reveal') {
        if (t > 1.4) next();
        return;
      }
      const now = performance.now();
      switch (kind) {
        case 'freeze':
          for (const i of freeze.update(dt, ctx.input, (i) => alive(i) && !failed[i])) fail(i);
          if (t > 2.6) close();
          break;
        case 'reaction': {
          for (let i = 0; i < n; i++) if (alive(i) && !done[i] && performed(cmd, ctx.input(i), now, t > 0.15) !== null) done[i] = true;
          const waiting = ctx.players.filter((p) => alive(p.index) && !done[p.index]).length;
          if (t > 2.2 || waiting <= (n > 2 ? 1 : 0)) {
            for (let i = 0; i < n; i++) if (alive(i) && !done[i]) fail(i);
            close();
          }
          break;
        }
        case 'duck':
        case 'jump':
          for (const r of hazards.update(dt, ctx.input)) if (r.hit) fail(r.hazard.owner);
          if (hazards.pending === 0 && t > 1.3) close();
          break;
        case 'pose':
          for (let i = 0; i < n; i++) if (alive(i) && !done[i] && matchPose(pose, ctx.input(i).state, ctx.input(i).pose) > 0.68) done[i] = true;
          if (t > 4 || done.every((d, i) => d || !alive(i))) {
            for (let i = 0; i < n; i++) if (alive(i) && !done[i]) fail(i);
            close();
          }
          break;
      }
    },
    render(g) {
      hazards.render(g, (o) => ctx.zone(o), ctx.height);
      scoreHeader(g, ctx, lives.map((l) => (l > 0 ? '' : tx(ctx, 'out'))), { center: tx(ctx, 'round', { n: round }) });
      for (let i = 0; i < n; i++) {
        const z = ctx.zone(i);
        hearts(g, z.x + z.w / 2, 62, Math.max(0, lives[i]), 3, 22, 'center');
        if (!alive(i)) bubble(g, ctx.input(i), tx(ctx, 'out'), C.muted);
        else if (phase === 'reveal') bubble(g, ctx.input(i), failed[i] ? '✗' : '✓', failed[i] ? C.bad : C.good);
      }
      const title: Record<Kind, string> = {
        freeze: tx(ctx, 'cmdFreeze'),
        reaction: cmdLabel(ctx, cmd),
        duck: tx(ctx, 'cmdDuck'),
        jump: tx(ctx, 'cmdJump'),
        pose: poseName(pose, ctx.lang),
      };
      if (phase === 'intro') bigCommand(g, ctx, L(ctx, 'GET READY…', 'BERSIAP…'), '⏱️', C.vanilla, 0.8);
      else if (phase === 'run') {
        if (kind === 'pose') ghost(g, pose, ctx.width / 2, ctx.height * 0.35, 50, C.vanilla);
        bigCommand(g, ctx, title[kind], kind === 'freeze' ? '🧊' : kind === 'reaction' ? cmd.emoji : kind === 'duck' ? '⬇️' : kind === 'jump' ? '⬆️' : '⭐', C.vanilla, 0.9, kind === 'pose' ? ctx.height * 0.62 : ctx.height * 0.3);
      }
    },
    inspect: () => ({ kind, phase, lives: [...lives] }),
  };
};

export default factory;
