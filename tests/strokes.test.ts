import { describe, expect, it } from 'vitest';
import {
  addStrokesCommand,
  applyDiff,
  diffStrokes,
  revertDiff,
  strokeCommandFromDocs,
} from '../src/model/commands';
import { History } from '../src/model/history';
import { outlinePolygon, strokeOutlinePath } from '../src/model/outline';
import { absPoints, makeStroke, translateStroke } from '../src/model/strokes';
import type { Doc } from '../src/model/types';
import { line, threePages } from './helpers/docs';

describe('strokes', () => {
  it('rounds coordinates to 0.01 pt and stores points relative to the first point', () => {
    const s = makeStroke('pen', '#000000', 2, [
      { x: 10.123456, y: 20.987654, pressure: 0.33333 },
      { x: 15.5, y: 25.25, pressure: 1 },
    ]);
    expect(s.ox).toBe(10.12);
    expect(s.oy).toBe(20.99);
    expect(s.points[0]).toEqual({ x: 0, y: 0, pressure: 0.333 });
    expect(s.points[1]).toEqual({ x: 5.38, y: 4.26, pressure: 1 });
    expect(s.bbox).toEqual({ minX: 10.12, minY: 20.99, maxX: 15.5, maxY: 25.25 });
  });

  it('translates without copying points', () => {
    const s = line(0, 0, 100, 50);
    const t = translateStroke(s, 10, 20);
    expect(t.points).toBe(s.points);
    expect(t.bbox).toEqual({ minX: 10, minY: 20, maxX: 110, maxY: 70 });
    expect(absPoints(t)[0]).toEqual({ x: 10, y: 20, pressure: 0.5 });
  });

  it('produces a pressure-sensitive outline', () => {
    const pts = (pressure: number) =>
      Array.from({ length: 40 }, (_, i) => ({ x: i * 2, y: 0, pressure }));
    const thin = outlinePolygon('pen', 4, pts(0.1));
    const thick = outlinePolygon('pen', 4, pts(1));
    const height = (poly: number[][]) =>
      Math.max(...poly.map((p) => p[1])) - Math.min(...poly.map((p) => p[1]));
    expect(height(thick)).toBeGreaterThan(height(thin) * 2);
    expect(height(thick)).toBeCloseTo(4, 0);
    expect(strokeOutlinePath(line(0, 0, 10, 10))).toMatch(/^M.*Z$/);
  });
});

describe('stroke diffs and commands', () => {
  it('diff then apply/revert reproduces both lists exactly', () => {
    const a = line(0, 0, 10, 0);
    const b = line(0, 10, 10, 10);
    const c = line(0, 20, 10, 20);
    const before = [a, b, c];
    const bMoved = translateStroke(b, 5, 5);
    const d = line(0, 30, 10, 30);
    const after = [bMoved, c, d];
    const diff = diffStrokes(before, after);
    expect(applyDiff(before, diff)).toEqual(after);
    expect(revertDiff(after, diff)).toEqual(before);
  });

  it('undo then redo returns the identical document for an added stroke', () => {
    const doc0 = threePages();
    const s = line(100, 100, 200, 100);
    const cmd = addStrokesCommand('Pen stroke', doc0, [s]);
    const doc1 = cmd.apply(doc0);
    expect(doc1.strokes).toEqual([s]);
    const undone = cmd.revert(doc1);
    expect(undone).toEqual(doc0);
    expect(cmd.apply(undone)).toEqual(doc1);
  });

  it('builds commands from before/after documents', () => {
    const doc0: Doc = { ...threePages(), strokes: [line(0, 0, 5, 5)] };
    expect(strokeCommandFromDocs('noop', doc0, doc0)).toBeNull();
  });
});

describe('history', () => {
  it('undoes, redoes, tracks dirty state and keeps at least 200 steps', () => {
    const h = new History();
    let doc = threePages();
    const clean = doc;
    for (let i = 0; i < 250; i++) {
      const cmd = addStrokesCommand('s', doc, [line(0, i, 10, i)]);
      doc = cmd.apply(doc);
      h.push(cmd);
    }
    expect(h.isDirty).toBe(true);
    const full = doc;
    for (let i = 0; i < 250; i++) doc = h.undo(doc)!;
    expect(doc).toEqual(clean);
    expect(h.canUndo).toBe(false);
    for (let i = 0; i < 250; i++) doc = h.redo(doc)!;
    expect(doc).toEqual(full);

    h.markSaved();
    expect(h.isDirty).toBe(false);
    doc = h.undo(doc)!;
    expect(h.isDirty).toBe(true);
    doc = h.redo(doc)!;
    expect(h.isDirty).toBe(false);
  });

  it('clears redo on a new edit', () => {
    const h = new History();
    let doc = threePages();
    const c1 = addStrokesCommand('a', doc, [line(0, 0, 1, 1)]);
    doc = c1.apply(doc);
    h.push(c1);
    doc = h.undo(doc)!;
    const c2 = addStrokesCommand('b', doc, [line(0, 5, 1, 5)]);
    doc = c2.apply(doc);
    h.push(c2);
    expect(h.canRedo).toBe(false);
  });
});
