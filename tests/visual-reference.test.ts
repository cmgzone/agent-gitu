import { describe, expect, it } from 'vitest';
import { TaskLedger } from '../src/ledger/task-ledger.js';
import { buildStateMessage } from '../src/agent/prompt.js';
import { applyFollowUpToLedger, persistVisualAssets } from '../src/agent/follow-up.js';
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
