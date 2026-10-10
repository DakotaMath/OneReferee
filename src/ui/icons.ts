/** Inline SVG icons (24×24, stroked with currentColor). */

const svg = (body: string) => `<svg viewBox="0 0 24 24" aria-hidden="true">${body}</svg>`;

export const ICONS = {
  open: svg(
    '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
  ),
  save: svg(
    '<path d="M5 3h11l4 4v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5a2 2 0 0 1 1-2z"/><path d="M8 3v5h7V3"/><rect x="7" y="13" width="10" height="6" rx="1"/>',
  ),
  export: svg(
    '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/><path d="M12 11v6M9 14l3 3 3-3"/>',
  ),
  undo: svg('<path d="M9 14 4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 0 12h-3"/>'),
  redo: svg('<path d="m15 14 5-5-5-5"/><path d="M20 9H10a6 6 0 0 0 0 12h3"/>'),
  pen: svg('<path d="M4 20l1.5-5L16 4.5a2.1 2.1 0 0 1 3 3L8.5 18z"/><path d="M14 6.5l3 3"/>'),
  highlighter: svg(
    '<path d="M9 15l-4 4h6l2-2"/><path d="M8 13l7-9 5 5-9 7z"/><path d="M8 13l3 3"/>',
  ),
  eraser: svg(
    '<path d="M7 20h13"/><path d="M4.5 15.5l9-9a2 2 0 0 1 2.8 0l2.2 2.2a2 2 0 0 1 0 2.8L11 19H7.5z"/><path d="M9 11l5 5"/>',
  ),
  lasso: svg(
    '<path d="M7 17c-3-1.5-4-3.6-4-5.5C3 7.4 7 4 12 4s9 3.4 9 7.5S17 19 12 19c-1 0-2-.1-2.9-.4" stroke-dasharray="3 2.5"/><circle cx="7.5" cy="18" r="1.8"/><path d="M7 20c-.5 1-1 1.5-2 1.5"/>',
  ),
  rect: svg('<rect x="4" y="5" width="16" height="14" rx="1" stroke-dasharray="3 2.5"/>'),
  space: svg(
    '<path d="M3 12h18"/><path d="M12 3v6M9.5 6.5 12 9l2.5-2.5"/><path d="M12 21v-6M9.5 17.5 12 15l2.5 2.5"/>',
  ),
  hand: svg(
    '<path d="M8 13V6a1.5 1.5 0 0 1 3 0v6"/><path d="M11 11V4.5a1.5 1.5 0 0 1 3 0V11"/><path d="M14 11V6a1.5 1.5 0 0 1 3 0v7"/><path d="M8 12.5V10a1.5 1.5 0 0 0-3 0v4c0 4 3 7 7 7h1a5 5 0 0 0 4-2.5V12"/>',
  ),
  zoomOut: svg('<circle cx="11" cy="11" r="7"/><path d="M8 11h6M16.5 16.5 21 21"/>'),
  zoomIn: svg('<circle cx="11" cy="11" r="7"/><path d="M8 11h6M11 8v6M16.5 16.5 21 21"/>'),
  fitWidth: svg('<path d="M3 5v14M21 5v14"/><path d="M7 12h10M10 9l-3 3 3 3M14 9l3 3-3 3"/>'),
  fullscreen: svg('<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>'),
  exitFullscreen: svg('<path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5"/>'),
};
