import type { Command } from './commands';
import type { Doc } from './types';

export const HISTORY_LIMIT = 500;

/** Undo/redo stacks. Tracks a save point so "dirty" is exact across undo/redo. */
export class History {
  private undoStack: { cmd: Command; serial: number }[] = [];
  private redoStack: { cmd: Command; serial: number }[] = [];
  private serial = 0;
  private savedSerial = 0;

  constructor(private limit = HISTORY_LIMIT) {}

  /** Record a command that has already been applied. */
  push(cmd: Command): void {
    this.undoStack.push({ cmd, serial: ++this.serial });
    if (this.undoStack.length > this.limit) this.undoStack.shift();
    this.redoStack = [];
  }

  get canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  get canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  undo(doc: Doc): Doc | null {
    const e = this.undoStack.pop();
    if (!e) return null;
    this.redoStack.push(e);
    return e.cmd.revert(doc);
  }

  redo(doc: Doc): Doc | null {
    const e = this.redoStack.pop();
    if (!e) return null;
    this.undoStack.push(e);
    return e.cmd.apply(doc);
  }

  private get currentSerial(): number {
    return this.undoStack.length ? this.undoStack[this.undoStack.length - 1].serial : 0;
  }

  markSaved(): void {
    this.savedSerial = this.currentSerial;
  }

  /** Forget the save point (e.g. the document was restored from autosave, never saved to a file). */
  markUnsaved(): void {
    this.savedSerial = -1;
  }

  get isDirty(): boolean {
    return this.currentSerial !== this.savedSerial;
  }

  get undoCount(): number {
    return this.undoStack.length;
  }

  clear(): void {
    this.undoStack = [];
    this.redoStack = [];
    this.serial = 0;
    this.savedSerial = 0;
  }
}
