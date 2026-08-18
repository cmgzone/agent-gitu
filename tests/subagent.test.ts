import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { SubAgentRunner } from '../src/agent/subagent.js';
import type { LlmClient, LlmMessage, LlmOptions } from '../src/llm/llm.js';

function makeProject(): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'hermes-subagents-'));
  writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: 'subagents-test' }));
  return dir;
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
});
