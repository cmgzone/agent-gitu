import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { expect, it } from 'vitest';
import { CoworkStore } from '../src/cowork/store.js';
import { CoworkMemory } from '../src/cowork/memory.js';
import { MemoryStore } from '../src/memory/memory-store.js';
import { agentProfileInstructions } from '../src/cowork/profile-config.js';
import { GituServer } from '../src/server/server.js';
import { ScriptedMockLlm } from '../src/llm/llm.js';

it('persists structured profiles, normalizes roles, and never grants permissions from personality', () => {
  const home = mkdtempSync(path.join(tmpdir(), 'gitu-profile-store-'));
  try {
    const file = path.join(home, 'cowork.json'), store = new CoworkStore(file);
    const agent = store.saveAgent({ name: 'Gitu', systemPrompt: 'Help me.', provider: 'openai', model: 'example', description: 'My teammate', roles: [
      { id: 'research', name: 'Researcher', responsibilities: 'Verify sources.' }, { id: 'research', name: 'Duplicate', responsibilities: '' },
    ], primaryRoleId: 'invalid', personality: { traits: ['Calm', 'Calm', 'Focused'], communicationStyle: 'Be concise.', proactivity: 'suggest' } });
    const reloaded = new CoworkStore(file).getAgent(agent.id)!;
    expect(reloaded.roles).toHaveLength(1); expect(reloaded.primaryRoleId).toBe('research');
    expect(reloaded.personality?.traits).toEqual(['Calm', 'Focused']); expect(reloaded.allowShell).toBe(false);
    expect(agentProfileInstructions(reloaded)).toContain('Suggestions do not authorize');
    expect(agentProfileInstructions(reloaded)).toContain('Verify sources.');
    const cleared = store.saveAgent({ ...reloaded, provider: '', model: '' });
    expect(cleared.provider).toBeUndefined(); expect(cleared.model).toBeUndefined();
  } finally { rmSync(home, { recursive: true, force: true }); }
});

it('isolates private profile memories and keeps correction, archive and rename audits', async () => {
  const home = mkdtempSync(path.join(tmpdir(), 'gitu-profile-memory-'));
  try {
    const store = new CoworkStore(path.join(home, 'cowork.json'));
    const gitu = store.saveAgent({ name: 'Gitu', systemPrompt: 'Help.' }), nova = store.saveAgent({ name: 'Nova', systemPrompt: 'Help.' });
    const shared = MemoryStore.forProject(home), memory = new CoworkMemory(shared, path.basename(home));
    shared.add({type:'preference',claim:'I prefer short replies.',scope:path.basename(home),visibility:'agent',agentId:gitu.name,sourceType:'user_statement',pinned:true}); memory.remember(nova, 'Nova private note.');
    const old = memory.entries(gitu)[0]!;
    expect(memory.entries(gitu)).toHaveLength(1); expect(memory.details(nova, old.id)).toBeUndefined();
    await expect(memory.correct(nova, old.id, 'Stolen note')).rejects.toThrow(/not found/);
    await expect(memory.correct(gitu, old.id, 'A new preference.', 'stale')).rejects.toThrow(/changed/);
    const correction = await memory.correct(gitu, old.id, 'I prefer detailed replies.', old.updatedAt);
    expect(correction.pinned).toBe(true);
    expect(correction.id).not.toBe(old.id); expect(memory.details(gitu, old.id)?.entry?.status).toBe('superseded');
    expect(memory.details(gitu, old.id)?.audit.some(event => event.event === 'superseded')).toBe(true);
    const restored = await memory.correct(gitu, correction.id, old.claim, correction.updatedAt);
    expect(restored.id).not.toBe(old.id); expect(restored.status).toBe('verified');
    expect(memory.entries(gitu)[0]?.claim).toBe(old.claim);
    await memory.renameAgent('Gitu', 'Atlas');
    expect(memory.entries(gitu)).toHaveLength(0); expect(memory.entries({ ...gitu, name: 'Atlas' })).toHaveLength(1);
    const atlas = { ...gitu, name: 'Atlas' };
    expect(memory.details(atlas, restored.id)?.audit.some(event => event.event === 'owner_updated')).toBe(true);
    expect(await memory.archive(nova, restored.id)).toBe(false);
    expect(await memory.archive(atlas, restored.id)).toBe(true);
    expect(memory.details(atlas, restored.id)?.audit.some(event => event.event === 'archived')).toBe(true);
    expect(memory.entries(nova)[0]?.claim).toBe('Nova private note.');
  } finally { rmSync(home, { recursive: true, force: true }); }
});

it('handles profile partial updates and private memory operations through the real HTTP routes', async () => {
  const home = mkdtempSync(path.join(tmpdir(), 'gitu-profile-http-')), previous = process.env.AGENT_GITU_HOME;
  process.env.AGENT_GITU_HOME = home; mkdirSync(path.join(home, 'Workspace'), { recursive: true });
  const server = new GituServer({ passwordRequired: false, cwd: path.join(home, 'Workspace'), port: 0, llm: new ScriptedMockLlm([]) });
  try {
    const base = `http://127.0.0.1:${await server.start()}`;
    async function request(route: string, method = 'GET', body?: unknown) {
      const res = await fetch(base + route, { method, headers: { 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
      return { status: res.status, data: await res.json() };
    }
    const gitu = (await request('/api/cowork/agents', 'POST', { name: 'Gitu', systemPrompt: 'Keep my instructions.', allowShell: true, allowWrites: true, allowConfig: false })).data.agent;
    const nova = (await request('/api/cowork/agents', 'POST', { name: 'Nova', systemPrompt: 'Help.' })).data.agent;
    const saved = await request('/api/cowork/agents', 'POST', { id: gitu.id, description: 'My teammate', roles: [{ id: 'build', name: 'Builder', responsibilities: 'Build carefully.' }], personality: { traits: ['Focused'], communicationStyle: 'Clear', proactivity: 'suggest' } });
    expect(saved.status).toBe(200); expect(saved.data.agent).toMatchObject({ name: 'Gitu', systemPrompt: 'Keep my instructions.', allowShell: true, allowWrites: true, allowConfig: false });
    expect((await request('/api/cowork/agents')).data.agents.find((item: any) => item.id === gitu.id).description).toBe('My teammate');
    const memory = CoworkMemory.forWorkspace(); memory.remember(gitu, 'I prefer concise reports.'); memory.remember(nova, 'Private Nova note.');
    const ownRoute = `/api/cowork/agents/${gitu.id}/memory`, otherRoute = `/api/cowork/agents/${nova.id}/memory`;
    const listed = await request(ownRoute); expect(listed.data.entries).toHaveLength(1); const entry = listed.data.entries[0];
    expect((await request(otherRoute + '/' + entry.id)).status).toBe(404);
    expect((await request(otherRoute + '/' + entry.id, 'PATCH', { claim: 'Wrong owner' })).status).toBe(404);
    expect((await request(otherRoute + '/' + entry.id, 'DELETE')).status).toBe(404);
    const patched = await request(ownRoute + '/' + entry.id, 'PATCH', { claim: 'I prefer detailed reports.', expectedUpdatedAt: entry.updatedAt });
    expect(patched.status).toBe(200);
    expect((await request(ownRoute + '/' + entry.id)).data.entry.status).toBe('superseded');
    expect((await request(ownRoute + '?q=detailed')).data.entries[0].claim).toContain('detailed');
    expect((await request(ownRoute + '/' + patched.data.id, 'DELETE')).status).toBe(200);
    expect((await request(ownRoute)).data.entries).toEqual([]);
    expect((await request(otherRoute)).data.entries).toHaveLength(1);
    const credential = 'ghp_' + 'x'.repeat(36); memory.remember(gitu, 'GitHub token ' + credential);
    const redacted = await request(ownRoute); expect(JSON.stringify(redacted.data)).not.toContain(credential);
    const safeDetail = await request(ownRoute + '/' + redacted.data.entries[0].id);
    expect(JSON.stringify(safeDetail.data)).not.toContain(credential);
  } finally {
    await server.stop(); if (previous === undefined) delete process.env.AGENT_GITU_HOME; else process.env.AGENT_GITU_HOME = previous;
    rmSync(home, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  }
}, 25000);
