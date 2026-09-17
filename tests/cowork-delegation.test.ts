import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import type { CodingPlanReviewDecision, CodingRunResult, CodingSession, CodingSessionView } from '../src/coding/contract.js';
import type { CodingEvent, CodingEventPayload } from '../src/coding/events.js';
import {
  CoworkDelegation,
  delegationProgressFor,
  delegationResultSummary,
  parseDelegationParams,
  type DelegationScope,
  type DelegationSessionInput,
} from '../src/cowork/delegation.js';
import { CoworkStore } from '../src/cowork/store.js';
import { coworkToolDocs, executeCoworkTool, type CoworkToolScope, type CoworkToolPerms } from '../src/cowork/tools.js';
import type { ToolContext } from '../src/tools/tools.js';
import type { CompletionReport } from '../src/types.js';

const root = mkdtempSync(path.join(tmpdir(), 'cowork-delegation-'));
afterAll(() => rmSync(root, { recursive: true, force: true }));
afterEach(() => vi.useRealTimers());

const at = new Date(0).toISOString();

function report(overrides: Partial<CompletionReport> = {}): CompletionReport {
  return {
    taskId: 'task-1',
    goal: 'fix the build',
    status: 'complete',
    summary: 'Fixed the failing import.',
    changes: [],
    filesChanged: ['src/a.ts', 'src/b.ts'],
    verification: ['npm test — 12 passed'],
    evidence: [],
    remainingRisks: [],
    followUps: [],
    generatedAt: at,
    ...overrides,
  };
}

/**
 * A stand-in for the runtime session. It records what the adapter asked the
 * runtime to do — that is the assertion surface: the adapter must never settle a
 * gate itself, only forward the answer to the runtime method that owns it.
 */
function fakeSession(id: string) {
  const listeners = new Set<(event: CodingEvent) => void>();
  let seq = 0;
  let settle: (result: CodingRunResult) => void = () => undefined;
  const approvals: { id: string; approved: boolean }[] = [];
  const plans: { id: string; decision: CodingPlanReviewDecision }[] = [];
  const answers: { id: string; answer: string }[] = [];
  const cancels: string[] = [];
  const session: CodingSession & { emit: (payload: CodingEventPayload) => void; finish: (result: CodingRunResult) => void } = {
    id,
    getState: (): CodingSessionView => ({ id, goal: 'g', status: 'running', startedAt: at, workspace: { type: 'host', path: '/tmp/ws' } }),
    run: () =>
      new Promise<CodingRunResult>((resolve) => {
        settle = resolve;
      }),
    continue: async () => ({ sessionId: id, status: 'running' }),
    cancel: async (reason?: string) => {
      cancels.push(reason ?? '');
      settle({ sessionId: id, status: 'failed' });
    },
    releasePendingGates: () => undefined,
    approve: (approvalId, approved) => {
      approvals.push({ id: approvalId, approved });
    },
    approvePlan: (requestId, decision) => {
      plans.push({ id: requestId, decision });
    },
    answerQuestions: (requestId, answer) => {
      answers.push({ id: requestId, answer });
    },
    events: () => [],
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    emit: (payload) => {
      seq += 1;
      const event = { seq, at, ...payload } as CodingEvent;
      for (const listener of listeners) listener(event);
    },
    finish: (result) => settle(result),
  };
  return { session, finish: session.finish, approvals, plans, answers, cancels };
}

function setup(name: string) {
  const store = new CoworkStore(path.join(root, `${name}.json`));
  const agent = store.saveAgent({ name: 'Scout', systemPrompt: 'help' });
  const conversation = store.saveConversation({ kind: 'dm', memberIds: [agent.id] });
  const scope = { agent: { id: agent.id, name: agent.name }, store, conversationId: conversation.id } as unknown as CoworkToolScope;
  const fake = fakeSession('run_1');
  const inputs: DelegationSessionInput[] = [];
  const progress: string[] = [];
  const closed: string[] = [];
  const settled: string[] = [];
  const delegation = new CoworkDelegation({
    workspaceFor: () => ({ type: 'host', path: '/tmp/ws' }),
    createSession: (input) => {
      inputs.push(input);
      return fake.session;
    },
    openRequest: ({ scope: cardScope, title, detail, options }) =>
      cardScope.store.addRequest({ conversationId: cardScope.conversationId!, agentId: cardScope.agent.id, kind: 'question', title, detail, options }),
    closeRequest: (requestId) => {
      closed.push(requestId);
    },
    sessionSettled: (sessionId) => {
      settled.push(sessionId);
    },
    progress: ({ text }) => {
      progress.push(text);
    },
  });
  return { store, agent, conversation, scope, delegation, fake, inputs, progress, closed, settled };
}

/** Start a delegated run without awaiting it, so a gate can be raised mid-flight. */
function start(setupResult: ReturnType<typeof setup>, params: Record<string, unknown> = { goal: 'fix the build' }) {
  return setupResult.delegation.run(setupResult.scope, params);
}

describe('gitu_task parameters', () => {
  it('requires a goal and rejects a mode or cap it cannot honour', () => {
    expect(parseDelegationParams({})).toEqual({ ok: false, error: expect.stringContaining('goal') });
    expect(parseDelegationParams({ goal: '   ' }).ok).toBe(false);
    expect(parseDelegationParams({ goal: 'x', mode: 'chat' })).toEqual({ ok: false, error: expect.stringContaining('mode') });
    expect(parseDelegationParams({ goal: 'x', effort: 'turbo' }).ok).toBe(false);
    expect(parseDelegationParams({ goal: 'x', timeoutMinutes: 0 }).ok).toBe(false);
    expect(parseDelegationParams({ goal: 'x', timeoutMinutes: -5 }).ok).toBe(false);
    expect(parseDelegationParams({ goal: 'x', timeoutMinutes: 'soon' }).ok).toBe(false);
  });

  it('defaults to a real agent run with a 30-minute cap and clamps beyond 3 hours', () => {
    expect(parseDelegationParams({ goal: ' fix the build ' })).toEqual({
      ok: true,
      value: { goal: 'fix the build', mode: 'agent', effort: undefined, timeoutMinutes: 30 },
    });
    const clamped = parseDelegationParams({ goal: 'x', mode: 'fast', effort: 'low', timeoutMinutes: 999 });
    expect(clamped.ok && clamped.value).toEqual({ goal: 'x', mode: 'fast', effort: 'low', timeoutMinutes: 180 });
  });
});

describe('delegation progress projection', () => {
  it('surfaces the events a person watching their repo would want, and drops narration', () => {
    const emit = (payload: CodingEventPayload): string | undefined => delegationProgressFor({ seq: 1, at, ...payload } as CodingEvent);
    expect(emit({ type: 'run_started', goal: 'fix the build' })).toBe('Engineering task started: fix the build');
    expect(emit({ type: 'plan_created', steps: 3 })).toBe('Plan ready — 3 steps');
    expect(emit({ type: 'plan_created', steps: 1 })).toBe('Plan ready — 1 step');
    expect(emit({ type: 'file_changed', path: 'src/a.ts' })).toBe('Edited src/a.ts');
    expect(emit({ type: 'command_started', command: 'npm test' })).toBe('Running npm test');
    expect(emit({ type: 'command_finished', command: 'npm test', ok: true, exitCode: 0 })).toBeUndefined();
    expect(emit({ type: 'command_finished', command: 'npm test', ok: false, exitCode: 2 })).toBe('Command failed (exit 2): npm test');
    expect(emit({ type: 'policy_denied', reason: 'risk_policy', detail: 'rm -rf' })).toBe('Blocked by policy (risk_policy): rm -rf');
    expect(emit({ type: 'recovering', message: 'model reply was malformed', attempt: 2, maxAttempts: 3 })).toBe('Recovering (2/3): model reply was malformed');
    expect(emit({ type: 'evidence_recorded', evidenceId: 'ev-1', passed: true })).toBeUndefined();
    expect(emit({ type: 'evidence_recorded', evidenceId: 'ev-1', passed: false })).toBe('Verification failed: ev-1');
    expect(emit({ type: 'log', text: 'some prose' })).toBeUndefined();
    expect(emit({ type: 'completed', summary: 'done' })).toBe('Finished: done');
  });
});

describe('delegated gates', () => {
  it('renders an approval as a card and resolves it through the runtime, not the adapter', async () => {
    const s = setup('approval');
    const running = start(s);
    const input = s.inputs[0]!;
    input.onApprovalRequired({ id: 'appr-1', tool: 'run_command', why: 'Runs a shell command', summary: 'rm -rf build', requestedAt: at });

    const cards = s.store.requests(s.conversation.id).filter((request) => request.status === 'open');
    expect(cards).toHaveLength(1);
    expect(cards[0]!.title).toBe('Approve run_command for @Scout?');
    expect(cards[0]!.detail).toBe('Runs a shell command\n\nrm -rf build');
    expect(cards[0]!.options).toEqual(['Approve', 'Deny']);

    const resolved = s.delegation.resolve(cards[0]!.id, 'answer', 'Approve');
    expect(resolved).toEqual({ ok: true, resolution: { status: 'approved', answer: 'Approved' } });
    expect(s.fake.approvals).toEqual([{ id: 'appr-1', approved: true }]);
    // The gate is consumed: a second answer must not re-settle the same request.
    expect(s.delegation.resolve(cards[0]!.id, 'answer', 'Approve')).toBeUndefined();
    expect(s.fake.approvals).toHaveLength(1);

    s.fake.finish({ sessionId: 'run_1', status: 'completed', report: report() });
    await expect(running).resolves.toMatchObject({ ok: true });
  });

  it('denies an approval from either an explicit action or a Deny answer', async () => {
    const s = setup('denial');
    const running = start(s);
    const input = s.inputs[0]!;
    input.onApprovalRequired({ id: 'appr-a', tool: 'write_file', why: 'writes', requestedAt: at });
    input.onApprovalRequired({ id: 'appr-b', tool: 'write_file', why: 'writes', requestedAt: at });

    const [first, second] = s.store.requests(s.conversation.id);
    expect(s.delegation.resolve(first!.id, 'deny', '')).toEqual({ ok: true, resolution: { status: 'denied', answer: 'Denied' } });
    expect(s.delegation.resolve(second!.id, 'answer', 'Deny')).toMatchObject({ ok: true, resolution: { status: 'denied' } });
    expect(s.fake.approvals).toEqual([
      { id: 'appr-a', approved: false },
      { id: 'appr-b', approved: false },
    ]);

    s.fake.finish({ sessionId: 'run_1', status: 'completed', report: report({ status: 'blocked' }) });
    await running;
  });

  it('maps a plan review card onto approvePlan, turning a typed note into changes-requested', async () => {
    const s = setup('plan');
    const running = start(s);
    const input = s.inputs[0]!;
    input.onPlanReviewRequested({
      id: 'pr-1',
      criteria: ['tests pass'],
      steps: [{ description: 'Patch the import', verification: 'npm test' }],
      requestedAt: at,
    });
    const card = s.store.requests(s.conversation.id)[0]!;
    expect(card.title).toBe("Review @Scout's plan before implementation");
    expect(card.detail).toBe('Criteria: tests pass\nPlan:\n1. Patch the import — verify: npm test');
    expect(card.options).toEqual(['Approve', 'Request changes', 'Reject']);

    expect(s.delegation.resolve(card.id, 'answer', 'Request changes')).toEqual({ ok: true, resolution: { status: 'denied', answer: 'Request changes' } });
    expect(s.fake.plans).toEqual([{ id: 'pr-1', decision: { approved: false, note: 'Request changes' } }]);

    s.fake.finish({ sessionId: 'run_1', status: 'completed', report: report({ status: 'blocked' }) });
    await running;
  });

  it('sends a plain refusal back as a rejection and free-text feedback as changes requested', async () => {
    const s = setup('plan-modes');
    const running = start(s);
    const input = s.inputs[0]!;
    input.onPlanReviewRequested({ id: 'pr-a', criteria: [], steps: [], requestedAt: at });
    input.onPlanReviewRequested({ id: 'pr-b', criteria: [], steps: [], requestedAt: at });
    input.onPlanReviewRequested({ id: 'pr-c', criteria: [], steps: [], requestedAt: at });
    const [first, second, third] = s.store.requests(s.conversation.id);

    expect(s.delegation.resolve(first!.id, 'answer', 'Reject')).toMatchObject({ ok: true, resolution: { status: 'denied', answer: 'Reject' } });
    expect(s.delegation.resolve(second!.id, 'answer', 'please add a test for the retry path')).toMatchObject({ ok: true, resolution: { status: 'denied' } });
    expect(s.delegation.resolve(third!.id, 'approve', '')).toMatchObject({ ok: true, resolution: { status: 'approved' } });
    expect(s.fake.plans).toEqual([
      // A bare refusal must not arrive as a note: a note means "replan", which is
      // not what the user asked for when they pressed Reject.
      { id: 'pr-a', decision: { approved: false } },
      { id: 'pr-b', decision: { approved: false, note: 'please add a test for the retry path' } },
      { id: 'pr-c', decision: { approved: true } },
    ]);

    s.fake.finish({ sessionId: 'run_1', status: 'completed', report: report({ status: 'blocked' }) });
    await running;
  });

  it('forwards a question answer verbatim, and refuses an empty one', async () => {
    const s = setup('questions');
    const running = start(s);
    const input = s.inputs[0]!;
    input.onQuestionsRequested({
      id: 'q-1',
      questions: [
        { question: 'Which database?', header: 'Storage', options: ['postgres', 'sqlite'] },
        { question: 'Do we migrate existing rows?', options: [] },
      ],
      requestedAt: at,
    });
    const card = s.store.requests(s.conversation.id)[0]!;
    expect(card.title).toBe('Which database?');
    expect(card.detail).toBe('Storage: Which database?\nOptions: postgres | sqlite\n\nDo we migrate existing rows?');

    expect(s.delegation.resolve(card.id, 'answer', '')).toEqual({ ok: false, error: 'an answer is required' });
    expect(s.fake.answers).toHaveLength(0);
    expect(s.delegation.resolve(card.id, 'answer', 'postgres')).toEqual({ ok: true, resolution: { status: 'answered', answer: 'postgres' } });
    expect(s.fake.answers).toEqual([{ id: 'q-1', answer: 'postgres' }]);

    s.fake.finish({ sessionId: 'run_1', status: 'completed', report: report() });
    await running;
  });

  it('returns undefined for a card the delegation does not own', () => {
    const s = setup('foreign');
    expect(s.delegation.resolve('req-someone-else', 'answer', 'yes')).toBeUndefined();
  });
});

describe('delegated run lifecycle', () => {
  it('streams typed events into the conversation and collapses only consecutive repeats', async () => {
    const s = setup('progress');
    const running = start(s);
    s.fake.session.emit({ type: 'run_started', goal: 'fix the build' });
    s.fake.session.emit({ type: 'run_started', goal: 'fix the build' });
    // Prose the delegation does not surface must not break the run of repeats.
    s.fake.session.emit({ type: 'log', text: 'noise' });
    s.fake.session.emit({ type: 'run_started', goal: 'fix the build' });
    s.fake.session.emit({ type: 'command_started', command: 'npm test' });
    s.fake.session.emit({ type: 'command_finished', command: 'npm test', ok: false, exitCode: 1 });
    s.fake.session.emit({ type: 'file_changed', path: 'src/a.ts' });
    expect(s.progress).toEqual([
      'Engineering task started: fix the build',
      'Running npm test',
      'Command failed (exit 1): npm test',
      'Edited src/a.ts',
    ]);

    s.fake.finish({ sessionId: 'run_1', status: 'completed', report: report() });
    await running;
    expect(s.settled).toEqual(['run_1']);
    expect(s.delegation.activeSessions).toBe(0);
  });

  it('hands the completion report back as the teammate tool result', async () => {
    const s = setup('result');
    const running = start(s);
    s.fake.finish({ sessionId: 'run_1', status: 'completed', report: report({ summary: 'Fixed it.', filesChanged: ['src/a.ts'] }) });
    const result = await running;
    expect(result.ok).toBe(true);
    expect(result.output).toContain('Engineering task completed (session run_1, task task-1).');
    expect(result.output).toContain('Summary: Fixed it.');
    expect(result.output).toContain('Files changed (1): src/a.ts');
    expect(result.output).toContain('Verification: npm test — 12 passed');
    expect(result.output).toContain('Verify the work with your own tools');
  });

  it('reports a failed run as a failed tool result without inventing a report', async () => {
    const s = setup('failure');
    const running = start(s);
    s.fake.finish({ sessionId: 'run_1', status: 'failed', error: 'provider offline' });
    const result = await running;
    expect(result.ok).toBe(false);
    expect(result.output).toBe('Engineering task failed (failed): provider offline');
    expect(delegationResultSummary({ sessionId: 'run_1', status: 'failed' })).toBe('Engineering task failed (failed).');
  });

  it('cancels the session when the conversation aborts, and closes cards nobody answered', async () => {
    const s = setup('abort');
    const controller = new AbortController();
    const scope = { ...s.scope, signal: controller.signal } as CoworkToolScope;
    const running = s.delegation.run(scope, { goal: 'fix the build' });
    const input = s.inputs[0]!;
    input.onApprovalRequired({ id: 'appr-1', tool: 'run_command', why: 'shell', requestedAt: at });
    const card = s.store.requests(s.conversation.id)[0]!;

    controller.abort();
    await running;
    expect(s.fake.cancels).toEqual(['the conversation stopped']);
    expect(s.closed).toEqual([card.id]);
  });

  it('refuses to start when the conversation was already stopped', async () => {
    const s = setup('pre-aborted');
    const controller = new AbortController();
    controller.abort();
    const scope = { ...s.scope, signal: controller.signal } as CoworkToolScope;
    const result = await s.delegation.run(scope, { goal: 'fix the build' });
    expect(result.ok).toBe(false);
    expect(result.output).toBe('gitu_task cancelled: the conversation was stopped before the task started.');
    expect(s.inputs).toHaveLength(0);
    expect(s.fake.cancels).toEqual([]);
  });

  it('stops the run at its time cap instead of letting it hang', async () => {
    vi.useFakeTimers();
    const s = setup('timeout');
    const running = start(s, { goal: 'fix the build', timeoutMinutes: 5 });
    await vi.advanceTimersByTimeAsync(5 * 60_000);
    await running;
    expect(s.fake.cancels).toEqual(['time limit reached (5 minutes)']);
  });

  it('turns a workspace the runtime cannot execute in into a plain tool failure', async () => {
    const s = setup('no-workspace');
    const refusing = new CoworkDelegation({
      workspaceFor: () => ({ type: 'container', containerId: 'c1', path: '/workspace' }),
      createSession: () => {
        throw new Error('The runtime cannot execute in a container workspace yet');
      },
      openRequest: () => ({ id: 'never' }),
      progress: () => undefined,
    });
    const result = await refusing.run(s.scope as unknown as DelegationScope, { goal: 'x' });
    expect(result.ok).toBe(false);
    expect(result.output).toContain('gitu_task could not start: The runtime cannot execute in a container workspace yet');
  });
});

describe('gitu_task tool dispatch', () => {
  it('hands the call to the delegation service when one is wired', async () => {
    const calls: Record<string, unknown>[] = [];
    const scope = {
      agent: { id: 'a', name: 'Scout' },
      conversationId: 'c1',
      delegation: {
        run: async (_scope: unknown, params: Record<string, unknown>) => {
          calls.push(params);
          return { ok: true, output: 'delegated' };
        },
      },
    } as unknown as CoworkToolScope;
    const perms: CoworkToolPerms = { allowShell: false, allowWrites: true, allowConfig: false, chief: false, browser: false };
    const result = await executeCoworkTool({} as ToolContext, 'gitu_task', { goal: 'fix the build' }, perms, scope);
    expect(result).toEqual({ ok: true, output: 'delegated' });
    expect(calls).toEqual([{ goal: 'fix the build' }]);
  });

  it('is offered only to teammates that can already write', () => {
    const agent = { allowShell: true, allowWrites: true, allowConfig: false, chiefOfStaff: false };
    expect(coworkToolDocs(agent, false)).toContain('gitu_task');
    // A teammate that cannot edit files itself must not be able to spawn an
    // engineer that edits them on its behalf.
    expect(coworkToolDocs({ ...agent, allowWrites: false }, false)).not.toContain('gitu_task');
  });

  it('refuses when the teammate cannot write or no coding runtime is wired', async () => {
    const perms: CoworkToolPerms = { allowShell: false, allowWrites: true, allowConfig: false, chief: false, browser: false };
    const bare = { agent: { id: 'a', name: 'Scout' }, conversationId: 'c1' } as unknown as CoworkToolScope;
    expect((await executeCoworkTool({} as ToolContext, 'gitu_task', { goal: 'x' }, perms, bare)).output).toBe(
      'Engineering delegation is unavailable in this session.',
    );
    const readOnly: CoworkToolPerms = { ...perms, allowWrites: false };
    const wired = { ...bare, delegation: { run: async () => ({ ok: true, output: 'x' }) } } as unknown as CoworkToolScope;
    expect((await executeCoworkTool({} as ToolContext, 'gitu_task', { goal: 'x' }, readOnly, wired)).output).toBe(
      'gitu_task is disabled for this agent. The user can enable it in the agent profile.',
    );
  });
});
