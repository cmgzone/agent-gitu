import { mkdtempSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execSync } from 'node:child_process';
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
    expect(UI_HTML).toContain("sess.chatish = session.mode === 'chat';");
    expect(UI_HTML).not.toContain('looksChat');
  });

  it('keeps event ids monotonic when non-persisted stream deltas leave gaps', () => {
    const server = new HermesServer({ cwd: makeProject('event-cursor'), port: 0, llm: new ScriptedMockLlm([]) });
    const session = {
      events: [
        { i: 0, t: '2026-01-01T00:00:00.000Z', text: 'user-msg original task' },
        // A streaming delta at i=1 is not persisted, so a restored session
        // can contain a gap like this one.
        { i: 2, t: '2026-01-01T00:00:01.000Z', text: 'run finished: failed' },
      ],
      subscribers: new Set<(event: { i: number; t: string; text: string }) => void>(),
    };
    (server as unknown as { pushEvent: (target: typeof session, text: string, persist: boolean) => void }).pushEvent(session, 'user-msg continue', false);
    expect(session.events.at(-1)?.i).toBe(3);
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
    expect(html).toContain('AGENT GITU');
    const project = await fetch(`${base}/api/project`).then((r) => r.json());
    expect(project.name).toBe('web-ui');
  });

  it('exposes live token limits and prices with the model catalog', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      if (url === 'https://models.dev/api.json') {
        return new Response(
          JSON.stringify({
            openai: {
              models: {
                'gpt-4.1-mini': { limit: { context: 1_047_576, output: 32_768 }, cost: { input: 0.4, output: 1.6 } },
              },
            },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }
      if (url.startsWith('http://127.0.0.1:')) return originalFetch(input, init);
      return new Response(JSON.stringify({ data: [] }), { status: 200, headers: { 'content-type': 'application/json' } });
    }) as typeof fetch;
    try {
      const dir = makeProject('model-catalog');
      const { base } = await startServer(dir, new ScriptedMockLlm([]));
      const data = await fetch(`${base}/api/models`).then((r) => r.json());
      const openai = data.providers.find((p: { id: string }) => p.id === 'openai');
      const model = openai.models.find((m: { id: string }) => m.id === 'gpt-4.1-mini');
      expect(model.metadata).toMatchObject({ contextTokens: 1_047_576, outputTokens: 32_768, inputPricePerMillion: 0.4, outputPricePerMillion: 1.6 });
    } finally {
      globalThis.fetch = originalFetch;
    }
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

  function billingCrashLlm(): ScriptedMockLlm {
    const boom = () => {
      throw new Error('LLM HTTP 401 (no credits): Insufficient balance. Manage your billing here: https://opencode.ai/workspace/wrk_x/billing — this is a paid model; add credits or subscribe to use it');
    };
    return {
      name: 'billing-crash',
      complete: async () => boom(),
      completeStream: async () => boom(),
      lastReasoning: undefined,
    } as unknown as ScriptedMockLlm;
  }

  it('falls back to a same-provider free model when retrying after a no-credits failure', async () => {
    const dir = makeProject('billing-fallback');
    const { base } = await startServer(dir, billingCrashLlm());

    const created = await fetch(`${base}/api/runs`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ goal: 'audit the repo', mode: 'fast', review: false, provider: 'opencode-zen', model: 'muse-spark-1.2' }),
    }).then((r) => r.json());
    const failed = await waitFor(async () => {
      const s = await fetch(`${base}/api/runs/${created.runId}`).then((r) => r.json());
      return s.status === 'failed' ? s : undefined;
    });
    expect(failed.error).toMatch(/401|no credits/i);
    expect(failed.model).toBe('muse-spark-1.2');

    // Retry WITHOUT touching the picker — the paid model must not be reused.
    await fetch(`${base}/api/runs/${created.runId}/message`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text: 'continue', mode: 'standard' }),
    });
    const retried = await waitFor(async () => {
      const s = await fetch(`${base}/api/runs/${created.runId}`).then((r) => r.json());
      return s.status !== 'running' && s.model !== 'muse-spark-1.2' ? s : undefined;
    });
    expect(retried.model).toMatch(/-free$|^big-pickle$/);
  }, 30000);

  it('keeps the paid model when the user explicitly overrides after topping up', async () => {
    const dir = makeProject('billing-explicit');
    const { base } = await startServer(dir, billingCrashLlm());

    const created = await fetch(`${base}/api/runs`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ goal: 'paid work', mode: 'fast', review: false, provider: 'opencode-zen', model: 'muse-spark-1.2' }),
    }).then((r) => r.json());
    await waitFor(async () => {
      const s = await fetch(`${base}/api/runs/${created.runId}`).then((r) => r.json());
      return s.status === 'failed' ? s : undefined;
    });

    // Explicit override: user picked the paid model again on purpose.
    await fetch(`${base}/api/runs/${created.runId}/message`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text: 'retry paid', provider: 'opencode-zen', model: 'muse-spark-1.2', useSelectedModel: true }),
    });
    const retried = await waitFor(async () => {
      const s = await fetch(`${base}/api/runs/${created.runId}`).then((r) => r.json());
      return s.status !== 'running' ? s : undefined;
    });
    expect(retried.model).toBe('muse-spark-1.2');
  }, 30000);

  function initGitRepo(dir: string): (args: string) => string {
    execSync('git init', { cwd: dir });
    execSync('git config user.email agent@test', { cwd: dir });
    execSync('git config user.name agent', { cwd: dir });
    execSync('git add -A', { cwd: dir });
    execSync('git commit -m init --no-gpg-sign --no-verify', { cwd: dir });
    return (args: string) => execSync(`git ${args}`, { cwd: dir }).toString().trim();
  }

  function standardTaskLlm(finalSummary: string): ScriptedMockLlm {
    return new ScriptedMockLlm([
      () => JSON.stringify({ action: { type: 'set_criteria', criteria: ['verification command passes'] } }),
      () => JSON.stringify({ action: { type: 'set_plan', steps: [{ description: 'verify', verification: 'node --version' }] } }),
      () => JSON.stringify({
        action: { type: 'tool_call', stepId: 'step-1', tool: 'run_command', params: { command: 'node --version' }, reason: 'verify', expected: 'exit 0' },
      }),
      (_n, messages) => {
        const text = messages.map((m) => m.content).join('\n');
        // Cite the NEWEST evidence record (a competent model cites what it just
        // produced; earlier ids may be stale from prior phases).
        const ids = [...text.matchAll(/(ev-\d{8}-[0-9a-f]{6})/g)].map((m) => m[1]);
        return JSON.stringify({ action: { type: 'claim_criterion', criterionId: 'ac-1', evidenceId: ids.at(-1) ?? 'ev-x' } });
      },
      () => JSON.stringify({ action: { type: 'complete', summary: finalSummary, risks: [], followUps: [] } }),
    ]);
  }

  it('reactivates an older session in its own worktree without stealing the shared checkout', async () => {
    const dir = makeProject('branch-resume');
    const g = initGitRepo(dir);
    const { base } = await startServer(dir, standardTaskLlm('first run done'));

    const created = await fetch(`${base}/api/runs`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ goal: 'branch resume task', mode: 'standard', review: false, projectPath: dir }),
    }).then((r) => r.json());
    const done = await waitFor(async () => {
      const s = await fetch(`${base}/api/runs/${created.runId}`).then((r) => r.json());
      return s.status !== 'running' ? s : undefined;
    });
    expect(done.status).toBe('completed');
    const taskBranch = `hermes/${done.taskId}`;
    expect(g('rev-parse --abbrev-ref HEAD')).toBe(taskBranch);

    // Starting another task moves the shared checkout off this session's
    // branch — exactly what locked every previous session out after a restart.
    g(`checkout -b ${taskBranch}-next`);

    // Swap in an LLM whose next reply completes the resumed session.
    const server = servers[servers.length - 1]!;
    (server as unknown as { config: { llm: unknown } }).config.llm = standardTaskLlm('resumed fine');

    const msg = await fetch(`${base}/api/runs/${created.runId}/message`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text: 'continue' }),
    }).then((r) => r.json());
    expect(msg.resumed).toBe(true);
    const resumed = await waitFor(async () => {
      const s = await fetch(`${base}/api/runs/${created.runId}`).then((r) => r.json());
      return s.status !== 'running' ? s : undefined;
    });
    expect(resumed.report?.summary).toContain('resumed fine');

    // The shared checkout keeps the branch the newer run gave it; this session
    // resumed in a dedicated linked worktree on its own branch instead.
    expect(g('rev-parse --abbrev-ref HEAD')).toBe(`${taskBranch}-next`);
    const wtDir = path.join(dir, '.hermes', 'worktrees', done.taskId);
    expect(existsSync(wtDir)).toBe(true);
    expect(execSync('git rev-parse --abbrev-ref HEAD', { cwd: wtDir }).toString().trim()).toBe(taskBranch);
    const ledger = JSON.parse(readFileSync(path.join(dir, '.hermes', 'tasks', `${done.taskId}.json`), 'utf8')) as {
      worktreePath?: string;
    };
    expect(ledger.worktreePath?.toLowerCase()).toBe(wtDir.toLowerCase());

    // A follow-up message reuses the same worktree (already recorded).
    const again = await fetch(`${base}/api/runs/${created.runId}/message`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text: 'once more' }),
    }).then((r) => r.json());
    expect(again.resumed).toBe(true);
  }, 60000);

  it('resumes an older session even while another run is using the project checkout', async () => {
    const dir = makeProject('branch-busy');
    const g = initGitRepo(dir);
    const { base } = await startServer(dir, standardTaskLlm('first run done'));

    const created = await fetch(`${base}/api/runs`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ goal: 'busy branch task', mode: 'standard', review: false, projectPath: dir }),
    }).then((r) => r.json());
    const done = await waitFor(async () => {
      const s = await fetch(`${base}/api/runs/${created.runId}`).then((r) => r.json());
      return s.status !== 'running' ? s : undefined;
    });
    expect(done.status).toBe('completed');

    // Another run actively working on this project right now must no longer
    // block older sessions: each resumes in its own worktree.
    const sessions = (servers[servers.length - 1] as unknown as {
      sessions: Map<string, { status: string; projectPath?: string; runId?: string }>;
    }).sessions;
    sessions.set('run-busy-neighbor', { runId: 'run-busy-neighbor', status: 'running', projectPath: dir });

    g('checkout -b some-other-task-branch');

    const resp = await fetch(`${base}/api/runs/${created.runId}/message`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text: 'continue' }),
    });
    expect(resp.status).toBe(200);
    // The checkout stays exactly where the active run left it.
    expect(g('rev-parse --abbrev-ref HEAD')).toBe('some-other-task-branch');
    expect(existsSync(path.join(dir, '.hermes', 'worktrees', done.taskId))).toBe(true);
  }, 60000);

  it('restores a chat transcript, its metadata, and conversational context after restart', async () => {
    const dir = makeProject('chat-restart');
    const firstServer = new HermesServer({
      cwd: dir,
      port: 0,
      llm: new ScriptedMockLlm([() => 'I remember this first reply.']),
    });
    servers.push(firstServer);
    const firstPort = await firstServer.start();
    const firstBase = `http://127.0.0.1:${firstPort}`;

    const created = await fetch(`${firstBase}/api/runs`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ goal: 'Remember the blue widget', mode: 'chat', review: false }),
    }).then((r) => r.json());
    const completed = await waitFor(async () => {
      const session = await fetch(`${firstBase}/api/runs/${created.runId}`).then((r) => r.json());
      return session.status !== 'running' ? session : undefined;
    });
    expect(completed.mode).toBe('chat');
    expect(completed.report.summary).toContain('I remember this first reply');

    await firstServer.stop();

    let receivedHistory = false;
    const secondServer = new HermesServer({
      cwd: dir,
      port: 0,
      llm: new ScriptedMockLlm([
        (_n, messages) => {
          const text = messages
            .map((m) => (typeof m.content === 'string' ? m.content : ''))
            .join('\n');
          receivedHistory = text.includes('Remember the blue widget') && text.includes('I remember this first reply.');
          return 'The widget is blue.';
        },
      ]),
    });
    servers.push(secondServer);
    const secondPort = await secondServer.start();
    const secondBase = `http://127.0.0.1:${secondPort}`;

    const restored = await fetch(`${secondBase}/api/runs/${created.runId}`).then((r) => r.json());
    expect(restored.status).toBe('completed');
    expect(restored.mode).toBe('chat');
    expect(restored.report.summary).toContain('I remember this first reply');
    expect(restored.finishedAt).toBeTruthy();

    const stream = await fetch(`${secondBase}/api/runs/${created.runId}/stream`);
    const reader = stream.body!.getReader();
    const firstChunk = await reader.read();
    await reader.cancel();
    expect(new TextDecoder().decode(firstChunk.value)).toContain('user-msg Remember the blue widget');

    const resumed = await fetch(`${secondBase}/api/runs/${created.runId}/message`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text: 'What color was the widget?' }),
    }).then((r) => r.json());
    expect(resumed.resumed).toBe(true);

    const finished = await waitFor(async () => {
      const session = await fetch(`${secondBase}/api/runs/${created.runId}`).then((r) => r.json());
      return session.status !== 'running' ? session : undefined;
    });
    expect(receivedHistory).toBe(true);
    expect(finished.report.summary).toContain('The widget is blue');
  }, 30000);

  it('retry and edited resends supersede the original message instead of cloning it', async () => {
    const dir = makeProject('retry');
    const { base } = await startServer(
      dir,
      new ScriptedMockLlm([() => 'first reply', () => 'second reply', () => 'third reply']),
    );
    const server = servers[servers.length - 1]!;

    const created = await fetch(`${base}/api/runs`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ goal: 'original message', mode: 'chat', review: false }),
    }).then((r) => r.json());
    await waitFor(async () => {
      const s = await fetch(`${base}/api/runs/${created.runId}`).then((r) => r.json());
      return s.status !== 'running' ? s : undefined;
    });

    const resend = async (text: string, supersede: string) => {
      const posted = await fetch(`${base}/api/runs/${created.runId}/message`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ text, mode: 'chat', supersede }),
      }).then((r) => r.json());
      if (!posted.ok) throw new Error('resend rejected');
      await waitFor(async () => {
        const s = await fetch(`${base}/api/runs/${created.runId}`).then((r) => r.json());
        return s.status !== 'running' ? s : undefined;
      });
    };

    await resend('original message', 'original message');
    await resend('edited message', 'original message');

    const events = (server as unknown as { sessions: Map<string, { events: { text: string }[] }> })
      .sessions.get(created.runId)!
      .events.map((e) => e.text);
    const userMsgs = events.filter((t) => t.startsWith('user-msg '));
    expect(userMsgs).toEqual(['user-msg edited message']);
    const view = await fetch(`${base}/api/runs/${created.runId}`).then((r) => r.json());
    expect(view.goal).toBe('edited message');
  }, 30000);

  it('auto-approve applies to continuations when the client sends it', async () => {
    const dir = makeProject('autoapprove');
    const { base } = await startServer(
      dir,
      new ScriptedMockLlm([
        () => 'hello',
        () => JSON.stringify({ action: { type: 'set_criteria', criteria: ['auto-approved command ran'] } }),
        () => JSON.stringify({ action: { type: 'set_plan', steps: [{ description: 'run command', verification: "node -e \"console.log('auto-approved')\"" }] } }),
        () => JSON.stringify({
          action: { type: 'tool_call', stepId: 'step-1', tool: 'run_command', params: { command: "node -e \"console.log('auto-approved')\"" }, reason: 'test', expected: 'output' },
        }),
        (_n, messages) => {
          const text = messages.map((m) => m.content).join('\n');
          const evId = (text.match(/(ev-\d{8}-[0-9a-f]{6})/) ?? [])[1] ?? 'ev-x';
          return JSON.stringify({ action: { type: 'claim_criterion', criterionId: 'ac-1', evidenceId: evId } });
        },
        () => JSON.stringify({ action: { type: 'complete', summary: 'ran with auto-approve', risks: [], followUps: [] } }),
      ]),
    );

    const created = await fetch(`${base}/api/runs`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ goal: 'chat first', mode: 'chat', review: false }),
    }).then((r) => r.json());
    await waitFor(async () => {
      const s = await fetch(`${base}/api/runs/${created.runId}`).then((r) => r.json());
      return s.status !== 'running' ? s : undefined;
    });

    await fetch(`${base}/api/runs/${created.runId}/message`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text: 'now run the command', mode: 'standard', autoApprove: true }),
    });
    const session = await waitFor(async () => {
      const s = await fetch(`${base}/api/runs/${created.runId}`).then((r) => r.json());
      return s.status !== 'running' ? s : undefined;
    });
    expect(session.status).toBe('completed');
    expect(session.pendingApprovals).toEqual([]);
    const ledger = await fetch(`${base}/api/tasks/${session.taskId}`).then((r) => r.json());
    const cmd = ledger.actions.find((a: { tool: string }) => a.tool === 'run_command');
    expect(cmd.status).toBe('success');
  }, 90000);

  it('switches a chat session to build mode when the follow-up sends mode: standard', async () => {
    let secondPrompt = '';
    const llm = new ScriptedMockLlm([
      () => 'First chat reply.',
      (_n, messages) => {
        secondPrompt = messages.map((m) => (typeof m.content === 'string' ? m.content : '')).join('\n');
        return JSON.stringify({ action: { type: 'request_block', reason: 'paused for review' } });
      },
    ]);
    const dir = makeProject('chat-to-build');
    const { base } = await startServer(dir, llm);
    const created = await fetch(`${base}/api/runs`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ goal: 'Chat first', mode: 'chat', review: false }),
    }).then((r) => r.json());
    await waitFor(async () => {
      const session = await fetch(`${base}/api/runs/${created.runId}`).then((r) => r.json());
      return session.status !== 'running' ? session : undefined;
    });

    const resumed = await fetch(`${base}/api/runs/${created.runId}/message`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text: 'now build it', mode: 'standard', review: false }),
    }).then((r) => r.json());
    expect(resumed.resumed).toBe(true);

    const finished = await waitFor(async () => {
      const session = await fetch(`${base}/api/runs/${created.runId}`).then((r) => r.json());
      return session.status !== 'running' ? session : undefined;
    });
    expect(finished.mode).toBe('standard');
    expect(finished.taskId).toBeTruthy();
    expect(secondPrompt).toContain('FOLLOW-UP MESSAGE');
    expect(secondPrompt).not.toContain('chat mode — answer directly');
  }, 30000);

  it('switches a build session to chat mode when the follow-up sends mode: chat', async () => {
    let secondPrompt = '';
    const llm = new ScriptedMockLlm([
      () => JSON.stringify({ action: { type: 'request_block', reason: 'paused first' } }),
      (_n, messages) => {
        secondPrompt = messages.map((m) => (typeof m.content === 'string' ? m.content : '')).join('\n');
        return 'A direct answer.';
      },
    ]);
    const dir = makeProject('build-to-chat');
    const { base } = await startServer(dir, llm);
    const created = await fetch(`${base}/api/runs`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ goal: 'Build first', mode: 'standard', review: false }),
    }).then((r) => r.json());
    await waitFor(async () => {
      const session = await fetch(`${base}/api/runs/${created.runId}`).then((r) => r.json());
      return session.status !== 'running' ? session : undefined;
    });

    const resumed = await fetch(`${base}/api/runs/${created.runId}/message`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text: 'just answer', mode: 'chat' }),
    }).then((r) => r.json());
    expect(resumed.resumed).toBe(true);

    const finished = await waitFor(async () => {
      const session = await fetch(`${base}/api/runs/${created.runId}`).then((r) => r.json());
      return session.status !== 'running' ? session : undefined;
    });
    expect(finished.mode).toBe('chat');
    expect(secondPrompt).toContain('chat mode — answer directly');
  }, 30000);

  it('resumes a standard session as a task and adopts the picker model for legacy sessions', async () => {
    let sawContinuationInstruction = false;
    const llm = new ScriptedMockLlm([
      () => JSON.stringify({ action: { type: 'request_block', reason: 'paused for a follow-up' } }),
      (_n, messages) => {
        const transcript = messages.map((m) => (typeof m.content === 'string' ? m.content : '')).join('\n');
        sawContinuationInstruction = transcript.includes('FOLLOW-UP MESSAGE') && transcript.includes('"continue working"');
        return JSON.stringify({ action: { type: 'request_block', reason: 'paused again' } });
      },
    ]);
    const dir = makeProject('standard-resume');
    const { base } = await startServer(dir, llm);
    const created = await fetch(`${base}/api/runs`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ goal: 'Finish the existing task', mode: 'standard', review: false }),
    }).then((r) => r.json());
    const paused = await waitFor(async () => {
      const session = await fetch(`${base}/api/runs/${created.runId}`).then((r) => r.json());
      return session.status !== 'running' ? session : undefined;
    });
    expect(paused.mode).toBe('standard');
    expect(paused.provider).toBeUndefined();

    const resumed = await fetch(`${base}/api/runs/${created.runId}/message`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text: 'continue working', provider: 'opencode-zen', model: 'hy3-free' }),
    }).then((r) => r.json());
    expect(resumed.resumed).toBe(true);

    const finished = await waitFor(async () => {
      const session = await fetch(`${base}/api/runs/${created.runId}`).then((r) => r.json());
      return session.status !== 'running' ? session : undefined;
    });
    expect(finished.mode).toBe('standard');
    expect(finished.provider).toBe('opencode-zen');
    expect(finished.model).toBe('hy3-free');
    expect(sawContinuationInstruction).toBe(true);
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
