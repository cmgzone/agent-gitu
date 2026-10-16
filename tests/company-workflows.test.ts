import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, it, expect, vi } from 'vitest';
import { CompanyStore } from '../src/company/store.js';
import { CoworkStore } from '../src/cowork/store.js';
import { CompanyOrganization } from '../src/company/organization.js';
import { CompanyWorkflows } from '../src/company/workflows.js';
import { executeWorkflowTool } from '../src/company/workflow-api.js';
import type { WorkflowStep, WorkflowSchema } from '../src/company/workflow-models.js';
const cleanup: (() => void)[] = [],
  director = { kind: 'director' as const };
afterEach(() =>
  cleanup
    .splice(0)
    .reverse()
    .forEach((f) => f()),
);
const object = (properties: Record<string, WorkflowSchema> = {}): WorkflowSchema => ({ type: 'object', properties, required: Object.keys(properties) });
function task(id: string, agentId: string, patch: Partial<WorkflowStep> = {}): WorkflowStep {
  return {
    id,
    name: id,
    type: 'mission',
    agentId,
    goal: 'Produce the assigned result.',
    criteria: ['Meet the supplied requirement'],
    dependsOn: [],
    bindings: { topic: { source: 'input', field: 'topic' } },
    inputSchema: object({ topic: { type: 'string' } }),
    outputSchema: { type: 'string' },
    tools: [],
    skills: [],
    connectionIds: [],
    accountIds: [],
    maxSessions: 2,
    maxAttempts: 2,
    timeoutMinutes: 5,
    ...patch,
  };
}
function fixture() {
  const root = mkdtempSync(path.join(os.tmpdir(), 'gitu-workflows-')),
    store = new CompanyStore(root);
  cleanup.push(() => {
    store.close();
    rmSync(root, { recursive: true, force: true });
  });
  const company = store.create({ name: 'Studio', purpose: 'Research', monthlyBudgetUsd: null, maxFileBytes: null, workers: 2 });
  const cowork = new CoworkStore(path.join(root, 'cowork.json'), undefined, { companyId: company.id, persistence: store.snapshot(company.id) }),
    ceo = cowork.saveAgent({ name: 'Ari', systemPrompt: 'Lead', chiefOfStaff: true, allowWrites: true }),
    worker = cowork.saveAgent({ name: 'Milo', systemPrompt: 'Work', allowWrites: true });
  store.update(company.id, { leadId: ceo.id });
  store.transition(company.id, 'running');
  const org = new CompanyOrganization(store, company.id, cowork);
  org.snapshot();
  let clock = Date.now();
  const cancelled: string[] = [],
    service = new CompanyWorkflows(
      org,
      () => ['read_file'],
      (id) => cancelled.push(id),
      () => clock,
    ),
    actor = { kind: 'agent' as const, agentId: ceo.id };
  function save(steps: WorkflowStep[], parallelism = 2) {
    return service.save(actor, { title: 'Process', inputs: object({ topic: { type: 'string' } }), steps, parallelism });
  }
  function start(steps: WorkflowStep[], parallelism = 2) {
    const w = save(steps, parallelism);
    service.approve(director, w.id, 1, w.revision);
    return service.start(actor, w.id, 1, { topic: 'Research' });
  }
  function complete(missionId: string, result: string) {
    cowork.updateMission(missionId, { status: 'done', result, finishedAt: new Date().toISOString() });
  }
  return { root, store, company, cowork, ceo, worker, org, service, actor, save, start, complete, cancelled, advance: (ms: number) => (clock += ms) };
}
describe('Company workflows, typed handoffs and side-effect-free simulation', () => {
  it('preserves large workflow definitions and dispatches input beyond the old mission briefing cap', () => {
    const f = fixture();
    const steps = Array.from({ length: 41 }, (_, i) => task(`step-${i}`, f.worker.id, {
      goal: 'Complete every requirement. '.repeat(100),
      criteria: Array.from({ length: 13 }, (_, j) => `Verify requirement ${j}`),
      maxSessions: 25, maxAttempts: 4, timeoutMinutes: 2000,
    }));
    const workflow = f.save(steps, 9);
    expect(workflow.versions[0]?.steps).toHaveLength(41);
    f.service.approve(director, workflow.id, 1, workflow.revision);
    const topic = 'Requested input '.repeat(4000);
    const run = f.service.start(f.actor, workflow.id, 1, { topic });
    f.service.prepare();
    const dispatched = f.service.run(director, run.id).steps.find(step => step.missionId);
    expect(dispatched).toBeDefined();
    const mission = f.cowork.getMission(dispatched!.missionId!)!;
    expect(mission.goal).toContain(topic);
    expect(mission.maxTurns).toBe(25);
    expect(mission.criteria).toHaveLength(13);
  });
  it('persists immutable versions and never allows agents to approve their own workflow', () => {
    const f = fixture(),
      w = f.save([task('a', f.worker.id)]);
    expect(() => f.service.start(f.actor, w.id, 1, { topic: 'x' })).toThrow('Approve');
    expect(() => f.service.approve(f.actor, w.id, 1, w.revision)).toThrow('director');
    const approved = f.service.approve(director, w.id, 1, w.revision);
    const edited = f.service.save(f.actor, {
      id: w.id,
      revision: approved.revision,
      title: 'Updated',
      inputs: object({ topic: { type: 'string' } }),
      steps: [task('a', f.worker.id, { goal: 'New goal' })],
      parallelism: 1,
    });
    expect(edited.versions[0]!.steps[0]!.goal).toBe('Produce the assigned result.');
    expect(edited.versions[1]!.state).toBe('draft');
    expect(() => f.service.save(f.actor, { id: w.id, revision: w.revision, title: 'stale', inputs: object(), steps: [task('a', f.worker.id)], parallelism: 1 })).toThrow('changed');
  });
  it('dispatches actual missions once and validates produced data before admitting dependencies', () => {
    const f = fixture(),
      r = f.start([
        task('a', f.worker.id, { outputSchema: object({ report: { type: 'string' } }) }),
        task('b', f.ceo.id, { dependsOn: ['a'], bindings: { report: { source: 'step', stepId: 'a', field: 'report' } }, inputSchema: object({ report: { type: 'string' } }) }),
      ]);
    f.service.prepare();
    f.service.prepare();
    expect(f.cowork.missions()).toHaveLength(1);
    let run = f.service.run(director, r.id);
    f.complete(run.steps[0]!.missionId!, JSON.stringify({ report: 'Verified source notes' }));
    f.service.prepare();
    run = f.service.run(director, r.id);
    expect(run.steps[0]!.state).toBe('completed');
    expect(run.steps[1]!.input).toEqual({ report: 'Verified source notes' });
    expect(f.cowork.missions()).toHaveLength(2);
    f.complete(run.steps[1]!.missionId!, 'Final report');
    f.service.prepare();
    expect(f.service.run(director, r.id).state).toBe('completed');
  });
  it('holds invalid output for review and preserves its real mission and attempt history', () => {
    const f = fixture(),
      r = f.start([task('a', f.worker.id, { outputSchema: object({ report: { type: 'string' } }) })]);
    f.service.prepare();
    const mission = f.service.run(director, r.id).steps[0]!.missionId!;
    f.complete(mission, '{"wrong":true}');
    f.service.prepare();
    let run = f.service.run(director, r.id);
    expect(run.state).toBe('blocked');
    expect(run.steps[0]!.output).toBeUndefined();
    expect(run.steps[0]!.error).toContain('report');
    f.service.retry(director, r.id, 'a', run.revision);
    f.service.prepare();
    run = f.service.run(director, r.id);
    expect(run.steps[0]!.priorMissionIds).toEqual([mission]);
    expect(run.steps[0]!.attempts).toBe(2);
    expect(() => f.service.assertMission(mission)).toThrow('permission ended');
  });
  it('keeps parallel admission within workflow/company limits and leaves unrelated missions intact', () => {
    const f = fixture(),
      r = f.start([task('a', f.worker.id), task('b', f.ceo.id)], 1),
      conv = f.cowork.saveConversation({ kind: 'dm', memberIds: [f.worker.id] }),
      other = f.cowork.createMission({ agentId: f.worker.id, conversationId: conv.id, goal: 'Unrelated', criteria: ['Keep it'] });
    f.service.prepare();
    expect(f.service.run(director, r.id).steps.filter((s) => s.state === 'running')).toHaveLength(1);
    f.service.cancel(director, r.id, f.service.run(director, r.id).revision);
    expect(f.cowork.getMission(other.id)!.status).toBe('running');
    expect(f.cancelled).toHaveLength(1);
  });
  it('binds director approval to the exact input and rejects stale, foreign and agent approvals', () => {
    const f = fixture(),
      approval = task('review', f.ceo.id, {
        type: 'approval',
        agentId: undefined,
        inputSchema: object({ topic: { type: 'string' } }),
        outputSchema: object({ topic: { type: 'string' } }),
      }),
      r = f.start([approval]);
    f.service.prepare();
    let run = f.service.run(director, r.id),
      gate = run.steps[0]!.approval!;
    expect(f.cowork.missions()).toHaveLength(0);
    expect(() => f.service.review(f.actor, r.id, 'review', true, gate.digest, run.revision)).toThrow('Director');
    expect(() => f.service.review(director, r.id, 'review', true, 'wrong', run.revision)).toThrow('stale');
    f.service.review(director, r.id, 'review', true, gate.digest, run.revision);
    expect(f.service.run(director, r.id).steps[0]!.error).toBeUndefined();
    f.service.prepare();
    run = f.service.run(director, r.id);
    expect(run.state).toBe('completed');
    expect(run.steps[0]!.output).toEqual({ topic: 'Research' });
  });
  it('simulates branches and missing requirements without creating missions, jobs, external actions or grants', () => {
    const f = fixture(),
      w = f.save([task('a', 'missing', { tools: ['run_command'], accountIds: ['github'], connectionIds: ['search'] })]),
      before = f.store.get(f.company.id);
    const create = vi.spyOn(f.cowork, 'createMission'),
      simulation = f.service.simulate(director, w.id, 1, { topic: 'Sample' }, { a: 'Mock report' });
    expect(simulation.mode).toBe('simulation');
    expect(simulation.verifiedLive).toBe(false);
    expect(simulation.issues.some((i) => i.code === 'agent' && i.section === 'Team')).toBe(true);
    expect(create).not.toHaveBeenCalled();
    expect(f.store.jobs(f.company.id)).toHaveLength(0);
    expect(f.store.actions(f.company.id)).toHaveLength(0);
    expect(f.store.get(f.company.id)).toEqual(before);
    expect(() => f.service.run(director, simulation.id)).toThrow('not found');
  });
  it('detects cycles, incompatible handoffs and missing connector/skill/tool grants', () => {
    const f = fixture(),
      w = f.save([
        task('a', f.worker.id, { dependsOn: ['b'], tools: ['run_command'], skills: ['coding'], accountIds: ['github'], connectionIds: ['api'] }),
        task('b', f.ceo.id, { dependsOn: ['a'], bindings: { topic: { source: 'step', stepId: 'a' } }, inputSchema: object({ topic: { type: 'number' } }) }),
      ]);
    const issues = f.service.validate(w.versions[0]!);
    for (const code of ['cycle', 'handoff', 'tool', 'skill', 'account', 'connection'])
      expect(
        issues.some((i) => i.code === code),
        code,
      ).toBe(true);
    expect(() => f.service.approve(director, w.id, 1, w.revision)).toThrow('Circular');
  });
  it('skips a false conditional branch using actual produced values', () => {
    const f = fixture(),
      r = f.start([
        task('a', f.worker.id, { outputSchema: object({ ready: { type: 'boolean' } }) }),
        task('b', f.ceo.id, { dependsOn: ['a'], condition: { stepId: 'a', field: 'ready', equals: true } }),
      ]);
    f.service.prepare();
    f.complete(f.service.run(director, r.id).steps[0]!.missionId!, '{"ready":false}');
    f.service.prepare();
    expect(f.service.run(director, r.id).steps[1]!.state).toBe('skipped');
    expect(f.cowork.missions()).toHaveLength(1);
  });
  it('stops timed-out work and prevents unsafe retries after uncertain external submissions', () => {
    const f = fixture(),
      r = f.start([task('a', f.worker.id)]);
    f.service.prepare();
    f.advance(6 * 60000);
    expect(() => f.service.assertMission(f.service.run(director, r.id).steps[0]!.missionId)).toThrow('timeout');
    f.service.prepare();
    let run = f.service.run(director, r.id);
    expect(run.state).toBe('failed');
    expect(f.cowork.getMission(run.steps[0]!.missionId!)!.status).toBe('cancelled');
    const a = f.store.intent(f.company.id, f.worker.id, 'connected_apps', { write: true }, f.company.directionVersion);
    f.store.actionState(a, 'uncertain');
    expect(() => f.service.retry(director, r.id, 'a', run.revision)).toThrow('Reconcile');
  });
  it('recovers persisted step links and supersedes old direction without duplicate dispatch', () => {
    const f = fixture(),
      r = f.start([task('a', f.worker.id)]);
    f.service.prepare();
    const recreated = new CompanyWorkflows(f.org, () => ['read_file']);
    recreated.prepare();
    expect(f.cowork.missions()).toHaveLength(1);
    f.store.steer(f.company.id, 'New direction');
    recreated.prepare();
    const run = recreated.run(director, r.id);
    expect(run.state).toBe('blocked');
    expect(f.cowork.getMission(run.steps[0]!.missionId!)!.status).toBe('cancelled');
    expect(() => recreated.assertMission(run.steps[0]!.missionId!)).toThrow('permission ended');
  });
  it('deduplicates retries of a start request while allowing explicit separate runs', () => {
    const f = fixture(),
      w = f.save([task('a', f.worker.id)]);
    f.service.approve(director, w.id, 1, w.revision);
    const first = f.service.start(director, w.id, 1, { topic: 'x' }, 'request-1');
    expect(f.service.start(director, w.id, 1, { topic: 'x' }, 'request-1').id).toBe(first.id);
    expect(() => f.service.start(director, w.id, 1, { topic: 'y' }, 'request-1')).toThrow('another');
    expect(f.service.start(director, w.id, 1, { topic: 'x' }, 'request-2').id).not.toBe(first.id);
  });
  it('redacts other employee handoff content while preserving the director inspection view', () => {
    const f = fixture(),
      r = f.start([task('a', f.worker.id), task('b', f.ceo.id)]);
    f.service.prepare();
    let run = f.service.run(director, r.id);
    f.complete(run.steps[0]!.missionId!, 'Worker result');
    f.complete(run.steps[1]!.missionId!, 'Private executive result');
    f.service.prepare();
    run = f.service.run({ kind: 'agent', agentId: f.worker.id }, r.id);
    expect(run.input).toBeUndefined();
    expect(run.steps[0]!.output).toBe('Worker result');
    expect(run.steps[1]!.output).toBeUndefined();
    expect(f.service.run(director, r.id).steps[1]!.output).toBe('Private executive result');
    expect(() => f.service.cancel(director, r.id, run.revision)).toThrow('settled');
  });
  it('rechecks the originating leader’s assignment authority before continuing dispatch', () => {
    const f = fixture(),
      r = f.start([task('a', f.worker.id)]);
    f.service.prepare();
    f.org.updateMember(director, f.ceo.id, { authority: { capabilities: ['design-workflows'] } }, f.org.snapshot().revision);
    expect(() => f.service.assertMission(f.service.run(director, r.id).steps[0]!.missionId)).toThrow('authority');
    f.service.prepare();
    const run = f.service.run(director, r.id);
    expect(run.state).toBe('blocked');
    expect(f.cowork.getMission(run.steps[0]!.missionId!)!.status).toBe('cancelled');
  });
  it('archives immutable definitions without losing in-flight work or allowing new executions', () => {
    const f = fixture(),
      r = f.start([task('a', f.worker.id)]);
    f.service.prepare();
    const w = f.service.read(director, r.workflowId);
    f.service.archive(director, w.id, 1, w.revision);
    expect(() => f.service.start(director, w.id, 1, { topic: 'New' })).toThrow('Approve');
    const run = f.service.run(director, r.id);
    f.complete(run.steps[0]!.missionId!, 'Saved result');
    f.service.prepare();
    expect(f.service.run(director, r.id).state).toBe('completed');
  });
  it('deduplicates native agent start retries within a trusted job or owner message', () => {
    const f = fixture(),
      w = f.save([task('a', f.worker.id)]);
    f.service.approve(director, w.id, 1, w.revision);
    const args = { action: 'start', id: w.id, version: 1, input: { topic: 'x' } },
      first = JSON.parse(executeWorkflowTool(f.service, f.ceo.id, args, 'message-1').output);
    expect(JSON.parse(executeWorkflowTool(f.service, f.ceo.id, args, 'message-1').output).id).toBe(first.id);
    expect(JSON.parse(executeWorkflowTool(f.service, f.ceo.id, args, 'message-2').output).id).not.toBe(first.id);
  });
});
