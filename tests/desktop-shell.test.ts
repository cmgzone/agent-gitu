import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createContext, Script } from 'node:vm';
import { createRequire } from 'node:module';
import { EventEmitter } from 'node:events';
import { describe, expect, it, vi } from 'vitest';

/**
 * The Electron shell cannot run inside vitest, but its window policy is exactly
 * what decides whether the cowork document preview can draw a PDF: Chromium's
 * PDF viewer is an internal plugin and Electron disables plugins by default, so
 * a missing `plugins: true` silently renders a blank frame for every PDF.
 *
 * These assertions read the shell source and keep that flag (plus the isolation
 * flags that must never be loosened) in place.
 */
const source = readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'desktop', 'main.cjs'), 'utf8');

/** Slice the `webPreferences: { … }` object that follows `marker`, brace-matched. */
function webPreferencesAfter(marker: string): string {
  const markerAt = source.indexOf(marker);
  expect(markerAt, `desktop/main.cjs is missing ${marker}`).toBeGreaterThanOrEqual(0);
  const start = source.indexOf('webPreferences', markerAt);
  expect(start, `${marker} has no webPreferences block`).toBeGreaterThanOrEqual(0);
  const open = source.indexOf('{', start);
  let depth = 0;
  for (let index = open; index < source.length; index += 1) {
    if (source[index] === '{') depth += 1;
    else if (source[index] === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(open, index + 1);
    }
  }
  throw new Error(`${marker} has an unterminated webPreferences block`);
}

describe('desktop shell window policy', () => {
  it('enables the built-in PDF viewer in the window that hosts the document preview', () => {
    const preferences = webPreferencesAfter('mainWindow = new BrowserWindow(');
    expect(preferences).toContain('plugins: true');
    // Isolation must stay on while plugins are enabled.
    expect(preferences).toContain('contextIsolation: true');
    expect(preferences).toContain('nodeIntegration: false');
  });

  it('enables the built-in PDF viewer in the in-app browser window', () => {
    expect(webPreferencesAfter('browserWin = new BrowserWindow(')).toContain('plugins: true');
  });

  it('synchronizes native chrome only when the resolved appearance changes', () => {
    const preload = readFileSync(new URL('../desktop/preload.cjs', import.meta.url), 'utf8');
    const send = vi.fn();
    const observe = vi.fn();
    let ready = () => {};
    let changed = () => {};
    let theme = 'light';
    const root = { getAttribute: () => theme };
    new Script(preload).runInContext(createContext({
      require: () => ({ ipcRenderer: { send } }),
      window: { addEventListener: (_name: string, callback: () => void) => { ready = callback; } },
      document: { documentElement: root },
      MutationObserver: class {
        constructor(callback: () => void) { changed = callback; }
        observe = observe;
      },
    }));
    ready();
    expect(send).toHaveBeenLastCalledWith('gitu:theme', 'light');
    expect(observe).toHaveBeenCalledWith(root, { attributes: true, attributeFilter: ['data-theme'] });
    changed();
    expect(send).toHaveBeenCalledOnce();
    theme = 'dark';
    changed();
    expect(send).toHaveBeenLastCalledWith('gitu:theme', 'dark');
    theme = 'invalid';
    changed();
    expect(send).toHaveBeenCalledTimes(2);
  });
});

function startupFixture() {
  const windows: FakeWindow[] = [];
  const app = Object.assign(new EventEmitter(), { requestSingleInstanceLock: () => true, whenReady: () => new Promise(() => {}), quit: vi.fn() });
  class FakeWindow extends EventEmitter {
    webContents = Object.assign(new EventEmitter(), {
      ipc: new EventEmitter(), mainFrame: {}, send: vi.fn(), invalidate: vi.fn(),
      executeJavaScript: vi.fn(async () => 'app'), setWindowOpenHandler: vi.fn(), reload: vi.fn(),
    });
    show = vi.fn(); maximize = vi.fn(); focus = vi.fn();
    loadFile = vi.fn(async () => {}); loadURL = vi.fn(async () => {});
    isDestroyed = () => false;
    isVisible = () => true;
    close = vi.fn(() => this.emit('closed'));
    constructor(public options: any) { super(); windows.push(this); }
    static getAllWindows() { return windows; }
  }
  const require = createRequire(import.meta.url);
  const context = createContext({
    require: (id: string) => id === 'electron' ? { app, BrowserWindow: FakeWindow, shell: {}, nativeTheme: { shouldUseDarkColors: false } } : id === 'node:fs' ? { appendFileSync: vi.fn() } : require(id),
    __dirname: path.resolve('desktop'), process: { env: {}, on: vi.fn() }, console,
    setTimeout: vi.fn(), clearTimeout: vi.fn(), URL,
  });
  new Script(source).runInContext(context);
  return { context, app, windows };
}

describe('desktop startup handoff', () => {
  it('keeps the branded window until the real app shell loads, then closes it', async () => {
    const u = startupFixture();
    await u.context.showStartupWindow();
    const splash = u.windows[0]!;
    expect(splash.loadFile).toHaveBeenCalledWith(path.resolve('desktop/startup.html'));
    expect(splash.options.webPreferences).toMatchObject({ contextIsolation: true, nodeIntegration: false, sandbox: true });
    expect(splash.show).toHaveBeenCalledOnce();
    new Script('boundPort = 8321; createMainWindow();').runInContext(u.context);
    const main = u.windows[1]!;
    main.emit('ready-to-show');
    expect(main.show).not.toHaveBeenCalled();
    expect(splash.close).not.toHaveBeenCalled();
    main.webContents.emit('did-finish-load');
    await vi.waitFor(() => expect(main.show).toHaveBeenCalledOnce());
    expect(splash.close).toHaveBeenCalledOnce();
    expect(u.app.quit).not.toHaveBeenCalled();
  });

  it('keeps a failed startup visible with retry feedback', async () => {
    const u = startupFixture();
    await u.context.showStartupWindow();
    u.context.showStartupFailure(new Error('server import failed'));
    expect(u.windows[0]!.webContents.send).toHaveBeenLastCalledWith('gitu:startup-status', expect.objectContaining({ failed: true }));
    expect(u.app.quit).not.toHaveBeenCalled();
  });
});
