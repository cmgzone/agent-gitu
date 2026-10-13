import type { IncomingMessage, ServerResponse } from 'node:http';
import { CompanyOrganization } from './organization.js';
import type { CompanyApiDeps } from './api.js';
import type { Company } from './store.js';
import type { CompanyMember, CompanyDepartment } from './management-models.js';
import { coworkNativeTools } from '../cowork/tools.js';

/** These routes are reached only through the existing authenticated owner API. */
export async function companyOrganizationApi(req: IncomingMessage, res: ServerResponse, suffix: string, method: string, company: Company, deps: CompanyApiDeps): Promise<boolean> {
  if (!['/organization', '/departments', '/management-events'].includes(suffix) && !suffix.startsWith('/organization/members/')) return false;
  const organization = new CompanyOrganization(deps.store, company.id, deps.cowork());
  if (suffix === '/organization' && method === 'GET') {
    deps.send(res, 200, {
      organization: organization.snapshot(),
      departments: organization.departments(),
      agents: deps
        .cowork()
        .listAgents()
        .map((a) => ({ id: a.id, name: a.name, avatar: a.avatar, toolNames: coworkNativeTools(a, true).map((tool) => tool.name) })),
    });
  } else if (suffix.startsWith('/organization/members/') && method === 'PATCH') {
    const input = await deps.body(req),
      agentId = suffix.slice('/organization/members/'.length);
    if (!Number.isInteger(input['revision'])) throw new Error('Include the organization revision shown in the editor.');
    if (!input['member'] || typeof input['member'] !== 'object' || Array.isArray(input['member'])) throw new Error('Enter member settings.');
    const record = organization.updateMember({ kind: 'director' }, agentId, input['member'] as Partial<CompanyMember>, Number(input['revision']));
    deps.invalidateAgent?.(agentId);
    deps.send(res, 200, { organization: record });
  } else if (suffix === '/departments' && method === 'GET') deps.send(res, 200, { departments: organization.departments() });
  else if (suffix === '/departments' && method === 'POST')
    deps.send(res, 201, { department: organization.saveDepartment({ kind: 'director' }, (await deps.body(req)) as Partial<CompanyDepartment>) });
  else if (suffix === '/management-events' && method === 'GET') deps.send(res, 200, { events: organization.events().slice(-200).reverse() });
  else deps.send(res, 405, { error: 'Method not allowed.' });
  return true;
}
