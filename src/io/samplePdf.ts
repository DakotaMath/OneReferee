import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

export interface SamplePdfOptions {
  pages?: number;
  /** Lines of text per page. */
  linesPerPage?: number;
  /** Page size in points (default US Letter). */
  width?: number;
  height?: number;
}

const WORDS = (
  'let be a compact Riemannian manifold and suppose the operator is self adjoint with ' +
  'discrete spectrum then for every eigenvalue there exists a smooth eigenfunction such that ' +
  'the estimate holds uniformly in the parameter we prove the theorem by induction on the dimension'
).split(' ');

function sentence(seed: number, count: number): string {
  const out: string[] = [];
  for (let i = 0; i < count; i++) out.push(WORDS[(seed * 7 + i * 13) % WORDS.length]);
  return out.join(' ');
}

/**
 * Generates a multi-page PDF with numbered lines of text and a few display
 * "equations", like a math paper. Used for tests and the in-app sample.
 */
export async function makeSamplePdf(options: SamplePdfOptions = {}): Promise<Uint8Array> {
  const { pages = 3, linesPerPage = 30, width = 612, height = 792 } = options;
  const doc = await PDFDocument.create();
  doc.setTitle('PDF Spacer Notes sample');
  const font = await doc.embedFont(StandardFonts.TimesRoman);
  const italic = await doc.embedFont(StandardFonts.TimesRomanItalic);
  const bold = await doc.embedFont(StandardFonts.TimesRomanBold);
  const margin = 72;
  const lineGap = (height - 2 * margin - 40) / linesPerPage;

  for (let p = 0; p < pages; p++) {
    const page = doc.addPage([width, height]);
    page.drawText(`Sample paper — page ${p + 1}`, {
      x: margin,
      y: height - margin,
      size: 14,
      font: bold,
    });
    for (let l = 0; l < linesPerPage; l++) {
      const y = height - margin - 40 - l * lineGap;
      if (l % 8 === 5) {
        page.drawText(
          `f(x) = sum a_n x^n,    ||u|| <= C int |grad u|^2 dx        (${p + 1}.${l})`,
          {
            x: margin + 80,
            y,
            size: 12,
            font: italic,
          },
        );
      } else {
        page.drawText(`${l + 1}. ${sentence(p * 100 + l, 11)}`, {
          x: margin,
          y,
          size: 11,
          font,
          color: rgb(0, 0, 0),
        });
      }
    }
    page.drawText(String(p + 1), { x: width / 2 - 4, y: margin / 2, size: 10, font });
  }
  return doc.save();
}
