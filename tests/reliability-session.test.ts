import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { gitExec } from '../src/git/git.js';
import { ProjectGuard } from '../src/guard/project-guard.js';
import { TaskLedger } from '../src/ledger/task-ledger.js';
import { ScriptedMockLlm } from '../src/llm/llm.js';
import { HermesServer } from '../src/server/server.js';
import { SessionStore } from '../src/server/session-store.js';

function makeProject(name: string): string {
  const dir = mkdtempSync(path.join(tmpdir(), `hermes-rsess-${name}-`));
  writeFileSync(
    path.join(dir, 'package.json'),
    JSON.stringify({ name: `rsess-${name}`, scripts: { test: 'node --version' } }, null, 2),
  );
  return dir;
}

async function initGitRepo(dir: string): Promise<void> {
  await gitExec(dir, ['init']);
  await gitExec(dir, ['add', '-A']);
  await gitExec(dir, ['-c', 'user.name=rsess', '-c', 'user.email=rsess@test.local', 'commit', '-m', 'initial']);
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

const BUILD_SCRIPT = new ScriptedMockLlm([
  () => JSON.stringify({ action: { type: 'set_criteria', criteria: ['verification command passes'] } }),
  () => JSON.stringify({ action: { type: 'set_plan', steps: [{ description: 'verify', verification: 'node --version' }] } }),
  () =>
    JSON.stringify({
      action: { type: 'tool_call', stepId: 'step-1', tool: 'run_command', params: { command: 'node --version' }, reason: 'verify', expected: 'exit 0' },
    }),
  (_n, messages) => {
    const text = messages.map((m) => m.content).join('\n');
    const evId = (text.match(/(ev-\d{8}-[0-9a-f]{6})/) ?? [])[1] ?? 'ev-x';
    return JSON.stringify({ action: { type: 'claim_criterion', criterionId: 'ac-1', evidenceId: evId } });
  },
  () => JSON.stringify({ action: { type: 'complete', summary: 'verified', risks: [], followUps: [] } }),
]);

describe('HermesServer — session ↔ task ↔ git attachment (P0.1)', () => {
  const servers: HermesServer[] = [];

  afterAll(async () => {
    for (const s of servers) await s.stop();
  });

  async function startServer(dir: string, llm: ScriptedMockLlm): Promise<{ base: string; server: HermesServer }> {
    const server = new HermesServer({ cwd: dir, port: 0, llm });
    servers.push(server);
    const port = await server.start();
    return { base: `http://127.0.0.1:${port}`, server };
  }

  it('binds session → taskId → ledger → branch and continues on the same task after restart', async () => {
    const dir = makeProject('attach');
    await initGitRepo(dir);

    const first = await startServer(dir, BUILD_SCRIPT);
    const created = await fetch(`${first.base}/api/runs`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ goal: 'Verify node works', mode: 'fast', review: false }),
    }).then((r) => r.json());

    const finished = await waitFor(async () => {
      const s = await fetch(`${first.base}/api/runs/${created.runId}`).then((r) => r.json());
      return s.status !== 'running' ? s : undefined;
    });
    expect(finished.status).toBe('completed');
    expect(finished.taskId).toMatch(/^hermes-task-/);

    // The task ledger on disk is bound to the git branch.
    const ledgerOnDisk = TaskLedger.load(path.resolve(dir), finished.taskId);
    expect(ledgerOnDisk?.data.gitBranch).toBe(`hermes/${finished.taskId}`);
    expect(finished.branch).toBe(`hermes/${finished.taskId}`);

    // Restart the server: the session is restored from the store, and the
    // branch is recovered from the ledger.
    await first.server.stop();
    const second = await startServer(dir, new ScriptedMockLlm([() => JSON.stringify({ action: { type: 'complete', summary: 'acknowledged', chat: true } })]));
    const restored = await fetch(`${second.base}/api/runs/${created.runId}`).then((r) => r.json());
    expect(restored.taskId).toBe(finished.taskId);
    expect(restored.branch).toBe(`hermes/${finished.taskId}`);

    // The continuation resumes the SAME task — no new task is created.
    const resumed = await fetch(`${second.base}/api/runs/${created.runId}/message`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text: 'continue' }),
    }).then((r) => r.json());
    expect(resumed.resumed).toBe(true);

    const done = await waitFor(async () => {
      const s = await fetch(`${second.base}/api/runs/${created.runId}`).then((r) => r.json());
      return s.status !== 'running' ? s : undefined;
    });
    expect(done.status).toBe('completed');
    const afterContinue = await fetch(`${second.base}/api/tasks/${finished.taskId}`).then((r) => r.json());
    expect(afterContinue.taskId).toBe(finished.taskId);
    expect(afterContinue.gitBranch).toBe(`hermes/${finished.taskId}`);
    expect(TaskLedger.list(path.resolve(dir))).toHaveLength(1);
  }, 60000);

  it('restores branch and worktree from the ledger after restart', async () => {
    const dir = makeProject('worktree-restore');
    const guard = ProjectGuard.detect(dir);
    const bogusWorktree = path.join(dir, '..', 'hermes-wt-missing');
    const ledger = TaskLedger.create({
      repoRoot: path.resolve(dir),
      goal: 'worktree task',
      project: guard.lock,
      mode: 'standard',
      gitBranch: 'hermes/restored-task',
      worktreePath: bogusWorktree,
    });

    // Seed a durable session that predates the branch/worktree fields.
    const store = new SessionStore();
    store.upsertSession({
      runId: 'run-worktree-restore',
      taskId: ledger.data.taskId,
      goal: 'worktree task',
      project: 'wt-restore',
      projectPath: path.resolve(dir),
      startedAt: new Date().toISOString(),
      status: 'blocked',
      mode: 'standard',
      finishedAt: new Date().toISOString(),
      report: { taskId: ledger.data.taskId, goal: 'worktree task', status: 'blocked', summary: 'interrupted', changes: [], filesChanged: [], verification: [], evidence: [], remainingRisks: [], followUps: [], generatedAt: new Date().toISOString() },
    });

    const { base } = await startServer(dir, new ScriptedMockLlm([]));
    const restored = await fetch(`${base}/api/runs/run-worktree-restore`).then((r) => r.json());
    expect(restored.taskId).toBe(ledger.data.taskId);
    expect(restored.branch).toBe('hermes/restored-task');
    expect(restored.worktreePath).toBe(bogusWorktree);
  }, 30000);

  it('rejects continuation when the task points at a missing worktree (409, no orphan)', async () => {
    const dir = makeProject('missing-wt');
    const guard = ProjectGuard.detect(dir);
    const missing = path.join(dir, '..', 'does-not-exist-worktree');
    const ledger = TaskLedger.create({
      repoRoot: path.resolve(dir),
      goal: 'bound to a worktree',
      project: guard.lock,
      mode: 'standard',
      gitBranch: 'hermes/missing-wt',
      worktreePath: missing,
    });
    new SessionStore().upsertSession({
      runId: 'run-missing-wt',
      taskId: ledger.data.taskId,
      goal: 'bound to a worktree',
      project: 'missing-wt',
      projectPath: path.resolve(dir),
      startedAt: new Date().toISOString(),
      status: 'blocked',
      mode: 'standard',
    });

    const { base } = await startServer(dir, new ScriptedMockLlm([]));
    const res = await fetch(`${base}/api/runs/run-missing-wt/message`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text: 'resume' }),
    });
    expect(res.status).toBe(409);
    const body = (await res.json()) as { error: string };
    expect(body.error).toContain('Execution rejected');
    expect(body.error).toContain('Environment path mismatch');
    // No silent new task was created.
    expect(TaskLedger.list(path.resolve(dir))).toHaveLength(1);
  }, 30000);

  it('rejects continuation on git branch mismatch (409, no orphan)', async () => {
    const dir = makeProject('branch-mismatch');
    await initGitRepo(dir);
    const guard = ProjectGuard.detect(dir);
    // Task bound to a branch the working tree is NOT on.
    const ledger = TaskLedger.create({
      repoRoot: path.resolve(dir),
      goal: 'bound to another branch',
      project: guard.lock,
      mode: 'standard',
      gitBranch: 'hermes/some-other-task',
    });
    new SessionStore().upsertSession({
      runId: 'run-branch-mismatch',
      taskId: ledger.data.taskId,
      goal: 'bound to another branch',
      project: 'branch-mismatch',
      projectPath: path.resolve(dir),
      startedAt: new Date().toISOString(),
      status: 'blocked',
      mode: 'standard',
    });

    const { base } = await startServer(dir, new ScriptedMockLlm([]));
    const res = await fetch(`${base}/api/runs/run-branch-mismatch/message`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text: 'resume' }),
    });
    expect(res.status).toBe(409);
    const body = (await res.json()) as { error: string };
    expect(body.error).toContain('Execution rejected');
    expect(body.error).toContain('Branch mismatch');
    expect(TaskLedger.list(path.resolve(dir))).toHaveLength(1);
  }, 30000);

  it('rejects continuation with no task binding at all (409, no orphan)', async () => {
    const dir = makeProject('no-task');
    new SessionStore().upsertSession({
      runId: 'run-no-task',
      goal: 'never created a task',
      project: 'no-task',
      projectPath: path.resolve(dir),
      startedAt: new Date().toISOString(),
      status: 'blocked',
      mode: 'standard',
    });

    const { base } = await startServer(dir, new ScriptedMockLlm([]));
    const res = await fetch(`${base}/api/runs/run-no-task/message`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text: 'resume' }),
    });
    expect(res.status).toBe(409);
    const body = (await res.json()) as { error: string };
    expect(body.error).toContain('run has no task yet');
    expect(TaskLedger.list(path.resolve(dir))).toHaveLength(0);
  }, 30000);

  it('rejects continuation when the task ledger is gone (404, no silent new task)', async () => {
    const dir = makeProject('orphan');
    new SessionStore().upsertSession({
      runId: 'run-orphan',
      taskId: 'hermes-task-20990101-deadbe',
      goal: 'ledger deleted',
      project: 'orphan',
      projectPath: path.resolve(dir),
      startedAt: new Date().toISOString(),
      status: 'blocked',
      mode: 'standard',
    });

    const { base } = await startServer(dir, new ScriptedMockLlm([]));
    const res = await fetch(`${base}/api/runs/run-orphan/message`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text: 'resume' }),
    });
    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: string };
    expect(body.error).toContain('Task ledger');
    expect(TaskLedger.list(path.resolve(dir))).toHaveLength(0);
  }, 30000);
});
