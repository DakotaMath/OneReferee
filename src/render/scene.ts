import { getLayout, locate } from '../model/document';
import type { Doc } from '../model/types';
import { PREVIEW_SCALE, type PdfRenderer } from './pdfRenderer';
import { cssPerPt, origin, screenToDoc, type View } from './viewport';

const PAGE_AREA = '#e6e7ea';

/**
 * The stack of viewport-sized canvases:
 *   pdf     – page backgrounds and PDF content (opaque)
 *   hl      – highlighter ink (CSS multiply blend over the PDF)
 *   ink     – pen ink
 *   overlay – live stroke, selection, cursors (low-latency context)
 */
export class Scene {
  readonly pdfCtx: CanvasRenderingContext2D;
  readonly hlCtx: CanvasRenderingContext2D;
  readonly inkCtx: CanvasRenderingContext2D;
  readonly overlayCtx: CanvasRenderingContext2D;
  width = 0;
  height = 0;
  dpr = 1;

  constructor(
    readonly pdfCanvas: HTMLCanvasElement,
    readonly hlCanvas: HTMLCanvasElement,
    readonly inkCanvas: HTMLCanvasElement,
    readonly overlayCanvas: HTMLCanvasElement,
  ) {
    this.pdfCtx = pdfCanvas.getContext('2d', { alpha: false })!;
    this.hlCtx = hlCanvas.getContext('2d')!;
    this.inkCtx = inkCanvas.getContext('2d')!;
    // desynchronized lets the live stroke bypass the compositor queue where supported.
    this.overlayCtx = (overlayCanvas.getContext('2d', { desynchronized: true }) ??
      overlayCanvas.getContext('2d'))!;
  }

  /** Resize all canvases to the CSS size at the given device pixel ratio. Returns true if changed. */
  resize(width: number, height: number, dpr: number): boolean {
    if (width === this.width && height === this.height && dpr === this.dpr) return false;
    this.width = width;
    this.height = height;
    this.dpr = dpr;
    for (const c of [this.pdfCanvas, this.hlCanvas, this.inkCanvas, this.overlayCanvas]) {
      c.width = Math.max(1, Math.round(width * dpr));
      c.height = Math.max(1, Math.round(height * dpr));
      c.style.width = `${width}px`;
      c.style.height = `${height}px`;
    }
    return true;
  }

  clearPdf(): void {
    const ctx = this.pdfCtx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = PAGE_AREA;
    ctx.fillRect(0, 0, this.pdfCanvas.width, this.pdfCanvas.height);
  }

  /**
   * Draw page backgrounds and PDF content for the visible part of the document.
   * `sharp` requests full-resolution tiles (false while a zoom is still changing).
   */
  drawPdf(doc: Doc, view: View, renderer: PdfRenderer | null, sharp: boolean): void {
    this.clearPdf();
    const ctx = this.pdfCtx;
    const dpr = this.dpr;
    const layout = getLayout(doc);
    const ext = { columnWidth: layout.columnWidth, total: layout.total };
    const k = cssPerPt(view.zoom);
    const S = k * dpr; // device pixels per point
    const o = origin(view, ext);
    const top = screenToDoc(view, ext, 0, 0).y;
    const bottom = screenToDoc(view, ext, 0, view.height).y;
    const buffer = (bottom - top) * 0.5;

    renderer?.beginFrame();

    // Page backgrounds with a subtle edge and shadow, one per page run.
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    for (const run of layout.runs) {
      if (run.bottom < top - buffer || run.top > bottom + buffer) continue;
      const x = o.x + run.left * k;
      const y = o.y + run.top * k;
      const w = run.width * k;
      const h = (run.bottom - run.top) * k;
      ctx.save();
      ctx.shadowColor = 'rgba(0,0,0,0.18)';
      ctx.shadowBlur = 6;
      ctx.shadowOffsetY = 1;
      ctx.fillStyle = '#fff';
      ctx.fillRect(x, y, w, h);
      ctx.restore();
      ctx.strokeStyle = 'rgba(0,0,0,0.12)';
      ctx.lineWidth = 1;
      ctx.strokeRect(x - 0.5, y - 0.5, w + 1, h + 1);
      // Prefetch previews of nearby pages.
      if (renderer && (run.bottom < top || run.top > bottom)) renderer.preview(run.page, 3);
    }

    if (!renderer || doc.segments.length === 0) return;

    const first = locate(doc, top - buffer).index;
    const last = locate(doc, bottom + buffer).index;
    const vwDev = this.pdfCanvas.width;
    const vhDev = this.pdfCanvas.height;
    for (let i = first; i <= last; i++) {
      const seg = doc.segments[i];
      if (seg.kind !== 'slice') continue;
      const run = layout.runByPage.get(seg.page)!;
      const segTop = layout.tops[i];
      const segH = seg.srcBottom - seg.srcTop;
      const visible = segTop + segH >= top && segTop <= bottom;

      // Device-space geometry, rounded so text lands on whole pixels.
      const pageLeftDev = Math.round((o.x + run.left * k) * dpr);
      const sliceTopDev = Math.round((o.y + segTop * k) * dpr);
      const sliceHDev = Math.round((o.y + (segTop + segH) * k) * dpr) - sliceTopDev;
      const pageWDev = Math.round(run.width * S);
      if (sliceHDev <= 0) continue;

      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.beginPath();
      ctx.rect(pageLeftDev, sliceTopDev, pageWDev, sliceHDev);
      ctx.clip();

      const prev = renderer.preview(seg.page, visible ? 20 : 3);
      const srcOffsetDev = sliceTopDev - Math.round(seg.srcTop * S);

      // Which part of the page (in page device pixels at scale S) is on screen?
      const px0 = Math.max(0, -pageLeftDev);
      const px1 = Math.min(pageWDev, vwDev - pageLeftDev);
      const visTop = Math.max(sliceTopDev, visible ? 0 : -vhDev / 2);
      const visBottom = Math.min(sliceTopDev + sliceHDev, visible ? vhDev : vhDev * 1.5);
      const py0 = visTop - srcOffsetDev;
      const py1 = visBottom - srcOffsetDev;

      const { tiles, complete } =
        px1 > px0 && py1 > py0
          ? renderer.tilesFor(seg.page, S, px0, py0, px1, py1, sharp, visible ? 10 : 1)
          : { tiles: [], complete: true };

      // Fall back to the preview wherever sharp tiles are missing.
      if (prev && (!complete || !sharp)) {
        const scale = S / PREVIEW_SCALE;
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(prev, pageLeftDev, srcOffsetDev, prev.width * scale, prev.height * scale);
      }
      for (const t of tiles) {
        ctx.drawImage(t.canvas, pageLeftDev + t.x, srcOffsetDev + t.y);
      }
      ctx.restore();
    }
  }
}
