import { usageTotals, type CompanyApiDeps } from './api.js';
import type { Company } from './store.js';
import { CompanyOrganization } from './organization.js';
import { CompanyBoardroom } from './boardroom.js';
import { companyWorkflowService } from './workflow-api.js';
import { companyManagementSummary } from './management-summary.js';
import type { CompanyHandbookEntry } from './management-models.js';

/** Shared facts are discoverable by Cowork; detailed discussions retain attendance checks. */
export function inspectCoworkCompany(deps: CompanyApiDeps, company: Company, agentId: string, args: Record<string, unknown>) {
  const cowork = deps.cowork(),
    organization = new CompanyOrganization(deps.store, company.id, cowork);
  const actor = { kind: 'agent' as const, agentId },
    member = cowork.getAgent(agentId);
  const section = String(args['section'] ?? 'overview'),
    resourceId = String(args['resourceId'] ?? '');
  const query = String(args['query'] ?? '')
    .trim()
    .toLowerCase();
  const offset = Number(args['offset'] ?? 0),
    limit = Number(args['limit'] ?? 10);
  if (!Number.isInteger(offset) || offset < 0 || !Number.isInteger(limit) || limit < 1 || limit > 30)
    throw new Error('Choose an offset of zero or greater and a limit between 1 and 30.');
  const page = (items: unknown[]) => ({
    items: items.slice(offset, offset + limit),
    total: items.length,
    offset,
    nextOffset: offset + limit < items.length ? offset + limit : null,
  });
  const matches = (item: unknown) => !query || JSON.stringify(item).toLowerCase().includes(query);
  const shared = deps.memory?.().companyEntries(deps.legacyAgent(agentId)!, company.id) ?? [];
  const common = { company: { id: company.id, name: company.name, state: company.state, purpose: company.purpose, direction: company.direction, leadId: company.leadId }, section };
  const team = organization.snapshot().members.map((m) => ({ ...m, name: cowork.getAgent(m.agentId)?.name }));
  const rawManagement = companyManagementSummary(deps.store, company.id);
  const management = { ...rawManagement, meetings: rawManagement.meetings.map((m) => ({ ...m, latestText: undefined })) };
  if (section === 'overview')
    return {
      ...common,
      team,
      management,
      memories: page(shared),
      detailAccess: member ? 'Company membership and meeting attendance apply.' : 'Shared summaries only. Join this company to inspect tasks and discussions.',
    };
  if (section === 'team') return { ...common, ...page(team.filter(matches)), departments: organization.departments() };
  if (section === 'spending')
    return {
      ...common,
      budgetUsd: company.monthlyBudgetUsd,
      totals: usageTotals(deps.store, company.id),
      monthly: deps.store.monthlyAccounting(company.id),
      ...page(deps.store.usage(company.id).filter(matches)),
    };
  if (section === 'knowledge') return { ...common, ...page(shared.filter(matches)) };
  if (section === 'search' && !member)
    return {
      ...common,
      access: 'Shared company knowledge; detailed records require membership.',
      ...page(shared.filter(matches).map((e) => ({ section: 'knowledge', id: e.id, text: e.claim }))),
    };
  // No private agent memories, credentials or general Cowork conversations enter this index.
  if (!member || organization.member(agentId).status === 'suspended')
    throw new Error('Company details require a current, nonsuspended company membership. Shared information is available through overview and knowledge.');
  const room = deps.boardroom?.(company.id) ?? new CompanyBoardroom(organization);
  const workflows = companyWorkflowService(company, deps);
  if (section === 'meetings') {
    if (resourceId) {
      const meeting = room.read(actor, resourceId);
      return { ...common, meeting: { ...meeting, contributions: undefined }, contributions: page(meeting.contributions.filter(matches)) };
    }
    return {
      ...common,
      ...page(
        room
          .list(actor)
          .filter(matches)
          .map((m) => ({ id: m.id, title: m.title, state: m.state, startAt: m.startAt, summary: m.summary, decisions: m.decisions, actionItems: m.actionItems })),
      ),
    };
  }
  if (section === 'tasks') {
    const tasks = cowork.missions();
    if (resourceId) {
      const task = tasks.find((m) => m.id === resourceId);
      if (!task) throw new Error('Task not found in this company.');
      return { ...common, task };
    }
    return { ...common, ...page(tasks.filter(matches)) };
  }
  if (section === 'workflows') return { ...common, ...(resourceId ? { workflow: workflows.read(actor, resourceId) } : page(workflows.list(actor).filter(matches))) };
  if (section === 'runs') return { ...common, ...(resourceId ? { run: workflows.run(actor, resourceId) } : page(workflows.runs(actor).filter(matches))) };
  if (section === 'handbook') {
    const entries = deps.store.list<CompanyHandbookEntry>('handbook', company.id).filter((e) => e.state === 'current');
    return {
      ...common,
      ...page(
        entries
          .filter((e) => !resourceId || e.id === resourceId)
          .map((e) => ({ id: e.id, title: e.title, kind: e.kind, version: e.approvedVersion, content: e.versions.find((v) => v.version === e.approvedVersion)?.content }))
          .filter(matches),
      ),
    };
  }
  if (section === 'activity') return { ...common, ...page(organization.events().filter(matches).reverse()) };
  if (section === 'search') {
    if (!query) throw new Error('Provide a search query.');
    const records = [
      ...cowork.missions().map((m) => ({ section: 'tasks', id: m.id, title: m.goal, text: [m.progress, m.result, m.blockers].filter(Boolean).join('\n') })),
      ...room
        .list(actor)
        .map((m) => ({
          section: 'meetings',
          id: m.id,
          title: m.title,
          text: [m.description, ...m.contributions.map((c) => c.text), ...m.decisions.map((d) => d.title)].join('\n'),
        })),
      ...workflows.list(actor).map((w) => ({ section: 'workflows', id: w.id, title: w.title, text: JSON.stringify(w) })),
      ...workflows.runs(actor).map((r) => ({ section: 'runs', id: r.id, title: r.workflowId, text: JSON.stringify(r) })),
      ...deps.store
        .list<CompanyHandbookEntry>('handbook', company.id)
        .filter((e) => e.state === 'current' && e.approvedVersion)
        .map((e) => ({ section: 'handbook', id: e.id, title: e.title, text: e.versions.find((v) => v.version === e.approvedVersion)?.content ?? '' })),
      ...shared.map((e) => ({ section: 'knowledge', id: e.id, title: 'Shared company memory', text: e.claim })),
    ]
      .filter(matches)
      .map((record) => {
        const at = Math.max(0, record.text.toLowerCase().indexOf(query) - 150);
        return { ...record, text: record.text.slice(at, at + 900) };
      });
    return { ...common, ...page(records) };
  }
  throw new Error('Choose overview, team, tasks, meetings, workflows, runs, handbook, activity, spending, knowledge or search.');
}
