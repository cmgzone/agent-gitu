import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { SubAgentRunner } from '../src/agent/subagent.js';
import type { LlmClient, LlmMessage, LlmOptions } from '../src/llm/llm.js';

function makeProject(): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'hermes-rspec-'));
  writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: 'rspec-test' }));
  mkdirSync(path.join(dir, 'src'), { recursive: true });
  writeFileSync(path.join(dir, 'src', 'a.txt'), 'export const a = 1;\n');
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

function crashingLlm(): LlmClient {
  return {
    name: 'crash-worker',
    async complete(): Promise<string> {
      throw new Error('simulated specialist crash');
    },
    async completeStream(_messages: LlmMessage[], _opts: LlmOptions, _onDelta: (delta: string) => void): Promise<string> {
      throw new Error('simulated specialist crash');
    },
  };
}

const readFileAction = (p: string) =>
  JSON.stringify({
    action: { type: 'tool_call', tool: 'read_file', params: { path: p }, reason: 'inspect', expected: 'content' },
  });

function makeRunner(dir: string, llm: LlmClient, events: string[], overrides: Partial<ConstructorParameters<typeof SubAgentRunner>[0]> = {}) {
  return new SubAgentRunner({
    cwd: dir,
    resolveLlm: () => llm,
    agentRole: () => 'test specialist',
    isolate: false,
    onEvent: (e) => events.push(e),
    ...overrides,
  });
}

describe('SubAgentRunner — dynamic turn budgeting', () => {
  it('starts at the base budget of 30 turns', async () => {
    const dir = makeProject();
    const events: string[] = [];
    // 28 successful inspections, then an answer on turn 29 — before the
    // progress-extension at turn 30 (0-indexed 28) can fire.
    const replies = Array.from({ length: 28 }, () => () => readFileAction('src/a.txt'));
    replies.push(() => JSON.stringify({ action: { type: 'answer', summary: 'inspected and finished' } }));
    const runner = makeRunner(dir, scriptedLlm(replies), events);

    const result = await runner.runOne('scout', 'inspect the repo');

    expect(events.some((e) => e.includes('turn 1/30'))).toBe(true);
    expect(events.some((e) => e.includes('turn 29/30'))).toBe(true);
    expect(events.some((e) => e.includes('dynamically extending budget'))).toBe(false);
    expect(result.status).toBe('SUCCESS');
    expect(result.ok).toBe(true);
    expect(result.turnsUsed).toBe(29);
    expect(result.turnsBudgeted).toBe(30);
  });

  it('extends the budget when productive work continues past the limit', async () => {
    const dir = makeProject();
    const events: string[] = [];
    const replies = Array.from({ length: 29 }, () => () => readFileAction('src/a.txt'));
    replies.push(() => JSON.stringify({ action: { type: 'answer', summary: 'done after extension' } }));
    const runner = makeRunner(dir, scriptedLlm(replies), events);

    const result = await runner.runOne('scout', 'inspect the repo');

    // At turn 19 (0-indexed 18) progress was still flowing, so the budget
    // grew to 40 and the specialist got to answer under the extended budget.
    expect(events.some((e) => e.includes('dynamically extending budget to turn 40'))).toBe(true);
    expect(events.some((e) => e.includes('turn 30/40'))).toBe(true);
    expect(result.status).toBe('SUCCESS');
    expect(result.turnsBudgeted).toBe(40);
    expect(result.turnsUsed).toBe(30);
  });

  it('never exceeds the hard ceiling', async () => {
    const dir = makeProject();
    const events: string[] = [];
    // Infinite productive work: read_file always succeeds, so the loop can
    // only stop via the ceiling. Base 30, ceiling 40: the budget must grow
    // 30 → 40 and then stop; 40+10 would exceed the ceiling and is refused.
    const runner = makeRunner(dir, scriptedLlm([() => readFileAction('src/a.txt')]), events, {
      baseTurns: 30,
      hardCeilingTurns: 40,
    });

    const result = await runner.runOne('digger', 'keep inspecting');

    expect(result.turnsUsed).toBe(40);
    expect(result.turnsBudgeted).toBe(40);
    expect(events.filter((e) => e.includes('dynamically extending budget'))).toHaveLength(1);
    expect(events.some((e) => e.includes('turn 41/'))).toBe(false);
    // Structured termination on budget exhaustion: work is partial, reported.
    expect(result.status).toBe('PARTIAL_SUCCESS');
    expect(result.filesInspected).toContain('src/a.txt');
    expect(result.summary).toContain('SPECIALIST PARTIAL RESULT');
    expect(result.summary).toContain('Turn budget reached');
    expect(result.recommendation).toBeDefined();
  });
});

describe('SubAgentRunner — stagnation early termination', () => {
  it('terminates early on repeated failing turns', async () => {
    const dir = makeProject();
    const events: string[] = [];
    // Every read targets a missing file → consecutive errors grow.
    const replies = Array.from({ length: 5 }, () => () => readFileAction('src/does-not-exist.txt'));
    replies.push(() => JSON.stringify({ action: { type: 'answer', summary: 'never reached' } }));
    const runner = makeRunner(dir, scriptedLlm(replies), events);

    const result = await runner.runOne('stumbler', 'find the missing file');

    expect(result.turnsUsed).toBe(5);
    expect(result.status).toBe('BLOCKED');
    expect(result.ok).toBe(false);
    expect(result.blockers?.some((b) => b.includes('Stalled'))).toBe(true);
    expect(result.recommendation).toBeDefined();
    expect(events.some((e) => e.includes('loop/stagnation detected'))).toBe(true);
  });

  it('terminates early when the specialist stops producing valid actions', async () => {
    const dir = makeProject();
    const events: string[] = [];
    // Prose-only replies: no valid JSON action ever.
    const runner = makeRunner(dir, scriptedLlm([() => 'I will think about this very carefully now.']), events);

    const result = await runner.runOne('brooder', 'ponder the task');

    expect(result.turnsUsed).toBe(6);
    expect(result.status).toBe('BLOCKED');
    expect(result.ok).toBe(false);
    expect(result.blockers?.some((b) => b.includes('Stalled'))).toBe(true);
    expect(events.some((e) => e.includes('loop/stagnation detected'))).toBe(true);
  });
});

describe('SubAgentRunner — structured result guarantee', () => {
  it('returns a complete structured result even when the specialist crashes (drain fallback)', async () => {
    const dir = makeProject();
    const runner = makeRunner(dir, crashingLlm(), []);

    const result = await runner.runOne('crasher', 'this will crash');

    expect(result.ok).toBe(false);
    expect(result.status).toBe('FAILED');
    expect(result.summary).toContain('simulated specialist crash');
    expect(result.turnsUsed).toBe(1);
    expect(result.turnsBudgeted).toBe(30);
    expect(result.filesInspected).toEqual([]);
    expect(result.filesChanged).toEqual([]);
    expect(result.evidenceIds).toEqual([]);
    expect(result.blockers).toBeDefined();
    expect(result.recommendation).toBeDefined();
  });

  it('always reports structured fields on every termination path', async () => {
    const dir = makeProject();
    const events: string[] = [];
    const runner = makeRunner(dir, scriptedLlm([() => readFileAction('src/a.txt')]), events, {
      baseTurns: 2,
      hardCeilingTurns: 4,
    });

    const result = await runner.runOne('worker', 'short burst');

    for (const field of [
      'agent',
      'task',
      'ok',
      'status',
      'summary',
      'turnsUsed',
      'turnsBudgeted',
      'filesInspected',
      'filesChanged',
      'evidenceIds',
    ] as const) {
      expect(result[field], `missing structured field ${field}`).toBeDefined();
    }
    expect(['SUCCESS', 'PARTIAL_SUCCESS', 'BLOCKED', 'FAILED', 'CANCELLED']).toContain(result.status);
  });
});
