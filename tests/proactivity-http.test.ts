import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import { GituServer } from '../src/server/server.js';
import { ScriptedMockLlm } from '../src/llm/llm.js';
import { ProjectGuard } from '../src/guard/project-guard.js';
import { mainRepositories } from '../src/cowork/main-repositories.js';
import { Proactivity } from '../src/cowork/proactivity.js';
const previous = process.env.AGENT_GITU_HOME,
  roots: string[] = [],
  servers: GituServer[] = [];
afterEach(async () => {
  for (const server of servers.splice(0)) await server.stop();
  vi.restoreAllMocks();
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true, maxRetries: 8, retryDelay: 100 });
  if (previous === undefined) delete process.env.AGENT_GITU_HOME;
  else process.env.AGENT_GITU_HOME = previous;
});
async function fixture() {
  const home = mkdtempSync(path.join(os.tmpdir(), 'proactive-http-'));
  roots.push(home);
  process.env.AGENT_GITU_HOME = home;
  const cwd = path.join(home, 'Workspace');
  mkdirSync(cwd);
  const server = new GituServer({ cwd, port: 0, passwordRequired: false, llm: new ScriptedMockLlm([]), coworkCompletionProtocol: 'legacy' });
  servers.push(server);
  const origin = 'http://127.0.0.1:' + (await server.start());
  const api = async (route: string, body?: unknown) => {
    const response = await fetch(origin + route, { method: body ? 'POST' : 'GET', headers: { 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
    return { status: response.status, data: (await response.json()) as any };
  };
  return { server, internal: server as any, api, home };
}
it('onboards with one default proactive chief, exposes settings and health, and preserves user changes on restart', async () => {
  const f = await fixture();
  expect((await f.api('/api/onboarding', { theme: 'light', mode: 'cowork', model: '' })).status).toBe(200);
  const view = (await f.api('/api/cowork/proactivity')).data;
  expect(view.assistantId).toBeDefined();
  const assistant = f.internal.cowork().getAgent(view.assistantId);
  expect(assistant).toMatchObject({ name: 'P.A', chiefOfStaff: true, personality: { proactivity: 'proactive' } });
  expect((await f.api('/api/cowork/proactivity', { enabled: false, timezone: 'Africa/Nairobi', dailyModelCalls: 2 })).data.settings).toMatchObject({
    enabled: false,
    dailyModelCalls: 2,
  });
  expect((await f.api('/api/cowork/proactivity', { dailyCostUsd: -1 })).status).toBe(400);
  await f.server.stop();
  servers.splice(servers.indexOf(f.server), 1);
  const restarted = new GituServer({ cwd: path.join(f.home, 'Workspace'), port: 0, passwordRequired: false, llm: new ScriptedMockLlm([]) });
  servers.push(restarted);
  await restarted.start();
  const internal = restarted as any;
  expect(internal.proactivity().settings().enabled).toBe(false);
  expect(
    internal
      .cowork()
      .listAgents()
      .filter((agent: any) => agent.name === 'P.A'),
  ).toHaveLength(1);
});
it('keeps reminders pending until work succeeds, persists a failure and retries without duplicate admission', async () => {
  const f = await fixture(),
    store = f.internal.cowork(),
    agent = store.saveAgent({ name: 'Planner', systemPrompt: 'Help.' }),
    conversation = store.saveConversation({ kind: 'dm', memberIds: [agent.id] });
  let clock = Date.now();
  f.internal.personalProactivity = new Proactivity(path.join(f.home, 'Settings', 'proactivity.json'), () => clock);
  const follow = store.addFollowUp({ agentId: agent.id, conversationId: conversation.id, note: 'Verify delivery', dueAt: new Date(clock - 1000).toISOString() });
  const execution = vi.spyOn(f.internal, 'executeCoworkTurn').mockRejectedValueOnce(Error('Temporary connection failure')).mockResolvedValue(undefined);
  f.internal.coworkAutonomyTick();
  expect(store.listFollowUps()).toHaveLength(1);
  await vi.waitFor(() => expect(f.internal.proactivity().status().jobs[0].status).toBe('queued'));
  expect(store.listFollowUps()[0].id).toBe(follow.id);
  expect(execution).toHaveBeenCalledOnce();
  clock += 60001;
  f.internal.coworkAutonomyTick();
  await vi.waitFor(() => expect(store.listFollowUps()).toHaveLength(0));
  expect(execution).toHaveBeenCalledTimes(2);
  expect(f.internal.proactivity().status().jobs).toHaveLength(1);
  expect(f.internal.proactivity().status().jobs[0].status).toBe('succeeded');
});
it('surfaces real decisions with a next step and remains quiet on unchanged ticks or when paused', async () => {
  const f = await fixture();
  await f.api('/api/onboarding', { theme: 'light', mode: 'cowork', model: '' });
  await f.api('/api/cowork/proactivity', { quietStart: 0, quietEnd: 0, morningHour: 0, eveningHour: 23 });
  const ledger = f.internal.proactivity(),
    status = ledger.status(),
    store = f.internal.cowork();
  store.addRequest({
    conversationId: status.conversationId,
    agentId: status.assistantId,
    kind: 'question',
    title: 'Choose a launch date',
    detail: 'A real pending decision',
    options: ['Today', 'Tomorrow'],
  });
  f.internal.personalAssistantTick();
  const first = store.messages(status.conversationId).length;
  expect(store.messages(status.conversationId).at(-1).text).toContain('Choose a launch date needs your decision');
  expect(store.messages(status.conversationId).at(-1).text).toContain('Next:');
  f.internal.personalAssistantTick();
  expect(store.messages(status.conversationId)).toHaveLength(first);
  await f.api('/api/cowork/proactivity', { enabled: false });
  store.addRequest({ conversationId: status.conversationId, agentId: status.assistantId, kind: 'question', title: 'Another decision', detail: 'Pending', options: [] });
  f.internal.personalAssistantTick();
  expect(store.messages(status.conversationId)).toHaveLength(first);
});

it('lets P.A inspect known locked repositories without granting outside reads or writes',async()=>{const f=await fixture();await f.api('/api/onboarding',{theme:'light',mode:'cowork',model:''});const store=f.internal.cowork(),state=f.internal.proactivity().status(),pa=store.getAgent(state.assistantId),root=path.join(f.home,'second'),unknown=path.join(f.home,'unknown'),company=path.join(f.home,'company');for(const folder of [root,unknown,company]){mkdirSync(folder);writeFileSync(path.join(folder,'package.json'),'{}');writeFileSync(path.join(folder,'code.ts'),'export const value=42;');}ProjectGuard.detect(root).persist();ProjectGuard.detect(company).persist();expect(mainRepositories([root,unknown,company],[],[company]).map(r=>r.path)).toEqual([root]);f.internal.sessions.set('known-repo',{runId:'known-repo',projectPath:root,status:'completed',goal:'Previous coding task'});const ctx=f.internal.coworkToolContext(pa);expect(()=>ctx.guard.assertReadable(path.join(root,'code.ts'))).not.toThrow();expect(()=>ctx.guard.assertReadable(path.join(unknown,'code.ts'))).toThrow('requires approval');expect(()=>ctx.guard.assertInside(path.join(root,'code.ts'))).toThrow();store.saveAgent({...pa,useHostComputer:false});expect(()=>ctx.guard.assertReadable(path.join(root,'code.ts'))).toThrow('requires approval');expect(()=>ctx.guard.assertReadable(path.join(root,'.hermes','project-lock.json'))).toThrow();f.internal.sessions.delete('known-repo');});
it('automatically queues coding reviews once, requires real code and UI evidence and honours pause',async()=>{const f=await fixture();await f.api('/api/onboarding',{theme:'light',mode:'cowork',model:''});await f.api('/api/cowork/proactivity',{quietStart:0,quietEnd:0});const store=f.internal.cowork(),ledger=f.internal.proactivity(),state=ledger.status(),actor={agentId:state.assistantId,conversationId:state.conversationId};const task={runId:'ui-review',status:'completed',goal:'Fix mobile UI layout',startedAt:new Date().toISOString(),finishedAt:new Date().toISOString(),events:[],projectPath:path.join(f.home,'Workspace')};f.internal.sessions.set(task.runId,task);f.internal.personalAssistantTick();f.internal.personalAssistantTick();expect(ledger.status().jobs.filter(j=>j.kind==='coding_review')).toHaveLength(1);const params={action:'record_coding_review',runId:task.runId,reviewStatus:'passed',text:'Verified',evidence:['UI renders']};expect((await f.internal.manageApp(params,actor)).ok).toBe(false);store.recordWork({...actor,tool:'read_file',ok:true,output:'src/form.tsx'});expect((await f.internal.manageApp(params,actor)).output).toContain('UI evidence');store.recordWork({...actor,tool:'browse',ok:true,output:'screenshot image/png: local preview verified'});expect((await f.internal.manageApp(params,actor)).ok).toBe(true);ledger.configure({autoReview:false});const dispatch=vi.spyOn(f.internal,'dispatchAgentWake');f.internal.personalBackgroundTick();expect(dispatch).not.toHaveBeenCalled();ledger.configure({autoReview:true});const pa=store.getAgent(state.assistantId);store.saveAgent({...pa,personality:{...pa.personality,proactivity:'reactive'}});f.internal.personalBackgroundTick();expect(dispatch).not.toHaveBeenCalled();f.internal.sessions.delete(task.runId);});
