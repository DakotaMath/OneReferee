/**
 * Viewport math: mapping between document points and screen (CSS) pixels.
 * Pure functions, no DOM, so they can be unit tested.
 */

/** CSS pixels per point at 100% zoom (PDF "actual size"). */
export const PT_TO_CSS = 96 / 72;
/** Margin around the document column, in CSS pixels. */
export const MARGIN = 24;
export const MIN_ZOOM = 0.25;
export const MAX_ZOOM = 4;
export const ZOOM_STEPS = [0.25, 0.33, 0.5, 0.67, 0.75, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2, 2.5, 3, 4];

export interface View {
  zoom: number;
  /** Scroll offsets in CSS pixels. */
  scrollX: number;
  scrollY: number;
  /** Viewport size in CSS pixels. */
  width: number;
  height: number;
}

export interface DocExtent {
  columnWidth: number;
  total: number;
}

export function cssPerPt(zoom: number): number {
  return zoom * PT_TO_CSS;
}

export function contentSize(view: View, ext: DocExtent): { w: number; h: number } {
  const k = cssPerPt(view.zoom);
  return { w: ext.columnWidth * k + 2 * MARGIN, h: ext.total * k + 2 * MARGIN };
}

/** Screen position of document origin (top-left of the column). */
export function origin(view: View, ext: DocExtent): { x: number; y: number } {
  const k = cssPerPt(view.zoom);
  const { w } = contentSize(view, ext);
  const x = w <= view.width ? (view.width - ext.columnWidth * k) / 2 : MARGIN - view.scrollX;
  return { x, y: MARGIN - view.scrollY };
}

export function docToScreen(view: View, ext: DocExtent, x: number, y: number) {
  const k = cssPerPt(view.zoom);
  const o = origin(view, ext);
  return { x: o.x + x * k, y: o.y + y * k };
}

export function screenToDoc(view: View, ext: DocExtent, sx: number, sy: number) {
  const k = cssPerPt(view.zoom);
  const o = origin(view, ext);
  return { x: (sx - o.x) / k, y: (sy - o.y) / k };
}

export function maxScroll(view: View, ext: DocExtent): { x: number; y: number } {
  const { w, h } = contentSize(view, ext);
  return { x: Math.max(0, w - view.width), y: Math.max(0, h - view.height) };
}

export function clampView(view: View, ext: DocExtent): View {
  const m = maxScroll(view, ext);
  return {
    ...view,
    scrollX: Math.min(Math.max(0, view.scrollX), m.x),
    scrollY: Math.min(Math.max(0, view.scrollY), m.y),
  };
}

export function clampZoom(z: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z));
}

/** Change zoom keeping the document point under screen point (sx, sy) fixed. */
export function zoomAt(view: View, ext: DocExtent, zoom: number, sx: number, sy: number): View {
  zoom = clampZoom(zoom);
  const d = screenToDoc(view, ext, sx, sy);
  const k = cssPerPt(zoom);
  const next: View = { ...view, zoom };
  // Solve origin(next) + d*k = s for scroll.
  next.scrollY = MARGIN + d.y * k - sy;
  next.scrollX = MARGIN + d.x * k - sx;
  return clampView(next, ext);
}

/** Zoom at which the column (plus margins) fills the viewport width. */
export function fitWidthZoom(viewWidth: number, columnWidth: number): number {
  if (columnWidth <= 0) return 1;
  return clampZoom((viewWidth - 2 * MARGIN - 14) / (columnWidth * PT_TO_CSS));
}

export function nextZoomStep(zoom: number, dir: 1 | -1): number {
  if (dir > 0) return ZOOM_STEPS.find((z) => z > zoom + 0.001) ?? MAX_ZOOM;
  for (let i = ZOOM_STEPS.length - 1; i >= 0; i--)
    if (ZOOM_STEPS[i] < zoom - 0.001) return ZOOM_STEPS[i];
  return MIN_ZOOM;
}
