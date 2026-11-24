import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createBudgetAccount } from '../src/coding/budget.js';
import { CoworkStore, type SubAgentInstance } from '../src/cowork/store.js';
import {
  buildSubAgentEvidenceReport,
  CoworkSubAgentRunner,
  CoworkSubAgents,
  parseSubAgentParams,
  subAgentResultSummary,
  type SubAgentChildRunner,
  type SubAgentToolScope,
} from '../src/cowork/subagents.js';
import { createSubAgentChildRunner, runConversationTurn, type CoworkRunnerDeps } from '../src/cowork/runner.js';
import type { LlmClient, LlmMessage } from '../src/llm/llm.js';
import type { ToolResult } from '../src/types.js';
import { ProjectGuard } from '../src/guard/project-guard.js';
import { CoworkMemory } from '../src/cowork/memory.js';
import { MemoryStore } from '../src/memory/memory-store.js';

const dirs: string[] = [];
function tempDir(): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'gitu-bg-subagent-'));
  dirs.push(dir);
  return dir;
}

afterEach(() => {
  while (dirs.length) rmSync(dirs.pop()!, { recursive: true, force: true });
});

function setupStore() {
  const dir = tempDir();
  const store = new CoworkStore(path.join(dir, 'cowork.json'));
  const agent = store.saveAgent({
    name: 'Nova',
    avatar: '✨',
    tagline: 'Research teammate',
    systemPrompt: 'Help the user.',
    provider: 'openai',
    model: 'gpt-4o',
    effort: 'medium',
    skills: ['web-research'],
    allowShell: true,
    allowWrites: true,
    allowConfig: false,
    chiefOfStaff: false,
  });
  const conv = store.saveConversation({ title: 'Background chat', kind: 'dm', memberIds: [agent.id] });
  const account = createBudgetAccount({ maxCostUsd: 5, maxTurns: 50, maxSubagents: 4 });
  return { dir, store, agent, conv, account };
}

function makeScope(store: CoworkStore, convId: string, agentId: string, account: ReturnType<typeof createBudgetAccount>, overrides: Partial<SubAgentToolScope> = {}): SubAgentToolScope {
  return {
    conversationId: convId,
    parentAgentId: agentId,
    rootAgentId: agentId,
    parentDepth: 1,
    parentPermissions: { allowShell: true, allowWrites: true, allowConfig: false, browser: false },
    parentSkills: ['web-research'],
    parentAccount: account,
    ...overrides,
  };
}

describe('parseSubAgentParams (background & model selection)', () => {
  it('parses background, provider, model, and effort cleanly', () => {
    const parsed = parseSubAgentParams({
      role: 'bg-scanner',
      objective: 'Check release notes in background',
      reason: 'User asked to run in background',
      background: true,
      provider: 'anthropic',
      model: 'claude-3-5-haiku-latest',
      effort: 'LOW',
    });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.value.background).toBe(true);
    expect(parsed.value.requestedModel).toEqual({
      provider: 'anthropic',
      model: 'claude-3-5-haiku-latest',
      effort: 'low',
    });
  });

  it('rejects non-boolean background and invalid effort/model types', () => {
    expect(parseSubAgentParams({ role: 'r', objective: 'o', reason: 'x', background: 'yes' }).ok).toBe(false);
    expect(parseSubAgentParams({ role: 'r', objective: 'o', reason: 'x', effort: 'turbo' }).ok).toBe(false);
    expect(parseSubAgentParams({ role: 'r', objective: 'o', reason: 'x', model: '   ' }).ok).toBe(false);
    expect(parseSubAgentParams({ role: 'r', objective: 'o', reason: 'x', provider: 123 }).ok).toBe(false);
  });
});

describe('CoworkSubAgentRunner detached background execution', () => {
  it('returns immediately with a running handle, survives parent turn abort, and notifies on completion', async () => {
    const { store, agent, conv, account } = setupStore();
    const manager = new CoworkSubAgents(store);
    const runner = new CoworkSubAgentRunner(manager);

    let releaseChild!: () => void;
    const childGate = new Promise<void>((resolve) => { releaseChild = resolve; });
    let childSignalAborted = false;

    const childRunner: SubAgentChildRunner = async ({ instance, signal }) => {
      await childGate;
      childSignalAborted = signal.aborted;
      const report = buildSubAgentEvidenceReport(instance, 'Collected 3 release notes.', [
        { tool: 'web_fetch', params: { url: 'https://example.com' }, result: { ok: true, output: 'v1.2.3 notes' } },
      ]);
      return { summary: 'Collected 3 release notes.', usage: { turns: 1 }, evidence: report };
    };

    let settledResolve!: (payload: { instance: SubAgentInstance; result: ToolResult }) => void;
    const settledPromise = new Promise<{ instance: SubAgentInstance; result: ToolResult }>((resolve) => {
      settledResolve = resolve;
    });

    const parentTurnAbort = new AbortController();
    const scope = makeScope(store, conv.id, agent.id, account, {
      signal: parentTurnAbort.signal,
      resolveModel: (req) => ({ ok: true, provider: req.provider ?? 'openai', model: req.model ?? 'gpt-4o-mini', effort: req.effort }),
      onBackgroundSettled: (instance, result) => settledResolve({ instance, result }),
    });

    const handle = await runner.run(scope, childRunner, {
      role: 'release-watcher',
      objective: 'Summarize release notes',
      reason: 'User asked to run in background',
      background: true,
      provider: 'openai',
      model: 'gpt-4o-mini',
      effort: 'low',
    });

    expect(handle.ok).toBe(true);
    const parsedHandle = JSON.parse(handle.output) as { status: string; background: boolean; instanceId: string; provider: string; model: string; effort: string };
    expect(parsedHandle.status).toBe('running');
    expect(parsedHandle.background).toBe(true);
    expect(parsedHandle.provider).toBe('openai');
    expect(parsedHandle.model).toBe('gpt-4o-mini');
    expect(parsedHandle.effort).toBe('low');
    expect(runner.runtimeOwns(parsedHandle.instanceId)).toBe(true);

    // Tree exposes background + chosen model while running.
    const tree = runner.tree({ conversationId: conv.id });
    expect(tree.nodes).toHaveLength(1);
    expect(tree.nodes[0]?.background).toBe(true);
    expect(tree.nodes[0]?.provider).toBe('openai');
    expect(tree.nodes[0]?.model).toBe('gpt-4o-mini');
    expect(tree.nodes[0]?.effort).toBe('low');
    expect(tree.nodes[0]?.status).toBe('running');

    // Ending/aborting the parent's chat turn must NOT abort the detached background worker.
    parentTurnAbort.abort(new Error('parent turn finished'));
    releaseChild();

    const settled = await settledPromise;
    expect(childSignalAborted).toBe(false);
    expect(settled.result.ok).toBe(true);
    expect(settled.instance.status).toBe('completed');
    expect(settled.instance.model).toBe('gpt-4o-mini');
    expect(settled.result.output).toContain('Model: openai/gpt-4o-mini (effort: low)');
    expect(settled.result.output).toContain('Collected 3 release notes.');
    expect(runner.runtimeOwns(parsedHandle.instanceId)).toBe(false);
  });

  it('notifies parent with failure when background sub-agent fails evidence gate', async () => {
    const { store, agent, conv, account } = setupStore();
    const runner = new CoworkSubAgentRunner(new CoworkSubAgents(store));

    let settledResolve!: (payload: { instance: SubAgentInstance; result: ToolResult }) => void;
    const settledPromise = new Promise<{ instance: SubAgentInstance; result: ToolResult }>((resolve) => {
      settledResolve = resolve;
    });

    const childRunner: SubAgentChildRunner = async ({ instance }) => ({
      summary: 'Claimed done without running tools',
      usage: { turns: 1 },
      evidence: buildSubAgentEvidenceReport(instance, 'Claimed done without running tools', []),
    });

    const handle = await runner.run(
      makeScope(store, conv.id, agent.id, account, {
        onBackgroundSettled: (instance, result) => settledResolve({ instance, result }),
      }),
      childRunner,
      { role: 'unverified-worker', objective: 'Do work', reason: 'bg test', background: true },
    );
    expect(handle.ok).toBe(true);

    const settled = await settledPromise;
    expect(settled.result.ok).toBe(false);
    expect(settled.instance.status).toBe('failed');
    expect(settled.result.output).toContain('Evidence gate');
  });

  it('terminates running background sub-agents on terminateAll / terminateConversationSubtree', async () => {
    const { store, agent, conv, account } = setupStore();
    const runner = new CoworkSubAgentRunner(new CoworkSubAgents(store));

    let settledResolve!: (payload: { instance: SubAgentInstance; result: ToolResult }) => void;
    const settledPromise = new Promise<{ instance: SubAgentInstance; result: ToolResult }>((resolve) => {
      settledResolve = resolve;
    });

    const childRunner: SubAgentChildRunner = async ({ signal }) => {
      await new Promise<void>((_, reject) => {
        signal.addEventListener('abort', () => reject(signal.reason ?? new Error('aborted')), { once: true });
      });
      return { summary: 'never', usage: { turns: 0 } };
    };

    const handle = await runner.run(
      makeScope(store, conv.id, agent.id, account, {
        onBackgroundSettled: (instance, result) => settledResolve({ instance, result }),
      }),
      childRunner,
      { role: 'long-runner', objective: 'Wait forever', reason: 'shutdown test', background: true },
    );
    expect(handle.ok).toBe(true);
    const { instanceId } = JSON.parse(handle.output) as { instanceId: string };
    expect(runner.runtimeOwns(instanceId)).toBe(true);

    const terminated = runner.terminateAll('Application stopping.');
    expect(terminated.map((i) => i.id)).toContain(instanceId);

    const settled = await settledPromise;
    expect(settled.result.ok).toBe(false);
    expect(settled.instance.status).toBe('terminated');
    expect(runner.runtimeOwns(instanceId)).toBe(false);
  });

  it('refuses spawn when host resolveModel rejects an invalid/unconfigured model', async () => {
    const { store, agent, conv, account } = setupStore();
    const runner = new CoworkSubAgentRunner(new CoworkSubAgents(store));
    const result = await runner.run(
      makeScope(store, conv.id, agent.id, account, {
        resolveModel: () => ({ ok: false, error: 'spawn_sub_agent refused: unknown provider "bogus".' }),
      }),
      async () => ({ summary: 'unused', usage: { turns: 0 } }),
      { role: 'worker', objective: 'Do work', reason: 'test', provider: 'bogus', model: 'nope' },
    );
    expect(result.ok).toBe(false);
    expect(result.output).toContain('unknown provider "bogus"');
    expect(store.subAgents({ conversationId: conv.id })).toHaveLength(0);
  });
});

describe('createSubAgentChildRunner & systemPrompt model selection wiring', () => {
  it('propagates agent-selected provider/model/effort to childAgent and surfaces available models in parent prompt', async () => {
    const { dir, store, agent, conv, account } = setupStore();
    const subAgents = new CoworkSubAgentRunner(new CoworkSubAgents(store));

    const seenChildModels: Array<{ provider?: string; model?: string; effort?: string }> = [];
    const seenParentSystemPrompts: string[] = [];

    const parentLlm: LlmClient = {
      async complete(messages: LlmMessage[]): Promise<string> {
        const sys = messages.find((m) => m.role === 'system');
        if (sys && typeof sys.content === 'string') seenParentSystemPrompts.push(sys.content);
        if (messages.some((m) => typeof m.content === 'string' && m.content.includes('TOOL RESULT spawn_sub_agent'))) {
          return 'Started the background worker on openai/gpt-4o-mini.';
        }
        return '<tool>{"name":"spawn_sub_agent","params":{"role":"fast-checker","objective":"Check workspace","reason":"User asked for background run","background":true,"provider":"openai","model":"gpt-4o-mini","effort":"low"}}</tool>';
      },
    };

    const childLlm: LlmClient = {
      async complete(messages: LlmMessage[]): Promise<string> {
        if (messages.some((m) => typeof m.content === 'string' && m.content.includes('TOOL RESULT list_files'))) {
          return 'Workspace checked cleanly.';
        }
        return '<tool>{"name":"list_files","params":{"path":"."}}</tool>';
      },
    };

    let settledResolve!: (payload: { instance: SubAgentInstance; result: ToolResult }) => void;
    const settledPromise = new Promise<{ instance: SubAgentInstance; result: ToolResult }>((resolve) => {
      settledResolve = resolve;
    });

    const deps: CoworkRunnerDeps = {
      agents: [agent],
      store,
      memory: new CoworkMemory(MemoryStore.forProject(dir), path.basename(dir)),
      subAgents,
      resolveLlm: () => parentLlm,
      subAgentLlm: (child) => {
        seenChildModels.push({ provider: child.provider, model: child.model, effort: child.effort });
        return childLlm;
      },
      budgetFor: () => account,
      resolveSubAgentModel: (req) => ({ ok: true, provider: req.provider, model: req.model, effort: req.effort }),
      availableSubAgentModels: () => 'AVAILABLE MODELS FOR SUB-AGENTS:\n- openai: gpt-4o, gpt-4o-mini',
      onBackgroundSubAgentSettled: (instance, result) => settledResolve({ instance, result }),
      toolContext: () => ({
        cwd: dir,
        guard: ProjectGuard.detect(dir, { allowUnmarked: true }),
      }),
      autoLearn: false,
    };

    const trigger = store.appendMessage(conv.id, { role: 'user', text: 'Run a workspace check in the background using a fast model.' });
    await runConversationTurn({
      conversation: conv,
      history: store.messages(conv.id),
      trigger,
      deps,
      append: (msg) => store.appendMessage(conv.id, msg),
    });

    expect(seenParentSystemPrompts[0]).toContain('AVAILABLE MODELS FOR SUB-AGENTS');
    expect(seenParentSystemPrompts[0]).toContain('gpt-4o-mini');

    const settled = await settledPromise;
    expect(settled.result.ok).toBe(true);
    expect(seenChildModels).toEqual([{ provider: 'openai', model: 'gpt-4o-mini', effort: 'low' }]);
    expect(subAgentResultSummary(settled.instance)).toContain('Model: openai/gpt-4o-mini (effort: low)');

    // Also verify createSubAgentChildRunner falls back to parent model when omitted.
    const fallbackRunner = createSubAgentChildRunner(deps);
    const spawned = new CoworkSubAgents(store).spawn(makeScope(store, conv.id, agent.id, account), {
      role: 'inherit-worker',
      objective: 'Inherit parent model',
      reason: 'default model test',
    });
    expect(spawned.ok).toBe(true);
    if (!spawned.ok || !spawned.account) return;
    await fallbackRunner({
      instance: spawned.instance,
      permissions: spawned.permissions,
      account: spawned.account,
      signal: new AbortController().signal,
    });
    expect(seenChildModels[1]).toEqual({ provider: 'openai', model: 'gpt-4o', effort: 'medium' });
  });
});
