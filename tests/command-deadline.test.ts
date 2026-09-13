import { afterEach, describe, expect, it, vi } from 'vitest';
import { commandTimeout, deadline } from '../src/tools/command-timeout.js';
import { toolRunCommand, type ToolContext } from '../src/tools/tools.js';

const mock = vi.hoisted(() => ({ done: undefined as ((error: Error | null, stdout: string, stderr: string) => void) | undefined, kill: vi.fn() }));
vi.mock('node:child_process', () => ({
  execFile: vi.fn((_shell, _args, _opts, callback) => { mock.done = callback; return { kill: mock.kill }; }),
  execFileSync: vi.fn(),
}));
afterEach(() => { vi.useRealTimers(); vi.clearAllMocks(); });

describe('command deadlines and cancellation', () => {
  it('does not kill a running command at the old ten-minute limit', async () => {
    vi.useFakeTimers();
    const pending = toolRunCommand({ cwd: '.' } as ToolContext, { command: 'long-build', timeoutMs: 900_000 });
    await vi.advanceTimersByTimeAsync(600_001);
    expect(mock.kill).not.toHaveBeenCalled();
    mock.done!(null, 'finished', '');
    expect((await pending).ok).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });
  it('has no implicit deadline and still supports Stop', async () => {
    vi.useFakeTimers();
    const controller = new AbortController();
    const pending = toolRunCommand({ cwd: '.', signal: controller.signal } as ToolContext, { command: 'long-build' });
    expect(vi.getTimerCount()).toBe(0);
    controller.abort();
    expect(mock.kill).toHaveBeenCalled();
    mock.done!(new Error('killed'), '', '');
    expect((await pending).output).toContain('cancelled');
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
  });
});
