import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { GituServer } from '../src/server/server.js';
import { ScriptedMockLlm } from '../src/llm/llm.js';

describe('Boardroom authenticated/scoped API and existing Cowork runtime', () => {
  it('runs actual participant turns, denies shell work in discussion, records usage and isolates history', async () => {
    const root = mkdtempSync(path.join(os.tmpdir(), 'gitu-boardroom-http-'));
    vi.stubEnv('AGENT_GITU_HOME', root);
    const forbidden = path.join(root, 'should-not-exist.txt');
    const llm = new ScriptedMockLlm([
      () => '<tool>' + JSON.stringify({ name: 'run_command', params: { command: 'Set-Content -LiteralPath "' + forbidden + '" -Value "unsafe"' } }) + '</tool>',
      () => 'The supplied evidence supports collecting more customer feedback before committing to the launch.',
    ]);
    const server = new GituServer({ passwordRequired: false, port: 0, llm });
    const failures: string[] = [];
    const run = (server as any).executeCompanyMeetingTurn.bind(server);
    (server as any).executeCompanyMeetingTurn = async (input: any) => {
      try {
        return await run(input);
      } catch (error) {
        failures.push(String((error as Error).cause ?? (error as Error).stack));
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
      const company = (await request('/api/companies', 'POST', { name: 'Studio', purpose: 'Research', monthlyBudgetUsd: null, maxFileBytes: null })).data.company;
      const other = (await request('/api/companies', 'POST', { name: 'Other' })).data.company;
      const lead = (await request('/api/companies/' + company.id + '/lead', 'POST', { name: 'Ari' })).data.agent;
      const store = (server as any).companies();
      store.transition(company.id, 'running');
      store.scheduleReview(company.id);
      const created = await request('/api/companies/' + company.id + '/boardroom', 'POST', {
        title: 'Evidence review',
        participants: [{ agentId: lead.id }],
        agenda: ['Customer evidence'],
        maxTurns: 1,
      });
      expect(created.status).toBe(201);
      const id = created.data.meeting.id;
      let saved: any;
      await vi.waitFor(
        async () => {
          saved = (await request('/api/companies/' + company.id + '/boardroom/' + id)).data.meeting;
          if (failures.length) throw new Error(failures.join('\n'));
          expect(saved.contributions).toHaveLength(1);
        },
        { timeout: 15000, interval: 100 },
      );
      expect(saved.contributions[0].text).toContain('customer feedback');
      expect(existsSync(forbidden)).toBe(false);
      expect(store.usage(company.id).filter((u: any) => u.meetingId === id)).toHaveLength(2);
      expect(store.usage(company.id).every((u: any) => u.agentId === lead.id && u.meetingTurnId === saved.contributions[0].turnId)).toBe(true);
      (server as any).companyCoordinator.tick();
      expect((await request('/api/companies/' + company.id + '/boardroom/' + id)).data.meeting.state).toBe('completed');
      expect((await request('/api/companies/' + other.id + '/boardroom/' + id)).status).toBe(400);
      expect((await request('/api/companies/' + other.id + '/boardroom')).data.meetings).toEqual([]);
      expect((await request('/api/companies/' + company.id + '/boardroom?q=Evidence&limit=1')).data.total).toBe(1);
      expect((await request('/api/companies/' + company.id + '/boardroom?offset=-1')).status).toBe(400);
      expect((await request('/api/companies/' + company.id + '/boardroom/' + id + '/start', 'POST', {})).status).toBe(400);
    } finally {
      await server.stop();
      vi.unstubAllEnvs();
      rmSync(root, { recursive: true, force: true });
    }
  }, 30000);
});
