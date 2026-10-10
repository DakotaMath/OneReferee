import { outlinePolygon, polygonToSvgPath, strokeOutlinePath } from '../model/outline';
import type { BBox, Stroke, StrokePoint, StrokeTool } from '../model/types';

const path2dCache = new WeakMap<readonly StrokePoint[], { d: string; path: Path2D }>();

function strokePath(s: Stroke): Path2D {
  const d = strokeOutlinePath(s);
  const c = path2dCache.get(s.points);
  if (c && c.d === d) return c.path;
  const path = new Path2D(d);
  path2dCache.set(s.points, { d, path });
  return path;
}

/** Maps document points to device pixels: device = (o + doc * k) * dpr. */
export interface DeviceTransform {
  ox: number;
  oy: number;
  k: number;
  dpr: number;
}

function setStrokeTransform(
  ctx: CanvasRenderingContext2D,
  t: DeviceTransform,
  x: number,
  y: number,
) {
  const s = t.k * t.dpr;
  ctx.setTransform(s, 0, 0, s, (t.ox + x * t.k) * t.dpr, (t.oy + y * t.k) * t.dpr);
}

/** Draw the strokes of one tool that intersect `visible` (document coords). */
export function drawStrokes(
  ctx: CanvasRenderingContext2D,
  strokes: readonly Stroke[],
  tool: StrokeTool,
  t: DeviceTransform,
  visible: BBox,
  hidden?: ReadonlySet<string>,
): void {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  // Overlapping highlighter strokes don't stack up darker ("darken" keeps the strongest color).
  ctx.globalCompositeOperation = tool === 'highlighter' ? 'darken' : 'source-over';
  for (const s of strokes) {
    if (s.tool !== tool) continue;
    if (hidden?.has(s.id)) continue;
    const w = s.width;
    const b = s.bbox;
    if (b.maxX + w < visible.minX || b.minX - w > visible.maxX) continue;
    if (b.maxY + w < visible.minY || b.minY - w > visible.maxY) continue;
    setStrokeTransform(ctx, t, s.ox, s.oy);
    ctx.fillStyle = s.color;
    ctx.fill(strokePath(s));
  }
  ctx.globalCompositeOperation = 'source-over';
  ctx.setTransform(1, 0, 0, 1, 0, 0);
}

/** Draw one in-progress stroke (absolute points) on the overlay. */
export function drawLiveStroke(
  ctx: CanvasRenderingContext2D,
  tool: StrokeTool,
  color: string,
  width: number,
  points: readonly StrokePoint[],
  t: DeviceTransform,
): void {
  if (points.length === 0) return;
  const ox = points[0].x;
  const oy = points[0].y;
  const rel = points.map((p) => ({ x: p.x - ox, y: p.y - oy, pressure: p.pressure }));
  const path = new Path2D(polygonToSvgPath(outlinePolygon(tool, width, rel, false)));
  setStrokeTransform(ctx, t, ox, oy);
  ctx.fillStyle = color;
  ctx.fill(path);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
}

/** Draw strokes (e.g. a selection being dragged) on the overlay without clearing. */
export function drawStrokesOnto(
  ctx: CanvasRenderingContext2D,
  strokes: readonly Stroke[],
  t: DeviceTransform,
): void {
  for (const s of strokes) {
    setStrokeTransform(ctx, t, s.ox, s.oy);
    ctx.fillStyle = s.color;
    ctx.fill(strokePath(s));
  }
  ctx.setTransform(1, 0, 0, 1, 0, 0);
}
