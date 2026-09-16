import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { Gitu } from '../src/agent/gitu.js';
import type { CodingRunResult, CodingSession } from '../src/coding/contract.js';
import { GituSessionRuntime, type GituSessionRequest } from '../src/coding/session-runtime.js';
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
  sinks: { onEvent: (line: string) => void; onCodingEvent: (event: any) => void; approvalHandler: any };
  engineRequests: GituSessionRequest[];
  engine: any;
}

function completeReport(goal: string): CompletionReport {
  return { taskId: 't_1', goal, status: 'complete', summary: 'done', changes: [], filesChanged: [], verification: [] };
}

function makeHarness(options: { report?: CompletionReport; failRun?: Error; approvalTimeoutMs?: number } = {}): Harness {
  const dir = makeProject();
  const engineRequests: GituSessionRequest[] = [];
  const engine = {
    run: async (goal: string) => {
      if (options.failRun) throw options.failRun;
      return { ledger: { data: { taskId: 't_1' } }, report: options.report ?? completeReport(goal) };
    },
    queueMessage: () => {},
    stop: () => {},
  };
  let capturedSinks: Harness['sinks'] | undefined;
  const runtime = new GituSessionRuntime({
    createEngine: (request, sinks) => {
      engineRequests.push(request);
      capturedSinks = sinks;
      return engine as unknown as Gitu;
    },
  });
  const session = runtime.createSession({
    goal: 'Fix the parser',
    workspace: { type: 'host', path: dir },
    engine: {
      options: { workspaceRoot: 'C:\\wrong-on-purpose', llm: new ScriptedMockLlm([() => '{}']), mode: 'fast' },
      deps: {
        connections: new ConnectionRegistry(),
        connectionContext: () => 'connections: none',
        connectionActionHandler: async () => ({ message: 'ok' }),
        safestProviderRead: () => undefined,
        connectionOperationHandler: async () => ({ message: 'ok' }),
        connectionRecoveryCheck: () => ({ action: 'setup-new', reason: 'none' }),
        connectionRequestHandler: async () => false,
      },
    },
    approvalTimeoutMs: options.approvalTimeoutMs,
  });
  return { session, sinks: capturedSinks!, engineRequests, engine };
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
    expect(engineRequests[0]?.engine.options.workspaceRoot).toBe(engineRequests[0]?.workspace.path);
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
    const harness = makeHarness();
    let stopped = false;
    harness.engine.stop = () => {
      stopped = true;
    };
    await harness.session.cancel('user asked');
    expect(stopped).toBe(true);
  });

  it('refuses a workspace it has no transport for', () => {
    const runtime = new GituSessionRuntime();
    expect(() =>
      runtime.createSession({
        goal: 'Fix it',
        workspace: { type: 'container', containerId: 'abc', path: '/workspace' },
        engine: { options: { workspaceRoot: '/workspace', llm: new ScriptedMockLlm([() => '{}']), mode: 'fast' }, deps: {} as never },
      }),
    ).toThrow(/container workspace yet/);
  });
});

describe('GituSessionRuntime event stream', () => {
  it('publishes native payloads as reported and classifies legacy lines', () => {
    const harness = makeHarness();
    harness.sinks.onCodingEvent({ type: 'policy_denied', reason: 'project_guard', tool: 'write_file' });
    harness.sinks.onEvent('lines    src/cli.ts +12 lines');
    const events = harness.session.events();
    expect(events.map((event) => event.type)).toEqual(['policy_denied', 'file_changed']);
  });

  it('hands the engine its own sinks, not the caller-supplied ones', () => {
    const dir = makeProject();
    const callerOnEvent = () => {};
    const callerOnCodingEvent = () => {};
    const seen: { sinks: Harness['sinks'] }[] = [];
    const runtime = new GituSessionRuntime({
      createEngine: (request, sinks) => {
        seen.push({ sinks });
        return { run: async () => ({ ledger: { data: {} }, report: completeReport(request.goal) }) } as unknown as Gitu;
      },
    });
    runtime.createSession({
      goal: 'Fix it',
      workspace: { type: 'host', path: dir },
      engine: {
        options: { workspaceRoot: dir, llm: new ScriptedMockLlm([() => '{}']), mode: 'fast' },
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
      },
    });
    expect(seen[0]?.sinks.onEvent).not.toBe(callerOnEvent);
    expect(seen[0]?.sinks.onCodingEvent).not.toBe(callerOnCodingEvent);
  });
});

describe('GituSessionRuntime approval gate', () => {
  it('surfaces a pending approval and lets the first answer win', async () => {
    const harness = makeHarness();
    const pending = harness.sinks.approvalHandler({ tool: 'run_command', tier: 'dangerous', why: 'destructive', summary: 'rm -rf build' });
    const required = harness.session.events().find((event) => event.type === 'approval_required') as { approvalId: string } | undefined;
    expect(required?.approvalId).toBeTruthy();
    harness.session.approve(required!.approvalId, true);
    await expect(pending).resolves.toBe(true);
    // A second answer finds no pending approval and does nothing.
    harness.session.approve(required!.approvalId, false);
    const resolved = harness.session.events().filter((event) => event.type === 'approval_resolved');
    expect(resolved).toHaveLength(1);
    expect(resolved[0]).toMatchObject({ approvalId: required!.approvalId, approved: true });
  });

  it('times a pending approval out to a denial', async () => {
    const harness = makeHarness({ approvalTimeoutMs: 20 });
    const pending = harness.sinks.approvalHandler({ tool: 'run_command', tier: 'dangerous', why: 'destructive', summary: 'rm -rf build' });
    await expect(pending).resolves.toBe(false);
    const resolved = harness.session.events().filter((event) => event.type === 'approval_resolved');
    expect(resolved[0]).toMatchObject({ approved: false, reason: 'timed out' });
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
      engine: {
        options: { workspaceRoot: dir, llm, mode: 'fast', criteria: ['node --version runs'], autoApprove: true, requirePlanReview: false },
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
      },
    });
    const result = await session.run('Check the Node runtime version');

    expect(result.status).toBe('blocked');
    expect(session.getState().status).toBe('blocked');
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
