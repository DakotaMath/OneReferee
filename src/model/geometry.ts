import type { BBox } from './types';

/** Round to 0.01 pt. Idempotent, so values stored rounded survive save/load unchanged. */
export function round2(v: number): number {
  const r = Math.round(v * 100) / 100;
  return r === 0 ? 0 : r; // normalise -0
}

/** Round pressure to 0.001. */
export function round3(v: number): number {
  const r = Math.round(v * 1000) / 1000;
  return r === 0 ? 0 : r;
}

export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

export function bboxIntersects(a: BBox, b: BBox): boolean {
  return a.minX <= b.maxX && a.maxX >= b.minX && a.minY <= b.maxY && a.maxY >= b.minY;
}

export function bboxUnion(boxes: Iterable<BBox>): BBox | null {
  let r: BBox | null = null;
  for (const b of boxes) {
    if (!r) r = { ...b };
    else {
      r.minX = Math.min(r.minX, b.minX);
      r.minY = Math.min(r.minY, b.minY);
      r.maxX = Math.max(r.maxX, b.maxX);
      r.maxY = Math.max(r.maxY, b.maxY);
    }
  }
  return r;
}

export function expandBBox(b: BBox, d: number): BBox {
  return { minX: b.minX - d, minY: b.minY - d, maxX: b.maxX + d, maxY: b.maxY + d };
}

/** Squared distance from point p to segment ab. */
export function distSqToSegment(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
): number {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  let t = len2 > 0 ? ((px - ax) * dx + (py - ay) * dy) / len2 : 0;
  t = clamp(t, 0, 1);
  const cx = ax + t * dx - px;
  const cy = ay + t * dy - py;
  return cx * cx + cy * cy;
}
