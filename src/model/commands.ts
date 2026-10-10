import type { Doc, Segment, Stroke } from './types';

/** An undoable edit. Both directions are pure: they take a document and return a new one. */
export interface Command {
  readonly label: string;
  apply(doc: Doc): Doc;
  revert(doc: Doc): Doc;
}

export interface IndexedStroke {
  index: number;
  stroke: Stroke;
}

/**
 * Difference between two stroke lists. `removed` indices refer to the list before,
 * `added` indices to the list after; both ascending. A changed stroke (same id, new
 * object, e.g. moved) appears in both.
 */
export interface StrokeDiff {
  removed: IndexedStroke[];
  added: IndexedStroke[];
}

export function diffStrokes(before: readonly Stroke[], after: readonly Stroke[]): StrokeDiff {
  const afterById = new Map<string, Stroke>();
  for (const s of after) afterById.set(s.id, s);
  const beforeById = new Map<string, Stroke>();
  for (const s of before) beforeById.set(s.id, s);
  const removed: IndexedStroke[] = [];
  before.forEach((s, index) => {
    if (afterById.get(s.id) !== s) removed.push({ index, stroke: s });
  });
  const added: IndexedStroke[] = [];
  after.forEach((s, index) => {
    if (beforeById.get(s.id) !== s) added.push({ index, stroke: s });
  });
  return { removed, added };
}

export function isEmptyDiff(d: StrokeDiff): boolean {
  return d.removed.length === 0 && d.added.length === 0;
}

function patch(
  strokes: readonly Stroke[],
  remove: IndexedStroke[],
  insert: IndexedStroke[],
): Stroke[] {
  const out = strokes.slice();
  for (let i = remove.length - 1; i >= 0; i--) out.splice(remove[i].index, 1);
  for (const { index, stroke } of insert) out.splice(index, 0, stroke);
  return out;
}

export function applyDiff(strokes: readonly Stroke[], d: StrokeDiff): Stroke[] {
  return patch(strokes, d.removed, d.added);
}

export function revertDiff(strokes: readonly Stroke[], d: StrokeDiff): Stroke[] {
  return patch(strokes, d.added, d.removed);
}

/** A command that changes strokes only (add, erase, move, paste, delete…). */
export function strokeCommand(label: string, diff: StrokeDiff): Command {
  return {
    label,
    apply: (doc) => ({ ...doc, strokes: applyDiff(doc.strokes, diff) }),
    revert: (doc) => ({ ...doc, strokes: revertDiff(doc.strokes, diff) }),
  };
}

/** Build a stroke command from the document before and after an edit. */
export function strokeCommandFromDocs(label: string, before: Doc, after: Doc): Command | null {
  const diff = diffStrokes(before.strokes, after.strokes);
  return isEmptyDiff(diff) ? null : strokeCommand(label, diff);
}

/** A command that changes the segment list and moves strokes (insert/remove space). */
export function spaceCommand(label: string, before: Doc, after: Doc): Command | null {
  const diff = diffStrokes(before.strokes, after.strokes);
  const segBefore: readonly Segment[] = before.segments;
  const segAfter: readonly Segment[] = after.segments;
  if (segBefore === segAfter && isEmptyDiff(diff)) return null;
  return {
    label,
    apply: (doc) => ({ ...doc, segments: segAfter, strokes: applyDiff(doc.strokes, diff) }),
    revert: (doc) => ({ ...doc, segments: segBefore, strokes: revertDiff(doc.strokes, diff) }),
  };
}

export function addStrokesCommand(label: string, doc: Doc, strokes: Stroke[]): Command {
  const start = doc.strokes.length;
  return strokeCommand(label, {
    removed: [],
    added: strokes.map((stroke, i) => ({ index: start + i, stroke })),
  });
}
