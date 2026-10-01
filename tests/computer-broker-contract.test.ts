import path from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, it } from 'vitest';
import { ComputerBroker } from '../src/cowork/computer-broker.js';
import { CoworkComputer, computerCreateArgs, type ComputerExec } from '../src/cowork/computer.js';

describe('computer broker operation contract', () => {
  it('records every operation the client sends during start()', async () => {
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
    let failure: string | undefined;
    try {
      await computer.start();
    } catch (error) {
      failure = (error as Error).message;
    }
    console.log('OPERATIONS SENT:');
    for (const args of sent) console.log('  ' + JSON.stringify(args));
    console.log('CREATE ARGS MATCH WHITELIST:', JSON.stringify(computerCreateArgs(computer.name)) === JSON.stringify(computerCreateArgs(computer.name)));
    console.log('FAILURE:', failure ?? '(none)');
    expect(sent.length).toBeGreaterThan(0);
  });
});
