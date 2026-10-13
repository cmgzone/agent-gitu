import { mkdtempSync, rmSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { expect, it, vi } from 'vitest';
import { GituServer } from '../src/server/server.js';
import { ScriptedMockLlm } from '../src/llm/llm.js';
it('uses opted-in calendar jobs on the authenticated Company API, persists provider IDs and propagates schedule changes and cancellation', async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'gitu-calendar-http-'));
  vi.stubEnv('AGENT_GITU_HOME', root);
  const server = new GituServer({ port: 0, passwordRequired: false, llm: new ScriptedMockLlm([]) });
  let event: Record<string, unknown> | undefined;
  const proxy = vi.fn(
    async (_account: string, _calendar: string, _event: string | undefined, method: string, body?: Record<string, unknown>, _etag?: string, authorize?: () => void) => {
      authorize?.();
      if (method === 'GET' && !_event) return { status: 200, data: { kind: 'calendar#events' } };
      if (method === 'GET') return event ? { status: 200, data: structuredClone(event) } : { status: 404, data: {} };
      if (method === 'DELETE') {
        event = undefined;
        return { status: 204, data: {} };
      }
      event = { ...structuredClone(body), etag: 'fixture-etag' };
      return { status: method === 'POST' ? 201 : 200, data: structuredClone(event) };
    },
  );
  (server as any).appHub.accounts = async () => [{ id: 'calendar-1', toolkit: 'googlecalendar', status: 'ACTIVE', disabled: false }];
  (server as any).connectedApps.googleCalendarRequest = proxy;
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
    const c = (
        await request('/api/companies', 'POST', {
          name: 'Studio',
          purpose: 'Research',
          monthlyBudgetUsd: null,
          maxFileBytes: null,
          accountIds: ['calendar-1'],
          timezone: 'Africa/Nairobi',
        })
      ).data.company,
      base = '/api/companies/' + c.id,
      lead = (await request(base + '/lead', 'POST', { name: 'Ari' })).data.agent,
      store = (server as any).companies();
    store.transition(c.id, 'running');
    store.scheduleReview(c.id);
    const created = await request(base + '/boardroom', 'POST', {
      title: 'Review',
      participants: [{ agentId: lead.id }],
      agenda: ['Customer evidence'],
      startAt: new Date(Date.now() + 3600000).toISOString(),
    });
    expect(created.status).toBe(201);
    const meeting = created.data.meeting;
    const configured = await request(base + '/calendar', 'POST', { meetingId: meeting.id, accountId: 'calendar-1', calendarId: 'primary', autoSync: true });
    expect(configured.status, JSON.stringify(configured.data)).toBe(201);
    let link: any;
    await vi.waitFor(
      async () => {
        (server as any).companyCoordinator.tick();
        link = (await request(base + '/calendar')).data.links[0];
        expect(link.state).toBe('synced');
      },
      { timeout: 12000, interval: 100 },
    );
    expect(proxy.mock.calls.filter((c) => c[3] === 'POST')).toHaveLength(1);
    const sync = await request(base + '/calendar/' + encodeURIComponent(link.id) + '/sync', 'POST', { revision: link.revision });
    expect(sync.status, JSON.stringify(sync.data)).toBe(200);
    expect(proxy.mock.calls.filter((c) => c[3] === 'POST')).toHaveLength(1);
    const scheduled = await request(base + '/boardroom/' + meeting.id + '/schedule', 'POST', {
      revision: meeting.revision,
      startAt: new Date(Date.now() + 7200000).toISOString(),
      endAt: new Date(Date.now() + 9000000).toISOString(),
      timezone: 'Europe/London',
    });
    expect(scheduled.status).toBe(200);
    await vi.waitFor(
      async () => {
        (server as any).companyCoordinator.tick();
        expect(proxy.mock.calls.filter((c) => c[3] === 'PATCH')).toHaveLength(1);
        expect((await request(base + '/calendar')).data.links[0].state).toBe('synced');
      },
      { timeout: 12000, interval: 100 },
    );
    const eventId = event!['id'];
    await request(base + '/boardroom/' + meeting.id + '/cancel', 'POST', { reason: 'Director cancelled' });
    await vi.waitFor(
      async () => {
        (server as any).companyCoordinator.tick();
        expect((await request(base + '/calendar')).data.links[0].state).toBe('cancelled');
      },
      { timeout: 12000, interval: 100 },
    );
    expect(proxy.mock.calls.filter((c) => c[3] === 'DELETE')).toHaveLength(1);
    expect(proxy.mock.calls.filter((c) => c[3] === 'PATCH')[0]![2]).toBe(eventId);
    const other = (await request('/api/companies', 'POST', { name: 'Other' })).data.company;
    expect((await request('/api/companies/' + other.id + '/calendar/' + encodeURIComponent(link.id) + '/sync', 'POST', { revision: link.revision })).status).toBeGreaterThanOrEqual(
      400,
    );
  } finally {
    await server.stop();
    vi.unstubAllEnvs();
    rmSync(root, { recursive: true, force: true });
  }
}, 35000);
