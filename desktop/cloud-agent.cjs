const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');

const DEFAULT_PIKPAM_API_BASE = 'https://pikpam.com';
const LOCAL_HOSTNAMES = new Set(['127.0.0.1', 'localhost', '[::1]']);

function resolvePikpamApiBase(env = process.env) {
  const raw = env && typeof env.PIKPAM_API_BASE_URL === 'string' ? env.PIKPAM_API_BASE_URL.trim() : '';
  if (!raw) return DEFAULT_PIKPAM_API_BASE;
  try {
    const parsed = new URL(raw);
    const isLocalHttp = parsed.protocol === 'http:' && LOCAL_HOSTNAMES.has(parsed.hostname);
    if ((parsed.protocol !== 'https:' && !isLocalHttp) || parsed.username || parsed.password) {
      return DEFAULT_PIKPAM_API_BASE;
    }
    return parsed.origin;
  } catch {
    return DEFAULT_PIKPAM_API_BASE;
  }
}

function validateCloudAgentUrl(rawUrl) {
  if (typeof rawUrl !== 'string' || !rawUrl.trim() || rawUrl.length > 2048) return null;
  try {
    const parsed = new URL(rawUrl.trim());
    const isLocalHttp = parsed.protocol === 'http:' && LOCAL_HOSTNAMES.has(parsed.hostname);
    if ((parsed.protocol !== 'https:' && !isLocalHttp) || parsed.username || parsed.password) {
      return null;
    }
    return { href: parsed.toString(), origin: parsed.origin };
  } catch {
    return null;
  }
}

function normalizePrefs(raw) {
  const obj = raw && typeof raw === 'object' ? raw : {};
  return {
    lastMode: obj.lastMode === 'cloud' ? 'cloud' : 'local',
    activeCloudVpsId: typeof obj.activeCloudVpsId === 'string' && obj.activeCloudVpsId.trim()
      ? obj.activeCloudVpsId.trim()
      : null,
    autoConnectCloud: obj.autoConnectCloud === true,
  };
}

function loadCloudAgentPrefs(prefsPath) {
  if (!prefsPath || typeof prefsPath !== 'string') return normalizePrefs(null);
  try {
    if (!fs.existsSync(prefsPath)) return normalizePrefs(null);
    return normalizePrefs(JSON.parse(fs.readFileSync(prefsPath, 'utf8')));
  } catch {
    return normalizePrefs(null);
  }
}

function saveCloudAgentPrefs(prefsPath, prefs) {
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

function sanitizeInstance(inst) {
  if (!inst || typeof inst !== 'object') return null;
  const prov = inst.provisioning && typeof inst.provisioning === 'object' ? inst.provisioning : null;
  return {
    id: typeof inst.id === 'string' ? inst.id : String(inst.id || ''),
    name: typeof inst.name === 'string' ? inst.name : 'Cloud Agent',
    plan: typeof inst.plan === 'string' ? inst.plan : '',
    status: typeof inst.status === 'string' ? inst.status : 'UNKNOWN',
    ipAddress: typeof inst.ipAddress === 'string' ? inst.ipAddress : null,
    domain: typeof inst.domain === 'string' ? inst.domain : null,
    customDomain: typeof inst.customDomain === 'string' ? inst.customDomain : null,
    agentUrl: typeof inst.agentUrl === 'string' ? inst.agentUrl : null,
    expiresAt: inst.expiresAt || null,
    provisioning: prov ? {
      state: typeof prov.state === 'string' ? prov.state : 'PROVISIONING',
      attentionReason: typeof prov.attentionReason === 'string' ? prov.attentionReason : null,
      customerMessage: typeof prov.customerMessage === 'string' ? prov.customerMessage : '',
    } : null,
  };
}

async function readJsonSafe(response) {
  const text = await response.text().catch(() => '');
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return { error: text };
  }
}

function createCloudAgentManager(options = {}) {
  const getLocalOrigin = typeof options.getLocalOrigin === 'function' ? options.getLocalOrigin : () => '';
  const getPrefsPath = typeof options.getPrefsPath === 'function' ? options.getPrefsPath : () => '';
  const getPikpamToken = typeof options.getPikpamToken === 'function' ? options.getPikpamToken : async () => '';
  const getSessionFetch = typeof options.getSessionFetch === 'function'
    ? options.getSessionFetch
    : () => (...args) => globalThis.fetch(...args);
  const navigateToUrl = typeof options.navigateToUrl === 'function' ? options.navigateToUrl : async () => {};
  const openExternal = typeof options.openExternal === 'function' ? options.openExternal : async () => {};
  const onTargetChange = typeof options.onTargetChange === 'function' ? options.onTargetChange : () => {};
  const getFetch = () => options.fetchImpl || globalThis.fetch;
  const apiBase = () => validateCloudAgentUrl(options.apiBaseUrl)?.origin || resolvePikpamApiBase(process.env);

  let activeTarget = { mode: 'local' };
  let cachedInstances = [];
  let cachedPrefs = null;

  function readPrefs() {
    if (!cachedPrefs) cachedPrefs = loadCloudAgentPrefs(getPrefsPath());
    return cachedPrefs;
  }

  function writePrefs(patch) {
    const merged = { ...readPrefs(), ...patch };
    cachedPrefs = saveCloudAgentPrefs(getPrefsPath(), merged);
    return cachedPrefs;
  }

  function pikHeaders(token) {
    return {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    };
  }

  async function apiGet(pathName, token) {
    const fetchFn = getFetch();
    const res = await fetchFn(`${apiBase()}${pathName}`, {
      method: 'GET',
      headers: pikHeaders(token),
    });
    const data = await readJsonSafe(res);
    return { ok: res.ok, status: res.status, data };
  }

  async function apiPost(pathName, token, body) {
    const fetchFn = getFetch();
    const res = await fetchFn(`${apiBase()}${pathName}`, {
      method: 'POST',
      headers: pikHeaders(token),
      body: JSON.stringify(body || {}),
    });
    const data = await readJsonSafe(res);
    return { ok: res.ok, status: res.status, data };
  }

  function getTarget() {
    return activeTarget;
  }

  function isTrustedOrigin(origin) {
    if (!origin || typeof origin !== 'string') return false;
    const localOrigin = getLocalOrigin();
    if (localOrigin && origin === localOrigin) return true;
    return activeTarget.mode === 'cloud' && Boolean(activeTarget.origin) && origin === activeTarget.origin;
  }

  function getStatus() {
    const prefs = readPrefs();
    return {
      mode: activeTarget.mode,
      activeCloud: activeTarget.mode === 'cloud' ? { ...activeTarget } : null,
      autoConnectCloud: prefs.autoConnectCloud,
      instances: [...cachedInstances],
    };
  }

  async function refresh() {
    const prefs = readPrefs();
    const token = String((await getPikpamToken()) || '').trim();
    if (!token) {
      return {
        signedIn: false,
        authExpired: false,
        mode: activeTarget.mode,
        activeCloud: activeTarget.mode === 'cloud' ? { ...activeTarget } : null,
        autoConnectCloud: prefs.autoConnectCloud,
        user: null,
        wallet: null,
        instances: [],
        plans: [],
        freeClaim: null,
      };
    }

    const [creditsRes, instancesRes, plansRes, freeClaimRes] = await Promise.all([
      apiGet('/api/user/credits', token).catch(() => ({ ok: false, status: 503, data: {} })),
      apiGet('/api/cloud/vps/my-instances', token).catch(() => ({ ok: false, status: 503, data: {} })),
      apiGet('/api/cloud/plans', token).catch(() => ({ ok: false, status: 503, data: {} })),
      apiGet('/api/cloud/vps/free-claim', token).catch(() => ({ ok: false, status: 503, data: {} })),
    ]);

    if (creditsRes.status === 401 || instancesRes.status === 401) {
      return {
        signedIn: false,
        authExpired: true,
        mode: activeTarget.mode,
        activeCloud: activeTarget.mode === 'cloud' ? { ...activeTarget } : null,
        autoConnectCloud: prefs.autoConnectCloud,
        user: null,
        wallet: null,
        instances: [],
        plans: Array.isArray(plansRes.data?.plans) ? plansRes.data.plans : [],
        freeClaim: null,
      };
    }

    const rawInstances = Array.isArray(instancesRes.data?.instances) ? instancesRes.data.instances : [];
    cachedInstances = rawInstances.map(sanitizeInstance).filter(Boolean);
    onTargetChange();

    const credits = creditsRes.data?.credits && typeof creditsRes.data.credits === 'object'
      ? creditsRes.data.credits
      : null;

    return {
      signedIn: true,
      authExpired: false,
      mode: activeTarget.mode,
      activeCloud: activeTarget.mode === 'cloud' ? { ...activeTarget } : null,
      autoConnectCloud: prefs.autoConnectCloud,
      user: creditsRes.data?.user || null,
      wallet: credits,
      instances: [...cachedInstances],
      plans: Array.isArray(plansRes.data?.plans) ? plansRes.data.plans : [],
      freeClaim: freeClaimRes.ok ? freeClaimRes.data : null,
    };
  }

  async function authenticateCloudSession(cloudOrigin, pikpamToken, registrationToken) {
    const sessionFetch = getSessionFetch();
    const statusRes = await sessionFetch(`${cloudOrigin}/api/auth/status`, {
      method: 'GET',
      headers: { origin: cloudOrigin },
    }).catch(() => null);

    if (statusRes && statusRes.ok) {
      const statusData = await readJsonSafe(statusRes);
      if (statusData && statusData.authenticated === true) {
        return { ok: true };
      }
    }

    const startRes = await sessionFetch(`${cloudOrigin}/api/auth/pikrouter/start`, {
      method: 'POST',
      headers: {
        origin: cloudOrigin,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ redirectPath: '/callback' }),
    });
    const startData = await readJsonSafe(startRes);
    if (!startRes.ok || !startData.state) {
      return {
        ok: false,
        error: startData.error || 'Could not initialize Pikpam sign-in on your Cloud Agent.',
      };
    }

    const loginBody = {
      token: pikpamToken,
      state: startData.state,
      ...(typeof registrationToken === 'string' && registrationToken.trim()
        ? { registrationToken: registrationToken.trim() }
        : {}),
    };

    const authRes = await sessionFetch(`${cloudOrigin}/api/auth/pikrouter`, {
      method: 'POST',
      headers: {
        origin: cloudOrigin,
        'content-type': 'application/json',
      },
      body: JSON.stringify(loginBody),
    });
    const authData = await readJsonSafe(authRes);
    if (!authRes.ok || authData.ok === false) {
      return {
        ok: false,
        error: authData.error || 'Could not sign into your Cloud Agent automatically.',
      };
    }

    return { ok: true };
  }

  async function connectCloud(vpsId) {
    if (typeof vpsId !== 'string' || !vpsId.trim() || vpsId.length > 128) {
      return { ok: false, error: 'Select a valid Cloud Agent instance.' };
    }
    const cleanId = vpsId.trim();
    const token = String((await getPikpamToken()) || '').trim();
    if (!token) {
      return { ok: false, code: 'NOT_SIGNED_IN', error: 'Sign in with your Pikpam account first.' };
    }

    const accessRes = await apiGet(`/api/cloud/vps/instances/${encodeURIComponent(cleanId)}/access`, token);
    if (!accessRes.ok) {
      return {
        ok: false,
        code: accessRes.status === 401 ? 'NOT_SIGNED_IN' : 'ACCESS_ERROR',
        error: accessRes.data?.error || 'Could not load Cloud Agent connection details.',
      };
    }

    const access = accessRes.data || {};
    const status = String(access.status || '').toUpperCase();
    if (status !== 'ACTIVE') {
      return {
        ok: false,
        code: 'NOT_READY',
        status,
        error: 'Your Cloud Agent is still provisioning. It will be ready to connect once active.',
      };
    }

    const validated = validateCloudAgentUrl(access.agentUrl);
    if (!validated) {
      return { ok: false, error: 'This Cloud Agent does not have a valid HTTPS endpoint yet.' };
    }

    const authOutcome = await authenticateCloudSession(validated.origin, token, access.registrationToken);
    if (!authOutcome.ok) {
      return { ok: false, error: authOutcome.error };
    }

    activeTarget = {
      mode: 'cloud',
      vpsId: typeof access.vpsId === 'string' && access.vpsId ? access.vpsId : cleanId,
      name: typeof access.name === 'string' && access.name ? access.name : 'Cloud Agent',
      agentUrl: validated.href,
      origin: validated.origin,
    };

    writePrefs({
      lastMode: 'cloud',
      activeCloudVpsId: activeTarget.vpsId,
    });
    onTargetChange();

    await navigateToUrl(`${validated.origin}/`);
    return {
      ok: true,
      mode: 'cloud',
      activeCloud: { ...activeTarget },
    };
  }

  async function switchToLocal(optionsArg = {}) {
    const navigate = optionsArg.navigate !== false;
    activeTarget = { mode: 'local' };
    writePrefs({ lastMode: 'local' });
    onTargetChange();
    const localOrigin = getLocalOrigin();
    if (navigate && localOrigin) {
      await navigateToUrl(`${localOrigin}/`);
    }
    return { ok: true, mode: 'local' };
  }

  function resetToLocalSync() {
    if (activeTarget.mode === 'local') return;
    activeTarget = { mode: 'local' };
    writePrefs({ lastMode: 'local' });
    onTargetChange();
  }

  function shouldAutoConnectOnLaunch() {
    const prefs = readPrefs();
    return prefs.autoConnectCloud === true || prefs.lastMode === 'cloud';
  }

  async function tryAutoConnectOnLaunch() {
    if (!shouldAutoConnectOnLaunch()) return { attempted: false };
    try {
      const state = await refresh();
      if (!state.signedIn || !Array.isArray(state.instances) || !state.instances.length) {
        return { attempted: false };
      }
      const prefs = readPrefs();
      const activeList = state.instances.filter((item) => String(item.status || '').toUpperCase() === 'ACTIVE');
      if (!activeList.length) return { attempted: false };
      const preferred = activeList.find((item) => item.id === prefs.activeCloudVpsId) || activeList[0];
      const result = await connectCloud(preferred.id);
      return { attempted: true, ...result };
    } catch {
      return { attempted: false };
    }
  }

  async function claimFreeCloud(params = {}) {
    const token = String((await getPikpamToken()) || '').trim();
    if (!token) return { ok: false, code: 'NOT_SIGNED_IN', error: 'Sign in with your Pikpam account first.' };
    const instanceName = typeof params.instanceName === 'string' && params.instanceName.trim()
      ? params.instanceName.trim().slice(0, 64)
      : undefined;
    const res = await apiPost('/api/cloud/vps/free-claim', token, instanceName ? { instanceName } : {});
    if (!res.ok) {
      return { ok: false, error: res.data?.error || 'Could not claim free Cloud Agent.' };
    }
    const state = await refresh();
    return { ok: true, claimed: res.data, state };
  }

  async function buyCloud(params = {}) {
    const token = String((await getPikpamToken()) || '').trim();
    if (!token) return { ok: false, code: 'NOT_SIGNED_IN', error: 'Sign in with your Pikpam account first.' };
    const planId = typeof params.planId === 'string' ? params.planId.trim() : '';
    if (!planId) return { ok: false, error: 'Select a Cloud Agent plan.' };
    const paymentMethod = String(params.paymentMethod || 'WALLET').toUpperCase();
    if (paymentMethod !== 'WALLET' && paymentMethod !== 'PAYSTACK') {
      return { ok: false, error: 'Unsupported payment method.' };
    }
    const instanceName = typeof params.instanceName === 'string' && params.instanceName.trim()
      ? params.instanceName.trim().slice(0, 64)
      : undefined;

    const payload = {
      planId,
      ...(instanceName ? { instanceName } : {}),
      paymentMethod,
      ...(paymentMethod === 'WALLET'
        ? { idempotencyKey: randomUUID() }
        : { countryCode: typeof params.countryCode === 'string' && params.countryCode.trim() ? params.countryCode.trim() : 'US' }),
    };

    const res = await apiPost('/api/cloud/vps/order', token, payload);
    if (!res.ok) {
      return {
        ok: false,
        code: res.status === 402 ? 'INSUFFICIENT_CREDITS' : 'ORDER_FAILED',
        error: res.data?.error || 'Cloud Agent order could not be completed.',
      };
    }

    if (paymentMethod === 'WALLET') {
      const state = await refresh();
      return { ok: true, paymentMethod: 'WALLET', order: res.data, state };
    }

    const checkoutUrl = validateCloudAgentUrl(res.data?.authorizationUrl);
    if (!checkoutUrl) {
      return { ok: false, error: 'Invalid payment checkout link returned by Pikpam.' };
    }
    await openExternal(checkoutUrl.href);
    return {
      ok: true,
      paymentMethod: 'PAYSTACK',
      pendingPayment: true,
      reference: res.data?.reference || null,
      authorizationUrl: checkoutUrl.href,
    };
  }

  async function verifyCloudOrder(reference) {
    if (typeof reference !== 'string' || !reference.trim()) {
      return { ok: false, error: 'Payment reference is required.' };
    }
    const token = String((await getPikpamToken()) || '').trim();
    if (!token) return { ok: false, code: 'NOT_SIGNED_IN', error: 'Sign in with your Pikpam account first.' };
    const res = await apiPost('/api/cloud/vps/verify-order', token, { reference: reference.trim() });
    if (!res.ok) {
      return { ok: false, error: res.data?.error || 'Payment verification failed.' };
    }
    const state = await refresh();
    return { ok: true, verification: res.data, state };
  }

  function setAutoConnect(enabled) {
    const next = writePrefs({ autoConnectCloud: Boolean(enabled) });
    return { ok: true, autoConnectCloud: next.autoConnectCloud };
  }

  async function openTopup() {
    const target = validateCloudAgentUrl(`${apiBase()}/portal/ledger`);
    if (!target) return { ok: false, error: 'Invalid Pikpam top-up URL.' };
    await openExternal(target.href);
    return { ok: true };
  }

  return {
    getTarget,
    isTrustedOrigin,
    getStatus,
    refresh,
    connectCloud,
    switchToLocal,
    resetToLocalSync,
    shouldAutoConnectOnLaunch,
    tryAutoConnectOnLaunch,
    claimFreeCloud,
    buyCloud,
    verifyCloudOrder,
    setAutoConnect,
    openTopup,
  };
}

function registerCloudAgent(webContents, manager) {
  const isTrustedEvent = (event) => {
    if (!webContents || webContents.isDestroyed() || event.senderFrame !== webContents.mainFrame) return false;
    try {
      const origin = new URL(event.senderFrame.url).origin;
      return manager.isTrustedOrigin(origin);
    } catch {
      return false;
    }
  };

  const handle = (channel, fn) => {
    webContents.ipc.handle(channel, async (event, ...args) => {
      if (!isTrustedEvent(event)) return { ok: false, error: 'Blocked untrusted frame.' };
      return fn(...args);
    });
  };

  handle('gitu:cloud-agent:status', () => manager.getStatus());
  handle('gitu:cloud-agent:refresh', () => manager.refresh());
  handle('gitu:cloud-agent:connect', (vpsId) => manager.connectCloud(vpsId));
  handle('gitu:cloud-agent:switch-local', () => manager.switchToLocal());
  handle('gitu:cloud-agent:claim-free', (params) => manager.claimFreeCloud(params));
  handle('gitu:cloud-agent:buy', (params) => manager.buyCloud(params));
  handle('gitu:cloud-agent:verify-order', (reference) => manager.verifyCloudOrder(reference));
  handle('gitu:cloud-agent:set-auto-connect', (enabled) => manager.setAutoConnect(enabled));
  handle('gitu:cloud-agent:open-topup', () => manager.openTopup());
}

module.exports = {
  DEFAULT_PIKPAM_API_BASE,
  resolvePikpamApiBase,
  validateCloudAgentUrl,
  loadCloudAgentPrefs,
  saveCloudAgentPrefs,
  sanitizeInstance,
  createCloudAgentManager,
  registerCloudAgent,
};
