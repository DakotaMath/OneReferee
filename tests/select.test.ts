import { describe, expect, it } from 'vitest';
import { addStrokesCommand, strokeCommandFromDocs } from '../src/model/commands';
import {
  deleteStrokes,
  duplicateStrokes,
  pointInPolygon,
  selectByLasso,
  selectByRect,
  selectionBounds,
  translateStrokes,
} from '../src/model/select';
import type { Doc } from '../src/model/types';
import { line, threePages } from './helpers/docs';

const square = [
  { x: 0, y: 0 },
  { x: 100, y: 0 },
  { x: 100, y: 100 },
  { x: 0, y: 100 },
];

describe('point in polygon', () => {
  it('handles convex and concave shapes', () => {
    expect(pointInPolygon(50, 50, square)).toBe(true);
    expect(pointInPolygon(150, 50, square)).toBe(false);
    // A "C" shape: the notch is outside.
    const c = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 30 },
      { x: 30, y: 30 },
      { x: 30, y: 70 },
      { x: 100, y: 70 },
      { x: 100, y: 100 },
      { x: 0, y: 100 },
    ];
    expect(pointInPolygon(60, 50, c)).toBe(false);
    expect(pointInPolygon(15, 50, c)).toBe(true);
  });
});

describe('lasso and rectangle hit testing', () => {
  const inside = line(10, 50, 90, 50, 10, 'inside'); // fully inside
  const mostly = line(40, 20, 140, 20, 10, 'mostly'); // 7 of 11 points inside (x ≤ 100)
  const half = line(45, 80, 145, 80, 10, 'half'); // 6 of 11 inside: more than half
  const little = line(80, 60, 180, 60, 10, 'little'); // 3 of 11 inside
  const outside = line(200, 50, 300, 50, 10, 'outside');
  const all = [inside, mostly, half, little, outside];

  it('selects strokes with most of their points inside a lasso', () => {
    expect(selectByLasso(all, square)).toEqual(['inside', 'mostly', 'half']);
  });

  it('selects strokes with most of their points inside a rectangle, any drag direction', () => {
    expect(selectByRect(all, { x: 0, y: 0 }, { x: 100, y: 100 })).toEqual([
      'inside',
      'mostly',
      'half',
    ]);
    expect(selectByRect(all, { x: 100, y: 100 }, { x: 0, y: 0 })).toEqual([
      'inside',
      'mostly',
      'half',
    ]);
    expect(selectByRect(all, { x: 190, y: 0 }, { x: 400, y: 100 })).toEqual(['outside']);
  });

  it('needs at least a triangle for a lasso', () => {
    expect(selectByLasso(all, square.slice(0, 2))).toEqual([]);
  });
});

describe('selection edits', () => {
  const a = line(10, 50, 90, 50, 10, 'a');
  const b = line(10, 900, 90, 900, 10, 'b'); // on page 2
  const base: Doc = { ...threePages(), strokes: [a, b] };

  it('moves selected strokes, e.g. across a page, with exact undo/redo', () => {
    const moved = translateStrokes(base, new Set(['a']), 5, 1000);
    expect(moved.strokes[0].bbox.minY).toBe(1050);
    expect(moved.strokes[1]).toBe(b);
    const cmd = strokeCommandFromDocs('Move', base, moved)!;
    expect(cmd.revert(moved)).toEqual(base);
    expect(cmd.apply(cmd.revert(moved))).toEqual(moved);
  });

  it('deletes selected strokes, with exact undo/redo', () => {
    const del = deleteStrokes(base, new Set(['a']));
    expect(del.strokes.map((s) => s.id)).toEqual(['b']);
    const cmd = strokeCommandFromDocs('Delete', base, del)!;
    expect(cmd.revert(del)).toEqual(base);
    expect(cmd.apply(cmd.revert(del))).toEqual(del);
  });

  it('pastes copies with new ids, with exact undo/redo', () => {
    const copies = duplicateStrokes([a], 12, 12);
    expect(copies[0].id).not.toBe('a');
    expect(copies[0].points).toBe(a.points);
    expect(copies[0].bbox.minX).toBe(a.bbox.minX + 12);
    const cmd = addStrokesCommand('Paste', base, copies);
    const pasted = cmd.apply(base);
    expect(pasted.strokes).toHaveLength(3);
    expect(cmd.revert(pasted)).toEqual(base);
    expect(cmd.apply(cmd.revert(pasted))).toEqual(pasted);
  });

  it('computes selection bounds including stroke width', () => {
    expect(selectionBounds(base.strokes, new Set(['a']))).toEqual({
      minX: 9,
      minY: 49,
      maxX: 91,
      maxY: 51,
    });
    expect(selectionBounds(base.strokes, new Set())).toBeNull();
  });
});
