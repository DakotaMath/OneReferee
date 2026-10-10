import {
  BlendMode,
  PDFDocument,
  clip,
  endPath,
  popGraphicsState,
  pushGraphicsState,
  rectangle,
  rgb,
  type PDFPage,
} from 'pdf-lib';
import { getLayout, type PageRun } from '../model/document';
import { strokeOutlinePath } from '../model/outline';
import { round2 } from '../model/geometry';
import type { Doc, Stroke } from '../model/types';

export interface ExportResult {
  bytes: Uint8Array;
  /** Strokes that lie entirely outside every page (e.g. in the gray margin) and could not be exported. */
  skippedStrokes: number;
}

function hexToRgb(hex: string) {
  const n = parseInt(hex.slice(1), 16);
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
}

/**
 * Matrix for an embedded page so its crop box, rotated as displayed, maps to
 * (0, 0)–(displayWidth, displayHeight).
 */
function displayMatrix(
  rotation: number,
  l: number,
  b: number,
  w: number,
  h: number,
): [number, number, number, number, number, number] {
  switch (((rotation % 360) + 360) % 360) {
    case 90:
      return [0, -1, 1, 0, -b, w + l];
    case 180:
      return [-1, 0, 0, -1, w + l, h + b];
    case 270:
      return [0, 1, -1, 0, h + b, -l];
    default:
      return [1, 0, 0, 1, -l, -b];
  }
}

function strokeTouchesRun(s: Stroke, run: PageRun): boolean {
  const pad = s.width;
  return (
    s.bbox.maxY + pad >= run.top &&
    s.bbox.minY - pad <= run.bottom &&
    s.bbox.maxX + pad >= run.left &&
    s.bbox.minX - pad <= run.left + run.width
  );
}

function drawInk(page: PDFPage, strokes: readonly Stroke[], run: PageRun, height: number): void {
  // Highlighter first (below), then pen ink.
  for (const tool of ['highlighter', 'pen'] as const) {
    for (const s of strokes) {
      if (s.tool !== tool || !strokeTouchesRun(s, run)) continue;
      const d = strokeOutlinePath(s);
      if (!d) continue;
      page.drawSvgPath(d, {
        x: s.ox - run.left,
        y: height - (s.oy - run.top),
        color: hexToRgb(s.color),
        borderWidth: 0,
        blendMode: tool === 'highlighter' ? BlendMode.Darken : BlendMode.Normal,
      });
    }
  }
}

/**
 * Write a new PDF: each original page becomes one page made taller by its inserted gaps.
 * The original page content is embedded once per page as a vector form XObject and drawn
 * once per slice, clipped to that slice (never rasterised). Ink is drawn as filled vector
 * paths from the perfect-freehand outlines.
 */
export async function exportAnnotatedPdf(pdfBytes: Uint8Array, doc: Doc): Promise<ExportResult> {
  const src = await PDFDocument.load(pdfBytes, { ignoreEncryption: true, updateMetadata: false });
  const out = await PDFDocument.create();
  const title = src.getTitle();
  out.setTitle(title ? `${title} (annotated)` : 'Annotated PDF');
  out.setProducer('PDF Spacer Notes');
  out.setCreator('PDF Spacer Notes');

  const srcPages = src.getPages();
  const layout = getLayout(doc);

  for (const run of layout.runs) {
    const sp = srcPages[run.page];
    const info = doc.pages[run.page];
    if (!sp || !info) continue;
    const crop = sp.getCropBox();
    const bbox = {
      left: crop.x,
      bottom: crop.y,
      right: crop.x + crop.width,
      top: crop.y + crop.height,
    };
    const matrix = displayMatrix(sp.getRotation().angle, crop.x, crop.y, crop.width, crop.height);
    // A page without a content stream (a blank page) can't be embedded; it stays blank.
    const embedded = sp.node.Contents() ? await out.embedPage(sp, bbox, matrix) : null;

    const W = info.width;
    const H = round2(run.bottom - run.top);
    const page = out.addPage([W, H]);

    for (let i = run.firstSegment; i <= run.lastSegment; i++) {
      const seg = doc.segments[i];
      if (seg.kind !== 'slice' || !embedded) continue;
      const dTop = layout.tops[i] - run.top;
      const h = seg.srcBottom - seg.srcTop;
      // Place the page so source y = srcTop (from the top) lands at output y = dTop (from the top).
      const y = H - dTop - info.height + seg.srcTop;
      page.pushOperators(pushGraphicsState(), rectangle(0, H - dTop - h, W, h), clip(), endPath());
      page.drawPage(embedded, { x: 0, y, xScale: 1, yScale: 1 });
      page.pushOperators(popGraphicsState());
    }

    drawInk(page, doc.strokes, run, H);
  }

  const skippedStrokes = doc.strokes.filter(
    (s) => !layout.runs.some((r) => strokeTouchesRun(s, r)),
  ).length;
  const bytes = await out.save();
  return { bytes, skippedStrokes };
}
