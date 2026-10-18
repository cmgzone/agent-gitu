import path from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, it } from 'vitest';
import { ComputerBroker } from '../src/cowork/computer-broker.js';
import { COWORK_COMPUTER_IMAGE, CoworkComputer, type ComputerExec } from '../src/cowork/computer.js';

describe('computer broker operation contract', () => {
  it('provisions the current desktop image through the broker allowlist', async () => {
    const owner = 'workspace_owner';
    const sent: string[][] = [];
    const exec: ComputerExec = async (args) => {
      sent.push(args);
      const a = args.join(' ');
      if (a.includes('dev.agentgitu.broker')) return owner;
      if (a.includes('{{.Config.Image}}')) throw new Error('no such container');
      if (a.startsWith('image inspect')) throw new Error('no such image');
      if (a.startsWith('build ')) return 'built';
      return '';
    };
    const broker = new ComputerBroker(owner, exec);
    const computer = new CoworkComputer('scratch-agent', path.join(tmpdir(), 'scratch-home'), (args, input, signal, timeoutMs) =>
      broker.execute(args, input, timeoutMs, signal),
    );
    await expect(computer.start()).resolves.toBeUndefined();
    expect(computer.status().state).toBe('running');
    expect(sent).toContainEqual(['image', 'inspect', COWORK_COMPUTER_IMAGE]);
    expect(sent.find(args => args[0] === 'build')?.slice(0, 3)).toEqual(['build', '-t', COWORK_COMPUTER_IMAGE]);
    const created = sent.find(args => args[0] === 'create');
    expect(created).toContain('dev.agentgitu.broker=' + owner);
    expect(created?.at(-1)).toBe(COWORK_COMPUTER_IMAGE);
    expect(sent).toContainEqual(['start', computer.name]);
  });
});
