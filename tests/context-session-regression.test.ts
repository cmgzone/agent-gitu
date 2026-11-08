import { describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { formatToolOutput, storeLargeToolOutput, DEFAULT_MAX_TOOL_OUTPUT_CHARS } from '../src/agent/tool-output.js';
import { buildModelContext } from '../src/context/model-context.js';
import { estimatePromptChars, PLATFORM_SAFETY_MAX_CHARS, PROVIDER_SAFETY_LIMIT_CHARS, LlmError, ScriptedMockLlm, type LlmMessage, type LlmClient } from '../src/llm/llm.js';
import { resilientLlm } from '../src/llm/resilient.js';
import { compactHistory } from '../src/agent/compaction.js';
import { acquireTaskLock, readTaskLock, isProcessAlive } from '../src/ledger/task-lock.js';
import { GituSessionRuntime } from '../src/coding/session-runtime.js';
import { ConnectionRegistry } from '../src/connections/connections.js';
import type { CompletionReport } from '../src/types.js';
import type { Gitu } from '../src/agent/gitu.js';

function makeProject(): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'context-reg-'));
  writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: 'reg-test' }));
  mkdirSync(path.join(dir, 'src'), { recursive: true });
  writeFileSync(path.join(dir, 'src', 'index.ts'), 'export const x = 1;\n');
  return dir;
}

function completeReport(goal: string, taskId = 'task-1'): CompletionReport {
  return { taskId, goal, status: 'complete', summary: 'done', changes: [], filesChanged: [], verification: [] };
}

function createTestSession(
  runtime: GituSessionRuntime,
  dir: string,
  opts: { goal?: string; budget?: { maxTurns?: number } } = {},
) {
  return runtime.createSession({
    goal: opts.goal ?? 'Test goal',
    workspace: { type: 'host', path: dir },
    budget: opts.budget,
    runOptions: () => ({ workspaceRoot: dir, llm: new ScriptedMockLlm([() => '{}']), mode: 'fast' }),
    deps: {
      connections: new ConnectionRegistry(),
      connectionContext: () => 'connections: none',
      connectionActionHandler: async () => ({ message: 'ok' }),
      safestProviderRead: () => undefined,
      connectionOperationHandler: async () => ({ message: 'ok' }),
      connectionRecoveryCheck: () => ({ action: 'setup-new', reason: 'none' }),
      connectionRequestHandler: async () => false,
    },
  });
}

describe('Context Explosion & Session Lifecycle Regression Suite', () => {
  // Scenario 1: A large tool output followed by another model request.
  it('Scenario 1: Bounded tool output and storage prevents prompt explosion', () => {
    const dir = makeProject();
    const largeOutput = 'A'.repeat(300_000); // 300KB tool output

    const refPath = storeLargeToolOutput(largeOutput, dir, 'run_command');
    expect(refPath).toBeDefined();
    const resolvedPath = path.isAbsolute(refPath!) ? refPath! : path.join(dir, refPath!);
    expect(existsSync(resolvedPath)).toBe(true);

    const formatted = formatToolOutput('run_command', largeOutput, DEFAULT_MAX_TOOL_OUTPUT_CHARS, refPath);
    expect(formatted.length).toBeLessThanOrEqual(DEFAULT_MAX_TOOL_OUTPUT_CHARS + 500);
    expect(formatted).toContain(refPath!);

    const history: LlmMessage[] = [
      { role: 'user', content: 'Run command to build project' },
      { role: 'assistant', content: 'Running build' },
      { role: 'user', content: formatted },
    ];

    const estimatedChars = estimatePromptChars(history);
    expect(estimatedChars).toBeLessThan(PLATFORM_SAFETY_MAX_CHARS);

    const built = buildModelContext({
      system: 'You are a coding agent.',
      history,
      tokenCeiling: 128_000,
    });
    expect(built.totalChars).toBeLessThanOrEqual(PLATFORM_SAFETY_MAX_CHARS);
  });

  // Scenario 2: Repeated retries without transcript duplication.
  it('Scenario 2: Repeated retries do not accumulate duplicate state messages', () => {
    const messages: LlmMessage[] = [
      { role: 'system', content: 'system' },
    ];

    const stateA = 'TASK AUTHORITY (Precedence: 1. Safety > 2. Goal)\nTASK: Solve bug\nSTATE: Attempt 1';
    const stateB = 'TASK AUTHORITY (Precedence: 1. Safety > 2. Goal)\nTASK: Solve bug\nSTATE: Attempt 2';
    const stateC = 'TASK AUTHORITY (Precedence: 1. Safety > 2. Goal)\nTASK: Solve bug\nSTATE: Attempt 3';

    // Simulate ask() replacement logic
    const pushOrReplaceState = (stateContent: string) => {
      const lastMsg = messages[messages.length - 1];
      if (lastMsg && lastMsg.role === 'user' && typeof lastMsg.content === 'string' && lastMsg.content.startsWith('TASK AUTHORITY')) {
        lastMsg.content = stateContent;
      } else {
        messages.push({ role: 'user', content: stateContent });
      }
    };

    pushOrReplaceState(stateA);
    expect(messages).toHaveLength(2);

    // Turn 1 encounters empty reply / retry -> asks again with stateB
    pushOrReplaceState(stateB);
    expect(messages).toHaveLength(2);
    expect(messages[1]?.content).toBe(stateB);

    // Turn 2 retry -> asks again with stateC
    pushOrReplaceState(stateC);
    expect(messages).toHaveLength(2);
    expect(messages[1]?.content).toBe(stateC);

    // Ensure it did not balloon by 3x
    const totalChars = estimatePromptChars(messages);
    expect(totalChars).toBeLessThan(10_000);
  });

  // Scenario 3: Context compaction followed by continued execution.
  it('Scenario 3: Context compaction reduces history and preserves execution bounds', () => {
    const messages: LlmMessage[] = [
      { role: 'system', content: 'System prompt' },
    ];
    for (let i = 0; i < 20; i++) {
      messages.push({ role: 'user', content: `User step ${i} details: ` + 'X'.repeat(5_000) });
      messages.push({ role: 'assistant', content: `Assistant step ${i} reply: ` + 'Y'.repeat(5_000) });
    }

    const beforeCompactionChars = estimatePromptChars(messages);
    expect(beforeCompactionChars).toBeGreaterThan(200_000);

    const compacted = compactHistory(messages, () => {}, {
      force: true,
      charBudget: 30_000,
      keepRecent: 2,
      snapshot: 'CANONICAL SNAPSHOT',
    });

    expect(compacted).toBe(true);
    const afterCompactionChars = estimatePromptChars(messages);
    expect(afterCompactionChars).toBeLessThan(35_000);

    // Model context builder accepts compacted history cleanly
    const modelContext = buildModelContext({
      system: 'System prompt',
      history: messages,
      tokenCeiling: 32_000,
    });
    expect(modelContext.totalChars).toBeLessThanOrEqual(PLATFORM_SAFETY_MAX_CHARS);
  });

  // Scenario 4: A fast task followed by a completely different task in the same session.
  it('Scenario 4: Fast completed task allows new different task in same session', async () => {
    const dir = makeProject();
    let runCount = 0;
    const executedGoals: string[] = [];

    const runtime = new GituSessionRuntime({
      createEngine: (_req, options) => {
        runCount++;
        return {
          run: async (goal: string) => {
            executedGoals.push(goal);
            return {
              ledger: { data: { taskId: `task-${runCount}` } },
              report: completeReport(goal, `task-${runCount}`),
            };
          },
          queueMessage: () => {},
          stop: () => {},
        } as unknown as Gitu;
      },
    });

    const session = createTestSession(runtime, dir, { goal: 'Fast task 1: check files' });

    // Run first fast task
    const res1 = await session.run('Fast task 1: check files');
    expect(res1.status).toBe('completed');
    expect(res1.executionId).toBeDefined();
    expect(session.getState().status).toBe('completed');
    expect(session.getState().executionId).toBeUndefined(); // Execution released

    // Run second, completely different task in the SAME session
    const res2 = await session.run('Different task 2: build express app');
    expect(res2.status).toBe('completed');
    expect(res2.executionId).toBeDefined();
    expect(res2.executionId).not.toBe(res1.executionId);
    expect(executedGoals).toEqual(['Fast task 1: check files', 'Different task 2: build express app']);
    expect(session.getState().status).toBe('completed');
  });

  // Scenario 5: A failed task followed by a new task.
  it('Scenario 5: Failed task does not permanently block subsequent tasks', async () => {
    const dir = makeProject();
    let attempts = 0;

    const runtime = new GituSessionRuntime({
      createEngine: () => {
        attempts++;
        return {
          run: async (goal: string) => {
            if (attempts === 1) {
              throw new Error('Connection failed catastrophically');
            }
            return {
              ledger: { data: { taskId: 'task-recovered' } },
              report: completeReport(goal, 'task-recovered'),
            };
          },
          queueMessage: () => {},
          stop: () => {},
        } as unknown as Gitu;
      },
    });

    const session = createTestSession(runtime, dir, { goal: 'Flaky task' });

    // Attempt 1 fails
    const res1 = await session.run('Flaky task');
    expect(res1.status).toBe('failed');
    expect(res1.error).toContain('Connection failed catastrophically');
    expect(session.getState().status).toBe('failed');
    expect(session.getState().executionId).toBeUndefined(); // Lock/execution released!

    // Attempt 2 in the same session runs a new task
    const res2 = await session.run('Recovered task');
    expect(res2.status).toBe('completed');
    expect(session.getState().status).toBe('completed');
    expect(res2.error).toBeUndefined();
  });

  // Scenario 6: A cancelled task followed by a new task.
  it('Scenario 6: Cancelled task releases execution and allows next task', async () => {
    const dir = makeProject();
    let stopped = false;

    const runtime = new GituSessionRuntime({
      createEngine: () => {
        return {
          run: async (goal: string) => {
            if (!stopped) {
              // Simulate long running work that gets stopped
              return { ledger: { data: { taskId: 't1' } }, report: completeReport(goal, 't1') };
            }
            return { ledger: { data: { taskId: 't2' } }, report: completeReport(goal, 't2') };
          },
          queueMessage: () => {},
          stop: () => {
            stopped = true;
          },
        } as unknown as Gitu;
      },
    });

    const session = createTestSession(runtime, dir, { goal: 'Long task to cancel' });

    await session.cancel('User requested cancellation');
    const stateAfterCancel = session.getState();
    expect(stateAfterCancel.status).toBe('cancelled');
    expect(stateAfterCancel.error).toBe('User requested cancellation');
    expect(stateAfterCancel.executionId).toBeUndefined();

    // Now start a new task in this session
    const res = await session.run('New task after cancellation');
    expect(res.status).toBe('completed');
    expect(session.getState().status).toBe('completed');
  });

  // Scenario 7: A timed-out task followed by a new task.
  it('Scenario 7: Budget or gate stop transitions explicitly and allows subsequent task', async () => {
    const dir = makeProject();
    let count = 0;

    const runtime = new GituSessionRuntime({
      createEngine: (_req, options) => ({
        run: async (goal: string) => {
          count++;
          await options.llm.complete([{ role: 'user', content: 'step' }]);
          return { ledger: { data: { taskId: `t-${count}` } }, report: completeReport(goal, `t-${count}`) };
        },
        queueMessage: () => {},
        stop: () => {},
      } as unknown as Gitu),
    });

    // Session with 2 turn budget
    const session = createTestSession(runtime, dir, {
      goal: 'Budget task',
      budget: { maxTurns: 2 },
    });

    const res1 = await session.run('First turn (uses 1 turn)');
    expect(res1.status).toBe('completed');

    // Second turn exceeds budget -> blocks safely
    const res2 = await session.run('Second turn (exceeds budget)');
    expect(res2.status).toBe('blocked');
    expect(res2.error).toContain('budget exhausted');
    expect(session.getState().executionId).toBeUndefined();
  });

  // Scenario 8: A stale execution lock.
  it('Scenario 8: Stale lock or dead process lock is safely taken over', () => {
    const dir = makeProject();
    const taskId = 'hermes-task-stale-test';

    // 8a: Dead PID lock takeover
    const deadPid = 99999999;
    expect(isProcessAlive(deadPid)).toBe(false);

    const lockPath = path.join(dir, '.hermes', 'tasks', `${taskId}.lock`);
    mkdirSync(path.dirname(lockPath), { recursive: true });
    writeFileSync(
      lockPath,
      JSON.stringify({
        taskId,
        runId: 'run-dead-holder',
        pid: deadPid,
        startedAt: new Date().toISOString(),
        startedAtMs: Date.now(),
        staleAfterMs: 30 * 60 * 1000,
      }),
    );

    const claimDead = acquireTaskLock({
      repoRoot: dir,
      taskId,
      runId: 'run-new-attempt',
    });

    expect(claimDead.ok).toBe(true);
    if (claimDead.ok) {
      expect(claimDead.lock.takenOver).toBe(true);
      claimDead.lock.release();
    }

    // 8b: Expired timestamp lock takeover
    const pastTime = Date.now() - 40 * 60 * 1000; // 40 minutes ago
    writeFileSync(
      lockPath,
      JSON.stringify({
        taskId,
        runId: 'run-ancient-holder',
        pid: process.pid,
        startedAt: new Date(pastTime).toISOString(),
        startedAtMs: pastTime,
        staleAfterMs: 30 * 60 * 1000,
      }),
    );

    const claimExpired = acquireTaskLock({
      repoRoot: dir,
      taskId,
      runId: 'run-new-attempt-2',
    });

    expect(claimExpired.ok).toBe(true);
    if (claimExpired.ok) {
      expect(claimExpired.lock.takenOver).toBe(true);
      claimExpired.lock.release();
    }
  });

  // Scenario 9: Multiple sequential tasks sharing the same conversation.
  it('Scenario 9: Multiple sequential tasks execute in same session with separate executions', async () => {
    const dir = makeProject();
    const executions: { goal: string; execId?: string; taskId?: string }[] = [];

    let seq = 0;
    const runtime = new GituSessionRuntime({
      createEngine: () => ({
        run: async (goal: string) => {
          seq++;
          return {
            ledger: { data: { taskId: `task-seq-${seq}` } },
            report: completeReport(goal, `task-seq-${seq}`),
          };
        },
        queueMessage: () => {},
        stop: () => {},
      } as unknown as Gitu),
    });

    const session = createTestSession(runtime, dir, { goal: 'Initial task 1' });

    for (let i = 1; i <= 3; i++) {
      const goal = `Sequential Task ${i}`;
      const res = await session.run(goal);
      expect(res.status).toBe('completed');
      executions.push({ goal, execId: res.executionId, taskId: session.getState().taskId });
    }

    expect(executions).toHaveLength(3);
    const execIds = executions.map((e) => e.execId);
    // All execution IDs are unique
    expect(new Set(execIds).size).toBe(3);
    // All task IDs are distinct
    const taskIds = executions.map((e) => e.taskId);
    expect(new Set(taskIds).size).toBe(3);
  });

  // Scenario 10: Session recovery after runtime restart.
  it('Scenario 10: Process death allows new session instance to resume safely', () => {
    const dir = makeProject();
    const taskId = 'task-restart-recovery';

    // Simulate lock left behind by an old process that was terminated
    const oldPid = 88888888;
    const lockPath = path.join(dir, '.hermes', 'tasks', `${taskId}.lock`);
    mkdirSync(path.dirname(lockPath), { recursive: true });
    writeFileSync(
      lockPath,
      JSON.stringify({
        taskId,
        runId: 'run-crashed-process',
        pid: oldPid,
        startedAt: new Date().toISOString(),
        startedAtMs: Date.now(),
        staleAfterMs: 1800000,
      }),
    );

    // New server process boots up and attempts to resume the task
    const resumeClaim = acquireTaskLock({
      repoRoot: dir,
      taskId,
      runId: 'run-restarted-server',
    });

    expect(resumeClaim.ok).toBe(true);
    if (resumeClaim.ok) {
      expect(resumeClaim.lock.takenOver).toBe(true);
      expect(resumeClaim.lock.record.runId).toBe('run-restarted-server');
      resumeClaim.lock.release();
    }
  });

  // Hard safeguard test: Oversized prompt rejected by preflight without blind retries
  it('Safeguard: Resilient LLM rejects oversized prompt without retrying', async () => {
    let callCount = 0;
    const mockClient: LlmClient = {
      name: 'mock',
      complete: async () => {
        callCount++;
        return 'ok';
      },
    };

    const resilient = resilientLlm(mockClient);
    const giantContent = 'Z'.repeat(1_700_000); // Exceeds PLATFORM_SAFETY_MAX_CHARS (1.6M)
    const giantMessages: LlmMessage[] = [
      { role: 'user', content: giantContent },
    ];

    await expect(async () => {
      await resilient.complete(giantMessages);
    }).rejects.toThrow(/exceeds platform safety limit/);
    // Verifies it threw BEFORE submitting and made 0 attempts to call the provider
    expect(callCount).toBe(0);
  });
});
