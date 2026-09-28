import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  FileKnowledgeStore,
  contentRevision,
  extractImplementationFacts,
  knowledgeEligible,
  normalizeKnowledgePath,
} from '../src/context/file-knowledge.js';
import { Executor } from '../src/executor/executor.js';
import { LoopDetector } from '../src/loop/loop-detector.js';
import { PolicyEngine } from '../src/policy/policy.js';
import { ProjectGuard } from '../src/guard/project-guard.js';
import { TaskLedger } from '../src/ledger/task-ledger.js';
import { buildStateMessage } from '../src/agent/prompt.js';
import { buildModelContext } from '../src/context/model-context.js';
import { sectionOfMessage, renderEfficiencySummary, RunTelemetry } from '../src/agent/telemetry.js';
import { SubAgentRunner } from '../src/agent/subagent.js';
import type { LlmClient, LlmMessage } from '../src/llm/llm.js';

function makeProject(name: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `gitu-file-knowledge-${name}-`));
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: 'fk-test', scripts: { test: 'vitest' } }));
  return dir;
}

const WIDGET_V1 = [
  'export interface Widget {',
  '  readonly id: string;',
  '  readonly size: number;',
  '}',
  "export type WidgetKind = 'small' | 'large';",
  'export function buildWidget(id: string): Widget {',
  '  return { id, size: 1 };',
  '}',
  'export const MAX_WIDGETS: number = 10;',
].join('\n');

describe('implementation fact extraction', () => {
  it('extracts exported interfaces with member names, types, functions, and constants', () => {
    const { facts, symbols } = extractImplementationFacts('src/widget.ts', WIDGET_V1);
    expect(facts.some((f) => f.includes('export interface Widget') && f.includes('fields: id, size'))).toBe(true);
    expect(facts.some((f) => f.includes("export type WidgetKind = 'small' | 'large'"))).toBe(true);
    expect(facts.some((f) => f.startsWith('export function buildWidget(id: string)'))).toBe(true);
    expect(facts.some((f) => f.includes('export const MAX_WIDGETS'))).toBe(true);
    expect(symbols).toContain('Widget');
    expect(symbols).toContain('WidgetKind');
    expect(symbols).toContain('buildWidget');
  });

  it('extracts package.json scripts and top-level keys', () => {
    const { facts } = extractImplementationFacts('package.json', JSON.stringify({ name: 'x', scripts: { test: 'vitest' } }));
    expect(facts.some((f) => f.includes('top-level keys: name, scripts'))).toBe(true);
    expect(facts.some((f) => f.includes('scripts: test'))).toBe(true);
  });

  it('is selective about exported consts', () => {
    const { facts } = extractImplementationFacts('src/a.ts', "export const helper = (x: number) => x;\nexport const LIMIT = 5;\n");
    expect(facts.some((f) => f.includes('LIMIT'))).toBe(true);
    expect(facts.some((f) => f.includes('helper'))).toBe(false);
  });
});

describe('path and eligibility helpers', () => {
  it('normalizes separators and dot prefixes', () => {
    expect(normalizeKnowledgePath('.\\src\\a.ts')).toBe('src/a.ts');
    expect(normalizeKnowledgePath('src/a.ts')).toBe('src/a.ts');
  });

  it('accepts code files and rejects others', () => {
    expect(knowledgeEligible('src/a.ts')).toBe(true);
    expect(knowledgeEligible('readme.md')).toBe(false);
    expect(knowledgeEligible('img.png')).toBe(false);
  });

  it('hashes content into a stable revision', () => {
    expect(contentRevision('abc')).toBe(contentRevision('abc'));
    expect(contentRevision('abc')).not.toBe(contentRevision('abd'));
    expect(contentRevision('abc').startsWith('sha256:')).toBe(true);
  });
});

describe('FileKnowledgeStore', () => {
  it('persists knowledge across store instances (restart survival)', () => {
    const dir = makeProject('persist');
    fs.mkdirSync(path.join(dir, 'src'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'src', 'widget.ts'), WIDGET_V1);
    const st = fs.statSync(path.join(dir, 'src', 'widget.ts'));

    const store1 = FileKnowledgeStore.forRepo(dir);
    store1.record({ path: 'src/widget.ts', content: WIDGET_V1, size: st.size, mtimeMs: st.mtimeMs });

    // A brand-new instance (simulated restart) loads the same facts from disk.
    const store2 = FileKnowledgeStore.forRepo(dir);
    const entry = store2.get('src/widget.ts');
    expect(entry).toBeDefined();
    expect(entry!.facts.some((f) => f.includes('export interface Widget'))).toBe(true);
    expect(entry!.revision).toBe(contentRevision(WIDGET_V1));
  });

  it('is idempotent per revision: re-recording unchanged content keeps one entry', () => {
    const dir = makeProject('idempotent');
    const store = FileKnowledgeStore.forRepo(dir);
    const first = store.record({ path: 'src/a.ts', content: 'export const A = 1;\n', size: 20, mtimeMs: 1 });
    const second = store.record({ path: 'src/a.ts', content: 'export const A = 1;\n', size: 20, mtimeMs: 2 });
    expect(second).toBe(first);
    expect(store.size()).toBe(1);
  });

  it('renders fresh entries, drops stale ones, and reports the drop', () => {
    const dir = makeProject('stale');
    fs.mkdirSync(path.join(dir, 'src'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'src', 'fresh.ts'), 'export const FRESH = 1;\n');
    const stFresh = fs.statSync(path.join(dir, 'src', 'fresh.ts'));

    const store = FileKnowledgeStore.forRepo(dir);
    store.record({ path: 'src/fresh.ts', content: 'export const FRESH = 1;\n', size: stFresh.size, mtimeMs: stFresh.mtimeMs });
    store.record({ path: 'src/gone.ts', content: 'export const GONE = 1;\n', size: 24, mtimeMs: 1 });

    const rendered = store.render();
    expect(rendered).toContain('FILE KNOWLEDGE');
    expect(rendered).toContain('src/fresh.ts');
    expect(rendered).toContain('dropped as STALE');

    // After the file changes on disk, its own facts are omitted as stale too.
    fs.writeFileSync(path.join(dir, 'src', 'fresh.ts'), 'export const CHANGED = 2;\n');
    const afterChange = store.render();
    expect(afterChange).not.toContain('src/fresh.ts');
  });

  it('invalidates on demand and re-learns the new revision', () => {
    const dir = makeProject('invalidate');
    const store = FileKnowledgeStore.forRepo(dir);
    store.record({ path: 'src/a.ts', content: 'export const A = 1;\n', size: 20, mtimeMs: 1 });
    expect(store.invalidate('src/a.ts')).toBe(true);
    expect(store.get('src/a.ts')).toBeUndefined();

    store.record({ path: 'src/a.ts', content: 'export const B = 2;\n', size: 20, mtimeMs: 2 });
    expect(store.get('src/a.ts')!.facts.some((f) => f.includes('export const B'))).toBe(true);
  });

  it('orders candidates first when rendering', () => {
    const dir = makeProject('candidates');
    fs.mkdirSync(path.join(dir, 'src'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'src', 'older.ts'), 'export const OLDER = 1;\n');
    fs.writeFileSync(path.join(dir, 'src', 'newer.ts'), 'export const NEWER = 1;\n');
    const stOlder = fs.statSync(path.join(dir, 'src', 'older.ts'));
    const stNewer = fs.statSync(path.join(dir, 'src', 'newer.ts'));
    const store = FileKnowledgeStore.forRepo(dir);
    store.record({ path: 'src/older.ts', content: 'export const OLDER = 1;\n', size: stOlder.size, mtimeMs: stOlder.mtimeMs });
    store.record({ path: 'src/newer.ts', content: 'export const NEWER = 1;\n', size: stNewer.size, mtimeMs: stNewer.mtimeMs });
    const rendered = store.render({ candidates: ['src/newer.ts'], maxFiles: 1 });
    expect(rendered).toContain('src/newer.ts');
    expect(rendered).not.toContain('src/older.ts');
  });
});

describe('executor learns and invalidates knowledge', () => {
  it('learns on read, re-learns on write, invalidates on edit', async () => {
    const dir = makeProject('executor');
    fs.mkdirSync(path.join(dir, 'src'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'src', 'widget.ts'), WIDGET_V1);
    const guard = ProjectGuard.detect(dir);
    const ledger = TaskLedger.create({ repoRoot: dir, goal: 'learn facts', project: guard.lock, mode: 'fast' });
    const executor = new Executor(guard, ledger, new PolicyEngine(true), new LoopDetector());

    // read_file teaches the exact revision's facts.
    await executor.execute({ tool: 'read_file', params: { path: 'src/widget.ts' }, reason: 'inspect', expected: 'content' });
    const learned = executor.fileKnowledge.get('src/widget.ts');
    expect(learned).toBeDefined();
    expect(learned!.revision).toBe(contentRevision(WIDGET_V1));
    expect(learned!.facts.some((f) => f.includes('export interface Widget'))).toBe(true);

    // write_file re-learns from the new content.
    const v2 = `${WIDGET_V1.replace('size: number', 'size: string')}\nexport const MAX_WIDGETS_V2 = 20;\n`;
    await executor.execute({ tool: 'write_file', params: { path: 'src/widget.ts', content: v2 }, reason: 'evolve', expected: 'ok' });
    const updated = executor.fileKnowledge.get('src/widget.ts');
    expect(updated!.revision).not.toBe(learned!.revision);
    expect(updated!.facts.some((f) => f.includes('MAX_WIDGETS_V2'))).toBe(true);

    // apply_edit invalidates until the next read proves the new revision.
    await executor.execute({ tool: 'apply_edit', params: { path: 'src/widget.ts', oldString: 'MAX_WIDGETS_V2', newString: 'MAX_ITEMS_V3' }, reason: 'rename', expected: 'ok' });
    expect(executor.fileKnowledge.get('src/widget.ts')).toBeUndefined();

    // The next read re-proves the current revision.
    await executor.execute({ tool: 'read_file', params: { path: 'src/widget.ts' }, reason: 're-prove', expected: 'content' });
    expect(executor.fileKnowledge.get('src/widget.ts')!.facts.some((f) => f.includes('MAX_ITEMS_V3'))).toBe(true);
  }, 30000);
});

describe('FILE KNOWLEDGE in prompts and context', () => {
  it('buildStateMessage includes the section only when provided', () => {
    const dir = makeProject('state');
    const guard = ProjectGuard.detect(dir);
    const ledger = TaskLedger.create({ repoRoot: dir, goal: 'state test', project: guard.lock, mode: 'fast' });
    const withKnowledge = buildStateMessage(ledger, undefined, undefined, undefined, 'FILE KNOWLEDGE (durable implementation facts):\n- src/a.ts');
    expect(withKnowledge).toContain('FILE KNOWLEDGE');
    expect(withKnowledge).toContain('- src/a.ts');
    const without = buildStateMessage(ledger);
    expect(without).not.toContain('FILE KNOWLEDGE');
  });

  it('is classified as a protected section', () => {
    expect(sectionOfMessage({ role: 'user', content: 'FILE KNOWLEDGE (durable implementation facts):\n- src/a.ts' })).toBe('protected');
  });

  it('survives model-context trimming that drops lower-priority tiers', () => {
    const assembled = buildModelContext({
      system: 'SYS',
      fileKnowledge: 'FILE KNOWLEDGE (durable implementation facts):\n- src/a.ts\n    export const A = 1;',
      contextPack: `CONTEXT PACK\n${'filler '.repeat(2000)}`,
      conversationHistory: Array.from({ length: 14 }, (_, i) => ({ role: 'user' as const, content: `history ${i}` })),
      budget: { maxChars: 3_000 },
    });
    const texts = assembled.messages.map((m) => (typeof m.content === 'string' ? m.content : ''));
    expect(texts.some((t) => t.startsWith('FILE KNOWLEDGE'))).toBe(true);
    expect(assembled.sections.protected).toBeGreaterThan(0);
  });
});

describe('specialist symmetry', () => {
  it('specialists receive the shared FILE KNOWLEDGE block at start', async () => {
    const dir = makeProject('specialist');
    fs.mkdirSync(path.join(dir, 'src'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'src', 'widget.ts'), WIDGET_V1);
    const st = fs.statSync(path.join(dir, 'src', 'widget.ts'));
    const store = FileKnowledgeStore.forRepo(dir);
    store.record({ path: 'src/widget.ts', content: WIDGET_V1, size: st.size, mtimeMs: st.mtimeMs });

    const seen: LlmMessage[][] = [];
    let call = 0;
    const llm: LlmClient = {
      name: 'fk-test-worker',
      async complete(messages: LlmMessage[]): Promise<string> {
        seen.push(messages);
        call += 1;
        if (call === 1) {
          return JSON.stringify({ action: { type: 'tool_call', tool: 'read_file', params: { path: 'src/widget.ts' }, reason: 'inspect', expected: 'content' } });
        }
        return JSON.stringify({ action: { type: 'answer', summary: 'inspected with durable facts' } });
      },
      async completeStream(messages: LlmMessage[], opts, onDelta: (delta: string) => void): Promise<string> {
        const reply = await this.complete(messages, opts);
        onDelta(reply);
        return reply;
      },
    };

    const runner = new SubAgentRunner({ cwd: dir, resolveLlm: () => llm, agentRole: () => 'test specialist', isolate: false, onEvent: () => {} });
    const result = await runner.runOne('scout', 'inspect the widget');

    expect(result.ok).toBe(true);
    const firstCall = seen[0]!;
    const blocks = firstCall.filter((m) => typeof m.content === 'string' && (m.content as string).startsWith('FILE KNOWLEDGE'));
    expect(blocks.length).toBe(1);
    const block = String(blocks[0]!.content);
    expect(block).toContain('src/widget.ts');
    expect(block).toContain('export interface Widget');
  }, 30000);

  it('specialist results carry their executor\'s FileKnowledge stats for the run aggregate', async () => {
    const dir = makeProject('specialist-stats');
    fs.mkdirSync(path.join(dir, 'src'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'src', 'widget.ts'), WIDGET_V1);

    let call = 0;
    const llm: LlmClient = {
      name: 'fk-stats-worker',
      async complete(): Promise<string> {
        call += 1;
        if (call === 1) {
          return JSON.stringify({ action: { type: 'tool_call', tool: 'read_file', params: { path: 'src/widget.ts' }, reason: 'inspect', expected: 'content' } });
        }
        return JSON.stringify({ action: { type: 'answer', summary: 'done' } });
      },
      async completeStream(messages: LlmMessage[], opts, onDelta: (delta: string) => void): Promise<string> {
        const reply = await this.complete(messages, opts);
        onDelta(reply);
        return reply;
      },
    };

    const runner = new SubAgentRunner({ cwd: dir, resolveLlm: () => llm, agentRole: () => 'test specialist', isolate: false, onEvent: () => {} });
    const result = await runner.runOne('scout', 'inspect the widget');

    expect(result.ok).toBe(true);
    // The specialist read widget.ts with no prior knowledge -> discovery read.
    expect(result.fileKnowledgeStats).toBeDefined();
    expect(result.fileKnowledgeStats!.extractions).toBe(1);
    expect(result.fileKnowledgeStats!.rereadRequired).toBe(1);
  }, 30000);
});



describe('AST extraction (primary TS/JS path)', () => {
  it('flattens multiline type unions — the regex fallback blind spot', () => {
    const src = [
      'export type OwnershipMethod =',
      "  | 'dns_txt'",
      "  | 'https_file'",
      "  | 'connector';",
      '',
    ].join('\n');
    const { facts } = extractImplementationFacts('src/blackbox/types.ts', src);
    expect(facts.some((f) => f.includes("export type OwnershipMethod = | 'dns_txt' | 'https_file' | 'connector'"))).toBe(true);
  });

  it('captures generic function signatures with full type parameters', () => {
    const src = 'export function compact<T extends object>(items: readonly T[], opts?: { deep: boolean }): T[] { return [...items]; }\n';
    const { facts, symbols } = extractImplementationFacts('src/util.ts', src);
    expect(facts.some((f) => f.startsWith('export function compact<T extends object>(items: readonly T[]'))).toBe(true);
    expect(symbols).toContain('compact');
  });

  it('enumerates public class members and skips private ones', () => {
    const src = [
      'export class Store {',
      '  private readonly secret: string = "";',
      '  get size(): number { return 0; }',
      '  record(input: string): void {}',
      '  readonly path = "x";',
      '}',
    ].join('\n');
    const { facts } = extractImplementationFacts('src/store.ts', src);
    const fact = facts.find((f) => f.startsWith('export class Store'));
    expect(fact).toBeDefined();
    expect(fact).toContain('size()');
    expect(fact).toContain('record()');
    expect(fact).toContain('path');
    expect(fact).not.toContain('secret');
  });

  it('collapses overloads into one fact with a count', () => {
    const src = [
      'export function parse(x: string): Date;',
      'export function parse(x: number): Date;',
      'export function parse(x: unknown): Date { return new Date(String(x)); }',
    ].join('\n');
    const { facts } = extractImplementationFacts('src/parse.ts', src);
    expect(facts.filter((f) => f.startsWith('export function parse'))).toHaveLength(1);
    expect(facts.some((f) => f.includes('(+2 overloads)'))).toBe(true);
  });

  it('records enums with member names', () => {
    const src = 'export enum Risk { Low, Medium, High }\n';
    const { facts } = extractImplementationFacts('src/risk.ts', src);
    expect(facts.some((f) => f.includes('export enum Risk { Low, Medium, High }'))).toBe(true);
  });

  it('records import relationships', () => {
    const src = "import { randomBytes } from 'node:crypto';\nimport { Foo } from './types.js';\nexport const LIMIT = 5;\n";
    const { facts } = extractImplementationFacts('src/a.ts', src);
    expect(facts.some((f) => f.includes('imports:') && f.includes('node:crypto') && f.includes('./types.js'))).toBe(true);
  });

  it('records re-exports with their source module', () => {
    const src = "export { allocateChildBudget, budgetExhausted } from './coding/budget.js';\nexport * from './types.js';\n";
    const { facts } = extractImplementationFacts('src/index.ts', src);
    expect(facts.some((f) => f.includes("re-exports from ./coding/budget.js: allocateChildBudget, budgetExhausted"))).toBe(true);
    expect(facts.some((f) => f.includes('re-exports * from ./types.js'))).toBe(true);
  });

  it('records export default declarations', () => {
    const src = 'export default function runMain(): void {}\n';
    const { facts } = extractImplementationFacts('src/main.ts', src);
    expect(facts.some((f) => f.includes('export default function runMain'))).toBe(true);
  });

  it('falls back to regex on syntax-broken sources', () => {
    // Missing closing brace: the parser rejects it, the regex still sees the export.
    const src = 'export const BROKEN_LIMIT = 5;\nexport function incomplete( {\n';
    const { facts } = extractImplementationFacts('src/broken.ts', src);
    expect(facts.some((f) => f.includes('BROKEN_LIMIT'))).toBe(true);
  });
});

describe('FileKnowledge telemetry counters', () => {
  it('counts extraction path, render hits/misses, and invalidations', () => {
    const dir = makeProject('stats');
    fs.mkdirSync(path.join(dir, 'src'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'src', 'a.ts'), 'export const A = 1;\n');
    const st = fs.statSync(path.join(dir, 'src', 'a.ts'));
    const store = FileKnowledgeStore.forRepo(dir);

    store.record({ path: 'src/a.ts', content: 'export const A = 1;\n', size: st.size, mtimeMs: st.mtimeMs });
    store.record({ path: 'src/broken.ts', content: 'export const B = 2;\nfunction broken( {\n', size: 30, mtimeMs: 1 });
    store.render({ candidates: ['src/a.ts'] }); // hit
    // A real miss: knowledge requested but the store has nothing fresh to serve.
    const emptyStore = FileKnowledgeStore.forRepo(makeProject('stats-empty'));
    emptyStore.render({ candidates: ['src/missing.ts'] }); // miss
    store.invalidate('src/a.ts');                          // invalidation

    const stats = store.stats();
    const emptyStats = emptyStore.stats();
    expect(stats.extractions).toBe(2);
    expect(stats.astSuccess).toBe(1);
    expect(stats.regexFallback).toBe(1);
    expect(stats.hits).toBe(1);
    expect(emptyStats.misses).toBe(1);
    expect(stats.invalidations).toBe(1);
  });

  it('counts rereads: required on discovery, avoided on cached replay', async () => {
    const dir = makeProject('rereads');
    fs.mkdirSync(path.join(dir, 'src'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'src', 'widget.ts'), WIDGET_V1);
    const guard = ProjectGuard.detect(dir);
    const ledger = TaskLedger.create({ repoRoot: dir, goal: 'reread telemetry', project: guard.lock, mode: 'fast' });
    const executor = new Executor(guard, ledger, new PolicyEngine(true), new LoopDetector());

    // First read: no knowledge yet -> required (discovery).
    await executor.execute({ tool: 'read_file', params: { path: 'src/widget.ts' }, reason: 'inspect', expected: 'content' });
    expect(executor.fileKnowledge.stats().rereadRequired).toBe(1);

    // Second identical read: allowed (maxSameSuccessfulRead=2) but knowledge
    // was fresh -> redundant.
    await executor.execute({ tool: 'read_file', params: { path: 'src/widget.ts' }, reason: 'recheck', expected: 'content' });
    expect(executor.fileKnowledge.stats().rereadRedundant).toBe(1);

    // Third identical read: loop detector serves the cached observation
    // instead of the filesystem -> avoided (no disk I/O, no model cost).
    await executor.execute({ tool: 'read_file', params: { path: 'src/widget.ts' }, reason: 'again', expected: 'content' });
    expect(executor.fileKnowledge.stats().rereadAvoided).toBe(1);
  }, 30000);

  it('counts redundant rereads: the model read despite fresh knowledge', async () => {
    const dir = makeProject('redundant');
    fs.mkdirSync(path.join(dir, 'src'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'src', 'widget.ts'), WIDGET_V1);
    const guard = ProjectGuard.detect(dir);
    const ledger = TaskLedger.create({ repoRoot: dir, goal: 'redundant telemetry', project: guard.lock, mode: 'fast' });
    // Loop detector stubbed to always allow: same behavior as a runtime where
    // the model pushes through and re-reads anyway.
    const executor = new Executor(guard, ledger, new PolicyEngine(true), {
      evaluate: () => ({ allowed: true, attempts: 0, priorFailures: [] }),
    } as unknown as LoopDetector);

    await executor.execute({ tool: 'read_file', params: { path: 'src/widget.ts' }, reason: 'first', expected: 'content' });
    await executor.execute({ tool: 'read_file', params: { path: 'src/widget.ts' }, reason: 'again despite facts', expected: 'content' });

    const stats = executor.fileKnowledge.stats();
    expect(stats.rereadRequired).toBe(1);
    expect(stats.rereadRedundant).toBe(1);
  }, 30000);

  it('surfaces the counters in the efficiency summary', () => {
    const summary = renderEfficiencySummary(
      {
        calls: 1,
        inputTokens: 0,
        outputTokens: 0,
        cachedTokens: 0,
        estimatedInputTokens: 0,
        estimatedBySource: { system: 0, contextPack: 0, history: 0, state: 0, images: 0, digest: 0, strategy: 0, memory: 0, conversation: 0 },
        planningCalls: 0,
        executionCalls: 0,
        estimatedPlanningInput: 0,
        estimatedExecutionInput: 0,
        planningOutputTokens: 0,
        executionOutputTokens: 0,
        compactions: 0,
        screenshots: 0,
        screenshotBytes: 0,
        toolCalls: 0,
        preventedNetworkCalls: 0,
        wastedCalls: 0,
        filesInContextPack: 0,
        fileKnowledge: { extractions: 3, astSuccess: 2, regexFallback: 1, invalidations: 1, hits: 4, misses: 2, staleDropped: 1, rereadRequired: 3, rereadRedundant: 1, rereadAvoided: 2 },
      },
      { actions: 1, stepsDone: 0, stepsTotal: 0, filesChanged: 0 },
    );
    expect(summary).toContain('fk=hit4/miss2/stale1');
    expect(summary).toContain('ast2/regex1');
    expect(summary).toContain('rereads avoided2/required3/redundant1');
  });

  it('RunTelemetry aggregates specialist store stats into the run snapshot', () => {
    const telemetry = new RunTelemetry();
    // Main lane's executor.
    telemetry.noteFileKnowledge({ extractions: 2, astSuccess: 2, regexFallback: 0, invalidations: 1, hits: 3, misses: 1, staleDropped: 0, rereadRequired: 2, rereadRedundant: 0, rereadAvoided: 1 });
    // A specialist's executor, folded in at result time.
    telemetry.noteFileKnowledge({ extractions: 1, astSuccess: 0, regexFallback: 1, invalidations: 0, hits: 1, misses: 0, staleDropped: 1, rereadRequired: 1, rereadRedundant: 1, rereadAvoided: 0 });

    const snap = telemetry.snapshot();
    expect(snap.fileKnowledge).toBeDefined();
    expect(snap.fileKnowledge!.extractions).toBe(3);
    expect(snap.fileKnowledge!.hits).toBe(4);
    expect(snap.fileKnowledge!.rereadRequired).toBe(3);
    expect(snap.fileKnowledge!.regexFallback).toBe(1);
    expect(snap.fileKnowledge!.rereadRedundant).toBe(1);
  });
});
