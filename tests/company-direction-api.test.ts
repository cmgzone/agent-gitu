import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it, expect, vi } from 'vitest';
import { CompanyStore } from '../src/company/store.js';
import { companyApi } from '../src/company/api.js';
import { CoworkStore } from '../src/cowork/store.js';

describe('company chat direction API', () => {
  it('counts only current decisions and rejects approvals from a superseded direction', async () => {
    const root = mkdtempSync(path.join(os.tmpdir(), 'gitu-direction-api-')), store = new CompanyStore(root), cowork = new CoworkStore(path.join(root, 'cowork.json'));
    try {
      const company = store.create({ purpose: 'Original work', monthlyBudgetUsd: null, maxFileBytes: null });
      store.update(company.id, { leadId: 'lead', conversationId: 'chat' }); store.transition(company.id, 'running');
      const old = store.intent(company.id, 'lead', 'old-email', {}, 0);
      store.steer(company.id, 'New work');
      const current = store.intent(company.id, 'lead', 'current-email', {}, 1);
      let response: any;
      const deps = {
        store, body: async () => ({ state: 'approved' }), send: (_res: unknown, status: number, value: unknown) => { response = { status, ...(value as object) }; },
        scoped: <T>(_company: unknown, work: () => T) => work(), cowork: () => cowork, legacyAgent: () => undefined,
        routeCowork: async () => false, start: () => {}, pause: () => {},
      };
      await companyApi({} as never, {} as never, '/api/companies', 'GET', deps);
      expect(response.companies[0].decisions).toBe(1);
      await expect(companyApi({} as never, {} as never, '/api/companies/' + company.id + '/actions/' + old.id, 'POST', deps)).rejects.toThrow('older direction');
      expect(store.actions(company.id).find(a => a.id === old.id)?.state).toBe('pending');
      await companyApi({} as never, {} as never, '/api/companies/' + company.id + '/actions/' + current.id, 'POST', deps);
      expect(store.actions(company.id).find(a => a.id === current.id)?.state).toBe('approved');
      await companyApi({} as never, {} as never, '/api/companies', 'GET', deps);
      expect(response.companies[0].decisions).toBe(0);
      expect(store.actions(company.id)).toHaveLength(2);
    } finally { store.close(); rmSync(root, { recursive: true, force: true }); }
  });
  it('preserves the most recent direction across questions, follow-ups and restart', async () => {
    const root = mkdtempSync(path.join(os.tmpdir(), 'gitu-direction-api-'));
    let store = new CompanyStore(root);
    const cowork = new CoworkStore(path.join(root, 'cowork.json')), pause = vi.fn();
    try {
      const company = store.create({ name: 'Studio', purpose: 'Original task', monthlyBudgetUsd: null, maxFileBytes: null });
      store.update(company.id, { leadId: 'lead', conversationId: 'chat' }); store.transition(company.id, 'running');
      async function post(text: string, delivery?: string) {
        let response: any;
        await companyApi({} as never, {} as never, '/api/companies/' + company.id + '/chat', 'POST', {
          store, body: async () => ({ text, delivery }), send: (_res, status, value) => { response = { status, ...(value as object) }; },
          scoped: (_company, work) => work(), cowork: () => cowork, legacyAgent: () => undefined,
          routeCowork: async () => false, start: () => {}, pause,
        });
        return response;
      }
      const replacement = await post('now implement the new customer portal');
      expect(replacement.job.payload.delivery).toBe('steer');
      const version = replacement.company.directionVersion;
      expect((await post('How is the work progressing?')).job.payload.delivery).toBe('question');
      expect(store.get(company.id)?.directionVersion).toBe(version);
      expect((await post('continue')).job.payload.delivery).toBe('queue');
      expect(store.get(company.id)?.direction).toBe('now implement the new customer portal');
      store.close(); store = new CompanyStore(root);
      expect((await post('continue')).company.direction).toBe('now implement the new customer portal');
      const extension = await post('also support mobile viewports');
      expect(extension.company.direction).toBe('now implement the new customer portal\n\nalso support mobile viewports');
      expect(extension.company.directionVersion).toBe(version + 1);
      expect(pause).toHaveBeenCalledTimes(2);
    } finally { store.close(); rmSync(root, { recursive: true, force: true }); }
  });
  it('validates attachments before changing direction or interrupting work', async () => {
    const root = mkdtempSync(path.join(os.tmpdir(), 'gitu-direction-api-')), store = new CompanyStore(root), cowork = new CoworkStore(path.join(root, 'cowork.json')), pause = vi.fn();
    try {
      const company = store.create({ purpose: 'Keep current work', monthlyBudgetUsd: null, maxFileBytes: null });
      store.update(company.id, { leadId: 'lead', conversationId: 'chat' }); store.transition(company.id, 'running'); store.steer(company.id, 'Keep current work');
      await expect(companyApi({} as never, {} as never, '/api/companies/' + company.id + '/chat', 'POST', {
        store, body: async () => ({ text: 'now implement another task', files: [{ artifactId: 'another-company-file' }] }), send: () => {},
        scoped: (_company, work) => work(), cowork: () => cowork, legacyAgent: () => undefined, routeCowork: async () => false, start: () => {}, pause,
        attachments: () => { throw new Error('File is not owned by this company'); },
      })).rejects.toThrow('not owned');
      expect(store.get(company.id)?.direction).toBe('Keep current work');
      expect(pause).not.toHaveBeenCalled();
    } finally { store.close(); rmSync(root, { recursive: true, force: true }); }
  });
});
