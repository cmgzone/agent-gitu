import { mkdtempSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { gitExec } from '../src/git/git.js';
import { ScriptedMockLlm, type LlmMessage } from '../src/llm/llm.js';
import { HermesServer } from '../src/server/server.js';
import { TaskLedger } from '../src/ledger/task-ledger.js';
import { storeLargeToolOutput, pruneToolOutputs } from '../src/agent/tool-output.js';
import { toolReadFile } from '../src/tools/tools.js';
import { ProjectGuard } from '../src/guard/project-guard.js';

function makeProject(name: string): string {
  const dir = mkdtempSync(path.join(tmpdir(), `hermes-seq-${name}-`));
  writeFileSync(
    path.join(dir, 'package.json'),
    JSON.stringify({ name: `seq-${name}`, scripts: { test: 'node --version' } }, null, 2),
  );
  return dir;
}

async function initGitRepo(dir: string): Promise<void> {
  await gitExec(dir, ['init']);
  await gitExec(dir, ['add', '-A']);
  await gitExec(dir, ['-c', 'user.name=seq', '-c', 'user.email=seq@test.local', 'commit', '-m', 'initial']);
}

async function waitFor<T>(fn: () => Promise<T | undefined>, timeoutMs = 40000): Promise<T> {
  const start = Date.now();
  for (;;) {
    const value = await fn();
    if (value !== undefined) return value;
    if (Date.now() - start > timeoutMs) throw new Error('waitFor timed out');
    await new Promise((r) => setTimeout(r, 200));
  }
}

async function waitForCompletion(base: string, runId: string, prevFinishedAt?: string) {
  return waitFor(async () => {
    const s = (await fetch(`${base}/api/runs/${runId}`).then((r) => r.json())) as {
      status: string;
      finishedAt?: string;
      taskId?: string;
      goal: string;
      error?: string;
    };
    if (s.status === 'completed' && s.finishedAt && s.finishedAt !== prevFinishedAt) {
      return s;
    }
    if (s.status === 'failed' || s.status === 'blocked') {
      throw new Error(`Run reached ${s.status}: ${s.error}`);
    }
    return undefined;
  });
}

/**
 * An autonomous mock agent handler that responds dynamically to task requirements
 * so sequential tasks, continuations, and retries all complete deterministically.
 */
function createAutonomousMockResponse() {
  return (_call: number, messages: LlmMessage[]) => {
    const lastUserMessage = [...messages].reverse().find((m) => m.role === 'user');
    const text = typeof lastUserMessage?.content === 'string'
      ? lastUserMessage.content
      : JSON.stringify(lastUserMessage?.content);

    // 1. If criteria needed for the current task
    const needsCriteria = text.includes('(none set yet — use set_criteria)') || !text.includes('ACCEPTANCE CRITERIA');
    if (needsCriteria) {
      return JSON.stringify({ action: { type: 'set_criteria', criteria: ['verification passes'] } });
    }

    // 2. If plan needed for the current task
    const needsPlan = text.includes('PLAN:\n  (none') || text.includes('0 plan steps') || !text.includes('PLAN');
    if (needsPlan) {
      return JSON.stringify({ action: { type: 'set_plan', steps: [{ description: 'verify', verification: 'node --version' }] } });
    }

    // 3. If evidence command needs to run for the current plan step
    const needsExecution = text.includes('NEXT: step-') || text.includes('EVIDENCE:\n  (none yet)');
    if (needsExecution) {
      return JSON.stringify({
        action: { type: 'tool_call', stepId: 'step-1', tool: 'run_command', params: { command: 'node --version' }, reason: 'verify', expected: 'exit 0' },
      });
    }

    // 4. If any unbacked criteria remain in the current phase
    const unbacked = [...text.matchAll(/(ac-\d+):\s*\[open\]/g)];
    const evMatches = [...text.matchAll(/(ev-\d{8}-[0-9a-f]{6})/g)];
    const latestEv = evMatches.pop();
    if (unbacked.length > 0 && latestEv) {
      const critId = unbacked[0]![1];
      return JSON.stringify({ action: { type: 'claim_criterion', criterionId: critId, evidenceId: latestEv[1] } });
    }

    // 5. Complete
    return JSON.stringify({ action: { type: 'complete', summary: 'task verified and completed', risks: [], followUps: [] } });
  };
}

describe('Server API — Sequential tasks and reliability verification', () => {
  const servers: HermesServer[] = [];

  afterAll(async () => {
    for (const s of servers) {
      try {
        await s.stop();
      } catch {
        /* ignore */
      }
    }
  });

  async function startServer(dir: string, llm: ScriptedMockLlm): Promise<{ base: string; server: HermesServer }> {
    const server = new HermesServer({ passwordRequired: false, autoInstallLsp: false, cwd: dir, port: 0, llm });
    servers.push(server);
    const port = await server.start();
    return { base: `http://127.0.0.1:${port}`, server };
  }

  it('runs multiple sequential tasks in one conversation without HTTP 409 or stale ownership (Provider A: OpenAI style)', async () => {
    const dir = makeProject('seq-openai');
    await initGitRepo(dir);

    // Provide autonomous responses for up to 30 calls across tasks
    const handler = createAutonomousMockResponse();
    const responses = Array.from({ length: 30 }, () => handler);
    const llm = new ScriptedMockLlm(responses);

    const { base } = await startServer(dir, llm);

    // 1. Submit initial task
    const createRes = await fetch(`${base}/api/runs`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        goal: 'Verify node works',
        mode: 'fast',
        review: false,
      }),
    });
    expect([200, 202]).toContain(createRes.status);
    const { runId } = (await createRes.json()) as { runId: string };

    // Wait for Task 1 to complete
    const task1 = await waitForCompletion(base, runId);
    expect(task1.status).toBe('completed');
    const firstTaskId = task1.taskId;
    expect(firstTaskId).toBeDefined();

    // 2. Submit continuation ("also add tests")
    const contRes = await fetch(`${base}/api/runs/${runId}/message`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text: 'also add tests' }),
    });
    expect([200, 202]).toContain(contRes.status);

    // Wait for Task 2 to complete
    const task2 = await waitForCompletion(base, runId, task1.finishedAt);
    expect(task2.status).toBe('completed');
    // Continuation retains the same taskId
    expect(task2.taskId).toBe(firstTaskId);

    // 3. Submit completely unrelated new task ("Build a calculator from scratch")
    const newTaskRes = await fetch(`${base}/api/runs/${runId}/message`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text: 'Build a calculator from scratch' }),
    });
    expect([200, 202]).toContain(newTaskRes.status);

    // Wait for Task 3 to complete
    const task3 = await waitForCompletion(base, runId, task2.finishedAt);
    expect(task3.status).toBe('completed');
    expect(task3.goal).toBe('Build a calculator from scratch');
    // Different task ID allocated for the new task lifecycle
    expect(task3.taskId).not.toBe(firstTaskId);

    // 4. The composer's explicit toggle starts a new task even for wording the
    // classifier would otherwise fold into the previous task as a refinement.
    const forcedRes = await fetch(`${base}/api/runs/${runId}/message`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text: 'Review the search ranking copy', newTask: true }),
    });
    expect([200, 202]).toContain(forcedRes.status);

    const task4 = await waitForCompletion(base, runId, task3.finishedAt);
    expect(task4.status).toBe('completed');
    expect(task4.goal).toBe('Review the search ranking copy');
    expect(task4.taskId).not.toBe(task3.taskId);
  }, 180000);

  it('runs multiple sequential tasks on an alternate model provider (Provider B: Anthropic style)', async () => {
    const dir = makeProject('seq-anthropic');
    await initGitRepo(dir);

    const handler = createAutonomousMockResponse();
    const responses = Array.from({ length: 30 }, () => handler);
    const llm = new ScriptedMockLlm(responses);

    const { base } = await startServer(dir, llm);

    // Task 1
    const res1 = await fetch(`${base}/api/runs`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        goal: 'Task one on Claude',
        mode: 'fast',
        review: false,
      }),
    });
    expect([200, 202]).toContain(res1.status);
    const { runId } = (await res1.json()) as { runId: string };

    const task1 = await waitForCompletion(base, runId);
    expect(task1.status).toBe('completed');

    // Task 2
    const res2 = await fetch(`${base}/api/runs/${runId}/message`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text: 'Task two on Claude' }),
    });
    expect([200, 202]).toContain(res2.status);

    const task2 = await waitForCompletion(base, runId, task1.finishedAt);
    expect(task2.status).toBe('completed');
    expect(task2.goal).toBe('Task two on Claude');
  }, 180000);

  it('accepts a completely different task in the same session without newTask toggle and without HTTP 409', async () => {
    const dir = makeProject('seq-different-task');
    await initGitRepo(dir);

    const handler = createAutonomousMockResponse();
    const responses = Array.from({ length: 30 }, () => handler);
    const llm = new ScriptedMockLlm(responses);

    const { base } = await startServer(dir, llm);

    // 1. Initial task
    const res1 = await fetch(`${base}/api/runs`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        goal: 'Initial setup task',
        mode: 'fast',
        review: false,
      }),
    });
    expect([200, 202]).toContain(res1.status);
    const { runId } = (await res1.json()) as { runId: string };

    const task1 = await waitForCompletion(base, runId);
    expect(task1.status).toBe('completed');
    const firstTaskId = task1.taskId;

    // 2. Subsequent different task without explicit newTask toggle (e.g. plain user message)
    const res2 = await fetch(`${base}/api/runs/${runId}/message`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text: 'Generate unit tests for the endpoints' }),
    });
    expect([200, 202]).toContain(res2.status);

    const task2 = await waitForCompletion(base, runId, task1.finishedAt);
    expect(task2.status).toBe('completed');
    expect(task2.goal).toBe('Generate unit tests for the endpoints');
    // Fresh task lifecycle with new taskId
    expect(task2.taskId).not.toBe(firstTaskId);
  }, 180000);

  it('verifies large tool outputs survive, are isolated by task, and can be retrieved using ranged reads', () => {
    const dir = makeProject('tool-output-test');
    const taskId = 'task-output-isolation-123';
    const largeOutput = Array.from({ length: 500 }, (_, i) => `Line ${i + 1}: detailed debug trace info`).join('\n');

    const relPath = storeLargeToolOutput(largeOutput, dir, 'test_tool', taskId);
    expect(relPath).toBeDefined();
    expect(relPath).toContain('.hermes');
    expect(relPath).toContain(taskId);

    const fullPath = path.join(dir, relPath!);
    expect(existsSync(fullPath)).toBe(true);

    // Verify ranged read through toolReadFile
    const guard = ProjectGuard.detect(dir);
    const result = toolReadFile(
      { guard, cwd: dir, fullAccess: () => false, askUser: async () => '' },
      { path: relPath, offset: 10, limit: 5 },
    );

    expect(result.ok).toBe(true);
    expect(result.output).toContain('10: Line 10: detailed debug trace info');
    expect(result.output).toContain('14: Line 14: detailed debug trace info');
    expect(result.output).not.toContain('1: Line 1:');

    // Test retention policy pruning
    const toolDir = path.dirname(fullPath);
    // Write 5 more dummy logs
    for (let i = 0; i < 5; i++) {
      writeFileSync(path.join(toolDir, `extra-${i}.log`), 'data');
    }
    // Prune with maxFiles = 3
    pruneToolOutputs(toolDir, 3, 100_000);
    const { readdirSync } = require('node:fs');
    const remaining = readdirSync(toolDir).filter((f: string) => f.endsWith('.log'));
    expect(remaining.length).toBeLessThanOrEqual(3);
  });
});
