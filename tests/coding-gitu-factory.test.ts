import { describe, expect, it } from 'vitest';
import { Gitu } from '../src/agent/gitu.js';
import { AgentStore } from '../src/agents/registry.js';
import { ConnectionRegistry } from '../src/connections/connections.js';
import { ScriptedMockLlm } from '../src/llm/llm.js';
import { buildGituConfig, createGitu, type GituFactoryDependencies, type GituFactoryOptions } from '../src/coding/gitu-factory.js';

/**
 * Characterization tests for the extracted engine factory.
 *
 * The reason this factory exists is that a second client (Cowork, CLI, VM
 * worker) must not be able to diverge silently on engine configuration. These
 * tests pin the two things that would make it diverge for real:
 *
 *   1. every session-bound closure reaches the engine *by identity* — the
 *      factory must not wrap, drop, substitute or reorder one;
 *   2. the defaults and derivations that used to live inline in the run handler
 *      are produced by the factory itself.
 *
 * Identity is asserted rather than "an approval eventually works" because the
 * failure mode being guarded against is a closure dropped during extraction:
 * that compiles perfectly and only shows up as broken approvals at runtime.
 *
 * Scope note: these assertions prove the callbacks reach the engine's
 * configuration. That the engine then actually invokes them is Gitu's existing
 * behaviour, covered by the agent and server suites — this factory does not
 * re-implement any of it.
 */

const llm = new ScriptedMockLlm([() => '{}']);

function baseOptions(overrides: Partial<GituFactoryOptions> = {}): GituFactoryOptions {
  return { workspaceRoot: 'C:\\project', llm, mode: 'agent', ...overrides };
}

function baseDeps(overrides: Partial<GituFactoryDependencies> = {}): GituFactoryDependencies {
  return {
    approvalHandler: async () => true,
    planReviewHandler: async () => ({ approved: true }),
    askUserHandler: async () => 'answer',
    onEvent: () => {},
    connections: new ConnectionRegistry(),
    connectionContext: () => 'connections: none',
    connectionActionHandler: async () => ({ message: 'ok' }),
    safestProviderRead: () => undefined,
    connectionOperationHandler: async () => ({ message: 'ok' }),
    connectionRecoveryCheck: () => ({ action: 'setup-new', reason: 'needs a new connection' }),
    connectionRequestHandler: async () => false,
    ...overrides,
  };
}

describe('buildGituConfig defaults', () => {
  it('defaults approval, learning and plan review exactly as the inline handler did', () => {
    const config = buildGituConfig(baseOptions(), baseDeps());
    expect(config.autoApprove).toBe(false);
    expect(config.autoLearn).toBe(true);
    expect(config.requirePlanReview).toBe(true);
  });

  it('honours an explicit false instead of treating it as absent', () => {
    // The classic `||` regression: `autoLearn: false` must survive.
    const config = buildGituConfig(baseOptions({ autoApprove: true, autoLearn: false, requirePlanReview: false }), baseDeps());
    expect(config.autoApprove).toBe(true);
    expect(config.autoLearn).toBe(false);
    expect(config.requirePlanReview).toBe(false);
  });
});

describe('buildGituConfig per-run inputs', () => {
  it('uses the workspace root as the engine cwd and keeps the host llm', () => {
    const config = buildGituConfig(baseOptions({ workspaceRoot: 'D:\\repo', llm }), baseDeps());
    expect(config.cwd).toBe('D:\\repo');
    expect(config.llm).toBe(llm);
    expect(config.mode).toBe('agent');
  });

  it('passes every optional run input through unchanged', () => {
    const index = { fake: 'index' } as unknown as GituFactoryOptions['index'];
    const conversationHistory = [{ role: 'user' as const, content: 'earlier turn' }];
    const images = [{ name: 'screen.png', dataUrl: 'data:image/png;base64,AAAA' }];
    const attachments = [{ name: 'notes.md', text: 'notes' }] as unknown as GituFactoryOptions['attachments'];
    const resume = { taskId: 't_1', message: 'keep going' };
    const config = buildGituConfig(
      baseOptions({
        mode: 'standard',
        index,
        criteria: ['tests pass'],
        scopeFiles: ['src/a.ts'],
        extraConstraints: ['no new deps'],
        effort: 'high',
        actionProtocolMode: 'native',
        resume,
        conversationHistory,
        images,
        attachments,
        supportsImages: true,
        contextWindowTokens: 128_000,
        modelCapability: 'high',
      }),
      baseDeps(),
    );
    expect(config.index).toBe(index);
    expect(config.criteria).toEqual(['tests pass']);
    expect(config.scopeFiles).toEqual(['src/a.ts']);
    expect(config.extraConstraints).toEqual(['no new deps']);
    expect(config.effort).toBe('high');
    expect(config.actionProtocolMode).toBe('native');
    expect(config.resume).toBe(resume);
    expect(config.conversationHistory).toBe(conversationHistory);
    expect(config.images).toBe(images);
    expect(config.attachments).toBe(attachments);
    expect(config.supportsImages).toBe(true);
    expect(config.contextWindowTokens).toBe(128_000);
    expect(config.modelCapability).toBe('high');
  });
});

describe('session-bound handlers reach the engine by identity', () => {
  it('passes every closure straight through without wrapping it', () => {
    const deps = baseDeps();
    const config = buildGituConfig(baseOptions(), deps);
    expect(config.approvalHandler).toBe(deps.approvalHandler);
    expect(config.planReviewHandler).toBe(deps.planReviewHandler);
    expect(config.askUserHandler).toBe(deps.askUserHandler);
    expect(config.onEvent).toBe(deps.onEvent);
    expect(config.connectionContext).toBe(deps.connectionContext);
    expect(config.connectionActionHandler).toBe(deps.connectionActionHandler);
    expect(config.safestProviderRead).toBe(deps.safestProviderRead);
    expect(config.connectionOperationHandler).toBe(deps.connectionOperationHandler);
    expect(config.connectionRecoveryCheck).toBe(deps.connectionRecoveryCheck);
    expect(config.connectionRequestHandler).toBe(deps.connectionRequestHandler);
  });

  it('gives the host a live event sink rather than an internal wrapper', () => {
    const seen: string[] = [];
    const config = buildGituConfig(baseOptions(), baseDeps({ onEvent: (text) => seen.push(text) }));
    config.onEvent?.('ledger   created: t_42');
    expect(seen).toEqual(['ledger   created: t_42']);
  });

  it('routes an approval request through the host handler', async () => {
    const asked: { tool: string; why: string }[] = [];
    const config = buildGituConfig(
      baseOptions(),
      baseDeps({
        approvalHandler: async (request) => {
          asked.push({ tool: request.tool, why: request.why });
          return false;
        },
      }),
    );
    const approved = await config.approvalHandler!({ tool: 'run_command', why: 'destructive', summary: 'rm -rf build' });
    expect(approved).toBe(false);
    expect(asked).toEqual([{ tool: 'run_command', why: 'destructive' }]);
  });

  it('routes a plan review through the host handler', async () => {
    const config = buildGituConfig(baseOptions(), baseDeps({ planReviewHandler: async () => ({ approved: false, note: 'split it up' }) }));
    const decision = await config.planReviewHandler!({ criteria: ['tests pass'], steps: [{ description: 'implement', verification: 'npm test' }] });
    expect(decision.approved).toBe(false);
    expect(decision.note).toBe('split it up');
  });

  it('routes a question through the host handler', async () => {
    const config = buildGituConfig(baseOptions(), baseDeps({ askUserHandler: async () => 'use PostgreSQL' }));
    expect(await config.askUserHandler!([{ question: 'Which database?', options: ['PostgreSQL', 'SQLite'] }])).toBe('use PostgreSQL');
  });
});

describe('buildGituConfig derivations', () => {
  it('derives prerequisite recovery from the connection registry', () => {
    const config = buildGituConfig(baseOptions(), baseDeps());
    expect(config.prerequisiteRecovery?.providers?.[0]?.id).toBe('saved-connections');
  });

  it('derives the specialist roster and prompt section from the agent store', () => {
    const store = new AgentStore();
    const config = buildGituConfig(baseOptions(), baseDeps({ agents: store }));
    const specialists = config.specialists ?? [];
    expect(specialists.map((entry) => entry.name)).toContain('explore');
    // Roles must survive: the risk planner sizes the roster using them.
    expect(specialists.every((entry) => entry.role.length > 0)).toBe(true);
    expect(config.agentsSection).toContain('explore');
  });

  it('omits the prompt section when the roster renders empty, keeping the empty roster', () => {
    const config = buildGituConfig(baseOptions(), baseDeps({ agents: { renderForPrompt: () => '', list: () => [] } }));
    expect('agentsSection' in config).toBe(false);
    expect(config.specialists).toEqual([]);
  });

  it('omits both specialist fields when no roster is supplied at all', () => {
    const config = buildGituConfig(baseOptions(), baseDeps());
    expect('agentsSection' in config).toBe(false);
    expect('specialists' in config).toBe(false);
  });
});

describe('buildGituConfig optional dependencies', () => {
  it('reads back as undefined when the host supplies none', () => {
    const config = buildGituConfig(baseOptions(), baseDeps());
    expect(config.index).toBeUndefined();
    expect(config.skills).toBeUndefined();
    expect(config.mcp).toBeUndefined();
    expect(config.lsp).toBeUndefined();
    expect(config.subagents).toBeUndefined();
    expect(config.universalRegistry).toBeUndefined();
    expect(config.browser).toBeUndefined();
  });

  it('keeps supplied services by identity', () => {
    const skills = { marker: 'skills' } as unknown as GituFactoryDependencies['skills'];
    const browser = { marker: 'browser' } as unknown as GituFactoryDependencies['browser'];
    const config = buildGituConfig(baseOptions(), baseDeps({ skills, browser }));
    expect(config.skills).toBe(skills);
    expect(config.browser).toBe(browser);
  });
});

describe('createGitu', () => {
  it('constructs the engine from the canonical configuration', () => {
    const gitu = createGitu(baseOptions(), baseDeps());
    expect(gitu).toBeInstanceOf(Gitu);
    // One engine per call: sessions must never share an instance.
    expect(createGitu(baseOptions(), baseDeps())).not.toBe(gitu);
  });
});
