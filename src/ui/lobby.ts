import type { BodyIssue } from '../core/calibration/Calibration';
import { clamp } from '../core/math';
import type { MotionSession } from '../core/session/MotionSession';
import { SIM_ASPECT } from '../core/tracking/SimulatedProvider';
import { C, PLAYER_COLORS, circle, panel, playerTag, progressRing, skeleton, text } from '../engine/draw';
import { InputHub } from '../engine/input';
import { StageMapper, playerZones } from '../engine/stage';

export interface LobbyStatus {
  detected: number;
  ready: boolean[];
  calibrating: number[];
  issues: BodyIssue[][];
  lowLight: boolean;
  extra: number;
  startProgress: number;
  fullBody: boolean;
}

const HOLD_TO_START = 1.2;

/**
 * Lobby overlay on the live camera: per-player zones, skeletons, calibration progress rings and
 * the "raise both hands to start" gesture.
 */
export class LobbyView {
  readonly canvas: HTMLCanvasElement;
  readonly mapper = new StageMapper();
  private g: CanvasRenderingContext2D;
  private hub: InputHub;
  private raf = 0;
  private dpr = 1;
  private ro: ResizeObserver;
  private holdT = 0;
  private last = performance.now();
  status: LobbyStatus;
  onStatus: ((s: LobbyStatus) => void) | null = null;
  onGestureStart: (() => void) | null = null;
  gestures = true;
  names: string[] = [];
  lang: 'en' | 'id' = 'en';

  constructor(
    private container: HTMLElement,
    private session: MotionSession,
    private count: number,
  ) {
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'stage-canvas';
    this.canvas.setAttribute('aria-hidden', 'true');
    container.appendChild(this.canvas);
    this.g = this.canvas.getContext('2d')!;
    this.hub = new InputHub(session, this.mapper);
    this.status = this.computeStatus();
    this.resize();
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(container);
    this.raf = requestAnimationFrame(this.loop);
  }

  private resize(): void {
    const r = this.container.getBoundingClientRect();
    const w = Math.max(320, Math.round(r.width));
    const h = Math.max(240, Math.round(r.height));
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.canvas.width = Math.round(w * this.dpr);
    this.canvas.height = Math.round(h * this.dpr);
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;
    this.mapper.set(w, h, this.session.mode === 'camera' ? this.session.camera.aspect : SIM_ASPECT);
  }

  destroy(): void {
    cancelAnimationFrame(this.raf);
    this.ro.disconnect();
    this.canvas.remove();
  }

  private computeStatus(): LobbyStatus {
    const n = this.count;
    const ready: boolean[] = [];
    const calibrating: number[] = [];
    const issues: BodyIssue[][] = [];
    let detected = 0;
    let fullBody = true;
    for (let i = 0; i < n; i++) {
      const p = this.session.players[i];
      const present = this.session.health(i) !== 'lost';
      if (present) detected++;
      ready.push(this.session.isReady(i));
      calibrating.push(present ? p.calibration.progress : 0);
      issues.push(present ? p.issues : []);
      if (present && p.issues.some((x) => x === 'feet-hidden' || x === 'hips-hidden')) fullBody = false;
    }
    return {
      detected,
      ready,
      calibrating,
      issues,
      lowLight: this.session.mode === 'camera' && this.session.brightness !== null && this.session.brightness < 0.17,
      extra: this.session.tracker.extraPeople,
      startProgress: clamp(this.holdT / HOLD_TO_START, 0, 1),
      fullBody: fullBody && detected === n,
    };
  }

  private loop = (now: number) => {
    this.raf = requestAnimationFrame(this.loop);
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    this.hub.frame(this.count, now, true);
    const allReady = this.session.allReady();
    let allUp = allReady && this.gestures;
    for (let i = 0; i < this.count && allUp; i++) if (!this.session.state(i).handsUp) allUp = false;
    this.holdT = allUp ? this.holdT + dt : Math.max(0, this.holdT - dt * 2);
    if (this.holdT >= HOLD_TO_START) {
      this.holdT = 0;
      this.onGestureStart?.();
    }
    this.status = this.computeStatus();
    this.onStatus?.(this.status);
    this.render();
  };

  private render(): void {
    const g = this.g;
    const w = this.mapper.width;
    const h = this.mapper.height;
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    g.clearRect(0, 0, w, h);
    const sim = this.session.mode !== 'camera';
    if (sim) {
      const grad = g.createLinearGradient(0, 0, 0, h);
      grad.addColorStop(0, '#2a1760');
      grad.addColorStop(1, '#0e0824');
      g.fillStyle = grad;
      g.fillRect(0, 0, w, h);
    } else {
      g.fillStyle = 'rgba(20,10,40,0.18)';
      g.fillRect(0, 0, w, h);
    }
    const zones = playerZones(w, h, this.count);
    // Zone dividers
    if (this.count > 1) {
      g.setLineDash([10, 12]);
      g.lineWidth = 2;
      g.strokeStyle = 'rgba(255,255,255,0.35)';
      for (let i = 1; i < this.count; i++) {
        g.beginPath();
        g.moveTo(zones[i].x, 20);
        g.lineTo(zones[i].x, h - 20);
        g.stroke();
      }
      g.setLineDash([]);
    }
    for (let i = 0; i < this.count; i++) {
      const z = zones[i];
      const color = PLAYER_COLORS[i];
      const name = this.names[i] ?? `Player ${i + 1}`;
      const present = this.session.health(i) !== 'lost';
      if (!present) {
        // Silhouette guide
        const cx = z.x + z.w / 2;
        const hh = Math.min(h * 0.62, z.w * 1.4);
        const top = h * 0.2;
        g.globalAlpha = 0.55 + 0.25 * Math.sin(performance.now() / 300);
        g.setLineDash([8, 8]);
        g.strokeStyle = color;
        g.lineWidth = 4;
        circle(g, cx, top + hh * 0.08, hh * 0.08, undefined, color, 4);
        g.beginPath();
        g.moveTo(cx, top + hh * 0.17);
        g.lineTo(cx, top + hh * 0.55);
        g.moveTo(cx - hh * 0.2, top + hh * 0.3);
        g.lineTo(cx + hh * 0.2, top + hh * 0.3);
        g.moveTo(cx, top + hh * 0.55);
        g.lineTo(cx - hh * 0.12, top + hh);
        g.moveTo(cx, top + hh * 0.55);
        g.lineTo(cx + hh * 0.12, top + hh);
        g.stroke();
        g.setLineDash([]);
        g.globalAlpha = 1;
        playerTag(g, name, cx, top - 24, color);
        continue;
      }
      const inp = this.hub.get(i);
      skeleton(g, inp, color, sim, 0.95);
      const tagY = inp.head.y - inp.headRadius * 2.4;
      playerTag(g, name, inp.head.x, tagY, color);
      const p = this.session.players[i].calibration;
      const ry = tagY - 46;
      if (p.done) {
        circle(g, inp.head.x, ry, 20, C.good);
        text(g, '✓', inp.head.x, ry + 1, { size: 24, color: '#140b2e', stroke: 0, weight: 800 });
      } else {
        circle(g, inp.head.x, ry, 22, 'rgba(20,10,40,0.6)');
        progressRing(g, inp.head.x, ry, 20, p.progress, color, 6);
      }
    }
    // Hold-to-start meter
    if (this.holdT > 0) {
      const u = clamp(this.holdT / HOLD_TO_START, 0, 1);
      panel(g, w / 2 - 160, h * 0.12, 320, 60, { fill: 'rgba(20,10,40,0.8)', r: 30 });
      text(g, this.lang === 'id' ? 'MULAI…' : 'STARTING…', w / 2, h * 0.12 + 22, { size: 20, stroke: 0 });
      g.fillStyle = C.good;
      g.fillRect(w / 2 - 130, h * 0.12 + 42, 260 * u, 6);
    }
  }
}
