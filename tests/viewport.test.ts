import { describe, expect, it } from 'vitest';
import {
  clampView,
  docToScreen,
  fitWidthZoom,
  MARGIN,
  nextZoomStep,
  PT_TO_CSS,
  screenToDoc,
  zoomAt,
  type View,
} from '../src/render/viewport';

const ext = { columnWidth: 612, total: 5000 };
const view: View = { zoom: 1, scrollX: 0, scrollY: 300, width: 1000, height: 800 };

describe('viewport math', () => {
  it('round-trips doc <-> screen', () => {
    const s = docToScreen(view, ext, 100, 700);
    const d = screenToDoc(view, ext, s.x, s.y);
    expect(d.x).toBeCloseTo(100);
    expect(d.y).toBeCloseTo(700);
  });

  it('centres a narrow column', () => {
    const s = docToScreen(view, ext, 0, 0);
    expect(s.x).toBeCloseTo((1000 - 612 * PT_TO_CSS) / 2);
    expect(s.y).toBe(MARGIN - 300);
  });

  it('keeps the point under the cursor fixed when zooming', () => {
    const before = screenToDoc(view, ext, 400, 300);
    const z = zoomAt(view, ext, 2.5, 400, 300);
    const after = screenToDoc(z, ext, 400, 300);
    expect(z.zoom).toBe(2.5);
    expect(after.x).toBeCloseTo(before.x, 6);
    expect(after.y).toBeCloseTo(before.y, 6);
  });

  it('clamps zoom and scroll', () => {
    expect(zoomAt(view, ext, 10, 0, 0).zoom).toBe(4);
    expect(zoomAt(view, ext, 0.01, 0, 0).zoom).toBe(0.25);
    expect(clampView({ ...view, scrollY: -50 }, ext).scrollY).toBe(0);
    expect(clampView({ ...view, scrollY: 1e9 }, ext).scrollY).toBeCloseTo(
      5000 * PT_TO_CSS + 2 * MARGIN - 800,
    );
  });

  it('computes fit width and zoom steps', () => {
    const z = fitWidthZoom(1000, 612);
    expect(z * 612 * PT_TO_CSS).toBeLessThan(1000 - 2 * MARGIN);
    expect(nextZoomStep(1, 1)).toBe(1.1);
    expect(nextZoomStep(1, -1)).toBe(0.9);
    expect(nextZoomStep(4, 1)).toBe(4);
    expect(nextZoomStep(0.25, -1)).toBe(0.25);
    expect(nextZoomStep(1.3, 1)).toBe(1.5);
  });
});
