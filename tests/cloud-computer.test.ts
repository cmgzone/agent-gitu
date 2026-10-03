import { generateKeyPairSync } from 'node:crypto';
import { once } from 'node:events';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Server, utils } from 'ssh2';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CloudComputerTransport, cloudDockerCommand } from '../src/cowork/cloud-computer.js';
import { hostedComputerExec, CoworkComputer, COWORK_COMPUTER_IMAGE, type ComputerExec } from '../src/cowork/computer.js';
import { probeSshHost, SshConnectionRegistry } from '../src/connections/ssh-connections.js';
import { CoworkStore } from '../src/cowork/store.js';
import { executeCoworkTool } from '../src/cowork/tools.js';
import { buildCoworkMessages } from '../src/cowork/runner.js';
import type { ToolContext } from '../src/tools/tools.js';
import { COWORK_JS } from '../src/server/ui-cowork.js';
import { Script } from 'node:vm';

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); vi.useRealTimers(); });

describe('cloud computer selection', () => {
  it('preserves the selected server across restart and clears it on an explicit switch to local', () => {
    const home = mkdtempSync(path.join(tmpdir(), 'cloud-choice-'));
    try {
      const file = path.join(home, 'cowork.json');
      const store = new CoworkStore(file);
      const agent = store.saveAgent({ name: 'Cloud', systemPrompt: 'Help', useHostComputer: false, cloudConnectionId: 'ssh-fixture' });
      expect(new CoworkStore(file).getAgent(agent.id)?.cloudConnectionId).toBe('ssh-fixture');
      expect(store.saveAgent({ ...agent, useHostComputer: true }).cloudConnectionId).toBeUndefined();
      expect(store.saveAgent({ ...agent, cloudConnectionId: '' }).cloudConnectionId).toBeUndefined();
      expect(() => store.saveAgent({ ...agent, cloudConnectionId: '../../elsewhere' })).toThrow('invalid');
    } finally { rmSync(home, { recursive: true, force: true }); }
  });

  it('never falls back to the user workspace when a cloud computer fails', async () => {
    const home = mkdtempSync(path.join(tmpdir(), 'cloud-routing-'));
    try {
      const store = new CoworkStore(path.join(home, 'cowork.json'));
      const agent = store.saveAgent({ name: 'Cloud', systemPrompt: 'Help', useHostComputer: false, cloudConnectionId: 'ssh-offline' });
      const computer = new CoworkComputer(agent.id, home, async () => { throw new Error('Cloud connection is offline'); }, { key: 'offline', cloud: true });
      const hostBrowser = { available: () => true, execute: vi.fn() };
      const result = await executeCoworkTool({ browser: hostBrowser } as unknown as ToolContext, 'browse', { action: 'navigate', url: 'https://example.com' }, { allowShell: true, allowWrites: true, allowConfig: true, chief: false, browser: true }, { agent, store, memory: {} as never, computerFor: () => computer });
      expect(result.ok).toBe(false);
      expect(result.output).toContain('saved cloud server connection');
      expect(hostBrowser.execute).not.toHaveBeenCalled();
      const messages = buildCoworkMessages(agent, { id: 'chat', kind: 'dm', memberIds: [agent.id] } as never, [agent], [], { agents: [agent], computerFor: () => computer } as never);
      expect(messages[0]?.content).toContain('cloud connection failure does not switch execution');
      expect(messages[0]?.content).not.toContain('tools fall back automatically');
    } finally { rmSync(home, { recursive: true, force: true }); }
  });

  it('refuses hosted cloud operations when no hosted runtime exists', async () => {
    vi.stubEnv('AGENT_GITU_COMPUTER_BROKER_URL', '');
    await expect(hostedComputerExec(['info', '--format', '{{.ServerVersion}}'])).rejects.toThrow('Gitu cloud is not configured');
  });

  it('offers local and cloud choices in parseable browser code', () => {
    expect(() => new Script(COWORK_JS)).not.toThrow();
    expect(COWORK_JS).toContain('Cloud computer');
    expect(COWORK_JS).toContain('cwAmCloudServer');
    expect(COWORK_JS).toContain('cloudConnectionId: computerSel.value');
  });

  it('shares an image build only within the same runtime, not across cloud servers', async () => {
    const home = mkdtempSync(path.join(tmpdir(), 'cloud-build-'));
    const builds: (() => void)[] = [];
    const exec: ComputerExec = async (args) => {
      if (args[0] === 'image' || (args[0] === 'container' && args[3] === '{{.Config.Image}}')) throw new Error('not found');
      if (args[0] === 'build') await new Promise<void>((resolve) => builds.push(resolve));
      return '';
    };
    try {
      const computers = [new CoworkComputer('a', home, exec, { key: 'cloud-a' }), new CoworkComputer('b', home, exec, { key: 'cloud-a' }), new CoworkComputer('c', home, exec, { key: 'cloud-b' })];
      const starts = Promise.all(computers.map((computer) => computer.start()));
      await vi.waitFor(() => expect(builds).toHaveLength(2));
      for (const release of builds) release();
      await starts;
      expect(computers.every((computer) => computer.status().state === 'running')).toBe(true);
    } finally { for (const release of builds) release(); rmSync(home, { recursive: true, force: true }); }
  });
});

describe('cloud desktop transport', () => {
  it('times out or stops even when the SSH connection has not finished opening', async () => {
    vi.useFakeTimers();
    const openClient = vi.fn(() => new Promise<never>(() => {}));
    const cloud = new CloudComputerTransport('ssh-fixture', 'fixture', { get: () => ({ hasCredential: true }) as never, openClient });
    const timed = expect(cloud.execute(['info', '--format', '{{.ServerVersion}}'])).rejects.toThrow('timed out');
    await vi.advanceTimersByTimeAsync(15_000); await timed;
    const controller = new AbortController();
    const stopped = expect(cloud.execute(['exec', 'gitu-cowork-' + 'a'.repeat(24), 'node', '-e', 'fixture'], undefined, controller.signal)).rejects.toThrow('Stopped by fixture');
    controller.abort(new Error('Stopped by fixture')); await stopped;
    expect(openClient).toHaveBeenCalledOnce(); cloud.close();
  });

  it('quotes shell metacharacters literally and refuses unsafe lifecycle operations', async () => {
    expect(cloudDockerCommand(['exec', 'safe', 'node', '-e', "echo '$HOME'; $(touch /tmp/unsafe)"])).toBe("docker 'exec' 'safe' 'node' '-e' 'echo '\\''$HOME'\\''; $(touch /tmp/unsafe)'");
    const openClient = vi.fn();
    const cloud = new CloudComputerTransport('ssh-fixture', 'fixture', { get: vi.fn(), openClient });
    await expect(cloud.execute(['run', '--privileged', '-v', '/:/host', 'other'])).rejects.toThrow('Unsupported');
    await expect(cloud.desktopStream('../../other')).rejects.toThrow('Invalid');
    expect(openClient).not.toHaveBeenCalled();
  });

  it('multiplexes real SSH channels, requires ownership, and carries live binary input without exposing credentials', async () => {
    const home = mkdtempSync(path.join(tmpdir(), 'cloud-ssh-'));
    vi.stubEnv('AGENT_GITU_HOME', home);
    const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048, privateKeyEncoding: { type: 'pkcs1', format: 'pem' }, publicKeyEncoding: { type: 'pkcs1', format: 'pem' } });
    let owner = '', owned = true, accepted = 0;
    const commands: string[] = [];
    const uploaded = new Map<string, Buffer>();
    const uploadedModes: number[] = [];
    let uploadSessions = 0;
    const server = new Server({ hostKeys: [privateKey] }, (client) => {
      client.on('error', () => {});
      client.on('authentication', (context) => context.method === 'password' && context.password === 'fixture-only' ? context.accept() : context.reject());
      client.on('ready', () => {
        accepted++;
        client.on('session', (accept) => {
          const session = accept();
          session.on('sftp', (acceptSftp) => {
            const sftp = acceptSftp(); uploadSessions++;
            const handles = new Map<string, string>();
            sftp.on('error', () => {});
            sftp.on('REALPATH', (id) => sftp.name(id, [{ filename: '/fixture-home', longname: '/fixture-home', attrs: {} }]));
            sftp.on('MKDIR', (id) => sftp.status(id, utils.sftp.STATUS_CODE.OK));
            sftp.on('OPEN', (id, name, _flags, attrs) => { uploadedModes.push(attrs.mode! & 0o777); const handle = Buffer.from('h' + handles.size); handles.set(handle.toString(), name); uploaded.set(name, Buffer.alloc(0)); sftp.handle(id, handle); });
            sftp.on('WRITE', (id, handle, offset, data) => {
              const name = handles.get(handle.toString())!;
              const previous = uploaded.get(name)!;
              const contents = Buffer.alloc(Math.max(previous.length, offset + data.length));
              previous.copy(contents); data.copy(contents, offset); uploaded.set(name, contents);
              sftp.status(id, utils.sftp.STATUS_CODE.OK);
            });
            sftp.on('CLOSE', (id) => sftp.status(id, utils.sftp.STATUS_CODE.OK));
          });
          session.on('exec', (acceptExec, _reject, info) => {
          commands.push(info.command);
          const channel = acceptExec();
          if (info.command.includes('node:net')) { channel.write('RFB 003.008\n'); channel.on('data', (data: Buffer) => channel.write(data)); return; }
          if (info.command.includes('dev.agentgitu.broker')) channel.write(owned ? owner + '\n' : 'foreign-workspace\n');
          else if (info.command.includes('ServerVersion')) channel.write('27.0\n');
          else if (info.command.includes('echo-input')) {
            const chunks: Buffer[] = [];
            channel.on('data', (data: Buffer) => chunks.push(data));
            channel.on('end', () => { channel.write(Buffer.concat(chunks)); channel.exit(0); channel.end(); });
            return;
          }
          channel.exit(0); channel.end();
          });
        });
      });
    });
    let cloud: CloudComputerTransport | undefined;
    try {
      await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
      const address = server.address();
      if (!address || typeof address === 'string') throw new Error('No test SSH address');
      const baseUrl = `ssh://fixture@127.0.0.1:${address.port}`;
      const registry = new SshConnectionRegistry();
      const profile = await registry.saveAndValidate({ label: 'Fixture', baseUrl, password: 'fixture-only', hostFingerprint: await probeSshHost(baseUrl) });
      cloud = new CloudComputerTransport(profile.id, home, registry); owner = cloud.owner;
      expect(await cloud.execute(['info', '--format', '{{.ServerVersion}}'])).toBe('27.0\n');
      expect(await cloud.execute(['info', '--format', '{{.ServerVersion}}'])).toBe('27.0\n');
      // One credential-validation login and one reused desktop connection.
      expect(accepted).toBe(2);
      const name = 'gitu-cowork-' + 'a'.repeat(24);
      const assets = fileURLToPath(new URL('../assets/cowork-computer/', import.meta.url));
      await cloud.execute(['build', '-t', COWORK_COMPUTER_IMAGE, assets]);
      await cloud.execute(['cp', path.join(assets, 'server.cjs'), name + ':/computer/server.cjs']);
      expect(uploadSessions).toBe(1);
      expect(uploaded.size).toBe(6);
      expect(uploadedModes.every((mode) => mode === 0o644)).toBe(true);
      expect([...uploaded.keys()].every((file) => file.startsWith('/fixture-home/.cache/agent-gitu/' + cloud!.owner + '/'))).toBe(true);
      expect([...uploaded.entries()].find(([file]) => file.endsWith('/Dockerfile'))?.[1].toString()).toContain('FROM node:22-bookworm-slim');
      expect(commands.some((command) => command.startsWith("docker 'build'") && command.includes('/fixture-home/.cache/agent-gitu/'))).toBe(true);
      const payload = JSON.stringify({ text: 'Résumé 文本', data: 'x'.repeat(80_000) });
      expect(await cloud.execute(['exec', '-i', name, 'node', '-e', 'echo-input'], payload)).toBe(payload);
      const screen = await cloud.desktopStream(name);
      const greeting = await once(screen, 'data');
      expect(greeting[0].toString()).toBe('RFB 003.008\n');
      const input = Buffer.from([5, 1, 0, 10, 0, 20]);
      const echoed = once(screen, 'data'); screen.write(input);
      expect((await echoed)[0]).toEqual(input);
      screen.destroy();
      owned = false;
      await expect(cloud.desktopStream(name)).rejects.toThrow('does not belong');
      expect(commands.every((command) => !command.includes('fixture-only'))).toBe(true);
      registry.remove(profile.id);
      await expect(cloud.execute(['info', '--format', '{{.ServerVersion}}'])).rejects.toThrow('connection is missing');
    } finally {
      cloud?.close();
      await new Promise<void>((resolve) => server.close(() => resolve()));
      rmSync(home, { recursive: true, force: true });
    }
  }, 30_000);
});
