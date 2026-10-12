import { createContext, Script } from 'node:vm';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { COMPANY_ACTIVITY_JS } from '../src/server/ui-company-activity.js';
import { CompanyStore } from '../src/company/store.js';
import { CoworkStore } from '../src/cowork/store.js';
import { companyApi } from '../src/company/api.js';

function view() {
  const context = createContext({ document: { addEventListener: vi.fn() }, esc: (value: unknown) => String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;'), companyPendingActions: (data: any) => (data.actions || []).filter((a: any) => a.state === 'pending' && a.version === (data.company || data).directionVersion) });
  new Script(COMPANY_ACTIVITY_JS).runInContext(context);
  return context;
}

describe('Company agent assignments', () => {
  it('keeps only one status refresh in flight', async () => {
    const ui = view(); ui.Companies = {}; ui.companyError = vi.fn();
    let finish!: () => void;
    const refresh = vi.fn(() => new Promise<void>(resolve => { finish = resolve; }));
    ui.companyStatusRefresh(refresh); ui.companyStatusRefresh(refresh);
    await vi.waitFor(() => expect(refresh).toHaveBeenCalledOnce());
    finish(); await ui.Companies.statusPending;
    expect(ui.Companies.statusPending).toBeNull();
    ui.companyStatusRefresh(refresh);
    await vi.waitFor(() => expect(refresh).toHaveBeenCalledTimes(2));
    finish(); await ui.Companies.statusPending;
  });
  it('shows the assigned mission, live tool, progress and helpers for the correct agent', () => {
    const ui = view(), data = {
      company: { state: 'running', leadId: 'lead', directionVersion: 1 },
      activity: [{ agentId: 'lead', tool: 'connected_apps' }],
      missions: [{ id: 'mission', agentId: 'lead', goal: '<Research customers>', status: 'running', progress: 'Three interviews checked.' }, { agentId: 'other', goal: 'Private other task', status: 'running' }, { agentId: 'lead', goal: 'Completed task', status: 'done' }],
      helpers: [{ id: 'helper', rootAgentId: 'lead', role: 'Researcher', objective: 'Compare customer feedback', status: 'running', activity: { phase: 'reasoning', current: 'Hidden provider reasoning' } }, { rootAgentId: 'other', role: 'Other helper', status: 'running' }],
    };
    const html = ui.companyAgentWorkHtml({ id: 'lead' }, data);
    for (const text of ['Working', 'Using connected apps', '&lt;Research customers&gt;', 'Three interviews checked.', 'Compare customer feedback', 'Thinking']) expect(html).toContain(text);
    for (const text of ['Private other task', 'Completed task', 'Other helper', 'Hidden provider reasoning']) expect(html).not.toContain(text);
  });

  it('distinguishes approvals, queued assignments and pause without inventing an idle task', () => {
    const ui = view(), company = { state: 'running', directionVersion: 2, leadId: 'lead', direction: 'Owner direction' }, job = { id: 'job', kind: 'message', state: 'queued', version: 2, payload: { text: 'Prepare the budget' } };
    expect(ui.companyAgentWorkHtml({ id: 'lead' }, { company, jobs: [job] })).toContain('Prepare the budget');
    expect(ui.companyAgentWorkHtml({ id: 'lead' }, { company, jobs: [job] })).toContain('Queued');
    expect(ui.companyAgentWorkHtml({ id: 'lead' }, { company, jobs: [{ ...job, version: 1 }] })).not.toContain('Prepare the budget');
    const waiting = ui.companyAgentWorkHtml({ id: 'lead' }, { company, actions: [{ agentId: 'lead', version: 2, state: 'pending' }], activity: [{ agentId: 'lead' }] });
    expect(waiting).toContain('Waiting for approval');
    expect(ui.companyAgentWorkHtml({ id: 'other' }, { company, jobs: [job] })).toContain('No current task assigned.');
    expect(ui.companyAgentWorkHtml({ id: 'lead' }, { company: { ...company, state: 'paused' }, activity: [{ agentId: 'lead' }] })).toContain('Paused');
  });

  it('returns scoped mission ownership, queued work and safe helper progress from the status API', async () => {
    const root = mkdtempSync(path.join(os.tmpdir(), 'gitu-work-status-')), store = new CompanyStore(root), cowork = new CoworkStore(path.join(root, 'company-cowork.json'));
    try {
      const c = store.create({ purpose: 'Research', monthlyBudgetUsd: null, maxFileBytes: null }), a = cowork.saveAgent({ name: 'Ari', systemPrompt: 'Help.' }), conversation = cowork.saveConversation({ kind: 'dm', memberIds: [a.id] });
      store.update(c.id, { leadId: a.id, conversationId: conversation.id });
      const mission = cowork.createMission({ conversationId: conversation.id, agentId: a.id, goal: 'Review customer feedback', criteria: [] });
      cowork.updateMission(mission.id, { status: 'blocked', progress: 'Collected three responses', blockers: 'Needs owner input' });
      store.enqueue(c.id, 'mission', { missionId: mission.id });
      const helper = cowork.createSubAgent({ conversationId: conversation.id, missionId: mission.id, parentAgentId: a.id, rootAgentId: a.id, spawnedBy: { agentId: a.id, reason: 'Compare findings' }, depth: 2, maxDepth: 2, permissions: { allowShell: false, allowWrites: false, allowConfig: false, browser: false }, skills: [], role: 'Researcher', objective: 'Compare feedback' });
      cowork.updateSubAgent(helper.id, { activity: { phase: 'reasoning', current: 'Private reasoning', entries: [] } });
      let response: any;
      await companyApi({} as never, {} as never, '/api/companies/' + c.id + '/status', 'GET', { store, body: async () => ({}), send: (_r, status, data) => { expect(status).toBe(200); response = data; }, scoped: (_c, run) => run(), cowork: () => cowork, legacyAgent: () => undefined, routeCowork: async () => false, start: vi.fn(), pause: vi.fn() });
      expect(response.missions[0]).toMatchObject({ agentId: a.id, goal: mission.goal, blockers: 'Needs owner input' });
      expect(response.jobs[0]).toMatchObject({ agentId: a.id, task: mission.goal, missionId: mission.id });
      expect(response.helpers[0]).toMatchObject({ rootAgentId: a.id, objective: 'Compare feedback', activity: { phase: 'reasoning', current: 'Thinking' } });
      expect(JSON.stringify(response)).not.toContain('Private reasoning');
      expect(response.helpers[0]).not.toHaveProperty('permissions');
    } finally { store.close(); rmSync(root, { recursive: true, force: true }); }
  });
});
