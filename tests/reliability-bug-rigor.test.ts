import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { Hermes } from '../src/agent/gitu.js';
import { hasRegressionProof } from '../src/evidence/evidence.js';
import { ScriptedMockLlm, type LlmMessage } from '../src/llm/llm.js';

function makeBugProject(name: string): string {
  const dir = mkdtempSync(path.join(tmpdir(), `hermes-bugrigor-${name}-`));
  writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: `bugrigor-${name}` }));
  // Broken product file: running it crashes until the agent rewrites it.
  writeFileSync(path.join(dir, 'index.js'), 'throw new Error("boom");');
  return dir;
}

const FIX = `console.log('hello');`;

describe('hasRegressionProof', () => {
  const t = (n: number): string => new Date(Date.UTC(2026, 0, 1, 0, 0, n)).toISOString();

  it('accepts fail -> edit -> pass for the same command', () => {
    expect(
      hasRegressionProof({
        evidence: [
          { command: 'npm test', passed: false, createdAt: t(1) },
          { command: 'npm test', passed: true, createdAt: t(3) },
        ],
        actions: [{ tool: 'apply_edit', status: 'success', createdAt: t(2) }],
      }),
    ).toBe(true);
  });

  it('rejects a passing run with no prior failure', () => {
    expect(
      hasRegressionProof({
        evidence: [{ command: 'npm test', passed: true, createdAt: t(3) }],
        actions: [{ tool: 'apply_edit', status: 'success', createdAt: t(2) }],
      }),
    ).toBe(false);
  });

  it('accepts fail -> edit -> pass after an earlier passing baseline', () => {
    expect(
      hasRegressionProof({
        evidence: [
          { command: 'npm test', passed: true, createdAt: t(1) },
          { command: 'npm test', passed: false, createdAt: t(2) },
          { command: 'npm test', passed: true, createdAt: t(4) },
        ],
        actions: [{ tool: 'apply_edit', status: 'success', createdAt: t(3) }],
      }),
    ).toBe(true);
  });

  it('does not use an earlier passing baseline as post-fix proof', () => {
    expect(
      hasRegressionProof({
        evidence: [
          { command: 'npm test', passed: true, createdAt: t(1) },
          { command: 'npm test', passed: false, createdAt: t(2) },
        ],
        actions: [{ tool: 'apply_edit', status: 'success', createdAt: t(3) }],
      }),
    ).toBe(false);
  });

  it('rejects fail -> pass with no edit in between', () => {
    expect(
      hasRegressionProof({
        evidence: [
          { command: 'npm test', passed: false, createdAt: t(1) },
          { command: 'npm test', passed: true, createdAt: t(2) },
        ],
        actions: [{ tool: 'apply_edit', status: 'success', createdAt: t(5) }],
      }),
    ).toBe(false);
  });

  it('rejects fail and pass of DIFFERENT commands', () => {
    expect(
      hasRegressionProof({
        evidence: [
          { command: 'npm test -- old', passed: false, createdAt: t(1) },
          { command: 'npm test -- other', passed: true, createdAt: t(3) },
        ],
        actions: [{ tool: 'write_file', status: 'success', createdAt: t(2) }],
      }),
    ).toBe(false);
  });

  it('ignores trivial commands as proof', () => {
    expect(
      hasRegressionProof({
        evidence: [
          { command: 'echo hi', passed: false, createdAt: t(1) },
          { command: 'echo hi', passed: true, createdAt: t(3) },
        ],
        actions: [{ tool: 'apply_edit', status: 'success', createdAt: t(2) }],
      }),
    ).toBe(false);
  });
});

describe('Hermes — bug-fix rigor gate', () => {
  it('completes a reproduced fix on the first attempt when the original checks passed before regression coverage was added', async () => {
    const dir = makeBugProject('baseline-pass');
    writeFileSync(path.join(dir, 'index.js'), 'module.exports = () => "helo";');
    writeFileSync(path.join(dir, 'check.js'), 'const assert = require("node:assert/strict"); assert.equal(typeof require("./index.js"), "function");');
    const events: string[] = [];
    const reply = (action: Record<string, unknown>) => () => JSON.stringify({ action });
    const verify = reply({ type: 'tool_call', tool: 'run_command', params: { command: 'node check.js' }, reason: 'check the greeting', expected: 'exit 0' });
    const llm = new ScriptedMockLlm([
      reply({ type: 'set_criteria', criteria: [{ text: 'Greeting is hello', verification: 'node check.js', evidenceType: 'command_success' }] }),
      reply({ type: 'set_plan', steps: [{ description: 'Repair greeting', verification: 'node check.js' }] }),
      verify,
      reply({
        type: 'tool_call', tool: 'write_file',
        params: { path: 'check.js', content: 'const assert = require("node:assert/strict"); assert.equal(require("./index.js")(), "hello");' },
        reason: 'add coverage for the wrong greeting', expected: 'regression assertion saved',
      }),
      verify,
      reply({ type: 'set_hypothesis', text: 'The greeting string is misspelled and existing coverage only checked its type.' }),
      reply({ type: 'tool_call', tool: 'write_file', params: { path: 'index.js', content: 'module.exports = () => "hello";' }, reason: 'correct the greeting', expected: 'greeting corrected' }),
      verify,
      (_call, messages) => {
        const evidenceId = [...messages.map((message) => message.content).join('\n')
          .matchAll(/EVIDENCE RECORDED: (ev-\d{8}-[0-9a-f]{6})/g)].at(-1)?.[1];
        return JSON.stringify({ action: { type: 'claim_criterion', criterionId: 'ac-1', evidenceId } });
      },
      reply({ type: 'complete', summary: 'Corrected the greeting with regression coverage.', risks: [], followUps: [] }),
      () => 'VERDICT: PASS',
      reply({ type: 'request_block', reason: 'Completion unexpectedly rejected after the passing regression.' }),
    ]);

    const { ledger, report } = await new Hermes({ cwd: dir, llm, mode: 'fast', autoLearn: false, onEvent: (event) => events.push(event) })
      .run('Fix the misspelled greeting');

    expect(ledger.data.evidence.map((evidence) => evidence.passed)).toEqual([true, false, true]);
    expect(report.status, events.join('\n')).toBe('complete');
    expect(events.some((event) => event.includes('bug-fix completion rejected'))).toBe(false);
    expect(report.remainingRisks.some((risk) => risk.includes('rigor override'))).toBe(false);
  }, 30000);

  it('accepts a bug fix that reproduces (FAIL), edits, and re-verifies (PASS), but rejects completion once for the missing root cause', async () => {
    const dir = makeBugProject('happy');
    const events: string[] = [];
    const llm = new ScriptedMockLlm([
      () => JSON.stringify({ action: { type: 'set_criteria', criteria: [{ text: 'node index.js prints hello', verification: 'node index.js', evidenceType: 'command_success' }] } }),
      () => JSON.stringify({ action: { type: 'set_plan', steps: [{ description: 'fix the greeting', verification: 'node index.js' }] } }),
      () => JSON.stringify({ action: { type: 'tool_call', tool: 'run_command', params: { command: 'node index.js' }, reason: 'reproduce', expected: 'it crashes' } }),
      () => JSON.stringify({ action: { type: 'tool_call', tool: 'write_file', params: { path: 'index.js', content: FIX }, reason: 'fix', expected: 'prints hello' } }),
      () => JSON.stringify({ action: { type: 'tool_call', tool: 'run_command', params: { command: 'node index.js' }, reason: 're-verify', expected: 'exit 0' } }),
      (_n: number, messages: LlmMessage[]) => {
        const text = messages.map((m) => m.content).join('\n');
        // Take the LAST evidence id — the earlier one is the intentional
        // reproduction FAILURE, the latest is the passing re-verification.
        const ids = [...text.matchAll(/(ev-\d{8}-[0-9a-f]{6})/g)];
        const evId = ids.at(-1)?.[1] ?? 'ev-x';
        return JSON.stringify({ action: { type: 'claim_criterion', criterionId: 'ac-1', evidenceId: evId } });
      },
      // No hypothesis yet → the rigor gate must reject this completion.
      () => JSON.stringify({ action: { type: 'complete', summary: 'fixed', risks: [], followUps: [] } }),
      () => JSON.stringify({ action: { type: 'set_hypothesis', text: 'index.js threw because it was a stub' } }),
      // Reviewer call for the accepted completion.
      () => 'VERDICT: PASS',
      () => JSON.stringify({ action: { type: 'complete', summary: 'fixed with root cause recorded', risks: [], followUps: [] } }),
    ]);
    const hermes = new Hermes({ cwd: dir, llm, mode: 'fast', onEvent: (e) => events.push(e) });

    const { ledger, report } = await hermes.run('fix the broken greeting script');

    expect(events.some((e) => e.includes('bug-fix completion rejected'))).toBe(true);
    expect(ledger.data.currentHypothesis).toBeTruthy();
    expect(report.status).toBe('complete');
    // The fail→edit→pass pair was recorded, so no override risk was needed.
    expect((report.remainingRisks ?? []).some((r) => r.includes('rigor override'))).toBe(false);
  }, 40000);

  it('rejects a fix without reproduction twice, then completes with the gap recorded as a risk', async () => {
    const dir = makeBugProject('override');
    const events: string[] = [];
    const llm = new ScriptedMockLlm([
      () => JSON.stringify({ action: { type: 'set_criteria', criteria: [{ text: 'node index.js prints hello', verification: 'node index.js', evidenceType: 'command_success' }] } }),
      () => JSON.stringify({ action: { type: 'set_plan', steps: [{ description: 'fix the greeting', verification: 'node index.js' }] } }),
      () => JSON.stringify({ action: { type: 'set_hypothesis', text: 'assumed a stub — never reproduced' } }),
      () => JSON.stringify({ action: { type: 'tool_call', tool: 'write_file', params: { path: 'index.js', content: FIX }, reason: 'fix blindly', expected: 'prints hello' } }),
      () => JSON.stringify({ action: { type: 'tool_call', tool: 'run_command', params: { command: 'node index.js' }, reason: 'verify', expected: 'exit 0' } }),
      (_n: number, messages: LlmMessage[]) => {
        const text = messages.map((m) => m.content).join('\n');
        const evId = (text.match(/(ev-\d{8}-[0-9a-f]{6})/) ?? [])[1] ?? 'ev-x';
        return JSON.stringify({ action: { type: 'claim_criterion', criterionId: 'ac-1', evidenceId: evId } });
      },
      () => JSON.stringify({ action: { type: 'complete', summary: 'attempt 1', risks: [], followUps: [] } }),
      () => JSON.stringify({ action: { type: 'complete', summary: 'attempt 2', risks: [], followUps: [] } }),
      // Third attempt: the gate yields and records the gap as a risk.
      () => 'VERDICT: PASS',
      () => JSON.stringify({ action: { type: 'complete', summary: 'attempt 3', risks: [], followUps: [] } }),
    ]);
    const hermes = new Hermes({ cwd: dir, llm, mode: 'fast', onEvent: (e) => events.push(e) });

    const { report } = await hermes.run('fix the broken greeting script');

    expect(events.filter((e) => e.includes('bug-fix completion rejected')).length).toBe(2);
    expect(events.some((e) => e.includes('gap accepted after repeated rejection'))).toBe(true);
    expect(report.status).toBe('complete');
    expect((report.remainingRisks ?? []).some((r) => r.includes('rigor override'))).toBe(true);
  }, 40000);
});
