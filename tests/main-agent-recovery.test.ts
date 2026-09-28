import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GituServer, type RunSessionView } from '../src/server/server.js';
import { SessionStore } from '../src/server/session-store.js';
import { LlmError, type LlmClient, type LlmMessage } from '../src/llm/llm.js';
import * as resilience from '../src/llm/resilient.js';
import * as providers from '../src/llm/providers.js';
import * as effortPlanner from '../src/agent/effort-planner.js';
import { TaskLedger } from '../src/ledger/task-ledger.js';
import { UI_HTML } from '../src/server/ui.js';

const action = (value: Record<string, unknown>) => JSON.stringify({ action: value });
const done = action({ type: 'complete', chat: true, summary: 'Hello.' });
const servers: GituServer[] = [];
let oldHome: string | undefined;
let home: string;
let project: string;

beforeEach(() => {
  oldHome = process.env['AGENT_GITU_HOME'];
  home = mkdtempSync(path.join(tmpdir(), 'main-recovery-'));
  process.env['AGENT_GITU_HOME'] = home;
  project = path.join(home, 'project');
  mkdirSync(project);
  writeFileSync(path.join(project, 'package.json'), '{"name":"recovery-project","scripts":{"test":"node check.cjs"}}');
  writeFileSync(path.join(project, 'README.md'), 'Helo world\n');
  writeFileSync(path.join(project, 'check.cjs'), "require('node:assert/strict').equal(require('node:fs').readFileSync('README.md','utf8'),'Hello world\\n');");
  // These tests exercise the outer task scheduler after transport retries end.
  vi.spyOn(resilience, 'resilientLlm').mockImplementation(client => client);
  vi.spyOn(providers, 'fetchModelCatalog').mockResolvedValue(undefined);
});

afterEach(async () => {
  for (const server of servers.splice(0)) await server.stop();
  vi.restoreAllMocks();
  if (oldHome === undefined) delete process.env['AGENT_GITU_HOME'];
  else process.env['AGENT_GITU_HOME'] = oldHome;
});

function client(reply: (messages: LlmMessage[]) => Promise<string> | string): LlmClient {
  return { name: 'recovery-test', complete: async messages => reply(messages), completeStream: async (messages, _opts, delta) => { const text = await reply(messages); delta(text); return text; } };
}

async function start(llm: LlmClient, delay = 40) {
  const server = new GituServer({ cwd: project, port: 0, llm, autoInstallLsp: false, providerRecoveryDelayMs: delay });
  servers.push(server);
  return { server, base: `http://127.0.0.1:${await server.start()}` };
}

async function post(base: string, route: string, body: unknown = {}) {
  const response = await fetch(base + route, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  expect(response.ok, await response.clone().text()).toBe(true);
  return response.json();
}

async function waitSession(base: string, id: string, predicate: (view: RunSessionView) => boolean): Promise<RunSessionView> {
  const until = Date.now() + 18000;
  while (Date.now() < until) {
    const view = await (await fetch(`${base}/api/runs/${id}`)).json() as RunSessionView;
    if (predicate(view)) return view;
    await new Promise(resolve => setTimeout(resolve, 20));
  }
  throw new Error(`Run ${id} did not reach its expected state: ${await (await fetch(`${base}/api/runs/${id}`)).text()}`);
}

describe('main agent automatic recovery', () => {
  it('resumes a transient outage without repeating completed edits', async () => {
    let calls = 0;
    const llm = client(() => {
      switch (++calls) {
        case 1: return action({ type: 'tool_call', tool: 'read_file', params: { path: 'README.md' }, reason: 'Inspect wording', expected: 'Current wording' });
        case 2: return action({ type: 'tool_call', tool: 'write_file', params: { path: 'README.md', content: 'Hello world\n' }, reason: 'Repair wording', expected: 'Correct wording' });
        case 3: throw new LlmError('upstream temporarily unavailable', { kind: 'provider_unavailable' });
        case 4: return action({ type: 'tool_call', tool: 'run_command', params: { command: 'node check.cjs' }, reason: 'Verify saved repair', expected: 'Pass' });
        default: return action({ type: 'complete', summary: 'Corrected and verified the wording.' });
      }
    });
    const { base } = await start(llm);
    const { runId } = await post(base, '/api/runs', { goal: 'Correct the typo in README.md', mode: 'agent', autoLearn: false, review: false, effort: 'low' });
    const view = await waitSession(base, runId, s => s.status === 'completed');
    expect(view.modelRecovery).toBeUndefined();
    const ledger = TaskLedger.load(project, view.taskId!)!;
    expect(ledger.data.actions.filter(a => a.tool === 'write_file' && a.status === 'success')).toHaveLength(1);
    expect(ledger.data.evidence.some(e => e.passed)).toBe(true);
  }, 30000);

  it('cancels a queued retry when the user stops the run', async () => {
    let calls = 0;
    const { base } = await start(client(() => { calls++; throw new LlmError('503', { kind: 'provider_unavailable' }); }), 500);
    const { runId } = await post(base, '/api/runs', { goal: 'Say hello', mode: 'chat', autoLearn: false });
    const waiting = await waitSession(base, runId, s => s.status === 'waiting_for_model');
    expect(waiting.modelRecovery?.attempt).toBe(1);
    expect(waiting.finishedAt).toBeUndefined();
    await post(base, `/api/runs/${runId}/stop`);
    await new Promise(resolve => setTimeout(resolve, 650));
    const stopped = await waitSession(base, runId, s => s.status === 'aborted');
    expect(stopped.modelRecovery).toBeUndefined();
    expect(calls).toBe(1);
  }, 30000);

  it('restores a pending retry after an application restart', async () => {
    const first = await start(client(() => { throw new LlmError('connection lost', { kind: 'network' }); }), 500);
    const { runId } = await post(first.base, '/api/runs', { goal: 'Say hello', mode: 'chat', autoLearn: false });
    await waitSession(first.base, runId, s => s.status === 'waiting_for_model');
    await first.server.stop();
    servers.splice(servers.indexOf(first.server), 1);
    const second = await start(client(() => done));
    const complete = await waitSession(second.base, runId, s => s.status === 'completed');
    expect(complete.modelRecovery).toBeUndefined();
    expect(complete.error).toBeUndefined();
  }, 30000);

  it('leaves fatal authentication errors visible without automatic retries', async () => {
    let calls = 0;
    const { base } = await start(client(() => { calls++; throw new LlmError('Invalid API key', { kind: 'auth', status: 401 }); }));
    const { runId } = await post(base, '/api/runs', { goal: 'Say hello', mode: 'chat', autoLearn: false });
    const failed = await waitSession(base, runId, s => s.status === 'failed');
    expect(failed.modelRecovery).toBeUndefined();
    expect(failed.error).toContain('Invalid API key');
    await new Promise(resolve => setTimeout(resolve, 80));
    expect(calls).toBe(1);
  }, 30000);

  it('persists and clears recovery metadata in both session lookups', () => {
    const store = new SessionStore(path.join(home, 'migration.db'));
    const recovery = { attempt: 7, nextRetryAt: new Date(Date.now() + 5000).toISOString() };
    try {
      const row = { runId: 'run-recovery', taskId: 'task-recovery', goal: 'Saved task', startedAt: new Date().toISOString(), status: 'waiting_for_model' };
      store.upsertSession({ ...row, modelRecovery: recovery });
      expect(store.listSessions()[0]?.modelRecovery).toEqual(recovery);
      expect(store.getSessionByTaskId('task-recovery')?.modelRecovery).toEqual(recovery);
      store.upsertSession({ ...row, status: 'aborted' });
      expect(store.getSessionByTaskId('task-recovery')?.modelRecovery).toBeUndefined();
    } finally { store.close(); }
  });

  it('bounds a run with no verifiable progress after its extension windows and explains what is needed', async () => {
    const effort = effortPlanner.planEffort('Inspect README.md', { mode: 'agent' });
    vi.spyOn(effortPlanner, 'planEffort').mockReturnValue({ ...effort, maxTurns: 1 });
    const { base } = await start(client(() => action({ type: 'set_plan', steps: [{ description: 'Inspect README.md', verification: 'Read the requested text' }] })));
    const { runId } = await post(base, '/api/runs', { goal: 'Inspect README.md', mode: 'agent', autoLearn: false, review: false });
    // The run is not cut off at the first unproductive turn: it gets its
    // extension windows (with a change-of-approach nudge each time) and only
    // then is reported as stuck — a bound, never a silent loop.
    const paused = await waitSession(base, runId, s => s.status === 'failed');
    expect(paused.error).toContain("Exhausted the task's effort budget");
    expect(paused.error).toContain('extension(s) granted');
    expect(paused.error).toContain('Retry with effort=high');
    expect(paused.modelRecovery).toBeUndefined();
    expect(paused.report?.status).not.toBe('complete');
  }, 60000);

  it('a manual continuation replaces a pending automatic retry', async () => {
    let calls = 0;
    const { base } = await start(client(() => { if (++calls === 1) throw new LlmError('503', { kind: 'provider_unavailable' }); return done; }), 600);
    const { runId } = await post(base, '/api/runs', { goal: 'Say hello', mode: 'chat', autoLearn: false });
    await waitSession(base, runId, s => s.status === 'waiting_for_model');
    await post(base, `/api/runs/${runId}/message`, { text: 'Continue', autoLearn: false });
    await waitSession(base, runId, s => s.status === 'completed');
    await new Promise(resolve => setTimeout(resolve, 750));
    expect(calls).toBe(2);
  }, 30000);

  it('does not start model work when Stop arrives during async setup', async () => {
    const release: (() => void)[] = [];
    vi.mocked(providers.fetchModelCatalog).mockImplementation(() => new Promise(resolve => { release.push(() => resolve(undefined)); }));
    let calls = 0;
    const { base } = await start(client(() => { calls++; return done; }));
    const { runId } = await post(base, '/api/runs', { goal: 'Say hello', mode: 'chat', autoLearn: false });
    await vi.waitFor(() => expect(release.length).toBeGreaterThan(0));
    await post(base, `/api/runs/${runId}/stop`);
    for (const resolve of release) resolve();
    await new Promise(resolve => setTimeout(resolve, 50));
    await waitSession(base, runId, s => s.status === 'aborted');
    expect(calls).toBe(0);
  }, 30000);

  it('restores pending recovery when the same server instance restarts', async () => {
    let healthy = false;
    const first = await start(client(() => { if (!healthy) throw new LlmError('503', { kind: 'provider_unavailable' }); return done; }), 500);
    const { runId } = await post(first.base, '/api/runs', { goal: 'Say hello', mode: 'chat', autoLearn: false });
    await waitSession(first.base, runId, s => s.status === 'waiting_for_model');
    await first.server.stop();
    healthy = true;
    const base = `http://127.0.0.1:${await first.server.start()}`;
    const complete = await waitSession(base, runId, s => s.status === 'completed');
    expect(complete.modelRecovery).toBeUndefined();
  }, 30000);

  it('keeps polling during recovery and exposes a stop control', () => {
    expect(() => new Function(UI_HTML.split('<script>')[1]!.split('</script>')[0]!)).not.toThrow();
    expect(UI_HTML).toContain("s.status === 'running' || s.status === 'waiting_for_model'");
    expect(UI_HTML).toContain('Waiting for the model — retrying automatically');
    expect(UI_HTML).toContain("else if (session.status !== 'running')");
  });
});
