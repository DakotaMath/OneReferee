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
