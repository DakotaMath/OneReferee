import { ICONS } from './icons';
import type { Settings } from './settings';
import {
  ERASER_SIZES,
  HIGHLIGHTER_COLORS,
  HIGHLIGHTER_COLOR_NAMES,
  HIGHLIGHTER_WIDTHS,
  PEN_COLORS,
  PEN_COLOR_NAMES,
  PEN_WIDTHS,
  TOOL_LABELS,
  TOOL_SHORTCUTS,
  type ToolId,
} from '../tools/toolTypes';

export interface ToolbarState {
  tool: ToolId;
  hasDoc: boolean;
  canUndo: boolean;
  canRedo: boolean;
  zoom: number;
  fullscreen: boolean;
  settings: Settings;
}

export interface ToolbarActions {
  open(): void;
  save(): void;
  exportPdf(): void;
  undo(): void;
  redo(): void;
  setTool(tool: ToolId): void;
  toggleEraserMode(): void;
  setColor(color: string): void;
  setCustomColor(color: string): void;
  setWidth(id: string): void;
  zoomIn(): void;
  zoomOut(): void;
  fitWidth(): void;
  toggleFullscreen(): void;
}

const TOOL_ORDER: ToolId[] = ['pen', 'highlighter', 'eraser', 'lasso', 'rect', 'space', 'hand'];

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Partial<HTMLElementTagNameMap[K]> & { className?: string } = {},
  html?: string,
): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  Object.assign(e, props);
  if (html !== undefined) e.innerHTML = html;
  return e;
}

function button(icon: string, title: string, onClick: () => void, className = 'tb-btn') {
  const b = el('button', { className, title, type: 'button' }, icon);
  b.setAttribute('aria-label', title);
  // Keep keyboard focus on the document so shortcuts keep working after a click.
  b.addEventListener('mousedown', (e) => e.preventDefault());
  b.addEventListener('click', onClick);
  return b;
}

/** The top toolbar. Built once; `update` refreshes it from app state. */
export class Toolbar {
  private toolButtons = new Map<ToolId, HTMLButtonElement>();
  private undoBtn: HTMLButtonElement;
  private redoBtn: HTMLButtonElement;
  private saveBtn: HTMLButtonElement;
  private exportBtn: HTMLButtonElement;
  private zoomLabel: HTMLSpanElement;
  private fullscreenBtn: HTMLButtonElement;
  private eraserToggle: HTMLButtonElement;
  private optionsGroup: HTMLDivElement;
  private docOnly: HTMLButtonElement[] = [];
  private lastOptionsKey = '';

  constructor(
    private root: HTMLElement,
    private actions: ToolbarActions,
  ) {
    const a = actions;
    const sep = () => el('div', { className: 'sep' });
    const group = () => el('div', { className: 'group' });

    const file = group();
    file.append(
      button(ICONS.open, 'Open PDF or project (Ctrl+O)', () => a.open()),
      (this.saveBtn = button(ICONS.save, 'Save project (Ctrl+S, Ctrl+Shift+S to save as)', () =>
        a.save(),
      )),
      (this.exportBtn = button(ICONS.export, 'Export annotated PDF (Ctrl+E)', () => a.exportPdf())),
    );

    const history = group();
    history.append(
      (this.undoBtn = button(ICONS.undo, 'Undo (Ctrl+Z)', () => a.undo())),
      (this.redoBtn = button(ICONS.redo, 'Redo (Ctrl+Y or Ctrl+Shift+Z)', () => a.redo())),
    );

    const tools = group();
    for (const t of TOOL_ORDER) {
      const extra = t === 'eraser' ? ' — press E again to switch stroke/point' : '';
      const b = button(ICONS[t], `${TOOL_LABELS[t]} (${TOOL_SHORTCUTS[t]})${extra}`, () =>
        a.setTool(t),
      );
      this.toolButtons.set(t, b);
      tools.append(b);
      if (t === 'eraser') {
        this.eraserToggle = el('button', {
          className: 'mode-toggle',
          type: 'button',
          title: 'Eraser mode: stroke or point (E while erasing)',
        });
        this.eraserToggle.addEventListener('mousedown', (e) => e.preventDefault());
        this.eraserToggle.addEventListener('click', () => a.toggleEraserMode());
        tools.append(this.eraserToggle);
      }
    }
    this.eraserToggle ??= el('button');

    this.optionsGroup = group();

    const zoom = group();
    this.zoomLabel = el('span', { className: 'zoom-label', title: 'Zoom (Ctrl+0 resets to 100%)' });
    zoom.append(
      button(ICONS.zoomOut, 'Zoom out (Ctrl+-)', () => a.zoomOut()),
      this.zoomLabel,
      button(ICONS.zoomIn, 'Zoom in (Ctrl+=)', () => a.zoomIn()),
      button(ICONS.fitWidth, 'Fit width (W)', () => a.fitWidth()),
    );

    this.fullscreenBtn = button(ICONS.fullscreen, 'Full screen (F)', () => a.toggleFullscreen());

    root.append(
      file,
      sep(),
      history,
      sep(),
      tools,
      sep(),
      this.optionsGroup,
      el('div', { className: 'spacer' }),
      zoom,
      sep(),
      this.fullscreenBtn,
    );
    this.docOnly = [this.saveBtn, this.exportBtn];
  }

  update(s: ToolbarState): void {
    for (const [t, b] of this.toolButtons) {
      b.classList.toggle('active', t === s.tool);
      b.setAttribute('aria-pressed', String(t === s.tool));
    }
    this.eraserToggle.textContent = s.settings.eraserMode === 'stroke' ? 'Stroke' : 'Point';
    this.eraserToggle.classList.toggle('active', s.tool === 'eraser');
    this.undoBtn.disabled = !s.canUndo;
    this.redoBtn.disabled = !s.canRedo;
    for (const b of this.docOnly) b.disabled = !s.hasDoc;
    this.zoomLabel.textContent = `${Math.round(s.zoom * 100)}%`;
    this.fullscreenBtn.innerHTML = s.fullscreen ? ICONS.exitFullscreen : ICONS.fullscreen;
    this.fullscreenBtn.title = s.fullscreen ? 'Exit full screen (F)' : 'Full screen (F)';
    this.renderOptions(s);
  }

  /** Color swatches and width buttons for the active tool. */
  private renderOptions(s: ToolbarState): void {
    const st = s.settings;
    const key = JSON.stringify([s.tool, st]);
    if (key === this.lastOptionsKey) return;
    this.lastOptionsKey = key;
    const g = this.optionsGroup;
    g.replaceChildren();
    const a = this.actions;

    // Pen and highlighter keep their own colors; other tools show the pen palette greyed out
    // only when they draw, so selection/space/hand tools show nothing here.
    if (s.tool === 'pen' || s.tool === 'highlighter') {
      const isPen = s.tool === 'pen';
      const colors = isPen ? PEN_COLORS : HIGHLIGHTER_COLORS;
      const names = isPen ? PEN_COLOR_NAMES : HIGHLIGHTER_COLOR_NAMES;
      const current = isPen ? st.penColor : st.highlighterColor;
      colors.forEach((c, i) => {
        const b = el('button', {
          className: 'swatch' + (c.toLowerCase() === current.toLowerCase() ? ' active' : ''),
          type: 'button',
          title: `${names[i]} (${i + 1})`,
        });
        b.style.background = c;
        b.addEventListener('mousedown', (e) => e.preventDefault());
        b.addEventListener('click', () => a.setColor(c));
        g.append(b);
      });
      if (isPen) {
        const custom = el('label', {
          className:
            'swatch custom' +
            (!PEN_COLORS.includes(current.toLowerCase()) &&
            current.toLowerCase() === st.penCustomColor.toLowerCase()
              ? ' active'
              : ''),
          title: 'Custom color (7) — click to use, click again to pick a color',
        });
        const inner = el('span', { className: 'inner' });
        inner.style.background = st.penCustomColor;
        const input = el('input', { type: 'color', value: st.penCustomColor });
        input.addEventListener('click', (e) => {
          // First click selects the remembered custom color; when it is already active, open the picker.
          if (st.penColor.toLowerCase() !== st.penCustomColor.toLowerCase()) {
            e.preventDefault();
            a.setColor(st.penCustomColor);
          }
        });
        input.addEventListener('input', () => a.setCustomColor(input.value));
        input.addEventListener('change', () => {
          a.setCustomColor(input.value);
          input.blur();
        });
        custom.append(inner, input);
        g.append(custom);
      }
      g.append(el('div', { className: 'sep' }));
      const widths = isPen ? PEN_WIDTHS : HIGHLIGHTER_WIDTHS;
      const currentW = isPen ? st.penWidth : st.highlighterWidth;
      for (const w of widths) {
        const px = isPen ? 2 + w.width * 2 : 4 + w.width * 0.8;
        const b = button(
          `<span class="dot" style="width:${px}px;height:${px}px;${isPen ? '' : `background:${current};border-radius:3px;outline:1px solid #b9bdc6`}"></span>`,
          `${w.label} (${w.width} pt) — [ and ] change width`,
          () => a.setWidth(w.id),
          'tb-btn small width-btn' + (w.id === currentW ? ' active' : ''),
        );
        g.append(b);
      }
    } else if (s.tool === 'eraser') {
      for (const w of ERASER_SIZES) {
        const px = 6 + w.width * 0.8;
        const b = button(
          `<span class="dot" style="width:${px}px;height:${px}px;background:transparent;border:1.5px solid currentColor"></span>`,
          `${w.label} eraser — [ and ] change size`,
          () => a.setWidth(w.id),
          'tb-btn small width-btn' + (w.id === st.eraserSize ? ' active' : ''),
        );
        g.append(b);
      }
    }
  }

  get element(): HTMLElement {
    return this.root;
  }
}
