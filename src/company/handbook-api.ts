import type { IncomingMessage, ServerResponse } from 'node:http';
import type { CompanyApiDeps } from './api.js';
import type { Company } from './store.js';
import { CompanyHandbook } from './handbook.js';
import { CompanyOrganization } from './organization.js';
import { CompanyOnboardingService } from './onboarding.js';
import { coworkNativeTools } from '../cowork/tools.js';

export function companyOnboardingService(company: Company, deps: CompanyApiDeps): CompanyOnboardingService {
  const org = new CompanyOrganization(deps.store, company.id, deps.cowork());
  return new CompanyOnboardingService(org, new CompanyHandbook(org), deps.boardroom?.(company.id), (id) => {
    const agent = org.cowork.getAgent(id);
    return agent ? coworkNativeTools(agent, true).map((t) => t.name) : [];
  });
}

/** Runs behind the existing authenticated company scope and owner API. */
export async function companyHandbookApi(req: IncomingMessage, res: ServerResponse, suffix: string, method: string, company: Company, deps: CompanyApiDeps): Promise<boolean> {
  if (!/^\/(handbook|onboarding)(\/|$)/.test(suffix)) return false;
  const service = companyOnboardingService(company, deps),
    handbook = service.handbook,
    actor = { kind: 'director' as const };
  if (suffix === '/handbook' && method === 'GET') deps.send(res, 200, { entries: handbook.list(actor), policy: handbook.policy() });
  else if (suffix === '/handbook' && method === 'POST') deps.send(res, 201, { entry: handbook.propose(actor, (await deps.body(req)) as never) });
  else if (suffix === '/onboarding' && method === 'GET') deps.send(res, 200, { records: service.list(actor) });
  else {
    const match = suffix.match(/^\/(handbook|onboarding)\/([\w:-]+)(?:\/([\w-]+))?$/);
    if (!match) {
      deps.send(res, 404, { error: 'Company guidance route not found.' });
      return true;
    }
    const [, area, id, action] = match;
    if (!action && method === 'GET') {
      if (area === 'handbook') deps.send(res, 200, { entry: handbook.read(actor, id!) });
      else {
        const record = service.read(actor, id!),
          mission = record.assessment && deps.cowork().getMission(record.assessment.missionId);
        deps.send(res, 200, {
          record,
          problems: service.problems(record),
          mission,
          evidence: mission
            ? deps
                .cowork()
                .messages(mission.conversationId)
                .filter((m) => ['agent', 'system'].includes(m.role) && m.agentId === id && m.missionId === mission.id && Date.parse(m.ts) >= Date.parse(mission.createdAt))
                .map((m) => ({ id: m.id, text: m.text, tools: m.tools, artifactIds: m.artifactIds, at: m.ts }))
            : [],
        });
      }
    } else if (method === 'POST') {
      const input = await deps.body(req),
        revision = Number(input['revision']);
      if (!Number.isSafeInteger(revision) || revision < 1) throw new Error('Include the current record revision.');
      if (area === 'handbook') {
        let entry;
        if (action === 'review') {
          if (typeof input['approved'] !== 'boolean' || (input['retraining'] !== undefined && typeof input['retraining'] !== 'boolean'))
            throw new Error('Choose an explicit handbook approval.');
          entry = handbook.review(actor, id!, Number(input['version']), input['approved'], revision, input['retraining'] === true);
        } else if (action === 'archive') entry = handbook.archive(actor, id!, revision);
        else if (action === 'propose') entry = handbook.propose(actor, { id: id!, revision, content: String(input['content'] ?? '') });
        else {
          deps.send(res, 404, { error: 'Handbook action not found.' });
          return true;
        }
        if (input['retraining'] === true) for (const member of service.organization.snapshot().members) deps.invalidateAgent?.(member.agentId);
        deps.send(res, 200, { entry });
      } else {
        let record;
        if (action === 'orient') record = service.orient(actor, id!, revision, input['requirements'] as never);
        else if (action === 'schedule') record = service.schedule(actor, id!, revision);
        else if (action === 'check') {
          const saved = service.read(actor, id!);
          const problems = deps.onboardingResources
            ? await deps.onboardingResources(company.id, saved.requirements)
            : saved.requirements.accountIds.length || saved.requirements.connectionIds.length
              ? ['Connection availability has not been verified by this host.']
              : [];
          record = service.check(actor, id!, revision, problems);
        } else if (action === 'assess') record = service.assess(actor, id!, revision, input as never);
        else if (action === 'review') record = service.review(actor, id!, revision, input as never);
        else if (action === 'activate') {
          const saved = service.read(actor, id!);
          const problems = deps.onboardingResources
            ? await deps.onboardingResources(company.id, saved.requirements)
            : saved.requirements.accountIds.length || saved.requirements.connectionIds.length
              ? ['Connection availability has not been verified by this host.']
              : [];
          record = service.activate(actor, id!, revision, problems);
        } else {
          deps.send(res, 404, { error: 'Onboarding action not found.' });
          return true;
        }
        deps.invalidateAgent?.(id!);
        deps.start();
        deps.send(res, 200, { record });
      }
    } else deps.send(res, 405, { error: 'Method not allowed.' });
  }
  return true;
}

export function executeHandbookTool(handbook: CompanyHandbook, agentId: string, args: Record<string, unknown>) {
  const actor = { kind: 'agent' as const, agentId };
  if (args['action'] === 'propose') return { ok: true, output: JSON.stringify(handbook.propose(actor, args['input'] as never)) };
  if (args['action'] === 'read') {
    const entry = handbook.read(actor, String(args['id'])),
      version = entry.versions.find((v) => v.version === entry.approvedVersion && v.state === 'approved');
    return {
      ok: true,
      output: JSON.stringify({
        id: entry.id,
        revision: entry.revision,
        title: entry.title,
        kind: entry.kind,
        state: entry.state,
        approved: entry.state === 'current' ? version : undefined,
      }),
    };
  }
  if (args['action'] === 'list' || !args['action'])
    return {
      ok: true,
      output: JSON.stringify({
        policy: handbook.policy(),
        entries: handbook.list(actor).map((e) => ({
          id: e.id,
          revision: e.revision,
          title: e.title,
          kind: e.kind,
          state: e.state,
          approvedVersion: e.approvedVersion,
          pendingVersions: e.versions.filter((v) => v.state === 'proposed').map((v) => v.version),
        })),
      }),
    };
  throw new Error('Agents may list, read or propose guidance. Director review is required for approval.');
}
