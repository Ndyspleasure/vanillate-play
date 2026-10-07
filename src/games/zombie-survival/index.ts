import { C, bar, emoji, text } from '../../engine/draw';
import { coopResult } from '../../engine/hud';
import type { GameFactory } from '../../engine/types';
import { HazardField } from '../kits/hazards';
import { L, tx } from '../kits/text';
import { bubble } from '../kits/ui';

/**
 * Zombie Survival Duo (GAMES.md 6.17) — back to back against waves: Wave 1 → 2 → 3 → Elite → Boss.
 * Punch walkers on the side they come from, kick (or squat-punch) crawlers, dodge spit.
 * Both raise hands to fire a NOVA when charged. A downed partner is revived by holding hands up.
 */
type ZKind = 'walker' | 'crawler' | 'spitter' | 'boss';

interface Zombie {
  kind: ZKind;
  x: number;
  side: -1 | 1; // came from the left (-1) or right (1)
  speed: number;
  hp: number;
  max: number;
  target: number;
  attackT: number;
  spitT: number;
  hitT: number;
  dead: boolean;
}

const WAVES: { walkers: number; crawlers: number; spitters: number; speed: number; boss?: boolean; elite?: boolean }[] = [
  { walkers: 6, crawlers: 0, spitters: 0, speed: 60 },
  { walkers: 7, crawlers: 3, spitters: 0, speed: 70 },
  { walkers: 8, crawlers: 3, spitters: 2, speed: 78 },
  { walkers: 10, crawlers: 4, spitters: 3, speed: 95, elite: true },
  { walkers: 4, crawlers: 2, spitters: 1, speed: 80, boss: true },
];

const factory: GameFactory = (ctx) => {
  const hp = [100, 100];
  const down = [false, false];
  const revive = [0, 0];
  const kills = [0, 0];
  const spit = new HazardField();
  let zombies: Zombie[] = [];
  let queue: ZKind[] = [];
  let wave = 0;
  let spawnT = 0;
  let nova = 0;
  let time = 0;
  let pause = 2;
  let finished = false;
  const groundY = () => ctx.height * 0.62;

  const startWave = () => {
    wave++;
    if (wave > WAVES.length) return end(true);
    const w = WAVES[wave - 1];
    queue = ctx.rng.shuffle([...Array(w.walkers).fill('walker'), ...Array(w.crawlers).fill('crawler'), ...Array(w.spitters).fill('spitter')] as ZKind[]);
    if (w.boss) queue.push('boss');
    ctx.banner(w.boss ? tx(ctx, 'boss') : w.elite ? tx(ctx, 'elite') : tx(ctx, 'wave', { n: wave }), undefined, 1.6);
    ctx.audio.music.play(w.boss ? 'boss' : 'tension');
  };

  const spawn = (kind: ZKind) => {
    const w = WAVES[wave - 1];
    const side = ctx.rng.chance(0.5) ? -1 : 1;
    const alive = [0, 1].filter((i) => !down[i]);
    const target = side === -1 ? (alive.includes(0) ? 0 : 1) : alive.includes(1) ? 1 : 0;
    const base = kind === 'boss' ? 40 : kind === 'crawler' ? w.speed * 0.8 : kind === 'spitter' ? w.speed * 0.6 : w.speed;
    const hpMax = kind === 'boss' ? 30 : kind === 'walker' ? (w.elite ? 3 : 2) : 1;
    zombies.push({ kind, x: side === -1 ? -60 : ctx.width + 60, side, speed: base * (ctx.width / 1280), hp: hpMax, max: hpMax, target, attackT: 0, spitT: 2.5, hitT: 0, dead: false });
  };

  const end = (win: boolean) => {
    if (finished) return;
    finished = true;
    ctx.audio.music.stop(300);
    const pct = win ? 100 : ((wave - 1) / WAVES.length) * 100;
    ctx.end(
      coopResult(ctx, pct, {
        big: String(kills[0] + kills[1]),
        headline: win ? L(ctx, 'YOU SURVIVED!', 'KALIAN SELAMAT!') : L(ctx, 'OVERRUN…', 'TERKEPUNG…'),
        subline: win ? L(ctx, 'Unbeatable duo!', 'Duo tak terkalahkan!') : L(ctx, 'Rematch and hold the line!', 'Rematch dan bertahan lebih lama!'),
        stats: [
          { label: tx(ctx, 'statKills'), values: kills.map(String) },
          { label: tx(ctx, 'statWaves'), values: [String(win ? WAVES.length : wave - 1)] },
        ],
        shareLine: L(ctx, `WE SURVIVED ${win ? 'THE BOSS' : `WAVE ${wave - 1}`} 🧟`, `KAMI BERTAHAN ${win ? 'SAMPAI BOS' : `GELOMBANG ${wave - 1}`} 🧟`),
      }),
    );
  };

  const damageZombie = (z: Zombie, dmg: number, by: number) => {
    z.hp -= dmg;
    z.hitT = 0.25;
    ctx.fx.burst(z.x, groundY(), ['#8bc34a', '#386641'], 10);
    if (z.hp <= 0) {
      z.dead = true;
      kills[by]++;
      nova = Math.min(1, nova + (z.kind === 'boss' ? 0 : 0.1));
      ctx.audio.play('splat');
      if (z.kind === 'boss') ctx.fx.confetti(ctx.width, 120);
    } else ctx.audio.play('punch');
  };

  return {
    view: { camera: 'dim', dim: 0.35, skeleton: true },
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
      if (pause > 0) {
        pause -= dt;
        if (pause <= 0) startWave();
        return;
      }
      spawnT -= dt;
      if (queue.length && spawnT <= 0) {
        spawn(queue.shift()!);
        spawnT = Math.max(0.6, 2 - wave * 0.25);
      }
      // Player actions
      for (let i = 0; i < 2; i++) {
        const inp = ctx.input(i);
        if (down[i]) continue;
        const reach = Math.max(120, inp.torsoPx * 1.7);
        const punch = inp.has('PUNCH_LEFT') ? -1 : inp.has('PUNCH_RIGHT') ? 1 : 0;
        const kick = inp.any('KICK_LEFT', 'KICK_RIGHT') || (punch !== 0 && inp.state.squatting);
        if (punch || kick) {
          const cands = zombies
            .filter((z) => !z.dead && Math.abs(z.x - inp.center.x) < reach)
            .filter((z) => (kick ? z.kind === 'crawler' || z.kind === 'boss' : z.kind !== 'crawler'))
            .filter((z) => kick || Math.sign(z.x - inp.center.x) === punch || Math.abs(z.x - inp.center.x) < reach * 0.35)
            .sort((a, b) => Math.abs(a.x - inp.center.x) - Math.abs(b.x - inp.center.x));
          if (cands[0]) damageZombie(cands[0], 1, i);
        }
      }
      // NOVA
      if (nova >= 1 && [0, 1].every((i) => down[i] || ctx.input(i).state.handsUp)) {
        nova = 0;
        ctx.audio.play('explosion');
        ctx.fx.flash('#b3ff9e', 0.6);
        ctx.fx.shake(14, 0.5);
        ctx.banner(tx(ctx, 'nova'), undefined, 1);
        for (const z of zombies) if (!z.dead) damageZombie(z, z.kind === 'boss' ? 8 : 99, ctx.rng.chance(0.5) ? 0 : 1);
      }
      // Revive
      for (let i = 0; i < 2; i++) {
        if (!down[i]) continue;
        const partner = 1 - i;
        if (!down[partner] && ctx.input(partner).state.handsUp) revive[i] += dt;
        else revive[i] = Math.max(0, revive[i] - dt * 0.5);
        if (revive[i] >= 2) {
          down[i] = false;
          hp[i] = 50;
          revive[i] = 0;
          ctx.audio.play('powerup');
          ctx.fx.text(tx(ctx, 'revive'), ctx.input(i).head.x, ctx.input(i).head.y - 80, C.good, 40);
        }
      }
      // Zombies move & attack
      for (const z of zombies) {
        if (z.dead) continue;
        z.hitT = Math.max(0, z.hitT - dt);
        if (down[z.target] && !down[1 - z.target]) z.target = 1 - z.target;
        const tgt = ctx.input(z.target);
        const dist = tgt.center.x - z.x;
        const stop = z.kind === 'spitter' ? Math.max(200, tgt.torsoPx * 3) : Math.max(60, tgt.torsoPx * 0.6);
        if (Math.abs(dist) > stop) z.x += Math.sign(dist) * z.speed * dt * (z.hitT > 0 ? 0.3 : 1);
        else if (z.kind === 'spitter') {
          z.spitT -= dt;
          if (z.spitT <= 0 && !down[z.target]) {
            z.spitT = 3;
            spit.add({ kind: 'body', owner: z.target, t: 1.1, warn: 1.1, x: tgt.center.x, y: tgt.center.y, from: z.side, style: 'ball', width: 50 });
            ctx.audio.play('splat', { volume: 0.4 });
          }
        } else {
          z.attackT -= dt;
          if (z.attackT <= 0 && !down[z.target]) {
            z.attackT = z.kind === 'boss' ? 1.2 : 1.4;
            hp[z.target] -= z.kind === 'boss' ? 18 : 8;
            ctx.audio.play('hit', { volume: 0.6 });
            ctx.fx.flash('#ff2a2a', 0.18);
          }
        }
      }
      for (const r of spit.update(dt, ctx.input)) {
        if (r.hit && !down[r.hazard.owner]) {
          hp[r.hazard.owner] -= 12;
          ctx.audio.play('splat');
        }
      }
      for (let i = 0; i < 2; i++) {
        if (!down[i] && hp[i] <= 0) {
          down[i] = true;
          hp[i] = 0;
          ctx.audio.play('lose');
          ctx.fx.text(tx(ctx, 'down'), ctx.input(i).head.x, ctx.input(i).head.y - 80, C.bad, 44);
        }
      }
      zombies = zombies.filter((z) => !z.dead);
      if (down[0] && down[1]) return end(false);
      if (!queue.length && !zombies.length) {
        pause = 2.5;
        ctx.audio.play('success');
      }
    },
    render(g) {
      spit.render(g, (o) => ctx.zone(o), ctx.height);
      for (const z of zombies) {
        const size = z.kind === 'boss' ? 220 : z.kind === 'crawler' ? 80 : 120;
        const y = z.kind === 'crawler' ? ctx.height * 0.84 : z.kind === 'boss' ? groundY() - 30 : groundY();
        const wob = Math.sin(time * 8 + z.x) * 4;
        emoji(g, '🧟', z.x, y + wob, size, z.hitT > 0 ? 0.6 : 1);
        if (z.kind === 'spitter') emoji(g, '🔥', z.x, y - size * 0.55, 30);
        if (z.max > 1) bar(g, z.x - size * 0.35, y - size * 0.62, size * 0.7, 8, z.hp / z.max, C.bad);
      }
      for (let i = 0; i < 2; i++) {
        const inp = ctx.input(i);
        const z = ctx.zone(i);
        bar(g, z.x + 20, 30, z.w - 40, 18, hp[i] / 100, ctx.players[i].color);
        text(g, ctx.players[i].name, z.x + 24, 62, { size: 18, align: 'left', color: ctx.players[i].color });
        if (down[i]) {
          bubble(g, inp, `${tx(ctx, 'down')} ${Math.round((revive[i] / 2) * 100)}%`, C.bad);
          text(g, L(ctx, `${ctx.players[1 - i].name}: hold hands up to revive!`, `${ctx.players[1 - i].name}: angkat tangan untuk menghidupkan!`), ctx.width / 2, ctx.height * 0.3, { size: 26, color: C.warn });
        }
      }
      bar(g, ctx.width / 2 - 150, 84, 300, 14, nova, nova >= 1 ? C.gold : '#9be15d');
      text(g, nova >= 1 ? tx(ctx, 'novaReady') : 'NOVA', ctx.width / 2, 112, { size: nova >= 1 ? 20 : 14, color: nova >= 1 ? C.gold : C.ink });
      text(g, wave > 0 ? tx(ctx, 'wave', { n: Math.min(wave, WAVES.length) }) : '', ctx.width / 2, 30, { size: 22 });
    },
    inspect: () => ({ wave, zombies: zombies.length, hp: [...hp], down: [...down] }),
  };
};

export default factory;
