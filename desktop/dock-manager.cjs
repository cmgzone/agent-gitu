const { BrowserWindow, screen, clipboard, globalShortcut, nativeTheme } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { fileURLToPath, pathToFileURL } = require('node:url');

const DEFAULT_EDGE = 'right';
const ALLOWED_EDGES = new Set(['right', 'bottom', 'left']);
const VALID_SHAPES = new Set(['orb', 'block', 'tip', 'hexa', 'nova', 'dia', 'penta', 'luna', 'plus', 'pill']);
const CODING_SHORTCUT_ID = '__coding__';
const DOCK_THICKNESS = 68;
const DOCK_COLLAPSED_THICKNESS = 22;
const CHAT_WIDTH = 392;
const CHAT_HEIGHT = 560;
const DOCK_MARGIN = 12;

function normalizePrefs(raw) {
  const obj = raw && typeof raw === 'object' ? raw : {};
  const edge = ALLOWED_EDGES.has(obj.edge) ? obj.edge : DEFAULT_EDGE;
  const pinnedAgentIds = Array.isArray(obj.pinnedAgentIds)
    ? [...new Set(obj.pinnedAgentIds.map((id) => String(id || '').trim()).filter(Boolean))].slice(0, 12)
    : null; // null = auto-pin first 4 agents until user customizes
  return {
    enabled: obj.enabled !== false,
    edge,
    collapsed: obj.collapsed === true,
    includeCodingShortcut: obj.includeCodingShortcut !== false,
    pinnedAgentIds,
    alwaysOnTopChat: obj.alwaysOnTopChat !== false,
  };
}

function loadDockPrefs(prefsPath) {
  if (!prefsPath || typeof prefsPath !== 'string') return normalizePrefs(null);
  try {
    if (!fs.existsSync(prefsPath)) return normalizePrefs(null);
    return normalizePrefs(JSON.parse(fs.readFileSync(prefsPath, 'utf8')));
  } catch {
    return normalizePrefs(null);
  }
}

function saveDockPrefs(prefsPath, prefs) {
  const next = normalizePrefs(prefs);
  if (!prefsPath || typeof prefsPath !== 'string') return next;
  let tempPath = '';
  try {
    const dir = path.dirname(prefsPath);
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    tempPath = `${prefsPath}.${process.pid}.${Date.now()}.tmp`;
    fs.writeFileSync(tempPath, JSON.stringify(next, null, 2), { encoding: 'utf8', mode: 0o600 });
    fs.renameSync(tempPath, prefsPath);
  } catch {
    if (tempPath) {
      try { fs.unlinkSync(tempPath); } catch {}
    }
  }
  return next;
}

function spriteNameFromShape(shape) {
  const clean = String(shape || '').replace(/^dot-/, '').trim().toLowerCase();
  if (VALID_SHAPES.has(clean)) return clean;
  if (clean === 'circle' || clean === 'sphere') return 'orb';
  if (clean === 'box' || clean === 'square' || clean === 'cube') return 'block';
  if (clean === 'triangle' || clean === 'cone') return 'tip';
  if (clean === 'hex' || clean === 'hexagon') return 'hexa';
  if (clean === 'star' || clean === 'spark') return 'nova';
  if (clean === 'diamond') return 'dia';
  if (clean === 'shield' || clean === 'pentagon') return 'penta';
  if (clean === 'moon' || clean === 'crescent') return 'luna';
  if (clean === 'cross') return 'plus';
  if (clean === 'capsule') return 'pill';
  return 'orb';
}

function computeDockBounds(workArea, edge, itemCount, collapsed) {
  const count = Math.max(2, Math.min(14, Number(itemCount) || 4));
  // Each slot ~48px + padding + add/open controls
  const length = collapsed ? 92 : Math.min(edge === 'bottom' ? workArea.width - 64 : workArea.height - 64, count * 52 + 128);
  const thick = collapsed ? DOCK_COLLAPSED_THICKNESS : DOCK_THICKNESS;
  if (edge === 'bottom') {
    const width = Math.max(220, length);
    const height = thick;
    return {
      x: Math.round(workArea.x + (workArea.width - width) / 2),
      y: Math.round(workArea.y + workArea.height - height - DOCK_MARGIN),
      width,
      height,
    };
  }
  if (edge === 'left') {
    const width = thick;
    const height = Math.max(200, length);
    return {
      x: Math.round(workArea.x + (collapsed ? 0 : DOCK_MARGIN)),
      y: Math.round(workArea.y + (workArea.height - height) / 2),
      width,
      height,
    };
  }
  // default: right
  const width = thick;
  const height = Math.max(200, length);
  return {
    x: Math.round(workArea.x + workArea.width - width - (collapsed ? 0 : DOCK_MARGIN)),
    y: Math.round(workArea.y + (workArea.height - height) / 2),
    width,
    height,
  };
}

function computeChatBounds(workArea, dockBounds, edge) {
  const width = Math.min(CHAT_WIDTH, workArea.width - 24);
  const height = Math.min(CHAT_HEIGHT, workArea.height - 24);
  let x;
  let y;
  if (edge === 'bottom') {
    x = Math.round(dockBounds.x + (dockBounds.width - width) / 2);
    y = Math.round(dockBounds.y - height - 10);
  } else if (edge === 'left') {
    x = Math.round(dockBounds.x + dockBounds.width + 10);
    y = Math.round(dockBounds.y + (dockBounds.height - height) / 2);
  } else {
    x = Math.round(dockBounds.x - width - 10);
    y = Math.round(dockBounds.y + (dockBounds.height - height) / 2);
  }
  x = Math.max(workArea.x + 10, Math.min(workArea.x + workArea.width - width - 10, x));
  y = Math.max(workArea.y + 10, Math.min(workArea.y + workArea.height - height - 10, y));
  return { x, y, width, height };
}

function resolveSpriteDataUrl(assetsDir, shape, cache) {
  const name = spriteNameFromShape(shape);
  if (cache.has(name)) return cache.get(name);
  try {
    const file = path.join(assetsDir, 'cowork-dots', `${name}.png`);
    if (fs.existsSync(file)) {
      const b64 = fs.readFileSync(file).toString('base64');
      const dataUrl = `data:image/png;base64,${b64}`;
      cache.set(name, dataUrl);
      return dataUrl;
    }
  } catch {
    /* ignore missing sprite */
  }
  return '';
}

function createDockManager(options = {}) {
  const getActiveOrigin = typeof options.getActiveOrigin === 'function' ? options.getActiveOrigin : () => '';
  const getPrefsPath = typeof options.getPrefsPath === 'function' ? options.getPrefsPath : () => '';
  const getSessionFetch = typeof options.getSessionFetch === 'function'
    ? options.getSessionFetch
    : () => (...args) => globalThis.fetch(...args);
  const showMainApp = typeof options.showMainApp === 'function' ? options.showMainApp : () => {};
  const openAgentInMainApp = typeof options.openAgentInMainApp === 'function' ? options.openAgentInMainApp : () => {};
  const isTrustedMainOrigin = typeof options.isTrustedMainOrigin === 'function' ? options.isTrustedMainOrigin : () => false;
  const onChange = typeof options.onChange === 'function' ? options.onChange : () => {};
  const assetsDir = options.assetsDir || path.join(__dirname, '..', 'assets');
  const iconPath = options.iconPath || path.join(assetsDir, 'agent-gitu-icon.png');
  const log = typeof options.log === 'function' ? options.log : () => {};

  const spriteCache = new Map();
  let prefs = null;
  let theme = nativeTheme && nativeTheme.shouldUseDarkColors ? 'dark' : 'light';
  let dockWin = null;
  let chatWin = null;
  let activeChatTarget = { mode: 'chat', agentId: '' }; // mode: 'chat' | 'manage' | 'coding'
  let cachedAgents = [];
  let shortcutRegistered = false;

  const dockFileUrl = pathToFileURL(path.join(__dirname, 'dock.html')).href;
  const chatFileUrl = pathToFileURL(path.join(__dirname, 'quick-chat.html')).href;

  function readPrefs() {
    if (!prefs) prefs = loadDockPrefs(getPrefsPath());
    return prefs;
  }

  function writePrefs(patch) {
    prefs = saveDockPrefs(getPrefsPath(), { ...readPrefs(), ...patch });
    onChange(getStatus());
    broadcastState();
    return prefs;
  }

  function getWorkArea() {
    try {
      if (screen && typeof screen.getPrimaryDisplay === 'function') {
        return screen.getPrimaryDisplay().workArea;
      }
    } catch {}
    return { x: 0, y: 0, width: 1440, height: 900 };
  }

  function getStatus() {
    const p = readPrefs();
    return {
      enabled: p.enabled,
      edge: p.edge,
      collapsed: p.collapsed,
      includeCodingShortcut: p.includeCodingShortcut,
      pinnedAgentIds: p.pinnedAgentIds,
      alwaysOnTopChat: p.alwaysOnTopChat,
      dockOpen: Boolean(dockWin && !dockWin.isDestroyed() && dockWin.isVisible()),
      chatOpen: Boolean(chatWin && !chatWin.isDestroyed() && chatWin.isVisible()),
      theme,
    };
  }

  async function apiRequest(apiPath, opts = {}) {
    const origin = getActiveOrigin();
    if (!origin) return { ok: false, status: 503, error: 'Agent Gitu server is starting…', data: {} };
    if (typeof apiPath !== 'string' || !apiPath.startsWith('/api/')) {
      return { ok: false, status: 400, error: 'Invalid API route.', data: {} };
    }
    const fetchFn = getSessionFetch();
    const method = String(opts.method || 'GET').toUpperCase();
    const headers = {
      origin,
      ...(opts.body !== undefined ? { 'content-type': 'application/json' } : {}),
    };
    try {
      const res = await fetchFn(`${origin}${apiPath}`, {
        method,
        headers,
        ...(opts.body !== undefined ? { body: JSON.stringify(opts.body) } : {}),
      });
      const text = await res.text().catch(() => '');
      let data = {};
      if (text) {
        try { data = JSON.parse(text); } catch { data = { raw: text }; }
      }
      if (!res.ok) {
        return {
          ok: false,
          status: res.status,
          code: data.code || (res.status === 401 ? 'AUTH_REQUIRED' : undefined),
          error: data.error || `Request failed (${res.status})`,
          data,
        };
      }
      return { ok: true, status: res.status, data };
    } catch (err) {
      return { ok: false, status: 0, error: err && err.message ? err.message : 'Network error', data: {} };
    }
  }

  async function decorateAgent(agent) {
    const shape = agent?.avatar?.shape || 'dot-orb';
    const color = agent?.avatar?.color || '#ff6b57';
    let imageDataUrl = resolveSpriteDataUrl(assetsDir, shape, spriteCache);
    if (agent?.avatar?.imageUrl && typeof agent.avatar.imageUrl === 'string') {
      const origin = getActiveOrigin();
      const rawUrl = agent.avatar.imageUrl;
      if (rawUrl.startsWith('data:image/')) {
        imageDataUrl = rawUrl;
      } else if (origin && rawUrl.startsWith('/')) {
        try {
          const fetchFn = getSessionFetch();
          const r = await fetchFn(`${origin}${rawUrl}`, { method: 'GET', headers: { origin } });
          if (r.ok) {
            const ct = r.headers.get('content-type') || 'image/png';
            const buf = Buffer.from(await r.arrayBuffer());
            if (buf.length > 0 && buf.length < 2 * 1024 * 1024) {
              imageDataUrl = `data:${ct.split(';')[0]};base64,${buf.toString('base64')}`;
            }
          }
        } catch {
          /* fall back to plush sprite */
        }
      }
    }
    return {
      id: String(agent.id || ''),
      name: String(agent.name || 'Agent'),
      tagline: String(agent.tagline || ''),
      chiefOfStaff: Boolean(agent.chiefOfStaff),
      avatar: { shape, color, imageDataUrl },
    };
  }

  async function fetchAgentsSnapshot() {
    const res = await apiRequest('/api/cowork/agents');
    if (!res.ok) {
      return {
        ok: false,
        status: res.status,
        authRequired: res.status === 401 || res.code === 'APP_LOCKED',
        error: res.error,
        agents: cachedAgents,
        codingSprite: resolveSpriteDataUrl(assetsDir, 'hexa', spriteCache),
      };
    }
    const rawAgents = Array.isArray(res.data?.agents) ? res.data.agents : [];
    cachedAgents = await Promise.all(rawAgents.map((a) => decorateAgent(a)));
    const p = readPrefs();
    const pinnedIds = p.pinnedAgentIds === null
      ? cachedAgents.slice(0, 5).map((a) => a.id)
      : p.pinnedAgentIds.filter((id) => cachedAgents.some((a) => a.id === id));
    const pinnedAgents = pinnedIds
      .map((id) => cachedAgents.find((a) => a.id === id))
      .filter(Boolean);
    resizeDockToFit(pinnedAgents.length + (p.includeCodingShortcut ? 1 : 0));
    return {
      ok: true,
      status: 200,
      authRequired: false,
      agents: cachedAgents,
      pinnedAgentIds: pinnedIds,
      pinnedAgents,
      prefs: p,
      theme,
      origin: getActiveOrigin(),
      codingSprite: resolveSpriteDataUrl(assetsDir, 'hexa', spriteCache),
    };
  }

  function resizeDockToFit(shortcutCount) {
    if (!dockWin || dockWin.isDestroyed()) return;
    const p = readPrefs();
    const bounds = computeDockBounds(getWorkArea(), p.edge, shortcutCount, p.collapsed);
    try {
      dockWin.setBounds(bounds, false);
    } catch {}
  }

  function broadcastState() {
    const payload = { prefs: readPrefs(), theme, origin: getActiveOrigin(), target: activeChatTarget };
    if (dockWin && !dockWin.isDestroyed()) {
      try { dockWin.webContents.send('gitu:dock:state', payload); } catch {}
    }
    if (chatWin && !chatWin.isDestroyed()) {
      try { chatWin.webContents.send('gitu:dock:state', payload); } catch {}
    }
  }

  function sameLocalFile(frameUrl, expectedFilePath) {
    try {
      const parsed = new URL(String(frameUrl || ''));
      if (parsed.protocol !== 'file:') return false;
      const actual = path.resolve(fileURLToPath(parsed));
      const expected = path.resolve(expectedFilePath);
      return process.platform === 'win32'
        ? actual.toLowerCase() === expected.toLowerCase()
        : actual === expected;
    } catch {
      return false;
    }
  }

  function attachDockIpc(win, expectedFilePath) {
    const isTrusted = (event) => {
      if (!win || win.isDestroyed() || event.senderFrame !== win.webContents.mainFrame) return false;
      return sameLocalFile(event.senderFrame.url, expectedFilePath);
    };

    const handle = (channel, fn) => {
      win.webContents.ipc.handle(channel, async (event, ...args) => {
        if (!isTrusted(event)) return { ok: false, error: 'Blocked untrusted dock frame.' };
        return fn(...args);
      });
    };

    handle('gitu:dock:snapshot', () => fetchAgentsSnapshot());
    handle('gitu:dock:get-state', () => ({ ...getStatus(), target: activeChatTarget, origin: getActiveOrigin() }));
    handle('gitu:dock:open-chat', (payload) => {
      const mode = payload?.mode === 'manage' ? 'manage' : payload?.mode === 'coding' ? 'coding' : 'chat';
      const agentId = typeof payload?.agentId === 'string' ? payload.agentId : '';
      openQuickChat({ mode, agentId });
      return { ok: true };
    });
    handle('gitu:dock:close-chat', () => {
      closeQuickChat();
      return { ok: true };
    });
    handle('gitu:dock:set-collapsed', (collapsed) => {
      writePrefs({ collapsed: Boolean(collapsed) });
      const p = readPrefs();
      const count = (p.pinnedAgentIds ? p.pinnedAgentIds.length : Math.min(5, cachedAgents.length)) + (p.includeCodingShortcut ? 1 : 0);
      resizeDockToFit(count);
      return { ok: true, prefs: p };
    });
    handle('gitu:dock:set-edge', (edge) => {
      if (!ALLOWED_EDGES.has(edge)) return { ok: false, error: 'Invalid dock edge.' };
      const next = writePrefs({ edge });
      const count = (next.pinnedAgentIds ? next.pinnedAgentIds.length : Math.min(5, cachedAgents.length)) + (next.includeCodingShortcut ? 1 : 0);
      resizeDockToFit(count);
      repositionChatWindow();
      return { ok: true, prefs: next };
    });
    handle('gitu:dock:set-pinned', (ids) => {
      const clean = Array.isArray(ids)
        ? [...new Set(ids.map((id) => String(id || '').trim()).filter(Boolean))].slice(0, 12)
        : [];
      const next = writePrefs({ pinnedAgentIds: clean });
      resizeDockToFit(clean.length + (next.includeCodingShortcut ? 1 : 0));
      return { ok: true, prefs: next };
    });
    handle('gitu:dock:set-coding-shortcut', (include) => {
      const next = writePrefs({ includeCodingShortcut: Boolean(include) });
      const count = (next.pinnedAgentIds ? next.pinnedAgentIds.length : Math.min(5, cachedAgents.length)) + (next.includeCodingShortcut ? 1 : 0);
      resizeDockToFit(count);
      return { ok: true, prefs: next };
    });
    handle('gitu:dock:set-chat-pinned', (alwaysOnTopChat) => {
      const next = writePrefs({ alwaysOnTopChat: Boolean(alwaysOnTopChat) });
      if (chatWin && !chatWin.isDestroyed()) {
        try { chatWin.setAlwaysOnTop(next.alwaysOnTopChat, 'floating'); } catch {}
      }
      return { ok: true, prefs: next };
    });
    handle('gitu:dock:open-main', (payload) => {
      showMainApp();
      if (payload && typeof payload.agentId === 'string' && payload.agentId) {
        openAgentInMainApp(payload.agentId, payload.conversationId || '');
      }
      return { ok: true };
    });
    handle('gitu:dock:read-clipboard', () => ({
      ok: true,
      text: clipboard && typeof clipboard.readText === 'function' ? String(clipboard.readText() || '').slice(0, 4000) : '',
    }));
    handle('gitu:dock:api', (req) => apiRequest(req?.path, { method: req?.method, body: req?.body }));
    handle('gitu:dock:create-agent', async (payload) => {
      const name = String(payload?.name || '').trim().slice(0, 60);
      const tagline = String(payload?.tagline || '').trim().slice(0, 140);
      const systemPrompt = String(payload?.systemPrompt || '').trim() || `You are ${name || 'an AI teammate'}, helpful, concise, and proactive.`;
      const shape = `dot-${spriteNameFromShape(payload?.shape || 'orb')}`;
      const color = /^#[0-9a-f]{6}$/i.test(String(payload?.color || '')) ? String(payload.color) : '#ff6b57';
      if (!name) return { ok: false, error: 'Give your agent a name first.' };
      const res = await apiRequest('/api/cowork/agents', {
        method: 'POST',
        body: {
          name,
          tagline,
          systemPrompt,
          avatar: { shape, color },
          allowShell: true,
          allowWrites: true,
        },
      });
      if (!res.ok) return res;
      const createdId = res.data?.agent?.id;
      if (createdId) {
        const p = readPrefs();
        const base = p.pinnedAgentIds === null
          ? cachedAgents.slice(0, 5).map((a) => a.id)
          : p.pinnedAgentIds;
        writePrefs({ pinnedAgentIds: [...new Set([...base, createdId])].slice(0, 12) });
      }
      const snapshot = await fetchAgentsSnapshot();
      return { ok: true, agent: res.data?.agent, snapshot };
    });
  }

  function ensureDockWindow() {
    if (dockWin && !dockWin.isDestroyed()) return dockWin;
    const p = readPrefs();
    const initialCount = (p.pinnedAgentIds ? p.pinnedAgentIds.length : 4) + (p.includeCodingShortcut ? 1 : 0);
    const bounds = computeDockBounds(getWorkArea(), p.edge, initialCount, p.collapsed);
    dockWin = new BrowserWindow({
      ...bounds,
      frame: false,
      transparent: true,
      backgroundColor: '#00000000',
      resizable: false,
      movable: false,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      skipTaskbar: true,
      alwaysOnTop: true,
      hasShadow: false,
      show: false,
      title: 'Agent Gitu Dock',
      icon: iconPath,
      webPreferences: {
        preload: path.join(__dirname, 'dock-preload.cjs'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    });
    const dockFilePath = path.join(__dirname, 'dock.html');
    try {
      dockWin.setAlwaysOnTop(true, 'floating');
      if (typeof dockWin.setVisibleOnAllWorkspaces === 'function') {
        dockWin.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
      }
    } catch {}
    attachDockIpc(dockWin, dockFilePath);
    let dockShown = false;
    const revealDock = (reason) => {
      if (dockShown || !dockWin || dockWin.isDestroyed() || !readPrefs().enabled) return;
      dockShown = true;
      try {
        dockWin.showInactive ? dockWin.showInactive() : dockWin.show();
        log(`dockWindow shown (${reason}) bounds=${JSON.stringify(dockWin.getBounds())}`);
      } catch (err) {
        log(`dockWindow show failed: ${err && err.message}`);
      }
    };
    dockWin.once('ready-to-show', () => revealDock('ready-to-show'));
    dockWin.webContents.once('did-finish-load', () => revealDock('did-finish-load'));
    setTimeout(() => revealDock('fallback-timer'), 900);
    dockWin.on('closed', () => {
      dockWin = null;
    });
    log(`dockWindow created bounds=${JSON.stringify(bounds)}`);
    void dockWin.loadFile(dockFilePath).catch((err) => {
      log(`dock loadFile failed: ${err && err.message}`);
    });
    return dockWin;
  }

  function repositionChatWindow() {
    if (!chatWin || chatWin.isDestroyed()) return;
    const p = readPrefs();
    const workArea = getWorkArea();
    const dockBounds = dockWin && !dockWin.isDestroyed()
      ? dockWin.getBounds()
      : computeDockBounds(workArea, p.edge, 4, false);
    const bounds = computeChatBounds(workArea, dockBounds, p.edge);
    try { chatWin.setBounds(bounds, false); } catch {}
  }

  function openQuickChat(target = {}) {
    const mode = target.mode === 'manage' ? 'manage' : target.mode === 'coding' ? 'coding' : 'chat';
    const agentId = typeof target.agentId === 'string' ? target.agentId : '';
    const sameTarget = chatWin && !chatWin.isDestroyed() && chatWin.isVisible() &&
      activeChatTarget.mode === mode && activeChatTarget.agentId === agentId;
    if (sameTarget) {
      chatWin.hide();
      return;
    }
    activeChatTarget = { mode, agentId };
    const p = readPrefs();
    const workArea = getWorkArea();
    const dockBounds = dockWin && !dockWin.isDestroyed()
      ? dockWin.getBounds()
      : computeDockBounds(workArea, p.edge, 4, false);
    const bounds = computeChatBounds(workArea, dockBounds, p.edge);

    if (chatWin && !chatWin.isDestroyed()) {
      try {
        chatWin.setBounds(bounds, false);
        chatWin.show();
        chatWin.focus();
      } catch {}
      broadcastState();
      return;
    }

    chatWin = new BrowserWindow({
      ...bounds,
      minWidth: 340,
      minHeight: 420,
      frame: false,
      transparent: true,
      backgroundColor: '#00000000',
      resizable: true,
      movable: true,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      skipTaskbar: true,
      alwaysOnTop: p.alwaysOnTopChat,
      hasShadow: true,
      show: false,
      title: 'Agent Gitu Quick Chat',
      icon: iconPath,
      webPreferences: {
        preload: path.join(__dirname, 'dock-preload.cjs'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    });
    const chatFilePath = path.join(__dirname, 'quick-chat.html');
    try {
      chatWin.setAlwaysOnTop(p.alwaysOnTopChat, 'floating');
      if (typeof chatWin.setVisibleOnAllWorkspaces === 'function') {
        chatWin.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
      }
    } catch {}
    attachDockIpc(chatWin, chatFilePath);
    let chatShown = false;
    const revealChat = () => {
      if (chatShown || !chatWin || chatWin.isDestroyed()) return;
      chatShown = true;
      try {
        chatWin.show();
        chatWin.focus();
        broadcastState();
      } catch {}
    };
    chatWin.once('ready-to-show', revealChat);
    chatWin.webContents.once('did-finish-load', revealChat);
    setTimeout(revealChat, 800);
    chatWin.on('closed', () => {
      chatWin = null;
    });
    void chatWin.loadFile(chatFilePath).catch((err) => {
      log(`quick-chat loadFile failed: ${err && err.message}`);
    });
  }

  function closeQuickChat() {
    if (chatWin && !chatWin.isDestroyed()) {
      try { chatWin.hide(); } catch {}
    }
  }

  function setEnabled(enabled) {
    const next = writePrefs({ enabled: Boolean(enabled) });
    if (next.enabled) {
      const win = ensureDockWindow();
      if (win && !win.isDestroyed()) {
        try { win.showInactive ? win.showInactive() : win.show(); } catch {}
      }
      void fetchAgentsSnapshot();
    } else {
      closeQuickChat();
      if (dockWin && !dockWin.isDestroyed()) {
        try { dockWin.hide(); } catch {}
      }
    }
    return getStatus();
  }

  function setEdge(edge) {
    if (!ALLOWED_EDGES.has(edge)) return getStatus();
    const next = writePrefs({ edge });
    const count = (next.pinnedAgentIds ? next.pinnedAgentIds.length : Math.min(5, cachedAgents.length)) + (next.includeCodingShortcut ? 1 : 0);
    resizeDockToFit(count);
    repositionChatWindow();
    return getStatus();
  }

  function setTheme(nextTheme) {
    if (nextTheme !== 'light' && nextTheme !== 'dark') return;
    theme = nextTheme;
    broadcastState();
  }

  function refresh() {
    broadcastState();
    return fetchAgentsSnapshot();
  }

  function start() {
    const p = readPrefs();
    if (p.enabled) {
      ensureDockWindow();
      void fetchAgentsSnapshot();
    }
    if (!shortcutRegistered && globalShortcut && typeof globalShortcut.register === 'function') {
      try {
        shortcutRegistered = globalShortcut.register('CommandOrControl+Shift+G', () => {
          if (!readPrefs().enabled) {
            setEnabled(true);
          }
          if (chatWin && !chatWin.isDestroyed() && chatWin.isVisible()) {
            closeQuickChat();
          } else {
            const firstId = (readPrefs().pinnedAgentIds || [])[0] || cachedAgents[0]?.id || '';
            openQuickChat({ mode: firstId ? 'chat' : 'manage', agentId: firstId });
          }
        });
      } catch {
        shortcutRegistered = false;
      }
    }
  }

  function destroy() {
    if (shortcutRegistered && globalShortcut && typeof globalShortcut.unregister === 'function') {
      try { globalShortcut.unregister('CommandOrControl+Shift+G'); } catch {}
      shortcutRegistered = false;
    }
    if (chatWin && !chatWin.isDestroyed()) {
      try { chatWin.destroy(); } catch {}
      chatWin = null;
    }
    if (dockWin && !dockWin.isDestroyed()) {
      try { dockWin.destroy(); } catch {}
      dockWin = null;
    }
  }

  function registerMainWindowIpc(webContents) {
    const isTrusted = (event) => {
      if (!webContents || webContents.isDestroyed() || event.senderFrame !== webContents.mainFrame) return false;
      try {
        return isTrustedMainOrigin(new URL(event.senderFrame.url).origin);
      } catch {
        return false;
      }
    };
    const handle = (channel, fn) => {
      webContents.ipc.handle(channel, async (event, ...args) => {
        if (!isTrusted(event)) return { ok: false, error: 'Blocked untrusted frame.' };
        return fn(...args);
      });
    };
    handle('gitu:dock:status', () => getStatus());
    handle('gitu:dock:set-enabled', (enabled) => setEnabled(enabled));
    handle('gitu:dock:set-edge', (edge) => setEdge(edge));
    handle('gitu:dock:open-chat', (payload) => {
      if (!readPrefs().enabled) setEnabled(true);
      openQuickChat(payload || {});
      return getStatus();
    });
    handle('gitu:dock:refresh', () => refresh());
  }

  return {
    getStatus,
    setEnabled,
    setEdge,
    setTheme,
    openQuickChat,
    closeQuickChat,
    refresh,
    start,
    destroy,
    registerMainWindowIpc,
  };
}

module.exports = {
  CODING_SHORTCUT_ID,
  normalizePrefs,
  loadDockPrefs,
  saveDockPrefs,
  spriteNameFromShape,
  computeDockBounds,
  computeChatBounds,
  createDockManager,
};
