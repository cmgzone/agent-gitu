import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { Hermes } from '../src/agent/hermes.js';
import { SubAgentRunner } from '../src/agent/subagent.js';
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

    const hermes = new Hermes({ cwd: dir, llm, mode: 'fast' });
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

  it('streams natural-language updates and records them', async () => {
    const dir = makeProject('stream');
    const events: string[] = [];
    const llm = new ScriptedMockLlm([
      () => `I will define the acceptance criteria first.\n${JSON.stringify({ action: { type: 'set_criteria', criteria: ['x works'] } })}`,
      () => `Nothing left to do here.\n${JSON.stringify({ action: { type: 'request_block', reason: 'stream test done' } })}`,
    ]);
    const hermes = new Hermes({ cwd: dir, llm, mode: 'fast', onEvent: (e) => events.push(e) });
    await hermes.run('stream test');

    expect(events.some((e) => e.startsWith('tdelta '))).toBe(true);
    expect(events.some((e) => e.startsWith('say I will define the acceptance criteria'))).toBe(true);
  }, 30000);

  it('pauses for plan review, applies edits, and only then builds', async () => {
    const dir = makeProject('review');
    let reviewed = 0;
    const llm = new ScriptedMockLlm([
      () => JSON.stringify({ action: { type: 'set_criteria', criteria: ['c1'] } }),
      () => JSON.stringify({ action: { type: 'set_plan', steps: [{ description: 'original step', verification: 'v' }] } }),
      () => JSON.stringify({ action: { type: 'set_plan', steps: [{ description: 'revised step', verification: 'v' }] } }),
      () => JSON.stringify({ action: { type: 'request_block', reason: 'stop after build starts' } }),
    ]);
    const hermes = new Hermes({
      cwd: dir,
      llm,
      mode: 'fast',
      requirePlanReview: true,
      planReviewHandler: async (input) => {
        reviewed += 1;
        if (reviewed === 1) {
          expect(input.steps[0]!.description).toBe('original step');
          return { approved: false, note: 'rename the step' };
        }
        expect(input.steps[0]!.description).toBe('revised step');
        return { approved: true, steps: [{ description: 'user-edited step', verification: 'v2' }] };
      },
    });
    const { ledger } = await hermes.run('review flow');

    expect(reviewed).toBe(2);
    expect(ledger.data.planApproved).toBe(true);
    expect(ledger.data.plan[0]!.description).toBe('user-edited step');
    expect(ledger.data.status).toBe('blocked');
  }, 30000);

  it('chat mode answers directly without tools', async () => {
    const dir = makeProject('chat');
    const events: string[] = [];
    const llm = new ScriptedMockLlm([() => 'Hermes can plan, build and verify your work.']);
    const hermes = new Hermes({ cwd: dir, llm, mode: 'chat', onEvent: (e) => events.push(e) });
    const { ledger, report } = await hermes.run('what can you do?');

    expect(ledger.data.status).toBe('completed');
    expect(report.summary).toContain('Hermes can plan');
    expect(events.some((e) => e.startsWith('tdelta '))).toBe(true);
  }, 30000);

  it('asks the user clarifying questions and uses the answers', async () => {
    const dir = makeProject('questions');
    let asked = false;
    const llm = new ScriptedMockLlm([
      () => JSON.stringify({ action: { type: 'ask_user', questions: [{ question: 'Which style?', header: 'Style', options: ['modern', 'classic'] }] } }),
      () => JSON.stringify({ action: { type: 'set_criteria', criteria: ['done'] } }),
      () => JSON.stringify({ action: { type: 'set_plan', steps: [{ description: 'x', verification: 'y' }] } }),
      () => JSON.stringify({ action: { type: 'request_block', reason: 'stop' } }),
    ]);
    const hermes = new Hermes({
      cwd: dir,
      llm,
      mode: 'fast',
      askUserHandler: async (questions) => {
        asked = true;
        expect(questions[0]!.options).toContain('modern');
        return 'Which style? → modern';
      },
    });
    await hermes.run('build something');
    expect(asked).toBe(true);
  }, 30000);

  it('executes parallel tool calls concurrently and records evidence', async () => {
    const dir = makeProject('parallel');
    const llm = new ScriptedMockLlm([
      () => JSON.stringify({ action: { type: 'set_criteria', criteria: ['c'] } }),
      () => JSON.stringify({ action: { type: 'set_plan', steps: [{ description: 's', verification: 'v' }] } }),
      () => JSON.stringify({
        action: {
          type: 'parallel',
          calls: [
            { tool: 'run_command', params: { command: 'node --version' }, reason: 'a', expected: 'ok' },
            { tool: 'run_command', params: { command: 'node -e "1"' }, reason: 'b', expected: 'ok' },
          ],
        },
      }),
      () => JSON.stringify({ action: { type: 'request_block', reason: 'stop' } }),
    ]);
    const events: string[] = [];
    const hermes = new Hermes({ cwd: dir, llm, mode: 'fast', onEvent: (e) => events.push(e) });
    const { ledger } = await hermes.run('parallel work');

    expect(events.some((e) => e.startsWith('parallel '))).toBe(true);
    expect(ledger.data.evidence.length).toBeGreaterThanOrEqual(2);
  }, 30000);

  it('emits live line counts when writing files', async () => {
    const dir = makeProject('lines');
    const content = 'line1\nline2\nline3\nline4\n';
    const llm = new ScriptedMockLlm([
      () => JSON.stringify({ action: { type: 'set_criteria', criteria: ['c'] } }),
      () => JSON.stringify({ action: { type: 'set_plan', steps: [{ description: 's', verification: 'v' }] } }),
      () => JSON.stringify({
        action: { type: 'tool_call', stepId: 'step-1', tool: 'write_file', params: { path: 'src/big.ts', content }, reason: 'create', expected: 'written' },
      }),
      () => JSON.stringify({ action: { type: 'request_block', reason: 'stop' } }),
    ]);
    const events: string[] = [];
    const hermes = new Hermes({ cwd: dir, llm, mode: 'fast', onEvent: (e) => events.push(e) });
    await hermes.run('write a big file');

    const linesEvent = events.find((e) => e.startsWith('lines '));
    expect(linesEvent).toBeTruthy();
    expect(linesEvent).toContain('+5');
  }, 30000);

  it('stop() aborts a running task and queued messages reach the agent', async () => {
    const dir = makeProject('stop');
    const events: string[] = [];
    const longProse = 'Working carefully on the current step and observing results. '.repeat(30);
    const llm = new ScriptedMockLlm([
      () => JSON.stringify({ action: { type: 'set_criteria', criteria: ['c'] } }),
      () => JSON.stringify({ action: { type: 'set_plan', steps: [{ description: 's', verification: 'v' }] } }),
      () => `${longProse}\n${JSON.stringify({ action: { type: 'set_hypothesis', text: 'h1' } })}`,
      () => `${longProse}\n${JSON.stringify({ action: { type: 'set_hypothesis', text: 'h2' } })}`,
      () => `${longProse}\n${JSON.stringify({ action: { type: 'set_hypothesis', text: 'h3' } })}`,
      () => JSON.stringify({ action: { type: 'request_block', reason: 'end' } }),
    ]);
    const hermes = new Hermes({ cwd: dir, llm, mode: 'fast', onEvent: (e) => events.push(e) });
    hermes.queueMessage('please focus on the header');
    const runPromise = hermes.run('stop test');
    setTimeout(() => hermes.stop(), 150);
    const { ledger } = await runPromise;

    expect(events.some((e) => e.startsWith('user-msg '))).toBe(true);
    expect(ledger.data.blockers.some((b) => b.includes('Stopped by user'))).toBe(true);
    expect(['blocked', 'failed']).toContain(ledger.data.status);
  }, 30000);

  it('answers follow-up comments conversationally without forcing task work', async () => {
    const dir = makeProject('chatty');
    const first = new Hermes({
      cwd: dir,
      llm: new ScriptedMockLlm([
        () => JSON.stringify({ action: { type: 'set_criteria', criteria: ['something verified'] } }),
        () => JSON.stringify({ action: { type: 'set_plan', steps: [{ description: 'verify', verification: 'node --version' }] } }),
        () => JSON.stringify({ action: { type: 'request_block', reason: 'stopped for the test' } }),
      ]),
      mode: 'fast',
    });
    const { ledger: led1 } = await first.run('original task');
    expect(led1.data.status).toBe('blocked');

    const second = new Hermes({
      cwd: dir,
      llm: new ScriptedMockLlm([
        () => JSON.stringify({ action: { type: 'complete', summary: 'Thanks! Glad you like it.', chat: true } }),
      ]),
      mode: 'fast',
      resume: { taskId: led1.data.taskId, message: 'this is good' },
    });
    const { ledger, report } = await second.run('original task');
    expect(report.status).toBe('complete');
    expect(ledger.data.status).toBe('completed');
    expect(report.summary).toContain('Glad you like it');
  }, 30000);

  it('delegates parallel sub-tasks to named sub-agents', async () => {
    const dir = makeProject('delegate');
    let sawDelegate = false;
    const workerLlm = new ScriptedMockLlm([
      () => JSON.stringify({ action: { type: 'answer', summary: 'worker done: implemented X' } }),
    ]);
    const runner = new SubAgentRunner({
      cwd: dir,
      resolveLlm: () => workerLlm,
      agentRole: (n) => 'test specialist ' + n,
    });
    const llm = new ScriptedMockLlm([
      () => JSON.stringify({ action: { type: 'set_criteria', criteria: ['delegation works'] } }),
      () => JSON.stringify({ action: { type: 'set_plan', steps: [{ description: 'delegate', verification: 'n/a' }] } }),
      () => JSON.stringify({ action: { type: 'delegate', tasks: [{ agent: 'worker', task: 'do X' }, { agent: 'worker2', task: 'do Y' }] } }),
      (_n, messages: LlmMessage[]) => {
        sawDelegate = messages.some((m) => typeof m.content === 'string' && m.content.includes('worker done'));
        return JSON.stringify({ action: { type: 'request_block', reason: 'stop' } });
      },
    ]);
    const hermes = new Hermes({ cwd: dir, llm, mode: 'fast', subagents: runner });
    await hermes.run('delegate test');
    expect(sawDelegate).toBe(true);
  }, 30000);

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
