# PDF Spacer Notes

Write on PDFs with a pen display and open up blank space anywhere on a page, between any two
lines, by dragging, the way OneNote's **Insert Space** works. The PDF content below the cut slides
down together with your ink, leaving a clean gap to write in.

Built for a **Huion Kamvas 16 (Gen 3)** on Windows, in **Microsoft Edge or Chrome**. It runs fully
offline in the browser: nothing is uploaded, and the PDF file itself is never modified.

**Live app:** <https://dakotamath.github.io/OneReferee/> (published from the `main` branch by GitHub
Actions; see [Deploying](#deploying)).

> **Before you start:** open the Huion driver, go to the pen settings and turn on **Windows Ink**.
> Without it the browser doesn't get pen pressure (the app will show a tip if it notices).

## Features

- Open a PDF (file picker, Ctrl+O, or drag it onto the window); continuous vertical scrolling
  through all pages, rendered sharply at your screen's scaling, re-rendered when you move the window
  to a monitor with different scaling.
- **Pen** with pressure: black, dark blue, red, green, orange, purple, plus a remembered custom
  color; fine, medium and thick (about 1, 2 and 4 pt at full pressure).
- **Highlighter**: yellow, green, pink, blue; medium and thick; drawn under pen ink and blended so
  the PDF text stays readable.
- **Eraser**: stroke eraser (removes whole strokes) or point eraser (removes only what's under the
  circle, splitting strokes); small, medium, large. Hold the pen's right-click side button to erase
  with any tool.
- **Insert space**: hover to see where the cut will land (it snaps to the blank space between lines
  so no line of text or equation gets cut in half), drag down to open space, drag up to close it.
  Hold Alt to turn snapping off. Only blank space can ever be removed, never PDF content.
- **Lasso** and **rectangle** selection; drag to move (across gaps and onto other pages), Delete,
  cut, copy and paste within the app.
- **Undo/redo** for every edit (500 steps).
- **Zoom** 25–400% (Ctrl+wheel zooms at the cursor), fit width, pan with the wheel, the hand tool,
  Space-drag or the middle button, full screen.
- **Save** a `.pdfnotes` project (the PDF plus all your ink and spacing in one file), reopen it,
  **autosave** to the browser with an offer to restore unsaved work after a crash, and an unsaved
  changes dot in the title.
- **Export** an annotated PDF (Ctrl+E): each page made taller to include its inserted space, the
  original page content kept as sharp vectors, and your ink as vector paths.
- Installable as an app (PWA): in Edge, use the app-install icon in the address bar to get its own
  window and taskbar icon; it then works offline and can open `.pdf`/`.pdfnotes` files.

## Keyboard shortcuts

| Action                                              | Shortcut                                                 |
| --------------------------------------------------- | -------------------------------------------------------- |
| Pen                                                 | P                                                        |
| Highlighter                                         | H                                                        |
| Eraser (press again to switch stroke/point)         | E (tap); hold E to erase temporarily                     |
| Lasso select                                        | L (tap); hold L to lasso temporarily                     |
| Rectangle select                                    | M                                                        |
| Insert space                                        | I                                                        |
| Hand / pan                                          | V, or hold Space (tap Space to switch to the hand)       |
| Pen colors 1–6                                      | 1–6 (custom color: 7)                                    |
| Highlighter colors (when the highlighter is active) | 1–4                                                      |
| Thinner / thicker (pen, highlighter or eraser size) | [ / ]                                                    |
| Undo / redo                                         | Ctrl+Z / Ctrl+Y or Ctrl+Shift+Z                          |
| Copy / cut / paste                                  | Ctrl+C / Ctrl+X / Ctrl+V                                 |
| Delete selection                                    | Delete or Backspace                                      |
| Clear selection                                     | Escape                                                   |
| Open / save / save as                               | Ctrl+O / Ctrl+S / Ctrl+Shift+S                           |
| Export PDF                                          | Ctrl+E                                                   |
| Zoom in / out / reset to 100%                       | Ctrl+= / Ctrl+- / Ctrl+0 (or Ctrl+mouse wheel)           |
| Fit width                                           | W                                                        |
| Scroll                                              | Mouse wheel, Page Up / Page Down, arrow keys, Home / End |
| Full screen                                         | F                                                        |
| Insert space without snapping                       | Hold Alt while dragging                                  |

"Hold" keys switch tools only while held and return to the previous tool on release; a quick tap
switches permanently. This lets keyboard-mapped pen buttons work either way.

## Recommended Huion driver mapping

Set these in the Huion driver (HuionTablet app → your Kamvas 16 → Pen / Press Keys / Dial). Turn on
**Windows Ink** in the pen settings as well.

| Control           | Set to              | Effect in the app                       |
| ----------------- | ------------------- | --------------------------------------- |
| Pen side button 1 | Right click         | Hold while writing to erase             |
| Pen side button 2 | Key L               | Hold for temporary lasso, tap to switch |
| Pen side button 3 | Middle click        | Hold and drag to pan                    |
| Display key 1     | P                   | Pen                                     |
| Display key 2     | H                   | Highlighter                             |
| Display key 3     | E                   | Eraser                                  |
| Display key 4     | I                   | Insert space                            |
| Display key 5     | Ctrl+Z              | Undo                                    |
| Display key 6     | Ctrl+Y              | Redo                                    |
| Dial 1            | Ctrl+= / Ctrl+-     | Zoom in and out                         |
| Dial 2            | Page Up / Page Down | Scroll                                  |

## Run locally

Requires Node 22 or newer.

```sh
npm install
npm run dev        # http://localhost:5173
npm test           # unit tests (Vitest)
npm run lint       # ESLint
npm run build      # static site in dist/
npm run preview    # serve the built site (service worker active)
```

## Deploying

`.github/workflows/pages.yml` lints, tests and builds on every push. Pushes to `main` are also
published to GitHub Pages. One-time setup: in the repository's **Settings → Pages**, set
**Source** to **GitHub Actions**.

## Project layout

```text
src/
  model/   pure TypeScript, no DOM: document, segments, strokes, commands, history,
           insert/remove space, snapping, erasing, selection, serialization
  render/  PDF.js page rendering and tiling, canvas layers, ink rendering, viewport math
  input/   pointer samples and the gesture interface
  tools/   pen/highlighter, erasers, lasso/rectangle select and move, insert space, hand
  io/      file pickers, autosave (IndexedDB), PDF export (pdf-lib), sample PDF
  ui/      toolbar, status bar, scrollbars, shortcuts, settings, toasts
  app.ts   ties it together;  main.ts  entry point
tests/     Vitest specs and helpers (including a pdf-lib sample PDF generator)
```

See `SPEC.md` for the original design, `DECISIONS.md` for the judgment calls made while building,
and `TESTING.md` for a hands-on test checklist on the Kamvas.
