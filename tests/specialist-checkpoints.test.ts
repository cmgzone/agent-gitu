import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { Hermes } from '../src/agent/gitu.js';
import { SubAgentRunner } from '../src/agent/subagent.js';
import { SpecialistCheckpointStore } from '../src/agent/specialist-checkpoints.js';
import { gitExec } from '../src/git/git.js';
import { LlmError, type LlmClient, type LlmMessage, type LlmOptions } from '../src/llm/llm.js';

const projects: string[] = [];

afterEach(() => {
  // DatabaseSync keeps the file handle open for the worker lifetime on
  // Windows. These are isolated temp fixtures, so cleanup is best-effort.
  for (const project of projects.splice(0)) {
    try {
      rmSync(project, { recursive: true, force: true });
    } catch {
      /* released automatically with the Vitest worker */
    }
  }
});

function makeProject(): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'hermes-specialist-checkpoint-'));
  projects.push(dir);
  writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: 'specialist-checkpoint-test' }));
  mkdirSync(path.join(dir, 'src'), { recursive: true });
  writeFileSync(path.join(dir, 'src', 'api.ts'), "export const api = 'old';\n");
  writeFileSync(path.join(dir, 'src', 'App.tsx'), "export const app = 'old';\n");
  return dir;
}

async function initGitRepo(dir: string): Promise<void> {
  await gitExec(dir, ['init']);
  await gitExec(dir, ['add', '-A']);
  await gitExec(dir, ['-c', 'user.name=checkpoint-test', '-c', 'user.email=checkpoint@test.local', 'commit', '-m', 'initial']);
}

function llm(steps: Array<() => string | Promise<string>>): LlmClient {
  let call = 0;
  return {
    name: 'checkpoint-test-llm',
    async complete(_messages: LlmMessage[], _opts?: LlmOptions): Promise<string> {
      const step = steps[Math.min(call++, steps.length - 1)]!;
      return step();
    },
    async completeStream(messages: LlmMessage[], opts: LlmOptions, onDelta: (delta: string) => void): Promise<string> {
      const reply = await this.complete(messages, opts);
      onDelta(reply);
      return reply;
    },
  };
}

function runner(dir: string, model: LlmClient): SubAgentRunner {
  return new SubAgentRunner({
    cwd: dir,
    isolate: true,
    resolveLlm: () => model,
    agentRole: () => 'API specialist',
  });
}

const writeApi = () =>
  JSON.stringify({
    action: { type: 'tool_call', tool: 'write_file', params: { path: 'src/api.ts', content: "export const api = 'new';\n" }, reason: 'implement API', expected: 'API updated' },
  });

const editApp = () =>
  JSON.stringify({
    action: {
      type: 'tool_call',
      tool: 'apply_edit',
      params: { path: 'src/App.tsx', oldString: "export const app = 'old';\n", newString: "export const app = 'new';\n" },
      reason: 'wire API',
      expected: 'App updated',
    },
  });

const modelFailure = () => {
  throw new LlmError('provider transport ended', { kind: 'auth' });
};

describe('durable specialist checkpoint recovery', () => {
  it('persists verified edits, rediscovers them after restart, and resumes the same logical job', async () => {
    const dir = makeProject();
    await initGitRepo(dir);

    const first = await runner(dir, llm([writeApi, editApp, modelFailure])).runOne('api-worker', 'update API and application wiring');
    expect(first.stopReason).toBe('model_transport_failure');
    expect(first.resumableJobId).toBeTruthy();
    expect(first.resumeState).toBe('RESUME_WITH_CHANGES');

    const store = new SpecialistCheckpointStore(dir);
    const checkpoint = store.get(first.resumableJobId!);
    expect(checkpoint?.changedFiles).toEqual(['src/App.tsx', 'src/api.ts']);
    expect(checkpoint?.resumeStatus).toBe('RESUME_WITH_CHANGES');
    expect(checkpoint?.executionAttempt).toBe(1);
    expect(checkpoint?.worktreePath && existsSync(checkpoint.worktreePath)).toBe(true);

    // A fresh runner is an app/process restart: no in-memory Maps are reused.
    const restarted = runner(dir, llm([() => JSON.stringify({ action: { type: 'answer', summary: 'completed recovered work' } })]));
    expect(restarted.status([first.resumableJobId!])[0]?.logicalJobId).toBe(first.resumableJobId);
    // Explicitly wake the checkpoint; a new task must not be allocated.
    const resumed = await runner(dir, llm([() => JSON.stringify({ action: { type: 'answer', summary: 'completed recovered work' } })])).runMany([
      { agent: 'api-worker', task: 'update API and application wiring', resume: { jobId: first.resumableJobId! } },
    ]);
    const recovered = resumed[0]!;
    expect(recovered.ok).toBe(true);
    expect(recovered.logicalJobId).toBe(first.resumableJobId);
    expect(recovered.executionAttempt).toBe(2);
    expect(recovered.resumeState).toBe('RESUME_WITH_CHANGES');
    expect(readFileSync(path.join(dir, 'src', 'api.ts'), 'utf8')).toContain("'new'");
    expect(readFileSync(path.join(dir, 'src', 'App.tsx'), 'utf8')).toContain("'new'");
  }, 30_000);

  it('marks a transport failure before edits as context-only and never claims files were recovered', async () => {
    const dir = makeProject();
    await initGitRepo(dir);

    const result = await runner(dir, llm([modelFailure])).runOne('api-worker', 'update API and application wiring');
    const checkpoint = new SpecialistCheckpointStore(dir).get(result.resumableJobId!);
    expect(result.stopReason).toBe('model_transport_failure');
    expect(result.resumeState).toBe('RESUME_CONTEXT_ONLY');
    expect(result.summary).toContain('RESUME CONTEXT ONLY');
    expect(result.summary).not.toContain('DURABLE CHANGES VERIFIED');
    expect(checkpoint?.changedFiles).toEqual([]);
    expect(checkpoint?.resumeStatus).toBe('RESUME_CONTEXT_ONLY');
  }, 30_000);

  it('fails closed when a persisted checkpoint no longer matches its branch/worktree', async () => {
    const dir = makeProject();
    await initGitRepo(dir);
    const first = await runner(dir, llm([writeApi, modelFailure])).runOne('api-worker', 'update API and application wiring');
    const checkpoint = new SpecialistCheckpointStore(dir).get(first.resumableJobId!);
    expect(checkpoint?.worktreePath).toBeTruthy();
    unlinkSync(path.join(checkpoint!.worktreePath, 'src', 'api.ts'));

    const [recovered] = await runner(dir, llm([() => JSON.stringify({ action: { type: 'answer', summary: 'must not run' } })])).runMany([
      { agent: 'api-worker', task: 'update API and application wiring', resume: { jobId: first.resumableJobId! } },
    ]);
    expect(recovered?.ok).toBe(false);
    expect(recovered?.resumeState).toBe('RESUME_CHECKPOINT_DIVERGED');
    expect(recovered?.summary).toContain('did not start from a clean baseline');
    expect(recovered?.summary).not.toContain('DURABLE CHANGES VERIFIED');
  }, 30_000);

  it('recovers Git-verified edits written after the last checkpoint instead of restarting', async () => {
    const dir = makeProject();
    await initGitRepo(dir);
    const first = await runner(dir, llm([modelFailure])).runOne('api-worker', 'update API and application wiring');
    const checkpoint = new SpecialistCheckpointStore(dir).get(first.resumableJobId!);
    expect(checkpoint?.resumeStatus).toBe('RESUME_CONTEXT_ONLY');

    // This represents an abrupt stop between an editor write and the next
    // checkpoint. The worktree is isolated, so Git can identify the edit.
    writeFileSync(path.join(checkpoint!.worktreePath, 'src', 'api.ts'), "export const api = 'recovered';\n");
    const [recovered] = await runner(dir, llm([() => JSON.stringify({ action: { type: 'answer', summary: 'finished uncheckpointed work' } })])).runMany([
      { agent: 'api-worker', task: 'update API and application wiring', resume: { jobId: first.resumableJobId! } },
    ]);

    expect(recovered?.ok).toBe(true);
    expect(recovered?.resumeState).toBe('RESUME_WITH_UNCHECKPOINTED_CHANGES');
    expect(readFileSync(path.join(dir, 'src', 'api.ts'), 'utf8')).toContain("'recovered'");
  }, 30_000);

  it('records the edit before a live attempt can be interrupted', async () => {
    const dir = makeProject();
    await initGitRepo(dir);
    const waiting = llm([
      writeApi,
      () => new Promise<string>(() => {}),
    ]);
    const active = runner(dir, waiting);
    const [job] = active.startMany([{ agent: 'api-worker', task: 'update API and application wiring' }]);
    const store = new SpecialistCheckpointStore(dir);
    let checkpoint = store.get(job!.id);
    for (let attempt = 0; attempt < 80 && checkpoint?.changedFiles.length !== 1; attempt++) {
      await new Promise((resolve) => setTimeout(resolve, 25));
      checkpoint = store.get(job!.id);
    }
    expect(checkpoint?.changedFiles).toEqual(['src/api.ts']);
    expect(checkpoint?.resumeStatus).toBe('RESUME_WITH_CHANGES');
    active.stop('simulated process interruption');
    await active.waitFor([job!.id]);
  }, 30_000);

  it('preserves committed work in a recovery file when SQLite checkpoints fail mid-run', async () => {
    const dir = makeProject();
    await initGitRepo(dir);
    const unstable = runner(dir, llm([writeApi, modelFailure]));
    type RunnerInternals = { persistCheckpoint: (input: Record<string, unknown>) => Promise<unknown> };
    const internal = unstable as unknown as RunnerInternals;
    const persistNormally = internal.persistCheckpoint.bind(unstable);
    let writes = 0;
    internal.persistCheckpoint = async (input) => {
      writes += 1;
      // Let initial worktree registration succeed, then simulate a transient
      // checkpoint database outage after the specialist has committed work.
      if (writes > 1) throw new Error('simulated SQLite busy');
      return persistNormally(input);
    };

    const paused = await unstable.runOne('api-worker', 'update API and application wiring');
    expect(paused.resumableJobId).toBeTruthy();
    expect(paused.resumeState).toBe('RESUME_WITH_CHANGES');
    const fallbackDir = path.join(dir, '.hermes', 'specialist-recovery');
    expect(existsSync(fallbackDir)).toBe(true);

    // A fresh runner represents an application restart. It imports the
    // emergency record even though an earlier SQLite row still exists.
    const [resumed] = await runner(dir, llm([() => JSON.stringify({ action: { type: 'answer', summary: 'merged recovered API work' } })])).runMany([
      { agent: 'api-worker', task: 'update API and application wiring', resume: { jobId: paused.resumableJobId! } },
    ]);
    expect(resumed?.ok).toBe(true);
    expect(resumed?.resumeState).toBe('RESUME_WITH_CHANGES');
    expect(readFileSync(path.join(dir, 'src', 'api.ts'), 'utf8')).toContain("'new'");
    expect(existsSync(fallbackDir)).toBe(false);
  }, 30_000);

  it('reuses the logical specialist allocation when a recovered job is delegated again', async () => {
    const dir = makeProject();
    await initGitRepo(dir);
    const failed = await runner(dir, llm([writeApi, modelFailure])).runOne('api-worker', 'update API and application wiring');
    const events: string[] = [];
    const specialists = runner(
      dir,
      llm([
        () => JSON.stringify({ action: { type: 'answer', summary: 'recovered' } }),
        () => JSON.stringify({ action: { type: 'answer', summary: 'fresh review' } }),
      ]),
    );
    const main = llm([
      () => JSON.stringify({ action: { type: 'set_criteria', criteria: ['specialist recovery is tracked'] } }),
      () => JSON.stringify({ action: { type: 'set_plan', steps: [{ description: 'recover then review', verification: 'n/a' }] } }),
      () => JSON.stringify({ action: { type: 'delegate', tasks: [{ agent: 'api-worker', task: 'update API and application wiring', resume: { jobId: failed.resumableJobId } }] } }),
      () => JSON.stringify({ action: { type: 'delegate', tasks: [{ agent: 'api-worker', task: 'perform a fresh review' }] } }),
      () => JSON.stringify({ action: { type: 'request_block', reason: 'done checking allocation' } }),
    ]);
    await new Hermes({ cwd: dir, llm: main, mode: 'fast', effort: 'low', subagents: specialists, onEvent: (event) => events.push(event) }).run('recover a paused specialist');

    expect(events.some((event) => event.includes('0/1 new specialist slots used; 1 resume(s) reused'))).toBe(true);
    expect(events.some((event) => event.includes('1/1 new specialist slots used'))).toBe(true);
  }, 30_000);
});
