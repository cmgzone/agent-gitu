import { mkdtempSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { CoworkComputer, computerExec } from '../dist/cowork/computer.js';
import { ComposioKeyStore } from '../dist/connections/composio.js';
import { connectDesktopStream } from '../dist/cowork/desktop-stream.js';

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
const tuning = await computer.execute('run_command', { command: 'x11vnc -Q wait,defer,input_skip,nap,sb; xfconf-query -c xfwm4 -p /general/use_compositing', timeoutMs: 10_000 });
if (!tuning.ok || !tuning.output.includes('wait:10') || !tuning.output.includes('defer:0') || !tuning.output.includes('input_skip:1') || !tuning.output.includes('nap:0') || !tuning.output.trim().endsWith('false')) throw new Error('Responsive desktop input settings were not applied: ' + tuning.output);
console.log('Responsive desktop input settings are working.');
const appearance = await computer.execute('run_command', { command: 'xfconf-query -c xsettings -p /Net/IconThemeName; xfconf-query -c xsettings -p /Net/ThemeName; xfconf-query -c xfce4-desktop -lv', timeoutMs: 10_000 });
if (!appearance.ok || !appearance.output.includes('Papirus-Dark') || !appearance.output.includes('Arc-Dark') || !appearance.output.includes('/computer/gitu-wallpaper.svg')) throw new Error('Desktop appearance settings were not applied.');
const chrome = await computer.execute('run_command', { command: 'google-chrome-stable --version; node /computer/open-browser.cjs about:blank; for i in 1 2 3 4 5; do xwininfo -root -tree | grep -q "Google Chrome" && break; sleep 1; done; xwininfo -root -tree', timeoutMs: 15_000 });
if (!chrome.ok || !chrome.output.includes('Google Chrome')) throw new Error('Regular Chrome did not start.');
console.log('Wallpaper, icons and the separate regular Chrome browser are working.');
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
// Negotiate the real stream and send keyboard events over that same channel.
const liveStream = connectDesktopStream(computer.name);
let streamBuffer = Buffer.alloc(0), streamError, readWaiter;
const streamTimer = setTimeout(() => liveStream.destroy(new Error('Private desktop stream timed out.')), 20_000);
liveStream.on('data', (chunk) => { streamBuffer = Buffer.concat([streamBuffer, chunk]); readWaiter?.(); });
liveStream.on('error', (error) => { streamError = error; readWaiter?.(); });
liveStream.on('close', () => { streamError ??= new Error('Private desktop stream closed.'); readWaiter?.(); });
async function streamRead(size) {
  while (streamBuffer.length < size) {
    if (streamError) throw streamError;
    await new Promise((resolve) => { readWaiter = resolve; });
  }
  readWaiter = undefined;
  const value = streamBuffer.subarray(0, size); streamBuffer = streamBuffer.subarray(size);
  return value;
}
try {
  if ((await streamRead(12)).toString() !== 'RFB 003.008\n') throw new Error('Live desktop protocol is missing.');
  liveStream.write(Buffer.from('RFB 003.008\n'));
  const count = (await streamRead(1))[0], security = await streamRead(count);
  if (!security.includes(1)) throw new Error('Private loopback desktop negotiation failed.');
  liveStream.write(Buffer.from([1]));
  if ((await streamRead(4)).readUInt32BE() !== 0) throw new Error('Private desktop rejected its authenticated tunnel.');
  liveStream.write(Buffer.from([1])); // Shared session: never disconnect another viewer.
  const init = await streamRead(24);
  if (init.readUInt16BE(0) !== 1280 || init.readUInt16BE(2) !== 800) throw new Error('Live desktop has the wrong dimensions.');
  const nameLength = init.readUInt32BE(20);
  if (nameLength > 4096) throw new Error('Invalid live desktop name.');
  await streamRead(nameLength);
  const events = [];
  for (const keysym of [...'printf gitu-live-stream-input-check > /workspace/.gitu-stream-smoke.txt'].map((c) => c.codePointAt(0)).concat([0xff0d])) {
    for (const down of [1, 0]) { const event = Buffer.alloc(8); event[0] = 4; event[1] = down; event.writeUInt32BE(keysym, 4); events.push(event); }
  }
  await computer.execute('run_command', { command: 'xdotool search --name "Agent Gitu workspace" windowactivate --sync', timeoutMs: 10_000 });
  liveStream.write(Buffer.concat(events));
  const streamedInput = await computer.execute('run_command', { command: 'for i in 1 2 3 4 5; do test -f /workspace/.gitu-stream-smoke.txt && break; sleep 0.2; done; cat /workspace/.gitu-stream-smoke.txt', timeoutMs: 10_000 });
  if (!streamedInput.ok || streamedInput.output !== 'gitu-live-stream-input-check') throw new Error('Live keyboard input did not reach the shared desktop.');
} finally {
  clearTimeout(streamTimer); liveStream.destroy();
}
console.log('Authenticated live desktop streaming is working.');
const browser = await computer.execute('browse', { action: 'state' });
if (!browser.ok) throw new Error(browser.output);
console.log('Private Chromium browser is working.');
computer.setControl('user', 'Deployment handoff check');
const blocked = await computer.execute('run_command', { command: 'echo should-not-run' });
if (blocked.ok || !blocked.output.includes('user has control')) throw new Error('Agent actions were not blocked during handoff.');
if (!(await computer.desktopInput({ action: 'key', key: 'Escape' })).ok) throw new Error('Human input was blocked during handoff.');
await computer.sleep();
const restored = new CoworkComputer('deployment-runtime-check', path.join(home, 'Cowork'));
if ((await restored.refreshStatus()).state !== 'sleeping') throw new Error('Sleep did not survive app state restoration.');
await computer.start();
computer.setControl('shared');
const afterWake = await computer.execute('run_command', { command: 'xwininfo -root -tree', timeoutMs: 10_000 });
if (!afterWake.ok || !afterWake.output.includes('Google Chrome')) throw new Error('Wake did not preserve the open regular browser.');
console.log('Human handoff and sleep/wake preserve desktop windows.');
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
