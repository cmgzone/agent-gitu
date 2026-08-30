import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { TaskLedger } from '../src/ledger/task-ledger.js';
import { ProjectGuard } from '../src/guard/project-guard.js';
import { buildContextSnapshot, renderContextSnapshot } from '../src/context/snapshot.js';
import { compactHistory } from '../src/agent/gitu.js';
import { classifyCall, renderTelemetry, RunTelemetry, sectionOfMessage } from '../src/agent/telemetry.js';
import { MemoryStore } from '../src/memory/memory-store.js';
import { Executor } from '../src/executor/executor.js';
import { LoopDetector } from '../src/loop/loop-detector.js';
import { PolicyEngine } from '../src/policy/policy.js';
import type { LlmMessage } from '../src/llm/llm.js';

function richLedger(dir: string): TaskLedger {
  const guard = ProjectGuard.detect(dir);
  const ledger = TaskLedger.create({ repoRoot: path.resolve(dir), goal: 'Redesign the checkout flow', project: guard.lock, mode: 'standard' });
  ledger.setCriteria(['checkout works']);
  ledger.setPlan([
    { description: 'map the cart API', verification: 'node --version' },
    { description: 'rebuild the checkout form', verification: 'npm test', area: 'frontend' },
    { description: 'verify on mobile', verification: 'npm test' },
  ]);
  ledger.updateStep('step-1', { status: 'done' });
  ledger.updateStep('step-2', { status: 'in_progress' });
  ledger.recordArchitectureDecision({
    decision: 'Keep the SPA routing',
    alternatives: ['MPA'],
    repoEvidence: 'existing SPA',
    requirements: [],
    rejected: [{ alternative: 'MPA', reason: 'rewrite cost' }],
    basis: 'repository-constraint',
  });
  ledger.trackFile('src/checkout.tsx');
  ledger.recordAction({ tool: 'run_command', paramsHash: 'h1', paramsSummary: '$ npm test -- checkout', status: 'error', errorSignature: 'sig-1', observation: '3 failed' });
  return ledger;
}

describe('ContextSnapshot — canonical compressed task state', () => {
  it('captures objective, progress, decisions, failures, evidence, files and next move', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'hermes-snapshot-'));
    writeFileSync(path.join(dir, 'package.json'), '{}');
    const snapshot = buildContextSnapshot(richLedger(dir).data);

    expect(snapshot.objective).toBe('Redesign the checkout flow');
    expect(snapshot.completed).toEqual(['map the cart API']);
    expect(snapshot.active).toEqual(['rebuild the checkout form', 'verify on mobile']);
    expect(snapshot.decisions).toEqual(['Keep the SPA routing']);
    expect(snapshot.failedAttempts).toHaveLength(1);
    expect(snapshot.evidence.pass).toBe(0);
    expect(snapshot.relevantFiles).toContain('src/checkout.tsx');
    expect(snapshot.nextMove).toBe('rebuild the checkout form');
  });

  it('renders a bounded block that carries state through compaction', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'hermes-snapshot-r-'));
    writeFileSync(path.join(dir, 'package.json'), '{}');
    const rendered = renderContextSnapshot(buildContextSnapshot(richLedger(dir).data));
    expect(rendered).toContain('MISSION SNAPSHOT');
    expect(rendered).toContain('objective: Redesign the checkout flow');
    expect(rendered).toContain('next: rebuild the checkout form');
    expect(rendered).toContain('failed attempts');
    expect(rendered.length).toBeLessThan(1600);
  });
});

describe('memory-aware compaction', () => {
  it('embeds the snapshot and hands preserved failures to onExtract', () => {
    const messages: LlmMessage[] = [{ role: 'system', content: 'SYS' }];
    messages.push({ role: 'user', content: 'RESULT [error] $ npm test\nTypeError: cannot read property' });
    for (let i = 0; i < 20; i++) messages.push({ role: i % 2 ? 'assistant' : 'user', content: `filler ${i} ${'z'.repeat(12_000)}` });

    let extracted: string[] = [];
    expect(compactHistory(messages, undefined, {
      snapshot: 'MISSION SNAPSHOT (canonical task state — survives history compaction):\nobjective: test task',
      onExtract: (info) => {
        extracted = info.failures;
      },
    })).toBe(true);

    const digest = String(messages[1]!.content);
    expect(digest).toContain('MISSION SNAPSHOT');
    expect(digest).toContain('objective: test task');
    expect(digest).toContain('KEY FAILURES');
    expect(extracted.some((f) => f.includes('npm test'))).toBe(true);
  });
});

describe('executor artifact persistence — digest in context, raw on disk', () => {
  function makeExecutor(dir: string): Executor {
    const guard = ProjectGuard.detect(dir);
    const ledger = TaskLedger.create({ repoRoot: path.resolve(dir), goal: 'artifact test', project: guard.lock, mode: 'fast' });
    const policy = { evaluate: async () => ({ allowed: true, tier: 'safe' as const, reason: 'stub' }) } as unknown as PolicyEngine;
    const loop = {
      evaluate: () => ({ allowed: true, reason: undefined, priorFailures: [] }),
      fileEditPressure: () => ({ blocked: false, edits: 0 }),
    } as unknown as LoopDetector;
    return new Executor(guard, ledger, policy, loop);
  }

  it('persists huge outputs as artifacts and points the model at them', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'hermes-artifact-'));
    writeFileSync(path.join(dir, 'package.json'), '{}');
    // read_file allows up to 30K chars — well past the 4K artifact threshold
    // (run_command self-caps at 4K, so it never reaches the artifact path).
    writeFileSync(path.join(dir, 'big.log'), 'x'.repeat(9000));
    const executor = makeExecutor(dir);
    const outcome = await executor.execute({
      tool: 'read_file',
      params: { path: 'big.log' },
      reason: 'inspect bulk output',
      expected: 'big content',
    });
    expect(outcome.result.ok).toBe(true);
    expect(outcome.record.observation).toContain('[full 9');
    expect(outcome.record.observation).toMatch(/saved to \.hermes[/\\]artifacts[/\\]/);
    const marker = outcome.record.observation.match(/saved to (\S+)/)![1]!;
    expect(existsSync(path.join(dir, marker))).toBe(true);
    expect(readFileSync(path.join(dir, marker), 'utf8').length).toBe(outcome.result.output.length);
  });

  it('keeps small outputs inline without artifacts', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'hermes-artifact-small-'));
    writeFileSync(path.join(dir, 'package.json'), '{}');
    const executor = makeExecutor(dir);
    const outcome = await executor.execute({
      tool: 'run_command',
      params: { command: 'node --version' },
      reason: 'tiny',
      expected: 'version',
    });
    expect(outcome.result.ok).toBe(true);
    expect(outcome.record.observation ?? '').not.toContain('saved to');
  });
});

describe('per-section token accounting (Phase 12)', () => {
  const messages: LlmMessage[] = [
    { role: 'system', content: 'SYSTEM PROMPT body' },
    { role: 'user', content: 'TASK STRATEGY - bug fix. Prove the bug first.' },
    { role: 'user', content: 'CONTEXT SAMPLE (a partial retrieval preview)\nsome file content' },
    { role: 'user', content: 'COMPACTED HISTORY - 5 earlier messages were condensed.' },
    { role: 'assistant', content: 'working on it' },
    { role: 'user', content: 'RESULT [success] node --version\nv22.0.0' },
    { role: 'user', content: 'TASK: fix the thing\nSTATUS: running' },
  ];

  it('classifies messages by content, not position', () => {
    expect(sectionOfMessage(messages[0]!)).toBe('system');
    expect(sectionOfMessage(messages[1]!)).toBe('strategy');
    expect(sectionOfMessage(messages[2]!)).toBe('contextPack');
    expect(sectionOfMessage(messages[3]!)).toBe('digest');
    expect(sectionOfMessage(messages[5]!)).toBe('conversation');
    expect(sectionOfMessage(messages[6]!)).toBe('taskState');
  });

  it('classifyCall attributes every text token to exactly one section', () => {
    const split = classifyCall(messages, 3);
    for (const key of ['system', 'taskState', 'digest', 'contextPack', 'strategy', 'conversation'] as const) {
      expect(split.sections[key]).toBeGreaterThan(0);
    }
    const sectionSum = Object.values(split.sections).reduce((a, b) => a + b, 0);
    expect(sectionSum).toBe(split.prefixTokens + split.historyTokens + split.stateTokens);
  });

  it('accumulates fine sections across calls in RunTelemetry and renders them', () => {
    const telemetry = new RunTelemetry();
    telemetry.recordCall(messages, undefined, 3, 'execution');
    const snap = telemetry.snapshot();
    expect(snap.estimatedBySource.digest).toBeGreaterThan(0);
    expect(snap.estimatedBySource.conversation).toBeGreaterThan(0);
    expect(snap.estimatedBySource.strategy).toBeGreaterThan(0);
    // Coarse buckets stay consistent: position-history = digest + conversation
    // (strategy lives in the stable PREFIX by position, but is still broken
    // out as its own content section). `state` IS the taskState section.
    expect(snap.estimatedBySource.history).toBe(snap.estimatedBySource.digest + snap.estimatedBySource.conversation);
    expect(renderTelemetry(snap)).toContain('digest=');
    expect(renderTelemetry(snap)).toContain('taskState=9');
  });
});


describe('memory ranking, dedupe and lifecycle (review Phase 7 / P3)', () => {
  const memDir = (name: string): string => {
    const dir = mkdtempSync(path.join(tmpdir(), `hermes-mem-${name}-`));
    return path.join(dir, 'memory.json');
  };

  it('deduplicates same-claim memories instead of piling up rows', () => {
    const store = new MemoryStore(memDir('dedupe'));
    const first = store.add({ type: 'failure', claim: 'Changing Header.tsx broke the 375px layout', scope: 'proj', confidence: 0.7 });
    const second = store.add({ type: 'failure', claim: 'changing header.tsx broke the 375px layout', scope: 'proj', confidence: 0.6 });
    expect(second.created).toBe(false);
    expect(second.entry.id).toBe(first.entry.id);
    // Confidence moves UP on re-observation, never down.
    expect(second.entry.confidence).toBeGreaterThan(0.7);
    expect(store.query({ type: 'failure' })).toHaveLength(1);
  });

  it('ranks relevance + confidence + scope over raw similarity', () => {
    const store = new MemoryStore(memDir('rank'));
    store.add({ type: 'project', claim: 'checkout uses stripe payment intents and webhooks', scope: 'proj', confidence: 0.95, importance: 0.9 });
    store.add({ type: 'task', claim: 'checkout redesign is currently incomplete', scope: 'other', confidence: 0.4, importance: 0.3 });
    const ranked = store.retrieve('how does checkout payment work', 'proj', 2);
    expect(ranked[0]!.claim).toContain('stripe');
  });

  it('tracks the access lifecycle so useful memories surface more readily', () => {
    const store = new MemoryStore(memDir('usage'));
    store.add({ type: 'project', claim: 'the api base url is injected via runtime config', scope: 'proj' });
    const before = store.query({ scope: 'proj' })[0]!;
    expect(before.accessCount ?? 0).toBe(0);
    store.retrieve('api base url runtime config', 'proj', 5);
    const after = store.query({ scope: 'proj' })[0]!;
    expect(after.accessCount).toBe(1);
    expect(after.lastUsedAt).toBeTruthy();
  });

  it('renderForPrompt with a query uses ranked retrieval', () => {
    const store = new MemoryStore(memDir('render'));
    store.add({ type: 'project', claim: 'auth tokens refresh every 15 minutes', scope: 'proj' });
    store.add({ type: 'preference', claim: 'user prefers tabular report output', scope: 'proj' });
    const rendered = store.renderForPrompt('proj', 12, 'auth token refresh behaviour');
    expect(rendered).toContain('auth tokens refresh');
    expect(rendered).not.toContain('tabular');
  });
});
