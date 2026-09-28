import { afterEach, describe, expect, it, vi } from 'vitest';
import { commandTimeout, commandWaitMs, deadline, pollWaitMs } from '../src/tools/command-timeout.js';
import { BackgroundCommandRegistry, toolRunCommand, validateToolParams, type ToolContext } from '../src/tools/tools.js';

/**
 * Commands report a STATUS; they are never a blocking wait for output.
 *
 * The spawn stand-in lets each test drive the process lifecycle explicitly, so
 * "the command exited" and "the pipes closed" are separate facts the test owns
 * instead of a race against a real process.
 */
const mock = vi.hoisted(() => ({ children: [] as unknown[] }));
vi.mock('node:child_process', async () => {
  const { EventEmitter } = await import('node:events');
  const makeChild = () => {
    const child = new EventEmitter() as Record<string, unknown>;
    child['pid'] = 999_999;
    child['stdout'] = new EventEmitter();
    child['stderr'] = new EventEmitter();
    child['kill'] = vi.fn();
    (mock.children as Record<string, unknown>[]).push(child);
    return child;
  };
  return { spawn: vi.fn(() => makeChild()), execFile: vi.fn(), execFileSync: vi.fn() };
});
const childAt = (index = -1): Record<string, unknown> => (mock.children as Record<string, unknown>[]).at(index)!;
const ctxWith = (registry: BackgroundCommandRegistry, extra: Partial<ToolContext> = {}): ToolContext =>
  ({ cwd: '.', backgroundCommands: registry, ...extra }) as ToolContext;

afterEach(() => {
  vi.useRealTimers();
  (mock.children as unknown[]).length = 0;
  vi.clearAllMocks();
});

describe('a command answers with a status instead of waiting for output', () => {
  it('settles on the process exit, not on the stdio pipes closing', async () => {
    vi.useFakeTimers();
    const registry = new BackgroundCommandRegistry();
    const pending = toolRunCommand(ctxWith(registry), { command: 'crashed-app' });
    const child = childAt();

    child['stdout']!.emit('data', 'booting\n');
    child['stderr']!.emit('data', 'TypeError: boom\n');
    // The shell is gone. A descendant (GUI app, dev server, `.cmd` shim's real
    // process) still holds the inherited pipe, so 'close' never arrives — the
    // implementation that waited for it never answered at all.
    child['stdout']!.emit('data', '');
    child.emit('exit', 1, null);
    await vi.advanceTimersByTimeAsync(300);

    const result = await pending;
    expect(result.status).toBe('exited');
    expect(result.ok).toBe(false);
    expect(result.exitCode).toBe(1);
    expect(result.output).toContain('TypeError: boom');
    expect(child['kill']).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('answers RUNNING with a job id when the command outlives its wait window', async () => {
    vi.useFakeTimers();
    const registry = new BackgroundCommandRegistry();
    const pending = toolRunCommand(ctxWith(registry), { command: 'npm run dev' });
    const child = childAt();
    child['stdout']!.emit('data', 'ready on :3000\n');

    await vi.advanceTimersByTimeAsync(60_000);
    const result = await pending;

    expect(result.ok).toBe(true);
    expect(result.status).toBe('running');
    expect(result.jobId).toBe('cmd-1');
    expect(result.output).toContain('STILL RUNNING');
    expect(result.output).toContain('"action":"status"');
    // Answering with a status must never kill the work: the process runs on.
    expect(child['kill']).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('polls a running job until it exits, then reports the exit code and tail', async () => {
    vi.useFakeTimers();
    const registry = new BackgroundCommandRegistry();
    const run = toolRunCommand(ctxWith(registry), { command: 'npm test' });
    await vi.advanceTimersByTimeAsync(60_000);
    const running = await run;
    const child = childAt();

    const poll = toolRunCommand(ctxWith(registry), { action: 'status', id: running.jobId });
    await vi.advanceTimersByTimeAsync(2_000);
    child['stdout']!.emit('data', '42 tests passed\n');
    child.emit('exit', 0, null);
    child.emit('close', 0, null);
    await vi.advanceTimersByTimeAsync(500);

    const result = await poll;
    expect(result.ok).toBe(true);
    expect(result.status).toBe('exited');
    expect(result.exitCode).toBe(0);
    expect(result.output).toContain('42 tests passed');
    expect(result.output).toContain('EXITED 0');
  });
  it('stops a managed command and reports the confirmed death', async () => {
    vi.useFakeTimers();
    const registry = new BackgroundCommandRegistry();
    const run = toolRunCommand(ctxWith(registry), { command: 'npm run dev' });
    await vi.advanceTimersByTimeAsync(60_000);
    const running = await run;
    const child = childAt();

    const stop = toolRunCommand(ctxWith(registry), { action: 'stop', id: running.jobId });
    await vi.advanceTimersByTimeAsync(100);
    expect(child['kill']).toHaveBeenCalled();
    child.emit('exit', null, 'SIGKILL');
    child.emit('close', null, 'SIGKILL');
    await vi.advanceTimersByTimeAsync(300);

    const result = await stop;
    expect(result.ok).toBe(false);
    expect(result.status).toBe('stopped');
    // A kill publishes no exit code: it is the kill's artifact, not the
    // command's own outcome.
    expect(result.exitCode).toBeUndefined();
    expect(result.output).toContain('stopped by the agent');
  });

  it('lists managed commands and rejects an unknown job id', async () => {
    vi.useFakeTimers();
    const registry = new BackgroundCommandRegistry();
    const run = toolRunCommand(ctxWith(registry), { command: 'npm test' });
    await vi.advanceTimersByTimeAsync(60_000);
    await run;

    const list = await toolRunCommand(ctxWith(registry), { action: 'status' });
    expect(list.ok).toBe(true);
    expect(list.output).toContain('cmd-1');
    expect(list.output).toContain('RUNNING');

    const unknown = await toolRunCommand(ctxWith(registry), { action: 'status', id: 'cmd-9' });
    expect(unknown.ok).toBe(false);
    expect(unknown.output).toContain('no managed command "cmd-9"');
  });

  it('reports a background command that dies inside its startup window', async () => {
    vi.useFakeTimers();
    const registry = new BackgroundCommandRegistry();
    const pending = toolRunCommand(ctxWith(registry), { command: 'npm start', background: true, startupWaitMs: 500 });
    const child = childAt();
    child['stderr']!.emit('data', 'EADDRINUSE: port 3000\n');
    child.emit('exit', 1, null);

    const result = await pending;
    expect(result.ok).toBe(false);
    expect(result.output).toContain('EADDRINUSE');
    expect(result.output).toContain('startup window');
    expect(vi.getTimerCount()).toBe(0);
  });
});
describe('command deadlines and cancellation', () => {
  it('still kills the process tree at an explicit hard deadline', async () => {
    vi.useFakeTimers();
    const registry = new BackgroundCommandRegistry();
    const pending = toolRunCommand(ctxWith(registry), { command: 'long-build', timeoutMs: 1_500 });
    const child = childAt();

    await vi.advanceTimersByTimeAsync(1_499);
    expect(child['kill']).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(child['kill']).toHaveBeenCalled();

    child.emit('exit', null, 'SIGKILL');
    const result = await pending;
    expect(result.ok).toBe(false);
    expect(result.status).toBe('stopped');
    expect(result.output).toContain('timeout after 1500ms');
    expect(result.exitCode).toBeUndefined();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('has no implicit kill deadline, waits without killing, and still supports Stop', async () => {
    vi.useFakeTimers();
    const controller = new AbortController();
    const registry = new BackgroundCommandRegistry();
    const pending = toolRunCommand(ctxWith(registry, { signal: controller.signal }), { command: 'long-build' });
    const child = childAt();

    await vi.advanceTimersByTimeAsync(600_001);
    expect(child['kill']).not.toHaveBeenCalled();
    const running = await pending;
    expect(running.status).toBe('running');

    // Stop cancels a command that has already been reported as running.
    controller.abort();
    expect(child['kill']).toHaveBeenCalled();
    child.emit('exit', null, 'SIGKILL');
    child.emit('close', null, 'SIGKILL');
    const polled = await toolRunCommand(ctxWith(registry), { action: 'status', id: running.jobId });
    expect(polled.status).toBe('stopped');
    expect(polled.output).toContain('cancelled');
  });

  it('chains deadlines beyond Node’s timer range instead of firing immediately', async () => {
    vi.useFakeTimers();
    const expired = vi.fn();
    deadline(2_147_483_648, expired);
    await vi.advanceTimersByTimeAsync(2_147_483_647);
    expect(expired).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(expired).toHaveBeenCalledOnce();
    expect(commandTimeout(undefined)).toBe(0);
    expect(commandTimeout(0)).toBe(0);
    expect(() => commandTimeout(-1)).toThrow();
    expect(commandWaitMs(undefined)).toBe(60_000);
    expect(commandWaitMs(0)).toBe(0);
    expect(() => commandWaitMs(-1)).toThrow();
    expect(pollWaitMs(undefined)).toBe(10_000);
    expect(pollWaitMs(0)).toBe(0);
    expect(() => pollWaitMs(1.5)).toThrow();
  });

  it('validates the status/stop action surface', () => {
    expect(validateToolParams('run_command', { command: 'npm test' }).valid).toBe(true);
    expect(validateToolParams('run_command', { action: 'status' }).valid).toBe(true);
    expect(validateToolParams('run_command', { action: 'status', id: 'cmd-2' }).valid).toBe(true);
    expect(validateToolParams('run_command', { action: 'stop', id: 'cmd-2' }).valid).toBe(true);
    expect(validateToolParams('run_command', { action: 'stop' }).valid).toBe(false);
    expect(validateToolParams('run_command', { action: 'watch' }).valid).toBe(false);
    expect(validateToolParams('run_command', {}).valid).toBe(false);
    expect(validateToolParams('run_command', { command: 'npm test', waitMs: 'soon' }).valid).toBe(false);
  });
});
