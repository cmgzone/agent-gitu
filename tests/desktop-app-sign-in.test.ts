import { createRequire } from 'node:module';
import { createContext, Script } from 'node:vm';
import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';

const { registerAppSignIn, registerAuthBrowser } = createRequire(import.meta.url)('../desktop/app-sign-in.cjs');
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
  it('exposes only the named sign-in and directory bridges in preload', async () => {
    let exposed!: { openAppSignIn: (url: string) => Promise<boolean>; openAuthBrowser: (url: string) => Promise<boolean> };
    const invoke = vi.fn(async () => true);
    new Script(readFileSync(new URL('../desktop/preload.cjs', import.meta.url), 'utf8')).runInContext(createContext({
      require: () => ({ contextBridge: { exposeInMainWorld: (_name: string, value: typeof exposed) => { exposed = value; } }, ipcRenderer: { invoke } }),
      window: { addEventListener: vi.fn() },
    }));
    expect(Object.keys(exposed)).toEqual(['openProjectFolder','openAppSignIn','openAuthBrowser','phoneAccess','allowPhoneAccess','cloudAgent']);
    expect(await exposed.openAppSignIn('https://connect.composio.dev/link')).toBe(true);
    expect(invoke).toHaveBeenCalledWith('gitu:open-app-sign-in', 'https://connect.composio.dev/link');
    expect(await exposed.openAuthBrowser('http://127.0.0.1:8344/auth/pikrouter/start')).toBe(true);
    expect(invoke).toHaveBeenCalledWith('gitu:open-auth-browser', 'http://127.0.0.1:8344/auth/pikrouter/start');
  });

  it('opens only the app-owned Pikpam OAuth start in the system browser', async () => {
    let handler!: (event: unknown, url: string) => Promise<boolean>;
    const mainFrame = { url: 'http://127.0.0.1:8344/' }, openExternal = vi.fn(async () => {});
    const contents = { isDestroyed: () => false, mainFrame, ipc: { handle: (_channel: string, callback: typeof handler) => { handler = callback; } } };
    registerAuthBrowser(contents, 'http://127.0.0.1:8344', openExternal);
    expect(await handler({ senderFrame: mainFrame }, 'http://127.0.0.1:8344/auth/pikrouter/start')).toBe(true);
    expect(openExternal).toHaveBeenCalledWith('http://127.0.0.1:8344/auth/pikrouter/start');
    for (const url of [
      'http://127.0.0.1:8344/auth/pikrouter/start?next=https://evil.example',
      'http://127.0.0.1:8344/auth/pikrouter/start/extra',
      'http://127.0.0.1:8344/auth',
      'http://127.0.0.1:8345/auth/pikrouter/start',
      'https://evil.example/auth/pikrouter/start',
      'file:///C:/secret',
      'http://user:pass@127.0.0.1:8344/auth/pikrouter/start',
    ]) {
      expect(await handler({ senderFrame: mainFrame }, url)).toBe(false);
    }
    expect(await handler({ senderFrame: { url: mainFrame.url } }, 'http://127.0.0.1:8344/auth/pikrouter/start')).toBe(false);
    mainFrame.url = 'https://evil.example/';
    expect(await handler({ senderFrame: mainFrame }, 'https://evil.example/auth/pikrouter/start')).toBe(false);
    expect(openExternal).toHaveBeenCalledOnce();
  });

  it('supports an origin predicate in registerAppSignIn for Cloud Agent origins', async () => {
    let handler!: (event: unknown, url: string) => Promise<boolean>;
    const mainFrame = { url: 'https://alex.gitu.app/' };
    const openExternal = vi.fn(async () => {});
    const contents = { isDestroyed: () => false, mainFrame, ipc: { handle: (_channel: string, callback: typeof handler) => { handler = callback; } } };
    registerAppSignIn(contents, (origin: string) => origin === 'https://alex.gitu.app', openExternal);
    expect(await handler({ senderFrame: mainFrame }, 'https://connect.composio.dev/link')).toBe(true);
    mainFrame.url = 'https://evil.example/';
    expect(await handler({ senderFrame: mainFrame }, 'https://connect.composio.dev/link')).toBe(false);
    expect(openExternal).toHaveBeenCalledOnce();
  });

  it('permits Pikpam and Composio app sign-in hosts and rejects lookalikes', async () => {
    let handler!: (event: unknown, url: string) => Promise<boolean>;
    const mainFrame = { url: 'http://127.0.0.1:8344/' }, openExternal = vi.fn(async () => {});
    const contents = { isDestroyed: () => false, mainFrame, ipc: { handle: (_channel: string, callback: typeof handler) => { handler = callback; } } };
    registerAppSignIn(contents, 'http://127.0.0.1:8344', openExternal);
    for (const url of [
      'https://pikpam.com/integrations/connect/gmail',
      'https://www.pikpam.com/integrations/connect/gmail',
      'https://app.composio.dev/oauth/authorize',
    ]) {
      expect(await handler({ senderFrame: mainFrame }, url)).toBe(true);
    }
    expect(openExternal).toHaveBeenCalledTimes(3);
    for (const url of [
      'http://pikpam.com/integrations/connect/gmail',
      'https://pikpam.com.evil.example/link',
      'https://pikpam.com:8443/link',
      'https://secret@pikpam.com/link',
    ]) {
      expect(await handler({ senderFrame: mainFrame }, url)).toBe(false);
    }
    expect(openExternal).toHaveBeenCalledTimes(3);
  });
});
