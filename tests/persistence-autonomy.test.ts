import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { Hermes } from '../src/agent/gitu.js';
import {
  ABSOLUTE_TURN_CEILING,
  DEFAULT_AUTONOMY,
  FAIL_FAST_MALFORMED_POLICY,
  MAX_EMPTY_LADDER_CYCLES,
  PERSISTENT_MALFORMED_POLICY,
  malformedPolicyFor,
  mayExtendBudget,
  resolveAutonomy,
  turnCeilingFor,
} from '../src/agent/autonomy.js';
import { ScriptedMockLlm, type LlmMessage } from '../src/llm/llm.js';

function makeProject(name: string): string {
  const dir = mkdtempSync(path.join(tmpdir(), `gitu-autonomy-${name}-`));
  writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: `gitu-${name}` }));
  return dir;
}

const CRITERIA = () => JSON.stringify({
  action: { type: 'set_criteria', criteria: [{ text: 'node runs', verification: 'node --version', evidenceType: 'command_success' }] },
});
const PLAN = () => JSON.stringify({ action: { type: 'set_plan', steps: [{ description: 'verify', verification: 'node --version' }] } });
const VERIFY = () => JSON.stringify({
  action: { type: 'tool_call', tool: 'run_command', params: { command: 'node --version' }, reason: 'verify', expected: 'exit 0' },
});
const CLAIM = (_call: number, messages: LlmMessage[]) => {
  const text = messages.map((m) => m.content).join('\n');
  const evId = (text.match(/(ev-\d{8}-[0-9a-f]{6})/) ?? [])[1] ?? 'ev-x';
  return JSON.stringify({ action: { type: 'claim_criterion', criterionId: 'ac-1', evidenceId: evId } });
};
const DONE = () => JSON.stringify({ action: { type: 'complete', summary: 'verified', risks: [], followUps: [] } });

/** A schema-invalid read. Each one differs from the last, so the loop detector
 *  can never fire — exactly the malformed-call spiral the tracker exists for. */
function malformedRead(call: number): () => string {
  const badParams: unknown[] = [{ path: 1 }, { path: 'undefined' }, { path: null }, { path: [] }, { path: {} }, { path: 2 }];
  return () => JSON.stringify({
    thought: 'reading',
    action: { type: 'tool_call', tool: 'read_file', params: badParams[call % badParams.length], reason: 'read', expected: 'contents' },
  });
}

describe('autonomy policy', () => {
  it('defaults to persistent, with no ceilings of its own', () => {
    expect(DEFAULT_AUTONOMY).toEqual({ persistent: true });
    expect(resolveAutonomy()).toEqual({ persistent: true });
    expect(resolveAutonomy({})).toEqual({ persistent: true });
  });

  it('keeps an explicit opt-out and only sane ceilings', () => {
    expect(resolveAutonomy({ persistent: false })).toEqual({ persistent: false });
    expect(resolveAutonomy({ maxTurns: 40, maxCostUsd: 2.5 })).toEqual({ persistent: true, maxTurns: 40, maxCostUsd: 2.5 });
    // Zero/negative/NaN ceilings are not ceilings.
    expect(resolveAutonomy({ maxCostUsd: 0, maxTurns: -3 })).toEqual({ persistent: true });
    expect(turnCeilingFor(resolveAutonomy({ maxTurns: 40 }))).toBe(40);
    // Without a user ceiling the liveness backstop is the only bound.
    expect(turnCeilingFor(resolveAutonomy())).toBe(ABSOLUTE_TURN_CEILING);
    expect(turnCeilingFor(resolveAutonomy({ maxTurns: ABSOLUTE_TURN_CEILING * 3 }))).toBe(ABSOLUTE_TURN_CEILING);
  });

  it('raises the malformed ladder under persistent autonomy, and keeps fail-fast exact', () => {
    expect(malformedPolicyFor(resolveAutonomy())).toEqual(PERSISTENT_MALFORMED_POLICY);
    expect(malformedPolicyFor(resolveAutonomy())).toEqual({ remindAt: 3, escalateAt: 6, haltAt: 12 });
    expect(malformedPolicyFor(resolveAutonomy({ persistent: false }))).toEqual(FAIL_FAST_MALFORMED_POLICY);
    expect(FAIL_FAST_MALFORMED_POLICY).toEqual({ remindAt: 1, escalateAt: 2, haltAt: 3 });
  });

  it('extends without limit only while progress continues', () => {
    const persistent = true;
    const limit = 4;
    expect(mayExtendBudget({ persistent, progressing: true, extensionsUsed: 0, extensionLimit: limit })).toBe(true);
    // Past the nominal limit, verified progress still buys more turns…
    expect(mayExtendBudget({ persistent, progressing: true, extensionsUsed: limit, extensionLimit: limit })).toBe(true);
    expect(mayExtendBudget({ persistent, progressing: true, extensionsUsed: 99, extensionLimit: limit })).toBe(true);
    // …but a run with no verifiable movement is bounded, not looped forever.
    expect(mayExtendBudget({ persistent, progressing: false, extensionsUsed: limit, extensionLimit: limit })).toBe(false);
    expect(mayExtendBudget({ persistent: false, progressing: true, extensionsUsed: limit, extensionLimit: limit })).toBe(false);
    expect(mayExtendBudget({ persistent: false, progressing: true, extensionsUsed: limit - 1, extensionLimit: limit })).toBe(true);
  });
});

describe('Hermes — contentless provider completions', () => {
  it('retries an empty completion instead of counting it as a malformed reply', async () => {
    const dir = makeProject('empty-retry');
    const events: string[] = [];
    const llm = new ScriptedMockLlm([
      CRITERIA,
      PLAN,
      () => '',
      () => '',
      VERIFY,
      CLAIM,
      DONE,
    ]);
    const hermes = new Hermes({
      cwd: dir,
      llm,
      mode: 'fast',
      recoverySleep: async () => {},
      onEvent: (e) => events.push(e),
    });

    const { report, ledger } = await hermes.run('verify node');

    expect(report.status).toBe('complete');
    expect(ledger.data.blockers).toEqual([]);
    // The empty reply was treated as a transport condition and retried.
    expect(events.some((e) => e.includes('empty completion from provider — retry'))).toBe(true);
    expect(events.some((e) => e.includes('response had no executable action'))).toBe(false);
    expect(ledger.data.acceptanceCriteria[0]!.satisfied).toBe(true);
  }, 30000);

  it('never halts the lane on a streak of empty replies — it ends with the provider failure', async () => {
    const dir = makeProject('empty-forever');
    const events: string[] = [];
    const llm = new ScriptedMockLlm([CRITERIA, PLAN, () => '']);
    const hermes = new Hermes({
      cwd: dir,
      llm,
      mode: 'fast',
      recoverySleep: async () => {},
      onEvent: (e) => events.push(e),
    });

    const { report, ledger } = await hermes.run('verify node');

    // Bounded and honest: a provider that never answers is named as the cause,
    // the run does not spin, and the task stays resumable.
    expect(report.status).toBe('blocked');
    const blockers = ledger.data.blockers.join('\n');
    expect(blockers).toContain('returned no content');
    expect(blockers).toContain('Switch model or provider');
    expect(blockers).not.toContain('without an executable action');
    expect(events.some((e) => e.includes('reporting the provider failure'))).toBe(true);
    // The bound is the ladder's, named in the message so the number is not a
    // mystery to whoever reads the session.
    expect(blockers).toContain(`${MAX_EMPTY_LADDER_CYCLES + 1} consecutive recovery attempts`);
    // Nothing in the state machine blames the model's formatting for it.
    expect(blockers).not.toContain('malformed');
  }, 30000);
});

describe('Hermes — malformed spiral under persistent autonomy', () => {
  it('resets the spiral and keeps working instead of stopping the run', async () => {
    const dir = makeProject('spiral-recovery');
    const events: string[] = [];
    // 13 schema-invalid calls cross the persistent haltAt (12); the run then
    // has to change approach and finish the task rather than report a blocker.
    const llm = new ScriptedMockLlm([
      CRITERIA,
      PLAN,
      ...Array.from({ length: 13 }, (_, i) => malformedRead(i)),
      VERIFY,
      CLAIM,
      DONE,
    ]);
    const hermes = new Hermes({ cwd: dir, llm, mode: 'fast', onEvent: (e) => events.push(e) });

    const { report, ledger } = await hermes.run('verify node');

    expect(report.status).toBe('complete');
    expect(events.some((e) => e.includes('resetting the spiral and continuing'))).toBe(true);
    expect(ledger.data.blockers.some((b) => b.includes('malformed tool calls'))).toBe(false);
    // The rejected calls really happened: this is recovery, not a skipped test.
    expect(ledger.data.actions.filter((a) => a.status === 'error').length).toBeGreaterThanOrEqual(12);
  }, 60000);
});
