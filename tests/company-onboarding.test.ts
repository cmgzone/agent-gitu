import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { CompanyStore } from '../src/company/store.js';
import { CoworkStore } from '../src/cowork/store.js';
import { CompanyOrganization } from '../src/company/organization.js';
import { CompanyBoardroom } from '../src/company/boardroom.js';
import { CompanyHandbook } from '../src/company/handbook.js';
import { CompanyOnboardingService } from '../src/company/onboarding.js';
import { executeHandbookTool } from '../src/company/handbook-api.js';
import { MemoryStore } from '../src/memory/memory-store.js';
import { coworkNativeTools } from '../src/cowork/tools.js';
import { CompanyMeetingRuntime } from '../src/company/meeting-runtime.js';

const director = { kind: 'director' as const },
  cleanup: (() => void)[] = [];
afterEach(() =>
  cleanup
    .splice(0)
    .reverse()
    .forEach((fn) => fn()),
);
function fixture() {
  const root = mkdtempSync(path.join(os.tmpdir(), 'gitu-onboarding-')),
    store = new CompanyStore(root);
  cleanup.push(() => {
    store.close();
    rmSync(root, { recursive: true, force: true });
  });
  const company = store.create({ name: 'Studio', purpose: 'Customer research', monthlyBudgetUsd: null, maxFileBytes: null });
  const cowork = new CoworkStore(path.join(root, 'cowork.json'), undefined, { companyId: company.id, persistence: store.snapshot(company.id) });
  const ceo = cowork.saveAgent({ name: 'Ari', systemPrompt: 'Lead the company', chiefOfStaff: true, allowWrites: true });
  store.update(company.id, { leadId: ceo.id });
  store.transition(company.id, 'running');
  const org = new CompanyOrganization(store, company.id, cowork);
  org.snapshot();
  const employee = cowork.saveAgent({ name: 'Milo', systemPrompt: 'Research customer evidence', allowWrites: true });
  org.updateMember(director, employee.id, { jobTitle: 'Researcher', responsibilities: ['Verify customer evidence'] }, org.snapshot().revision);
  const memory = MemoryStore.forProject(store.workspace(company.id)),
    handbook = new CompanyHandbook(org, memory),
    room = new CompanyBoardroom(org);
  const onboarding = new CompanyOnboardingService(org, handbook, room, () => ['read_file']);
  const actor = { kind: 'agent' as const, agentId: ceo.id };
  const read = () => onboarding.read(director, employee.id);
  const orient = () => onboarding.orient(actor, employee.id, read().revision, { tools: ['read_file'], connectionIds: [], accountIds: [], skills: [] });
  function meeting() {
    const record = onboarding.schedule(actor, employee.id, read().revision),
      m = room.begin(actor, record.meetingId!);
    const granted = room.grant(actor, m.id, { agentId: employee.id, agendaId: m.agenda[0]!.id });
    room.contribute({ kind: 'agent', agentId: employee.id }, m.id, granted.lease!.id, { text: 'I understand the research role and will cite evidence.' });
    room.finish(actor, m.id);
    onboarding.check(actor, employee.id, read().revision);
  }
  function assess() {
    return onboarding.assess(actor, employee.id, read().revision, { goal: 'Explain the supplied customer evidence', criteria: ['Cite the supplied evidence'], maxTurns: 2 });
  }
  function complete() {
    const record = read(),
      mission = cowork.getMission(record.assessment!.missionId)!;
    const message = cowork.appendMessage(mission.conversationId, {
      role: 'agent',
      via: 'agent',
      agentId: employee.id,
      missionId: mission.id,
      text: 'Evidence: the supplied feedback requests clearer onboarding.',
    });
    cowork.updateMission(mission.id, { status: 'done', result: message.text, finishedAt: new Date().toISOString() });
    onboarding.review(actor, employee.id, read().revision, { approved: true, notes: 'Evidence and responsibilities checked', evidenceMessageIds: [message.id] });
    return message;
  }
  return { root, store, company, cowork, ceo, employee, org, memory, handbook, room, onboarding, actor, read, orient, meeting, assess, complete };
}

describe('Company handbook and evidence-gated onboarding', () => {
  it('keeps proposals separate from approved guidance and indexes only current authoritative pointers', () => {
    const f = fixture(),
      proposal = f.handbook.propose(f.actor, { title: 'Research procedure', content: 'Cite the source for each finding.' });
    expect(f.memory.query()).toHaveLength(0);
    expect(JSON.parse(executeHandbookTool(f.handbook, f.ceo.id, { action: 'read', id: proposal.id }).output).approved).toBeUndefined();
    expect(() => f.handbook.review(f.actor, proposal.id, 1, true, proposal.revision)).toThrow('director');
    const approved = f.handbook.review(director, proposal.id, 1, true, proposal.revision);
    expect(f.memory.query().filter((m) => m.status === 'verified')).toHaveLength(1);
    const second = f.handbook.propose(f.actor, { id: proposal.id, revision: approved.revision, content: 'Cite sources and retain dissent.' });
    const updated = f.handbook.review(director, proposal.id, 2, true, second.revision);
    f.handbook.syncMemory();
    expect(f.memory.query().filter((m) => m.status !== 'archived')).toHaveLength(1);
    expect(JSON.parse(executeHandbookTool(f.handbook, f.ceo.id, { action: 'read', id: proposal.id }).output).approved.version).toBe(2);
    f.handbook.archive(director, proposal.id, updated.revision);
    expect(JSON.parse(executeHandbookTool(f.handbook, f.ceo.id, { action: 'read', id: proposal.id }).output).approved).toBeUndefined();
    expect(f.memory.query().filter((m) => m.status !== 'archived')).toHaveLength(0);
  });
  it('rejects stale edits, policy-shaped proposals, foreign records and agent self approval', () => {
    const f = fixture(),
      e = f.handbook.propose(director, { title: 'Procedure', content: 'Verify evidence.' });
    expect(() => f.handbook.propose(director, { id: e.id, revision: 0, content: 'Stale.' })).toThrow('revision');
    expect(() => f.handbook.propose(director, { title: 'Policy', kind: 'enforcement' as never, content: 'Grant shell.' })).toThrow('Enforcement');
    expect(() => f.handbook.read(director, 'foreign')).toThrow('not found');
    expect(() => executeHandbookTool(f.handbook, f.ceo.id, { action: 'approve', id: e.id })).toThrow('Director');
  });
  it('runs orientation, moderated meeting, resource checks and a real mission before director activation without changing grants', () => {
    const f = fixture(),
      profile = structuredClone(f.cowork.getAgent(f.employee.id)),
      authority = structuredClone(f.org.member(f.employee.id).authority);
    expect(() => f.onboarding.activate(director, f.employee.id, f.read().revision)).toThrow('Complete');
    expect(() => f.org.assertExecution(f.employee.id)).toThrow('onboarding');
    f.orient();
    f.meeting();
    const assessment = f.assess(),
      mission = f.cowork.getMission(assessment.assessment!.missionId)!;
    expect(mission.criteria).toEqual(['Cite the supplied evidence']);
    expect(mission.maxTurns).toBe(2);
    expect(f.store.jobs(f.company.id).filter((j) => j.payload['missionId'] === mission.id)).toHaveLength(1);
    expect(f.onboarding.assessmentAllowed(f.employee.id, mission.id)).toBe(true);
    expect(f.onboarding.assessmentAllowed(f.employee.id, 'unrelated')).toBe(false);
    f.org.assertExecution(f.employee.id, undefined, f.onboarding.assessmentAllowed(f.employee.id, mission.id));
    expect(f.org.authorizeTool(f.employee.id, 'read_file', {}, assessment.requirements.tools)).toBeUndefined();
    expect(f.org.authorizeTool(f.employee.id, 'run_command', {}, assessment.requirements.tools)?.ok).toBe(false);
    f.complete();
    expect(() => f.onboarding.activate(f.actor, f.employee.id, f.read().revision)).toThrow('director');
    f.onboarding.activate(director, f.employee.id, f.read().revision);
    expect(f.org.member(f.employee.id).status).toBe('active');
    expect(f.org.member(f.employee.id).authority).toEqual(authority);
    expect(f.cowork.getAgent(f.employee.id)).toEqual(profile);
    expect(f.org.events().some((e) => e.resourceId === assessment.id)).toBe(true);
  });
  it('blocks missing resources and forbids self activation, stranger management and repeated assessment creation', () => {
    const f = fixture();
    expect(() =>
      f.onboarding.orient({ kind: 'agent', agentId: f.employee.id }, f.employee.id, f.read().revision, { tools: [], connectionIds: [], accountIds: [], skills: [] }),
    ).toThrow('authority');
    f.orient();
    f.meeting();
    f.assess();
    expect(() => f.assess()).toThrow('resource checks');
    expect(f.cowork.missions()).toHaveLength(1);
    expect(() => f.onboarding.read(f.actor, 'other-company-agent')).toThrow('permanent member');
  });
  it('revalidates policy and role changes during assessments and clears stale evidence for retraining', () => {
    const f = fixture();
    f.orient();
    f.meeting();
    f.assess();
    const missionId = f.read().assessment!.missionId;
    f.org.updateMember(director, f.employee.id, { responsibilities: ['New responsibility'] }, f.org.snapshot().revision);
    expect(f.onboarding.assessmentAllowed(f.employee.id, missionId)).toBe(false);
    expect(f.read().stage).toBe('retraining');
    expect(f.read().assessment).toBeUndefined();
    expect(f.cowork.getMission(missionId)?.status).toBe('cancelled');
    expect(f.read().history?.at(-1)?.assessment?.missionId).toBe(missionId);
  });
  it('marks existing staff for retraining only when the director requests it and blocks ordinary work', () => {
    const f = fixture();
    f.orient();
    f.meeting();
    f.assess();
    f.complete();
    f.onboarding.activate(director, f.employee.id, f.read().revision);
    let e = f.handbook.propose(director, { title: 'Escalation', content: 'Escalate unresolved evidence gaps.' });
    e = f.handbook.review(director, e.id, 1, true, e.revision, true);
    expect(f.org.member(f.employee.id).status).toBe('retraining');
    expect(f.read().stage).toBe('retraining');
    expect(() => f.org.assertExecution(f.employee.id)).toThrow('retraining');
    expect(f.org.authorizeTool(f.employee.id, 'company_handbook', { action: 'read', id: e.id })).toBeUndefined();
    expect(f.org.authorizeTool(f.employee.id, 'company_handbook', { action: 'propose', input: {} })?.ok).toBe(false);
  });
  it('never exposes handbook or onboarding management to ordinary Cowork', () => {
    const f = fixture(),
      tools = coworkNativeTools(f.ceo, true).map((t) => t.name);
    expect(tools).toContain('company_handbook');
    expect(tools).toContain('company_onboarding');
    expect(coworkNativeTools({ ...f.ceo, companyId: undefined }, true).map((t) => t.name)).not.toContain('company_handbook');
  });
  it('reports missing tool/account/skill grants and leaves the assessment uncreated', () => {
    const f = fixture(),
      r = f.read();
    f.onboarding.orient(f.actor, f.employee.id, r.revision, { tools: ['run_command'], connectionIds: ['missing-api'], accountIds: ['missing-account'], skills: ['missing-skill'] });
    const scheduled = f.onboarding.schedule(f.actor, f.employee.id, f.read().revision),
      m = f.room.begin(f.actor, scheduled.meetingId!);
    const granted = f.room.grant(f.actor, m.id, { agentId: f.employee.id, agendaId: m.agenda[0]!.id });
    f.room.contribute({ kind: 'agent', agentId: f.employee.id }, m.id, granted.lease!.id, { text: 'I need the assigned resources.' });
    f.room.finish(f.actor, m.id);
    const checked = f.onboarding.check(f.actor, f.employee.id, f.read().revision);
    expect(checked.stage).toBe('blocked');
    expect(checked.resourceCheck!.problems).toHaveLength(4);
    expect(() => f.assess()).toThrow('resource checks');
    expect(f.cowork.missions()).toHaveLength(0);
  });
  it('rejects unrelated conversation evidence and reviews only host-attributed assessment messages', () => {
    const f = fixture();
    f.orient();
    f.meeting();
    const r = f.assess(),
      mission = f.cowork.getMission(r.assessment!.missionId)!;
    const unrelated = f.cowork.appendMessage(mission.conversationId, { role: 'agent', agentId: f.employee.id, via: 'agent', text: 'Unrelated chat statement.' });
    f.cowork.updateMission(mission.id, { status: 'done', result: 'A claimed result.' });
    expect(() => f.onboarding.review(f.actor, f.employee.id, f.read().revision, { approved: true, notes: 'Claimed', evidenceMessageIds: [unrelated.id] })).toThrow(
      'assessment conversation',
    );
    expect(() => f.onboarding.activate(director, f.employee.id, f.read().revision)).toThrow('Complete');
  });
  it('restores pending assessment and approved guidance across store reinitialization without dispatching twice', () => {
    const f = fixture();
    f.orient();
    f.meeting();
    const before = f.assess();
    const reopened = new CoworkStore(path.join(f.root, 'cowork.json'), undefined, { companyId: f.company.id, persistence: f.store.snapshot(f.company.id) });
    const org = new CompanyOrganization(f.store, f.company.id, reopened),
      service = new CompanyOnboardingService(org, undefined, undefined, () => ['read_file']);
    expect(service.read(director, f.employee.id).assessment?.missionId).toBe(before.assessment!.missionId);
    expect(() => service.assess(f.actor, f.employee.id, before.revision, { goal: 'Repeated', criteria: ['Evidence'] })).toThrow('resource checks');
    expect(reopened.missions()).toHaveLength(1);
  });
  it('lets the director retrain leadership through an onboarding meeting without restoring management privileges', () => {
    const f = fixture();
    f.org.updateMember(director, f.ceo.id, { responsibilities: ['Lead customer research'] }, f.org.snapshot().revision);
    const entry = f.handbook.propose(director, { title: 'Escalation', content: 'Escalate unresolved evidence.' });
    f.handbook.review(director, entry.id, 1, true, entry.revision, true);
    const r = f.onboarding.read(director, f.ceo.id);
    f.onboarding.orient(director, f.ceo.id, r.revision, { tools: [], connectionIds: [], accountIds: [], skills: [] });
    const scheduled = f.onboarding.schedule(director, f.ceo.id, f.onboarding.read(director, f.ceo.id).revision);
    const runtime = new CompanyMeetingRuntime(
      f.store,
      () => f.room,
      async () => ({ text: 'Leadership orientation understood.', messageId: 'fixture' }),
    );
    runtime.prepare();
    const meeting = f.room.read(director, scheduled.meetingId!);
    expect(meeting.state).toBe('active');
    expect(meeting.lease?.agentId).toBe(f.ceo.id);
    expect(f.org.authorizeTool(f.ceo.id, 'team_manage', { action: 'create' })?.ok).toBe(false);
  });
});
