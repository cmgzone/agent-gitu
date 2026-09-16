import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { Gitu } from '../src/agent/gitu.js';
import type { CodingRunResult, CodingSession } from '../src/coding/contract.js';
import { GituSessionRuntime, type GituCodingSession, type GituSessionRequest } from '../src/coding/session-runtime.js';
import type { GituFactoryOptions } from '../src/coding/gitu-factory.js';
import { ConnectionRegistry } from '../src/connections/connections.js';
import { ScriptedMockLlm } from '../src/llm/llm.js';
import type { CompletionReport } from '../src/types.js';

/**
 * Runtime tests.
 *
 * The runtime is the seam Cowork will depend on, so these assert the three
 * things it owns: the event stream it aggregates, the approval gate it answers,
 * and the lifecycle state it reports. The engine is injected so each behaviour
 * is isolated; the last suite drives the real engine end to end.
 */

function makeProject(): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'hermes-runtime-'));
  writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: 'runtime-test' }));
  mkdirSync(path.join(dir, 'src'), { recursive: true });
  writeFileSync(path.join(dir, 'src', 'a.ts'), 'export const a = 1;\n');
  return dir;
}

interface Harness {
  session: CodingSession;
  gates: GituCodingSession['gates'];
  sinks: { onEvent: (line: string) => void; onCodingEvent: (event: any) => void; approvalHandler: any; planReviewHandler: any; askUserHandler: any };
  engineRequests: { request: GituSessionRequest; options: GituFactoryOptions }[];
  engine: any;
}

function completeReport(goal: string): CompletionReport {
  return { taskId: 't_1', goal, status: 'complete', summary: 'done', changes: [], filesChanged: [], verification: [] };
}

function makeHarness(options: { report?: CompletionReport; failRun?: Error; gateTimeoutMs?: number; engines?: 'fresh'; startRun?: boolean } = {}): Harness {
  const dir = makeProject();
  const engineRequests: Harness['engineRequests'] = [];
  const makeEngine = () => ({
    run: async (goal: string) => {
      if (options.failRun) throw options.failRun;
      return { ledger: { data: { taskId: 't_1' } }, report: options.report ?? completeReport(goal) };
    },
    queueMessage: () => {},
    stop: () => {},
  });
  const engine = makeEngine();
  let capturedSinks: Harness['sinks'] | undefined;
  const runtime = new GituSessionRuntime({
    createEngine: (request, runOptions, sinks) => {
      engineRequests.push({ request, options: runOptions });
      capturedSinks = sinks;
      return (options.engines === 'fresh' ? makeEngine() : engine) as unknown as Gitu;
    },
  });
  const session = runtime.createSession({
    goal: 'Fix the parser',
    workspace: { type: 'host', path: dir },
    // A deliberately wrong root: the runtime must override it from the workspace.
    runOptions: () => ({ workspaceRoot: 'C:\\wrong-on-purpose', llm: new ScriptedMockLlm([() => '{}']), mode: 'fast' }),
    deps: {
      connections: new ConnectionRegistry(),
      connectionContext: () => 'connections: none',
      connectionActionHandler: async () => ({ message: 'ok' }),
      safestProviderRead: () => undefined,
      connectionOperationHandler: async () => ({ message: 'ok' }),
      connectionRecoveryCheck: () => ({ action: 'setup-new', reason: 'none' }),
      connectionRequestHandler: async () => false,
    },
    gateTimeoutMs: options.gateTimeoutMs,
  });
  // Gates only exist during a run, and the sinks are captured when the engine is
  // built — which now happens per run. So gate/stream tests opt into starting
  // one, and it must happen before the harness literal reads the sink reference.
  if (options.startRun) void session.run('Fix the parser');
  return { session, gates: session.gates, sinks: capturedSinks!, engineRequests, engine };
}

describe('GituSessionRuntime lifecycle', () => {
  it('reports the engine result as session state', async () => {
    const { session } = makeHarness();
    const result: CodingRunResult = await session.run('Fix the parser');
    expect(result.status).toBe('completed');
    const view = session.getState();
    expect(view.status).toBe('completed');
    expect(view.goal).toBe('Fix the parser');
    expect(view.taskId).toBe('t_1');
    expect(view.report?.summary).toBe('done');
    expect(view.finishedAt).toBeTruthy();
  });

  it('marks an engine failure as failed instead of throwing past the contract', async () => {
    const { session } = makeHarness({ failRun: new Error('provider unreachable') });
    const result = await session.run('Fix the parser');
    expect(result.status).toBe('failed');
    expect(result.error).toBe('provider unreachable');
    expect(session.getState().status).toBe('failed');
  });

  it('derives the engine cwd from the workspace, never from what the caller guessed', () => {
    const { engineRequests } = makeHarness();
    expect(engineRequests[0]?.options.workspaceRoot).toBe(engineRequests[0]?.request.workspace.path);
  });

  it('emits run_started when a run starts, not when the session is created', async () => {
    const harness = makeHarness();
    // Creating a session is not starting work: it may sit idle, be resumed, or
    // be reused. The run lifecycle begins at run().
    expect(harness.session.events().filter((event) => event.type === 'run_started')).toHaveLength(0);
    await harness.session.run('Fix the parser');
    const started = harness.session.events().filter((event) => event.type === 'run_started');
    expect(started).toHaveLength(1);
    expect(started[0]).toMatchObject({ goal: 'Fix the parser' });
    // It precedes the engine's own output, so a consumer sees the boundary first.
    expect(started[0]?.seq).toBe(1);
  });

  it('builds a fresh engine per run and numbers the attempts', async () => {
    // The engine is per run while the session persists — that is what lets a
    // continuation carry its own resume context and usage client.
    const harness = makeHarness({ engines: 'fresh' });
    await harness.session.run('Fix the parser');
    await harness.session.run('Fix the parser again');
    expect(harness.engineRequests).toHaveLength(2);
    expect(harness.engineRequests.map((entry) => entry.options.mode)).toEqual(['fast', 'fast']);
    // Rebuilding must not resurrect an old cwd: both runs derive it from the workspace.
    expect(harness.engineRequests.every((entry) => entry.options.workspaceRoot === entry.request.workspace.path)).toBe(true);
  });

  it('steers a live run but resumes a settled one', async () => {
    const harness = makeHarness();
    let queued = '';
    harness.engine.queueMessage = (text: string) => {
      queued = text;
    };
    let runs = 0;
    harness.engine.run = async (goal: string) => {
      runs += 1;
      return { ledger: { data: { taskId: 't_1' } }, report: completeReport(goal) };
    };
    const inFlight = harness.session.run('Fix the parser');
    await harness.session.continue('focus on the parser file');
    await inFlight;
    expect(queued).toBe('focus on the parser file');
    await harness.session.continue('now also add a test');
    expect(runs).toBe(2);
  });

  it('stops the engine on cancel', async () => {
    const harness = makeHarness({ startRun: true });
    let stopped = false;
    harness.engine.stop = () => {
      stopped = true;
    };
    await harness.session.cancel('user asked');
    expect(stopped).toBe(true);
  });

  it('releases every pending gate without cancelling the run', async () => {
    // A reply that supersedes a pending request clears the request but leaves
    // the work alone. That is a different thing from cancel, which stops the
    // engine too — so it is a different method rather than a flag on that one.
    const harness = makeHarness({ startRun: true });
    let stopped = false;
    harness.engine.stop = () => {
      stopped = true;
    };
    const approval = harness.sinks.approvalHandler({ tool: 'run_command', tier: 'dangerous', why: 'destructive', summary: 'rm -rf build' });
    const plan = harness.sinks.planReviewHandler({ criteria: ['works'], steps: [] });
    const questions = harness.sinks.askUserHandler([{ question: 'Which database?', options: [] }]);

    harness.session.releasePendingGates('superseded by the user reply');

    await expect(approval).resolves.toBe(false);
    await expect(plan).resolves.toMatchObject({ approved: false });
    // Questions keep their documented behaviour: unanswered means defaults.
    await expect(questions).resolves.toBe('(no answer — proceed with reasonable defaults)');

    expect(stopped).toBe(false);
    const view = harness.session.getState();
    expect(view.pendingApproval).toBeUndefined();
    expect(view.pendingPlanReview).toBeUndefined();
    expect(view.pendingQuestions).toBeUndefined();
    // Only cancel reports a stop, and this path must never imply one.
    expect(harness.session.events().filter((event) => event.type === 'log' && event.text.includes('stop requested'))).toHaveLength(0);

    // The run was left to finish under its own power rather than torn down.
    expect(view.status).toBe('completed');

    // And the session is still usable: releasing gates is not teardown.
    const next = harness.sinks.approvalHandler({ tool: 'run_command', tier: 'dangerous', why: 'destructive', summary: 'rm -rf dist' });
    const required = harness.session.getState().pendingApproval;
    expect(required).toBeTruthy();
    harness.session.approve(required!.id, true);
    await expect(next).resolves.toBe(true);
  });

  it('refuses a workspace it has no transport for', () => {
    const runtime = new GituSessionRuntime();
    expect(() =>
      runtime.createSession({
        goal: 'Fix it',
        workspace: { type: 'container', containerId: 'abc', path: '/workspace' },
        deps: {} as never,
        runOptions: () => ({ workspaceRoot: '/workspace', llm: new ScriptedMockLlm([() => '{}']), mode: 'fast' }),
      }),
    ).toThrow(/container workspace yet/);
  });
});

describe('GituSessionRuntime event stream', () => {
  it('publishes native payloads as reported and classifies legacy lines', () => {
    const harness = makeHarness({ startRun: true });
    harness.sinks.onCodingEvent({ type: 'policy_denied', reason: 'project_guard', tool: 'write_file' });
    harness.sinks.onEvent('lines    src/cli.ts +12 lines');
    // The run boundary precedes them; this test is about classification.
    const events = harness.session.events().filter((event) => event.type !== 'run_started');
    expect(events.map((event) => event.type)).toEqual(['policy_denied', 'file_changed']);
  });

  it('hands the engine its own sinks, not the caller-supplied ones', () => {
    const dir = makeProject();
    const callerOnEvent = () => {};
    const callerOnCodingEvent = () => {};
    const seen: { sinks: Harness['sinks'] }[] = [];
    const runtime = new GituSessionRuntime({
      createEngine: (request, runOptions, sinks) => {
        seen.push({ sinks });
        return { run: async () => ({ ledger: { data: {} }, report: completeReport(request.goal) }) } as unknown as Gitu;
      },
    });
    runtime.createSession({
      goal: 'Fix it',
      workspace: { type: 'host', path: dir },
      runOptions: () => ({ workspaceRoot: dir, llm: new ScriptedMockLlm([() => '{}']), mode: 'fast' }),
      deps: {
        connections: new ConnectionRegistry(),
        connectionContext: () => '',
        connectionActionHandler: async () => ({ message: '' }),
        safestProviderRead: () => undefined,
        connectionOperationHandler: async () => ({ message: '' }),
        connectionRecoveryCheck: () => ({ action: 'setup-new', reason: '' }),
        connectionRequestHandler: async () => false,
        onEvent: callerOnEvent,
        onCodingEvent: callerOnCodingEvent,
      } as never,
    });
    expect(seen[0]?.sinks.onEvent).not.toBe(callerOnEvent);
    expect(seen[0]?.sinks.onCodingEvent).not.toBe(callerOnCodingEvent);
  });
});

describe('GituSessionRuntime approval gate', () => {
  it('surfaces a pending approval and lets the first answer win', async () => {
    const harness = makeHarness({ startRun: true });
    const pending = harness.sinks.approvalHandler({ tool: 'run_command', tier: 'dangerous', why: 'destructive', summary: 'rm -rf build' });
    const required = harness.session.events().find((event) => event.type === 'approval_required') as
      | { approvalId: string; tool?: string; why?: string; summary?: string }
      | undefined;
    expect(required?.approvalId).toBeTruthy();
    // The gate's own request rides the event, so a card renders it from the one
    // stream instead of reading a host-side mirror of the pending state.
    expect(required).toMatchObject({ tool: 'run_command', why: 'destructive', summary: 'rm -rf build' });
    // The event and the pending record are one request with one timestamp, so a
    // card shows true request age instead of a publication stamp.
    expect(required?.requestedAt).toBe(harness.session.getState().pendingApproval?.requestedAt);
    harness.session.approve(required!.approvalId, true);
    await expect(pending).resolves.toBe(true);
    // A second answer finds no pending approval and does nothing.
    harness.session.approve(required!.approvalId, false);
    const resolved = harness.session.events().filter((event) => event.type === 'approval_resolved');
    expect(resolved).toHaveLength(1);
    expect(resolved[0]).toMatchObject({ approvalId: required!.approvalId, approved: true });
  });

  it('times a pending approval out to a denial', async () => {
    const harness = makeHarness({ gateTimeoutMs: 20, startRun: true });
    const pending = harness.sinks.approvalHandler({ tool: 'run_command', tier: 'dangerous', why: 'destructive', summary: 'rm -rf build' });
    await expect(pending).resolves.toBe(false);
    const resolved = harness.session.events().filter((event) => event.type === 'approval_resolved');
    expect(resolved[0]).toMatchObject({ approved: false, reason: 'timed out' });
  });
});

describe('GituSessionRuntime plan review and question gates', () => {
  it('surfaces a plan review and resolves it as approved', async () => {
    const harness = makeHarness({ startRun: true });
    const pending = harness.sinks.planReviewHandler({ criteria: ['tests pass'], steps: [{ description: 'implement', verification: 'npm test' }] });
    const requested = harness.session.events().find((event) => event.type === 'plan_review_requested') as
      | { requestId: string; plan: string; criteria?: string[]; steps?: { description: string; verification: string }[] }
      | undefined;
    expect(requested?.plan).toContain('tests pass');
    // The structured request rides the event too, so the review card edits the
    // agent's own criteria and steps instead of re-parsing the rendered plan.
    expect(requested?.criteria).toEqual(['tests pass']);
    expect(requested?.steps).toEqual([{ description: 'implement', verification: 'npm test' }]);
    expect(requested?.requestedAt).toBe(harness.session.getState().pendingPlanReview?.requestedAt);
    expect(harness.session.getState().pendingPlanReview?.id).toBe(requested?.requestId);
    harness.session.approvePlan(requested!.requestId, { approved: true });
    await expect(pending).resolves.toMatchObject({ approved: true });
    const resolved = harness.session.events().filter((event) => event.type === 'plan_review_resolved');
    expect(resolved).toHaveLength(1);
    expect(resolved[0]).toMatchObject({ requestId: requested?.requestId, decision: 'approved' });
    expect(harness.session.getState().pendingPlanReview).toBeUndefined();
  });

  it('distinguishes a change request from a bare rejection', async () => {
    const harness = makeHarness({ startRun: true });
    const pending = harness.sinks.planReviewHandler({ criteria: ['works'], steps: [] });
    const requestId = harness.session.getState().pendingPlanReview!.id;
    harness.session.approvePlan(requestId, { approved: false, note: 'split the first step' });
    await expect(pending).resolves.toMatchObject({ approved: false, note: 'split the first step' });
    expect(harness.session.events().find((event) => event.type === 'plan_review_resolved')).toMatchObject({ decision: 'changes_requested' });
  });

  it('surfaces questions and answers them', async () => {
    const harness = makeHarness({ startRun: true });
    const pending = harness.sinks.askUserHandler([{ question: 'Which database?', options: ['PostgreSQL', 'SQLite'] }]);
    const requested = harness.session.events().find((event) => event.type === 'questions_requested') as
      | { requestId: string; questions: string[]; details?: { question: string; options: string[] }[] }
      | undefined;
    expect(requested?.questions).toEqual(['Which database?']);
    // Options ride the event: a question card cannot offer an answer it was
    // never told, and the text projection alone has no options.
    expect(requested?.details).toEqual([{ question: 'Which database?', options: ['PostgreSQL', 'SQLite'] }]);
    expect(requested?.requestedAt).toBe(harness.session.getState().pendingQuestions?.requestedAt);
    expect(harness.session.getState().pendingQuestions?.id).toBe(requested?.requestId);
    harness.session.answerQuestions(requested!.requestId, 'PostgreSQL');
    await expect(pending).resolves.toBe('PostgreSQL');
    expect(harness.session.events().filter((event) => event.type === 'questions_answered')).toHaveLength(1);
    expect(harness.session.getState().pendingQuestions).toBeUndefined();
  });

  it('fails a plan review closed when nobody answers', async () => {
    const harness = makeHarness({ gateTimeoutMs: 20, startRun: true });
    const pending = harness.sinks.planReviewHandler({ criteria: ['works'], steps: [] });
    await expect(pending).resolves.toMatchObject({ approved: false, note: 'Plan review timed out.' });
    expect(harness.session.events().find((event) => event.type === 'plan_review_resolved')).toMatchObject({
      decision: 'rejected',
      reason: 'timed out',
    });
  });

  it('fails a question gate closed when nobody answers', async () => {
    const harness = makeHarness({ gateTimeoutMs: 20, startRun: true });
    const pending = harness.sinks.askUserHandler([{ question: 'Which database?', options: ['PostgreSQL'] }]);
    await expect(pending).resolves.toBe('(no answer — proceed with reasonable defaults)');
    // Questions proceed on defaults rather than denying the way an approval or a
    // plan review does, and the reason is on the event so a host can narrate the
    // timeout without inventing its own timer to detect it.
    expect(harness.session.events().find((event) => event.type === 'questions_answered')).toMatchObject({
      reason: 'timed out',
    });
    expect(harness.session.getState().pendingQuestions).toBeUndefined();
  });

  it('settles only the request a surface names', async () => {
    // An answer that names a request the runtime is not holding resolves nothing.
    // Without this, a surface answering late could resolve whatever its successor
    // happens to be — a different review, or a question asked minutes later.
    const harness = makeHarness({ startRun: true });
    const review = harness.sinks.planReviewHandler({ criteria: ['works'], steps: [] });
    const questions = harness.sinks.askUserHandler([{ question: 'Which database?', options: ['PostgreSQL'] }]);
    const reviewId = harness.session.getState().pendingPlanReview!.id;
    const questionsId = harness.session.getState().pendingQuestions!.id;

    harness.session.approvePlan('pr_stale', { approved: true });
    harness.session.answerQuestions('q_stale', 'SQLite');
    expect(harness.session.getState().pendingPlanReview?.id).toBe(reviewId);
    expect(harness.session.getState().pendingQuestions?.id).toBe(questionsId);
    expect(harness.session.events().filter((event) => event.type === 'plan_review_resolved')).toHaveLength(0);
    expect(harness.session.events().filter((event) => event.type === 'questions_answered')).toHaveLength(0);

    harness.session.approvePlan(reviewId, { approved: true });
    harness.session.answerQuestions(questionsId, 'PostgreSQL');
    await expect(review).resolves.toMatchObject({ approved: true });
    await expect(questions).resolves.toBe('PostgreSQL');
  });

  it('releases every pending gate on cancel instead of leaving it to time out', async () => {
    // A stopped run must not leave a surface staring at a gate that will never
    // be answered: detach/reconnect paths depend on this being immediate.
    const harness = makeHarness({ startRun: true });
    const approval = harness.sinks.approvalHandler({ tool: 'run_command', tier: 'dangerous', why: 'destructive', summary: 'rm -rf build' });
    const plan = harness.sinks.planReviewHandler({ criteria: ['works'], steps: [] });
    const questions = harness.sinks.askUserHandler([{ question: 'Which database?', options: [] }]);

    await harness.session.cancel('run deleted');

    await expect(approval).resolves.toBe(false);
    await expect(plan).resolves.toMatchObject({ approved: false });
    // Questions are the documented exception: they proceed on defaults rather
    // than denying, because an unanswered question does not stop the action.
    await expect(questions).resolves.toBe('(no answer — proceed with reasonable defaults)');

    const view = harness.session.getState();
    expect(view.pendingApproval).toBeUndefined();
    expect(view.pendingPlanReview).toBeUndefined();
    expect(view.pendingQuestions).toBeUndefined();
    const kinds = harness.session.events().map((event) => event.type);
    expect(kinds).toContain('approval_resolved');
    expect(kinds).toContain('plan_review_resolved');
    expect(kinds).toContain('questions_answered');
  });
});

describe('GituCodingSession.gates — the transitional seam', () => {
  it('exposes the same gate the runtime resolves, not a copy', async () => {
    // Step 4: a host that still builds its own engine wires these handlers in so
    // the gate DECISION path is runtime-owned. The property that matters is that
    // resolution still lands in the runtime's registry — an exposed wrapper that
    // kept its own state would silently become a second authority.
    const harness = makeHarness();
    expect(typeof harness.gates.approvalHandler).toBe('function');
    expect(typeof harness.gates.planReviewHandler).toBe('function');
    expect(typeof harness.gates.askUserHandler).toBe('function');

    const decided = harness.gates.approvalHandler({ tool: 'run_command', tier: 'dangerous', why: 'destructive', summary: 'rm -rf build' });
    const required = harness.session.events().find((event) => event.type === 'approval_required') as { approvalId: string } | undefined;
    expect(required?.approvalId).toBeTruthy();
    harness.session.approve(required!.approvalId, true);
    await expect(decided).resolves.toBe(true);
  });

  it('is the identical handler the runtime hands to its own engine', () => {
    const harness = makeHarness({ startRun: true });
    expect(harness.sinks.approvalHandler).toBe(harness.gates.approvalHandler);
    expect(harness.sinks.planReviewHandler).toBe(harness.gates.planReviewHandler);
    expect(harness.sinks.askUserHandler).toBe(harness.gates.askUserHandler);
  });
});

describe('GituSessionRuntime end to end through the real engine', () => {
  it('aggregates one command lifecycle and demotes the legacy line to prose', async () => {
    const dir = makeProject();
    const callerLegacy: string[] = [];
    const llm = new ScriptedMockLlm([
      () => JSON.stringify({ thought: 'plan', action: { type: 'set_plan', steps: [{ description: 'verify node', verification: 'node --version' }] } }),
      () =>
        JSON.stringify({
          thought: 'verify',
          action: { type: 'tool_call', stepId: 'step-1', tool: 'run_command', params: { command: 'node --version' }, reason: 'verify runtime', expected: 'exit 0' },
        }),
      () => JSON.stringify({ thought: 'stop', action: { type: 'request_block', reason: 'test collected the events it needed' } }),
    ]);
    const runtime = new GituSessionRuntime();
    const session = runtime.createSession({
      goal: 'Check the Node runtime version',
      workspace: { type: 'host', path: dir },
      runOptions: () => ({ workspaceRoot: dir, llm, mode: 'fast', criteria: ['node --version runs'], autoApprove: true, requirePlanReview: false }),
      deps: {
        connections: new ConnectionRegistry(),
        connectionContext: () => '',
        connectionActionHandler: async () => ({ message: '' }),
        safestProviderRead: () => undefined,
        connectionOperationHandler: async () => ({ message: '' }),
        connectionRecoveryCheck: () => ({ action: 'setup-new', reason: '' }),
        connectionRequestHandler: async () => false,
        // The caller still believes it owns the legacy stream. Under the
        // runtime it is retired, not merely bypassed.
        onEvent: (line) => callerLegacy.push(line),
      } as never,
    });
    const result = await session.run('Check the Node runtime version');

    expect(result.status).toBe('blocked');
    expect(session.getState().status).toBe('blocked');
    // The run lifecycle boundary is the runtime's, published at run-time.
    const runStarted = session.events().filter((event) => event.type === 'run_started');
    expect(runStarted).toHaveLength(1);
    expect(runStarted[0]).toMatchObject({ goal: 'Check the Node runtime version' });
    const started = session.events().filter((event) => event.type === 'command_started');
    const finished = session.events().filter((event) => event.type === 'command_finished');
    // Exactly one lifecycle per command: the native event is authoritative and
    // the legacy `run $ ...` line was demoted to prose.
    expect(started).toHaveLength(1);
    expect(finished).toHaveLength(1);
    expect(started[0]).toMatchObject({ command: 'node --version' });
    expect(finished[0]).toMatchObject({ command: 'node --version', ok: true, exitCode: 0 });
    const demoted = session.events().filter((event) => event.type === 'log' && (event as { text: string }).text.includes('node --version'));
    expect(demoted.length).toBeGreaterThanOrEqual(1);
    expect(callerLegacy).toHaveLength(0);
  });
});
