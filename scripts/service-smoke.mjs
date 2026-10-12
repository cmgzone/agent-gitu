import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import path from 'node:path';
import os from 'node:os';

// Native service tests belong on disposable CI machines. They must never adopt
// or replace an existing owner's installed service.
if (process.env.CI !== 'true' || process.env.GITHUB_ACTIONS !== 'true') throw new Error('Run native service validation on a disposable GitHub Actions runner.');
const platform = process.platform;
const probe =
  platform === 'win32'
    ? ['sc.exe', ['query', 'AgentGituRuntime']]
    : platform === 'linux'
      ? ['systemctl', ['cat', 'agent-gitu.service']]
      : ['launchctl', ['print', 'system/dev.agentgitu.runtime']];
const existing = spawnSync(probe[0], probe[1], { encoding: 'utf8', windowsHide: true });
if (existing.error) throw existing.error;
if (existing.status === 0) throw new Error('Refusing to replace an existing Agent Gitu service.');
const root = mkdtempSync(path.join(os.tmpdir(), 'gitu-service-ci-'));
const data = path.join(root, 'owner-data'),
  workspace = path.join(data, 'Workspace');
mkdirSync(workspace, { recursive: true, mode: 0o700 });
writeFileSync(path.join(data, 'preservation-marker'), 'preserve');
if (platform === 'win32') execFileSync('icacls.exe', [root, '/grant', '*S-1-5-19:(OI)(CI)M', '/T'], { windowsHide: true, stdio: 'pipe' });
const port = await new Promise((resolve, reject) => {
  const listener = createServer();
  listener.once('error', reject);
  listener.listen(0, '127.0.0.1', () => {
    const address = listener.address();
    listener.close((error) => (error ? reject(error) : resolve(address.port)));
  });
});
const cli = path.resolve('dist/cli.js');
const flags = [
  '--data-dir',
  data,
  '--workspace',
  workspace,
  '--host',
  '127.0.0.1',
  '--port',
  String(port),
  ...(platform === 'win32' ? [] : ['--system', '--owner', os.userInfo().username]),
];
function service(action) {
  const args = [cli, 'service', action, ...flags];
  return execFileSync(platform === 'win32' ? process.execPath : 'sudo', platform === 'win32' ? args : ['-n', process.execPath, ...args], {
    encoding: 'utf8',
    windowsHide: true,
    timeout: 120000,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}
async function healthy(expected) {
  const deadline = Date.now() + 60000;
  do {
    let running = false;
    try {
      running = (await fetch(`http://127.0.0.1:${port}/api/auth/status`, { signal: AbortSignal.timeout(2000) })).ok;
    } catch {}
    if (running === expected) return;
    await new Promise((resolve) => setTimeout(resolve, 500));
  } while (Date.now() < deadline);
  throw new Error(expected ? 'Installed service never became healthy.' : 'Stopped service still accepts requests.');
}
let installed = false,
  running = false;
try {
  service('install');
  installed = true;
  service('start');
  running = true;
  await healthy(true);
  const status = service('status');
  if (!status.trim()) throw new Error('Service status was empty.');
  service('stop');
  running = false;
  await healthy(false);
  service('start');
  running = true;
  await healthy(true);
  if (readFileSync(path.join(data, 'preservation-marker'), 'utf8') !== 'preserve') throw new Error('Service restart changed owner data.');
  service('stop');
  running = false;
  await healthy(false);
  service('uninstall');
  installed = false;
  if (readFileSync(path.join(data, 'preservation-marker'), 'utf8') !== 'preserve') throw new Error('Service removal changed owner data.');
  console.log('Native service install, start, status, stop, restart and data-preserving uninstall passed.');
} finally {
  if (running) service('stop');
  if (installed) service('uninstall');
}
