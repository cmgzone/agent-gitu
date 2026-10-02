import { describe, expect, it, vi } from 'vitest';
import { ComputerBroker, createComputerBrokerServer } from '../src/cowork/computer-broker.js';
import { computerCreateArgs, computerExec, type ComputerExec } from '../src/cowork/computer.js';

const owner = 'test-workspace-owner';
const name = 'gitu-cowork-' + 'a'.repeat(24);
const fixture = () => {
  const exec = vi.fn<ComputerExec>(async (args) => (args[3]?.includes('dev.agentgitu.broker') ? owner : 'result'));
  return { exec, broker: new ComputerBroker(owner, exec) };
};
describe('private desktop broker', () => {
  it('creates only bounded unprivileged desktops with workspace ownership labels', async () => {
    const f = fixture();
    await f.broker.execute(computerCreateArgs(name));
    const args = f.exec.mock.calls[0]![0];
    expect(args).toContain('dev.agentgitu.broker=' + owner);
    expect(args).toContain('--cap-drop');
    expect(args.join(' ')).not.toMatch(/type=bind|--privileged|--publish|docker.sock/);
    expect(args.at(-1)).toBe('agent-gitu-cowork:7');
    for (const modified of [
      [...computerCreateArgs(name), '--privileged'],
      ['create', '--name', name, 'alpine'],
      ['create', '--name', 'coolify-proxy', ...computerCreateArgs(name).slice(3)],
    ]) {
      await expect(f.broker.execute(modified)).rejects.toThrow();
    }
    expect(f.exec).toHaveBeenCalledOnce();
  });
  it('rejects foreign containers, root execution, arbitrary images, mounts, copies and daemon commands', async () => {
    const f = fixture();
    for (const args of [
      ['start', 'coolify-proxy'],
      ['exec', '--user', 'root', name, 'node', '-e', 'evil'],
      ['exec', '-i', name, 'sh', '-c', 'evil'],
      ['image', 'inspect', 'alpine'],
      ['build', '-t', 'agent-gitu-cowork:7', '/tmp/untrusted'],
      ['cp', '/etc/passwd', name + ':/computer/server.cjs'],
      ['volume', 'rm', 'production-data'],
      ['run', '--privileged', 'alpine'],
    ]) {
      await expect(f.broker.execute(args)).rejects.toThrow();
    }
    expect(f.exec).not.toHaveBeenCalled();
    f.exec.mockResolvedValue('another-workspace');
    await expect(f.broker.execute(['start', name])).rejects.toThrow('does not belong');
    expect(f.exec).toHaveBeenCalledOnce();
  });
  it('preserves stdin, cancellation and long deadlines for sandbox commands', async () => {
    const f = fixture();
    const signal = new AbortController().signal;
    const args = ['exec', '-i', name, 'node', '-e', 'process.stdin.resume()'];
    await f.broker.execute(args, 'sandbox input', 3_000_000, signal);
    expect(f.exec).toHaveBeenLastCalledWith(args, 'sandbox input', signal, 3_000_000);
    await expect(f.broker.execute(['info', '--format', '{{.ServerVersion}}'], undefined, 0)).rejects.toThrow('deadline');
  });
  it('allows sleep and wake only for owned desktops with no additional arguments', async () => {
    const f = fixture();
    for (const action of ['pause', 'unpause']) {
      await f.broker.execute([action, name]);
      expect(f.exec).toHaveBeenLastCalledWith([action, name], undefined, undefined, 15_000);
      await expect(f.broker.execute([action, 'coolify-proxy'])).rejects.toThrow();
      await expect(f.broker.execute([action, name, '--all'])).rejects.toThrow();
    }
    f.exec.mockResolvedValue('other-owner');
    await expect(f.broker.execute(['pause', name])).rejects.toThrow('does not belong');
  });
  it('authenticates remote lifecycle requests before accessing Docker and supports the hosted client', async () => {
    const f = fixture(),
      key = 'disposable-private-broker-key-for-tests';
    const server = createComputerBrokerServer(key, owner, f.exec);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const base = 'http://127.0.0.1:' + (server.address() as { port: number }).port;
    vi.stubEnv('AGENT_GITU_COMPUTER_BROKER_URL', base);
    vi.stubEnv('AGENT_GITU_COMPUTER_BROKER_KEY', key);
    try {
      expect((await fetch(base + '/execute', { method: 'POST', body: '{}' })).status).toBe(401);
      expect(f.exec).not.toHaveBeenCalled();
      expect(await computerExec(['start', name])).toBe('result');
      expect(f.exec).toHaveBeenLastCalledWith(['start', name], undefined, expect.any(AbortSignal), 120_000);
      const response = await fetch(base + '/execute', { method: 'POST', headers: { authorization: 'Bearer ' + key }, body: JSON.stringify({ args: ['start', 'coolify-proxy'] }) });
      expect(response.status).toBe(400);
      vi.stubEnv('AGENT_GITU_COMPUTER_BROKER_KEY', '');
      await expect(computerExec(['start', name])).rejects.toThrow('key is missing');
    } finally {
      vi.unstubAllEnvs();
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});
