import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, it, expect, vi } from 'vitest';
import { CompanyStore } from '../src/company/store.js';
import { CoworkStore } from '../src/cowork/store.js';
import { CompanyOrganization } from '../src/company/organization.js';
import { CompanyBoardroom } from '../src/company/boardroom.js';
import { CompanyCalendar } from '../src/company/calendar.js';
const cleanup: (() => void)[] = [],
  director = { kind: 'director' as const };
afterEach(() =>
  cleanup
    .splice(0)
    .reverse()
    .forEach((f) => f()),
);
function fixture() {
  const root = mkdtempSync(path.join(os.tmpdir(), 'gitu-calendar-')),
    store = new CompanyStore(root);
  cleanup.push(() => {
    store.close();
    rmSync(root, { recursive: true, force: true });
  });
  const c = store.create({ name: 'Studio', purpose: 'Research', monthlyBudgetUsd: null, maxFileBytes: null, accountIds: ['calendar-1'], timezone: 'Africa/Nairobi' }),
    cowork = new CoworkStore(path.join(root, 'cowork.json'), undefined, { companyId: c.id, persistence: store.snapshot(c.id) }),
    ceo = cowork.saveAgent({ name: 'Ari', systemPrompt: 'Lead', chiefOfStaff: true });
  store.update(c.id, { leadId: ceo.id });
  store.transition(c.id, 'running');
  const org = new CompanyOrganization(store, c.id, cowork);
  org.snapshot();
  const room = new CompanyBoardroom(org),
    meeting = room.create(director, { title: 'Review', participants: [{ agentId: ceo.id }], agenda: ['Evidence'], startAt: new Date(Date.now() + 3600000).toISOString() });
  let active = true,
    event: Record<string, unknown> | undefined,
    loseReply = false;
  const request = vi.fn(async (_account: string, _calendar: string, _event: string | undefined, method: string, body?: Record<string, unknown>) => {
    if (method === 'GET' && !_event) return { status: 200, data: { kind: 'calendar#events' } };
    if (method === 'GET') return event ? { status: 200, data: structuredClone(event) } : { status: 404, data: {} };
    if (method === 'DELETE') {
      event = undefined;
      return { status: 204, data: {} };
    }
    if (method === 'POST' && event) return { status: 409, data: {} };
    event = { ...structuredClone(body), etag: 'version-1', htmlLink: 'https://www.google.com/calendar/event?fixture' };
    if (loseReply) {
      loseReply = false;
      throw Error('Network response lost after acceptance');
    }
    return { status: method === 'POST' ? 201 : 200, data: structuredClone(event) };
  });
  const transport = { accounts: async () => (active ? [{ id: 'calendar-1', toolkit: 'googlecalendar', status: 'ACTIVE', disabled: false }] : []), request },
    service = new CompanyCalendar(org, transport);
  return {
    root,
    store,
    c,
    cowork,
    ceo,
    org,
    room,
    meeting,
    service,
    request,
    transport,
    disconnect: () => (active = false),
    loseReply: () => (loseReply = true),
    getEvent: () => event,
    setEvent: (e: Record<string, unknown>) => (event = e),
  };
}
describe('Opt-in Google Calendar synchronization', () => {
  it('creates a durable deterministic event once and passes saved timezone and agenda', async () => {
    const f = fixture(),
      link = await f.service.configure(director, f.meeting.id, { accountId: 'calendar-1', calendarId: 'primary', autoSync: true });
    const synced = await f.service.sync(director, link.id, link.revision);
    expect(synced.state).toBe('synced');
    expect(f.getEvent()!['start']).toEqual({ dateTime: f.meeting.startAt, timeZone: 'Africa/Nairobi' });
    expect(String(f.getEvent()!['description'])).toContain('Evidence');
    await f.service.sync(director, synced.id, synced.revision);
    expect(f.request.mock.calls.filter((c) => c[3] === 'POST')).toHaveLength(1);
    expect(f.store.actions(f.c.id)[0]!.state).toBe('done');
  });
  it('reconciles a lost create response without submitting another event', async () => {
    const f = fixture(),
      link = await f.service.configure(director, f.meeting.id, { accountId: 'calendar-1', calendarId: 'primary', autoSync: false });
    f.loseReply();
    await expect(f.service.sync(director, link.id, link.revision)).rejects.toThrow('lost');
    const uncertain = f.service.read(link.id);
    expect(uncertain.state).toBe('uncertain');
    const recovered = new CompanyCalendar(f.org, f.transport);
    const result = await recovered.sync(director, link.id, uncertain.revision);
    expect(result.state).toBe('synced');
    expect(f.request.mock.calls.filter((c) => c[3] === 'POST')).toHaveLength(1);
  });
  it('updates the same event after an explicit schedule change and cancels it without recreating it', async () => {
    const f = fixture();
    let link = await f.service.configure(director, f.meeting.id, { accountId: 'calendar-1', calendarId: 'primary', autoSync: true });
    link = await f.service.sync(director, link.id, link.revision);
    f.room.reschedule(director, f.meeting.id, f.meeting.revision, {
      startAt: new Date(Date.now() + 7200000).toISOString(),
      endAt: new Date(Date.now() + 9000000).toISOString(),
      timezone: 'Europe/London',
    });
    link = await f.service.sync(director, link.id, link.revision);
    expect(f.request.mock.calls.filter((c) => c[3] === 'PATCH')).toHaveLength(1);
    expect(f.getEvent()!['id']).toBe(link.eventId);
    f.room.cancel(director, f.meeting.id, 'Director cancelled');
    link = await f.service.sync(director, link.id, link.revision);
    expect(link.state).toBe('cancelled');
    expect(f.getEvent()).toBeUndefined();
    await f.service.sync(director, link.id, link.revision);
    expect(f.request.mock.calls.filter((c) => c[3] === 'DELETE')).toHaveLength(1);
  });
  it('requires real grants and active Calendar accounts, and agents cannot enable or write Calendar bindings', async () => {
    const f = fixture();
    await expect(f.service.configure({ kind: 'agent', agentId: f.ceo.id }, f.meeting.id, { accountId: 'calendar-1', calendarId: 'primary', autoSync: true })).rejects.toThrow(
      'director',
    );
    await expect(f.service.configure(director, f.meeting.id, { accountId: 'foreign', calendarId: 'primary', autoSync: true })).rejects.toThrow('Grant');
    const link = await f.service.configure(director, f.meeting.id, { accountId: 'calendar-1', calendarId: 'primary', autoSync: true });
    f.disconnect();
    await expect(f.service.sync(director, link.id, link.revision)).rejects.toThrow('Grant');
    expect(f.request).not.toHaveBeenCalled();
  });
  it('rejects event ownership conflicts and OAuth failures without fabricating success', async () => {
    const f = fixture(),
      link = await f.service.configure(director, f.meeting.id, { accountId: 'calendar-1', calendarId: 'primary', autoSync: true });
    f.setEvent({ id: link.eventId, summary: 'Unrelated event', extendedProperties: { private: { agentGituCompany: 'other' } } });
    await expect(f.service.sync(director, link.id, link.revision)).rejects.toThrow('ownership');
    expect(f.service.read(link.id).state).toBe('failed');
    expect(f.request.mock.calls.filter((c) => c[3] !== 'GET')).toHaveLength(0);
  });
  it('queues auto-sync once, respects opt-out and recovers an interrupted syncing state', async () => {
    const f = fixture(),
      link = await f.service.configure(director, f.meeting.id, { accountId: 'calendar-1', calendarId: 'primary', autoSync: true });
    f.service.prepare();
    f.service.prepare();
    expect(f.store.jobs(f.c.id)).toHaveLength(1);
    await f.service.configure(director, f.meeting.id, { accountId: 'calendar-1', calendarId: 'primary', autoSync: false, revision: link.revision });
    f.store.saveResource('calendar-link', link.id, f.c.id, { ...f.service.read(link.id), state: 'syncing' });
    f.service.recover();
    expect(f.service.read(link.id).state).toBe('uncertain');
    f.service.prepare();
    expect(f.store.jobs(f.c.id)).toHaveLength(1);
  });
  it('requires explicit offsets and detects stale schedule edits', () => {
    const f = fixture();
    expect(() => f.room.reschedule(director, f.meeting.id, f.meeting.revision, { startAt: '2026-10-20T10:00', endAt: '2026-10-20T11:00', timezone: 'Africa/Nairobi' })).toThrow(
      'UTC offset',
    );
    expect(() =>
      f.room.reschedule(director, f.meeting.id, 0, {
        startAt: new Date(Date.now() + 3600000).toISOString(),
        endAt: new Date(Date.now() + 7200000).toISOString(),
        timezone: 'Africa/Nairobi',
      }),
    ).toThrow('Refresh');
  });
  it('serializes concurrent sync claims so there is only one mutation', async () => {
    const f = fixture(),
      link = await f.service.configure(director, f.meeting.id, { accountId: 'calendar-1', calendarId: 'primary', autoSync: false });
    const results = await Promise.allSettled([f.service.sync(director, link.id, link.revision), f.service.sync(director, link.id, link.revision)]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(f.request.mock.calls.filter((c) => c[3] === 'POST')).toHaveLength(1);
    expect(f.service.read(link.id).state).toBe('synced');
  });
  it('reports denied OAuth access and performs no calendar mutation', async () => {
    const f = fixture(),
      link = await f.service.configure(director, f.meeting.id, { accountId: 'calendar-1', calendarId: 'primary', autoSync: false });
    f.request.mockImplementationOnce(async () => ({ status: 403, data: {} }));
    await expect(f.service.sync(director, link.id, link.revision)).rejects.toThrow('authorized event access');
    expect(f.service.read(link.id).state).toBe('failed');
    expect(f.request.mock.calls.filter((c) => c[3] !== 'GET')).toHaveLength(0);
  });
  it('does not interpret an inaccessible calendar as a deleted event', async () => {
    const f = fixture();
    let link = await f.service.configure(director, f.meeting.id, { accountId: 'calendar-1', calendarId: 'primary', autoSync: false });
    link = await f.service.sync(director, link.id, link.revision);
    f.room.cancel(director, f.meeting.id, 'Director cancelled');
    f.request.mockClear();
    f.request.mockImplementation(async () => ({ status: 404, data: {} }));
    await expect(f.service.sync(director, link.id, link.revision)).rejects.toThrow('access could not be verified');
    expect(f.service.read(link.id).state).toBe('failed');
    expect(f.request.mock.calls).toHaveLength(2);
    expect(f.request.mock.calls.every((c) => c[3] === 'GET')).toBe(true);
  });
  it('shows unsynchronized local changes and checks remote edits only on an explicit director refresh', async () => {
    const f = fixture();
    let link = await f.service.configure(director, f.meeting.id, { accountId: 'calendar-1', calendarId: 'primary', autoSync: false });
    link = await f.service.sync(director, link.id, link.revision);
    f.setEvent({ ...f.getEvent(), summary: 'External edit', etag: 'remote-edit' });
    link = await f.service.sync(director, link.id, link.revision, true);
    expect(f.getEvent()!['summary']).toBe('Review');
    expect(f.request.mock.calls.filter((c) => c[3] === 'PATCH')).toHaveLength(1);
    f.room.reschedule(director, f.meeting.id, f.meeting.revision, {
      startAt: new Date(Date.now() + 7200000).toISOString(),
      endAt: new Date(Date.now() + 9000000).toISOString(),
      timezone: 'Africa/Nairobi',
    });
    expect(f.service.needsSync(link)).toBe(true);
  });
});
