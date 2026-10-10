import type { PDFDocumentProxy } from 'pdfjs-dist';
import { createDocument, getLayout, pageAtY } from './model/document';
import type { Doc } from './model/types';
import { loadPdf, PdfRenderer } from './render/pdfRenderer';
import { Scene } from './render/scene';
import {
  clampView,
  cssPerPt,
  fitWidthZoom,
  maxScroll,
  nextZoomStep,
  screenToDoc,
  zoomAt,
  type DocExtent,
  type View,
} from './render/viewport';
import type { Gesture, Sample } from './input/gesture';
import { createPanGesture } from './tools/hand';
import { Toolbar } from './ui/toolbar';
import { StatusBar } from './ui/statusbar';
import { Scrollbars } from './ui/scrollbars';
import { loadSettings, saveSettings, type Settings } from './ui/settings';
import { toast } from './ui/toast';
import { pickFileToOpen, isProjectName, type FsFileHandle } from './io/files';
import { makeSamplePdf } from './io/samplePdf';
import type { ToolId } from './tools/toolTypes';
import type { ShortcutTarget } from './ui/shortcuts';
import { History } from './model/history';
import type { Command } from './model/commands';
import { drawStrokes, type DeviceTransform } from './render/ink';
import { DrawGesture } from './tools/draw';
import { SpaceGesture, drawCutGuide } from './tools/space';
import { EraseGesture } from './tools/erase';
import { docYToSource } from './model/document';
import { findBlankBands, snapToBlank, type Band } from './model/snap';
import { PREVIEW_SCALE } from './render/pdfRenderer';
import { origin } from './render/viewport';
import {
  ERASER_SIZES,
  HIGHLIGHTER_COLORS,
  HIGHLIGHTER_WIDTHS,
  PEN_COLORS,
  PEN_WIDTHS,
} from './tools/toolTypes';

const ZOOM_SETTLE_MS = 180;

export class App implements ShortcutTarget {
  doc: Doc | null = null;
  /** A temporary document shown instead of `doc` during a gesture (live previews). */
  previewDoc: Doc | null = null;
  readonly history = new History();
  pdfBytes: Uint8Array | null = null;
  renderer: PdfRenderer | null = null;
  fileName: string | null = null;
  fileHandle: FsFileHandle | null = null;
  dirty = false;
  statusMessage = '';

  view: View = { zoom: 1, scrollX: 0, scrollY: 0, width: 1, height: 1 };
  tool: ToolId = 'pen';
  settings: Settings = loadSettings();

  readonly scene: Scene;
  readonly stage: HTMLElement;
  private readonly viewer: HTMLElement;
  private readonly toolbar: Toolbar;
  private readonly statusbar: StatusBar;
  private readonly scrollbars: Scrollbars;

  private gesture: Gesture | null = null;
  private gesturePointer: number | null = null;
  /** Last pointer position over the stage (screen coords), for cursors and paste. */
  pointer: { sx: number; sy: number; inside: boolean; type: string } = {
    sx: 0,
    sy: 0,
    inside: false,
    type: 'mouse',
  };
  /** Space bar held: temporary hand tool. */
  spaceHeld = false;
  /** Incremented on each pointer gesture (lets shortcuts tell a key hold from a tap). */
  gestureCount = 0;

  private needPdf = true;
  private needInk = true;
  private needOverlay = true;
  private frameRequested = false;
  private lastZoomChange = 0;
  private settleTimer = 0;

  constructor() {
    this.viewer = document.getElementById('viewer')!;
    this.stage = document.getElementById('stage')!;
    this.scene = new Scene(
      document.getElementById('pdf-canvas') as HTMLCanvasElement,
      document.getElementById('hl-canvas') as HTMLCanvasElement,
      document.getElementById('ink-canvas') as HTMLCanvasElement,
      document.getElementById('overlay-canvas') as HTMLCanvasElement,
    );
    this.toolbar = new Toolbar(document.getElementById('toolbar')!, {
      open: () => void this.open(),
      save: () => void this.save(false),
      exportPdf: () => void this.exportPdf(),
      undo: () => this.undo(),
      redo: () => this.redo(),
      setTool: (t) => this.setTool(t),
      toggleEraserMode: () => this.toggleEraserMode(),
      setColor: (c) => this.setColor(c),
      setCustomColor: (c) => this.setCustomColor(c),
      setWidth: (id) => this.setWidth(id),
      zoomIn: () => this.zoomStep(1),
      zoomOut: () => this.zoomStep(-1),
      fitWidth: () => this.fitWidth(),
      toggleFullscreen: () => this.toggleFullscreen(),
    });
    this.statusbar = new StatusBar(document.getElementById('statusbar')!);
    this.scrollbars = new Scrollbars(
      document.getElementById('vscroll')!,
      document.getElementById('hscroll')!,
      (x, y) => this.setView({ ...this.view, scrollX: x, scrollY: y }),
    );

    this.installResizeHandling();
    this.installPointerHandling();
    this.installWheel();
    this.installDragDrop();
    document.addEventListener('fullscreenchange', () => this.refreshUi());
    document.getElementById('empty-open')!.addEventListener('click', () => void this.open());
    document
      .getElementById('empty-sample')!
      .addEventListener('click', () => void this.openSample());
    this.refreshUi();
  }

  // ---------------------------------------------------------------- view

  ext(): DocExtent {
    if (!this.doc) return { columnWidth: 612, total: 792 };
    const l = getLayout(this.doc);
    return { columnWidth: l.columnWidth, total: l.total };
  }

  setView(v: View): void {
    const next = clampView(v, this.ext());
    if (next.zoom !== this.view.zoom) this.noteZoomChange();
    this.view = next;
    this.invalidate();
    this.refreshUi();
  }

  scrollBy(dx: number, dy: number): void {
    this.setView({
      ...this.view,
      scrollX: this.view.scrollX + dx,
      scrollY: this.view.scrollY + dy,
    });
  }

  /** Zoom to `zoom` keeping the document point under (sx, sy) fixed (default: viewport centre). */
  zoomTo(zoom: number, sx = this.view.width / 2, sy = this.view.height / 2): void {
    this.noteZoomChange();
    this.view = zoomAt(this.view, this.ext(), zoom, sx, sy);
    this.invalidate();
    this.refreshUi();
  }

  zoomStep(dir: 1 | -1): void {
    this.zoomTo(nextZoomStep(this.view.zoom, dir));
  }

  fitWidth(): void {
    const ext = this.ext();
    const z = fitWidthZoom(this.view.width, ext.columnWidth);
    // Keep the document point at the top of the viewport.
    this.zoomTo(z, this.view.width / 2, 0);
  }

  private noteZoomChange(): void {
    this.lastZoomChange = performance.now();
    clearTimeout(this.settleTimer);
    this.settleTimer = window.setTimeout(() => {
      this.renderer?.dropOtherScales(this.deviceScale());
      this.invalidate(true, false, false);
    }, ZOOM_SETTLE_MS + 20);
  }

  deviceScale(): number {
    return cssPerPt(this.view.zoom) * this.scene.dpr;
  }

  /** Convert a client-space point to a stage sample position. */
  toDoc(sx: number, sy: number): { x: number; y: number } {
    return screenToDoc(this.view, this.ext(), sx, sy);
  }

  // ---------------------------------------------------------------- rendering

  invalidate(pdf = true, ink = true, overlay = true): void {
    this.needPdf ||= pdf;
    this.needInk ||= ink;
    this.needOverlay ||= overlay;
    if (!this.frameRequested) {
      this.frameRequested = true;
      requestAnimationFrame(() => this.frame());
    }
  }

  private frame(): void {
    this.frameRequested = false;
    const doc = this.doc;
    if (this.needPdf) {
      this.needPdf = false;
      if (doc) {
        const sharp = performance.now() - this.lastZoomChange > ZOOM_SETTLE_MS;
        this.scene.drawPdf(this.displayDoc!, this.view, this.renderer, sharp);
      } else {
        this.scene.clearPdf();
      }
    }
    if (this.needInk) {
      this.needInk = false;
      this.drawInk();
    }
    if (this.needOverlay) {
      this.needOverlay = false;
      this.drawOverlay();
    }
    this.renderer?.pump();
  }

  /** The document as currently displayed (a live preview while a gesture is in progress). */
  get displayDoc(): Doc | null {
    return this.previewDoc ?? this.doc;
  }

  deviceTransform(): DeviceTransform {
    const o = origin(this.view, this.ext());
    return { ox: o.x, oy: o.y, k: cssPerPt(this.view.zoom), dpr: this.scene.dpr };
  }

  /** The visible document rectangle. */
  visibleDocRect() {
    const a = this.toDoc(0, 0);
    const b = this.toDoc(this.view.width, this.view.height);
    return { minX: a.x, minY: a.y, maxX: b.x, maxY: b.y };
  }

  /** Strokes hidden from the committed ink layers (drawn on the overlay instead, e.g. while dragging). */
  hiddenStrokeIds: ReadonlySet<string> | undefined;

  protected drawInk(): void {
    const s = this.scene;
    const doc = this.displayDoc;
    if (!doc) {
      for (const ctx of [s.hlCtx, s.inkCtx]) {
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
      }
      return;
    }
    const t = this.deviceTransform();
    const vis = this.visibleDocRect();
    drawStrokes(s.hlCtx, doc.strokes, 'highlighter', t, vis, this.hiddenStrokeIds);
    drawStrokes(s.inkCtx, doc.strokes, 'pen', t, vis, this.hiddenStrokeIds);
  }

  /** Draw the overlay layer: live stroke, selection, cursor. */
  protected drawOverlay(): void {
    const ctx = this.scene.overlayCtx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    if (!this.doc) return;
    const t = this.deviceTransform();
    const g = this.gesture;
    const multiply = g instanceof DrawGesture && g.tool === 'highlighter';
    this.scene.overlayCanvas.classList.toggle('multiply', multiply);
    this.drawOverlayExtras(ctx, t);
    g?.drawOverlay?.(ctx, t);
    this.drawCursor(ctx, t);
  }

  /** Selection boxes, insert-space guide, etc. */
  protected drawOverlayExtras(ctx: CanvasRenderingContext2D, t: DeviceTransform): void {
    const doc = this.doc!;
    if (!this.gesture && this.effectiveTool() === 'space' && this.pointer.inside) {
      const p = this.toDoc(this.pointer.sx, this.pointer.sy);
      drawCutGuide(ctx, doc, this.snapCut(p.y, this.altDown), t);
    }
  }

  /** Alt is held (insert space without snapping). */
  altDown = false;

  isAltDown(): boolean {
    return this.altDown;
  }

  private bandCache = new WeakMap<Uint8Array, Band[]>();

  /** Snap a cut at document y to the nearest blank band of the PDF (within ~12 pt). */
  snapCut(y: number, noSnap: boolean): number {
    const doc = this.displayDoc;
    if (!doc || noSnap || !this.renderer) return y;
    const src = docYToSource(doc, y);
    if (!src) return y; // already in blank space
    const rows = this.renderer.blankRowProfile(src.page);
    if (!rows) return y;
    let bands = this.bandCache.get(rows);
    if (!bands) {
      bands = findBlankBands(rows, PREVIEW_SCALE);
      this.bandCache.set(rows, bands);
    }
    const seg = doc.segments[src.index];
    if (seg.kind !== 'slice') return y;
    const snapped = Math.min(Math.max(snapToBlank(src.srcY, bands), seg.srcTop), seg.srcBottom);
    return y + (snapped - src.srcY);
  }

  /** Tool cursor drawn at the pen tip (pen dot / eraser circle). */
  protected drawCursor(ctx: CanvasRenderingContext2D, t: DeviceTransform): void {
    if (!this.pointer.inside) return;
    const tool = this.gesture instanceof EraseGesture ? 'eraser' : this.effectiveTool();
    const dpr = t.dpr;
    const x = this.pointer.sx * dpr;
    const y = this.pointer.sy * dpr;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (tool === 'pen' || tool === 'highlighter') {
      const isPen = tool === 'pen';
      const w = this.currentWidth(tool);
      const r = Math.max(1.5 * dpr, (w * t.k * dpr) / 2);
      ctx.beginPath();
      if (isPen) ctx.arc(x, y, r, 0, Math.PI * 2);
      else ctx.rect(x - r * 0.35, y - r, r * 0.7, r * 2);
      ctx.fillStyle = isPen ? this.settings.penColor : this.settings.highlighterColor;
      ctx.globalAlpha = isPen ? 1 : 0.8;
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.lineWidth = dpr;
      ctx.strokeStyle = 'rgba(255,255,255,0.9)';
      ctx.stroke();
    } else if (tool === 'eraser') {
      const r = Math.max(2 * dpr, this.currentWidth('eraser') * t.k * dpr);
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      ctx.fill();
      ctx.lineWidth = 1.5 * dpr;
      ctx.strokeStyle = 'rgba(30,30,30,0.85)';
      ctx.stroke();
      if (this.settings.eraserMode === 'stroke') {
        // A small cross marks the stroke eraser (removes whole strokes).
        const c = r * 0.35;
        ctx.beginPath();
        ctx.moveTo(x - c, y - c);
        ctx.lineTo(x + c, y + c);
        ctx.moveTo(x + c, y - c);
        ctx.lineTo(x - c, y + c);
        ctx.lineWidth = dpr;
        ctx.stroke();
      }
    }
  }

  /** Width in points for the pen/highlighter, or eraser radius. */
  currentWidth(tool: ToolId): number {
    const st = this.settings;
    if (tool === 'pen')
      return (PEN_WIDTHS.find((w) => w.id === st.penWidth) ?? PEN_WIDTHS[1]).width;
    if (tool === 'highlighter')
      return (HIGHLIGHTER_WIDTHS.find((w) => w.id === st.highlighterWidth) ?? HIGHLIGHTER_WIDTHS[0])
        .width;
    return (ERASER_SIZES.find((w) => w.id === st.eraserSize) ?? ERASER_SIZES[1]).width;
  }

  invalidateOverlay(immediate = false): void {
    if (immediate) {
      // Draw the live stroke right away (inside the pointer event) for minimum latency.
      this.needOverlay = false;
      this.drawOverlay();
    } else {
      this.invalidate(false, false, true);
    }
  }

  // ---------------------------------------------------------------- editing

  /** Apply a command, record it for undo, and mark the document changed. */
  commit(cmd: Command): void {
    if (!this.doc) return;
    this.doc = cmd.apply(this.doc);
    this.previewDoc = null;
    this.history.push(cmd);
    this.afterChange();
  }

  /** Called after any change to `doc` (commit, undo, redo). */
  protected afterChange(): void {
    this.dirty = this.history.isDirty;
    this.view = clampView(this.view, this.ext());
    this.invalidate(true, true, true);
    this.refreshUi();
  }

  canUndo(): boolean {
    return this.history.canUndo && !this.gesture;
  }

  canRedo(): boolean {
    return this.history.canRedo && !this.gesture;
  }

  undo(): void {
    if (!this.doc || this.gesture) return;
    const d = this.history.undo(this.doc);
    if (d) {
      this.doc = d;
      this.afterChange();
    }
  }

  redo(): void {
    if (!this.doc || this.gesture) return;
    const d = this.history.redo(this.doc);
    if (d) {
      this.doc = d;
      this.afterChange();
    }
  }

  /** Report pointer type and pressures of a finished stroke (for the Windows Ink tip). */
  noteInput(_pointerType: string, _pressures: number[]): void {}

  refreshUi(): void {
    const doc = this.doc;
    this.toolbar.update({
      tool: this.tool,
      hasDoc: !!doc,
      canUndo: this.canUndo(),
      canRedo: this.canRedo(),
      zoom: this.view.zoom,
      fullscreen: !!document.fullscreenElement,
      settings: this.settings,
    });
    const center = doc ? this.toDoc(this.view.width / 2, this.view.height / 2).y : 0;
    this.statusbar.update({
      fileName: this.fileName,
      dirty: this.dirty,
      page: doc ? pageAtY(doc, center) : 0,
      pageCount: doc?.pages.length ?? 0,
      zoom: this.view.zoom,
      message: this.statusMessage,
    });
    document.title = `${this.dirty ? '● ' : ''}${this.fileName ? this.fileName + ' — ' : ''}PDF Spacer Notes`;
    document.getElementById('empty-state')!.classList.toggle('hidden', !!doc);
    if (doc) {
      const m = maxScroll(this.view, this.ext());
      this.scrollbars.update(this.view, m);
    } else {
      this.scrollbars.update(this.view, { x: 0, y: 0 });
    }
    this.updateCursor();
  }

  protected updateCursor(): void {
    const t = this.gesture instanceof EraseGesture ? 'eraser' : this.effectiveTool();
    let cursor = 'default';
    if (!this.doc) cursor = 'default';
    else if (this.gesture?.cursor) cursor = this.gesture.cursor;
    else if (t === 'hand') cursor = 'grab';
    else if (t === 'pen' || t === 'highlighter' || t === 'eraser') cursor = 'none';
    else if (t === 'lasso' || t === 'rect') cursor = 'crosshair';
    else if (t === 'space') cursor = 'row-resize';
    this.stage.style.cursor = cursor;
  }

  /** The tool in effect right now, including temporary overrides (Space held). */
  effectiveTool(): ToolId {
    return this.spaceHeld ? 'hand' : this.tool;
  }

  // ---------------------------------------------------------------- setup

  private installResizeHandling(): void {
    const apply = () => {
      const r = this.viewer.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      const changed = this.scene.resize(Math.round(r.width), Math.round(r.height), dpr);
      if (changed) {
        const first = this.view.width <= 1;
        this.view = clampView(
          { ...this.view, width: this.scene.width, height: this.scene.height },
          this.ext(),
        );
        if (!first) this.noteZoomChange();
        this.invalidate();
        this.refreshUi();
      }
    };
    new ResizeObserver(apply).observe(this.viewer);
    // Re-render at the new resolution when the window moves to a monitor with different scaling.
    const watchDpr = () => {
      const mq = matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`);
      mq.addEventListener(
        'change',
        () => {
          apply();
          watchDpr();
        },
        { once: true },
      );
    };
    watchDpr();
    apply();
  }

  private sampleFrom(e: PointerEvent): Sample {
    const r = this.stage.getBoundingClientRect();
    const sx = e.clientX - r.left;
    const sy = e.clientY - r.top;
    const d = this.toDoc(sx, sy);
    let pressure = e.pressure;
    if (e.pointerType === 'mouse' || !(pressure > 0)) pressure = 0.5;
    return {
      sx,
      sy,
      x: d.x,
      y: d.y,
      pressure,
      pointerType: e.pointerType,
      buttons: e.buttons,
      altKey: e.altKey,
      shiftKey: e.shiftKey,
      time: e.timeStamp,
    };
  }

  private installPointerHandling(): void {
    const stage = this.stage;
    stage.addEventListener('contextmenu', (e) => e.preventDefault());
    stage.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'touch') return; // no touch screen on the Kamvas; ignore touch input
      if (this.gesture) {
        // A second pointer while one is active (e.g. pen + mouse): ignore.
        return;
      }
      if (!this.doc) return;
      e.preventDefault();
      stage.focus({ preventScroll: true });
      const s = this.sampleFrom(e);
      const g = this.startGesture(s, e);
      if (!g) return;
      this.gesture = g;
      this.gesturePointer = e.pointerId;
      this.gestureCount++;
      try {
        stage.setPointerCapture(e.pointerId);
      } catch {
        // ignore
      }
      this.updateCursor();
    });
    stage.addEventListener('pointermove', (e) => {
      if (e.pointerType === 'touch') return;
      const s = this.sampleFrom(e);
      this.pointer = { sx: s.sx, sy: s.sy, inside: true, type: e.pointerType };
      if (this.gesture && e.pointerId === this.gesturePointer) {
        const events = typeof e.getCoalescedEvents === 'function' ? e.getCoalescedEvents() : [];
        const samples = events.length ? events.map((c) => this.sampleFrom(c)) : [s];
        this.gesture.move(samples);
      } else {
        this.onHover(s);
      }
    });
    const end = (e: PointerEvent, cancelled: boolean) => {
      if (!this.gesture || e.pointerId !== this.gesturePointer) return;
      const g = this.gesture;
      this.gesture = null;
      this.gesturePointer = null;
      if (cancelled) g.cancel();
      else g.up(this.sampleFrom(e));
      this.updateCursor();
      this.invalidate(false, false, true);
    };
    stage.addEventListener('pointerup', (e) => end(e, false));
    stage.addEventListener('pointercancel', (e) => end(e, true));
    stage.addEventListener('lostpointercapture', (e) => end(e, false));
    stage.addEventListener('pointerleave', (e) => {
      if (e.pointerType === 'touch') return;
      this.pointer.inside = false;
      this.invalidate(false, false, true);
    });
    stage.addEventListener('pointerenter', () => {
      this.pointer.inside = true;
    });
  }

  /** Choose the gesture for a pointer down. Extended in later phases. */
  protected startGesture(s: Sample, e: PointerEvent): Gesture | null {
    // Middle button (pen side button 3 mapped to middle click) pans while held.
    if (e.button === 1 || e.buttons & 4 || this.effectiveTool() === 'hand') {
      return createPanGesture(this, s);
    }
    const tool = this.effectiveTool();
    // Right button (pen side button 1 mapped to right click): erase with the current eraser.
    if (e.button === 2 || s.buttons & 2 || tool === 'eraser') {
      return new EraseGesture(this, this.settings.eraserMode, this.currentWidth('eraser'), s);
    }
    if (tool === 'pen' || tool === 'highlighter') {
      const color = tool === 'pen' ? this.settings.penColor : this.settings.highlighterColor;
      return new DrawGesture(this, tool, color, this.currentWidth(tool), s, e.pointerType);
    }
    if (tool === 'space') return new SpaceGesture(this, s);
    return null;
  }

  protected onHover(_s: Sample): void {
    this.invalidate(false, false, true);
  }

  private installWheel(): void {
    this.viewer.addEventListener(
      'wheel',
      (e) => {
        if (!this.doc) return;
        e.preventDefault();
        const unit = e.deltaMode === 1 ? 40 : e.deltaMode === 2 ? this.view.height : 1;
        if (e.ctrlKey || e.metaKey) {
          const r = this.stage.getBoundingClientRect();
          const factor = Math.exp((-e.deltaY * unit) / 500);
          this.zoomTo(this.view.zoom * factor, e.clientX - r.left, e.clientY - r.top);
        } else if (e.shiftKey && Math.abs(e.deltaX) < 1) {
          this.scrollBy(e.deltaY * unit, 0);
        } else {
          this.scrollBy(e.deltaX * unit, e.deltaY * unit);
        }
      },
      { passive: false },
    );
  }

  private installDragDrop(): void {
    const hint = document.getElementById('drop-hint')!;
    let depth = 0;
    window.addEventListener('dragenter', (e) => {
      if (!e.dataTransfer?.types.includes('Files')) return;
      e.preventDefault();
      depth++;
      hint.classList.add('visible');
    });
    window.addEventListener('dragover', (e) => {
      if (!e.dataTransfer?.types.includes('Files')) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
    });
    window.addEventListener('dragleave', () => {
      depth = Math.max(0, depth - 1);
      if (depth === 0) hint.classList.remove('visible');
    });
    window.addEventListener('drop', (e) => {
      e.preventDefault();
      depth = 0;
      hint.classList.remove('visible');
      const item = e.dataTransfer?.items?.[0];
      const file = e.dataTransfer?.files?.[0];
      if (!file) return;
      // Chromium can give us a writable handle for dropped files.
      const getHandle = (
        item as DataTransferItem & {
          getAsFileSystemHandle?: () => Promise<FsFileHandle | null>;
        }
      )?.getAsFileSystemHandle;
      const handlePromise = getHandle
        ? getHandle.call(item).catch(() => null)
        : Promise.resolve(null);
      void handlePromise.then((handle) =>
        this.openFile(file, handle?.kind === 'file' ? handle : null),
      );
    });
  }

  // ---------------------------------------------------------------- files

  async open(): Promise<void> {
    try {
      const picked = await pickFileToOpen();
      if (picked) await this.openFile(picked.file, picked.handle);
    } catch (err) {
      toast(`Could not open the file: ${(err as Error).message}`, { error: true });
    }
  }

  async openSample(): Promise<void> {
    const bytes = await makeSamplePdf({ pages: 60, linesPerPage: 32 });
    await this.openPdfBytes(bytes, 'sample.pdf', null);
  }

  async openFile(file: File, handle: FsFileHandle | null): Promise<void> {
    try {
      if (!this.confirmDiscard()) return;
      if (isProjectName(file.name)) {
        await this.openProjectFile(file, handle);
      } else {
        const bytes = new Uint8Array(await file.arrayBuffer());
        await this.openPdfBytes(bytes, file.name, null);
      }
    } catch (err) {
      console.error(err);
      toast(`Could not open “${file.name}”: ${(err as Error).message}`, { error: true });
    }
  }

  /** Ask before replacing a document with unsaved changes. */
  confirmDiscard(): boolean {
    if (!this.dirty) return true;
    return confirm('You have unsaved changes. Open another file and discard them?');
  }

  async openPdfBytes(bytes: Uint8Array, name: string, handle: FsFileHandle | null): Promise<void> {
    const { pdf, pages } = await loadPdf(bytes);
    this.setDocument(createDocument(pages), bytes, pdf, pages.length ? name : name);
    this.fileHandle = handle;
  }

  /** Replace the open document. */
  protected setDocument(doc: Doc, bytes: Uint8Array, pdf: PDFDocumentProxy, name: string): void {
    this.renderer?.destroy();
    this.pdfBytes = bytes;
    this.doc = doc;
    this.fileName = name;
    this.dirty = false;
    this.previewDoc = null;
    this.history.clear();
    this.renderer = new PdfRenderer(pdf, doc.pages, () => this.invalidate(true, false, false));
    this.view = { ...this.view, scrollX: 0, scrollY: 0 };
    const z = fitWidthZoom(this.view.width, getLayout(doc).columnWidth);
    this.view = clampView({ ...this.view, zoom: z }, this.ext());
    this.noteZoomChange();
    this.invalidate();
    this.refreshUi();
  }

  protected async openProjectFile(_file: File, _handle: FsFileHandle | null): Promise<void> {
    toast('Project files are not supported yet.');
  }

  async save(_saveAs: boolean): Promise<void> {}
  async exportPdf(): Promise<void> {}

  // ---------------------------------------------------------------- tools

  get hasDoc(): boolean {
    return this.doc !== null;
  }

  /** Switch tool. `temporary` is used by hold-to-use keys and keeps the selection. */
  setTool(t: ToolId, _temporary = false): void {
    this.tool = t;
    this.refreshUi();
    this.invalidate(false, false, true);
  }

  setSpaceHeld(held: boolean): void {
    if (this.spaceHeld === held) return;
    this.spaceHeld = held;
    this.updateCursor();
    this.invalidate(false, false, true);
  }

  setPenColorIndex(i: number): void {
    if (this.tool !== 'pen') this.setTool('pen');
    this.setColor(PEN_COLORS[i]);
  }
  copy(): void {}
  cut(): void {}
  paste(): void {}
  deleteSelection(): void {}
  escape(): void {}

  altChanged(down?: boolean): void {
    if (down !== undefined) this.altDown = down;
    this.invalidate(false, false, true);
  }

  zoomReset(): void {
    this.zoomTo(1);
  }

  scrollPage(dir: 1 | -1): void {
    this.scrollBy(0, dir * this.view.height * 0.85);
  }

  scrollToEnd(dir: 1 | -1): void {
    this.setView({ ...this.view, scrollY: dir < 0 ? 0 : Number.MAX_SAFE_INTEGER });
  }

  toggleEraserMode(): void {
    this.settings.eraserMode = this.settings.eraserMode === 'stroke' ? 'point' : 'stroke';
    this.persistSettings();
  }

  setColor(c: string): void {
    if (this.tool === 'highlighter') {
      if (HIGHLIGHTER_COLORS.includes(c)) this.settings.highlighterColor = c;
    } else {
      this.settings.penColor = c;
      if (this.tool !== 'pen') this.setTool('pen');
    }
    this.persistSettings();
  }

  setCustomColor(c: string): void {
    this.settings.penCustomColor = c;
    this.settings.penColor = c;
    this.persistSettings();
  }

  setWidth(id: string): void {
    if (this.tool === 'pen') this.settings.penWidth = id;
    else if (this.tool === 'highlighter') this.settings.highlighterWidth = id;
    else if (this.tool === 'eraser') this.settings.eraserSize = id;
    this.persistSettings();
  }

  persistSettings(): void {
    saveSettings(this.settings);
    this.refreshUi();
    this.invalidate(false, false, true);
  }

  toggleFullscreen(): void {
    if (document.fullscreenElement) void document.exitFullscreen();
    else
      void document.documentElement.requestFullscreen().catch(() => {
        toast('Full screen is not available here.');
      });
  }

  get isGestureActive(): boolean {
    return this.gesture !== null;
  }
}
