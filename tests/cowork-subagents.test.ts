import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { createBudgetAccount } from '../src/coding/budget.js';
import { CoworkStore, type SubAgentPermissions } from '../src/cowork/store.js';
import {
  CoworkSubAgents,
  intersectSubAgentPermissions,
  MAX_COWORK_DEPTH,
  MAX_SUBAGENT_RUNTIME_MINUTES,
  parseSubAgentParams,
  type SubAgentSpawnScope,
} from '../src/cowork/subagents.js';

const root = mkdtempSync(path.join(tmpdir(), 'cowork-subagents-'));
afterAll(() => rmSync(root, { recursive: true, force: true }));

const ALL_PERMISSIONS: SubAgentPermissions = { allowShell: true, allowWrites: true, allowConfig: true, browser: true };

function setup(name: string) {
  const file = path.join(root, `${name}.json`);
  const store = new CoworkStore(file);
  const chief = store.saveAgent({ name: 'Chief', systemPrompt: 'coordinate', chiefOfStaff: true });
  const marketing = store.saveAgent({ name: 'Marketing', systemPrompt: 'market', allowShell: true, allowWrites: true });
  const conversation = store.saveConversation({ kind: 'group', memberIds: [chief.id, marketing.id], chiefId: chief.id });
  const mission = store.createMission({ conversationId: conversation.id, agentId: marketing.id, goal: 'Launch the Piki POS campaign', criteria: ['brief published'] });
  const manager = new CoworkSubAgents(store);
  const scope = (overrides: Partial<SubAgentSpawnScope> = {}): SubAgentSpawnScope => ({
    store,
    conversationId: conversation.id,
    missionId: mission.id,
    parentAgentId: marketing.id,
    rootAgentId: marketing.id,
    parentDepth: 1,
    parentPermissions: { allowShell: true, allowWrites: true, allowConfig: false, browser: true },
    parentSkills: ['web-research', 'copywriting'],
    ...overrides,
  });
  return { file, store, chief, marketing, conversation, mission, manager, scope };
}

describe('spawn_sub_agent parameters', () => {
  it('parses a complete request', () => {
    const parsed = parseSubAgentParams({ role: 'competitor-researcher', objective: 'Compare Piki POS with five competitors', reason: 'need market data', budget: { maxCostUsd: 0.4, maxTurns: 20 }, permissions: { browser: true }, skills: ['web-research'], maxRuntimeMinutes: 10 });
    expect(parsed).toMatchObject({ ok: true, value: { role: 'competitor-researcher', requestedBudget: { maxCostUsd: 0.4, maxTurns: 20 }, maxRuntimeMinutes: 10 } });
  });

  it('requires a role and an objective', () => {
    expect(parseSubAgentParams({ objective: 'x' })).toMatchObject({ ok: false, error: expect.stringContaining('role') });
    expect(parseSubAgentParams({ role: 'x' })).toMatchObject({ ok: false, error: expect.stringContaining('objective') });
    expect(parseSubAgentParams({ role: '  ', objective: 'x' })).toMatchObject({ ok: false });
  });

  it('rejects malformed budget, permission and skill fields rather than defaulting them', () => {
    expect(parseSubAgentParams({ role: 'r', objective: 'o', budget: 'unlimited' })).toMatchObject({ ok: false });
    expect(parseSubAgentParams({ role: 'r', objective: 'o', budget: { maxCostUsd: -1 } })).toMatchObject({ ok: false, error: expect.stringContaining('maxCostUsd') });
    expect(parseSubAgentParams({ role: 'r', objective: 'o', permissions: { chief: true } })).toMatchObject({ ok: false, error: expect.stringContaining('chief') });
    expect(parseSubAgentParams({ role: 'r', objective: 'o', permissions: { allowShell: 'yes' } })).toMatchObject({ ok: false });
    expect(parseSubAgentParams({ role: 'r', objective: 'o', skills: 'all' })).toMatchObject({ ok: false });
    expect(parseSubAgentParams({ role: 'r', objective: 'o', maxRuntimeMinutes: 0 })).toMatchObject({ ok: false });
  });

  it('caps the runtime and defaults the audit reason', () => {
    const parsed = parseSubAgentParams({ role: 'r', objective: 'o', maxRuntimeMinutes: 99_999 });
    expect(parsed).toMatchObject({ ok: true, value: { maxRuntimeMinutes: MAX_SUBAGENT_RUNTIME_MINUTES, reason: expect.stringContaining('r') } });
  });
});

describe('permission narrowing', () => {
  it('is the intersection of parent, request and host policy — never the union', () => {
    const parent = { allowShell: true, allowWrites: true, allowConfig: false, browser: true };
    expect(intersectSubAgentPermissions(parent, { allowShell: true, allowWrites: true, allowConfig: true, browser: true }))
      .toEqual({ allowShell: true, allowWrites: true, allowConfig: false, browser: true });
    expect(intersectSubAgentPermissions(parent, { allowShell: false }, { ...ALL_PERMISSIONS, browser: false }))
      .toEqual({ allowShell: false, allowWrites: true, allowConfig: false, browser: false });
    // A request that asks for nothing extra inherits exactly the parent's set.
    expect(intersectSubAgentPermissions(parent)).toEqual(parent);
  });

  it('structurally cannot grant chief authority', () => {
    const child = intersectSubAgentPermissions({ ...ALL_PERMISSIONS });
    expect('chief' in child).toBe(false);
  });
});

describe('spawn pipeline', () => {
  it('assigns depth, narrows permissions and records spawn provenance', () => {
    const { manager, marketing, mission, scope } = setup('spawn-happy');
    const result = manager.spawn(scope(), {
      role: 'competitor-researcher',
      objective: 'Compare Piki POS with five competitors',
      reason: 'the campaign brief needs market data',
      permissions: { allowShell: true, allowWrites: true, allowConfig: true, browser: true },
      skills: ['web-research', 'not-a-parent-skill'],
    }, { requestId: 'req-1' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.instance).toMatchObject({
      parentAgentId: marketing.id,
      rootAgentId: marketing.id,
      missionId: mission.id,
      depth: 2,
      maxDepth: MAX_COWORK_DEPTH,
      status: 'starting',
      // The parent holds no config permission, so the child cannot get one.
      permissions: { allowShell: true, allowWrites: true, allowConfig: false, browser: true },
      // Skills narrow the same way: a skill the parent lacks is dropped.
      skills: ['web-research'],
      spawnedBy: { agentId: marketing.id, reason: 'the campaign brief needs market data', requestId: 'req-1' },
    });
  });

  it('clamps the requested budget to the parent envelope minus its reserve, and the child sees only the grant', () => {
    const { manager, scope } = setup('spawn-clamp');
    // Mirrors the worked example: $0.32 available, $0.10 reserve, $0.50 asked.
    const parentAccount = createBudgetAccount({ maxCostUsd: 0.42, reserveUsd: 0.1 });
    parentAccount.charge({ costUsd: 0.1 });
    const result = manager.spawn(scope({ parentAccount }), { role: 'analyst', objective: 'pricing analysis', budget: { maxCostUsd: 0.5 } });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.instance.grantedBudget?.maxCostUsd).toBeCloseTo(0.22);
    expect(result.account?.budget.maxCostUsd).toBeCloseTo(0.22);
  });

  it('lets siblings share the parent money: each is capped by the envelope, the pool enforces the aggregate', () => {
    const { manager, scope } = setup('spawn-siblings');
    const parentAccount = createBudgetAccount({ maxCostUsd: 0.3 });
    // Allocations do not reserve: each child is clamped to what the parent has
    // left at spawn time, never to more.
    const first = manager.spawn(scope({ parentAccount }), { role: 'r1', objective: 'o1', budget: { maxCostUsd: 0.25 } });
    const second = manager.spawn(scope({ parentAccount }), { role: 'r2', objective: 'o2', budget: { maxCostUsd: 0.25 } });
    expect(first.ok && second.ok).toBe(true);
    if (!first.ok || !second.ok) return;
    expect(first.account?.budget.maxCostUsd).toBeCloseTo(0.25);
    expect(second.account?.budget.maxCostUsd).toBeCloseTo(0.25);
    // The aggregate is enforced where it must be: at charge time. Each child
    // is inside its own envelope here; the shared pool is what stops them —
    // together the children can never outspend the parent's $0.30.
    expect(first.account?.charge({ costUsd: 0.2 })).toBe(true);
    expect(second.account?.charge({ costUsd: 0.2 })).toBe(false);
    expect(parentAccount.exhausted()).toBe(true);
    // …and an exhausted parent spawns no further children.
    expect(manager.spawn(scope({ parentAccount }), { role: 'r3', objective: 'o3' })).toMatchObject({ ok: false, error: expect.stringContaining('exhausted') });
  });

  it('refuses to spawn beyond the depth ceiling, however high the request', () => {
    const { manager, scope } = setup('spawn-depth');
    // A sub-agent (depth 2) trying to spawn under the v1 ceiling.
    const denied = manager.spawn(scope({ parentDepth: 2 }), { role: 'r', objective: 'o' });
    expect(denied).toMatchObject({ ok: false, error: expect.stringContaining('depth') });
    // A host asking for a deeper tree than v1 allows is clamped, not honoured.
    const spawned = manager.spawn(scope({ maxDepth: 99 }), { role: 'r', objective: 'o' });
    expect(spawned.ok).toBe(true);
    if (spawned.ok) expect(spawned.instance.maxDepth).toBe(MAX_COWORK_DEPTH);
  });

  it('refuses when the parent budget is exhausted or out of delegation slots', () => {
    const { manager, scope } = setup('spawn-exhausted');
    const exhausted = createBudgetAccount({ maxCostUsd: 0.1 });
    exhausted.charge({ costUsd: 0.1 });
    expect(manager.spawn(scope({ parentAccount: exhausted }), { role: 'r', objective: 'o' }))
      .toMatchObject({ ok: false, error: expect.stringContaining('exhausted') });

    const slotted = createBudgetAccount({ maxCostUsd: 5, maxSubagents: 1 });
    expect(manager.spawn(scope({ parentAccount: slotted }), { role: 'r1', objective: 'o1' }).ok).toBe(true);
    expect(manager.spawn(scope({ parentAccount: slotted }), { role: 'r2', objective: 'o2' }))
      .toMatchObject({ ok: false, error: expect.stringContaining('delegation limit') });
    // Settling the first child frees its slot for a sibling.
    const first = manager.active()[0]!;
    manager.complete(first.id, 'done');
    expect(manager.spawn(scope({ parentAccount: slotted }), { role: 'r3', objective: 'o3' }).ok).toBe(true);
  });

  it('refuses provenance it cannot record honestly', () => {
    const { manager, scope } = setup('spawn-provenance');
    expect(manager.spawn(scope({ conversationId: 'gone' }), { role: 'r', objective: 'o' })).toMatchObject({ ok: false, error: expect.stringContaining('conversation') });
    expect(manager.spawn(scope({ missionId: 'gone' }), { role: 'r', objective: 'o' })).toMatchObject({ ok: false, error: expect.stringContaining('mission') });
  });

  it('spawns unmetered when the host supplies no parent account, and says so by omission', () => {
    const { manager, scope } = setup('spawn-unmetered');
    const result = manager.spawn(scope(), { role: 'r', objective: 'o' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.account).toBeUndefined();
    expect(result.instance.grantedBudget).toBeUndefined();
  });
});

describe('lifecycle', () => {
  it('walks starting → running → completed, sealing the account with a spend snapshot', () => {
    const { manager, scope } = setup('life-complete');
    const parentAccount = createBudgetAccount({ maxCostUsd: 1 });
    const spawned = manager.spawn(scope({ parentAccount }), { role: 'r', objective: 'o' });
    if (!spawned.ok) throw new Error('spawn failed');
    const id = spawned.instance.id;

    manager.markRunning(id);
    expect(manager.store.getSubAgent(id)).toMatchObject({ status: 'running' });

    spawned.account?.charge({ costUsd: 0.07, turns: 3 });
    const completed = manager.complete(id, 'found 12 sources');
    expect(completed).toMatchObject({ status: 'completed', resultSummary: 'found 12 sources', spend: { costUsd: 0.07, turns: 3, subagents: 0 } });
    expect(completed?.finishedAt).toBeDefined();
    // The account is sealed: the manager no longer hands it out.
    expect(manager.accountFor(id)).toBeUndefined();
    // Terminal states are final.
    expect(manager.fail(id, 'too late')).toBeUndefined();
    expect(manager.store.getSubAgent(id)?.status).toBe('completed');
  });

  it('records blocked with its reason and lets work resume', () => {
    const { manager, scope } = setup('life-blocked');
    const spawned = manager.spawn(scope(), { role: 'r', objective: 'o' });
    if (!spawned.ok) throw new Error('spawn failed');
    manager.markBlocked(spawned.instance.id, 'waiting on the pricing page');
    expect(manager.store.getSubAgent(spawned.instance.id)).toMatchObject({ status: 'blocked', statusReason: 'waiting on the pricing page' });
    manager.markRunning(spawned.instance.id);
    expect(manager.store.getSubAgent(spawned.instance.id)?.status).toBe('running');
  });

  it('terminates a subtree: a dead parent cannot leave children spending', () => {
    const { manager, store, scope } = setup('life-cascade');
    const parentAccount = createBudgetAccount({ maxCostUsd: 1, maxSubagents: 5 });
    const child = manager.spawn(scope({ parentAccount }), { role: 'researcher', objective: 'gather sources' });
    if (!child.ok) throw new Error('spawn failed');
    // A grandchild, recorded the way a deeper tree would create it (v1's
    // depth cap stops spawn() from making one; the cascade must still work).
    const grandchild = store.createSubAgent({
      conversationId: child.instance.conversationId,
      missionId: child.instance.missionId,
      parentAgentId: child.instance.id,
      rootAgentId: child.instance.rootAgentId,
      spawnedBy: { agentId: child.instance.id, reason: 'deeper lookup' },
      depth: 3,
      maxDepth: 2,
      permissions: { ...child.instance.permissions },
      skills: [],
      role: 'lookup',
      objective: 'check one source',
    });
    manager.terminate(child.instance.id, 'parent mission stopped');
    expect(store.getSubAgent(child.instance.id)).toMatchObject({ status: 'terminated', statusReason: 'parent mission stopped' });
    expect(store.getSubAgent(grandchild.id)?.status).toBe('terminated');
    expect(manager.active()).toEqual([]);
  });

  it('terminates every active worker when its mission ends, and no one else\'s', () => {
    const { manager, store, conversation, chief, scope } = setup('life-mission-end');
    const otherMission = store.createMission({ conversationId: conversation.id, agentId: chief.id, goal: 'Unrelated', criteria: [] });
    const ours = manager.spawn(scope(), { role: 'r1', objective: 'o1' });
    const theirs = manager.spawn(scope({ missionId: otherMission.id, parentAgentId: chief.id, rootAgentId: chief.id }), { role: 'r2', objective: 'o2' });
    if (!ours.ok || !theirs.ok) throw new Error('spawn failed');
    const settled = manager.terminateMissionSubtree(ours.instance.missionId!, 'mission completed');
    expect(settled.map((instance) => instance.id)).toEqual([ours.instance.id]);
    expect(store.getSubAgent(ours.instance.id)?.status).toBe('terminated');
    expect(store.getSubAgent(theirs.instance.id)?.status).toBe('starting');
  });

  it('sweeps active instances no live runtime owns, leaving settled history alone', () => {
    const { manager, store, scope } = setup('life-orphans');
    const running = manager.spawn(scope(), { role: 'r1', objective: 'o1' });
    const done = manager.spawn(scope(), { role: 'r2', objective: 'o2' });
    const owned = manager.spawn(scope(), { role: 'r3', objective: 'o3' });
    if (!running.ok || !done.ok || !owned.ok) throw new Error('spawn failed');
    manager.complete(done.instance.id, 'finished before the crash');
    const orphaned = manager.sweepOrphans((id) => id === owned.instance.id);
    expect(orphaned.map((instance) => instance.id)).toEqual([running.instance.id]);
    expect(store.getSubAgent(running.instance.id)).toMatchObject({ status: 'orphaned', statusReason: expect.stringContaining('restart') });
    expect(store.getSubAgent(done.instance.id)?.status).toBe('completed');
    expect(store.getSubAgent(owned.instance.id)?.status).toBe('starting');
  });
});

describe('persistence', () => {
  it('survives a store reload as audit history', () => {
    const { file, manager, marketing, mission, scope } = setup('persist');
    const spawned = manager.spawn(scope(), { role: 'r', objective: 'o', reason: 'audit me' });
    if (!spawned.ok) throw new Error('spawn failed');
    manager.complete(spawned.instance.id, 'done');

    const reloaded = new CoworkStore(file);
    const instance = reloaded.getSubAgent(spawned.instance.id);
    expect(instance).toMatchObject({
      parentAgentId: marketing.id,
      missionId: mission.id,
      depth: 2,
      status: 'completed',
      resultSummary: 'done',
      spawnedBy: { agentId: marketing.id, reason: 'audit me' },
    });
    expect(reloaded.subAgents({ missionId: mission.id })).toHaveLength(1);
  });

  it('is pruned with a deleted root agent', () => {
    const { store, marketing, manager, scope } = setup('persist-prune');
    manager.spawn(scope(), { role: 'r', objective: 'o' });
    expect(store.subAgents()).toHaveLength(1);
    store.deleteAgent(marketing.id);
    expect(store.subAgents()).toHaveLength(0);
  });

  it('is pruned with its conversation', () => {
    const { store, conversation, manager, scope } = setup('persist-prune-conv');
    manager.spawn(scope(), { role: 'r', objective: 'o' });
    expect(store.subAgents()).toHaveLength(1);
    store.deleteConversation(conversation.id);
    expect(store.subAgents()).toHaveLength(0);
  });
});

