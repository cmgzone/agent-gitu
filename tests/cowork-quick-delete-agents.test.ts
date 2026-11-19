import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { GituServer } from '../src/server/server.js';
import { ScriptedMockLlm } from '../src/llm/llm.js';
import { UI_HTML } from '../src/server/ui.js';

const previous = process.env.AGENT_GITU_HOME;
const roots: string[] = [];
const servers: GituServer[] = [];

afterEach(async () => {
  for (const server of servers.splice(0)) await server.stop();
  for (const root of roots.splice(0)) {
    try { rmSync(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }); } catch { /* Windows SQLite lock */ }
  }
  if (previous === undefined) delete process.env.AGENT_GITU_HOME;
  else process.env.AGENT_GITU_HOME = previous;
});

async function fixture() {
  const home = mkdtempSync(path.join(os.tmpdir(), 'cowork-del-agents-'));
  roots.push(home);
  process.env.AGENT_GITU_HOME = home;
  const cwd = path.join(home, 'Workspace');
  mkdirSync(cwd);
  const server = new GituServer({ cwd, port: 0, passwordRequired: false, llm: new ScriptedMockLlm([]), coworkCompletionProtocol: 'legacy' });
  servers.push(server);
  const origin = 'http://127.0.0.1:' + (await server.start());
  const api = async (route: string, method: 'GET' | 'POST' | 'DELETE' = 'GET', body?: unknown) => {
    const response = await fetch(origin + route, {
      method,
      headers: { ...(body !== undefined ? { 'content-type': 'application/json' } : {}), origin },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    return { status: response.status, data: (await response.json()) as any };
  };
  return { server, internal: server as any, api };
}

describe('Quick agent deletion and bulk delete-all agents', () => {
  it('deletes a single agent quickly, supports selective bulk delete, and deletes all agents in one request', async () => {
    const f = await fixture();
    const a1 = (await f.api('/api/cowork/agents', 'POST', { name: 'Alpha', systemPrompt: 'Help 1' })).data.agent;
    const a2 = (await f.api('/api/cowork/agents', 'POST', { name: 'Beta', systemPrompt: 'Help 2' })).data.agent;
    const a3 = (await f.api('/api/cowork/agents', 'POST', { name: 'Gamma', systemPrompt: 'Help 3' })).data.agent;
    const a4 = (await f.api('/api/cowork/agents', 'POST', { name: 'Delta', systemPrompt: 'Help 4' })).data.agent;

    // Create a group conversation spanning multiple agents
    await f.api('/api/cowork/conversations', 'POST', { kind: 'group', title: 'All Hands', memberIds: [a1.id, a2.id, a3.id, a4.id] });

    // Single quick delete removes Alpha only
    const single = await f.api(`/api/cowork/agents/${encodeURIComponent(a1.id)}`, 'DELETE');
    expect(single.status).toBe(200);
    expect((await f.api('/api/cowork/agents')).data.agents.map((a: any) => a.name)).toEqual(['Beta', 'Gamma', 'Delta']);

    // Selective bulk delete removes Beta only
    const selective = await f.api('/api/cowork/agents', 'DELETE', { ids: [a2.id] });
    expect(selective.status).toBe(200);
    expect(selective.data).toMatchObject({ ok: true, deletedCount: 1, deletedIds: [a2.id], remaining: 2 });

    // Delete all remaining agents in one call (empty body)
    const all = await f.api('/api/cowork/agents', 'DELETE');
    expect(all.status).toBe(200);
    expect(all.data).toMatchObject({ ok: true, deletedCount: 2, remaining: 0 });
    expect(all.data.deletedIds.sort()).toEqual([a3.id, a4.id].sort());

    // Roster and conversations are completely clean
    expect((await f.api('/api/cowork/agents')).data.agents).toEqual([]);
    expect(f.internal.cowork().listConversations()).toEqual([]);
  });

  it('supports keepIds when bulk deleting agents', async () => {
    const f = await fixture();
    const keep = (await f.api('/api/cowork/agents', 'POST', { name: 'P.A', systemPrompt: 'Chief' })).data.agent;
    const drop1 = (await f.api('/api/cowork/agents', 'POST', { name: 'Temp 1', systemPrompt: 'Help' })).data.agent;
    const drop2 = (await f.api('/api/cowork/agents', 'POST', { name: 'Temp 2', systemPrompt: 'Help' })).data.agent;

    const res = await f.api('/api/cowork/agents', 'DELETE', { keepIds: [keep.id] });
    expect(res.status).toBe(200);
    expect(res.data).toMatchObject({ ok: true, deletedCount: 2, remaining: 1 });
    expect(res.data.deletedIds.sort()).toEqual([drop1.id, drop2.id].sort());
    expect((await f.api('/api/cowork/agents')).data.agents.map((a: any) => a.id)).toEqual([keep.id]);
  });

  it('exposes quick delete and delete-all controls in the Cowork UI bundle', () => {
    expect(UI_HTML).toContain('cwRailDeleteAllAgents');
    expect(UI_HTML).toContain('data-delagent');
    expect(UI_HTML).toContain('cwQuickDeleteAgent');
    expect(UI_HTML).toContain('cwDeleteAllAgents');
    expect(UI_HTML).toContain('cwSwDeleteAll');
  });
});
