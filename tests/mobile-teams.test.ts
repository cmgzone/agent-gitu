import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { expect, it } from 'vitest';
import { GituApi } from '../apps/mobile/src/gitu/client.js';
import { ScriptedMockLlm } from '../src/llm/llm.js';
import { GituServer } from '../src/server/server.js';

it('shares authenticated Cowork profiles, groups, threads, messages and decisions with mobile', async () => {
  const home = mkdtempSync(path.join(tmpdir(), 'mobile-teams-'));
  const oldHome = process.env.AGENT_GITU_HOME;
  process.env.AGENT_GITU_HOME = home;
  const key = 'mobile-teams-integration-test-access-key';
  let calls = 0;
  const reply = (text: string) => () => {
    calls++;
    return text;
  };
  const server = new GituServer({ passwordRequired: false,
    cwd: path.join(home, 'Workspace'),
    port: 0,
    accessKey: key,
    autoInstallLsp: false,
    coworkCompletionProtocol: 'legacy',
    llm: new ScriptedMockLlm([
      reply('Shared answer from Ada.'),
      reply('Please choose. <tool>{"name":"ask_user","params":{"question":"Which environment?","options":["Preview","Production"]}}</tool>'),
      reply('Continuing with Preview.'),
      reply('<tool>{"name":"request_permission","params":{"permission":"writes","reason":"Save the requested result"}}</tool>'),
      reply('File writes remain disabled.'),
    ]),
  });
  try {
    const api = new GituApi(`http://127.0.0.1:${await server.start()}`, key);
    await expect(new GituApi(api.baseUrl, 'wrong').teams()).rejects.toThrow(/key rejected/);
    const { agent: ada } = await api.saveTeammate({
      name: 'Ada',
      systemPrompt: 'Help the team.',
      tagline: 'Engineer',
      useHostComputer: true,
      allowConfig: true,
      chiefOfStaff: true,
    });
    const { agent: bo } = await api.saveTeammate({ name: 'Bo', systemPrompt: 'Review work.' });
    await api.saveTeammate({ ...ada, tagline: 'Lead engineer' });
    const { conversation: group } = await api.createTeamChat([ada.id, bo.id], 'Mobile project team', ada.id);
    const roster = await api.teams();
    expect(roster.agents.find((agent) => agent.id === ada.id)).toMatchObject({
      tagline: 'Lead engineer',
      allowConfig: true,
      useHostComputer: true,
      chiefOfStaff: true,
      allowWrites: false,
    });
    expect(roster.conversations).toContainEqual(expect.objectContaining({ id: group.id, kind: 'group', chiefId: ada.id, memberIds: [ada.id, bo.id] }));
    const { conversation: dm } = await api.createTeamChat([ada.id]);
    const wait = async (ready: (view: Awaited<ReturnType<GituApi['teamChat']>>) => boolean, threadId?: string) => {
      let view = await api.teamChat(dm.id, threadId);
      const deadline = Date.now() + 15_000;
      while (!ready(view) && Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, 50));
        view = await api.teamChat(dm.id, threadId);
      }
      expect(ready(view)).toBe(true);
      return view;
    };
    await api.sendTeamMessage(dm.id, 'mobile-first', 'Hello Ada');
    let view = await wait((view) => !view.busy && view.messages.some((message) => message.text === 'Shared answer from Ada.'));
    await api.sendTeamMessage(dm.id, 'mobile-first', 'Hello Ada');
    expect(calls).toBe(1); // A retry after a lost response must not run the team twice.
    const route = `/api/cowork/conversations/${dm.id}/messages/mobile-first`;
    await api.request(route, { text: 'Edited on desktop', revision: 0 }, 'PATCH');
    view = await api.teamChat(dm.id);
    expect(view.messages.find((message) => message.id === 'mobile-first')).toMatchObject({ text: 'Edited on desktop', revision: 1 });
    await api.request(route, undefined, 'DELETE');
    expect((await api.teamChat(dm.id)).messages.some((message) => message.id === 'mobile-first')).toBe(false);
    const { thread } = await api.createTeamThread(dm.id, 'Release planning');
    await api.sendTeamMessage(dm.id, 'mobile-question', 'Ask me which environment.', thread.id);
    view = await wait((view) => !view.busy && view.requests.some((request) => request.kind === 'question' && request.status === 'open'), thread.id);
    expect(view.threadId).toBe(thread.id);
    expect(view.threads).toContainEqual(expect.objectContaining({ id: thread.id, title: 'Release planning' }));
    expect((await api.teamChat(dm.id)).messages.some((message) => message.id === 'mobile-question')).toBe(false);
    const question = view.requests.find((request) => request.kind === 'question' && request.status === 'open')!;
    await api.resolveTeamRequest(question.id, 'answer', 'Preview');
    view = await wait((view) => !view.busy && view.requests.some((request) => request.id === question.id && request.status === 'answered'), thread.id);
    await expect(api.resolveTeamRequest(question.id, 'answer', 'Production')).rejects.toThrow(/already answered/);
    await api.sendTeamMessage(dm.id, 'mobile-permission', 'Ask before enabling file writes.');
    view = await wait((view) => !view.busy && view.requests.some((request) => request.kind === 'permission' && request.status === 'open'));
    const permission = view.requests.find((request) => request.kind === 'permission' && request.status === 'open')!;
    await api.resolveTeamRequest(permission.id, 'deny');
    await wait((view) => !view.busy && view.requests.some((request) => request.id === permission.id && request.status === 'denied'));
    expect((await api.teams()).agents.find((agent) => agent.id === ada.id)?.allowWrites).toBe(false);
    await api.stopTeamChat(dm.id);
    const foreignOrigin = await fetch(`${api.baseUrl}/api/cowork/conversations`, {
      headers: { Authorization: `Bearer ${key}`, Origin: 'https://foreign.example', 'Content-Type': 'application/json' },
      method: 'POST',
      body: JSON.stringify({ memberIds: [ada.id] }),
    });
    expect(foreignOrigin.status).toBe(403);
  } finally {
    await server.stop();
    if (oldHome === undefined) delete process.env.AGENT_GITU_HOME;
    else process.env.AGENT_GITU_HOME = oldHome;
    rmSync(home, { recursive: true, force: true, maxRetries: 15, retryDelay: 100 });
  }
}, 60_000);
