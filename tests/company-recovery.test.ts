import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { runInNewContext } from 'node:vm';
import { CompanyStore } from '../src/company/store.js';
import { companyPolicy } from '../src/company/policy.js';
import { COMPANY_ACTION_JS } from '../src/server/ui-company-actions.js';
import { COMPANY_WORK_JS } from '../src/server/ui-company-work.js';

const roots: string[] = [],
  stores: CompanyStore[] = [];
function fixture() {
  const root = mkdtempSync(path.join(os.tmpdir(), 'gitu-company-review-'));
  roots.push(root);
  const store = new CompanyStore(root);
  stores.push(store);
  const company = store.create({ name: 'Studio', purpose: 'Work', monthlyBudgetUsd: null, maxFileBytes: null });
  store.update(company.id, { leadId: 'lead' });
  store.transition(company.id, 'running');
  return { store, company };
}
afterEach(() => {
  stores.splice(0).forEach((s) => s.close());
  roots.splice(0).forEach((root) => rmSync(root, { recursive: true, force: true }));
});
describe('Company command recovery and owner decisions', () => {
  it('keeps failed commands with Full access agents without creating owner approvals or uncertain cards', async () => {
    const { store, company } = fixture();
    store.update(company.id, { access: 'full' });
    const classify = vi.fn(async () => 'write' as const),
      policy = companyPolicy(store, company.id, 'lead', 0, classify);
    const migration = vi.spyOn(store, 'manageCommandReviews');
    const args = { command: 'python check-report.py' };
    expect(await policy.authorize('run_command', args)).toBeUndefined();
    policy.settled('run_command', args, { ok: false, output: 'Missing Python dependency', exitCode: 1 });
    expect(classify).not.toHaveBeenCalled();
    expect(store.actions(company.id)).toEqual([]);
    expect(migration).not.toHaveBeenCalled();
    store.steer(company.id, 'Different work');
    expect((await policy.authorize('run_command', args))?.output).toContain('changed direction');
    store.transition(company.id, 'paused');
    expect((await policy.authorize('run_command', args))?.output).toContain('paused');
  });
  it('retains supervised command review and actual external uncertainty under Full access', async () => {
    const { store, company } = fixture();
    const policy = companyPolicy(store, company.id, 'lead', 0, async () => 'write');
    expect((await policy.authorize('run_command', { command: 'task' }))?.output).toContain('approval');
    const command = store.actions(company.id)[0]!;
    store.actionState(command, 'approved');
    expect(await policy.authorize('run_command', { command: 'task' })).toBeUndefined();
    store.update(company.id, { access: 'full' });
    policy.settled('run_command', { command: 'task' }, { ok: false, output: 'Stopped' });
    expect(store.actions(company.id)[0]?.state).toBe('agent-managed');
    const mail = { action: 'execute', service: 'mail', tool: 'mail_send', args: { to: 'test@example.invalid', subject: 'Report' } };
    expect(await policy.authorize('connected_apps', mail)).toBeUndefined();
    policy.settled('connected_apps', mail, { ok: false, output: 'Connection lost after submission' });
    expect((await policy.authorize('connected_apps', mail))?.output).toContain('uncertain');
    expect(store.actions(company.id).find((a) => a.tool === 'connected_apps')?.state).toBe('uncertain');
  });
  it('migrates legacy command cards on restart without claiming completion, touching emails or changing another company', () => {
    const { store, company } = fixture();
    store.update(company.id, { access: 'full' });
    const command = store.intent(company.id, 'lead', 'run_command', { command: 'verify' }, 0);
    store.actionState(command, 'uncertain');
    const mail = store.intent(company.id, 'lead', 'connected_apps', { tool: 'mail_send' }, 0);
    store.actionState(mail, 'uncertain');
    const other = store.create({ name: 'Supervised' }),
      otherCommand = store.intent(other.id, 'lead', 'run_command', { command: 'verify' }, 0);
    store.actionState(otherCommand, 'uncertain');
    const reopened = new CompanyStore(store.root);
    stores.push(reopened);
    reopened.recover();
    expect(reopened.actions(company.id).find((a) => a.id === command.id)).toMatchObject({
      state: 'agent-managed',
      receipt: expect.stringContaining('does not confirm completion'),
    });
    expect(reopened.actions(company.id).find((a) => a.id === mail.id)?.state).toBe('uncertain');
    expect(reopened.actions(other.id)[0]?.state).toBe('uncertain');
    reopened.update(company.id, { access: 'supervised' });
    expect(reopened.intent(company.id, 'lead', 'run_command', { command: 'verify' }, 0).state).toBe('pending');
  });
  it('shows recipient and subject safely and keeps unknown results unresolved by default', () => {
    const context = runInNewContext(COMPANY_ACTION_JS + ';({companyRecoveryHtml,companyRequestHtml})', {
      esc: (value: unknown) => String(value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!),
      shortDate: () => '13 Oct',
    });
    const data = {
      company: { access: 'full', directionVersion: 1 },
      agents: [{ id: 'lead', name: 'Ari' }],
      actions: [
        { id: 'command', tool: 'run_command', state: 'uncertain', version: 1, parameters: { command: 'internal command' } },
        {
          id: 'mail',
          tool: 'connected_apps',
          agentId: 'lead',
          state: 'uncertain',
          version: 0,
          parameters: { service: 'mail', tool: 'mail_send', args: { to: 'client@example.invalid', subject: '<img onerror=alert(1)>', text: 'Report' } },
        },
      ],
    };
    const html = context.companyRecoveryHtml(data);
    expect(html).not.toContain('internal command');
    expect(html).toContain('Email to client@example.invalid');
    expect(html).toContain('&lt;img');
    expect(html).not.toContain('<img');
    expect(html).toContain('Choose a result');
    expect(html).not.toContain(' selected');
    expect(html).toContain('earlier direction and will not be retried');
    expect(html).not.toContain('Reconcile connected_apps');
    expect(html).toContain('Technical details');
  });
  it('shows actual assignments and results instead of hundreds of completed scheduler ticks', () => {
    const context = runInNewContext(COMPANY_WORK_JS + ';({companyWorkItems,companyWorkRows})', {
      Companies: { workFilter: 'all' },
      esc: (v: unknown) => String(v),
      shortDate: () => '13 Oct',
    });
    const data = {
      company: { directionVersion: 1, leadId: 'lead' },
      agents: [{ id: 'lead', name: 'Ari' }],
      missions: [{ id: 'task', agentId: 'lead', goal: 'Prepare the customer report', status: 'done', result: 'Delivered the customer report.', criteria: [] }],
      helpers: [{ id: 'helper', rootAgentId: 'lead', role: 'Designer', objective: 'Review the report layout', status: 'running' }],
      jobs: Array.from({ length: 1000 }, (_, i) => ({ id: 'tick-' + i, kind: 'review', state: 'done', version: 1, payload: {} })),
    };
    expect(context.companyWorkItems(data)).toHaveLength(2);
    const html = context.companyWorkRows(data);
    expect(html).toContain('Prepare the customer report');
    expect(html).toContain('Delivered the customer report.');
    expect(html).toContain('Review the report layout');
    expect(html).not.toContain('tick-');
    expect(context.companyWorkRows({ ...data, missions: [], helpers: [] })).toContain('No tasks in this view yet.');
  });
});
