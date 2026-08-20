import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { Hermes } from '../src/agent/hermes.js';
import { SubAgentRunner } from '../src/agent/subagent.js';
import {
  DEFAULT_MALFORMED_POLICY,
  MalformedCallTracker,
  malformedIntervention,
  malformedKindFor,
} from '../src/loop/malformed-tracker.js';
import { ScriptedMockLlm, type LlmClient, type LlmMessage } from '../src/llm/llm.js';

function makeProject(name: string): string {
  const dir = mkdtempSync(path.join(tmpdir(), `hermes-p13-${name}-`));
  writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: `p13-${name}` }));
  return dir;
}

function malformedRead(call: number): () => string {
  // Each malformed call differs from the last (different paramsHash), so the
  // LoopDetector's same-action tracking can never fire — exactly the spiral.
  const badParams: unknown[] = [
    { path: 123 },
    { path: 'undefined' },
    { path: null },
    { path: [] },
    { path: {} },
    { path: 456 },
    { path: 'null' },
    { path: true },
  ];
  return () =>
    JSON.stringify({
      thought: 'trying to read',
      action: {
        type: 'tool_call',
        tool: 'read_file',
        params: badParams[call % badParams.length],
        reason: 'read the file',
        expected: 'file contents',
      },
    });
}

describe('MalformedCallTracker — spiral detection unit', () => {
  it('escalates in stages: remind -> strategy change -> halt', () => {
    const t = new MalformedCallTracker();
    const v1 = t.note('schema');
    expect(v1).toMatchObject({ streak: 1, remind: false, escalate: false, halt: false });
    const v2 = t.note('schema');
    expect(v2).toMatchObject({ streak: 2, remind: true, escalate: false, halt: false });
    t.note('schema');
    t.note('schema');
    expect(t.note('schema')).toMatchObject({ streak: 5, escalate: true, halt: false });
    const v6 = t.note('schema');
    expect(v6).toMatchObject({ streak: 6, halt: true });
  });

  it('resets on well-formed progress', () => {
    const t = new MalformedCallTracker();
    t.note('schema');
    t.note('schema');
    t.reset();
    expect(t.currentStreak).toBe(0);
    expect(t.note('unknown-tool')).toMatchObject({ streak: 1 });
  });

  it('classifies executor error signatures', () => {
    expect(malformedKindFor('invalid-tool-params')).toBe('schema');
    expect(malformedKindFor('unknown-tool')).toBe('unknown-tool');
    expect(malformedKindFor(undefined)).toBeUndefined();
    expect(malformedKindFor('some-fs-error')).toBeUndefined();
    expect(malformedKindFor('')).toBeUndefined();
  });

  it('policy defaults are sane', () => {
    expect(DEFAULT_MALFORMED_POLICY).toEqual({ remindAt: 2, escalateAt: 4, haltAt: 6 });
  });

  it('intervention names the offending tool and the escape hatches', () => {
    const text = malformedIntervention(4, 'read_file');
    expect(text).toContain('STRATEGY CHANGE REQUIRED');
    expect(text).toContain('4 tool calls were malformed');
    expect(text).toContain('Stop calling "read_file"');
    expect(text).toContain('set_hypothesis');
    expect(text).toContain('request_block');
  });
});

describe('Hermes — malformed-call spiral protection', () => {
  it('halts a schema-error spiral instead of burning turns forever', async () => {
    const dir = makeProject('spiral');
    const events: string[] = [];
    const llm = new ScriptedMockLlm([
      () => JSON.stringify({ action: { type: 'set_criteria', criteria: ['the file is readable'] } }),
      () => JSON.stringify({ action: { type: 'set_plan', steps: [{ description: 'read', verification: 'n/a' }] } }),
      ...Array.from({ length: 6 }, (_, i) => malformedRead(i)),
    ]);
    const hermes = new Hermes({ cwd: dir, llm, mode: 'fast', onEvent: (e) => events.push(e) });

    const { ledger, report } = await hermes.run('read the file');

    expect(events.some((e) => e.includes('stall   malformed-call spiral detected'))).toBe(true);
    expect(events.some((e) => e.includes('malformed call streak 4/6 — strategy change injected'))).toBe(true);
    expect(report.status).toBe('failed');
    expect(ledger.data.blockers.some((b) => b.includes('consecutive malformed tool calls'))).toBe(true);
    // Exactly six malformed attempts were recorded — the run stopped at the halt threshold.
    const errors = ledger.data.actions.filter((a) => a.status === 'error');
    expect(errors).toHaveLength(6);
  }, 30000);

  it('recovers when the model corrects itself after a short streak', async () => {
    const dir = makeProject('recover');
    const llm = new ScriptedMockLlm([
      () => JSON.stringify({ action: { type: 'set_criteria', criteria: [{ text: 'node runs', verification: 'node --version', evidenceType: 'command_success' }] } }),
      () => JSON.stringify({ action: { type: 'set_plan', steps: [{ description: 'verify', verification: 'node --version' }] } }),
      malformedRead(0),
      malformedRead(1),
      () => JSON.stringify({ action: { type: 'tool_call', tool: 'run_command', params: { command: 'node --version' }, reason: 'verify', expected: 'exit 0' } }),
      (_n, messages: LlmMessage[]) => {
        const text = messages.map((m) => m.content).join('\n');
        const evId = (text.match(/(ev-\d{8}-[0-9a-f]{6})/) ?? [])[1] ?? 'ev-x';
        return JSON.stringify({ action: { type: 'claim_criterion', criterionId: 'ac-1', evidenceId: evId } });
      },
      () => JSON.stringify({ action: { type: 'complete', summary: 'verified', risks: [], followUps: [] } }),
    ]);
    const hermes = new Hermes({ cwd: dir, llm, mode: 'fast' });

    const { ledger, report } = await hermes.run('verify node');

    expect(report.status).toBe('complete');
    expect(ledger.data.acceptanceCriteria[0]!.satisfied).toBe(true);
    expect(ledger.data.blockers).toEqual([]);
    // The two malformed calls were absorbed without escalating.
    expect(ledger.data.actions.some((a) => a.status === 'error')).toBe(true);
    expect(ledger.data.actions.some((a) => a.status === 'success')).toBe(true);
  }, 30000);

  it('catches a mixed meltdown of unparseable replies and malformed calls', async () => {
    const dir = makeProject('mixed');
    const llm = new ScriptedMockLlm([
      () => JSON.stringify({ action: { type: 'set_criteria', criteria: ['works'] } }),
      () => JSON.stringify({ action: { type: 'set_plan', steps: [{ description: 'do', verification: 'n/a' }] } }),
      () => 'I will now carefully analyze the problem and consider my approach.',
      malformedRead(0),
      () => 'Let me think about this differently.',
      malformedRead(1),
      malformedRead(2),
      malformedRead(3),
    ]);
    const hermes = new Hermes({ cwd: dir, llm, mode: 'fast' });

    const { ledger, report } = await hermes.run('mixed meltdown');

    expect(report.status).toBe('failed');
    expect(ledger.data.blockers.some((b) => b.includes('consecutive malformed tool calls'))).toBe(true);
    // invalidStreak alone would have reset on every parseable reply — only the
    // category tracker can stop this mixed spiral.
    expect(ledger.data.blockers[0]).not.toContain('unparseable');
  }, 30000);
});

describe('SubAgentRunner — malformed-call protection', () => {
  function makeRunner(dir: string, llm: LlmClient, events: string[]) {
    return new SubAgentRunner({
      cwd: dir,
      isolate: false,
      resolveLlm: () => llm,
      agentRole: () => 'test specialist',
      onEvent: (e) => events.push(e),
    });
  }

  it('stops a specialist that spirals into malformed calls, with a malformed-aware blocker', async () => {
    const dir = makeProject('sub-spiral');
    const events: string[] = [];
    const llm = new ScriptedMockLlm([...Array.from({ length: 6 }, (_, i) => malformedRead(i))]);
    const runner = makeRunner(dir, llm, events);

    const result = await runner.runOne('worker', 'read everything');

    expect(result.ok).toBe(false);
    expect(result.status).toBe('BLOCKED');
    expect(result.blockers?.[0]).toContain('Repeated malformed tool calls');
    expect(events.some((e) => e.includes('strategy change injected'))).toBe(true);
    expect(result.turnsUsed).toBeLessThan(6);
  }, 30000);

  it('recovers after a short malformed streak and completes the task', async () => {
    const dir = makeProject('sub-recover');
    const events: string[] = [];
    const criteria = [{ text: 'node runs', verification: 'node --version', evidenceType: 'command_success' as const }];
    const llm = new ScriptedMockLlm([
      malformedRead(0),
      malformedRead(1),
      () => JSON.stringify({ action: { type: 'tool_call', tool: 'run_command', params: { command: 'node --version' }, reason: 'verify', expected: 'exit 0' } }),
      (_n, messages: LlmMessage[]) => {
        const text = messages.map((m) => m.content).join('\n');
        const evId = (text.match(/(ev-\d{8}-[0-9a-f]{6})/) ?? [])[1] ?? 'ev-x';
        return JSON.stringify({ action: { type: 'claim_criterion', criterionId: 'ac-1', evidenceId: evId } });
      },
      () => JSON.stringify({ action: { type: 'answer', summary: 'node verified' } }),
    ]);
    const runner = makeRunner(dir, llm, events);

    const result = await runner.runOne('worker', 'verify node', criteria);

    expect(result.ok).toBe(true);
    expect(result.status).toBe('SUCCESS');
    expect(result.criteriaStatus?.[0]?.satisfied).toBe(true);
    expect(result.blockers).toBeUndefined();
  }, 30000);
});