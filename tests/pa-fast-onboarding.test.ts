import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { GituServer } from '../src/server/server.js';
import { ScriptedMockLlm } from '../src/llm/llm.js';
import { PA_ONBOARDING_QUESTION_TITLE } from '../src/cowork/proactivity.js';
import { agentProfileInstructions } from '../src/cowork/profile-config.js';

const previous = process.env.AGENT_GITU_HOME;
const roots: string[] = [];
const servers: GituServer[] = [];

afterEach(async () => {
  for (const server of servers.splice(0)) await server.stop();
  vi.restoreAllMocks();
  for (const root of roots.splice(0)) {
    try { rmSync(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }); } catch { /* Windows SQLite lock */ }
  }
  if (previous === undefined) delete process.env.AGENT_GITU_HOME;
  else process.env.AGENT_GITU_HOME = previous;
});

async function fixture() {
  const home = mkdtempSync(path.join(os.tmpdir(), 'pa-fast-onboard-'));
  roots.push(home);
  process.env.AGENT_GITU_HOME = home;
  const cwd = path.join(home, 'Workspace');
  mkdirSync(cwd);
  const server = new GituServer({ cwd, port: 0, passwordRequired: false, llm: new ScriptedMockLlm([]), coworkCompletionProtocol: 'legacy' });
  servers.push(server);
  const origin = 'http://127.0.0.1:' + (await server.start());
  const api = async (route: string, body?: unknown) => {
    const response = await fetch(origin + route, {
      method: body ? 'POST' : 'GET',
      headers: { 'content-type': 'application/json', origin },
      body: body ? JSON.stringify(body) : undefined,
    });
    return { status: response.status, data: (await response.json()) as any };
  };
  return { server, internal: server as any, api, home, origin };
}

describe('P.A fast onboarding, immediate connected-app learning, and proactive suggestions', () => {
  it('asks the user immediately on fast onboarding with an idempotent question card and wakes P.A with a learning prompt when answered', async () => {
    const f = await fixture();
    expect((await f.api('/api/onboarding', { theme: 'dark', mode: 'cowork', model: '' })).status).toBe(200);

    const status = f.internal.proactivity().status();
    const store = f.internal.cowork();
    const pa = store.getAgent(status.assistantId);

    expect(pa).toBeDefined();
    expect(pa.personality?.proactivity).toBe('proactive');
    expect(pa.systemPrompt).toContain('proactive and suggestive');
    expect(pa.systemPrompt).toContain('user_profile');
    expect(pa.personality?.communicationStyle).toContain('next-step suggestion');

    const messages = store.messages(status.conversationId);
    expect(messages.length).toBeGreaterThanOrEqual(1);
    expect(messages[0].text).toContain('P.A');

    const requests = store.requests(status.conversationId).filter((r: any) => r.kind === 'question' && r.title === PA_ONBOARDING_QUESTION_TITLE);
    expect(requests).toHaveLength(1);
    expect(requests[0].options.length).toBeGreaterThanOrEqual(3);
    expect(requests[0].recommended).toBe(requests[0].options[0]);

    // Re-running preparePersonalAssistant is idempotent and does not duplicate the welcome or card.
    f.internal.preparePersonalAssistant();
    expect(store.messages(status.conversationId)).toHaveLength(messages.length);
    expect(store.requests(status.conversationId).filter((r: any) => r.title === PA_ONBOARDING_QUESTION_TITLE)).toHaveLength(1);

    // Answering the fast-onboarding card immediately wakes P.A with the tailored learning instruction.
    const wakeSpy = vi.spyOn(f.internal, 'dispatchAgentWake').mockReturnValue(true);
    const res = await f.api(`/api/cowork/requests/${requests[0].id}`, {
      action: 'answer',
      response: 'Ship & debug my code projects',
    });
    expect(res.status).toBe(200);
    expect(wakeSpy).toHaveBeenCalledOnce();
    const [, agentId, instruction] = wakeSpy.mock.calls[0]!;
    expect(agentId).toBe(status.assistantId);
    expect(instruction).toContain('Ship & debug my code projects');
    expect(instruction).toContain('user_profile');
    expect(instruction).toContain('next step');
  });

  it('starts learning immediately when apps are already connected at onboarding instead of posting the intake card', async () => {
    const f = await fixture();
    const store = f.internal.cowork();
    const pa = f.internal.proactivity().ensureAssistant(store);
    store.assignAppAccount(pa.id, 'gmail', 'acc-gmail-1');

    const wakeSpy = vi.spyOn(f.internal, 'dispatchAgentWake').mockReturnValue(true);
    expect((await f.api('/api/onboarding', { theme: 'dark', mode: 'cowork', model: '' })).status).toBe(200);

    const status = f.internal.proactivity().status();
    const intakeCards = store.requests(status.conversationId).filter((r: any) => r.title === PA_ONBOARDING_QUESTION_TITLE);
    expect(intakeCards).toHaveLength(0);

    expect(wakeSpy).toHaveBeenCalledOnce();
    const [, agentId, instruction] = wakeSpy.mock.calls[0]!;
    expect(agentId).toBe(pa.id);
    expect(instruction).toContain('gmail');
    expect(instruction).toContain('read-only');
    expect(instruction).toContain('user_profile');
  });

  it('immediately triggers one-time P.A learning when a connected app is assigned or discovered active', async () => {
    const f = await fixture();
    expect((await f.api('/api/onboarding', { theme: 'dark', mode: 'cowork', model: '' })).status).toBe(200);
    const status = f.internal.proactivity().status();
    const paId = status.assistantId;

    vi.spyOn(f.internal.appHub, 'accounts').mockResolvedValue([
      { id: 'acc-cal-1', toolkit: 'googlecalendar', status: 'ACTIVE', disabled: false },
    ]);
    const wakeSpy = vi.spyOn(f.internal, 'dispatchAgentWake').mockReturnValue(true);

    // Assigning an active app to P.A triggers immediate read-only learning once.
    const assign = await f.api('/api/connected-apps/assign', { agentId: paId, accountId: 'acc-cal-1' });
    expect(assign.status).toBe(200);
    expect(wakeSpy).toHaveBeenCalledOnce();
    expect(wakeSpy.mock.calls[0]![2]).toContain('googlecalendar');
    expect(wakeSpy.mock.calls[0]![2]).toContain('never send, write, delete, or modify anything without approval');

    // Polling GET /api/connected-apps?agentId=paId does not trigger duplicate learning wakes.
    const poll = await f.api(`/api/connected-apps?agentId=${encodeURIComponent(paId)}&statusOnly=true`);
    expect(poll.status).toBe(200);
    expect(wakeSpy).toHaveBeenCalledOnce();
  });

  it('includes proactive learning and suggestive guidance in proactive profile instructions while keeping safety boundaries', () => {
    const text = agentProfileInstructions({
      personality: { traits: ['Proactive'], communicationStyle: 'Concise', proactivity: 'proactive' },
    });
    expect(text).toContain('proactive, and suggestive');
    expect(text).toContain('user_profile');
    expect(text).toContain('actionable next steps');
    expect(text).toContain('proactivity does not grant external writes, purchases, destructive actions or additional access');
  });
});
