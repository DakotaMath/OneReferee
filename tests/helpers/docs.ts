import { createDocument } from '../../src/model/document';
import { makeStroke } from '../../src/model/strokes';
import type { Doc, Stroke } from '../../src/model/types';

export const LETTER = { width: 612, height: 792 };

/** Three US Letter pages: slices at y 0–792, 808–1600, 1616–2408. */
export function threePages(): Doc {
  return createDocument([LETTER, LETTER, LETTER]);
}

/** A straight pen stroke from (x0, y0) to (x1, y1) with n + 1 evenly spaced points. */
export function line(x0: number, y0: number, x1: number, y1: number, n = 10, id?: string): Stroke {
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    pts.push({ x: x0 + (x1 - x0) * t, y: y0 + (y1 - y0) * t, pressure: 0.5 });
  }
  return makeStroke('pen', '#000000', 2, pts, id);
}
