import { existsSync, mkdtempSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { gitExec } from '../src/git/git.js';
import { ProjectGuard } from '../src/guard/project-guard.js';
import { TaskLedger } from '../src/ledger/task-ledger.js';
import { compareProjectIdentity, readProjectIdentity } from '../src/ledger/project-identity.js';
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
