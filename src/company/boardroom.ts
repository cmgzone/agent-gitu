import { randomUUID } from 'node:crypto';
import { CompanyOrganization } from './organization.js';
import type { CompanyActor, CompanyMeeting, CompanyMeetingType, MeetingHandRequest, MeetingContribution, MeetingDecision, MeetingParticipant } from './management-models.js';

const TYPES: CompanyMeetingType[] = ['onboarding', 'daily', 'weekly', 'strategy', 'roadmap', 'workflow-planning', 'emergency', 'problem-solving', 'department', 'project-review'];
const iso = (value: number) => new Date(value).toISOString();
function requiredText(value: unknown, maximum: number): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`Enter nonempty text.`);
  return value.trim();
}
function evidence(value: unknown): string[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw new Error('Provide evidence references.');
  return value.map((item) => requiredText(item, 1000));
}

/** Moderation and durable records; participant execution stays in the Company/Cowork runtime. */
export class CompanyBoardroom {
  constructor(
    readonly organization: CompanyOrganization,
    private readonly clock: () => number = Date.now,
    private readonly available: (agentId:string)=>boolean = () => true,
  ) {}
  private get companyId(): string {
    return this.organization.companyId;
  }
  private raw(id: string): CompanyMeeting {
    const meeting = this.organization.store.read<CompanyMeeting>('meeting', id);
    if (!meeting || meeting.companyId !== this.companyId) throw new Error('Meeting not found in this company.');
    return meeting;
  }
  private visible(actor: CompanyActor, meeting: CompanyMeeting): void {
    if (actor.kind === 'director') return;
    const member = this.organization.member(actor.agentId);
    if (member.status === 'suspended' || (!meeting.participants.some((p) => p.agentId === actor.agentId) && member.role !== 'ceo'))
      throw new Error('This meeting is outside the agent’s attendance grants.');
  }
  private chair(actor: CompanyActor, meeting: CompanyMeeting): void {
    this.visible(actor, meeting);
    if (actor.kind !== 'director' && actor.agentId !== meeting.chairId) throw new Error('Only the chairperson or director may moderate this meeting.');
    this.organization.require(actor, 'chair-meetings');
  }
  private save(meeting: CompanyMeeting): CompanyMeeting {
    if (meeting.state === 'completed' && meeting.summary) {
      meeting.summary.confirmedDecisions = meeting.decisions.filter((d) => ['approved', 'executing', 'completed', 'failed'].includes(d.state)).map((d) => d.id);
      meeting.summary.pendingProposals = meeting.decisions.filter((d) => ['proposed', 'under-review', 'approval-required'].includes(d.state)).map((d) => d.id);
      meeting.summary.rejectedProposals = meeting.decisions.filter((d) => d.state === 'rejected').map((d) => d.id);
      meeting.summary.generatedAt = iso(this.clock());
    }
    meeting.revision++;
    meeting.updatedAt = iso(this.clock());
    this.organization.store.saveResource('meeting', meeting.id, this.companyId, meeting);
    return structuredClone(meeting);
  }
  private retainUnheardRequest(meeting: CompanyMeeting, reason: string): void {
    const request = meeting.requests.find((r) => r.id === meeting.lease?.requestId);
    if (request && request.state === 'granted' && !meeting.contributions.some((c) => c.turnId === meeting.lease?.id)) {
      request.state = 'deferred';
      request.decisionReason = reason;
    }
  }
  private expire(meeting: CompanyMeeting): void {
    if (meeting.lease && Date.parse(meeting.lease.expiresAt) <= this.clock()) {
      this.retainUnheardRequest(meeting, 'Speaking turn expired before the contribution was recorded.');
      const speaker = meeting.participants.find((p) => p.agentId === meeting.lease!.agentId);
      if (speaker?.state === 'speaking') speaker.state = 'listening';
      delete meeting.lease;
    }
  }
  private active(meeting: CompanyMeeting): void {
    if (meeting.state !== 'active') throw new Error('This meeting is not active.');
    const company = this.organization.store.get(this.companyId)!;
    if (company.state !== 'running' || meeting.directionVersion !== company.directionVersion)
      throw new Error('Company paused or direction changed. Preserve the meeting and replan before continuing.');
    if (Date.parse(meeting.endAt) <= this.clock()) throw new Error('Meeting time limit reached. Finish and retain outstanding matters.');
  }
  list(actor: CompanyActor, query = ''): CompanyMeeting[] {
    const member = actor.kind === 'agent' ? this.organization.member(actor.agentId) : undefined;
    if (member?.status === 'suspended') throw new Error('Suspended employees cannot access Boardroom history.');
    return this.organization.store
      .list<CompanyMeeting>('meeting', this.companyId)
      .filter(
        (m) =>
          (!member || member.role === 'ceo' || (member.status !== 'suspended' && m.participants.some((p) => p.agentId === member.agentId))) &&
          (!query || (m.title + ' ' + m.description + ' ' + m.agenda.map((a) => a.title).join(' ')).toLowerCase().includes(query.toLowerCase())),
      )
      .sort((a, b) => b.startAt.localeCompare(a.startAt));
  }
  read(actor: CompanyActor, id: string): CompanyMeeting {
    const meeting = this.raw(id);
    this.visible(actor, meeting);
    this.expire(meeting);
    for (const item of meeting.actionItems)
      if (item.missionId) {
        const mission = this.organization.cowork.getMission(item.missionId);
        item.state =
          mission?.status === 'done' && mission.result?.trim()
            ? 'completed'
            : mission && ['running', 'blocked'].includes(mission.status)
              ? mission.status === 'blocked'
                ? 'blocked'
                : 'assigned'
              : 'blocked';
      }
    return structuredClone(meeting);
  }
  runtimeMeetings(): CompanyMeeting[] {
    return this.organization.store.db
      .prepare("SELECT data FROM records WHERE kind='meeting' AND company_id=? AND json_extract(data,'$.state') IN ('scheduled','active')")
      .all(this.companyId)
      .map((row) => JSON.parse(String(row['data'])) as CompanyMeeting);
  }
  historyPage(query: string, offset: number, limit: number): { total: number; meetings: unknown[]; nextOffset?: number } {
    const filter =
        "kind='meeting' AND company_id=? AND (?='' OR instr(lower(json_extract(data,'$.title')||' '||json_extract(data,'$.description')||' '||json_extract(data,'$.agenda')),lower(?))>0)",
      parameters = [this.companyId, query, query];
    const total = Number(this.organization.store.db.prepare('SELECT COUNT(*) AS count FROM records WHERE ' + filter).get(...parameters)?.['count']);
    const rows = this.organization.store.db
      .prepare(
        "SELECT json_object('id',id,'title',json_extract(data,'$.title'),'state',json_extract(data,'$.state'),'startAt',json_extract(data,'$.startAt'),'chairId',json_extract(data,'$.chairId')) AS metadata FROM records WHERE " +
          filter +
          " ORDER BY json_extract(data,'$.startAt') DESC,id LIMIT ? OFFSET ?",
      )
      .all(...parameters, limit, offset);
    return { total, meetings: rows.map((row) => JSON.parse(String(row['metadata']))), nextOffset: offset + limit < total ? offset + limit : undefined };
  }
  create(
    actor: CompanyActor,
    input: {
      title: string;
      description?: string;
      type?: CompanyMeetingType;
      chairId?: string;
      departmentId?: string;
      participants: { agentId: string; attendance?: MeetingParticipant['attendance'] }[];
      agenda: string[];
      startAt?: string;
      durationMinutes?: number;
      maxTurns?: number;
      budgetUsd?: number | null;
      automaticModeration?: boolean;
    },
  ): CompanyMeeting {
    const organizer = this.organization.require(actor, 'organize-meetings'),
      company = this.organization.store.get(this.companyId)!;
    const type = input.type ?? 'daily';
    if (!TYPES.includes(type)) throw new Error('Choose a supported meeting type.');
    const title = requiredText(input.title, 160),
      description = input.description === undefined ? '' : requiredText(input.description, 2000);
    if (!Array.isArray(input.agenda) || !input.agenda.length) throw new Error('Provide agenda items.');
    const agenda = input.agenda.map((item) => ({ id: randomUUID(), title: requiredText(item, 500) }));
    const start = input.startAt ? Date.parse(input.startAt) : this.clock(),
      duration = input.durationMinutes ?? 30,
      maxTurns = input.maxTurns ?? 24;
    if (!Number.isFinite(start) || !Number.isInteger(duration) || duration < 1 || !Number.isInteger(maxTurns) || maxTurns < 1)
      throw new Error('Choose a valid meeting time, 1–240 minutes and 1–200 turns.');
    if (start + duration * 60_000 <= this.clock()) throw new Error('Choose a meeting time that has not already elapsed.');
    const budgetUsd = input.budgetUsd ?? null;
    if (budgetUsd !== null && (!Number.isFinite(budgetUsd) || budgetUsd <= 0 || (company.monthlyBudgetUsd !== null && budgetUsd > company.monthlyBudgetUsd)))
      throw new Error('Meeting budget must be positive and within the company budget.');
    const chairId = input.chairId ?? company.leadId;
    if (!chairId) throw new Error('Choose a meeting chairperson.');
    const chair = this.organization.member(chairId);
    const retrainingChair = actor.kind === 'director' && type === 'onboarding' && ['onboarding', 'retraining'].includes(chair.status);
    if ((!retrainingChair && chair.status !== 'active') || !chair.authority.capabilities.includes('chair-meetings')) throw new Error('The chairperson needs active chair authority.');
    if (input.departmentId && !this.organization.departments().some((d) => d.id === input.departmentId)) throw new Error('Department not found in this company.');
    if (!Array.isArray(input.participants) || !input.participants.length) throw new Error('Choose company participants.');
    const participantMap = new Map<string, MeetingParticipant>();
    for (const entry of [...input.participants, { agentId: chairId, attendance: 'required' as const }]) {
      const member = this.organization.member(entry.agentId),
        attendance = entry.attendance ?? 'required';
      if (!['required', 'optional', 'observer', 'excused'].includes(attendance)) throw new Error('Invalid attendance type.');
      if (member.status !== 'active' && !(type === 'onboarding' && ['onboarding','retraining'].includes(member.status))) throw new Error('Only active or explicitly onboarding employees can attend.');
      if (organizer && organizer.role !== 'ceo' && member.agentId !== organizer.agentId && member.departmentId !== organizer.departmentId && member.agentId !== organizer.managerId)
        throw new Error('Organize meetings only within your department and reporting authority.');
      participantMap.set(member.agentId, {
        agentId: member.agentId,
        displayName: this.organization.cowork.getAgent(member.agentId)!.name,
        attendance,
        state: attendance === 'excused' ? 'excused' : 'listening',
      });
    }
    const id = 'meeting-' + randomUUID(),
      createdAt = iso(this.clock());
    const meeting: CompanyMeeting = {
      id,
      companyId: this.companyId,
      revision: 0,
      title,
      description,
      type,
      organizer: actor,
      chairId,
      departmentId: input.departmentId,
      agenda,
      participants: [...participantMap.values()],
      startAt: iso(start),
      endAt: iso(start + duration * 60_000),
      timezone: company.timezone,
      state: 'scheduled',
      directionVersion: company.directionVersion,
      automaticModeration: input.automaticModeration !== false,
      maxTurns,
      budgetUsd,
      turns: 0,
      requests: [],
      contributions: [],
      decisions: [],
      actionItems: [],
      createdAt,
      updatedAt: createdAt,
    };
    return this.organization.audited(actor, 'organize-meetings', 'meeting.created', id, () => {
      const open = Number(
        this.organization.store.db
          .prepare("SELECT COUNT(*) AS count FROM records WHERE kind='meeting' AND company_id=? AND json_extract(data,'$.state') IN ('scheduled','active','interrupted')")
          .get(this.companyId)?.['count'],
      );
      if (open >= (actor.kind === 'agent' ? 10 : 100)) throw new Error('Finish, resume or cancel outstanding meetings before scheduling more.');
      return this.save(meeting);
    });
  }
  start(actor: CompanyActor, id: string, conversationId: string): CompanyMeeting {
    const before = this.raw(id);
    this.chair(actor, before);
    const conversation = this.organization.cowork.getConversation(conversationId);
    if (!conversation || before.participants.some((p) => !conversation.memberIds.includes(p.agentId)))
      throw new Error('Use this meeting’s company-scoped participant conversation.');
    return this.organization.audited(actor, 'chair-meetings', 'meeting.started', id, () => {
      const meeting = this.raw(id);
      if (meeting.state === 'active') return structuredClone(meeting);
      if (!['scheduled', 'interrupted'].includes(meeting.state)) throw new Error('This meeting cannot be started again.');
      if (actor.kind !== 'director' && Date.parse(meeting.startAt) > this.clock()) throw new Error('The scheduled meeting has not started yet.');
      const company = this.organization.store.get(this.companyId)!;
      if (company.state !== 'running') throw new Error('Resume the company before starting a meeting.');
      if (Date.parse(meeting.endAt) <= this.clock()) throw new Error('Scheduled meeting time has elapsed. Preserve history and schedule a new meeting.');
      meeting.directionVersion = company.directionVersion;
      meeting.state = 'active';
      meeting.conversationId = conversationId;
      meeting.startedAt ??= iso(this.clock());
      delete meeting.interruptedReason;
      delete meeting.lease;
      delete meeting.directorHasFloor;
      for (const participant of meeting.participants)
        if (!['muted', 'excused'].includes(participant.state)) {
          participant.state = 'listening';
          participant.joinedAt ??= iso(this.clock());
        }
      return this.save(meeting);
    });
  }
  reschedule(actor:CompanyActor,id:string,revision:number,input:{startAt:string;endAt:string;timezone:string;title?:string;description?:string}):CompanyMeeting{
    if(actor.kind!=='director')throw new Error('Only the director edits a saved meeting schedule.');const before=this.raw(id);
    if(before.revision!==revision||before.state!=='scheduled')throw new Error('Refresh the scheduled meeting before editing its time.');
    if(typeof input.startAt!=='string'||typeof input.endAt!=='string'||!/(Z|[+-]\d\d:\d\d)$/.test(input.startAt)||!/(Z|[+-]\d\d:\d\d)$/.test(input.endAt))throw new Error('Use meeting timestamps with an explicit UTC offset.');
    const start=Date.parse(input.startAt),end=Date.parse(input.endAt);if(!Number.isFinite(start)||!Number.isFinite(end)||start<this.clock()||end<=start||end-start>240*60000)throw new Error('Choose a future meeting lasting 1–240 minutes.');
    try{new Intl.DateTimeFormat('en',{timeZone:input.timezone}).format(new Date());}catch{throw new Error('Choose an IANA timezone.');}
    return this.organization.audited(actor,undefined,'meeting.rescheduled',id,()=>{const m=this.raw(id);if(m.revision!==revision)throw new Error('Meeting changed.');m.startAt=iso(start);m.endAt=iso(end);m.timezone=input.timezone;m.directionVersion=this.organization.store.get(this.companyId)!.directionVersion;if(input.title!==undefined)m.title=requiredText(input.title,160);if(input.description!==undefined)m.description=requiredText(input.description,2000);return this.save(m);});
  }
  begin(actor: CompanyActor, id: string): CompanyMeeting {
    const meeting = this.raw(id);
    this.chair(actor, meeting);
    if (meeting.state === 'active') return this.read(actor, id);
    if (!['scheduled', 'interrupted'].includes(meeting.state)) throw new Error('This meeting cannot be started again.');
    if (this.organization.store.get(this.companyId)?.state !== 'running') throw new Error('Resume the company before starting a meeting.');
    if (Date.parse(meeting.endAt) <= this.clock()) throw new Error('Scheduled meeting time has elapsed.');
    if (actor.kind !== 'director' && Date.parse(meeting.startAt) > this.clock()) throw new Error('The scheduled meeting has not started yet.');
    const conversation = meeting.conversationId ? this.organization.cowork.getConversation(meeting.conversationId) : undefined;
    const selected =
      conversation ??
      this.organization.cowork.saveConversation({
        kind: meeting.participants.length > 1 ? 'group' : 'dm',
        title: meeting.title,
        memberIds: meeting.participants.map((p) => p.agentId),
        chiefId: meeting.chairId,
      });
    return this.start(actor, id, selected.id);
  }
  revokeFloor(actor: CompanyActor, id: string, reason: string): CompanyMeeting {
    this.chair(actor, this.raw(id));
    reason = requiredText(reason, 1000);
    return this.organization.audited(actor, 'chair-meetings', 'meeting.floor-revoked', id, () => {
      const meeting = this.raw(id);
      this.active(meeting);
      if (actor.kind === 'director') meeting.directorHasFloor = true;
      if (!meeting.lease) return this.save(meeting);
      const participant = meeting.participants.find((p) => p.agentId === meeting.lease!.agentId);
      if (participant?.state === 'speaking') participant.state = 'listening';
      this.retainUnheardRequest(meeting, reason);
      delete meeting.lease;
      return this.save(meeting);
    });
  }
  returnFloor(id: string): CompanyMeeting {
    return this.organization.audited({ kind: 'director' }, undefined, 'meeting.director-returned-floor', id, () => {
      const meeting = this.raw(id);
      this.active(meeting);
      delete meeting.directorHasFloor;
      return this.save(meeting);
    });
  }
  written(actor: CompanyActor, id: string, requestId: string, text: string): CompanyMeeting {
    const before = this.raw(id);
    this.visible(actor, before);
    text = requiredText(text, 12_000);
    return this.organization.audited(
      actor,
      undefined,
      'meeting.written-contribution',
      id,
      () => {
        const meeting = this.raw(id);
        this.active(meeting);
        const request = meeting.requests.find((r) => r.id === requestId);
        if (actor.kind !== 'agent' || request?.agentId !== actor.agentId || request.state !== 'written')
          throw new Error('The chair must accept this participant’s written contribution first.');
        const previous = meeting.contributions.find((c) => c.turnId === 'written:' + requestId);
        if (previous) {
          if (previous.text !== text) throw new Error('Written contribution already settled.');
          return structuredClone(meeting);
        }
        meeting.contributions.push({
          id: randomUUID(),
          seq: meeting.contributions.length + 1,
          agentId: actor.agentId,
          agendaId: request.agendaId,
          text,
          kind: request.objectionTo ? 'objection' : 'written',
          evidence: request.evidence,
          objectionTo: request.objectionTo,
          turnId: 'written:' + request.id,
          at: iso(this.clock()),
        });
        return this.save(meeting);
      },
      before.type === 'onboarding',
    );
  }
  directorContribution(id: string, agendaId: string, text: string): CompanyMeeting {
    text = requiredText(text, 12_000);
    return this.organization.audited({ kind: 'director' }, undefined, 'meeting.director-contribution', id, () => {
      const meeting = this.raw(id);
      this.active(meeting);
      if (meeting.lease) throw new Error('Take the floor before adding the director’s contribution.');
      meeting.directorHasFloor = true;
      if (!meeting.agenda.some((a) => a.id === agendaId)) throw new Error('Choose a meeting agenda item.');
      meeting.contributions.push({
        id: randomUUID(),
        seq: meeting.contributions.length + 1,
        agentId: 'director',
        agendaId,
        text,
        kind: 'contribution',
        evidence: [],
        at: iso(this.clock()),
      });
      return this.save(meeting);
    });
  }
  raiseHand(
    actor: CompanyActor,
    id: string,
    input: { agendaId: string; reason: string; priority?: MeetingHandRequest['priority']; evidence?: string[]; objectionTo?: string },
  ): CompanyMeeting {
    if (actor.kind !== 'agent') throw new Error('The director controls the floor directly.');
    const before = this.raw(id);
    this.visible(actor, before);
    const reason = requiredText(input.reason, 2000),
      refs = evidence(input.evidence),
      priority = input.priority ?? 'normal';
    if (!['normal', 'urgent', 'emergency'].includes(priority)) throw new Error('Choose normal, urgent or emergency priority.');
    return this.organization.audited(
      actor,
      undefined,
      'meeting.hand-raised',
      id,
      () => {
        const meeting = this.raw(id);
        this.active(meeting);
        this.expire(meeting);
        const participant = meeting.participants.find((p) => p.agentId === actor.agentId)!;
        if (!participant || participant.attendance === 'observer' || ['muted', 'excused', 'speaking'].includes(participant.state))
          throw new Error('This participant cannot request the floor now.');
        if (!meeting.agenda.some((a) => a.id === input.agendaId)) throw new Error('Choose an agenda item from this meeting.');
        if (input.objectionTo && !meeting.decisions.some((d) => d.id === input.objectionTo && d.agendaId === input.agendaId))
          throw new Error('Objection must reference a decision on the same agenda.');
        const pending = meeting.requests.find((r) => r.agentId === actor.agentId && ['queued', 'deferred'].includes(r.state));
        if (pending) return structuredClone(meeting);
        meeting.requests.push({
          id: randomUUID(),
          agentId: actor.agentId,
          agendaId: input.agendaId,
          reason,
          priority,
          evidence: refs,
          objectionTo: input.objectionTo,
          state: 'queued',
          createdAt: iso(this.clock()),
        });
        participant.state = 'hand-raised';
        return this.save(meeting);
      },
      before.type === 'onboarding',
    );
  }
  queue(actor: CompanyActor, id: string): MeetingHandRequest[] {
    const meeting = this.raw(id);
    this.visible(actor, meeting);
    const rank = { emergency: 0, urgent: 1, normal: 2 };
    return meeting.requests.filter((r) => r.state === 'queued').sort((a, b) => rank[a.priority] - rank[b.priority] || a.createdAt.localeCompare(b.createdAt));
  }
  moderate(actor: CompanyActor, id: string, requestId: string, response: 'defer' | 'reject' | 'written', reason: string): CompanyMeeting {
    const before = this.raw(id);
    this.chair(actor, before);
    reason = requiredText(reason, 1000);
    return this.organization.audited(actor, 'chair-meetings', 'meeting.request-moderated', id, () => {
      const meeting = this.raw(id);
      this.active(meeting);
      const request = meeting.requests.find((r) => r.id === requestId);
      if (!request || !['queued', 'deferred'].includes(request.state)) throw new Error('Contribution request is no longer pending.');
      if (response === 'reject' && request.objectionTo)
        throw new Error('A relevant objection must be heard, deferred with reason, or accepted in writing. Disagreement cannot erase it.');
      request.state = response === 'defer' ? 'deferred' : response === 'reject' ? 'rejected' : 'written';
      request.decisionReason = reason;
      const participant = meeting.participants.find((p) => p.agentId === request.agentId)!;
      participant.state = response === 'defer' ? 'queued' : 'listening';
      return this.save(meeting);
    });
  }
  grant(actor: CompanyActor, id: string, input: { requestId?: string; agentId?: string; agendaId?: string; seconds?: number }): CompanyMeeting {
    const before = this.raw(id);
    this.chair(actor, before);
    const target = before.requests.find((r) => r.id === input.requestId)?.agentId ?? input.agentId;
    if (!target) throw new Error('Choose a participating employee.');
    this.organization.assertExecution(target, id);
    if(!this.available(target))throw new Error('This teammate is finishing current work. Invite them at the next safe checkpoint.');
    const seconds = input.seconds ?? 120;
    if (!Number.isInteger(seconds) || seconds < 1) throw new Error('Choose a positive speaking duration.');
    return this.organization.audited(actor, 'chair-meetings', 'meeting.floor-granted', id, () => {
      const meeting = this.raw(id);
      this.active(meeting);
      this.expire(meeting);
      if (meeting.directorHasFloor && actor.kind !== 'director') throw new Error('The director has the floor. Wait for the director to return it.');
      if (actor.kind === 'director') delete meeting.directorHasFloor;
      if (meeting.lease) throw new Error('Another participant holds the speaking turn. Revoke or finish it first.');
      if (meeting.turns >= meeting.maxTurns) throw new Error('Meeting turn limit reached. Finish and retain outstanding matters.');
      const request = input.requestId ? meeting.requests.find((r) => r.id === input.requestId && ['queued', 'deferred'].includes(r.state)) : undefined;
      if (input.requestId && !request) throw new Error('Contribution request is no longer pending.');
      const agentId = request?.agentId ?? input.agentId,
        agendaId = request?.agendaId ?? input.agendaId;
      const participant = meeting.participants.find((p) => p.agentId === agentId);
      if (!participant || participant.attendance === 'observer' || ['muted', 'excused'].includes(participant.state))
        throw new Error('Invite a participating employee, not an observer or excused attendee.');
      if (!meeting.agenda.some((a) => a.id === agendaId)) throw new Error('Choose a meeting agenda item.');
      meeting.turns++;
      participant.state = 'speaking';
      if (request) request.state = 'granted';
      meeting.lease = {
        id: randomUUID(),
        agentId: agentId!,
        agendaId: agendaId!,
        requestId: request?.id,
        grantedAt: iso(this.clock()),
        expiresAt: iso(Math.min(this.clock() + seconds * 1000, Date.parse(meeting.endAt))),
      };
      return this.save(meeting);
    });
  }
  contribute(actor: CompanyActor, id: string, leaseId: string, input: { text: string; evidence?: string[]; objectionTo?: string; sourceMessageId?: string }): CompanyMeeting {
    if (actor.kind !== 'agent') throw new Error('Use the director’s floor controls for director contributions.');
    const before = this.raw(id);
    this.visible(actor, before);
    const text = requiredText(input.text, 12_000),
      refs = evidence(input.evidence);
    return this.organization.audited(
      actor,
      undefined,
      'meeting.contribution',
      id,
      () => {
        const meeting = this.raw(id);
        this.active(meeting);
        const previous = meeting.contributions.find((c) => c.turnId === leaseId);
        if (previous) {
          if (previous.agentId !== actor.agentId || previous.text !== text) throw new Error('Speaking turn was already settled with a different contribution.');
          return structuredClone(meeting);
        }
        const lease = meeting.lease;
        if (!lease || lease.id !== leaseId || lease.agentId !== actor.agentId || Date.parse(lease.expiresAt) <= this.clock())
          throw new Error('No current speaking permission. Request the floor or wait for an invitation.');
        const request = meeting.requests.find((r) => r.id === lease.requestId),
          objectionTo = input.objectionTo ?? request?.objectionTo;
        if (objectionTo && !meeting.decisions.some((d) => d.id === objectionTo && d.agendaId === lease.agendaId))
          throw new Error('Objection references a different agenda or meeting.');
        const contribution: MeetingContribution = {
          id: randomUUID(),
          seq: meeting.contributions.length + 1,
          agentId: actor.agentId,
          agendaId: lease.agendaId,
          text,
          kind: objectionTo ? 'objection' : 'contribution',
          objectionTo,
          evidence: refs.length ? refs : (request?.evidence ?? []),
          turnId: lease.id,
          at: iso(this.clock()),
          sourceMessageId: input.sourceMessageId,
        };
        meeting.contributions.push(contribution);
        meeting.participants.find((p) => p.agentId === actor.agentId)!.state = 'listening';
        delete meeting.lease;
        return this.save(meeting);
      },
      before.type === 'onboarding',
    );
  }
  participantState(actor: CompanyActor, id: string, agentId: string, state: 'listening' | 'muted' | 'excused'): CompanyMeeting {
    const before = this.raw(id);
    this.chair(actor, before);
    if (!['listening', 'muted', 'excused'].includes(state)) throw new Error('Choose listening, muted or excused.');
    return this.organization.audited(actor, 'chair-meetings', 'meeting.participant-state', id, () => {
      const meeting = this.raw(id);
      this.active(meeting);
      const participant = meeting.participants.find((p) => p.agentId === agentId);
      if (!participant) throw new Error('Participant not found in this meeting.');
      if (meeting.lease?.agentId === agentId) delete meeting.lease;
      participant.state = state;
      return this.save(meeting);
    });
  }
  proposeDecision(actor: CompanyActor, id: string, input: { agendaId: string; title: string; rationale: string; requiresDirector?: boolean; actionId?: string }): CompanyMeeting {
    const before = this.raw(id);
    this.visible(actor, before);
    const title = requiredText(input.title, 200),
      rationale = requiredText(input.rationale, 2000);
    if (!before.agenda.some((a) => a.id === input.agendaId)) throw new Error('Choose a meeting agenda item.');
    if (input.actionId && !this.organization.store.actions(this.companyId).some((a) => a.id === input.actionId))
      throw new Error('Action belongs to another company or does not exist.');
    return this.organization.audited(actor, undefined, 'meeting.decision-proposed', id, () => {
      const meeting = this.raw(id);
      this.active(meeting);
      const decision: MeetingDecision = {
        id: randomUUID(),
        agendaId: input.agendaId,
        title,
        rationale,
        proposedBy: actor.kind === 'director' ? 'director' : actor.agentId,
        state: input.requiresDirector || input.actionId ? 'approval-required' : 'proposed',
        requiresDirector: Boolean(input.requiresDirector || input.actionId),
        actionId: input.actionId,
      };
      meeting.decisions.push(decision);
      return this.save(meeting);
    });
  }
  decide(actor: CompanyActor, id: string, decisionId: string, approved: boolean): CompanyMeeting {
    const before = this.raw(id);
    this.chair(actor, before);
    return this.organization.audited(actor, 'chair-meetings', 'meeting.decision-reviewed', id, () => {
      const meeting = this.raw(id),
        decision = meeting.decisions.find((d) => d.id === decisionId);
      if (!decision || !['proposed', 'under-review', 'approval-required'].includes(decision.state)) throw new Error('Decision is no longer under review.');
      if (decision.requiresDirector && actor.kind !== 'director') throw new Error('This decision requires the director. A vote cannot authorize it.');
      if (approved && decision.actionId) {
        const action = this.organization.store.actions(this.companyId).find((a) => a.id === decision.actionId);
        if (!action || !['approved', 'done'].includes(action.state) || action.version !== this.organization.store.get(this.companyId)!.directionVersion)
          throw new Error('Approve the exact current external action through the existing approval controls first.');
      }
      decision.state = approved ? 'approved' : 'rejected';
      decision.decidedBy = actor;
      decision.decidedAt = iso(this.clock());
      return this.save(meeting);
    });
  }
  proposeAssignment(actor: CompanyActor, id: string, input: { title: string; agentId: string; criteria: string[]; decisionId?: string; deadline?: string }): CompanyMeeting {
    this.visible(actor, this.raw(id));
    const title = requiredText(input.title, 2000),
      target = this.organization.member(input.agentId);
    if (target.status !== 'active') throw new Error('Assign work to an active employee.');
    if (!Array.isArray(input.criteria) || !input.criteria.length) throw new Error('Include concrete acceptance criteria.');
    const criteria = input.criteria.map((c) => requiredText(c, 1000));
    if (input.deadline && !Number.isFinite(Date.parse(input.deadline))) throw new Error('Choose a valid assignment deadline.');
    return this.organization.audited(actor, undefined, 'meeting.assignment-proposed', id, () => {
      const meeting = this.raw(id);
      this.active(meeting);
      if (input.decisionId && !meeting.decisions.some((d) => d.id === input.decisionId)) throw new Error('Choose a decision from this meeting.');
      const existing = meeting.actionItems.find((a) => a.title === title && a.agentId === target.agentId && a.decisionId === input.decisionId);
      if (existing) return structuredClone(meeting);
      meeting.actionItems.push({
        id: randomUUID(),
        title,
        agentId: target.agentId,
        criteria,
        decisionId: input.decisionId,
        deadline: input.deadline ? iso(Date.parse(input.deadline)) : undefined,
        state: 'proposed',
      });
      return this.save(meeting);
    });
  }
  assign(actor: CompanyActor, id: string, itemId: string): CompanyMeeting {
    const before = this.raw(id);
    this.visible(actor, before);
    const item = before.actionItems.find((a) => a.id === itemId);
    if (!item) throw new Error('Assignment not found in this meeting.');
    this.organization.require(actor, 'assign-work');
    this.organization.assertExecution(item.agentId);
    if (actor.kind === 'agent') {
      const denied = this.organization.authorizeTool(actor.agentId, 'mission_manage', { action: 'create', agentId: item.agentId });
      if (denied) throw new Error(denied.output);
    }
    return this.organization.audited(actor, 'assign-work', 'meeting.assignment-dispatched', id, () => {
      const meeting = this.raw(id),
        assignment = meeting.actionItems.find((a) => a.id === itemId)!,
        company = this.organization.store.get(this.companyId)!;
      if (assignment.missionId) {
        if (!this.organization.cowork.getMission(assignment.missionId)) throw new Error('The linked assignment needs recovery review.');
        return structuredClone(meeting);
      }
      if (company.state !== 'running' || company.directionVersion !== meeting.directionVersion || !['active', 'completed'].includes(meeting.state))
        throw new Error('Company direction or meeting state changed. Review this assignment before dispatching.');
      if (assignment.decisionId && !meeting.decisions.some((d) => d.id === assignment.decisionId && d.state === 'approved'))
        throw new Error('Approve the assignment’s proposal before dispatching it.');
      const conversation =
        this.organization.cowork.listConversations().find((c) => c.kind === 'dm' && c.memberIds[0] === assignment.agentId) ??
        this.organization.cowork.saveConversation({ kind: 'dm', memberIds: [assignment.agentId], title: 'Meeting assignment' });
      const mission = this.organization.cowork.createMission({
        conversationId: conversation.id,
        agentId: assignment.agentId,
        goal: assignment.title,
        criteria: assignment.criteria,
        maxTurns: company.missionSessions,
      });
      assignment.missionId = mission.id;
      assignment.state = 'assigned';
      this.organization.store.enqueue(this.companyId, 'mission', { missionId: mission.id, meetingId: id, assignmentId: assignment.id }, 'meeting-assignment:' + assignment.id);
      return this.save(meeting);
    });
  }
  finish(actor: CompanyActor, id: string, reason = 'Agenda discussion finished'): CompanyMeeting {
    const before = this.raw(id);
    this.chair(actor, before);
    reason = requiredText(reason, 1000);
    return this.organization.audited(actor, 'chair-meetings', 'meeting.completed', id, () => {
      const meeting = this.raw(id);
      if (meeting.state === 'completed') return structuredClone(meeting);
      if (!['active', 'interrupted', 'summarizing'].includes(meeting.state)) throw new Error('Only a started meeting can finish.');
      this.retainUnheardRequest(meeting, reason);
      delete meeting.directorHasFloor;
      delete meeting.lease;
      for (const p of meeting.participants) if (!['muted', 'excused'].includes(p.state)) p.state = 'listening';
      meeting.summary = {
        discussed: meeting.agenda.map((a) => ({ agendaId: a.id, title: a.title, contributions: meeting.contributions.filter((c) => c.agendaId === a.id).length })),
        confirmedDecisions: meeting.decisions.filter((d) => ['approved', 'executing', 'completed'].includes(d.state)).map((d) => d.id),
        pendingProposals: meeting.decisions.filter((d) => ['proposed', 'under-review', 'approval-required'].includes(d.state)).map((d) => d.id),
        rejectedProposals: meeting.decisions.filter((d) => d.state === 'rejected').map((d) => d.id),
        actionItems: meeting.actionItems.map((a) => a.id),
        objections: meeting.contributions.filter((c) => c.kind === 'objection').map((c) => c.id),
        outstandingRequests: meeting.requests
          .filter((r) => ['queued', 'deferred'].includes(r.state) || (r.state === 'written' && !meeting.contributions.some((c) => c.turnId === 'written:' + r.id)))
          .map((r) => r.id),
        endingReason: reason,
        generatedAt: iso(this.clock()),
      };
      meeting.state = 'completed';
      meeting.endedAt = iso(this.clock());
      return this.save(meeting);
    });
  }
  interrupt(actor: CompanyActor, id: string, reason: string): CompanyMeeting {
    const before = this.raw(id);
    this.chair(actor, before);
    reason = requiredText(reason, 1000);
    return this.organization.audited(actor, 'chair-meetings', 'meeting.interrupted', id, () => {
      const meeting = this.raw(id);
      if (meeting.state !== 'active') return structuredClone(meeting);
      this.retainUnheardRequest(meeting, reason);
      delete meeting.directorHasFloor;
      delete meeting.lease;
      for (const p of meeting.participants) if (p.state === 'speaking') p.state = 'listening';
      meeting.state = 'interrupted';
      meeting.interruptedReason = reason;
      return this.save(meeting);
    });
  }
  cancel(actor: CompanyActor, id: string, reason: string): CompanyMeeting {
    this.chair(actor, this.raw(id));
    reason = requiredText(reason, 1000);
    return this.organization.audited(actor, 'chair-meetings', 'meeting.cancelled', id, () => {
      const meeting = this.raw(id);
      if (meeting.state === 'cancelled') return structuredClone(meeting);
      if (meeting.state === 'completed') throw new Error('Completed meetings remain in history.');
      this.retainUnheardRequest(meeting, reason);
      delete meeting.directorHasFloor;
      delete meeting.lease;
      meeting.state = 'cancelled';
      meeting.interruptedReason = reason;
      meeting.endedAt = iso(this.clock());
      for (const participant of meeting.participants) if (participant.state === 'speaking') participant.state = 'listening';
      return this.save(meeting);
    });
  }
}
