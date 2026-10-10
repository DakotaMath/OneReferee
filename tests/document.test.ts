import { describe, expect, it } from 'vitest';
import {
  createDocument,
  docYToSource,
  getLayout,
  locate,
  pageAtY,
  sourceToDocY,
  totalHeight,
} from '../src/model/document';
import { PAGE_GAP, type Doc } from '../src/model/types';
import { LETTER, threePages } from './helpers/docs';

describe('createDocument', () => {
  it('makes one full-page slice per page with a 16 pt gap between pages', () => {
    const doc = threePages();
    expect(doc.segments).toEqual([
      { kind: 'slice', page: 0, srcTop: 0, srcBottom: 792 },
      { kind: 'gap', page: null, height: PAGE_GAP },
      { kind: 'slice', page: 1, srcTop: 0, srcBottom: 792 },
      { kind: 'gap', page: null, height: PAGE_GAP },
      { kind: 'slice', page: 2, srcTop: 0, srcBottom: 792 },
    ]);
    expect(totalHeight(doc)).toBe(3 * 792 + 2 * PAGE_GAP);
  });

  it('centres narrower pages in the column', () => {
    const doc = createDocument([LETTER, { width: 500, height: 700 }]);
    const l = getLayout(doc);
    expect(l.columnWidth).toBe(612);
    expect(l.runByPage.get(0)!.left).toBe(0);
    expect(l.runByPage.get(1)!.left).toBe(56);
    expect(l.runByPage.get(1)!.top).toBe(792 + PAGE_GAP);
  });
});

describe('mapping between document y, segment and source y', () => {
  const doc = threePages();

  it('locates segments, choosing the lower segment at a boundary', () => {
    expect(locate(doc, 0)).toEqual({ index: 0, offset: 0 });
    expect(locate(doc, 100)).toEqual({ index: 0, offset: 100 });
    expect(locate(doc, 792)).toEqual({ index: 1, offset: 0 });
    expect(locate(doc, 800)).toEqual({ index: 1, offset: 8 });
    expect(locate(doc, 808)).toEqual({ index: 2, offset: 0 });
    expect(locate(doc, -5)).toEqual({ index: 0, offset: 0 });
    expect(locate(doc, 1e9).index).toBe(4);
  });

  it('maps document y to source y and back', () => {
    expect(docYToSource(doc, 100)).toEqual({ page: 0, srcY: 100, index: 0 });
    expect(docYToSource(doc, 800)).toBeNull(); // in the between-page gap
    expect(docYToSource(doc, 808 + 50)).toEqual({ page: 1, srcY: 50, index: 2 });
    for (const y of [0, 10.5, 400, 791, 808, 1000, 2000, 2407]) {
      const s = docYToSource(doc, y)!;
      expect(sourceToDocY(doc, s.page, s.srcY)).toBeCloseTo(y, 9);
    }
  });

  it('maps through split slices', () => {
    const split: Doc = {
      ...doc,
      segments: [
        { kind: 'slice', page: 0, srcTop: 0, srcBottom: 300 },
        { kind: 'gap', page: 0, height: 50 },
        { kind: 'slice', page: 0, srcTop: 300, srcBottom: 792 },
        { kind: 'gap', page: null, height: 16 },
        { kind: 'slice', page: 1, srcTop: 0, srcBottom: 792 },
      ],
    };
    expect(docYToSource(split, 320)).toBeNull();
    expect(docYToSource(split, 350)).toEqual({ page: 0, srcY: 300, index: 2 });
    expect(docYToSource(split, 400)).toEqual({ page: 0, srcY: 350, index: 2 });
    expect(sourceToDocY(split, 0, 350)).toBe(400);
    expect(sourceToDocY(split, 0, 300)).toBe(300); // boundary: upper slice's bottom
    expect(sourceToDocY(split, 1, 0)).toBe(792 + 50 + 16);
    expect(pageAtY(split, 320)).toBe(0);
    expect(pageAtY(split, 845)).toBe(0); // separator belongs to the page above
    expect(pageAtY(split, 900)).toBe(1);
    const run = getLayout(split).runByPage.get(0)!;
    expect(run.bottom - run.top).toBe(842);
  });
});
