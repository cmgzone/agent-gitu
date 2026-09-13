import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { unzipSync, strFromU8 } from 'fflate';
import { toolCreateDocument } from '../src/tools/productivity.js';
import { ProjectGuard } from '../src/guard/project-guard.js';
import { CoworkStore } from '../src/cowork/store.js';
import { executeCoworkTool } from '../src/cowork/tools.js';
import type { CoworkMemory } from '../src/cowork/memory.js';
import { toolScheduleManage } from '../src/cron/tools.js';
import { CronStore, parseEvery } from '../src/cron/scheduler.js';

const root = mkdtempSync(path.join(tmpdir(), 'gitu-productivity-'));
writeFileSync(path.join(root, 'package.json'), '{"name":"productivity-test"}');
const ctx = { cwd: root, guard: ProjectGuard.detect(root) };
afterAll(() => rmSync(root, { recursive: true, force: true }));
const sections = Array.from({ length: 8 }, (_, i) => ({ heading: `Page ${i + 1}`, body: `Verified source material for section ${i + 1}.`, bullets: ['First finding', 'Next action'] }));

describe('bundled productivity tools', () => {
  it('creates an eight-page PDF without a shell or private computer', async () => {
    const result = await toolCreateDocument(ctx, { path: 'brief.pdf', title: 'Research brief', sections });
    expect(result.ok, result.output).toBe(true);
    expect((await PDFDocument.load(readFileSync(path.join(root, 'brief.pdf')))).getPageCount()).toBe(8);
  });
  it('preserves overflow content on continuation pages', async () => {
    const result = await toolCreateDocument(ctx, { path: 'long.pdf', title: 'Long brief', sections: [{ heading: 'Long', body: 'A complete paragraph of source material. '.repeat(600) }] });
    expect(result.ok, result.output).toBe(true);
    expect((await PDFDocument.load(readFileSync(path.join(root, 'long.pdf')))).getPageCount()).toBeGreaterThan(1);
  });
  it.each(['pptx', 'docx', 'xlsx'])('writes a real %s package containing the supplied content', async format => {
    const result = await toolCreateDocument(ctx, { path: `brief.${format}`, title: 'Research brief', sections, rows: [['Name', 'Count'], ['Finding', 12]] });
    expect(result.ok, result.output).toBe(true);
    const zip = unzipSync(readFileSync(path.join(root, `brief.${format}`)));
    expect(zip['[Content_Types].xml']).toBeDefined();
    const xml = Object.entries(zip).filter(([name]) => name.endsWith('.xml')).map(([, data]) => strFromU8(data)).join('\n');
    expect(xml).toContain(format === 'xlsx' ? 'Finding' : 'Verified source material');
    if (format === 'pptx') expect(Object.keys(zip).filter(name => /^ppt\/slides\/slide\d+\.xml$/.test(name))).toHaveLength(8);
  });
  it('respects the workspace boundary and Cowork write permissions', async () => {
    expect((await toolCreateDocument(ctx, { path: '../outside.pdf', title: 'Denied', sections })).ok).toBe(false);
    expect((await executeCoworkTool(ctx, 'create_document', { path: 'denied.pdf', title: 'Denied', sections }, { allowShell: false, allowWrites: false, allowConfig: false, chief: false, browser: false })).ok).toBe(false);
  });
  it('presents Cowork documents and persists a recurring schedule without duplicates', async () => {
    const file = path.join(root, 'cowork.json');
    const store = new CoworkStore(file);
    const agent = store.saveAgent({ name: 'Writer', systemPrompt: 'Write', allowWrites: true });
    const conversation = store.saveConversation({ kind: 'dm', memberIds: [agent.id] });
    const scope = { store, agent, memory: {} as CoworkMemory, conversationId: conversation.id, artifactIds: [] as string[] };
    const perms = { allowShell: false, allowWrites: true, allowConfig: false, chief: false, browser: false };
    const created = await executeCoworkTool(ctx, 'create_document', { path: 'cowork.pdf', title: 'Brief', sections }, perms, scope);
    expect(created.ok, created.output).toBe(true);
    expect(scope.artifactIds).toHaveLength(1);
    const create = () => executeCoworkTool(ctx, 'schedule_manage', { action: 'create', every: '1d', goal: 'Prepare a daily brief' }, perms, scope);
    expect((await create()).ok).toBe(true);
    const first = store.getConversation(conversation.id)!.schedule;
    expect((await create()).ok).toBe(true);
    expect(new CoworkStore(file).getConversation(conversation.id)!.schedule).toEqual(first);
    expect((await executeCoworkTool(ctx, 'schedule_manage', { action: 'pause' }, perms, scope)).ok).toBe(true);
    expect(store.getConversation(conversation.id)!.schedule!.enabled).toBe(false);
  });
  it('creates, reuses, pauses and deletes main-agent recurring jobs', () => {
    const params = { action: 'create', every: '1w', goal: 'Weekly report' };
    expect(toolScheduleManage(ctx, params).ok).toBe(true);
    expect(toolScheduleManage(ctx, params).ok).toBe(true);
    const jobs = CronStore.forProject(root).jobs();
    expect(jobs).toHaveLength(1);
    expect(parseEvery('1d')).toBe(86_400_000);
    expect(toolScheduleManage(ctx, { action: 'pause', id: jobs[0]!.id }).ok).toBe(true);
    expect(CronStore.forProject(root).jobs()[0]!.enabled).toBe(false);
    expect(toolScheduleManage(ctx, { action: 'delete', id: jobs[0]!.id }).ok).toBe(true);
    expect(CronStore.forProject(root).jobs()).toEqual([]);
  });
});
