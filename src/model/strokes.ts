import { round2, round3 } from './geometry';
import type { BBox, Stroke, StrokePoint, StrokeTool } from './types';

let counter = 0;
const prefix = Math.random().toString(36).slice(2, 7);

/** A unique stroke id. */
export function newId(): string {
  counter++;
  return `${prefix}${counter.toString(36)}`;
}

export function pointsBBox(ox: number, oy: number, pts: readonly StrokePoint[]): BBox {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of pts) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  if (pts.length === 0) return { minX: ox, minY: oy, maxX: ox, maxY: oy };
  return {
    minX: round2(ox + minX),
    minY: round2(oy + minY),
    maxX: round2(ox + maxX),
    maxY: round2(oy + maxY),
  };
}

/**
 * Build a stroke from absolute document points. Coordinates are rounded to 0.01 pt
 * (and pressure to 0.001) so that saving and loading reproduces the stroke exactly.
 * The origin is the first point.
 */
export function makeStroke(
  tool: StrokeTool,
  color: string,
  width: number,
  absPoints: readonly StrokePoint[],
  id: string = newId(),
): Stroke {
  const ox = absPoints.length ? round2(absPoints[0].x) : 0;
  const oy = absPoints.length ? round2(absPoints[0].y) : 0;
  return makeStrokeRel(
    tool,
    color,
    width,
    ox,
    oy,
    absPoints.map((p) => ({
      x: round2(p.x - ox),
      y: round2(p.y - oy),
      pressure: round3(p.pressure),
    })),
    id,
  );
}

/** Build a stroke from already-rounded relative points. */
export function makeStrokeRel(
  tool: StrokeTool,
  color: string,
  width: number,
  ox: number,
  oy: number,
  points: readonly StrokePoint[],
  id: string = newId(),
): Stroke {
  return { id, tool, color, width, ox, oy, points, bbox: pointsBBox(ox, oy, points) };
}

/** Move a stroke. Shares the points array (renderers cache outlines per points array). */
export function translateStroke(s: Stroke, dx: number, dy: number): Stroke {
  const ox = round2(s.ox + dx);
  const oy = round2(s.oy + dy);
  return { ...s, ox, oy, bbox: pointsBBox(ox, oy, s.points) };
}

/** Absolute point i of a stroke. */
export function absPoint(s: Stroke, i: number): { x: number; y: number; pressure: number } {
  const p = s.points[i];
  return { x: s.ox + p.x, y: s.oy + p.y, pressure: p.pressure };
}

export function absPoints(s: Stroke): StrokePoint[] {
  return s.points.map((p) => ({ x: s.ox + p.x, y: s.oy + p.y, pressure: p.pressure }));
}
