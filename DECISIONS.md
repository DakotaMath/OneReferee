# Decisions

Judgment calls made where `SPEC.md` was ambiguous or silent, recorded as the build went along.

## Phase 0 — scaffold

- **Spec file name.** The repo arrived with the spec as `PDF Spacer Notes — Build Spec for Claude Code.md`; it was renamed to `SPEC.md` as the kickoff prompt expects.
- **Tool versions.** TypeScript 6.0 (typescript-eslint does not support 7.x yet), Vite 8, Vitest 5, ESLint 9 flat config, `pdfjs-dist` 5.4 (mature 5.x line rather than the brand-new 6.x major).
- **No PWA plugin.** To avoid extra dependencies, the service worker is a small hand-written template (`src/sw-template.js`); a tiny Vite plugin in `vite.config.ts` writes `dist/sw.js` with a precache list of every built file. PDF.js CMaps (1.7 MB, ~170 files) are cached on first use instead of precached.
- **PDF.js data files.** `scripts/copy-pdfjs-assets.mjs` copies PDF.js's standard fonts, CMaps, wasm decoders and ICC profiles into `public/pdfjs/` before `dev`/`build`, so unusual PDFs render offline too. The copy is git-ignored.
- **Pages workflow on every branch.** The workflow lints, tests, builds and uploads the Pages artifact on every push (so feature branches prove the build works), but only deploys when the push is to `main`. Pages must be set to "GitHub Actions" as its source in the repo settings.
- **Relative base path.** Vite `base: './'` so the same build works at `https://<user>.github.io/<repo>/` and locally.
- **Sample document.** The pdf-lib sample generator lives in `src/io/samplePdf.ts` (re-exported by `tests/helpers/samplePdf.ts`) so the app's empty screen can also offer "Try a sample document" for quick testing without hunting for a PDF.

## Phase 1 — viewing

- **Custom scrolling.** The document is drawn on viewport-sized canvases and scrolled by the app (wheel, Page Up/Down, arrows, Home/End, hand tool, middle button, Space-drag, and draggable overlay scrollbars) rather than by a native scroll container. This keeps zoom-at-cursor, live insert-space previews and coordinate math exact and simple.
- **100% zoom = actual size.** 1 pt = 96/72 CSS px at 100%, like other PDF viewers. Zoom is clamped to 25%–400%. Ctrl+wheel zooms smoothly at the cursor; the toolbar and Ctrl+=/Ctrl+- step through preset levels (25, 33, 50, 67, 75, 90, 100, 110, 125, 150, 175, 200, 250, 300, 400%).
- **Opening zoom.** A newly opened document starts at fit-width, which on the Kamvas makes a page roughly life-size or larger, comfortable for writing.
- **Lazy, tiled rendering.** Each page gets a low-resolution preview (1.5 device px per pt, LRU of 30 pages) that appears first; sharp tiles at the exact device scale (full page width up to 2048 px, 1024 px tall) are rendered only for the visible area plus half a screen of buffer, after zoom has been still for ~180 ms. Sharp tiles are kept within a ~40 MP memory budget. Only one PDF.js render runs at a time, most urgent first.
- **Pages of different widths** are centred in a column as wide as the widest page.
- **Between-page separators** are drawn in the gray page-area color; inserted gaps inside a page are white and share the page's width, edge and shadow.
- **Performance check.** In headless Chromium (software rendering) the PDF layer itself draws in under 1 ms per frame; the remaining cost is compositing in software. Smoothness on real hardware is part of TESTING.md.

## Phase 2 — ink

- **Stroke storage.** A stroke keeps its points relative to an origin `(ox, oy)` (the first point) plus an absolute bounding box. Moving a stroke (insert space, dragging a selection) only changes the origin, so the cached perfect-freehand outline is reused; this keeps live insert-space previews fast with thousands of strokes. Absolute point = origin + relative point.
- **Rounding at creation.** Coordinates are rounded to 0.01 pt (pressure to 0.001) when a stroke is created or moved, not only when saving. Rounding is idempotent, so a saved file reloads to an identical document.
- **Pressure curve.** perfect-freehand with thinning 0.5: width at pressure p is `width × (0.5 + p) / 1.5`, so the nominal width (1/2/4 pt) is reached at full pressure. Pen pressure is clamped to at least 0.05. Mouse input uses a fixed 0.5 (two-thirds of full width). The highlighter ignores pressure.
- **Highlighter blending.** Highlighter strokes live on their own canvas below the pen canvas, which is blended onto the PDF with `mix-blend-mode: multiply`. Within that canvas strokes combine with `darken`, so overlapping passes of the same color don't build up darker blotches. Highlighter colors are light tints (yellow, green, pink, blue).
- **Live stroke.** The in-progress stroke is drawn on the `desynchronized` overlay canvas directly inside the pointer event (not on the next animation frame), using all coalesced points.
- **Commands.** Stroke edits are stored as a minimal index-based diff (removed and added strokes with positions), so undo/redo restores the exact array including z-order. Undo history keeps 500 steps. The "unsaved" state is tracked against a save point, so undoing back to the saved state clears the dot.
- **Number keys** 1–6 pick a pen color and switch to the pen if another tool is active.

## Phase 3 — insert space

- **Inserting at a page boundary or in a separator.** Space inserted at the bottom edge of a page, or inside the 16 pt separator between pages, is added as white space at the _end of the page above_ (the separator itself never grows). Space inserted exactly at the top of a page's first slice goes at the top of that page. At y ≤ 0 it goes at the top of page 1; at the very end, at the bottom of the last page. Inserting at the edge of an existing gap grows that gap rather than creating a zero-height slice.
- **Where removal comes from.** "Shrink gaps starting at y and going down" is implemented as: take space from the gap containing y (its whole height is removable, not only the part below y); if y is in PDF content, take it from the first gap below y. Removal then continues only into gaps _directly following_ that one (for example a page's bottom gap → separator → next page's top gap), never across PDF content further down, so dragging up never closes a gap pages away from where you are working. The total is clamped to that run's removable height. Separators keep their 16 pt.
- **Which strokes move when removing.** Strokes whose top is at or below the removal point (y, or the top of the first gap below y) move up by the amount actually removed.
- **Merging.** After removal, zero-height inserted gaps are dropped and adjacent slices of the same page whose source ranges touch are merged back into one slice, so opening and fully closing a gap restores the original segment list exactly.
- **Snapping.** The blank-row profile comes from each page's low-res preview render (1.5 px/pt); a row is blank if every pixel has all channels ≥ 225. Blank bands thinner than 2 pt are ignored (so cuts don't land between the parts of a fraction). Within 12 pt, the cut moves into the nearest band, at least 1.5 pt away from the ink edges. If a page's profile isn't ready yet, the cut is not snapped. Holding Alt disables snapping; Alt's default browser behavior (focusing the menu bar) is suppressed.
- **Preview.** While dragging, the whole document (PDF slices and ink) is shown live from a preview document; the opened area is lightly tinted and the cut line drawn with arrow heads. Nothing is committed until release, which records one undo step.

## Phase 4 — erasers

- **Eraser reach.** A stroke counts as touched when it comes within the eraser radius plus half the stroke's width, i.e. when the eraser circle touches the visible ink, not just its centre line.
- **Exact splitting.** The point eraser intersects each stroke segment with the eraser circle and cuts at the exact intersection points (pressure interpolated), so even a fast two-point line splits cleanly. Leftover pieces shorter than 0.05 pt or with fewer than two points are dropped. Pieces keep the original's color, width and stacking position and get new ids.
- **Sweeping.** Between pointer samples the eraser is applied every half radius along the path, so fast swipes don't skip strokes.
- **Sizes.** Small, medium and large erasers have radii of 4, 9 and 18 pt. The stroke eraser's cursor shows a small × inside the circle to tell the two modes apart.
- **Right button.** Any pointer whose right button is down at pointer-down (pen side button mapped to right click, or a mouse right-drag) erases with the current eraser mode and size, whatever tool is active. The context menu is suppressed over the document.
- **Toggling mode.** Pressing E while the eraser is already the active tool toggles stroke/point (on a quick tap); the toolbar has a Stroke/Point toggle next to the eraser button.

## Phase 5 — selection

- **"Most of its points".** A stroke is selected when strictly more than half of its points fall inside the lasso loop (closed implicitly) or rectangle.
- **Dragging a selection works with any drawing or selection tool.** Pressing inside the dashed selection box with the pen, highlighter, lasso or rectangle tool drags the selection (the cursor turns into a move cursor over the box). This is what makes the hold-to-use lasso useful: hold L (or the pen button mapped to L), loop some writing, release, and the pen comes back with the selection still there to drag. Pressing outside the box clears the selection and does what the tool normally does.
- **What clears the selection.** A permanent tool switch (toolbar, tap of a shortcut), clicking empty space with a selection tool, starting to write outside the box, erasing, or Escape. A hold-to-use switch and its release do _not_ clear it.
- **Paste position.** If the pointer has moved since the last copy/cut/paste, the pasted strokes' box is placed with its top-left corner at the pointer. Otherwise they go 12 pt right and down from the original, and repeated pastes without moving cascade (24 pt, 36 pt, …) so copies don't pile up invisibly on top of each other.
- **Right button with a selection tool** still erases, consistent with the other tools.

## Phase 6 — files

- **Project format details.** `.pdfnotes` is JSON: `format` (`"pdf-spacer-notes"`), `version` (1), `pdfName`, `pdf` (base64), `pages` (display sizes), `segments`, and `strokes`. Each stroke stores `id`, `tool`, `color`, `width`, `origin: [ox, oy]` and a flat `points` array `[x, y, pressure, …]` relative to the origin. Flat arrays keep files small; coordinates are 0.01 pt, pressure 0.001. Files from a newer format version are refused with a clear message rather than misread.
- **Save target.** Ctrl+S writes to the `.pdfnotes` file the project was opened from or last saved to; for a freshly opened PDF it asks for a location (suggesting `<pdf name>.pdfnotes`). Saving never overwrites the original PDF. Without the File System Access API, Save downloads the file.
- **Saving while writing.** The "saved" marker is taken when the save starts, so strokes added while a save is in progress keep the unsaved dot.
- **Autosave.** 3 seconds after the last change (and when the tab is hidden or closing), the project goes to IndexedDB: the PDF bytes are stored once per opened document, and the strokes/segments on every autosave. On launch, if the autosave holds changes that were never saved to a file, a banner offers Restore or Discard (Discard asks for confirmation). A restored project is marked unsaved and Ctrl+S asks for a location. Opening another file while that banner is still showing asks before the old work is replaced. Any autosave or save error shows a red message that stays until dismissed; a later successful autosave says so.
- **Unsaved warning.** The title and status bar show a ● when there are unsaved changes, and the browser's "Leave site?" prompt appears on close. Opening another file with unsaved changes asks first.
- **Export layout.** Each original page becomes one output page, as wide as the page and as tall as its slices plus inserted gaps. The page is embedded once as a form XObject (vector, fonts intact) and drawn once per slice inside a clipping rectangle. Ink is drawn as filled paths from the same perfect-freehand outlines the screen uses, highlighter first with the Darken blend mode so text stays black. Pages with /Rotate or a crop box are exported as displayed. Blank pages without a content stream stay blank. Links and form fields from the original are not carried over.
- **Ink outside pages.** A stroke that touches a page is clipped to that page. Strokes that touch no page at all (written entirely in the gray margin or between pages) can't be placed in the export; the export still completes, and a message says how many were left out (never silently dropped).
- **Export name.** The suggested name is `<pdf name> (annotated).pdf`.

## Phase 7 — polish

- **Extra shortcuts so every action has a key** (for the Kamvas keys and dials): `[` / `]` step the width of the active tool (pen width, highlighter width, eraser size); with the highlighter active, `1`–`4` pick highlighter colors (otherwise `1`–`6` are pen colors as specified); `7` picks the remembered custom pen color; `W` is fit width; `Escape` clears the selection; arrows, Page Up/Down and Home/End scroll.
- **Windows Ink tip.** After three strokes, if every stroke came in as `pointerType: "mouse"`, or pen pressure never varied, a tip explains how to turn on Windows Ink in the Huion driver. It appears at most once per session, and "Don't show again" remembers the choice. (A person drawing with a real mouse also sees it once.)
- **Side button while hovering.** With Windows Ink, pressing the side button mapped to right click while the pen hovers can start a pointer interaction without contact. The eraser follows the pen but only erases on contact (pressure > 0), so hovering never deletes ink by accident. Pen pressure 0 at lift-off is no longer turned into 0.5, so stroke ends don't get a blob.
- **Middle button.** Chrome's middle-click autoscroll is suppressed on the document so the middle button (pen side button 3) pans.
- **Ctrl+wheel anywhere** in the window is captured, so it never zooms the browser page itself.
- **Opening files with the installed app.** The PWA manifest registers `.pdf` and `.pdfnotes` file handlers, and the app accepts files from Windows "Open with" through the Launch Queue API when installed.
- **Memory.** Low-res previews are kept for the 20 most recently used pages (about 4 MB each for US Letter), sharp tiles within ~40 megapixels.
- **Performance check** (headless Chromium, 60-page sample with 4,000 strokes): the insert-space model update takes ~2.5 ms per drag frame and redrawing the visible ink ~0.1 ms, thanks to bounding-box culling and outline caching. On real hardware the canvas compositing is GPU-accelerated.

## Hand-off notes

- **Deploying.** All work is on the branch `claude/magical-galileo-dbwvpo`; the workflow builds, lints, tests and uploads the Pages artifact there. The site is published when the branch is merged to `main`, provided **Settings → Pages → Source** is set to **GitHub Actions**. The live URL will be `https://dakotamath.github.io/OneReferee/`.
- **Not verifiable from the cloud** (covered in TESTING.md): real pen latency and pressure feel, Windows Ink behavior of the side buttons, Huion key/dial mappings, multi-monitor scaling changes, File System Access save dialogs, and how the exported PDF looks in Edge's own viewer. Everything else was exercised in headless Chromium with synthetic pen events as well as by the unit tests.
- **Known limitations.** Links, form fields and annotations of the original PDF are not carried into the exported PDF. Ink written entirely outside any page can't be exported (you are told how many strokes). The point eraser cuts at the circle edge; pressure tapering at the new ends follows the interpolated pressure, so cut ends are blunt rather than tapered.

## Follow-up: pen side buttons and default color

- **Side buttons, as requested.** Lowest button: right click (hold to erase, unchanged). Middle button: the **Space** key, which already gives the hand tool while held and returns to the previous tool on release (a quick tap switches to the hand permanently, as with the keyboard). Top button: a new **S** key that toggles pen ↔ insert space; from any other tool it goes to the pen. The app can't tell pen buttons apart on its own, since the Huion driver turns each into a key or click, so the buttons are set to these keys in the driver. The lasso keeps its L key on the keyboard and middle-click panning still works with a mouse.
- **"Drag tool"** was read as the hand tool (drag the page around). If it was meant to be dragging a selection, that's a quick change.
- **Default pen color is red.** It applies on first run; after that the app keeps remembering the last color you picked, as before.

## Follow-up: app updates and version label

- **Safe updates.** The first service worker shipped with `skipWaiting` and deleted the old cache on activation, so right after a deploy the first load could come up blank (the old page asked for script files that were just deleted) and you otherwise only got the new version on the second reload. Now a downloaded update waits; if no document is open the app switches to it and reloads automatically, otherwise a "Reload now" button appears (it asks before discarding unsaved changes). The app also checks for updates whenever it comes back to the foreground.
- **Cache lookups ignore `Vary`.** Module scripts are requested with an `Origin` header that the precache request didn't have, so a server sending `Vary` made them miss the cache.
- **Version label.** The status bar shows `v` plus the first 7 characters of the deployed commit (or `vdev` locally), to make it easy to tell whether the newest version is running.
- **Tool name in the status bar.** Switching tools (toolbar, keyboard, or a pen button sending a key) shows the tool's name in the status bar, and holding Space shows "Hand (while Space is held)", so it's easy to confirm the Huion buttons reach the app.
