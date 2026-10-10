import { describe, expect, it } from 'vitest';
import { spaceCommand } from '../src/model/commands';
import { docYToSource, getLayout, sourceToDocY, totalHeight } from '../src/model/document';
import { insertSpace, removeSpace } from '../src/model/space';
import { findBlankBands, snapToBlank } from '../src/model/snap';
import { PAGE_GAP, type Doc } from '../src/model/types';
import { line, threePages } from './helpers/docs';

const H = 792;
const P2 = H + PAGE_GAP; // top of page 2 (index 1)

/** Sum of PDF content height per page: must never change. */
function contentPerPage(doc: Doc): number[] {
  const out = doc.pages.map(() => 0);
  for (const s of doc.segments) if (s.kind === 'slice') out[s.page] += s.srcBottom - s.srcTop;
  return out;
}

describe('insert space', () => {
  it('splits a slice and inserts a gap between the halves', () => {
    const doc = insertSpace(threePages(), 300, 50);
    expect(doc.segments.slice(0, 4)).toEqual([
      { kind: 'slice', page: 0, srcTop: 0, srcBottom: 300 },
      { kind: 'gap', page: 0, height: 50 },
      { kind: 'slice', page: 0, srcTop: 300, srcBottom: 792 },
      { kind: 'gap', page: null, height: PAGE_GAP },
    ]);
    expect(totalHeight(doc)).toBe(totalHeight(threePages()) + 50);
    // PDF content below the cut slides down by 50.
    expect(sourceToDocY(doc, 0, 400)).toBe(450);
    expect(sourceToDocY(doc, 1, 0)).toBe(P2 + 50);
    expect(docYToSource(doc, 320)).toBeNull();
    expect(contentPerPage(doc)).toEqual([H, H, H]);
    // The page's run includes the gap.
    const run = getLayout(doc).runByPage.get(0)!;
    expect(run.bottom - run.top).toBe(H + 50);
  });

  it('grows an existing gap when inserting inside it', () => {
    const once = insertSpace(threePages(), 300, 50);
    const twice = insertSpace(once, 320, 30);
    expect(twice.segments[1]).toEqual({ kind: 'gap', page: 0, height: 80 });
    expect(twice.segments).toHaveLength(once.segments.length);
  });

  it('inserting at the same cut again grows the same gap instead of adding a slice', () => {
    const once = insertSpace(threePages(), 300, 50);
    // y = 300 is now the top of the gap.
    const again = insertSpace(once, 300, 10);
    expect(again.segments[1]).toEqual({ kind: 'gap', page: 0, height: 60 });
    // y = 350 is the boundary below the gap (top of the lower slice).
    const below = insertSpace(once, 350, 10);
    expect(below.segments[1]).toEqual({ kind: 'gap', page: 0, height: 60 });
  });

  it('at a page boundary adds space at the bottom of the page above', () => {
    // y = 792 is the top of the separator: end of page 0.
    const a = insertSpace(threePages(), H, 40);
    expect(a.segments.slice(0, 3)).toEqual([
      { kind: 'slice', page: 0, srcTop: 0, srcBottom: H },
      { kind: 'gap', page: 0, height: 40 },
      { kind: 'gap', page: null, height: PAGE_GAP },
    ]);
    // Inside the separator: same.
    const b = insertSpace(threePages(), H + 8, 40);
    expect(b.segments).toEqual(a.segments);
    // At the top of page 2's slice: space goes at the top of page 2.
    const c = insertSpace(threePages(), P2, 40);
    expect(c.segments.slice(1, 4)).toEqual([
      { kind: 'gap', page: null, height: PAGE_GAP },
      { kind: 'gap', page: 1, height: 40 },
      { kind: 'slice', page: 1, srcTop: 0, srcBottom: H },
    ]);
    for (const d of [a, b, c]) expect(contentPerPage(d)).toEqual([H, H, H]);
  });

  it('at the very top and bottom of the document', () => {
    const top = insertSpace(threePages(), 0, 25);
    expect(top.segments[0]).toEqual({ kind: 'gap', page: 0, height: 25 });
    expect(top.segments[1]).toEqual({ kind: 'slice', page: 0, srcTop: 0, srcBottom: H });
    const neg = insertSpace(threePages(), -10, 25);
    expect(neg.segments).toEqual(top.segments);

    const end = totalHeight(threePages());
    const bottom = insertSpace(threePages(), end, 25);
    expect(bottom.segments[bottom.segments.length - 1]).toEqual({
      kind: 'gap',
      page: 2,
      height: 25,
    });
    expect(totalHeight(bottom)).toBe(end + 25);
  });

  it('moves strokes at or below the cut, leaves strokes above or crossing it', () => {
    const above = line(100, 100, 200, 120, 10, 'above');
    const crossing = line(100, 280, 200, 320, 10, 'crossing');
    const atCut = line(100, 300, 200, 310, 10, 'at');
    const below = line(100, 500, 200, 500, 10, 'below');
    const nextPage = line(100, P2 + 10, 200, P2 + 10, 10, 'next');
    const doc: Doc = { ...threePages(), strokes: [above, crossing, atCut, below, nextPage] };
    const out = insertSpace(doc, 300, 50);
    const byId = Object.fromEntries(out.strokes.map((s) => [s.id, s]));
    expect(byId.above).toBe(above);
    expect(byId.crossing).toBe(crossing);
    expect(byId.at.bbox.minY).toBe(350);
    expect(byId.below.bbox.minY).toBe(550);
    expect(byId.next.bbox.minY).toBe(P2 + 60);
    // Ink below stays aligned with the PDF underneath it.
    const src = docYToSource(doc, below.bbox.minY)!;
    expect(sourceToDocY(out, src.page, src.srcY)).toBe(byId.below.bbox.minY);
  });

  it('a negative amount removes space', () => {
    const opened = insertSpace(threePages(), 300, 50);
    expect(insertSpace(opened, 300, -50)).toEqual(threePages());
  });
});

describe('remove space', () => {
  it('shrinks a gap and moves strokes below up', () => {
    const s = line(100, 600, 200, 600, 10, 's');
    const opened = insertSpace({ ...threePages(), strokes: [s] }, 300, 50);
    const { doc, removed } = removeSpace(opened, 310, 20);
    expect(removed).toBe(20);
    expect(doc.segments[1]).toEqual({ kind: 'gap', page: 0, height: 30 });
    expect(doc.strokes[0].bbox.minY).toBe(630);
  });

  it('clamps at the available gap height and never removes PDF content', () => {
    const opened = insertSpace(threePages(), 300, 50);
    const { doc, removed } = removeSpace(opened, 310, 500);
    expect(removed).toBe(50);
    expect(contentPerPage(doc)).toEqual([H, H, H]);
    // Nothing more to remove on page 0, separators stay at 16 pt.
    const again = removeSpace(doc, 310, 100);
    expect(again.removed).toBe(0);
    expect(again.doc).toBe(doc);
    expect(removeSpace(threePages(), 10, 100).removed).toBe(0);
  });

  it('merges the two slices back into one when the gap reaches zero', () => {
    const opened = insertSpace(threePages(), 300, 50);
    const { doc } = removeSpace(opened, 300, 50);
    expect(doc.segments).toEqual(threePages().segments);
  });

  it('from inside text, closes the next gap below and continues through adjacent gaps', () => {
    let doc = insertSpace(threePages(), H, 30); // bottom of page 0
    doc = insertSpace(doc, P2 + 30, 20); // top of page 1 (after the separator)
    // Segments: slice0, gap0(30), sep(16), gap1(20), slice1, ...
    expect(doc.segments.slice(1, 4).map((s) => (s.kind === 'gap' ? s.height : -1))).toEqual([
      30, 16, 20,
    ]);
    const s = line(100, P2 + 100, 200, P2 + 100, 10, 's');
    doc = { ...doc, strokes: [s] };
    const r = removeSpace(doc, 700, 45);
    expect(r.removed).toBe(45);
    expect(r.doc.segments.slice(1, 4)).toEqual([
      { kind: 'gap', page: null, height: PAGE_GAP },
      { kind: 'gap', page: 1, height: 5 },
      { kind: 'slice', page: 1, srcTop: 0, srcBottom: H },
    ]);
    expect(r.doc.strokes[0].bbox.minY).toBe(P2 + 100 - 45);
  });

  it('never shrinks the original separators below 16 pt', () => {
    const r = removeSpace(threePages(), H + 4, 10);
    expect(r.removed).toBe(0);
  });
});

describe('undo and redo of space commands', () => {
  it('returns the identical document for insert and remove', () => {
    const strokes = [line(10, 100, 50, 100, 5, 'a'), line(10, 500, 50, 520, 5, 'b')];
    const base: Doc = { ...threePages(), strokes };
    const opened = insertSpace(base, 300, 50);
    const ins = spaceCommand('Insert space', base, opened)!;
    expect(ins.apply(base)).toEqual(opened);
    expect(ins.revert(opened)).toEqual(base);
    expect(ins.apply(ins.revert(opened))).toEqual(opened);

    const closed = removeSpace(opened, 300, 20).doc;
    const rem = spaceCommand('Remove space', opened, closed)!;
    expect(rem.revert(closed)).toEqual(opened);
    expect(rem.apply(rem.revert(closed))).toEqual(closed);
  });
});

describe('snapping to blank bands', () => {
  // Synthetic profile at 2 rows per point: text lines (ink) at 100–110 pt and 121–131 pt,
  // a thin 1 pt blank inside the second line (e.g. between a fraction's parts) at 125–126.
  const rowsPerPt = 2;
  const rows = new Uint8Array(300 * rowsPerPt).fill(1);
  const ink = (a: number, b: number) => rows.fill(0, a * rowsPerPt, b * rowsPerPt);
  ink(100, 110);
  ink(121, 125);
  ink(126, 131);
  const bands = findBlankBands(rows, rowsPerPt);

  it('finds blank bands and ignores very thin ones', () => {
    expect(bands).toEqual([
      { top: 0, bottom: 100 },
      { top: 110, bottom: 121 },
      { top: 131, bottom: 300 },
    ]);
  });

  it('moves a cut inside a text line to the nearest blank band', () => {
    expect(snapToBlank(108, bands)).toBe(111.5); // just below line 1
    expect(snapToBlank(102, bands)).toBe(98.5); // just above line 1
    expect(snapToBlank(124, bands)).toBe(119.5);
    expect(snapToBlank(129, bands)).toBe(132.5);
  });

  it('keeps a cut that is already in a blank band', () => {
    expect(snapToBlank(115, bands)).toBe(115);
  });

  it('leaves the cut alone when no band is within the tolerance', () => {
    const dense = new Uint8Array(200).fill(0);
    dense.fill(1, 0, 10);
    const b = findBlankBands(dense, 1);
    expect(snapToBlank(100, b)).toBe(100);
    expect(snapToBlank(15, b)).toBe(8.5);
  });
});
