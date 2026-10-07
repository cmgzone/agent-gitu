import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { SubAgentRunner } from '../src/agent/subagent.js';
import { estimateTokens, messageTextChars } from '../src/agent/telemetry.js';
import type { LlmClient } from '../src/llm/llm.js';

interface Activity {
  id: string; name: string; task: string; phase: string; current: string;
  contextTokens?: number; startedAt?: string; finishedAt?: string; activity?: string;
}
function activity(events: string[]): Activity[] {
  return events.filter(event => event.startsWith('subagent-state ')).map(event => JSON.parse(event.slice(15)) as Activity);
}
function project() {
  const root = mkdtempSync(path.join(tmpdir(), 'gitu-orbs-'));
  writeFileSync(path.join(root, 'package.json'), '{"name":"orb-fixture"}');
  return root;
}

describe('specialist activity metadata', () => {
  it('correlates concurrent same-name workers and publishes their full assignments and timing', async () => {
    const events: string[] = [];
    const llm: LlmClient = {
      name: 'fixture',
      complete: async () => JSON.stringify({ action: { type: 'answer', summary: 'Reviewed the assignment' } }),
      completeStream: async () => '',
    };
    const runner = new SubAgentRunner({ cwd: project(), resolveLlm: () => llm, agentRole: () => 'Reviewer', onEvent: event => events.push(event) });
    const jobs = runner.startMany([{ agent: 'reviewer', task: 'A long objective: ' + 'a'.repeat(160) }, { agent: 'reviewer', task: 'Review accessibility' }]);
    await runner.waitFor(jobs.map(job => job.id));
    for (const job of jobs) {
      const states = activity(events).filter(state => state.id === job.id);
      expect(states.map(state => state.phase)).toEqual(['waiting', 'working', 'reasoning', 'complete']);
      expect(states[0].task).toBe(job.task);
      expect(Date.parse(states.at(-1)!.finishedAt!)).toBeGreaterThanOrEqual(Date.parse(states.at(-1)!.startedAt!));
      expect(states.at(-1)!.contextTokens).toBeGreaterThan(0);
    }
  });
  it('shows tool use while execution is in flight and estimates the actual latest request', async () => {
    const events: string[] = [];
    let calls = 0, requestTokens = 0;
    const llm: LlmClient = {
      name: 'fixture',
      complete: async messages => {
        requestTokens = estimateTokens(messages.reduce((sum, message) => sum + messageTextChars(message), 0));
        return JSON.stringify({ action: calls++ === 0
          ? { type: 'tool_call', tool: 'read_file', params: { path: 'package.json' }, reason: 'Inspect the project configuration', expected: 'Configuration read' }
          : { type: 'answer', summary: 'Checked configuration' } });
      },
      completeStream: async () => '',
    };
    const runner = new SubAgentRunner({ cwd: project(), resolveLlm: () => llm, agentRole: () => 'Reviewer', onEvent: event => events.push(event) });
    const [job] = runner.startMany([{ agent: 'reviewer', task: 'Read configuration' }]);
    await runner.waitFor([job.id]);
    const states = activity(events);
    expect(states.find(state => state.phase === 'tool')?.current).toBe('Inspect the project configuration');
    expect(states.some(state => state.phase === 'tool' && state.activity?.startsWith('run '))).toBe(true);
    expect(states.at(-1)!.contextTokens).toBe(requestTokens);
    expect(states.at(-1)!.phase).toBe('complete');
  });
  it('settles queued and in-flight cancelled workers without a false green success', async () => {
    const events: string[] = [];
    const llm: LlmClient = { name: 'fixture', complete: async () => new Promise(() => {}), completeStream: async () => '' };
    const runner = new SubAgentRunner({ cwd: project(), resolveLlm: () => llm, agentRole: () => 'Reviewer', maxConcurrent: 1, onEvent: event => events.push(event) });
    const jobs = runner.startMany([{ agent: 'one', task: 'First' }, { agent: 'two', task: 'Queued' }]);
    runner.stop('Stopped by the user');
    await runner.waitFor(jobs.map(job => job.id));
    for (const job of jobs) expect(activity(events).filter(state => state.id === job.id).at(-1)?.phase).toBe('cancelled');
  });
});
