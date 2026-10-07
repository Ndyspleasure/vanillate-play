import type { Rect } from '../../core/math';
import { clamp, lerp } from '../../core/math';
import { C, emoji, panel, roundRect, text } from '../../engine/draw';
import type { Rng } from '../../engine/rng';
import type { PlayerInput } from '../../engine/types';

/**
 * Lane-runner kit: a seeded obstacle track (identical for every racer = fair races), runner physics
 * driven by semantic motion events, and a pseudo-3D renderer for one runner panel.
 */

export type ObstacleKind = 'hurdle' | 'bar' | 'cone' | 'coin' | 'boost' | 'zone';

export interface Obstacle {
  z: number;
  lane: number; // -1 = all lanes
  kind: ObstacleKind;
  /** Moving cones slide between lanes. */
  moving?: boolean;
}

export const LANES = 3;
const VIEW = 70; // meters visible ahead
const D = 9; // perspective constant

export function buildTrack(rng: Rng, length: number, density = 1, start = 30): Obstacle[] {
  const out: Obstacle[] = [];
  let z = start;
  while (z < length - 10) {
    const r = rng.next();
    if (r < 0.28) out.push({ z, lane: -1, kind: 'hurdle' });
    else if (r < 0.48) out.push({ z, lane: -1, kind: 'bar' });
    else if (r < 0.8) {
      const free = rng.int(0, 2);
      for (let l = 0; l < LANES; l++) if (l !== free) out.push({ z, lane: l, kind: 'cone', moving: rng.chance(0.15) && l !== 1 });
      out.push({ z, lane: free, kind: 'coin' });
    } else if (r < 0.9) out.push({ z, lane: rng.int(0, 2), kind: 'boost' });
    else out.push({ z, lane: -1, kind: 'zone' });
    for (let k = 1; k <= 3; k++) if (rng.chance(0.4)) out.push({ z: z + k * 3, lane: rng.int(0, 2), kind: 'coin' });
    z += rng.range(16, 26) / density;
  }
  return out;
}

export class Runner {
  lane = 1;
  x = 1;
  z = 0;
  speed = 8;
  jumpT = -1;
  slideT = -1;
  stumble = 0;
  boost = 0;
  coins = 0;
  hits = 0;
  energy = 0;
  finished = false;
  finishTime = 0;
  /** Index of the next obstacle to check. */
  private cursor = 0;
  baseSpeed = 8.5;
  maxSpeed = 15;

  get airborne(): boolean {
    return this.jumpT >= 0;
  }

  get sliding(): boolean {
    return this.slideT >= 0;
  }

  /** Apply player motion events. */
  control(inp: PlayerInput): void {
    if (inp.any('MOVE_LEFT', 'LEAN_LEFT', 'STEP_LEFT', 'DODGE_LEFT')) this.lane = clamp(this.lane - 1, 0, LANES - 1);
    if (inp.any('MOVE_RIGHT', 'LEAN_RIGHT', 'STEP_RIGHT', 'DODGE_RIGHT')) this.lane = clamp(this.lane + 1, 0, LANES - 1);
    if (inp.has('JUMP') && this.jumpT < 0) this.jumpT = 0;
    if ((inp.any('SQUAT', 'DUCK') || inp.state.squatting) && this.slideT < 0 && this.jumpT < 0) this.slideT = 0;
    this.energy = inp.state.energy;
  }

  /** Advance; returns events for feedback. */
  update(dt: number, track: Obstacle[], time: number): ('hit' | 'coin' | 'boost' | 'jumped' | 'slid')[] {
    const ev: ('hit' | 'coin' | 'boost' | 'jumped' | 'slid')[] = [];
    this.x = lerp(this.x, this.lane, 1 - Math.exp(-dt / 0.09));
    if (this.jumpT >= 0 && (this.jumpT += dt) > 0.7) this.jumpT = -1;
    if (this.slideT >= 0 && (this.slideT += dt) > 0.75) this.slideT = -1;
    this.stumble = Math.max(0, this.stumble - dt);
    this.boost = Math.max(0, this.boost - dt);
    const runBonus = Math.min(this.energy, 2) * 1.6;
    let target = this.baseSpeed + runBonus + (this.boost > 0 ? 5 : 0);
    if (this.stumble > 0) target = 3;
    target = Math.min(target, this.maxSpeed + (this.boost > 0 ? 4 : 0));
    this.speed = lerp(this.speed, target, 1 - Math.exp(-dt / 0.5));
    const z0 = this.z;
    this.z += this.speed * dt;
    while (this.cursor < track.length && track[this.cursor].z < z0 - 1) this.cursor++;
    for (let i = this.cursor; i < track.length && track[i].z <= this.z; i++) {
      const o = track[i];
      if (o.z <= z0) continue;
      const lane = o.moving ? movingLane(o, time) : o.lane;
      const inLane = o.lane === -1 || Math.round(this.x) === lane;
      if (!inLane) continue;
      switch (o.kind) {
        case 'hurdle':
          if (this.airborne) ev.push('jumped');
          else this.crash(ev);
          break;
        case 'bar':
          if (this.sliding) ev.push('slid');
          else this.crash(ev);
          break;
        case 'cone':
          if (!this.airborne || this.jumpT < 0.12) this.crash(ev);
          break;
        case 'coin':
          this.coins++;
          ev.push('coin');
          break;
        case 'boost':
        case 'zone':
          this.boost = o.kind === 'zone' ? 1.2 : 2;
          ev.push('boost');
          break;
      }
    }
    return ev;
  }

  private crash(ev: ('hit' | 'coin' | 'boost' | 'jumped' | 'slid')[]): void {
    if (this.stumble > 0) return;
    this.stumble = 0.9;
    this.hits++;
    ev.push('hit');
  }
}

export function movingLane(o: Obstacle, time: number): number {
  return Math.round(1 + Math.sin(time * 1.6 + o.z) * 1);
}

const ART: Record<ObstacleKind, string> = { hurdle: 'hurdle', bar: 'bar', cone: 'cone', coin: 'coin', boost: 'boost', zone: 'boost' };

/** Render one runner's view into a rect. */
export function renderLane(
  g: CanvasRenderingContext2D,
  r: Rect,
  runner: Runner,
  track: Obstacle[],
  color: string,
  time: number,
  opts: { finish?: number; label?: string; curve?: number; ghost?: Runner | null } = {},
): void {
  g.save();
  roundRect(g, r.x, r.y, r.w, r.h, 18);
  g.clip();
  const horizon = r.y + r.h * 0.32;
  const sky = g.createLinearGradient(0, r.y, 0, horizon);
  sky.addColorStop(0, '#2a1760');
  sky.addColorStop(1, '#ff7ab8');
  g.fillStyle = sky;
  g.fillRect(r.x, r.y, r.w, horizon - r.y);
  g.fillStyle = '#1a6b3a';
  g.fillRect(r.x, horizon, r.w, r.y + r.h - horizon);
  const cx = r.x + r.w / 2;
  const bottom = r.y + r.h;
  const roadHalf = r.w * 0.42;
  const curve = opts.curve ?? Math.sin(runner.z / 90) * 0.8;
  const project = (z: number, lanePos: number) => {
    const s = D / (D + Math.max(0, z));
    const y = horizon + (bottom - horizon) * s;
    const bend = curve * (1 - s) * (1 - s) * r.w * 0.35;
    const x = cx + bend + (lanePos - 1) * (roadHalf * 2 / LANES) * s;
    return { x, y, s };
  };
  // Road stripes
  const stripe = 4;
  for (let i = Math.floor(runner.z / stripe) * stripe + VIEW; i >= runner.z - 2; i -= stripe) {
    const z0 = i - runner.z;
    const z1 = z0 + stripe;
    const a = project(Math.max(0, z0), -0.5);
    const b = project(Math.max(0, z0), 2.5);
    const c = project(z1, 2.5);
    const d = project(z1, -0.5);
    g.fillStyle = Math.floor(i / stripe) % 2 ? '#3b3f58' : '#454a66';
    g.beginPath();
    g.moveTo(a.x, a.y);
    g.lineTo(b.x, b.y);
    g.lineTo(c.x, c.y);
    g.lineTo(d.x, d.y);
    g.fill();
    if (Math.floor(i / stripe) % 2) {
      for (const l of [0.5, 1.5]) {
        const p = project(Math.max(0, z0), l);
        const q = project(z1, l);
        g.strokeStyle = 'rgba(255,255,255,0.6)';
        g.lineWidth = Math.max(1, 4 * p.s);
        g.beginPath();
        g.moveTo(p.x, p.y);
        g.lineTo(q.x, q.y);
        g.stroke();
      }
    }
  }
  if (opts.finish !== undefined && opts.finish - runner.z < VIEW) {
    const a = project(opts.finish - runner.z, -0.5);
    const b = project(opts.finish - runner.z, 2.5);
    const h = 14 * a.s + 3;
    for (let k = 0; k < 12; k++) {
      g.fillStyle = k % 2 ? '#fff' : '#140b2e';
      g.fillRect(a.x + ((b.x - a.x) * k) / 12, a.y - h, (b.x - a.x) / 12 + 1, h);
    }
  }
  // Obstacles far → near
  for (let i = track.length - 1; i >= 0; i--) {
    const o = track[i];
    const z = o.z - runner.z;
    if (z < -1 || z > VIEW) continue;
    const lanes = o.lane === -1 ? [1] : [o.moving ? movingLane(o, time) : o.lane];
    for (const l of lanes) {
      const p = project(z, l);
      const size = (o.lane === -1 && o.kind !== 'zone' ? roadHalf * 2.1 : roadHalf * 0.55) * p.s;
      if (o.kind === 'zone') {
        const a = project(z, -0.5);
        const b = project(z, 2.5);
        g.fillStyle = 'rgba(61,214,255,0.45)';
        g.fillRect(a.x, a.y - 6 * a.s, b.x - a.x, 12 * a.s + 2);
        continue;
      }
      if (o.kind === 'hurdle' || o.kind === 'bar') {
        const a = project(z, -0.5);
        const b = project(z, 2.5);
        const hh = (o.kind === 'bar' ? 70 : 26) * a.s;
        g.lineWidth = Math.max(2, 8 * a.s);
        g.strokeStyle = '#ddd';
        g.beginPath();
        g.moveTo(a.x, a.y);
        g.lineTo(a.x, a.y - hh - 10 * a.s);
        g.moveTo(b.x, b.y);
        g.lineTo(b.x, b.y - hh - 10 * a.s);
        g.stroke();
        g.fillStyle = o.kind === 'bar' ? C.gold : '#ff4d6d';
        g.fillRect(a.x, a.y - hh - 12 * a.s, b.x - a.x, 14 * a.s + 2);
        continue;
      }
      const bob = o.kind === 'coin' ? Math.sin(time * 6 + o.z) * 6 * p.s : 0;
      emoji(g, ART[o.kind], p.x, p.y - size * 0.45 + bob, size);
    }
  }
  // Ghost runner (AI / rival)
  if (opts.ghost) {
    const z = opts.ghost.z - runner.z;
    if (z > 0.5 && z < VIEW) {
      const p = project(z, opts.ghost.x);
      emoji(g, 'runner', p.x, p.y - 60 * p.s, 120 * p.s, 0.5, '#e0e0ff');
    }
  }
  // Runner
  const p = project(0.6, runner.x);
  const jump = runner.jumpT >= 0 ? Math.sin((runner.jumpT / 0.7) * Math.PI) * r.h * 0.18 : 0;
  const size = Math.min(r.w * 0.34, r.h * 0.3);
  g.fillStyle = 'rgba(0,0,0,0.3)';
  g.beginPath();
  g.ellipse(p.x, p.y - 4, size * 0.3, size * 0.08, 0, 0, Math.PI * 2);
  g.fill();
  const flicker = runner.stumble > 0 && Math.floor(time * 16) % 2 === 0;
  if (!flicker) {
    g.save();
    g.translate(p.x, p.y - size * 0.45 - jump);
    if (runner.sliding) g.scale(1.2, 0.55);
    emoji(g, 'runner', 0, 0, size, 1, color);
    g.restore();
  }
  if (runner.boost > 0) emoji(g, 'bolt', p.x + size * 0.4, p.y - size * 0.9 - jump, size * 0.35);
  g.restore();
  // Frame + label
  roundRect(g, r.x, r.y, r.w, r.h, 18);
  g.lineWidth = 4;
  g.strokeStyle = color;
  g.stroke();
  if (opts.label) {
    panel(g, r.x + 10, r.y + 10, Math.min(r.w - 20, 220), 34, { fill: 'rgba(20,10,40,0.75)', r: 12 });
    text(g, opts.label, r.x + 22, r.y + 28, { size: 17, align: 'left', color, stroke: 0, maxWidth: r.w - 40 });
  }
}
