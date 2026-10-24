import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CompanyStore } from '../src/company/store.js';
import { CompanyOrganization } from '../src/company/organization.js';
import { CompanyBoardroom } from '../src/company/boardroom.js';
import { CompanyMeetingRuntime, type MeetingTurnInput } from '../src/company/meeting-runtime.js';
import { CompanyCoordinator } from '../src/company/coordinator.js';
import { CompanyLlm } from '../src/company/llm.js';
import { CoworkStore } from '../src/cowork/store.js';
import { executeBoardroomTool } from '../src/company/boardroom-tool.js';

const cleanups: (() => void)[] = [];
afterEach(() => {
  cleanups
    .splice(0)
    .reverse()
    .forEach((f) => f());
});
function fixture(run?: (input: MeetingTurnInput) => Promise<{ text: string; messageId: string }>) {
  const root = mkdtempSync(path.join(os.tmpdir(), 'gitu-meeting-runtime-')),
    store = new CompanyStore(root);
  cleanups.push(() => {
    store.close();
    rmSync(root, { recursive: true, force: true });
  });
  const company = store.create({ name: 'Studio', purpose: 'Research', monthlyBudgetUsd: null, maxFileBytes: null });
  const cowork = new CoworkStore(path.join(root, 'cowork.json'), undefined, { companyId: company.id, persistence: store.snapshot(company.id) });
  const ceo = cowork.saveAgent({ name: 'Ari', systemPrompt: 'Lead', chiefOfStaff: true }),
    employee = cowork.saveAgent({ name: 'Milo', systemPrompt: 'Research' });
  const conversation = cowork.saveConversation({ kind: 'group', memberIds: [ceo.id, employee.id], chiefId: ceo.id });
  store.update(company.id, { leadId: ceo.id, conversationId: conversation.id });
  store.transition(company.id, 'running');
  const org = new CompanyOrganization(store, company.id, cowork);
  org.snapshot();
  const room = new CompanyBoardroom(org);
  const meeting = room.create({ kind: 'director' }, { title: 'Review', participants: [{ agentId: ceo.id }, { agentId: employee.id }], agenda: ['Evidence'], budgetUsd: 1 });
  const execute = vi.fn(run ?? (async (input) => ({ text: 'Evidence-based contribution from ' + input.lease.agentId, messageId: 'fixture-' + input.lease.id })));
  const runtime = new CompanyMeetingRuntime(
    store,
    (id) => {
      if (id !== company.id) throw new Error('Foreign company');
      return room;
    },
    execute,
  );
  return { root, store, company, cowork, ceo, employee, org, room, meeting, runtime, execute };
}
describe('Company meetings through the existing durable queue', () => {
  it('waits for busy teammates without allocating an expiring floor or abandoning their work',()=>{
    const f=fixture();let available=false;
    const runtime=new CompanyMeetingRuntime(f.store,()=>f.room,f.execute,Date.now,()=>available);
    runtime.prepare();expect(f.room.read({kind:'director'},f.meeting.id).lease).toBeUndefined();expect(f.store.jobs(f.company.id)).toEqual([]);
    available=true;runtime.prepare();expect(f.room.read({kind:'director'},f.meeting.id).lease).toBeDefined();
    const guarded=new CompanyBoardroom(f.org,Date.now,()=>false);
    expect(()=>guarded.grant({kind:'director'},f.meeting.id,{agentId:f.ceo.id,agendaId:f.meeting.agenda[0]!.id})).toThrow('safe checkpoint');
  });
  it('keeps the floor with the director until explicitly returned and preserves unheard objections', () => {
    const f = fixture();
    f.runtime.prepare();
    const first = f.room.read({ kind: 'director' }, f.meeting.id);
    f.room.revokeFloor({ kind: 'director' }, f.meeting.id, 'Director needs to add context');
    f.runtime.prepare();
    expect(f.room.read({ kind: 'director' }, f.meeting.id).lease).toBeUndefined();
    expect(() => f.room.grant({ kind: 'agent', agentId: f.ceo.id }, f.meeting.id, { agentId: f.employee.id, agendaId: first.agenda[0]!.id })).toThrow('director has the floor');
    f.room.directorContribution(f.meeting.id, first.agenda[0]!.id, 'Focus on evidence from actual customers.');
    f.runtime.prepare();
    expect(f.room.read({ kind: 'director' }, f.meeting.id).lease).toBeUndefined();
    f.room.returnFloor(f.meeting.id);
    f.runtime.prepare();
    expect(f.room.read({ kind: 'director' }, f.meeting.id).lease).toBeDefined();
  });
  it('starts due meetings and queues one turn; repeated ticks and settled jobs cannot duplicate it', async () => {
    const f = fixture();
    f.runtime.prepare();
    f.runtime.prepare();
    const jobs = f.store.jobs(f.company.id).filter((j) => j.kind === 'meeting');
    expect(jobs).toHaveLength(1);
    await f.runtime.execute(jobs[0]!);
    await f.runtime.execute(jobs[0]!);
    expect(f.execute).toHaveBeenCalledTimes(1);
    expect(f.room.read({ kind: 'director' }, f.meeting.id).contributions).toHaveLength(1);
    f.store.finishJob(jobs[0]!, 'done');
    f.runtime.prepare();
    const second = f.store.jobs(f.company.id).find((j) => j.state === 'queued')!;
    await f.runtime.execute(second);
    f.store.finishJob(second, 'done');
    f.runtime.prepare();
    expect(f.room.read({ kind: 'director' }, f.meeting.id)).toMatchObject({ state: 'completed', turns: 2 });
  });
  it('interrupts recovered active meetings and never automatically replays an uncertain turn', async () => {
    const f = fixture();
    f.runtime.prepare();
    const job = f.store.jobs(f.company.id)[0]!;
    f.store.claim(job);
    f.store.recover();
    f.runtime.prepare(true);
    expect(f.room.read({ kind: 'director' }, f.meeting.id).state).toBe('interrupted');
    await f.runtime.execute(f.store.jobs(f.company.id)[0]!);
    expect(f.execute).not.toHaveBeenCalled();
    f.room.begin({ kind: 'director' }, f.meeting.id);
    f.runtime.prepare();
    expect(f.room.read({ kind: 'director' }, f.meeting.id).lease?.id).not.toBe(job.payload['turnId']);
  });
  it('preserves unrelated assignments when paused or redirected', () => {
    const f = fixture(),
      mission = f.cowork.createMission({
        conversationId: f.company.conversationId ?? f.cowork.listConversations()[0]!.id,
        agentId: f.employee.id,
        goal: 'Existing research',
        criteria: ['Evidence'],
      });
    f.runtime.prepare();
    f.store.transition(f.company.id, 'paused');
    f.runtime.prepare();
    expect(f.room.read({ kind: 'director' }, f.meeting.id).state).toBe('interrupted');
    expect(f.cowork.getMission(mission.id)?.goal).toBe('Existing research');
    f.store.transition(f.company.id, 'running');
    f.room.begin({ kind: 'director' }, f.meeting.id);
    f.runtime.prepare();
    f.store.steer(f.company.id, 'New direction');
    f.runtime.prepare();
    expect(f.room.read({ kind: 'director' }, f.meeting.id).state).toBe('interrupted');
  });
  it('defers busy participant admission, records failures honestly and refuses external execution during discussion', async () => {
    const f = fixture(async () => {
      throw new Error('Company lead is still working.');
    });
    f.runtime.prepare();
    const job = f.store.jobs(f.company.id)[0]!;
    await expect(f.runtime.execute(job)).rejects.toThrow('still working');
    expect(f.room.read({ kind: 'director' }, f.meeting.id).state).toBe('active');
    const lease = f.room.read({ kind: 'director' }, f.meeting.id).lease!;
    expect(f.runtime.authorize(f.company.id, lease.agentId, f.meeting.id, lease.id, 'connected_apps', { action: 'execute', tool: 'mail_send' })).toMatchObject({ ok: false });
    expect(f.runtime.authorize(f.company.id, lease.agentId, f.meeting.id, lease.id, 'run_command', { command: 'echo test' })).toMatchObject({ ok: false });
    expect(f.runtime.authorize(f.company.id, lease.agentId, f.meeting.id, lease.id, 'company_boardroom', { action: 'read', meetingId: f.meeting.id })).toBeUndefined();
    f.execute.mockRejectedValueOnce(new Error('Provider unavailable'));
    await expect(f.runtime.execute(job)).rejects.toThrow('Provider unavailable');
    expect(f.room.read({ kind: 'director' }, f.meeting.id).contributions).toHaveLength(0);
    expect(f.room.read({ kind: 'director' }, f.meeting.id).state).toBe('interrupted');
  });
  it('retains tool contributions once if the runner stops after they were saved', async () => {
    const f = fixture(async (input) => {
      executeBoardroomTool(
        f.room,
        { kind: 'agent', agentId: input.lease.agentId },
        { action: 'contribute', meetingId: input.meeting.id, input: { turnId: input.lease.id, text: 'Recorded proposal' } },
      );
      throw new Error('Permission ended after contribution');
    });
    f.runtime.prepare();
    await f.runtime.execute(f.store.jobs(f.company.id)[0]!);
    expect(f.room.read({ kind: 'director' }, f.meeting.id).contributions).toHaveLength(1);
  });
  it('charges every model attempt to company and meeting with atomic reservations and stable reconciliation', async () => {
    const f = fixture();
    f.runtime.prepare();
    const lease = f.room.read({ kind: 'director' }, f.meeting.id).lease!;
    const identity = { companyId: f.company.id, agentId: lease.agentId, meetingId: f.meeting.id, meetingTurnId: lease.id, provider: 'fixture', model: 'fixture' };
    const pending = f.store.reserve(f.company.id, 0.7, identity);
    expect(() => f.store.reserve(f.company.id, 0.4, identity)).toThrow('Meeting budget');
    f.store.recordUsage(pending, { ...identity, costUsd: 0.2, outcome: 'completed' });
    f.store.recordUsage(pending, { ...identity, costUsd: 0.9, outcome: 'completed' });
    expect(f.store.meetingAccounting(f.company.id, f.meeting.id)).toMatchObject({ knownCostUsd: 0.2, reservedUsd: 0 });
    const call = vi.fn(async (_messages: unknown[], options: any) => {
      options.onUsage({ inputTokens: 10, outputTokens: 5 });
      return 'Discussion';
    });
    const llm = new CompanyLlm({ name: 'fixture', complete: call, completeStream: async () => '' }, f.store, identity, () => 0.1);
    await llm.complete([]);
    expect(f.store.meetingAccounting(f.company.id, f.meeting.id).knownCostUsd).toBeCloseTo(0.3);
    expect(f.store.usage(f.company.id)).toHaveLength(2);
    f.room.revokeFloor({ kind: 'director' }, f.meeting.id, 'Stop speaking');
    await expect(llm.complete([])).rejects.toThrow('speaking permission');
    expect(call).toHaveBeenCalledTimes(1);
  });
  it('retains uncertain costs and permits further attempts within the meeting budget and speaking lease', () => {
    const f = fixture();
    f.runtime.prepare();
    const lease = f.room.read({ kind: 'director' }, f.meeting.id).lease!;
    const identity = { agentId: lease.agentId, meetingId: f.meeting.id, meetingTurnId: lease.id, provider: 'fixture', model: 'fixture' };
    expect(() => f.store.reserve(f.company.id, undefined, identity)).toThrow('usable model prices');
    const uncertain = f.store.reserve(f.company.id, 0.1, identity);
    f.store.recordUsage(uncertain, { companyId: f.company.id, ...identity, outcome: 'failed' });
    expect(f.store.meetingAccounting(f.company.id, f.meeting.id)).toMatchObject({ reservedUsd: 0.1, unknownCalls: 1 });
    for (let i = 0; i < 5; i++) f.store.reserve(f.company.id, 0, identity);
    expect(() => f.store.reserve(f.company.id, 0, identity)).not.toThrow();
    expect(f.store.usage(f.company.id).filter(call => call.meetingTurnId === lease.id)).toHaveLength(7);
    expect(() => f.store.reserve(f.company.id, 0.91, identity)).toThrow('Meeting budget');
    expect(f.store.meetingAccounting(f.company.id, f.meeting.id)).toMatchObject({ reservedUsd: 0.1, unknownCalls: 7 });
    expect(() => f.store.reserve(f.company.id, 0, { agentId: f.ceo.id, provider: 'fixture', model: 'fixture' })).not.toThrow();
    f.room.revokeFloor({ kind: 'director' }, f.meeting.id, 'Stop speaking');
    expect(() => f.store.reserve(f.company.id, 0, identity)).toThrow('speaking permission');
  });
  it('admits meetings only under the same scheduler ownership lease as other jobs', async () => {
    const f = fixture(),
      preparation = vi.fn(),
      coordinator = new CompanyCoordinator(
        f.store,
        async () => {},
        () => {},
        () => {},
        preparation,
      );
    f.store.acquireScheduler('another-process');
    expect(() => coordinator.start()).not.toThrow();
    expect(preparation).not.toHaveBeenCalled();
    f.store.releaseScheduler('another-process');
    coordinator.tick();
    expect(preparation).toHaveBeenCalledWith(true);
    coordinator.stop();
    await coordinator.drain();
  });
});
