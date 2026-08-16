const { app, BrowserWindow, shell } = require('electron');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const DESIRED_PORT = Number(process.env.HERMES_UI_PORT || 8321);

function log(msg) {
  try {
    fs.appendFileSync(path.join(os.tmpdir(), 'hermes-desktop.log'), `[${new Date().toISOString()}] ${msg}\n`);
  } catch {
    /* best effort */
  }
}

let mainWindow = null;
let server = null;
let boundPort = 0;

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1480,
    height: 940,
    minWidth: 900,
    minHeight: 600,
    title: 'Hermes',
    autoHideMenuBar: true,
    backgroundColor: '#f7f7f5',
    webPreferences: { contextIsolation: true, nodeIntegration: false, webviewTag: true },
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
  const home = homeMod.ensureHermesHome();
  log(`hermes home at ${home.root}`);
  const cwd = process.env.HERMES_CWD || home.root;

  server = new HermesServer({ cwd, port: DESIRED_PORT });
  try {
    boundPort = await server.start();
  } catch (err) {
    log(`first start failed: ${err && err.code} ${err && err.message}`);
    if (String(err && err.code) === 'EADDRINUSE') {
      server = new HermesServer({ cwd, port: 0 });
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
