// Headless entry point. It runs in its own process, including when Electron's
// interface exits or crashes. No module in this process imports Electron APIs.
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { randomBytes } = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');
const { enginePaths } = require('./engine-client.cjs');
const { PROTOCOL, createEngineControl } = require('./engine-control.cjs');

async function startEngine() {
  const paths = enginePaths();
  const appRoot = path.resolve(__dirname, '..');
  fs.mkdirSync(paths.dir, { recursive: true, mode: 0o700 });
  // SQLite's OS-backed lock is atomic across simultaneous launches and releases
  // after a crash. No stale PID file can start duplicate workspace writers.
  const ownership = new DatabaseSync(paths.lock);
  try { ownership.exec('PRAGMA busy_timeout=0; BEGIN EXCLUSIVE; CREATE TABLE IF NOT EXISTS owner (id INTEGER)'); }
  catch (error) { ownership.close(); if (/locked|busy/i.test(error.message)) return; throw error; }
  const token = randomBytes(32).toString('hex');
  let runtime;
  let control;
  let stopping;
  const state = { pid: process.pid, appRoot, version: require('../package.json').version, state: 'starting', message: 'Opening your workspace…', port: 0 };
  const cleanup = () => {
    try { if (JSON.parse(fs.readFileSync(paths.descriptor, 'utf8')).token === token) fs.unlinkSync(paths.descriptor); } catch {}
    try { ownership.close(); } catch {}
  };
  const stop = (exitCode = 0) => stopping ||= (async () => {
    state.state = 'stopping';
    console.log('[engine] stopping', process.pid);
    try { await runtime?.stop(); } finally {
      await control?.close(); cleanup(); process.exit(exitCode);
    }
  })();
  process.once('exit', cleanup);
  process.on('SIGINT', () => { void stop(); });
  process.on('SIGTERM', () => { void stop(); });
  process.on('uncaughtException', error => { console.error('[engine] uncaught exception', error.stack); void stop(1); });
  process.on('unhandledRejection', error => { console.error('[engine] unhandled rejection', error?.stack || error); });
  try {
    control = await createEngineControl({ token, status: () => state, onStop: stop });
    const descriptor = { protocol: PROTOCOL, pid: process.pid, controlPort: control.port, token, appRoot };
    const temporary = paths.descriptor + '.' + process.pid + '.tmp';
    fs.writeFileSync(temporary, JSON.stringify(descriptor), { mode: 0o600 }); fs.renameSync(temporary, paths.descriptor);
    console.log('[engine] starting', JSON.stringify({ pid: process.pid, appRoot }));
    const dist = path.join(appRoot, 'dist');
    const { HermesServer } = await import(pathToFileURL(path.join(dist, 'server', 'server.js')).href);
    const { ensureHermesHome } = await import(pathToFileURL(path.join(dist, 'workspace', 'home.js')).href);
    const home = ensureHermesHome();
    state.message = 'Preparing your workspace…';
    const config = { cwd: process.env.HERMES_CWD || home.workspace, port: Number(process.env.HERMES_UI_PORT || 8321), browser: control.browser };
    runtime = new HermesServer(config);
    try { state.port = await runtime.start(); } catch (error) {
      if (error.code !== 'EADDRINUSE') throw error;
      runtime = new HermesServer({ ...config, port: 0 }); state.port = await runtime.start();
    }
    state.state = 'ready'; state.message = 'Agent engine ready';
    console.log('[engine] ready', JSON.stringify({ pid: process.pid, port: state.port }));
  } catch (error) {
    state.state = 'failed'; state.error = error.message;
    console.error('[engine] startup failed', error.stack);
    // Release ownership after failed startup, so Retry can recover. The log is
    // retained; no uncertain tool call or task is automatically replayed.
    try { await runtime?.stop(); } catch {}
    await control?.close(); cleanup(); process.exit(1);
  }
}

if (require.main === module) void startEngine().catch(error => { console.error('[engine] fatal', error.stack); process.exitCode = 1; });
module.exports = { startEngine };
