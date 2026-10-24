import { mkdtempSync, rmSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { expect, it, vi } from 'vitest';
import { GituServer } from '../src/server/server.js';
import { ScriptedMockLlm } from '../src/llm/llm.js';

it('saves agent initiated coordination through a real chat, surfaces owner review, and runs a visible discussion', async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'gitu-coordination-http-'));
  vi.stubEnv('AGENT_GITU_HOME', root);
  let leadId = '';
  const call = (name: string, params: unknown) => '<tool>' + JSON.stringify({ name, params }) + '</tool>';
  const llm = new ScriptedMockLlm([
    () =>
      call('company_boardroom', {
        action: 'request',
        input: { title: 'Resolve launch evidence', reason: 'The launch plan needs an evidence review.', agenda: ['Agree on the next research step'] },
      }),
    () =>
      call('company_workflow', {
        action: 'propose',
        input: {
          title: 'Launch research process',
          inputs: { type: 'object' },
          parallelism: 1,
          steps: [
            {
              id: 'research',
              name: 'Research',
              type: 'mission',
              agentId: leadId,
              goal: 'Prepare verified launch research',
              criteria: ['Cite verified evidence'],
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
        },
      }),
    () => 'I saved the meeting request in Boardroom and the workflow draft in Workflows for review.\n<cowork_state>done</cowork_state>',
    () => JSON.stringify({ state: 'done', reason: 'Both requested coordination records were saved and remain available for director review.' }),
    () => 'The launch evidence is incomplete. We should verify customer demand before choosing a launch date.',
  ]);
  const server = new GituServer({ port: 0, passwordRequired: false, llm });
  const failures: string[] = [],
    run = (server as any).executeCompanyMeetingTurn.bind(server);
  (server as any).executeCompanyMeetingTurn = async (input: any) => {
    try {
      return await run(input);
    } catch (error) {
      failures.push(String((error as Error).stack));
      throw error;
    }
  };
  try {
    const origin = 'http://localhost:' + (await server.start());
    const request = async (route: string, method = 'GET', body?: unknown) => {
      const response = await fetch(origin + route, {
        method,
        headers: { origin, 'content-type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      return { status: response.status, data: (await response.json()) as any };
    };
    const company = (await request('/api/companies', 'POST', { name: 'Studio', purpose: 'Launch research', monthlyBudgetUsd: null, maxFileBytes: null })).data.company;
    const base = '/api/companies/' + company.id;
    leadId = (await request(base + '/lead', 'POST', { name: 'Ari' })).data.agent.id;
    const store = (server as any).companies();
    store.transition(company.id, 'running');
    store.scheduleReview(company.id);
    expect((await request(base + '/chat', 'POST', { text: 'Review our launch planning and save the coordination we need.', delivery: 'queue' })).status).toBe(202);
    let management: any;
    await vi.waitFor(
      async () => {
        (server as any).companyCoordinator.tick();
        management = (await request(base + '/status')).data.management;
        expect(management.meetingRequests).toHaveLength(1);
        expect(management.workflowDrafts).toHaveLength(1);
      },
      { timeout: 15000, interval: 100 },
    );
    const pending = management.meetingRequests[0];
    await vi.waitFor(
      async () => {
        const chat = (await request(base + '/chat')).data;
        expect(
          chat.busy,
          JSON.stringify({ messages: chat.messages, jobs: store.jobs(company.id), activity: (await request(base + '/status')).data.activity, calls: (llm as any).call }),
        ).toBe(false);
      },
      { timeout: 15000, interval: 100 },
    );
    expect(pending.requestedBy).toBe(leadId);
    expect((await request(base + '/chat')).data.management.counts).toMatchObject({ requests: 1, drafts: 1 });
    const reviewed = await request(base + '/boardroom/requests/' + pending.id + '/review', 'POST', { revision: pending.revision, approved: true });
    expect(reviewed.status, JSON.stringify(reviewed.data)).toBe(200);
    const meetingId = reviewed.data.request.meetingId;
    await vi.waitFor(
      async () => {
        (server as any).companyCoordinator.tick();
        const meeting = (await request(base + '/boardroom/' + meetingId)).data.meeting;
        if (failures.length) throw new Error(failures.join('\n'));
        expect(meeting.contributions, JSON.stringify({ meeting, jobs: store.jobs(company.id) })).toHaveLength(1);
      },
      { timeout: 15000, interval: 100 },
    );
    (server as any).companyCoordinator.tick();
    const summary = (await request(base + '/management')).data.management;
    expect(summary.meetings[0]).toMatchObject({ id: meetingId, requestedBy: leadId, contributions: 1 });
    expect(summary.meetings[0].latestText).toContain('verify customer demand');
    const workflowId = summary.workflowDrafts[0].id;
    expect((await request(base + '/workflows/' + workflowId)).data.workflow.versions[0]).toMatchObject({ state: 'draft', createdBy: { kind: 'agent', agentId: leadId } });
    const other = (await request('/api/companies', 'POST', { name: 'Other' })).data.company;
    expect((await request('/api/companies/' + other.id + '/management')).data.management.counts).toEqual({ requests: 0, meetings: 0, drafts: 0 });
    expect((await request('/api/companies/' + other.id + '/boardroom/requests/' + pending.id + '/review', 'POST', { revision: 1, approved: true })).status).toBeGreaterThanOrEqual(
      400,
    );
  } finally {
    await server.stop();
    vi.unstubAllEnvs();
    rmSync(root, { recursive: true, force: true });
  }
}, 45000);

it('wakes the lead for an employee request and runs both sides of the discussion without an owner scheduling it', async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'gitu-employee-meeting-http-'));
  vi.stubEnv('AGENT_GITU_HOME', root);
  let requestId = '',
    revision = 1;
  let phase = 0;
  const traces: unknown[] = [];
  const llm = new ScriptedMockLlm([
    (_call, messages) => {
      const prompt = String(messages[0]?.content);
      traces.push({ phase, first: prompt.slice(0, 100), last: messages.slice(-2).map((m) => ({ role: m.role, text: String(m.content).slice(0, 900) })) });
      if (prompt.startsWith('COWORK COMPLETION REVIEW.')) return JSON.stringify({ state: 'done', reason: 'The requested meeting review was completed with saved tool evidence.' });
      if (messages.some((message) => String(message.content).includes('BOARDROOM SPEAKING TURN.')))
        return prompt.includes('You are "Milo"')
          ? 'Customer interviews show a gap in the launch evidence. I recommend another interview round.'
          : 'I agree with the research concern. We should collect more customer evidence before approving the launch.';
      if (phase++ === 0) return '<tool>' + JSON.stringify({ name: 'company_boardroom', params: { action: 'requests' } }) + '</tool>';
      if (phase === 2)
        return '<tool>' + JSON.stringify({ name: 'company_boardroom', params: { action: 'review_request', input: { requestId, revision, approved: true } } }) + '</tool>';
      return 'The employee request is scheduled for discussion.\n<cowork_state>done</cowork_state>';
    },
  ]);
  const server = new GituServer({ port: 0, passwordRequired: false, llm });
  try {
    // Seed an existing company before startup so roster migration retains its established employees.
    const store = (server as any).companies(),
      company = store.create({ name: 'Studio', purpose: 'Customer research', monthlyBudgetUsd: null, maxFileBytes: null });
    const seeded = (server as any).companyScope.run({ id: company.id, version: company.directionVersion }, () => {
      const cowork = (server as any).cowork(),
        lead = cowork.saveAgent({ name: 'Ari', systemPrompt: 'Lead research', chiefOfStaff: true }),
        employee = cowork.saveAgent({ name: 'Milo', systemPrompt: 'Research customer evidence' });
      const conversation = cowork.saveConversation({ kind: 'dm', memberIds: [lead.id], chiefId: lead.id });
      store.update(company.id, { leadId: lead.id, conversationId: conversation.id });
      (server as any).companyOrganization(company.id).snapshot();
      return { lead, employee };
    });
    store.transition(company.id, 'running');
    store.scheduleReview(company.id);
    const pending = (server as any).companyBoardroom(company.id).request(
      { kind: 'agent', agentId: seeded.employee.id },
      {
        title: 'Review missing customer evidence',
        reason: 'We need a joint decision before launch.',
        agenda: ['Customer evidence gap'],
        participants: [{ agentId: seeded.lead.id }],
      },
    );
    requestId = pending.id;
    revision = pending.revision;
    const origin = 'http://localhost:' + (await server.start());
    let summary: any;
    await vi.waitFor(
      async () => {
        (server as any).companyCoordinator.tick();
        const response = await fetch(origin + '/api/companies/' + company.id + '/management');
        summary = ((await response.json()) as any).management;
        expect(summary.meetings[0], JSON.stringify({ jobs: store.jobs(company.id), traces })).toMatchObject({
          state: 'completed',
          contributions: 2,
          requestedBy: seeded.employee.id,
        });
      },
      { timeout: 20000, interval: 100 },
    );
    expect(summary.counts.requests).toBe(0);
    expect(store.jobs(company.id).filter((j: any) => j.kind === 'wake')).toHaveLength(1);
    const meeting = (server as any).companyBoardroom(company.id).read({ kind: 'director' }, summary.meetings[0].id);
    expect(new Set(meeting.contributions.map((c: any) => c.agentId))).toEqual(new Set([seeded.lead.id, seeded.employee.id]));
  } finally {
    await server.stop();
    vi.unstubAllEnvs();
    rmSync(root, { recursive: true, force: true });
  }
}, 45000);
