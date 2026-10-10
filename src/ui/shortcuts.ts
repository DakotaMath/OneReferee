import type { ToolId } from '../tools/toolTypes';

/** What the keyboard shortcuts drive. Implemented by App. */
export interface ShortcutTarget {
  readonly tool: ToolId;
  readonly hasDoc: boolean;
  /** Incremented on every pointer gesture; tells a "hold" from a "tap". */
  readonly gestureCount: number;
  setTool(t: ToolId, temporary?: boolean): void;
  setSpaceHeld(held: boolean): void;
  toggleEraserMode(): void;
  setPenColorIndex(i: number): void;
  undo(): void;
  redo(): void;
  copy(): void;
  cut(): void;
  paste(): void;
  deleteSelection(): void;
  escape(): void;
  open(): void;
  save(saveAs: boolean): void;
  exportPdf(): void;
  zoomStep(dir: 1 | -1): void;
  zoomReset(): void;
  toggleFullscreen(): void;
  scrollBy(dx: number, dy: number): void;
  scrollPage(dir: 1 | -1): void;
  scrollToEnd(dir: 1 | -1): void;
  altChanged(): void;
}

/** Keys that switch tool only while held, or permanently on a quick tap. */
const HOLD_KEYS: Record<string, ToolId> = { e: 'eraser', l: 'lasso', ' ': 'hand' };
const TAP_MS = 300;

const TOOL_KEYS: Record<string, ToolId> = {
  p: 'pen',
  h: 'highlighter',
  m: 'rect',
  i: 'space',
  v: 'hand',
};

function isTextInput(t: EventTarget | null): boolean {
  if (!(t instanceof HTMLElement)) return false;
  if (t instanceof HTMLInputElement) return t.type !== 'color' && t.type !== 'button';
  return t instanceof HTMLTextAreaElement || t.isContentEditable;
}

export function installShortcuts(app: ShortcutTarget): void {
  let held: {
    key: string;
    prev: ToolId | null;
    down: number;
    gestures: number;
  } | null = null;

  window.addEventListener('keydown', (e) => {
    if (isTextInput(e.target)) return;
    // Alt on its own would focus the browser menu on Windows; it is our "no snapping" modifier.
    if (e.key === 'Alt') {
      e.preventDefault();
      app.altChanged();
      return;
    }
    const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    const ctrl = e.ctrlKey || e.metaKey;

    if (ctrl) {
      const code = e.code;
      let handled = true;
      if (key === 'z' && !e.shiftKey) app.undo();
      else if (key === 'y' || (key === 'z' && e.shiftKey)) app.redo();
      else if (key === 'c') app.copy();
      else if (key === 'x') app.cut();
      else if (key === 'v') app.paste();
      else if (key === 's') app.save(e.shiftKey);
      else if (key === 'o') app.open();
      else if (key === 'e') app.exportPdf();
      else if (key === '=' || key === '+' || code === 'Equal' || code === 'NumpadAdd')
        app.zoomStep(1);
      else if (key === '-' || key === '_' || code === 'Minus' || code === 'NumpadSubtract')
        app.zoomStep(-1);
      else if (key === '0' || code === 'Digit0' || code === 'Numpad0') app.zoomReset();
      else handled = false;
      if (handled) e.preventDefault();
      return;
    }
    if (e.altKey) return;

    if (key in HOLD_KEYS) {
      e.preventDefault();
      if (e.repeat || held) return;
      const target = HOLD_KEYS[key];
      if (key === ' ') {
        held = { key, prev: null, down: performance.now(), gestures: app.gestureCount };
        app.setSpaceHeld(true);
      } else if (app.tool === target) {
        held = { key, prev: null, down: performance.now(), gestures: app.gestureCount };
      } else {
        held = { key, prev: app.tool, down: performance.now(), gestures: app.gestureCount };
        app.setTool(target, true);
      }
      return;
    }
    if (
      e.repeat &&
      !['PageUp', 'PageDown', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(key)
    )
      return;

    let handled = true;
    if (key in TOOL_KEYS) app.setTool(TOOL_KEYS[key]);
    else if (/^[1-6]$/.test(key)) app.setPenColorIndex(Number(key) - 1);
    else if (key === 'f') app.toggleFullscreen();
    else if (key === 'Delete' || key === 'Backspace') app.deleteSelection();
    else if (key === 'Escape') app.escape();
    else if (key === 'PageDown') app.scrollPage(1);
    else if (key === 'PageUp') app.scrollPage(-1);
    else if (key === 'Home') app.scrollToEnd(-1);
    else if (key === 'End') app.scrollToEnd(1);
    else if (key === 'ArrowDown') app.scrollBy(0, 60);
    else if (key === 'ArrowUp') app.scrollBy(0, -60);
    else if (key === 'ArrowRight') app.scrollBy(60, 0);
    else if (key === 'ArrowLeft') app.scrollBy(-60, 0);
    else handled = false;
    if (handled) e.preventDefault();
  });

  window.addEventListener('keyup', (e) => {
    if (e.key === 'Alt') {
      e.preventDefault();
      app.altChanged();
      return;
    }
    const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    if (!held || held.key !== key) return;
    const h = held;
    held = null;
    const tap = performance.now() - h.down < TAP_MS && app.gestureCount === h.gestures;
    if (key === ' ') {
      app.setSpaceHeld(false);
      if (tap) app.setTool('hand');
    } else if (h.prev === null) {
      // Tool was already active: a tap on E toggles stroke/point eraser.
      if (tap && key === 'e') app.toggleEraserMode();
    } else if (tap) {
      app.setTool(HOLD_KEYS[key]); // make it permanent
    } else {
      app.setTool(h.prev, true); // back to the previous tool
    }
  });

  // If the window loses focus mid-hold, release the temporary tool.
  window.addEventListener('blur', () => {
    if (!held) return;
    if (held.key === ' ') app.setSpaceHeld(false);
    else if (held.prev) app.setTool(held.prev, true);
    held = null;
  });
}
