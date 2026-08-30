import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { SubAgentRunner } from '../src/agent/subagent.js';
import { gitExec } from '../src/git/git.js';
import type { LlmClient, LlmMessage, LlmOptions } from '../src/llm/llm.js';

function makeProject(): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'hermes-sub-resume-'));
  writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: 'sub-resume-test' }));
  return dir;
}

function scriptedLlm(replies: (() => string)[]): LlmClient {
  let call = 0;
  return {
    name: 'resume-test-worker',
    async complete(_messages: LlmMessage[], _opts?: LlmOptions): Promise<string> {
      const reply = replies[Math.min(call, replies.length - 1)];
      call += 1;
      return reply();
    },
    async completeStream(messages: LlmMessage[], opts: LlmOptions, onDelta: (d: string) => void): Promise<string> {
      const reply = await this.complete(messages, opts);
      onDelta(reply);
      return reply;
    },
  };
}

async function initGitRepo(dir: string): Promise<void> {
  await gitExec(dir, ['init']);
  await gitExec(dir, ['add', '-A']);
  await gitExec(dir, ['-c', 'user.name=hermes-test', '-c', 'user.email=hermes@test.local', 'commit', '-m', 'initial']);
}

describe('specialist pause / preserve / resume lifecycle', () => {
  it('publishes an active worktree to recovery status before the first model reply', async () => {
    const dir = makeProject();
    await initGitRepo(dir);
    const events: string[] = [];
    const waitingLlm: LlmClient = {
      name: 'restart-recovery-worker',
      complete(_messages: LlmMessage[], opts?: LlmOptions): Promise<string> {
        return new Promise((_resolve, reject) => {
          opts?.signal?.addEventListener('abort', () => reject(new Error('cancelled')), { once: true });
        });
      },
      async completeStream(messages: LlmMessage[], opts: LlmOptions, onDelta: (d: string) => void): Promise<string> {
        const reply = await this.complete(messages, opts);
        onDelta(reply);
        return reply;
      },
    };
    const runnerA = new SubAgentRunner({
      cwd: dir,
      resolveLlm: () => waitingLlm,
      agentRole: () => 'worker',
      isolate: true,
      onEvent: (event) => events.push(event),
    });
    const [job] = runnerA.startMany([{ agent: 'worker', task: 'survive an app restart' }]);

    for (let attempt = 0; attempt < 40 && !events.some((event) => event.includes('isolated in git worktree')); attempt++) {
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    expect(events.some((event) => event.includes('isolated in git worktree'))).toBe(true);

    // A fresh runner mirrors what the next app process sees after a restart:
    // the in-memory job is gone, but its resumable worktree is discoverable.
    const runnerB = new SubAgentRunner({
      cwd: dir,
      resolveLlm: () => waitingLlm,
      agentRole: () => 'worker',
      isolate: true,
    });
    const recovered = runnerB.status([job!.id]);
    expect(recovered).toHaveLength(1);
    expect(recovered[0]?.status).toBe('cancelled');
    expect(recovered[0]?.summary).toContain('Checkpoint discovered');
    expect(recovered[0]?.summary).toContain('only claim recovered edits after that verification');

    runnerA.stop('test cleanup');
    await runnerA.waitFor([job!.id]);
  }, 30_000);

  it('keeps the worktree + checkpoints when a specialist stops early, and resumes where it left off', async () => {
    const dir = makeProject();
    await initGitRepo(dir);
    const events: string[] = [];

    // Attempt 1: real file write (checkpointed), then spiral into no-action
    // replies until stagnation stops it — previously this DISCARDED everything.
    const llmA = scriptedLlm([
      () =>
        JSON.stringify({
          action: { type: 'tool_call', tool: 'write_file', params: { path: 'out.txt', content: 'progress from attempt one' }, reason: 'start work' },
        }),
      () => 'I am still thinking about the best approach here.',
    ]);
    const runnerA = new SubAgentRunner({
      cwd: dir,
      resolveLlm: () => llmA,
      agentRole: () => 'worker',
      isolate: true,
      onEvent: (e) => events.push(e),
    });

    const [r1] = await runnerA.runMany([{ agent: 'worker', task: 'produce out.txt' }]);
    expect(r1.ok).toBe(false);
    expect(r1.filesChanged).toContain('out.txt');
    expect(r1.resumableJobId).toBeTruthy();
    expect(r1.summary).toContain('WORK PRESERVED');
    expect(events.some((e) => e.includes('[paused]'))).toBe(true);
    // The product change must NOT be in the main tree yet.
    expect(existsSync(path.join(dir, 'out.txt'))).toBe(false);

    // Attempt 2: RESUME with a fresh runner (simulating an app restart) using
    // the resumableJobId — same preserved worktree/branch, finishes cleanly.
    const llmB = scriptedLlm([
      () => JSON.stringify({ action: { type: 'answer', summary: 'resumed and finished the remaining work' } }),
    ]);
    const runnerB = new SubAgentRunner({
      cwd: dir,
      resolveLlm: () => llmB,
      agentRole: () => 'worker',
      isolate: true,
      onEvent: () => {},
    });

    const [r2] = await runnerB.runMany([
      { agent: 'worker', task: 'produce out.txt', resume: { jobId: r1.resumableJobId!, note: 'finish the remaining work' } },
    ]);
    expect(r2.ok).toBe(true);
    // The checkpointed work from attempt ONE arrives in the main tree via the
    // resumed branch's merge — nothing was lost or redone.
    expect(readFileSync(path.join(dir, 'out.txt'), 'utf8')).toBe('progress from attempt one');

    // A consumed logical job must not silently create a replacement worker.
    const llmC = scriptedLlm([() => JSON.stringify({ action: { type: 'answer', summary: 'fresh start ok' } })]);
    const runnerC = new SubAgentRunner({
      cwd: dir,
      resolveLlm: () => llmC,
      agentRole: () => 'worker',
      isolate: true,
      onEvent: () => {},
    });
    const [r3] = await runnerC.runMany([
      { agent: 'worker', task: 'produce out.txt', resume: { jobId: r1.resumableJobId! } },
    ]);
    expect(r3.ok).toBe(false);
    expect(r3.resumeState).toBe('RESUME_CHECKPOINT_MISSING');
  }, 30000);
});
