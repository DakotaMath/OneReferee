import { getLayout, locate } from './document';
import { round2 } from './geometry';
import { translateStroke } from './strokes';
import { EPS, PAGE_GAP, type Doc, type GapSegment, type Segment, type Stroke } from './types';

/**
 * Insert (h > 0) or remove (h < 0) blank space at document y.
 *
 * Insert: the segment containing y is found; a slice is split at the matching source y
 * with a new gap between the halves, a gap simply grows. Every stroke whose bounding-box
 * top is at or below y moves down by h; strokes crossing y stay put (as in OneNote).
 */
export function insertSpace(doc: Doc, y: number, h: number): Doc {
  h = round2(h);
  if (h === 0 || doc.segments.length === 0) return doc;
  if (h < 0) return removeSpace(doc, y, -h).doc;
  y = round2(y);

  const segs = doc.segments.slice();
  const { total } = getLayout(doc);

  if (y <= 0) {
    addGap(segs, 0, firstPage(segs), h);
  } else if (y >= total) {
    addGap(segs, segs.length, lastPage(segs), h);
  } else {
    const { index, offset } = locate(doc, y);
    const seg = segs[index];
    if (seg.kind === 'gap') {
      if (seg.page !== null) {
        segs[index] = { ...seg, height: round2(seg.height + h) };
      } else {
        // In the separator between pages: the new space goes at the end of the page above.
        addGap(segs, index, pageBefore(segs, index), h);
      }
    } else {
      const srcY = round2(seg.srcTop + offset);
      if (srcY - seg.srcTop <= EPS) {
        addGap(segs, index, seg.page, h);
      } else if (seg.srcBottom - srcY <= EPS) {
        addGap(segs, index + 1, seg.page, h);
      } else {
        segs.splice(
          index,
          1,
          { kind: 'slice', page: seg.page, srcTop: seg.srcTop, srcBottom: srcY },
          { kind: 'gap', page: seg.page, height: h },
          { kind: 'slice', page: seg.page, srcTop: srcY, srcBottom: seg.srcBottom },
        );
      }
    }
  }

  return { ...doc, segments: segs, strokes: shiftStrokes(doc.strokes, y, h) };
}

export interface RemoveResult {
  doc: Doc;
  /** Amount of space actually removed (≤ requested). */
  removed: number;
}

/**
 * Remove up to `amount` points of blank gap starting at document y and going down.
 *
 * Only gap height is ever removed, never PDF content. The space comes from the gap
 * containing y, or if y is not in a gap, from the first gap below y, continuing into
 * gaps directly after it (a run of consecutive gaps). Separators between pages never
 * shrink below PAGE_GAP. Strokes at or below that point move up by the amount removed.
 * A gap between two slices of the same page that shrinks to zero merges them back.
 */
export function removeSpace(doc: Doc, y: number, amount: number): RemoveResult {
  amount = round2(amount);
  const segs = doc.segments.slice();
  if (amount <= 0 || segs.length === 0) return { doc, removed: 0 };
  const { tops } = getLayout(doc);

  // Where does removal start, and from which threshold do strokes move?
  let start: number;
  let threshold: number;
  const loc = locate(doc, y);
  if (segs[loc.index].kind === 'gap') {
    start = loc.index;
    threshold = Math.max(round2(y), tops[start]);
  } else {
    start = -1;
    for (let i = loc.index + 1; i < segs.length; i++) {
      if (segs[i].kind === 'gap' && available(segs[i] as GapSegment) > 0) {
        start = i;
        break;
      }
    }
    if (start < 0) return { doc, removed: 0 };
    threshold = tops[start];
  }

  let remaining = amount;
  let removed = 0;
  for (let i = start; i < segs.length && remaining > EPS; i++) {
    const s = segs[i];
    if (s.kind !== 'gap') break;
    const r = Math.min(available(s), remaining);
    if (r <= 0) continue;
    segs[i] = { ...s, height: round2(s.height - r) };
    remaining = round2(remaining - r);
    removed = round2(removed + r);
  }
  if (removed <= 0) return { doc, removed: 0 };

  return {
    doc: {
      ...doc,
      segments: normalize(segs),
      strokes: shiftStrokes(doc.strokes, threshold, -removed),
    },
    removed,
  };
}

/** Removable height of a gap. */
function available(g: GapSegment): number {
  return g.page === null ? Math.max(0, round2(g.height - PAGE_GAP)) : g.height;
}

/** Move strokes whose bounding-box top is at or below y by dy. */
export function shiftStrokes(strokes: readonly Stroke[], y: number, dy: number): Stroke[] {
  return strokes.map((s) => (s.bbox.minY >= y - EPS ? translateStroke(s, 0, dy) : s));
}

/** Drop zero-height page gaps and merge adjacent slices that are contiguous on the same page. */
export function normalize(segs: Segment[]): Segment[] {
  const out: Segment[] = [];
  for (const s of segs) {
    if (s.kind === 'gap' && s.page !== null && s.height <= EPS) continue;
    const prev = out[out.length - 1];
    if (
      prev &&
      prev.kind === 'slice' &&
      s.kind === 'slice' &&
      prev.page === s.page &&
      Math.abs(prev.srcBottom - s.srcTop) <= EPS
    ) {
      out[out.length - 1] = { ...prev, srcBottom: s.srcBottom };
      continue;
    }
    if (
      prev &&
      prev.kind === 'gap' &&
      s.kind === 'gap' &&
      prev.page === s.page &&
      s.page !== null
    ) {
      out[out.length - 1] = { ...prev, height: round2(prev.height + s.height) };
      continue;
    }
    out.push(s);
  }
  return out;
}

/** Add `h` of page gap at position `index` (before segs[index]), growing an adjacent page gap if any. */
function addGap(segs: Segment[], index: number, page: number, h: number): void {
  const before = segs[index - 1];
  const after = segs[index];
  if (before && before.kind === 'gap' && before.page === page) {
    segs[index - 1] = { ...before, height: round2(before.height + h) };
  } else if (after && after.kind === 'gap' && after.page === page) {
    segs[index] = { ...after, height: round2(after.height + h) };
  } else {
    segs.splice(index, 0, { kind: 'gap', page, height: h });
  }
}

function firstPage(segs: Segment[]): number {
  for (const s of segs) if (s.page !== null) return s.page;
  return 0;
}

function lastPage(segs: Segment[]): number {
  for (let i = segs.length - 1; i >= 0; i--) {
    const p = segs[i].page;
    if (p !== null) return p;
  }
  return 0;
}

function pageBefore(segs: Segment[], index: number): number {
  for (let i = index - 1; i >= 0; i--) {
    const p = segs[i].page;
    if (p !== null) return p;
  }
  return firstPage(segs);
}
