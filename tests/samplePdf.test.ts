import { describe, expect, it } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { makeSamplePdf } from './helpers/samplePdf';

describe('sample PDF fixture', () => {
  it('generates a multi-page PDF', async () => {
    const bytes = await makeSamplePdf({ pages: 4 });
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBe(4);
    expect(doc.getPage(0).getSize()).toEqual({ width: 612, height: 792 });
  });
});
