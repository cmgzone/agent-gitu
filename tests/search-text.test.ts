import { mkdtempSync, truncateSync, unlinkSync, writeFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { readSearchText } from '../src/tools/search-text.js';

vi.mock('node:fs/promises', async importOriginal => {
  const original = await importOriginal<typeof import('node:fs/promises')>();
  return { ...original, readFile: vi.fn(original.readFile) };
});

describe('search binary preflight', () => {
  it('rejects a large executable from its header without loading its full body', async () => {
    const file = path.join(mkdtempSync(path.join(tmpdir(), 'gitu-search-binary-')), 'mail.exe');
    writeFileSync(file, Buffer.from('MZ\0binary package'));
    truncateSync(file, 240 * 1024 * 1024);
    try {
      vi.mocked(readFile).mockClear();
      expect(await readSearchText(file)).toBeUndefined();
      expect(readFile).not.toHaveBeenCalled();
    } finally { unlinkSync(file); }
  });

  it('reads all text beyond the probe and detects later binary content', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'gitu-search-text-'));
    const file = path.join(dir, 'source.txt');
    const content = 'text context '.repeat(3000) + 'requested match at the end';
    writeFileSync(file, content);
    expect(await readSearchText(file)).toBe(content);
    writeFileSync(file, content + '\0binary suffix');
    expect(await readSearchText(file)).toBeUndefined();
  });

  it('rejects an already cancelled search before opening its input', async () => {
    const controller = new AbortController();
    controller.abort();
    vi.mocked(readFile).mockClear();
    await expect(readSearchText('does-not-exist.exe', controller.signal)).rejects.toThrow();
    expect(readFile).not.toHaveBeenCalled();
  });
});
