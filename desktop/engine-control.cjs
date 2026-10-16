const http = require('node:http');
const { timingSafeEqual } = require('node:crypto');
const { WebSocketServer, WebSocket } = require('ws');

const PROTOCOL = 1;
const BROWSER_METHODS = ['navigate', 'back', 'forward', 'reload', 'click', 'type', 'screenshot', 'focus', 'clickSelector', 'hover', 'scroll', 'fill', 'select', 'press', 'wait', 'evaluate', 'setViewport'];
const blankState = () => ({ available: false, url: '', title: '', canBack: false, canForward: false, loading: false });

/** Private loopback control plane. The public UI API keeps its existing auth. */
async function createEngineControl({ token, status, onStop }) {
  let browserSocket;
  let browserState = blankState();
  let consoleErrors = [];
  let sequence = 0;
  const pending = new Map();
  const authorized = req => {
    const actual = Buffer.from(String(req.headers.authorization || ''));
    const expected = Buffer.from('Bearer ' + token);
    return !req.headers.origin && actual.length === expected.length && timingSafeEqual(actual, expected);
  };
  const server = http.createServer((req, res) => {
    const reply = (code, body) => { res.writeHead(code, { 'content-type': 'application/json', 'cache-control': 'no-store' }); res.end(JSON.stringify(body)); };
    if (!authorized(req)) { reply(403, { error: 'Unauthorized engine client.' }); return; }
    if (req.method === 'GET' && req.url === '/status') { reply(200, { protocol: PROTOCOL, ...status() }); return; }
    if (req.method === 'POST' && req.url === '/shutdown') {
      // Drain the acknowledgement before the engine closes its control socket.
      res.once('finish', () => { void Promise.resolve().then(onStop).catch(error => console.error('[engine] shutdown failed:', error.message)); });
      reply(202, { stopping: true });
      return;
    }
    reply(404, { error: 'Unknown engine operation.' });
  });
  const sockets = new WebSocketServer({ noServer: true, perMessageDeflate: false });
  const rejectPending = (socket, message) => {
    for (const [id, request] of pending) if (request.socket === socket) {
      clearTimeout(request.timer); pending.delete(id); request.reject(new Error(message));
    }
  };
  server.on('upgrade', (req, socket, head) => {
    if (!authorized(req) || req.url !== '/browser') { socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n'); return; }
    sockets.handleUpgrade(req, socket, head, client => sockets.emit('connection', client));
  });
  sockets.on('connection', socket => {
    const previous = browserSocket;
    browserSocket = socket;
    browserState = blankState();
    consoleErrors = [];
    if (previous) { rejectPending(previous, 'The desktop browser connection was replaced. Inspect state before retrying an action.'); previous.close(1000, 'Desktop reconnected'); }
    socket.on('error', () => {});
    socket.on('close', () => {
      rejectPending(socket, 'The desktop interface disconnected. Agent work is saved; reopen Agent Gitu to use its browser. An interrupted browser action was not replayed.');
      if (browserSocket === socket) { browserSocket = undefined; browserState = blankState(); consoleErrors = []; }
    });
    socket.on('message', data => {
      if (socket !== browserSocket) return;
      let message;
      try { message = JSON.parse(data.toString()); } catch { return; }
      if (message.state && typeof message.state === 'object') browserState = { ...message.state, available: true };
      if (Array.isArray(message.consoleErrors)) consoleErrors = message.consoleErrors.slice(-8).map(String);
      if (message.type !== 'result') return;
      const request = pending.get(message.id);
      if (!request || request.socket !== socket) return;
      clearTimeout(request.timer); pending.delete(message.id);
      if (typeof message.error === 'string') request.reject(new Error(message.error));
      else request.resolve(message.result);
    });
  });
  const browser = {
    available: () => browserSocket?.readyState === WebSocket.OPEN && browserState.available,
    state: () => ({ ...browserState, available: Boolean(browser.available()) }),
    consoleErrors: () => consoleErrors.slice(),
  };
  for (const method of BROWSER_METHODS) browser[method] = (...args) => new Promise((resolve, reject) => {
    const socket = browserSocket;
    if (!socket || socket.readyState !== WebSocket.OPEN) { reject(new Error('The desktop browser is disconnected. Reopen Agent Gitu; other engine work can continue.')); return; }
    const id = ++sequence;
    const timer = setTimeout(() => { pending.delete(id); reject(new Error('The desktop browser did not answer. Inspect its state before retrying; the action was not replayed.')); }, 60_000);
    pending.set(id, { socket, resolve, reject, timer });
    socket.send(JSON.stringify({ type: 'request', id, method, args }), error => {
      if (error && pending.delete(id)) { clearTimeout(timer); reject(error); }
    });
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  return {
    port: server.address().port,
    browser,
    async close() {
      for (const socket of sockets.clients) { rejectPending(socket, 'The engine is stopping.'); socket.terminate(); }
      sockets.close();
      await new Promise(resolve => { server.close(resolve); server.closeAllConnections(); });
    },
  };
}

module.exports = { PROTOCOL, BROWSER_METHODS, createEngineControl };
