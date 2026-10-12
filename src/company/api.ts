import type { IncomingMessage, ServerResponse } from 'node:http';
import type { CompanyStore, Company } from './store.js';
import type { CoworkStore, CoworkAgent } from '../cowork/store.js';
import { saveWallet, type WalletGrant } from './wallets.js';
import { classifyFollowUp, conversationIntent } from '../agent/follow-up.js';

export interface CompanyApiDeps {
  store: CompanyStore;
  body: (req: IncomingMessage) => Promise<Record<string, unknown>>;
  send: (res: ServerResponse, status: number, value: unknown) => void;
  scoped: <T>(company: Company, work: () => T) => T;
  cowork: () => CoworkStore;
  legacyAgent: (id: string) => CoworkAgent | undefined;
  routeCowork: (req: IncomingMessage, res: ServerResponse, path: string, method: string) => Promise<boolean>;
  start: () => void;
  pause: (company: Company) => void | Promise<void>;
  priced?: (agent: CoworkAgent) => Promise<boolean>;
  attachments?: (company: Company, files: unknown[]) => string[];
  activity?: () => { agentId: string; agentName: string; phase?: string; tool?: string }[];
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
        companies: store.companies().map((c) => ({ ...c, usage: usageTotals(store, c.id), decisions: store.actions(c.id).filter((a) => a.state === 'pending' && a.version === c.directionVersion).length })),
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
  return d.scoped(company, async () => {
    const cowork = d.cowork();
    if (suffix === '/status' && method === 'GET') {
      const activeJobs = store.jobs(company!.id).filter(j => j.state === 'queued' || j.state === 'running');
      send(res, 200, {
        id: company!.id, name: company!.name, state: company!.state, direction: company!.direction, directionVersion: company!.directionVersion, nextReviewAt: company!.nextReviewAt,
        agents: cowork.listAgents().map(a => ({ id: a.id, name: a.name })),
        actions: store.actions(company!.id).filter(a => a.state === 'pending' && a.version === company!.directionVersion),
        queuedCount: activeJobs.filter(j => j.state === 'queued').length,
        activity: d.activity?.() ?? [],
        jobs: activeJobs.slice(0, 50).map(j => ({ id: j.id, kind: j.kind, state: j.state })),
        missions: cowork.missions().filter(m => m.status === 'running' || m.status === 'blocked').map(m => ({ id: m.id, goal: m.goal, status: m.status, progress: m.progress })),
        pendingDecisions: store.actions(company!.id).filter(a => a.state === 'pending' && a.version === company!.directionVersion).length,
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
          requests: cowork.listConversations().flatMap((c) => cowork.requests(c.id)),
          actions: store.actions(company!.id),
          jobs: store.jobs(company!.id),
          usage: store.usage(company!.id),
          totals: usageTotals(store, company!.id),
          monthly: store.monthlyAccounting(company!.id),
        });
      else if (method === 'PATCH') {
        const patch = (await d.body(req)) as Partial<Company>;
        if (patch.defaultStorageId) {
          const storage = store.list<{ id: string; provider: string; config: Record<string, string>; permissions: string[] }>('storage', company!.id).find(c => c.id === patch.defaultStorageId);
          if (!storage || !storage.permissions.includes('upload') ||
              (['api','mcp'].includes(storage.provider) && !storage.config[storage.provider === 'mcp' ? 'uploadTool' : 'uploadPath']))
            throw new Error('Choose a granted, writable storage connection for company output.');
        }
        if ((Object.hasOwn(patch, 'computerServerId') && (patch.computerServerId || undefined) !== (company!.computerServerId || undefined)) ||
            (['cpu','memoryMb','diskMb'] as const).some(key => patch[key] !== undefined && patch[key] !== company![key])) {
          if (company!.state === 'running') throw new Error('Pause the company before changing its private computer server or resource limits.');
          if (store.list<{ state: string; heldSlot?: boolean }>('computer', company!.id).some(c => c.heldSlot ?? ['starting', 'running', 'sleeping', 'unavailable'].includes(c.state)))
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
        source = body['cloneAgentId'] ? d.legacyAgent(String(body['cloneAgentId'])) : undefined;
      const agent = cowork.saveAgent({
        ...source,
        id: company!.leadId,
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
      const conversation = company!.conversationId
        ? cowork.getConversation(company!.conversationId)
        : cowork.saveConversation({ kind: 'dm', memberIds: [agent.id], chiefId: agent.id, title: company!.name });
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
          artifacts: company!.conversationId ? cowork.artifacts(company!.conversationId) : [],
          busy: store.jobs(company!.id).some((j) => j.state === 'running'),
        });
      else if (method === 'POST') {
        const body = await d.body(req),
          text = String(body['text'] ?? '').trim(),
          requestedDelivery = String(body['delivery'] ?? 'auto'),
          classification = classifyFollowUp(text),
          delivery = requestedDelivery === 'auto' ? (conversationIntent(text) === 'question' ? 'question' : classification.kind === 'CONTINUE' ? 'queue' : 'steer') : requestedDelivery;
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
        const job = store.enqueue(company!.id, 'review', { event: String(body['summary'] ?? 'Connection resources changed.').slice(0, 1000) }, 'review');
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
        if (!['confirmed-done', 'confirmed-not-submitted'].includes(String(body['resolution'])))
          throw new Error('Reconcile with the provider and choose confirmed-done or confirmed-not-submitted.');
        if (!String(body['receipt'] ?? '').trim()) throw new Error('Record the provider receipt or reconciliation evidence.');
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
