import { createDocument } from '../../src/model/document';
import type { Doc } from '../../src/model/types';

export const LETTER = { width: 612, height: 792 };

/** Three US Letter pages: slices at y 0–792, 808–1600, 1616–2408. */
export function threePages(): Doc {
  return createDocument([LETTER, LETTER, LETTER]);
}
