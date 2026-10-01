import { mkdtempSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { CoworkComputer, computerExec } from '../dist/cowork/computer.js';
import { ComposioKeyStore } from '../dist/connections/composio.js';

const home = process.env.AGENT_GITU_HOME;
if (!home || !process.env.AGENT_GITU_COMPUTER_BROKER_URL) throw new Error('Hosted desktop runtime is not configured.');
console.log('Verifying private desktop runtime connectivity.');
await computerExec(['info', '--format', '{{.ServerVersion}}']);
// A separate persistent test desktop avoids interrupting an active teammate.
const computer = new CoworkComputer('deployment-runtime-check', path.join(home, 'Cowork'));
console.log('Preparing the private desktop image; the first build can take several minutes.');
await computer.start();
const command = await computer.execute('run_command', { command: 'id -u', timeoutMs: 10_000 });
if (!command.ok || command.output.trim() !== '1001') throw new Error('Desktop does not run as its unprivileged agent user.');
const windows = await computer.execute('run_command', { command: 'xwininfo -root -tree', timeoutMs: 10_000 });
if (!windows.ok || !windows.output.includes('Agent Gitu workspace')) throw new Error('Desktop workspace window is missing.');
const frame = await computer.desktopScreenshot();
if (!frame.ok) throw new Error(frame.output);
const png = Buffer.from(frame.output, 'base64');
if (png.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') throw new Error('Desktop did not return a PNG screen.');
console.log(JSON.stringify({ desktop: 'working', width: png.readUInt32BE(16), height: png.readUInt32BE(20), bytes: png.length, unprivileged: true }));
const browser = await computer.execute('browse', { action: 'state' });
if (!browser.ok) throw new Error(browser.output);
console.log('Private Chromium browser is working.');
await computer.stop();
await computer.start();
const restarted = await computer.desktopScreenshot();
if (!restarted.ok) throw new Error('Desktop did not survive a stop/start: ' + restarted.output);
await computer.stop();
console.log('Desktop stop/start is working.');

const temporaryHome = mkdtempSync(path.join(tmpdir(), 'gitu-encryption-check-'));
try {
  process.env.AGENT_GITU_HOME = temporaryHome;
  const keys = new ComposioKeyStore('linux');
  keys.save('disposable-deployment-encryption-check');
  if (new ComposioKeyStore('linux').read() !== 'disposable-deployment-encryption-check') throw new Error('Hosted encrypted key storage failed.');
  console.log('Hosted integration key encryption and restore are working.');
} finally {
  process.env.AGENT_GITU_HOME = home;
  rmSync(temporaryHome, { recursive: true, force: true });
}
console.log(JSON.stringify({ ownerAccountPreserved: existsSync(path.join(home, 'Settings', 'app-password.json')) }));
