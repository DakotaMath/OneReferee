import type { Gesture, Sample } from '../input/gesture';

interface Pannable {
  view: { scrollX: number; scrollY: number };
  scrollBy(dx: number, dy: number): void;
}

/** Drag to pan: the document follows the pointer. */
export function createPanGesture(app: Pannable, start: Sample): Gesture {
  let lastX = start.sx;
  let lastY = start.sy;
  return {
    cursor: 'grabbing',
    move(samples) {
      const s = samples[samples.length - 1];
      app.scrollBy(lastX - s.sx, lastY - s.sy);
      lastX = s.sx;
      lastY = s.sy;
    },
    up() {},
    cancel() {},
  };
}
