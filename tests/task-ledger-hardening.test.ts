import { existsSync, mkdirSync, mkdtempSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { gitExec } from '../src/git/git.js';
import { ProjectGuard } from '../src/guard/project-guard.js';
import { TaskLedger } from '../src/ledger/task-ledger.js';
import { compareProjectIdentity, readProjectIdentity } from '../src/ledger/project-identity.js';
import { acquireTaskLock, readTaskLock, taskLockPath, TASK_LOCK_STALE_MS } from '../src/ledger/task-lock.js';
import { ScriptedMockLlm, type LlmClient, type LlmDeltaHandler, type LlmMessage, type LlmOptions } from '../src/llm/llm.js';
import { HermesServer } from '../src/server/server.js';
import { SessionStore } from '../src/server/session-store.js';
import { createProject } from '../src/workspace/home.js';

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

/**
 * Read a live session's transcript lines. The HTTP session view publishes state,
 * not the transcript, so a test that asserts on what the run told the user reads
 * the same in-memory rows the UI streams.
 */
function eventTexts(server: HermesServer, runId: string): string[] {
  const sessions = (server as unknown as { sessions: Map<string, { events: { text: string }[] }> }).sessions;
  return (sessions.get(runId)?.events ?? []).map((event) => event.text);
}

const ACKNOWLEDGE = (): string => JSON.stringify({ action: { type: 'complete', summary: 'acknowledged', chat: true } });

const COMPLETE_ONCE = (): string => JSON.stringify({ action: { type: 'complete', summary: 'acknowledged', risks: [], followUps: [] } });

describe('task ledger hardening — a run always owns a ledger', () => {
  const servers: HermesServer[] = [];

  afterAll(async () => {
    for (const server of servers) await server.stop();
  });

  async function startServer(dir: string, llm: LlmClient): Promise<{ base: string; server: HermesServer }> {
    const server = new HermesServer({ passwordRequired: false, cwd: dir, port: 0, llm });
    servers.push(server);
    const port = await server.start();
    return { base: `http://127.0.0.1:${port}`, server };
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
    const { base } = await startServer(dir, llm);

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

describe('task ledger hardening — identity-based resolution', () => {
  const servers: HermesServer[] = [];

  afterAll(async () => {
    for (const server of servers) await server.stop();
  });

  async function startServer(dir: string, llm: LlmClient): Promise<{ base: string; server: HermesServer }> {
    const server = new HermesServer({ passwordRequired: false, cwd: dir, port: 0, llm });
    servers.push(server);
    const port = await server.start();
    return { base: `http://127.0.0.1:${port}`, server };
  }

  it('identifies a project by content, so a rename does not change who it is', async () => {
    const original = makeProject('identity');
    await initGitRepo(original);
    const identity = readProjectIdentity(original);
    expect(identity.root).toBe(path.resolve(original));
    expect(identity.fingerprint).toMatch(/^root-commit:[0-9a-f]{40}$/);

    const moved = `${original}-moved`;
    renameSync(original, moved);
    expect(compareProjectIdentity(identity, moved)).toBe('match');

    // A different repository is provably not this project.
    const other = makeProject('identity-other');
    await initGitRepo(other);
    expect(compareProjectIdentity(identity, other)).toBe('mismatch');
  }, 60000);

  it('locates a moved ledger by identity and refuses a different project', async () => {
    const original = makeProject('locate');
    await initGitRepo(original);
    const guard = ProjectGuard.detect(original);
    const ledger = TaskLedger.create({ repoRoot: path.resolve(original), goal: 'moved task', project: guard.lock, mode: 'standard' });

    // A decoy project holding the same task id but a different history.
    const decoy = makeProject('locate-decoy');
    await initGitRepo(decoy);
    const decoyGuard = ProjectGuard.detect(decoy);
    TaskLedger.create({ repoRoot: path.resolve(decoy), goal: 'decoy', project: decoyGuard.lock, mode: 'standard', taskId: ledger.data.taskId });

    // The identity the task was recorded under outranks a duplicate task id.
    expect(TaskLedger.locate(ledger.data.taskId, [decoy], ledger.data.projectIdentity)).toBeUndefined();

    const moved = `${original}-moved`;
    renameSync(original, moved);
    const located = TaskLedger.locate(ledger.data.taskId, [path.resolve(decoy), path.resolve(moved)], ledger.data.projectIdentity);
    expect(located?.root).toBe(path.resolve(moved));
    expect(located?.previousRoot).toBe(path.resolve(original));
    expect(located?.identity).toBe('match');
  }, 60000);

  it('relocates a task whose recorded project path no longer exists instead of failing', async () => {
    const managed = createProject('moved-ledger-project');
    await initGitRepo(managed.path);
    const guard = ProjectGuard.detect(managed.path);
    const ledger = TaskLedger.create({ repoRoot: path.resolve(managed.path), goal: 'survive the move', project: guard.lock, mode: 'standard' });

    const elsewhere = makeProject('moved-ledger-cwd');
    new SessionStore().upsertSession({
      runId: 'run-moved-project',
      taskId: ledger.data.taskId,
      goal: 'survive the move',
      project: 'moved-ledger-project',
      projectPath: path.resolve(managed.path),
      startedAt: new Date().toISOString(),
      status: 'blocked',
      mode: 'standard',
    });

    // Everything the task recorded moves with the folder; the old path is gone.
    const movedPath = `${managed.path}-relocated`;
    renameSync(managed.path, movedPath);

    const { base, server } = await startServer(elsewhere, new ScriptedMockLlm([COMPLETE_ONCE]));
    const res = await fetch(`${base}/api/runs/run-moved-project/message`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text: 'continue' }),
    });
    expect(res.status).toBe(200);
    expect(((await res.json()) as { resumed: boolean }).resumed).toBe(true);

    const done = await waitFor(async () => {
      const session = (await fetch(`${base}/api/runs/run-moved-project`).then((r) => r.json())) as { status: string; projectPath?: string };
      return session.status !== 'running' ? session : undefined;
    });
    expect(done.projectPath).toBe(path.resolve(movedPath));
    expect(eventTexts(server, 'run-moved-project').some((line) => line.includes('ledger   relocated'))).toBe(true);

    const relocated = TaskLedger.load(path.resolve(movedPath), ledger.data.taskId);
    expect(relocated?.data.project.repoRoot).toBe(path.resolve(movedPath));
    expect(relocated?.data.projectIdentity?.root).toBe(path.resolve(movedPath));
    expect(relocated?.data.projectIdentity?.relocatedFrom).toBe(path.resolve(managed.path));
    // The stale copy of the coordinate is gone, and no second task appeared.
    expect(existsSync(path.join(managed.path, '.hermes', 'tasks'))).toBe(false);
    expect(TaskLedger.list(path.resolve(movedPath))).toHaveLength(1);
  }, 60000);
});

describe('task ledger hardening — self-heal instead of refusing', () => {
  const servers: HermesServer[] = [];

  afterAll(async () => {
    for (const server of servers) await server.stop();
  });

  async function startServer(dir: string, llm: LlmClient): Promise<{ base: string; server: HermesServer }> {
    const server = new HermesServer({ passwordRequired: false, cwd: dir, port: 0, llm });
    servers.push(server);
    const port = await server.start();
    return { base: `http://127.0.0.1:${port}`, server };
  }

  it('rebuilds a lost ledger from session metadata, says so, and continues the run', async () => {
    const dir = makeProject('self-heal');
    await initGitRepo(dir);
    const guard = ProjectGuard.detect(dir);
    const ledger = TaskLedger.create({ repoRoot: path.resolve(dir), goal: 'recover this task', project: guard.lock, mode: 'standard' });
    const taskId = ledger.data.taskId;

    // The ledger file is gone: a crash mid-write, a cleaned checkout, a bad sync.
    rmSync(path.join(dir, '.hermes', 'tasks', `${taskId}.json`));
    expect(TaskLedger.load(path.resolve(dir), taskId)).toBeUndefined();

    new SessionStore().upsertSession({
      runId: 'run-self-heal',
      taskId,
      goal: 'recover this task',
      project: 'self-heal',
      projectPath: path.resolve(dir),
      startedAt: new Date().toISOString(),
      status: 'blocked',
      mode: 'standard',
    });

    const { base, server } = await startServer(dir, new ScriptedMockLlm([COMPLETE_ONCE]));
    const res = await fetch(`${base}/api/runs/run-self-heal/message`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text: 'continue' }),
    });
    expect(res.status).toBe(200);
    expect(((await res.json()) as { resumed: boolean }).resumed).toBe(true);

    const done = await waitFor(async () => {
      const session = (await fetch(`${base}/api/runs/run-self-heal`).then((r) => r.json())) as { status: string; recovered?: boolean };
      return session.status !== 'running' ? session : undefined;
    });
    expect(done.recovered).toBe(true);
    expect(eventTexts(server, 'run-self-heal').some((line) => line.includes('ledger   recovered'))).toBe(true);

    const rebuilt = TaskLedger.load(path.resolve(dir), taskId);
    expect(rebuilt?.data.taskId).toBe(taskId);
    expect(rebuilt?.data.recovered).toBe(true);
    expect(rebuilt?.data.recoveredAt).toBeTruthy();
    // The rebuild records what it was based on, without inventing history.
    expect(rebuilt?.data.recoveryNote).toContain('lastCommit=');
    expect(rebuilt?.data.recoveryNote).toContain(`branch=${guard.lock.branch ?? 'master'}`);
    expect(rebuilt?.data.acceptanceCriteria).toEqual([]);
    expect(TaskLedger.list(path.resolve(dir))).toHaveLength(1);
  }, 60000);
});

describe('task ledger hardening — worktree revalidation', () => {
  const servers: HermesServer[] = [];

  afterAll(async () => {
    for (const server of servers) await server.stop();
  });

  async function startServer(dir: string, llm: LlmClient): Promise<{ base: string; server: HermesServer }> {
    const server = new HermesServer({ passwordRequired: false, cwd: dir, port: 0, llm });
    servers.push(server);
    const port = await server.start();
    return { base: `http://127.0.0.1:${port}`, server };
  }

  function seedSession(runId: string, taskId: string, dir: string, goal: string): void {
    new SessionStore().upsertSession({
      runId,
      taskId,
      goal,
      project: 'worktree-revalidation',
      projectPath: path.resolve(dir),
      startedAt: new Date().toISOString(),
      status: 'blocked',
      mode: 'standard',
    });
  }

  it('re-creates a recorded worktree that exists but is on the wrong branch', async () => {
    const dir = makeProject('stale-worktree');
    await initGitRepo(dir);
    const guard = ProjectGuard.detect(dir);
    const staleDir = path.join(dir, '..', `stale-checkout-${Date.now().toString(36)}`);
    mkdirSync(staleDir, { recursive: true });

    const ledger = TaskLedger.create({
      repoRoot: path.resolve(dir),
      goal: 'worktree task',
      project: guard.lock,
      mode: 'standard',
      gitBranch: 'gitu/stale-worktree',
      worktreePath: staleDir,
    });
    // The branch exists, but the recorded directory was never checked out on it.
    await gitExec(dir, ['branch', 'gitu/stale-worktree']);
    seedSession('run-stale-worktree', ledger.data.taskId, dir, 'worktree task');

    const { base, server } = await startServer(dir, new ScriptedMockLlm([COMPLETE_ONCE]));
    const res = await fetch(`${base}/api/runs/run-stale-worktree/message`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text: 'continue' }),
    });
    expect(res.status).toBe(200);

    const done = await waitFor(async () => {
      const session = (await fetch(`${base}/api/runs/run-stale-worktree`).then((r) => r.json())) as { status: string; worktreePath?: string };
      return session.status !== 'running' ? session : undefined;
    });
    expect(done.worktreePath).toBeDefined();
    expect(done.worktreePath).not.toBe(staleDir);
    // The replacement really is a checkout of this repository, not an empty dir.
    expect(existsSync(path.join(done.worktreePath!, '.git'))).toBe(true);
    expect((await gitExec(done.worktreePath!, ['rev-parse', '--show-toplevel'])).trim()).toBe(path.resolve(done.worktreePath!));
    expect(eventTexts(server, 'run-stale-worktree').some((line) => line.includes('git     re-created the session worktree'))).toBe(true);

    const reloaded = TaskLedger.load(path.resolve(dir), ledger.data.taskId);
    expect(reloaded?.data.worktreePath).toBe(done.worktreePath);
    rmSync(staleDir, { recursive: true, force: true });
  }, 60000);

  it('never downgrades silently: a lost worktree on the shared branch says so out loud', async () => {
    const dir = makeProject('downgrade');
    const sharedBranch = await initGitRepo(dir);
    const guard = ProjectGuard.detect(dir);
    const missing = path.join(dir, '..', `lost-worktree-${Date.now().toString(36)}`);

    const ledger = TaskLedger.create({
      repoRoot: path.resolve(dir),
      goal: 'downgrade task',
      project: guard.lock,
      mode: 'standard',
      gitBranch: sharedBranch,
      worktreePath: missing,
    });
    seedSession('run-downgrade', ledger.data.taskId, dir, 'downgrade task');

    const { base, server } = await startServer(dir, new ScriptedMockLlm([COMPLETE_ONCE]));
    const res = await fetch(`${base}/api/runs/run-downgrade/message`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text: 'continue' }),
    });
    expect(res.status).toBe(200);

    const done = await waitFor(async () => {
      const session = (await fetch(`${base}/api/runs/run-downgrade`).then((r) => r.json())) as { status: string; worktreePath?: string };
      return session.status !== 'running' ? session : undefined;
    });
    // The run continues in the shared checkout, and the transcript says why.
    expect(done.worktreePath).toBeUndefined();
    expect(eventTexts(server, 'run-downgrade').some((line) => line.includes('isolation unavailable'))).toBe(true);
    const reloaded = TaskLedger.load(path.resolve(dir), ledger.data.taskId);
    expect(reloaded?.data.worktreePath).toBeUndefined();
  }, 60000);
});

describe('task ledger hardening — concurrent resume guard', () => {
  const servers: HermesServer[] = [];

  afterAll(async () => {
    for (const server of servers) await server.stop();
  });

  async function startServer(dir: string, llm: LlmClient): Promise<{ base: string; server: HermesServer }> {
    const server = new HermesServer({ passwordRequired: false, cwd: dir, port: 0, llm });
    servers.push(server);
    const port = await server.start();
    return { base: `http://127.0.0.1:${port}`, server };
  }

  it('refuses a second holder, then succeeds once the lock is stale', () => {
    const dir = makeProject('lock-unit');
    const started = 1_000_000;
    const first = acquireTaskLock({ repoRoot: dir, taskId: 'task-lock', runId: 'run-a', pid: 111, now: started });
    expect(first.ok).toBe(true);
    expect(readTaskLock(dir, 'task-lock')).toMatchObject({ runId: 'run-a', pid: 111 });

    // A second resume, one minute later, is refused with an actionable message.
    const second = acquireTaskLock({ repoRoot: dir, taskId: 'task-lock', runId: 'run-b', pid: 222, now: started + 60_000 });
    expect(second.ok).toBe(false);
    if (!second.ok) {
      expect(second.refusal.held.runId).toBe('run-a');
      expect(second.refusal.message).toContain('already being resumed by run run-a');
      expect(second.refusal.message).toContain('pid 111');
      expect(second.refusal.message).toContain('retry');
    }
    // The refused attempt did not touch the holder's lock.
    expect(readTaskLock(dir, 'task-lock')?.runId).toBe('run-a');

    // The same run continuing is not a conflict.
    expect(acquireTaskLock({ repoRoot: dir, taskId: 'task-lock', runId: 'run-a', now: started + 120_000 }).ok).toBe(true);

    // Once the window has passed, an abandoned lock can be taken over.
    const takeover = acquireTaskLock({ repoRoot: dir, taskId: 'task-lock', runId: 'run-b', pid: 222, now: started + 120_000 + TASK_LOCK_STALE_MS + 1 });
    expect(takeover.ok).toBe(true);
    if (takeover.ok) {
      expect(takeover.lock.takenOver).toBe(true);
      // The old owner must not be able to free the lock it no longer holds.
      if (first.ok) first.lock.release();
      expect(readTaskLock(dir, 'task-lock')?.runId).toBe('run-b');
      takeover.lock.release();
      expect(readTaskLock(dir, 'task-lock')).toBeUndefined();
      expect(existsSync(taskLockPath(dir, 'task-lock'))).toBe(false);
    }
  });

  it('blocks a second concurrent resume and lets it through after the lock goes stale', async () => {
    const dir = makeProject('lock-http');
    await initGitRepo(dir);
    const guard = ProjectGuard.detect(dir);
    const ledger = TaskLedger.create({ repoRoot: path.resolve(dir), goal: 'resume once', project: guard.lock, mode: 'standard' });
    const taskId = ledger.data.taskId;

    // Another live run already holds this task.
    const holder = acquireTaskLock({ repoRoot: path.resolve(dir), taskId, runId: 'run-holder', pid: 4321 });
    expect(holder.ok).toBe(true);

    new SessionStore().upsertSession({
      runId: 'run-contender',
      taskId,
      goal: 'resume once',
      project: 'lock-http',
      projectPath: path.resolve(dir),
      startedAt: new Date().toISOString(),
      status: 'blocked',
      mode: 'standard',
    });

    const { base, server } = await startServer(dir, new ScriptedMockLlm([ACKNOWLEDGE]));
    const blocked = await fetch(`${base}/api/runs/run-contender/message`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text: 'continue' }),
    });
    expect(blocked.status).toBe(409);
    const blockedBody = (await blocked.json()) as { error: string; taskLock: { runId: string; pid: number } };
    expect(blockedBody.error).toContain('already being resumed by run run-holder');
    expect(blockedBody.taskLock).toMatchObject({ runId: 'run-holder', pid: 4321 });
    // Nothing ran, and the ledger was not rewritten by the refused attempt.
    expect(TaskLedger.load(path.resolve(dir), taskId)?.data.status).toBe('intake');
    expect(readTaskLock(path.resolve(dir), taskId)?.runId).toBe('run-holder');

    // Age the lock past the staleness window: now the same resume is allowed.
    const stale = Date.now() - TASK_LOCK_STALE_MS - 60_000;
    writeFileSync(
      taskLockPath(path.resolve(dir), taskId),
      JSON.stringify({ taskId, runId: 'run-holder', pid: 4321, startedAt: new Date(stale).toISOString(), startedAtMs: stale, staleAfterMs: TASK_LOCK_STALE_MS }, null, 2),
    );
    const allowed = await fetch(`${base}/api/runs/run-contender/message`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text: 'continue' }),
    });
    expect(allowed.status).toBe(200);
    expect(((await allowed.json()) as { resumed: boolean }).resumed).toBe(true);

    const done = await waitFor(async () => {
      const session = (await fetch(`${base}/api/runs/run-contender`).then((r) => r.json())) as { status: string; error?: string };
      return session.status !== 'running' ? session : undefined;
    });
    expect(done.status).toBe('completed');
    expect(eventTexts(server, 'run-contender').some((line) => line.includes('took over an abandoned resume lock'))).toBe(true);
    // The finished run released the lock it took over.
    expect(readTaskLock(path.resolve(dir), taskId)).toBeUndefined();
  }, 60000);
});
