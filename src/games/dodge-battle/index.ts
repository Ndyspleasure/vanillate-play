import { C, text } from '../../engine/draw';
import { scoreHeader, versusResult } from '../../engine/hud';
import type { GameFactory } from '../../engine/types';
import { HazardField, type Hazard } from '../kits/hazards';
import { L, tx } from '../kits/text';
import { bubble } from '../kits/ui';

/**
 * Dodge Battle (GAMES.md 6.7) — one attacks, one dodges, then swap.
 * Punch with your fist above your head = high shot (duck), punch while squatting = low shot (jump),
 * otherwise the shot locks on the defender's body (step/lean away).
 */
const SHOTS = 6;
const TURNS = 4;

const factory: GameFactory = (ctx) => {
  const variant = ctx.options.variant ?? 'projectile';
  const score = [0, 0];
  const hitsLanded = [0, 0];
  const dodged = [0, 0];
  const field = new HazardField();
  let turn = 0;
  let attacker = 0;
  let shots = 0;
  let cooldown = 0;
  let turnT = 0;
  let phase: 'banner' | 'attack' = 'banner';
  let finished = false;

  const styleFor = (): Hazard['style'] => {
    const v = variant === 'random' ? ctx.rng.pick(['projectile', 'laser', 'punch']) : variant;
    return v === 'laser' ? 'laser' : v === 'punch' ? 'fist' : 'ball';
  };

  const startTurn = () => {
    turn++;
    if (turn > TURNS) return finish();
    attacker = (turn - 1) % 2;
    shots = 0;
    turnT = 0;
    phase = 'banner';
    ctx.banner(tx(ctx, 'swap'), `${ctx.players[attacker].name} ${L(ctx, 'attacks', 'menyerang')}`, 1.4);
  };

  const fire = (kind: Hazard['kind']) => {
    const d = 1 - attacker;
    const def = ctx.input(d);
    const style = styleFor();
    const T = def.torsoPx;
    const warn = Math.max(0.65, 1.05 - turn * 0.06);
    if (kind === 'high') field.add({ kind, owner: d, t: warn, warn, x: 0, y: def.head.y + T * 0.05, from: attacker === 0 ? -1 : 1, style });
    else if (kind === 'low') field.add({ kind, owner: d, t: warn, warn, x: 0, y: (def.leftFoot.y + def.rightFoot.y) / 2 - T * 0.25, from: attacker === 0 ? -1 : 1, style });
    else field.add({ kind: style === 'laser' ? 'wall' : 'body', owner: d, t: warn, warn, x: def.center.x, y: def.center.y, from: attacker === 0 ? -1 : 1, style, width: style === 'laser' ? 30 : 60 });
    shots++;
    cooldown = 1.1;
    ctx.audio.play(style === 'laser' ? 'laser' : 'shoot');
  };

  const finish = () => {
    if (finished) return;
    finished = true;
    ctx.end(
      versusResult(ctx, score, {
        stats: [
          { label: L(ctx, 'Shots landed', 'Tembakan kena'), values: hitsLanded.map(String) },
          { label: L(ctx, 'Dodges', 'Menghindar'), values: dodged.map(String) },
        ],
      }),
    );
  };

  startTurn();

  return {
    view: { camera: 'dim', dim: 0.2, skeleton: true },
    update(dt) {
      if (finished) return;
      turnT += dt;
      if (phase === 'banner') {
        if (turnT > 1.5) {
          phase = 'attack';
          turnT = 0;
        }
        return;
      }
      cooldown = Math.max(0, cooldown - dt);
      const atk = ctx.input(attacker);
      if (shots < SHOTS && cooldown === 0) {
        const punch = atk.has('PUNCH_LEFT') ? 'left' : atk.has('PUNCH_RIGHT') ? 'right' : null;
        const auto = turnT > 4 + shots * 3; // keep the round moving if the attacker hesitates
        if (punch || auto) {
          const hand = punch === 'left' ? atk.leftHand : atk.rightHand;
          let kind: Hazard['kind'] = 'body';
          if (punch && hand.y < atk.head.y) kind = 'high';
          else if (punch && (atk.state.squatting || atk.state.drop > 0.2)) kind = 'low';
          else if (auto || variant === 'random') kind = ctx.rng.pick(['high', 'low', 'body'] as const);
          fire(kind);
        }
      }
      for (const r of field.update(dt, ctx.input)) {
        const d = r.hazard.owner;
        const inp = ctx.input(d);
        if (r.hit) {
          score[attacker]++;
          hitsLanded[attacker]++;
          ctx.audio.play('hit');
          ctx.fx.shake(10, 0.3);
          ctx.fx.burst(inp.center.x, inp.center.y, ['#ff5a1f', '#ffd23d'], 26);
          ctx.fx.text(tx(ctx, 'hit'), inp.head.x, inp.head.y - 70, C.bad, 36);
        } else {
          score[d]++;
          dodged[d]++;
          ctx.audio.play('whoosh', { pitch: 1.3 });
          ctx.fx.text(tx(ctx, 'dodged'), inp.head.x, inp.head.y - 70, C.good, 32);
        }
      }
      if (shots >= SHOTS && field.pending === 0) startTurn();
    },
    render(g) {
      field.render(g, (o) => ctx.zone(o), ctx.height);
      scoreHeader(g, ctx, score, { center: `${L(ctx, 'Turn', 'Giliran')} ${Math.min(turn, TURNS)}/${TURNS} · ${SHOTS - shots} ${L(ctx, 'shots left', 'tembakan')}` });
      bubble(g, ctx.input(attacker), `⚔️ ${tx(ctx, 'attacker')}`, C.bad);
      bubble(g, ctx.input(1 - attacker), `🛡️ ${tx(ctx, 'defender')}`, C.good);
      if (phase === 'attack' && shots === 0)
        text(g, L(ctx, 'Fist high = high shot · Squat + punch = low shot', 'Kepalan tinggi = tembakan atas · Jongkok + pukul = tembakan bawah'), ctx.width / 2, ctx.height - 40, { size: 20, color: C.vanilla });
    },
    inspect: () => ({ attacker, shots, turn, score: [...score] }),
  };
};

export default factory;
