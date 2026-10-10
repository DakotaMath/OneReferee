import type { Gesture, Sample } from '../input/gesture';
import { strokeCommandFromDocs, type Command } from '../model/commands';
import { eraseAt } from '../model/erase';
import type { Doc } from '../model/types';
import type { EraserMode } from './toolTypes';

export interface EraseHost {
  doc: Doc | null;
  previewDoc: Doc | null;
  commit(cmd: Command): void;
  invalidate(pdf?: boolean, ink?: boolean, overlay?: boolean): void;
}

/**
 * Stroke or point eraser. The whole pointer-down-to-up gesture is one undo step.
 * Between samples the eraser is swept in small steps so fast motion leaves no gaps.
 */
export class EraseGesture implements Gesture {
  readonly drawsCursor = true;
  private readonly base: Doc;
  private working: Doc;
  private lastX: number;
  private lastY: number;

  constructor(
    private host: EraseHost,
    readonly mode: EraserMode,
    readonly radius: number,
    start: Sample,
  ) {
    this.base = host.doc!;
    this.working = this.base;
    this.lastX = start.x;
    this.lastY = start.y;
    if (start.contact) this.dab(start.x, start.y);
    this.publish();
  }

  private dab(x: number, y: number): void {
    const strokes = eraseAt(this.working.strokes, x, y, this.radius, this.mode);
    if (strokes !== this.working.strokes) this.working = { ...this.working, strokes };
  }

  private sweepTo(x: number, y: number, contact = true): void {
    if (!contact) {
      // Pen hovering with the side button held: follow it, but erase only on contact.
      this.lastX = x;
      this.lastY = y;
      return;
    }
    const dist = Math.hypot(x - this.lastX, y - this.lastY);
    const step = Math.max(0.25, this.radius / 2);
    const n = Math.ceil(dist / step);
    for (let i = 1; i <= n; i++) {
      const t = i / n;
      this.dab(this.lastX + (x - this.lastX) * t, this.lastY + (y - this.lastY) * t);
    }
    this.lastX = x;
    this.lastY = y;
  }

  private publish(): void {
    this.host.previewDoc = this.working === this.base ? null : this.working;
    this.host.invalidate(false, true, true);
  }

  move(samples: Sample[]): void {
    for (const s of samples) this.sweepTo(s.x, s.y, s.contact);
    this.publish();
  }

  up(s: Sample): void {
    this.sweepTo(s.x, s.y, s.contact);
    this.host.previewDoc = null;
    const label = this.mode === 'stroke' ? 'Erase strokes' : 'Erase';
    const cmd = strokeCommandFromDocs(label, this.base, this.working);
    if (cmd) this.host.commit(cmd);
    else this.host.invalidate(false, true, true);
  }

  cancel(): void {
    this.host.previewDoc = null;
    this.host.invalidate(false, true, true);
  }
}
