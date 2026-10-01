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
if (!windows.output.toLowerCase().includes('xfce4-panel')) throw new Error('Full desktop panel is missing.');
const focus = await computer.execute('run_command', { command: 'xdotool search --name "Agent Gitu workspace" windowactivate --sync', timeoutMs: 10_000 });
if (!focus.ok) throw new Error(focus.output);
const typing = await computer.desktopInput({ action: 'type', text: 'printf gitu-desktop-input-check > /workspace/.gitu-desktop-smoke.txt' });
if (!typing.ok) throw new Error(typing.output);
await computer.desktopInput({ action: 'key', key: 'Return' });
const typedFile = await computer.execute('run_command', { command: 'for i in 1 2 3 4 5; do test -f /workspace/.gitu-desktop-smoke.txt && break; sleep 0.2; done; cat /workspace/.gitu-desktop-smoke.txt', timeoutMs: 10_000 });
if (!typedFile.ok || typedFile.output !== 'gitu-desktop-input-check') throw new Error('Keyboard input did not reach the desktop terminal.');
const click = await computer.desktopInput({ action: 'click', x: 1200, y: 500, button: 1 });
if (!click.ok) throw new Error(click.output);
console.log('Full desktop, keyboard and mouse input are working.');
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
