import type { Point } from '../math';

/**
 * Framing advice for 3–4 players sharing one camera. Bodies that stand too close overlap (the pose
 * model then merges or swaps them) and a body that is too big for its strip can't move its arms
 * without entering a neighbour's zone.
 */
export interface CrowdBody {
  present: boolean;
  /** View-space body centre. */
  center: Point;
  /** Body size (≈ torso length) in view units. */
  scale: number;
}

export interface CrowdAdvice {
  /** Adjacent players (left → right) that should spread out. */
  crowded: [number, number][];
  /** Players that should step back to fit their zone. */
  tooBig: number[];
}

/** Centres closer than this many torso lengths are "crowded" (shoulders nearly touching). */
export const CROWD_GAP = 1.1;
/** A torso longer than this fraction of the zone width is too big for the zone. */
export const ZONE_FILL = 0.55;

export function crowdAdvice(bodies: readonly CrowdBody[], zoneWidth: number): CrowdAdvice {
  const crowded: [number, number][] = [];
  const tooBig: number[] = [];
  for (let i = 0; i < bodies.length; i++) {
    const a = bodies[i];
    if (!a.present) continue;
    if (bodies.length >= 3 && a.scale > zoneWidth * ZONE_FILL) tooBig.push(i);
    const b = bodies[i + 1];
    if (!b?.present) continue;
    const avg = (a.scale + b.scale) / 2;
    if (Math.abs(b.center.x - a.center.x) < CROWD_GAP * avg) crowded.push([i, i + 1]);
  }
  return { crowded, tooBig };
}
