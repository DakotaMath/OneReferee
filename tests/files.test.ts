import { describe, expect, it } from 'vitest';
import { PDFDocument, PDFName, PDFRawStream, PDFDict, decodePDFRawStream } from 'pdf-lib';
import { exportAnnotatedPdf } from '../src/io/exportPdf';
import { createDocument } from '../src/model/document';
import { eraseAt } from '../src/model/erase';
import {
  base64ToBytes,
  bytesToBase64,
  docFromJson,
  docToJson,
  parseProject,
  serializeProject,
} from '../src/model/serialize';
import { translateStrokes } from '../src/model/select';
import { insertSpace } from '../src/model/space';
import { makeStroke } from '../src/model/strokes';
import type { Doc } from '../src/model/types';
import { makeSamplePdf } from './helpers/samplePdf';
import { line } from './helpers/docs';

async function sampleDoc(pages = 3): Promise<{ doc: Doc; bytes: Uint8Array }> {
  const bytes = await makeSamplePdf({ pages });
  const doc = createDocument(Array.from({ length: pages }, () => ({ width: 612, height: 792 })));
  return { doc, bytes };
}

/** A document that went through every kind of edit. */
function editedDoc(doc: Doc): Doc {
  let d: Doc = {
    ...doc,
    strokes: [
      line(100, 150, 300, 160, 25, 'a'),
      makeStroke('highlighter', '#fff176', 8, [
        { x: 72.123, y: 200.456, pressure: 0.5 },
        { x: 400.789, y: 201.111, pressure: 0.5 },
      ]),
      makeStroke('pen', '#d32f2f', 1, [
        { x: 50.555, y: 900.333, pressure: 0.12345 },
        { x: 60.1, y: 910.9, pressure: 0.98765 },
        { x: 70.33333, y: 905.77777, pressure: 0.5 },
      ]),
    ],
  };
  d = insertSpace(d, 300.004, 47.333);
  d = insertSpace(d, 900, 20); // on page 2 (page 1 now ends at 839.33)
  d = { ...d, strokes: eraseAt(d.strokes, 200, 155, 6, 'point') };
  d = translateStrokes(d, new Set([d.strokes[0].id]), 3.33, -1.11);
  return d;
}

describe('base64', () => {
  it('round-trips arbitrary bytes of every length', () => {
    for (const n of [0, 1, 2, 3, 4, 5, 100, 12289]) {
      const bytes = new Uint8Array(n).map((_, i) => (i * 7919) & 255);
      const b64 = bytesToBase64(bytes);
      expect(b64).toBe(Buffer.from(bytes).toString('base64'));
      expect(base64ToBytes(b64)).toEqual(bytes);
    }
  });
});

describe('save then load', () => {
  it('produces an identical document and PDF bytes', async () => {
    const { doc, bytes } = await sampleDoc();
    const d = editedDoc(doc);
    const text = serializeProject({ doc: d, pdfBytes: bytes, pdfName: 'paper.pdf' });
    const p = parseProject(text);
    expect(p.doc).toEqual(d);
    expect(p.pdfBytes).toEqual(bytes);
    expect(p.pdfName).toBe('paper.pdf');
    // And saving again gives the same file.
    expect(serializeProject(p)).toBe(text);
  });

  it('stores a format version and rounded coordinates', async () => {
    const { doc, bytes } = await sampleDoc(1);
    const s = makeStroke('pen', '#000000', 2, [{ x: 1.23456, y: 2.34567, pressure: 0.77777 }]);
    const j = JSON.parse(
      serializeProject({ doc: { ...doc, strokes: [s] }, pdfBytes: bytes, pdfName: 'x.pdf' }),
    );
    expect(j.format).toBe('pdf-spacer-notes');
    expect(j.version).toBe(1);
    expect(j.strokes[0].origin).toEqual([1.23, 2.35]);
    expect(j.strokes[0].points).toEqual([0, 0, 0.778]);
  });

  it('round-trips the autosave representation', async () => {
    const { doc } = await sampleDoc();
    const d = editedDoc(doc);
    expect(docFromJson(JSON.parse(JSON.stringify(docToJson(d))))).toEqual(d);
  });

  it('rejects files that are not projects', () => {
    expect(() => parseProject('not json')).toThrow(/not a PDF Spacer Notes project/);
    expect(() => parseProject('{"format":"other"}')).toThrow(/Not a valid/);
    expect(() =>
      parseProject(JSON.stringify({ format: 'pdf-spacer-notes', version: 99, pdf: 'AA==' })),
    ).toThrow(/newer version/);
  });
});

/** All decoded content of a page's content streams plus nested form XObjects. */
function pageText(pdf: PDFDocument, pageIndex: number): string {
  const page = pdf.getPage(pageIndex);
  const parts: string[] = [];
  const contents = page.node.Contents();
  const streams = contents ? ('asArray' in contents ? contents.asArray() : [contents]) : [];
  for (const ref of streams) {
    const st = pdf.context.lookup(ref);
    if (st instanceof PDFRawStream)
      parts.push(new TextDecoder().decode(decodePDFRawStream(st).decode()));
  }
  return parts.join('\n');
}

describe('export PDF', () => {
  it('makes each page taller by its gaps, with vector page content and ink', async () => {
    const { doc, bytes } = await sampleDoc();
    const d = editedDoc(doc);
    const { bytes: out, skippedStrokes } = await exportAnnotatedPdf(bytes, d);
    expect(skippedStrokes).toBe(0);
    const pdf = await PDFDocument.load(out);
    expect(pdf.getPageCount()).toBe(3);
    expect(pdf.getPage(0).getSize()).toEqual({ width: 612, height: 792 + 47.33 });
    expect(pdf.getPage(1).getSize()).toEqual({ width: 612, height: 792 + 20 });
    expect(pdf.getPage(2).getSize()).toEqual({ width: 612, height: 792 });

    const text0 = pageText(pdf, 0);
    // Two slices on page 1, each clipped ("re W n") and drawing the embedded page ("Do").
    expect(text0.match(/re\s+W\s+n/g)?.length).toBe(2);
    expect(text0.match(/\/\S+ Do/g)?.length).toBe(2);
    // Ink drawn as filled paths.
    expect(text0).toMatch(/\bf\b/);

    // The embedded page is a vector form XObject, not an image.
    const xobjects = pdf.getPage(0).node.Resources()!.lookup(PDFName.of('XObject'), PDFDict);
    for (const [, ref] of xobjects.entries()) {
      const xo = pdf.context.lookup(ref) as PDFRawStream;
      expect(xo.dict.get(PDFName.of('Subtype'))).toBe(PDFName.of('Form'));
    }
  });

  it('reports strokes that lie outside every page', async () => {
    const { doc, bytes } = await sampleDoc(1);
    const d: Doc = { ...doc, strokes: [line(10, 2000, 50, 2000, 4)] };
    const r = await exportAnnotatedPdf(bytes, d);
    expect(r.skippedStrokes).toBe(1);
  });

  it('handles rotated and cropped source pages', async () => {
    const src = await PDFDocument.create();
    const p = src.addPage([600, 400]);
    p.setCropBox(50, 25, 500, 350);
    const { degrees } = await import('pdf-lib');
    p.setRotation(degrees(90));
    p.drawRectangle({ x: 100, y: 100, width: 50, height: 50 });
    src.addPage([300, 300]); // blank page with no content stream
    const bytes = await src.save();
    // As displayed (rotated 90°), the crop box is 350 wide and 500 tall.
    const doc = insertSpace(
      createDocument([
        { width: 350, height: 500 },
        { width: 300, height: 300 },
      ]),
      250,
      30,
    );
    const r = await exportAnnotatedPdf(bytes, doc);
    const out = await PDFDocument.load(r.bytes);
    expect(out.getPage(0).getSize()).toEqual({ width: 350, height: 530 });
    expect(out.getPage(0).getRotation().angle).toBe(0);
    expect(out.getPage(1).getSize()).toEqual({ width: 300, height: 300 });
  });
});
