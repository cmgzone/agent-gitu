import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { SubAgentRunner } from '../src/agent/subagent.js';
import { gitExec } from '../src/git/git.js';
import type { LlmClient, LlmMessage, LlmOptions } from '../src/llm/llm.js';

function makeProject(): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'hermes-subagents-'));
  writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: 'subagents-test' }));
  return dir;
}

function scriptedLlm(replies: (() => string)[]): LlmClient {
  let call = 0;
  return {
    name: 'test-worker',
    async complete(_messages: LlmMessage[], _opts?: LlmOptions): Promise<string> {
      const reply = replies[Math.min(call, replies.length - 1)];
      call += 1;
      return reply();
    },
    async completeStream(messages: LlmMessage[], opts: LlmOptions, onDelta: (delta: string) => void): Promise<string> {
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

describe('SubAgentRunner', () => {
  it('queues background agents, limits concurrent workers, and retains their results', async () => {
    const dir = makeProject();
    const events: string[] = [];
    let active = 0;
    let peak = 0;
    const llm: LlmClient = {
      name: 'test-worker',
      async complete(_messages: LlmMessage[], _opts?: LlmOptions): Promise<string> {
        active += 1;
        peak = Math.max(peak, active);
        await new Promise((resolve) => setTimeout(resolve, 25));
        active -= 1;
        return JSON.stringify({ action: { type: 'answer', summary: 'checked independently' } });
      },
      async completeStream(messages: LlmMessage[], opts: LlmOptions, onDelta: (delta: string) => void): Promise<string> {
        const reply = await this.complete(messages, opts);
        onDelta(reply);
        return reply;
      },
    };
    const runner = new SubAgentRunner({
      cwd: dir,
      resolveLlm: () => llm,
      agentRole: () => 'test specialist',
      agentEffort: () => 'low',
      maxConcurrent: 2,
      onEvent: (event) => events.push(event),
    });

    const jobs = runner.startMany([
      { agent: 'one', task: 'check one' },
      { agent: 'two', task: 'check two' },
      { agent: 'three', task: 'check three' },
      { agent: 'four', task: 'check four' },
    ]);
    expect(jobs).toHaveLength(4);
    expect(runner.status()).toHaveLength(4);
    expect(runner.status().some((job) => job.status === 'queued')).toBe(true);

    const results = await runner.waitFor(jobs.map((job) => job.id));
    expect(results.every((result) => result.ok)).toBe(true);
    expect(peak).toBeLessThanOrEqual(2);
    expect(runner.status().every((job) => job.status === 'completed')).toBe(true);
    expect(events.some((event) => event.includes('[queued]'))).toBe(true);
    expect(events.some((event) => event.includes('[completed]'))).toBe(true);
  });

  it('runs specialists in isolated git worktrees and merges product changes back', async () => {
    const dir = makeProject();
    await initGitRepo(dir);

    const llm = scriptedLlm([
      () => JSON.stringify({
        action: {
          type: 'tool_call',
          tool: 'write_file',
          params: { path: 'src/isolated.txt', content: 'written in worktree' },
          reason: 'test write',
          expected: 'file appears',
        },
      }),
      () => JSON.stringify({ action: { type: 'answer', summary: 'done in isolation' } }),
    ]);
    const events: string[] = [];
    const runner = new SubAgentRunner({
      cwd: dir,
      resolveLlm: () => llm,
      agentRole: () => 'tester',
      onEvent: (event) => events.push(event),
    });

    const [result] = await runner.runMany([{ agent: 'iso', task: 'write isolated file' }]);

    expect(result.ok).toBe(true);
    expect(events.some((event) => event.includes('worktree'))).toBe(true);
    expect(readFileSync(path.join(dir, 'src', 'isolated.txt'), 'utf8')).toBe('written in worktree');

    const worktrees = await gitExec(dir, ['worktree', 'list']);
    expect(worktrees.split(/\r?\n/).filter(Boolean)).toHaveLength(1);
    const branches = await gitExec(dir, ['branch']);
    expect(branches).not.toContain('hermes-sub-');
    const mergeLog = await gitExec(dir, ['log', '--oneline']);
    expect(mergeLog).toContain('merge');
  });

  it('does not merge changes when the specialist fails, and reports merge conflicts', async () => {
    const dir = makeProject();
    await initGitRepo(dir);

    const llm = scriptedLlm([
      () => JSON.stringify({
        action: {
          type: 'tool_call',
          tool: 'write_file',
          params: { path: 'src/conflicted.txt', content: 'worktree version' },
          reason: 'test write',
          expected: 'file appears',
        },
      }),
      () => JSON.stringify({ action: { type: 'request_block', reason: 'gave up' } }),
    ]);
    const runner = new SubAgentRunner({
      cwd: dir,
      resolveLlm: () => llm,
      agentRole: () => 'tester',
    });

    const [result] = await runner.runMany([{ agent: 'failing', task: 'write then give up' }]);

    expect(result.ok).toBe(false);
    expect(() => readFileSync(path.join(dir, 'src', 'conflicted.txt'), 'utf8')).toThrow();
    const worktrees = await gitExec(dir, ['worktree', 'list']);
    expect(worktrees.split(/\r?\n/).filter(Boolean)).toHaveLength(1);
  });

  it('never lets two concurrent specialists silently clobber each other: same-file edits yield one clean merge and one detected conflict', async () => {
    const dir = makeProject();
    await initGitRepo(dir);

    // Both agents write the SAME file with different content at the same time.
    const llm = scriptedLlm([
      () => JSON.stringify({ action: { type: 'tool_call', tool: 'write_file', params: { path: 'src/shared.txt', content: 'from agent A' }, reason: 'a', expected: 'file' } }),
      () => JSON.stringify({ action: { type: 'answer', summary: 'A done' } }),
      () => JSON.stringify({ action: { type: 'tool_call', tool: 'write_file', params: { path: 'src/shared.txt', content: 'from agent B' }, reason: 'b', expected: 'file' } }),
      () => JSON.stringify({ action: { type: 'answer', summary: 'B done' } }),
    ]);
    const events: string[] = [];
    const runner = new SubAgentRunner({
      cwd: dir,
      resolveLlm: () => llm,
      agentRole: () => 'tester',
      maxConcurrent: 2,
      onEvent: (event) => events.push(event),
    });

    const results = await runner.runMany([
      { agent: 'alpha', task: 'write shared.txt as A' },
      { agent: 'beta', task: 'write shared.txt as B' },
    ]);

    const okCount = results.filter((r) => r.ok).length;
    const conflict = results.find((r) => !r.ok);
    expect(okCount).toBe(1);
    expect(conflict).toBeDefined();
    expect(conflict!.summary).toContain('Merge conflict');
    expect(conflict!.summary).toContain('shared.txt');

    // The merged file holds exactly one agent's version — never a torn mix.
    const merged = readFileSync(path.join(dir, 'src', 'shared.txt'), 'utf8');
    expect(['from agent A', 'from agent B']).toContain(merged);

    // No leftovers: exactly one worktree (the main one), no hermes-sub branches.
    const worktrees = await gitExec(dir, ['worktree', 'list']);
    expect(worktrees.split(/\r?\n/).filter(Boolean)).toHaveLength(1);
    const branches = await gitExec(dir, ['branch']);
    expect(branches).not.toContain('hermes-sub-');
  });

  it('keeps merging subsequent specialists after an earlier merge failed (chain is not poisoned)', async () => {
    const dir = makeProject();
    await initGitRepo(dir);

    // Two agents collide on shared.txt (one merge will fail); a third agent
    // finishing later on a disjoint file must still merge cleanly even though
    // the serialized merge chain has already seen a rejection.
    const slowAnswer = (summary: string) => JSON.stringify({ action: { type: 'answer', summary } });
    const perAgent: Record<string, LlmClient> = {
      alpha: scriptedLlm([
        () => JSON.stringify({ action: { type: 'tool_call', tool: 'write_file', params: { path: 'src/shared.txt', content: 'A version' }, reason: 'a', expected: 'file' } }),
        slowAnswer,
      ]),
      beta: scriptedLlm([
        () => JSON.stringify({ action: { type: 'tool_call', tool: 'write_file', params: { path: 'src/shared.txt', content: 'B version' }, reason: 'b', expected: 'file' } }),
        slowAnswer,
      ]),
      gamma: scriptedLlm([
        () => JSON.stringify({ action: { type: 'tool_call', tool: 'write_file', params: { path: 'src/c.txt', content: 'C version' }, reason: 'c', expected: 'file' } }),
        async () => {
          await new Promise((resolve) => setTimeout(resolve, 400));
          return slowAnswer('C done');
        },
      ]),
    };
    const runner = new SubAgentRunner({
      cwd: dir,
      resolveLlm: (name) => perAgent[name] ?? perAgent['alpha'],
      agentRole: () => 'tester',
      maxConcurrent: 3,
    });

    const results = await runner.runMany([
      { agent: 'alpha', task: 'write shared.txt' },
      { agent: 'beta', task: 'write shared.txt' },
      { agent: 'gamma', task: 'write c.txt' },
    ]);
    const byAgent = Object.fromEntries(results.map((r) => [r.agent, r]));

    // gamma is deliberately last: it must merge even though the chain already
    // rejected alpha's or beta's conflicting merge.
    expect(byAgent['gamma'].ok).toBe(true);
    expect(readFileSync(path.join(dir, 'src', 'c.txt'), 'utf8')).toBe('C version');

    // Exactly one of the shared.txt writers merged; the other failed loudly.
    const colliding = [byAgent['alpha'], byAgent['beta']];
    expect(colliding.filter((r) => r.ok)).toHaveLength(1);
    expect(colliding.filter((r) => !r.ok)[0].summary).toContain('Merge conflict');

    const worktrees = await gitExec(dir, ['worktree', 'list']);
    expect(worktrees.split(/\r?\n/).filter(Boolean)).toHaveLength(1);
  });

  it('uses a neutral git identity when none is configured, so worktree commits AND merges still succeed on fresh machines', async () => {
    const dir = makeProject();
    await initGitRepo(dir);

    // Simulate a fresh machine: no global/system git config at all.
    const oldGlobal = process.env.GIT_CONFIG_GLOBAL;
    const oldSystem = process.env.GIT_CONFIG_SYSTEM;
    const noGlobal = path.join(dir, '.no-global');
    const noSystem = path.join(dir, '.no-system');
    writeFileSync(noGlobal, '');
    writeFileSync(noSystem, '');
    process.env.GIT_CONFIG_GLOBAL = noGlobal;
    process.env.GIT_CONFIG_SYSTEM = noSystem;
    try {
      const llm = scriptedLlm([
        () => JSON.stringify({ action: { type: 'tool_call', tool: 'write_file', params: { path: 'src/fresh.txt', content: 'identity-free content' }, reason: 'e2e', expected: 'file' } }),
        () => JSON.stringify({ action: { type: 'answer', summary: 'fresh machine done' } }),
      ]);
      const runner = new SubAgentRunner({
        cwd: dir,
        resolveLlm: () => llm,
        agentRole: () => 'tester',
      });

      const [result] = await runner.runMany([{ agent: 'writer', task: 'create fresh.txt' }]);

      expect(result.ok).toBe(true);
      expect(result.summary).toContain('merged back cleanly');
      expect(readFileSync(path.join(dir, 'src', 'fresh.txt'), 'utf8')).toBe('identity-free content');
      const authors = await gitExec(dir, ['log', '--pretty=%an', '-2']);
      expect(authors).toContain('Agent Gitu');
    } finally {
      if (oldGlobal === undefined) delete process.env.GIT_CONFIG_GLOBAL;
      else process.env.GIT_CONFIG_GLOBAL = oldGlobal;
      if (oldSystem === undefined) delete process.env.GIT_CONFIG_SYSTEM;
      else process.env.GIT_CONFIG_SYSTEM = oldSystem;
    }
  });

  it('rejects specialist completion and discards worktree when evidence gate is unsatisfied (lying specialist attack)', async () => {
    const dir = makeProject();
    await initGitRepo(dir);

    // Specialist tries to write code, run an irrelevant command (node --version),
    // claim criterion, and answer. The evidence gate MUST reject the answer.
    let sawRejection = false;
    const llm = scriptedLlm([
      // Turn 1: Write code
      () => JSON.stringify({
        action: {
          type: 'tool_call',
          tool: 'write_file',
          params: { path: 'src/auth.ts', content: 'export const fakeAuth = true;' },
          reason: 'implement fake auth',
          expected: 'file written',
        },
      }),
      // Turn 2: Run irrelevant command
      () => JSON.stringify({
        action: {
          type: 'tool_call',
          tool: 'run_command',
          params: { command: 'node --version' },
          reason: 'run irrelevant check',
          expected: 'exit 0',
        },
      }),
      // Turn 3: Try to claim criterion with irrelevant evidence
      (_messages) => JSON.stringify({
        action: {
          type: 'claim_criterion',
          criterionId: 'ac-1',
          evidenceId: 'ev-fake', // will be rejected
        },
      }),
      // Turn 4: Try to answer anyway without gate open
      () => JSON.stringify({
        action: {
          type: 'answer',
          summary: 'JWT authentication implemented (fake)',
        },
      }),
      // Turn 5: The gate rejected the answer, specialist receives rejection prompt and gives up
      (_messages) => {
        sawRejection = true;
        return JSON.stringify({ action: { type: 'tool_call', tool: 'list_files', params: { path: 'src' }, reason: 'stuck', expected: 'files' } });
      },
    ]);

    const events: string[] = [];
    const runner = new SubAgentRunner({
      cwd: dir,
      resolveLlm: () => llm,
      agentRole: () => 'auth specialist',
      onEvent: (e) => events.push(e),
    });

    const [result] = await runner.runMany([
      {
        agent: 'lying-specialist',
        task: 'Implement JWT authentication',
        criteria: [
          { text: 'JWT authentication works', verification: 'npm test -- auth', evidenceType: 'test_success' },
        ],
      },
    ]);

    // ❌ Specialist failed because evidence gate never opened
    expect(result.ok).toBe(false);
    expect(sawRejection).toBe(true);
    expect(events.some((e) => e.includes('completion rejected by evidence gate'))).toBe(true);

    // ❌ Worktree changes were DISCARDED — fake auth file never reached main branch!
    expect(() => readFileSync(path.join(dir, 'src', 'auth.ts'), 'utf8')).toThrow();

    // ❌ No merge commit on main
    const log = await gitExec(dir, ['log', '--oneline']);
    expect(log).not.toContain('fakeAuth');
    expect(log).not.toContain('lying-specialist');
  });

  it('accepts specialist completion and merges worktree when required verification is satisfied', async () => {
    const dir = makeProject();
    await initGitRepo(dir);

    function findSubEvidenceId(messages: LlmMessage[]): string {
      for (let i = messages.length - 1; i >= 0; i--) {
        const content = typeof messages[i]?.content === 'string' ? (messages[i]?.content as string) : '';
        const match = content.match(/(ev-\d{8}-[0-9a-f]{6})/);
        if (match?.[1]) return match[1];
      }
      return 'ev-missing';
    }

    let capturedMessages: LlmMessage[] = [];
    let callIdx = 0;
    const replies = [
      // Turn 1: Write code
      () => JSON.stringify({
        action: {
          type: 'tool_call',
          tool: 'write_file',
          params: { path: 'src/auth.ts', content: 'export const realAuth = true;' },
          reason: 'implement real auth',
          expected: 'file written',
        },
      }),
      // Turn 2: Run EXACT required test command
      () => JSON.stringify({
        action: {
          type: 'tool_call',
          tool: 'run_command',
          params: { command: 'node -e "process.exit(0)"' }, // we match on this verification
          reason: 'run verification',
          expected: 'exit 0',
        },
      }),
      // Turn 3: Claim criterion with recorded evidence
      () => JSON.stringify({
        action: {
          type: 'claim_criterion',
          criterionId: 'ac-1',
          evidenceId: findSubEvidenceId(capturedMessages),
        },
      }),
      // Turn 4: Answer with gate open
      () => JSON.stringify({
        action: {
          type: 'answer',
          summary: 'JWT authentication implemented and verified.',
        },
      }),
    ];

    const llm: LlmClient = {
      name: 'honest-specialist-llm',
      async complete(messages: LlmMessage[]): Promise<string> {
        capturedMessages = messages;
        const reply = replies[Math.min(callIdx, replies.length - 1)]!();
        callIdx++;
        return reply;
      },
      async completeStream(messages: LlmMessage[], _opts: unknown, onDelta: (d: string) => void): Promise<string> {
        const r = await this.complete(messages);
        onDelta(r);
        return r;
      },
    };

    const runner = new SubAgentRunner({
      cwd: dir,
      resolveLlm: () => llm,
      agentRole: () => 'auth specialist',
    });

    const [result] = await runner.runMany([
      {
        agent: 'honest-specialist',
        task: 'Implement JWT authentication',
        criteria: [
          { text: 'Auth passes', verification: 'node -e "process.exit(0)"', evidenceType: 'command_success' },
        ],
      },
    ]);

    // ✅ Specialist succeeded because evidence gate opened
    expect(result.ok).toBe(true);

    // ✅ Worktree changes were COMMITTED AND MERGED into main!
    expect(readFileSync(path.join(dir, 'src', 'auth.ts'), 'utf8')).toContain('realAuth');

    // ✅ Merge commit exists on main
    const log = await gitExec(dir, ['log', '--oneline']);
    expect(log).toContain('honest-specialist');
  });
});

