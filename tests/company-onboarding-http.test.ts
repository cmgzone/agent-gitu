import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { expect, it, vi } from 'vitest';
import { GituServer } from '../src/server/server.js';
import { ScriptedMockLlm } from '../src/llm/llm.js';

it('runs employee onboarding meetings and a limited assessment through the authenticated Company API and existing mission worker', async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'gitu-onboarding-http-'));
  vi.stubEnv('AGENT_GITU_HOME', root);
  const llm = new ScriptedMockLlm(
    Array.from(
      { length: 40 },
      () => () =>
        JSON.stringify({
          status: 'done',
          progress: 'Evidence and responsibilities checked.',
          criteriaMet: [true],
          result: 'The supplied research notes show that customers need a clearer onboarding guide.',
        }),
    ),
  );
  const server = new GituServer({ passwordRequired: false, port: 0, llm });
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
    const company = (await request('/api/companies', 'POST', { name: 'Studio', purpose: 'Research', monthlyBudgetUsd: null, maxFileBytes: null })).data.company;
    const base = '/api/companies/' + company.id;
    await request(base + '/lead', 'POST', { name: 'Ari' });
    const created = await request(base + '/team', 'POST', { name: 'Milo', systemPrompt: 'Research customer evidence', allowWrites: true, useHostComputer: false });
    expect(created.status, JSON.stringify(created.data)).toBe(200);
    const agent = created.data.agent;
    const org = (await request(base + '/organization')).data.organization;
    expect(org.members.find((m: any) => m.agentId === agent.id).status).toBe('onboarding');
    const assigned = await request(base + '/organization/members/' + agent.id, 'PATCH', {
      revision: org.revision,
      member: { responsibilities: ['Verify customer evidence'], jobTitle: 'Researcher' },
    });
    expect(assigned.status).toBe(200);
    const get = async () => (await request(base + '/onboarding/' + agent.id)).data;
    const action = async (name: string, data = {}) => {
      const record = (await get()).record;
      const response = await request(base + '/onboarding/' + agent.id + '/' + name, 'POST', { revision: record.revision, ...data });
      expect(response.status, JSON.stringify(response.data)).toBe(200);
      return response.data.record;
    };
    await action('orient', { requirements: { tools: [], connectionIds: [], accountIds: [], skills: [] } });
    const store = (server as any).companies();
    store.transition(company.id, 'running');
    store.scheduleReview(company.id);
    const scheduled = await action('schedule');
    await vi.waitFor(
      async () => {
        (server as any).companyCoordinator.tick();
        const meeting = (await request(base + '/boardroom/' + scheduled.meetingId)).data.meeting;
        expect(meeting.state).toBe('completed');
        expect(meeting.contributions.some((c: any) => c.agentId === agent.id)).toBe(true);
      },
      { timeout: 20000, interval: 150 },
    );
    await action('check');
    const assessment = await action('assess', { goal: 'Explain the supplied customer evidence', criteria: ['Identify the customer need'], maxTurns: 2 });
    await vi.waitFor(
      async () => {
        (server as any).companyCoordinator.tick();
        expect((await get()).mission.status).toBe('done');
      },
      { timeout: 15000, interval: 150 },
    );
    const verified = await get();
    expect(verified.evidence.length).toBeGreaterThan(0);
    expect(verified.record.assessment.missionId).toBe(assessment.assessment.missionId);
    await action('review', { approved: true, notes: 'Customer need and evidence verified', evidenceMessageIds: [verified.evidence[0].id] });
    await action('activate');
    expect((await get()).record.stage).toBe('active');
    const proposal = (await request(base + '/handbook', 'POST', { title: 'Evidence', content: 'Retain sources for each finding.' })).data.entry;
    expect((await request(base + '/handbook/' + proposal.id + '/review', 'POST', { revision: proposal.revision, version: 1, approved: true })).status).toBe(200);
    const other = (await request('/api/companies', 'POST', { name: 'Other' })).data.company;
    expect((await request('/api/companies/' + other.id + '/handbook/' + proposal.id)).status).toBeGreaterThanOrEqual(400);
  } finally {
    await server.stop();
    vi.unstubAllEnvs();
    rmSync(root, { recursive: true, force: true });
  }
}, 45000);
