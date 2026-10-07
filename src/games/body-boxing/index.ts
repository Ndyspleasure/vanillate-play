import type { Point } from '../../core/math';
import { clamp, dist, easeInCubic, lerp } from '../../core/math';
import { bar, C, circle, emoji, panel, text } from '../../engine/draw';
import { soloResult, versusResult } from '../../engine/hud';
import type { GameFactory, PlayerInput } from '../../engine/types';
import { tx } from '../kits/text';

/**
 * Body Boxing (GAMES.md 6.1) — flagship 1v1. Punches launch virtual gloves across the screen;
 * the defender blocks (guard up) or dodges (lean/duck out of the way). Perfect dodges open a
 * counter window. Combos, criticals, KO slow-mo. Best of 3 rounds; solo fights a cartoon AI.
 */
const ROUND_TIME = 45;
const MAX_HP = 100;
const TRAVEL = 0.36;

interface Glove {
  from: number;
  to: number;
  start: Point;
  target: Point;
  t: number;
  side: 'left' | 'right';
  counter: boolean;
}

const factory: GameFactory = (ctx) => {
  const solo = ctx.players.length === 1;
  const hp = [MAX_HP, MAX_HP];
  const ghostHp = [MAX_HP, MAX_HP];
  const rounds = [0, 0];
  const dmgTotal = [0, 0];
  const blocks = [0, 0];
  const dodges = [0, 0];
  const bestCombo = [0, 0];
  const combo = [0, 0];
  const lastHit = [-9, -9];
  const cooldown = [0, 0];
  const counterUntil = [-9, -9];
  const lastEvade = [-9, -9];
  let gloves: Glove[] = [];
  let round = 1;
  let timer = ROUND_TIME;
  let phase: 'fight' | 'break' = 'fight';
  let breakT = 0;
  let koFlash = 0;
  let finished = false;
  let time = 0;

  // ── Solo AI opponent ──
  const ai = {
    state: 'idle' as 'idle' | 'windup' | 'recover',
    t: 1.5,
    side: 'left' as 'left' | 'right',
    headOff: 0,
    guard: 0,
    hitT: 0,
  };
  const aiHead = (): Point => ({ x: ctx.width * 0.74 + ai.headOff, y: ctx.height * 0.36 });
  const aiGlove = (side: 'left' | 'right'): Point => {
    const h = aiHead();
    const wind = ai.state === 'windup' && ai.side === side ? -20 : 0;
    return { x: h.x + (side === 'left' ? -70 : 70) + wind, y: h.y + 70 - ai.guard * 40 };
  };

  const head = (i: number): Point => (solo && i === 1 ? aiHead() : ctx.input(i).head);
  const color = (i: number) => (solo && i === 1 ? '#ffb020' : ctx.players[i].color);
  const name = (i: number) => (solo && i === 1 ? tx(ctx, 'cpu') : ctx.players[i].name);

  const throwPunch = (from: number, side: 'left' | 'right', start: Point) => {
    const to = 1 - from;
    const tgt = head(to);
    gloves.push({ from, to, start: { ...start }, target: { ...tgt }, t: 0, side, counter: time < counterUntil[from] });
    cooldown[from] = 0.33;
    ctx.audio.play('whoosh', { pan: from === 0 ? -0.4 : 0.4 });
  };

  const resolve = (gl: Glove) => {
    const d = gl.to;
    let blocked = false;
    let dodged = false;
    if (solo && d === 1) {
      const r = ctx.rng.next();
      blocked = ai.guard > 0.5 || r < 0.12 + round * 0.06;
      dodged = !blocked && r < 0.22 + round * 0.06;
      if (dodged) ai.headOff = ctx.rng.chance(0.5) ? -90 : 90;
    } else {
      const inp: PlayerInput = ctx.input(d);
      if (inp.health === 'lost') blocked = true; // never punish tracking loss
      else {
        blocked = inp.state.blocking;
        dodged = !blocked && (dist(inp.head, gl.target) > inp.headRadius * 1.6 || inp.state.ducking);
      }
    }
    const at = head(d);
    if (blocked) {
      blocks[d]++;
      hp[d] = Math.max(0, hp[d] - 2);
      ctx.audio.play('block');
      ctx.fx.text(tx(ctx, 'blocked'), at.x, at.y - 70, '#8ecae6', 30);
      ctx.fx.ring(at.x, at.y, '#8ecae6', 20, 80);
      combo[gl.from] = 0;
      return;
    }
    if (dodged) {
      const perfect = time - lastEvade[d] < 0.45 || (solo && d === 1);
      ctx.audio.play('whoosh', { pitch: 1.4 });
      if (perfect) {
        dodges[d]++;
        counterUntil[d] = time + 1.1;
        ctx.fx.text(tx(ctx, 'perfectDodge'), at.x, at.y - 80, C.gold, 34);
      } else ctx.fx.text(tx(ctx, 'dodged'), at.x, at.y - 70, C.ink, 28);
      combo[gl.from] = 0;
      return;
    }
    // Hit!
    const a = gl.from;
    combo[a] = time - lastHit[a] < 1.3 ? combo[a] + 1 : 1;
    lastHit[a] = time;
    bestCombo[a] = Math.max(bestCombo[a], combo[a]);
    const crit = ctx.rng.chance(0.12);
    let dmg = 7 + ctx.rng.int(0, 3);
    dmg *= 1 + Math.min(0.6, (combo[a] - 1) * 0.15);
    if (gl.counter) dmg *= 1.6;
    if (crit) dmg *= 1.8;
    dmg = Math.round(dmg);
    ghostHp[d] = Math.max(ghostHp[d], hp[d]);
    hp[d] = Math.max(0, hp[d] - dmg);
    dmgTotal[a] += dmg;
    if (solo && d === 1) ai.hitT = 0.3;
    ctx.audio.play('hit', { pitch: crit ? 0.8 : 1 });
    ctx.fx.burst(at.x, at.y, [color(a), '#fff', C.gold], crit ? 36 : 20, { speed: 380 });
    ctx.fx.shake(crit ? 14 : 7, 0.25);
    const label = gl.counter ? tx(ctx, 'counter') : crit ? tx(ctx, 'critical') : combo[a] > 1 ? tx(ctx, 'combo', { n: combo[a] }) : `-${dmg}`;
    ctx.fx.text(label, at.x, at.y - 80, crit || gl.counter ? C.gold : '#fff', crit ? 42 : 34);
    if (combo[a] > 1) ctx.audio.play('combo', { pitch: 1 + combo[a] * 0.05 });
    if (hp[d] <= 0) ko(a);
  };

  const ko = (winner: number) => {
    rounds[winner]++;
    phase = 'break';
    breakT = 0;
    koFlash = 1;
    gloves = [];
    ctx.audio.play('ko');
    ctx.fx.flash('#fff', 0.6, 2);
    ctx.setTimeScale(0.3, 1.2);
    ctx.banner(tx(ctx, 'ko'), tx(ctx, 'winsRound', { name: name(winner).toUpperCase() }), 2.2);
  };

  const timeUp = () => {
    phase = 'break';
    breakT = 0;
    gloves = [];
    ctx.audio.play('buzzer');
    if (hp[0] !== hp[1]) {
      const w = hp[0] > hp[1] ? 0 : 1;
      rounds[w]++;
      ctx.banner(tx(ctx, 'timeUp'), tx(ctx, 'winsRound', { name: name(w).toUpperCase() }), 2.2);
    } else ctx.banner(tx(ctx, 'timeUp'), tx(ctx, 'draw'), 2.2);
  };

  const nextRound = () => {
    const done = rounds[0] >= 2 || rounds[1] >= 2 || round >= 3;
    if (done) return finish();
    round++;
    hp[0] = hp[1] = ghostHp[0] = ghostHp[1] = MAX_HP;
    timer = ROUND_TIME;
    combo.fill(0);
    phase = 'fight';
    ctx.banner(round === 3 ? tx(ctx, 'finalRound') : tx(ctx, 'round', { n: round }), undefined, 1.4);
    ctx.audio.play('whistle');
  };

  const finish = () => {
    if (finished) return;
    finished = true;
    const stats = [
      { label: tx(ctx, 'statRounds'), values: rounds.map(String) },
      { label: tx(ctx, 'statDamage'), values: dmgTotal.map(String) },
      { label: tx(ctx, 'statBestCombo'), values: bestCombo.map(String) },
      { label: tx(ctx, 'statDodges'), values: dodges.map(String) },
      { label: tx(ctx, 'statBlocks'), values: blocks.map(String) },
    ];
    if (solo) {
      const won = rounds[0] > rounds[1];
      ctx.end(
        soloResult(ctx, rounds[0] * 1000 + dmgTotal[0], {
          display: `${rounds[0]} – ${rounds[1]}`,
          headline: won ? tx(ctx, 'youWin') : tx(ctx, 'cpuWins'),
          stats: stats.map((s) => ({ label: s.label, values: [`${s.values[0]} · ${s.values[1]}`] })),
        }),
      );
    } else {
      const scores = rounds[0] === rounds[1] ? [dmgTotal[0], dmgTotal[1]] : rounds;
      ctx.end(versusResult(ctx, scores, { display: () => '', stats, winner: rounds[0] === rounds[1] ? (dmgTotal[0] === dmgTotal[1] ? null : dmgTotal[0] > dmgTotal[1] ? 0 : 1) : rounds[0] > rounds[1] ? 0 : 1 }));
    }
  };

  const updateAI = (dt: number) => {
    ai.headOff = lerp(ai.headOff, 0, 1 - Math.exp(-dt / 0.35));
    ai.hitT = Math.max(0, ai.hitT - dt);
    ai.t -= dt;
    const aggression = 0.9 - round * 0.12;
    if (ai.state === 'idle') {
      ai.guard = lerp(ai.guard, ctx.rng.chance(0.01) ? 1 : ai.guard > 0.5 ? 1 : 0, 0.05);
      if (ai.t <= 0) {
        ai.state = 'windup';
        ai.side = ctx.rng.chance(0.5) ? 'left' : 'right';
        ai.t = 0.55 - round * 0.06;
        ai.guard = 0;
      }
    } else if (ai.state === 'windup') {
      if (ai.t <= 0) {
        throwPunch(1, ai.side, aiGlove(ai.side));
        ai.state = 'recover';
        ai.t = 0.4;
      }
    } else if (ai.t <= 0) {
      ai.state = 'idle';
      ai.t = ctx.rng.range(0.6, 1.6) * aggression;
      ai.guard = ctx.rng.chance(0.3) ? 1 : 0;
    }
  };

  return {
    view: { camera: 'dim', dim: 0.2, skeleton: true },
    update(dt) {
      if (finished) return;
      time += dt;
      koFlash = Math.max(0, koFlash - dt);
      for (let i = 0; i < 2; i++) ghostHp[i] = lerp(ghostHp[i], hp[i], 1 - Math.exp(-dt / 0.6));
      if (phase === 'break') {
        breakT += dt;
        if (breakT > 2.6) nextRound();
        return;
      }
      timer -= dt;
      if (timer <= 0) return timeUp();
      for (let i = 0; i < (solo ? 1 : 2); i++) {
        const inp = ctx.input(i);
        cooldown[i] = Math.max(0, cooldown[i] - dt);
        if (inp.any('DODGE_LEFT', 'DODGE_RIGHT', 'LEAN_LEFT', 'LEAN_RIGHT', 'DUCK', 'STEP_LEFT', 'STEP_RIGHT')) lastEvade[i] = time;
        if (cooldown[i] > 0) continue;
        if (inp.has('PUNCH_LEFT')) throwPunch(i, 'left', inp.leftHand);
        else if (inp.has('PUNCH_RIGHT')) throwPunch(i, 'right', inp.rightHand);
      }
      if (solo) updateAI(dt);
      for (const gl of gloves) {
        gl.t += dt / TRAVEL;
        if (gl.t >= 1) resolve(gl);
      }
      gloves = gloves.filter((gl) => gl.t < 1);
    },
    render(g) {
      const w = ctx.width;
      // Solo AI boxer
      if (solo) {
        const h = aiHead();
        const shake = ai.hitT > 0 ? Math.sin(time * 60) * 8 : 0;
        panel(g, h.x - 70 + shake, h.y + 50, 140, 190, { fill: '#7b2cff', r: 40, stroke: '#140b2e', lineWidth: 4 });
        circle(g, h.x + shake, h.y, 54, '#ffcf9e', '#140b2e', 4);
        circle(g, h.x - 18 + shake, h.y - 6, 7, '#140b2e');
        circle(g, h.x + 18 + shake, h.y - 6, 7, '#140b2e');
        g.strokeStyle = '#140b2e';
        g.lineWidth = 4;
        g.beginPath();
        g.arc(h.x + shake, h.y + 20, 16, ai.hitT > 0 ? Math.PI * 1.1 : 0.15 * Math.PI, ai.hitT > 0 ? Math.PI * 1.9 : 0.85 * Math.PI, ai.hitT > 0);
        g.stroke();
        g.fillStyle = '#e63946';
        g.fillRect(h.x - 54 + shake, h.y - 40, 108, 14);
        for (const side of ['left', 'right'] as const) {
          const p = aiGlove(side);
          if (ai.state === 'windup' && ai.side === side) circle(g, p.x, p.y, 48 + Math.sin(time * 30) * 5, 'rgba(255,90,90,0.35)');
          emoji(g, '🥊', p.x, p.y, 70, 1, '#ffb020');
        }
      }
      // Gloves on the players' hands
      for (let i = 0; i < (solo ? 1 : 2); i++) {
        const inp = ctx.input(i);
        if (inp.health === 'lost') continue;
        const gs = Math.max(44, inp.torsoPx * 0.42);
        emoji(g, '🥊', inp.leftHand.x, inp.leftHand.y, gs, 1, ctx.players[i].color);
        emoji(g, '🥊', inp.rightHand.x, inp.rightHand.y, gs, 1, ctx.players[i].color);
      }
      // Gloves in flight
      for (const gl of gloves) {
        const u = easeInCubic(clamp(gl.t, 0, 1));
        const x = lerp(gl.start.x, gl.target.x, u);
        const y = lerp(gl.start.y, gl.target.y, u) - Math.sin(u * Math.PI) * 40;
        const size = 50 + u * 60;
        if (gl.counter) circle(g, x, y, size * 0.7, 'rgba(255,210,61,0.35)');
        emoji(g, '🥊', x, y, size, 1, color(gl.from));
      }
      // HUD: names, HP bars, rounds, timer
      const bw = Math.min(420, w * 0.36);
      for (let i = 0; i < 2; i++) {
        const x = i === 0 ? 20 : w - bw - 20;
        text(g, name(i), i === 0 ? x : x + bw, 30, { size: 22, align: i === 0 ? 'left' : 'right', color: color(i) });
        bar(g, x, 48, bw, 22, hp[i] / MAX_HP, color(i), { reverse: i === 1, ghost: ghostHp[i] / MAX_HP });
        for (let r = 0; r < 2; r++) circle(g, i === 0 ? x + 12 + r * 26 : x + bw - 12 - r * 26, 88, 9, r < rounds[i] ? C.gold : 'rgba(255,255,255,0.2)', '#140b2e', 2);
        if (combo[i] > 1 && time - lastHit[i] < 1.3) text(g, tx(ctx, 'combo', { n: combo[i] }), i === 0 ? x : x + bw, 118, { size: 22, align: i === 0 ? 'left' : 'right', color: C.gold });
        if (time < counterUntil[i]) text(g, tx(ctx, 'counter'), i === 0 ? x : x + bw, 146, { size: 20, align: i === 0 ? 'left' : 'right', color: C.gold });
      }
      panel(g, w / 2 - 60, 20, 120, 72, { fill: 'rgba(20,10,40,0.8)', r: 18 });
      text(g, String(Math.max(0, Math.ceil(timer))), w / 2, 46, { size: 30, color: timer < 10 ? C.bad : C.ink, stroke: 0 });
      text(g, tx(ctx, 'round', { n: round }), w / 2, 76, { size: 14, color: C.vanilla, stroke: 0 });
      if (koFlash > 0) {
        g.fillStyle = `rgba(255,255,255,${koFlash * 0.25})`;
        g.fillRect(0, 0, w, ctx.height);
      }
    },
    inspect: () => ({ hp: [...hp], rounds: [...rounds], round, gloves: gloves.length, phase }),
  };
};

export default factory;
