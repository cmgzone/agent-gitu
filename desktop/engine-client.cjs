const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { createHash } = require('node:crypto');
const { spawn } = require('node:child_process');
const { WebSocket } = require('ws');
const { PROTOCOL, BROWSER_METHODS } = require('./engine-control.cjs');

function enginePaths(env = process.env) {
  const ownerHome = (process.platform === 'win32' ? env.USERPROFILE : env.HOME) || os.homedir();
  const requestedHome = path.resolve(env.AGENT_GITU_HOME || env.HERMES_HOME_DIR || path.join(ownerHome, 'AgentGitu'));
  // Existing junction/symlink aliases must not acquire independent writer locks.
  let home = requestedHome;
  const missing = [];
  for (;;) {
    try { home = path.join(fs.realpathSync(home), ...missing); break; }
    catch (error) {
      if (error.code !== 'ENOENT') throw error;
      const parent = path.dirname(home);
      if (parent === home) throw error;
      missing.unshift(path.basename(home)); home = parent;
    }
  }
  const key = createHash('sha256').update(process.platform === 'win32' ? home.toLowerCase() : home).digest('hex').slice(0, 24);
  const dir = path.join(ownerHome, '.agent-gitu-engines', key);
  return { home, dir, descriptor: path.join(dir, 'engine.json'), lock: path.join(dir, 'engine-owner.sqlite'), log: path.join(dir, 'engine.log') };
}

function readDescriptor(paths) {
  try {
    const value = JSON.parse(fs.readFileSync(paths.descriptor, 'utf8'));
    if (value.protocol !== PROTOCOL || !Number.isInteger(value.pid) || value.pid <= 0 || !Number.isInteger(value.controlPort) || value.controlPort < 1 || value.controlPort > 65535 || !/^[a-f0-9]{64}$/.test(value.token)) return undefined;
    return value;
  } catch { return undefined; }
}

function controlRequest(descriptor, operation = 'status', timeout = 3_000) {
  return new Promise((resolve, reject) => {
    const request = http.request({ hostname: '127.0.0.1', port: descriptor.controlPort, path: '/' + operation, method: operation === 'shutdown' ? 'POST' : 'GET', headers: { authorization: 'Bearer ' + descriptor.token }, agent: false }, response => {
      let body = '';
      response.setEncoding('utf8');
      response.on('data', data => { body += data; if (body.length > 64 * 1024) request.destroy(new Error('Invalid engine response.')); });
      response.on('end', () => {
        try {
          if (response.statusCode !== 200 && response.statusCode !== 202) throw new Error('Engine rejected the control request.');
          resolve(JSON.parse(body));
        } catch (error) { reject(error); }
      });
      response.on('error', reject);
    });
    request.setTimeout(timeout, () => request.destroy(new Error('The engine did not answer its health check.')));
    request.on('error', reject); request.end();
  });
}

function alive(pid) {
  try { process.kill(pid, 0); return true; } catch (error) { return error.code !== 'ESRCH'; }
}
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

/** Starts once per data home; reconnecting never stops or replays existing work. */
async function connectEngine({ appRoot, executablePath = process.execPath, env = process.env, onStatus = () => {}, startupTimeoutMs = 240_000 }) {
  const paths = enginePaths(env);
  appRoot = path.resolve(appRoot);
  let launched = false;
  let launchFailure;
  const until = Date.now() + startupTimeoutMs;
  while (Date.now() < until) {
    const descriptor = readDescriptor(paths);
    if (descriptor && alive(descriptor.pid)) {
      let state;
      try { state = await controlRequest(descriptor); } catch {
        // A live engine can be busy. Never spawn a duplicate over its database.
        onStatus('Waiting for the running agent engine…'); await sleep(500); continue;
      }
      if (state.pid !== descriptor.pid || state.protocol !== PROTOCOL || state.appRoot !== descriptor.appRoot) throw new Error('The engine identity does not match its local descriptor.');
      if (path.resolve(state.appRoot) !== appRoot) throw new Error('Another Agent Gitu build owns this workspace engine. Quit that build before switching installations; running work has been preserved.');
      if (state.state === 'failed') throw new Error(state.error || 'The agent engine could not start. See ' + paths.log);
      if (state.state === 'stopping') throw new Error('The agent engine is still stopping. Retry once shutdown finishes.');
      if (state.state === 'ready') return new EngineConnection(descriptor, state, paths);
      onStatus(state.message || 'Preparing your agent engine…');
    } else if (launchFailure) {
      throw new Error('The agent engine could not start: ' + launchFailure + '. See ' + paths.log);
    } else if (!launched) {
      fs.mkdirSync(paths.dir, { recursive: true, mode: 0o700 });
      const output = fs.openSync(paths.log, 'a', 0o600);
      let child;
      try {
        child = spawn(executablePath, [path.join(appRoot, 'desktop', 'engine-host.cjs')], {
          cwd: appRoot, detached: true, windowsHide: true,
          env: { ...env, ELECTRON_RUN_AS_NODE: '1' }, stdio: ['ignore', output, output],
        });
      } finally { fs.closeSync(output); }
      child.once('error', error => { launchFailure = error.message; });
      child.once('exit', (code, signal) => { if (code !== 0) launchFailure = signal ? 'terminated by ' + signal : 'exit ' + code; });
      child.unref(); launched = true;
      await sleep(100);
      if (launchFailure) throw new Error(launchFailure);
      onStatus('Starting your agent engine…');
    }
    await sleep(250);
  }
  throw new Error('The agent engine is still unavailable. Your work was not reset. Retry or inspect ' + paths.log);
}

class EngineConnection {
  constructor(descriptor, state, paths) {
    this.descriptor = descriptor; this.port = state.port; this.pid = state.pid; this.paths = paths; this.socket = undefined; this.closed = false;
  }
  attachBrowser(bridge, { onDisconnect = () => {}, onReconnect = () => {} } = {}) {
    this.bridge = bridge;
    let retryTimer;
    let stateTimer;
    let connectedOnce = false;
    const connect = () => {
      if (this.closed) return;
      const socket = new WebSocket(`ws://127.0.0.1:${this.descriptor.controlPort}/browser`, { headers: { authorization: 'Bearer ' + this.descriptor.token }, handshakeTimeout: 5_000, perMessageDeflate: false });
      this.socket = socket;
      let actions = Promise.resolve();
      const snapshot = () => ({ state: bridge.state(), consoleErrors: bridge.consoleErrors?.() || [] });
      const send = message => { if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message)); };
      socket.on('error', () => {});
      socket.on('open', () => {
        if (this.closed) { socket.close(); return; }
        send({ type: 'state', ...snapshot() });
        stateTimer = setInterval(() => { try { send({ type: 'state', ...snapshot() }); } catch {} }, 1_000);
        stateTimer.unref();
        if (connectedOnce) onReconnect();
        connectedOnce = true;
      });
      socket.on('message', data => {
        let message;
        try { message = JSON.parse(data.toString()); } catch { return; }
        if (message.type !== 'request' || !BROWSER_METHODS.includes(message.method) || !Array.isArray(message.args)) return;
        // Browser actions remain ordered. A dropped response is never replayed.
        actions = actions.then(async () => {
          if (socket.readyState !== WebSocket.OPEN || this.closed) return;
          try {
            const method = bridge[message.method];
            if (typeof method !== 'function') throw new Error('This desktop browser action is unavailable.');
            const result = await method.apply(bridge, message.args);
            send({ type: 'result', id: message.id, result, ...snapshot() });
          } catch (error) { send({ type: 'result', id: message.id, error: error.message }); }
        });
      });
      socket.on('close', () => {
        clearInterval(stateTimer);
        if (this.closed) return;
        onDisconnect();
        // Reattach only to this engine. Restarting/replaying tasks is explicit.
        retryTimer = setTimeout(() => { if (alive(this.pid)) connect(); }, 1_000);
        retryTimer.unref();
      });
    };
    this.detachBrowser = () => { clearTimeout(retryTimer); clearInterval(stateTimer); this.socket?.terminate(); };
    connect();
  }
  disconnect() { this.closed = true; this.detachBrowser?.(); }
  status() { return controlRequest(this.descriptor); }
  async stop() {
    if (!alive(this.pid)) { this.disconnect(); return; }
    try { await controlRequest(this.descriptor, 'shutdown'); }
    catch (error) { if (!alive(this.pid)) { this.disconnect(); return; } throw error; }
    const until = Date.now() + 30_000;
    while (Date.now() < until) {
      if (!alive(this.pid)) { this.disconnect(); return; }
      await sleep(100);
    }
    throw new Error('The engine is still draining work. It has not been force-killed. See ' + this.paths.log);
  }
}

module.exports = { enginePaths, readDescriptor, controlRequest, connectEngine, EngineConnection, alive };
