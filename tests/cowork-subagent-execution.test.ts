import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { createBudgetAccount } from '../src/coding/budget.js';
import { CoworkMemory } from '../src/cowork/memory.js';
import { createSubAgentChildRunner, runMissionSession, type CoworkRunnerDeps } from '../src/cowork/runner.js';
import { CoworkStore, type CoworkAgent, type SubAgentInstance } from '../src/cowork/store.js';
import type { CoworkComputer } from '../src/cowork/computer.js';
import { CoworkSubAgentRunner, CoworkSubAgents, buildSubAgentEvidenceReport, evaluateSubAgentEvidence, type SubAgentChildRunInput, type SubAgentEvidenceReport, type SubAgentToolScope } from '../src/cowork/subagents.js';
import { ProjectGuard } from '../src/guard/project-guard.js';
import type { LlmClient, LlmMessage } from '../src/llm/llm.js';
import { MemoryStore } from '../src/memory/memory-store.js';
import { SkillStore } from '../src/skills/skills.js';
import type { ToolContext } from '../src/tools/tools.js';

const root = mkdtempSync(path.join(tmpdir(), 'cowork-subexec-'));
afterAll(() => rmSync(root, { recursive: true, force: true }));

function setup(name: string) {
  const dir = path.join(root, name);
  mkdirSync(dir, { recursive: true });
  // The tool context's project guard fails closed without a project marker.
  writeFileSync(path.join(dir, 'package.json'), '{"name":"subexec-test"}');
  const store = new CoworkStore(path.join(dir, 'cowork.json'));
  const chief = store.saveAgent({ name: 'Chief', systemPrompt: 'coordinate', chiefOfStaff: true });
  const marketing = store.saveAgent({ name: 'Marketing', systemPrompt: 'market', allowWrites: true });
  const conversation = store.saveConversation({ kind: 'group', memberIds: [chief.id, marketing.id], chiefId: chief.id });
  const mission = store.createMission({ conversationId: conversation.id, agentId: marketing.id, goal: 'Launch the campaign', criteria: ['brief published'] });
  const manager = new CoworkSubAgents(store);
  const runner = new CoworkSubAgentRunner(manager);
  const parentAccount = createBudgetAccount({ maxCostUsd: 2, maxTurns: 40, reserveUsd: 0.1 });
  const scope = (overrides: Partial<SubAgentToolScope> = {}): SubAgentToolScope => ({
    conversationId: conversation.id,
    missionId: mission.id,
    parentAgentId: marketing.id,
    rootAgentId: marketing.id,
    parentDepth: 1,
    parentPermissions: { allowShell: false, allowWrites: true, allowConfig: false, browser: false },
    parentSkills: ['web-research'],
    parentAccount,
    ...overrides,
  });
  return { dir, store, chief, marketing, conversation, mission, manager, runner, parentAccount, scope };
}

/** A well-formed tool marker, assembled from parts so no tag is ever mangled in transit. */
function toolCall(name: string, params: Record<string, unknown>): string {
  return `<tool>${JSON.stringify({ name, params })}</${'tool'}>`;
}

/** A queue-driven mock: each entry is one model reply, optionally inspecting the prompt. */
function mockLlm(replies: (string | ((messages: LlmMessage[]) => string))[]) {
  const seen: LlmMessage[][] = [];
  const client = {
    name: 'mock',
    seen,
    complete: async (messages: LlmMessage[]) => {
      // Snapshot: the loop mutates its message array in place between calls.
      seen.push([...messages]);
      const next = replies.shift();
      return typeof next === 'function' ? next(messages) : (next ?? 'done');
    },
  };
  return client as unknown as LlmClient & { seen: LlmMessage[][] };
}

function runnerDeps(dir: string, store: CoworkStore, llm: LlmClient, extra: Partial<CoworkRunnerDeps> = {}): CoworkRunnerDeps {
  return {
    agents: store.listAgents(),
    resolveLlm: () => llm,
    toolContext: () => ({ cwd: dir, guard: ProjectGuard.detect(dir), skills: SkillStore.forProject(dir) }) as ToolContext,
    store,
    memory: new CoworkMemory(MemoryStore.forProject(dir), path.basename(dir)),
    browser: false,
    ...extra,
  };
}

const okOutcome = (input: SubAgentChildRunInput): { summary: string; usage: { turns: number }; evidence: ReturnType<typeof buildSubAgentEvidenceReport> } => ({
  summary: 'five competitors compared',
  usage: { turns: 2 },
  evidence: buildSubAgentEvidenceReport(input.instance, 'five competitors compared', [
    { tool: 'web_fetch', params: {}, result: { ok: true, output: 'five competitors found' } },
  ]),
});

describe('spawn_sub_agent execution', () => {
  it('returns the child report as a tool result only — the conversation never hears the worker', async () => {
    const { store, conversation, runner, scope } = setup('voice');
    const result = await runner.run(scope(), okOutcome, { role: 'competitor-researcher', objective: 'Compare Piki POS with five competitors' });
    expect(result.ok).toBe(true);
    expect(result.output).toContain('competitor-researcher');
    expect(result.output).toContain('five competitors compared');
    expect(result.output).toContain('ceiling');
    expect(result.output).toContain('Evidence: 1/1 record(s) passed');
    expect(result.output).toContain('verify the work');
    const instance = store.subAgents()[0]!;
    expect(instance.status).toBe('completed');
    expect(instance.resultSummary).toBe('five competitors compared');
    // Invariant 1: nothing the child produced became a conversation message.
    expect(store.messages(conversation.id)).toEqual([]);
  });

  it('binds the exact account created at spawn, and fails closed when there is none', async () => {
    const { store, runner, manager, parentAccount, scope } = setup('account-binding');
    let captured: SubAgentChildRunInput | undefined;
    const result = await runner.run(scope(), async (input) => {
      captured = input;
      input.account.charge({ costUsd: 0.05, turns: 1 });
      return okOutcome(input);
    }, { role: 'analyst', objective: 'pricing' });
    expect(result.ok).toBe(true);
    const instance = store.subAgents()[0]!;
    // The account the child charged IS the account the manager sealed.
    expect(captured?.instance.id).toBe(instance.id);
    expect(manager.accountFor(instance.id)).toBeUndefined();
    expect(instance.spend).toMatchObject({ costUsd: 0.05, turns: 1 });
    // …and the charge propagated to the parent's envelope.
    expect(parentAccount.spend().costUsd).toBeCloseTo(0.05);

    // No parent account → no child account → no run. No fallback is invented.
    const denied = await runner.run(scope({ parentAccount: undefined }), okOutcome, { role: 'analyst', objective: 'pricing' });
    expect(denied.ok).toBe(false);
    expect(denied.output).toContain('failed closed');
    expect(store.subAgents()[1]).toMatchObject({ status: 'failed', statusReason: expect.stringContaining('budget account') });
  });

  it('aborts the running turn before the account seals, and cascades to descendants', async () => {
    const { store, manager, runner, scope } = setup('cancel-propagation');
    // Account still live when the abort is signalled? That is the ordering
    // invariant: a running turn is never left spending against a sealed one.
    const liveAtNotify: string[] = [];
    manager.onTerminate((id) => { if (manager.accountFor(id)) liveAtNotify.push(id); });

    const pending = runner.run(scope(), ({ signal }) => new Promise<never>((_resolve, reject) => signal.addEventListener('abort', () => reject(signal.reason))), { role: 'researcher', objective: 'slow work' });
    // Wait for the child to actually be running inside its turn.
    await vi.waitFor(() => expect(store.subAgents()[0]?.status).toBe('running'));
    const instance = store.subAgents()[0]!;
    expect(runner.runtimeOwns(instance.id)).toBe(true);

    // A grandchild record, the way a deeper tree would hold one.
    const grandchild = store.createSubAgent({
      conversationId: instance.conversationId,
      missionId: instance.missionId,
      parentAgentId: instance.id,
      rootAgentId: instance.rootAgentId,
      spawnedBy: { agentId: instance.id, reason: 'deeper lookup' },
      depth: 3,
      maxDepth: 2,
      permissions: { ...instance.permissions },
      skills: [],
      role: 'lookup',
      objective: 'check one source',
    });

    manager.terminate(instance.id, 'user stopped the mission');
    const result = await pending;
    expect(result.ok).toBe(false);
    expect(result.output).toContain('terminated');
    expect(liveAtNotify).toEqual([instance.id]);
    expect(store.getSubAgent(instance.id)?.status).toBe('terminated');
    expect(store.getSubAgent(grandchild.id)?.status).toBe('terminated');
    expect(manager.accountFor(instance.id)).toBeUndefined();
    expect(runner.runtimeOwns(instance.id)).toBe(false);
    // Terminal is final: a late settle cannot overwrite the termination.
    expect(manager.complete(instance.id, 'late report')).toBeUndefined();
    expect(store.getSubAgent(instance.id)?.status).toBe('terminated');
  });

  it('derives mission, parent and depth from the host scope — never from tool params', async () => {
    const { store, marketing, mission, runner, scope } = setup('identity-immutable');
    const result = await runner.run(scope(), okOutcome, {
      role: 'researcher',
      objective: 'find competitors',
      missionId: 'cm-forged',
      parentAgentId: 'ca-forged',
      rootAgentId: 'ca-forged',
      depth: 0,
      maxDepth: 99,
      budget: { maxCostUsd: 999 },
    });
    expect(result.ok).toBe(true);
    const instance = store.subAgents()[0]!;
    expect(instance.missionId).toBe(mission.id);
    expect(instance.parentAgentId).toBe(marketing.id);
    expect(instance.rootAgentId).toBe(marketing.id);
    expect(instance.depth).toBe(2);
    expect(instance.maxDepth).toBe(2);
    // The budget ask was clamped to the parent's envelope, not the forged $999.
    expect(instance.grantedBudget?.maxCostUsd).toBeCloseTo(1.9);
  });
});

describe('isolated child turn', () => {
  it('inherits the selected cloud server and routes child tools there', async () => {
    const { dir, store, marketing, runner, scope } = setup('child-cloud');
    store.saveAgent({ ...marketing, useHostComputer: false, cloudConnectionId: 'ssh-fixture' });
    const llm = mockLlm([toolCall('list_files', { path: '.' }), 'REPORT: cloud-only.txt is available on the cloud computer.']);
    const computerFor = vi.fn((_id: string, child?: CoworkAgent) => {
      expect(child).toMatchObject({ useHostComputer: false, cloudConnectionId: 'ssh-fixture' });
      return { execute: async () => ({ ok: true, output: 'cloud-only.txt' }) } as unknown as CoworkComputer;
    });
    const deps = runnerDeps(dir, store, llm, { computerFor });
    const result = await runner.run(scope(), createSubAgentChildRunner(deps), { role: 'researcher', objective: 'Inspect files on the selected cloud computer' });
    expect(result.ok).toBe(true);
    expect(computerFor).toHaveBeenCalledOnce();
    expect(String(llm.seen[1]!.at(-1)!.content)).toContain('cloud-only.txt');
  });

  it('executes tools under the narrowed grant and reports only as a tool result', async () => {
    const { dir, store, conversation, runner, scope } = setup('child-loop');
    const llm = mockLlm([
      toolCall('list_files', { path: '.' }),
      toolCall('ask_user', { question: 'which plan?' }),
      toolCall('spawn_sub_agent', { role: 'nested', objective: 'escape' }),
      'REPORT: five competitors compared, Piki POS wins on price.',
    ]);
    const deps = runnerDeps(dir, store, llm);
    const result = await runner.run(scope(), createSubAgentChildRunner(deps), { role: 'competitor-researcher', objective: 'Compare Piki POS with five competitors' });
    expect(result.ok).toBe(true);
    const instance = store.subAgents()[0]!;
    expect(instance).toMatchObject({ status: 'completed', resultSummary: expect.stringContaining('five competitors compared') });

    // The host tool ran under the child's own turn — its output came back into
    // the child's context (the package.json this test workspace holds)…
    const secondChildCall = String(llm.seen[1]!.at(-1)!.content);
    expect(secondChildCall).toContain('TOOL RESULT list_files (ok=true)');
    expect(secondChildCall).toContain('package.json');
    // …but conversation-facing tools were refused: no question card, no nested
    // spawn, no message from the worker anywhere in the transcript.
    expect(store.requests(conversation.id)).toEqual([]);
    expect(store.subAgents()).toHaveLength(1);
    expect(store.messages(conversation.id)).toEqual([]);

    // The child prompt: report-only-to-parent, honest budget, no blocked tools.
    const briefing = String(llm.seen[0]![0]!.content);
    expect(briefing).toContain('temporary sub-agent working for "Marketing"');
    expect(briefing).toContain('ONLY to your parent agent');
    expect(briefing).toContain('up to $1.90');
    expect(briefing).toContain('shared budget');
    expect(briefing).toContain('- todo_manage');
    expect(briefing).not.toContain('- ask_user');
    expect(briefing).not.toContain('- spawn_sub_agent');
    expect(briefing).not.toContain('- gitu_task');
    // The transcript was never part of the child's context.
    expect(llm.seen[0]!).toHaveLength(2);

    // The evidence trail: refusals are FAILED records (the gate must see
    // them), the real tool call passed, and the report persists on the record.
    expect(result.output).toContain('Evidence: 1/3 record(s) passed');
    expect(instance.evidence?.evidence.map((record) => record.passed)).toEqual([true, false, false]);
    expect(instance.evidence?.evidence[1]).toMatchObject({ tool: 'ask_user', passed: false });
  });

  it('stops at the granted turn ceiling and says so in the report', async () => {
    const { dir, store, runner, scope } = setup('child-budget');
    const llm = mockLlm([() => toolCall('list_files', { path: '.' })]);
    const deps = runnerDeps(dir, store, llm);
    const result = await runner.run(scope(), createSubAgentChildRunner(deps), { role: 'researcher', objective: 'loop forever', budget: { maxTurns: 2 } });
    expect(result.ok).toBe(true);
    const instance = store.subAgents()[0]!;
    expect(instance.grantedBudget?.maxTurns).toBe(2);
    expect(instance.resultSummary).toContain('[stopped early: the budget ran out]');
    expect(instance.spend?.turns).toBe(2);
  });

  it('runs inside a mission session: the teammate spawns, the child settles, the mission goes on', async () => {
    const { dir, store, conversation, mission, marketing, runner, parentAccount } = setup('mission-e2e');
    const spawnCall = toolCall('spawn_sub_agent', { role: 'competitor-researcher', objective: 'Compare Piki POS with five competitors', reason: 'the brief needs market data', budget: { maxCostUsd: 0.4 } });
    const llm = mockLlm([
      // The mission agent's first reply: spawn a researcher.
      spawnCall,
      // The child does one real tool call, then reports.
      toolCall('list_files', { path: '.' }),
      // The child's report (no further tools).
      'REPORT: Piki POS undercuts five competitors on entry pricing.',
      // The mission agent's closing reply with the status JSON.
      '{"status":"working","progress":"Researcher delivered competitor pricing; drafting the brief next.","criteriaMet":[false]}',
    ]);
    const deps = runnerDeps(dir, store, llm, {
      subAgents: runner,
      budgetFor: () => parentAccount,
    });
    const session = await runMissionSession({
      mission,
      agent: marketing,
      deps,
      append: (message) => store.appendMessage(conversation.id, message),
    });
    expect(session.status).toBe('working');
    expect(session.progress).toContain('competitor pricing');

    // The child's evidence: gate-validated, attributed, persisted.
    const instance = store.subAgents()[0]!;
    expect(instance).toMatchObject({ status: 'completed', missionId: mission.id, parentAgentId: marketing.id, depth: 2 });
    expect(instance.grantedBudget?.maxCostUsd).toBeCloseTo(0.4);
    expect(instance.evidence).toMatchObject({ instanceId: instance.id, parentAgentId: marketing.id, depth: 2, role: 'competitor-researcher' });
    expect(instance.evidence?.evidence).toHaveLength(1);
    expect(instance.evidence?.evidence[0]).toMatchObject({ tool: 'list_files', passed: true });

    // The parent's second model call saw the child's gate-approved report as a tool result.
    const parentSecondCall = llm.seen[3]!;
    expect(parentSecondCall.some((message) => typeof message.content === 'string' && message.content.includes('TOOL RESULT spawn_sub_agent (ok=true)') && message.content.includes('undercuts five competitors'))).toBe(true);
    // The only conversation message is the mission's own progress line.
    const messages = store.messages(conversation.id);
    expect(messages).toHaveLength(1);
    expect(messages[0]!.agentId).toBe(marketing.id);
  });
});

describe('execution tree', () => {
  it('nests by parent, reports LIVE spend while the account is open, and rolls totals up', async () => {
    const { store, marketing, chief, mission, manager, runner, scope } = setup('tree-live');
    // One running child (its account is open) and one completed child.
    const running = runner.run(scope(), ({ signal }) => new Promise<never>((_resolve, reject) => signal.addEventListener('abort', () => reject(signal.reason))), { role: 'researcher', objective: 'slow work', budget: { maxCostUsd: 0.5 } });
    await vi.waitFor(() => expect(store.subAgents()[0]?.status).toBe('running'));
    const live = store.subAgents()[0]!;
    manager.accountFor(live.id)!.charge({ costUsd: 0.13, turns: 2 });

    const done = manager.spawn(scope({ parentAgentId: chief.id, rootAgentId: chief.id }), { role: 'copywriter', objective: 'draft copy' });
    if (!done.ok) throw new Error('spawn failed');
    manager.complete(done.instance.id, 'copy drafted');

    const tree = manager.tree({ conversationId: scope().conversationId, missionId: mission.id });
    // Roots are the durable agents' children.
    expect(tree.nodes.map((node) => node.role).sort()).toEqual(['copywriter', 'researcher']);
    const liveNode = tree.nodes.find((node) => node.id === live.id)!;
    expect(liveNode).toMatchObject({ depth: 2, status: 'running', parentAgentId: marketing.id });
    // Live account wins over the (empty) sealed snapshot.
    expect(liveNode.spend).toEqual({ costUsd: 0.13, turns: 2 });
    expect(tree.totals).toMatchObject({ active: 1, completed: 1, spendUsd: 0.13 });

    // Settling seals the account: the node then reads the persisted snapshot.
    manager.terminate(live.id, 'test over');
    await running.catch(() => undefined);
    const after = manager.tree({ conversationId: scope().conversationId, missionId: mission.id });
    const sealed = after.nodes.find((node) => node.id === live.id)!;
    expect(sealed).toMatchObject({ status: 'terminated', statusReason: 'test over', spend: { costUsd: 0.13, turns: 2 } });
  });

  it('nests a grandchild under its parent and carries the gate verdict', () => {
    const { store, manager, scope } = setup('tree-nest');
    const parent = manager.spawn(scope(), { role: 'researcher', objective: 'gather' });
    if (!parent.ok) throw new Error('spawn failed');
    manager.complete(parent.instance.id, 'gathered sources');
    const grandchild = store.createSubAgent({
      conversationId: parent.instance.conversationId,
      missionId: parent.instance.missionId,
      parentAgentId: parent.instance.id,
      rootAgentId: parent.instance.rootAgentId,
      spawnedBy: { agentId: parent.instance.id, reason: 'deeper lookup' },
      depth: 3,
      maxDepth: 2,
      permissions: { ...parent.instance.permissions },
      skills: [],
      role: 'lookup',
      objective: 'check one source',
    });
    const tree = manager.tree({ conversationId: scope().conversationId });
    expect(tree.nodes).toHaveLength(1);
    expect(tree.nodes[0]!.children.map((child) => child.id)).toEqual([grandchild.id]);
    expect(tree.nodes[0]!.children[0]).toMatchObject({ depth: 3, parentAgentId: parent.instance.id });
  });

  it('notifies the host on spawn and on every settle, so a live UI follows the tree', () => {
    const store = new CoworkStore(path.join(root, 'tree-notify.json'));
    const agent = store.saveAgent({ name: 'Marketing', systemPrompt: 'market' });
    const conversation = store.saveConversation({ kind: 'dm', memberIds: [agent.id] });
    const mission = store.createMission({ conversationId: conversation.id, agentId: agent.id, goal: 'g', criteria: [] });
    const changes: string[] = [];
    const manager = new CoworkSubAgents(store, (conversationId) => changes.push(conversationId));
    const spawned = manager.spawn(
      {
        store,
        conversationId: conversation.id,
        missionId: mission.id,
        parentAgentId: agent.id,
        rootAgentId: agent.id,
        parentDepth: 1,
        parentPermissions: { allowShell: false, allowWrites: false, allowConfig: false, browser: false },
        parentSkills: [],
      },
      { role: 'researcher', objective: 'o' },
    );
    if (!spawned.ok) throw new Error('spawn failed');
    expect(changes).toEqual([conversation.id]);
    manager.markRunning(spawned.instance.id);
    manager.complete(spawned.instance.id, 'done');
    expect(changes).toEqual([conversation.id, conversation.id, conversation.id]);
  });

  it('scopes to one mission and can list the conversation history', () => {
    const { store, chief, manager, conversation, scope } = setup('tree-scope');
    const otherMission = store.createMission({ conversationId: conversation.id, agentId: chief.id, goal: 'Unrelated', criteria: [] });
    manager.spawn(scope(), { role: 'r1', objective: 'o1' });
    manager.spawn(scope({ missionId: otherMission.id, parentAgentId: chief.id, rootAgentId: chief.id }), { role: 'r2', objective: 'o2' });

    const mine = manager.tree({ conversationId: conversation.id, missionId: scope().missionId });
    expect(mine.nodes.map((node) => node.role)).toEqual(['r1']);
    const theirs = manager.tree({ conversationId: conversation.id, missionId: otherMission.id });
    expect(theirs.nodes.map((node) => node.role)).toEqual(['r2']);
    const all = manager.tree({ conversationId: conversation.id });
    expect(all.nodes).toHaveLength(2);
    expect(manager.history(conversation.id)).toHaveLength(2);
  });
});
  describe('evidence gate', () => {
  const base = { id: 'csa-x', parentAgentId: 'ca-p', depth: 2, role: 'researcher' } as const;
  const report = (overrides: Partial<SubAgentEvidenceReport> = {}): SubAgentEvidenceReport => ({
    instanceId: base.id,
    parentAgentId: base.parentAgentId,
    depth: base.depth,
    role: base.role,
    reportSummary: 'found five competitors',
    evidence: [{ id: 'ce-1', tool: 'web_fetch', kind: 'tool_result', passed: true, outputExcerpt: 'competitor pricing pages' }],
    ...overrides,
  });

  it('accepts a report that belongs to this child and carries passing evidence', () => {
    const instance = { ...base } as unknown as SubAgentInstance;
    const verdict = evaluateSubAgentEvidence(instance, report());
    expect(verdict).toMatchObject({ accepted: true, passedRecords: 1, totalRecords: 1 });
  });

  it('rejects a report that claims another instance, parent or depth', () => {
    const instance = { ...base } as unknown as SubAgentInstance;
    expect(evaluateSubAgentEvidence(instance, report({ instanceId: 'csa-other' })).reasons.some((reason) => reason.includes('instance'))).toBe(true);
    expect(evaluateSubAgentEvidence(instance, report({ parentAgentId: 'ca-other' })).reasons.some((reason) => reason.includes('parent'))).toBe(true);
    expect(evaluateSubAgentEvidence(instance, report({ depth: 1 })).reasons.some((reason) => reason.includes('depth'))).toBe(true);
  });

  it('rejects an empty report and a missing report', () => {
    const instance = { ...base } as unknown as SubAgentInstance;
    expect(evaluateSubAgentEvidence(instance, report({ reportSummary: '  ' })).reasons).toContain('the report is empty');
    expect(evaluateSubAgentEvidence(instance, undefined).reasons).toEqual(['the sub-agent returned no evidence report']);
  });

  it('rejects a trail with nothing that passed', () => {
    const instance = { ...base } as unknown as SubAgentInstance;
    const allFailed = report({ evidence: [{ id: 'ce-1', tool: 'web_fetch', kind: 'tool_result', passed: false, outputExcerpt: '404' }] });
    expect(evaluateSubAgentEvidence(instance, allFailed).reasons).toContain('no evidence record passed; an unverified report is not completion');
    const empty = report({ evidence: [] });
    expect(evaluateSubAgentEvidence(instance, empty).reasons).toContain('the child ran no tools, so its report carries no evidence');
  });

  it('rejects manufactured and trivial commands reusing the shared evidence predicates', () => {
    const instance = { ...base } as unknown as SubAgentInstance;
    const manufactured = report({ evidence: [{ id: 'ce-1', tool: 'run_command', command: 'echo five competitors verified', kind: 'command', passed: true, outputExcerpt: 'five competitors verified' }] });
    expect(evaluateSubAgentEvidence(instance, manufactured).reasons.some((reason) => reason.includes('manufactures its own output'))).toBe(true);
    const trivial = report({ evidence: [{ id: 'ce-1', tool: 'run_command', command: 'git status', kind: 'command', passed: true, outputExcerpt: 'nothing to commit' }] });
    expect(evaluateSubAgentEvidence(instance, trivial).reasons.some((reason) => reason.includes('no-op'))).toBe(true);
  });

  it('marks a gate-rejected child failed and tells the parent why', async () => {
    const { store, runner, scope } = setup('gate-reject');
    const result = await runner.run(scope(), async () => ({ summary: 'trust me, it works', usage: { turns: 1 } }), { role: 'researcher', objective: 'o' });
    expect(result.ok).toBe(false);
    expect(result.output).toContain('Evidence gate');
    expect(result.output).toContain('no evidence report');
    expect(store.subAgents()[0]).toMatchObject({ status: 'failed', statusReason: expect.stringContaining('evidence gate') });
  });

  it('lets the host loosen the gate: an unpriced knowledge child with no evidence can pass', async () => {
    const { store, scope } = setup('gate-loose');
    const runner = new CoworkSubAgentRunner(new CoworkSubAgents(store), { requirePassedEvidence: false, requireReport: true });
    const result = await runner.run(scope(), async (input) => ({ summary: 'answered from knowledge', usage: { turns: 1 }, evidence: buildSubAgentEvidenceReport(input.instance, 'answered from knowledge', []) }), { role: 'thinker', objective: 'o' });
    expect(result.ok).toBe(true);
    expect(store.subAgents()[0]).toMatchObject({ status: 'completed' });
  });
});

