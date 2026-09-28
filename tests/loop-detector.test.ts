import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { CACHED_INVESTIGATION_PREFIX, LoopDetector } from '../src/loop/loop-detector.js';
import { Executor } from '../src/executor/executor.js';
import { PolicyEngine } from '../src/policy/policy.js';
import { ProjectGuard } from '../src/guard/project-guard.js';
import { TaskLedger } from '../src/ledger/task-ledger.js';
import type { ActionRecord } from '../src/types.js';

function action(overrides: Partial<ActionRecord> & Pick<ActionRecord, 'tool' | 'paramsHash'>): ActionRecord {
  return {
    id: 'act-1',
    paramsSummary: 'test',
    status: 'error',
    reason: 'r',
    expected: 'e',
    durationMs: 1,
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

describe('LoopDetector', () => {
  const detector = new LoopDetector();

  it('allows first attempts', () => {
    const verdict = detector.evaluate([], 'run_command', 'hash-a', undefined);
    expect(verdict.allowed).toBe(true);
  });

  it('blocks after two failures with the same error signature', () => {
    const actions = [
      action({ tool: 'run_command', paramsHash: 'h1', errorSignature: 'sig-x' }),
      action({ tool: 'run_command', paramsHash: 'h1', errorSignature: 'sig-x' }),
    ];
    const verdict = detector.evaluate(actions, 'run_command', 'h1', 'sig-x');
    expect(verdict.allowed).toBe(false);
    expect(verdict.reason).toMatch(/same error signature/i);
  });

  it('allows retry when the error signature changed', () => {
    const actions = [
      action({ tool: 'run_command', paramsHash: 'h1', errorSignature: 'sig-x' }),
      action({ tool: 'run_command', paramsHash: 'h1', errorSignature: 'sig-x' }),
    ];
    const verdict = detector.evaluate(actions, 'run_command', 'h1', 'sig-y');
    expect(verdict.allowed).toBe(true);
  });

  it('hard-blocks after three failures regardless of signature', () => {
    const actions = [
      action({ tool: 'apply_edit', paramsHash: 'h2', errorSignature: 'a' }),
      action({ tool: 'apply_edit', paramsHash: 'h2', errorSignature: 'b' }),
      action({ tool: 'apply_edit', paramsHash: 'h2', errorSignature: 'c' }),
    ];
    const verdict = detector.evaluate(actions, 'apply_edit', 'h2', 'd');
    expect(verdict.allowed).toBe(false);
    expect(verdict.reason).toMatch(/hard-blocked/i);
  });

  it('does not count successful non-investigation actions as failures', () => {
    const actions = [
      action({ tool: 'run_command', paramsHash: 'h3', status: 'success' }),
      action({ tool: 'run_command', paramsHash: 'h3', status: 'success' }),
      action({ tool: 'run_command', paramsHash: 'h3', status: 'success' }),
    ];
    const verdict = detector.evaluate(actions, 'run_command', 'h3', undefined);
    expect(verdict.allowed).toBe(true);
  });

  it('clears the failure streak after a successful execution of the same command', () => {
    const actions = [
      action({ tool: 'run_command', paramsHash: 'flaky', errorSignature: 'test-failure' }),
      action({ tool: 'run_command', paramsHash: 'flaky', status: 'success' }),
      action({ tool: 'run_command', paramsHash: 'flaky', status: 'success' }),
    ];
    const verdict = detector.evaluate(actions, 'run_command', 'flaky', undefined);
    expect(verdict.allowed).toBe(true);
    expect(verdict.priorFailures).toEqual([]);
  });

  it('counts only failures since the last pass, including when an old error signature recurs', () => {
    const actions = [
      action({ tool: 'run_command', paramsHash: 'flaky', errorSignature: 'test-failure' }),
      action({ tool: 'run_command', paramsHash: 'flaky', status: 'success' }),
      action({ tool: 'run_command', paramsHash: 'flaky', errorSignature: 'test-failure' }),
    ];
    expect(detector.evaluate(actions, 'run_command', 'flaky', undefined)).toMatchObject({ allowed: true, priorFailures: [expect.any(String)] });
    expect(detector.evaluate(actions, 'run_command', 'flaky', 'test-failure').allowed).toBe(true);
    // A different successful command does not resolve this fingerprint.
    actions.push(action({ tool: 'run_command', paramsHash: 'other', status: 'success' }));
    actions.push(action({ tool: 'run_command', paramsHash: 'flaky', errorSignature: 'test-failure' }));
    expect(detector.evaluate(actions, 'run_command', 'flaky', undefined).allowed).toBe(false);
  });

  it('allows a failing command to be verified again after a successful source edit', () => {
    const actions = [
      action({ tool: 'run_command', paramsHash: 'test-file', errorSignature: 'assertion' }),
      action({ tool: 'run_command', paramsHash: 'test-file', errorSignature: 'assertion' }),
      action({ tool: 'run_command', paramsHash: 'test-file', status: 'blocked' }),
      action({ tool: 'apply_edit', paramsHash: 'repair', paramsSummary: 'edit src/feature.ts', status: 'success' }),
    ];
    const verdict = detector.evaluate(actions, 'run_command', 'test-file', undefined);
    expect(verdict.allowed).toBe(true);
    expect(verdict.priorFailures).toEqual([]);
  });

  it('does not treat blocked attempts as additional failures', () => {
    const actions = [
      action({ tool: 'run_command', paramsHash: 'test-file', errorSignature: 'assertion' }),
      action({ tool: 'run_command', paramsHash: 'test-file', status: 'blocked' }),
    ];
    expect(detector.evaluate(actions, 'run_command', 'test-file', undefined).allowed).toBe(true);
  });

  it('does not let an explicit refresh bypass repeated read failures', () => {
    const actions = [
      action({ tool: 'read_file', paramsHash: 'missing-file', status: 'error', errorSignature: 'not-found' }),
      action({ tool: 'read_file', paramsHash: 'missing-file', status: 'error', errorSignature: 'not-found' }),
    ];
    expect(detector.evaluate(actions, 'read_file', 'missing-file', undefined, undefined, true).allowed).toBe(false);
  });

  it('blocks a third unchanged investigation read after two successful observations', () => {
    const actions = [
      action({ tool: 'read_file', paramsHash: 'read-region', paramsSummary: 'read src/game.ts', status: 'success', contextFingerprint: 'v1', observation: 'known code' }),
      action({ tool: 'read_file', paramsHash: 'read-region', paramsSummary: 'read src/game.ts', status: 'success', contextFingerprint: 'v1', observation: 'known code' }),
    ];
    const verdict = detector.evaluate(actions, 'read_file', 'read-region', undefined, 'v1');
    expect(verdict.allowed).toBe(false);
    expect(verdict.reason).toMatch(/exact read request already succeeded 2×/i);
  });

  it('offers one cached replay of unchanged investigation evidence before the hard block', () => {
    const actions = [
      action({ id: 'read-1', tool: 'read_file', paramsHash: 'read-region', paramsSummary: 'read src/game.ts', status: 'success', contextFingerprint: 'v1', observation: 'first observation' }),
      action({ id: 'read-2', tool: 'read_file', paramsHash: 'read-region', paramsSummary: 'read src/game.ts', status: 'success', contextFingerprint: 'v1', observation: 'second observation' }),
    ];

    expect(detector.reusableSuccessfulRead(actions, 'read_file', 'read-region', 'v1')?.id).toBe('read-2');

    actions.push(
      action({
        id: 'read-cache',
        tool: 'read_file',
        paramsHash: 'read-region',
        paramsSummary: 'read src/game.ts',
        status: 'success',
        contextFingerprint: 'v1',
        observation: `${CACHED_INVESTIGATION_PREFIX}: second observation`,
      }),
    );

    expect(detector.reusableSuccessfulRead(actions, 'read_file', 'read-region', 'v1')).toBeUndefined();
    expect(detector.evaluate(actions, 'read_file', 'read-region', undefined, 'v1').allowed).toBe(false);
  });

  it('allows a read when the file version or prior observation is unknown', () => {
    const actions = [
      action({ tool: 'read_file', paramsHash: 'read-region', status: 'success', contextFingerprint: 'v1', observation: 'old code' }),
      action({ tool: 'read_file', paramsHash: 'read-region', status: 'success', contextFingerprint: 'v1', observation: 'old code' }),
    ];
    expect(detector.evaluate(actions, 'read_file', 'read-region', undefined).allowed).toBe(true);
    expect(detector.evaluate(actions, 'read_file', 'read-region', undefined, 'v2').allowed).toBe(true);
    expect(detector.reusableSuccessfulRead(actions, 'read_file', 'read-region', 'v2')).toBeUndefined();
    actions.forEach((record) => { record.observation = undefined; });
    expect(detector.evaluate(actions, 'read_file', 'read-region', undefined, 'v1').allowed).toBe(true);
  });

  it('does not block successful search calls without a known source version', () => {
    const actions = [
      action({ tool: 'search_files', paramsHash: 'search', status: 'success', observation: 'one match' }),
      action({ tool: 'search_files', paramsHash: 'search', status: 'success', observation: 'one match' }),
    ];
    expect(detector.evaluate(actions, 'search_files', 'search', undefined).allowed).toBe(true);
    expect(detector.reusableSuccessfulRead(actions, 'search_files', 'search')).toBeUndefined();
  });

  it('allows a new targeted read after the investigation read budget is spent', () => {
    const actions = [
      action({ tool: 'run_command', paramsHash: 'failing-test', status: 'error', errorSignature: 'assertion' }),
      ...Array.from({ length: 10 }, (_, i) => action({ tool: 'search_files', paramsHash: `search-${i}`, status: 'success', observation: 'no matches' })),
      action({ tool: 'read_file', paramsHash: 'same-200-line-bucket', status: 'success', contextFingerprint: 'broad-request', observation: 'lines 1-40' }),
    ];
    const verdict = detector.evaluate(actions, 'read_file', 'same-200-line-bucket', undefined, 'targeted-request');
    expect(verdict.allowed).toBe(true);
    expect(verdict.priorFailures).toEqual([]);
  });

  it('does not recycle old loop-block messages as failures', () => {
    const actions = [
      action({ tool: 'read_file', paramsHash: 'read-region', status: 'error', observation: 'LOOP PREVENTION: action blocked. Previous attempts: ...' }),
      action({ tool: 'read_file', paramsHash: 'read-region', status: 'blocked', observation: 'LOOP PREVENTION: action blocked.' }),
    ];
    const verdict = detector.evaluate(actions, 'read_file', 'read-region', undefined, 'v1');
    expect(verdict.allowed).toBe(true);
    expect(verdict.priorFailures).toEqual([]);
  });

  it('allows the same file region to be read again after that file changes', () => {
    const actions = [
      action({ tool: 'read_file', paramsHash: 'read-region', paramsSummary: 'read src/game.ts', status: 'success' }),
      action({ tool: 'read_file', paramsHash: 'read-region', paramsSummary: 'read src/game.ts', status: 'success' }),
      action({ tool: 'apply_edit', paramsHash: 'edit-1', paramsSummary: 'edit src/game.ts', status: 'success' }),
    ];
    const verdict = detector.evaluate(actions, 'read_file', 'read-region', undefined);
    expect(verdict.allowed).toBe(true);
    expect(detector.reusableSuccessfulRead(actions, 'read_file', 'read-region')).toBeUndefined();
  });

  it('resets broader search evidence after any successful source edit', () => {
    const actions = [
      action({ tool: 'search_files', paramsHash: 'search-1', paramsSummary: 'search /pipe/ in src', status: 'success' }),
      action({ tool: 'search_files', paramsHash: 'search-1', paramsSummary: 'search /pipe/ in src', status: 'success' }),
      action({ tool: 'write_file', paramsHash: 'write-1', paramsSummary: 'write src/logic.ts', status: 'success' }),
    ];
    const verdict = detector.evaluate(actions, 'search_files', 'search-1', undefined);
    expect(verdict.allowed).toBe(true);
  });

  it('summarizes blocks with prior attempts', () => {
    const actions = [
      action({ tool: 'run_command', paramsHash: 'h1', errorSignature: 's', paramsSummary: '$ npm test' }),
      action({ tool: 'run_command', paramsHash: 'h1', errorSignature: 's', paramsSummary: '$ npm test' }),
    ];
    const verdict = detector.evaluate(actions, 'run_command', 'h1', 's');
    const summary = LoopDetector.summarizeBlock(verdict);
    expect(summary).toContain('LOOP PREVENTION');
    expect(summary).toContain('$ npm test');
  });
});

describe('read-thrift wiring (executor + LoopDetector)', () => {
  it('third identical unchanged read is a cached replay and a repeat of it is blocked', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gitu-read-thrift-'));
    try {
      fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: 'read-thrift-test' }));
      fs.writeFileSync(path.join(dir, 'note.txt'), 'stable content\n');
      const guard = ProjectGuard.detect(dir);
      const ledger = TaskLedger.create({ repoRoot: path.resolve(dir), goal: 'read thrift', project: guard.lock, mode: 'fast' });
      const executor = new Executor(guard, ledger, new PolicyEngine(true), new LoopDetector());
      const params = { path: 'note.txt' };

      const first = await executor.execute({ tool: 'read_file', params, reason: 'first look', expected: 'content' });
      const second = await executor.execute({ tool: 'read_file', params, reason: 'second look', expected: 'content' });
      const third = await executor.execute({ tool: 'read_file', params, reason: 'third look', expected: 'content' });
      const fourth = await executor.execute({ tool: 'read_file', params, reason: 'fourth look', expected: 'content' });

      // The first two requests execute for real; reads remain valid progress.
      expect(first.result.ok).toBe(true);
      expect(second.result.ok).toBe(true);
      // The third identical request for unchanged evidence is served from the
      // cached observation: non-fatal, no filesystem read, still progress.
      expect(third.result.ok).toBe(true);
      expect(third.result.output).toContain(CACHED_INVESTIGATION_PREFIX);
      // Only a repeat of the replay itself is hard-blocked as drift.
      expect(fourth.result.ok).toBe(false);
      expect(fourth.result.output).toContain('LOOP PREVENTION');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('allows one explicit fresh confirmation after an unchanged read is blocked', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gitu-read-refresh-'));
    try {
      fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: 'read-refresh-test' }));
      fs.writeFileSync(path.join(dir, 'note.txt'), 'stable content\n');
      const guard = ProjectGuard.detect(dir);
      const ledger = TaskLedger.create({ repoRoot: path.resolve(dir), goal: 'confirm file content', project: guard.lock, mode: 'fast' });
      const executor = new Executor(guard, ledger, new PolicyEngine(true), new LoopDetector());
      const req = { tool: 'read_file', params: { path: 'note.txt' }, reason: 'inspect', expected: 'content' };
      const refresh = { ...req, params: { path: 'note.txt', refresh: true }, reason: 'confirm the current content from disk' };

      await executor.execute(req);
      await executor.execute(req);
      expect((await executor.execute(req)).result.output).toContain(CACHED_INVESTIGATION_PREFIX);
      expect((await executor.execute(req)).blockedByLoop).toBeTruthy();

      const confirmed = await executor.execute(refresh);
      expect(confirmed.result.ok).toBe(true);
      expect(confirmed.result.output).toContain('stable content');
      expect(confirmed.result.output).not.toContain(CACHED_INVESTIGATION_PREFIX);
      expect(confirmed.record.readRefresh).toBe(true);
      expect((await executor.execute(refresh)).blockedByLoop).toBeTruthy();
      expect((await executor.execute({ ...refresh, params: { path: './note.txt', refresh: true, offset: 1, limit: 2000, maxChars: 30_000, nonce: 'new spelling' } })).blockedByLoop).toBeTruthy();

      const verification = await executor.execute({ tool: 'run_command', params: { command: 'node -e "process.exit(0)"' }, reason: 'verify', expected: 'passes' });
      expect(verification.result.ok).toBe(true);
      const reconfirmed = await executor.execute(refresh);
      expect(reconfirmed.result.ok).toBe(true);
      expect(reconfirmed.result.output).not.toContain(CACHED_INVESTIGATION_PREFIX);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('bounds refreshes even when the saved read observation was truncated', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gitu-read-refresh-long-'));
    try {
      fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: 'read-refresh-long-test' }));
      fs.writeFileSync(path.join(dir, 'note.txt'), 'long content\n'.repeat(150));
      const guard = ProjectGuard.detect(dir);
      const ledger = TaskLedger.create({ repoRoot: path.resolve(dir), goal: 'confirm long file', project: guard.lock, mode: 'fast' });
      const executor = new Executor(guard, ledger, new PolicyEngine(true), new LoopDetector());
      const refresh = { tool: 'read_file', params: { path: 'note.txt', refresh: true }, reason: 'confirm long content', expected: 'current bytes' };

      const first = await executor.execute(refresh);
      const second = await executor.execute(refresh);
      expect(first.record.readObservationComplete).toBe(false);
      expect(first.record.contextFingerprint).toBeTruthy();
      expect(first.result.ok).toBe(true);
      expect(second.blockedByLoop).toBeTruthy();
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('reads line 150 after a broad truncated read in the same hash bucket', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gitu-read-region-'));
    try {
      fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: 'read-region-test' }));
      fs.writeFileSync(path.join(dir, 'types.ts'), Array.from({ length: 220 }, (_, i) => i === 149 ? 'export interface Manifest { signature: string }' : `// contract line ${i + 1} with enough context to make a broad read long`).join('\n'));
      const guard = ProjectGuard.detect(dir);
      const ledger = TaskLedger.create({ repoRoot: path.resolve(dir), goal: 'inspect manifest contract', project: guard.lock, mode: 'fast' });
      const executor = new Executor(guard, ledger, new PolicyEngine(true), new LoopDetector());
      const broad = { tool: 'read_file', params: { path: 'types.ts', offset: 1, limit: 200 }, reason: 'orient', expected: 'file context' };
      const narrow = { tool: 'read_file', params: { path: 'types.ts', offset: 145, limit: 12 }, reason: 'confirm manifest fields', expected: 'exact fields' };

      expect(await executor.execute(broad)).toMatchObject({ result: { ok: true } });
      expect(await executor.execute(broad)).toMatchObject({ result: { ok: true } });
      const targeted = await executor.execute(narrow);

      expect(targeted.result.ok).toBe(true);
      expect(targeted.result.output).toContain('150: export interface Manifest { signature: string }');
      expect(targeted.result.output).not.toContain(CACHED_INVESTIGATION_PREFIX);
      expect(targeted.blockedByLoop).toBeUndefined();
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('rereads a file changed outside the executor instead of replaying stale context', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gitu-read-change-'));
    try {
      fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: 'read-change-test' }));
      const file = path.join(dir, 'note.txt');
      fs.writeFileSync(file, 'old content\n');
      const guard = ProjectGuard.detect(dir);
      const ledger = TaskLedger.create({ repoRoot: path.resolve(dir), goal: 'read changed file', project: guard.lock, mode: 'fast' });
      const executor = new Executor(guard, ledger, new PolicyEngine(true), new LoopDetector());
      const req = { tool: 'read_file', params: { path: 'note.txt' }, reason: 'inspect', expected: 'current content' };

      await executor.execute(req);
      await executor.execute(req);
      fs.writeFileSync(file, 'new and longer content\n');
      const changed = await executor.execute(req);

      expect(changed.result.ok).toBe(true);
      expect(changed.result.output).toContain('new and longer content');
      expect(changed.result.output).not.toContain(CACHED_INVESTIGATION_PREFIX);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('command outcome wiring (executor + LoopDetector)', () => {
  it('allows the same command after a failure followed by two passes', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gitu-command-loop-'));
    try {
      fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: 'command-loop-test' }));
      const guard = ProjectGuard.detect(dir);
      const ledger = TaskLedger.create({ repoRoot: path.resolve(dir), goal: 'verify flaky command', project: guard.lock, mode: 'fast' });
      const executor = new Executor(guard, ledger, new PolicyEngine(true), new LoopDetector());
      const params = { command: `node -e "const fs = require('fs'); if (!fs.existsSync('marker')) { fs.writeFileSync('marker', 'ok'); process.exit(1); }"` };

      const first = await executor.execute({ tool: 'run_command', params, reason: 'verify', expected: 'passes' });
      const second = await executor.execute({ tool: 'run_command', params, reason: 'verify', expected: 'passes' });
      const third = await executor.execute({ tool: 'run_command', params, reason: 'verify', expected: 'passes' });
      const fourth = await executor.execute({ tool: 'run_command', params, reason: 'verify', expected: 'passes' });

      expect([first.result.ok, second.result.ok, third.result.ok, fourth.result.ok]).toEqual([false, true, true, true]);
      expect(ledger.data.actions.map((record) => record.status)).toEqual(['error', 'success', 'success', 'success']);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('releases a blocked failing command after a successful source edit', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gitu-command-repair-'));
    try {
      fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: 'command-repair-test' }));
      const guard = ProjectGuard.detect(dir);
      const ledger = TaskLedger.create({ repoRoot: path.resolve(dir), goal: 'repair then verify', project: guard.lock, mode: 'fast' });
      const executor = new Executor(guard, ledger, new PolicyEngine(true), new LoopDetector());
      const req = { tool: 'run_command', params: { command: 'node -e "process.exit(1)"' }, reason: 'verify', expected: 'passes' };

      await executor.execute(req);
      await executor.execute(req);
      const blocked = await executor.execute(req);
      const edit = await executor.execute({ tool: 'write_file', params: { path: 'feature.ts', content: 'export const repaired = true;\n' }, reason: 'repair', expected: 'written' });
      const afterEdit = await executor.execute(req);

      expect(blocked.blockedByLoop).toBeTruthy();
      expect(edit.result.ok).toBe(true);
      expect(afterEdit.record.status).toBe('error');
      expect(afterEdit.blockedByLoop).toBeUndefined();
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
