import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { CoworkStore } from '../src/cowork/store.js';
import { CoworkRecall } from '../src/cowork/recall.js';
import { hashingEmbedder } from '../src/memory/semantic.js';
import { CoworkMemory } from '../src/cowork/memory.js';
import { MemoryStore } from '../src/memory/memory-store.js';
import { SkillStore } from '../src/skills/skills.js';
import { PendingSkillStore } from '../src/skills/pending.js';
import { GituServer } from '../src/server/server.js';
import { updateWorkspaceSettings, ensureGituHome } from '../src/workspace/home.js';
import type { LlmClient } from '../src/llm/llm.js';
import { DiscordGateway, discordChunks, cleanDiscordText, sendDiscordMessage, discordRequestText, parseDiscordRequestReply, type DiscordFetch, type DiscordFetchResponse } from '../src/cowork/discord.js';

const ROOT = mkdtempSync(path.join(tmpdir(), 'roadmap-'));
const WORKSPACE = path.join(ROOT, 'workspace');
mkdirSync(WORKSPACE, { recursive: true });
writeFileSync(path.join(WORKSPACE, 'package.json'), '{"name":"roadmap-workspace"}');

async function api(base: string, method: string, pathName: string, body?: unknown): Promise<{ status: number; json: any }> {
  const res = await fetch(`${base}${pathName}`, {
    method,
    headers: body ? { 'content-type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, json: await res.json().catch(() => ({})) };
}

describe('cross-session search', () => {
  it('searches across conversations, not just the current chat', () => {
    const store = new CoworkStore(path.join(ROOT, 'search.json'));
    const agent = store.saveAgent({ name: 'searcher', systemPrompt: 'You are searcher.' });
    const mail = store.saveConversation({ kind: 'dm', memberIds: [agent.id], title: 'Mail work' });
    const site = store.saveConversation({ kind: 'dm', memberIds: [agent.id], title: 'Site work' });
    store.appendMessage(mail.id, { role: 'agent', agentName: 'searcher', text: 'The mailcow TLS fix used SNI against mail.pikpam.com and verified on 993.', via: 'web' });
    store.appendMessage(site.id, { role: 'agent', agentName: 'searcher', text: 'Landing page hero is finished.', via: 'web' });

    const hits = store.searchMessages('mailcow tls');
    expect(hits).toHaveLength(1);
    expect(hits[0]!.conversationTitle).toBe('Mail work');
    expect(hits[0]!.snippet).toContain('mailcow');

    // Multiple terms must ALL match; scoped search narrows to one chat.
    expect(store.searchMessages('mailcow missing-term')).toHaveLength(0);
    expect(store.searchMessages('mailcow', { conversationId: site.id })).toHaveLength(0);
    expect(store.searchMessages('mailcow', { conversationId: mail.id })).toHaveLength(1);
  });
});

describe('agentskills.io import/export', () => {
  it('exports a skill as SKILL.md and imports it back', () => {
    const proj = path.join(ROOT, 'proj');
    mkdirSync(proj, { recursive: true });
    writeFileSync(path.join(proj, 'package.json'), '{"name":"proj"}');
    const store = SkillStore.forProject(proj);
    store.create({ name: 'deploy-check', description: 'Deploy checklist', instructions: '1. run tests\n2. deploy', createdBy: 'agent', scope: 'project' });

    const outDir = path.join(ROOT, 'exported');
    const file = store.exportSkillMd('deploy-check', outDir);
    expect(file.endsWith(path.join('deploy-check', 'SKILL.md'))).toBe(true);

    // Import into a fresh store — the standard SKILL.md layout is read directly.
    const other = path.join(ROOT, 'other-proj');
    mkdirSync(other, { recursive: true });
    writeFileSync(path.join(other, 'package.json'), '{"name":"other"}');
    const otherStore = SkillStore.forProject(other);
    const imported = otherStore.importSkillDir(file);
    expect(imported.name).toBe('deploy-check');
    const loaded = otherStore.get('deploy-check');
    expect(loaded?.instructions).toContain('deploy');
    expect(loaded?.format).toBe('skill-md');
  });

  it('imports a SKILL.md directory layout too', () => {
    const source = path.join(ROOT, 'src-skill');
    mkdirSync(source, { recursive: true });
    writeFileSync(path.join(source, 'SKILL.md'), '---\nname: triage\ndescription: "Triage an inbox"\n---\n1. list unread\n2. summarize\n');
    const proj = path.join(ROOT, 'proj2');
    mkdirSync(proj, { recursive: true });
    writeFileSync(path.join(proj, 'package.json'), '{"name":"proj2"}');
    const store = SkillStore.forProject(proj);
    const imported = store.importSkillDir(source, { scope: 'project' });
    expect(imported.name).toBe('triage');
    expect(store.get('triage')?.instructions).toContain('summarize');
  });
});

describe('discord channel', () => {
  it('chunks long messages at the 2000-char limit', () => {
    const chunks = discordChunks('x'.repeat(4_500));
    expect(chunks.every((c) => c.length <= 2_000)).toBe(true);
    expect(chunks.join('').length).toBe(4_500);
  });

  it('strips Telegram-style HTML before sending', () => {
    expect(cleanDiscordText('<b>Hi</b> <i>there</i>')).toBe('Hi there');
    expect(cleanDiscordText('   ')).toBe('Working...');
  });

  it('posts each chunk with the bot token', async () => {
    const calls: { url: string; body: string }[] = [];
    const fakeFetch: DiscordFetch = async (url, init) => {
      calls.push({ url, body: String(init?.body ?? '') });
      return { ok: true, status: 200, text: async () => '{"id":"1"}' } as DiscordFetchResponse;
    };
    await sendDiscordMessage(fakeFetch, 'token-123', 'chan-9', '<b>hello</b>');
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe('https://discord.com/api/v10/channels/chan-9/messages');
    expect(JSON.parse(calls[0]!.body)).toEqual({ content: 'hello' });
  });

  it('gateway delivers a MESSAGE_CREATE and skips bots', () => {
    const received: { author: string; text: string }[] = [];
    const gateway = new DiscordGateway({
      token: 't',
      channelId: 'chan-1',
      webSocketFactory: () => ({ send: () => {}, close: () => {} }),
      onMessage: (author, text) => { received.push({ author, text }); },
    });
    gateway.handleFrame({ op: 10, d: { heartbeat_interval: 45_000 } }); // HELLO → identify, sets no bot
    gateway.handleFrame({ op: 0, t: 'READY', d: { user: { id: 'bot-1' } } });
    gateway.handleFrame({ op: 0, t: 'MESSAGE_CREATE', d: { id: 'm1', channel_id: 'chan-1', content: 'hello team', author: { id: 'u1', username: 'alice' } } });
    gateway.handleFrame({ op: 0, t: 'MESSAGE_CREATE', d: { id: 'm2', channel_id: 'chan-1', content: 'bot echo', author: { id: 'bot-1', bot: true } } });
    gateway.handleFrame({ op: 0, t: 'MESSAGE_CREATE', d: { id: 'm3', channel_id: 'other', content: 'wrong channel', author: { id: 'u1', username: 'alice' } } });
    expect(received).toEqual([{ author: 'alice', text: 'hello team' }]);
    gateway.stop();
  });

  it('renders a request card and resolves keyword replies', () => {
    const request = {
      id: 'cr-1', conversationId: 'c1', agentId: 'a1', kind: 'permission' as const,
      title: 'Run the deploy script', detail: 'It restarts nginx', options: [],
      status: 'open' as const, createdAt: new Date().toISOString(),
    };
    const card = discordRequestText(request, 'rex');
    expect(card).toContain('Approval needed');
    expect(card).toContain('Reply approve or deny');

    // A "deny" keyword resolves the newest open permission request.
    const resolved: { id: string; action: string }[] = [];
    const note = parseDiscordRequestReply('deny', [{ ...request, status: 'open' } as never], (id, action) => {
      resolved.push({ id, action });
      return { ok: true };
    });
    expect(note).toContain('Recorded');
    expect(resolved).toEqual([{ id: request.id, action: 'deny' }]);

    // A question answer (option number) resolves against the newest question.
    // A question answer (option number) resolves against the newest question.
    const question = { id: 'q1', kind: 'question', options: ['EU', 'US'], status: 'open', title: 'Region?' } as never;
    const note2 = parseDiscordRequestReply('2', [request, question].filter(Boolean) as never, (_id, _action, response) => ({ ok: true, answer: response }));
    expect(note2).toContain('US');
  });
});

describe('cross-session recall index', () => {
  it('indexes incrementally and ranks FTS matches', async () => {
    const store = new CoworkStore(path.join(ROOT, 'recall.json'));
    const agent = store.saveAgent({ name: 'recaller', systemPrompt: 'x' });
    const mail = store.saveConversation({ kind: 'dm', memberIds: [agent.id], title: 'Mail work' });
    const site = store.saveConversation({ kind: 'dm', memberIds: [agent.id], title: 'Site work' });
    store.appendMessage(mail.id, { role: 'agent', agentName: 'recaller', text: 'The mailcow TLS fix used SNI and verified port 993.', via: 'web' });
    store.appendMessage(site.id, { role: 'agent', agentName: 'recaller', text: 'Landing page hero shipped.', via: 'web' });

    const recall = new CoworkRecall(path.join(ROOT, 'recall.db'), store, hashingEmbedder());
    const first = recall.sync();
    expect(first.indexed).toBeGreaterThan(0);

    const hits = await recall.search('mailcow tls');
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0]!.conversationTitle).toBe('Mail work');
    expect(hits[0]!.snippet).toContain('mailcow');
    expect(hits[0]!.score).toBeGreaterThan(0);

    // Scoping narrows to one conversation.
    expect(await recall.search('mailcow', { conversationId: site.id })).toHaveLength(0);

    // A later message is picked up by the next incremental sync.
    store.appendMessage(mail.id, { role: 'agent', agentName: 'recaller', text: 'Also rotated the deploy key.', via: 'web' });
    await recall.search('deploy key'); // sync happens inside search
    const after = await recall.search('rotated deploy key');
    expect(after.some((h) => h.snippet.includes('rotated the deploy key'))).toBe(true);

    // No match → no hits (and no crash on odd queries).
    expect(await recall.search('zzzznotpresent')).toHaveLength(0);
    expect(await recall.search('!!!')).toHaveLength(0);
    recall.close();
  });

  it('is the path search_history uses when the index is present', async () => {
    const store = new CoworkStore(path.join(ROOT, 'recall-tool.json'));
    const agent = store.saveAgent({ name: 'tool-recaller', systemPrompt: 'x' });
    const other = store.saveConversation({ kind: 'dm', memberIds: [agent.id], title: 'Old chat' });
    const here = store.saveConversation({ kind: 'dm', memberIds: [agent.id], title: 'Current chat' });
    store.appendMessage(other.id, { role: 'agent', agentName: 'tool-recaller', text: 'We settled on SQLite FTS for recall.', via: 'web' });
    const recall = new CoworkRecall(path.join(ROOT, 'recall-tool.db'), store, hashingEmbedder());
    const { executeCoworkTool } = await import('../src/cowork/tools.js');
    const ctx = { cwd: WORKSPACE, skills: SkillStore.forProject(WORKSPACE) } as never;
    const scope = { store, agent, memory: new CoworkMemory(MemoryStore.forProject(ensureGituHome().workspace), path.basename(ensureGituHome().workspace)), conversationId: here.id, recall };
    const perms = { allowShell: false, allowWrites: false, allowConfig: false, chief: false, browser: false };
    const result = await executeCoworkTool(ctx, 'search_history', { query: 'SQLite FTS' }, perms, scope);
    expect(result.ok).toBe(true);
    expect(result.output).toContain('Old chat');
    expect(result.output).toContain('SQLite FTS');
    recall.close();
  });
});

describe('semantic recall over memory + bounded store + distillation', () => {
  it('archives the least valuable entries once the cap is exceeded', () => {
    const dir = path.join(ROOT, 'cap');
    mkdirSync(dir, { recursive: true });
    writeFileSync(path.join(dir, 'package.json'), '{"name":"cap"}');
    const store = MemoryStore.forProject(dir);
    store.add({ type: 'fact', claim: 'low value one', scope: 'cap', sourceType: 'model_inference', confidence: 0.4, importance: 0.2 });
    store.add({ type: 'fact', claim: 'low value two', scope: 'cap', sourceType: 'model_inference', confidence: 0.4, importance: 0.2 });
    store.add({ type: 'fact', claim: 'low value three', scope: 'cap', sourceType: 'model_inference', confidence: 0.4, importance: 0.2 });
    store.add({ type: 'decision', claim: 'verified decision worth keeping', scope: 'cap', sourceType: 'test', confidence: 0.9, importance: 0.9 });
    const result = store.enforceCap(2);
    expect(result.archived).toBe(2);
    const active = store.query({ limit: 50 }).filter((e) => e.status !== 'archived');
    expect(active).toHaveLength(2);
    expect(active.some((e) => e.claim.includes('verified decision'))).toBe(true);
  });

  it('records distilled claims as UNVERIFIED candidates, deduped', () => {
    const memory = new CoworkMemory(MemoryStore.forProject(ensureGituHome().workspace), path.basename(ensureGituHome().workspace));
    const agent = { name: 'distiller' } as never;
    const claim = 'The recall index lives in Cache/cowork-recall.db and indexes chat plus shared memory.';
    expect(memory.recordDistilled({ agent, type: 'decision', claim, source: 'distilled test' })).toBe(true);
    expect(memory.recordDistilled({ agent, type: 'decision', claim, source: 'distilled test' })).toBe(false); // dedupe
    const stored = MemoryStore.forProject(ensureGituHome().workspace).query({ limit: 500 }).find((e) => e.claim === claim);
    expect(stored).toBeTruthy();
    expect(stored!.status).toBe('candidate'); // model inference never arrives verified
    expect(stored!.sourceType).toBe('model_inference');
  });

  it('finds curated memory alongside transcripts in one search', async () => {
    const store = new CoworkStore(path.join(ROOT, 'recall-mem.json'));
    const agent = store.saveAgent({ name: 'mem-searcher', systemPrompt: 'x' });
    const conv = store.saveConversation({ kind: 'dm', memberIds: [agent.id], title: 'Work' });
    store.appendMessage(conv.id, { role: 'agent', agentName: 'mem-searcher', text: 'Transcript line about the deploy.', via: 'web' });
    const recall = new CoworkRecall(path.join(ROOT, 'recall-mem.db'), store, hashingEmbedder());
    recall.sync();
    recall.indexDoc({ kind: 'memory', key: 'memory:mem-x', title: 'decision', role: 'memory', ts: new Date().toISOString(), text: 'We standardised on SQLite FTS for recall.' });
    const hits = await recall.search('SQLite FTS');
    expect(hits.length).toBeGreaterThan(0);
    const memoryHit = hits.find((h) => h.conversationId === 'memory');
    expect(memoryHit).toBeTruthy();
    expect(memoryHit!.conversationTitle).toContain('memory ·');
    expect(recall.count('memory')).toBe(1);
    expect(recall.count('message')).toBeGreaterThan(0);
    recall.close();
  });

  it('distils a transcript into candidate memories through the LLM', async () => {
    updateWorkspaceSettings({ coworkLearning: { mode: 'proactive' } });
    const reply = JSON.stringify({ memories: [{ type: 'decision', claim: 'The team chose SQLite FTS5 for cross-session recall.' }] });
    const server = new GituServer({ cwd: WORKSPACE, port: 0, llm: { name: 'mock', complete: async () => reply } as unknown as LlmClient });
    const base = `http://127.0.0.1:${await server.start()}`;
    try {
      const agent = (await api(base, 'POST', '/api/cowork/agents', { name: 'distill-agent', systemPrompt: 'x' })).json.agent;
      const conv = (await api(base, 'POST', '/api/cowork/conversations', { kind: 'dm', memberIds: [agent.id] })).json.conversation;
      const store = (server as any).cowork();
      for (let i = 0; i < 10; i += 1) {
        store.appendMessage(conv.id, { role: 'user', text: `Question ${i} about the recall design?`, via: 'web' });
        store.appendMessage(conv.id, { role: 'agent', agentId: agent.id, agentName: 'distill-agent', text: `Answer ${i}: we use SQLite FTS5.`, via: 'web' });
      }
      const result = await (server as any).coworkLearnDistillTick();
      expect(result).toContain('distilled 1');
      const stored = MemoryStore.forProject(ensureGituHome().workspace).query({ limit: 500 }).find((e) => e.claim.includes('SQLite FTS5 for cross-session recall'));
      expect(stored).toBeTruthy();
      expect(stored!.status).toBe('candidate');
      // The distilled claim is immediately searchable through the recall index.
      const hits = await (server as any).coworkRecallIndex().search('SQLite FTS5 cross-session recall');
      expect(hits.some((h: { conversationId: string }) => h.conversationId === 'memory')).toBe(true);
      // A second run has nothing left to distil (cursor advanced).
      expect(await (server as any).coworkLearnDistillTick()).toBe('nothing to distill');
    } finally {
      await server.stop();
      updateWorkspaceSettings({ coworkLearning: undefined });
    }
  });
});

describe('staged skill-write approval (server flow)', () => {
  it('stages when approval is on, applies on approve, drops on reject', async () => {
    updateWorkspaceSettings({ coworkLearning: { skillApproval: true } });
    const server = new GituServer({ cwd: WORKSPACE, port: 0, llm: { name: 'mock', complete: async () => 'ok' } as unknown as LlmClient });
    const base = `http://127.0.0.1:${await server.start()}`;
    try {
      const agent = (await api(base, 'POST', '/api/cowork/agents', { name: 'stager', systemPrompt: 'x', allowConfig: true })).json.agent;
      const conv = (await api(base, 'POST', '/api/cowork/conversations', { kind: 'dm', memberIds: [agent.id] })).json.conversation;

      // The agent calls create_skill through the cowork tool surface.
      const ctx = { cwd: WORKSPACE, skills: SkillStore.forProject(ensureGituHome().workspace) } as never;
      const { executeCoworkTool } = await import('../src/cowork/tools.js');
      const scope = { store: (server as any).cowork(), agent, memory: new CoworkMemory(MemoryStore.forProject(ensureGituHome().workspace), path.basename(ensureGituHome().workspace)), conversationId: conv.id };
      const perms = { allowShell: false, allowWrites: false, allowConfig: true, chief: false, browser: false };
      const staged = await executeCoworkTool(ctx, 'create_skill', { name: 'approved-skill', description: 'd', instructions: '1. y' }, perms, scope);
      expect(staged.ok).toBe(true);
      expect(staged.output).toContain('STAGED');
      // Nothing landed in the store yet.
      expect(SkillStore.forProject(ensureGituHome().workspace).get('approved-skill')).toBeUndefined();

      const list = await api(base, 'GET', '/api/cowork/skills/pending');
      expect(list.json.pending).toHaveLength(1);
      const pendingId = list.json.pending[0].id;

      // Reject leaves nothing behind; a fresh stage then approves cleanly.
      await api(base, 'POST', `/api/cowork/skills/pending/${pendingId}/reject`, {});
      expect(SkillStore.forProject(ensureGituHome().workspace).get('approved-skill')).toBeUndefined();
      await executeCoworkTool(ctx, 'create_skill', { name: 'approved-skill', description: 'd', instructions: '1. y' }, perms, scope);
      const list2 = await api(base, 'GET', '/api/cowork/skills/pending');
      const approve = await api(base, 'POST', `/api/cowork/skills/pending/${list2.json.pending[0].id}/approve`, {});
      expect(approve.json.ok).toBe(true);
      expect(SkillStore.forProject(ensureGituHome().workspace).get('approved-skill')?.name).toBe('approved-skill');
      expect((await api(base, 'GET', '/api/cowork/skills/pending')).json.pending).toHaveLength(0);
    } finally {
      await server.stop();
      updateWorkspaceSettings({ coworkLearning: undefined });
    }
  });
});
