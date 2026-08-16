const { app, BrowserWindow, shell } = require('electron');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const DESIRED_PORT = Number(process.env.HERMES_UI_PORT || 8321);

let mainWindow = null;
let browserWin = null;
let server = null;
let boundPort = 0;

function ensureBrowserWin() {
  if (browserWin && !browserWin.isDestroyed()) return browserWin;
  browserWin = new BrowserWindow({
    show: false,
    width: 1280,
    height: 900,
    title: 'Hermes Browser',
    webPreferences: { backgroundThrottling: false },
  });
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
  };
}

function blankState() {
  return { available: true, url: '', title: '', canBack: false, canForward: false, loading: false };
}

function makeBrowserBridge(normalizeUrl) {
  return {
    state() {
      if (!browserWin || browserWin.isDestroyed()) return blankState();
      return stateOf(browserWin);
    },
    async navigate(url) {
      const normalized = normalizeUrl(String(url ?? ''));
      const win = ensureBrowserWin();
      await win.loadURL(normalized);
      return stateOf(win);
    },
    async back() {
      const win = ensureBrowserWin();
      if (win.webContents.canGoBack()) win.webContents.goBack();
      await new Promise((r) => setTimeout(r, 250));
      return stateOf(win);
    },
    async forward() {
      const win = ensureBrowserWin();
      if (win.webContents.canGoForward()) win.webContents.goForward();
      await new Promise((r) => setTimeout(r, 250));
      return stateOf(win);
    },
    async reload() {
      const win = ensureBrowserWin();
      await win.webContents.reload();
      return stateOf(win);
    },
    async screenshot() {
      const win = ensureBrowserWin();
      if (!win.webContents.getURL()) {
        await win.loadURL('about:blank').catch(() => {});
      }
      const image = await win.webContents.capturePage();
      return { pngBase64: image.toPNG().toString('base64'), state: stateOf(win) };
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
  const dist = path.join(__dirname, '..', 'dist');
  const { HermesServer } = await import(pathToFileURL(path.join(dist, 'server', 'server.js')).href);
  const browserMod = await import(pathToFileURL(path.join(dist, 'browser', 'browser.js')).href);
  const bridge = makeBrowserBridge(browserMod.normalizeUrl);

  server = new HermesServer({ cwd: process.cwd(), port: DESIRED_PORT, browser: bridge });
  try {
    boundPort = await server.start();
  } catch (err) {
    if (String(err && err.code) === 'EADDRINUSE') {
      server = new HermesServer({ cwd: process.cwd(), port: 0, browser: bridge });
      boundPort = await server.start();
    } else {
      throw err;
    }
  }

  createMainWindow();

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
