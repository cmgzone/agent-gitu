import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtempSync, rmSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { expect, it } from 'vitest';

it('starts the actual mobile CLI on the requested network interface with authenticated access', async () => {
  const reservation = createServer();
  reservation.listen(0, '127.0.0.2');
  await once(reservation, 'listening');
  const port = (reservation.address() as { port: number }).port;
  await new Promise<void>((resolve) => reservation.close(() => resolve()));
  const root = mkdtempSync(path.join(tmpdir(), 'gitu-mobile-cli-'));
  const key = 'isolated-mobile-cli-key-for-testing-only';
  const loader = createRequire(import.meta.url).resolve('tsx');
  const child = spawn(
    process.execPath,
    ['--import', pathToFileURL(loader).href, fileURLToPath(new URL('../src/cli.ts', import.meta.url)), 'serve', '--host', '0.0.0.0', '--port', String(port)],
    {
      cwd: root,
      env: { ...process.env, AGENT_GITU_HOME: root, HERMES_HOME_DIR: root, AGENT_GITU_ACCESS_KEY: key },
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    },
  );
  let output = '';
  child.stdout.on('data', (chunk) => {
    output += String(chunk);
  });
  child.stderr.on('data', (chunk) => {
    output += String(chunk);
  });
  try {
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        clearInterval(poll);
        reject(new Error(`CLI startup timed out: ${output}`));
      }, 20_000);
      const poll = setInterval(() => {
        if (output.includes('headless server running')) {
          clearTimeout(timer);
          clearInterval(poll);
          resolve();
        } else if (child.exitCode !== null) {
          clearTimeout(timer);
          clearInterval(poll);
          reject(new Error(`CLI exited: ${output}`));
        }
      }, 50);
      child.once('error', (error) => {
        clearTimeout(timer);
        clearInterval(poll);
        reject(error);
      });
    });
    // 127.0.0.2 cannot reach a listener accidentally bound only to 127.0.0.1.
    const address = `http://127.0.0.2:${port}/api/mobile/status`;
    const response = await fetch(address, { headers: { Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(5000) });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ app: 'Agent Gitu', mobileProtocol: 1, mobileFeatures: ['native-workspace'] });
    expect((await fetch(address, { signal: AbortSignal.timeout(5000) })).status).toBe(401);
  } finally {
    if (child.exitCode === null) {
      const stopped = once(child, 'exit');
      child.kill();
      await stopped;
    }
    rmSync(root, { recursive: true, force: true });
  }
}, 30_000);
