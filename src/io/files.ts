/** File open/save helpers using the File System Access API, with fallbacks. */

// Minimal typings for the File System Access API (not in TypeScript's DOM lib everywhere).
export interface FsFileHandle {
  kind: 'file';
  name: string;
  getFile(): Promise<File>;
  createWritable(): Promise<{
    write(data: Blob | BufferSource | string): Promise<void>;
    close(): Promise<void>;
  }>;
}

interface PickerType {
  description: string;
  accept: Record<string, string[]>;
}

type WindowWithFs = Window & {
  showOpenFilePicker?: (o: {
    types?: PickerType[];
    multiple?: boolean;
    excludeAcceptAllOption?: boolean;
  }) => Promise<FsFileHandle[]>;
  showSaveFilePicker?: (o: {
    suggestedName?: string;
    types?: PickerType[];
  }) => Promise<FsFileHandle>;
};

const w = window as WindowWithFs;

export const hasFsAccess = typeof w.showOpenFilePicker === 'function';

export const PDF_TYPE: PickerType = {
  description: 'PDF document',
  accept: { 'application/pdf': ['.pdf'] },
};
export const PROJECT_TYPE: PickerType = {
  description: 'PDF Spacer Notes project',
  accept: { 'application/json': ['.pdfnotes'] },
};

export interface OpenedFile {
  file: File;
  handle: FsFileHandle | null;
}

export function isAbort(err: unknown): boolean {
  return err instanceof DOMException && err.name === 'AbortError';
}

/** Ask the user for a PDF or .pdfnotes file. Resolves null if cancelled. */
export async function pickFileToOpen(): Promise<OpenedFile | null> {
  if (w.showOpenFilePicker) {
    try {
      const [handle] = await w.showOpenFilePicker({
        types: [
          {
            description: 'PDF or PDF Spacer Notes project',
            accept: { 'application/pdf': ['.pdf'], 'application/json': ['.pdfnotes'] },
          },
        ],
        multiple: false,
      });
      return { file: await handle.getFile(), handle };
    } catch (err) {
      if (isAbort(err)) return null;
      throw err;
    }
  }
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.pdf,.pdfnotes,application/pdf';
    input.addEventListener('change', () => {
      const file = input.files?.[0];
      resolve(file ? { file, handle: null } : null);
    });
    input.addEventListener('cancel', () => resolve(null));
    input.click();
  });
}

/** Ask for a save location. Returns null if cancelled, or 'download' when the API is unavailable. */
export async function pickSaveLocation(
  suggestedName: string,
  type: PickerType,
): Promise<FsFileHandle | 'download' | null> {
  if (!w.showSaveFilePicker) return 'download';
  try {
    return await w.showSaveFilePicker({ suggestedName, types: [type] });
  } catch (err) {
    if (isAbort(err)) return null;
    throw err;
  }
}

export async function writeToHandle(handle: FsFileHandle, data: Blob): Promise<void> {
  const writable = await handle.createWritable();
  await writable.write(data);
  await writable.close();
}

export function downloadBlob(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export function isProjectName(name: string): boolean {
  return name.toLowerCase().endsWith('.pdfnotes');
}

export function baseName(name: string): string {
  return name.replace(/\.(pdf|pdfnotes)$/i, '');
}
