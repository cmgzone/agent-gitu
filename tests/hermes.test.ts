import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { Hermes } from '../src/agent/hermes.js';
import { ScriptedMockLlm } from '../src/llm/llm.js';

function makeProject(name: string): string {
  const dir = mkdtempSync(path.join(tmpdir(), `hermes-e2e-${name}-`));
  writeFileSync(
    path.join(dir, 'package.json'),
    JSON.stringify({ name: `e2e-${name}`, scripts: { test: 'node --version' } }, null, 2),
  );
  mkdirSync(path.join(dir, 'src'), { recursive: true });
  return dir;
}

function lastUserText(messages: { role: string; content: string }[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i]!.role === 'user') return messages[i]!.content;
  }
  return '';
}

function findEvidenceId(messages: { role: string; content: string }[]): string {
  const text = lastUserText(messages);
  const match = text.match(/(ev-\d{8}-[0-9a-f]{6})/);
  return match?.[1] ?? 'ev-missing';
}

describe('Hermes end-to-end (mock LLM)', () => {
  it('completes a task only when the evidence gate opens', async () => {
    const dir = makeProject('happy');
    const llm = new ScriptedMockLlm([
      () => JSON.stringify({
        thought: 'define criteria',
        action: { type: 'set_criteria', criteria: ['hello.ts exists with greet()', 'verification command passes'] },
      }),
      () => JSON.stringify({
        thought: 'plan',
        action: { type: 'set_plan', steps: [{ description: 'create hello.ts', verification: 'node --version' }] },
      }),
      () => JSON.stringify({
        thought: 'write the file',
        action: {
          type: 'tool_call',
          stepId: 'step-1',
          tool: 'write_file',
          params: { path: 'src/hello.ts', content: 'export function greet(): string { return "hi"; }\n' },
          reason: 'criterion requires the file',
          expected: 'file created',
        },
      }),
      () => JSON.stringify({
        thought: 'verify',
        action: {
          type: 'tool_call',
          stepId: 'step-1',
          tool: 'run_command',
          params: { command: 'node --version' },
          reason: 'run verification',
          expected: 'exit 0',
        },
      }),
      (_n, messages) => JSON.stringify({
        thought: 'claim both criteria with the recorded evidence',
        action: { type: 'claim_criterion', criterionId: 'ac-1', evidenceId: findEvidenceId(messages) },
      }),
      (_n, messages) => JSON.stringify({
        thought: 'claim second',
        action: { type: 'claim_criterion', criterionId: 'ac-2', evidenceId: findEvidenceId(messages) },
      }),
      () => JSON.stringify({
        thought: 'done',
        action: { type: 'complete', summary: 'Created hello.ts and verified.', risks: ['none'], followUps: ['add unit test'] },
      }),
    ]);

    const hermes = new Hermes({ cwd: dir, llm, mode: 'fast', budgets: { maxActions: 20 } });
    const { ledger, report } = await hermes.run('Create a hello module');

    expect(report.status).toBe('complete');
    expect(ledger.data.status).toBe('completed');
    expect(ledger.data.filesChanged).toContain('src/hello.ts');
    expect(readFileSync(path.join(dir, 'src', 'hello.ts'), 'utf8')).toContain('greet');
    expect(ledger.data.evidence.length).toBeGreaterThanOrEqual(1);
    expect(report.verification.length).toBeGreaterThanOrEqual(1);
  }, 30000);

  it('rejects premature completion until criteria have evidence', async () => {
    const dir = makeProject('premature');
    const llm = new ScriptedMockLlm([
      () => JSON.stringify({ action: { type: 'set_criteria', criteria: ['something verified'] } }),
      () => JSON.stringify({ action: { type: 'set_plan', steps: [{ description: 'verify', verification: 'node --version' }] } }),
      () => JSON.stringify({ action: { type: 'complete', summary: 'done already' } }),
      () => JSON.stringify({
        action: {
          type: 'tool_call',
          stepId: 'step-1',
          tool: 'run_command',
          params: { command: 'node --version' },
          reason: 'now verify for real',
          expected: 'exit 0',
        },
      }),
      (_n, messages) => JSON.stringify({ action: { type: 'claim_criterion', criterionId: 'ac-1', evidenceId: findEvidenceId(messages) } }),
      () => JSON.stringify({ action: { type: 'complete', summary: 'done with evidence', risks: [], followUps: [] } }),
    ]);

    const hermes = new Hermes({ cwd: dir, llm, mode: 'fast' });
    const { ledger, report } = await hermes.run('Verify something');

    expect(report.status).toBe('complete');
    expect(ledger.data.acceptanceCriteria[0]!.satisfied).toBe(true);
  }, 30000);

  it('honors request_block and records failure memory', async () => {
    const dir = makeProject('blocked');
    const llm = new ScriptedMockLlm([
      () => JSON.stringify({ action: { type: 'set_criteria', criteria: ['impossible thing'] } }),
      () => JSON.stringify({ action: { type: 'set_plan', steps: [{ description: 'try', verification: 'n/a' }] } }),
      () => JSON.stringify({ action: { type: 'request_block', reason: 'requires credentials I do not have' } }),
    ]);

    const hermes = new Hermes({ cwd: dir, llm, mode: 'fast' });
    const { ledger, report } = await hermes.run('Do the impossible');

    expect(report.status).toBe('blocked');
    expect(ledger.data.status).toBe('blocked');
    expect(ledger.data.blockers.join(' ')).toContain('credentials');
    const memoryFile = path.join(dir, '.hermes', 'memory.json');
    const memory = JSON.parse(readFileSync(memoryFile, 'utf8')) as { type: string }[];
    expect(memory.some((m) => m.type === 'failure')).toBe(true);
  }, 30000);

  it('blocks repeated failing actions via loop prevention', async () => {
    const dir = makeProject('loopy');
    const failingCall = () => JSON.stringify({
      action: {
        type: 'tool_call',
        stepId: 'step-1',
        tool: 'run_command',
        params: { command: 'node -e "console.error(\'same failure\'); process.exit(1)"' },
        reason: 'try again',
        expected: 'success',
      },
    });
    const llm = new ScriptedMockLlm([
      () => JSON.stringify({ action: { type: 'set_criteria', criteria: ['command passes'] } }),
      () => JSON.stringify({ action: { type: 'set_plan', steps: [{ description: 'run it', verification: 'itself' }] } }),
      failingCall,
      failingCall,
      failingCall,
      failingCall,
      () => JSON.stringify({ action: { type: 'request_block', reason: 'giving up after loop block' } }),
    ]);

    const hermes = new Hermes({ cwd: dir, llm, mode: 'fast' });
    const { ledger, report } = await hermes.run('Run the flaky command');

    const blockedActions = ledger.data.actions.filter((a) => a.status === 'blocked');
    expect(blockedActions.length).toBeGreaterThanOrEqual(1);
    expect(blockedActions[0]!.observation).toContain('LOOP PREVENTION');
    expect(report.status).toBe('blocked');
  }, 60000);

  it('denies dangerous commands that are not approved', async () => {
    const dir = makeProject('danger');
    const llm = new ScriptedMockLlm([
      () => JSON.stringify({ action: { type: 'set_criteria', criteria: ['cleanup done'] } }),
      () => JSON.stringify({ action: { type: 'set_plan', steps: [{ description: 'cleanup', verification: 'files gone' }] } }),
      () => JSON.stringify({
        action: {
          type: 'tool_call',
          stepId: 'step-1',
          tool: 'run_command',
          params: { command: 'rm -rf /' },
          reason: 'clean everything',
          expected: 'clean',
        },
      }),
      () => JSON.stringify({ action: { type: 'request_block', reason: 'dangerous command denied' } }),
    ]);

    const hermes = new Hermes({ cwd: dir, llm, mode: 'fast' });
    const { ledger } = await hermes.run('Clean up');

    const denied = ledger.data.actions.filter((a) => a.status === 'denied');
    expect(denied.length).toBe(1);
    expect(denied[0]!.observation).toContain('DENIED');
  }, 30000);
});
