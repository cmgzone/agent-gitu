import { createRequire } from 'node:module';
import { createContext, Script } from 'node:vm';
import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';

const { registerAppSignIn } = createRequire(import.meta.url)('../desktop/app-sign-in.cjs');
describe('desktop app sign-in', () => {
  it('opens Composio in the system browser only from the trusted main frame', async () => {
    let handler!: (event: unknown, url: string) => Promise<boolean>;
    const mainFrame = { url: 'http://127.0.0.1:8344/' }, openExternal = vi.fn(async () => {});
    const contents = { isDestroyed: () => false, mainFrame, ipc: { handle: (_channel: string, callback: typeof handler) => { handler = callback; } } };
    registerAppSignIn(contents, 'http://127.0.0.1:8344', openExternal);
    expect(await handler({ senderFrame: mainFrame }, 'https://connect.composio.dev/link')).toBe(true);
    expect(openExternal).toHaveBeenCalledOnce();
    for (const url of ['file:///C:/secret', 'http://connect.composio.dev/link', 'https://evil.example', 'https://connect.composio.dev.evil.example/link', 'https://secret@connect.composio.dev/link']) {
      expect(await handler({ senderFrame: mainFrame }, url)).toBe(false);
    }
    expect(await handler({ senderFrame: { url: mainFrame.url } }, 'https://connect.composio.dev/link')).toBe(false);
    mainFrame.url = 'https://example.com';
    expect(await handler({ senderFrame: mainFrame }, 'https://connect.composio.dev/link')).toBe(false);
    expect(openExternal).toHaveBeenCalledOnce();
  });
  it('exposes only the narrow sign-in bridge in preload', async () => {
    let exposed!: { openAppSignIn: (url: string) => Promise<boolean> };
    const invoke = vi.fn(async () => true);
    new Script(readFileSync(new URL('../desktop/preload.cjs', import.meta.url), 'utf8')).runInContext(createContext({
      require: () => ({ contextBridge: { exposeInMainWorld: (_name: string, value: typeof exposed) => { exposed = value; } }, ipcRenderer: { invoke } }),
      window: { addEventListener: vi.fn() },
    }));
    expect(Object.keys(exposed)).toEqual(['openAppSignIn']);
    expect(await exposed.openAppSignIn('https://connect.composio.dev/link')).toBe(true);
    expect(invoke).toHaveBeenCalledWith('gitu:open-app-sign-in', 'https://connect.composio.dev/link');
  });
});
