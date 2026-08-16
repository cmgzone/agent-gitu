import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ScriptedMockLlm } from '../src/llm/llm.js';
import { HermesServer } from '../src/server/server.js';
import { UI_HTML } from '../src/server/ui.js';

function makeProject(name: string): string {
  const dir = mkdtempSync(path.join(tmpdir(), `hermes-web-${name}-`));
  writeFileSync(
    path.join(dir, 'package.json'),
    JSON.stringify({ name: `web-${name}`, scripts: { test: 'node --version' } }, null, 2),
  );
  return dir;
}

async function waitFor<T>(fn: () => Promise<T | undefined>, timeoutMs = 20000): Promise<T> {
  const start = Date.now();
  for (;;) {
    const value = await fn();
    if (value !== undefined) return value;
    if (Date.now() - start > timeoutMs) throw new Error('waitFor timed out');
    await new Promise((r) => setTimeout(r, 200));
  }
}

describe('HermesServer', () => {
  const servers: HermesServer[] = [];

  it('serves a syntactically valid inline UI script', () => {
    const js = UI_HTML.split('<script>')[1]!.split('</script>')[0]!;
    expect(() => new Function(js)).not.toThrow();
  });

  afterAll(async () => {
    for (const s of servers) await s.stop();
  });

  async function startServer(dir: string, llm: ScriptedMockLlm): Promise<{ base: string }> {
    const server = new HermesServer({ cwd: dir, port: 0, llm });
    servers.push(server);
    const port = await server.start();
    return { base: `http://127.0.0.1:${port}` };
  }

  it('serves the UI and project info', async () => {
    const dir = makeProject('ui');
    const { base } = await startServer(dir, new ScriptedMockLlm([]));
    const html = await fetch(`${base}/`).then((r) => r.text());
    expect(html).toContain('HERMES');
    const project = await fetch(`${base}/api/project`).then((r) => r.json());
    expect(project.name).toBe('web-ui');
  });

  it('runs a task end-to-end over HTTP with live state', async () => {
    const dir = makeProject('lifecycle');
    const llm = new ScriptedMockLlm([
      () => JSON.stringify({ action: { type: 'set_criteria', criteria: ['verification command passes'] } }),
      () => JSON.stringify({ action: { type: 'set_plan', steps: [{ description: 'verify', verification: 'node --version' }] } }),
      () => JSON.stringify({
        action: { type: 'tool_call', stepId: 'step-1', tool: 'run_command', params: { command: 'node --version' }, reason: 'verify', expected: 'exit 0' },
      }),
      (_n, messages) => {
        const text = messages.map((m) => m.content).join('\n');
        const evId = (text.match(/(ev-\d{8}-[0-9a-f]{6})/) ?? [])[1] ?? 'ev-x';
        return JSON.stringify({ action: { type: 'claim_criterion', criterionId: 'ac-1', evidenceId: evId } });
      },
      () => JSON.stringify({ action: { type: 'complete', summary: 'verified', risks: [], followUps: [] } }),
    ]);
    const { base } = await startServer(dir, llm);

    const created = await fetch(`${base}/api/runs`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ goal: 'Verify node works', mode: 'fast', review: false }),
    }).then((r) => r.json());
    expect(created.runId).toBeTruthy();

    const session = await waitFor(async () => {
      const s = await fetch(`${base}/api/runs/${created.runId}`).then((r) => r.json());
      return s.status !== 'running' ? s : undefined;
    });
    expect(session.status).toBe('completed');
    expect(session.taskId).toBeTruthy();
    expect(session.report.status).toBe('complete');

    const ledger = await fetch(`${base}/api/tasks/${session.taskId}`).then((r) => r.json());
    expect(ledger.status).toBe('completed');
    expect(ledger.acceptanceCriteria[0].satisfied).toBe(true);
    expect(ledger.evidence.length).toBeGreaterThanOrEqual(1);

    const streamRes = await fetch(`${base}/api/runs/${created.runId}/stream`);
    expect(streamRes.headers.get('content-type')).toContain('text/event-stream');
    await streamRes.body?.cancel();
  }, 30000);

  it('gates dangerous actions behind the approval API', async () => {
    const dir = makeProject('approvals');
    const llm = new ScriptedMockLlm([
      () => JSON.stringify({ action: { type: 'set_criteria', criteria: ['cleanup done'] } }),
      () => JSON.stringify({ action: { type: 'set_plan', steps: [{ description: 'dangerous cleanup', verification: 'n/a' }] } }),
      () => JSON.stringify({
        action: { type: 'tool_call', stepId: 'step-1', tool: 'run_command', params: { command: 'git push --force origin main' }, reason: 'cleanup', expected: 'pushed' },
      }),
      () => JSON.stringify({ action: { type: 'request_block', reason: 'dangerous action was denied' } }),
    ]);
    const { base } = await startServer(dir, llm);

    const created = await fetch(`${base}/api/runs`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ goal: 'Force push cleanup', mode: 'fast', review: false }),
    }).then((r) => r.json());

    const session = await waitFor(async () => {
      const s = await fetch(`${base}/api/runs/${created.runId}`).then((r) => r.json());
      return s.pendingApprovals.length > 0 ? s : undefined;
    });
    expect(session.pendingApprovals[0].tool).toBe('run_command');
    expect(session.pendingApprovals[0].why).toContain('force push');

    const approvalId = session.pendingApprovals[0].id;
    const denied = await fetch(`${base}/api/approvals/${approvalId}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ approved: false }),
    }).then((r) => r.json());
    expect(denied.ok).toBe(true);

    const finished = await waitFor(async () => {
      const s = await fetch(`${base}/api/runs/${created.runId}`).then((r) => r.json());
      return s.status !== 'running' ? s : undefined;
    });
    expect(finished.status).toBe('blocked');

    const ledger = await fetch(`${base}/api/tasks/${finished.taskId}`).then((r) => r.json());
    const deniedActions = ledger.actions.filter((a: { status: string }) => a.status === 'denied');
    expect(deniedActions.length).toBe(1);
  }, 30000);

  it('pauses for plan review over HTTP and builds after approval', async () => {
    const dir = makeProject('planreview');
    const llm = new ScriptedMockLlm([
      () => JSON.stringify({ action: { type: 'set_criteria', criteria: ['verification passes'] } }),
      () => JSON.stringify({ action: { type: 'set_plan', steps: [{ description: 'run verification', verification: 'node --version' }] } }),
      () => JSON.stringify({
        action: { type: 'tool_call', stepId: 'step-1', tool: 'run_command', params: { command: 'node --version' }, reason: 'verify', expected: 'exit 0' },
      }),
      (_n, messages) => {
        const text = messages.map((m) => m.content).join('\n');
        const evId = (text.match(/(ev-\d{8}-[0-9a-f]{6})/) ?? [])[1] ?? 'ev-x';
        return JSON.stringify({ action: { type: 'claim_criterion', criterionId: 'ac-1', evidenceId: evId } });
      },
      () => JSON.stringify({ action: { type: 'complete', summary: 'done after review', risks: [], followUps: [] } }),
    ]);
    const { base } = await startServer(dir, llm);

    const created = await fetch(`${base}/api/runs`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ goal: 'Reviewed build', mode: 'fast', review: true }),
    }).then((r) => r.json());

    const withReview = await waitFor(async () => {
      const s = await fetch(`${base}/api/runs/${created.runId}`).then((r) => r.json());
      return s.pendingPlanReview ? s : undefined;
    });
    expect(withReview.pendingPlanReview.steps[0].description).toBe('run verification');
    expect(withReview.status).toBe('running');

    const approved = await fetch(`${base}/api/plan-review/${withReview.pendingPlanReview.id}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ approved: true }),
    }).then((r) => r.json());
    expect(approved.ok).toBe(true);

    const finished = await waitFor(async () => {
      const s = await fetch(`${base}/api/runs/${created.runId}`).then((r) => r.json());
      return s.status !== 'running' ? s : undefined;
    });
    expect(finished.status).toBe('completed');
    const ledger = await fetch(`${base}/api/tasks/${finished.taskId}`).then((r) => r.json());
    expect(ledger.planApproved).toBe(true);
  }, 30000);

  it('queues user messages and stops a running task over HTTP', async () => {
    const dir = makeProject('interrupt');
    const longProse = 'Working carefully on the current step and observing the results. '.repeat(30);
    const script: ((n: number, m: { role: string; content: string }[]) => string)[] = [
      () => JSON.stringify({ action: { type: 'set_criteria', criteria: ['c'] } }),
      () => JSON.stringify({ action: { type: 'set_plan', steps: [{ description: 's', verification: 'v' }] } }),
    ];
    for (let i = 0; i < 20; i++) {
      script.push(() => `${longProse}\n${JSON.stringify({ action: { type: 'set_hypothesis', text: 'h' } })}`);
    }
    script.push(() => JSON.stringify({ action: { type: 'request_block', reason: 'end' } }));
    const { base } = await startServer(dir, new ScriptedMockLlm(script));

    const created = await fetch(`${base}/api/runs`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ goal: 'interruptible task', mode: 'fast', review: false }),
    }).then((r) => r.json());

    const running = await waitFor(async () => {
      const s = await fetch(`${base}/api/runs/${created.runId}`).then((r) => r.json());
      return s.status === 'running' && s.taskId ? s : undefined;
    });

    const msg = await fetch(`${base}/api/runs/${created.runId}/message`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text: 'focus on the header section' }),
    }).then((r) => r.json());
    expect(msg.ok).toBe(true);

    const stop = await fetch(`${base}/api/runs/${created.runId}/stop`, { method: 'POST' }).then((r) => r.json());
    expect(stop.ok).toBe(true);

    const finished = await waitFor(async () => {
      const s = await fetch(`${base}/api/runs/${created.runId}`).then((r) => r.json());
      return s.status !== 'running' ? s : undefined;
    });
    expect(finished.status).toBe('blocked');
    const ledger = await fetch(`${base}/api/tasks/${running.taskId}`).then((r) => r.json());
    expect(ledger.blockers.join(' ')).toContain('Stopped by user');
  }, 60000);

  it('rejects runs without a goal', async () => {
    const dir = makeProject('badreq');
    const { base } = await startServer(dir, new ScriptedMockLlm([]));
    const res = await fetch(`${base}/api/runs`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
  });

  it('exposes the in-app browser API when a bridge is configured', async () => {
    const dir = makeProject('browserapi');
    const state = { available: true, url: 'http://localhost:1/', title: 'T', canBack: false, canForward: false, loading: false };
    const bridge = {
      available: () => true,
      state: () => state,
      navigate: async (url: string) => ({ ...state, url }),
      back: async () => state,
      forward: async () => state,
      reload: async () => state,
      click: async () => state,
      type: async () => state,
      screenshot: async () => ({ pngBase64: Buffer.from('png').toString('base64'), state }),
    };
    const server = new HermesServer({ cwd: dir, port: 0, llm: new ScriptedMockLlm([]), browser: bridge });
    servers.push(server);
    const port = await server.start();
    const base = `http://127.0.0.1:${port}`;

    const info = await fetch(`${base}/api/browser`).then((r) => r.json());
    expect(info.has).toBe(true);

    const nav = await fetch(`${base}/api/browser/navigate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ url: 'http://localhost:4173/' }),
    }).then((r) => r.json());
    expect(nav.url).toBe('http://localhost:4173/');

    const shot = await fetch(`${base}/api/browser/screenshot`).then((r) => r.json());
    expect(shot.pngBase64).toBe(Buffer.from('png').toString('base64'));
  });

  it('reports 503 for browser endpoints without a bridge', async () => {
    const dir = makeProject('nobrowser');
    const { base } = await startServer(dir, new ScriptedMockLlm([]));
    const res = await fetch(`${base}/api/browser/screenshot`);
    expect(res.status).toBe(503);
  });
});
