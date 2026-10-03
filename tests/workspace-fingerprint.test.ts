import { mkdtempSync, mkdirSync, writeFileSync, utimesSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { getWorkspaceFingerprint, gitExec } from '../src/git/git.js';

describe('workspace fingerprint coverage', () => {
  it('detects edits to large files in a real Git workspace', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'gitu-large-fingerprint-'));
    await gitExec(dir, ['init', '-q']);
    const file = path.join(dir, 'large.html');
    writeFileSync(file, 'a'.repeat(300_000));
    const before = await getWorkspaceFingerprint(dir);
    expect(await getWorkspaceFingerprint(dir)).toBe(before);
    writeFileSync(file, 'b'.repeat(300_000));
    const changedTime = new Date(Date.now() + 2000);
    utimesSync(file, changedTime, changedTime);
    expect(await getWorkspaceFingerprint(dir)).not.toBe(before);
  }, 30000);

  it('marks a Git scan that exceeds its file budget as partial', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'gitu-partial-fingerprint-'));
    await gitExec(dir, ['init', '-q']);
    for (let i = 0; i < 4001; i++) writeFileSync(path.join(dir, `file-${i}.txt`), '');
    expect(await getWorkspaceFingerprint(dir)).toMatch(/^partial-/);
  }, 60000);

  it('marks a non-Git scan that exceeds its depth budget as partial', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'gitu-deep-fingerprint-'));
    const nested = path.join(dir, ...Array.from({ length: 14 }, (_, i) => `level-${i}`));
    mkdirSync(nested, { recursive: true });
    writeFileSync(path.join(nested, 'index.html'), 'deep source');
    expect(await getWorkspaceFingerprint(dir)).toMatch(/^partial-/);
  });
});
