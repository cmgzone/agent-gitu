import { createHash } from 'node:crypto';
import { canonicalAction } from './store.js';
import { CompanyOrganization } from './organization.js';
import type { CompanyActor, CompanyMeeting } from './management-models.js';
export interface CompanyCalendarLink {
  id: string;
  companyId: string;
  meetingId: string;
  revision: number;
  accountId: string;
  calendarId: string;
  eventId: string;
  autoSync: boolean;
  state: 'pending' | 'syncing' | 'synced' | 'uncertain' | 'failed' | 'cancelled';
  target?: Record<string, unknown>;
  targetDigest?: string;
  syncedDigest?: string;
  actionId?: string;
  url?: string;
  error?: string;
  updatedAt: string;
}
export interface CompanyCalendarTransport {
  accounts: () => Promise<{ id: string; toolkit: string; status: string; disabled: boolean }[]>;
  request: (
    accountId: string,
    calendarId: string,
    eventId: string | undefined,
    method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
    body?: Record<string, unknown>,
    etag?: string,
  ) => Promise<{ status: number; data: unknown }>;
}
const hash = (v: unknown) => createHash('sha256').update(canonicalAction(v)).digest('hex'),
  now = () => new Date().toISOString();
/** Opt-in synchronization of local meeting metadata. Never sends guest invitations. */
export class CompanyCalendar {
  constructor(
    readonly organization: CompanyOrganization,
    private readonly transport: CompanyCalendarTransport,
  ) {}
  private get store() {
    return this.organization.store;
  }
  private get companyId() {
    return this.organization.companyId;
  }
  private meeting(id: string): CompanyMeeting {
    const row = this.store.db
      .prepare(
        "SELECT json_object('id',id,'companyId',company_id,'state',json_extract(data,'$.state'),'title',json_extract(data,'$.title'),'description',json_extract(data,'$.description'),'agenda',json_extract(data,'$.agenda'),'startAt',json_extract(data,'$.startAt'),'endAt',json_extract(data,'$.endAt'),'timezone',json_extract(data,'$.timezone')) AS metadata FROM records WHERE kind='meeting' AND id=? AND company_id=?",
      )
      .get(id, this.companyId);
    const m = row ? (JSON.parse(String(row['metadata'])) as CompanyMeeting) : undefined;
    if (!m || m.companyId !== this.companyId) throw new Error('Meeting not found in this company.');
    return m;
  }
  list(): CompanyCalendarLink[] {
    return this.store.list<CompanyCalendarLink>('calendar-link', this.companyId);
  }
  read(id: string): CompanyCalendarLink {
    const link = this.store.read<CompanyCalendarLink>('calendar-link', id);
    if (!link || link.companyId !== this.companyId) throw new Error('Calendar link not found in this company.');
    return structuredClone(link);
  }
  async accounts() {
    const granted = this.store.get(this.companyId)!.accountIds;
    return (await this.transport.accounts()).filter((a) => granted.includes(a.id) && a.toolkit === 'googlecalendar' && a.status === 'ACTIVE' && !a.disabled);
  }
  private async account(link: Pick<CompanyCalendarLink, 'accountId'>): Promise<void> {
    if (!(await this.accounts()).some((a) => a.id === link.accountId))
      throw new Error('Grant an active Google Calendar account in Company Resources. OAuth must include Calendar event access.');
  }
  payload(m: CompanyMeeting): Record<string, unknown> {
    return {
      id: hash({ companyId: this.companyId, meetingId: m.id }),
      summary: m.title,
      description: (m.description + '\n\nAgenda:\n' + m.agenda.map((a) => '• ' + a.title).join('\n') + '\n\nAgent Gitu meeting ' + m.id).trim(),
      start: { dateTime: m.startAt, timeZone: m.timezone },
      end: { dateTime: m.endAt, timeZone: m.timezone },
      extendedProperties: { private: { agentGituCompany: this.companyId, agentGituMeeting: m.id } },
    };
  }
  async configure(actor: CompanyActor, meetingId: string, input: { accountId: string; calendarId: string; autoSync: boolean; revision?: number }): Promise<CompanyCalendarLink> {
    if (actor.kind !== 'director') throw new Error('Only the director opts a meeting into Calendar synchronization.');
    this.meeting(meetingId);
    if (
      typeof input.calendarId !== 'string' ||
      !/^[\w@.+-]{1,300}$/.test(input.calendarId.trim()) ||
      ['.', '..'].includes(input.calendarId.trim()) ||
      typeof input.autoSync !== 'boolean'
    )
      throw new Error('Choose an authorized calendar and explicit synchronization preference.');
    const id = this.companyId + ':calendar:' + meetingId,
      before = this.list().find((l) => l.id === id);
    if (before && (before.revision !== input.revision || before.accountId !== input.accountId || before.calendarId !== input.calendarId.trim()))
      throw new Error('Keep the existing event account/calendar. Review the latest link revision before changing automatic sync.');
    if (!before || input.autoSync) await this.account(input);
    return this.organization.audited(actor, undefined, 'calendar.opted-in', id, () => {
      const link: CompanyCalendarLink = before
        ? { ...before, autoSync: input.autoSync, revision: before.revision + 1, updatedAt: now() }
        : {
            id,
            companyId: this.companyId,
            meetingId,
            revision: 1,
            accountId: input.accountId,
            calendarId: input.calendarId.trim(),
            eventId: hash({ companyId: this.companyId, meetingId }),
            autoSync: input.autoSync,
            state: 'pending',
            updatedAt: now(),
          };
      this.store.saveResource('calendar-link', id, this.companyId, link);
      return link;
    });
  }
  private save(link: CompanyCalendarLink): CompanyCalendarLink {
    link.revision++;
    link.updatedAt = now();
    this.store.saveResource('calendar-link', link.id, this.companyId, link);
    return structuredClone(link);
  }
  private object(value: unknown): Record<string, unknown> {
    if (typeof value === 'string') {
      try {
        return JSON.parse(value) as Record<string, unknown>;
      } catch {
        return {};
      }
    }
    return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
  }
  private owned(data: Record<string, unknown>, link: CompanyCalendarLink): boolean {
    const properties = this.object(this.object(data['extendedProperties'])['private']);
    return data['id'] === link.eventId && properties['agentGituCompany'] === this.companyId && properties['agentGituMeeting'] === link.meetingId;
  }
  private matches(data: Record<string, unknown>, payload: Record<string, unknown>): boolean {
    const start = this.object(data['start']),
      end = this.object(data['end']),
      expectedStart = this.object(payload['start']),
      expectedEnd = this.object(payload['end']);
    return (
      data['summary'] === payload['summary'] &&
      data['description'] === payload['description'] &&
      Date.parse(String(start['dateTime'])) === Date.parse(String(expectedStart['dateTime'])) &&
      Date.parse(String(end['dateTime'])) === Date.parse(String(expectedEnd['dateTime'])) &&
      start['timeZone'] === expectedStart['timeZone'] &&
      end['timeZone'] === expectedEnd['timeZone']
    );
  }
  async sync(actor: CompanyActor, id: string, revision: number, force = false): Promise<CompanyCalendarLink> {
    if (actor.kind !== 'director') throw new Error('Calendar writes require the director’s explicit meeting binding.');
    let link = this.read(id);
    if (link.revision !== revision) throw new Error('Calendar link changed. Refresh before synchronizing.');
    if (link.state === 'syncing') throw new Error('Calendar synchronization is already in progress.');
    await this.account(link);
    const company = this.store.get(this.companyId)!;
    if (company.state !== 'running') throw new Error('Resume the company before Calendar synchronization.');
    const meeting = this.meeting(link.meetingId),
      cancel = meeting.state === 'cancelled',
      target = cancel ? { cancel: true, eventId: link.eventId } : this.payload(meeting),
      targetDigest = hash(target);
    if (!force && link.syncedDigest === targetDigest && ['synced', 'cancelled'].includes(link.state)) return link;
    link = this.organization.audited(actor, undefined, 'calendar.sync-claimed', link.id, () => {
      const current = this.read(id);
      if (current.revision !== revision || current.state === 'syncing') throw new Error('Calendar synchronization was already claimed.');
      current.state = 'syncing';
      current.target = target;
      current.targetDigest = targetDigest;
      current.error = undefined;
      return this.save(current);
    });
    // Persist the exact payload before network I/O. Deterministic event IDs and a GET
    // reconcile interrupted create/update/delete attempts without duplicate events.
    let action = this.store.intent(
      this.companyId,
      'director',
      'google_calendar_sync',
      { accountId: link.accountId, calendarId: link.calendarId, eventId: link.eventId, target },
      company.directionVersion,
    );
    link.actionId = action.id;
    link = this.save(link);
    try {
      const existing = await this.transport.request(link.accountId, link.calendarId, link.eventId, 'GET'),
        data = this.object(existing.data),
        absent = [404, 410].includes(existing.status);
      if (absent) {
        const access = await this.transport.request(link.accountId, link.calendarId, undefined, 'GET');
        if (access.status !== 200) throw new Error('Calendar access could not be verified. An inaccessible calendar is not proof that its event was deleted.');
      }
      if (!absent && (existing.status !== 200 || (!this.owned(data, link) && data['status'] !== 'cancelled')))
        throw new Error(
          existing.status === 401 || existing.status === 403
            ? 'Reconnect Google Calendar with authorized event access.'
            : 'Calendar could not verify ownership of the existing event.',
        );
      if ((cancel && (absent || data['status'] === 'cancelled')) || (!cancel && existing.status === 200 && this.matches(data, target))) {
        this.store.actionState(action, 'done', link.eventId);
        link.syncedDigest = targetDigest;
        link.state = cancel ? 'cancelled' : 'synced';
        link.url = typeof data['htmlLink'] === 'string' && data['htmlLink'].startsWith('https://www.google.com/calendar/') ? data['htmlLink'] : link.url;
        return this.save(link);
      }
      if (!cancel && absent && link.syncedDigest)
        throw new Error('The synchronized event was removed externally. Create a new meeting after review; it will not be recreated automatically.');
      if (action.state === 'done') {
        if (!force) throw new Error('The prior action completed but the Calendar content changed. Review the remote event before another update.');
        action = this.store.intent(
          this.companyId,
          'director',
          'google_calendar_sync',
          { accountId: link.accountId, calendarId: link.calendarId, eventId: link.eventId, target, reviewedRemoteEtag: data['etag'] },
          company.directionVersion,
        );
        link.actionId = action.id;
        link = this.save(link);
      }
      if (['uncertain', 'executing'].includes(action.state)) this.store.actionState(action, 'approved');
      if (action.state === 'pending') this.store.actionState(action, 'approved');
      this.store.prepareAction(
        action,
        () => {
          if (
            !this.store.get(this.companyId)!.accountIds.includes(link.accountId) ||
            hash(cancel ? { cancel: true, eventId: link.eventId } : this.payload(this.meeting(link.meetingId))) !== targetDigest
          )
            throw new Error('Calendar grants or meeting content changed before submission.');
        },
        true,
      );
      const reply = await this.transport.request(
        link.accountId,
        link.calendarId,
        cancel ? link.eventId : absent ? undefined : link.eventId,
        cancel ? 'DELETE' : absent ? 'POST' : 'PATCH',
        cancel ? undefined : target,
        typeof data['etag'] === 'string' ? data['etag'] : undefined,
      );
      if (!((cancel && [200, 204, 404, 410].includes(reply.status)) || (!cancel && [200, 201].includes(reply.status)))) {
        if (reply.status === 409 && !cancel) {
          const check = await this.transport.request(link.accountId, link.calendarId, link.eventId, 'GET'),
            event = this.object(check.data);
          if (check.status !== 200 || !this.owned(event, link) || !this.matches(event, target)) throw new Error('Calendar event conflict needs reconciliation.');
        } else throw new Error('Calendar rejected synchronization (HTTP ' + reply.status + '). Review the account, OAuth scopes and event before retrying.');
      }
      const event = this.object(reply.data);
      if (!cancel && reply.status !== 409 && (!this.owned(event, link) || !this.matches(event, target)))
        throw new Error('Calendar did not return a verified event matching this meeting.');
      this.store.actionState(action, 'done', link.eventId);
      link.syncedDigest = targetDigest;
      link.state = cancel ? 'cancelled' : 'synced';
      link.url = typeof event['htmlLink'] === 'string' && event['htmlLink'].startsWith('https://www.google.com/calendar/') ? event['htmlLink'] : link.url;
      return this.save(link);
    } catch (error) {
      if (action.state === 'executing' || action.state === 'uncertain') this.store.actionState(action, 'uncertain');
      link.state = action.state === 'executing' || action.state === 'uncertain' ? 'uncertain' : 'failed';
      link.error = (error as Error).message;
      this.save(link);
      throw error;
    }
  }
  recover(): void {
    for (const link of this.list())
      if (link.state === 'syncing') {
        link.state = 'uncertain';
        link.error = 'Synchronization was interrupted. Reconcile the deterministic event before retrying.';
        this.save(link);
      }
  }
  needsSync(link: CompanyCalendarLink): boolean {
    const meeting = this.meeting(link.meetingId),
      target = meeting.state === 'cancelled' ? { cancel: true, eventId: link.eventId } : this.payload(meeting);
    return hash(target) !== link.syncedDigest;
  }
  prepare(): void {
    if (this.store.get(this.companyId)?.state !== 'running') return;
    for (const link of this.list()) {
      if (!link.autoSync || ['syncing', 'uncertain', 'failed'].includes(link.state)) continue;
      const meeting = this.meeting(link.meetingId),
        target = meeting.state === 'cancelled' ? { cancel: true, eventId: link.eventId } : this.payload(meeting);
      if (meeting.state === 'completed' && link.state === 'synced') continue;
      if (hash(target) !== link.syncedDigest) this.store.enqueue(this.companyId, 'calendar', { linkId: link.id }, 'calendar:' + link.id + ':' + hash(target));
    }
  }
}
