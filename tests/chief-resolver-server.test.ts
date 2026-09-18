/**
 * The Chief-of-Staff resolver as the SERVER uses it: a request surfaced after a
 * turn is decided by delegated policy, and anything not delegated stays open.
 * The resolver never invents authority, so these tests pin that boundary.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { GituServer } from '../src/server/server.js';
import { ScriptedMockLlm } from '../src/llm/llm.js';
import type { ChiefAuthorityPolicy, ChiefResolverContext } from '../src/cowork/chief-resolver.js';

const homes: string[] = [];
const servers: GituServer[] = [];
/** Captured before anything here touches the env: the home override must not
 *  leak into the files that run after this one in the shared test thread. */
const previousHome = process.env['AGENT_GITU_HOME'];
afterEach(async () => {
  for (const server of servers.splice(0)) { try { await server.stop(); } catch { /* closed */ } }
  for (const home of homes.splice(0)) { try { rmSync(home, { recursive: true, force: true }); } catch { /* best effort on Windows */ } }
  if (previousHome === undefined) delete process.env['AGENT_GITU_HOME']; else process.env['AGENT_GITU_HOME'] = previousHome;
});

const QUESTION = 'Which tests should I run?';
const DETAIL = 'Scope of the local verification run';
const OPTIONS = ['Unit tests', 'All tests'];
const CONTEXT: ChiefResolverContext = { missionId: 'mission-1', missionActive: true, spentUsd: 0, reservedUsd: 0, costComplete: true };

/** The worker raises a question through the real tool, then finishes. */
const workerScript = () => [
  `<tool>{"name":"ask_user","params":{"question":${JSON.stringify(QUESTION)},"detail":${JSON.stringify(DETAIL)},"options":${JSON.stringify(OPTIONS)}}}</tool>`,
  'Posted the question and I am waiting for the answer.',
  'Understood — continuing from that decision.',
];

/** A round whose FIRST call asks for a capability. `ask_user` and
 *  `request_permission` end the turn and skip the rest of that round, so the
 *  permission request must lead for it to be the one that is created. */
const permissionScript = () => [
  `<tool>{"name":"request_permission","params":{"permission":"host","reason":"Edit the shared workspace"}}</tool>` +
    `<tool>{"name":"ask_user","params":{"question":${JSON.stringify(QUESTION)},"detail":${JSON.stringify(DETAIL)},"options":${JSON.stringify(OPTIONS)}}}</tool>`,
  'Posted the permission request; waiting for the answer.',
  'Understood — continuing from that decision.',
];

interface Message { role: string; text: string }
interface RequestView { id: string; kind: string; title: string; status: string; response?: string }

/**
 * The server keeps `config` by reference, so the delegated policy is created
 * first with placeholder ids and completed once the agents exist. One fixture
 * beats two stores that would disagree about ids.
 */
async function harness(policy?: ChiefAuthorityPolicy, script: string[] = workerScript()) {
  const home = mkdtempSync(path.join(tmpdir(), 'chief-server-'));
  homes.push(home);
  process.env['AGENT_GITU_HOME'] = home;
  const server = new GituServer({
    cwd: path.join(home, 'Workspace'),
    port: 0,
    llm: new ScriptedMockLlm(script.map((text) => () => text)),
    ...(policy ? { chiefAuthority: policy, chiefContext: () => CONTEXT } : {}),
  });
  servers.push(server);
  const base = `http://127.0.0.1:${await server.start()}`;
  const call = async (route: string, method = 'GET', body?: unknown) => {
    const response = await fetch(base + route, { method, headers: { 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
    return await response.json() as Record<string, unknown>;
  };
  const worker = (await call('/api/cowork/agents', 'POST', { name: 'Worker', systemPrompt: 'Implement.' })).agent as { id: string };
  const chief = (await call('/api/cowork/agents', 'POST', { name: 'Chief', systemPrompt: 'Coordinate.', chiefOfStaff: true })).agent as { id: string };
  // A DM assigns the turn to its FIRST member, so the worker leads while the
  // chief is still a member that is eligible to resolve.
  const conv = (await call('/api/cowork/conversations', 'POST', { kind: 'dm', memberIds: [worker.id, chief.id], chiefId: chief.id })).conversation as { id: string };
  const route = `/api/cowork/conversations/${conv.id}/messages`;
  if (policy) {
    policy.conversationId = conv.id;
    policy.chiefAgentId = chief.id;
    for (const answer of policy.answers) answer.agentId = worker.id;
  }
  const view = async () => await call(route);
  const findQuestion = async () => (((await view()).requests ?? []) as RequestView[]).find((entry) => entry.title === QUESTION);
  return {
    base,
    server,
    conversationId: conv.id,
    workerId: worker.id,
    chiefId: chief.id,
    view,
    send: (text: string) => fetch(`${base}${route}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text }) }),
    requests: async () => (((await view()).requests ?? []) as RequestView[]),
    question: findQuestion,
    permission: async () => (((await view()).requests ?? []) as RequestView[]).find((entry) => entry.kind === 'permission'),
    agents: async () => (((await call('/api/cowork/agents')).agents ?? []) as { id: string; allowShell: boolean; allowWrites: boolean; allowConfig: boolean; useHostComputer: boolean }[]),
    systemText: async () => (((await view()).messages ?? []) as Message[]).filter((m) => m.role === 'system').map((m) => m.text).join('\n'),
    /** Waits until the conversation is idle again. */
    finish: async () => {
      for (let i = 0; i < 200; i++) {
        if (!(await view()).busy) return;
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
      throw new Error('Conversation did not become idle');
    },
    /** Waits until the raised question reaches a terminal state. */
    settled: async (status: string) => {
      for (let i = 0; i < 200; i++) {
        const request = await findQuestion();
        if (request?.status === status) return request;
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
      throw new Error(`The question never reached "${status}"`);
    },
  };
}

function policyFor(): ChiefAuthorityPolicy {
  return {
    enabled: true,
    chiefAgentId: '',
    conversationId: '',
    missionId: 'mission-1',
    maxSpendUsd: 5,
    answers: [{ agentId: '', title: QUESTION, detail: DETAIL, options: OPTIONS, answer: 'All tests', decisionId: 'user-decision-1' }],
  };
}

describe('Chief-of-Staff automatic resolution over HTTP', () => {
  it('answers a delegated question through the existing request path and audits the decision', async () => {
    const h = await harness(policyFor());
    await h.send('Start the work.');
    const answered = await h.settled('answered');
    // The SAME request object is resolved in place — not a second request.
    expect(answered.response).toBe('All tests');
    expect((await h.requests()).filter((entry) => entry.title === QUESTION)).toHaveLength(1);
    await h.finish();
    expect(await h.systemText()).toContain('Chief of Staff resolved the question');
    expect(await h.systemText()).toContain('user-decision-1');
  }, 30000);

  it('leaves every request open when no authority is delegated (the default)', async () => {
    const h = await harness();
    await h.send('Start the work.');
    await h.settled('open');
    await h.finish();
    expect(await h.systemText()).not.toContain('Chief of Staff resolved');
    expect((await h.question())?.status).toBe('open');
  }, 30000);

  it('never converts a permission request into a capability grant', async () => {
    // The policy delegates the QUESTION only, so a permission request is
    // undelegated authority: the Chief must leave it with the user.
    const h = await harness(policyFor(), permissionScript());
    const before = (await h.agents()).find((agent) => agent.id === h.workerId)!;
    await h.send('Continue.');
    await h.finish();
    expect((await h.permission())?.status).toBe('open');
    expect(await h.systemText()).not.toContain('Chief of Staff resolved');
    const after = (await h.agents()).find((agent) => agent.id === h.workerId)!;
    expect({ allowShell: after.allowShell, allowWrites: after.allowWrites, allowConfig: after.allowConfig, useHostComputer: after.useHostComputer })
      .toEqual({ allowShell: before.allowShell, allowWrites: before.allowWrites, allowConfig: before.allowConfig, useHostComputer: before.useHostComputer });
  }, 30000);

  it('escalates a question that the policy does not delegate', async () => {
    const policy = policyFor();
    // Enabled authority that delegates NOTHING: the request must stay open.
    policy.answers = [];
    const h = await harness(policy);
    await h.send('Start the work.');
    await h.settled('open');
    await h.finish();
    expect((await h.question())?.status).toBe('open');
    expect(await h.systemText()).not.toContain('Chief of Staff resolved');
  }, 30000);
});
