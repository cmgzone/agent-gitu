export interface PushTarget {
  server: string;
  target: 'run' | 'cowork' | 'home';
  targetId: string;
  companyId?: string;
}
export interface PushWorkspace {
  enabled: boolean;
  workspaceId: string;
}

/** Notification payloads can select only a workspace previously enabled here. */
export function pushTarget(data: Record<string, unknown>, workspaces: Record<string, PushWorkspace>): PushTarget | undefined {
  const target = data.target,
    id = data.targetId,
    companyId = data.companyId;
  if (
    !['run', 'cowork', 'home'].includes(String(target)) ||
    typeof id !== 'string' ||
    (target !== 'home' && !/^[\w-]{1,150}$/.test(id)) ||
    (companyId !== undefined && (typeof companyId !== 'string' || !/^[\w-]{1,150}$/.test(companyId)))
  )
    return;
  const entry = Object.entries(workspaces).find(([, value]) => value.enabled && value.workspaceId === data.workspaceId);
  if (!entry) return;
  return { server: entry[0], target: target as PushTarget['target'], targetId: id, ...(typeof companyId === 'string' ? { companyId } : {}) };
}

/** HTTP stays inside the authenticated WebView; native code receives no cookie. */
export const PUSH_BRIDGE_JS = String.raw`
(function () {
  if (window.top !== window || window.gituAndroidPush || !window.ReactNativeWebView) return;
  var pending = {}, sequence = 0, page = Date.now().toString(36) + '-' + Math.random().toString(36).slice(2), nonce = '__GITU_PUSH_NONCE__';
  function native(action, payload) {
    return new Promise(function (resolve, reject) {
      var id = 'push-' + page + '-' + (++sequence), timer = setTimeout(function () { delete pending[id]; reject(new Error('Notification request timed out.')); }, 60000);
      pending[id] = { resolve: resolve, reject: reject, timer: timer };
      window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'gitu-push', nonce: nonce, id: id, action: action, payload: payload || {} }));
    });
  }
  window.__gituPushReply = function (message) {
    var request = pending[message.id]; if (!request) return;
    delete pending[message.id]; clearTimeout(request.timer);
    if (message.error) request.reject(new Error(message.error)); else request.resolve(message.result);
  };
  async function api(method, device, test) {
    var url = '/api/mobile/push' + (test ? '/test' : '') + (method === 'GET' ? '?deviceId=' + encodeURIComponent(device.deviceId) : '');
    var response = await fetch(url, { method: method, credentials: 'same-origin', headers: { 'content-type': 'application/json' },
      body: method === 'GET' ? undefined : JSON.stringify(device) });
    var data = await response.json(); if (!response.ok) throw new Error(data.error || 'Could not update notifications.'); return data;
  }
  async function register(device) {
    var saved = await api('POST', { deviceId: device.deviceId, token: device.token });
    await native('remember', { enabled: true, workspaceId: saved.workspaceId }); return saved;
  }
  window.gituAndroidPush = {
    status: async function () { var device = await native('status'); var saved = await api('GET', device); return Object.assign({}, device, saved); },
    enable: async function () { return register(await native('enable')); },
    disable: async function () { var device = await native('status'); var saved = await api('DELETE', device); await native('remember', { enabled: false, workspaceId: saved.workspaceId }); return saved; },
    test: async function () { return api('POST', await native('status'), true); },
    sync: async function () {
      var device = await native('status'); if (!device.enabled || !device.supported) return;
      if (device.permission !== 'granted') return window.gituAndroidPush.disable();
      return register(await native('token'));
    },
    refresh: async function (token) { var device = await native('status'); if (device.enabled && device.permission === 'granted') return register({ deviceId: device.deviceId, token: token }); }
  };
})();
true;
`;

export function pushBridgeScript(nonce: string): string {
  if (!/^[a-f0-9]{64}$/.test(nonce)) throw new Error('Invalid notification bridge nonce.');
  return PUSH_BRIDGE_JS.replace('__GITU_PUSH_NONCE__', nonce);
}
