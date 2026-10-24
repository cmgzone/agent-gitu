import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { AsyncLocalStorage } from 'node:async_hooks';
import { expect, it, vi } from 'vitest';
import { GituServer } from '../src/server/server.js';
import { ScriptedMockLlm } from '../src/llm/llm.js';
import { executeCoworkTool } from '../src/cowork/tools.js';
import type { CoworkAgent, CoworkStore } from '../src/cowork/store.js';
import type { CoworkMemory } from '../src/cowork/memory.js';
import type { CompanyStore, Company } from '../src/company/store.js';
import type { CompanyOrganization } from '../src/company/organization.js';
import type { CompanyBoardroom } from '../src/company/boardroom.js';
import type { ToolContext } from '../src/tools/tools.js';

it('manages actual company work from Cowork with scoped authority, searchable evidence, outcome memory and retry receipts', async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'gitu-company-operations-'));
  vi.stubEnv('AGENT_GITU_HOME', root);
  const server = new GituServer({ passwordRequired: false, port: 0, llm: new ScriptedMockLlm([]) });
  const internal = server as unknown as {
    cowork(): CoworkStore;
    companies(): CompanyStore;
    coworkMemory(): CoworkMemory;
    coworkMemoryFor(agent: CoworkAgent): string;
    coworkToolContext(agent: CoworkAgent): ToolContext;
    companyOrganization(id: string): CompanyOrganization;
    companyBoardroom(id: string): CompanyBoardroom;
    syncCompanyKnowledge(company: Company): void;
    ensureCompanyCoordinator(): void;
    companyScope: AsyncLocalStorage<{ id: string; version: number }>;
  };
  try {
    const origin = 'http://localhost:' + (await server.start());
    // Exercise real native dispatch and HTTP reads without admitting background model work.
    vi.spyOn(internal, 'ensureCompanyCoordinator').mockImplementation(() => {});
    const roster = internal.cowork();
    const chief = roster.saveAgent({ name: 'Ari', systemPrompt: 'Coordinate company work.', chiefOfStaff: true, allowWrites: true, allowConfig: true });
    const outsider = roster.saveAgent({ name: 'Sana', systemPrompt: 'Answer questions using evidence.' });
    const conversation = roster.saveConversation({ kind: 'dm', memberIds: [chief.id] });
    const otherConversation = roster.saveConversation({ kind: 'dm', memberIds: [outsider.id] });
    const tool = (agent: CoworkAgent, args: Record<string, unknown>) =>
      executeCoworkTool(
        internal.coworkToolContext(agent),
        'company_manage',
        args,
        { allowWrites: agent.allowWrites, allowConfig: agent.allowConfig, allowShell: false, chief: agent.chiefOfStaff, browser: false },
        { agent, store: roster, memory: internal.coworkMemory(), conversationId: agent.id === chief.id ? conversation.id : otherConversation.id },
      );
    const created = await tool(chief, { action: 'create', name: 'Research studio', purpose: 'Find customer demand.' });
    const company = internal.companies().get(created.companyLink!.id)!;
    const scope = <T>(work: () => T) => internal.companyScope.run({ id: company.id, version: company.directionVersion }, work);
    const request = (args: Record<string, unknown>) => tool(chief, { id: company.id, ...args });
    expect((await request({ action: 'task', input: { action: 'create', goal: 'Not started yet', criteria: ['Verified'] } })).ok).toBe(false);
    internal.companies().update(company.id, { monthlyBudgetUsd: null, maxFileBytes: null });
    internal.companies().transition(company.id, 'running');
    const taskArgs = {
      action: 'task',
      input: { action: 'create', agentId: chief.id, goal: 'Verify Nairobi customer demand', maxSessions: 2, criteria: ['Record customer evidence'] },
    };
    const taskResult = await request(taskArgs);
    expect(taskResult.ok, taskResult.output).toBe(true);
    const task = JSON.parse(taskResult.output);
    expect(task.maxTurns).toBe(2);
    scope(() => internal.cowork().updateMission(task.id, { status: 'done', result: 'Five interviews found demand for shared planning.', finishedAt: new Date().toISOString() }));
    expect((await request(taskArgs)).output).toBe(taskResult.output); // Retry after completion cannot create another task.
    expect(scope(() => internal.cowork().missions())).toHaveLength(1);
    expect((await request({ action: 'task', input: { action: 'resume', id: task.id } })).ok).toBe(false);
    const inspection = await request({ action: 'inspect', section: 'tasks', resourceId: task.id });
    expect(JSON.parse(inspection.output).task.result).toContain('Five interviews');
    expect((await request({ action: 'search', query: 'shared planning' })).output).toContain(task.id);
    const memory = await tool(outsider, { action: 'recall', id: company.id, query: 'Five interviews' });
    expect(memory.output).toContain('Five interviews');
    expect((await tool(outsider, { action: 'inspect', id: company.id, section: 'tasks' })).ok).toBe(false);
    expect((await tool(outsider, { action: 'task', id: company.id, input: taskArgs.input })).ok).toBe(false);

    const meetingArgs = {
      action: 'boardroom',
      input: {
        action: 'create',
        input: {
          title: 'Customer evidence review',
          participants: [{ agentId: chief.id }],
          agenda: ['Discuss interview evidence'],
          startAt: new Date(Date.now() + 60000).toISOString(),
        },
      },
    };
    const [first, second] = await Promise.all([request(meetingArgs), request(meetingArgs)]);
    expect(first.ok, first.output).toBe(true);
    expect(second.output).toBe(first.output);
    const meeting = JSON.parse(first.output),
      room = internal.companyBoardroom(company.id);
    expect(room.list({ kind: 'director' })).toHaveLength(1);
    room.begin({ kind: 'director' }, meeting.id);
    const lease = room.grant({ kind: 'director' }, meeting.id, { agentId: chief.id, agendaId: meeting.agenda[0].id }).lease!;
    room.contribute({ kind: 'agent', agentId: chief.id }, meeting.id, lease.id, { text: 'RESTRICTED_TRANSCRIPT customer evidence suggests a pilot.' });
    const decision = room.proposeDecision({ kind: 'agent', agentId: chief.id }, meeting.id, {
      agendaId: meeting.agenda[0].id,
      title: 'Run a small pilot',
      rationale: 'Interview evidence supports a pilot.',
    }).decisions[0]!;
    room.decide({ kind: 'director' }, meeting.id, decision.id, true);
    room.finish({ kind: 'director' }, meeting.id);
    const detail = await request({ action: 'inspect', section: 'meetings', resourceId: meeting.id, limit: 1 });
    expect(detail.output).toContain('RESTRICTED_TRANSCRIPT');
    expect(JSON.parse(detail.output).contributions.total).toBe(1);
    const sharedOverview = await tool(outsider, { action: 'inspect', id: company.id, section: 'overview' });
    expect(sharedOverview.ok).toBe(true);
    expect(sharedOverview.output).not.toContain('RESTRICTED_TRANSCRIPT');
    const sharedNotes = JSON.parse((await tool(outsider, { action: 'recall', id: company.id })).output).memories;
    expect(sharedNotes.some((entry: { text: string }) => entry.text.includes('Run a small pilot [approved]'))).toBe(true);
    expect(JSON.stringify(sharedNotes)).not.toContain('RESTRICTED_TRANSCRIPT');
    const before = internal.coworkMemory().companyEntries(outsider, company.id);
    internal.syncCompanyKnowledge(company);
    internal.syncCompanyKnowledge(company);
    expect(internal.coworkMemory().companyEntries(outsider, company.id)).toHaveLength(before.length);
    scope(() => internal.cowork().updateMission(task.id, { result: 'Six interviews now support a pilot.' }));
    internal.syncCompanyKnowledge(company);
    const revised = internal.coworkMemory().companyEntries(outsider, company.id);
    expect(revised.some((entry) => entry.claim.includes('Five interviews'))).toBe(false);
    expect(revised.some((entry) => entry.claim.includes('Six interviews'))).toBe(true);
    expect(revised.every((entry) => entry.status === 'candidate')).toBe(true);
    expect(internal.coworkMemoryFor(outsider)).toContain('Six interviews');

    scope(() => internal.cowork().updateMission(task.id, { result: 'Five interviews found demand for shared planning.' }));
    internal.syncCompanyKnowledge(company);
    expect(
      internal
        .coworkMemory()
        .companyEntries(outsider, company.id)
        .some((entry) => entry.claim.includes('Five interviews')),
    ).toBe(true);
    expect(
      internal
        .coworkMemory()
        .companyEntries(outsider, company.id)
        .some((entry) => entry.claim.includes('Six interviews')),
    ).toBe(false);

    const help = await request({ action: 'help', query: 'workflow' });
    expect(help.output).toContain('company_workflow');
    expect(help.output).toContain('outputSchema');
    const workflowInput = {
      title: 'Research repeatable process',
      inputs: { type: 'object' },
      parallelism: 1,
      steps: [
        {
          id: 'research',
          name: 'Research',
          type: 'mission',
          agentId: chief.id,
          goal: 'Verify customer demand',
          criteria: ['Cite evidence'],
          dependsOn: [],
          bindings: {},
          inputSchema: { type: 'object' },
          outputSchema: { type: 'string' },
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
    const proposed = await request({ action: 'workflow', input: { action: 'propose', input: workflowInput } });
    expect(proposed.ok, proposed.output).toBe(true);
    const workflow = JSON.parse(proposed.output);
    expect((await request({ action: 'inspect', section: 'workflows', resourceId: workflow.id })).output).toContain('Research repeatable process');
    expect((await request({ action: 'workflow', input: { action: 'approve', id: workflow.id, version: 1, revision: workflow.revision } })).ok).toBe(false);
    expect((await request({ action: 'workflow', input: { action: 'start', id: workflow.id, version: 1, input: {} } })).ok).toBe(false);
    const department = await request({ action: 'organization', input: { action: 'save_department', department: { name: 'Research', purpose: 'Verify customer evidence.' } } });
    expect(department.ok, department.output).toBe(true);
    expect((await request({ action: 'inspect', section: 'spending' })).output).toContain('unknownCostCalls');
    expect((await request({ action: 'inspect', section: 'activity', limit: 1 })).output).toContain('nextOffset');
    expect((await request({ action: 'inspect', section: 'meetings', resourceId: 'foreign-company-record' })).ok).toBe(false);

    const organization = internal.companyOrganization(company.id),
      record = organization.snapshot();
    expect(
      (
        await request({
          action: 'organization',
          input: { action: 'update_member', agentId: chief.id, revision: record.revision, member: { status: 'active', authority: { capabilities: ['assign-work'] } } },
        })
      ).ok,
    ).toBe(false);
    organization.updateMember({ kind: 'director' }, chief.id, { status: 'suspended' }, record.revision);
    expect((await request(meetingArgs)).ok).toBe(false); // Revocation checked before replay receipts.
    expect((await request({ action: 'inspect', section: 'meetings', resourceId: meeting.id })).ok).toBe(false);
    expect((await request({ action: 'inspect', section: 'overview', limit: 0 })).ok).toBe(false);
    const status = await fetch(origin + '/api/companies/' + company.id + '/status').then((response) => response.json());
    expect(status.management.meetings[0].id).toBe(meeting.id);
    expect(roster.messages(conversation.id).filter((message) => message.companyLink?.id === company.id)).toHaveLength(1);
  } finally {
    await server.stop();
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    rmSync(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  }
}, 60000);

it('answers a company question through an ordinary Cowork chat using the saved tool result', async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'gitu-company-chat-question-'));
  vi.stubEnv('AGENT_GITU_HOME', root);
  let companyId = '',
    evidence = '';
  const llm = new ScriptedMockLlm([
    () => '<tool>' + JSON.stringify({ name: 'company_manage', params: { action: 'inspect', id: companyId, section: 'tasks' } }) + '</tool>',
    (_call, messages) => {
      evidence = JSON.stringify(messages);
      return 'The company completed five customer interviews. The saved task contains the evidence.\n<cowork_state>done</cowork_state>';
    },
  ]);
  const server = new GituServer({ passwordRequired: false, port: 0, llm, coworkCompletionProtocol: 'legacy' });
  const internal = server as any;
  try {
    const origin = 'http://localhost:' + (await server.start());
    internal.ensureCompanyCoordinator = () => {};
    const roster = internal.cowork() as CoworkStore;
    const lead = roster.saveAgent({ name: 'Ari', systemPrompt: 'Use company tools to answer from saved evidence.', chiefOfStaff: true, allowWrites: true, allowConfig: true });
    const conversation = roster.saveConversation({ kind: 'dm', memberIds: [lead.id] });
    const created = await internal.coworkCompanyManagement(
      lead,
      { action: 'create', name: 'Interview studio', purpose: 'Research customers.' },
      { agentId: lead.id, conversationId: conversation.id },
    );
    companyId = created.companyLink.id;
    const company = internal.companies().get(companyId);
    internal.companyScope.run({ id: companyId, version: 0 }, () => {
      const store = internal.cowork() as CoworkStore;
      const task = store.createMission({ conversationId: company.conversationId, agentId: lead.id, goal: 'Conduct customer interviews', criteria: ['Record interview evidence'] });
      store.updateMission(task.id, { status: 'done', result: 'Five verified customer interviews completed; evidence stored in the research report.' });
    });
    const route = origin + '/api/cowork/conversations/' + conversation.id + '/messages';
    const response = await fetch(route, {
      method: 'POST',
      headers: { origin, 'content-type': 'application/json' },
      body: JSON.stringify({ id: 'company-question', text: 'What has Interview studio completed?' }),
    });
    expect(response.status).toBe(202);
    await vi.waitFor(
      async () => {
        const data = await fetch(route).then((result) => result.json());
        expect(data.busy).toBe(false);
        expect(data.messages.some((message: { role: string; text: string }) => message.role === 'agent' && message.text.includes('five customer interviews'))).toBe(true);
      },
      { timeout: 15000, interval: 100 },
    );
    expect(evidence).toContain('Five verified customer interviews completed');
    expect(roster.messages(conversation.id).some((message) => message.companyLink?.id === companyId)).toBe(true);
  } finally {
    await server.stop();
    vi.unstubAllEnvs();
    rmSync(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  }
}, 45000);
