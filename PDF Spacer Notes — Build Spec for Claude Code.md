# PDF Spacer Notes — Build Spec for Claude Code

Oct 10, 2026 · @Dakota

## How to use this doc

Export this doc as Markdown, commit it to a new empty repo as `SPEC.md`, then start a Claude Code cloud session on that repo with the kickoff prompt below. Everything after this section is written for Claude Code to read.

```text
Read SPEC.md in this repo. It describes a Windows pen-annotation web app called PDF Spacer Notes. Build the whole app in one continuous run, working through the "Build phases" section in order without stopping for my input. Where the spec is ambiguous, make the most reasonable choice and record it in DECISIONS.md. After each phase, make sure tests pass and commit with a clear message. When everything is done, push, confirm the GitHub Pages build succeeds, write TESTING.md (a step-by-step checklist for me to try every feature on my Huion Kamvas 16 Gen 3 pen display), then stop and give me a short summary.
```

The app runs in Microsoft Edge or Chrome on Windows. Claude Code can't test a real drawing tablet from the cloud, so it builds everything and stops once at the end with a testing checklist for you. Before testing, turn on Windows Ink in the Huion driver settings, or the browser won't receive pen pressure.

## Goal and scope

PDF Spacer Notes lets one person open a PDF (usually a math research paper), write on it with a drawing tablet, and open up blank space anywhere on a page, between any two lines, by dragging, the way OneNote's Insert Space works. The PDF content below the drag point slides down with the user's ink, leaving a clean gap to write in.

**In scope**

- Open one PDF at a time; continuous vertical scroll through all pages
- Pen input from a Windows drawing tablet, with pressure
- Pen and highlighter with a standard color palette and a few widths
- Stroke eraser and point eraser
- Insert space and remove inserted space
- Lasso and rectangle selection; move, delete, cut, copy, paste within the app
- Undo and redo for every edit
- Zoom and pan
- Save and reopen a project file, autosave, and export an annotated PDF

**Out of scope** (do not build unless asked)

- Typed text boxes, shapes, handwriting recognition
- Pasting into or from other programs
- Editing the PDF's own text
- Multiple open documents, tabs, cloud sync, accounts
- Touch gestures, phone or tablet layouts

## Tech stack and repo layout

Build a static web app with Vite and TypeScript, no UI framework, drawing on HTML canvas. It must run fully offline in the browser with no server.

| Need | Choice | Why |
| --- | --- | --- |
| Build and dev server | Vite + TypeScript (strict mode) | Fast, simple, static output |
| Render PDF pages | `pdfjs-dist` (PDF.js) | Standard, accurate PDF rendering |
| Smooth pressure ink | `perfect-freehand` | Turns pen points plus pressure into clean stroke outlines |
| Export annotated PDF | `pdf-lib` | Embeds original pages as vectors and draws ink as vector paths |
| Tests | Vitest | Unit tests for the pure document model |

Ask before adding any other runtime dependency.

Also add a GitHub Actions workflow that builds the app and publishes it to GitHub Pages on every push to `main`, so it can be used from a URL without installing Node. Make it installable as a PWA (manifest and service worker) so it can open in its own window on Windows and work offline.

**Suggested layout**

```text
src/
  model/      pure TypeScript, no DOM: document, segments, strokes, commands, hit testing, serialization
  render/     PDF.js page rendering, ink rendering, viewport and zoom math
  input/      pointer handling and the tool state machine
  tools/      pen, highlighter, erasers, lasso, rect select, insert space, hand
  io/         open, save, autosave, export
  ui/         toolbar, shortcuts, status bar
  main.ts
tests/        Vitest specs, plus a generated sample PDF fixture
```

Keep `src/model` free of DOM and canvas code so all the tricky logic can be unit tested.

## Core concept: the document model

The document is one long vertical column made of segments; inserting space splits a PDF slice in two and puts a blank gap between the halves. The PDF file itself is never modified.

**Units.** Document coordinates are in PDF points (1/72 inch), with y increasing downward from the top of the column. Zoom only changes how points map to screen pixels.

**Segments.** The column is an ordered list of segments, each one of:

- `slice`: a horizontal band of one PDF page, given by page index and source range `srcTop`–`srcBottom` in that page's points. Its height is `srcBottom - srcTop`.
- `gap`: blank space with a `height`. Rendered as plain white page background.

A freshly opened PDF becomes one full-page slice per page, with a 16 pt gap between pages. Draw a subtle page edge and shadow around each page's run of slices and gaps so it still reads as pages. All slices and gaps belonging to the same original page share that page's width and background.

**Strokes.** Each stroke stores tool (pen or highlighter), color, width, and a list of points `{x, y, pressure}` in document coordinates, plus a cached bounding box. Strokes are free-floating on the column, not attached to segments.

**Insert space at document y, by amount h (h > 0):**

1. Find the segment containing y.
2. If it's a slice, split it into two slices at the matching source y and insert a new gap of height h between them. If it's a gap, grow that gap by h.
3. Move every stroke whose bounding-box top is at or below y down by h. Strokes that cross y stay put, matching OneNote.

**Remove space (h < 0):** only blank gap height can be removed, never PDF content. Shrink gaps starting at y and going down, clamp at the total available gap height, and move strokes below up by the amount actually removed. When a gap between two slices of the same page shrinks to zero, merge the two slices back into one. Never shrink the original between-page gaps below 16 pt.

**Snapping the cut.** By default, snap the split y to the nearest blank horizontal band of the PDF within about 12 pt, so a cut never slices through a line of text or an equation. Find blank bands by rendering the page at low resolution once and scanning for rows of near-white pixels. Holding Alt while inserting space turns snapping off.

**Edits are commands.** Every change (add stroke, erase, move selection, paste, delete, insert or remove space) is a command object with `apply` and `revert`, pushed on an undo stack. Model functions are pure: they take the current document and return a new one, which makes undo, autosave, and tests simple.

## Target hardware: Huion Kamvas 16 (Gen 3)

The user writes on a Huion Kamvas 16 (Gen 3), a 15.8-inch 2560×1440 pen display connected to a Windows PC as a monitor. Design pen input around its controls.

- **Pen:** Huion PW600L (PenTech 4.0) with pressure, three side buttons, and no eraser end. The Huion driver can set each side button to a keyboard shortcut or a mouse click.
- **Display controls:** six programmable keys and two dials, set in the Huion driver to send keyboard shortcuts. Every app action must be reachable by a keyboard shortcut so these can drive it.
- **No touch screen.** Ignore touch input.
- **Pressure needs Windows Ink.** Browsers only receive pen pressure when Windows Ink is enabled in the Huion driver. If strokes arrive as `pointerType` mouse, or pressure never varies, show a one-time dismissible tip telling the user to enable it.
- **Scaling and monitors.** The display likely runs at 125–150% Windows scaling, often as a second monitor. Handle `devicePixelRatio`, and re-render when it changes because the window moved between monitors.
- **Full screen.** Add a toolbar button (and the F shortcut) using the Fullscreen API so the page can fill the pen display.

**Recommended Huion driver mapping** (put this table in README.md so the user can set it up):

| Control | Set to | Effect in the app |
| --- | --- | --- |
| Pen side button 1 | Right click | Hold while writing to erase |
| Pen side button 2 | Key L | Hold for temporary lasso, tap to switch |
| Pen side button 3 | Middle click | Hold and drag to pan |
| Display key 1 | P | Pen |
| Display key 2 | H | Highlighter |
| Display key 3 | E | Eraser |
| Display key 4 | I | Insert space |
| Display key 5 | Ctrl+Z | Undo |
| Display key 6 | Ctrl+Y | Redo |
| Dial 1 | Ctrl+= / Ctrl+- | Zoom in and out |
| Dial 2 | Page Up / Page Down | Scroll |

## Feature requirements

**Opening and viewing**

- Open a PDF from a file picker or by dragging it onto the window.
- Continuous vertical scroll. Render only visible slices plus a small buffer, at device pixel ratio, and re-render at the new resolution after zoom settles. A 60-page paper must scroll smoothly.
- Zoom with Ctrl + mouse wheel and the toolbar (25% to 400%), centered on the cursor. Fit-width button. Pan with the scroll wheel, the hand tool, holding Space and dragging, or the middle mouse button.

**Pen input**

- Use Pointer Events. Set `touch-action: none` on the drawing surface. Use `getCoalescedEvents()` for smooth lines and `pressure` for width (mouse input gets a fixed 0.5 pressure).
- Draw the in-progress stroke on a separate overlay canvas so it keeps up with the pen; commit it to the main ink layer on pointer up. Request a low-latency canvas context (`desynchronized: true`) where supported.
- While the pen hovers above the screen, show the active tool's cursor at the pen tip so the user sees exactly where ink will land.
- Right-click side button: when a pen stroke has the right button held (`buttons & 2`), use the current eraser for that stroke. Suppress the browser context menu over the document.
- Middle-click side button: pan while held.
- Hold-to-use tools: holding E, L, or Space switches to eraser, lasso, or hand only while held and returns to the previous tool on release. A quick tap switches tools permanently. This makes keyboard-mapped pen buttons work either way.
- The mouse can do everything the pen can.

**Pen and highlighter**

- Pen colors: black, dark blue, red, green, orange, purple, plus a custom color picker. The palette remembers the last custom color.
- Pen widths: fine, medium, thick (about 1, 2, 4 pt at full pressure). Highlighter widths: medium and thick (about 8 and 14 pt), no pressure.
- Highlighter colors: yellow, green, pink, blue. Draw highlighter strokes below pen ink and blend them so PDF text stays readable (multiply blend or about 35% opacity).
- Remember the last color and width per tool between sessions.

**Erasers**

- Stroke eraser: touching any part of a stroke removes the whole stroke.
- Point eraser: removes only the parts of strokes under the eraser circle, splitting strokes into separate pieces where needed. Sizes small, medium, large.
- One Eraser button with a toggle between the two modes. Show the eraser circle as the cursor. Erasers never touch the PDF.
- One erase gesture (pointer down to up) is one undo step.

**Insert space**

- With the Insert Space tool, hovering shows a horizontal line across the page where the cut will land (after snapping). Press and drag down to open space; drag up to close it. Show a live preview while dragging and commit on release as one undo step.
- Behavior follows the document model section exactly.

**Selection, copy, and paste**

- Lasso select (freeform loop) and rectangle select. A stroke is selected if most of its points fall inside the selection shape.
- Selected strokes show a dashed bounding box. Drag inside it to move them. Delete or Backspace removes them.
- Ctrl+C copies, Ctrl+X cuts, Ctrl+V pastes. Paste places the strokes at the pointer's last position on the document, or offset 12 pt from the original if the pointer hasn't moved. Pasted strokes become the new selection so they can be dragged right away. The clipboard is internal to the app; it doesn't use the system clipboard.
- Clicking empty space or switching tools clears the selection.

**Undo and redo**

- Ctrl+Z undoes, Ctrl+Y and Ctrl+Shift+Z redo. At least 200 steps. Toolbar buttons too.

**Saving**

- Project file format: `.pdfnotes`, a single JSON file with a format version number, the original PDF bytes as base64, the segment list, and all strokes. Round strokes' coordinates to 0.01 pt to keep files small.
- Ctrl+S saves (asks for a location the first time), Ctrl+Shift+S saves as, Ctrl+O opens a PDF or a `.pdfnotes` file. Use the File System Access API in Edge and Chrome, falling back to a download if it isn't available.
- Autosave the current project to IndexedDB every few seconds after a change. On launch, offer to restore it if it wasn't saved to a file. Show an unsaved-changes dot in the title, and warn before closing with unsaved changes.
- Export PDF (Ctrl+E): writes a new PDF with each original page made taller to include its inserted gaps. Embed the original page content as vectors with `pdf-lib` (clipped per slice, not rasterized) and draw ink as filled vector paths from the `perfect-freehand` outlines.

## UI layout and shortcuts

Keep the interface minimal: one toolbar across the top, the document filling the rest of the window, and a thin status bar at the bottom. Light theme; the page area background is light gray so pages stand out.

**Toolbar, left to right:** Open, Save, Export · Undo, Redo · Pen, Highlighter, Eraser (with mode toggle), Lasso, Rectangle select, Insert space, Hand · color swatches for the active tool · width buttons for the active tool · zoom out, zoom level, zoom in, fit width · full screen.

Tool buttons show which one is active. Each has a tooltip with its shortcut. The cursor changes per tool: a dot sized to the pen width, the eraser circle, a crosshair for selection, a horizontal double arrow for insert space.

**Status bar:** file name, unsaved dot, page number under the viewport center, zoom level.

| Action | Shortcut |
| --- | --- |
| Pen | P |
| Highlighter | H |
| Eraser (press again to switch stroke/point) | E |
| Lasso select | L |
| Rectangle select | M |
| Insert space | I |
| Hand / pan | Hold Space, or V |
| Pen colors 1–6 | 1–6 |
| Undo / redo | Ctrl+Z / Ctrl+Y or Ctrl+Shift+Z |
| Copy / cut / paste | Ctrl+C / Ctrl+X / Ctrl+V |
| Delete selection | Delete or Backspace |
| Open / save / save as | Ctrl+O / Ctrl+S / Ctrl+Shift+S |
| Export PDF | Ctrl+E |
| Zoom in / out / reset | Ctrl+= / Ctrl+- / Ctrl+0 |
| Insert space without snapping | Hold Alt while dragging |

## Build phases

Build in this order in one continuous run. Each phase ends with passing tests and a commit; don't stop for user input between phases. Record judgment calls in DECISIONS.md as you go.

1. **Phase 0, scaffold.** Vite + TypeScript strict, Vitest, ESLint, Prettier, README with run steps, GitHub Pages workflow, PWA manifest. A test helper that generates a multi-page sample PDF with lines of text using `pdf-lib`.
   - Done when: `npm run dev` shows the empty app with toolbar, `npm test` passes, and the Pages workflow builds.
2. **Phase 1, viewing.** Open by picker and drag-drop, segment model with one slice per page, continuous scroll, lazy HiDPI rendering, zoom, pan, fit width, status bar.
   - Done when: a 60-page PDF scrolls and zooms smoothly and text stays sharp at 400%.
3. **Phase 2, ink.** Pen and highlighter, pressure, palette and widths, overlay canvas for live strokes, command stack with undo and redo.
   - Done when: writing with the tablet feels responsive, lines vary with pressure, and undo/redo work for every stroke.
4. **Phase 3, insert space.** Split, gap, remove, stroke shifting, snapping to blank bands, live drag preview, slice merging, undo.
   - Done when: dragging between two lines opens a clean gap with no text cut in half, ink below moves with the PDF, dragging up closes the gap, and undo restores the exact prior state.
5. **Phase 4, erasers.** Stroke and point eraser, eraser circle cursor, erasing with the right-click side button held.
   - Done when: the point eraser can cut a long stroke into two clean pieces and each erase gesture is one undo step.
6. **Phase 5, selection.** Lasso, rectangle, move, delete, cut, copy, paste, hold-to-use tools.
   - Done when: writing can be selected, moved across a gap or to another page, copied and pasted, all with undo.
7. **Phase 6, files.** Save, save as, open project, autosave and restore, unsaved warnings, export PDF.
   - Done when: a saved project reopens identically, and the exported PDF opens in Edge with sharp vector text, the gaps, and all ink.
8. **Phase 7, polish.** Performance pass on large files, remembered settings, tooltips, cursor details, the Windows Ink tip, full screen, and a self-review against every "Done when" check. Then hand off: README.md complete with the Huion mapping table, DECISIONS.md complete, TESTING.md written as a step-by-step checklist covering every feature on the Kamvas, everything pushed, the Pages build passing. Then stop.

## Testing and working rules

The pure model carries most of the risk, so test it thoroughly; the user tests feel and tablet behavior by hand.

**Unit tests required for:**

- Insert space inside a slice, inside a gap, at a page boundary, and at the very top and bottom of the document
- Remove space clamping, never removing PDF content, and merging slices back together
- Stroke shifting, including strokes that cross the cut line
- Mapping between document y, segment, and source page y in both directions
- Snapping to blank bands, using a synthetic pixel row profile
- Point eraser splitting strokes, including erasing the middle, an end, and the whole stroke
- Lasso and rectangle hit testing
- Undo then redo returns the identical document for every command type
- Save then load round trip produces an identical document

**Working rules for Claude Code:**

- Follow the phases in order in one continuous run, and stop only after the final handoff.
- Keep commits small, with messages that say what changed.
- Don't add features from the out-of-scope list. If something in this spec seems wrong or unclear, make the most reasonable choice and record it in DECISIONS.md.
- Never silently drop user ink. Any error during save or autosave must show a visible message.
- Keep README.md current: how to run locally, the live Pages URL, a feature list, the shortcut table, and the Huion driver mapping.
