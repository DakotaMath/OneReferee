import { describe, expect, it } from 'vitest';
import { strokeCommandFromDocs } from '../src/model/commands';
import { eraseAt, eraseCircleFromStroke, strokeHitsCircle } from '../src/model/erase';
import { absPoints, makeStroke } from '../src/model/strokes';
import type { Doc } from '../src/model/types';
import { line, threePages } from './helpers/docs';

// Pen width 2, so the eraser reaches r + 1 from the centre line.
const long = () => line(0, 100, 200, 100, 20, 'long');

describe('stroke eraser hit test', () => {
  it('detects touching any part, including between sparse points', () => {
    const two = makeStroke('pen', '#000', 2, [
      { x: 0, y: 0, pressure: 0.5 },
      { x: 100, y: 0, pressure: 0.5 },
    ]);
    expect(strokeHitsCircle(two, 50, 3, 3)).toBe(true); // reaches 3 + 1
    expect(strokeHitsCircle(two, 50, 5, 3)).toBe(false);
    expect(strokeHitsCircle(two, -3.5, 0, 3)).toBe(true);
  });

  it('removes whole strokes in stroke mode', () => {
    const a = long();
    const b = line(0, 200, 200, 200, 20, 'b');
    const out = eraseAt([a, b], 100, 100, 5, 'stroke');
    expect(out).toEqual([b]);
  });

  it('returns the same array when nothing is touched', () => {
    const list = [long()];
    expect(eraseAt(list, 100, 150, 5, 'point')).toBe(list);
    expect(eraseAt(list, 100, 150, 5, 'stroke')).toBe(list);
  });
});

describe('point eraser', () => {
  it('cuts a long stroke into two clean pieces when erasing the middle', () => {
    const s = long();
    const pieces = eraseCircleFromStroke(s, 100, 100, 9)!; // reach 10
    expect(pieces).toHaveLength(2);
    const [left, right] = pieces.map(absPoints);
    expect(left[0].x).toBe(0);
    expect(left[left.length - 1].x).toBeCloseTo(90, 1);
    expect(right[0].x).toBeCloseTo(110, 1);
    expect(right[right.length - 1].x).toBe(200);
    // New ids, same style
    expect(pieces[0].id).not.toBe(s.id);
    expect(pieces[1].color).toBe(s.color);
    expect(pieces[1].width).toBe(s.width);
  });

  it('splits a two-point stroke even though no point is inside the eraser', () => {
    const s = makeStroke('pen', '#000', 2, [
      { x: 0, y: 0, pressure: 0.2 },
      { x: 100, y: 0, pressure: 1 },
    ]);
    const pieces = eraseCircleFromStroke(s, 50, 0, 4)!; // reach 5
    expect(pieces).toHaveLength(2);
    const left = absPoints(pieces[0]);
    expect(left[1].x).toBeCloseTo(45, 1);
    expect(left[1].pressure).toBeCloseTo(0.56, 2); // interpolated
  });

  it('shortens the stroke when erasing an end', () => {
    const pieces = eraseCircleFromStroke(long(), 0, 100, 9)!;
    expect(pieces).toHaveLength(1);
    const p = absPoints(pieces[0]);
    expect(p[0].x).toBeCloseTo(10, 1);
    expect(p[p.length - 1].x).toBe(200);
  });

  it('removes the stroke when the eraser covers all of it', () => {
    const small = line(0, 0, 4, 0, 4);
    expect(eraseCircleFromStroke(small, 2, 0, 10)).toEqual([]);
    const dot = makeStroke('pen', '#000', 2, [{ x: 5, y: 5, pressure: 0.5 }]);
    expect(eraseCircleFromStroke(dot, 5, 6, 1)).toEqual([]);
    expect(eraseCircleFromStroke(dot, 50, 50, 1)).toBeNull();
  });

  it('keeps stacking order and is one undo step for a whole gesture', () => {
    const a = line(0, 50, 200, 50, 20, 'a');
    const b = long();
    const c = line(0, 150, 200, 150, 20, 'c');
    const base: Doc = { ...threePages(), strokes: [a, b, c] };
    // A gesture: several dabs along the middle of b.
    let strokes = base.strokes;
    for (const x of [80, 90, 100, 110]) strokes = eraseAt(strokes, x, 100, 5, 'point');
    expect(strokes.map((s) => s.id)[0]).toBe('a');
    expect(strokes[strokes.length - 1].id).toBe('c');
    expect(strokes).toHaveLength(4); // a, two pieces of b, c
    const after: Doc = { ...base, strokes };
    const cmd = strokeCommandFromDocs('Erase', base, after)!;
    expect(cmd.revert(after)).toEqual(base);
    expect(cmd.apply(cmd.revert(after))).toEqual(after);
  });
});
