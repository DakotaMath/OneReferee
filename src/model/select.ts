import { bboxUnion } from './geometry';
import { newId, translateStroke } from './strokes';
import type { BBox, Doc, Stroke } from './types';

export interface Pt {
  x: number;
  y: number;
}

/** Even-odd point-in-polygon test. */
export function pointInPolygon(x: number, y: number, poly: readonly Pt[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    if (a.y > y !== b.y > y && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

/** True if more than half of the stroke's points satisfy `inside`. */
function mostPointsInside(s: Stroke, inside: (x: number, y: number) => boolean): boolean {
  let n = 0;
  for (const p of s.points) if (inside(s.ox + p.x, s.oy + p.y)) n++;
  return n * 2 > s.points.length;
}

function intersects(b: BBox, minX: number, minY: number, maxX: number, maxY: number): boolean {
  return b.minX <= maxX && b.maxX >= minX && b.minY <= maxY && b.maxY >= minY;
}

/** Ids of strokes with most of their points inside the lasso polygon (closed implicitly). */
export function selectByLasso(strokes: readonly Stroke[], poly: readonly Pt[]): string[] {
  if (poly.length < 3) return [];
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of poly) {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }
  return strokes
    .filter(
      (s) =>
        intersects(s.bbox, minX, minY, maxX, maxY) &&
        mostPointsInside(s, (x, y) => pointInPolygon(x, y, poly)),
    )
    .map((s) => s.id);
}

/** Ids of strokes with most of their points inside the rectangle spanned by a and b. */
export function selectByRect(strokes: readonly Stroke[], a: Pt, b: Pt): string[] {
  const minX = Math.min(a.x, b.x);
  const maxX = Math.max(a.x, b.x);
  const minY = Math.min(a.y, b.y);
  const maxY = Math.max(a.y, b.y);
  return strokes
    .filter(
      (s) =>
        intersects(s.bbox, minX, minY, maxX, maxY) &&
        mostPointsInside(s, (x, y) => x >= minX && x <= maxX && y >= minY && y <= maxY),
    )
    .map((s) => s.id);
}

/** Bounding box of the given strokes including their stroke width. */
export function selectionBounds(strokes: readonly Stroke[], ids: ReadonlySet<string>): BBox | null {
  return bboxUnion(
    strokes
      .filter((s) => ids.has(s.id))
      .map((s) => {
        const h = s.width / 2;
        return {
          minX: s.bbox.minX - h,
          minY: s.bbox.minY - h,
          maxX: s.bbox.maxX + h,
          maxY: s.bbox.maxY + h,
        };
      }),
  );
}

/** Move the strokes with the given ids. */
export function translateStrokes(doc: Doc, ids: ReadonlySet<string>, dx: number, dy: number): Doc {
  if (dx === 0 && dy === 0) return doc;
  return {
    ...doc,
    strokes: doc.strokes.map((s) => (ids.has(s.id) ? translateStroke(s, dx, dy) : s)),
  };
}

export function deleteStrokes(doc: Doc, ids: ReadonlySet<string>): Doc {
  return { ...doc, strokes: doc.strokes.filter((s) => !ids.has(s.id)) };
}

/** Copies of strokes with new ids, moved by (dx, dy). */
export function duplicateStrokes(strokes: readonly Stroke[], dx: number, dy: number): Stroke[] {
  return strokes.map((s) => ({ ...translateStroke(s, dx, dy), id: newId() }));
}
