import { createHash } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { ToolResult } from '../types.js';
import { companyApi, type CompanyApiDeps } from './api.js';
import type { Company } from './store.js';
import { coworkNativeTools } from '../cowork/tools.js';
import { inspectCoworkCompany } from './cowork-inspection.js';

const creations = new Map<string, Promise<ToolResult>>();

/** Company workspaces use Cowork identities; setup still owns resource grants. */
export async function manageCoworkCompanies(d: CompanyApiDeps, agentId: string, conversationId: string, params: Record<string, unknown>, invocation = conversationId): Promise<ToolResult> {
  const source = d.legacyAgent(agentId);
  if (!source || source.companyId) throw new Error('Company management requires a permanent Cowork teammate.');
  const action = String(params['action'] ?? 'list');
  if (Object.keys(params).some(key => !['action', 'id', 'name', 'purpose', 'leadName', 'leadId', 'memberIds', 'agentId', 'text', 'query', 'section', 'resourceId', 'offset', 'limit', 'input'].includes(key))) throw new Error('Company drafts cannot grant resources, expand access, choose budgets or start themselves. Review those choices in Cowork company setup.');
  if (['create', 'add_agent', 'remove_agent'].includes(action) && (!source.allowConfig || !source.allowWrites)) throw new Error('Changing company memberships requires a Cowork teammate with configuration and write permission.');
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
  if (action === 'help') {
    const names: Record<string,string> = { boardroom: 'company_boardroom', workflow: 'company_workflow', organization: 'company_organization', onboarding: 'company_onboarding', handbook: 'company_handbook', task: 'mission_manage' };
    const wanted = String(params['query'] ?? '');
    if (wanted && !names[wanted]) throw new Error('Choose boardroom, workflow, organization, onboarding, handbook or task in query.');
    return { ok: true, output: JSON.stringify({ usage: 'Call company_manage with action equal to the operation, id equal to the company ID, and input containing the native arguments below. Schemas describe supported operations, not granted authority. Start, resources, budgets and owner approvals remain owner controls.', tools: coworkNativeTools({ ...source, companyId: 'company-help', chiefOfStaff: true, allowWrites: true, allowConfig: true }, false).filter(tool => (wanted ? [names[wanted]] : Object.values(names)).includes(tool.name)) }) };
  }
  if (action === 'agents') return { ok: true, output: JSON.stringify({ agents: (d.roster?.().listAgents() ?? [source]).map(agent => ({ id: agent.id, name: agent.name, role: agent.tagline })) }) };
  if (['inspect', 'search', 'boardroom', 'workflow', 'organization', 'onboarding', 'handbook', 'task'].includes(action)) {
    const company = d.store.get(String(params['id'] ?? ''));
    if (!company) throw new Error('Choose an existing company workspace.');
    if (action === 'inspect' || action === 'search') return d.scoped(company, () => {
      d.syncKnowledge?.(company);
      return { ok: true, output: JSON.stringify(inspectCoworkCompany(d, company, agentId, { ...params, ...(action === 'search' ? { section: 'search' } : {}) })), companyLink: { id: company.id, name: company.name, state: company.state } };
    });
    const rawInput = params['input'];
    if (!rawInput || typeof rawInput !== 'object' || Array.isArray(rawInput)) throw new Error('Provide native tool arguments in input, including its action.');
    const input = {
      ...(params['agentId'] && !(rawInput as Record<string, unknown>)['agentId'] ? { agentId: params['agentId'] } : {}),
      ...(rawInput as Record<string, unknown>),
    };
    const tool = ({ boardroom: 'company_boardroom', workflow: 'company_workflow', organization: 'company_organization', onboarding: 'company_onboarding', handbook: 'company_handbook', task: 'mission_manage' } as Record<string, string>)[action]!;
    if (!d.agentOperation) throw new Error('Company operations are unavailable.');
    const result = await d.agentOperation(company, agentId, tool, input, invocation);
    return { ...result, ...(result.ok ? { companyLink: { id: company.id, name: company.name, state: company.state } } : {}) };
  }
  if (['add_agent', 'onboard_agent', 'train_agent', 'remove_agent', 'remember', 'recall'].includes(action)) {
    const company = d.store.get(String(params['id'] ?? ''));
    if (!company) throw new Error('Choose an existing company workspace.');
    d.scoped(company, () => d.syncKnowledge?.(company));
    if (action === 'onboard_agent' || action === 'train_agent') {
      const rawInput = params['input'] && typeof params['input'] === 'object' && !Array.isArray(params['input']) ? (params['input'] as Record<string, unknown>) : {};
      const targetAgentId = String(params['agentId'] ?? rawInput['agentId'] ?? '');
      if (!targetAgentId) throw new Error('Choose an existing Cowork teammate.');
      const alreadyMember = d.scoped(company, () => Boolean(d.cowork().getAgent(targetAgentId)));
      if (!alreadyMember) {
        if (!source.allowConfig || !source.allowWrites) throw new Error('Changing company memberships requires a Cowork teammate with configuration and write permission.');
        await call('/api/companies/' + company.id + '/members', 'POST', { agentId: targetAgentId });
      }
      if (!d.agentOperation) throw new Error('Company operations are unavailable.');
      const trainInput = {
        action: String(rawInput['action'] ?? 'train'),
        agentId: targetAgentId,
        ...rawInput,
        ...(params['text'] && !rawInput['training'] ? { training: String(params['text']) } : {}),
      };
      const result = await d.agentOperation(company, agentId, 'company_onboarding', trainInput, invocation);
      return { ...result, ...(result.ok ? { companyLink: { id: company.id, name: company.name, state: company.state } } : {}) };
    }
    if (action === 'add_agent') {
      const result = await call('/api/companies/' + company.id + '/members', 'POST', { agentId: params['agentId'] });
      if (params['input'] && typeof params['input'] === 'object' && !Array.isArray(params['input']) && d.agentOperation) {
        const trainResult = await d.agentOperation(
          company,
          agentId,
          'company_onboarding',
          { action: 'train', agentId: result.agent.id, ...(params['input'] as Record<string, unknown>) },
          invocation,
        );
        if (!trainResult.ok) return trainResult;
        return {
          ok: true,
          companyLink: { id: company.id, name: company.name, state: company.state },
          output: JSON.stringify({
            agent: { id: result.agent.id, name: result.agent.name },
            companyId: company.id,
            onboarding: JSON.parse(trainResult.output),
            next: 'Cowork teammate added, trained on company rules, and onboarded.',
          }),
        };
      }
      return { ok: true, output: JSON.stringify({ agent: { id: result.agent.id, name: result.agent.name }, companyId: company.id, next: 'Cowork teammate added. The owner reviews company authority and onboarding before work starts.' }) };
    }
    if (action === 'remove_agent') return { ok: true, output: JSON.stringify(await call('/api/companies/' + company.id + '/members/' + encodeURIComponent(String(params['agentId'] ?? '')), 'DELETE')) };
    const memory = d.memory?.();
    if (!memory) throw new Error('Shared Cowork memory is unavailable.');
    if (action === 'remember') memory.rememberCompany(company.id, company.name, String(params['text'] ?? ''));
    return { ok: true, output: JSON.stringify({ companyId: company.id, memories: memory.companyEntries(source, company.id, String(params['query'] ?? '')).map(entry => ({ id: entry.id, text: entry.claim, status: entry.status })) }) };
  }
  if (action === 'status') {
    const result = await call('/api/companies/' + encodeURIComponent(String(params['id'] ?? '')) + '/status', 'GET');
    return { ok: true, output: JSON.stringify({ id: result.id, name: result.name, state: result.state, nextReviewAt: result.nextReviewAt, activity: result.activity, jobs: result.jobs, queuedCount: result.queuedCount, pendingDecisions: result.pendingDecisions, management: { ...result.management, meetings: result.management.meetings.map(({ latestText: _text, ...meeting }: { latestText?: string }) => meeting) }, missions: result.missions }), companyLink: { id: result.id, name: result.name, state: result.state } };
  }
  if (action !== 'create') throw new Error('Choose create, list, status, inspect, search, help, agents, add_agent, onboard_agent, train_agent, remove_agent, remember, recall, boardroom, workflow, organization, onboarding, handbook or task. Company start and resource grants belong to the owner.');
  const name = String(params['name'] ?? '').trim(), purpose = String(params['purpose'] ?? '').trim();
  if (!name || !purpose) throw new Error('Provide a company name and concrete purpose.');
  const leadId = String(params['leadId'] ?? source.id), memberIds = Array.isArray(params['memberIds']) ? [...new Set(params['memberIds'].map(String))] : [];
  if (![leadId, ...memberIds].every(id => d.legacyAgent(id))) throw new Error('Select leads and members from the existing Cowork roster.');
  const key = createHash('sha256').update(JSON.stringify([agentId, conversationId, name, purpose])).digest('hex');
  const lockKey = d.store.root + ':' + key;
  const pending = creations.get(lockKey);
  if (pending) return await pending;
  const create = async (): Promise<ToolResult> => {
  const prior = d.store.read<{ companyId: string }>('cowork-company', key);
  let company = prior ? d.store.get(prior.companyId) : undefined;
  if (!company) {
    company = (await call('/api/companies', 'POST', { name, purpose, createdByAgentId: agentId })).company as Company;
    // Persist before linking memberships, so interrupted creation resumes.
    d.store.saveResource('cowork-company', key, company.id, { companyId: company.id, agentId, conversationId });
  } else if (!company.createdByAgentId) {
    company = d.store.update(company.id, { createdByAgentId: agentId });
  }
  if (company.state === 'draft' && !company.leadId) {
    company = (await call('/api/companies/' + company.id + '/lead', 'POST', {
      agentId: leadId,
    })).company as Company;
  }
  for (const agentId of memberIds.filter(id => id !== company!.leadId)) await call('/api/companies/' + company.id + '/members', 'POST', { agentId });
  return {
    ok: true, companyLink: { id: company.id, name: company.name, state: company.state },
    output: JSON.stringify({ company: { id: company.id, name: company.name, state: company.state }, next: company.state === 'draft' ? 'The owner must review resources, budget and file limits, then select Start in Company setup.' : 'Open the company to see its live activity. This request reused the existing company.' }),
  };
  };
  const work = create();
  creations.set(lockKey, work);
  try { return await work; } finally { if (creations.get(lockKey) === work) creations.delete(lockKey); }
}
