const { app, BrowserWindow, shell } = require('electron');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const DESIRED_PORT = Number(process.env.HERMES_UI_PORT || 8321);

let mainWindow = null;
let server = null;
let boundPort = 0;

let browserWin = null;
let driving = 0;

function log(msg) {
  try {
    fs.appendFileSync(path.join(os.tmpdir(), 'hermes-desktop.log'), `[${new Date().toISOString()}] ${msg}\n`);
  } catch {
    /* best effort */
  }
}

function ensureBrowserWin() {
  if (browserWin && !browserWin.isDestroyed()) return browserWin;
  browserWin = new BrowserWindow({
    width: 1280,
    height: 900,
    title: 'Hermes Browser',
    autoHideMenuBar: true,
    backgroundColor: '#ffffff',
    webPreferences: { backgroundThrottling: false },
  });
  if (mainWindow && !mainWindow.isDestroyed()) {
    const b = mainWindow.getBounds();
    browserWin.setPosition(b.x + 140, b.y + 90);
  }
  browserWin.loadURL('about:blank').catch(() => {});
  browserWin.on('closed', () => {
    browserWin = null;
  });
  return browserWin;
}

function stateOf(win) {
  const wc = win.webContents;
  return {
    available: true,
    url: wc.getURL(),
    title: wc.getTitle(),
    canBack: wc.canGoBack(),
    canForward: wc.canGoForward(),
    loading: wc.isLoading(),
    driving: driving > 0,
  };
}

function blankState() {
  return { available: true, url: '', title: '', canBack: false, canForward: false, loading: false, driving: false };
}

function injectBanner(win) {
  return win.webContents
    .executeJavaScript(
      `(function(){
        var b = document.getElementById('hermes-drive-banner');
        if (!b) {
          b = document.createElement('div');
          b.id = 'hermes-drive-banner';
          b.style.cssText = 'position:fixed;top:10px;left:50%;transform:translateX(-50%);z-index:2147483647;background:#7c6cf0;color:#fff;border-radius:999px;padding:7px 16px;font:600 12px system-ui,sans-serif;box-shadow:0 4px 16px rgba(124,108,240,.55);pointer-events:none';
          document.documentElement.appendChild(b);
        }
        b.textContent = '\\u26A1 Hermes is driving the browser';
        b.style.display = 'block';
        clearTimeout(b._t);
        b._t = setTimeout(function(){ b.style.display = 'none'; }, 1600);
        return true;
      })()`,
    )
    .catch(() => {});
}

function injectCursor(win, x, y) {
  return win.webContents
    .executeJavaScript(
      `(function(x, y){
        var c = document.getElementById('hermes-drive-cursor');
        if (!c) {
          c = document.createElement('div');
          c.id = 'hermes-drive-cursor';
          c.style.cssText = 'position:fixed;z-index:2147483647;width:0;height:0;pointer-events:none;transition:left .45s cubic-bezier(.2,.7,.3,1),top .45s cubic-bezier(.2,.7,.3,1)';
          c.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" style="filter:drop-shadow(0 1px 2px rgba(0,0,0,.4))"><path d="M4 2l14 12-6 1 3.5 6.5-3 1.5L9 16l-5 4z" fill="#111" stroke="#fff" stroke-width="1"/></svg>';
          document.documentElement.appendChild(c);
        }
        c.style.left = x + 'px';
        c.style.top = y + 'px';
        var r = document.createElement('div');
        r.style.cssText = 'position:fixed;z-index:2147483646;left:' + x + 'px;top:' + y + 'px;width:26px;height:26px;margin:-13px 0 0 -13px;border:2px solid #7c6cf0;border-radius:50%;pointer-events:none;animation:hermesRipple .6s ease-out forwards';
        var st = document.createElement('style');
        st.textContent = '@keyframes hermesRipple{from{transform:scale(.4);opacity:.9}to{transform:scale(1.6);opacity:0}}';
        document.documentElement.appendChild(st);
        document.documentElement.appendChild(r);
        setTimeout(function(){ r.remove(); st.remove(); }, 700);
        return true;
      })(${Math.round(x)}, ${Math.round(y)})`,
    )
    .catch(() => {});
}

async function withDriving(win, fn) {
  driving += 1;
  if (win.isMinimized()) win.restore();
  win.show();
  await injectBanner(win);
  try {
    return await fn();
  } finally {
    driving = Math.max(0, driving - 1);
  }
}

function makeBrowserBridge(normalizeUrl) {
  return {
    available: () => true,
    state: () => (browserWin && !browserWin.isDestroyed() ? stateOf(browserWin) : blankState()),
    async navigate(url) {
      const win = ensureBrowserWin();
      const normalized = normalizeUrl(String(url ?? ''));
      await withDriving(win, () => win.loadURL(normalized));
      return stateOf(win);
    },
    async back() {
      const win = ensureBrowserWin();
      await withDriving(win, async () => {
        if (win.webContents.canGoBack()) win.webContents.goBack();
      });
      return stateOf(win);
    },
    async forward() {
      const win = ensureBrowserWin();
      await withDriving(win, async () => {
        if (win.webContents.canGoForward()) win.webContents.goForward();
      });
      return stateOf(win);
    },
    async reload() {
      const win = ensureBrowserWin();
      await withDriving(win, async () => {
        win.webContents.reload();
      });
      return stateOf(win);
    },
    async click(x, y) {
      const win = ensureBrowserWin();
      await withDriving(win, async () => {
        await injectCursor(win, x, y);
        await new Promise((r) => setTimeout(r, 500));
        win.webContents.sendInputEvent({ type: 'mouseDown', x: Math.round(x), y: Math.round(y), button: 'left', clickCount: 1 });
        win.webContents.sendInputEvent({ type: 'mouseUp', x: Math.round(x), y: Math.round(y), button: 'left', clickCount: 1 });
      });
      return stateOf(win);
    },
    async type(text) {
      const win = ensureBrowserWin();
      await withDriving(win, async () => {
        for (const ch of String(text)) {
          win.webContents.sendInputEvent({ type: 'char', keyCode: ch });
          await new Promise((r) => setTimeout(r, 25));
        }
      });
      return stateOf(win);
    },
    async screenshot() {
      const win = ensureBrowserWin();
      const image = await win.webContents.capturePage();
      return { pngBase64: image.toPNG().toString('base64'), state: stateOf(win) };
    },
    async focus() {
      const win = ensureBrowserWin();
      if (win.isMinimized()) win.restore();
      win.show();
      win.focus();
      return stateOf(win);
    },
  };
}

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1480,
    height: 940,
    minWidth: 900,
    minHeight: 600,
    title: 'Hermes',
    autoHideMenuBar: true,
    backgroundColor: '#f7f7f5',
    webPreferences: { contextIsolation: true, nodeIntegration: false },
  });
  mainWindow.loadURL(`http://127.0.0.1:${boundPort}`);
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http://127.0.0.1') || url.startsWith('http://localhost')) return { action: 'allow' };
    shell.openExternal(url);
    return { action: 'deny' };
  });
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

async function start() {
  log('start() begin');
  const dist = path.join(__dirname, '..', 'dist');
  const { HermesServer } = await import(pathToFileURL(path.join(dist, 'server', 'server.js')).href);
  log('server module loaded');
  const homeMod = await import(pathToFileURL(path.join(dist, 'workspace', 'home.js')).href);
  const browserMod = await import(pathToFileURL(path.join(dist, 'browser', 'browser.js')).href);
  const home = homeMod.ensureHermesHome();
  log(`hermes home at ${home.root}`);
  const cwd = process.env.HERMES_CWD || home.workspace;
  const bridge = makeBrowserBridge(browserMod.normalizeUrl);

  server = new HermesServer({ cwd, port: DESIRED_PORT, browser: bridge });
  try {
    boundPort = await server.start();
  } catch (err) {
    log(`first start failed: ${err && err.code} ${err && err.message}`);
    if (String(err && err.code) === 'EADDRINUSE') {
      server = new HermesServer({ cwd, port: 0, browser: bridge });
      boundPort = await server.start();
    } else {
      throw err;
    }
  }
  log(`server bound to ${boundPort}`);
  console.log(`[hermes-desktop] UI ready on http://127.0.0.1:${boundPort}`);
  try {
    fs.writeFileSync(path.join(os.tmpdir(), 'hermes-desktop-port'), String(boundPort));
  } catch {
    /* best effort */
  }

  createMainWindow();
  log('main window created');

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
  });
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
  app.whenReady().then(start).catch((err) => {
    log(`fatal: ${err && err.stack ? err.stack : err}`);
    console.error('[hermes-desktop]', err);
    app.quit();
  });
  app.on('window-all-closed', () => {
    app.quit();
  });
  app.on('will-quit', () => {
    if (server) void server.stop().catch(() => {});
  });
}
