import type { Gesture, Sample } from '../input/gesture';
import { strokeCommandFromDocs, type Command } from '../model/commands';
import { selectByLasso, selectByRect, translateStrokes, type Pt } from '../model/select';
import type { Doc } from '../model/types';
import type { DeviceTransform } from '../render/ink';

export interface SelectHost {
  doc: Doc | null;
  previewDoc: Doc | null;
  selection: ReadonlySet<string>;
  setSelection(ids: Iterable<string>): void;
  commit(cmd: Command): void;
  invalidate(pdf?: boolean, ink?: boolean, overlay?: boolean): void;
}

const ACCENT = '#2b5797';

function toDev(t: DeviceTransform, x: number, y: number): [number, number] {
  return [(t.ox + x * t.k) * t.dpr, (t.oy + y * t.k) * t.dpr];
}

/** Lasso (freeform loop) or rectangle selection. */
export class SelectGesture implements Gesture {
  private path: Pt[] = [];
  private screenTravel = 0;
  private lastS: { sx: number; sy: number };

  constructor(
    private host: SelectHost,
    readonly kind: 'lasso' | 'rect',
    start: Sample,
  ) {
    this.path.push({ x: start.x, y: start.y });
    this.lastS = { sx: start.sx, sy: start.sy };
  }

  move(samples: Sample[]): void {
    for (const s of samples) {
      this.screenTravel += Math.hypot(s.sx - this.lastS.sx, s.sy - this.lastS.sy);
      this.lastS = { sx: s.sx, sy: s.sy };
      if (this.kind === 'rect') this.path[1] = { x: s.x, y: s.y };
      else this.path.push({ x: s.x, y: s.y });
    }
    this.host.invalidate(false, false, true);
  }

  up(s: Sample): void {
    this.move([s]);
    const doc = this.host.doc;
    if (!doc) return;
    if (this.screenTravel < 4) {
      // A click on empty space clears the selection.
      this.host.setSelection([]);
      return;
    }
    const ids =
      this.kind === 'rect'
        ? selectByRect(doc.strokes, this.path[0], this.path[1] ?? this.path[0])
        : selectByLasso(doc.strokes, this.path);
    this.host.setSelection(ids);
  }

  cancel(): void {
    this.host.invalidate(false, false, true);
  }

  drawOverlay(ctx: CanvasRenderingContext2D, t: DeviceTransform): void {
    if (this.path.length < 2) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.lineWidth = 1.25 * t.dpr;
    ctx.setLineDash([5 * t.dpr, 4 * t.dpr]);
    ctx.strokeStyle = ACCENT;
    ctx.fillStyle = 'rgba(43, 87, 151, 0.06)';
    ctx.beginPath();
    if (this.kind === 'rect') {
      const [x0, y0] = toDev(t, this.path[0].x, this.path[0].y);
      const [x1, y1] = toDev(t, this.path[1].x, this.path[1].y);
      ctx.rect(Math.min(x0, x1), Math.min(y0, y1), Math.abs(x1 - x0), Math.abs(y1 - y0));
    } else {
      this.path.forEach((p, i) => {
        const [x, y] = toDev(t, p.x, p.y);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.closePath();
    }
    ctx.fill();
    ctx.stroke();
    ctx.setLineDash([]);
  }
}

/** Drag the selected strokes. One undo step. */
export class MoveGesture implements Gesture {
  readonly cursor = 'move';
  private readonly base: Doc;
  private readonly ids: ReadonlySet<string>;
  private readonly startX: number;
  private readonly startY: number;

  constructor(
    private host: SelectHost,
    start: Sample,
  ) {
    this.base = host.doc!;
    this.ids = new Set(host.selection);
    this.startX = start.x;
    this.startY = start.y;
  }

  move(samples: Sample[]): void {
    const s = samples[samples.length - 1];
    this.host.previewDoc = translateStrokes(
      this.base,
      this.ids,
      s.x - this.startX,
      s.y - this.startY,
    );
    this.host.invalidate(false, true, true);
  }

  up(s: Sample): void {
    this.move([s]);
    const after = this.host.previewDoc ?? this.base;
    this.host.previewDoc = null;
    const cmd = strokeCommandFromDocs('Move', this.base, after);
    if (cmd) this.host.commit(cmd);
    else this.host.invalidate(false, true, true);
  }

  cancel(): void {
    this.host.previewDoc = null;
    this.host.invalidate(false, true, true);
  }
}
