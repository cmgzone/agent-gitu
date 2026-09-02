import { describe, expect, it } from 'vitest';
import { TaskLedger } from '../src/ledger/task-ledger.js';
import { buildStateMessage } from '../src/agent/prompt.js';
import { applyFollowUpToLedger, persistVisualAssets } from '../src/agent/follow-up.js';
import { rehydrateVisualReferences, markUnavailableVisualReferences, restoreVisualReferencesAfterCompaction } from '../src/agent/visual-assets.js';
import { buildModelContext } from '../src/context/model-context.js';
import type { LlmMessage } from '../src/llm/llm.js';
import type { ProjectLock } from '../src/types.js';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

function createMockProject(): { repoRoot: string; project: ProjectLock; cleanup: () => void } {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'gitu-vref-test-'));
  const project: ProjectLock = {
    name: 'test-project',
    repoRoot,
    techStack: ['typescript', 'react'],
    entrypoints: ['src/App.tsx'],
    ignorePaths: ['node_modules'],
    lockedAt: new Date().toISOString(),
  };
  return {
    repoRoot,
    project,
    cleanup: () => {
      try {
        fs.rmSync(repoRoot, { recursive: true, force: true });
      } catch {}
    },
  };
}

describe('Visual Reference Persistence & Lifetimes', () => {
  it('records user visual references with durable task lifetime', () => {
    const { repoRoot, project, cleanup } = createMockProject();
    try {
      const ledger = TaskLedger.create({
        repoRoot,
        goal: 'Build dashboard matching design',
        project,
        mode: 'standard',
      });

      const ref1 = ledger.addVisualReference({
        path: '.hermes/task-assets/mock-task/ref-1.webp',
        kind: 'user-reference',
        status: 'active',
        pinned: true,
      });

      expect(ledger.activeVisualReferences().length).toBe(1);
      expect(ledger.activeVisualReferences()[0]!.id).toBe(ref1.id);

      const state = buildStateMessage(ledger);
      expect(state).toContain('ACTIVE VISUAL REFERENCES:');
      expect(state).toContain('ref-1.webp (pinned)');
    } finally {
      cleanup();
    }
  });

  it('allows replacing an active visual reference without losing history', () => {
    const { repoRoot, project, cleanup } = createMockProject();
    try {
      const ledger = TaskLedger.create({
        repoRoot,
        goal: 'Design UI',
        project,
        mode: 'standard',
      });

      const ref1 = ledger.addVisualReference({
        path: 'mock/ref-1.png',
        kind: 'user-reference',
        status: 'active',
      });

      const ref2 = ledger.replaceVisualReference(ref1.id, {
        path: 'mock/ref-2.png',
        kind: 'user-reference',
        status: 'active',
        pinned: true,
      });

      expect(ledger.activeVisualReferences().length).toBe(1);
      expect(ledger.activeVisualReferences()[0]!.id).toBe(ref2.id);
      expect(ledger.data.taskAuthority?.visualReferences.find((v) => v.id === ref1.id)?.status).toBe('superseded');
    } finally {
      cleanup();
    }
  });
});

describe('Durable visual asset persistence', () => {
  it('persists uploaded images under .hermes/task-assets and registers pinned user references', () => {
    const { repoRoot, project, cleanup } = createMockProject();
    try {
      const ledger = TaskLedger.create({ repoRoot, goal: 'Match this design', project, mode: 'standard' });
      const bytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
      const images = [{ name: 'mockup.png', dataUrl: `data:image/png;base64,${bytes.toString('base64')}` }];

      const persisted = persistVisualAssets(images, ledger, repoRoot);
      expect(persisted.length).toBe(1);
      expect(persisted[0]).toMatch(new RegExp(`^\\.hermes/task-assets/${ledger.data.taskId}/vref-.+\\.png$`));
      expect(fs.readFileSync(path.join(repoRoot, persisted[0]!))).toEqual(bytes);

      const record = applyFollowUpToLedger(ledger, 'use this image for the card design', false, persisted);
      expect(record.kind).toBe('VISUAL_REFERENCE');
      const refs = ledger.activeVisualReferences();
      expect(refs.length).toBe(1);
      expect(refs[0]!.path).toBe(persisted[0]);
      expect(refs[0]!.kind).toBe('user-reference');
      expect(refs[0]!.pinned).toBe(true);

      // Re-delivering the same durable asset (e.g. a re-run carrying the same
      // attachment) must not pile up duplicate active references.
      applyFollowUpToLedger(ledger, 'also match the spacing in the image', false, persisted);
      expect(ledger.activeVisualReferences().length).toBe(1);
    } finally {
      cleanup();
    }
  });

  it('skips undecodable image payloads without corrupting the ledger', () => {
    const { repoRoot, project, cleanup } = createMockProject();
    try {
      const ledger = TaskLedger.create({ repoRoot, goal: 'Design UI', project, mode: 'standard' });
      const persisted = persistVisualAssets([{ name: 'broken.png', dataUrl: 'data:image/png;base64,not-base64!!!' }], ledger, repoRoot);
      expect(persisted.length).toBe(0);
      expect(ledger.activeVisualReferences().length).toBe(0);
    } finally {
      cleanup();
    }
  });
});

describe('Visual reference rehydration (resume / restart / compaction)', () => {
  const PNG_BYTES = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  function projectWithDurableImage(): { repoRoot: string; project: ProjectLock; ledger: TaskLedger; cleanup: () => void } {
    const { repoRoot, project, cleanup } = createMockProject();
    const ledger = TaskLedger.create({ repoRoot, goal: 'Build the card to match the mockup', project, mode: 'standard' });
    const persisted = persistVisualAssets([{ name: 'mockup.png', dataUrl: `data:image/png;base64,${PNG_BYTES.toString('base64')}` }], ledger, repoRoot);
    applyFollowUpToLedger(ledger, 'use this image for the card design', false, persisted);
    return { repoRoot, project, ledger, cleanup };
  }

  it('rehydrates a durable image on a follow-up run WITHOUT re-attachment', () => {
    const { repoRoot, ledger, cleanup } = projectWithDurableImage();
    try {
      // A fresh run rehydrates the durable asset into model-context images.
      const { images, unavailable } = rehydrateVisualReferences(ledger, repoRoot);
      expect(unavailable).toEqual([]);
      expect(images.length).toBe(1);
      expect(images[0]!.dataUrl).toBe(`data:image/png;base64,${PNG_BYTES.toString('base64')}`);

      // And the rehydrated image actually lands in the LLM request.
      const assembled = buildModelContext({
        system: 'SYSTEM',
        images,
        supportsImages: true,
      });
      const imageParts = assembled.messages.flatMap((m) => (Array.isArray(m.content) ? m.content : [])).filter((p) => p.type === 'image_url');
      expect(imageParts.length).toBe(1);
      expect(imageParts[0]).toEqual({ type: 'image_url', image_url: { url: `data:image/png;base64,${PNG_BYTES.toString('base64')}` } });
    } finally {
      cleanup();
    }
  });

  it('rehydrates after a process restart by reloading the ledger from disk', () => {
    const { repoRoot, ledger, cleanup } = projectWithDurableImage();
    const taskId = ledger.data.taskId;
    try {
      // Simulate a restart: brand-new ledger instance loaded from disk.
      const reloaded = TaskLedger.load(repoRoot, taskId)!;
      expect(reloaded.activeVisualReferences().length).toBe(1);
      const { images, unavailable } = rehydrateVisualReferences(reloaded, repoRoot);
      expect(unavailable).toEqual([]);
      expect(images[0]!.dataUrl).toBe(`data:image/png;base64,${PNG_BYTES.toString('base64')}`);
    } finally {
      cleanup();
    }
  });

  it('restores images into model context after compaction removed them (idempotent)', () => {
    const { repoRoot, ledger, cleanup } = projectWithDurableImage();
    try {
      const { images } = rehydrateVisualReferences(ledger, repoRoot);
      const messages: LlmMessage[] = [
        { role: 'system', content: 'SYSTEM' },
        { role: 'user', content: 'COMPACTED HISTORY digest' },
        { role: 'user', content: 'TASK AUTHORITY ...' },
        { role: 'assistant', content: 'ok' },
      ];
      expect(restoreVisualReferencesAfterCompaction(messages, { images, unavailable: [] }, true)).toBe(true);
      const restored = messages[2]!;
      expect(Array.isArray(restored.content)).toBe(true);
      const parts = restored.content as Array<{ type: string; image_url?: { url: string } }>;
      expect(parts.some((p) => p.type === 'text' && String((p as { text?: string }).text).includes('restored after history compaction'))).toBe(true);
      expect(parts.some((p) => p.type === 'image_url' && p.image_url?.url === `data:image/png;base64,${PNG_BYTES.toString('base64')}`)).toBe(true);

      // Idempotent: a second pass must not duplicate the images.
      expect(restoreVisualReferencesAfterCompaction(messages, { images, unavailable: [] }, true)).toBe(false);
      const imagePartCount = messages.flatMap((m) => (Array.isArray(m.content) ? m.content : [])).filter((p) => p.type === 'image_url').length;
      expect(imagePartCount).toBe(1);

      // Text-only models never get spliced image parts.
      const textOnly: LlmMessage[] = [
        { role: 'system', content: 'SYSTEM' },
        { role: 'user', content: 'digest' },
      ];
      expect(restoreVisualReferencesAfterCompaction(textOnly, { images, unavailable: [] }, false)).toBe(false);
    } finally {
      cleanup();
    }
  });

  it('marks a missing or corrupt durable image unavailable and tells the model explicitly', () => {
    const { repoRoot, ledger, cleanup } = projectWithDurableImage();
    try {
      const ref = ledger.activeVisualReferences()[0]!;
      const abs = path.join(repoRoot, ref.path!);
      // Corrupt the asset on disk (truncated write / restart artifact): an
      // empty file is unreadable as an image and must not silently vanish.
      fs.writeFileSync(abs, Buffer.alloc(0));

      const first = rehydrateVisualReferences(ledger, repoRoot);
      expect(first.images).toEqual([]);
      expect(first.unavailable.length).toBe(1);
      markUnavailableVisualReferences(ledger, first.unavailable);
      expect(ledger.activeVisualReferences().length).toBe(0);
      expect(ledger.data.taskAuthority?.visualReferences.find((v) => v.id === ref.id)?.status).toBe('unavailable');

      // The model is told explicitly instead of silently losing the reference.
      const state = buildStateMessage(ledger);
      expect(state).toContain('UNAVAILABLE VISUAL REFERENCES');
      expect(state).toContain(ref.path!);

      // A missing file is reported the same way.
      const other = TaskLedger.create({ repoRoot, goal: 'second', project: ledger.data.project, mode: 'standard' });
      other.addVisualReference({ path: '.hermes/task-assets/gone/vref-x.png', kind: 'user-reference', status: 'active', pinned: true });
      const second = rehydrateVisualReferences(other, repoRoot);
      expect(second.images).toEqual([]);
      expect(second.unavailable[0]!.reason).toContain('missing');
    } finally {
      cleanup();
    }
  });
});
