/**
 * Snapping an insert-space cut to blank horizontal bands of a PDF page, so a cut never
 * slices through a line of text or an equation. Works on a "row profile": one entry per
 * pixel row of a low-resolution render, 1 if the row is entirely near-white.
 */

export interface Band {
  /** Top and bottom in page points. */
  top: number;
  bottom: number;
}

/** Default snapping distance in points. */
export const SNAP_TOLERANCE = 12;
/** Ignore blank bands thinner than this (gaps inside an equation), in points. */
export const MIN_BAND = 2;
/** Keep the cut this far inside a band, away from the ink edges, in points. */
const INSET = 1.5;

export function findBlankBands(
  rows: ArrayLike<number>,
  rowsPerPt: number,
  minBand = MIN_BAND,
): Band[] {
  const bands: Band[] = [];
  let start = -1;
  for (let i = 0; i <= rows.length; i++) {
    const blank = i < rows.length && rows[i] === 1;
    if (blank && start < 0) start = i;
    else if (!blank && start >= 0) {
      const top = start / rowsPerPt;
      const bottom = i / rowsPerPt;
      if (bottom - top >= minBand) bands.push({ top, bottom });
      start = -1;
    }
  }
  return bands;
}

/** Best position for a cut inside a band, as close as possible to y. */
function placeInBand(y: number, b: Band): number {
  const h = b.bottom - b.top;
  if (h <= 2 * INSET) return (b.top + b.bottom) / 2;
  return Math.min(Math.max(y, b.top + INSET), b.bottom - INSET);
}

/**
 * Snap source y to the nearest blank band within `tolerance` points. Returns y unchanged
 * if no band is close enough.
 */
export function snapToBlank(y: number, bands: readonly Band[], tolerance = SNAP_TOLERANCE): number {
  let best = y;
  let bestDist = Infinity;
  for (const b of bands) {
    const dist = y < b.top ? b.top - y : y > b.bottom ? y - b.bottom : 0;
    if (dist > tolerance) continue;
    const p = placeInBand(y, b);
    const d = Math.abs(p - y);
    if (dist < bestDist || (dist === bestDist && d < Math.abs(best - y))) {
      best = p;
      bestDist = dist;
    }
  }
  return best;
}
