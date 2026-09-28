import { generateKeyPairSync } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Server } from 'ssh2';
import { afterEach, describe, expect, it } from 'vitest';
import { parseSshUrl, probeSshHost, SshConnectionRegistry } from '../src/connections/ssh-connections.js';

const priorHome = process.env.AGENT_GITU_HOME;
const homes: string[] = [];
const servers: Server[] = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve) => server.close(() => resolve()))));
  if (priorHome === undefined) delete process.env.AGENT_GITU_HOME;
  else process.env.AGENT_GITU_HOME = priorHome;
  for (const dir of homes.splice(0)) rmSync(dir, { recursive: true, force: true });
});

async function sshServer(): Promise<string> {
  const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048, privateKeyEncoding: { type: 'pkcs1', format: 'pem' }, publicKeyEncoding: { type: 'pkcs1', format: 'pem' } });
  const server = new Server({ hostKeys: [privateKey] }, (client) => {
    client.on('error', () => { /* expected when the client refuses a test host key */ });
    client.on('authentication', (context) => {
      if (context.method === 'password' && context.username === 'alice' && context.password === 'test-password') context.accept();
      else context.reject();
    });
    client.on('ready', () => {
      client.on('session', (accept) => {
        const session = accept();
        session.on('exec', (acceptExec, _reject, info) => {
          const stream = acceptExec();
          stream.write(info.command === 'hostname' ? 'test-host\n' : 'unexpected command\n');
          stream.exit(info.command === 'hostname' ? 0 : 1);
          stream.end();
        });
      });
    });
  });
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('SSH test server did not bind.');
  return `ssh://alice@127.0.0.1:${address.port}`;
}

describe('SSH connections', () => {
  it('requires an SSH address with a username and no embedded secret', () => {
    expect(parseSshUrl('ssh://alice@example.invalid')).toEqual({ host: 'example.invalid', port: 22, username: 'alice' });
    expect(() => parseSshUrl('https://example.invalid')).toThrow();
    expect(() => parseSshUrl('ssh://alice:secret@example.invalid')).toThrow();
    expect(() => parseSshUrl('ssh://example.invalid')).toThrow();
  });

  it('checks the host key, rejects bad passwords without saving, and uses a verified saved credential', async () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'gitu-ssh-test-'));
    homes.push(dir);
    process.env.AGENT_GITU_HOME = dir;
    const baseUrl = await sshServer();
    const registry = new SshConnectionRegistry();
    const fingerprint = await probeSshHost(baseUrl);
    expect(fingerprint).toMatch(/^SHA256:[A-Za-z0-9+/]{43}$/);
    await expect(registry.saveAndValidate({ label: 'Test SSH', baseUrl, password: 'wrong', hostFingerprint: fingerprint })).rejects.toThrow('authentication failed');
    expect(registry.list()).toEqual([]);
    await expect(registry.saveAndValidate({ label: 'Test SSH', baseUrl, password: 'test-password', hostFingerprint: `SHA256:${'A'.repeat(43)}` })).rejects.toThrow('host key');
    expect(registry.list()).toEqual([]);
    const saved = await registry.saveAndValidate({ label: 'Test SSH', baseUrl, password: 'test-password', hostFingerprint: fingerprint });
    expect(saved.hasCredential).toBe(true);
    expect(readFileSync(path.join(dir, 'Settings', 'ssh-connections.json'), 'utf8')).not.toContain('test-password');
    expect(await registry.execute(saved.id, 'hostname')).toEqual({ exitCode: 0, stdout: 'test-host\n', stderr: '' });
    expect(registry.renderForAgent()).not.toContain('test-password');
    expect(registry.remove(saved.id)).toBe(true);
    expect(registry.list()).toEqual([]);
  });
});
