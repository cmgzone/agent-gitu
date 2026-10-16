import { afterEach, describe, expect, it } from 'vitest';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { bindCriterionVerification, inspectVerificationCommand } from '../src/evidence/verification-command.js';
import type { AcceptanceCriterion } from '../src/types.js';

const folders: string[] = [];
afterEach(() => {
  for (const folder of folders.splice(0)) rmSync(folder, { recursive: true, force: true });
});
function fixture(): string {
  const root = mkdtempSync(path.join(tmpdir(), 'gitu-verification-command-'));
  folders.push(root);
  writeFileSync(path.join(root, 'regression-test.cjs'), 'require("node:assert/strict").equal(1, 1);\n');
  writeFileSync(path.join(root, 'file with spaces.cjs'), 'module.exports = 1;\n');
  return root;
}

describe('acceptance verification is executable metadata, not prose', () => {
  it.each([
    'Focused automated regression test command for thread-search; repository typecheck where supported.',
    'Focused regression test plus source-level verification of separate search subscription and inbox path.',
    'Run available test/typecheck/build commands and record outputs.',
  ])('does not resolve the observed descriptive verification: %s', async (command) => {
    expect((await inspectVerificationCommand(command, fixture())).ok).toBe(false);
  });

  it('resolves commands without running them, including project-specific scripts', async () => {
    const root = fixture();
    const marker = path.join(root, 'unexpected.txt');
    writeFileSync(path.join(root, 'danger.cjs'), "require('node:fs').writeFileSync('unexpected.txt','executed');\n");
    expect((await inspectVerificationCommand('node danger.cjs', root)).ok).toBe(true);
    expect(existsSync(marker)).toBe(false);
    const windows = process.platform === 'win32';
    writeFileSync(
      path.join(root, windows ? 'custom-verify.cmd' : 'custom-verify.sh'),
      windows ? '@echo executed>unexpected.txt\r\n' : '#!/bin/sh\necho executed >unexpected.txt\n',
      { mode: 0o755 },
    );
    expect((await inspectVerificationCommand(windows ? '.\\custom-verify.cmd' : './custom-verify.sh', root)).ok).toBe(true);
    expect(existsSync(marker)).toBe(false);
  });

  it('resolves quoted paths and compound shell commands without executing them', async () => {
    const root = fixture();
    const command = process.platform === 'win32' ? "Set-Location .; node --check 'file with spaces.cjs'" : "cd . && node --check 'file with spaces.cjs'";
    expect((await inspectVerificationCommand(command, root)).ok).toBe(true);
  });

  it('binds a real command without replacing the requirement or claiming success', async () => {
    const criterion: AcceptanceCriterion = {
      id: 'ac-1',
      text: 'Search-specific regression passes',
      verification: 'Run focused tests and record outputs.',
      evidenceType: 'test_success',
      satisfied: false,
      evidenceIds: [],
    };
    expect((await bindCriterionVerification(criterion, 'node regression-test.cjs', fixture())).ok).toBe(true);
    expect(criterion).toMatchObject({
      text: 'Search-specific regression passes',
      evidenceType: 'test_success',
      verification: 'node regression-test.cjs',
      verificationInstructions: 'Run focused tests and record outputs.',
      satisfied: false,
      evidenceIds: [],
    });
  });

  it('rejects replacing a valid pinned command with a weaker check', async () => {
    const criterion: AcceptanceCriterion = { id: 'ac-1', text: 'Regression passes', verification: 'node regression-test.cjs', satisfied: false, evidenceIds: [] };
    expect((await bindCriterionVerification(criterion, 'node --version', fixture())).ok).toBe(false);
    expect(criterion.verification).toBe('node regression-test.cjs');
  });

  it('repairs a missing script and audits a justified replacement without satisfying it', async () => {
    const root = fixture();
    const criterion: AcceptanceCriterion = { id: 'ac-1', text: 'Regression passes', verification: 'node missing.cjs', satisfied: true, evidenceIds: ['old'] };
    expect((await inspectVerificationCommand(criterion.verification!, root)).ok).toBe(false);
    expect((await bindCriterionVerification(criterion, 'node regression-test.cjs', root)).ok).toBe(true);
    expect(criterion.satisfied).toBe(false);
    expect(criterion.evidenceIds).toEqual([]);
    expect((await bindCriterionVerification(criterion, 'node --check regression-test.cjs', root, undefined, { replacementReason: 'The requirement is syntax-only; use the runtime syntax checker.' })).ok).toBe(true);
    expect(criterion.verificationHistory).toHaveLength(2);
  });

  it('preserves user-pinned commands and evidence types even with a replacement reason', async () => {
    const root = fixture();
    const criterion: AcceptanceCriterion = { id: 'ac-1', text: 'Regression passes', verification: 'node regression-test.cjs', satisfied: false, evidenceIds: [], evidenceType: 'test_success' };
    expect((await bindCriterionVerification(criterion, 'node --version', root, undefined, { replacementReason: 'Use a different check.' })).ok).toBe(false);
    expect((await bindCriterionVerification(criterion, 'node --check "file with spaces.cjs"', root, undefined, { replacementReason: 'Use syntax only.' })).ok).toBe(false);
    expect((await bindCriterionVerification(criterion, 'node missing.cjs', root, undefined, { replacementReason: 'Use another test.', userPinned: true })).ok).toBe(false);
    expect(criterion.verification).toBe('node regression-test.cjs');
  });
});
