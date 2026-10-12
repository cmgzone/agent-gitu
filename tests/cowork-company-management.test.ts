import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it, expect, vi } from 'vitest';
import { CompanyStore } from '../src/company/store.js';
import { CoworkStore } from '../src/cowork/store.js';
import { manageCoworkCompanies } from '../src/company/cowork-management.js';
import type { CompanyApiDeps } from '../src/company/api.js';
import { coworkNativeTools, executeCoworkTool } from '../src/cowork/tools.js';
import type { ToolContext } from '../src/tools/tools.js';
import type { CoworkToolScope } from '../src/cowork/tools.js';

function fixture() {
  const root = mkdtempSync(path.join(os.tmpdir(), 'gitu-cowork-company-')), store = new CompanyStore(root), legacy = new CoworkStore(path.join(root, 'legacy.json'));
  const agent = legacy.saveAgent({ name: 'Ari', systemPrompt: 'Help the owner with requested work.', provider: 'preview', model: 'model', allowWrites: true, allowConfig: true });
  const conversation = legacy.saveConversation({ kind: 'dm', memberIds: [agent.id] });
  const scopes = new Map<string, CoworkStore>(); let active: string | undefined;
  const start = vi.fn();
  const deps: CompanyApiDeps = {
    store, body: async () => ({}), send: () => {}, legacyAgent: id => legacy.getAgent(id),
    scoped: (company, work) => {
      const before = active; active = company.id;
      try { const value = work(); if (value instanceof Promise) return value.finally(() => { active = before; }) as typeof value; active = before; return value; } catch (error) { active = before; throw error; }
    },
    cowork: () => { if (!active) throw new Error('Company scope missing'); let cowork = scopes.get(active); if (!cowork) { cowork = new CoworkStore(path.join(root, active + '.json'), undefined, { companyId: active }); scopes.set(active, cowork); } return cowork; },
    routeCowork: async () => false, start, pause: () => {},
    activity: () => [{ agentId: 'active-lead', agentName: 'Lead', phase: 'working', tool: 'connected_apps' }],
  };
  return { root, store, legacy, agent, conversation, scopes, deps, start, close: () => { store.close(); rmSync(root, { recursive: true, force: true }); } };
}

describe('Cowork company management', () => {
  it('creates one durable draft with an isolated lead and requires owner setup before running', async () => {
    const f = fixture();
    try {
      const args = { action: 'create', name: 'Research studio', purpose: 'Prepare verified customer research' };
      const [first, second] = await Promise.all([manageCoworkCompanies(f.deps, f.agent.id, f.conversation.id, args), manageCoworkCompanies(f.deps, f.agent.id, f.conversation.id, args)]);
      expect(second.companyLink?.id).toBe(first.companyLink?.id);
      const company = f.store.get(first.companyLink!.id)!;
      expect(company).toMatchObject({ state: 'draft', budgetChosen: false, fileLimitChosen: false, allowHostComputer: false, access: 'supervised', accountIds: [], connectionIds: [] });
      expect(company.leadId).not.toBe(f.agent.id);
      expect(f.scopes.get(company.id)?.getAgent(company.leadId!)?.companyId).toBe(company.id);
      expect(f.legacy.listAgents()).toHaveLength(1);
      expect(f.store.usage(company.id)).toHaveLength(0);
      expect(f.start).not.toHaveBeenCalled();
      f.store.close(); f.store = new CompanyStore(f.root); f.deps.store = f.store;
      const restarted = await manageCoworkCompanies(f.deps, f.agent.id, f.conversation.id, args);
      expect(restarted.companyLink?.id).toBe(company.id);
      expect(f.store.companies()).toHaveLength(1);
    } finally { f.store.close(); rmSync(f.root, { recursive: true, force: true }); }
  });
  it('cannot start itself, grant resources or retain access after the owner revokes configuration', async () => {
    const f = fixture();
    try {
      await expect(manageCoworkCompanies(f.deps, f.agent.id, f.conversation.id, { action: 'create', name: 'Studio', purpose: 'Research', allowHostComputer: true })).rejects.toThrow('cannot grant');
      await expect(manageCoworkCompanies(f.deps, f.agent.id, f.conversation.id, { action: 'start', id: 'company' })).rejects.toThrow('belong to the owner');
      f.legacy.saveAgent({ ...f.agent, allowConfig: false });
      await expect(manageCoworkCompanies(f.deps, f.agent.id, f.conversation.id, { action: 'list' })).rejects.toThrow('permission');
      expect(f.store.companies()).toHaveLength(0);
    } finally { f.close(); }
  });
  it('reports saved state, queued work and live worker activity without claiming a draft is running', async () => {
    const f = fixture();
    try {
      const draft = await manageCoworkCompanies(f.deps, f.agent.id, f.conversation.id, { action: 'create', name: 'Studio', purpose: 'Research' });
      const id = draft.companyLink!.id;
      let status = JSON.parse((await manageCoworkCompanies(f.deps, f.agent.id, f.conversation.id, { action: 'status', id })).output);
      expect(status.state).toBe('draft');
      f.store.update(id, { monthlyBudgetUsd: null, maxFileBytes: null }); f.store.transition(id, 'running'); f.store.enqueue(id, 'review', {});
      status = JSON.parse((await manageCoworkCompanies(f.deps, f.agent.id, f.conversation.id, { action: 'status', id })).output);
      expect(status.state).toBe('running'); expect(status.jobs[0].state).toBe('queued'); expect(status.activity[0].tool).toBe('connected_apps');
    } finally { f.close(); }
  });
  it('advertises creation only to authorized Cowork teammates and blocks company agents and helpers', async () => {
    const f = fixture();
    try {
      expect(coworkNativeTools(f.agent, false).some(t => t.name === 'company_manage')).toBe(true);
      expect(coworkNativeTools({ ...f.agent, companyId: 'company' }, false).some(t => t.name === 'company_manage')).toBe(false);
      expect(coworkNativeTools({ ...f.agent, allowWrites: false }, false).some(t => t.name === 'company_manage')).toBe(false);
      const callback = vi.fn().mockResolvedValue({ ok: true, output: 'created' });
      const context = { cwd: f.root, companyManagement: callback } as ToolContext;
      const scope = { store: f.legacy, agent: f.agent, conversationId: f.conversation.id } as CoworkToolScope;
      const perms = { allowShell: false, allowWrites: true, allowConfig: true, chief: false, browser: false };
      const ok = await executeCoworkTool(context, 'company_manage', { action: 'list' }, perms, scope); expect(ok.ok).toBe(true);
      expect((await executeCoworkTool(context, 'company_manage', { action: 'list' }, perms, { ...scope, isSubAgent: true })).ok).toBe(false);
      expect((await executeCoworkTool(context, 'company_manage', { action: 'list' }, perms, { ...scope, agent: { ...f.agent, companyId: 'company' } })).ok).toBe(false);
      expect(callback).toHaveBeenCalledTimes(1);
    } finally { f.close(); }
  });
});
