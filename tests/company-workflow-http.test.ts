import { mkdtempSync, rmSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { expect, it, vi } from 'vitest';
import { GituServer } from '../src/server/server.js';
import { ScriptedMockLlm } from '../src/llm/llm.js';
it('validates and simulates without execution, then runs typed tasks and a director gate through real Cowork missions', async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'gitu-workflow-http-'));
  vi.stubEnv('AGENT_GITU_HOME', root);
  const llm = new ScriptedMockLlm([
      () => JSON.stringify({ status: 'done', progress: 'Research recorded', criteriaMet: [true], result: JSON.stringify({ report: 'Verified customer onboarding requirements' }) }),
      () => JSON.stringify({ status: 'done', progress: 'Summary verified', criteriaMet: [true], result: 'A concise approved summary is ready.' }),
    ]),
    server = new GituServer({ port: 0, passwordRequired: false, llm });
  try {
    const origin = 'http://localhost:' + (await server.start()),
      request = async (route: string, method = 'GET', body?: unknown) => {
        const response = await fetch(origin + route, {
          method,
          headers: { origin, 'content-type': 'application/json' },
          body: body === undefined ? undefined : JSON.stringify(body),
        });
        return { status: response.status, data: (await response.json()) as any };
      };
    const company = (await request('/api/companies', 'POST', { name: 'Studio', purpose: 'Research', monthlyBudgetUsd: null, maxFileBytes: null })).data.company,
      base = '/api/companies/' + company.id,
      lead = (await request(base + '/lead', 'POST', { name: 'Ari' })).data.agent,
      store = (server as any).companies();
    store.transition(company.id, 'running');
    store.scheduleReview(company.id);
    const schema = { type: 'object', properties: { report: { type: 'string' } }, required: ['report'] },
      step = (id: string, type: string, dependsOn: string[], bindings: unknown, inputSchema: unknown, outputSchema: unknown) => ({
        id,
        name: id,
        type,
        agentId: type === 'mission' ? lead.id : undefined,
        goal: 'Complete ' + id,
        criteria: type === 'mission' ? ['Return the required result'] : [],
        dependsOn,
        bindings,
        inputSchema,
        outputSchema,
        tools: [],
        skills: [],
        connectionIds: [],
        accountIds: [],
        maxSessions: 2,
        maxAttempts: 2,
        timeoutMinutes: 5,
      }),
      definition = {
        title: 'Research review',
        inputs: { type: 'object', properties: { topic: { type: 'string' } }, required: ['topic'] },
        parallelism: 2,
        steps: [
          step(
            'research',
            'mission',
            [],
            { topic: { source: 'input', field: 'topic' } },
            { type: 'object', properties: { topic: { type: 'string' } }, required: ['topic'] },
            schema,
          ),
          step('review', 'approval', ['research'], { report: { source: 'step', stepId: 'research', field: 'report' } }, schema, schema),
          step('summary', 'mission', ['review'], { report: { source: 'step', stepId: 'review', field: 'report' } }, schema, { type: 'string' }),
        ],
      };
    const created = await request(base + '/workflows', 'POST', definition);
    expect(created.status, JSON.stringify(created.data)).toBe(201);
    const w = created.data.workflow;
    const simulated = await request(base + '/workflows/' + w.id + '/simulate', 'POST', {
      version: 1,
      input: { topic: 'Customers' },
      samples: { research: { report: 'Sample evidence' }, summary: 'Sample summary' },
    });
    expect(simulated.status).toBe(200);
    expect(simulated.data.simulation.verifiedLive).toBe(false);
    expect((server as any).companyScope.run({ id: company.id, version: company.directionVersion }, () => (server as any).cowork().missions())).toHaveLength(0);
    expect((await request(base + '/workflows/' + w.id + '/approve', 'POST', { revision: w.revision, version: 1 })).status).toBe(200);
    const started = await request(base + '/workflows/' + w.id + '/start', 'POST', { version: 1, input: { topic: 'Customers' }, requestId: 'http-start' });
    expect(started.status, JSON.stringify(started.data)).toBe(200);
    const id = started.data.run.id;
    let run: any;
    await vi.waitFor(
      async () => {
        (server as any).companyCoordinator.tick();
        run = (await request(base + '/workflow-runs/' + id)).data.run;
        expect(run.steps[1].approval?.state).toBe('pending');
      },
      { timeout: 15000, interval: 150 },
    );
    expect(run.steps[0].output).toEqual({ report: 'Verified customer onboarding requirements' });
    expect(run.steps[2].missionId).toBeUndefined();
    expect(
      (await request(base + '/workflow-runs/' + id + '/review', 'POST', { revision: run.revision, stepId: 'review', digest: 'wrong', approved: true })).status,
    ).toBeGreaterThanOrEqual(400);
    const reviewed = await request(base + '/workflow-runs/' + id + '/review', 'POST', {
      revision: run.revision,
      stepId: 'review',
      digest: run.steps[1].approval.digest,
      approved: true,
    });
    expect(reviewed.status, JSON.stringify(reviewed.data)).toBe(200);
    await vi.waitFor(
      async () => {
        (server as any).companyCoordinator.tick();
        run = (await request(base + '/workflow-runs/' + id)).data.run;
        expect(run.state).toBe('completed');
      },
      { timeout: 15000, interval: 150 },
    );
    expect(run.steps[2].input).toEqual({ report: 'Verified customer onboarding requirements' });
    expect(run.steps[2].output).toContain('approved summary');
    expect(store.jobs(company.id).filter((j: any) => j.kind === 'mission')).toHaveLength(2);
    const other = (await request('/api/companies', 'POST', { name: 'Other' })).data.company;
    expect((await request('/api/companies/' + other.id + '/workflow-runs/' + id)).status).toBeGreaterThanOrEqual(400);
  } finally {
    await server.stop();
    vi.unstubAllEnvs();
    rmSync(root, { recursive: true, force: true });
  }
}, 40000);
