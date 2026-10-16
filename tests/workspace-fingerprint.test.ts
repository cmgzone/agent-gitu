import { mkdtempSync, mkdirSync, writeFileSync, utimesSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { getWorkspaceFingerprint, gitExec } from '../src/git/git.js';

describe('workspace fingerprint coverage', () => {
  it('reports complete scan coverage on cold and cached runs and detects a restored-mtime edit', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'gitu-fingerprint-cache-'));
    const file = path.join(dir, 'source.txt');
    writeFileSync(file, 'before');
    const stamp = statSync(file).mtime;
    const progress: number[][] = [];
    const before = await getWorkspaceFingerprint(dir, { onProgress: (checked, total) => progress.push([checked, total]) });
    expect(progress[0]).toEqual([0, 1]);
    expect(progress.at(-1)).toEqual([1, 1]);
    expect(await getWorkspaceFingerprint(dir)).toBe(before);
    writeFileSync(file, 'after!');
    utimesSync(file, stamp, stamp);
    expect(await getWorkspaceFingerprint(dir)).not.toBe(before);
  });

  it('propagates cancellation during a scan instead of returning a partial proof', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'gitu-fingerprint-cancel-'));
    writeFileSync(path.join(dir, 'source.txt'), 'source');
    const controller = new AbortController();
    await expect(getWorkspaceFingerprint(dir, {
      signal: controller.signal,
      onProgress: () => controller.abort(),
    })).rejects.toMatchObject({ name: 'AbortError' });
    await expect(getWorkspaceFingerprint(dir, { signal: controller.signal })).rejects.toMatchObject({ name: 'AbortError' });
  });

  it.each([false, true])(
    'ignores timestamps and identical rewrites but detects same-size edits (git=%s)',
    async (git) => {
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
    },
    30000,
  );

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

  it.each([false, true])(
    'detects edits beyond the old file-count ceilings (git=%s)',
    async (git) => {
      const dir = mkdtempSync(path.join(tmpdir(), 'gitu-partial-fingerprint-'));
      if (git) await gitExec(dir, ['init', '-q']);
      for (let i = 0; i < 5001; i++) writeFileSync(path.join(dir, `file-${String(i).padStart(5, '0')}.txt`), '');
      const before = await getWorkspaceFingerprint(dir);
      expect(before).not.toMatch(/^partial-/);
      writeFileSync(path.join(dir, 'file-05000.txt'), 'changed beyond the former ceiling');
      expect(await getWorkspaceFingerprint(dir)).not.toBe(before);
    },
    60000,
  );

  it('detects edits beyond the old non-Git depth ceiling', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'gitu-deep-fingerprint-'));
    const nested = path.join(dir, ...Array.from({ length: 14 }, (_, i) => `level-${i}`));
    mkdirSync(nested, { recursive: true });
    writeFileSync(path.join(nested, 'index.html'), 'deep source');
    const before = await getWorkspaceFingerprint(dir);
    expect(before).not.toMatch(/^partial-/);
    writeFileSync(path.join(nested, 'index.html'), 'deep changed source');
    expect(await getWorkspaceFingerprint(dir)).not.toBe(before);
  });

  it('recognizes a selected subfolder inside a repository and limits its proof to that folder', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'gitu-nested-fingerprint-'));
    await gitExec(dir, ['init', '-q']);
    const nested = path.join(dir, 'selected');
    mkdirSync(nested);
    writeFileSync(path.join(nested, 'source.txt'), 'before');
    writeFileSync(path.join(dir, 'outside.txt'), 'outside before');
    const before = await getWorkspaceFingerprint(nested);
    writeFileSync(path.join(dir, 'outside.txt'), 'outside after');
    expect(await getWorkspaceFingerprint(nested)).toBe(before);
    writeFileSync(path.join(nested, 'source.txt'), 'after');
    expect(await getWorkspaceFingerprint(nested)).not.toBe(before);
  });
});
