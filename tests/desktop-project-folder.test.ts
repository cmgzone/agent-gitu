import { createRequire } from 'node:module';
import { mkdtempSync, writeFileSync, rmSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { it, expect, vi } from 'vitest';

const { registerProjectFolder } = createRequire(import.meta.url)('../desktop/project-folder.cjs');

it('opens directories only from the trusted main frame and handles missing or rejected folders', async () => {
  const root = mkdtempSync(path.join(tmpdir(), 'gitu-folder-bridge-'));
  try {
    let handler!: (event: unknown, folder: unknown) => Promise<{ ok: boolean }>;
    const mainFrame = { url: 'http://127.0.0.1:8344/' }, openPath = vi.fn(async () => '');
    const contents = { isDestroyed: () => false, mainFrame, ipc: { handle: (_channel: string, callback: typeof handler) => { handler = callback; } } };
    registerProjectFolder(contents, 'http://127.0.0.1:8344', openPath);
    expect((await handler({ senderFrame: mainFrame }, root)).ok).toBe(true);
    expect(openPath).toHaveBeenCalledWith(realpathSync(root));
    const file = path.join(root, 'file.exe'); writeFileSync(file, 'fixture');
    for (const value of [file, path.join(root, 'missing'), 'relative', 'https://example.com', null, root + '\0']) {
      expect((await handler({ senderFrame: mainFrame }, value)).ok).toBe(false);
    }
    expect((await handler({ senderFrame: { url: mainFrame.url } }, root)).ok).toBe(false);
    mainFrame.url = 'https://example.com';
    expect((await handler({ senderFrame: mainFrame }, root)).ok).toBe(false);
    expect(openPath).toHaveBeenCalledOnce();
    mainFrame.url = 'http://127.0.0.1:8344/';openPath.mockResolvedValue('OS error');
    expect((await handler({ senderFrame: mainFrame }, root)).ok).toBe(false);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
