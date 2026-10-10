import {
  GlobalWorkerOptions,
  getDocument,
  type PDFDocumentProxy,
  type PDFPageProxy,
} from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import type { PageInfo } from '../model/types';

GlobalWorkerOptions.workerSrc = workerUrl;

const asset = (p: string) => new URL(`./pdfjs/${p}/`, document.baseURI).href;

/** Load a PDF with PDF.js. The bytes are copied because PDF.js transfers its buffer to the worker. */
export async function loadPdf(
  bytes: Uint8Array,
): Promise<{ pdf: PDFDocumentProxy; pages: PageInfo[] }> {
  const pdf = await getDocument({
    data: bytes.slice(),
    cMapUrl: asset('cmaps'),
    cMapPacked: true,
    standardFontDataUrl: asset('standard_fonts'),
    wasmUrl: asset('wasm'),
    iccUrl: asset('iccs'),
  }).promise;
  const pages: PageInfo[] = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const vp = page.getViewport({ scale: 1 });
    pages.push({
      width: Math.round(vp.width * 100) / 100,
      height: Math.round(vp.height * 100) / 100,
    });
  }
  return { pdf, pages };
}

/** Device pixels per point for the low-resolution page previews (also used for blank-row scanning). */
export const PREVIEW_SCALE = 1.5;
const TILE_H = 1024;
const MAX_TILE_W = 2048;
/** Pixel budget for cached sharp tiles (~4 bytes each). */
const TILE_PIXEL_BUDGET = 40_000_000;
const MAX_PREVIEWS = 20;

export interface Tile {
  canvas: HTMLCanvasElement;
  /** Position and size in device pixels of the page rendered at `scale`. */
  x: number;
  y: number;
  w: number;
  h: number;
  scale: number;
}

interface Job {
  key: string;
  priority: number;
  run: () => Promise<void>;
}

/**
 * Renders PDF pages lazily: low-resolution previews per page, plus sharp tiles at the
 * current device scale for visible regions. The view asks for what it needs every frame
 * (`want*`), then `pump()` renders the most urgent missing item, one at a time.
 */
export class PdfRenderer {
  private pageProxies = new Map<number, Promise<PDFPageProxy>>();
  private previews = new Map<number, HTMLCanvasElement>();
  private tiles = new Map<string, Tile>();
  private tilePixels = 0;
  private blankRows = new Map<number, Uint8Array>();
  private wanted = new Map<string, Job>();
  private busy = false;
  private destroyed = false;

  constructor(
    private pdf: PDFDocumentProxy,
    private pages: readonly PageInfo[],
    private onUpdate: () => void,
  ) {}

  destroy(): void {
    this.destroyed = true;
    this.wanted.clear();
    this.tiles.clear();
    this.previews.clear();
    void this.pdf.destroy();
  }

  private getPage(i: number): Promise<PDFPageProxy> {
    let p = this.pageProxies.get(i);
    if (!p) {
      p = this.pdf.getPage(i + 1);
      this.pageProxies.set(i, p);
    }
    return p;
  }

  /** Start a frame: forget last frame's requests. */
  beginFrame(): void {
    this.wanted.clear();
  }

  /** Low-res preview of a page, or null if not rendered yet (and requests it). */
  preview(page: number, priority = 0): HTMLCanvasElement | null {
    const c = this.previews.get(page);
    if (c) {
      // LRU touch
      this.previews.delete(page);
      this.previews.set(page, c);
      return c;
    }
    this.want(`p:${page}`, priority, () => this.renderPreview(page));
    return null;
  }

  /** Blank-row profile of a page (1 = blank row), at PREVIEW_SCALE rows per point. */
  blankRowProfile(page: number): Uint8Array | null {
    const r = this.blankRows.get(page);
    if (!r) this.want(`p:${page}`, 5, () => this.renderPreview(page));
    return r ?? null;
  }

  /** Tile grid for a page at a scale. */
  tileGrid(page: number, scale: number) {
    const info = this.pages[page];
    const pw = Math.ceil(info.width * scale);
    const ph = Math.ceil(info.height * scale);
    const cols = Math.max(1, Math.ceil(pw / MAX_TILE_W));
    const tw = Math.ceil(pw / cols);
    const rows = Math.max(1, Math.ceil(ph / TILE_H));
    return { pw, ph, cols, rows, tw, th: TILE_H };
  }

  /**
   * Sharp tiles covering device-pixel rect (x0..x1, y0..y1) of the page rendered at `scale`.
   * Missing tiles are requested when `request` is true.
   */
  tilesFor(
    page: number,
    scale: number,
    x0: number,
    y0: number,
    x1: number,
    y1: number,
    request: boolean,
    priority: number,
  ): { tiles: Tile[]; complete: boolean } {
    const g = this.tileGrid(page, scale);
    const out: Tile[] = [];
    const c0 = Math.max(0, Math.floor(x0 / g.tw));
    const c1 = Math.min(g.cols - 1, Math.floor((x1 - 1) / g.tw));
    const r0 = Math.max(0, Math.floor(y0 / g.th));
    const r1 = Math.min(g.rows - 1, Math.floor((y1 - 1) / g.th));
    const sk = scale.toFixed(4);
    let complete = true;
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        const key = `t:${page}:${sk}:${c}:${r}`;
        const t = this.tiles.get(key);
        if (t) {
          this.tiles.delete(key);
          this.tiles.set(key, t);
          out.push(t);
        } else {
          complete = false;
          if (!request) continue;
          const x = c * g.tw;
          const y = r * g.th;
          const w = Math.min(g.tw, g.pw - x);
          const h = Math.min(g.th, g.ph - y);
          this.want(key, priority, () => this.renderTile(key, page, scale, x, y, w, h));
        }
      }
    }
    return { tiles: out, complete };
  }

  private want(key: string, priority: number, run: () => Promise<void>): void {
    const existing = this.wanted.get(key);
    if (!existing || existing.priority < priority) this.wanted.set(key, { key, priority, run });
  }

  /** Render the most urgent wanted item, if idle. */
  pump(): void {
    if (this.busy || this.destroyed || this.wanted.size === 0) return;
    let best: Job | null = null;
    for (const j of this.wanted.values()) if (!best || j.priority > best.priority) best = j;
    if (!best) return;
    this.wanted.delete(best.key);
    this.busy = true;
    best
      .run()
      .catch((err) => console.warn('PDF render failed', err))
      .finally(() => {
        this.busy = false;
        if (this.destroyed) return;
        this.onUpdate();
      });
  }

  private async renderPreview(page: number): Promise<void> {
    if (this.previews.has(page)) return;
    const proxy = await this.getPage(page);
    const vp = proxy.getViewport({ scale: PREVIEW_SCALE });
    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(vp.width);
    canvas.height = Math.ceil(vp.height);
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
    await proxy.render({ canvas, canvasContext: ctx, viewport: vp }).promise;
    if (!this.blankRows.has(page)) {
      this.blankRows.set(page, scanBlankRows(ctx.getImageData(0, 0, canvas.width, canvas.height)));
    }
    this.previews.set(page, canvas);
    while (this.previews.size > MAX_PREVIEWS) {
      const oldest = this.previews.keys().next().value as number;
      this.previews.delete(oldest);
    }
  }

  private async renderTile(
    key: string,
    page: number,
    scale: number,
    x: number,
    y: number,
    w: number,
    h: number,
  ): Promise<void> {
    if (this.tiles.has(key)) return;
    const proxy = await this.getPage(page);
    const vp = proxy.getViewport({ scale });
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d', { alpha: false })!;
    await proxy.render({
      canvas,
      canvasContext: ctx,
      viewport: vp,
      transform: [1, 0, 0, 1, -x, -y],
    }).promise;
    this.tiles.set(key, { canvas, x, y, w, h, scale });
    this.tilePixels += w * h;
    for (const [k, t] of this.tiles) {
      if (this.tilePixels <= TILE_PIXEL_BUDGET) break;
      if (k === key) continue;
      this.tiles.delete(k);
      this.tilePixels -= t.w * t.h;
      t.canvas.width = 0; // release memory promptly
    }
  }

  /** Drop sharp tiles not at `scale` (after zoom settles) to free memory sooner. */
  dropOtherScales(scale: number): void {
    const sk = `:${scale.toFixed(4)}:`;
    for (const [k, t] of this.tiles) {
      if (!k.includes(sk)) {
        this.tiles.delete(k);
        this.tilePixels -= t.w * t.h;
        t.canvas.width = 0;
      }
    }
  }
}

/** 1 for rows whose pixels are all near-white. */
export function scanBlankRows(img: ImageData): Uint8Array {
  const { width, height, data } = img;
  const rows = new Uint8Array(height);
  for (let y = 0; y < height; y++) {
    let blank = 1;
    let i = y * width * 4;
    for (let x = 0; x < width; x++, i += 4) {
      if (data[i] < 225 || data[i + 1] < 225 || data[i + 2] < 225) {
        blank = 0;
        break;
      }
    }
    rows[y] = blank;
  }
  return rows;
}
