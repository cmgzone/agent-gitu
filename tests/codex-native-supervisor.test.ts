import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { runNativeCodexTask } from '../src/coding/native-codex-supervisor.js';
import { nativeCodexPermissions } from '../src/coding/native-codex-permissions.js';
import { ProjectGuard } from '../src/guard/project-guard.js';
import { TaskLedger } from '../src/ledger/task-ledger.js';
import { MemoryStore } from '../src/memory/memory-store.js';
import { PolicyEngine } from '../src/policy/policy.js';
import { ScriptedMockLlm, LlmError } from '../src/llm/llm.js';
import type { NativeRecord, NativeTaskInput, NativeTaskRuntime } from '../src/llm/native-task.js';
import type { GituConfig } from '../src/agent/gitu.js';

const folders: string[] = [];
afterEach(() => {
  for (const folder of folders.splice(0)) rmSync(folder, { recursive: true, force: true });
});

function fixture(scenario: (input: NativeTaskInput) => Promise<void>, opts: { mode?: 'chat' | 'agent'; approval?: boolean; goal?: string } = {}) {
  const root = mkdtempSync(path.join(tmpdir(), 'gitu-native-supervisor-'));
  folders.push(root);
  writeFileSync(path.join(root, 'package.json'), JSON.stringify({ name: 'native-test', version: '1.0.0' }));
  writeFileSync(path.join(root, 'answer.cjs'), 'module.exports = 1;\n');
  const guard = ProjectGuard.detect(root);
  const ledger = TaskLedger.create({ repoRoot: root, project: guard.lock, goal: opts.goal ?? 'Update answer.cjs to return 2.', mode: opts.mode ?? 'agent' });
  ledger.ensureInitialWorkPhase(ledger.data.goal);
  const onEvent = vi.fn(),
    onCodingEvent = vi.fn(),
    approve = vi.fn(() => opts.approval ?? false);
  const runTurn = vi.fn(async (input: NativeTaskInput) => {
    input.onThread('thread-1');
    input.onTurn('turn-1');
    await scenario(input);
    return { threadId: 'thread-1', turnId: 'turn-1', status: 'completed' as const };
  });
  const runtime: NativeTaskRuntime = { mode: 'codex-native', runTurn, steer: vi.fn(async () => {}) };
  const llm = Object.assign(new ScriptedMockLlm([]), { nativeTask: runtime });
  const config: GituConfig = { cwd: root, llm, mode: opts.mode ?? 'agent', requirePlanReview: false, autoLearn: false, onEvent, onCodingEvent, approvalHandler: approve };
  const controller = new AbortController();
  const run = (message = ledger.data.goal) =>
    runNativeCodexTask({
      config,
      guard,
      ledger,
      memory: MemoryStore.forProject(root),
      policy: new PolicyEngine(false, approve),
      signal: controller.signal,
      goal: ledger.data.goal,
      message,
    });
  return { root, guard, ledger, config, runtime, runTurn, run, controller, onEvent, onCodingEvent, approve };
}

let callSequence = 0;
async function call(input: NativeTaskInput, tool: string, args: NativeRecord, callId = 'call-' + ++callSequence): Promise<NativeRecord> {
  return input.onRequest('item/tool/call', { threadId: 'thread-1', turnId: 'turn-1', callId, tool, arguments: args });
}
async function answer(input: NativeTaskInput, text = 'Done.'): Promise<void> {
  await input.onEvent('item/completed', { turnId: 'turn-1', item: { id: 'answer', type: 'agentMessage', phase: 'final_answer', text } });
}

describe('Gitu supervises the native loop', () => {
  it('records native effort independently of the old adaptive plan', async () => {
    const f = fixture(async (input) => {
      expect(input.effort).toBe('max');
      input.onSettings?.({ model: 'model', requestedEffort: 'max', effectiveEffort: 'max' });
      await answer(input, 'Two.');
    }, { mode: 'chat' });
    f.config.effort = 'max';
    await f.run();
    expect(f.ledger.data.execution?.native).toMatchObject({ model: 'model', requestedEffort: 'max', effectiveEffort: 'max' });
    expect(f.onEvent.mock.calls.some(([line]) => line.startsWith('verify   Codex finished.'))).toBe(true);
    expect(f.runTurn).toHaveBeenCalledTimes(1);
  });

  it('cancels workspace verification without starting another scan to build the report', async () => {
    const f = fixture(async (input) => {
      await answer(input);
    });
    f.config.criteria = [{ text: 'Answer parses', verification: 'node --check answer.cjs' }];
    f.config.onEvent = line => {
      if (line.startsWith('verify   Checking workspace files')) f.controller.abort();
    };
    const result = await f.run();
    expect(result.report.status).toBe('aborted');
    expect(f.ledger.data.status).toBe('aborted');
    expect(f.runTurn).toHaveBeenCalledTimes(1);
  }, 30_000);

  it('never executes descriptive acceptance guidance as shell source', async () => {
    const f = fixture((input) => answer(input));
    f.config.criteria = [{ text: 'Search regression passes', verification: 'Focused automated regression test command for thread-search; repository typecheck where supported.' }];
    expect((await f.run()).report.status).toBe('blocked');
    expect(f.ledger.data.actions.filter((a) => a.tool === 'run_command')).toHaveLength(0);
    expect(f.ledger.data.blockers.join(' ')).toContain('Bind an exact executable verification command');
  });

  it('repairs an invalid verification on a saved requirement through the stable service function', async () => {
    const f = fixture(async (input) => {
      const bound = await call(input, 'gitu_service', { tool: 'bind_criterion_verification', params: { criterionId: 'ac-1', verification: 'node --check answer.cjs' } });
      expect(bound['success']).toBe(true);
      await call(input, 'gitu_apply_edit', { path: 'answer.cjs', oldString: '1', newString: '2' });
      await answer(input);
    });
    f.ledger.setCriteriaFromSpecs([{ text: 'Answer syntax parses', verification: 'Focused regression test and typecheck.', evidenceType: 'command_success' }]);
    expect((await f.run()).report.status).toBe('complete');
    expect(f.ledger.data.acceptanceCriteria[0]).toMatchObject({
      text: 'Answer syntax parses',
      verification: 'node --check answer.cjs',
      verificationInstructions: 'Focused regression test and typecheck.',
      satisfied: true,
    });
    expect(f.ledger.data.actions.filter((a) => a.tool === 'run_command')).toHaveLength(1);
  }, 30_000);

  it('stops repeated unchanged rejected requests without restarting the model', async () => {
    const f = fixture(async (input) => {
      for (let i = 0; i < 4; i++) await call(input, 'gitu_unknown', { operation: 'retry' });
    });
    expect((await f.run()).report.status).toBe('blocked');
    expect(f.ledger.data.blockers.join(' ')).toContain('unchanged result without progress');
    expect(f.runTurn).toHaveBeenCalledTimes(1);
    expect(f.runtime.steer).toHaveBeenCalledTimes(1);
  });

  it.each([true, false])('distinguishes scrolling progress from repeated scrolling at the bottom (progress=%s)', async (progress) => {
    let y = 0;
    const f = fixture(async input => {
      for (let i = 0; i < 6; i++) {
        const result = await call(input, 'gitu_service', { tool: 'browse', params: { action: 'scroll', deltaY: 300 } });
        expect(result['success']).toBe(true);
      }
      await answer(input);
    }, { mode: 'chat' });
    f.config.browser = {
      available: () => true,
      scroll: async () => { if (progress) y += 300; return { url: 'http://localhost:3000/page' }; },
      evaluate: async () => ({ x: 0, y, height: 4000, viewport: 800 }),
    } as any;
    expect((await f.run()).report.status).toBe(progress ? 'complete' : 'blocked');
    expect(f.runtime.steer).toHaveBeenCalledTimes(progress ? 0 : 1);
  });

  it('rejects nonexistent MCP aliases before approval and permits registered tools through policy', async () => {
    const execute = vi.fn(async () => ({ content: [{ type: 'text', text: 'Registered result' }] }));
    const f = fixture(async input => {
      const missing = await call(input, 'gitu_service', { tool: 'mcp:invented:approve', params: {} });
      expect(missing['success']).toBe(false);
      expect(JSON.stringify(missing)).toContain('list_mcp');
      expect(f.approve).not.toHaveBeenCalled();
      expect(execute).not.toHaveBeenCalled();
      await call(input, 'gitu_service', { tool: 'mcp:registered:write', params: {} });
      expect(f.approve).toHaveBeenCalledOnce();
      expect(execute).not.toHaveBeenCalled();
      await answer(input);
    }, { mode: 'chat' });
    f.config.mcp = {
      toolsForServer: async (server: string) => server === 'registered' ? [{ name: 'write', server: 'registered' }] : undefined,
      call: execute,
    } as any;
    await f.run();
  });

  it('keeps deployment with P.A until a direct owner grant reaches the coding runtime', async () => {
    let allowed = false;
    const deploy = vi.fn(async () => ({ message: 'Fixture deployment' }));
    const f = fixture(async input => {
      const proposal = { tool: 'connection_operation', params: { connectionId: 'fixture', operation: { id: 'deploy-application', capability: 'deployments.write', path: '/deploy', method: 'POST' } } };
      expect((await call(input, 'gitu_service', proposal))['success']).toBe(false);
      expect((await call(input, 'gitu_run_command', { command: 'npm run deploy' }))['success']).toBe(false);
      expect(deploy).not.toHaveBeenCalled();
      expect(f.approve).not.toHaveBeenCalled();
      allowed = true;
      expect((await call(input, 'gitu_service', proposal))['success']).toBe(true);
      expect(deploy).toHaveBeenCalledOnce();
      await answer(input);
    }, { mode: 'chat' });
    f.config.deploymentAllowed = () => allowed;
    f.config.connectionOperationHandler = deploy;
    await f.run();
  });

  it('answers a simple question with one native turn and no tool loop', async () => {
    const f = fixture(async (input) => {
      await input.onEvent('item/agentMessage/delta', { itemId: 'answer', delta: 'Tw' });
      await input.onEvent('item/agentMessage/delta', { itemId: 'answer', delta: 'o.' });
      await answer(input, 'Two.');
    }, { mode: 'chat' });
    const result = await f.run();
    expect(result.report.status).toBe('complete');
    expect(result.report.summary).toBe('Two.');
    expect(f.runTurn).toHaveBeenCalledTimes(1);
    expect(f.ledger.data.actions).toHaveLength(0);
    expect(f.onEvent.mock.calls.map(([line]) => line)).toContain('say Two.');
    expect(f.onEvent.mock.calls.map(([line]) => line)).not.toContain('thought Two.');
  });

  it('answers an unpunctuated question in coding mode without demanding code changes', async () => {
    const f = fixture(input => answer(input, 'The UI was appending a duplicate completion report.'), { goal: 'Why am I getting a report when asking questions' });
    const result = await f.run();
    expect(result.report.status).toBe('complete');
    expect(result.ledger.data.actions).toHaveLength(0);
    expect(result.ledger.data.acceptanceCriteria).toHaveLength(0);
    expect(f.runTurn).toHaveBeenCalledOnce();
  });

  it('marks a follow-up discussion reply while preserving its unfinished task', async () => {
    const f = fixture(input => answer(input, 'The checkout needs an authenticated session.'));
    const goal = f.ledger.data.goal;
    f.config.resume = { taskId: f.ledger.data.taskId, message: 'Why does checkout need a session' };
    const { report } = await f.run(f.config.resume.message);
    expect(report).toMatchObject({ status: 'blocked', responseKind: 'discussion', summary: 'The checkout needs an authenticated session.' });
    expect(f.ledger.data.goal).toBe(goal);
    expect(f.ledger.data.blockers).toContain('Paused for discussion with the user.');
    expect(f.ledger.data.actions).toHaveLength(0);
  });

  it('does not accept progress-only or empty responses and does not restart them', async () => {
    const f = fixture(async (input) => {
      await input.onEvent('item/completed', { item: { id: 'progress', type: 'agentMessage', phase: 'commentary', text: 'Inspecting the file…' } });
    });
    const result = await f.run();
    expect(result.report.status).toBe('blocked');
    expect(result.report.summary).toContain('without a final answer');
    expect(f.runTurn).toHaveBeenCalledTimes(1);
  });

  it('does not claim an implementation is complete from final prose alone', async () => {
    const f = fixture((input) => answer(input, 'I will edit the file.'));
    expect((await f.run()).report.status).toBe('blocked');
    expect(f.ledger.data.blockers.join(' ')).toContain('without performing');
  });

  it('reads and edits through actual guarded tools, verifies the file, and persists its native session', async () => {
    const f = fixture(async (input) => {
      expect((await call(input, 'gitu_read_file', { path: 'answer.cjs' }))['success']).toBe(true);
      expect((await call(input, 'gitu_apply_edit', { path: 'answer.cjs', oldString: '1', newString: '2' }))['success']).toBe(true);
      await answer(input);
    });
    f.config.criteria = [{ text: 'answer syntax parses', verification: 'node --check answer.cjs', evidenceType: 'command_success' }];
    const result = await f.run();
    expect(result.report.status).toBe('complete');
    expect(readFileSync(path.join(f.root, 'answer.cjs'), 'utf8')).toContain('2');
    expect(f.ledger.data.execution).toMatchObject({ mode: 'codex-native', native: { threadId: 'thread-1', turnId: 'turn-1', status: 'completed', toolExecution: 'gitu-guarded' } });
    expect(result.report.verificationDetails?.some((e) => e.passed && e.command === 'node --check answer.cjs')).toBe(true);
    expect(f.runTurn).toHaveBeenCalledTimes(1);
  }, 30_000);

  it('runs a required focused check without adding every available project script', async () => {
    const f = fixture(async (input) => {
      await call(input, 'gitu_apply_edit', { path: 'answer.cjs', oldString: '1', newString: '2' });
      await answer(input);
    });
    f.config.criteria = [{ text: 'Answer parses', verification: 'node --check answer.cjs' }];
    f.guard.lock.testCommand = 'node unavailable-test.cjs';
    f.guard.lock.typecheckCommand = 'node unavailable-typecheck.cjs';
    f.guard.lock.lintCommand = 'node unavailable-lint.cjs';
    f.guard.lock.buildCommand = 'node unavailable-build.cjs';
    const result = await f.run();
    expect(result.report.status, f.ledger.data.blockers.join('; ')).toBe('complete');
    expect(f.ledger.data.evidence.map((item) => item.command)).toEqual(['node --check answer.cjs']);
  }, 30_000);

  it('reuses a scoped native check after an unrelated README edit and reports it as current proof', async () => {
    const f = fixture(async (input) => {
      await call(input, 'gitu_apply_edit', { path: 'answer.cjs', oldString: '1', newString: '2' });
      await call(input, 'gitu_run_command', { action: 'run', command: 'node --check answer.cjs', verificationScope: { paths: ['answer.cjs'], reason: 'Node syntax checking only reads this standalone file.' } });
      await call(input, 'gitu_write_file', { path: 'README.md', content: 'Updated setup notes.' });
      await answer(input);
    });
    f.config.criteria = [{ text: 'Answer parses', verification: 'node --check answer.cjs' }];
    const result = await f.run();
    expect(result.report.status, f.ledger.data.blockers.join('; ')).toBe('complete');
    expect(f.ledger.data.actions.filter((item) => item.tool === 'run_command')).toHaveLength(1);
    expect(result.report.verificationDetails?.filter((item) => item.passed && item.authority === 'latest')).toHaveLength(1);
  }, 30_000);

  it.each([false, true])('accepts a small verified documentation write without formal criteria or unrelated project checks (previously changed=%s)', async (previouslyChanged) => {
    const f = fixture(async (input) => {
      await call(input, 'gitu_write_file', { path: 'README.md', content: 'Correct setup instructions.' });
      await answer(input, 'Updated the setup instructions.');
    });
    if (previouslyChanged) {
      writeFileSync(path.join(f.root, 'README.md'), 'Earlier task notes.');
      f.ledger.data.filesChanged.push('README.md');
      f.ledger.activeWorkPhase()!.fileStartIndex = f.ledger.data.filesChanged.length;
    }
    f.ledger.data.goal = 'Correct the README wording';
    f.guard.lock.testCommand = 'node unavailable-test.cjs';
    expect((await f.run()).report.status, f.ledger.data.blockers.join('; ')).toBe('complete');
    expect(f.ledger.data.evidence.some((item) => item.kind === 'file' && item.passed)).toBe(true);
    expect(f.ledger.data.actions.some((item) => item.tool === 'run_command')).toBe(false);
  }, 30_000);

  it('never executes a duplicate dynamic write, including uncertain calls persisted before a crash', async () => {
    const f = fixture(async (input) => {
      const args = { path: 'answer.cjs', oldString: '1', newString: '2' };
      const a = await call(input, 'gitu_apply_edit', args, 'same');
      const b = await call(input, 'gitu_apply_edit', args, 'same');
      expect(a).toEqual(b);
      await answer(input);
    });
    await f.run();
    expect(f.ledger.data.actions.filter((a) => a.tool === 'apply_edit' && a.status === 'success')).toHaveLength(1);
    expect(f.ledger.data.execution?.native?.processedItems).toContain('tool:turn-1:same');
  });

  it('preserves command policy and denied human approval', async () => {
    const f = fixture(async (input) => {
      const result = await call(input, 'gitu_run_command', { action: 'run', command: 'arbitrary-unrecognized-executable' });
      expect(result['success']).toBe(false);
      await answer(input);
    });
    await f.run();
    expect(f.approve).toHaveBeenCalledTimes(1);
    expect(f.ledger.data.actions.some((a) => a.status === 'denied')).toBe(true);
    expect(f.onCodingEvent.mock.calls.some(([event]) => event.type === 'policy_denied')).toBe(true);
  });

  it('refuses reads and writes outside the project and keeps private task state sealed', async () => {
    const f = fixture(async (input) => {
      expect((await call(input, 'gitu_read_file', { path: '../outside.txt' }))['success']).toBe(false);
      expect((await call(input, 'gitu_write_file', { path: '../outside.txt', content: 'bad' }))['success']).toBe(false);
      expect((await call(input, 'gitu_read_file', { path: '.hermes/project-lock.json' }))['success']).toBe(false);
      await answer(input);
    });
    await f.run();
    expect(f.ledger.data.actions.filter((a) => a.status === 'denied')).toHaveLength(3);
  });

  it('declines direct OS, network expansion, and unknown approval requests', async () => {
    const f = fixture(async (input) => {
      for (const method of ['item/commandExecution/requestApproval', 'item/fileChange/requestApproval', 'unknown/request'])
        expect(await input.onRequest(method, {})).toEqual({ decision: 'decline' });
      expect(await input.onRequest('item/permissions/requestApproval', { permissions: { network: { enabled: true } } })).toEqual({ permissions: {}, scope: 'turn' });
      await answer(input);
    });
    await f.run();
    expect(f.approve).not.toHaveBeenCalled();
    const config = nativeCodexPermissions(f.guard, f.ledger);
    expect(config['features.shell_tool']).toBe(false);
    expect(config['features.unified_exec']).toBe(false);
    expect(config['features.apps']).toBe(false);
    expect(config['approval_policy']).toBe('on-request');
  });

  it('projects native plan updates into persistent todos', async () => {
    const f = fixture(async (input) => {
      await input.onEvent('turn/plan/updated', {
        plan: [
          { step: 'Inspect', status: 'inProgress' },
          { step: 'Edit', status: 'pending' },
        ],
      });
      await input.onEvent('turn/plan/updated', {
        plan: [
          { step: 'Inspect', status: 'completed' },
          { step: 'Edit', status: 'completed' },
        ],
      });
      await call(input, 'gitu_read_file', { path: 'answer.cjs' });
      await answer(input);
    });
    await f.run();
    expect(f.ledger.data.plan.map((s) => s.status)).toEqual(['done', 'done']);
    expect(f.onCodingEvent.mock.calls.some(([event]) => event.type === 'plan_created')).toBe(true);
  });

  it('supports actual checklist function calls and rejects invented task operations', async () => {
    const f = fixture(async (input) => {
      expect((await call(input, 'gitu_task', { operation: 'invented' }))['success']).toBe(false);
      await call(input, 'gitu_task', {
        operation: 'update_plan',
        plan: [
          { step: 'Inspect', status: 'inProgress' },
          { step: 'Unneeded step', status: 'pending' },
        ],
      });
      await call(input, 'gitu_read_file', { path: 'answer.cjs' });
      await call(input, 'gitu_task', { operation: 'update_plan', plan: [{ step: 'Inspect', status: 'completed' }] });
      await answer(input);
    });
    await f.run();
    expect(f.ledger.data.plan.map((step) => step.status)).toEqual(['done', 'cancelled']);
  });

  it('keeps unfinished native plans blocked without starting another turn', async () => {
    const f = fixture(async (input) => {
      await input.onEvent('turn/plan/updated', { plan: [{ step: 'Edit', status: 'pending' }] });
      await answer(input);
    });
    expect((await f.run()).report.status).toBe('blocked');
    expect(f.runTurn).toHaveBeenCalledTimes(1);
  });

  it('distinguishes provider failures and retains the interrupted native session', async () => {
    const f = fixture(async () => {
      throw new LlmError('ChatGPT quota exhausted.', { kind: 'quota_exhausted' });
    });
    await expect(f.run()).rejects.toMatchObject({ details: { kind: 'quota_exhausted' } });
    expect(f.ledger.data.execution?.native?.threadId).toBe('thread-1');
    expect(f.ledger.data.status).toBe('blocked');
    expect(f.runTurn).toHaveBeenCalledTimes(1);
  });

  it('preserves plan approval before starting native execution', async () => {
    const f = fixture((input) => answer(input));
    Object.assign(f.config, { requirePlanReview: true, planReviewHandler: async () => ({ approved: false }) });
    expect((await f.run()).report.status).toBe('blocked');
    expect(f.runTurn).not.toHaveBeenCalled();
  });
});
