import { createHash } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { ToolResult } from '../types.js';
import { companyApi, type CompanyApiDeps } from './api.js';
import type { Company } from './store.js';

const creations = new Map<string, Promise<ToolResult>>();

/** Cowork may propose company drafts; only owner setup grants resources and starts them. */
export async function manageCoworkCompanies(d: CompanyApiDeps, agentId: string, conversationId: string, params: Record<string, unknown>): Promise<ToolResult> {
  const source = d.legacyAgent(agentId);
  if (!source || source.companyId || !source.allowConfig || !source.allowWrites) throw new Error('Company management requires a Cowork teammate with configuration and write permission.');
  const action = String(params['action'] ?? 'list');
  if (Object.keys(params).some(key => !['action', 'id', 'name', 'purpose', 'leadName'].includes(key))) throw new Error('Company drafts cannot grant resources, expand access, choose budgets or start themselves. Review those choices in Company setup.');
  async function call(route: string, method: string, body: Record<string, unknown> = {}): Promise<any> {
    let result: unknown;
    const handled = await companyApi({} as IncomingMessage, {} as ServerResponse, route, method, {
      ...d, body: async () => body, send: (_res, status, value) => {
        if (status >= 400) throw new Error(String((value as { error?: string }).error ?? 'Company operation failed.'));
        result = value;
      },
    });
    if (!handled) throw new Error('Company operation is unavailable.');
    return result;
  }
  if (action === 'list') {
    return { ok: true, output: JSON.stringify({ companies: d.store.companies().map(c => ({ id: c.id, name: c.name, state: c.state, purpose: c.purpose })) }) };
  }
  if (action === 'status') {
    const result = await call('/api/companies/' + encodeURIComponent(String(params['id'] ?? '')) + '/status', 'GET');
    return { ok: true, output: JSON.stringify({ id: result.id, name: result.name, state: result.state, nextReviewAt: result.nextReviewAt, activity: result.activity, jobs: result.jobs, queuedCount: result.queuedCount, pendingDecisions: result.pendingDecisions, missions: result.missions.map((m: { id: string; status: string }) => ({ id: m.id, status: m.status })) }) };
  }
  if (action !== 'create') throw new Error('Choose create, list or status. Company start and resource grants belong to the owner.');
  const name = String(params['name'] ?? '').trim(), purpose = String(params['purpose'] ?? '').trim();
  if (!name || !purpose) throw new Error('Provide a company name and concrete purpose.');
  const key = createHash('sha256').update(JSON.stringify([agentId, conversationId, name, purpose])).digest('hex');
  const lockKey = d.store.root + ':' + key;
  const pending = creations.get(lockKey);
  if (pending) return await pending;
  const create = async (): Promise<ToolResult> => {
  const prior = d.store.read<{ companyId: string }>('cowork-company', key);
  let company = prior ? d.store.get(prior.companyId) : undefined;
  if (!company) {
    company = (await call('/api/companies', 'POST', { name, purpose })).company as Company;
    // Persist before cloning, so an interrupted creation can resume without a duplicate company.
    d.store.saveResource('cowork-company', key, company.id, { companyId: company.id, agentId, conversationId });
  }
  if (company.state === 'draft' && !company.leadId) {
    company = (await call('/api/companies/' + company.id + '/lead', 'POST', {
      cloneAgentId: source.id, name: String(params['leadName'] ?? source.name),
      instructions: 'Lead this company toward its purpose. Plan bounded missions, delegate useful work, verify results, and wait between useful actions. Follow the latest owner direction. Do not expand permissions or budgets.',
    })).company as Company;
  }
  return {
    ok: true, companyLink: { id: company.id, name: company.name, state: company.state },
    output: JSON.stringify({ company: { id: company.id, name: company.name, state: company.state }, next: company.state === 'draft' ? 'The owner must review resources, budget and file limits, then select Start in Company setup.' : 'Open the company to see its live activity. This request reused the existing company.' }),
  };
  };
  const work = create();
  creations.set(lockKey, work);
  try { return await work; } finally { if (creations.get(lockKey) === work) creations.delete(lockKey); }
}
