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
