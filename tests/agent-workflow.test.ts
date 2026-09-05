import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { agentVerificationGate } from '../src/agent/agent-workflow.js';
import { planEffort } from '../src/agent/effort-planner.js';
import { Gitu } from '../src/agent/gitu.js';
import { ScriptedMockLlm, type LlmMessage } from '../src/llm/llm.js';
import type { TaskLedgerData } from '../src/types.js';

type Reply = (call: number, messages: LlmMessage[]) => string;
const action = (a: Record<string, unknown>): Reply => () => JSON.stringify({ action: a });
const read = action({ type: 'tool_call', tool: 'read_file', params: { path: 'README.md' }, reason: 'Read the requested text', expected: 'Current wording' });
const edit = action({ type: 'tool_call', tool: 'write_file', params: { path: 'README.md', content: 'Hello world\n' }, reason: 'Correct the typo', expected: 'Corrected wording' });
const verify = action({ type: 'tool_call', tool: 'run_command', params: { command: 'node check.cjs' }, reason: 'Check the corrected text', expected: 'Text matches the requested wording' });
const done = action({ type: 'complete', summary: 'Corrected the wording and checked it.' });
const reviewer: Reply = () => 'VERDICT: PASS\nFEEDBACK: The requested text is correct.';
function project() {
  const dir = mkdtempSync(path.join(tmpdir(), 'gitu-agent-workflow-'));
  writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: 'agent-workflow', scripts: { test: 'node check.cjs' } }));
  writeFileSync(path.join(dir, 'README.md'), 'Helo world\n');
  writeFileSync(path.join(dir, 'check.cjs'), "require('node:assert/strict').equal(require('node:fs').readFileSync('README.md', 'utf8'), 'Hello world\\n');\n");
  return dir;
}

describe('unified Agent workflow', () => {
  it('keeps high model effort while giving a typo edit a lightweight task budget', () => {
    const effort = planEffort('Correct a typo in README.md', { mode: 'agent', explicitEffort: 'high' });
    expect(effort.complexity).toBe('low');
    expect(effort.llmEffort).toBe('high');
    expect(effort.verificationDepth).toBe('light');
  });

  it('answers directly and then edits in the same task without criteria or a formal plan', async () => {
    const dir = project();
    const first = await new Gitu({ cwd: dir, mode: 'agent', autoLearn: false,
      llm: new ScriptedMockLlm([action({ type: 'complete', chat: true, summary: 'I can help with questions or changes.' })]),
    }).run('Hello');
    expect(first.report.status).toBe('complete');
    const second = await new Gitu({ cwd: dir, mode: 'agent', autoLearn: false,
      resume: { taskId: first.ledger.data.taskId, message: 'Correct the typo in README.md' },
      llm: new ScriptedMockLlm([read, edit, verify, done, reviewer]),
    }).run('Correct the typo in README.md');
    expect(second.report.status).toBe('complete');
    expect(second.ledger.data.acceptanceCriteria).toEqual([]);
    expect(second.ledger.data.plan).toEqual([]);
    expect(readFileSync(path.join(dir, 'README.md'), 'utf8')).toBe('Hello world\n');
    expect(second.ledger.data.evidence.some(e => e.passed && e.command === 'node check.cjs')).toBe(true);
  }, 30000);

  it('answers repository questions after reading without demanding code changes or tests', async () => {
    const result = await new Gitu({ cwd: project(), mode: 'agent', autoLearn: false,
      llm: new ScriptedMockLlm([read, action({ type: 'complete', summary: 'The README currently says Helo world.' })]),
    }).run('What does README.md say?');
    expect(result.report.status).toBe('complete');
    expect(result.ledger.data.evidence).toEqual([]);
    expect(result.ledger.data.plan).toEqual([]);
  }, 30000);

  it('rejects an unverified edit even when the model calls it a chat reply', async () => {
    let rejected = false;
    const result = await new Gitu({ cwd: project(), mode: 'agent', autoLearn: false,
      llm: new ScriptedMockLlm([read, edit, action({ type: 'complete', chat: true, summary: 'Done' }), (_call, messages) => {
        rejected = messages.some(m => typeof m.content === 'string' && m.content.includes('COMPLETION REJECTED'));
        return verify(0, messages);
      }, done, reviewer]),
    }).run('Correct the typo in README.md');
    expect(rejected).toBe(true);
    expect(result.report.status).toBe('complete');
  }, 30000);

  it('holds writes until plan approval, then builds, and does not review the next request', async () => {
    const dir = project();
    let reviews = 0;
    const result = await new Gitu({ cwd: dir, mode: 'agent', autoLearn: false, requirePlanReview: true,
      planReviewHandler: () => {
        reviews++;
        expect(readFileSync(path.join(dir, 'README.md'), 'utf8')).toBe('Helo world\n');
        return { approved: true };
      },
      llm: new ScriptedMockLlm([edit, read,
        action({ type: 'set_plan', steps: [{ description: 'Correct README.md wording', verification: 'node check.cjs' }] }),
        edit, verify, done, done, reviewer]),
    }).run('Correct the typo in README.md');
    expect(reviews).toBe(1);
    expect(result.report.status).toBe('complete');
    const next = await new Gitu({ cwd: dir, mode: 'agent', autoLearn: false,
      resume: { taskId: result.ledger.data.taskId, message: 'What does README.md say now?' },
      planReviewHandler: () => { reviews++; return { approved: true }; },
      llm: new ScriptedMockLlm([read, action({ type: 'complete', summary: 'It says Hello world.' })]),
    }).run('What does README.md say now?');
    expect(next.report.status).toBe('complete');
    expect(reviews).toBe(1);
  }, 30000);

  it('rejects stale, failed, or trivial evidence and accepts a fresh focused check', () => {
    const data = { actions: [{ tool: 'write_file', status: 'success' }], evidence: [] } as unknown as TaskLedgerData;
    expect(agentVerificationGate(data, 'before', 'after').open).toBe(false);
    data.evidence = [{ command: 'node check.cjs', passed: true, workspaceFingerprint: 'before' }] as TaskLedgerData['evidence'];
    expect(agentVerificationGate(data, 'before', 'after').open).toBe(false);
    data.evidence[0]!.workspaceFingerprint = 'after';
    expect(agentVerificationGate(data, 'before', 'after').open).toBe(true);
    data.evidence[0]!.passed = false;
    expect(agentVerificationGate(data, 'before', 'after').open).toBe(false);
    data.evidence[0]!.passed = true;
    data.evidence[0]!.command = 'echo done';
    expect(agentVerificationGate(data, 'before', 'after').open).toBe(false);
  });
});
