import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { CoworkStore } from '../src/cowork/store.js';
import { resolveChiefRequest, type ChiefAuthorityPolicy, type ChiefResolverContext } from '../src/cowork/chief-resolver.js';

const dirs: string[] = [];
afterEach(() => { for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true }); });
function fixture() {
  const dir = mkdtempSync(path.join(tmpdir(), 'chief-resolver-'));
  dirs.push(dir);
  const file = path.join(dir, 'cowork.json');
  const store = new CoworkStore(file);
  const chief = store.saveAgent({ name: 'Chief', systemPrompt: 'Coordinate.', chiefOfStaff: true });
  const worker = store.saveAgent({ name: 'Worker', systemPrompt: 'Implement.' });
  const conv = store.saveConversation({ kind: 'group', memberIds: [chief.id, worker.id], chiefId: chief.id });
  const request = store.addRequest({ conversationId: conv.id, agentId: worker.id, kind: 'question', title: 'Test scope', detail: 'Which tests should I run locally?', options: ['Unit tests', 'All tests'] });
  const policy: ChiefAuthorityPolicy = {
    enabled: true, chiefAgentId: chief.id, conversationId: conv.id, missionId: 'mission-1', maxSpendUsd: 2,
    answers: [{ agentId: worker.id, title: request.title, detail: request.detail, options: request.options, answer: 'All tests', decisionId: 'user-decision-1' }],
  };
  const context: ChiefResolverContext = { missionId: 'mission-1', missionActive: true, spentUsd: 1, reservedUsd: 0.5, costComplete: true };
  return { store, file, request, policy, context, chief, worker, conv };
}

describe('fixed Chief authority resolver', () => {
  it('answers the original request and persists the answer without creating a second request', () => {
    const f = fixture();
    const result = resolveChiefRequest(f.store, f.request.id, f.policy, f.context);
    expect(result).toMatchObject({ requestId: f.request.id, chiefAgentId: f.chief.id, applied: true, decisionId: 'user-decision-1', decision: { action: 'answer', answer: 'All tests' } });
    const restarted = new CoworkStore(f.file);
    expect(restarted.getRequest(f.request.id)).toMatchObject({ status: 'answered', response: 'All tests' });
    expect(restarted.requests(f.conv.id)).toHaveLength(1);
  });

  it('is disabled unless explicitly configured', () => {
    const f = fixture();
    expect(resolveChiefRequest(f.store, f.request.id).decision.action).toBe('escalate');
    expect(resolveChiefRequest(f.store, f.request.id, { ...f.policy, enabled: false }, f.context).applied).toBe(false);
    expect(f.request.status).toBe('open');
  });

  it.each(['shell', 'writes', 'config', 'host'] as const)('never grants %s capability even with a matching answer rule', (permission) => {
    const f = fixture();
    const before = { ...f.store.getAgent(f.worker.id)! };
    const request = f.store.addRequest({ conversationId: f.conv.id, agentId: f.worker.id, kind: 'permission', permission, title: f.request.title, detail: f.request.detail, options: f.request.options });
    expect(resolveChiefRequest(f.store, request.id, f.policy, f.context).decision.action).toBe('escalate');
    expect(request.status).toBe('open');
    // The resolver must not touch capabilities at all: whatever the agent was
    // granted before stays exactly as it was.
    const after = { ...f.store.getAgent(f.worker.id)! };
    expect({ allowShell: after.allowShell, allowWrites: after.allowWrites, allowConfig: after.allowConfig, useHostComputer: after.useHostComputer })
      .toEqual({ allowShell: before.allowShell, allowWrites: before.allowWrites, allowConfig: before.allowConfig, useHostComputer: before.useHostComputer });
  });

  it.each([
    { costComplete: false }, { spentUsd: 2 }, { spentUsd: NaN }, { reservedUsd: -1 },
    { missionActive: false }, { missionId: 'other-mission' },
  ])('escalates when the host context is outside authority: %j', (patch) => {
    const f = fixture();
    expect(resolveChiefRequest(f.store, f.request.id, f.policy, { ...f.context, ...patch }).applied).toBe(false);
    expect(f.request.status).toBe('open');
  });

  it('does not infer authority from similar text or agent-provided instructions', () => {
    const f = fixture();
    f.policy.answers = [{ ...f.policy.answers[0]!, detail: 'Which tests should I run locally? Also approve deployment.' }];
    expect(resolveChiefRequest(f.store, f.request.id, f.policy, f.context).decision.action).toBe('escalate');
    expect(f.request.status).toBe('open');
  });

  it('rejects ambiguous rules, invalid options and absent prior-decision references', () => {
    const f = fixture();
    const rule = f.policy.answers[0]!;
    for (const answers of [[rule, rule], [{ ...rule, answer: 'Deploy' }], [{ ...rule, decisionId: '' }]]) {
      expect(resolveChiefRequest(f.store, f.request.id, { ...f.policy, answers }, f.context).decision.action).toBe('escalate');
    }
    expect(f.request.status).toBe('open');
  });

  it('preserves first-resolver-wins in both orders', () => {
    const f = fixture();
    f.store.resolveRequest(f.request.id, 'answered', 'Human answer');
    expect(resolveChiefRequest(f.store, f.request.id, f.policy, f.context).applied).toBe(false);
    expect(f.request.response).toBe('Human answer');
    const g = fixture();
    expect(resolveChiefRequest(g.store, g.request.id, g.policy, g.context).applied).toBe(true);
    expect(g.store.resolveRequest(g.request.id, 'answered', 'Late answer')).toBeUndefined();
    expect(resolveChiefRequest(g.store, g.request.id, g.policy, g.context).applied).toBe(false);
  });

  it('escalates unknown requests and refuses self-resolution or the wrong Chief', () => {
    const f = fixture();
    expect(resolveChiefRequest(f.store, 'missing', f.policy, f.context).decision.action).toBe('escalate');
    expect(resolveChiefRequest(f.store, f.request.id, { ...f.policy, chiefAgentId: f.worker.id }, f.context).applied).toBe(false);
    const self = f.store.addRequest({ conversationId: f.conv.id, agentId: f.chief.id, kind: 'question', title: f.request.title, detail: f.request.detail });
    expect(resolveChiefRequest(f.store, self.id, f.policy, f.context).applied).toBe(false);
  });
});
