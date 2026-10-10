import type { Gesture, Sample } from '../input/gesture';
import { spaceCommand, type Command } from '../model/commands';
import { getLayout } from '../model/document';
import { insertSpace } from '../model/space';
import type { Doc } from '../model/types';
import type { DeviceTransform } from '../render/ink';

export interface SpaceHost {
  doc: Doc | null;
  previewDoc: Doc | null;
  commit(cmd: Command): void;
  invalidate(pdf?: boolean, ink?: boolean, overlay?: boolean): void;
  /** Where a cut at document y lands after snapping (unless snapping is off). */
  snapCut(y: number, noSnap: boolean): number;
  isAltDown(): boolean;
}

const GUIDE = '#2b5797';

/** Draw the horizontal cut line across the page (or column) at document y. */
export function drawCutGuide(
  ctx: CanvasRenderingContext2D,
  doc: Doc,
  y: number,
  t: DeviceTransform,
  dashed = false,
): void {
  const layout = getLayout(doc);
  const run = layout.runs.find((r) => y >= r.top - 8 && y <= r.bottom + 8);
  const left = run ? run.left : 0;
  const width = run ? run.width : layout.columnWidth;
  const dpr = t.dpr;
  const x0 = (t.ox + (left - 12) * t.k) * dpr;
  const x1 = (t.ox + (left + width + 12) * t.k) * dpr;
  const py = Math.round((t.oy + y * t.k) * dpr) + 0.5;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.strokeStyle = GUIDE;
  ctx.lineWidth = Math.max(1, dpr * 1.5);
  ctx.setLineDash(dashed ? [6 * dpr, 4 * dpr] : []);
  ctx.beginPath();
  ctx.moveTo(x0, py);
  ctx.lineTo(x1, py);
  ctx.stroke();
  ctx.setLineDash([]);
  // Small arrow heads at both ends, like OneNote's insert-space line.
  ctx.fillStyle = GUIDE;
  for (const x of [x0, x1]) {
    const a = 5 * dpr;
    ctx.beginPath();
    ctx.moveTo(x, py - a * 1.6);
    ctx.lineTo(x - a, py - a * 0.4);
    ctx.lineTo(x + a, py - a * 0.4);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(x, py + a * 1.6);
    ctx.lineTo(x - a, py + a * 0.4);
    ctx.lineTo(x + a, py + a * 0.4);
    ctx.closePath();
    ctx.fill();
  }
}

/** Press at the cut line and drag down to open space, up to close it. One undo step. */
export class SpaceGesture implements Gesture {
  private readonly base: Doc;
  private readonly cutY: number;
  private readonly startY: number;
  private dy = 0;

  constructor(
    private host: SpaceHost,
    start: Sample,
  ) {
    this.base = host.doc!;
    this.cutY = host.snapCut(start.y, start.altKey || host.isAltDown());
    this.startY = start.y;
  }

  move(samples: Sample[]): void {
    const s = samples[samples.length - 1];
    this.dy = s.y - this.startY;
    this.host.previewDoc = insertSpace(this.base, this.cutY, this.dy);
    this.host.invalidate(true, true, true);
  }

  up(s: Sample): void {
    this.move([s]);
    const after = this.host.previewDoc ?? this.base;
    this.host.previewDoc = null;
    const label = this.dy >= 0 ? 'Insert space' : 'Remove space';
    const cmd = after !== this.base ? spaceCommand(label, this.base, after) : null;
    if (cmd) this.host.commit(cmd);
    else this.host.invalidate(true, true, true);
  }

  cancel(): void {
    this.host.previewDoc = null;
    this.host.invalidate(true, true, true);
  }

  drawOverlay(ctx: CanvasRenderingContext2D, t: DeviceTransform): void {
    const doc = this.host.previewDoc ?? this.base;
    if (this.dy > 0) {
      // Tint the opened space lightly so it is obvious what will be inserted.
      const layout = getLayout(doc);
      const run = layout.runs.find((r) => this.cutY >= r.top - 8 && this.cutY <= r.bottom + 8);
      const left = run ? run.left : 0;
      const width = run ? run.width : layout.columnWidth;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = 'rgba(43, 87, 151, 0.07)';
      ctx.fillRect(
        (t.ox + left * t.k) * t.dpr,
        (t.oy + this.cutY * t.k) * t.dpr,
        width * t.k * t.dpr,
        this.dy * t.k * t.dpr,
      );
      drawCutGuide(ctx, doc, this.cutY + this.dy, t, true);
    }
    drawCutGuide(ctx, doc, this.cutY, t);
  }
}
