import { getStroke, type StrokeOptions } from 'perfect-freehand';
import type { Stroke, StrokePoint, StrokeTool } from './types';

/**
 * perfect-freehand settings. With thinning 0.5 the stroke diameter at pressure p is
 * size × (0.5 + p), so size = width / 1.5 gives `width` at full pressure.
 */
export function strokeOptions(tool: StrokeTool, width: number, last: boolean): StrokeOptions {
  if (tool === 'highlighter') {
    return {
      size: width,
      thinning: 0,
      smoothing: 0.5,
      streamline: 0.45,
      simulatePressure: false,
      last,
    };
  }
  return {
    size: width / 1.5,
    thinning: 0.5,
    smoothing: 0.5,
    streamline: 0.32,
    simulatePressure: false,
    easing: (t) => t,
    last,
  };
}

/** Outline polygon of a stroke in its local coordinates (relative to its origin). */
export function outlinePolygon(
  tool: StrokeTool,
  width: number,
  points: readonly StrokePoint[],
  last = true,
): number[][] {
  return getStroke(
    points.map((p) => [p.x, p.y, p.pressure]),
    strokeOptions(tool, width, last),
  );
}

const fmt = (n: number) => (Math.round(n * 1000) / 1000).toString();

/** SVG path data for an outline polygon, smoothed with quadratic curves. */
export function polygonToSvgPath(poly: number[][]): string {
  const n = poly.length;
  if (n === 0) return '';
  if (n < 3) {
    const [x, y] = poly[0];
    return `M${fmt(x)} ${fmt(y)}Z`;
  }
  let d = `M${fmt(poly[0][0])} ${fmt(poly[0][1])}Q`;
  for (let i = 0; i < n; i++) {
    const [x0, y0] = poly[i];
    const [x1, y1] = poly[(i + 1) % n];
    d += `${fmt(x0)} ${fmt(y0)} ${fmt((x0 + x1) / 2)} ${fmt((y0 + y1) / 2)} `;
  }
  return d.trimEnd() + 'Z';
}

const pathCache = new WeakMap<readonly StrokePoint[], { key: string; d: string }>();

/** Cached SVG outline of a stroke, in local coordinates. Survives translation. */
export function strokeOutlinePath(s: Stroke): string {
  const key = `${s.tool}:${s.width}`;
  const c = pathCache.get(s.points);
  if (c && c.key === key) return c.d;
  const d = polygonToSvgPath(outlinePolygon(s.tool, s.width, s.points));
  pathCache.set(s.points, { key, d });
  return d;
}
