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
}
