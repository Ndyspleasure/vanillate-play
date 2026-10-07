import type { Point } from '../math';
import { LandmarkFilterBank } from '../tracking/filters';
import { LM, VISIBLE } from '../tracking/landmarks';
import type { DetectedPose, Landmark, PoseFrame } from '../tracking/types';

/**
 * Player identity tracking. Converts raw detections to mirrored "view space" and keeps a stable
 * Player 1..4 assignment across frames using motion prediction, body-size consistency and
 * per-player zones, with a grace period so a single missed frame never drops a player.
 *
 * View space: x in [0, aspect] (mirrored like a selfie view), y in [0, 1] (top → bottom).
 */

export interface TrackedPose {
  pts: Landmark[];
  /** World landmarks in meters, mirrored to match view space; null if unavailable. */
  world: Landmark[] | null;
  t: number;
}

export type SlotState = 'empty' | 'active' | 'grace' | 'lost';

export interface PlayerSlot {
  index: number;
  state: SlotState;
  pose: TrackedPose | null;
  center: Point;
  velocity: Point;
  scale: number;
  quality: number;
  firstSeen: number;
  lastSeen: number;
  /** True if this slot received a new pose in the most recent update. */
  fresh: boolean;
}

interface Measured {
  det: DetectedPose;
  view: Landmark[];
  world: Landmark[] | null;
  center: Point;
  scale: number;
  quality: number;
}

export const GRACE_MS = 1500;

const vis = (l: Landmark) => l.v >= VISIBLE;

export function toView(det: DetectedPose, aspect: number): { view: Landmark[]; world: Landmark[] | null } {
  const view = det.image.map((l) => ({ x: (1 - l.x) * aspect, y: l.y, z: l.z, v: l.v }));
  const world = det.world ? det.world.map((l) => ({ x: -l.x, y: l.y, z: l.z, v: l.v })) : null;
  return { view, world };
}

export function measure(view: Landmark[]): { center: Point; scale: number; quality: number } | null {
  const ls = view[LM.leftShoulder];
  const rs = view[LM.rightShoulder];
  const lh = view[LM.leftHip];
  const rh = view[LM.rightHip];
  const nose = view[LM.nose];
  const shouldersOk = (ls.v + rs.v) / 2 >= VISIBLE && vis(ls) && vis(rs);
  if (!shouldersOk) return null;
  const sc = { x: (ls.x + rs.x) / 2, y: (ls.y + rs.y) / 2 };
  const shoulderW = Math.hypot(ls.x - rs.x, ls.y - rs.y);
  const hipsOk = vis(lh) && vis(rh);
  let center = sc;
  let scale = shoulderW * 1.3;
  if (hipsOk) {
    const hc = { x: (lh.x + rh.x) / 2, y: (lh.y + rh.y) / 2 };
    center = { x: (sc.x + hc.x) / 2, y: (sc.y + hc.y) / 2 };
    scale = Math.max(Math.hypot(sc.x - hc.x, sc.y - hc.y), shoulderW * 0.9);
  }
  const quality = (ls.v + rs.v + lh.v + rh.v + nose.v) / 5;
  return { center, scale, quality };
}

export class PlayerTracker {
  readonly slots: PlayerSlot[];
  private filters: { view: LandmarkFilterBank; world: LandmarkFilterBank }[];
  private required = 1;
  private locked = false;
  aspect = 16 / 9;
  /** People detected beyond the required player count (for "too many people" warnings). */
  extraPeople = 0;
  lastFrameTime = 0;
  /** Called when two slots swap identity so per-player state elsewhere can follow. */
  onSwap: ((a: number, b: number) => void) | null = null;

  constructor(maxSlots = 4) {
    this.slots = Array.from({ length: maxSlots }, (_, index) => ({
      index,
      state: 'empty' as SlotState,
      pose: null,
      center: { x: 0, y: 0 },
      velocity: { x: 0, y: 0 },
      scale: 0.2,
      quality: 0,
      firstSeen: 0,
      lastSeen: 0,
      fresh: false,
    }));
    this.filters = this.slots.map(() => ({
      view: new LandmarkFilterBank(33, 1.4, 6),
      world: new LandmarkFilterBank(33, 1.2, 3),
    }));
  }

  get requiredPlayers(): number {
    return this.required;
  }

  setRequired(n: number): void {
    this.required = Math.max(1, Math.min(n, this.slots.length));
    for (let i = this.required; i < this.slots.length; i++) this.clearSlot(i);
  }

  /** Lock identities (during a game). Unlocked = lobby: players are ordered left → right. */
  setLocked(locked: boolean): void {
    this.locked = locked;
  }

  get isLocked(): boolean {
    return this.locked;
  }

  zoneCenter(i: number): number {
    return this.aspect * ((i + 0.5) / this.required);
  }

  clearSlot(i: number): void {
    const s = this.slots[i];
    s.state = 'empty';
    s.pose = null;
    s.fresh = false;
    this.filters[i].view.reset();
    this.filters[i].world.reset();
  }

  reset(): void {
    for (let i = 0; i < this.slots.length; i++) this.clearSlot(i);
  }

  /** Swap two player identities (e.g. players want to switch sides in the lobby). */
  swap(a: number, b: number): void {
    const sa = this.slots[a];
    const sb = this.slots[b];
    [this.slots[a], this.slots[b]] = [sb, sa];
    sb.index = a;
    sa.index = b;
    [this.filters[a], this.filters[b]] = [this.filters[b], this.filters[a]];
    this.onSwap?.(a, b);
  }

  update(frame: PoseFrame): void {
    this.aspect = frame.width / frame.height || 16 / 9;
    const now = frame.t;
    const dtFrame = this.lastFrameTime ? Math.min(0.25, (now - this.lastFrameTime) / 1000) : 0.033;
    this.lastFrameTime = now;

    // 1. Measure & filter detections
    let dets: Measured[] = [];
    for (const det of frame.poses) {
      const { view, world } = toView(det, this.aspect);
      const m = measure(view);
      if (!m || m.scale < 0.045 || m.quality < 0.45) continue;
      dets.push({ det, view, world, ...m });
    }
    // Deduplicate overlapping detections of the same person.
    dets.sort((a, b) => b.quality - a.quality);
    const unique: Measured[] = [];
    for (const d of dets) {
      if (!unique.some((u) => Math.hypot(u.center.x - d.center.x, u.center.y - d.center.y) < 0.25 * Math.min(u.scale, d.scale)))
        unique.push(d);
    }
    dets = unique;

    // 2. Assign detections to the required slots by minimum total cost
    const n = this.required;
    const slotIdx = Array.from({ length: n }, (_, i) => i);
    const cost = (si: number, d: Measured): number => {
      const s = this.slots[si];
      const zoneDist = Math.abs(d.center.x - this.zoneCenter(si)) / (this.aspect / n);
      if (s.state === 'empty') return 1 + zoneDist * 2;
      const age = Math.max(0, (now - s.lastSeen) / 1000);
      const px = s.center.x + s.velocity.x * Math.min(age, 0.3);
      const py = s.center.y + s.velocity.y * Math.min(age, 0.3);
      const ref = Math.max(s.scale, 0.06);
      const posCost = Math.hypot(d.center.x - px, d.center.y - py) / ref;
      const sizeCost = Math.abs(Math.log(d.scale / Math.max(s.scale, 1e-3))) * 2;
      const zoneW = !this.locked ? 3 : s.state === 'lost' ? 1.5 : 0.35;
      const lostRelax = s.state === 'lost' ? 0.3 : 1;
      if (this.locked && s.state === 'active' && posCost > 3.2 && n > 1) return Infinity;
      return posCost * lostRelax + sizeCost + zoneW * zoneDist;
    };
    const missCost = (si: number) => (this.slots[si].state === 'active' ? 2.6 : 1.2);

    let best: number[] = new Array(n).fill(-1);
    let bestCost = Infinity;
    const cur: number[] = new Array(n).fill(-1);
    const used = new Array(dets.length).fill(false);
    const search = (k: number, acc: number) => {
      if (acc >= bestCost) return;
      if (k === n) {
        bestCost = acc;
        best = [...cur];
        return;
      }
      const si = slotIdx[k];
      for (let j = 0; j < dets.length; j++) {
        if (used[j]) continue;
        const c = cost(si, dets[j]);
        if (!Number.isFinite(c)) continue;
        used[j] = true;
        cur[k] = j;
        search(k + 1, acc + c);
        used[j] = false;
      }
      cur[k] = -1;
      search(k + 1, acc + missCost(si));
    };
    search(0, 0);

    // 3. Apply assignment
    const assigned = new Set<number>();
    const tSec = now / 1000;
    for (let k = 0; k < n; k++) {
      const s = this.slots[k];
      const j = best[k];
      if (j < 0) {
        s.fresh = false;
        if (s.state === 'active' || s.state === 'grace') {
          s.state = now - s.lastSeen > GRACE_MS ? 'lost' : 'grace';
        }
        continue;
      }
      assigned.add(j);
      const d = dets[j];
      const wasTracking = s.state === 'active' || s.state === 'grace';
      const jump = wasTracking ? Math.hypot(d.center.x - s.center.x, d.center.y - s.center.y) / Math.max(s.scale, 0.05) : 99;
      if (!wasTracking || jump > 2.5) {
        this.filters[k].view.reset();
        this.filters[k].world.reset();
        s.velocity = { x: 0, y: 0 };
        if (s.state === 'empty') s.firstSeen = now;
      } else {
        const dt = Math.max(1e-3, (now - s.lastSeen) / 1000 || dtFrame);
        const vx = (d.center.x - s.center.x) / dt;
        const vy = (d.center.y - s.center.y) / dt;
        s.velocity = { x: s.velocity.x * 0.6 + vx * 0.4, y: s.velocity.y * 0.6 + vy * 0.4 };
      }
      this.filters[k].view.apply(d.view, tSec);
      if (d.world) this.filters[k].world.apply(d.world, tSec);
      s.pose = { pts: d.view, world: d.world, t: now };
      s.center = d.center;
      s.scale = wasTracking ? s.scale * 0.8 + d.scale * 0.2 : d.scale;
      s.quality = d.quality;
      s.lastSeen = now;
      s.state = 'active';
      s.fresh = true;
    }

    // 4. Lobby: keep players ordered left → right so "Player 1" is always on the left.
    if (!this.locked && n > 1) {
      for (let pass = 0; pass < n; pass++) {
        for (let i = 0; i < n - 1; i++) {
          const a = this.slots[i];
          const b = this.slots[i + 1];
          if (a.state === 'active' && b.state === 'active' && a.center.x > b.center.x + 0.02) this.swap(i, i + 1);
        }
      }
    }

    this.extraPeople = dets.filter((_, j) => !assigned.has(j) && dets[j].quality > 0.6).length;
  }
}
