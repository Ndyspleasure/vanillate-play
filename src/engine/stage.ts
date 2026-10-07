import type { Point, Rect } from '../core/math';

/**
 * Maps view space (mirrored camera frame: x in 0..aspect, y in 0..1) to stage pixels, matching
 * how the <video> element is displayed with `object-fit: cover`.
 */
export class StageMapper {
  width = 1280;
  height = 720;
  aspect = 16 / 9;
  /** Pixels per view unit (= displayed video height). */
  scale = 720;
  offX = 0;
  offY = 0;
  /** Picture-in-picture mapping (for games that show a small camera window). */
  pip: Rect | null = null;

  set(width: number, height: number, aspect: number): void {
    this.width = width;
    this.height = height;
    this.aspect = aspect;
    const dispH = Math.max(height, width / aspect);
    this.scale = dispH;
    this.offX = (width - dispH * aspect) / 2;
    this.offY = (height - dispH) / 2;
  }

  toStage(p: Point, out: Point = { x: 0, y: 0 }): Point {
    out.x = this.offX + p.x * this.scale;
    out.y = this.offY + p.y * this.scale;
    return out;
  }

  toView(px: number, py: number): Point {
    return { x: (px - this.offX) / this.scale, y: (py - this.offY) / this.scale };
  }

  /** Map into a PIP rectangle (contain fit). */
  toPip(p: Point, r: Rect): Point {
    const s = Math.min(r.w / this.aspect, r.h);
    const ox = r.x + (r.w - s * this.aspect) / 2;
    const oy = r.y + (r.h - s) / 2;
    return { x: ox + p.x * s, y: oy + p.y * s };
  }
}

/** Horizontal strips, one per player, left → right. */
export function playerZones(width: number, height: number, count: number): Rect[] {
  const w = width / count;
  return Array.from({ length: count }, (_, i) => ({ x: i * w, y: 0, w, h: height }));
}
