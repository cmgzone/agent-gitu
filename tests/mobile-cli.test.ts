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
  const password = 'isolated mobile cli passphrase';
  const profile = { name: 'Mobile CLI Tester', email: 'mobile-cli@example.com' };
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
    // The access key alone never unlocks a locked app: the app password is the
    // first-owner credential, and the native client pairs the key with its app
    // session (apps/mobile/src/gitu/client.ts).
    const locked = await fetch(address, { headers: { Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(5000) });
    expect(locked.status).toBe(401);
    expect((await locked.json()).code).toBe('APP_LOCKED');
    expect((await fetch(address, { signal: AbortSignal.timeout(5000) })).status).toBe(401);
    // First-owner setup happens on the machine itself, over the local interface.
    const local = `http://127.0.0.1:${port}`;
    const json = { 'content-type': 'application/json' };
    const register = await fetch(`${local}/api/auth/register`, { method: 'POST', headers: json, body: JSON.stringify({ ...profile, password }) });
    expect(register.status).toBe(201);
    const login = await fetch(`${local}/api/auth/login`, { method: 'POST', headers: json, body: JSON.stringify({ email: profile.email, password }) });
    expect(login.status).toBe(200);
    const session = login.headers.get('set-cookie')!.split(';')[0]!;
    // The phone then reaches the server on the interface it was asked to bind,
    // authenticated with its access key and app session.
    const response = await fetch(address, { headers: { Authorization: `Bearer ${key}`, Cookie: session }, signal: AbortSignal.timeout(5000) });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ app: 'Agent Gitu', mobileProtocol: 1, mobileFeatures: ['native-workspace'] });
  } finally {
    if (child.exitCode === null) {
      const stopped = once(child, 'exit');
      child.kill();
      await stopped;
    }
    rmSync(root, { recursive: true, force: true });
  }
}, 30_000);
