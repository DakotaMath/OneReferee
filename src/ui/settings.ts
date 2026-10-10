import {
  ERASER_SIZES,
  HIGHLIGHTER_COLORS,
  HIGHLIGHTER_WIDTHS,
  PEN_COLORS,
  PEN_WIDTHS,
  type EraserMode,
} from '../tools/toolTypes';

/** User preferences remembered between sessions (localStorage). */
export interface Settings {
  penColor: string;
  penWidth: string;
  penCustomColor: string;
  highlighterColor: string;
  highlighterWidth: string;
  eraserMode: EraserMode;
  eraserSize: string;
  inkTipDismissed: boolean;
}

const KEY = 'pdf-spacer-notes:settings';

export const DEFAULT_SETTINGS: Settings = {
  penColor: PEN_COLORS[0],
  penWidth: PEN_WIDTHS[1].id,
  penCustomColor: '#00838f',
  highlighterColor: HIGHLIGHTER_COLORS[0],
  highlighterWidth: HIGHLIGHTER_WIDTHS[0].id,
  eraserMode: 'stroke',
  eraserSize: ERASER_SIZES[1].id,
  inkTipDismissed: false,
};

const isColor = (v: unknown): v is string => typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v);

export function loadSettings(): Settings {
  const s = { ...DEFAULT_SETTINGS };
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return s;
    const v = JSON.parse(raw) as Partial<Settings>;
    if (isColor(v.penColor)) s.penColor = v.penColor;
    if (isColor(v.penCustomColor)) s.penCustomColor = v.penCustomColor;
    if (isColor(v.highlighterColor)) s.highlighterColor = v.highlighterColor;
    if (PEN_WIDTHS.some((w) => w.id === v.penWidth)) s.penWidth = v.penWidth!;
    if (HIGHLIGHTER_WIDTHS.some((w) => w.id === v.highlighterWidth))
      s.highlighterWidth = v.highlighterWidth!;
    if (ERASER_SIZES.some((w) => w.id === v.eraserSize)) s.eraserSize = v.eraserSize!;
    if (v.eraserMode === 'stroke' || v.eraserMode === 'point') s.eraserMode = v.eraserMode;
    if (typeof v.inkTipDismissed === 'boolean') s.inkTipDismissed = v.inkTipDismissed;
  } catch {
    // Corrupt or unavailable storage: fall back to defaults.
  }
  return s;
}

export function saveSettings(s: Settings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    // Storage unavailable (private mode); settings just won't persist.
  }
}
