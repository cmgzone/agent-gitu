import { describe, expect, it } from 'vitest';
import { LoopDetector, DEFAULT_LOOP_POLICY } from '../src/loop/loop-detector.js';
import { MAX_FILE_BYTES } from '../src/tools/tools.js';
import type { ActionRecord } from '../src/types.js';
import { hashParams } from '../src/util.js';

function makeAction(overrides: Partial<ActionRecord>): ActionRecord {
  return {
    id: overrides.id ?? 'act-' + Math.random().toString(36).slice(2, 7),
    tool: overrides.tool ?? 'read_file',
    paramsHash: overrides.paramsHash ?? 'hash-default',
    paramsSummary: overrides.paramsSummary ?? 'summary',
    status: overrides.status ?? 'success',
    reason: overrides.reason ?? 'investigation',
    expected: overrides.expected ?? 'file content',
    observation: overrides.observation ?? 'content',
    durationMs: overrides.durationMs ?? 1,
    createdAt: overrides.createdAt ?? new Date().toISOString(),
    contextFingerprint: overrides.contextFingerprint,
    readObservationComplete: overrides.readObservationComplete,
    readRefresh: overrides.readRefresh,
  };
}

describe('read_file protection redesign', () => {
  it('has 20MB MAX_FILE_BYTES to allow reading large files', () => {
    expect(MAX_FILE_BYTES).toBe(20 * 1024 * 1024);
  });

  describe('exact line range hashing', () => {
    it('produces different hashes for non-identical line ranges in the same 200-line region', () => {
      const h1 = hashParams('read_file', { path: 'src/huge.ts', offset: 1, limit: 50 });
      const h2 = hashParams('read_file', { path: 'src/huge.ts', offset: 51, limit: 50 });
      const h3 = hashParams('read_file', { path: 'src/huge.ts', offset: 101, limit: 50 });

      expect(h1).not.toBe(h2);
      expect(h2).not.toBe(h3);
      expect(h1).not.toBe(h3);
    });

    it('produces the same hash for identical line ranges regardless of presentation knobs', () => {
      const h1 = hashParams('read_file', { path: './src/app.ts', offset: 10, limit: 100, maxChars: 5000 });
      const h2 = hashParams('read_file', { path: 'src/app.ts', offset: 10, limit: 100, maxChars: 25000 });
      expect(h1).toBe(h2);
    });
  });

  describe('compaction awareness in loop detection', () => {
    it('permits rereading previously read ranges after compaction', () => {
      const detector = new LoopDetector();
      const readHash = hashParams('read_file', { path: 'src/core.ts', offset: 1, limit: 100 });

      // 2 successful reads recorded in history
      const actions: ActionRecord[] = [
        makeAction({ id: 'act-1', tool: 'read_file', paramsHash: readHash, paramsSummary: 'read src/core.ts', contextFingerprint: 'v1', observation: 'line 1 to 100 content' }),
        makeAction({ id: 'act-2', tool: 'read_file', paramsHash: readHash, paramsSummary: 'read src/core.ts', contextFingerprint: 'v1', observation: 'line 1 to 100 content' }),
      ];

      // Before compaction: 3rd identical read evaluates to blocked
      const preVerdict = detector.evaluate(actions, 'read_file', readHash, undefined, 'v1');
      expect(preVerdict.allowed).toBe(false);

      // Notify detector of compaction after act-2
      detector.noteCompaction('act-2');

      // After compaction: actions before act-2 no longer count toward the repeat block!
      const postVerdict = detector.evaluate(actions, 'read_file', readHash, undefined, 'v1');
      expect(postVerdict.allowed).toBe(true);
    });

    it('reusableSuccessfulRead respects compaction boundary', () => {
      const detector = new LoopDetector();
      const readHash = hashParams('read_file', { path: 'src/core.ts', offset: 1, limit: 100 });

      const actions: ActionRecord[] = [
        makeAction({ id: 'act-1', tool: 'read_file', paramsHash: readHash, paramsSummary: 'read src/core.ts', contextFingerprint: 'v1', observation: 'line 1 to 100 content' }),
        makeAction({ id: 'act-2', tool: 'read_file', paramsHash: readHash, paramsSummary: 'read src/core.ts', contextFingerprint: 'v1', observation: 'line 1 to 100 content' }),
      ];

      // Before compaction, reusable read is found
      const preReusable = detector.reusableSuccessfulRead(actions, 'read_file', readHash, 'v1');
      expect(preReusable).toBeDefined();
      expect(preReusable?.id).toBe('act-2');

      // Compaction happens
      detector.noteCompaction('act-2');

      // After compaction, old read is NOT forced into reuse; a fresh read is permitted
      const postReusable = detector.reusableSuccessfulRead(actions, 'read_file', readHash, 'v1');
      expect(postReusable).toBeUndefined();
    });
  });

  describe('adaptive investigation budget', () => {
    it('expands the budget as more unique files are investigated', () => {
      const detector = new LoopDetector({
        ...DEFAULT_LOOP_POLICY,
        maxInvestigationReadsPerFailureEpisode: 10,
      });

      // Trigger a failure episode with status: 'error'
      const failHash = hashParams('run_command', { command: 'npm test' });
      const actions: ActionRecord[] = [
        makeAction({ id: 'act-0', tool: 'run_command', paramsHash: failHash, paramsSummary: 'npm test', status: 'error', observation: 'FAIL: test failed' }),
      ];

      // Read 12 different files
      for (let i = 1; i <= 12; i++) {
        const fileHash = hashParams('read_file', { path: `src/module_${i}.ts`, offset: 1, limit: 50 });
        actions.push(
          makeAction({ id: `act-${i}`, tool: 'read_file', paramsHash: fileHash, paramsSummary: `read src/module_${i}.ts`, status: 'success', observation: `content ${i}` }),
        );
      }

      const pressure = detector.investigationPressure(actions);
      expect(pressure).toBeDefined();
      expect(pressure?.uniqueFiles).toBe(12);
      expect(pressure?.reads).toBe(12);

      // With 12 unique files, adaptive budget is Math.max(10, 10 + 12 * 3) = 46 reads.
      // So reading a 13th file is still well within budget (NOT blocked)!
      const newFileHash = hashParams('read_file', { path: 'src/module_13.ts', offset: 1, limit: 50 });
      const verdict = detector.evaluate(actions, 'read_file', newFileHash, undefined);
      expect(verdict.allowed).toBe(true);
    });
  });
});
