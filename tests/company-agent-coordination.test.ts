import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Script } from 'node:vm';
import { afterEach, describe, expect, it } from 'vitest';
import { CompanyStore } from '../src/company/store.js';
import { CompanyOrganization } from '../src/company/organization.js';
import { CompanyBoardroom } from '../src/company/boardroom.js';
import { executeBoardroomTool } from '../src/company/boardroom-tool.js';
import { CompanyWorkflows } from '../src/company/workflows.js';
import { executeWorkflowTool } from '../src/company/workflow-api.js';
import { companyManagementSummary } from '../src/company/management-summary.js';
import { companyPolicy } from '../src/company/policy.js';
import { CoworkStore } from '../src/cowork/store.js';
import { coworkNativeTools, executeCoworkTool } from '../src/cowork/tools.js';
import { COMPANY_JS } from '../src/server/ui-companies.js';

const cleanup: (() => void)[] = [];
const director = { kind: 'director' as const };
afterEach(() =>
  cleanup
    .splice(0)
    .reverse()
    .forEach((fn) => fn()),
);
function fixture() {
  const root = mkdtempSync(path.join(os.tmpdir(), 'gitu-agent-coordination-')),
    store = new CompanyStore(root);
  cleanup.push(() => {
    store.close();
    rmSync(root, { recursive: true, force: true });
  });
  const company = store.create({ name: 'Studio', purpose: 'Research', monthlyBudgetUsd: null, maxFileBytes: null });
  const cowork = new CoworkStore(undefined, undefined, { companyId: company.id, persistence: store.snapshot(company.id) });
  const lead = cowork.saveAgent({ name: 'Ari', systemPrompt: 'Lead', chiefOfStaff: true });
  const employee = cowork.saveAgent({ name: 'Milo', systemPrompt: 'Research', allowWrites: false, allowConfig: false, allowShell: false });
  const conversation = cowork.saveConversation({ kind: 'group', memberIds: [lead.id, employee.id], chiefId: lead.id });
  store.update(company.id, { leadId: lead.id, conversationId: conversation.id });
  store.transition(company.id, 'running');
  const org = new CompanyOrganization(store, company.id, cowork);
  org.snapshot();
  const room = new CompanyBoardroom(org),
    workflows = new CompanyWorkflows(org);
  const actor = { kind: 'agent' as const, agentId: employee.id },
    ceo = { kind: 'agent' as const, agentId: lead.id };
  const request = {
    title: 'Discuss conflicting research',
    reason: 'Interview evidence disagrees with the plan.',
    participants: [{ agentId: lead.id }],
    agenda: ['Resolve the evidence gap'],
  };
  const draft = {
    title: 'Customer research',
    inputs: { type: 'object' as const },
    parallelism: 1,
    steps: [
      {
        id: 'research',
        name: 'Research',
        type: 'mission' as const,
        agentId: employee.id,
        goal: 'Write an evidence-based report',
        criteria: ['Cite interview evidence'],
        dependsOn: [],
        bindings: {},
        inputSchema: { type: 'object' as const },
        outputSchema: { type: 'string' as const },
        tools: [],
        skills: [],
        connectionIds: [],
        accountIds: [],
        maxSessions: 2,
        maxAttempts: 1,
        timeoutMinutes: 5,
      },
    ],
  };
  return { root, store, company, cowork, lead, employee, org, room, workflows, actor, ceo, request, draft };
}
describe('Agent initiated company coordination', () => {
  it('lets an employee use native meeting requests and workflow proposals without extra profile or management grants', async () => {
    const f = fixture(),
      policy = companyPolicy(f.store, f.company.id, f.employee.id, f.store.get(f.company.id)!.directionVersion);
    const context = {
      authorizeTool: async (tool: string, args: Record<string, unknown>) => f.org.authorizeTool(f.employee.id, tool, args) ?? (await policy.authorize(tool, args)),
      companyBoardroom: async (args: Record<string, unknown>) => executeBoardroomTool(f.room, f.actor, args),
      companyWorkflow: async (args: Record<string, unknown>) => executeWorkflowTool(f.workflows, f.employee.id, args, 'owner-request'),
    };
    const scope = { agent: f.employee, store: f.cowork, conversationId: 'company-chat' },
      perms = { allowWrites: false, allowConfig: false, allowShell: false, chief: false, browser: false };
    const tools = coworkNativeTools(f.employee, false);
    expect(JSON.stringify(tools.find((t) => t.name === 'company_boardroom'))).toContain('review_request');
    expect(JSON.stringify(tools.find((t) => t.name === 'company_workflow'))).toContain('propose');
    const meeting = await executeCoworkTool(context as never, 'company_boardroom', { action: 'request', input: f.request }, perms, scope as never);
    expect(meeting.ok, meeting.output).toBe(true);
    const workflow = await executeCoworkTool(context as never, 'company_workflow', { action: 'propose', input: f.draft }, perms, scope as never);
    expect(workflow.ok, workflow.output).toBe(true);
    expect(f.room.list(director)).toEqual([]);
    expect(f.cowork.missions()).toEqual([]);
    expect(f.org.member(f.employee.id).authority.capabilities).toEqual([]);
    expect(f.cowork.getAgent(f.employee.id)?.allowWrites).toBe(false);
    f.store.transition(f.company.id, 'paused');
    expect((await executeCoworkTool(context as never, 'company_boardroom', { action: 'request', input: f.request }, perms, scope as never)).ok).toBe(false);
  });
  it('deduplicates employee meeting requests and preserves them through a store reopen', () => {
    const f = fixture(),
      first = f.room.request(f.actor, f.request),
      repeat = f.room.request(f.actor, f.request);
    expect(repeat.id).toBe(first.id);
    expect(f.room.requests(f.ceo)).toHaveLength(1);
    expect(f.store.jobs(f.company.id)).toEqual([
      expect.objectContaining({ kind: 'wake', payload: expect.objectContaining({ agentId: f.lead.id, conversationId: f.store.get(f.company.id)!.conversationId }) }),
    ]);
    const reopened = new CompanyStore(f.root);
    try {
      expect(companyManagementSummary(reopened, f.company.id).meetingRequests[0]?.id).toBe(first.id);
    } finally {
      reopened.close();
    }
    expect(f.org.context(f.lead.id)).toContain(first.id);
    expect(f.org.context(f.employee.id)).toContain('company_workflow propose');
  });
  it('schedules a reviewed request exactly once and retains who asked for it', () => {
    const f = fixture(),
      request = f.room.request(f.actor, f.request);
    expect(() => f.room.reviewRequest(f.actor, request.id, request.revision, true)).toThrow('authority');
    const scheduled = f.room.reviewRequest(f.ceo, request.id, request.revision, true);
    expect(scheduled.state).toBe('scheduled');
    expect(f.room.read(director, scheduled.meetingId!)).toMatchObject({ requestedBy: f.employee.id, requestId: request.id, state: 'scheduled' });
    expect(() => f.room.reviewRequest(f.ceo, request.id, request.revision, true)).toThrow('changed');
    expect(f.room.list(director)).toHaveLength(1);
    expect(companyManagementSummary(f.store, f.company.id).counts.requests).toBe(0);
  });
  it('keeps the request pending when scheduling fails and rejects stale direction or foreign requests', () => {
    const f = fixture(),
      request = f.room.request(f.actor, f.request);
    f.org.updateMember(director, f.lead.id, { status: 'suspended' }, f.org.snapshot().revision);
    expect(() => f.room.reviewRequest(director, request.id, request.revision, true)).toThrow('chair');
    expect(f.room.requests(director)[0]?.state).toBe('pending');
    expect(f.room.list(director)).toEqual([]);
    f.store.steer(f.company.id, 'Use new evidence');
    expect(() => f.room.reviewRequest(director, request.id, request.revision, true)).toThrow('Direction changed');
    expect(() => f.room.reviewRequest(director, 'foreign-request', 1, true)).toThrow('not found');
    expect(f.room.reviewRequest(director, request.id, request.revision, false, 'No longer needed').state).toBe('declined');
  });
  it('rejects inactive employees, helpers and foreign participants without creating a request', () => {
    const f = fixture();
    expect(() => f.room.request({ kind: 'agent', agentId: 'helper' }, f.request)).toThrow('permanent');
    expect(() => f.room.request(f.actor, { ...f.request, participants: [{ agentId: 'foreign-agent' }] })).toThrow('permanent');
    f.org.updateMember(director, f.employee.id, { status: 'suspended' }, f.org.snapshot().revision);
    expect(() => f.room.request(f.actor, f.request)).toThrow('active');
    expect(f.store.list('meeting-request', f.company.id)).toEqual([]);
  });
  it('keeps employee workflow drafts reviewable without allowing self approval or execution', () => {
    const f = fixture();
    expect(() => f.workflows.save(f.actor, f.draft)).toThrow('authority');
    const proposed = executeWorkflowTool(f.workflows, f.employee.id, { action: 'create', input: f.draft }, 'native-message');
    const w = JSON.parse(proposed.output);
    expect(w.versions[0].state).toBe('draft');
    expect(() => f.workflows.approve(f.actor, w.id, 1, w.revision)).toThrow('director');
    expect(() => f.workflows.start(f.ceo, w.id, 1, {})).toThrow('Approve this workflow');
    expect(f.cowork.missions()).toEqual([]);
    const again = JSON.parse(executeWorkflowTool(f.workflows, f.employee.id, { action: 'propose', input: f.draft }, 'native-message').output);
    expect(again.id).toBe(w.id);
    f.workflows.propose(f.actor, { ...f.draft, id: w.id, revision: w.revision, title: 'Updated draft' });
    expect(JSON.parse(executeWorkflowTool(f.workflows, f.employee.id, { action: 'propose', input: f.draft }, 'native-message').output).id).toBe(w.id);
    f.workflows.approve(director, w.id, 2, f.workflows.read(director, w.id).revision);
    expect(() => f.workflows.propose(f.actor, { ...f.draft, id: w.id, revision: 3 })).toThrow('own draft');
  });
  it('validates actual supplied workflow input rather than validating the definition alone', () => {
    const f = fixture(),
      w = f.workflows.propose(f.actor, { ...f.draft, inputs: { type: 'object', properties: { topic: { type: 'string' } }, required: ['topic'] } });
    const result = executeWorkflowTool(f.workflows, f.employee.id, { action: 'validate', id: w.id, version: 1, input: {} });
    expect(JSON.parse(result.output)).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'input', message: 'Workflow input.topic is required' })]));
  });
  it('projects current coordination and discussion evidence without exposing another company or full transcripts', () => {
    const f = fixture();
    f.room.request(f.actor, f.request);
    f.workflows.propose(f.actor, f.draft);
    const m = f.room.create(f.ceo, { title: 'Evidence review', participants: [{ agentId: f.employee.id }], agenda: ['Evidence'] });
    f.room.begin(f.ceo, m.id);
    const floor = f.room.grant(f.ceo, m.id, { agentId: f.employee.id, agendaId: m.agenda[0]!.id });
    f.room.contribute(f.actor, m.id, floor.lease!.id, { text: 'Verified evidence '.repeat(100) });
    const other = f.store.create({ purpose: 'Other company' }),
      summary = companyManagementSummary(f.store, f.company.id);
    expect(summary.counts).toEqual({ requests: 1, meetings: 1, drafts: 1 });
    expect(summary.meetings[0]?.contributions).toBe(1);
    expect(summary.meetings[0]?.latestText?.length).toBeLessThanOrEqual(600);
    expect(summary.meetings[0]).not.toHaveProperty('participants');
    expect(companyManagementSummary(f.store, other.id)).toMatchObject({
      meetingRequests: [],
      meetings: [],
      workflowDrafts: [],
      workflowRuns: [],
      counts: { requests: 0, meetings: 0, drafts: 0 },
    });
    expect(() => new Script(COMPANY_JS)).not.toThrow();
  });
});
