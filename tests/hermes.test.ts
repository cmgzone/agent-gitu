import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { compactHistory, Hermes } from '../src/agent/gitu.js';
import { SubAgentRunner } from '../src/agent/subagent.js';
import { TaskLedger } from '../src/ledger/task-ledger.js';
import { ScriptedMockLlm, type LlmMessage } from '../src/llm/llm.js';
import { SkillStore } from '../src/skills/skills.js';

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

  it('recovers the action from the reasoning trace when the visible reply is prose-only', async () => {
    const dir = makeProject('reasoning');
    const llm = {
      name: 'reasoning-mock',
      lastReasoning: undefined as string | undefined,
      call: 0,
      reply(messages: { role: string; content: string }[]): string {
        const n = this.call++;
        this.lastReasoning = undefined;
        if (n === 0) {
          this.lastReasoning = JSON.stringify({ action: { type: 'set_criteria', criteria: ['verification command passes'] } });
          return 'I will define the acceptance criteria now.';
        }
        if (n === 1) return JSON.stringify({ action: { type: 'set_plan', steps: [{ description: 'verify', verification: 'node --version' }] } });
        if (n === 2) return JSON.stringify({ action: { type: 'tool_call', stepId: 'step-1', tool: 'run_command', params: { command: 'node --version' }, reason: 'verify', expected: 'exit 0' } });
        if (n === 3) return JSON.stringify({ action: { type: 'claim_criterion', criterionId: 'ac-1', evidenceId: findEvidenceId(messages) } });
        return JSON.stringify({ action: { type: 'complete', summary: 'verified', risks: [], followUps: [] } });
      },
      async complete(messages: { role: string; content: string }[]): Promise<string> {
        return this.reply(messages);
      },
      async completeStream(
        messages: { role: string; content: string }[],
        _o: unknown,
        onDelta: (d: string) => void,
      ): Promise<string> {
        const r = this.reply(messages);
        onDelta(r);
        return r;
      },
    };

    const hermes = new Hermes({ cwd: dir, llm: llm as never, mode: 'fast' });
    const { ledger, report } = await hermes.run('Verify node works');

    expect(report.status).toBe('complete');
    expect(ledger.data.acceptanceCriteria[0]!.text).toBe('verification command passes');
    expect(ledger.data.blockers.some((b) => b.includes('unparseable'))).toBe(false);
  }, 30000);

  it('does not leak <json> fence tags into the streamed prose', async () => {
    const dir = makeProject('jsonfence');
    const events: string[] = [];
    const llm = new ScriptedMockLlm([
      () => JSON.stringify({ action: { type: 'set_criteria', criteria: ['verification command passes'] } }),
      () => JSON.stringify({ action: { type: 'set_plan', steps: [{ description: 'verify', verification: 'node --version' }] } }),
      () => 'I will verify now.\n<json>\n' + JSON.stringify({
        action: { type: 'tool_call', stepId: 'step-1', tool: 'run_command', params: { command: 'node --version' }, reason: 'verify', expected: 'exit 0' },
      }) + '\n</json>',
      (_n, messages) => JSON.stringify({ action: { type: 'claim_criterion', criterionId: 'ac-1', evidenceId: findEvidenceId(messages) } }),
      () => JSON.stringify({ action: { type: 'complete', summary: 'verified', risks: [], followUps: [] } }),
    ]);

    const hermes = new Hermes({ cwd: dir, llm, mode: 'fast', onEvent: (e) => events.push(e) });
    const { report } = await hermes.run('Verify node works');

    expect(report.status).toBe('complete');
    expect(events.some((e) => e.includes('<json>'))).toBe(false);
  }, 30000);

  it('compacts old history while keeping the system prompt and recent tail', () => {
    const messages: LlmMessage[] = [{ role: 'system', content: 'SYS' }];
    for (let i = 0; i < 40; i++) {
      messages.push({ role: i % 2 ? 'user' : 'assistant', content: `turn ${i} ${'x'.repeat(200)}` });
    }
    const events: string[] = [];
    expect(compactHistory(messages, (t) => events.push(t))).toBe(true);
    expect(messages[0]!.content).toBe('SYS');
    expect(String(messages[1]!.content).startsWith('COMPACTED HISTORY')).toBe(true);
    expect(messages.length).toBe(1 + 1 + 6);
    expect(String(messages.at(-1)!.content)).toContain('turn 39');
    expect(String(messages[1]!.content)).toContain('turn 1');
    expect(events).toHaveLength(1);
    expect(compactHistory(messages)).toBe(false);
  });

  it('accepts JSON actions that use the tool name as the action type', async () => {
    const dir = makeProject('tooltype');
    const llm = new ScriptedMockLlm([
      () => JSON.stringify({ action: { type: 'set_criteria', criteria: ['verification command passes'] } }),
      () => JSON.stringify({ action: { type: 'set_plan', steps: [{ description: 'verify', verification: 'node --version' }] } }),
      () => JSON.stringify({
        thought: 'dots-style json action',
        action: { type: 'run_command', params: { command: 'node --version' }, reason: 'verify', expected: 'exit 0' },
      }),
      (_n, messages) => JSON.stringify({ action: { type: 'claim_criterion', criterionId: 'ac-1', evidenceId: findEvidenceId(messages) } }),
      () => JSON.stringify({ action: { type: 'complete', summary: 'verified', risks: [], followUps: [] } }),
    ]);

    const hermes = new Hermes({ cwd: dir, llm, mode: 'fast' });
    const { ledger, report } = await hermes.run('Verify node works');

    expect(report.status).toBe('complete');
    expect(ledger.data.evidence.length).toBeGreaterThanOrEqual(1);
    expect(ledger.data.blockers.some((b) => b.includes('unparseable'))).toBe(false);
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

  it('shows a concise agent update when a model returns structured actions without prose', async () => {
    const dir = makeProject('structured-status');
    const events: string[] = [];
    const llm = new ScriptedMockLlm([
      () => JSON.stringify({ action: { type: 'set_criteria', criteria: ['verification command passes'] } }),
      () => JSON.stringify({ action: { type: 'request_block', reason: 'test complete' } }),
    ]);
    const hermes = new Hermes({ cwd: dir, llm, mode: 'fast', onEvent: (e) => events.push(e) });

    await hermes.run('structured status test');

    expect(events.some((e) => e.startsWith('say I’m defining a clear acceptance check'))).toBe(true);
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

  it('requires explicit user approval before accepting an unresolved strict-risk quality warning', async () => {
    const dir = makeProject('strict-review-approval');
    const events: string[] = [];
    let approvals = 0;
    const complete = () => JSON.stringify({ action: { type: 'complete', summary: 'authentication review complete', risks: [], followUps: [] } });
    const llm = new ScriptedMockLlm([
      () => JSON.stringify({ action: { type: 'set_criteria', criteria: ['verification command passes'] } }),
      () => JSON.stringify({ action: { type: 'set_plan', steps: [{ description: 'verify authentication change', verification: 'node --version' }] } }),
      () => JSON.stringify({ action: { type: 'tool_call', stepId: 'step-1', tool: 'run_command', params: { command: 'node --version' }, reason: 'verify', expected: 'exit 0' } }),
      (_n, messages) => JSON.stringify({ action: { type: 'claim_criterion', criterionId: 'ac-1', evidenceId: findEvidenceId(messages) } }),
      complete,
      () => 'VERDICT: REVISE\nFEEDBACK: Session invalidation is not covered by the final verification.',
      complete,
      () => 'VERDICT: REVISE\nFEEDBACK: Session invalidation is still not covered by the final verification.',
      complete,
    ]);
    const hermes = new Hermes({
      cwd: dir,
      llm,
      mode: 'fast',
      requirePlanReview: false,
      approvalHandler: async (request) => {
        approvals += 1;
        expect(request).toMatchObject({ tool: 'quality-review', tier: 'dangerous' });
        expect(request.summary).toContain('Session invalidation');
        return true;
      },
      onEvent: (event) => events.push(event),
    });

    const { report } = await hermes.run('Review authentication session handling');

    expect(approvals).toBe(1);
    expect(report.status).toBe('complete');
    expect(report.remainingRisks.some((risk) => risk.includes('User accepted unresolved strict-risk quality-review warning'))).toBe(true);
    expect(events.some((event) => event.includes('explicitly accepted by user'))).toBe(true);
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

  it('switches a chat ledger to build mode when resuming with a different mode', async () => {
    const dir = makeProject('chat-to-build');
    const chat = new Hermes({ cwd: dir, llm: new ScriptedMockLlm([() => 'Chat reply.']), mode: 'chat' });
    const { ledger } = await chat.run('just chat');
    expect(ledger.data.mode).toBe('chat');

    let sawFollowUp = false;
    let sawChatPrompt = false;
    const second = new ScriptedMockLlm([
      (_n, messages) => {
        const text = messages.map((m) => (typeof m.content === 'string' ? m.content : '')).join('\n');
        sawFollowUp = text.includes('FOLLOW-UP MESSAGE');
        sawChatPrompt = text.includes('chat mode — answer directly');
        return JSON.stringify({ action: { type: 'request_block', reason: 'paused' } });
      },
    ]);
    const resumed = new Hermes({
      cwd: dir,
      llm: second,
      mode: 'standard',
      resume: { taskId: ledger.data.taskId, message: 'now build it' },
    });
    await resumed.run('now build it');
    expect(sawFollowUp).toBe(true);
    expect(sawChatPrompt).toBe(false);
    const reloaded = TaskLedger.load(dir, ledger.data.taskId);
    expect(reloaded?.data.mode).toBe('standard');
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

  it('creates skills by itself when asked', async () => {
    const dir = makeProject('skillful');
    const llm = new ScriptedMockLlm([
      () => JSON.stringify({ action: { type: 'set_criteria', criteria: ['design skill saved'] } }),
      () => JSON.stringify({ action: { type: 'set_plan', steps: [{ description: 'create the skill', verification: 'list_skills shows it' }] } }),
      () => JSON.stringify({
        action: { type: 'tool_call', stepId: 'step-1', tool: 'create_skill', params: { name: 'design', description: 'design system skill', instructions: '1. check brand colors\n2. prefer svg icons' }, reason: 'user asked for a design skill', expected: 'saved' },
      }),
      () => JSON.stringify({ action: { type: 'tool_call', stepId: 'step-1', tool: 'list_skills', params: {}, reason: 'verify saved', expected: 'design listed' } }),
      () => JSON.stringify({ action: { type: 'request_block', reason: 'stop' } }),
    ]);
    const hermes = new Hermes({ cwd: dir, llm, mode: 'fast', skills: SkillStore.forProject(path.resolve(dir)) });
    const { ledger } = await hermes.run('add a design skill and use it');

    const create = ledger.data.actions.find((a) => a.tool === 'create_skill');
    expect(create?.status).toBe('success');
    const store = SkillStore.forProject(path.resolve(dir));
    expect(store.get('design')).toBeTruthy();
    expect(store.get('design')!.instructions).toContain('svg');
  }, 30000);

  it('auto-learns a reusable skill after completing a task', async () => {
    const dir = makeProject('learn');
    const llm = new ScriptedMockLlm([
      () => JSON.stringify({ action: { type: 'set_criteria', criteria: ['deploy script works'] } }),
      () => JSON.stringify({ action: { type: 'set_plan', steps: [{ description: 'write deploy.sh', verification: 'node --version' }] } }),
      () => JSON.stringify({
        action: { type: 'tool_call', stepId: 'step-1', tool: 'write_file', params: { path: 'deploy.sh', content: '#!/bin/sh\necho deploy\n' }, reason: 'deploy step', expected: 'file created' },
      }),
      () => JSON.stringify({
        action: { type: 'tool_call', stepId: 'step-1', tool: 'run_command', params: { command: 'node --version' }, reason: 'verify', expected: 'exit 0' },
      }),
      (_n, messages) => JSON.stringify({
        action: { type: 'claim_criterion', criterionId: 'ac-1', evidenceId: findEvidenceId(messages) },
      }),
      () => JSON.stringify({ action: { type: 'complete', summary: 'Deploy flow ready.', risks: [], followUps: [] } }),
      () => JSON.stringify({
        action: { type: 'tool_call', stepId: 'step-1', tool: 'create_skill', params: { name: 'deploy-flow', description: 'standard deploy steps for this project', instructions: '1. run tests\n2. npm run dist\n3. upload to github' }, reason: 'auto-learned from completed task', expected: 'skill saved' },
      }),
    ]);
    const hermes = new Hermes({ cwd: dir, llm, mode: 'fast', skills: SkillStore.forProject(path.resolve(dir)) });
    const { ledger } = await hermes.run('set up a deploy flow');

    expect(ledger.data.status).toBe('completed');
    const learned = ledger.data.actions.find((a) => a.tool === 'create_skill');
    expect(learned?.status).toBe('success');
    const store = SkillStore.forProject(path.resolve(dir));
    expect(store.get('deploy-flow')).toBeTruthy();
    expect(store.get('deploy-flow')!.instructions).toContain('dist');
  }, 30000);

  it('does not auto-learn or create skills when the user disables it', async () => {
    const dir = makeProject('nolearn');
    const events: string[] = [];
    const llm = new ScriptedMockLlm([
      () => JSON.stringify({ action: { type: 'set_criteria', criteria: ['done'] } }),
      () => JSON.stringify({ action: { type: 'set_plan', steps: [{ description: 'verify', verification: 'node --version' }] } }),
      () => JSON.stringify({
        action: { type: 'tool_call', stepId: 'step-1', tool: 'run_command', params: { command: 'node --version' }, reason: 'verify', expected: 'exit 0' },
      }),
      (_n, messages) => JSON.stringify({
        action: { type: 'claim_criterion', criterionId: 'ac-1', evidenceId: findEvidenceId(messages) },
      }),
      () => JSON.stringify({ action: { type: 'complete', summary: 'Done.', risks: [], followUps: [] } }),
    ]);
    const hermes = new Hermes({ cwd: dir, llm, mode: 'fast', autoLearn: false, onEvent: (e) => events.push(e) });
    const { ledger } = await hermes.run('do a quick task');

    expect(ledger.data.status).toBe('completed');
    expect(ledger.data.actions.some((a) => a.tool === 'create_skill')).toBe(false);
    expect(events.some((e) => e.startsWith('learn '))).toBe(false);
    // No USER skill may be created (built-ins ship with the app and always exist).
    expect(SkillStore.forProject(path.resolve(dir)).list().filter((s) => s.scope !== 'builtin')).toHaveLength(0);
  }, 30000);

  it('delegates parallel sub-tasks to named sub-agents', async () => {
    const dir = makeProject('delegate');
    let sawDelegate = false;
    let specialistBriefing = '';
    const workerLlm = new ScriptedMockLlm([
      (_n, messages: LlmMessage[]) => {
        specialistBriefing = messages
          .filter((message) => message.role === 'user')
          .map((message) => String(message.content))
          .join('\n');
        return JSON.stringify({ action: { type: 'answer', summary: 'worker done: implemented X' } });
      },
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
    expect(specialistBriefing).toContain('WORK HANDOFF — START HERE');
    expect(specialistBriefing).toContain('PARENT GOAL:\ndelegate test');
    expect(specialistBriefing).toContain('EXPLORATION LIMIT:');
    expect(specialistBriefing).toContain('package.json');
  }, 30000);

  it('starts independent specialist work in the background and exposes its status', async () => {
    const dir = makeProject('background-delegate');
    const workerLlm = new ScriptedMockLlm([
      () => JSON.stringify({ action: { type: 'answer', summary: 'background check complete' } }),
    ]);
    const runner = new SubAgentRunner({
      cwd: dir,
      resolveLlm: () => workerLlm,
      agentRole: () => 'background tester',
    });
    const llm = new ScriptedMockLlm([
      () => JSON.stringify({ action: { type: 'set_criteria', criteria: ['background work starts'] } }),
      () => JSON.stringify({ action: { type: 'set_plan', steps: [{ description: 'start worker', verification: 'agent status' }] } }),
      () =>
        JSON.stringify({
          action: { type: 'delegate', background: true, tasks: [{ agent: 'worker', task: 'check the independent concern' }] },
        }),
      () => JSON.stringify({ action: { type: 'request_block', reason: 'worker runs independently' } }),
    ]);
    const hermes = new Hermes({ cwd: dir, llm, mode: 'fast', subagents: runner });

    await hermes.run('start a background specialist');
    const jobs = runner.status();
    expect(jobs).toHaveLength(1);
    const results = await runner.waitFor(jobs.map((job) => job.id));
    expect(results).toMatchObject([{ agent: 'worker', ok: true, summary: 'background check complete' }]);
    expect(runner.status()[0]?.status).toBe('completed');
  }, 30000);

  it('parses dots-style XML function calls instead of leaking raw XML', async () => {
    const dir = makeProject('xml');
    const events: string[] = [];
    const criteriaXml = () =>
      'I will start by setting the acceptance criteria.\n' +
      '<dots_function_call>\n<invoke name="set_criteria">\n<parameter name="criteria">\n' +
      '["hi.ts exists with greet()", "node --version passes"]\n</parameter>\n</invoke>\n</dots_function_call>';
    const llm = new ScriptedMockLlm([
      criteriaXml,
      () =>
        '<dots_function_call>\n<invoke name="set_plan">\n<parameter name="steps">\n' +
        '[{"description":"create hi.ts","verification":"node --version"}]\n</parameter>\n</invoke>\n</dots_function_call>',
      () =>
        '<dots_function_call>\n<invoke name="write_file">\n<parameter name="path">src/hi.ts</parameter>\n' +
        '<parameter name="content">export function greet(){return "hi"}\n</parameter>\n</invoke>\n</dots_function_call>',
      () =>
        '<dots_function_call>\n<invoke name="run_command">\n<parameter name="command">node --version</parameter>\n</invoke>\n</dots_function_call>',
      (_n, messages) =>
        JSON.stringify({
          action: { type: 'claim_criterion', criterionId: 'ac-1', evidenceId: findEvidenceId(messages) },
        }),
      (_n, messages) =>
        JSON.stringify({
          action: { type: 'claim_criterion', criterionId: 'ac-2', evidenceId: findEvidenceId(messages) },
        }),
      () => '<dots_function_call>\n<invoke name="complete">\n<parameter name="summary">Created hi.ts and verified.</parameter>\n</invoke>\n</dots_function_call>',
    ]);
    const hermes = new Hermes({ cwd: dir, llm, mode: 'fast', onEvent: (e) => events.push(e) });
    const { ledger, report } = await hermes.run('Create a hi module (dots XML model)');

    expect(report.status).toBe('complete');
    expect(ledger.data.filesChanged).toContain('src/hi.ts');
    expect(ledger.data.acceptanceCriteria.length).toBe(2);
    // The raw XML must never reach the streamed thought bubbles as prose.
    expect(events.some((e) => e.startsWith('tdelta ') && e.includes('dots_function_call'))).toBe(false);
    expect(events.some((e) => e.startsWith('say ') && e.includes('dots_function_call'))).toBe(false);
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

  it('rejects completion when evidence does not match orchestrator-specified structured criteria', async () => {
    const dir = makeProject('lying-specialist');
    const llm = new ScriptedMockLlm([
      // LLM proposes a plan (criteria are pre-set by the orchestrator)
      () => JSON.stringify({ action: { type: 'set_plan', steps: [{ description: 'implement JWT', verification: 'npm test -- auth' }] } }),
      // Specialist runs the WRONG command
      () => JSON.stringify({
        action: {
          type: 'tool_call',
          stepId: 'step-1',
          tool: 'run_command',
          params: { command: 'node --version' },
          reason: 'verify JWT works',
          expected: 'exit 0',
        },
      }),
      // Specialist tries to claim the criterion with the wrong evidence
      (_n: number, messages: LlmMessage[]) => JSON.stringify({
        action: { type: 'claim_criterion', criterionId: 'ac-1', evidenceId: findEvidenceId(messages) },
      }),
      // Specialist tries to complete anyway
      () => JSON.stringify({ action: { type: 'complete', summary: 'JWT authentication implemented' } }),
      // After rejection, specialist gives up
      () => JSON.stringify({ action: { type: 'request_block', reason: 'cannot satisfy criterion with available evidence' } }),
    ]);

    const events: string[] = [];
    const hermes = new Hermes({
      cwd: dir,
      llm,
      mode: 'fast',
      // Orchestrator passes structured criteria with required verification
      criteria: [
        { text: 'JWT authentication works', verification: 'npm test -- auth', evidenceType: 'test_success' },
      ],
      onEvent: (e) => events.push(e),
    });
    const { ledger, report } = await hermes.run('Implement JWT authentication');

    // ❌ Evidence was rejected — criterion not satisfied
    expect(ledger.data.acceptanceCriteria[0]!.satisfied).toBe(false);
    // ❌ The criterion has the structured verification
    expect(ledger.data.acceptanceCriteria[0]!.verification).toBe('npm test -- auth');
    expect(ledger.data.acceptanceCriteria[0]!.evidenceType).toBe('test_success');
    // ❌ The claim was rejected (event logged)
    expect(events.some((e) => e.includes('claim') && e.includes('does not match'))).toBe(true);
    // ❌ Completion was rejected by the evidence gate
    expect(report.status).toBe('blocked');
  }, 30000);

  it('accepts completion when evidence matches orchestrator-specified structured criteria', async () => {
    const dir = makeProject('honest-specialist');
    const llm = new ScriptedMockLlm([
      // LLM proposes a plan (criteria are pre-set by the orchestrator)
      () => JSON.stringify({ action: { type: 'set_plan', steps: [{ description: 'verify build', verification: 'node --version' }] } }),
      // Specialist runs the CORRECT command
      () => JSON.stringify({
        action: {
          type: 'tool_call',
          stepId: 'step-1',
          tool: 'run_command',
          params: { command: 'node --version' },
          reason: 'verify node is available',
          expected: 'exit 0',
        },
      }),
      // Specialist claims the criterion with correct evidence
      (_n: number, messages: LlmMessage[]) => JSON.stringify({
        action: { type: 'claim_criterion', criterionId: 'ac-1', evidenceId: findEvidenceId(messages) },
      }),
      // Completion succeeds
      () => JSON.stringify({ action: { type: 'complete', summary: 'Node verified.', risks: [], followUps: [] } }),
    ]);

    const hermes = new Hermes({
      cwd: dir,
      llm,
      mode: 'fast',
      // Orchestrator passes structured criteria — verification matches the command
      criteria: [
        { text: 'Node is available', verification: 'node --version', evidenceType: 'command_success' },
      ],
    });
    const { ledger, report } = await hermes.run('Verify node is installed');

    // ✅ Evidence accepted — criterion satisfied
    expect(ledger.data.acceptanceCriteria[0]!.satisfied).toBe(true);
    expect(report.status).toBe('complete');
  }, 30000);

  it('halts a runaway task when the effort turn budget is exhausted', async () => {
    const dir = makeProject('turn-budget');
    const events: string[] = [];
    const llm = new ScriptedMockLlm([
      () => JSON.stringify({ action: { type: 'set_criteria', criteria: ['some verified result'] } }),
      () => JSON.stringify({ action: { type: 'set_plan', steps: [{ description: 'work', verification: 'node --version' }] } }),
      // Cycles forever from here: productive-looking work that never completes.
      () =>
        JSON.stringify({
          thought: 'keep going',
          action: {
            type: 'tool_call',
            stepId: 'step-1',
            tool: 'list_files',
            params: { path: '.' },
            reason: 'continue',
            expected: 'listing',
          },
        }),
    ]);

    const hermes = new Hermes({ cwd: dir, llm, mode: 'fast', effort: 'low', onEvent: (e) => events.push(e) });
    const { ledger, report } = await hermes.run('do some work');

    expect(ledger.data.effortPlan?.maxTurns).toBe(20); // low effort budget
    expect(report.status).toBe('failed');
    expect(ledger.data.blockers.some((b) => b.includes('effort budget'))).toBe(true);
    // The identical repeated list_files counts as progress exactly once
    // (first distinct success), buying one budget extension; the stall then
    // fires at the extended cap since nothing new ever succeeds.
    expect(events.some((e) => /effort budget of \d+ turns reached/.test(e))).toBe(true);
  }, 30000);

  it('extends the turn budget while the run keeps producing verified progress', async () => {
    const dir = makeProject('dynamic-budget');
    const events: string[] = [];
    const llm = new ScriptedMockLlm([
      () => JSON.stringify({ action: { type: 'set_criteria', criteria: ['files are written'] } }),
      () => JSON.stringify({ action: { type: 'set_plan', steps: [{ description: 'write files', verification: 'n/a' }] } }),
      // Real work: every turn writes a NEW file, so filesChanged keeps growing.
      // The base low-effort budget (20 turns) is crossed on a productive run —
      // the dynamic budget must extend instead of killing the run.
      (call) =>
        call < 24
          ? JSON.stringify({
              thought: 'working',
              action: { type: 'tool_call', stepId: 'step-1', tool: 'write_file', params: { path: `gen-${call}.txt`, content: 'x' }, reason: 'work', expected: 'file written' },
            })
          : JSON.stringify({ action: { type: 'request_block', reason: 'wrapped up' } }),
    ]);

    const hermes = new Hermes({ cwd: dir, llm, mode: 'fast', effort: 'low', onEvent: (e) => events.push(e) });
    const { report, ledger } = await hermes.run('generate files');

    // 24 written files cross the escalation threshold (>= 8), so the first
    // extension carries +10 escalation turns on top of the base 10.
    expect(events.some((e) => /budget extended by \d+ turns/.test(e))).toBe(true);
    expect(events.some((e) => e.includes('wide change surface'))).toBe(true);
    expect(report.status).toBe('blocked'); // ended by its own request_block, not a stall
    expect(ledger.data.blockers.some((b) => b.includes('effort budget'))).toBe(false);
  }, 30000);

  it('stops the main execution lane after three unparseable replies', async () => {
    const dir = makeProject('garbage-recovery');
    const events: string[] = [];
    const llm = new ScriptedMockLlm([
      () => 'I think I should look around first.',
      () => 'Let me check the directory listing next.',
      () => 'Probably src has the answer.',
      // A fourth reply must never be requested: the task state is preserved
      // and the user can continue it with another configured model.
      () => 'One more moment please.',
      () => JSON.stringify({ action: { type: 'set_criteria', criteria: ['Node is available'] } }),
      () => JSON.stringify({ action: { type: 'set_plan', steps: [{ description: 'verify node', verification: 'node --version' }] } }),
      () =>
        JSON.stringify({
          thought: 'working',
          action: { type: 'tool_call', stepId: 'step-1', tool: 'run_command', params: { command: 'node --version' }, reason: 'verify', expected: 'exit 0' },
        }),
      (_n, messages) => {
        const text = messages.map((m) => m.content).join('\n');
        const evId = (text.match(/(ev-\d{8}-[0-9a-f]{6})/) ?? [])[1] ?? 'ev-x';
        return JSON.stringify({ action: { type: 'claim_criterion', criterionId: 'ac-1', evidenceId: evId } });
      },
      () => JSON.stringify({ action: { type: 'complete', summary: 'recovered and completed', risks: [], followUps: [] } }),
    ]);

    const hermes = new Hermes({ cwd: dir, llm, mode: 'fast', effort: 'low', onEvent: (e) => events.push(e) });
    const { report, ledger } = await hermes.run('say something useful');

    expect(report.status).toBe('blocked');
    expect(ledger.data.blockers.some((b) => b.includes('Main execution lane stopped after 3'))).toBe(true);
    expect(events.some((e) => e.includes('main execution lane stopped after 3'))).toBe(true);
  }, 30000);

  it('clamps delegate calls to the task specialist budget', async () => {
    const dir = makeProject('spec-budget');
    const workerLlm = new ScriptedMockLlm([() => JSON.stringify({ action: { type: 'answer', summary: 'worker done' } })]);
    const runner = new SubAgentRunner({
      cwd: dir,
      resolveLlm: () => workerLlm,
      agentRole: () => 'cap worker',
    });
    const seen: string[] = [];
    const llm = new ScriptedMockLlm([
      () => JSON.stringify({ action: { type: 'set_criteria', criteria: ['delegation capped'] } }),
      () => JSON.stringify({ action: { type: 'set_plan', steps: [{ description: 'delegate once', verification: 'n/a' }] } }),
      () =>
        JSON.stringify({
          action: { type: 'delegate', tasks: [{ agent: 'worker', task: 'a' }, { agent: 'worker2', task: 'b' }] },
        }),
      (_n, messages) => {
        seen.push(messages.map((m) => (typeof m.content === 'string' ? m.content : '')).join('\n'));
        return JSON.stringify({ action: { type: 'delegate', tasks: [{ agent: 'worker3', task: 'c' }] } });
      },
      (_n, messages) => {
        seen.push(messages.map((m) => (typeof m.content === 'string' ? m.content : '')).join('\n'));
        return JSON.stringify({ action: { type: 'request_block', reason: 'stop' } });
      },
    ]);

    const hermes = new Hermes({ cwd: dir, llm, mode: 'fast', subagents: runner, effort: 'low' });
    await hermes.run('specialist budget test');

    // low effort -> maxSpecialists 1: the first 2-task delegate is clamped to 1,
    // and the second delegate is rejected outright.
    expect(runner.status()).toHaveLength(1);
    const joined = seen.join('\n');
    expect(joined).toContain('SPECIALIST BUDGET EXHAUSTED');
  }, 30000);

  it('records the risk plan and steers delegations toward the recommended specialists', async () => {
    const dir = makeProject('risk-plan');
    const events: string[] = [];
    const workerLlm = new ScriptedMockLlm([
      () => JSON.stringify({ action: { type: 'answer', summary: 'security review done' } }),
    ]);
    const runner = new SubAgentRunner({
      cwd: dir,
      resolveLlm: () => workerLlm,
      agentRole: () => 'security reviewer',
    });
    const llm = new ScriptedMockLlm([
      () => JSON.stringify({ action: { type: 'set_criteria', criteria: ['auth hardened'] } }),
      () => JSON.stringify({ action: { type: 'set_plan', steps: [{ description: 'delegate', verification: 'n/a' }] } }),
      () => JSON.stringify({ action: { type: 'delegate', tasks: [{ agent: 'security-auditor', task: 'review the session flow' }] } }),
      (_n, messages) => {
        events.push(messages.map((m) => (typeof m.content === 'string' ? m.content : '')).join('\n'));
        return JSON.stringify({ action: { type: 'request_block', reason: 'wrap up' } });
      },
    ]);
    const hermes = new Hermes({
      cwd: dir,
      llm,
      mode: 'fast',
      subagents: runner,
      specialists: [
        { name: 'security-auditor', role: 'Security review, auth' },
        { name: 'test-runner', role: 'Tests and verification' },
      ],
      effort: 'high',
      onEvent: (e) => events.push(e),
    });

    const { ledger } = await hermes.run('Fix the session refresh token bug');

    expect(ledger.data.riskPlan?.risk).toBe('security');
    expect(ledger.data.riskPlan?.requiredReview).toBe('security');
    const recommended = ledger.data.riskPlan?.recommendedSpecialists.map((r) => r.agent) ?? [];
    expect(recommended).toContain('security-auditor');
    expect(events.some((e) => e.includes('risk    security'))).toBe(true);
    expect(events.some((e) => e.includes('DELEGATION STEERING'))).toBe(false); // used the recommended agent
  }, 30000);

  it('warns when delegating to an agent outside the recommended risk roster', async () => {
    const dir = makeProject('risk-steer');
    const events: string[] = [];
    const workerLlm = new ScriptedMockLlm([
      () => JSON.stringify({ action: { type: 'answer', summary: 'generic work done' } }),
    ]);
    const runner = new SubAgentRunner({
      cwd: dir,
      resolveLlm: () => workerLlm,
      agentRole: () => 'generic worker',
    });
    const llm = new ScriptedMockLlm([
      () => JSON.stringify({ action: { type: 'set_criteria', criteria: ['work steered'] } }),
      () => JSON.stringify({ action: { type: 'set_plan', steps: [{ description: 'wrong specialist', verification: 'n/a' }] } }),
      () => JSON.stringify({ action: { type: 'delegate', tasks: [{ agent: 'generic-worker', task: 'do generic work' }] } }),
      () => JSON.stringify({ action: { type: 'request_block', reason: 'stop' } }),
    ]);
    const hermes = new Hermes({
      cwd: dir,
      llm,
      mode: 'fast',
      subagents: runner,
      specialists: [
        { name: 'security-auditor', role: 'Security review, auth' },
        { name: 'generic-worker', role: 'General coding' },
      ],
      effort: 'high',
      onEvent: (e) => events.push(e),
    });

    await hermes.run('Fix the session refresh token bug');

    // The recommendation named security-auditor (+ test mate), so delegating to
    // generic-worker gets a steering note - a prompt, not a hard failure.
    expect(events.some((e) => e.includes('delegate note:'))).toBe(true);
  }, 30000);
});
