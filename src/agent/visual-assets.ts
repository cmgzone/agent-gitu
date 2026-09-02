import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import type { LlmContentPart, LlmMessage } from '../llm/llm.js';
import type { TaskLedger } from '../ledger/task-ledger.js';
import type { VisualReference } from '../types.js';

/**
 * Durable visual-reference rehydration. User-supplied images persist for the
 * lifetime of the task under `.hermes/task-assets/<task-id>/` (written by
 * persistVisualAssets); this module reads them back off disk so a resumed
 * follow-up, a post-compaction turn, or a fresh process still delivers the
 * user's actual images to a vision-capable model. Browser screenshots are
 * deliberately NOT rehydrated — they are ephemeral verification artifacts.
 */

const MIME_BY_EXT: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
};

export interface RehydratedVisuals {
  images: { name: string; dataUrl: string }[];
  unavailable: { id: string; path: string; reason: string }[];
}

/** Read active durable user-reference images back as data URLs. Missing or
 *  corrupt assets are REPORTED, never silently dropped — the caller marks the
 *  reference unavailable and tells the model explicitly. */
export function rehydrateVisualReferences(ledger: TaskLedger, repoRoot: string): RehydratedVisuals {
  const images: { name: string; dataUrl: string }[] = [];
  const unavailable: { id: string; path: string; reason: string }[] = [];
  for (const ref of ledger.activeVisualReferences()) {
    if (ref.kind !== 'user-reference' || !ref.path) continue;
    const abs = path.isAbsolute(ref.path) ? ref.path : path.join(repoRoot, ref.path);
    if (!existsSync(abs)) {
      unavailable.push({ id: ref.id, path: ref.path, reason: 'file is missing' });
      continue;
    }
    try {
      const bytes = readFileSync(abs);
      if (bytes.length === 0) {
        unavailable.push({ id: ref.id, path: ref.path, reason: 'file is empty' });
        continue;
      }
      const mime = MIME_BY_EXT[path.extname(abs).slice(1).toLowerCase()];
      if (!mime) {
        unavailable.push({ id: ref.id, path: ref.path, reason: `unsupported image type "${path.extname(abs)}"` });
        continue;
      }
      images.push({ name: path.basename(abs), dataUrl: `data:${mime};base64,${bytes.toString('base64')}` });
    } catch (err) {
      unavailable.push({ id: ref.id, path: ref.path, reason: (err as Error).message });
    }
  }
  return { images, unavailable };
}

/** Mark refs whose assets could not be read as `unavailable` so they stop
 *  pretending to be active requirements in later turns. */
export function markUnavailableVisualReferences(ledger: TaskLedger, unavailable: RehydratedVisuals['unavailable']): void {
  if (unavailable.length === 0) return;
  for (const u of unavailable) {
    const ref = ledger.data.taskAuthority?.visualReferences.find((v) => v.id === u.id);
    if (ref && ref.status === 'active') ref.status = 'unavailable';
  }
  ledger.save();
}

const RESTORE_TEXT =
  'ACTIVE VISUAL REFERENCE(S) restored after history compaction — these durable user-reference image(s) from ' +
  '.hermes/task-assets/ remain binding visual requirements for the current goal. Inspect them carefully and ' +
  'ground your work in what they show.';

function messageCarriesImages(messages: LlmMessage[], dataUrls: string[]): boolean {
  return messages.some(
    (m) =>
      Array.isArray(m.content) &&
      (m.content as LlmContentPart[]).some((p) => p.type === 'image_url' && dataUrls.includes(p.image_url.url)),
  );
}

/**
 * After history compaction, re-splice the active durable user-reference
 * images into the model context if their message was compacted away.
 * Idempotent: a no-op when the images are still present or the model cannot
 * see images (the text-only TASK AUTHORITY block already names their paths).
 */
export function restoreVisualReferencesAfterCompaction(
  messages: LlmMessage[],
  rehydrated: RehydratedVisuals,
  supportsImages: boolean,
): boolean {
  if (!supportsImages || rehydrated.images.length === 0) return false;
  if (messageCarriesImages(messages, rehydrated.images.map((i) => i.dataUrl))) return false;
  const parts: LlmContentPart[] = [
    { type: 'text', text: RESTORE_TEXT },
    ...rehydrated.images.map((i) => ({ type: 'image_url' as const, image_url: { url: i.dataUrl } })),
  ];
  // Index 2 mirrors the post-compaction protected-section re-injection: the
  // digest sits at index 1, so restored visuals land right after it.
  messages.splice(2, 0, { role: 'user', content: parts });
  return true;
}

/** Whether every active user-reference on the ledger has a readable asset. */
export function allVisualReferencesReadable(ledger: TaskLedger, repoRoot: string): boolean {
  return rehydrateVisualReferences(ledger, repoRoot).unavailable.length === 0;
}
