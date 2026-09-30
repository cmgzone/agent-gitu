import { describe, expect, it, vi } from 'vitest';
import { summarizeCheckpoint } from '../src/cowork/checkpoint.js';
import type { LlmClient } from '../src/llm/llm.js';
import type { CoworkTodo } from '../src/cowork/store.js';

describe('Cowork checkpoint summaries', () => {
  it('reports saved changes and failures without claiming that running commands passed', async () => {
    const complete = vi.fn(async () => { throw new Error('Provider unavailable'); });
    const summary = await summarizeCheckpoint({ complete } as unknown as LlmClient, 2, [
      { tool: 'apply_edit', detail: 'Reconnect handler', result: { ok: true, output: 'Edited.', filesTouched: ['src/reconnect.ts'] } },
      { tool: 'run_command', detail: 'Integration check', result: { ok: true, output: 'Started', status: 'running' } },
      { tool: 'run_command', detail: 'Typecheck', result: { ok: true, output: 'error', exitCode: 1, status: 'exited' } },
    ], [], [{ text: 'Verify reconnect behavior', status: 'in_progress' } as CoworkTodo]);
    expect(summary.accomplished).toContain('Updated src/reconnect.ts');
    expect(summary.accomplished).not.toContain('passed');
    expect(summary.issues).toContain('1 action reported a problem');
    expect(summary.next).toBe('Verify reconnect behavior');
    expect(complete).toHaveBeenCalledTimes(1);
  });

  it('bounds evidence and falls back when the model returns tool markup', async () => {
    const complete = vi.fn(async () => JSON.stringify({ accomplished: '<tool>unwanted</tool>', next: 'Continue' }));
    const actions = Array.from({ length: 96 }, (_, i) => ({ tool: 'read_file', detail: `file-${i}`, result: { ok: true, output: 'x'.repeat(8000) } }));
    const summary = await summarizeCheckpoint({ complete } as unknown as LlmClient, 3, actions, [], []);
    expect(summary.accomplished).toContain('96 file or page actions');
    expect(summary.accomplished).not.toContain('<tool>');
    const [messages, options] = complete.mock.calls[0] as unknown as [{ content: string }[], { tools?: unknown; signal: AbortSignal }];
    const evidence = JSON.parse(messages[1]!.content);
    expect(evidence.actions).toHaveLength(32);
    expect(evidence.actions[0].output).toHaveLength(1000);
    expect(evidence.totalActions).toBe(96);
    expect(options.tools).toBeUndefined();
  });

  it('honors user cancellation during a summary', async () => {
    const controller = new AbortController();
    const complete = async () => { controller.abort(); return '{}'; };
    await expect(summarizeCheckpoint({ complete } as unknown as LlmClient, 2, [], [], [], controller.signal)).rejects.toThrow();
  });
});
