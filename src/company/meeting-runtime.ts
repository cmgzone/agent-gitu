import type { CompanyJob, CompanyStore } from './store.js';
import { CompanyBoardroom } from './boardroom.js';
import type { CompanyMeeting, MeetingSpeakingLease } from './management-models.js';
import type { ToolResult } from '../types.js';

export interface MeetingTurnInput {
  meeting: CompanyMeeting;
  lease: MeetingSpeakingLease;
  job: CompanyJob;
  signal: AbortSignal;
  instruction: string;
}

/** Admission and moderation only. The host callback executes its existing Cowork runner. */
export class CompanyMeetingRuntime {
  constructor(
    private readonly store: CompanyStore,
    private readonly boardroom: (companyId: string) => CompanyBoardroom,
    private readonly run: (input: MeetingTurnInput) => Promise<{ text: string; messageId: string }>,
    private readonly clock: () => number = Date.now,
    private readonly available: (companyId:string,agentId:string)=>boolean = () => true,
  ) {}

  prepare(recovering = false): void {
    for (const company of this.store.companies()) {
      const room = this.boardroom(company.id);
      for (const saved of room.runtimeMeetings()) {
        if (saved.state === 'active' && (recovering || company.state !== 'running' || saved.directionVersion !== company.directionVersion)) {
          room.interrupt(
            { kind: 'director' },
            saved.id,
            recovering
              ? 'Runtime restarted. Review the saved transcript before resuming; an interrupted turn will not be submitted again.'
              : 'Company paused or redirected. Saved meeting work needs review.',
          );
          continue;
        }
        if (company.state !== 'running') continue;
        // A director-scheduled retraining meeting can orient the leadership itself.
        // Host moderation remains limited to that meeting; it grants no agent authority.
        const member = room.organization.snapshot().members.find(m=>m.agentId===saved.chairId);
        const chair = saved.type === 'onboarding' && saved.organizer.kind === 'director' && member && ['onboarding', 'retraining'].includes(member.status)
          ? { kind: 'director' as const }
          : { kind: 'agent' as const, agentId: saved.chairId };
        try {
          if (saved.state === 'scheduled' && Date.parse(saved.startAt) <= this.clock()) {
            if (Date.parse(saved.endAt) <= this.clock()) {room.cancel({kind:'director'},saved.id,'The scheduled meeting time elapsed before it started.');continue;}
            room.begin(chair, saved.id);
          }
          let meeting = room.read({ kind: 'director' }, saved.id);
          if (meeting.state !== 'active') continue;
          if (Date.parse(meeting.endAt) <= this.clock() || (meeting.turns >= meeting.maxTurns && !meeting.lease)) {
            room.finish(chair, meeting.id, 'Meeting time or turn limit reached');
            continue;
          }
          if (saved.lease && !meeting.lease) {
            room.revokeFloor(chair, meeting.id, 'Speaking turn expired. Preserve outstanding requests.');
            // An interrupted model attempt is not automatically repeated.
            room.interrupt({ kind: 'director' }, meeting.id, 'A speaking turn expired. Review the transcript and resume when ready.');
            continue;
          }
          if (!meeting.lease && !meeting.directorHasFloor && meeting.automaticModeration) {
            const request = room.queue(chair, meeting.id).find(r=>this.available(company.id,r.agentId));
            if (request) meeting = room.grant(chair, meeting.id, { requestId: request.id });
            else {
              const members = room.organization.snapshot().members;
              const eligible = meeting.participants.filter(
                (p) =>
                  p.attendance !== 'observer' &&
                  !['muted', 'excused'].includes(p.state) &&
                  members.some((m) => m.agentId === p.agentId && (m.status === 'active' || (meeting.type === 'onboarding' && ['onboarding', 'retraining'].includes(m.status)))),
              );
              // Each attendee speaks once per agenda, with the chair summarizing last.
              eligible.sort((a, b) => Number(a.agentId === meeting.chairId) - Number(b.agentId === meeting.chairId));
              const remaining = meeting.agenda
                .flatMap((a) => eligible.map((p) => ({ agendaId: a.id, agentId: p.agentId })))
                .filter((n) => !meeting.contributions.some((c) => c.agendaId === n.agendaId && c.agentId === n.agentId));
              const next=remaining.find(n=>this.available(company.id,n.agentId));
              if (!remaining.length) {
                room.finish(chair, meeting.id);
                continue;
              }
              if(!next)continue;
              meeting = room.grant(chair, meeting.id, next);
            }
          }
          if (meeting.lease) {
            const lease = meeting.lease;
            const finished = this.store.jobs(company.id).find((j) => j.kind === 'meeting' && j.payload['turnId'] === lease.id && ['done', 'failed'].includes(j.state));
            if (finished) {
              room.interrupt({ kind: 'director' }, meeting.id, 'The recorded turn needs review before another attempt.');
              continue;
            }
            this.store.enqueue(
              company.id,
              'meeting',
              { meetingId: meeting.id, turnId: lease.id, agentId: lease.agentId, text: meeting.title + ' · ' + meeting.agenda.find((a) => a.id === lease.agendaId)!.title },
              'meeting-turn:' + lease.id,
            );
          }
        } catch {
          if (room.read({ kind: 'director' }, saved.id).state === 'active')
            room.interrupt({ kind: 'director' }, saved.id, 'Meeting authority or resources changed. Check the chair, participants and operating rules before resuming.');
        }
      }
    }
  }

  authorize(companyId: string, agentId: string, meetingId: string, turnId: string, tool: string, args: Record<string, unknown>): ToolResult | undefined {
    try {
      const room = this.boardroom(companyId),
        meeting = room.read({ kind: 'agent', agentId }, meetingId),
        company = this.store.get(companyId);
      if (
        meeting.state !== 'active' ||
        company?.state !== 'running' ||
        meeting.directionVersion !== company.directionVersion ||
        meeting.lease?.id !== turnId ||
        meeting.lease.agentId !== agentId ||
        Date.parse(meeting.endAt) <= this.clock()
      )
        throw new Error('Meeting speaking permission ended.');
      if (tool === 'company_organization' && (!args['action'] || args['action'] === 'read')) return undefined;
      if (tool === 'company_handbook' && (!args['action'] || ['list', 'read', 'propose'].includes(String(args['action'])))) return undefined;
      if (tool === 'company_onboarding' && ['list', 'read'].includes(String(args['action']))) return undefined;
      if(tool==='company_workflow'&&['list','read','save','validate','simulate','run'].includes(String(args['action'])))return undefined;
      if (
        tool === 'company_boardroom' &&
        (!args['meetingId'] || args['meetingId'] === meetingId) &&
        !['create', 'start', 'grant', 'finish', 'interrupt', 'assign', 'cancel'].includes(String(args['action']))
      )
        return undefined;
      throw new Error('This is a meeting discussion. Propose work or a decision here; execute work through an authorized mission after the discussion.');
    } catch (error) {
      return { ok: false, output: (error as Error).message };
    }
  }

  async execute(job: CompanyJob): Promise<void> {
    const room = this.boardroom(job.companyId),
      meeting = room.read({ kind: 'director' }, String(job.payload['meetingId'])),
      lease = meeting.lease;
    if (meeting.contributions.some((c) => c.turnId === job.payload['turnId'])) return;
    if (meeting.state !== 'active' || !lease || lease.id !== job.payload['turnId'] || meeting.directionVersion !== job.version) return;
    const remaining = Math.min(Date.parse(lease.expiresAt), Date.parse(meeting.endAt)) - this.clock();
    if (remaining <= 0) return;
    if(!this.available(job.companyId,lease.agentId))throw new Error('Company lead is still working.');
    const signal = AbortSignal.timeout(Math.ceil(remaining)),
      actor = { kind: 'agent' as const, agentId: lease.agentId };
    const agenda = meeting.agenda.find((a) => a.id === lease.agendaId)!;
    const instruction = `BOARDROOM SPEAKING TURN. Meeting ${meeting.id}, turn ${lease.id}, agenda ${agenda.id}: ${agenda.title}. You are invited to contribute until ${lease.expiresAt}. Read the saved meeting through company_boardroom when needed. Discuss evidence, risks and proposals; do not perform external work or create staff during discussion. Your assigned work is preserved. Finish with one concise contribution. If you use contribute, use this exact meeting and turn ID. The chair reviews proposals and the director retains approval authority. No meeting may increase tools, accounts or budgets.`;
    try {
      const reply = await this.run({ meeting, lease, job, signal, instruction });
      signal.throwIfAborted();
      if (!room.read({ kind: 'director' }, meeting.id).contributions.some((c) => c.turnId === lease.id))
        room.contribute(actor, meeting.id, lease.id, { text: reply.text, sourceMessageId: reply.messageId });
    } catch (error) {
      if (error instanceof Error && error.message === 'Company lead is still working.') throw error;
      if (room.read({ kind: 'director' }, meeting.id).contributions.some((c) => c.turnId === lease.id)) return;
      room.interrupt(
        { kind: 'director' },
        meeting.id,
        'The speaking turn stopped before a verified contribution was saved. Review the transcript, model availability and meeting budget before resuming.',
      );
      throw error;
    }
  }
}
