import { afterEach, describe, expect, it, vi } from 'vitest';
import { setImmediate } from 'node:timers/promises';

const runtime = vi.hoisted(() => ({ children: [] as any[] }));
vi.mock('node:child_process', async () => {
  const { EventEmitter } = await import('node:events');
  const { PassThrough } = await import('node:stream');
  class FakeRuntime extends EventEmitter {
    stdin = new PassThrough();
    stdout = new PassThrough();
    stderr = new PassThrough();
    exitCode: number | null = null;
    signalCode: string | null = null;
    killed = false;
    kill = vi.fn(() => { this.killed = true; return true; });
  }
  return { spawn: () => { const child = new FakeRuntime(); runtime.children.push(child); return child; } };
});
import { CodexExecThread } from '../src/llm/codex-exec.js';

afterEach(() => { runtime.children = []; });
const config = { executable: 'codex.exe', config: [], model: 'test-model', workingDirectory: process.cwd(), networkAccessEnabled: false, webSearchMode: 'disabled', approvalPolicy: 'never', modelReasoningEffort: 'low' };

describe('Codex runtime process lifecycle', () => {
  it('waits for process closure after exit and stdout completion', async () => {
    const events = new CodexExecThread(config).runStreamed('Work').events;
    let finished = false;
    const done = events.next().then(result => { finished = true; return result; });
    const child = runtime.children[0];
    child.exitCode = 0;
    child.emit('exit', 0, null);
    child.stdout.end();
    await setImmediate();
    expect(finished).toBe(false);
    child.stderr.end();
    child.emit('close', 0, null);
    expect((await done).done).toBe(true);
    expect(child.kill).not.toHaveBeenCalled();
  });

  it('kills and waits for closure when the consumer rejects a runtime tool event', async () => {
    const events = new CodexExecThread(config).runStreamed('Work').events;
    const first = events.next();
    const child = runtime.children[0];
    child.stdout.write(JSON.stringify({ type: 'item.started', item: { type: 'command_execution' } }) + '\n');
    await first;
    let finished = false;
    const stopped = events.return(undefined as any).then(() => { finished = true; });
    await setImmediate();
    expect(child.kill).toHaveBeenCalledOnce();
    expect(finished).toBe(false);
    child.signalCode = 'SIGTERM';
    child.stdout.end();
    child.stderr.end();
    child.emit('close', null, 'SIGTERM');
    await stopped;
  });

  it('preserves startup errors while waiting for the failed process handles to close', async () => {
    const events = new CodexExecThread(config).runStreamed('Work').events;
    const result = events.next();
    const child = runtime.children[0];
    child.emit('error', new Error('spawn ENOENT'));
    child.stdout.end();
    child.stderr.end();
    child.emit('close', -2, null);
    await expect(result).rejects.toThrow('spawn ENOENT');
  });
});
