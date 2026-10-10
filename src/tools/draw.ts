import type { Gesture, Sample } from '../input/gesture';
import { addStrokesCommand, type Command } from '../model/commands';
import { makeStroke } from '../model/strokes';
import type { Doc, StrokePoint, StrokeTool } from '../model/types';
import { drawLiveStroke, type DeviceTransform } from '../render/ink';

export interface DrawHost {
  doc: Doc | null;
  commit(cmd: Command): void;
  invalidateOverlay(immediate?: boolean): void;
  noteInput(pointerType: string, pressures: number[]): void;
}

/** Minimum distance (pt) between recorded points; filters jitter without losing detail. */
const MIN_STEP = 0.15;

/** Pen or highlighter: collect points, draw live on the overlay, commit on pointer up. */
export class DrawGesture implements Gesture {
  readonly drawsCursor = true;
  readonly points: StrokePoint[] = [];
  private pressures: number[] = [];

  constructor(
    private host: DrawHost,
    readonly tool: StrokeTool,
    readonly color: string,
    readonly width: number,
    start: Sample,
    private pointerType: string,
  ) {
    this.add(start);
  }

  private add(s: Sample): void {
    const pressure = this.tool === 'highlighter' ? 0.5 : Math.max(0.05, Math.min(1, s.pressure));
    this.pressures.push(s.pressure);
    const last = this.points[this.points.length - 1];
    if (last && Math.hypot(s.x - last.x, s.y - last.y) < MIN_STEP) {
      // Same spot: keep the higher pressure (pen pressing down).
      if (pressure > last.pressure) last.pressure = pressure;
      return;
    }
    this.points.push({ x: s.x, y: s.y, pressure });
  }

  move(samples: Sample[]): void {
    for (const s of samples) this.add(s);
    this.host.invalidateOverlay(true);
  }

  up(s: Sample): void {
    this.add(s);
    const doc = this.host.doc;
    if (doc && this.points.length) {
      const stroke = makeStroke(this.tool, this.color, this.width, this.points);
      this.host.commit(
        addStrokesCommand(this.tool === 'pen' ? 'Pen stroke' : 'Highlight', doc, [stroke]),
      );
    }
    this.host.noteInput(this.pointerType, this.pressures);
  }

  cancel(): void {
    this.points.length = 0;
    this.host.invalidateOverlay();
  }

  drawOverlay(ctx: CanvasRenderingContext2D, t: DeviceTransform): void {
    drawLiveStroke(ctx, this.tool, this.color, this.width, this.points, t);
  }
}
