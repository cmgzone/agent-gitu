import { mkdtempSync, mkdirSync, writeFileSync, utimesSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { getWorkspaceFingerprint, gitExec } from '../src/git/git.js';

describe('workspace fingerprint coverage', () => {
  it.each([false, true])('ignores timestamps and identical rewrites but detects same-size edits (git=%s)', async (git) => {
    const dir = mkdtempSync(path.join(tmpdir(), 'gitu-content-fingerprint-'));
    if (git) await gitExec(dir, ['init', '-q']);
    for (const size of [100, 300_000]) {
      const file = path.join(dir, `source-${size}.txt`);
      const original = 'a'.repeat(size);
      writeFileSync(file, original);
      const before = await getWorkspaceFingerprint(dir);
      const timestamp = statSync(file).mtime;
      utimesSync(file, new Date(0), new Date(0));
      expect(await getWorkspaceFingerprint(dir)).toBe(before);
      writeFileSync(file, original);
      expect(await getWorkspaceFingerprint(dir)).toBe(before);
      writeFileSync(file, 'b'.repeat(size));
      utimesSync(file, timestamp, timestamp);
      expect(await getWorkspaceFingerprint(dir)).not.toBe(before);
      writeFileSync(file, original);
      expect(await getWorkspaceFingerprint(dir)).toBe(before);
    }
  }, 30000);

  it('preserves proof through staging, commits, and ignored generated files', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'gitu-commit-fingerprint-'));
    await gitExec(dir, ['init', '-q']);
    writeFileSync(path.join(dir, '.gitignore'), 'generated/\n');
    writeFileSync(path.join(dir, 'source.txt'), 'verified source');
    const before = await getWorkspaceFingerprint(dir);
    await gitExec(dir, ['add', '.']);
    expect(await getWorkspaceFingerprint(dir)).toBe(before);
    await gitExec(dir, ['-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', '-c', 'commit.gpgsign=false', 'commit', '-qm', 'Checkpoint']);
    mkdirSync(path.join(dir, 'generated'));
    writeFileSync(path.join(dir, 'generated', 'output.txt'), 'build result');
    expect(await getWorkspaceFingerprint(dir)).toBe(before);
  }, 30000);

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
