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
import {
  PDF_TYPE,
  PROJECT_TYPE,
  baseName,
  downloadBlob,
  isProjectName,
  pickFileToOpen,
  pickSaveLocation,
  writeToHandle,
  type FsFileHandle,
} from './io/files';
import { parseProject, serializeProject } from './model/serialize';
import { exportAnnotatedPdf } from './io/exportPdf';
import { clearAutosave, readAutosave, writeAutosave } from './io/autosave';
import { banner } from './ui/toast';
import { makeSamplePdf } from './io/samplePdf';
import type { ToolId } from './tools/toolTypes';
import type { ShortcutTarget } from './ui/shortcuts';
import { History } from './model/history';
import type { Command } from './model/commands';
import { drawStrokes, type DeviceTransform } from './render/ink';
import { DrawGesture } from './tools/draw';
import { SpaceGesture, drawCutGuide } from './tools/space';
import { EraseGesture } from './tools/erase';
import { MoveGesture, SelectGesture } from './tools/select';
import { addStrokesCommand, strokeCommandFromDocs } from './model/commands';
import { deleteStrokes, duplicateStrokes, selectionBounds } from './model/select';
import type { BBox, Stroke } from './model/types';
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
  /** Ids of selected strokes. */
  selection: ReadonlySet<string> = new Set();
  /** Internal clipboard (never the system clipboard). */
  private clipboard: Stroke[] = [];
  /** Consecutive pastes without moving the pointer cascade by 12 pt each. */
  private pasteOffset = 0;
  private pointerMovedSinceClip = false;
  private clipPointer = { sx: 0, sy: 0 };
  pdfBytes: Uint8Array | null = null;
  renderer: PdfRenderer | null = null;
  /** Name shown in the title: the project file's name once saved, else the PDF's. */
  fileName: string | null = null;
  /** Name of the original PDF. */
  pdfName = 'document.pdf';
  /** Where Ctrl+S writes the project (null until saved or opened from a .pdfnotes file). */
  fileHandle: FsFileHandle | null = null;
  private autosaveTimer = 0;
  private autosaveFailing = false;
  private saving = false;
  private closeRestoreBanner: (() => void) | null = null;
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
    // Ctrl+wheel over the toolbar or status bar must not zoom the whole browser page.
    window.addEventListener(
      'wheel',
      (e) => {
        if (e.ctrlKey) e.preventDefault();
      },
      { passive: false },
    );
    this.installDragDrop();
    document.addEventListener('fullscreenchange', () => this.refreshUi());
    window.addEventListener('beforeunload', (e) => {
      if (this.dirty) {
        void this.autosaveNow();
        e.preventDefault();
        e.returnValue = '';
      }
    });
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden' && this.autosaveTimer) void this.autosaveNow();
    });
    void this.offerRestore();
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
    const box = this.selectionBox();
    if (box) {
      const dpr = t.dpr;
      const x0 = Math.round((t.ox + box.minX * t.k) * dpr) + 0.5;
      const y0 = Math.round((t.oy + box.minY * t.k) * dpr) + 0.5;
      const x1 = Math.round((t.ox + box.maxX * t.k) * dpr) + 0.5;
      const y1 = Math.round((t.oy + box.maxY * t.k) * dpr) + 0.5;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.lineWidth = Math.max(1, dpr);
      ctx.setLineDash([5 * dpr, 4 * dpr]);
      ctx.strokeStyle = '#2b5797';
      ctx.strokeRect(x0, y0, x1 - x0, y1 - y0);
      ctx.setLineDash([]);
    }
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
    if (this.gesture instanceof MoveGesture || (!this.gesture && this.hoverOverSelection())) return;
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
    this.statusMessage = '';
    this.scheduleAutosave();
    if (this.selection.size && this.doc) {
      const ids = new Set(this.doc.strokes.map((s) => s.id));
      const kept = [...this.selection].filter((id) => ids.has(id));
      if (kept.length !== this.selection.size) this.selection = new Set(kept);
    }
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
  private inkSamples = { strokes: 0, mouse: 0, pressures: new Set<number>() };
  private inkTipShown = false;

  /**
   * Windows Ink check: browsers only get pen pressure when Windows Ink is enabled in the
   * Huion driver. If strokes keep arriving as mouse input, or pen pressure never varies,
   * show a one-time dismissible tip.
   */
  noteInput(pointerType: string, pressures: number[]): void {
    if (this.inkTipShown || this.settings.inkTipDismissed) return;
    const s = this.inkSamples;
    s.strokes++;
    if (pointerType === 'mouse') s.mouse++;
    if (pointerType === 'pen') for (const p of pressures) s.pressures.add(Math.round(p * 1000));
    if (s.strokes < 3) return;
    const allMouse = s.mouse === s.strokes;
    const flatPen = s.mouse === 0 && s.pressures.size <= 1;
    if (!allMouse && !flatPen) {
      this.inkTipShown = true; // pressure works; stop checking
      return;
    }
    this.inkTipShown = true;
    toast(
      allMouse
        ? 'Writing with the Huion pen? It is arriving as a mouse, so there is no pressure. Turn on “Windows Ink” in the Huion driver (Pen settings), then reload this page.'
        : 'Pen pressure is not changing. Turn on “Windows Ink” in the Huion driver (Pen settings), then reload this page.',
      {
        timeout: 0,
        actions: [
          {
            label: 'Don’t show again',
            run: () => {
              this.settings.inkTipDismissed = true;
              this.persistSettings();
            },
          },
        ],
      },
    );
  }

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
    else if (!this.gesture && this.hoverOverSelection()) cursor = 'move';
    else if (t === 'hand') cursor = 'grab';
    else if (t === 'pen' || t === 'highlighter' || t === 'eraser') cursor = 'none';
    else if (t === 'lasso' || t === 'rect') cursor = 'crosshair';
    else if (t === 'space') cursor = 'row-resize';
    this.stage.style.cursor = cursor;
  }

  /** Pointer hovering over the selection box with a tool that can drag it. */
  private hoverOverSelection(): boolean {
    if (!this.selection.size || !this.pointer.inside) return false;
    const t = this.effectiveTool();
    if (t !== 'pen' && t !== 'highlighter' && t !== 'lasso' && t !== 'rect') return false;
    const p = this.toDoc(this.pointer.sx, this.pointer.sy);
    return this.isOverSelection(p.x, p.y);
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
    // Mouse (and devices without pressure) use a fixed 0.5. A pen keeps its real pressure,
    // which is 0 while hovering and at lift-off.
    if (e.pointerType !== 'pen' || !(pressure >= 0)) pressure = 0.5;
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
      contact: e.pointerType !== 'pen' || e.pressure > 0,
    };
  }

  private installPointerHandling(): void {
    const stage = this.stage;
    stage.addEventListener('contextmenu', (e) => e.preventDefault());
    // Stop Chrome's middle-click autoscroll so the middle button (pen side button 3) can pan.
    stage.addEventListener('mousedown', (e) => {
      if (e.button === 1) e.preventDefault();
    });
    stage.addEventListener('auxclick', (e) => e.preventDefault());
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
      if (Math.hypot(s.sx - this.clipPointer.sx, s.sy - this.clipPointer.sy) > 3)
        this.pointerMovedSinceClip = true;
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
    // Pressing inside the selection box drags the selection (with any drawing or selection tool).
    if (
      e.button === 0 &&
      this.selection.size &&
      (tool === 'pen' || tool === 'highlighter' || tool === 'lasso' || tool === 'rect') &&
      this.isOverSelection(s.x, s.y)
    ) {
      return new MoveGesture(this, s);
    }
    if (tool === 'lasso' || tool === 'rect') {
      if (e.button === 2 || s.buttons & 2) {
        return new EraseGesture(this, this.settings.eraserMode, this.currentWidth('eraser'), s);
      }
      return new SelectGesture(this, tool, s);
    }
    if (this.selection.size && tool !== 'space') this.setSelection([]);
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
    this.updateCursor();
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
    if (this.closeRestoreBanner && !this.doc) {
      return confirm(
        'Unsaved work from your last session has not been restored. Open this file and discard that work?',
      );
    }
    if (!this.dirty) return true;
    return confirm('You have unsaved changes. Open another file and discard them?');
  }

  async openPdfBytes(bytes: Uint8Array, name: string, handle: FsFileHandle | null): Promise<void> {
    const { pdf, pages } = await loadPdf(bytes);
    if (!pages.length) throw new Error('The PDF has no pages.');
    this.setDocument(createDocument(pages), bytes, pdf, name);
    this.pdfName = name;
    this.fileHandle = handle;
  }

  /** Replace the open document. */
  protected setDocument(
    doc: Doc,
    bytes: Uint8Array,
    pdf: PDFDocumentProxy,
    name: string,
    replaceAutosave = true,
  ): void {
    this.closeRestoreBanner?.();
    this.closeRestoreBanner = null;
    this.renderer?.destroy();
    this.pdfBytes = bytes;
    this.doc = doc;
    this.fileName = name;
    this.dirty = false;
    this.previewDoc = null;
    this.history.clear();
    // Overlay too: the insert-space guide re-snaps once a page's blank-row profile is ready.
    this.renderer = new PdfRenderer(pdf, doc.pages, () => this.invalidate(true, false, true));
    this.view = { ...this.view, scrollX: 0, scrollY: 0 };
    const z = fitWidthZoom(this.view.width, getLayout(doc).columnWidth);
    this.view = clampView({ ...this.view, zoom: z }, this.ext());
    this.noteZoomChange();
    this.invalidate();
    this.refreshUi();
    // The newly opened document takes over the autosave slot (any older unsaved work was
    // either saved or explicitly discarded by the user before getting here).
    if (replaceAutosave) void this.autosaveNow();
  }

  protected async openProjectFile(file: File, handle: FsFileHandle | null): Promise<void> {
    const project = parseProject(await file.text());
    const { pdf, pages } = await loadPdf(project.pdfBytes);
    if (pages.length !== project.doc.pages.length) {
      throw new Error('The embedded PDF does not match the saved pages.');
    }
    this.setDocument(project.doc, project.pdfBytes, pdf, file.name);
    this.pdfName = project.pdfName;
    this.fileHandle = handle;
  }

  // ---------------------------------------------------------------- saving

  private projectFileName(): string {
    if (this.fileName && isProjectName(this.fileName)) return this.fileName;
    return `${baseName(this.pdfName)}.pdfnotes`;
  }

  /** Ctrl+S (asks for a location the first time) / Ctrl+Shift+S (always asks). */
  async save(saveAs: boolean): Promise<void> {
    const doc = this.doc;
    const bytes = this.pdfBytes;
    if (!doc || !bytes || this.saving) return;
    this.saving = true;
    try {
      const point = this.history.savePoint;
      let handle: FsFileHandle | 'download' | null = saveAs ? null : this.fileHandle;
      if (!handle) {
        handle = await pickSaveLocation(this.projectFileName(), PROJECT_TYPE);
        if (!handle) return; // cancelled
      }
      const blob = new Blob([serializeProject({ doc, pdfBytes: bytes, pdfName: this.pdfName })], {
        type: 'application/json',
      });
      if (handle === 'download') {
        downloadBlob(blob, this.projectFileName());
        this.fileName = this.projectFileName();
        toast('Saved as a download (this browser can’t save to a chosen file).');
      } else {
        await writeToHandle(handle, blob);
        this.fileHandle = handle;
        this.fileName = handle.name;
      }
      this.history.markSavedAt(point);
      this.dirty = this.history.isDirty;
      this.statusMessage = `Saved ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
      this.refreshUi();
      void this.autosaveNow();
    } catch (err) {
      console.error(err);
      toast(`Could not save: ${(err as Error).message}. Your work is still open — try Save As.`, {
        error: true,
      });
    } finally {
      this.saving = false;
    }
  }

  async exportPdf(): Promise<void> {
    const doc = this.doc;
    const bytes = this.pdfBytes;
    if (!doc || !bytes) return;
    const name = `${baseName(this.pdfName)} (annotated).pdf`;
    try {
      const handle = await pickSaveLocation(name, PDF_TYPE);
      if (!handle) return;
      this.statusMessage = 'Exporting…';
      this.refreshUi();
      const result = await exportAnnotatedPdf(bytes, doc);
      const blob = new Blob([result.bytes as BlobPart], { type: 'application/pdf' });
      if (handle === 'download') downloadBlob(blob, name);
      else await writeToHandle(handle, blob);
      this.statusMessage = 'Exported PDF';
      this.refreshUi();
      if (result.skippedStrokes) {
        toast(
          `${result.skippedStrokes} stroke(s) lie outside every page (in the gray margin) and are not in the exported PDF.`,
          { error: true },
        );
      } else {
        toast(`Exported “${handle === 'download' ? name : handle.name}”.`);
      }
    } catch (err) {
      console.error(err);
      this.statusMessage = '';
      this.refreshUi();
      toast(`Could not export the PDF: ${(err as Error).message}`, { error: true });
    }
  }

  // ---------------------------------------------------------------- autosave

  private scheduleAutosave(): void {
    clearTimeout(this.autosaveTimer);
    this.autosaveTimer = window.setTimeout(() => void this.autosaveNow(), 3000);
  }

  async autosaveNow(): Promise<void> {
    clearTimeout(this.autosaveTimer);
    this.autosaveTimer = 0;
    const doc = this.doc;
    const bytes = this.pdfBytes;
    if (!doc || !bytes) return;
    try {
      await writeAutosave({
        doc,
        pdfBytes: bytes,
        fileName: this.fileName ?? this.pdfName,
        unsaved: this.dirty,
        time: Date.now(),
      });
      if (this.autosaveFailing) toast('Autosave is working again.');
      this.autosaveFailing = false;
    } catch (err) {
      console.error(err);
      if (!this.autosaveFailing) {
        toast(
          `Autosave failed: ${(err as Error).message}. Your work is still open — save it to a file (Ctrl+S).`,
          { error: true },
        );
      }
      this.autosaveFailing = true;
    }
  }

  /** On launch, offer to restore autosaved work that was never saved to a file. */
  private async offerRestore(): Promise<void> {
    let rec;
    try {
      rec = await readAutosave();
    } catch (err) {
      console.warn('Could not read autosave', err);
      return;
    }
    if (!rec || !rec.unsaved || this.doc) return;
    const when = new Date(rec.time).toLocaleString();
    const record = rec;
    this.closeRestoreBanner = banner(`Restore unsaved work on “${record.fileName}” from ${when}?`, [
      {
        label: 'Restore',
        run: () => {
          this.closeRestoreBanner = null;
          void this.restore(record);
        },
      },
      {
        label: 'Discard',
        run: () => {
          this.closeRestoreBanner = null;
          if (confirm('Discard the unsaved work permanently?')) void clearAutosave();
          else void this.offerRestore();
        },
      },
    ]);
  }

  private async restore(rec: NonNullable<Awaited<ReturnType<typeof readAutosave>>>): Promise<void> {
    if (!this.confirmDiscard()) return;
    try {
      const { pdf, pages } = await loadPdf(rec.pdfBytes);
      if (pages.length !== rec.doc.pages.length) throw new Error('page count mismatch');
      this.setDocument(rec.doc, rec.pdfBytes, pdf, rec.fileName, false);
      this.pdfName = isProjectName(rec.fileName) ? `${baseName(rec.fileName)}.pdf` : rec.fileName;
      this.fileHandle = null;
      this.history.markUnsaved();
      this.dirty = true;
      this.refreshUi();
      toast('Restored. Save it to a file with Ctrl+S.');
    } catch (err) {
      toast(`Could not restore the autosave: ${(err as Error).message}`, { error: true });
    }
  }

  // ---------------------------------------------------------------- tools

  get hasDoc(): boolean {
    return this.doc !== null;
  }

  /** Switch tool. `temporary` is used by hold-to-use keys and keeps the selection. */
  setTool(t: ToolId, temporary = false): void {
    // Switching tools clears the selection, except for hold-to-use switches (hold L to lasso,
    // release to get the pen back with the selection still there to drag).
    if (!temporary && t !== this.tool && this.selection.size) this.setSelection([]);
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

  setHighlighterColorIndex(i: number): void {
    if (this.tool !== 'highlighter') this.setTool('highlighter');
    this.setColor(HIGHLIGHTER_COLORS[i]);
  }

  useCustomColor(): void {
    if (this.tool !== 'pen') this.setTool('pen');
    this.setColor(this.settings.penCustomColor);
  }

  /** Next thinner/thicker width for the pen or highlighter, or eraser size. */
  stepWidth(dir: 1 | -1): void {
    const st = this.settings;
    const pick = (list: { id: string }[], cur: string) => {
      const i = list.findIndex((w) => w.id === cur);
      return list[Math.min(list.length - 1, Math.max(0, i + dir))].id;
    };
    if (this.tool === 'highlighter')
      st.highlighterWidth = pick(HIGHLIGHTER_WIDTHS, st.highlighterWidth);
    else if (this.tool === 'eraser') st.eraserSize = pick(ERASER_SIZES, st.eraserSize);
    else {
      if (this.tool !== 'pen') this.setTool('pen');
      st.penWidth = pick(PEN_WIDTHS, st.penWidth);
    }
    this.persistSettings();
  }

  setPenColorIndex(i: number): void {
    if (this.tool !== 'pen') this.setTool('pen');
    this.setColor(PEN_COLORS[i]);
  }
  setSelection(ids: Iterable<string>): void {
    this.selection = new Set(ids);
    this.invalidate(false, false, true);
    this.updateCursor();
  }

  /** Selection box in document coordinates (with a little padding), or null. */
  selectionBox(): BBox | null {
    const doc = this.displayDoc;
    if (!doc || !this.selection.size) return null;
    const b = selectionBounds(doc.strokes, this.selection);
    if (!b) return null;
    const pad = 4 / cssPerPt(this.view.zoom);
    return { minX: b.minX - pad, minY: b.minY - pad, maxX: b.maxX + pad, maxY: b.maxY + pad };
  }

  isOverSelection(x: number, y: number): boolean {
    const b = this.selectionBox();
    return !!b && x >= b.minX && x <= b.maxX && y >= b.minY && y <= b.maxY;
  }

  private selectedStrokes(): Stroke[] {
    return this.doc ? this.doc.strokes.filter((s) => this.selection.has(s.id)) : [];
  }

  private noteClip(): void {
    this.pasteOffset = 0;
    this.pointerMovedSinceClip = false;
    this.clipPointer = { sx: this.pointer.sx, sy: this.pointer.sy };
  }

  copy(): void {
    const strokes = this.selectedStrokes();
    if (!strokes.length) return;
    this.clipboard = strokes;
    this.noteClip();
    this.statusMessage = `Copied ${strokes.length} stroke${strokes.length > 1 ? 's' : ''}`;
    this.refreshUi();
  }

  cut(): void {
    if (!this.doc || this.isGestureActive) return;
    const strokes = this.selectedStrokes();
    if (!strokes.length) return;
    this.clipboard = strokes;
    this.noteClip();
    const cmd = strokeCommandFromDocs('Cut', this.doc, deleteStrokes(this.doc, this.selection));
    this.setSelection([]);
    if (cmd) this.commit(cmd);
  }

  /** Paste at the pointer's last document position, or 12 pt from the original if it hasn't moved. */
  paste(): void {
    if (!this.doc || !this.clipboard.length || this.isGestureActive) return;
    const src = this.clipboard;
    const b = selectionBounds(src, new Set(src.map((s) => s.id)))!;
    let dx: number;
    let dy: number;
    if (this.pointerMovedSinceClip && this.pointer.inside) {
      const p = this.toDoc(this.pointer.sx, this.pointer.sy);
      dx = p.x - b.minX;
      dy = p.y - b.minY;
      this.noteClip();
      this.pasteOffset = 0;
    } else {
      this.pasteOffset += 12;
      dx = this.pasteOffset;
      dy = this.pasteOffset;
    }
    const copies = duplicateStrokes(src, dx, dy);
    this.commit(addStrokesCommand('Paste', this.doc, copies));
    this.setSelection(copies.map((s) => s.id));
  }

  deleteSelection(): void {
    if (!this.doc || !this.selection.size || this.isGestureActive) return;
    const cmd = strokeCommandFromDocs('Delete', this.doc, deleteStrokes(this.doc, this.selection));
    this.setSelection([]);
    if (cmd) this.commit(cmd);
  }

  escape(): void {
    if (this.selection.size) this.setSelection([]);
  }

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
