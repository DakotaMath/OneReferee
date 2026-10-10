import type { View } from '../render/viewport';

/** Overlay scrollbars for the custom-scrolled document view. Thumbs are draggable. */
export class Scrollbars {
  private vThumb: HTMLElement;
  private hThumb: HTMLElement;
  private view: View | null = null;
  private max = { x: 0, y: 0 };

  constructor(
    private v: HTMLElement,
    private h: HTMLElement,
    private onScroll: (x: number, y: number) => void,
  ) {
    this.vThumb = v.querySelector('.thumb')!;
    this.hThumb = h.querySelector('.thumb')!;
    this.attachDrag(this.vThumb, 'y');
    this.attachDrag(this.hThumb, 'x');
    // Clicking the track pages up/down.
    v.addEventListener('pointerdown', (e) => {
      if (e.target !== v || !this.view) return;
      const r = this.vThumb.getBoundingClientRect();
      const dir = e.clientY < r.top ? -1 : 1;
      this.onScroll(this.view.scrollX, this.view.scrollY + dir * this.view.height * 0.9);
    });
  }

  private attachDrag(thumb: HTMLElement, axis: 'x' | 'y'): void {
    thumb.addEventListener('pointerdown', (e) => {
      if (!this.view) return;
      e.preventDefault();
      e.stopPropagation();
      thumb.setPointerCapture(e.pointerId);
      thumb.classList.add('dragging');
      const start = axis === 'y' ? e.clientY : e.clientX;
      const startScroll = axis === 'y' ? this.view.scrollY : this.view.scrollX;
      const track = axis === 'y' ? this.v.clientHeight : this.h.clientWidth;
      const size = axis === 'y' ? this.view.height : this.view.width;
      const max = axis === 'y' ? this.max.y : this.max.x;
      const thumbLen = Math.max(30, (track * size) / (size + max));
      const ratio = max / Math.max(1, track - thumbLen);
      const move = (ev: PointerEvent) => {
        if (!this.view) return;
        const d = ((axis === 'y' ? ev.clientY : ev.clientX) - start) * ratio;
        if (axis === 'y') this.onScroll(this.view.scrollX, startScroll + d);
        else this.onScroll(startScroll + d, this.view.scrollY);
      };
      const up = () => {
        thumb.classList.remove('dragging');
        thumb.removeEventListener('pointermove', move);
        thumb.removeEventListener('pointerup', up);
        thumb.removeEventListener('pointercancel', up);
      };
      thumb.addEventListener('pointermove', move);
      thumb.addEventListener('pointerup', up);
      thumb.addEventListener('pointercancel', up);
    });
  }

  update(view: View, max: { x: number; y: number }): void {
    this.view = view;
    this.max = max;
    this.place(this.v, this.vThumb, view.height, view.scrollY, max.y, 'y');
    this.place(this.h, this.hThumb, view.width, view.scrollX, max.x, 'x');
  }

  private place(
    bar: HTMLElement,
    thumb: HTMLElement,
    size: number,
    scroll: number,
    max: number,
    axis: 'x' | 'y',
  ): void {
    bar.classList.toggle('hidden', max <= 0.5);
    if (max <= 0.5) return;
    const track = axis === 'y' ? bar.clientHeight : bar.clientWidth;
    const len = Math.max(30, (track * size) / (size + max));
    const pos = ((track - len) * scroll) / max;
    if (axis === 'y') {
      thumb.style.top = `${pos}px`;
      thumb.style.height = `${len}px`;
    } else {
      thumb.style.left = `${pos}px`;
      thumb.style.width = `${len}px`;
    }
  }
}
