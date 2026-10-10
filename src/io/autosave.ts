import { docFromJson, docToJson } from '../model/serialize';
import type { Doc } from '../model/types';

/** Autosave of the current project to IndexedDB (one slot). */

const DB_NAME = 'pdf-spacer-notes';
const STORE = 'autosave';
const KEY = 'current';
const PDF_KEY = 'pdf';

/** The PDF bytes last written, so they are only rewritten when a different PDF is open. */
let lastPdf: Uint8Array | null = null;

export interface AutosaveRecord {
  doc: Doc;
  pdfBytes: Uint8Array;
  fileName: string;
  /** True when the project has changes not saved to a file. */
  unsaved: boolean;
  time: number;
}

interface StoredRecord {
  data: ReturnType<typeof docToJson>;
  fileName: string;
  unsaved: boolean;
  time: number;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('IndexedDB unavailable'));
    req.onblocked = () => reject(new Error('IndexedDB is blocked by another tab'));
  });
}

async function tx<T>(
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await openDb();
  try {
    return await new Promise<T>((resolve, reject) => {
      const t = db.transaction(STORE, mode);
      const req = fn(t.objectStore(STORE));
      t.oncomplete = () => resolve(req.result);
      t.onerror = () => reject(t.error ?? req.error ?? new Error('IndexedDB error'));
      t.onabort = () => reject(t.error ?? new Error('IndexedDB transaction aborted (disk full?)'));
    });
  } finally {
    db.close();
  }
}

export async function writeAutosave(r: AutosaveRecord): Promise<void> {
  const stored: StoredRecord = {
    data: docToJson(r.doc),
    fileName: r.fileName,
    unsaved: r.unsaved,
    time: r.time,
  };
  if (lastPdf !== r.pdfBytes) {
    // Invalidate the record first so a crash between the two writes can't pair a new PDF with old ink.
    await tx('readwrite', (s) => s.delete(KEY));
    await tx('readwrite', (s) => s.put(r.pdfBytes, PDF_KEY));
    lastPdf = r.pdfBytes;
  }
  await tx('readwrite', (s) => s.put(stored, KEY));
}

export async function readAutosave(): Promise<AutosaveRecord | null> {
  const stored = (await tx('readonly', (s) => s.get(KEY))) as StoredRecord | undefined;
  if (!stored) return null;
  const pdfBytes = (await tx('readonly', (s) => s.get(PDF_KEY))) as Uint8Array | undefined;
  if (!pdfBytes) return null;
  lastPdf = null;
  return {
    doc: docFromJson(stored.data),
    pdfBytes,
    fileName: stored.fileName,
    unsaved: stored.unsaved,
    time: stored.time,
  };
}

export async function clearAutosave(): Promise<void> {
  await tx('readwrite', (s) => s.delete(KEY));
  await tx('readwrite', (s) => s.delete(PDF_KEY));
  lastPdf = null;
}
