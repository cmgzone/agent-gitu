import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { CoworkStore } from '../src/cowork/store.js';
import { executeCoworkTool } from '../src/cowork/tools.js';
import type { CoworkMemory } from '../src/cowork/memory.js';
import type { ToolContext } from '../src/tools/tools.js';

const homes: string[] = [];
function setup() {
  const home = mkdtempSync(path.join(tmpdir(), 'cowork-widgets-'));
  homes.push(home);
  const file = path.join(home, 'cowork.json');
  const store = new CoworkStore(file);
  const owner = store.saveAgent({ name: 'Designer', systemPrompt: 'Design.', chiefOfStaff: false });
  const other = store.saveAgent({ name: 'Researcher', systemPrompt: 'Research.', chiefOfStaff: false });
  const chief = store.saveAgent({ name: 'Chief', systemPrompt: 'Coordinate.', chiefOfStaff: true });
  const conv = store.saveConversation({ kind: 'group', memberIds: [owner.id, other.id, chief.id], chiefId: chief.id });
  const context = {} as ToolContext;
  const memory = {} as CoworkMemory;
  const perms = { allowShell: false, allowWrites: false, allowConfig: false, chief: false, browser: false };
  const run = (agent: typeof owner, params: Record<string, unknown>, conversationId = conv.id) => executeCoworkTool(context, 'widget_manage', params, { ...perms, chief: agent.chiefOfStaff }, { store, agent, memory, conversationId });
  return { file, store, owner, other, chief, conv, run };
}
afterEach(() => { homes.splice(0).forEach(home => rmSync(home, { recursive: true, force: true })); });

describe('durable rich cowork widgets', () => {
  it('creates independent mini app cards even when their requested titles match',async()=>{
    const {run,owner,store,conv}=setup();
    const params={action:'create',title:'My app',kind:'app',data:{html:'<button>Run</button>',state:{count:0}}};
    expect((await run(owner,params)).ok).toBe(true);expect((await run(owner,params)).ok).toBe(true);
    expect(store.widgets(conv.id)).toHaveLength(2);expect(store.widgets(conv.id)[0]?.id).not.toBe(store.widgets(conv.id)[1]?.id);
  });
  it('persists coordinate-only maps and sanitizes coordinates, zoom and map images', () => {
    const { file, store, owner, conv } = setup();
    const widget = store.saveWidget({ conversationId: conv.id, title: 'Travel plan', kind: 'rich', createdByAgentId: owner.id, data: { items: [
      { type: 'map', lat: -4.0435, lng: 39.6682, zoom: 13, title: 'Mombasa' },
      { type: 'map', lat: 100, lon: 39 }, { type: 'map', lat: 0, lon: 181 }, { type: 'map', lat: '', lon: null },
      { type: 'map', q: 'Nairobi', zoom: 50, imageUrl: 'https://example.com/map.png', url: 'javascript:alert(1)' },
    ] } });
    const restored = new CoworkStore(file).getWidget(widget.id)!;
    expect(restored.data['items']).toEqual([
      { type: 'map', url: '', title: 'Mombasa', caption: '', lat: -4.0435, lon: 39.6682, zoom: 13 },
      { type: 'map', url: '', title: '', caption: '', q: 'Nairobi', zoom: 19, imageUrl: 'https://example.com/map.png' },
    ]);
  });

  it('persists a real image, video, file, website, dashboard and schedule payload', () => {
    const { file, store, owner, conv } = setup();
    const artifact = store.addArtifact({ conversationId: conv.id, agentId: owner.id, name: 'report.md', mime: 'text/markdown', dataBase64: Buffer.from('# Ready').toString('base64') });
    const widget = store.saveWidget({ conversationId: conv.id, title: 'Review', kind: 'rich', createdByAgentId: owner.id, data: {
      text: 'Review the latest assets.', stats: [{ label: 'Files', value: '1' }], schedule: [{ label: 'Design review', when: '2026-10-10 09:00 EAT', note: 'With the team', url: 'https://example.com/calendar' }],
      items: [
        { type: 'image', url: 'https://example.com/image.png', title: 'Image' },
        { type: 'video', url: 'https://example.com/video.mp4', title: 'Video', poster: 'https://example.com/poster.png' },
        { type: 'file', url: `/api/cowork/artifacts/${artifact.id}`, title: artifact.name, mime: artifact.mime, size: artifact.size },
        { type: 'link', url: 'https://example.com/review', title: 'Review page' },
      ],
    } });
    const restored = new CoworkStore(file).getWidget(widget.id)!;
    expect(restored.kind).toBe('rich');
    expect(restored.createdByAgentId).toBe(owner.id);
    expect(restored.data).toEqual(widget.data);
    expect(restored.data['items']).toHaveLength(4);
    expect(restored.data['stats']).toEqual([{ label: 'Files', value: '1' }]);
    expect(restored.data['schedule']).toEqual([{ label: 'Design review', when: '2026-10-10 09:00 EAT', note: 'With the team', url: 'https://example.com/calendar' }]);
    expect(store.getConversation(conv.id)?.schedule).toBeUndefined();
  });

  it('drops executable media URLs and unsupported content while keeping artifact links', () => {
    const { store, owner, conv } = setup();
    const widget = store.saveWidget({ conversationId: conv.id, title: 'Safe content', kind: 'rich', createdByAgentId: owner.id, data: {
      html: '<script>run()</script>', items: [
        { type: 'image', url: 'javascript:alert(1)' }, { type: 'video', url: '//evil.test/a.mp4' },
        { type: 'file', url: 'file:///C:/secret' }, { type: 'link', url: 'https://user:secret@example.com' },
        { type: 'html', url: 'https://example.com' }, { type: 'file', url: '/api/cowork/artifacts/ca-safe?inline=1', title: 'Safe file', size: -1 },
      ], schedule: [{ label: 'Review', when: 'Tomorrow', url: 'javascript:alert(1)' }],
    } });
    expect(widget.data['items']).toEqual([{ type: 'file', url: '/api/cowork/artifacts/ca-safe?inline=1', title: 'Safe file', caption: '', mime: '' }]);
    expect(widget.data['html']).toBeUndefined();
    expect(widget.data['schedule']).toEqual([{ label: 'Review', when: 'Tomorrow', note: '', url: '' }]);
  });

  it('keeps all legacy widget kinds readable after a restart', () => {
    const { file, store, conv } = setup();
    const samples = [
      { kind: 'text', data: { text: 'Ready' } }, { kind: 'stats', data: { items: [{ label: 'Tests', value: '12/12' }] } },
      { kind: 'list', data: { items: [{ text: 'Review', done: true }] } }, { kind: 'progress', data: { label: 'Build', value: 42 } },
      { kind: 'links', data: { items: [{ label: 'Preview', url: 'https://example.com/' }] } },
    ] as const;
    samples.forEach(sample => store.saveWidget({ conversationId: conv.id, title: sample.kind, kind: sample.kind, data: sample.data }));
    expect(new CoworkStore(file).widgets(conv.id).map(widget => ({ kind: widget.kind, data: widget.data }))).toEqual(samples);
  });

  it('preserves an author when a chief updates their card and denies another teammate', async () => {
    const { store, owner, other, chief, conv, run } = setup();
    expect((await run(owner, { action: 'create', title: 'Metrics', kind: 'stats', data: { items: [{ label: 'Files', value: '2' }] } })).ok).toBe(true);
    const original = store.widgets(conv.id)[0]!;
    const denied = await run(other, { action: 'update', id: original.id, data: { items: [{ label: 'Files', value: '999' }] } });
    expect(denied.ok).toBe(false);
    expect(denied.output).toContain('another teammate');
    expect((await run(other, { action: 'delete', id: original.id })).ok).toBe(false);
    expect((await run(chief, { action: 'update', id: original.id, data: { items: [{ label: 'Files', value: '3' }] } })).ok).toBe(true);
    const updated = store.getWidget(original.id)!;
    expect(updated.createdByAgentId).toBe(owner.id);
    expect(updated.kind).toBe('stats');
    expect(updated.title).toBe('Metrics');
    expect(updated.data).toEqual({ items: [{ label: 'Files', value: '3' }] });
    expect((await run(owner, { action: 'update', id: original.id, title: 'Current metrics' })).ok).toBe(true);
    expect(updated.data).toEqual({ items: [{ label: 'Files', value: '3' }] });
    expect((await run(owner, { action: 'delete', id: original.id })).ok).toBe(true);
    expect(store.widgets(conv.id)).toHaveLength(0);
  });

  it('rejects missing and cross-conversation update IDs without creating cards', async () => {
    const { store, owner, chief, conv, run } = setup();
    const separate = store.saveConversation({ kind: 'dm', memberIds: [owner.id] });
    const foreign = store.saveWidget({ conversationId: separate.id, title: 'Foreign', kind: 'text', data: { text: 'Private' }, createdByAgentId: owner.id });
    expect((await run(chief, { action: 'update', id: foreign.id, title: 'Overwrite', data: { text: 'Wrong' } })).ok).toBe(false);
    expect((await run(owner, { action: 'update', id: 'cw-missing', title: 'New' })).ok).toBe(false);
    expect((await run(owner, { action: 'create', title: 'Bad kind', kind: 'iframe' })).ok).toBe(false);
    expect(store.widgets(conv.id)).toHaveLength(0);
    expect(store.getWidget(foreign.id)?.title).toBe('Foreign');
    expect(() => store.saveWidget({ conversationId: conv.id, id: foreign.id, title: 'Foreign', kind: 'text', data: {} })).toThrow(/not found/i);
    expect(() => store.saveWidget({ conversationId: separate.id, title: 'Outsider', kind: 'text', data: {}, createdByAgentId: chief.id })).toThrow(/not in this conversation/i);
  });
});
