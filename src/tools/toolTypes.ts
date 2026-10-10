/** Tool identifiers and the palettes/widths offered for each tool. */

export type ToolId = 'pen' | 'highlighter' | 'eraser' | 'lasso' | 'rect' | 'space' | 'hand';
export type EraserMode = 'stroke' | 'point';

export interface WidthOption {
  id: string;
  label: string;
  width: number;
}

export const PEN_COLORS = ['#000000', '#1a3a8f', '#d32f2f', '#2e7d32', '#ef6c00', '#7b1fa2'];
export const PEN_COLOR_NAMES = ['Black', 'Dark blue', 'Red', 'Green', 'Orange', 'Purple'];

export const HIGHLIGHTER_COLORS = ['#fff176', '#b9f6a8', '#ffb3dc', '#a6dcff'];
export const HIGHLIGHTER_COLOR_NAMES = ['Yellow', 'Green', 'Pink', 'Blue'];

/** Pen widths in points at full pressure. */
export const PEN_WIDTHS: WidthOption[] = [
  { id: 'fine', label: 'Fine', width: 1 },
  { id: 'medium', label: 'Medium', width: 2 },
  { id: 'thick', label: 'Thick', width: 4 },
];

/** Highlighter widths in points (no pressure). */
export const HIGHLIGHTER_WIDTHS: WidthOption[] = [
  { id: 'medium', label: 'Medium', width: 8 },
  { id: 'thick', label: 'Thick', width: 14 },
];

/** Eraser radii in points. */
export const ERASER_SIZES: WidthOption[] = [
  { id: 'small', label: 'Small', width: 4 },
  { id: 'medium', label: 'Medium', width: 9 },
  { id: 'large', label: 'Large', width: 18 },
];

export const TOOL_LABELS: Record<ToolId, string> = {
  pen: 'Pen',
  highlighter: 'Highlighter',
  eraser: 'Eraser',
  lasso: 'Lasso select',
  rect: 'Rectangle select',
  space: 'Insert space',
  hand: 'Hand / pan',
};

export const TOOL_SHORTCUTS: Record<ToolId, string> = {
  pen: 'P',
  highlighter: 'H',
  eraser: 'E',
  lasso: 'L',
  rect: 'M',
  space: 'I',
  hand: 'V or hold Space',
};
