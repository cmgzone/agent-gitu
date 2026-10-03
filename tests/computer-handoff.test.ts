import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { expect, it, vi } from 'vitest';
import { CoworkComputer, type ComputerExec } from '../src/cowork/computer.js';

it('persists human control, blocks agent input, and wakes without restarting open apps', async () => {
  const root = mkdtempSync(path.join(tmpdir(), 'gitu-handoff-'));
  let state = 'created';
  const exec = vi.fn<ComputerExec>(async (args, input) => {
    if (args.includes('{{.Config.Image}}')) return 'agent-gitu-cowork:7';
    if (args.includes('{{.State.Status}}')) return state;
    if (args[0] === 'start' || args[0] === 'unpause') state = 'running';
    if (args[0] === 'pause') state = 'paused';
    if (args[0] === 'stop') state = 'exited';
    if (args[0] === 'exec') return JSON.stringify({ ok: true, output: JSON.parse(input!).tool });
    return '';
  });
  try {
    const computer = new CoworkComputer('shared', root, exec);
    await computer.start();
    computer.setControl('user', 'Please sign in manually', 'human-step');
    for (const tool of ['browse', 'desktop_input', 'run_command', 'computer_process', 'write_file', 'apply_edit', 'receive_file']) {
      const before = exec.mock.calls.length;
      expect((await computer.execute(tool, {})).output).toContain('user has control');
      expect(exec.mock.calls.length).toBe(before);
    }
    expect((await computer.desktopInput({ action: 'key', key: 'Escape' })).ok).toBe(true);
    await computer.sleep();
    const restored = new CoworkComputer('shared', root, exec);
    expect((await restored.refreshStatus()).state).toBe('sleeping');
    expect(restored.status().handoff?.requestId).toBe('human-step');
    const before = exec.mock.calls.length;
    expect((await restored.execute('read_file', {})).output).toContain('sleep');
    expect(exec.mock.calls.length).toBe(before);
    await restored.start();
    expect(restored.status()).toMatchObject({ state: 'running', control: 'user' });
    expect(restored.status().handoff).toEqual({ reason: 'You have control. Return to agent when you are finished.', requestId: 'human-step' });
    expect(new CoworkComputer('shared', root, exec).status().handoff).toEqual(restored.status().handoff);
    expect(exec.mock.calls.filter(([args]) => args[0] === 'start')).toHaveLength(1);
    expect(exec.mock.calls.filter(([args]) => args[0] === 'unpause')).toHaveLength(1);
    restored.setControl('shared');
    expect((await restored.execute('run_command', {})).ok).toBe(true);
    expect(new CoworkComputer('shared', root, exec).status().control).toBe('shared');
    expect(new CoworkComputer('other', root, exec).status().control).toBe('shared');
  } finally { rmSync(root, { recursive: true, force: true }); }
});

it('keeps an older running container eligible for upgrade after an app restart', async () => {
  const exec = vi.fn<ComputerExec>(async (args) => args.includes('{{.State.Status}}') ? 'running' : 'agent-gitu-cowork:6');
  const computer = new CoworkComputer('legacy-status', 'desktop-test', exec);
  expect((await computer.refreshStatus()).state).toBe('stopped');
  expect(exec.mock.calls.some(([args]) => ['start', 'stop', 'unpause'].includes(args[0]!))).toBe(false);
});
