import { round2, round3 } from './geometry';
import { makeStrokeRel } from './strokes';
import type { Doc, PageInfo, Segment, Stroke, StrokePoint } from './types';

/**
 * The .pdfnotes project format: one JSON file with a format version, the original PDF
 * bytes (base64), the page sizes, the segment list and all strokes.
 *
 *   {
 *     "format": "pdf-spacer-notes", "version": 1,
 *     "pdfName": "paper.pdf", "pdf": "<base64>",
 *     "pages": [{ "width": 612, "height": 792 }, ...],
 *     "segments": [{ "kind": "slice", "page": 0, "srcTop": 0, "srcBottom": 300 },
 *                  { "kind": "gap", "page": 0, "height": 40 }, ...],
 *     "strokes": [{ "id": "…", "tool": "pen", "color": "#000000", "width": 2,
 *                   "origin": [ox, oy], "points": [x0, y0, p0, x1, y1, p1, ...] }, ...]
 *   }
 *
 * Stroke points are relative to "origin", coordinates rounded to 0.01 pt and
 * pressure to 0.001.
 */

export const FORMAT_ID = 'pdf-spacer-notes';
export const FORMAT_VERSION = 1;

export interface Project {
  doc: Doc;
  pdfBytes: Uint8Array;
  pdfName: string;
}

interface StrokeJson {
  id: string;
  tool: 'pen' | 'highlighter';
  color: string;
  width: number;
  origin: [number, number];
  points: number[];
}

interface ProjectJson {
  format: string;
  version: number;
  pdfName: string;
  pdf: string;
  pages: PageInfo[];
  segments: Segment[];
  strokes: StrokeJson[];
}

// ---- base64 (works in browsers and Node, no DOM needed) ----

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const B64_LOOKUP = new Uint8Array(256).fill(255);
for (let i = 0; i < B64.length; i++) B64_LOOKUP[B64.charCodeAt(i)] = i;

export function bytesToBase64(bytes: Uint8Array): string {
  const parts: string[] = [];
  const CHUNK = 3 * 4096;
  for (let start = 0; start < bytes.length; start += CHUNK) {
    const end = Math.min(bytes.length, start + CHUNK);
    let s = '';
    for (let i = start; i < end; i += 3) {
      const a = bytes[i];
      const b = i + 1 < end ? bytes[i + 1] : 0;
      const c = i + 2 < end ? bytes[i + 2] : 0;
      const n = (a << 16) | (b << 8) | c;
      s += B64[(n >> 18) & 63] + B64[(n >> 12) & 63];
      s += i + 1 < end ? B64[(n >> 6) & 63] : '=';
      s += i + 2 < end ? B64[n & 63] : '=';
    }
    parts.push(s);
  }
  return parts.join('');
}

export function base64ToBytes(s: string): Uint8Array {
  s = s.replace(/[^A-Za-z0-9+/]/g, '');
  const out = new Uint8Array(Math.floor((s.length * 3) / 4));
  let o = 0;
  for (let i = 0; i < s.length; i += 4) {
    const a = B64_LOOKUP[s.charCodeAt(i)];
    const b = B64_LOOKUP[s.charCodeAt(i + 1)];
    const c = i + 2 < s.length ? B64_LOOKUP[s.charCodeAt(i + 2)] : 0;
    const d = i + 3 < s.length ? B64_LOOKUP[s.charCodeAt(i + 3)] : 0;
    const n = (a << 18) | (b << 12) | (c << 6) | d;
    out[o++] = (n >> 16) & 255;
    if (i + 2 < s.length) out[o++] = (n >> 8) & 255;
    if (i + 3 < s.length) out[o++] = n & 255;
  }
  return out.subarray(0, o);
}

// ---- strokes and documents ----

function strokeToJson(s: Stroke): StrokeJson {
  const pts: number[] = [];
  for (const p of s.points) pts.push(round2(p.x), round2(p.y), round3(p.pressure));
  return {
    id: s.id,
    tool: s.tool,
    color: s.color,
    width: s.width,
    origin: [round2(s.ox), round2(s.oy)],
    points: pts,
  };
}

/** Plain data for a document (used for files and autosave). */
export function docToJson(doc: Doc): Pick<ProjectJson, 'pages' | 'segments' | 'strokes'> {
  return {
    pages: doc.pages.map((p) => ({ width: p.width, height: p.height })),
    segments: doc.segments.map((s) =>
      s.kind === 'slice'
        ? { kind: 'slice', page: s.page, srcTop: round2(s.srcTop), srcBottom: round2(s.srcBottom) }
        : { kind: 'gap', page: s.page, height: round2(s.height) },
    ),
    strokes: doc.strokes.map(strokeToJson),
  };
}

export function serializeProject(p: Project): string {
  const json: ProjectJson = {
    format: FORMAT_ID,
    version: FORMAT_VERSION,
    pdfName: p.pdfName,
    pdf: bytesToBase64(p.pdfBytes),
    ...docToJson(p.doc),
  };
  return JSON.stringify(json);
}

class FormatError extends Error {}

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

function check(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new FormatError(`Not a valid PDF Spacer Notes file (${msg}).`);
}

/** Rebuild a document from plain data, validating it. */
export function docFromJson(j: { pages: unknown; segments: unknown; strokes: unknown }): Doc {
  check(Array.isArray(j.pages) && j.pages.length > 0, 'pages');
  const pages: PageInfo[] = (j.pages as PageInfo[]).map((p) => {
    check(isNum(p?.width) && isNum(p?.height) && p.width > 0 && p.height > 0, 'page size');
    return { width: p.width, height: p.height };
  });
  check(Array.isArray(j.segments), 'segments');
  const segments: Segment[] = (j.segments as Segment[]).map((s) => {
    if (s?.kind === 'slice') {
      check(Number.isInteger(s.page) && s.page >= 0 && s.page < pages.length, 'slice page');
      check(isNum(s.srcTop) && isNum(s.srcBottom) && s.srcBottom > s.srcTop, 'slice range');
      return { kind: 'slice', page: s.page, srcTop: s.srcTop, srcBottom: s.srcBottom };
    }
    check(s?.kind === 'gap', 'segment kind');
    check(
      s.page === null || (Number.isInteger(s.page) && s.page >= 0 && s.page < pages.length),
      'gap page',
    );
    check(isNum(s.height) && s.height >= 0, 'gap height');
    return { kind: 'gap', page: s.page, height: s.height };
  });
  check(Array.isArray(j.strokes), 'strokes');
  const seen = new Set<string>();
  const strokes: Stroke[] = (j.strokes as StrokeJson[]).map((s) => {
    check(typeof s?.id === 'string' && !seen.has(s.id), 'stroke id');
    seen.add(s.id);
    check(s.tool === 'pen' || s.tool === 'highlighter', 'stroke tool');
    check(typeof s.color === 'string' && /^#[0-9a-f]{6}$/i.test(s.color), 'stroke color');
    check(isNum(s.width) && s.width > 0, 'stroke width');
    check(Array.isArray(s.origin) && isNum(s.origin[0]) && isNum(s.origin[1]), 'stroke origin');
    check(
      Array.isArray(s.points) && s.points.length % 3 === 0 && s.points.length > 0,
      'stroke points',
    );
    const pts: StrokePoint[] = [];
    for (let i = 0; i < s.points.length; i += 3) {
      const [x, y, pressure] = [s.points[i], s.points[i + 1], s.points[i + 2]];
      check(isNum(x) && isNum(y) && isNum(pressure), 'point');
      pts.push({ x, y, pressure });
    }
    return makeStrokeRel(s.tool, s.color, s.width, s.origin[0], s.origin[1], pts, s.id);
  });
  return { pages, segments, strokes };
}

export function parseProject(text: string): Project {
  let j: ProjectJson;
  try {
    j = JSON.parse(text) as ProjectJson;
  } catch {
    throw new FormatError('This file is not a PDF Spacer Notes project (it is not JSON).');
  }
  check(j && j.format === FORMAT_ID, 'format');
  check(isNum(j.version), 'version');
  if (j.version > FORMAT_VERSION) {
    throw new FormatError(
      `This project was saved by a newer version of PDF Spacer Notes (format ${j.version}). Please update the app.`,
    );
  }
  check(typeof j.pdf === 'string' && j.pdf.length > 0, 'pdf');
  const doc = docFromJson(j);
  return {
    doc,
    pdfBytes: base64ToBytes(j.pdf),
    pdfName: typeof j.pdfName === 'string' ? j.pdfName : 'document.pdf',
  };
}
