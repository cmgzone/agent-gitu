import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { Hermes } from '../src/agent/gitu.js';
import { ScriptedMockLlm, type LlmMessage } from '../src/llm/llm.js';

function makeProject(): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'hermes-parallel-verification-'));
  writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: 'parallel-verification' }));
  writeFileSync(path.join(dir, 'first.js'), 'console.log("first passed");');
  writeFileSync(path.join(dir, 'second.js'), 'console.log("second passed");');
  writeFileSync(path.join(dir, 'failed.js'), 'process.exit(1);');
  return dir;
}

const action = (value: unknown): string => JSON.stringify({ action: value });
const stop = (): string => action({ type: 'request_block', reason: 'Scripted verification inspection finished.' });
const commandCall = (command: string) => ({ tool: 'run_command', params: { command }, reason: 'verify the script', expected: 'exit 0' });

function parallelResult(messages: LlmMessage[]): string {
  return String([...messages].reverse().find((message) => String(message.content).startsWith('PARALLEL RESULTS:'))?.content ?? '');
}

describe('parallel verification', () => {
  it('exposes evidence ids and completes verified plan steps before the first completion attempt', async () => {
    const events: string[] = [];
    let results = '';
    let completionAttempts = 0;
    const commands = ['node first.js', 'node second.js'];
    const llm = new ScriptedMockLlm([
      () => action({ type: 'set_criteria', criteria: commands.map((command) => ({ text: `${command} passes`, verification: command, evidenceType: 'command_success' })) }),
      () => action({ type: 'set_plan', steps: commands.map((command) => ({ description: `verify ${command}`, verification: command })) }),
      () => action({ type: 'parallel', calls: commands.map(commandCall) }),
      (_n, messages) => {
        results = parallelResult(messages);
        const evidenceId = [...results.matchAll(/EVIDENCE RECORDED: (ev-\d{8}-[0-9a-f]{6})/g)][0]?.[1] ?? 'ev-missing';
        return action({ type: 'claim_criterion', criterionId: 'ac-1', evidenceId });
      },
      () => {
        const evidenceId = [...results.matchAll(/EVIDENCE RECORDED: (ev-\d{8}-[0-9a-f]{6})/g)][1]?.[1] ?? 'ev-missing';
        return action({ type: 'claim_criterion', criterionId: 'ac-2', evidenceId });
      },
      () => {
        completionAttempts += 1;
        return action({ type: 'complete', summary: 'Both scripts passed.', risks: [], followUps: [] });
      },
      () => 'VERDICT: PASS',
      stop,
    ]);
    const hermes = new Hermes({ cwd: makeProject(), llm, mode: 'fast', onEvent: (event) => events.push(event) });

    const { ledger, report } = await hermes.run('verify two local scripts');

    expect(results).toContain('EVIDENCE RECORDED:');
    expect([...results.matchAll(/EVIDENCE RECORDED: (ev-\d{8}-[0-9a-f]{6}) \[PASS\]/g)]).toHaveLength(2);
    expect(ledger.data.acceptanceCriteria.every((criterion) => criterion.satisfied)).toBe(true);
    expect(ledger.data.plan.map((step) => step.status)).toEqual(['done', 'done']);
    expect(events.some((event) => event.includes('completion rejected'))).toBe(false);
    expect(completionAttempts).toBe(1);
    expect(report.status).toBe('complete');
  }, 30000);

  it('keeps failed, nonmatching, and unverified steps open', async () => {
    let results = '';
    const llm = new ScriptedMockLlm([
      () => action({ type: 'set_criteria', criteria: ['Script checks are inspected'] }),
      () => action({ type: 'set_plan', steps: [
        { description: 'first script', verification: 'node first.js' },
        { description: 'failing script', verification: 'node failed.js' },
        { description: 'unrun script', verification: 'node second.js' },
        { description: 'manual follow-up' },
      ] }),
      () => action({ type: 'parallel', calls: [
        commandCall('node first.js'),
        commandCall('node failed.js'),
        { tool: 'read_file', params: { path: 'second.js' }, reason: 'inspect the other script', expected: 'file contents' },
      ] }),
      (_n, messages) => {
        results = parallelResult(messages);
        return stop();
      },
    ]);

    const { ledger } = await new Hermes({ cwd: makeProject(), llm, mode: 'fast' }).run('verify local scripts');

    expect(ledger.data.plan.map((step) => step.status)).toEqual(['done', 'pending', 'pending', 'pending']);
    expect(ledger.data.evidence.map((evidence) => evidence.passed)).toEqual([true, false]);
    expect(results).toMatch(/EVIDENCE RECORDED: ev-\d{8}-[0-9a-f]{6} \[FAIL\]/);
  }, 30000);

  it.each([true, false])('preserves sequential stepId scope (explicit=%s)', async (explicitStepId) => {
    const command = 'node first.js';
    const llm = new ScriptedMockLlm([
      () => action({ type: 'set_criteria', criteria: ['The script passes'] }),
      () => action({ type: 'set_plan', steps: [
        { description: 'first verification step', verification: command },
        { description: 'second verification step', verification: command },
      ] }),
      () => action({ type: 'tool_call', ...commandCall(command), ...(explicitStepId ? { stepId: 'step-1' } : {}) }),
      stop,
    ]);

    const { ledger } = await new Hermes({ cwd: makeProject(), llm, mode: 'fast' }).run('verify the local script');

    expect(ledger.data.plan.map((step) => step.status)).toEqual(explicitStepId ? ['done', 'pending'] : ['done', 'done']);
  }, 30000);
});
