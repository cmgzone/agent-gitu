import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Script } from 'node:vm';
import { CompanyStore, effectiveFileLimit } from '../src/company/store.js';
import { CompanyCoordinator } from '../src/company/coordinator.js';
import { CompanyLlm } from '../src/company/llm.js';
import { companyPricing, companyUsageCostUsd } from '../src/company/pricing.js';
import { COMPANY_CONNECTIONS_JS } from '../src/server/ui-company-connections.js';
import { COMPANY_WALLETS_JS } from '../src/server/ui-company-wallets.js';
import { companyPolicy } from '../src/company/policy.js';
import { CoworkStore } from '../src/cowork/store.js';
import { CoworkMemory } from '../src/cowork/memory.js';
import { COMPANY_JS } from '../src/server/ui-companies.js';
import { FILE_UPLOAD_JS } from '../src/server/ui-files.js';

const stores: CompanyStore[] = [];
const roots: string[] = [];
function fixture() {
  const root = mkdtempSync(path.join(os.tmpdir(), 'gitu-company-'));
  roots.push(root);
  const store = new CompanyStore(root);
  stores.push(store);
  return store;
}
function running(store: CompanyStore) {
  const c = store.create({ name: 'Studio', purpose: 'Build useful products', monthlyBudgetUsd: null, maxFileBytes: null });
  store.update(c.id, { leadId: 'lead', conversationId: 'chat' });
  return store.transition(c.id, 'running');
}
afterEach(() => {
  for (const s of stores.splice(0)) s.close();
  for (const r of roots.splice(0)) rmSync(r, { recursive: true, force: true });
});
describe('Companies', () => {
  it('requires complete finite prices, records the pricing snapshot and preserves reservation ownership', async () => {
    expect(companyPricing({ source: 'models.dev', inputPricePerMillion: 1 })).toBeUndefined();
    expect(companyPricing({ source: 'models.dev', inputPricePerMillion: 1, outputPricePerMillion: -1 })).toBeUndefined();
    const pricing = companyPricing({ source: 'models.dev', inputPricePerMillion: 2, outputPricePerMillion: 4, cachedInputPricePerMillion: 0.5 })!;
    expect(companyUsageCostUsd(pricing, { inputTokens: 1000, outputTokens: 100, cachedTokens: 600 })).toBeCloseTo(0.0015);
    expect(companyUsageCostUsd(pricing, { inputTokens: -1, outputTokens: 100, cachedTokens: 0 })).toBeUndefined();
    expect(companyUsageCostUsd(companyPricing({ source: 'models.dev', inputPricePerMillion: 0, outputPricePerMillion: 0 }), { inputTokens: 1000, outputTokens: 100, cachedTokens: 0 })).toBe(0);
    const s = fixture(), a = running(s), b = running(s);
    const reservation = s.reserve(a.id, 0.1);
    expect(() => s.recordUsage(reservation, { companyId: b.id, agentId: 'lead', provider: 'p', model: 'm', costUsd: 0, outcome: 'completed' })).toThrow('another company');
    expect(s.monthlyAccounting(a.id).reservedUsd).toBe(0.1);
    const client = { name: 'priced', complete: async (_messages: any[], options: any) => { options.onUsage({ inputTokens: 1000, outputTokens: 100, cachedTokens: 600 }); return 'done'; }, completeStream: async () => '' };
    const llm = new CompanyLlm(client, s, { companyId: a.id, agentId: 'lead', provider: 'p', model: 'm' }, u => companyUsageCostUsd(pricing, u), pricing);
    await llm.complete([]);
    expect(s.usage(a.id)[0]).toMatchObject({ pricing, provenance: 'catalog', costUsd: 0.0015 });
  });
  it('keeps host-computer access off until the owner grants it', () => {
    const s = fixture(), c = s.create();
    expect(c.allowHostComputer).toBe(false);
    expect(() => s.update(c.id, { allowHostComputer: 'true' } as any)).toThrow('grant');
    expect(s.update(c.id, { allowHostComputer: true }).allowHostComputer).toBe(true);
    expect(s.update(c.id, { allowHostComputer: false }).allowHostComputer).toBe(false);
  });
  it('requires explicit operating choices and preserves drafts', () => {
    const s = fixture(),
      c = s.create({ name: 'Draft' });
    expect(() => s.transition(c.id, 'running')).toThrow('Complete');
    expect(s.get(c.id)?.state).toBe('draft');
    expect(s.companies()).toHaveLength(1);
  });
  it('restores archived companies paused and preserves usage', () => {
    const s = fixture(),
      c = running(s);
    s.recordUsage('event', { companyId: c.id, agentId: 'lead', provider: 'p', model: 'm', inputTokens: 100, costUsd: 0.01, outcome: 'completed' });
    s.transition(c.id, 'archived');
    s.transition(c.id, 'paused');
    expect(s.usage(c.id)).toHaveLength(1);
    expect(s.get(c.id)?.state).toBe('paused');
  });
  it('isolates Cowork snapshots and agent memories between companies with the same names', () => {
    const s = fixture(),
      a = s.create({ name: 'A' }),
      b = s.create({ name: 'B' });
    const first = new CoworkStore(path.join(s.root, a.id, 'cowork.json'), undefined, { companyId: a.id, persistence: s.snapshot(a.id) }),
      second = new CoworkStore(path.join(s.root, b.id, 'cowork.json'), undefined, { companyId: b.id, persistence: s.snapshot(b.id) });
    const agent = first.saveAgent({ name: 'Alex', systemPrompt: 'Help' }),
      other = second.saveAgent({ name: 'Alex', systemPrompt: 'Help' });
    expect(second.getAgent(agent.id)).toBeUndefined();
    expect(first.getAgent(other.id)).toBeUndefined();
    const memory = CoworkMemory.forWorkspace(s.workspace(a.id)),
      otherMemory = CoworkMemory.forWorkspace(s.workspace(b.id));
    memory.remember(agent, 'Our launch is Friday');
    expect(otherMemory.recall(other)).not.toContain('Friday');
    expect(memory.recall(agent)).toContain('Friday');
    expect(new CoworkStore(path.join(s.root, a.id, 'cowork.json'), undefined, { persistence: s.snapshot(a.id) }).getAgent(agent.id)?.companyId).toBe(a.id);
  });
  it('supersedes stale queued work while questions leave directions intact', () => {
    const s = fixture(),
      c = running(s);
    const old = s.enqueue(c.id, 'message', { text: 'Old work' }),
      question = s.enqueue(c.id, 'message', { text: 'Status?', delivery: 'question' });
    s.steer(c.id, 'New work');
    expect(s.jobs(c.id).find((j) => j.id === old.id)?.state).toBe('superseded');
    expect(s.jobs(c.id).find((j) => j.id === question.id)?.state).toBe('queued');
    expect(s.get(c.id)?.directionVersion).toBe(1);
  });
  it('enforces workspace file limits and allows unlimited explicitly', () => {
    const s = fixture();
    s.setWorkspaceFileLimit(100);
    expect(() => s.create({ maxFileBytes: 101 })).toThrow('workspace');
    expect(() => s.create({ maxFileBytes: null })).toThrow('workspace');
    expect(effectiveFileLimit(100, 50)).toBe(50);
    expect(effectiveFileLimit(null, null)).toBeNull();
  });
  it('reserves concurrent calls against one monthly budget and deduplicates usage', () => {
    const s = fixture(),
      c = running(s);
    s.update(c.id, { monthlyBudgetUsd: 1 });
    const id = s.reserve(c.id, 0.7);
    expect(() => s.reserve(c.id, 0.4)).toThrow('budget');
    s.recordUsage(id, { companyId: c.id, agentId: 'lead', provider: 'p', model: 'm', costUsd: 0.2, outcome: 'completed' });
    s.recordUsage(id, { companyId: c.id, agentId: 'lead', provider: 'p', model: 'm', costUsd: 0.2, outcome: 'completed' });
    expect(s.usage(c.id)).toHaveLength(1);
    expect(() => s.reserve(c.id, 0.7)).not.toThrow();
    expect(() => s.reserve(c.id, undefined)).toThrow('prices');
  });
  it('records failed model attempts and unknown prices without inventing zero cost', async () => {
    const s = fixture(),
      c = running(s);
    const llm = new CompanyLlm(
      {
        name: 'broken',
        complete: async () => {
          throw new Error('offline');
        },
        completeStream: async () => {
          throw new Error('offline');
        },
      },
      s,
      { companyId: c.id, agentId: 'lead', provider: 'p', model: 'm' },
      () => undefined,
    );
    await expect(llm.complete([])).rejects.toThrow('offline');
    expect(s.usage(c.id)[0]).toMatchObject({ outcome: 'failed', provenance: 'unknown' });
    expect(s.usage(c.id)[0]?.costUsd).toBeUndefined();
  });
  it('reserves the higher cached-input price and the full image-input ceiling before a finite-budget attempt', async () => {
    const s = fixture(), c = running(s);
    s.update(c.id, { monthlyBudgetUsd: 0.02 });
    const inner = { name: 'test', complete: async (_messages: any[], options: any) => {
      const reserved = s.monthlyAccounting(c.id).reservedUsd;
      expect(reserved).toBeCloseTo(0.010001);
      options.onUsage({ inputTokens: 5, outputTokens: 1, cachedTokens: 5 }); return 'done';
    }, completeStream: async () => '' };
    const pricing = companyPricing({ source: 'models.dev', inputPricePerMillion: 1, cachedInputPricePerMillion: 10, outputPricePerMillion: 1, inputTokens: 1000 })!;
    const client = new CompanyLlm(inner, s, { companyId: c.id, agentId: 'lead', provider: 'p', model: 'm' }, usage => companyUsageCostUsd(pricing, usage), pricing);
    await client.complete([{ role: 'user', content: [{ type: 'image_url', image_url: { url: 'https://fixture.invalid/image' } }] }], { outputBudgetTokens: 1 });
    expect(s.monthlyAccounting(c.id).reservedUsd).toBe(0);
    expect(s.usage(c.id)[0]?.costUsd).toBeCloseTo(0.000051);
  });
  it('does not submit unbounded vision requests or invalid output limits against finite budgets', async () => {
    const s = fixture(), c = running(s); s.update(c.id, { monthlyBudgetUsd: 1 }); let submitted = false;
    const inner = { name: 'test', complete: async () => { submitted = true; return 'done'; }, completeStream: async () => '' };
    const pricing = companyPricing({ source: 'models.dev', inputPricePerMillion: 1, outputPricePerMillion: 1 })!;
    const client = new CompanyLlm(inner, s, { companyId: c.id, agentId: 'lead', provider: 'p', model: 'm' }, usage => companyUsageCostUsd(pricing, usage), pricing);
    await expect(client.complete([{ role: 'user', content: [{ type: 'image_url', image_url: { url: 'https://fixture.invalid/image' } }] }])).rejects.toThrow('image-input reservation');
    await expect(client.complete([], { outputBudgetTokens: -1 })).rejects.toThrow('positive output');
    expect(submitted).toBe(false); expect(s.usage(c.id)).toEqual([]);
  });
  it('preserves an interrupted model attempt and its budget reservation across restart', () => {
    const s = fixture(), c = running(s);
    s.update(c.id, { monthlyBudgetUsd: 1 });
    const id = s.reserve(c.id, 0.8, { agentId: 'lead', taskId: 'research', provider: 'p', model: 'm' });
    const started = s.usage(c.id)[0]!.createdAt;
    s.recover();
    expect(s.usage(c.id)).toEqual([expect.objectContaining({ id, outcome: 'uncertain', taskId: 'research', createdAt: started })]);
    expect(() => s.reserve(c.id, 0.3)).toThrow('budget');
    s.recordUsage(id, { companyId: c.id, agentId: 'lead', taskId: 'research', provider: 'p', model: 'm', costUsd: 0.2, outcome: 'completed' });
    s.recordUsage(id, { companyId: c.id, agentId: 'lead', provider: 'p', model: 'm', costUsd: 0.5, outcome: 'completed' });
    expect(s.usage(c.id)).toEqual([expect.objectContaining({ costUsd: 0.2, createdAt: started })]);
    expect(s.monthlyAccounting(c.id).reservedUsd).toBe(0);
    expect(() => s.reserve(c.id, 0.8)).not.toThrow();
  });
  it('reserves the output ceiling, charges each attempt and refuses stale-direction model work', async () => {
    const s = fixture(), c = running(s), attempts: any[] = [];
    const inner = { name: 'test', complete: async (_messages: any[], options: any) => { attempts.push(options); options.onUsage({ inputTokens: 12, outputTokens: 3, cachedTokens: 2 }); return 'done'; }, completeStream: async () => '' };
    const llm = new CompanyLlm(inner, s, { companyId: c.id, agentId: 'lead', taskId: 'work', provider: 'p', model: 'm' }, u => ((u.inputTokens ?? 0) + (u.outputTokens ?? 0)) / 1000000);
    await llm.complete([{ role: 'user', content: 'Build' }]);
    expect(attempts[0]).toMatchObject({ retries: 0, maxTransportAttempts: 1, outputBudgetTokens: 8192, requireOutputLimit: true });
    expect(s.usage(c.id)[0]).toMatchObject({ inputTokens: 12, outputTokens: 3, cachedTokens: 2, taskId: 'work', outcome: 'completed' });
    s.steer(c.id, 'New work');
    await expect(llm.complete([])).rejects.toThrow('direction changed');
    expect(attempts).toHaveLength(1);
    expect(s.usage(c.id)).toHaveLength(1);
  });
  it('requires approval in supervised mode and rejects old directions before writes', async () => {
    const s = fixture(),
      c = running(s);
    const policy = companyPolicy(s, c.id, 'lead', 0);
    expect(await policy.authorize('mcp_call', { tool: 'send' })).toMatchObject({ ok: false });
    const action = s.actions(c.id)[0]!;
    s.actionState(action, 'approved');
    expect(await policy.authorize('mcp_call', { tool: 'send' })).toBeUndefined();
    policy.settled('mcp_call', { tool: 'send' }, { ok: true, output: 'receipt' });
    expect(s.actions(c.id)[0]?.state).toBe('done');
    s.steer(c.id, 'Changed');
    expect((await policy.authorize('mcp_call', { tool: 'other' }))?.output).toContain('changed direction');
    expect(await policy.authorize('configure_mcp', {})).toMatchObject({ ok: false });
  });
  it('recovers interrupted jobs and marks executing writes uncertain', () => {
    const s = fixture(),
      c = running(s),
      job = s.enqueue(c.id, 'review', {});
    s.claim(job);
    const action = s.intent(c.id, 'lead', 'send', {}, 0);
    s.actionState(action, 'executing');
    s.recover();
    expect(s.jobs(c.id)[0]?.state).toBe('queued');
    expect(s.actions(c.id)[0]?.state).toBe('uncertain');
  });
  it('classifies exact native mailbox reads separately from sends and mailbox mutations', async () => {
    const store = fixture(), company = running(store);
    const policy = companyPolicy(store, company.id, 'lead', 0);
    for (const tool of ['mail_check', 'mail_list', 'mail_search', 'mail_read', 'mail_folders']) {
      expect(await policy.authorize('connected_apps', { action: 'execute', service: 'mail', tool })).toBeUndefined();
    }
    expect(store.actions(company.id)).toHaveLength(0);
    for (const tool of ['mail_send', 'mail_mark', 'mail_read_and_delete']) {
      expect(await policy.authorize('connected_apps', { action: 'execute', service: 'mail', tool })).toMatchObject({ ok: false });
    }
    expect(await policy.authorize('connected_apps', { action: 'execute', service: 'other', tool: 'mail_read' })).toMatchObject({ ok: false });
  });
  it('admits fair bounded work and skips paused companies', async () => {
    const s = fixture(),
      a = running(s),
      b = running(s);
    s.update(a.id, { workers: 1 });
    s.update(b.id, { workers: 1 });
    const started: string[] = [];
    let finish!: () => void;
    const waiting = new Promise<void>((r) => {
      finish = r;
    });
    const coordinator = new CompanyCoordinator(s, async (j) => {
      started.push(j.companyId);
      await waiting;
    });
    coordinator.start();
    expect(started).toEqual([a.id, b.id]);
    expect(s.acquireScheduler('other')).toBe(false);
    coordinator.stop();
    finish();
    await waiting;
    await new Promise((r) => setTimeout(r, 0));
  });
  it('preserves computer capacity across restart and unavailable runtime states', () => {
    const s = fixture(),
      a = running(s),
      b = running(s);
    s.setRuntimeSettings({ computers: 1 });
    s.reserveComputer(a.id, 'lead');
    s.computerState(a.id, 'lead', 'unavailable');
    expect(() => s.reserveComputer(b.id, 'lead')).toThrow('concurrency');
    expect(() => s.reserveComputer(a.id, 'lead', 'different-server')).toThrow('previous private computer');
    expect(() => s.reserveComputer(b.id, 'other')).toThrow('concurrency');
    s.computerState(a.id, 'lead', 'stopped');
    expect(() => s.reserveComputer(b.id, 'other')).not.toThrow();
    expect(() => s.setRuntimeSettings({ workers: 0 })).toThrow();
  });
  it('interrupts work when scheduler ownership is lost', async () => {
    const s = fixture();
    running(s);
    let lost = false;
    const coordinator = new CompanyCoordinator(
      s,
      async () => {},
      () => {},
      () => {
        lost = true;
      },
    );
    coordinator.start();
    expect(s.acquireScheduler('replacement', Date.now() + 120000)).toBe(true);
    coordinator.tick();
    expect(lost).toBe(true);
    await coordinator.drain();
  });
  it('parses new UI modules', () => {
    expect(() => new Script(COMPANY_JS)).not.toThrow();
    expect(COMPANY_JS).toContain('/cowork/computers/stream');
    expect(COMPANY_JS).toContain('frame.remove()');
    expect(() => new Script(FILE_UPLOAD_JS)).not.toThrow();
    expect(() => new Script(COMPANY_CONNECTIONS_JS)).not.toThrow();
    expect(() => new Script(COMPANY_WALLETS_JS)).not.toThrow();
  });
});
