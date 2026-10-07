import { easeOutBack, easeOutCubic } from '../core/math';

/** Lightweight visual effects with a quality budget (particle counts scale with device speed). */

export type FxQuality = 'low' | 'medium' | 'high';

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  size: number;
  color: string;
  gravity: number;
  shape: 'circle' | 'square' | 'star';
  spin: number;
  rot: number;
}

interface FloatText {
  text: string;
  x: number;
  y: number;
  color: string;
  size: number;
  life: number;
  max: number;
  rise: number;
}

interface Ring {
  x: number;
  y: number;
  r0: number;
  r1: number;
  life: number;
  max: number;
  color: string;
  width: number;
}

const QUALITY_MULT: Record<FxQuality, number> = { low: 0.3, medium: 0.65, high: 1 };

export class Fx {
  private particles: Particle[] = [];
  private texts: FloatText[] = [];
  private rings: Ring[] = [];
  quality: FxQuality = 'high';
  reducedMotion = false;
  shakeAmount = 0;
  private shakeTime = 0;
  flashColor = '#fff';
  flashAlpha = 0;
  private flashDecay = 4;

  clear(): void {
    this.particles.length = 0;
    this.texts.length = 0;
    this.rings.length = 0;
    this.shakeAmount = 0;
    this.flashAlpha = 0;
  }

  burst(
    x: number,
    y: number,
    color: string | string[],
    count = 16,
    opts: { speed?: number; size?: number; gravity?: number; life?: number; shape?: Particle['shape'] } = {},
  ): void {
    const n = Math.max(1, Math.round(count * QUALITY_MULT[this.quality]));
    const colors = Array.isArray(color) ? color : [color];
    const speed = opts.speed ?? 320;
    for (let i = 0; i < n && this.particles.length < 600; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = speed * (0.35 + Math.random() * 0.65);
      const life = (opts.life ?? 0.7) * (0.6 + Math.random() * 0.5);
      this.particles.push({
        x,
        y,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s,
        life,
        max: life,
        size: (opts.size ?? 6) * (0.6 + Math.random() * 0.8),
        color: colors[i % colors.length],
        gravity: opts.gravity ?? 500,
        shape: opts.shape ?? 'circle',
        spin: (Math.random() - 0.5) * 12,
        rot: Math.random() * Math.PI,
      });
    }
  }

  confetti(width: number, count = 120): void {
    const colors = ['#ff4d8d', '#3dd6ff', '#ffd23d', '#7dff6b', '#b98cff', '#ffffff'];
    const n = Math.round(count * QUALITY_MULT[this.quality]);
    for (let i = 0; i < n && this.particles.length < 700; i++) {
      const life = 2.2 + Math.random() * 1.5;
      this.particles.push({
        x: Math.random() * width,
        y: -20 - Math.random() * 200,
        vx: (Math.random() - 0.5) * 120,
        vy: 80 + Math.random() * 160,
        life,
        max: life,
        size: 6 + Math.random() * 6,
        color: colors[i % colors.length],
        gravity: 60,
        shape: 'square',
        spin: (Math.random() - 0.5) * 10,
        rot: Math.random() * Math.PI,
      });
    }
  }

  text(text: string, x: number, y: number, color = '#fff', size = 34, life = 0.9): void {
    this.texts.push({ text, x, y, color, size, life, max: life, rise: 70 });
    if (this.texts.length > 24) this.texts.shift();
  }

  ring(x: number, y: number, color: string, r0 = 10, r1 = 90, life = 0.45, width = 6): void {
    this.rings.push({ x, y, r0, r1, life, max: life, color, width });
  }

  shake(amount = 10, seconds = 0.3): void {
    if (this.reducedMotion) return;
    this.shakeAmount = Math.max(this.shakeAmount, amount);
    this.shakeTime = Math.max(this.shakeTime, seconds);
  }

  flash(color = '#fff', alpha = 0.5, decay = 4): void {
    this.flashColor = color;
    this.flashAlpha = this.reducedMotion ? alpha * 0.3 : alpha;
    this.flashDecay = decay;
  }

  update(dt: number): void {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= dt;
      if (p.life <= 0) {
        this.particles.splice(i, 1);
        continue;
      }
      p.vy += p.gravity * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += p.spin * dt;
    }
    for (let i = this.texts.length - 1; i >= 0; i--) {
      const t = this.texts[i];
      t.life -= dt;
      if (t.life <= 0) this.texts.splice(i, 1);
    }
    for (let i = this.rings.length - 1; i >= 0; i--) {
      const r = this.rings[i];
      r.life -= dt;
      if (r.life <= 0) this.rings.splice(i, 1);
    }
    if (this.shakeTime > 0) {
      this.shakeTime -= dt;
      if (this.shakeTime <= 0) this.shakeAmount = 0;
    }
    this.flashAlpha = Math.max(0, this.flashAlpha - dt * this.flashDecay);
  }

  shakeOffset(): { x: number; y: number } {
    if (this.shakeAmount <= 0) return { x: 0, y: 0 };
    return { x: (Math.random() - 0.5) * 2 * this.shakeAmount, y: (Math.random() - 0.5) * 2 * this.shakeAmount };
  }

  render(g: CanvasRenderingContext2D, width: number, height: number): void {
    for (const r of this.rings) {
      const u = 1 - r.life / r.max;
      g.globalAlpha = 1 - u;
      g.strokeStyle = r.color;
      g.lineWidth = r.width * (1 - u * 0.6);
      g.beginPath();
      g.arc(r.x, r.y, r.r0 + (r.r1 - r.r0) * easeOutCubic(u), 0, Math.PI * 2);
      g.stroke();
    }
    for (const p of this.particles) {
      g.globalAlpha = Math.min(1, (p.life / p.max) * 1.5);
      g.fillStyle = p.color;
      if (p.shape === 'circle') {
        g.beginPath();
        g.arc(p.x, p.y, p.size / 2, 0, Math.PI * 2);
        g.fill();
      } else {
        g.save();
        g.translate(p.x, p.y);
        g.rotate(p.rot);
        if (p.shape === 'square') g.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
        else drawStar(g, 0, 0, p.size / 2, p.size / 4.5, 5);
        g.restore();
      }
    }
    g.globalAlpha = 1;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    for (const t of this.texts) {
      const u = 1 - t.life / t.max;
      const scale = u < 0.2 ? easeOutBack(u / 0.2) : 1;
      g.globalAlpha = u > 0.7 ? (1 - u) / 0.3 : 1;
      g.font = `800 ${Math.round(t.size * scale)}px "Fredoka Variable", system-ui, sans-serif`;
      g.lineWidth = Math.max(3, t.size / 7);
      g.strokeStyle = 'rgba(20,10,40,0.85)';
      const y = t.y - t.rise * easeOutCubic(u);
      g.strokeText(t.text, t.x, y);
      g.fillStyle = t.color;
      g.fillText(t.text, t.x, y);
    }
    g.globalAlpha = 1;
    if (this.flashAlpha > 0) {
      g.globalAlpha = this.flashAlpha;
      g.fillStyle = this.flashColor;
      g.fillRect(0, 0, width, height);
      g.globalAlpha = 1;
    }
  }
}

export function drawStar(g: CanvasRenderingContext2D, x: number, y: number, r: number, inner: number, points: number): void {
  g.beginPath();
  for (let i = 0; i < points * 2; i++) {
    const rad = i % 2 === 0 ? r : inner;
    const a = (i * Math.PI) / points - Math.PI / 2;
    g.lineTo(x + Math.cos(a) * rad, y + Math.sin(a) * rad);
  }
  g.closePath();
  g.fill();
}
