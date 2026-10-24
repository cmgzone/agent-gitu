import type { IncomingMessage, ServerResponse } from 'node:http';
import type { CompanyStore, Company } from './store.js';
import type { CoworkStore, CoworkAgent } from '../cowork/store.js';
import { saveWallet, type WalletGrant } from './wallets.js';
import { classifyFollowUp, conversationIntent } from '../agent/follow-up.js';
import { companyConnectedApps, type CompanyApps } from './connected-apps.js';
import { companyDashboard } from './dashboard.js';
import { companyOrganizationApi } from './organization-api.js';
import { CompanyOrganization } from './organization.js';
import { companyBoardroomApi } from './boardroom-api.js';
import { companyHandbookApi } from './handbook-api.js';
import { companyWorkflowApi } from './workflow-api.js';
import { companyCalendarApi } from './calendar-api.js';
import { companyManagementSummary } from './management-summary.js';

function companyHelperWork(cowork: CoworkStore) {
  return cowork
    .subAgents()
    .map((h) => ({
      id: h.id,
      rootAgentId: h.rootAgentId,
      parentAgentId: h.parentAgentId,
      role: h.role,
      objective: h.objective,
      status: h.status,
      statusReason: h.statusReason,
      resultSummary: h.resultSummary,
      activity: h.activity ? { phase: h.activity.phase, current: h.activity.phase === 'reasoning' ? 'Thinking' : h.activity.current } : undefined,
    }));
}

export interface CompanyApiDeps {
  store: CompanyStore;
  body: (req: IncomingMessage) => Promise<Record<string, unknown>>;
  send: (res: ServerResponse, status: number, value: unknown) => void;
  scoped: <T>(company: Company, work: () => T) => T;
  cowork: () => CoworkStore;
  legacyAgent: (id: string) => CoworkAgent | undefined;
  /** Canonical Cowork roster; company stores are membership views of this. */
  roster?: () => CoworkStore;
  memory?: () => import('../cowork/memory.js').CoworkMemory;
  syncKnowledge?: (company: Company) => void;
  /** Executes native agent tools in the target membership with normal authorization. */
  agentOperation?: (company: Company, agentId: string, tool: string, args: Record<string, unknown>, invocation: string) => Promise<import('../types.js').ToolResult>;
  routeCowork: (req: IncomingMessage, res: ServerResponse, path: string, method: string) => Promise<boolean>;
  start: () => void;
  pause: (company: Company) => void | Promise<void>;
  removeCompany?: (company: Company) => Promise<{removed:boolean;companyId:string;projectFilesRetained:boolean;recoverySnapshotSaved:boolean}>;
  priced?: (agent: CoworkAgent) => Promise<boolean>;
  attachments?: (company: Company, files: unknown[]) => string[];
  activity?: () => { agentId: string; agentName: string; phase?: string; tool?: string; task?: string }[];
  invalidateAgent?: (agentId: string) => void;
  removeMember?: (agentId: string) => Promise<void>;
  meetingChanged?: (meetingId: string) => void;
  boardroom?: (companyId:string)=>import('./boardroom.js').CompanyBoardroom;
  onboardingResources?: (companyId: string, requirements: import('./management-models.js').CompanyOnboarding['requirements']) => Promise<string[]>;
  workflows?: (companyId:string)=>import('./workflows.js').CompanyWorkflows;
  calendar?: (companyId:string)=>import('./calendar.js').CompanyCalendar;
  apps?: CompanyApps;
}
export async function companyApi(req: IncomingMessage, res: ServerResponse, path: string, method: string, d: CompanyApiDeps): Promise<boolean> {
  const { store, send } = d;
  if (path === '/api/companies/runtime-settings') {
    if (method === 'GET') send(res, 200, { settings: store.runtimeSettings() });
    else if (method === 'PATCH') send(res, 200, { settings: store.setRuntimeSettings(await d.body(req)) });
    else send(res, 405, { error: 'Method not allowed.' });
    return true;
  }
  if (path === '/api/companies') {
    if (method === 'GET')
      send(res, 200, {
        companies: store
          .companies()
          .map((c) => ({ ...c, usage: usageTotals(store, c.id), decisions: store.actions(c.id).filter((a) => a.state === 'pending' && a.version === c.directionVersion).length })),
        usage: usageTotals(store),
      });
    else if (method === 'POST') send(res, 201, { company: store.create((await d.body(req)) as Partial<Company>) });
    else send(res, 405, { error: 'Method not allowed.' });
    return true;
  }
  if (path === '/api/companies/usage' && method === 'GET') {
    send(res, 200, { usage: store.usage(), totals: usageTotals(store) });
    return true;
  }
  const match = path.match(/^\/api\/companies\/([\w-]+)(\/.*)?$/);
  if (!match) return false;
  let company = store.get(match[1]!);
  if (!company) {
    send(res, 404, { error: 'Company not found.' });
    return true;
  }
  const suffix = match[2] ?? '';
  if (!suffix && method === 'DELETE') {
    const body = await d.body(req);
    if (body['confirmName'] !== company.name) {
      send(res, 400, { error: 'Type the exact company name to confirm deletion.' });
      return true;
    }
    if (!d.removeCompany) {
      send(res, 503, { error: 'Company deletion is unavailable. Please restart Gitu and try again.' });
      return true;
    }
    send(res, 200, await d.removeCompany(company));
    return true;
  }
  return d.scoped(company, async () => {
    const cowork = d.cowork();
    if (method === 'GET' && ['/memory', '/status', '/management'].includes(suffix)) d.syncKnowledge?.(company!);
    if (suffix === '/members' && method === 'GET') {
      send(res, 200, { agents: cowork.listAgents(), availableAgents: (d.roster?.().listAgents() ?? []).filter(agent => !cowork.getAgent(agent.id)) });
      return true;
    }
    if (suffix === '/memory' && method === 'GET') {
      const agent = cowork.getAgent(company!.leadId ?? '') ?? ({ name: '' } as CoworkAgent);
      send(res, 200, { memories: d.memory?.().companyEntries(agent, company!.id) ?? [] });
      return true;
    }
    if (suffix === '/memory' && method === 'POST') {
      const memory = d.memory?.(), body = await d.body(req);
      if (!memory) throw new Error('Shared Cowork memory is unavailable.');
      memory.rememberCompany(company!.id, company!.name, String(body['text'] ?? ''));
      send(res, 201, { ok: true });
      return true;
    }
    if (suffix === '/members' && method === 'POST') {
      const body = await d.body(req), agentId = String(body['agentId'] ?? '');
      if (!d.roster?.().getAgent(agentId)) throw new Error('Choose an existing Cowork teammate.');
      if (cowork.listAgents().length >= company!.staffLimit && !cowork.getAgent(agentId)) throw new Error('This company has reached its staff limit.');
      const organization = new CompanyOrganization(store, company!.id, cowork);
      organization.snapshot();
      const agent = cowork.addAgent(agentId, { skills: company!.skills, cloudConnectionId: company!.computerServerId });
      organization.snapshot();
      if (company!.conversationId) {
        const conversation = cowork.getConversation(company!.conversationId);
        if (conversation) {
          const memberIds = [...new Set([...conversation.memberIds, agent.id])];
          cowork.saveConversation({ ...conversation, kind: memberIds.length > 1 ? 'group' : 'dm', memberIds });
        }
      }
      send(res, 201, { agent });
      return true;
    }
    if (suffix.startsWith('/members/') && method === 'DELETE') {
      const agentId = suffix.slice('/members/'.length);
      if (agentId === company!.leadId) throw new Error('Choose another lead before removing this membership.');
      d.invalidateAgent?.(agentId);
      await d.removeMember?.(agentId);
      const removed = cowork.deleteAgent(agentId);
      if (removed) new CompanyOrganization(store, company!.id, cowork).snapshot();
      send(res, 200, { ok: removed });
      return true;
    }
    if (await companyOrganizationApi(req, res, suffix, method, company!, d)) return true;
    if (await companyBoardroomApi(req, res, suffix, method, company!, d)) return true;
    if (await companyHandbookApi(req, res, suffix, method, company!, d)) return true;
    if (await companyWorkflowApi(req, res, suffix, method, company!, d)) return true;
    if (await companyCalendarApi(req, res, suffix, method, company!, d)) return true;
    if (await companyConnectedApps(req, res, suffix, method, company!, d)) return true;
    if (suffix === '/management' && method === 'GET') {
      send(res, 200, { management: companyManagementSummary(store, company!.id) });
      return true;
    }
    if (suffix === '/dashboard' && method === 'GET') {
      const days = Number(new URL(req.url || '/', 'http://localhost').searchParams.get('days') || 14);
      send(res, 200, {
        ...companyDashboard(store, company!, days),
        missions: cowork.missions(),
        helpers: companyHelperWork(cowork),
        jobs: store.jobs(company!.id).filter((j) => ['queued', 'running'].includes(j.state) && (j.version === company!.directionVersion || j.payload['delivery'] === 'question')),
      });
      return true;
    }
    if (suffix === '/status' && method === 'GET') {
      const activeJobs = store
        .jobs(company!.id)
        .filter((j) => (j.state === 'queued' || j.state === 'running') && (j.version === company!.directionVersion || j.payload['delivery'] === 'question'));
      send(res, 200, {
        id: company!.id,
        name: company!.name,
        state: company!.state,
        access: company!.access,
        direction: company!.direction,
        directionVersion: company!.directionVersion,
        nextReviewAt: company!.nextReviewAt,
        management: companyManagementSummary(store, company!.id),
        answeredQuestions: cowork.listConversations().flatMap(c => cowork.requests(c.id)).filter(r => r.kind === 'question' && r.status === 'answered').slice(-3),
        agents: cowork.listAgents().map((a) => ({ id: a.id, name: a.name })),
        actions: store.actions(company!.id).filter((a) => a.state === 'uncertain' || (a.state === 'pending' && a.version === company!.directionVersion)),
        requests: cowork
          .listConversations()
          .flatMap((c) => cowork.requests(c.id))
          .filter((r) => r.status === 'open'),
        queuedCount: activeJobs.filter((j) => j.state === 'queued').length,
        activity: d.activity?.() ?? [],
        jobs: activeJobs
          .filter((j) => j.version === company!.directionVersion || j.payload['delivery'] === 'question')
          .map((j) => {
            const mission = j.kind === 'mission' ? cowork.missions().find((m) => m.id === j.payload['missionId']) : undefined;
            return {
              id: j.id,
              kind: j.kind,
              state: j.state,
              agentId: mission?.agentId ?? j.payload['agentId'] ?? company!.leadId,
              missionId: mission?.id,
              task: String(mission?.goal ?? (j.kind === 'review' ? 'Review company work' : (j.payload['text'] ?? j.payload['note'] ?? company!.direction))),
            };
          }),
        missions: cowork
          .missions()
          .filter((m) => m.status === 'running' || m.status === 'blocked')
          .map((m) => ({ id: m.id, agentId: m.agentId, goal: m.goal, status: m.status, progress: m.progress, blockers: m.blockers })),
        helpers: companyHelperWork(cowork),
        pendingDecisions: store.actions(company!.id).filter((a) => a.state === 'pending' && a.version === company!.directionVersion).length,
      });
      return true;
    }
    if (suffix === '/wallets') {
      if (method === 'GET') send(res, 200, { wallets: store.list<WalletGrant>('wallet', company!.id), transactions: store.actions(company!.id).filter((a) => a.wallet) });
      else if (method === 'POST') send(res, 201, { wallet: saveWallet(store, company!.id, (await d.body(req)) as Partial<WalletGrant>) });
      else send(res, 405, { error: 'Method not allowed.' });
      return true;
    }
    if (suffix.startsWith('/wallets/') && method === 'DELETE') {
      store.removeResource('wallet', suffix.slice(9), company!.id);
      send(res, 200, { ok: true });
      return true;
    }
    if (!suffix) {
      if (method === 'GET')
        send(res, 200, {
          company,
          activity: d.activity?.() ?? [],
          agents: cowork.listAgents(),
          conversations: cowork.listConversations(),
          missions: cowork.missions(),
          helpers: companyHelperWork(cowork),
          requests: cowork.listConversations().flatMap((c) => cowork.requests(c.id)),
          actions: store.actions(company!.id),
          jobs: store.jobs(company!.id),
          usage: store.usage(company!.id),
          totals: usageTotals(store, company!.id),
          monthly: store.monthlyAccounting(company!.id),
          management: companyManagementSummary(store, company!.id),
        });
      else if (method === 'PATCH') {
        const patch = (await d.body(req)) as Partial<Company>;
        if (patch.defaultStorageId) {
          const storage = store
            .list<{ id: string; provider: string; config: Record<string, string>; permissions: string[] }>('storage', company!.id)
            .find((c) => c.id === patch.defaultStorageId);
          if (
            !storage ||
            !storage.permissions.includes('upload') ||
            (['api', 'mcp'].includes(storage.provider) && !storage.config[storage.provider === 'mcp' ? 'uploadTool' : 'uploadPath'])
          )
            throw new Error('Choose a granted, writable storage connection for company output.');
        }
        if (
          (Object.hasOwn(patch, 'computerServerId') && (patch.computerServerId || undefined) !== (company!.computerServerId || undefined)) ||
          (['cpu', 'memoryMb', 'diskMb'] as const).some((key) => patch[key] !== undefined && patch[key] !== company![key])
        ) {
          if (company!.state === 'running') throw new Error('Pause the company before changing its private computer server or resource limits.');
          if (
            store
              .list<{ state: string; heldSlot?: boolean }>('computer', company!.id)
              .some((c) => c.heldSlot ?? ['starting', 'running', 'sleeping', 'unavailable'].includes(c.state))
          )
            throw new Error('Stop the company’s private desktops before changing their server or resource limits. Unavailable desktops must be reconciled first.');
        }
        const hadHostComputer = company!.allowHostComputer;
        company = store.update(company!.id, patch);
        if (hadHostComputer && patch.allowHostComputer === false) await d.pause(company);
        for (const agent of cowork.listAgents())
          cowork.saveAgent({ ...agent, skills: agent.skills.filter((s) => company!.skills.includes(s)), useHostComputer: false, cloudConnectionId: company!.computerServerId });
        if (company.state === 'running') store.enqueue(company.id, 'review', { reason: 'Company configuration updated' }, 'configuration');
        send(res, 200, { company });
      } else send(res, 405, { error: 'Method not allowed.' });
      return true;
    }
    if (suffix === '/lead' && method === 'POST') {
      const body = await d.body(req),
        sourceId = body['agentId'] ?? body['cloneAgentId'],
        source = sourceId ? d.legacyAgent(String(sourceId)) : undefined;
      if (sourceId && !source) throw new Error('Choose an existing Cowork teammate.');
      let agent = d.roster && source ? cowork.addAgent(source.id, {
        skills: company!.skills, allowShell: source.allowShell, allowWrites: source.allowWrites, allowConfig: source.allowConfig,
        chiefOfStaff: true, cloudConnectionId: company!.computerServerId,
      }) : cowork.saveAgent({
        ...source,
        id: source?.id ?? company!.leadId,
        name: String(body['name'] ?? source?.name ?? 'Company lead'),
        tagline: 'Company lead',
        systemPrompt: String(
          body['instructions'] ??
            source?.systemPrompt ??
            `Lead this company. Plan bounded work, hire helpers when useful, verify outcomes, and wait when there is no useful action. Follow the latest owner direction. Do not expand permissions or budgets.`,
        ),
        provider: typeof body['provider'] === 'string' ? body['provider'] : source?.provider,
        model: typeof body['model'] === 'string' ? body['model'] : source?.model,
        skills: company!.skills,
        allowShell: true,
        allowWrites: true,
        allowConfig: true,
        useHostComputer: false,
        cloudConnectionId: company!.computerServerId,
        chiefOfStaff: true,
      });
      if (d.roster && source) agent = cowork.saveAgent({ ...agent, chiefOfStaff: true });
      const members = cowork.listAgents().map(member => member.id), prior = company!.conversationId ? cowork.getConversation(company!.conversationId) : undefined;
      const conversation = cowork.saveConversation({ ...prior, kind: members.length > 1 ? 'group' : 'dm', memberIds: members, chiefId: agent.id, title: company!.name });
      company = store.update(company!.id, { leadId: agent.id, conversationId: conversation!.id });
      send(res, 200, { company, agent });
      return true;
    }
    if (['/start', '/resume', '/pause', '/archive', '/restore'].includes(suffix) && method === 'POST') {
      const state = suffix === '/start' || suffix === '/resume' ? 'running' : suffix === '/archive' ? 'archived' : 'paused';
      if (state === 'running') {
        const lead = cowork.getAgent(company!.leadId ?? '');
        if (!lead) throw new Error('Choose this company’s lead before starting.');
        if (company!.monthlyBudgetUsd !== null && d.priced && !(await d.priced(lead)))
          throw new Error('Choose a model with known pricing before starting a company with a finite budget.');
        for (const agent of cowork.listAgents()) cowork.saveAgent({ ...agent, skills: company!.skills, useHostComputer: false, cloudConnectionId: company!.computerServerId });
      }
      company = store.transition(company!.id, state);
      if (state === 'running') d.start();
      else await d.pause(company);
      send(res, 200, { company });
      return true;
    }
    if (suffix === '/chat') {
      if (method === 'GET')
        send(res, 200, {
          messages: company!.conversationId ? cowork.messages(company!.conversationId) : [],
          management: companyManagementSummary(store, company!.id),
          artifacts: company!.conversationId ? cowork.artifacts(company!.conversationId) : [],
          requests: cowork
            .listConversations()
            .flatMap((c) => cowork.requests(c.id))
            .filter((r) => r.status === 'open' || (r.kind === 'question' && r.status === 'answered')),
          agents: cowork.listAgents().map((a) => ({ id: a.id, name: a.name })),
          busy: store.jobs(company!.id).some((j) => j.state === 'running'),
        });
      else if (method === 'POST') {
        const body = await d.body(req),
          text = String(body['text'] ?? '').trim(),
          requestedDelivery = String(body['delivery'] ?? 'auto'),
          classification = classifyFollowUp(text),
          delivery =
            requestedDelivery === 'auto' ? (conversationIntent(text) === 'question' ? 'question' : classification.kind === 'CONTINUE' ? 'queue' : 'steer') : requestedDelivery;
        if (!['question', 'steer', 'queue'].includes(delivery) || !text) throw new Error('Choose a delivery mode and enter a message.');
        if (company!.state !== 'running') throw new Error('Resume the company before sending work.');
        const artifactIds = d.attachments?.(company!, Array.isArray(body['files']) ? body['files'] : []) ?? [];
        if (delivery === 'steer') {
          const direction = ['EXTEND', 'CONSTRAIN'].includes(classification.kind) ? `${company!.direction || company!.purpose}\n\n${text}` : text;
          company = store.steer(company!.id, direction);
          await d.pause(company);
          for (const mission of cowork.missions().filter((m) => m.status === 'running' || m.status === 'blocked'))
            cowork.updateMission(mission.id, {
              goal: company.direction,
              criteria: [],
              guidance: [`Owner direction version ${company.directionVersion}: ${company.direction}`],
              status: 'running',
              nextWakeAt: new Date().toISOString(),
            });
        }
        const job = store.enqueue(company!.id, 'message', { text, delivery, artifactIds });
        d.start();
        send(res, 202, { job, company });
      } else send(res, 405, { error: 'Method not allowed.' });
      return true;
    }
    if (suffix === '/usage' && method === 'GET') {
      send(res, 200, { usage: store.usage(company!.id), totals: usageTotals(store, company!.id), monthly: store.monthlyAccounting(company!.id) });
      return true;
    }
    if (suffix === '/events') {
      if (method === 'GET') send(res, 200, { jobs: store.jobs(company!.id), actions: store.actions(company!.id) });
      else if (method === 'POST') {
        const body = await d.body(req);
        if (company!.state !== 'running') throw new Error('Resume the company before delivering an event.');
        const job = store.enqueue(company!.id, 'review', { event: String(body['summary'] ?? 'Connection resources changed.') }, 'review');
        d.start();
        send(res, 202, { job });
      } else send(res, 405, { error: 'Method not allowed.' });
      return true;
    }
    if (suffix === '/team' || suffix.startsWith('/team/')) return d.routeCowork(req, res, '/api/cowork/agents' + suffix.slice(5), method);
    if (suffix === '/work' || suffix.startsWith('/work/')) return d.routeCowork(req, res, '/api/cowork/missions' + suffix.slice(5), method);
    const actionMatch = suffix.match(/^\/actions\/([\w-]+)$/);
    if (actionMatch && method === 'POST') {
      const action = store.actions(company!.id).find((a) => a.id === actionMatch[1]);
      if (!action) {
        send(res, 404, { error: 'Action not found.' });
        return true;
      }
      const body = await d.body(req);
      if (action.version !== company!.directionVersion && action.state !== 'uncertain') throw new Error('This action belongs to an older direction.');
      if (action.state === 'uncertain') {
        if (!['confirmed-done', 'confirmed-not-submitted'].includes(String(body['resolution']))) throw new Error('Choose whether the action completed or did not happen.');
        if (!String(body['receipt'] ?? '').trim()) throw new Error('Explain how you checked the result before saving it.');
        store.actionState(
          action,
          body['resolution'] === 'confirmed-done' ? 'done' : action.version !== company!.directionVersion ? 'rejected' : 'approved',
          String(body['receipt']),
          'uncertain',
        );
        store.enqueue(company!.id, 'review', {}, 'review');
        d.start();
        send(res, 200, { action });
        return true;
      }
      if (action.state !== 'pending') throw new Error('Only pending actions can be approved or rejected.');
      if (!['approved', 'rejected'].includes(String(body['state']))) throw new Error('Choose approved or rejected.');
      store.actionState(action, body['state'] as 'approved' | 'rejected', undefined, 'pending');
      store.enqueue(company!.id, 'review', {}, 'review');
      d.start();
      send(res, 200, { action });
      return true;
    }
    if (suffix.startsWith('/cowork/')) return await d.routeCowork(req, res, '/api' + suffix, method);
    send(res, 404, { error: 'Company route not found.' });
    return true;
  });
}
export function usageTotals(
  store: CompanyStore,
  companyId?: string,
): { inputTokens: number; outputTokens: number; cachedTokens: number; knownCostUsd: number; unknownCostCalls: number; calls: number } {
  return store.usage(companyId).reduce(
    (a, u) => ({
      inputTokens: a.inputTokens + (u.inputTokens ?? 0),
      outputTokens: a.outputTokens + (u.outputTokens ?? 0),
      cachedTokens: a.cachedTokens + (u.cachedTokens ?? 0),
      knownCostUsd: a.knownCostUsd + (u.costUsd ?? 0),
      unknownCostCalls: a.unknownCostCalls + (u.costUsd === undefined ? 1 : 0),
      calls: a.calls + 1,
    }),
    { inputTokens: 0, outputTokens: 0, cachedTokens: 0, knownCostUsd: 0, unknownCostCalls: 0, calls: 0 },
  );
}
