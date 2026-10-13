import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { CompanyStore } from '../src/company/store.js';
import { CoworkStore } from '../src/cowork/store.js';
import { CompanyOrganization } from '../src/company/organization.js';
import { CompanyBoardroom } from '../src/company/boardroom.js';
import type { CompanyActor } from '../src/company/management-models.js';

const owner: CompanyActor = { kind: 'director' };
const cleanups: (() => void)[] = [];
afterEach(() =>
  cleanups
    .splice(0)
    .reverse()
    .forEach((cleanup) => cleanup()),
);
function fixture() {
  const root = mkdtempSync(path.join(os.tmpdir(), 'gitu-boardroom-')),
    store = new CompanyStore(root);
  cleanups.push(() => {
    store.close();
    rmSync(root, { recursive: true, force: true });
  });
  const company = store.create({ name: 'Studio', purpose: 'Research', monthlyBudgetUsd: null, maxFileBytes: null });
  const cowork = new CoworkStore(path.join(root, 'cowork.json'), undefined, { companyId: company.id, persistence: store.snapshot(company.id) });
  const ceo = cowork.saveAgent({ name: 'Ari', systemPrompt: 'Lead', chiefOfStaff: true });
  const employee = cowork.saveAgent({ name: 'Milo', systemPrompt: 'Research' });
  const observer = cowork.saveAgent({ name: 'Nia', systemPrompt: 'Observe' });
  const conversation = cowork.saveConversation({ kind: 'group', memberIds: [ceo.id, employee.id, observer.id], chiefId: ceo.id, title: 'Boardroom' });
  store.update(company.id, { leadId: ceo.id, conversationId: conversation.id });
  store.transition(company.id, 'running');
  const organization = new CompanyOrganization(store, company.id, cowork);
  organization.snapshot();
  let time = Date.parse('2026-10-13T08:00:00Z');
  const boardroom = new CompanyBoardroom(organization, () => time);
  const chair: CompanyActor = { kind: 'agent', agentId: ceo.id },
    worker: CompanyActor = { kind: 'agent', agentId: employee.id };
  const meeting = boardroom.create(chair, {
    title: 'Project review',
    type: 'project-review',
    participants: [{ agentId: ceo.id }, { agentId: employee.id }, { agentId: observer.id, attendance: 'observer' }],
    agenda: ['Review evidence', 'Choose next work'],
  });
  const active = boardroom.start(chair, meeting.id, conversation.id);
  return {
    root,
    store,
    company,
    cowork,
    ceo,
    employee,
    observer,
    conversation,
    organization,
    boardroom,
    chair,
    worker,
    meeting: active,
    advance: (milliseconds: number) => {
      time += milliseconds;
    },
  };
}
describe('durable Company Boardroom moderation', () => {
  it('permits one speaking lease and rejects uninvited speech, another identity and expired turns', () => {
    const f = fixture(),
      agendaId = f.meeting.agenda[0]!.id;
    expect(() => f.boardroom.contribute(f.worker, f.meeting.id, 'fake', { text: 'Uninvited' })).toThrow('speaking permission');
    const turn = f.boardroom.grant(f.chair, f.meeting.id, { agentId: f.employee.id, agendaId, seconds: 10 });
    expect(() => f.boardroom.grant(owner, f.meeting.id, { agentId: f.ceo.id, agendaId })).toThrow('Another participant');
    expect(() => f.boardroom.contribute(f.chair, f.meeting.id, turn.lease!.id, { text: 'Stolen floor' })).toThrow('speaking permission');
    f.advance(10_001);
    expect(() => f.boardroom.contribute(f.worker, f.meeting.id, turn.lease!.id, { text: 'Too late' })).toThrow('speaking permission');
    const next = f.boardroom.grant(owner, f.meeting.id, { agentId: f.ceo.id, agendaId });
    expect(next.participants.find((p) => p.agentId === f.employee.id)?.state).toBe('listening');
    expect(next.lease?.agentId).toBe(f.ceo.id);
  });
  it('orders hand requests by priority and retains reasons for deferral/rejection', () => {
    const f = fixture(),
      agendaId = f.meeting.agenda[0]!.id;
    f.boardroom.raiseHand(f.worker, f.meeting.id, { agendaId, reason: 'Evidence needs review', evidence: ['artifact-1'] });
    f.boardroom.raiseHand(f.chair, f.meeting.id, { agendaId, reason: 'Critical deadline', priority: 'urgent' });
    const queue = f.boardroom.queue(owner, f.meeting.id);
    expect(queue.map((r) => r.agentId)).toEqual([f.ceo.id, f.employee.id]);
    f.boardroom.moderate(f.chair, f.meeting.id, queue[0]!.id, 'defer', 'Discuss after the evidence');
    expect(f.boardroom.read(owner, f.meeting.id).requests[1]?.decisionReason).toBe('Discuss after the evidence');
    expect(() => f.boardroom.moderate(f.chair, f.meeting.id, queue[1]!.id, 'reject', '')).toThrow('nonempty');
    const rejected = f.boardroom.moderate(owner, f.meeting.id, queue[1]!.id, 'reject', 'Already covered by the supplied report');
    expect(rejected.requests[0]?.state).toBe('rejected');
    expect(rejected.requests[0]?.decisionReason).toContain('supplied report');
  });
  it('does not suppress a relevant objection because the chair disagrees', () => {
    const f = fixture(),
      agendaId = f.meeting.agenda[0]!.id;
    const proposed = f.boardroom.proposeDecision(f.chair, f.meeting.id, { agendaId, title: 'Choose option A', rationale: 'Initial proposal' }).decisions[0]!;
    const hand = f.boardroom.raiseHand(f.worker, f.meeting.id, { agendaId, reason: 'Evidence favors another option', objectionTo: proposed.id, evidence: ['analysis-2'] })
      .requests[0]!;
    expect(() => f.boardroom.moderate(f.chair, f.meeting.id, hand.id, 'reject', 'I disagree')).toThrow('relevant objection');
    const lease = f.boardroom.grant(f.chair, f.meeting.id, { requestId: hand.id }).lease!;
    const result = f.boardroom.contribute(f.worker, f.meeting.id, lease.id, { text: 'Option B has stronger evidence.', objectionTo: proposed.id, evidence: ['analysis-2'] });
    expect(result.contributions[0]?.kind).toBe('objection');
    expect(result.participants.find((p) => p.agentId === f.employee.id)?.state).toBe('listening');
  });
  it('requires actual chair authority and respects observers, mute, excusal and revocation', () => {
    const f = fixture(),
      agendaId = f.meeting.agenda[0]!.id;
    expect(() => f.boardroom.grant(f.worker, f.meeting.id, { agentId: f.worker.agentId, agendaId })).toThrow('chairperson');
    expect(() => f.boardroom.raiseHand({ kind: 'agent', agentId: f.observer.id }, f.meeting.id, { agendaId, reason: 'Observer wants to talk' })).toThrow('cannot request');
    f.boardroom.participantState(owner, f.meeting.id, f.employee.id, 'muted');
    expect(() => f.boardroom.grant(f.chair, f.meeting.id, { agentId: f.employee.id, agendaId })).toThrow('participating employee');
    f.boardroom.participantState(owner, f.meeting.id, f.employee.id, 'listening');
    const lease = f.boardroom.grant(f.chair, f.meeting.id, { agentId: f.employee.id, agendaId }).lease!;
    f.boardroom.participantState(owner, f.meeting.id, f.employee.id, 'excused');
    expect(() => f.boardroom.contribute(f.worker, f.meeting.id, lease.id, { text: 'Excused agent' })).toThrow('speaking permission');
    const revision = f.organization.snapshot().revision;
    f.organization.updateMember(owner, f.ceo.id, { authority: { capabilities: [] } }, revision);
    expect(() => f.boardroom.grant(f.chair, f.meeting.id, { agentId: f.ceo.id, agendaId })).toThrow('authority');
  });
  it('deduplicates a settled turn and rejects conflicting replays', () => {
    const f = fixture(),
      lease = f.boardroom.grant(f.chair, f.meeting.id, { agentId: f.employee.id, agendaId: f.meeting.agenda[0]!.id }).lease!;
    f.boardroom.contribute(f.worker, f.meeting.id, lease.id, { text: 'Verified evidence.' });
    expect(f.boardroom.contribute(f.worker, f.meeting.id, lease.id, { text: 'Verified evidence.' }).contributions).toHaveLength(1);
    expect(() => f.boardroom.contribute(f.worker, f.meeting.id, lease.id, { text: 'Changed replay' })).toThrow('different contribution');
  });
  it('retains written objections without stealing another participant’s floor', () => {
    const f = fixture(),
      agendaId = f.meeting.agenda[0]!.id;
    const proposal = f.boardroom.proposeDecision(f.chair, f.meeting.id, { agendaId, title: 'Ship', rationale: 'Initial plan' }).decisions[0]!;
    const request = f.boardroom.raiseHand(f.worker, f.meeting.id, { agendaId, reason: 'Contrary evidence', objectionTo: proposal.id, evidence: ['report-1'] }).requests[0]!;
    f.boardroom.moderate(f.chair, f.meeting.id, request.id, 'written', 'Include the analysis in the record');
    const lease = f.boardroom.grant(f.chair, f.meeting.id, { agentId: f.ceo.id, agendaId }).lease!;
    const saved = f.boardroom.written(f.worker, f.meeting.id, request.id, 'Risk exceeds the original estimate.');
    expect(saved.lease?.id).toBe(lease.id);
    expect(saved.contributions[0]).toMatchObject({ kind: 'objection', objectionTo: proposal.id, evidence: ['report-1'] });
    expect(f.boardroom.written(f.worker, f.meeting.id, request.id, 'Risk exceeds the original estimate.').contributions).toHaveLength(1);
    expect(() => f.boardroom.written(f.chair, f.meeting.id, request.id, 'Impersonation')).toThrow('participant');
  });
  it('enforces the selected turn cap independently of elapsed time', () => {
    const f = fixture();
    const meeting = f.boardroom.create(owner, { title: 'Bounded', participants: [{ agentId: f.ceo.id }], agenda: ['One matter'], maxTurns: 1 });
    f.boardroom.begin(owner, meeting.id);
    const lease = f.boardroom.grant(owner, meeting.id, { agentId: f.ceo.id, agendaId: meeting.agenda[0]!.id }).lease!;
    f.boardroom.contribute(f.chair, meeting.id, lease.id, { text: 'One completed turn.' });
    expect(() => f.boardroom.grant(owner, meeting.id, { agentId: f.ceo.id, agendaId: meeting.agenda[0]!.id })).toThrow('turn limit');
  });
  it('refreshes a completed summary after the director resolves its pending proposal', () => {
    const f = fixture(),
      proposal = f.boardroom.proposeDecision(f.chair, f.meeting.id, {
        agendaId: f.meeting.agenda[0]!.id,
        title: 'New priority',
        rationale: 'Director choice',
        requiresDirector: true,
      }).decisions[0]!;
    f.boardroom.finish(owner, f.meeting.id);
    const resolved = f.boardroom.decide(owner, f.meeting.id, proposal.id, true);
    expect(resolved.summary?.pendingProposals).toEqual([]);
    expect(resolved.summary?.confirmedDecisions).toEqual([proposal.id]);
  });
  it('does not let a vote or meeting approval authorize an external action', () => {
    const f = fixture(),
      agendaId = f.meeting.agenda[0]!.id;
    const action = f.store.intent(
      f.company.id,
      f.ceo.id,
      'connected_apps',
      { action: 'execute', tool: 'mail_send', args: { to: 'fixture@example.invalid', subject: 'Review' } },
      0,
    );
    const decision = f.boardroom.proposeDecision(f.chair, f.meeting.id, { agendaId, title: 'Publish update', rationale: 'Needs exact approval', actionId: action.id })
      .decisions[0]!;
    expect(() => f.boardroom.decide(f.chair, f.meeting.id, decision.id, true)).toThrow('requires the director');
    expect(() => f.boardroom.decide(owner, f.meeting.id, decision.id, true)).toThrow('exact current external action');
    expect(f.store.actions(f.company.id)[0]?.state).toBe('pending');
    f.store.actionState(action, 'approved');
    expect(f.boardroom.decide(owner, f.meeting.id, decision.id, true).decisions[0]?.state).toBe('approved');
    expect(f.store.actions(f.company.id)[0]?.state).toBe('approved');
  });
  it('distinguishes confirmed decisions, pending proposals and objections in durable summaries', () => {
    const f = fixture(),
      agendaId = f.meeting.agenda[0]!.id;
    const approved = f.boardroom.proposeDecision(f.chair, f.meeting.id, { agendaId, title: 'Collect evidence', rationale: 'Ordinary planning' }).decisions[0]!;
    f.boardroom.decide(f.chair, f.meeting.id, approved.id, true);
    const pending = f.boardroom.proposeDecision(f.chair, f.meeting.id, { agendaId, title: 'Sensitive account access', rationale: 'Director choice', requiresDirector: true })
      .decisions[1]!;
    const result = f.boardroom.finish(f.chair, f.meeting.id);
    expect(result.summary?.confirmedDecisions).toEqual([approved.id]);
    expect(result.summary?.pendingProposals).toEqual([pending.id]);
    expect(result.summary?.discussed[0]?.contributions).toBe(0);
    const reopened = new CompanyStore(f.root);
    try {
      const scoped = new CoworkStore(path.join(f.root, 'cowork.json'), undefined, { companyId: f.company.id, persistence: reopened.snapshot(f.company.id) });
      expect(new CompanyBoardroom(new CompanyOrganization(reopened, f.company.id, scoped)).read(owner, f.meeting.id).state).toBe('completed');
    } finally {
      reopened.close();
    }
  });
  it('enforces time/turn bounds and keeps interrupted work separate from unrelated missions', () => {
    const f = fixture(),
      agendaId = f.meeting.agenda[0]!.id;
    const unrelated = f.cowork.createMission({ conversationId: f.conversation.id, agentId: f.employee.id, goal: 'Unrelated research', criteria: ['Evidence'] });
    const lease = f.boardroom.grant(f.chair, f.meeting.id, { agentId: f.employee.id, agendaId }).lease!;
    f.boardroom.interrupt(owner, f.meeting.id, 'Runtime restart');
    expect(() => f.boardroom.contribute(f.worker, f.meeting.id, lease.id, { text: 'Stale turn' })).toThrow('not active');
    expect(f.cowork.getMission(unrelated.id)?.status).toBe('running');
    f.boardroom.start(f.chair, f.meeting.id, f.conversation.id);
    f.advance(30 * 60_000);
    expect(() => f.boardroom.grant(f.chair, f.meeting.id, { agentId: f.employee.id, agendaId })).toThrow('time limit');
    expect(f.boardroom.finish(owner, f.meeting.id, 'Time limit reached').summary?.endingReason).toBe('Time limit reached');
  });
  it('blocks contributions after company pause or a newer direction', () => {
    const f = fixture(),
      lease = f.boardroom.grant(f.chair, f.meeting.id, { agentId: f.employee.id, agendaId: f.meeting.agenda[0]!.id }).lease!;
    f.store.steer(f.company.id, 'Work on the new priority');
    expect(() => f.boardroom.contribute(f.worker, f.meeting.id, lease.id, { text: 'Old priority' })).toThrow('direction changed');
    expect(f.boardroom.read(owner, f.meeting.id).contributions).toHaveLength(0);
  });
  it('keeps meetings and contributions isolated from other companies and uninvited employees', () => {
    const f = fixture(),
      outsider = f.cowork.saveAgent({ name: 'Other department', systemPrompt: 'Separate work' });
    expect(() => f.boardroom.read({ kind: 'agent', agentId: outsider.id }, f.meeting.id)).toThrow('attendance grants');
    const other = f.store.create({ purpose: 'Other company' }),
      scoped = new CoworkStore(path.join(f.root, 'other.json'), undefined, { companyId: other.id, persistence: f.store.snapshot(other.id) });
    const room = new CompanyBoardroom(new CompanyOrganization(f.store, other.id, scoped));
    expect(() => room.read(owner, f.meeting.id)).toThrow('not found in this company');
    expect(room.list(owner)).toEqual([]);
  });
  it('dispatches an approved meeting assignment once through the existing mission queue', () => {
    const f = fixture(),
      decision = f.boardroom.proposeDecision(f.chair, f.meeting.id, { agendaId: f.meeting.agenda[0]!.id, title: 'Research more customers', rationale: 'More evidence is needed' })
        .decisions[0]!;
    const proposed = f.boardroom.proposeAssignment(f.chair, f.meeting.id, {
      title: 'Interview three customers',
      agentId: f.employee.id,
      criteria: ['Record three interviews'],
      decisionId: decision.id,
    });
    const item = proposed.actionItems[0]!;
    expect(() => f.boardroom.assign(f.chair, f.meeting.id, item.id)).toThrow('Approve');
    f.boardroom.decide(f.chair, f.meeting.id, decision.id, true);
    f.boardroom.finish(owner, f.meeting.id);
    const assigned = f.boardroom.assign(f.chair, f.meeting.id, item.id).actionItems[0]!;
    f.boardroom.assign(owner, f.meeting.id, item.id);
    expect(f.cowork.missions().filter((m) => m.id === assigned.missionId)).toHaveLength(1);
    expect(f.store.jobs(f.company.id).filter((j) => j.payload['assignmentId'] === item.id)).toHaveLength(1);
    expect(f.cowork.getMission(assigned.missionId!)?.goal).toBe(item.title);
    f.cowork.updateMission(assigned.missionId!, { status: 'done', result: 'Three interviews recorded with evidence.' });
    expect(f.boardroom.read(owner, f.meeting.id).actionItems[0]?.state).toBe('completed');
  });
  it('rejects stale assignments, inactive targets and suspended access to history', () => {
    const f = fixture(),
      item = f.boardroom.proposeAssignment(f.chair, f.meeting.id, { title: 'Research', agentId: f.employee.id, criteria: ['Evidence'] }).actionItems[0]!;
    f.store.steer(f.company.id, 'Different direction');
    expect(() => f.boardroom.assign(owner, f.meeting.id, item.id)).toThrow('direction');
    f.organization.updateMember(owner, f.employee.id, { status: 'suspended' }, f.organization.snapshot().revision);
    expect(() => f.boardroom.grant(owner, f.meeting.id, { agentId: f.employee.id, agendaId: f.meeting.agenda[0]!.id })).toThrow('suspended');
    f.organization.updateMember(owner, f.ceo.id, { status: 'suspended' }, f.organization.snapshot().revision);
    expect(() => f.boardroom.list(f.chair)).toThrow('Suspended');
  });
  it('cancels scheduled meetings without creating an execution conversation and pages metadata without transcripts', () => {
    const f = fixture(),
      before = f.cowork.listConversations().length;
    const scheduled = f.boardroom.create(owner, { title: 'Future planning', participants: [{ agentId: f.ceo.id }], agenda: ['Future roadmap'], startAt: '2026-10-14T08:00:00Z' });
    f.boardroom.cancel(owner, scheduled.id, 'No longer needed');
    expect(f.cowork.listConversations()).toHaveLength(before);
    const page = f.boardroom.historyPage('Future', 0, 1);
    expect(page.total).toBe(1);
    expect(page.meetings[0]).toMatchObject({ id: scheduled.id, state: 'cancelled' });
    expect(page.meetings[0]).not.toHaveProperty('contributions');
    expect(f.boardroom.runtimeMeetings().map((m) => m.id)).not.toContain(scheduled.id);
  });
});
