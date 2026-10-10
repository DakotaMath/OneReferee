import type { DeviceTransform } from '../render/ink';

/** A pointer sample in both screen (CSS px, relative to the stage) and document coordinates. */
export interface Sample {
  sx: number;
  sy: number;
  x: number;
  y: number;
  pressure: number;
  pointerType: string;
  buttons: number;
  altKey: boolean;
  shiftKey: boolean;
  time: number;
  /** False for a pen hovering above the screen (pressure 0), e.g. with a side button held. */
  contact: boolean;
}

/** One pointer-down-to-up interaction. */
export interface Gesture {
  /** Called for every (coalesced) move sample, in order. */
  move(samples: Sample[]): void;
  up(sample: Sample): void;
  /** Pointer lost or cancelled: undo any preview without committing. */
  cancel(): void;
  /** True if this gesture should keep the CSS cursor hidden (custom overlay cursor). */
  readonly drawsCursor?: boolean;
  /** CSS cursor to show while this gesture is active. */
  readonly cursor?: string;
  /** Draw live feedback on the overlay canvas. */
  drawOverlay?(ctx: CanvasRenderingContext2D, t: DeviceTransform): void;
}
