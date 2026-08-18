import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { SubAgentRunner } from '../src/agent/subagent.js';
import { gitExec } from '../src/git/git.js';
import type { LlmClient, LlmMessage, LlmOptions } from '../src/llm/llm.js';

function makeProject(): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'hermes-subagents-'));
  writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: 'subagents-test' }));
  return dir;
}

function scriptedLlm(replies: (() => string)[]): LlmClient {
  let call = 0;
  return {
    name: 'test-worker',
    async complete(_messages: LlmMessage[], _opts?: LlmOptions): Promise<string> {
      const reply = replies[Math.min(call, replies.length - 1)];
      call += 1;
      return reply();
    },
    async completeStream(messages: LlmMessage[], opts: LlmOptions, onDelta: (delta: string) => void): Promise<string> {
      const reply = await this.complete(messages, opts);
      onDelta(reply);
      return reply;
    },
  };
}

describe('SubAgentRunner', () => {
  it('queues background agents, limits concurrent workers, and retains their results', async () => {
    const dir = makeProject();
    const events: string[] = [];
    let active = 0;
    let peak = 0;
    const llm: LlmClient = {
      name: 'test-worker',
      async complete(_messages: LlmMessage[], _opts?: LlmOptions): Promise<string> {
        active += 1;
        peak = Math.max(peak, active);
        await new Promise((resolve) => setTimeout(resolve, 25));
        active -= 1;
        return JSON.stringify({ action: { type: 'answer', summary: 'checked independently' } });
      },
      async completeStream(messages: LlmMessage[], opts: LlmOptions, onDelta: (delta: string) => void): Promise<string> {
        const reply = await this.complete(messages, opts);
        onDelta(reply);
        return reply;
      },
    };
    const runner = new SubAgentRunner({
      cwd: dir,
      resolveLlm: () => llm,
      agentRole: () => 'test specialist',
      agentEffort: () => 'low',
      maxConcurrent: 2,
      onEvent: (event) => events.push(event),
    });

    const jobs = runner.startMany([
      { agent: 'one', task: 'check one' },
      { agent: 'two', task: 'check two' },
      { agent: 'three', task: 'check three' },
      { agent: 'four', task: 'check four' },
    ]);
    expect(jobs).toHaveLength(4);
    expect(runner.status()).toHaveLength(4);
    expect(runner.status().some((job) => job.status === 'queued')).toBe(true);

    const results = await runner.waitFor(jobs.map((job) => job.id));
    expect(results.every((result) => result.ok)).toBe(true);
    expect(peak).toBeLessThanOrEqual(2);
    expect(runner.status().every((job) => job.status === 'completed')).toBe(true);
    expect(events.some((event) => event.includes('[queued]'))).toBe(true);
    expect(events.some((event) => event.includes('[completed]'))).toBe(true);
  });

  it('runs specialists in isolated git worktrees and merges product changes back', async () => {
    const dir = makeProject();
    await gitExec(dir, ['init']);
    await gitExec(dir, ['add', '-A']);
    await gitExec(dir, ['-c', 'user.name=hermes-test', '-c', 'user.email=hermes@test.local', 'commit', '-m', 'initial']);

    const llm = scriptedLlm([
      () => JSON.stringify({
        action: {
          type: 'tool_call',
          tool: 'write_file',
          params: { path: 'src/isolated.txt', content: 'written in worktree' },
          reason: 'test write',
          expected: 'file appears',
        },
      }),
      () => JSON.stringify({ action: { type: 'answer', summary: 'done in isolation' } }),
    ]);
    const events: string[] = [];
    const runner = new SubAgentRunner({
      cwd: dir,
      resolveLlm: () => llm,
      agentRole: () => 'tester',
      onEvent: (event) => events.push(event),
    });

    const [result] = await runner.runMany([{ agent: 'iso', task: 'write isolated file' }]);

    expect(result.ok).toBe(true);
    expect(events.some((event) => event.includes('worktree'))).toBe(true);
    expect(readFileSync(path.join(dir, 'src', 'isolated.txt'), 'utf8')).toBe('written in worktree');

    const worktrees = await gitExec(dir, ['worktree', 'list']);
    expect(worktrees.split(/\r?\n/).filter(Boolean)).toHaveLength(1);
    const branches = await gitExec(dir, ['branch']);
    expect(branches).not.toContain('hermes-sub-');
    const mergeLog = await gitExec(dir, ['log', '--oneline']);
    expect(mergeLog).toContain('merge');
  });

  it('does not merge changes when the specialist fails, and reports merge conflicts', async () => {
    const dir = makeProject();
    await gitExec(dir, ['init']);
    await gitExec(dir, ['add', '-A']);
    await gitExec(dir, ['-c', 'user.name=hermes-test', '-c', 'user.email=hermes@test.local', 'commit', '-m', 'initial']);

    const llm = scriptedLlm([
      () => JSON.stringify({
        action: {
          type: 'tool_call',
          tool: 'write_file',
          params: { path: 'src/conflicted.txt', content: 'worktree version' },
          reason: 'test write',
          expected: 'file appears',
        },
      }),
      () => JSON.stringify({ action: { type: 'request_block', reason: 'gave up' } }),
    ]);
    const runner = new SubAgentRunner({
      cwd: dir,
      resolveLlm: () => llm,
      agentRole: () => 'tester',
    });

    const [result] = await runner.runMany([{ agent: 'failing', task: 'write then give up' }]);

    expect(result.ok).toBe(false);
    expect(() => readFileSync(path.join(dir, 'src', 'conflicted.txt'), 'utf8')).toThrow();
    const worktrees = await gitExec(dir, ['worktree', 'list']);
    expect(worktrees.split(/\r?\n/).filter(Boolean)).toHaveLength(1);
  });
});
