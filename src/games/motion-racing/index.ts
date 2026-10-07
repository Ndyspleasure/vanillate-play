import type { Rect } from '../../core/math';
import { clamp, formatDuration, lerp } from '../../core/math';
import { bar, C, emoji, panel, roundRect, text } from '../../engine/draw';
import { soloResult, versusResult } from '../../engine/hud';
import type { GameFactory, PlayerInput } from '../../engine/types';
import { L, tx } from '../kits/text';

/**
 * Motion Racing (GAMES.md 6.32) — your body is the steering wheel. Lean to steer, both hands up
 * for NITRO, lean + squat to DRIFT (charges nitro), boost zones on the road. 3 laps vs AI cars;
 * versus = split screen.
 */
const LAP = 1400;
const LAPS = 3;
const SEG = 6;
const DRAW = 90;

const curve = (z: number) => Math.sin(z / 170) * 0.9 + Math.sin(z / 61) * 0.35;
const isBoostZone = (z: number) => ((z % LAP) + LAP) % LAP > 600 && ((z % LAP) + LAP) % LAP < 640;

interface Car {
  z: number;
  x: number;
  speed: number;
  nitro: number;
  nitroT: number;
  drift: boolean;
  finished: boolean;
  time: number;
  color: string;
  ai: boolean;
  bump: number;
}

const factory: GameFactory = (ctx) => {
  const humans = ctx.players.length;
  const aiColors = ['#e0e0ff', '#ffb020', '#06d6a0'];
  const cars: Car[] = [];
  for (let i = 0; i < humans; i++) cars.push({ z: 0, x: i === 0 ? -0.35 : 0.35, speed: 0, nitro: 1, nitroT: 0, drift: false, finished: false, time: 0, color: ctx.players[i].color, ai: false, bump: 0 });
  const aiCount = humans === 1 ? 3 : 2;
  for (let k = 0; k < aiCount; k++) cars.push({ z: 20 + k * 25, x: [-0.5, 0.5, 0][k], speed: 0, nitro: 0, nitroT: 0, drift: false, finished: false, time: 0, color: aiColors[k], ai: true, bump: 0 });
  const total = LAP * LAPS;
  let time = 0;
  let finished = false;
  const order: number[] = [];

  const steerFrom = (inp: PlayerInput) => clamp(inp.state.lean * 2.2 + inp.state.offsetX * 0.6, -1, 1);

  const finish = () => {
    if (finished) return;
    finished = true;
    const place = (i: number) => {
      const sorted = cars.map((c, k) => ({ c, k })).sort((a, b) => (a.c.finished && b.c.finished ? a.c.time - b.c.time : b.c.z - a.c.z));
      return sorted.findIndex((s) => s.k === i) + 1;
    };
    const stats = [
      { label: tx(ctx, 'statLapTime'), values: cars.slice(0, humans).map((c) => (c.finished ? formatDuration(c.time) : 'DNF')) },
      { label: tx(ctx, 'statPlace'), values: cars.slice(0, humans).map((_c, i) => `#${place(i)} / ${cars.length}`) },
    ];
    if (humans === 1) {
      const c = cars[0];
      ctx.end(
        soloResult(ctx, c.finished ? Math.round(c.time * 10) / 10 : 999, {
          display: `#${place(0)}`,
          headline: place(0) === 1 ? tx(ctx, 'youWin') : `${L(ctx, 'FINISHED', 'FINIS')} #${place(0)}`,
          subline: c.finished ? formatDuration(c.time) : 'DNF',
          stats,
          lowerIsBetter: true,
          recordLabel: tx(ctx, 'statLapTime'),
        }),
      );
    } else ctx.end(versusResult(ctx, cars.slice(0, humans).map((c) => (c.finished ? c.time : 999)), { lowerIsBetter: true, display: (v) => (v >= 999 ? 'DNF' : formatDuration(v)), stats }));
  };

  return {
    view: { camera: 'pip', skeleton: false },
    update(dt) {
      if (finished) return;
      time += dt;
      cars.forEach((c, i) => {
        if (c.finished) {
          c.speed = lerp(c.speed, 0, 0.02);
          return;
        }
        let steer = 0;
        let maxSpeed = 62;
        if (c.ai) {
          const look = curve(c.z + 30);
          steer = clamp((look * 0.55 - c.x) * 1.6 + Math.sin(time + i) * 0.1, -1, 1);
          maxSpeed = 54 + i * 1.5;
        } else {
          const inp = ctx.input(i);
          steer = steerFrom(inp);
          c.drift = Math.abs(inp.state.lean) > 0.18 && (inp.state.squatting || inp.state.drop > 0.2);
          if (c.drift) c.nitro = Math.min(1, c.nitro + dt * 0.12);
          if (inp.has('HANDS_UP') && c.nitro >= 0.34 && c.nitroT <= 0) {
            c.nitroT = 2;
            c.nitro -= 0.34;
            ctx.audio.play('powerup');
            ctx.fx.text(tx(ctx, 'nitro'), ctx.width / (humans * 2) + (i * ctx.width) / humans, ctx.height * 0.4, C.gold, 44);
          }
        }
        c.nitroT = Math.max(0, c.nitroT - dt);
        c.bump = Math.max(0, c.bump - dt);
        const offroad = Math.abs(c.x) > 1.05;
        let target = maxSpeed + (c.nitroT > 0 ? 22 : 0) + (isBoostZone(c.z) ? 15 : 0);
        if (offroad) target = 22;
        if (c.bump > 0) target *= 0.5;
        c.speed = lerp(c.speed, target, 1 - Math.exp(-dt / (target > c.speed ? 1.6 : 0.5)));
        const grip = c.drift ? 1.6 : 1;
        c.x += (steer * 0.9 * grip - curve(c.z) * 0.55) * (c.speed / 60) * dt * 1.4;
        c.x = clamp(c.x, -1.6, 1.6);
        c.z += c.speed * dt;
        if (c.z >= total) {
          c.finished = true;
          c.time = time;
          order.push(i);
          if (!c.ai) ctx.audio.play(order.length === 1 ? 'cheer' : 'success');
        }
      });
      // Bumps between cars
      for (let a = 0; a < cars.length; a++)
        for (let b = a + 1; b < cars.length; b++) {
          const A = cars[a];
          const B = cars[b];
          if (Math.abs(A.z - B.z) < 4 && Math.abs(A.x - B.x) < 0.32) {
            const back = A.z < B.z ? A : B;
            if (back.bump <= 0) {
              back.bump = 0.6;
              if (!back.ai) ctx.audio.play('thud');
            }
            const push = A.x < B.x ? -0.04 : 0.04;
            A.x += push;
            B.x -= push;
          }
        }
      const humansDone = cars.slice(0, humans).every((c) => c.finished);
      if (humansDone || time > 240) finish();
    },
    renderBackground(g) {
      g.fillStyle = '#120a2c';
      g.fillRect(0, 0, ctx.width, ctx.height);
    },
    render(g) {
      const pad = 10;
      const w = (ctx.width - pad * (humans + 1)) / humans;
      for (let i = 0; i < humans; i++) {
        const r: Rect = { x: pad + i * (w + pad), y: pad, w, h: ctx.height - pad * 2 };
        drawView(g, r, cars, i, time);
        const c = cars[i];
        const lap = Math.min(LAPS, Math.floor(c.z / LAP) + 1);
        panel(g, r.x + 10, r.y + 10, 220, 74, { fill: 'rgba(20,10,40,0.75)', r: 14 });
        text(g, `${ctx.players[i].name}`, r.x + 22, r.y + 30, { size: 16, align: 'left', color: c.color, stroke: 0 });
        text(g, tx(ctx, 'lap', { n: lap, m: LAPS }), r.x + 22, r.y + 58, { size: 22, align: 'left', stroke: 0 });
        text(g, `${Math.round(c.speed * 3.2)} km/h`, r.x + r.w - 20, r.y + 34, { size: 24, align: 'right' });
        bar(g, r.x + r.w - 170, r.y + 54, 150, 12, c.nitro, C.gold);
        text(g, 'NITRO', r.x + r.w - 178, r.y + 60, { size: 12, align: 'right', stroke: 0 });
        if (c.drift) text(g, tx(ctx, 'drift'), r.x + r.w / 2, r.y + r.h * 0.3, { size: 34, color: '#3dd6ff' });
        if (c.finished) text(g, `${tx(ctx, 'finish')} ${formatDuration(c.time)}`, r.x + r.w / 2, r.y + r.h * 0.4, { size: 40, color: C.gold });
        const place = cars.filter((o) => o.z > c.z).length + 1;
        text(g, `#${place}`, r.x + r.w / 2, r.y + 40, { size: 40, color: C.vanilla });
      }
    },
    inspect: () => ({ z: cars.map((c) => c.z), x: cars.map((c) => c.x) }),
  };

  function drawView(g: CanvasRenderingContext2D, r: Rect, all: Car[], me: number, t: number): void {
    const car = all[me];
    g.save();
    roundRect(g, r.x, r.y, r.w, r.h, 16);
    g.clip();
    const horizon = r.y + r.h * 0.42;
    const sky = g.createLinearGradient(0, r.y, 0, horizon);
    sky.addColorStop(0, '#3a0ca3');
    sky.addColorStop(1, '#ff8fab');
    g.fillStyle = sky;
    g.fillRect(r.x, r.y, r.w, horizon - r.y);
    // Mountains parallax
    g.fillStyle = '#5a189a';
    g.beginPath();
    g.moveTo(r.x, horizon);
    for (let k = 0; k <= 12; k++) g.lineTo(r.x + (r.w * k) / 12, horizon - 30 - Math.abs(Math.sin(k * 1.7 + curve(car.z) * 0.6)) * r.h * 0.12);
    g.lineTo(r.x + r.w, horizon);
    g.fill();
    g.fillStyle = '#2d6a4f';
    g.fillRect(r.x, horizon, r.w, r.y + r.h - horizon);
    const camH = 1.2;
    const D = 0.85;
    let dx = 0;
    let xOff = 0;
    const base = Math.floor(car.z / SEG);
    const pts: { x: number; y: number; w: number; z: number }[] = [];
    for (let k = 0; k < DRAW; k++) {
      const z = (base + k) * SEG;
      const rel = z - car.z + 0.1;
      xOff += dx;
      dx += curve(z) * 0.012;
      const s = D / Math.max(0.05, rel / 18);
      const y = horizon + camH * s * r.h * 0.08;
      const x = r.x + r.w / 2 + (xOff - car.x * 1.2) * s * r.w * 0.06;
      pts.push({ x, y, w: s * r.w * 0.09, z });
    }
    for (let k = DRAW - 1; k > 0; k--) {
      const a = pts[k];
      const b = pts[k - 1];
      if (b.y < horizon) continue;
      const odd = Math.floor(a.z / (SEG * 2)) % 2 === 0;
      g.fillStyle = odd ? '#40916c' : '#2d6a4f';
      g.fillRect(r.x, a.y, r.w, b.y - a.y + 1);
      const quad = (wa: number, wb: number, col: string) => {
        g.fillStyle = col;
        g.beginPath();
        g.moveTo(a.x - wa, a.y);
        g.lineTo(a.x + wa, a.y);
        g.lineTo(b.x + wb, b.y);
        g.lineTo(b.x - wb, b.y);
        g.fill();
      };
      quad(a.w * 1.15, b.w * 1.15, odd ? '#fff' : '#e63946');
      quad(a.w, b.w, isBoostZone(a.z) ? '#3dd6ff' : odd ? '#4a4e69' : '#565a7a');
      if (odd) quad(a.w * 0.04, b.w * 0.04, '#fff7e8');
    }
    // Other cars, far to near
    const others = all.map((c, k) => ({ c, k })).filter(({ k }) => k !== me).sort((a, b) => b.c.z - a.c.z);
    for (const { c } of others) {
      const rel = c.z - car.z;
      if (rel < 1 || rel > DRAW * SEG * 0.8) continue;
      const k = Math.floor(rel / SEG);
      const p = pts[Math.min(pts.length - 1, k)];
      const size = p.w * 0.9;
      emoji(g, 'carBack', p.x + c.x * p.w * 0.9, p.y - size * 0.35, size, 1, c.color);
    }
    // Player car
    const tilt = clamp(-curve(car.z) * 0.08, -0.2, 0.2);
    const cx = r.x + r.w / 2;
    const cy = r.y + r.h * 0.86;
    const size = Math.min(r.w * 0.36, r.h * 0.3);
    g.save();
    g.translate(cx, cy);
    g.rotate(tilt + (car.drift ? Math.sin(t * 20) * 0.04 : 0));
    emoji(g, 'carBack', 0, 0, size, 1, car.color);
    g.restore();
    if (car.nitroT > 0) emoji(g, '🔥', cx, cy + size * 0.35, size * 0.4);
    g.restore();
    roundRect(g, r.x, r.y, r.w, r.h, 16);
    g.lineWidth = 4;
    g.strokeStyle = car.color;
    g.stroke();
  }
};

export default factory;
