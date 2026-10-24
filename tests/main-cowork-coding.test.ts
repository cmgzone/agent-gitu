import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import { GituServer } from '../src/server/server.js';
import { GituSessionRuntime } from '../src/coding/session-runtime.js';
import { ScriptedMockLlm } from '../src/llm/llm.js';
import { executeCoworkTool } from '../src/cowork/tools.js';
import type { Gitu } from '../src/agent/gitu.js';
import type { CompletionReport } from '../src/types.js';
import { saveRuntimeSelection, readRuntimeSelection } from '../src/workspace/runtime-selection.js';
import * as modelKeys from '../src/llm/keys.js';

const oldHome = process.env.AGENT_GITU_HOME;
const homes: string[] = [],
  servers: GituServer[] = [];
afterEach(async () => {
  for (const server of servers.splice(0)) {
    await server.stop();
    await vi.waitFor(() => expect((server as any).checkpointOperations?.size ?? 0).toBe(0), { timeout: 5000 });
  }
  vi.restoreAllMocks();
  for (const home of homes.splice(0)) rmSync(home, { recursive: true, force: true });
  if (oldHome === undefined) delete process.env.AGENT_GITU_HOME;
  else process.env.AGENT_GITU_HOME = oldHome;
});

it('uses a newly selected model and named project in the real handoff rather than auto-detecting a keyed provider', async () => {
  const f = await fixture();
  vi.spyOn(modelKeys, 'mergedEnv').mockReturnValue({ OPENAI_API_KEY: 'fixture' });
  mkdirSync(path.join(f.root, 'pikiwebsite'));
  writeFileSync(path.join(f.root, 'pikiwebsite', 'package.json'), '{}');
  expect((await f.call('/api/model-selection', { provider: 'openai', model: 'older-choice' })).status).toBe(200);
  expect((await f.call('/api/model-selection', { provider: 'openai', model: 'new-choice' })).status).toBe(200);
  let captured: any;
  f.internals.gituRuntime = new GituSessionRuntime({
    createEngine: (request) => {
      captured = request;
      return { run: async () => ({ ledger: { data: { taskId: report.taskId } }, report }), stop() {}, queueMessage() {} } as unknown as Gitu;
    },
  });
  expect((await f.delegation.run(f.scope, { goal: 'Improve the pikiwebsite homepage' })).ok).toBe(true);
  expect(captured.provider).toBe('openai');
  expect(captured.model).toBe('new-choice');
  expect(captured.workspace.path).toBe(path.join(f.root, 'pikiwebsite'));
  const task = (await f.call('/api/runs')).data[0];
  expect(task.provider).toBe('openai');
  expect(task.model).toBe('new-choice');
});
async function fixture(host = true, routineApprovals = false) {
  const home = mkdtempSync(path.join(os.tmpdir(), 'main-coding-'));
  homes.push(home);
  process.env.AGENT_GITU_HOME = home;
  const root = path.join(home, 'Workspace');
  mkdirSync(root);
  writeFileSync(path.join(root, 'package.json'), '{"name":"fixture","private":true}');
  const server = new GituServer({ cwd: root, port: 0, passwordRequired: false, llm: new ScriptedMockLlm([]), chiefOfStaff: routineApprovals ? { advisor: false } : false });
  servers.push(server);
  const base = 'http://127.0.0.1:' + (await server.start());
  const call = async (route: string, body?: unknown) => {
    const res = await fetch(base + route, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: res.status, data: (await res.json()) as any };
  };
  const agent = (await call('/api/cowork/agents', { name: 'Scripter', systemPrompt: 'Coordinate coding.', allowWrites: true, allowShell: true, useHostComputer: host })).data.agent;
  const conv = (await call('/api/cowork/conversations', { kind: 'dm', memberIds: [agent.id] })).data.conversation;
  const internals = server as any,
    store = internals.cowork();
  if (!host) vi.spyOn(internals, 'codingCheckpoint').mockResolvedValue({ checkpoint: { id: 'cp_fixture' } });
  return { server, internals, root, home, call, agent, conv, scope: { agent, store, conversationId: conv.id }, delegation: internals.delegation() };
}
const report: CompletionReport = {
  taskId: 'fixture_task',
  goal: 'Fix parser',
  status: 'complete',
  summary: 'Parser fixed.',
  changes: [],
  filesChanged: ['parser.ts'],
  verification: ['Parser assertions passed'],
  evidence: [],
  remainingRisks: [],
  followUps: [],
  generatedAt: new Date().toISOString(),
};

it('streams coding status to an idle P.A chat and excludes other conversations and companies', async () => {
  const f = await fixture(false);
  f.internals.dispatchAgentWake = () => false;
  let finish: ((result: { ok: boolean; output: string }) => void) | undefined;
  const work = f.delegation.run({ ...f.scope, subAgents: { run: async () => new Promise<{ ok: boolean; output: string }>(resolve => { finish = resolve; }) } }, { goal: 'Improve the mobile layout' });
  const controller = new AbortController();
  let feed: Promise<void> | undefined;
  try {
    await vi.waitFor(() => expect(finish).toBeTypeOf('function'));
    const task = [...f.internals.sessions.values()][0] as any;
    const ownId = task.runId;
    f.internals.sessions.set('foreign-company', { ...task, runId: 'foreign-company', coworkTask: { ...task.coworkTask, companyId: 'other-company' } });
    f.internals.sessions.set('foreign-chat', { ...task, runId: 'foreign-chat', coworkTask: { ...task.coworkTask, conversationId: 'other-chat' } });
    const view = (await f.call('/api/cowork/conversations/' + f.conv.id + '/messages')).data;
    expect(view.busy).toBe(false);
    expect(view.codingTasks.map((entry: any) => entry.runId)).toEqual([ownId]);
    f.internals.sessions.delete('foreign-company');
    f.internals.sessions.delete('foreign-chat');
    const address = f.internals.server.address();
    const response = await fetch('http://127.0.0.1:' + address.port + '/api/cowork/conversations/' + f.conv.id + '/stream', { signal: controller.signal });
    const seen: any[] = [];
    feed = (async () => {
      let pending = '';
      for await (const chunk of response.body!) {
        pending += new TextDecoder().decode(chunk);
        let end: number;
        while ((end = pending.indexOf('\n\n')) >= 0) {
          const frame = pending.slice(0, end); pending = pending.slice(end + 2);
          if (frame.startsWith('data: ')) seen.push(JSON.parse(frame.slice(6)));
        }
      }
    })().catch(error => { if (!controller.signal.aborted) throw error; });
    await vi.waitFor(() => expect(seen.at(-1)?.codingTasks[0]?.status).toBe('running'));
    finish!({ ok: true, output: 'The mobile layout is updated and verified.' });
    await work;
    await vi.waitFor(() => expect(seen.at(-1)?.codingTasks[0]?.status).toBe('completed'));
    expect(seen.at(-1).busy).toBe(false);
  } finally {
    f.internals.sessions.delete('foreign-company');
    f.internals.sessions.delete('foreign-chat');
    finish?.({ ok: false, output: 'Fixture cleanup' });
    await work;
    controller.abort();
    await feed;
  }
});

it('persists owner coding access and applies it to P.A approvals and plan reviews without cards', async () => {
  const f = await fixture();
  expect((await f.call('/api/coding-permissions')).data).toEqual({ access: 'ask', configured: false });
  expect((await f.call('/api/coding-permissions', { access: 'invalid' })).status).toBe(400);
  expect((await f.call('/api/coding-permissions', { access: 'full' })).data).toEqual({ access: 'full', configured: true });
  let captured: any;
  f.internals.gituRuntime = new GituSessionRuntime({ createEngine: (request, options, sinks) => {
    captured = { request, options };
    return { run: async () => {
      expect(await sinks.approvalHandler({ tool: 'run_command', tier: 'dangerous', why: 'Unrecognized PowerShell command', summary: 'Run project check' })).toBe(true);
      expect(await sinks.planReviewHandler({ criteria: [], steps: [] })).toMatchObject({ approved: true });
      expect(await sinks.approvalHandler({ tool: 'connection_operation', tier: 'dangerous', why: 'Registered write operation', summary: 'Fixture operation' })).toBe(true);
      return { ledger: { data: { taskId: report.taskId } }, report };
    }, stop() {}, queueMessage() {} } as unknown as Gitu;
  } });
  expect((await f.delegation.run(f.scope, { goal: 'Fix parser' })).ok).toBe(true);
  expect(captured.options.autoApprove).toBe(true);
  expect(captured.options.deploymentAllowed()).toBe(false);
  const task = [...f.internals.sessions.values()][0];
  f.internals.recordOwnerDeployment(task, 'Deploy this project to Coolify');
  expect(captured.options.deploymentAllowed()).toBe(true);
  f.internals.recordOwnerDeployment(task, 'Do not deploy; let P.A handle deployment');
  expect(captured.options.deploymentAllowed()).toBe(false);
  expect(f.scope.store.requests(f.conv.id)).toHaveLength(0);
  expect(readFileSync(path.join(f.home, 'Settings', 'settings.json'), 'utf8')).toContain('"codingAccess": "full"');
  await f.call('/api/coding-permissions', { access: 'ask' });
  expect(captured.request.autoApprove()).toBe(false);
});

it('remembers write capabilities and lets a personal P.A edit and execute a saved deployment operation', async () => {
  const f = await fixture();
  await f.call('/api/coding-permissions', { access: 'full' });
  const connected = await f.call('/api/connections', { label: 'Coolify', provider: 'coolify', baseUrl: 'https://coolify.example.test', token: 'fixture-secret', capabilities: ['servers.read'], operations: [{ id: 'validate', label: 'Validate', capability: 'servers.read', method: 'GET', path: '/api/v1/servers', risk: 'read' }] });
  expect(connected.status).toBe(200);
  expect(connected.data.connection.capabilities).toContain('deployments.write');
  expect(connected.data.connection.operations).toContainEqual(expect.objectContaining({ id: 'deploy-application', method: 'POST' }));
  const ctx = f.internals.coworkToolContext(f.agent), perms = { allowShell: true, allowWrites: true, allowConfig: true, chief: true, browser: false };
  expect((await executeCoworkTool(ctx, 'update_connection', { connectionId: 'coolify', label: 'Production', discoverCapabilities: true }, perms, f.scope as any)).ok).toBe(true);
  const invoke = vi.spyOn(f.internals.connections, 'invoke').mockResolvedValue({ data: { deployment: 'fixture' }, message: 'Accepted' });
  expect((await executeCoworkTool(ctx, 'connection_execute', { connectionId: 'coolify', operationId: 'deploy-application', body: { uuid: 'fixture' } }, perms, f.scope as any)).ok).toBe(true);
  expect(invoke).toHaveBeenCalledOnce();
  expect(f.scope.store.requests(f.conv.id)).toHaveLength(0);
  expect((await executeCoworkTool(ctx, 'update_connection', { connectionId: 'coolify', token: 'forbidden' }, perms, f.scope as any)).ok).toBe(false);
});

it('keeps checkpoint startup failures failed, notifies the teammate once, and permits a real repair', async () => {
  const f = await fixture();
  const createEngine = vi.fn(() => ({ run: async () => ({ ledger: { data: { taskId: report.taskId } }, report }), stop() {}, queueMessage() {} } as unknown as Gitu));
  f.internals.gituRuntime = new GituSessionRuntime({ createEngine });
  f.internals.coworkRuns.set(f.conv.id, { busy: true, abort: new AbortController(), queue: [] });
  const checkpoint = vi.spyOn(f.internals, 'codingCheckpoint').mockRejectedValueOnce(new Error('Checkpoint could not read "source.ts": EBUSY'));
  const accepted = await f.delegation.start(f.scope, { goal: 'Fix parser' });
  const handle = JSON.parse(accepted.output);
  await vi.waitFor(() => expect(f.internals.sessions.get(handle.runId)?.runtime).toBeUndefined());
  const task = (await f.call('/api/runs/' + handle.runId)).data;
  expect(task.status).toBe('failed');
  expect(task.error).toContain('source.ts');
  expect(task.finishedAt).toBeTruthy();
  expect(createEngine).not.toHaveBeenCalled();
  const outcomes = () => f.scope.store.messages(f.conv.id).filter((m: any) => m.text.startsWith('Result from Main Agent Gitu task ' + handle.runId));
  expect(outcomes()).toHaveLength(1);
  expect(outcomes()[0].text).toContain('(failed)');
  expect(outcomes()[0].text).toContain('Diagnose the recorded error');
  f.internals.notifyCodingOutcome(handle.runId);
  f.internals.notifyCodingOutcome(handle.runId);
  expect(outcomes()).toHaveLength(1);
  expect(f.scope.store.inboxFor(f.agent.id)).toHaveLength(1);
  checkpoint.mockRestore();
  const repaired = await f.delegation.start(f.scope, { retryOf: handle.runId, goal: 'The source file is unlocked; retry the verified task.' });
  expect(repaired.ok, repaired.output).toBe(true);
  const repairId = JSON.parse(repaired.output).runId;
  await vi.waitFor(() => expect(f.internals.sessions.get(repairId)?.status).toBe('completed'));
  expect(createEngine).toHaveBeenCalledOnce();
  expect(outcomes()).toHaveLength(1);
  expect(f.scope.store.messages(f.conv.id).some((m: any) => m.text.includes('(' + 'running):'))).toBe(false);
});

it('lets the teammate approve routine coding gates automatically and records the approval in Cowork',async()=>{
  const f=await fixture(true,true);
  let approved=false;
  f.internals.gituRuntime=new GituSessionRuntime({createEngine:(_request,_options,sinks)=>({
    run:async()=>{approved=await sinks.approvalHandler({tool:'run_command',tier:'dangerous',why:'Run project tests',summary:JSON.stringify({command:'npm test'})});return{ledger:{data:{taskId:report.taskId}},report};},stop(){},queueMessage(){}
  }) as unknown as Gitu});
  expect((await f.delegation.run(f.scope,{goal:'Fix and verify parser'})).ok).toBe(true);
  expect(approved).toBe(true);
  expect(f.scope.store.requests(f.conv.id)).toContainEqual(expect.objectContaining({status:'approved',response:expect.stringContaining('Approved automatically by Scripter')}));
});

it('uses the same approval gate from Cowork on a direct coding continuation',async()=>{
  const f=await fixture();
  const task={runId:'continuation-fixture',coworkTask:{agentId:f.agent.id,agentName:f.agent.name,conversationId:f.conv.id,execution:'host'},runtime:{approve:vi.fn(),approvePlan:vi.fn(),answerQuestions:vi.fn()}};
  f.internals.sessions.set(task.runId,task);
  f.internals.mirrorCodingFollowupGate(task,'approval','approval-fixture','Run project tests');
  const card=f.scope.store.requests(f.conv.id)[0];
  expect(f.internals.resolveDelegationCard(card,'answer','Approve')).toMatchObject({ok:true,status:'approved'});
  expect(task.runtime.approve).toHaveBeenCalledWith('approval-fixture',true);
  expect(f.scope.store.getRequest(card.id)?.status).toBe('approved');
  f.internals.sessions.delete(task.runId);
});

it('returns a background handle immediately, reports failures while the teammate is busy, and bounds repair attempts',async()=>{
  const f=await fixture(false);
  let finish!: (result:{ok:boolean;output:string})=>void;
  vi.spyOn(f.internals,'codingWorkerBridge').mockReturnValue({run:()=>new Promise(resolve=>{finish=resolve;})});
  const scope={...f.scope,delegation:f.delegation};
  const result=await executeCoworkTool(f.internals.coworkToolContext(f.agent),'gitu_task',{goal:'Fix parser'}, {allowShell:true,allowWrites:true,allowConfig:false,chief:true,browser:false},scope as any);
  expect(result.ok).toBe(true);
  const handle=JSON.parse(result.output);expect(handle.status).toBe('running');
  await vi.waitFor(()=>expect(finish).toBeTypeOf('function'));
  // Another Cowork turn can be active when the coding task reports its failure.
  const active={busy:true,abort:new AbortController(),queue:[]};f.internals.coworkRuns.set(f.conv.id,active);
  finish({ok:false,output:'Parser import missing'});
  await vi.waitFor(()=>expect(f.scope.store.messages(f.conv.id).some((m:any)=>m.text.includes('Diagnose the recorded error'))).toBe(true));
  expect(f.scope.store.inboxFor(f.agent.id)).toHaveLength(1);
  expect((active as any).live).toBeDefined();
  const task=f.internals.sessions.get(handle.runId);expect(task.status).toBe('blocked');
  const recovery=await f.delegation.start(f.scope,{retryOf:task.runId,goal:'Repair the missing parser import'});
  expect(recovery.ok).toBe(true);const repaired=JSON.parse(recovery.output);expect(repaired.recoveryAttempt).toBe(1);
  const duplicate=await f.delegation.start(f.scope,{retryOf:task.runId,goal:'Repair again'});
  expect(JSON.parse(duplicate.output).runId).toBe(repaired.runId);
  const wrong=await f.delegation.start({...f.scope,conversationId:'another-chat'},{retryOf:task.runId,goal:'Repair'});expect(wrong.ok).toBe(false);
  const repairTask=f.internals.sessions.get(repaired.runId);
  await vi.waitFor(()=>expect(repairTask.runtime).toBeDefined());
  // A repeated identical failure needs the owner rather than another repair loop.
  repairTask.status='failed';repairTask.error='Parser import missing';
  f.internals.notifyCodingOutcome(repairTask.runId);
  expect(f.scope.store.requests(f.conv.id)).toContainEqual(expect.objectContaining({title:'Coding needs your help',status:'open'}));
  expect((await f.delegation.start(f.scope,{retryOf:repairTask.runId,goal:'Repeat repair'})).ok).toBe(false);
  task.status='aborted';expect((await f.delegation.start(f.scope,{retryOf:task.runId,goal:'Resume'})).ok).toBe(false);
  finish({ok:false,output:'Parser import missing'});
});

it('publishes the real main coding runtime, shares approvals, returns results to Cowork, and restores attribution', async () => {
  const f = await fixture();
  writeFileSync(path.join(f.root, 'parser.ts'), 'existing user code');
  f.internals.gituRuntime = new GituSessionRuntime({
    createEngine: (_request, _options, sinks) =>
      ({
        run: async () => {
          writeFileSync(path.join(f.root, 'parser.ts'), 'task implementation');
          const allowed = await sinks.approvalHandler({ tool: 'run_command', tier: 'dangerous', why: 'Fixture approval', summary: 'Run the parser check' });
          if (!allowed) throw Error('Denied');
          sinks.onEvent('file updated parser.ts');
          return { ledger: { data: { taskId: report.taskId } }, report };
        },
        stop() {},
        queueMessage() {},
      }) as unknown as Gitu,
  });
  const work = f.delegation.run(f.scope, { goal: report.goal, mode: 'fast' });
  await vi.waitFor(async () => expect((await f.call('/api/runs')).data[0]?.pendingApprovals.length).toBe(1));
  const running = (await f.call('/api/runs')).data[0];
  expect(running.coworkTask).toMatchObject({ agentId: f.agent.id, conversationId: f.conv.id, execution: 'host' });
  expect(running.projectPath).toBe(f.root);
  const activity = (await f.call('/api/cowork/conversations/' + f.conv.id + '/messages')).data;
  expect(activity.codingTasks).toEqual([expect.objectContaining({ runId: running.runId, goal: report.goal, status: 'running', needsAttention: true })]);
  expect(activity.codingTasks[0]).not.toHaveProperty('projectPath');
  const checkpointRoute = '/api/runs/' + running.runId + '/checkpoints';
  const saved = (await f.call(checkpointRoute)).data.checkpoints[0];
  expect((await f.call(checkpointRoute + '/' + saved.id + '/restore', {})).status).toBe(409);
  expect(f.scope.store.messages(f.conv.id).some((m: any) => m.text.includes('#run=' + running.runId))).toBe(true);
  expect((await f.call('/api/approvals/' + running.pendingApprovals[0].id, { approved: true })).status).toBe(200);
  expect((await work).output).toContain('Parser fixed.');
  const done = (await f.call('/api/runs/' + running.runId)).data;
  expect(done.status).toBe('completed');
  expect(done.report.verification).toEqual(report.verification);
  expect(done.pendingApprovals).toEqual([]);
  expect((await f.call('/api/cowork/conversations/' + f.conv.id + '/messages')).data.codingTasks[0]).toMatchObject({ runId: running.runId, status: 'completed', needsAttention: false });
  expect((await f.call(checkpointRoute)).data.checkpoints[0].changedFiles).toBe(1);
  expect((await f.call(checkpointRoute + '/' + saved.id + '/restore', {})).status).toBe(200);
  expect(readFileSync(path.join(f.root, 'parser.ts'), 'utf8')).toBe('existing user code');
  expect((await f.call('/api/runs/' + running.runId)).data.status).toBe('blocked');
  const requests = f.scope.store.requests(f.conv.id);
  expect(requests.every((r: any) => r.status !== 'open')).toBe(true);
  expect(requests.some((r:any)=>r.status==='approved'&&r.response==='Approved in coding chat.')).toBe(true);
  await f.server.stop();
  servers.splice(servers.indexOf(f.server), 1);
  const restored = new GituServer({ cwd: f.root, port: 0, passwordRequired: false, llm: new ScriptedMockLlm([]) });
  servers.push(restored);
  const rows = (await (await fetch('http://127.0.0.1:' + (await restored.start()) + '/api/runs')).json()) as any[];
  expect(rows[0].coworkTask).toEqual(done.coworkTask);
  expect(rows[0].status).toBe('blocked');
});

it('keeps private coding off the host and propagates Stop to the actual worker', async () => {
  const f = await fixture(false);
  let workerSignal: AbortSignal | undefined;
  const run = vi.fn(async (_params: unknown, signal: AbortSignal) => {
    workerSignal = signal;
    await new Promise<void>((resolve) => signal.addEventListener('abort', () => resolve(), { once: true }));
    return { ok: false, output: 'Cancelled private work' };
  });
  const work = f.delegation.run({ ...f.scope, subAgents: { run } }, { goal: 'Fix private repository' });
  await vi.waitFor(() => expect(run).toHaveBeenCalledOnce());
  const task = (await f.call('/api/runs')).data[0];
  expect(task.coworkTask.execution).toBe('private');
  expect(task.projectPath).toBeUndefined();
  expect((await f.call('/api/runs/' + task.runId + '/stop', {})).status).toBe(200);
  expect(workerSignal!.aborted).toBe(true);
  expect((await work).ok).toBe(false);
  expect((await f.call('/api/runs/' + task.runId)).data.status).toBe('aborted');
  const dispatch=vi.spyOn(f.internals,'dispatchCoworkMessage');
  vi.spyOn(f.internals,'codingWorkerBridge').mockReturnValue({run:async()=>({ok:true,output:'Verified direct continuation.'})});
  const forwarded=await f.call('/api/runs/' + task.runId + '/message', { text: 'Continue' });
  expect(forwarded.status).toBe(202);
  expect(forwarded.data.directToCoding).toBe(true);
  expect(dispatch).not.toHaveBeenCalled();
  expect(f.scope.store.messages(f.conv.id).some((m:any)=>m.text.includes('Owner messaged Main Agent Gitu directly'))).toBe(true);
});

it('requires main-agent handoff for code edits and developer commands while allowing document writes', async () => {
  const f = await fixture();
  const scope = { ...f.scope, delegation: f.delegation } as any;
  const permissions = { allowShell: true, allowWrites: true, allowConfig: false, chief: false, browser: false };
  for (const [tool, params] of [
    ['write_file', { path: 'src/a.ts', content: 'code' }],
    ['run_command', { command: 'npm test' }],
  ] as const) {
    const result = await executeCoworkTool({} as any, tool, params, permissions, scope);
    expect(result.ok).toBe(false);
    expect(result.output).toContain('gitu_task');
  }
  const outside = await f.delegation.run(f.scope, { goal: 'Wrong project', projectPath: os.tmpdir() });
  expect(outside.ok).toBe(false);
  expect(outside.output).toContain('Choose this workspace');
  const document = await executeCoworkTool(f.internals.coworkToolContext(f.agent), 'write_file', { path: 'brief.md', content: 'A non-coding project brief.' }, permissions, scope);
  expect(document.ok).toBe(true);
});

it('keeps company host handoffs inside the company tool and connection scope', async () => {
  const f = await fixture();
  const company = (await f.call('/api/companies', { name: 'Scoped company', purpose: 'Implement a project', monthlyBudgetUsd: null, maxFileBytes: null })).data.company;
  const agent = (await f.call('/api/companies/' + company.id + '/lead', { name: 'Company lead' })).data.agent;
  const companies = f.internals.companies();
  const run = vi.fn(async () => ({ ok: true, output: 'Verified scoped company coding result.' }));
  const unrestricted = vi.spyOn(f.internals, 'createDelegatedSession');
  const work = f.internals.companyScope.run({ id: company.id, version: company.directionVersion }, async () => {
    const store = f.internals.cowork();
    store.saveAgent({ ...store.getAgent(agent.id), useHostComputer: true });
    const current = store.getAgent(agent.id);
    const conversation = store.listConversations()[0];
    return f.internals.delegation().run({ agent: current, store, conversationId: conversation.id, subAgents: { run } }, { goal: 'Implement company code' });
  });
  expect((await work).ok).toBe(true);
  expect(run).toHaveBeenCalledOnce();
  expect(unrestricted).not.toHaveBeenCalled();
  const task = (await f.call('/api/runs')).data[0];
  expect(task.coworkTask.companyId).toBe(company.id);
  expect(task.projectPath.startsWith(companies.workspace(company.id))).toBe(true);
  vi.spyOn(f.internals,'ensureCompanyCoordinator').mockImplementation(()=>{});
  expect((await f.call('/api/runs/'+task.runId+'/message',{text:'Continue the company implementation'})).status).toBe(400);
  companies.transition(company.id,'running');
  vi.spyOn(f.internals,'codingWorkerBridge').mockReturnValue({run:async()=>({ok:true,output:'Verified direct continuation.'})});
  const follow=await f.call('/api/runs/'+task.runId+'/message',{id:'company-code-follow',text:'Continue the company implementation'});
  expect(follow.status).toBe(202);
  expect(follow.data.directToCoding).toBe(true);
  expect(f.scope.store.listConversations().flatMap((conv:any)=>f.scope.store.messages(conv.id)).some((message:any)=>message.id==='company-code-follow')).toBe(false);
});

it('delivers direct coding follow-ups with attachments while keeping the teammate informed and deduplicating retries',async()=>{
  const f=await fixture();
  f.internals.gituRuntime=new GituSessionRuntime({createEngine:()=>({run:async()=>({ledger:{data:{taskId:report.taskId}},report}),stop(){},queueMessage(){}})as unknown as Gitu});
  await f.delegation.run(f.scope,{goal:'Implement the project change'});
  const task=(await f.call('/api/runs')).data[0];
  f.internals.sessions.get(task.runId).taskId=undefined;
  const dispatch=vi.spyOn(f.internals,'dispatchCoworkMessage');
  const coding=vi.spyOn(f.internals,'executeRun').mockImplementation(async(session:any)=>{session.status='completed';});
  const body={id:'owner-code-followup',text:'Fix the remaining mobile spacing',files:[{name:'brief.txt',dataUrl:'data:text/plain;base64,'+Buffer.from('Acceptance criteria').toString('base64')}]};
  const response=await f.call('/api/runs/'+task.runId+'/message',body);
  expect(response.status).toBe(200);expect(response.data).toMatchObject({ok:true,directToCoding:true,runId:task.runId});
  const message=f.scope.store.getMessage(f.conv.id,body.id)!;
  expect(message.text).toContain(body.text);expect(message.text).toContain('Do not delegate or execute it again');
  expect(message.mentionedAgentIds).toEqual([f.agent.id]);
  expect((await f.call('/api/runs/'+task.runId)).data.files.some((file:any)=>file.name==='brief.txt')).toBe(true);
  expect((await f.call('/api/runs/'+task.runId+'/message',body)).status).toBe(200);expect(dispatch).not.toHaveBeenCalled();expect(coding).toHaveBeenCalledOnce();
  expect((await f.call('/api/runs/'+task.runId)).data.status).toBe('completed');
  expect((await f.call('/api/runs/'+task.runId+'/message',{text:''})).status).toBe(400);
});

it('lets a chief manage safe app settings and queue internal messages without granting ordinary teammates that control', async () => {
  const f = await fixture();
  const chief = (await f.call('/api/cowork/agents', { name: 'Chief', systemPrompt: 'Coordinate.', chiefOfStaff: true })).data.agent;
  const scope = { agent: chief, store: f.scope.store, conversationId: f.conv.id } as any,
    perms = { allowShell: false, allowWrites: false, allowConfig: false, chief: true, browser: false };
  const context = f.internals.coworkToolContext(chief);
  const settings = await executeCoworkTool(context, 'app_manage', { action: 'set_settings', input: { theme: 'dark', autonomy: { persistent: true } } }, perms, scope);
  expect(settings.ok).toBe(true);
  expect((await executeCoworkTool(context, 'app_manage', { action: 'set_settings', input: { passwordRequired: false } }, perms, scope)).ok).toBe(false);
  const sent = await executeCoworkTool(
    context,
    'app_manage',
    { action: 'send_message', conversationId: f.conv.id, agentId: f.agent.id, text: 'Review the website brief.' },
    perms,
    scope,
  );
  expect(sent.ok).toBe(true);
  expect(JSON.parse(sent.output).queued).toBe(true);
  expect(f.scope.store.inboxFor(f.agent.id).some((message: any) => message.fromAgentId === chief.id && message.text === 'Review the website brief.')).toBe(true);
  expect((await executeCoworkTool(context, 'app_manage', { action: 'read_settings' }, { ...perms, chief: false }, { ...scope, agent: f.agent })).ok).toBe(false);
  saveRuntimeSelection({ provider: 'chatgpt', model: 'gpt-5.6-luna' });
  expect((await f.call('/api/model-selection')).data.model).toBe('gpt-5.6-luna');
  expect(readRuntimeSelection().provider).toBe('chatgpt');
  const listed = await executeCoworkTool(context, 'app_manage', { action: 'list_agents' }, perms, scope);
  expect(JSON.parse(listed.output).some((agent: any) => agent.id === f.agent.id)).toBe(true);
  const removed = await executeCoworkTool(context, 'app_manage', { action: 'delete_agent', agentId: f.agent.id }, perms, scope);
  expect(removed.ok, removed.output).toBe(true);
  expect(f.scope.store.getAgent(f.agent.id)).toBeUndefined();
  expect((await executeCoworkTool(context, 'app_manage', { action: 'delete_agent', agentId: chief.id }, perms, scope)).ok).toBe(false);
  const company = (await f.call('/api/companies', { name: 'Disposable company', purpose: 'Deletion test', monthlyBudgetUsd: null, maxFileBytes: null })).data.company;
  const deleted = await executeCoworkTool(context, 'app_manage', { action: 'delete_company', companyId: company.id }, perms, scope);
  expect(deleted.ok, deleted.output).toBe(true);
  expect(f.internals.companies().get(company.id)).toBeUndefined();
});
