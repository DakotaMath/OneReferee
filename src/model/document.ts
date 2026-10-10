import { EPS, PAGE_GAP, type Doc, type PageInfo, type Segment } from './types';

/** A fresh document: one full-page slice per page with a PAGE_GAP separator between pages. */
export function createDocument(pages: readonly PageInfo[]): Doc {
  const segments: Segment[] = [];
  pages.forEach((p, i) => {
    if (i > 0) segments.push({ kind: 'gap', page: null, height: PAGE_GAP });
    segments.push({ kind: 'slice', page: i, srcTop: 0, srcBottom: p.height });
  });
  return { pages, segments, strokes: [] };
}

export function segmentHeight(s: Segment): number {
  return s.kind === 'slice' ? s.srcBottom - s.srcTop : s.height;
}

/** Vertical extent of one original page's run of slices and gaps. */
export interface PageRun {
  page: number;
  top: number;
  bottom: number;
  /** Left edge of the page in document x (pages are centred in the column). */
  left: number;
  width: number;
  firstSegment: number;
  lastSegment: number;
}

export interface Layout {
  /** Top y of each segment. */
  tops: number[];
  total: number;
  columnWidth: number;
  runs: PageRun[];
  /** runs indexed by page number. */
  runByPage: Map<number, PageRun>;
}

const layoutCache = new WeakMap<readonly Segment[], WeakMap<readonly PageInfo[], Layout>>();

/** Cumulative positions of the segments. Memoised per segments/pages array. */
export function getLayout(doc: Pick<Doc, 'segments' | 'pages'>): Layout {
  let byPages = layoutCache.get(doc.segments);
  if (!byPages) {
    byPages = new WeakMap();
    layoutCache.set(doc.segments, byPages);
  }
  const cached = byPages.get(doc.pages);
  if (cached) return cached;

  const columnWidth = doc.pages.reduce((m, p) => Math.max(m, p.width), 0);
  const tops: number[] = [];
  const runs: PageRun[] = [];
  const runByPage = new Map<number, PageRun>();
  let y = 0;
  doc.segments.forEach((s, i) => {
    tops.push(y);
    const h = segmentHeight(s);
    if (s.page !== null) {
      let run = runByPage.get(s.page);
      if (!run) {
        const w = doc.pages[s.page]?.width ?? columnWidth;
        run = {
          page: s.page,
          top: y,
          bottom: y + h,
          left: (columnWidth - w) / 2,
          width: w,
          firstSegment: i,
          lastSegment: i,
        };
        runByPage.set(s.page, run);
        runs.push(run);
      } else {
        run.bottom = y + h;
        run.lastSegment = i;
      }
    }
    y += h;
  });
  const layout: Layout = { tops, total: y, columnWidth, runs, runByPage };
  byPages.set(doc.pages, layout);
  return layout;
}

export function totalHeight(doc: Pick<Doc, 'segments' | 'pages'>): number {
  return getLayout(doc).total;
}

export interface SegmentLocation {
  index: number;
  /** Distance from the segment's top. */
  offset: number;
}

/**
 * The segment containing document y: the one with top <= y < bottom. At a boundary
 * this is the lower segment. y is clamped to the document.
 */
export function locate(doc: Pick<Doc, 'segments' | 'pages'>, y: number): SegmentLocation {
  const { tops, total } = getLayout(doc);
  const n = tops.length;
  if (n === 0) return { index: -1, offset: 0 };
  if (y <= 0) return { index: 0, offset: 0 };
  if (y >= total) {
    const last = n - 1;
    return { index: last, offset: total - tops[last] };
  }
  let lo = 0;
  let hi = n - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (tops[mid] <= y) lo = mid;
    else hi = mid - 1;
  }
  // Skip zero-height segments (should not exist, but be safe).
  return { index: lo, offset: y - tops[lo] };
}

/** Map document y to a page and source y, or null when y falls in a gap. */
export function docYToSource(
  doc: Pick<Doc, 'segments' | 'pages'>,
  y: number,
): { page: number; srcY: number; index: number } | null {
  const loc = locate(doc, y);
  if (loc.index < 0) return null;
  const s = doc.segments[loc.index];
  if (s.kind !== 'slice') return null;
  return { page: s.page, srcY: s.srcTop + loc.offset, index: loc.index };
}

/**
 * Map a source position on a page to document y. When srcY sits exactly on the
 * boundary between two split slices, the upper slice's bottom is returned.
 */
export function sourceToDocY(
  doc: Pick<Doc, 'segments' | 'pages'>,
  page: number,
  srcY: number,
): number | null {
  const { tops } = getLayout(doc);
  for (let i = 0; i < doc.segments.length; i++) {
    const s = doc.segments[i];
    if (
      s.kind === 'slice' &&
      s.page === page &&
      srcY >= s.srcTop - EPS &&
      srcY <= s.srcBottom + EPS
    ) {
      return tops[i] + (srcY - s.srcTop);
    }
  }
  return null;
}

/** The page shown at document y (a separator belongs to the page above it). */
export function pageAtY(doc: Pick<Doc, 'segments' | 'pages'>, y: number): number {
  const loc = locate(doc, y);
  for (let i = loc.index; i >= 0; i--) {
    const p = doc.segments[i].page;
    if (p !== null) return p;
  }
  return 0;
}
