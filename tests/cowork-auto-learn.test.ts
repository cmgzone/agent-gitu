import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { runConversationTurn, type CoworkRunnerDeps } from '../src/cowork/runner.js';
import { CoworkMemory } from '../src/cowork/memory.js';
import { CoworkStore, type CoworkAgent, type CoworkConversation } from '../src/cowork/store.js';
import { MemoryStore } from '../src/memory/memory-store.js';
import { SkillStore } from '../src/skills/skills.js';
import { ProjectGuard } from '../src/guard/project-guard.js';
import { ensureGituHome } from '../src/workspace/home.js';
import type { ToolContext } from '../src/tools/tools.js';

// The global setup file already points HERMES_HOME_DIR at a temp dir, so
// CoworkMemory.forWorkspace()/SkillStore.forProject() resolve there.
const TEST_ROOT = mkdtempSync(path.join(tmpdir(), 'cowork-learn-'));
const WORKSPACE = path.join(TEST_ROOT, 'workspace');
mkdirSync(WORKSPACE, { recursive: true });
writeFileSync(path.join(WORKSPACE, 'package.json'), '{"name":"cowork-learn-workspace"}');

function makeAgentInput(name: string, extra: Record<string, unknown> = {}) {
  return { name, systemPrompt: `You are ${name}.`, avatar: { color: '#8f80ff', shape: 'cube' }, tagline: `${name} specialist`, ...extra };
}
function toolContext(): ToolContext {
  // list_files/create_skill need a real guard + skills store.
  return { cwd: WORKSPACE, guard: ProjectGuard.detect(WORKSPACE), skills: SkillStore.forProject(WORKSPACE) } as unknown as ToolContext;
}
function depsFor(script: string[], overrides: Partial<CoworkRunnerDeps> = {}): CoworkRunnerDeps {
  let call = 0;
  return {
    agents: [],
    resolveLlm: () => ({ complete: async () => script[Math.min(call++, script.length - 1)] }) as never,
    toolContext,
    ...overrides,
  };
}
async function dmTurn(store: CoworkStore, agent: CoworkAgent, conv: CoworkConversation, text: string, script: string[], deps?: Partial<CoworkRunnerDeps>) {
  const trigger = store.appendMessage(conv.id, { role: 'user', text, via: 'web' });
  // currentMembers() reads deps.agents, so it must contain the saved agent.
  return runConversationTurn({ conversation: conv, history: store.messages(conv.id), trigger, deps: depsFor(script, { agents: store.listAgents(), ...deps }), append: (m) => store.appendMessage(conv.id, m) });
}

const listFilesCall = '<tool>{"name":"list_files","params":{"path":"."}}</tool>';

describe('cowork auto-learn', () => {
  it('auto-learns a reusable skill after a completed turn', async () => {
    const store = new CoworkStore(path.join(TEST_ROOT, 'learn-skill.json'));
    const agent = store.saveAgent(makeAgentInput('learner', { allowConfig: true }));
    const conv = store.saveConversation({ kind: 'dm', memberIds: [agent.id] });
    const script = [
      `Checking… ${listFilesCall}`,
      'Done — deployed the landing page.',
      JSON.stringify({ thought: 'deploy flow is repeatable', action: { type: 'tool_call', tool: 'create_skill', params: { name: 'deploy-landing', description: 'deploy the landing page', instructions: '1. list files 2. verify 3. publish', global: true }, reason: 'auto-learned', expected: 'skill saved' } }),
    ];
    const result = await dmTurn(store, agent, conv, 'deploy the landing page', script);
    expect(result.error).toBeUndefined();
    const skill = SkillStore.forProject(WORKSPACE).get('deploy-landing');
    expect(skill).toBeTruthy();
    expect(skill!.instructions).toContain('verify');
    expect(store.messages(conv.id).at(-1)!.text).toContain('deployed the landing page');
  });

  it('records a trusted success-pattern observation via memory', async () => {
    const store = new CoworkStore(path.join(TEST_ROOT, 'learn-pattern.json'));
    const agent = store.saveAgent(makeAgentInput('patterner'));
    const conv = store.saveConversation({ kind: 'dm', memberIds: [agent.id] });
    const memory = new CoworkMemory(MemoryStore.forProject(ensureGituHome().workspace), path.basename(ensureGituHome().workspace));
    const script = [
      `Checking… ${listFilesCall}`,
      'Done.',
      JSON.stringify({ thought: 'small durable pattern', action: { type: 'tool_call', tool: 'memory', params: { action: 'record_pattern', subject: 'email triage verified via one read-only probe', evidence: 'the IMAP probe passed' } }, reason: 'auto-learned', expected: 'pattern recorded' }),
    ];
    await dmTurn(store, agent, conv, 'triage the inbox', script, { memory, store });
    const entries = MemoryStore.forProject(ensureGituHome().workspace).query({ limit: 50 });
    const obs = entries.filter((e) => e.type === 'evidence' && e.claim.includes('email triage verified'));
    expect(obs.length).toBe(1);
    expect(obs[0]!.status).toBe('verified');
    expect(obs[0]!.sourceType).toBe('task_completion');
  });

  it('does not learn when autoLearn is disabled', async () => {
    const store = new CoworkStore(path.join(TEST_ROOT, 'learn-off.json'));
    const agent = store.saveAgent(makeAgentInput('nolearner', { allowConfig: true }));
    const conv = store.saveConversation({ kind: 'dm', memberIds: [agent.id] });
    const script = [
      `Checking… ${listFilesCall}`,
      'Done.',
      JSON.stringify({ thought: 'x', action: { type: 'tool_call', tool: 'create_skill', params: { name: 'should-not-exist', description: 'd', instructions: 'i' } } }),
    ];
    await dmTurn(store, agent, conv, 'do it', script, { autoLearn: false });
    expect(SkillStore.forProject(WORKSPACE).get('should-not-exist')).toBeUndefined();
  });

  it('does not reflect when the turn used no tools', async () => {
    const store = new CoworkStore(path.join(TEST_ROOT, 'learn-notools.json'));
    const agent = store.saveAgent(makeAgentInput('chatter', { allowConfig: true }));
    const conv = store.saveConversation({ kind: 'dm', memberIds: [agent.id] });
    const script = ['Just chatting, no work needed.'];
    await dmTurn(store, agent, conv, 'hello', script);
    expect(SkillStore.forProject(WORKSPACE).get('chatter-skill')).toBeUndefined();
  });

  it('skips reflection when a skill was already created this turn', async () => {
    const store = new CoworkStore(path.join(TEST_ROOT, 'learn-already.json'));
    const agent = store.saveAgent(makeAgentInput('manual', { allowConfig: true }));
    const conv = store.saveConversation({ kind: 'dm', memberIds: [agent.id] });
    const createThisTurn = '<tool>{"name":"create_skill","params":{"name":"made-by-hand","description":"d","instructions":"1. do it"}}</tool>';
    const script = [
      createThisTurn,
      'Saved that skill.',
      JSON.stringify({ thought: 'x', action: { type: 'tool_call', tool: 'create_skill', params: { name: 'reflection-extra', description: 'd', instructions: 'i' } } }),
    ];
    await dmTurn(store, agent, conv, 'save a skill', script);
    expect(SkillStore.forProject(WORKSPACE).get('made-by-hand')).toBeTruthy();
    expect(SkillStore.forProject(WORKSPACE).get('reflection-extra')).toBeUndefined();
  });
});
