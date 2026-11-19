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
async function harness(
  policy?: ChiefAuthorityPolicy,
  script: string[] = workerScript(),
  existingHome?: string,
) {
  const home = existingHome ?? mkdtempSync(path.join(tmpdir(), 'chief-server-'));
  if (!existingHome) homes.push(home);
  process.env['AGENT_GITU_HOME'] = home;
  const server = new GituServer({ passwordRequired: false,
    cwd: path.join(home, 'Workspace'),
    port: 0,
    llm: new ScriptedMockLlm(script.map((text) => () => text)),
    // The scripted replies are plain text; completion-state enforcement would
    // ask the script for a classification it cannot give.
    coworkCompletionProtocol: 'legacy',
    ...(policy ? { chiefAuthority: policy, chiefContext: () => CONTEXT } : {}),
  });
  servers.push(server);
  const base = `http://127.0.0.1:${await server.start()}`;
  const call = async (route: string, method = 'GET', body?: unknown) => {
    const response = await fetch(base + route, { method, headers: { 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
    return await response.json() as Record<string, unknown>;
  };
  const existingAgents = existingHome
    ? (((await call('/api/cowork/agents')).agents ?? []) as { id: string; name: string }[])
    : [];
  const worker =
    existingAgents.find((a) => a.name === 'Worker') ??
    ((await call('/api/cowork/agents', 'POST', { name: 'Worker', systemPrompt: 'Implement.' })).agent as { id: string });
  const chief =
    existingAgents.find((a) => a.name === 'Chief') ??
    ((await call('/api/cowork/agents', 'POST', { name: 'Chief', systemPrompt: 'Coordinate.', chiefOfStaff: true })).agent as { id: string });
  // A multi-member DM is triaged by its chief, so the message targets the
  // worker explicitly while the chief stays a member eligible to resolve.
  const conv = (
    await call('/api/cowork/conversations', 'POST', {
      kind: existingHome ? 'group' : 'dm',
      ...(existingHome ? { title: 'Round 2' } : {}),
      memberIds: [worker.id, chief.id],
      chiefId: chief.id,
    })
  ).conversation as { id: string };
  const route = `/api/cowork/conversations/${conv.id}/messages`;
  if (policy) {
    policy.conversationId = conv.id;
    policy.chiefAgentId = chief.id;
    for (const answer of policy.answers) answer.agentId = worker.id;
  }
  const view = async () => await call(route);
  const findQuestion = async () => (((await view()).requests ?? []) as RequestView[]).find((entry) => entry.title === QUESTION);
  return {
    home,
    call,
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
    await h.send('@Worker Start the work.');
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
    await h.send('@Worker Start the work.');
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
    await h.send('@Worker Continue.');
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
    await h.send('@Worker Start the work.');
    await h.settled('open');
    await h.finish();
    expect((await h.question())?.status).toBe('open');
    expect(await h.systemText()).not.toContain('Chief of Staff resolved');
  }, 30000);
});

describe('Persisted Chief of Staff settings, rules, and audit log HTTP API', () => {
  it('manages settings, standing rules, high-impact command vetoes, and audits/revokes auto-resolved Cowork questions', async () => {
    const h = await harness();

    const initial = await h.call('/api/chief/settings');
    expect((initial['settings'] as Record<string, unknown>)['preset']).toBe('balanced');
    expect(Array.isArray(initial['presets'])).toBe(true);

    const updated = await h.call('/api/chief/settings', 'POST', {
      preset: 'autonomous',
      maxPlanSteps: 20,
      coworkQuestionAdvisor: false,
    });
    expect(updated['ok']).toBe(true);
    expect((updated['settings'] as Record<string, unknown>)['preset']).toBe('autonomous');
    expect((updated['settings'] as Record<string, unknown>)['maxPlanSteps']).toBe(20);

    // Rejects dangerous standing command prefixes.
    const dangerRes = await fetch(`${h.base}/api/chief/rules/commands`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ prefix: 'rm -rf build' }),
    });
    expect(dangerRes.status).toBe(400);

    // Allows safe routine command prefix and deletion.
    const safeCmd = await h.call('/api/chief/rules/commands', 'POST', { prefix: 'npm run verify' });
    const cmdId = ((safeCmd['rule'] as Record<string, unknown>)['id']) as string;
    expect(cmdId).toBeTruthy();
    const delCmd = await h.call(`/api/chief/rules/commands/${encodeURIComponent(cmdId)}`, 'DELETE');
    expect(delCmd['removed']).toBe(true);

    // Standing answer rule auto-resolves matching Cowork question card and writes audit decision.
    const addedAns = await h.call('/api/chief/rules/answers', 'POST', {
      pattern: 'Which tests should I run',
      answer: 'Unit tests',
    });
    const ruleId = ((addedAns['rule'] as Record<string, unknown>)['id']) as string;
    expect(ruleId).toBeTruthy();

    await h.send('@Worker Start the work.');
    const answered = await h.settled('answered');
    expect(answered.response).toBe('Unit tests');
    await h.finish();
    expect(await h.systemText()).toContain('Chief of Staff resolved the question');

    const decisionsRes = await h.call('/api/chief/decisions?surface=cowork');
    const decisions = (decisionsRes['decisions'] ?? []) as { id: string; ruleId?: string; summary: string; decision: { action: string; answer?: string } }[];
    expect(decisions.length).toBeGreaterThanOrEqual(1);
    const entry = decisions.find((d) => d.ruleId === ruleId);
    expect(entry).toMatchObject({
      summary: QUESTION,
      decision: { action: 'answer', answer: 'Unit tests' },
    });

    // Revoking the decision marks revokedAt and deletes the linked standing rule.
    const revoked = await h.call(`/api/chief/decisions/${encodeURIComponent(entry!.id)}/revoke`, 'POST', {
      reason: 'Ask me directly next time',
    });
    expect((revoked['decision'] as Record<string, unknown>)['revokedAt']).toBeTruthy();
    const afterSettings = ((await h.call('/api/chief/settings'))['settings'] as { standingAnswers: unknown[] });
    expect(afterSettings.standingAnswers).toHaveLength(0);
  }, 30000);

  it('persists rememberForChief from Cowork question answers across restarts', async () => {
    const h1 = await harness();
    await h1.send('@Worker Start the work.');
    const openQ = await h1.settled('open');
    await h1.finish();

    const resolved = await h1.call(`/api/cowork/requests/${encodeURIComponent(openQ.id)}`, 'POST', {
      action: 'answer',
      response: 'All tests',
      rememberForChief: true,
    });
    expect(resolved['ok']).toBe(true);
    expect((resolved['rememberedRule'] as Record<string, unknown>)?.['answer']).toBe('All tests');
    await h1.finish();
    await h1.server.stop();

    // Restart a fresh server on the same AGENT_GITU_HOME: saved rule auto-answers the next question.
    const h2 = await harness(undefined, workerScript(), h1.home);
    await h2.send('@Worker Start round two.');
    const autoAnswered = await h2.settled('answered');
    expect(autoAnswered.response).toBe('All tests');
    expect((autoAnswered as RequestView & { resolvedBy?: string }).resolvedBy).toBe('chief');
    await h2.finish();
  }, 30000);

  it('scopes rememberForChief to one conversation when chiefScope=conversation and never auto-approves delegated approvals', async () => {
    const h1 = await harness();
    await h1.send('@Worker Start the work.');
    const openQ = await h1.settled('open');
    await h1.finish();

    const resolved = await h1.call(`/api/cowork/requests/${encodeURIComponent(openQ.id)}`, 'POST', {
      action: 'answer',
      response: 'Unit tests',
      rememberForChief: true,
      chiefPattern: 'Which tests',
      chiefScope: 'conversation',
    });
    expect(resolved['ok']).toBe(true);
    expect((resolved['rememberedRule'] as Record<string, unknown>)?.['scope']).toBe(h1.conversationId);
    await h1.finish();

    // A standing answer matching an approval title must NOT auto-approve a delegated approval card.
    await h1.call('/api/chief/rules/answers', 'POST', {
      pattern: 'Approve mcp:slack',
      answer: 'Approve',
    });
    await h1.call('/api/chief/settings', 'POST', { coworkQuestionAdvisor: true });
    const store = (h1.server as unknown as { cowork(): { addRequest(input: Record<string, unknown>): { id: string }; getRequest(id: string): { status: string } | undefined } }).cowork();
    const approvalCard = store.addRequest({
      conversationId: h1.conversationId,
      agentId: h1.workerId,
      kind: 'question',
      delegatedGate: 'approval',
      title: 'Approve mcp:slack for @Worker?',
      detail: 'Post update to Slack',
      options: ['Approve', 'Deny'],
    });
    await (h1.server as unknown as { resolveChiefRequests(convId: string): Promise<void> }).resolveChiefRequests(h1.conversationId);
    expect(store.getRequest(approvalCard.id)?.status).toBe('open');

    // A different conversation should NOT inherit the conversation-scoped rule.
    await h1.server.stop();
    const h2 = await harness(undefined, workerScript(), h1.home);
    await h2.send('@Worker Start round two.');
    const stillOpen = await h2.settled('open');
    expect(stillOpen.status).toBe('open');
    await h2.finish();
  }, 30000);
});
