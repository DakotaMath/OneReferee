# Testing PDF Spacer Notes on the Huion Kamvas 16 (Gen 3)

A step-by-step checklist to try every feature by hand. Tick each box as you go. If something fails,
note the step number and what you saw.

You need: the Kamvas connected to your Windows PC, Microsoft Edge (or Chrome), and a real math paper
PDF (ideally a long one, 40–60 pages). The app's **Try a sample document** button also gives you a
60-page test PDF.

---

## 0. Setup

- [ ] 0.1 Open the Huion driver (HuionTablet). In the pen settings, turn on **Windows Ink**.
- [ ] 0.2 Set the pen buttons, display keys and dials as in the **Recommended Huion driver mapping**
      table in `README.md` (side buttons: Right click / L / Middle click; keys: P, H, E, I, Ctrl+Z,
      Ctrl+Y; dials: Ctrl+= / Ctrl+- and Page Up / Page Down).
- [ ] 0.3 Optional but recommended: in Windows Settings → Bluetooth & devices → Pen & Windows Ink,
      turn off "press and hold to right-click" style feedback if it gets in the way.
- [ ] 0.4 Open the app URL in Edge on the Kamvas: <https://dakotamath.github.io/OneReferee/>
      (or run `npm run dev` and open <http://localhost:5173>). Drag the window onto the Kamvas.
- [ ] 0.5 You see a toolbar at the top, a gray area with a "PDF Spacer Notes" card, and a thin
      status bar at the bottom.

## 1. Opening and viewing

- [ ] 1.1 Press **Ctrl+O** and pick a PDF. It opens at fit width, page 1 at the top.
- [ ] 1.2 Drag a different PDF file from Explorer onto the window. A blue "Drop a PDF…" outline
      appears while dragging; the new PDF opens.
- [ ] 1.3 Scroll with the mouse wheel and with **Dial 2** (Page Up/Down) through the whole document.
      Pages have a subtle edge and shadow with a gray gap between them. Scrolling a 60-page paper
      feels smooth; pages may appear slightly blurry for a moment and then sharpen.
- [ ] 1.4 The status bar shows the file name, "Page N of M" (changes as you scroll) and the zoom.
- [ ] 1.5 **Dial 1** (Ctrl+= / Ctrl+-) zooms in and out in steps. Zoom stops at 25% and 400%.
- [ ] 1.6 Hold **Ctrl** and turn the mouse wheel over some text: it zooms around the cursor (the text
      under the cursor stays under the cursor).
- [ ] 1.7 Zoom to **400%** and wait a moment: text and equations are crisp, not pixelated.
- [ ] 1.8 **Ctrl+0** returns to 100%. The **Fit width** button (or **W**) fits the page to the window.
- [ ] 1.9 Pan: hold **pen side button 2** (Space) and drag with the pen: the hand cursor appears and
      the page moves; release the button and you're back on your previous tool. Also try pressing
      **V** (hand tool) and dragging, and dragging with the middle mouse button (no autoscroll icon).
- [ ] 1.10 Drag the scrollbar thumb on the right edge; click above/below it to page up/down.
- [ ] 1.11 Press **F** (or the full-screen button at the far right): the app fills the Kamvas. Press
      **F** again (or Esc) to leave full screen.
- [ ] 1.12 If you have a second monitor with different scaling, drag the window between the monitors:
      the pages re-render sharp on each.

## 2. Pen and highlighter

- [ ] 2.1 Press **Display key 1** (P). Hover the pen above the screen without touching: a small dot
      in the pen color follows the pen tip exactly where ink will land.
- [ ] 2.2 Write a few words and an equation. Ink appears immediately under the pen tip without
      noticeable lag, and stays smooth on fast curves.
- [ ] 2.3 Press lightly then harder in one stroke: the line gets thicker with pressure.
      (If a tip about **Windows Ink** appears, pressure isn't reaching the browser; go back to 0.1.)
- [ ] 2.3a On a fresh start (no colors picked yet), the pen is **red** by default.
- [ ] 2.4 Click each pen color swatch, and try keys **1–6**: black, dark blue, red, green, orange,
      purple.
- [ ] 2.5 Click the rainbow (custom) swatch, then click it again to open the color picker; choose a
      color and write with it. Switch to black, then press **7**: your custom color comes back.
- [ ] 2.6 Try the three width buttons (fine, medium, thick) and the **[** and **]** keys.
- [ ] 2.7 Press **Display key 2** (H) for the highlighter. Highlight across a line of text: the text
      stays black and readable through yellow. Try green, pink, blue (or keys **1–4**) and both widths.
      Pressure does not change highlighter width.
- [ ] 2.8 Write pen ink, then highlight over it: the highlighter goes _under_ the pen ink.
- [ ] 2.9 Reload the page and reopen the PDF: the last pen color/width and highlighter color/width
      are remembered.
- [ ] 2.10 Draw with the mouse too: it writes with a fixed medium pressure.

## 3. Undo and redo

- [ ] 3.1 Write five strokes. Press **Display key 5** (Ctrl+Z) five times: they disappear one by one.
- [ ] 3.2 Press **Display key 6** (Ctrl+Y) to bring them back; **Ctrl+Shift+Z** also redoes.
- [ ] 3.3 The toolbar Undo/Redo buttons do the same and are greyed out when there's nothing to undo or
      redo.

## 4. Insert space

- [ ] 4.1 Write some ink on lines _below_ a spot where you want space, and one stroke that crosses
      that spot.
- [ ] 4.2 Press **Display key 4** (I). Hover between two lines of text: a blue horizontal line with
      arrow heads shows where the cut will land. Hover _on_ a line of text: the guide jumps to the
      nearest blank space between lines (it never sits across text).
- [ ] 4.3 Press on the guide and drag down: the PDF below the cut and your ink below it slide down
      live, leaving a clean white gap. Release.
- [ ] 4.4 Check: no line of text or equation is cut in half; ink below the cut moved with the PDF and
      still lines up with the same words; the stroke that crossed the cut stayed where it was.
- [ ] 4.5 Write in the new gap.
- [ ] 4.6 Hover inside an (empty part of the) gap and drag **up**: the gap closes. It stops when the
      gap is fully closed; PDF text never gets removed or overlapped.
- [ ] 4.7 **Ctrl+Z** undoes each drag in one step and restores exactly the previous layout.
- [ ] 4.8 Hold **Alt** and hover over a line of text: the guide follows the pen exactly (no snapping).
      Drag down while holding Alt: the cut goes exactly there (it may cut through text).
- [ ] 4.9 Insert space at the very bottom of a page (in the gray gap between pages): white space is
      added at the end of the page above. Insert space at the very top of a page.
- [ ] 4.10 Insert space twice in the same place: the gap simply grows.

## 5. Erasers

- [ ] 5.1 Press **Display key 3** (E). The cursor becomes a circle. Write a long stroke first (P),
      then press E again.
- [ ] 5.2 Click the **Stroke/Point** toggle next to the eraser button so it says **Point**. Swipe
      across the middle of the long stroke: it splits into two clean pieces.
- [ ] 5.3 Erase one end of a stroke: it gets shorter.
- [ ] 5.4 Press **E** again (while the eraser is active) to switch to **Stroke** mode (the circle
      shows a small ×). Touch any part of a stroke: the whole stroke disappears.
- [ ] 5.5 Try small, medium and large sizes (buttons or **[** / **]**).
- [ ] 5.6 One erase gesture (pen down to up), however many strokes it touched, is undone with a
      single **Ctrl+Z**.
- [ ] 5.7 Erasers never remove PDF content, only ink and highlights.
- [ ] 5.8 Switch to the pen (P). Hold **pen side button 1** (right click) and write over some ink: it
      erases with the current eraser instead of writing. No context menu appears.
- [ ] 5.9 Hover (don't touch) with side button 1 held and move over ink: nothing is erased until the
      pen touches the screen.
- [ ] 5.10 Hold **E** on the keyboard (or a display key set to E), erase something, release E: you're
      back on the pen.

## 6. Selection, copy and paste

- [ ] 6.1 Write a short word. Press **L** (lasso) and draw a loop around it: a dashed box appears
      around the selected writing. Strokes mostly outside the loop are not selected.
- [ ] 6.2 Press **M** (rectangle) and drag a rectangle around some writing: it gets selected.
- [ ] 6.3 Drag inside the dashed box: the writing moves. Move it across an inserted gap, and onto the
      next page. **Ctrl+Z** puts it back in one step.
- [ ] 6.4 **Ctrl+C**, then **Ctrl+V** without moving the pen: a copy appears 12 pt right and down,
      already selected; drag it. Press Ctrl+V again: another copy, further offset.
- [ ] 6.5 Move the pen elsewhere (hover is enough) and press **Ctrl+V**: the copy appears at the pen
      position.
- [ ] 6.6 Select something and press **Ctrl+X**: it disappears; **Ctrl+V** brings it back.
- [ ] 6.7 Select and press **Delete** (or Backspace): the selection is removed. Undo restores it.
- [ ] 6.8 Click empty space with the lasso or rectangle tool, or press **Escape**: the selection
      clears. Switching tool from the toolbar also clears it.
- [ ] 6.9 Hold-to-use lasso: while on the pen, hold **L** on the keyboard and loop some writing with
      the pen, release L. The tool returns to the pen and the selection stays: drag it with the pen
      (the cursor shows a move arrow over the box).
- [ ] 6.10 Tap L quickly: the lasso stays selected permanently.
- [ ] 6.11 **Pen side button 3** (S): on the pen, tap it → insert space; tap again → pen. From the
      highlighter, eraser or any other tool, tap it → pen.
- [ ] 6.12 Copy/paste works only inside the app (pasting into another program does nothing), as
      intended.

## 7. Saving, autosave and export

- [ ] 7.1 After editing, the title bar and status bar show a **●** (unsaved changes).
- [ ] 7.2 Press **Ctrl+S**: a save dialog asks where to save `<name>.pdfnotes`. Save. The ● goes away.
- [ ] 7.3 Make another change and press **Ctrl+S** again: it saves to the same file without asking.
- [ ] 7.4 **Ctrl+Shift+S** always asks for a new location (Save As).
- [ ] 7.5 Close the tab with unsaved changes: the browser asks whether to leave. Cancel.
- [ ] 7.6 Press **Ctrl+O** and open your `.pdfnotes` file (or drag it onto the window): it reopens
      exactly as saved: same gaps, ink, colors and highlights.
- [ ] 7.7 Autosave: make a change, wait 5 seconds, then close the tab and choose "Leave". Reopen the
      app: a yellow banner offers to **Restore** your unsaved work. Restore it; everything is there
      and the ● shows (press Ctrl+S to save it to a file). Try **Discard** another time (it asks to
      confirm).
- [ ] 7.8 Press **Ctrl+E** (export). Save the `… (annotated).pdf`. Open it in **Edge**: each page is
      taller where you inserted space, text is sharp when zoomed in (it's still real text: try
      selecting it), and all ink and highlights are there, in the right places.
- [ ] 7.9 Open the original PDF file: it is unchanged.
- [ ] 7.10 If you write something entirely in the gray area outside the pages and export, a message
      tells you that stroke couldn't be included.

## 8. Install as an app and offline

- [ ] 8.1 In Edge, click the "App available / Install" icon in the address bar (or … → Apps → Install
      this site as an app). It opens in its own window; pin it to the taskbar.
- [ ] 8.2 Disconnect from the internet (or turn on airplane mode), open the installed app and a PDF:
      everything still works.
- [ ] 8.3 Optional: right-click a PDF in Explorer → Open with → PDF Spacer Notes. It opens in the app.

## 9. Big documents and odd cases

- [ ] 9.1 Open a 60-page paper, zoom to 200–400%, and scroll from start to end: it stays responsive.
- [ ] 9.2 Write a lot of ink on many pages, then insert space near the top: dragging stays smooth.
- [ ] 9.3 Open a PDF with landscape or rotated pages: they display upright, and exported pages look
      the same as on screen.
- [ ] 9.4 Turn off Windows Ink in the Huion driver, reload, and write three strokes: a tip about
      Windows Ink appears once. Click "Don't show again". Turn Windows Ink back on.

---

When you're done, note anything that felt wrong (latency, pressure curve, snapping too eager or not
eager enough, eraser size, cursor offset) along with the step number.
