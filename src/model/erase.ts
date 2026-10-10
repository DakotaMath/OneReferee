import { distSqToSegment } from './geometry';
import { makeStroke } from './strokes';
import type { Stroke, StrokePoint } from './types';

/** Radius within which a stroke counts as touched: eraser radius plus half the stroke width. */
function reach(s: Stroke, r: number): number {
  return r + s.width / 2;
}

function bboxNear(s: Stroke, cx: number, cy: number, R: number): boolean {
  const b = s.bbox;
  return cx >= b.minX - R && cx <= b.maxX + R && cy >= b.minY - R && cy <= b.maxY + R;
}

/** Does an eraser circle at (cx, cy) with radius r touch any part of the stroke? */
export function strokeHitsCircle(s: Stroke, cx: number, cy: number, r: number): boolean {
  const R = reach(s, r);
  if (!bboxNear(s, cx, cy, R)) return false;
  const R2 = R * R;
  const lx = cx - s.ox;
  const ly = cy - s.oy;
  const pts = s.points;
  if (pts.length === 1) {
    const dx = pts[0].x - lx;
    const dy = pts[0].y - ly;
    return dx * dx + dy * dy <= R2;
  }
  for (let i = 0; i + 1 < pts.length; i++) {
    if (distSqToSegment(lx, ly, pts[i].x, pts[i].y, pts[i + 1].x, pts[i + 1].y) <= R2) return true;
  }
  return false;
}

/** Parameter interval [t0, t1] ⊂ [0, 1] of segment a→b inside the circle, or null. */
function segmentCircleInterval(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  cx: number,
  cy: number,
  R: number,
): [number, number] | null {
  const dx = bx - ax;
  const dy = by - ay;
  const fx = ax - cx;
  const fy = ay - cy;
  const A = dx * dx + dy * dy;
  const C = fx * fx + fy * fy - R * R;
  if (A === 0) return C <= 0 ? [0, 1] : null;
  const B = 2 * (fx * dx + fy * dy);
  const disc = B * B - 4 * A * C;
  if (disc < 0) return null;
  const sq = Math.sqrt(disc);
  const t0 = Math.max(0, (-B - sq) / (2 * A));
  const t1 = Math.min(1, (-B + sq) / (2 * A));
  if (t0 > t1 || t1 < 0 || t0 > 1) return null;
  return [t0, t1];
}

function lerp(a: StrokePoint, b: StrokePoint, t: number): StrokePoint {
  return {
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
    pressure: a.pressure + (b.pressure - a.pressure) * t,
  };
}

/**
 * Point eraser on one stroke: remove the parts inside the circle, splitting the stroke
 * into separate pieces where needed. Returns null if the stroke is untouched, or the
 * (possibly empty) list of remaining pieces as new strokes.
 */
export function eraseCircleFromStroke(
  s: Stroke,
  cx: number,
  cy: number,
  r: number,
): Stroke[] | null {
  const R = reach(s, r);
  if (!bboxNear(s, cx, cy, R)) return null;
  const lx = cx - s.ox;
  const ly = cy - s.oy;
  const pts = s.points;
  if (pts.length === 1) {
    const dx = pts[0].x - lx;
    const dy = pts[0].y - ly;
    return dx * dx + dy * dy <= R * R ? [] : null;
  }

  const pieces: StrokePoint[][] = [];
  let current: StrokePoint[] | null = null;
  let touched = false;
  const inside0 = (pts[0].x - lx) ** 2 + (pts[0].y - ly) ** 2 <= R * R;
  if (!inside0) current = [pts[0]];
  else touched = true;

  for (let i = 0; i + 1 < pts.length; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    const iv = segmentCircleInterval(a.x, a.y, b.x, b.y, lx, ly, R);
    if (!iv) {
      if (!current) current = [a]; // defensive: a was on the boundary
      current.push(b);
      continue;
    }
    touched = true;
    const [t0, t1] = iv;
    if (t0 > 0 && current) {
      current.push(lerp(a, b, t0));
      pieces.push(current);
    }
    current = null;
    if (t1 < 1) current = [lerp(a, b, t1), b];
  }
  if (current) pieces.push(current);
  if (!touched) return null;

  const abs = (p: StrokePoint) => ({ x: s.ox + p.x, y: s.oy + p.y, pressure: p.pressure });
  return pieces
    .filter((piece) => piece.length >= 2 && pieceLength(piece) > 0.05)
    .map((piece) => makeStroke(s.tool, s.color, s.width, piece.map(abs)));
}

function pieceLength(p: StrokePoint[]): number {
  let len = 0;
  for (let i = 1; i < p.length; i++) len += Math.hypot(p[i].x - p[i - 1].x, p[i].y - p[i - 1].y);
  return len;
}

/**
 * Apply one eraser dab to a stroke list. Stroke mode removes every touched stroke;
 * point mode replaces touched strokes with their remaining pieces, in place (keeping
 * the stacking order). Returns the same array if nothing changed.
 */
export function eraseAt(
  strokes: readonly Stroke[],
  cx: number,
  cy: number,
  r: number,
  mode: 'stroke' | 'point',
): readonly Stroke[] {
  let out: Stroke[] | null = null;
  for (let i = 0; i < strokes.length; i++) {
    const s = strokes[i];
    if (mode === 'stroke') {
      if (strokeHitsCircle(s, cx, cy, r)) {
        out ??= strokes.slice(0, i);
        continue;
      }
      out?.push(s);
    } else {
      const pieces = eraseCircleFromStroke(s, cx, cy, r);
      if (pieces) {
        out ??= strokes.slice(0, i);
        out.push(...pieces);
        continue;
      }
      out?.push(s);
    }
  }
  return out ?? strokes;
}
