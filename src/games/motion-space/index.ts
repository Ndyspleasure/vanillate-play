import { clamp, lerp } from '../../core/math';
import { bar, C, circle, emoji, text } from '../../engine/draw';
import { coopResult, scoreHeader, soloResult, versusResult } from '../../engine/hud';
import type { GameFactory } from '../../engine/types';
import { L, tx } from '../kits/text';
import { hearts } from '../kits/ui';

/**
 * Motion Space (GAMES.md 6.33) — lean/step to fly, punch to fire, both hands up for a shield burst.
 * Wave defense (with a boss) or survival; solo, duo co-op crew (shared lives) or versus for points.
 */
interface Ent {
  x: number;
  y: number;
  vx: number;
  vy: number;
  hp: number;
  kind: 'enemy' | 'rock' | 'boss';
  r: number;
  fire: number;
  dead: boolean;
}
interface Shot {
  x: number;
  y: number;
  vy: number;
  owner: number; // -1 = enemy
  dead: boolean;
}

const factory: GameFactory = (ctx) => {
  const n = ctx.players.length;
  const coop = ctx.mode === 'coop';
  const survival = ctx.options.variant === 'survival';
  const ships = ctx.players.map((_p, i) => ({ x: ctx.zone(i).x + ctx.zone(i).w / 2, cool: 0, shield: 0, charge: 1, hit: 0 }));
  const score = new Array(n).fill(0);
  const kills = new Array(n).fill(0);
  let lives = coop ? 5 : 3;
  const livesEach = new Array(n).fill(3);
  let ents: Ent[] = [];
  let shots: Shot[] = [];
  let wave = 0;
  let waveT = 0;
  let spawnT = 0;
  let time = 0;
  let finished = false;
  const stars = Array.from({ length: 80 }, () => ({ x: ctx.rng.next(), y: ctx.rng.next(), s: ctx.rng.range(1, 3) }));
  const shipY = () => ctx.height - 90;

  const startWave = () => {
    wave++;
    waveT = 0;
    if (!survival && wave === 5) {
      ents.push({ x: ctx.width / 2, y: -80, vx: 120, vy: 40, hp: 40, kind: 'boss', r: 90, fire: 1, dead: false });
      ctx.banner(tx(ctx, 'boss'), undefined, 1.6);
      ctx.audio.music.play('boss');
    } else {
      const count = 5 + wave * 2;
      for (let k = 0; k < count; k++) ents.push({ x: ((k + 0.5) / count) * ctx.width, y: -40 - (k % 3) * 60, vx: 60 * (k % 2 ? 1 : -1), vy: 30 + wave * 4, hp: 1 + Math.floor(wave / 3), kind: 'enemy', r: 30, fire: ctx.rng.range(1, 4), dead: false });
      ctx.banner(tx(ctx, 'wave', { n: wave }), undefined, 1.2);
    }
  };

  const finish = (win: boolean) => {
    if (finished) return;
    finished = true;
    ctx.audio.music.stop(300);
    const stats = [
      { label: L(ctx, 'Enemies destroyed', 'Musuh dihancurkan'), values: kills.map(String) },
      { label: tx(ctx, 'statWaves'), values: [String(survival ? Math.floor(time) + ' s' : wave - (win ? 0 : 1))] },
    ];
    if (coop) ctx.end(coopResult(ctx, Math.min(100, win ? 100 : ((wave - 1) / 5) * 100), { big: String(score[0] + score[1]), headline: win ? L(ctx, 'MISSION COMPLETE', 'MISI SELESAI') : L(ctx, 'SHIP DOWN', 'KAPAL HANCUR'), stats }));
    else if (n === 1) ctx.end(soloResult(ctx, score[0], { headline: win ? L(ctx, 'MISSION COMPLETE', 'MISI SELESAI') : undefined, stats }));
    else ctx.end(versusResult(ctx, score, { stats }));
  };

  const hurt = (i: number) => {
    const s = ships[i];
    if (s.shield > 0 || s.hit > 0) return;
    s.hit = 1.2;
    ctx.audio.play('explosion');
    ctx.fx.shake(10, 0.3);
    ctx.fx.burst(s.x, shipY(), ['#ff7a00', '#fff'], 30);
    if (coop || n === 1) lives--;
    else livesEach[i]--;
  };

  if (!survival) startWave();
  ctx.audio.music.play('arcade');

  return {
    view: { camera: 'pip', skeleton: false },
    destroy() {
      ctx.audio.music.stop(100);
    },
    onPause() {
      ctx.audio.music.pause();
    },
    onResume() {
      ctx.audio.music.resume();
    },
    update(dt) {
      if (finished) return;
      time += dt;
      waveT += dt;
      for (const st of stars) st.y = (st.y + dt * 0.08 * st.s) % 1;
      // Ships
      ctx.players.forEach((_p, i) => {
        const s = ships[i];
        const inp = ctx.input(i);
        const z = ctx.zone(i);
        const span = n === 1 ? ctx.width : z.w;
        const cx = n === 1 ? ctx.width / 2 : z.x + z.w / 2;
        const target = clamp(cx + (inp.state.offsetX * 0.45 + inp.state.lean * 1.1) * span * 0.6, 40, ctx.width - 40);
        if (inp.health !== 'lost') s.x = lerp(s.x, target, 1 - Math.exp(-dt / 0.08));
        s.cool = Math.max(0, s.cool - dt);
        s.shield = Math.max(0, s.shield - dt);
        s.hit = Math.max(0, s.hit - dt);
        s.charge = Math.min(1, s.charge + dt / 8);
        if (s.cool === 0 && inp.any('PUNCH_LEFT', 'PUNCH_RIGHT')) {
          for (const dx of [-14, 14]) shots.push({ x: s.x + dx, y: shipY() - 30, vy: -900, owner: i, dead: false });
          s.cool = 0.18;
          ctx.audio.play('laser', { volume: 0.4, pitch: 1.4 });
        }
        if (s.charge >= 1 && inp.has('HANDS_UP')) {
          s.charge = 0;
          s.shield = 3;
          ctx.audio.play('powerup');
          ctx.fx.ring(s.x, shipY(), '#3dd6ff', 20, 220, 0.6, 8);
          for (const sh of shots) if (sh.owner === -1 && Math.hypot(sh.x - s.x, sh.y - shipY()) < 260) sh.dead = true;
        }
      });
      // Spawning
      if (survival) {
        spawnT -= dt;
        if (spawnT <= 0) {
          spawnT = Math.max(0.35, 1.4 - time * 0.01);
          const rock = ctx.rng.chance(0.6);
          ents.push({ x: ctx.rng.range(40, ctx.width - 40), y: -50, vx: ctx.rng.range(-40, 40), vy: ctx.rng.range(120, 200) + time * 2, hp: rock ? 2 : 1, kind: rock ? 'rock' : 'enemy', r: rock ? 36 : 28, fire: ctx.rng.range(1, 3), dead: false });
        }
      } else if (ents.every((e) => e.dead) && waveT > 1.5) {
        if (wave >= 5) return finish(true);
        startWave();
      }
      // Entities
      for (const e of ents) {
        if (e.dead) continue;
        e.x += e.vx * dt;
        e.y += e.vy * dt;
        if (e.kind !== 'rock' && (e.x < 40 || e.x > ctx.width - 40)) e.vx *= -1;
        if (e.kind === 'boss' && e.y > ctx.height * 0.22) e.vy = 0;
        if (e.kind === 'enemy' && !survival && e.y > ctx.height * 0.5) e.vy = -Math.abs(e.vy) * 0.5;
        if (e.kind === 'enemy' && e.y < -60) e.vy = Math.abs(e.vy);
        e.fire -= dt;
        if (e.kind !== 'rock' && e.fire <= 0 && e.y > 0) {
          e.fire = e.kind === 'boss' ? 0.6 : ctx.rng.range(2, 4.5);
          const spread = e.kind === 'boss' ? [-60, 0, 60] : [0];
          for (const dx of spread) shots.push({ x: e.x + dx, y: e.y + e.r * 0.6, vy: 320 + wave * 15, owner: -1, dead: false });
        }
        if (e.y > ctx.height + 60) e.dead = true;
        ships.forEach((s, i) => {
          if (Math.hypot(e.x - s.x, e.y - shipY()) < e.r + 26) {
            hurt(i);
            if (e.kind !== 'boss') e.dead = true;
          }
        });
      }
      for (const sh of shots) {
        if (sh.dead) continue;
        sh.y += sh.vy * dt;
        if (sh.y < -20 || sh.y > ctx.height + 20) sh.dead = true;
        if (sh.owner === -1) {
          ships.forEach((s, i) => {
            if (!sh.dead && Math.abs(sh.x - s.x) < 26 && Math.abs(sh.y - shipY()) < 26) {
              sh.dead = true;
              hurt(i);
            }
          });
        } else {
          for (const e of ents) {
            if (e.dead || sh.dead) continue;
            if (Math.hypot(sh.x - e.x, sh.y - e.y) < e.r) {
              sh.dead = true;
              e.hp--;
              ctx.fx.burst(sh.x, sh.y, '#fff', 4, { speed: 120 });
              if (e.hp <= 0) {
                e.dead = true;
                kills[sh.owner]++;
                const pts = e.kind === 'boss' ? 2000 : e.kind === 'rock' ? 50 : 100;
                score[sh.owner] += pts;
                ctx.audio.play('explosion', { volume: 0.6 });
                ctx.fx.burst(e.x, e.y, ['#ffd23d', '#ff7a00', '#fff'], e.kind === 'boss' ? 80 : 20);
                ctx.fx.text(`+${pts}`, e.x, e.y, C.gold, 24);
              }
            }
          }
        }
      }
      ents = ents.filter((e) => !e.dead);
      shots = shots.filter((s) => !s.dead);
      const dead = coop || n === 1 ? lives <= 0 : livesEach.every((l) => l <= 0);
      if (dead) finish(false);
      if (!coop && n > 1 && time > 150) finish(false);
    },
    renderBackground(g) {
      g.fillStyle = '#05010f';
      g.fillRect(0, 0, ctx.width, ctx.height);
      for (const st of stars) circle(g, st.x * ctx.width, st.y * ctx.height, st.s, `rgba(255,255,255,${0.3 + st.s * 0.2})`);
    },
    render(g) {
      for (const e of ents) {
        if (e.kind === 'boss') {
          emoji(g, '🛸', e.x, e.y, e.r * 2.2, 1);
          bar(g, ctx.width / 2 - 200, 100, 400, 14, e.hp / 40, C.bad);
        } else emoji(g, e.kind === 'rock' ? '🪨' : '👾', e.x, e.y, e.r * 2, 1, '#9d4edd');
      }
      for (const s of shots) {
        g.fillStyle = s.owner === -1 ? '#ff5a5a' : ctx.players[s.owner].color;
        g.fillRect(s.x - 3, s.y - 12, 6, 24);
      }
      ships.forEach((s, i) => {
        if (s.hit > 0 && Math.floor(s.hit * 12) % 2 === 0) return;
        emoji(g, '🚀', s.x, shipY(), 74, 1);
        circle(g, s.x, shipY() + 44, 8, ctx.players[i].color);
        if (s.shield > 0) circle(g, s.x, shipY(), 56, 'rgba(61,214,255,0.18)', '#3dd6ff', 3);
        bar(g, s.x - 30, shipY() + 58, 60, 6, s.charge, s.charge >= 1 ? '#3dd6ff' : 'rgba(61,214,255,0.5)');
      });
      scoreHeader(g, ctx, score, { center: survival ? `${Math.floor(time)} s` : tx(ctx, 'wave', { n: Math.max(1, wave) }) });
      if (coop || n === 1) hearts(g, ctx.width / 2, 108, Math.max(0, lives), coop ? 5 : 3, 22, 'center');
      else ctx.players.forEach((_p, i) => hearts(g, ctx.zone(i).x + ctx.zone(i).w / 2, 108, Math.max(0, livesEach[i]), 3, 22, 'center'));
      if (time < 5) text(g, L(ctx, 'Lean to fly · punch to fire · hands up = shield', 'Condong untuk terbang · pukul untuk menembak · angkat tangan = perisai'), ctx.width / 2, ctx.height * 0.55, { size: 22, color: C.vanilla });
    },
    inspect: () => ({ wave, ents: ents.length, lives }),
  };
};

export default factory;
