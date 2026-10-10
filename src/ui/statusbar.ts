export interface StatusState {
  fileName: string | null;
  dirty: boolean;
  page: number;
  pageCount: number;
  zoom: number;
  message: string;
}

/** Thin bar at the bottom: file name, unsaved dot, page under the viewport centre, zoom. */
export class StatusBar {
  private file = document.createElement('span');
  private dirty = document.createElement('span');
  private msg = document.createElement('span');
  private page = document.createElement('span');
  private zoom = document.createElement('span');
  private last = '';

  constructor(root: HTMLElement) {
    this.file.className = 'file';
    this.dirty.className = 'dirty';
    this.dirty.title = 'Unsaved changes';
    this.msg.className = 'saved-state';
    const grow = document.createElement('span');
    grow.className = 'grow';
    root.append(this.file, this.dirty, this.msg, grow, this.page, this.zoom);
  }

  update(s: StatusState): void {
    const key = JSON.stringify(s);
    if (key === this.last) return;
    this.last = key;
    this.file.textContent = s.fileName ?? 'No document';
    this.dirty.textContent = s.dirty ? '●' : '';
    this.msg.textContent = s.message;
    this.page.textContent = s.pageCount ? `Page ${s.page + 1} of ${s.pageCount}` : '';
    this.zoom.textContent = `${Math.round(s.zoom * 100)}%`;
  }
}
