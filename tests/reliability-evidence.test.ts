import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { EvidenceEngine } from '../src/evidence/evidence.js';
import { getWorkspaceFingerprint, gitExec } from '../src/git/git.js';
import type { TaskLedgerData } from '../src/types.js';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function emptyLedger(): TaskLedgerData {
  const now = new Date().toISOString();
  return {
    schemaVersion: 1,
    taskId: 't',
    goal: 'g',
    status: 'executing',
    mode: 'standard',
    project: {
      name: 'p',
      repoRoot: '/x',
      techStack: [],
      entrypoints: [],
      ignorePaths: [],
      lockedAt: now,
    },
    acceptanceCriteria: EvidenceEngine.criteriaFromTexts(['tests pass']),
    constraints: [],
    nonGoals: [],
    plan: [],
    actions: [],
    evidence: [],
    filesChanged: [],
    checkpoints: [],
    blockers: [],
    createdAt: now,
    updatedAt: now,
  };
}

async function makeGitProject(): Promise<string> {
  const dir = mkdtempSync(path.join(tmpdir(), 'hermes-revid-'));
  writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: 'revid-test' }));
  await gitExec(dir, ['init']);
  await gitExec(dir, ['add', '-A']);
  await gitExec(dir, ['-c', 'user.name=revid', '-c', 'user.email=revid@test.local', 'commit', '-m', 'initial']);
  return dir;
}

  describe('workspace fingerprint — composite of git state', () => {
    it('changes when content changes, but survives staging/checkpoint commits', async () => {
      const dir = await makeGitProject();
      const fp1 = await getWorkspaceFingerprint(dir);
      expect(fp1).not.toBe('non-git-repo');

      await sleep(15);
      writeFileSync(path.join(dir, 'src.txt'), 'new untracked content');
      const fp2 = await getWorkspaceFingerprint(dir);
      expect(fp2).not.toBe(fp1);

      // Staging alone must NOT invalidate evidence.
      await gitExec(dir, ['add', '-A']);
      const fp2b = await getWorkspaceFingerprint(dir);
      expect(fp2b).toBe(fp2);

      // Checkpoint commits move git bookkeeping but not worktree CONTENT:
      // evidence recorded mid-run stays valid across them (documented
      // contract). The old dirty-file-only hash collapsed to a constant on a
      // clean tree, falsely staling exactly these runs — and letting
      // 'clean-tree'-stamped evidence stay fresh across later edit+commit
      // cycles. Content-based fingerprints close both holes.
      await gitExec(dir, ['-c', 'user.name=revid', '-c', 'user.email=revid@test.local', 'commit', '-m', 'second']);
      const fp3 = await getWorkspaceFingerprint(dir);
      expect(fp3).toBe(fp2);

      // A REAL content change after the commit is still detected.
      writeFileSync(path.join(dir, 'src.txt'), 'changed again after commit');
      const fp4 = await getWorkspaceFingerprint(dir);
      expect(fp4).not.toBe(fp3);
    });

  it('is deterministic for an unchanged workspace', async () => {
    const dir = await makeGitProject();
    const fp1 = await getWorkspaceFingerprint(dir);
    const fp2 = await getWorkspaceFingerprint(dir);
    expect(fp1).toBe(fp2);
  });
});

describe('EvidenceEngine — fingerprint-based staleness', () => {
  it('records the workspace fingerprint on evidence', () => {
    const engine = new EvidenceEngine();
    const ledger = emptyLedger();
    const ev = engine.record(ledger, {
      kind: 'command',
      label: 'node --version',
      command: 'node --version',
      exitCode: 0,
      passed: true,
      output: 'ok',
      workspaceFingerprint: 'fp-1234',
    });
    expect(ev.workspaceFingerprint).toBe('fp-1234');
    expect(ev.stale).toBe(false);
  });

  it('keeps evidence valid while the workspace is unchanged', () => {
    const engine = new EvidenceEngine();
    const ledger = emptyLedger();
    const ev = engine.record(ledger, { kind: 'test', label: 'npm test', passed: true, output: 'ok', workspaceFingerprint: 'fp-1' });
    const claim = engine.link(ledger, 'ac-1', ev.id, 'fp-1');
    expect(claim.ok).toBe(true);
    expect(ev.stale).toBe(false);
    expect(engine.gate(ledger, 'fp-1').open).toBe(true);
  });

  it('marks evidence stale and rejects link() when the workspace changed after the test ran', () => {
    const engine = new EvidenceEngine();
    const ledger = emptyLedger();
    const ev = engine.record(ledger, { kind: 'test', label: 'npm test', passed: true, output: 'ok', workspaceFingerprint: 'fp-1' });
    const claim = engine.link(ledger, 'ac-1', ev.id, 'fp-2');
    expect(claim.ok).toBe(false);
    expect(claim.reason).toContain('stale');
    expect(ev.stale).toBe(true);
    expect(ledger.acceptanceCriteria[0]!.satisfied).toBe(false);
  });

  it('closes the gate() for stale evidence and reports it explicitly', () => {
    const engine = new EvidenceEngine();
    const ledger = emptyLedger();
    const ev = engine.record(ledger, { kind: 'test', label: 'npm test', passed: true, output: 'ok', workspaceFingerprint: 'fp-1' });
    engine.link(ledger, 'ac-1', ev.id, 'fp-1');
    expect(engine.gate(ledger, 'fp-1').open).toBe(true);

    const gate = engine.gate(ledger, 'fp-2');
    expect(gate.open).toBe(false);
    expect(gate.missing[0]).toContain('[STALE EVIDENCE]');
    expect(ev.stale).toBe(true);
  });

  it('reopens the gate after re-running verification on the new workspace state', () => {
    const engine = new EvidenceEngine();
    const ledger = emptyLedger();

    // First verification run on fp-1: gate opens.
    const ev1 = engine.record(ledger, { kind: 'test', label: 'npm test', passed: true, output: 'ok', workspaceFingerprint: 'fp-1' });
    expect(engine.link(ledger, 'ac-1', ev1.id, 'fp-1').ok).toBe(true);
    expect(engine.gate(ledger, 'fp-1').open).toBe(true);

    // The workspace changed: old evidence is stale, gate closes.
    expect(engine.gate(ledger, 'fp-2').open).toBe(false);

    // Re-run verification on fp-2: fresh evidence re-opens the gate.
    const ev2 = engine.record(ledger, { kind: 'test', label: 'npm test', passed: true, output: 'ok', workspaceFingerprint: 'fp-2' });
    expect(engine.link(ledger, 'ac-1', ev2.id, 'fp-2').ok).toBe(true);
    expect(engine.gate(ledger, 'fp-2').open).toBe(true);
  });

  it('proves the mechanism is the fingerprint, not a trivial-command blacklist', async () => {
    // `node --version` is NOT in the no-op command blacklist, so the only
    // thing that can invalidate this evidence is the workspace fingerprint.
    const dir = await makeGitProject();
    const fpBefore = await getWorkspaceFingerprint(dir);

    const engine = new EvidenceEngine();
    const ledger = emptyLedger();
    const ev = engine.record(ledger, {
      kind: 'command',
      label: 'node --version',
      command: 'node --version',
      exitCode: 0,
      passed: true,
      output: 'v20.0.0',
      workspaceFingerprint: fpBefore,
    });

    // Same command, same workspace: valid.
    const claim = engine.link(ledger, 'ac-1', ev.id, fpBefore);
    expect(claim.ok).toBe(true);
    expect(engine.gate(ledger, fpBefore).open).toBe(true);

    // The command text never changes, but the workspace does: the evidence
    // must be rejected purely because the fingerprint no longer matches.
    await sleep(15);
    writeFileSync(path.join(dir, 'touched.txt'), 'edited after the test ran');
    const fpAfter = await getWorkspaceFingerprint(dir);
    expect(fpAfter).not.toBe(fpBefore);

    const staleClaim = engine.link(ledger, 'ac-1', ev.id, fpAfter);
    expect(staleClaim.ok).toBe(false);
    expect(staleClaim.reason).toContain('stale');
    expect(ev.stale).toBe(true);
    expect(engine.gate(ledger, fpAfter).open).toBe(false);
  });
});
