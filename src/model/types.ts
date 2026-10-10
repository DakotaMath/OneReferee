/**
 * The document model. Pure data, no DOM.
 *
 * The document is one long vertical column of segments, in PDF points (1/72 in),
 * with y increasing downward from the top of the column. Strokes float freely on
 * the column and are not attached to segments.
 */

/** Size of an original PDF page in points, as displayed (after /Rotate). */
export interface PageInfo {
  width: number;
  height: number;
}

/** A horizontal band of one PDF page, from srcTop to srcBottom in that page's points. */
export interface SliceSegment {
  kind: 'slice';
  page: number;
  srcTop: number;
  srcBottom: number;
}

/**
 * Blank space. `page` is the original page the gap belongs to (inserted space,
 * drawn as white page background), or null for the separator between pages
 * (drawn as the gray page-area background, never shorter than PAGE_GAP).
 */
export interface GapSegment {
  kind: 'gap';
  page: number | null;
  height: number;
}

export type Segment = SliceSegment | GapSegment;

export type StrokeTool = 'pen' | 'highlighter';

export interface StrokePoint {
  x: number;
  y: number;
  pressure: number;
}

export interface BBox {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/**
 * A stroke. `points` are relative to the origin (ox, oy) so that moving a stroke
 * (insert space, drag) only changes the origin and reuses the same points array;
 * renderers cache outlines per points array. Absolute point = (ox + x, oy + y).
 * `bbox` is the cached absolute bounding box of the points (not including width).
 */
export interface Stroke {
  id: string;
  tool: StrokeTool;
  color: string;
  /** Width in points at full pressure. */
  width: number;
  ox: number;
  oy: number;
  points: readonly StrokePoint[];
  bbox: BBox;
}

export interface Doc {
  pages: readonly PageInfo[];
  segments: readonly Segment[];
  strokes: readonly Stroke[];
}

/** Height of the separator between pages, and the minimum it can shrink to. */
export const PAGE_GAP = 16;

/** Tolerance for comparing positions in points. */
export const EPS = 0.005;
