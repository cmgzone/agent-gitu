const { app, BrowserWindow, shell } = require('electron');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const DESIRED_PORT = Number(process.env.HERMES_UI_PORT || 8321);
const APP_ICON_PATH = path.join(__dirname, '..', 'assets', 'agent-gitu-icon.png');

let mainWindow = null;
let server = null;
let boundPort = 0;

let browserWin = null;
let driving = 0;
// Console warnings/errors from the driven page (newest last). Cleared on real
// navigations; screenshots surface the tail to the agent as grounding text.
let consoleLog = [];

function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}\n`;
  try {
    fs.appendFileSync(path.join(os.tmpdir(), 'hermes-desktop.log'), line);
  } catch {}
  try {
    fs.appendFileSync(path.join(os.homedir(), '.hermes-desktop.log'), line);
  } catch {}
}

// Electron changed the console-message payload across versions: legacy builds
// pass (event, level:number, message, line, sourceId); newer ones pass a single
// event object with .level/.message/.lineNumber/.sourceId. Handle both.
function recordConsoleMessage(...args) {
  const e = args[0] ?? {};
  let level, message, line, sourceId;
  if (typeof args[1] === 'number') {
    level = args[1];
    message = args[2];
    line = args[3];
    sourceId = args[4];
  } else {
    level = e.level;
    message = e.message;
    line = e.lineNumber;
    sourceId = e.sourceId;
  }
  const numeric = typeof level === 'number' ? level : { verbose: 0, info: 1, warning: 2, error: 3 }[String(level)] ?? 1;
  if (numeric < 2) return;
  const label = numeric >= 3 ? 'error' : 'warn';
  const src = String(sourceId || '').split('/').pop() || '';
  consoleLog.push(`${label}: ${String(message).slice(0, 300)}${src ? ` (${src}${line ? ':' + line : ''})` : ''}`);
  if (consoleLog.length > 100) consoleLog.splice(0, consoleLog.length - 100);
}

function ensureBrowserWin() {
  if (browserWin && !browserWin.isDestroyed()) return browserWin;
  browserWin = new BrowserWindow({
    width: 1280,
    height: 900,
    title: 'Agent Gitu Browser',
    icon: APP_ICON_PATH,
    autoHideMenuBar: true,
    backgroundColor: '#ffffff',
    webPreferences: {
      backgroundThrottling: false,
      // Agents are often asked to read a PDF on the web; the built-in viewer is a
      // plugin, so Chromium only renders it when plugins are enabled.
      plugins: true,
    },
  });
  consoleLog = [];
  browserWin.webContents.on('console-message', (...args) => {
    try {
      recordConsoleMessage(...args);
    } catch {
      /* never let logging break the page */
    }
  });
  // A fresh document starts with a clean console slate; SPA in-page routes
  // keep history so errors seen on route clicks still reach the agent.
  browserWin.webContents.on('did-navigate', () => {
    consoleLog = [];
  });
  if (mainWindow && !mainWindow.isDestroyed()) {
    const b = mainWindow.getBounds();
    browserWin.setPosition(b.x + 140, b.y + 90);
  }
  // This window keeps backgroundThrottling disabled so driven pages keep
  // rendering while the agent works; that can also leave it frame-evicted
  // after being hidden (electron/electron#42378), so repaint on reveal.
  const repaintBrowser = () => {
    if (browserWin && !browserWin.isDestroyed()) {
      try {
        browserWin.webContents.invalidate();
      } catch {
        /* best-effort repaint */
      }
    }
  };
  browserWin.on('show', repaintBrowser);
  browserWin.on('restore', repaintBrowser);
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
        b.textContent = '\\u26A1 Agent Gitu is driving the browser';
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

const KEY_MAP = {
  enter: 'Return',
  return: 'Return',
  tab: 'Tab',
  escape: 'Escape',
  esc: 'Escape',
  backspace: 'Backspace',
  delete: 'Delete',
  space: 'Space',
  up: 'Up',
  down: 'Down',
  left: 'Left',
  right: 'Right',
  home: 'Home',
  end: 'End',
  pageup: 'PageUp',
  pagedown: 'PageDown',
};

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function triggerAndWaitForLoad(win, trigger) {
  const wc = win.webContents;
  return new Promise((resolve) => {
    let settled = false;
    let quietTimer = null;
    const finish = () => {
      if (settled) return;
      settled = true;
      wc.removeListener('did-stop-loading', finish);
      if (quietTimer) clearTimeout(quietTimer);
      clearTimeout(timeout);
      resolve();
    };
    // History navigation and reload are asynchronous.  Wait for Electron's
    // completion signal so a follow-up screenshot observes the new document.
    const timeout = setTimeout(finish, 15_000);
    wc.once('did-stop-loading', finish);
    trigger();
    // A disabled history action does not emit loading events, so do not leave
    // the caller waiting for the full timeout in that case.
    if (!settled) {
      quietTimer = setTimeout(() => {
        if (!wc.isLoading()) finish();
      }, 150);
    }
  });
}

// Post-action verification: after a state-changing browser action (click,
// fill, press, ...), wait until the page finishes loading or stays quiet for
// `quietMs`, so the state returned to the agent reflects the settled page
// (new URL, new title, loading=false) instead of a mid-navigation snapshot.
async function settle(win, quietMs) {
  const wc = win.webContents;
  const deadline = Date.now() + 15_000;
  let quietStart = Date.now();
  for (;;) {
    if (Date.now() > deadline || wc.isDestroyed()) return;
    if (wc.isLoading()) {
      quietStart = Date.now();
      // The user can close the window mid-load: a destroyed webContents never
      // emits 'did-stop-loading', which would hang the caller (and the agent's
      // tool call) forever. Bound the wait and always clean up the listener.
      await new Promise((resolve) => {
        const timer = setTimeout(done, 15_000);
        function done() {
          clearTimeout(timer);
          if (!wc.isDestroyed()) wc.removeListener('did-stop-loading', done);
          resolve();
        }
        wc.once('did-stop-loading', done);
      });
      return;
    }
    await sleep(120);
    if (wc.isDestroyed()) return;
    if (!wc.isLoading() && Date.now() - quietStart >= (quietMs || 500)) return;
  }
}

function rectOfSelector(win, selector) {
  return win.webContents.executeJavaScript(
    `(function(sel){
      var el = document.querySelector(sel);
      if (!el) return null;
      el.scrollIntoView({ block: 'center', behavior: 'instant' });
      var r = el.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    })(${JSON.stringify(String(selector))})`,
  );
}

function realClick(win, x, y) {
  const wc = win.webContents;
  const px = Math.round(x);
  const py = Math.round(y);
  wc.sendInputEvent({ type: 'mouseMove', x: px, y: py });
  wc.sendInputEvent({ type: 'mouseDown', x: px, y: py, button: 'left', clickCount: 1 });
  wc.sendInputEvent({ type: 'mouseUp', x: px, y: py, button: 'left', clickCount: 1 });
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
        if (win.webContents.canGoBack()) {
          await triggerAndWaitForLoad(win, () => win.webContents.goBack());
        }
      });
      return stateOf(win);
    },
    async forward() {
      const win = ensureBrowserWin();
      await withDriving(win, async () => {
        if (win.webContents.canGoForward()) {
          await triggerAndWaitForLoad(win, () => win.webContents.goForward());
        }
      });
      return stateOf(win);
    },
    async reload() {
      const win = ensureBrowserWin();
      await withDriving(win, async () => {
        await triggerAndWaitForLoad(win, () => win.webContents.reload());
      });
      return stateOf(win);
    },
    async click(x, y) {
      const win = ensureBrowserWin();
      await withDriving(win, async () => {
        await injectCursor(win, x, y);
        await sleep(500);
        realClick(win, x, y);
        await settle(win);
      });
      return stateOf(win);
    },
    async clickSelector(selector) {
      const win = ensureBrowserWin();
      await withDriving(win, async () => {
        const pos = await rectOfSelector(win, selector);
        if (!pos) throw new Error(`selector not found on page: ${selector}`);
        await injectCursor(win, pos.x, pos.y);
        await sleep(500);
        realClick(win, pos.x, pos.y);
        await settle(win);
      });
      return stateOf(win);
    },
    async hover(x, y) {
      const win = ensureBrowserWin();
      await withDriving(win, async () => {
        await injectCursor(win, x, y);
        await sleep(300);
        win.webContents.sendInputEvent({ type: 'mouseMove', x: Math.round(x), y: Math.round(y) });
      });
      return stateOf(win);
    },
    async scroll(x, y, deltaY) {
      const win = ensureBrowserWin();
      await withDriving(win, async () => {
        await injectCursor(win, x, y);
        const steps = Math.max(1, Math.min(10, Math.ceil(Math.abs(deltaY) / 120)));
        const per = Math.round(deltaY / steps);
        for (let i = 0; i < steps; i++) {
          win.webContents.sendInputEvent({ type: 'mouseWheel', x: Math.round(x), y: Math.round(y), deltaX: 0, deltaY: per });
          await sleep(60);
        }
      });
      return stateOf(win);
    },
    async type(text) {
      const win = ensureBrowserWin();
      await withDriving(win, async () => {
        for (const ch of String(text)) {
          win.webContents.sendInputEvent({ type: 'char', keyCode: ch });
          await sleep(25);
        }
      });
      return stateOf(win);
    },
    async fill(selector, text) {
      const win = ensureBrowserWin();
      await withDriving(win, async () => {
        const pos = await rectOfSelector(win, selector);
        if (!pos) throw new Error(`selector not found on page: ${selector}`);
        await injectCursor(win, pos.x, pos.y);
        const result = await win.webContents.executeJavaScript(
          `(function(sel, text){
            var el = document.querySelector(sel);
            if (!el) return { ok: false };
            el.focus();
            var proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : (el.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype);
            var desc = Object.getOwnPropertyDescriptor(proto, 'value');
            if (desc && desc.set) desc.set.call(el, text); else el.value = text;
            el.dispatchEvent(new Event('input', { bubbles: true }));
            el.dispatchEvent(new Event('change', { bubbles: true }));
            return { ok: true };
          })(${JSON.stringify(String(selector))}, ${JSON.stringify(String(text))})`,
        );
        if (!result || !result.ok) throw new Error(`could not fill ${selector}`);
        await settle(win);
      });
      return stateOf(win);
    },
    async select(selector, value) {
      const win = ensureBrowserWin();
      await withDriving(win, async () => {
        const result = await win.webContents.executeJavaScript(
          `(function(sel, val){
            var el = document.querySelector(sel);
            if (!el || el.tagName !== 'SELECT') return { ok: false };
            var opt = null;
            for (var i = 0; i < el.options.length; i++) {
              var o = el.options[i];
              if (o.value === val || (o.text || '').toLowerCase() === String(val).toLowerCase()) { opt = o; break; }
            }
            if (!opt) return { ok: false };
            el.value = opt.value;
            el.dispatchEvent(new Event('change', { bubbles: true }));
            return { ok: true, chosen: opt.value };
          })(${JSON.stringify(String(selector))}, ${JSON.stringify(String(value))})`,
        );
        if (!result || !result.ok) throw new Error(`could not select "${value}" in ${selector}`);
        await settle(win);
      });
      return stateOf(win);
    },
    async press(key) {
      const win = ensureBrowserWin();
      await withDriving(win, async () => {
        const mapped = KEY_MAP[String(key).toLowerCase()] ?? String(key);
        win.webContents.sendInputEvent({ type: 'rawKeyDown', keyCode: mapped });
        win.webContents.sendInputEvent({ type: 'keyUp', keyCode: mapped });
        // Enter/Escape can navigate or dismiss dialogs; confirm the page state.
        await settle(win);
      });
      return stateOf(win);
    },
    async wait(ms) {
      const win = ensureBrowserWin();
      await sleep(Math.max(0, Math.min(10000, Number(ms) || 0)));
      return stateOf(win);
    },
    // Non-visual eyes: run a JS expression in the page for the evidence
    // collector (DOM counts, accessibility, layout geometry). Returns the
    // JSON-serializable result; throws propagate to the collector.
    async evaluate(expression) {
      const win = ensureBrowserWin();
      return withDriving(win, () => win.webContents.executeJavaScript(String(expression), true));
    },
    // Console warnings/errors since the last navigation — no image needed.
    consoleErrors() {
      return consoleLog.slice(-8);
    },
    // Responsive probing: resize the CONTENT area (chrome excluded) so the
    // page's innerWidth/innerHeight match the requested viewport.
    async setViewport(width, height) {
      const win = ensureBrowserWin();
      const w = Math.max(200, Math.min(4000, Math.round(Number(width) || 1280)));
      const h = Math.max(200, Math.min(4000, Math.round(Number(height) || 900)));
      win.setContentSize(w, h);
      await settle(win);
      return stateOf(win);
    },
    async screenshot() {
      const win = ensureBrowserWin();
      const image = await win.webContents.capturePage();
      // Ground the screenshot with page facts a text-only model can use:
      // visible-text digest plus console warnings/errors since last navigate.
      let textDigest;
      let readyState;
      try {
        const info = await win.webContents.executeJavaScript(
          `(function(){
            var t = (document.body && document.body.innerText) || '';
            t = t.replace(/[ \\t]+/g, ' ').replace(/\\n{3,}/g, '\\n\\n').trim().slice(0, 1500);
            return { text: t, ready: document.readyState };
          })()`,
        );
        if (info && typeof info.text === 'string') {
          textDigest = info.text;
          readyState = info.ready;
        }
      } catch {
        /* about:blank or crashed renderer — diagnostics are best-effort */
      }
      const consoleErrors = consoleLog.slice(-8);
      // Vision models bill by image size; downscale to a max edge and encode
      // JPEG for large captures before the payload enters model context.
      try {
        const MAX_DIM = 1280;
        const JPEG_QUALITY = 60;
        const COMPRESS_BYTES = 160 * 1024;
        const size = image.getSize();
        const longest = Math.max(size.width, size.height);
        let out = image;
        if (longest > MAX_DIM) {
          const scale = MAX_DIM / longest;
          out = image.resize({
            width: Math.max(1, Math.round(size.width * scale)),
            height: Math.max(1, Math.round(size.height * scale)),
          });
        }
        const pngBytes = out.toPNG();
        const payload =
          pngBytes.length > COMPRESS_BYTES
            ? { pngBase64: out.toJPEG(JPEG_QUALITY).toString('base64'), mime: 'image/jpeg' }
            : { pngBase64: pngBytes.toString('base64'), mime: 'image/png' };
        return {
          ...payload,
          state: stateOf(win),
          ...(consoleErrors.length ? { consoleErrors } : {}),
          ...(textDigest ? { textDigest } : {}),
          ...(readyState && readyState !== 'complete' ? { loadIncomplete: true } : {}),
        };
      } catch (err) {
        log(`screenshot optimization failed, falling back to raw PNG: ${err && err.message}`);
        return {
          pngBase64: image.toPNG().toString('base64'),
          mime: 'image/png',
          state: stateOf(win),
          ...(consoleErrors.length ? { consoleErrors } : {}),
          ...(textDigest ? { textDigest } : {}),
          ...(readyState && readyState !== 'complete' ? { loadIncomplete: true } : {}),
        };
      }
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
    // The desktop shell exists to show the web UI. Start maximized so the
    // workspace uses the available desktop area while retaining normal
    // window controls for people who prefer to restore or resize it.
    show: false,
    title: 'Agent Gitu',
    icon: APP_ICON_PATH,
    autoHideMenuBar: true,
    // Draw the window controls into the app's dark surface instead of leaving
    // Windows' white title bar above the web UI.
    backgroundColor: '#0d1017',
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: '#0d1017',
      symbolColor: '#dbe7ff',
      height: 32,
    },
    // Do NOT set backgroundThrottling: false here. On Windows it triggers
    // electron/electron#42378: once the window is hidden/minimized, Chromium
    // evicts the compositor frame ~5 minutes later and the window renders
    // blank even though the DOM and renderer are perfectly healthy.
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      // Chromium draws PDFs with its internal viewer, which Electron treats as a
      // plugin and disables by default. Without this the cowork document modal
      // shows a blank frame for every PDF an agent generates. Isolation stays
      // on (contextIsolation + the preview page's own CSP).
      plugins: true,
    },
  });

  // Belt-and-braces for the same frame-eviction family of bugs: ask for a
  // fresh frame whenever the window becomes visible again. Without this a
  // minimized/occluded window can be restored to an empty surface until the
  // user resizes it.
  const forceRepaint = () => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    try {
      mainWindow.webContents.invalidate();
    } catch {
      /* the window can be gone mid-restore; repaint is best-effort */
    }
  };
  mainWindow.on('show', forceRepaint);
  mainWindow.on('restore', forceRepaint);
  mainWindow.on('maximize', forceRepaint);

  let revealed = false;
  const appUrl = `http://127.0.0.1:${boundPort}`;
  const revealWindow = () => {
    if (revealed || !mainWindow || mainWindow.isDestroyed()) return;
    revealed = true;
    log('revealing mainWindow');
    try {
      mainWindow.show();
      mainWindow.maximize();
      log(`mainWindow revealed successfully, isVisible=${mainWindow.isVisible()}`);
    } catch (err) {
      log(`error showing mainWindow: ${err && err.message}`);
    }
  };

  mainWindow.webContents.on('console-message', (...args) => {
    try {
      const event = args[0] ?? {};
      const legacy = typeof args[1] === 'number';
      const level = legacy ? args[1] : event.level;
      const message = legacy ? args[2] : event.message;
      const numeric = typeof level === 'number' ? level : { verbose: 0, info: 1, warning: 2, error: 3 }[String(level)] ?? 1;
      if (numeric >= 3) log(`mainWindow console error: ${String(message).slice(0, 300)}`);
    } catch {
      /* never let logging break the page */
    }
  });

  // A stalled or failed first navigation must never leave the user with a
  // permanently blank window (seen under heavy disk load / first-run AV
  // scans). Retry the local UI, then replace the void with a real error page.
  let loaded = false;
  let loadAttempts = 0;
  let failureShown = false;
  let loadWatchdog;
  let retryTimer;
  const loadFailurePage = (reason) => {
    clearTimeout(loadWatchdog);
    clearTimeout(retryTimer);
    if (failureShown || !mainWindow || mainWindow.isDestroyed()) return;
    failureShown = true;
    const html =
      '<!doctype html><html><head><meta charset="utf-8"><title>Agent Gitu</title>' +
      '<style>html,body{height:100%;margin:0;background:#0d1017;color:#dbe7ff;font:15px/1.6 system-ui,sans-serif;display:flex;align-items:center;justify-content:center}' +
      'main{max-width:520px;padding:32px;text-align:center}h1{font-size:20px;margin:0 0 10px}p{color:#93a0bb;margin:0 0 18px}' +
      'a{display:inline-block;background:#7c6cf0;color:#fff;text-decoration:none;border-radius:8px;padding:9px 18px;font-weight:600}</style></head>' +
      '<body><main id="gitu-fail"><h1>Agent Gitu could not load its interface</h1><p>' +
      reason +
      '</p><p>The local server is running at ' +
      appUrl +
      '.</p><a href="' +
      appUrl +
      '">Try again</a></main></body></html>';
    log(`showing load failure page: ${reason}`);
    mainWindow.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html)).catch((err) => {
      log(`load failure page could not be shown: ${err && err.message}`);
    });
  };
  const scheduleRetry = (reason) => {
    if (loaded || failureShown || !mainWindow || mainWindow.isDestroyed()) return;
    if (loadAttempts >= 2) {
      loadFailurePage(reason);
      return;
    }
    loadAttempts += 1;
    log(`retrying page load (${reason}; attempt ${loadAttempts})`);
    retryTimer = setTimeout(() => {
      if (loaded || failureShown || !mainWindow || mainWindow.isDestroyed()) return;
      mainWindow.webContents.reload();
      armLoadWatchdog();
    }, 1000);
  };
  const armLoadWatchdog = () => {
    clearTimeout(loadWatchdog);
    loadWatchdog = setTimeout(() => {
      if (loaded || !mainWindow || mainWindow.isDestroyed()) return;
      const wc = mainWindow.webContents;
      log(`page load watchdog fired (attempt=${loadAttempts}, url=${wc.getURL()}, loading=${wc.isLoading()})`);
      scheduleRetry('the page stalled');
    }, 20000);
  };
  const appShellProbe = `(function(){
    if (document.getElementById('gitu-fail')) return 'fail';
    if (document.getElementById('view') && document.getElementById('gearBtn')) return 'app';
    return 'other';
  })()`;

  mainWindow.once('ready-to-show', () => {
    log('mainWindow ready-to-show fired');
    revealWindow();
  });

  mainWindow.webContents.on('did-finish-load', () => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    // A Chromium error page also emits did-finish-load; only a document that
    // actually contains the app shell counts as a successful load.
    mainWindow.webContents
      .executeJavaScript(appShellProbe, true)
      .then((state) => {
        if (loaded || !mainWindow || mainWindow.isDestroyed()) return;
        if (state === 'app') {
          loaded = true;
          clearTimeout(loadWatchdog);
          log('mainWindow did-finish-load fired (app shell present)');
          revealWindow();
        } else if (state === 'fail') {
          clearTimeout(loadWatchdog);
          log('mainWindow is showing the load failure page');
        } else {
          scheduleRetry('the loaded document was not the app shell');
        }
      })
      .catch((err) => scheduleRetry(`shell probe failed: ${err && err.message}`));
  });

  mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL, isMainFrame) => {
    log(`mainWindow did-fail-load: ${errorCode} ${errorDescription} ${validatedURL}`);
    revealWindow();
    // -3 is ERR_ABORTED (navigation superseded by a reload), not a failure.
    if (loaded || isMainFrame === false || errorCode === -3) return;
    scheduleRetry(`the load failed (${errorDescription || errorCode})`);
  });

  mainWindow.webContents.on('render-process-gone', (_event, details) => {
    log(`mainWindow render-process-gone: ${details && details.reason} exitCode=${details && details.exitCode}`);
    if (!mainWindow || mainWindow.isDestroyed()) return;
    setTimeout(() => {
      if (!mainWindow || mainWindow.isDestroyed()) return;
      log('reloading after renderer exit');
      loaded = false;
      try {
        mainWindow.webContents.reload();
        armLoadWatchdog();
      } catch (err) {
        log(`reload after renderer exit failed: ${err && err.message}`);
      }
    }, 700);
  });

  // Safety fallback: reveal the window even if first paint never happens. The
  // watchdog above retries the load and surfaces an error page if it keeps
  // failing, so the user is never left staring at an unexplained void.
  setTimeout(() => {
    if (!revealed) {
      log('fallback timer (1500ms) revealing window');
      revealWindow();
    }
  }, 1500);

  mainWindow.loadURL(appUrl);
  armLoadWatchdog();
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    // Compare parsed hosts, not string prefixes: startsWith('http://127.0.0.1')
    // also admits look-alike hosts like http://127.0.0.1.evil.com/.
    try {
      const parsed = new URL(url);
      if (
        (parsed.protocol === 'http:' || parsed.protocol === 'https:') &&
        (parsed.hostname === '127.0.0.1' || parsed.hostname === 'localhost' || parsed.hostname === '[::1]')
      ) {
        return { action: 'allow' };
      }
    } catch {
      return { action: 'deny' };
    }
    shell.openExternal(url);
    return { action: 'deny' };
  });
  mainWindow.on('close', (e) => {
    log(`mainWindow close event fired! defaultPrevented=${e.defaultPrevented}`);
  });
  mainWindow.on('closed', () => {
    log('mainWindow closed event fired!');
    mainWindow = null;
  });
}

async function start() {
  log('start() begin');
  try {
    const dist = path.join(__dirname, '..', 'dist');
    log(`dist path: ${dist}`);
    const serverUrl = pathToFileURL(path.join(dist, 'server', 'server.js')).href;
    log(`importing server from: ${serverUrl}`);
    const { HermesServer } = await import(serverUrl);
    log('server module loaded');
    const homeUrl = pathToFileURL(path.join(dist, 'workspace', 'home.js')).href;
    const browserUrl = pathToFileURL(path.join(dist, 'browser', 'browser.js')).href;
    const homeMod = await import(homeUrl);
    const browserMod = await import(browserUrl);
    log('workspace and browser modules loaded');
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
  } catch (err) {
    log(`start() fatal error: ${err && err.stack ? err.stack : err}`);
    throw err;
  }
}

process.on('uncaughtException', (err) => {
  log(`uncaughtException: ${err && err.stack ? err.stack : err}`);
});
process.on('unhandledRejection', (reason) => {
  log(`unhandledRejection: ${reason && reason.stack ? reason.stack : reason}`);
});

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  log('singleInstanceLock not acquired; quitting secondary process');
  app.quit();
} else {
  app.on('second-instance', () => {
    log('second-instance triggered');
    if (mainWindow && !mainWindow.isDestroyed()) {
      if (!mainWindow.isVisible()) {
        log('second-instance: window was hidden, showing now');
        mainWindow.show();
        mainWindow.maximize();
      }
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    } else {
      log('second-instance: recreating main window');
      createMainWindow();
    }
  });
  app.whenReady().then(start).catch((err) => {
    log(`fatal: ${err && err.stack ? err.stack : err}`);
    console.error('[hermes-desktop]', err);
    app.quit();
  });
  app.on('before-quit', () => {
    log('app before-quit event fired');
  });
  app.on('will-quit', () => {
    log('app will-quit event fired');
    if (server) void server.stop().catch(() => {});
  });
  app.on('quit', (_e, exitCode) => {
    log(`app quit event fired with code ${exitCode}`);
  });
  app.on('window-all-closed', () => {
    log('app window-all-closed event fired');
    app.quit();
  });
}

