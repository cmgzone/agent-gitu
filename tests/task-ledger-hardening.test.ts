import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { gitExec } from '../src/git/git.js';
import { ProjectGuard } from '../src/guard/project-guard.js';
import { TaskLedger } from '../src/ledger/task-ledger.js';
import { type LlmClient, type LlmDeltaHandler, type LlmMessage, type LlmOptions } from '../src/llm/llm.js';
import { HermesServer } from '../src/server/server.js';

function makeProject(name: string): string {
  const dir = mkdtempSync(path.join(tmpdir(), `hermes-hardening-${name}-`));
  writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: `hardening-${name}`, scripts: { test: 'node --version' } }, null, 2));
  return dir;
}

async function initGitRepo(dir: string): Promise<string> {
  await gitExec(dir, ['init']);
  await gitExec(dir, ['add', '-A']);
  await gitExec(dir, ['-c', 'user.name=hardening', '-c', 'user.email=hardening@test.local', 'commit', '-m', 'initial']);
  return (await gitExec(dir, ['rev-parse', '--abbrev-ref', 'HEAD'])).trim();
}

async function waitFor<T>(fn: () => Promise<T | undefined> | T | undefined, timeoutMs = 20000): Promise<T> {
  const start = Date.now();
  for (;;) {
    const value = await fn();
    if (value !== undefined) return value;
    if (Date.now() - start > timeoutMs) throw new Error('waitFor timed out');
    await new Promise((r) => setTimeout(r, 100));
  }
}

/**
 * A model that answers only when the test opens its gate, so a run can be
 * observed while it is still executing instead of after it settled. A single
 * test cannot race the ledger binding this way.
 */
class GatedLlm implements LlmClient {
  readonly name = 'gated-mock';
  private openGate!: () => void;
  private readonly gate = new Promise<void>((resolve) => {
    this.openGate = resolve;
  });
  started = false;

  open(): void {
    this.openGate();
  }

  private answer(): string {
    return JSON.stringify({ action: { type: 'complete', summary: 'done', risks: [], followUps: [] } });
  }

  async complete(messages: LlmMessage[], _opts?: LlmOptions): Promise<string> {
    void messages;
    this.started = true;
    await this.gate;
    return this.answer();
  }

  async completeStream(messages: LlmMessage[], opts: LlmOptions, onDelta: LlmDeltaHandler): Promise<string> {
    const full = await this.complete(messages, opts);
    onDelta(full);
    return full;
  }
}

const COMPLETE_ONCE = (): string => JSON.stringify({ action: { type: 'complete', summary: 'acknowledged', risks: [], followUps: [] } });

describe('task ledger hardening — a run always owns a ledger', () => {
  const servers: HermesServer[] = [];

  afterAll(async () => {
    for (const server of servers) await server.stop();
  });

  async function startServer(dir: string, llm: LlmClient): Promise<string> {
    const server = new HermesServer({ passwordRequired: false, cwd: dir, port: 0, llm });
    servers.push(server);
    const port = await server.start();
    return `http://127.0.0.1:${port}`;
  }

  it('creates a ledger once and never rewrites it (write-once ensure)', () => {
    const dir = makeProject('ensure');
    const guard = ProjectGuard.detect(dir);

    const first = TaskLedger.ensure({ repoRoot: path.resolve(dir), goal: 'write once', project: guard.lock, mode: 'standard' });
    expect(first.created).toBe(true);
    first.ledger.setStatus('completed');
    first.ledger.addBlocker('durable state');

    const second = TaskLedger.ensure({
      repoRoot: path.resolve(dir),
      taskId: first.ledger.data.taskId,
      goal: 'a different goal',
      project: guard.lock,
      mode: 'standard',
    });
    expect(second.created).toBe(false);
    expect(second.ledger.data.taskId).toBe(first.ledger.data.taskId);
    expect(second.ledger.data.goal).toBe('write once');
    expect(second.ledger.data.status).toBe('completed');
    expect(second.ledger.data.blockers).toEqual(['durable state']);
    expect(TaskLedger.list(path.resolve(dir))).toHaveLength(1);
  });

  it('binds a task id to the session before the first model turn', async () => {
    const dir = makeProject('run-start');
    await initGitRepo(dir);
    const llm = new GatedLlm();
    const base = await startServer(dir, llm);

    const created = (await fetch(`${base}/api/runs`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ goal: 'hold the run open', mode: 'fast', review: false }),
    }).then((r) => r.json())) as { runId: string };

    const bound = await waitFor(async () => {
      const run = (await fetch(`${base}/api/runs/${created.runId}`).then((r) => r.json())) as { taskId?: string; status: string };
      return run.taskId ? run : undefined;
    });
    // The run is still executing: the ledger was reserved at run start, not
    // harvested from the engine's first event line.
    expect(bound.status).toBe('running');
    const ledger = TaskLedger.load(path.resolve(dir), bound.taskId!);
    expect(ledger).toBeDefined();
    expect(ledger?.data.goal).toBe('hold the run open');

    llm.open();
    await waitFor(() => (llm.started ? true : undefined));
    const finished = await waitFor(async () => {
      const run = (await fetch(`${base}/api/runs/${created.runId}`).then((r) => r.json())) as { status: string; taskId?: string };
      return run.status !== 'running' ? run : undefined;
    });
    expect(finished.taskId).toBe(bound.taskId);
    expect(TaskLedger.list(path.resolve(dir))).toHaveLength(1);
  }, 60000);
});
