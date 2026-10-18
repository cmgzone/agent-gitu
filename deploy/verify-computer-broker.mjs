import path from 'node:path';
import { tmpdir } from 'node:os';
import { COWORK_COMPUTER_IMAGE, CoworkComputer, computerExec } from '../dist/cowork/computer.js';
import { connectDesktopStream } from '../dist/cowork/desktop-stream.js';

// Run inside the trusted broker container. Only this child process uses the
// loopback URL; no runtime settings or existing teammate desktops are changed.
process.env.AGENT_GITU_COMPUTER_BROKER_URL = 'http://127.0.0.1:8787';
const computer = new CoworkComputer('deployment-broker-check', path.join(tmpdir(), 'gitu-broker-verification'));
console.log('Checking desktop broker and image ' + COWORK_COMPUTER_IMAGE);
await computerExec(['info', '--format', '{{.ServerVersion}}']);
try {
  await computer.start();
  const user = await computer.execute('run_command', { command: 'id -u', timeoutMs: 10_000 });
  if (!user.ok || user.output.trim() !== '1001') throw new Error('Desktop worker is not running as its unprivileged agent user.');
  const screen = await computer.desktopScreenshot();
  if (!screen.ok || !screen.image?.startsWith('data:image/png;base64,')) throw new Error('Desktop screenshot failed.');
  const browser = await computer.execute('browse', { action: 'state' });
  if (!browser.ok) throw new Error('Desktop browser failed: ' + browser.output);
  const stream = connectDesktopStream(computer.name);
  try {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Desktop stream handshake timed out.')), 15_000);
      let bytes = Buffer.alloc(0);
      const fail = error => { clearTimeout(timer); reject(error); };
      stream.once('error', fail);
      stream.once('close', () => fail(new Error('Desktop stream closed before its handshake.')));
      stream.on('data', chunk => {
        bytes = Buffer.concat([bytes, chunk]);
        if (bytes.length < 12) return;
        clearTimeout(timer);
        if (bytes.subarray(0, 12).toString() !== 'RFB 003.008\n') reject(new Error('Desktop stream returned an invalid handshake.'));
        else resolve();
      });
    });
  } finally {
    stream.destroy();
  }
  console.log(JSON.stringify({ image: COWORK_COMPUTER_IMAGE, workerUser: 1001, screenshot: true, browser: true, authenticatedStream: true }));
} finally {
  await computer.stop();
}
