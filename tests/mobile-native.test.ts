import { afterAll, describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { GituServer } from '../src/server/server.js';
import { ScriptedMockLlm } from '../src/llm/llm.js';
import { CoworkStore } from '../src/cowork/store.js';
import { AgentApi, ApiError, mergeMessages, type CoworkSnapshot, type Run, type RunPage } from '../apps/android/src/api.js';

const root = mkdtempSync(path.join(tmpdir(), 'gitu-native-mobile-'));
process.env['AGENT_GITU_HOME'] = path.join(root, 'home');
const project = path.join(root, 'project');
mkdirSync(project); writeFileSync(path.join(project, 'package.json'), JSON.stringify({ name: 'native-fixture' }));
writeFileSync(path.join(project, 'note.txt'), 'Original note');
mkdirSync(path.join(project, '.hermes')); writeFileSync(path.join(project, '.hermes', 'private.txt'), 'private');
const key = 'native-mobile-isolated-test-access-key';
const server = new GituServer({ cwd: project, accessKey: key, port: 0, autoInstallLsp: false, llm: new ScriptedMockLlm([() => 'Prepared the launch plan.']) });
let api: AgentApi;
afterAll(async () => { await server.stop(); rmSync(root, { recursive: true, force: true }); });

describe('native phone workspace against the real server', () => {
  it('authenticates the adapter and preserves explicit write consent and revisions', async () => {
    const port = await server.start();
    api = new AgentApi({ name: 'Fixture', kind: 'computer', url: `http://127.0.0.1:${port}`, key });
    const bad = new AgentApi({ ...api.connection, key: 'incorrect-key-with-more-than-32-characters' });
    await expect(bad.request('/api/mobile/files')).rejects.toMatchObject({ status: 401 });
    const listing = await api.request<{ entries: { name: string }[] }>(`/api/mobile/files?root=${encodeURIComponent(project)}`);
    expect(listing.entries.map(entry => entry.name)).toContain('note.txt');
    expect(listing.entries.map(entry => entry.name)).not.toContain('.hermes');
    const note = await api.request<{ content: string; revision: string }>('/api/mobile/files?path=note.txt');
    expect(note.content).toBe('Original note');
    await expect(api.request('/api/mobile/files', 'PUT', { root: project, path: 'note.txt', revision: note.revision, content: 'No consent' })).rejects.toMatchObject({ status: 403 });
    writeFileSync(path.join(project, 'note.txt'), 'Agent changed the note');
    await expect(api.request('/api/mobile/files', 'PUT', { root: project, path: 'note.txt', revision: note.revision, content: 'Stale phone edit', approved: true })).rejects.toMatchObject({ status: 409 });
    expect(readFileSync(path.join(project, 'note.txt'), 'utf8')).toBe('Agent changed the note');
    const current = await api.request<{ revision: string }>('/api/mobile/files?path=note.txt');
    await api.request('/api/mobile/files', 'PUT', { root: project, path: 'note.txt', revision: current.revision, content: 'Confirmed phone edit', approved: true });
    expect(readFileSync(path.join(project, 'note.txt'), 'utf8')).toBe('Confirmed phone edit');
  }, 30000);

  it('rejects private state, traversal, unknown roots, and symlink escapes', async () => {
    for (const relative of ['../outside.txt', '.hermes/private.txt']) await expect(api.request(`/api/mobile/files?path=${encodeURIComponent(relative)}`)).rejects.toBeInstanceOf(ApiError);
    const unknown = path.join(root, 'unknown'); mkdirSync(unknown); writeFileSync(path.join(unknown, 'package.json'), '{}');
    await expect(api.request(`/api/mobile/files?root=${encodeURIComponent(unknown)}`)).rejects.toThrow(/known project/);
    // Junctions work without Windows Developer Mode and are rejected like symlinks.
    symlinkSync(unknown, path.join(project, 'escape'), process.platform === 'win32' ? 'junction' : 'dir');
    await expect(api.request('/api/mobile/files?path=escape/package.json')).rejects.toThrow(/outside|symlink/i);
  });

  it('shows topic messages and checkpoint accomplishments without duplicating edited rows', async () => {
    const store = (server as unknown as { cowork: () => CoworkStore }).cowork();
    const agent = store.saveAgent({ name: 'Test teammate', systemPrompt: 'Test only.' });
    const conv = store.saveConversation({ kind: 'dm', memberIds: [agent.id] });
    const topic = store.addThread({ conversationId: conv.id, title: 'Launch topic' });
    store.appendMessage(conv.id, { role: 'user', via: 'web', text: 'Main conversation' });
    store.appendMessage(conv.id, { role: 'agent', agentId: agent.id, via: 'web', text: 'Launch is ready', threadId: topic.id, checkpoint: { number: 1, accomplished: 'Prepared the launch plan.', next: 'Review it.' } });
    const message = store.appendMessage(conv.id, { role: 'user', via: 'web', text: 'My launch note', threadId: topic.id, status: 'sent' });
    const endpoint = `/api/cowork/conversations/${conv.id}/messages?thread=${topic.id}`;
    const snapshot = await api.request<CoworkSnapshot>(endpoint);
    expect(snapshot.messages.map(row => row.text)).toEqual(['Launch is ready', 'My launch note']);
    expect(snapshot.messages[0]?.checkpoint?.accomplished).toBe('Prepared the launch plan.');
    await api.request(`/api/cowork/conversations/${conv.id}/messages/${message.id}`, 'PATCH', { text: 'Launch updated', revision: message.revision });
    const changes = await api.request<CoworkSnapshot>(`${endpoint}&after=${message.seq}&change=${snapshot.messageChangeSeq}`);
    expect(mergeMessages(snapshot.messages, changes).map(row => row.text)).toEqual(['Launch is ready', 'Launch updated']);
    await api.request(`/api/cowork/conversations/${conv.id}/messages/${message.id}`, 'DELETE');
    const removed = await api.request<CoworkSnapshot>(`${endpoint}&after=${message.seq}&change=${changes.messageChangeSeq}`);
    expect(mergeMessages(mergeMessages(snapshot.messages, changes), removed).map(row => row.text)).toEqual(['Launch is ready']);
  });

  it('pages real run history using event IDs, and returns no duplicates on reconnect', async () => {
    const created = await api.request<{ runId: string }>('/api/runs', 'POST', { goal: 'Prepare the launch', mode: 'chat', review: false });
    const deadline = Date.now() + 30000;
    while (Date.now() < deadline) {
      const run = await api.request<Run>(`/api/runs/${created.runId}`);
      if (run.status !== 'running') break;
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    const first = await api.request<RunPage>(`/api/mobile/runs/${created.runId}/events?after=-1`);
    expect(first.session.status).toBe('completed');
    expect(first.events.some(event => event.text.includes('Prepared the launch plan.'))).toBe(true);
    const internals = server as unknown as { sessions: Map<string, { events: { i: number; t: string; text: string }[] }> };
    const session = internals.sessions.get(created.runId)!;
    for (let i = 1; i <= 240; i++) session.events.push({ i: first.cursor + i * 2, t: new Date().toISOString(), text: `say History ${i}` });
    const page = await api.request<RunPage>(`/api/mobile/runs/${created.runId}/events?after=${first.cursor}`);
    expect(page.events).toHaveLength(200); expect(page.more).toBe(true);
    const next = await api.request<RunPage>(`/api/mobile/runs/${created.runId}/events?after=${page.cursor}`);
    expect(next.events).toHaveLength(40); expect(next.more).toBe(false);
    const reconnect = await api.request<RunPage>(`/api/mobile/runs/${created.runId}/events?after=${next.cursor}`);
    expect(reconnect.events).toEqual([]);
    await expect(api.request(`/api/mobile/runs/${created.runId}/events?after=NaN`)).rejects.toThrow(/cursor/);
  }, 45000);

  it('lets the phone browse tagged folders and enforces their write grants', async () => {
    const runs = await api.request<Run[]>('/api/runs');
    const run = runs[0]!;
    const tagged = path.join(root, 'tagged-reference'); mkdirSync(tagged);
    writeFileSync(path.join(tagged, 'reference.txt'), 'Reference content');
    await api.request(`/api/runs/${run.runId}/folders`, 'POST', { path: tagged });
    const route = `/api/mobile/files?root=${encodeURIComponent(tagged)}&path=reference.txt`;
    const read = await api.request<{ writable: boolean; revision: string; content: string }>(route);
    expect(read.content).toBe('Reference content'); expect(read.writable).toBe(false);
    const edit = { root: tagged, path: 'reference.txt', revision: read.revision, content: 'Permitted edit', approved: true };
    await expect(api.request('/api/mobile/files', 'PUT', edit)).rejects.toMatchObject({ status: 403 });
    await api.request(`/api/runs/${run.runId}/folders`, 'PATCH', { path: tagged, writable: true });
    await api.request('/api/mobile/files', 'PUT', edit);
    expect(readFileSync(path.join(tagged, 'reference.txt'), 'utf8')).toBe('Permitted edit');
    await api.request(`/api/runs/${run.runId}/folders`, 'DELETE', { path: tagged });
    await expect(api.request(route)).rejects.toThrow(/known project/);
  }, 45000);

  it('accepts a phone Cowork message and makes a lost-response retry idempotent', async () => {
    const agent = await api.request<{ agent: { id: string } }>('/api/cowork/agents', 'POST', { name: 'Phone teammate', systemPrompt: 'Test only.' });
    const created = await api.request<{ conversation: { id: string } }>('/api/cowork/conversations', 'POST', { kind: 'dm', memberIds: [agent.agent.id] });
    const endpoint = `/api/cowork/conversations/${created.conversation.id}/messages`;
    const body = { id: 'phone-retry-stable-id', text: 'This text was sent from the phone composer.', threadId: null, files: [] };
    await api.request(endpoint, 'POST', body);
    await api.request(endpoint, 'POST', body);
    const snapshot = await api.request<CoworkSnapshot>(endpoint);
    expect(snapshot.messages.filter(message => message.id === body.id).map(message => message.text)).toEqual([body.text]);
    await api.request(`/api/cowork/conversations/${created.conversation.id}/stop`, 'POST');
  });
});
