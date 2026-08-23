import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  COMPACT_CHAR_BUDGET,
  compactHistory,
  estimateMessageChars,
  Hermes,
  stripStaleImages,
} from '../src/agent/hermes.js';
import { buildStateMessage } from '../src/agent/prompt.js';
import { estimateTokens, RunTelemetry, classifyCall } from '../src/agent/telemetry.js';
import { decodedBytesFromBase64, planScreenshotResize, pngDimensionsFromBase64 } from '../src/browser/screenshot-opts.js';
import { TaskLedger } from '../src/ledger/task-ledger.js';
import type { BrowserBridge, BrowserScreenshot } from '../src/browser/browser.js';
import { ScriptedMockLlm, type LlmMessage } from '../src/llm/llm.js';
import { ProjectGuard } from '../src/guard/project-guard.js';
import { MAX_READ_OUTPUT_CHARS, toolBrowse, toolReadFile, type ToolContext } from '../src/tools/tools.js';

function makeProject(name: string): string {
  const dir = mkdtempSync(path.join(tmpdir(), `hermes-tokeff-${name}-`));
  writeFileSync(
    path.join(dir, 'package.json'),
    JSON.stringify({ name: `tokeff-${name}`, scripts: { test: 'node --version' } }, null, 2),
  );
  mkdirSync(path.join(dir, 'src'), { recursive: true });
  return dir;
}

function findEvidenceId(messages: { role: string; content: unknown }[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const c = messages[i]!.content;
    if (typeof c !== 'string') continue;
    const match = c.match(/(ev-\d{8}-[0-9a-f]{6})/);
    if (match) return match[1]!;
  }
  return 'ev-missing';
}

describe('read_file output cap', () => {
  function ctx(dir: string): ToolContext {
    return { guard: ProjectGuard.detect(dir), cwd: dir };
  }

  it('caps large read_file output by characters, not just lines', () => {
    const dir = makeProject('readcap');
    const big = Array.from({ length: 600 }, (_x, i) => `const line${i} = "${'x'.repeat(90)}";`).join('\n');
    writeFileSync(path.join(dir, 'src', 'big.ts'), big);
    const result = toolReadFile(ctx(dir), { path: 'src/big.ts' });
    expect(result.ok).toBe(true);
    expect(result.output.length).toBeLessThanOrEqual(MAX_READ_OUTPUT_CHARS + 200);
    expect(result.output).toContain('output capped');
    expect(result.output).toContain('1: ');
  });

  it('leaves small files untouched', () => {
    const dir = makeProject('readsmall');
    writeFileSync(path.join(dir, 'src', 'small.ts'), 'export const a = 1;\n');
    const result = toolReadFile(ctx(dir), { path: 'src/small.ts' });
    expect(result.ok).toBe(true);
    expect(result.output).toContain('export const a = 1;');
    expect(result.output).not.toContain('output capped');
  });

  it('honors an explicit maxChars override within bounds', () => {
    const dir = makeProject('readoverride');
    const big = Array.from({ length: 400 }, (_x, i) => `const l${i} = "${'y'.repeat(80)}";`).join('\n');
    writeFileSync(path.join(dir, 'src', 'big.ts'), big);
    const result = toolReadFile(ctx(dir), { path: 'src/big.ts', maxChars: 5000 });
    expect(result.output.length).toBeLessThanOrEqual(5000 + 200);
    expect(result.output).toContain('output capped');
  });
});

describe('token-aware compaction', () => {
  it('compacts on cumulative size even below the message-count trigger', () => {
    const messages: LlmMessage[] = [{ role: 'system', content: 'SYS' }];
    for (let i = 0; i < 20; i++) {
      messages.push({ role: i % 2 ? 'user' : 'assistant', content: `turn ${i} ${'x'.repeat(25_000)}` });
    }
    expect(messages.length).toBeLessThan(32);
    expect(estimateMessageChars(messages)).toBeGreaterThan(COMPACT_CHAR_BUDGET);
    expect(compactHistory(messages)).toBe(true);
    expect(String(messages[1]!.content)).toContain('COMPACTED HISTORY');
  });

  it('preserves failures from stale observations in the digest', () => {
    const messages: LlmMessage[] = [{ role: 'system', content: 'SYS' }];
    messages.push({ role: 'user', content: 'RESULT [error] run_command $ npm test\nTypeError: cannot read property' });
    for (let i = 0; i < 20; i++) {
      messages.push({ role: i % 2 ? 'assistant' : 'user', content: `filler ${i} ${'z'.repeat(12_000)}` });
    }
    compactHistory(messages);
    const digest = String(messages[1]!.content);
    expect(digest).toContain('KEY FAILURES');
    expect(digest).toContain('npm test');
  });

  it('removes stale large observations from the active tail', () => {
    const messages: LlmMessage[] = [{ role: 'system', content: 'SYS' }];
    messages.push({ role: 'user', content: `UNIQUE_STALE_OUTPUT_MARKER ${'q'.repeat(30_000)}` });
    for (let i = 0; i < 20; i++) {
      messages.push({ role: i % 2 ? 'assistant' : 'user', content: `filler ${i} ${'w'.repeat(12_000)}` });
    }
    compactHistory(messages);
    const joined = messages.map((m) => String(m.content)).join('\n');
    expect(joined.includes('q'.repeat(30_000))).toBe(false);
  });

  it('does not compact when both budgets are satisfied', () => {
    const messages: LlmMessage[] = [{ role: 'system', content: 'SYS' }];
    for (let i = 0; i < 10; i++) messages.push({ role: i % 2 ? 'user' : 'assistant', content: `small ${i}` });
    expect(compactHistory(messages)).toBe(false);
  });
});

describe('execution ledger survives compaction', () => {
  it('keeps goal, criteria and architecture decisions after history compaction', () => {
    const dir = makeProject('survive');
    const guard = ProjectGuard.detect(dir);
    const ledger = TaskLedger.create({ repoRoot: path.resolve(dir), goal: 'Build frontend SPA', project: guard.lock, mode: 'standard' });
    ledger.setCriteria(['login works', 'board renders']);
    ledger.recordArchitectureDecision({
      decision: 'Vanilla JS',
      alternatives: ['React'],
      repoEvidence: 'static frontend, no build system',
      requirements: [],
      rejected: [{ alternative: 'React', reason: 'no build system' }],
      basis: 'repository-constraint',
    });

    const messages: LlmMessage[] = [{ role: 'system', content: 'SYS' }];
    for (let i = 0; i < 20; i++) messages.push({ role: i % 2 ? 'user' : 'assistant', content: `noise ${i} ${'n'.repeat(15_000)}` });
    expect(compactHistory(messages)).toBe(true);

    const state = buildStateMessage(ledger);
    expect(state).toContain('Build frontend SPA');
    expect(state).toContain('login works');
    expect(state).toContain('Vanilla JS');
    expect(state).toContain('ARCHITECTURE');
  });

  it('renders FAILED and NEXT in the compact state', () => {
    const dir = makeProject('compactstate');
    const guard = ProjectGuard.detect(dir);
    const ledger = TaskLedger.create({ repoRoot: path.resolve(dir), goal: 'demo', project: guard.lock, mode: 'standard' });
    ledger.setPlan([{ description: 'do the thing', verification: 'node --version' }]);
    ledger.recordAction({
      tool: 'run_command',
      paramsHash: 'h',
      paramsSummary: '$ npm test',
      status: 'error',
      errorSignature: 'sig1',
      reason: 'verify',
      expected: 'pass',
      observation: 'TypeError: role validation failed',
      durationMs: 5,
    });
    const state = buildStateMessage(ledger);
    expect(state).toContain('FAILED:');
    expect(state).toContain('role validation failed');
    expect(state).toContain('NEXT: step-1');
  });
});

describe('screenshot optimization', () => {
  it('plans a resize to the max dimension', () => {
    const plan = planScreenshotResize(2560, 1440, 3_000_000);
    expect(plan.needsResize).toBe(true);
    expect(Math.max(plan.width, plan.height)).toBeLessThanOrEqual(1280);
    expect(plan.width).toBe(1280);
    expect(plan.compress).toBe(true);
    expect(plan.format).toBe('jpeg');
    expect(plan.quality).toBe(60);
  });

  it('keeps small images lossless and unscaled', () => {
    const plan = planScreenshotResize(800, 600, 20_000);
    expect(plan.needsResize).toBe(false);
    expect(plan.compress).toBe(false);
    expect(plan.format).toBe('png');
    expect(plan.width).toBe(800);
  });

  it('parses PNG dimensions from base64 without decoding pixels', () => {
    const buf = Buffer.alloc(24);
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(buf, 0);
    buf.writeUInt32BE(13, 8);
    buf.write('IHDR', 12, 'ascii');
    buf.writeUInt32BE(1024, 16);
    buf.writeUInt32BE(768, 20);
    const dims = pngDimensionsFromBase64(buf.toString('base64'));
    expect(dims).toEqual({ width: 1024, height: 768 });
    expect(decodedBytesFromBase64(buf.toString('base64'))).toBe(24);
  });

  it('returns undefined for non-PNG payloads', () => {
    expect(pngDimensionsFromBase64(Buffer.from('not a png').toString('base64'))).toBeUndefined();
  });

  it('browse tool honors the bridge-reported mime (jpeg) in the data URL', async () => {
    const dir = makeProject('browse-mime');
    const fakeShot: BrowserScreenshot = {
      pngBase64: Buffer.from('fakejpegbytes'.repeat(40)).toString('base64'),
      mime: 'image/jpeg',
      state: { available: true, url: 'http://localhost:3000', title: 'App', canBack: false, canForward: false, loading: false },
    };
    const bridge = { available: () => true, state: () => fakeShot.state, screenshot: async () => fakeShot } as unknown as BrowserBridge;
    const ctx: ToolContext = { guard: ProjectGuard.detect(dir), cwd: dir, browser: bridge };
    const result = await toolBrowse(ctx, { action: 'screenshot' });
    expect(result.ok).toBe(true);
    expect(result.image!.startsWith('data:image/jpeg;base64,')).toBe(true);
    expect(result.output).toContain('jpeg');
  });
});

describe('stripStaleImages', () => {
  it('removes images from older messages but keeps the most recent', () => {
    const img = { type: 'image_url', image_url: { url: 'data:image/png;base64,AAAA' } } as const;
    const messages: LlmMessage[] = [
      { role: 'user', content: [{ type: 'text', text: 'first' }, { ...img }] },
      { role: 'user', content: [{ type: 'text', text: 'second' }, { ...img }] },
      { role: 'user', content: [{ type: 'text', text: 'latest' }, { ...img }] },
    ];
    const removed = stripStaleImages(messages, 1);
    expect(removed).toBe(2);
    expect((messages[0]!.content as unknown[]).some((p) => (p as { type: string }).type === 'image_url')).toBe(false);
    expect((messages[2]!.content as unknown[]).some((p) => (p as { type: string }).type === 'image_url')).toBe(true);
  });

  it('protects the stable prefix from stripping', () => {
    const img = { type: 'image_url', image_url: { url: 'data:image/png;base64,AAAA' } } as const;
    const messages: LlmMessage[] = [
      { role: 'user', content: [{ type: 'text', text: 'user attachment' }, { ...img }] },
      { role: 'user', content: [{ type: 'text', text: 'old screenshot' }, { ...img }] },
    ];
    const removed = stripStaleImages(messages, 0, 1);
    expect(removed).toBe(1);
    expect((messages[0]!.content as unknown[]).some((p) => (p as { type: string }).type === 'image_url')).toBe(true);
  });

  it('run-time policy keeps the four most recent screenshots for cross-page consistency', () => {
    const img = { type: 'image_url', image_url: { url: 'data:image/png;base64,AAAA' } } as const;
    const shot = (n: number): LlmMessage => ({ role: 'user', content: [{ type: 'text', text: `shot ${n}` }, { ...img }] });
    const messages: LlmMessage[] = [shot(1), shot(2), shot(3), shot(4), shot(5), shot(6)];
    // This mirrors the hermes call site: KEEP_RECENT_SCREENSHOTS = 4.
    const removed = stripStaleImages(messages, 4, 0);
    expect(removed).toBe(2);
    for (const i of [0, 1]) {
      expect((messages[i]!.content as unknown[]).some((p) => (p as { type: string }).type === 'image_url')).toBe(false);
      expect((messages[i]!.content as unknown[]).some((p) => (p as { type: string }).type === 'text')).toBe(true);
    }
    for (const i of [2, 3, 4, 5]) {
      expect((messages[i]!.content as unknown[]).some((p) => (p as { type: string }).type === 'image_url')).toBe(true);
    }
  });
});

describe('token telemetry', () => {
  it('estimates tokens from characters', () => {
    expect(estimateTokens(400)).toBe(100);
    expect(estimateTokens(0)).toBe(0);
  });

  it('classifies a call into prefix/history/state and tracks provider usage', () => {
    const messages: LlmMessage[] = [
      { role: 'system', content: 'S'.repeat(400) },
      { role: 'user', content: 'context pack ' + 'c'.repeat(400) },
      { role: 'assistant', content: 'r'.repeat(200) },
      { role: 'user', content: 'history ' + 'h'.repeat(400) },
      { role: 'user', content: 'STATE ' + 's'.repeat(400) },
    ];
    const split = classifyCall(messages, 2);
    expect(split.prefixTokens).toBeGreaterThan(0);
    expect(split.historyTokens).toBeGreaterThan(0);
    expect(split.stateTokens).toBeGreaterThan(0);

    const t = new RunTelemetry();
    t.recordCall(messages, { inputTokens: 100, outputTokens: 10, cachedTokens: 20 }, 2);
    t.noteToolCall();
    t.noteCompaction();
    t.noteScreenshot(1000);
    const snap = t.snapshot();
    expect(snap.calls).toBe(1);
    expect(snap.inputTokens).toBe(100);
    expect(snap.cachedTokens).toBe(20);
    expect(snap.toolCalls).toBe(1);
    expect(snap.compactions).toBe(1);
    expect(snap.screenshots).toBe(1);
    expect(snap.estimatedInputTokens).toBeGreaterThan(0);
    expect(snap.estimatedBySource.history).toBeGreaterThan(0);
  });
});

describe('Hermes e2e — decisions, telemetry, context efficiency', () => {
  it('rejects a decision that drops an explicitly required technology', async () => {
    const dir = makeProject('react-required');
    const llm = new ScriptedMockLlm([
      () => JSON.stringify({
        action: {
          type: 'record_decision',
          decision: 'Vanilla JS',
          alternatives: ['React'],
          repoEvidence: 'simple page',
          rejected: [{ alternative: 'React', reason: 'simpler without it' }],
          basis: 'preference',
        },
      }),
      () => JSON.stringify({
        action: {
          type: 'record_decision',
          decision: 'React SPA',
          alternatives: ['Vanilla JS'],
          repoEvidence: 'user requires React',
          rejected: [{ alternative: 'Vanilla JS', reason: 'user explicitly requires React' }],
          basis: 'explicit-requirement',
        },
      }),
      () => JSON.stringify({ action: { type: 'request_block', reason: 'decision scenario complete' } }),
    ]);
    const hermes = new Hermes({ cwd: dir, llm, mode: 'fast' });
    const { ledger } = await hermes.run('Build the dashboard using React');

    const decisions = ledger.data.architectureDecisions ?? [];
    expect(decisions.length).toBe(1);
    expect(decisions[0]!.decision).toContain('React');
    expect(decisions[0]!.basis).toBe('explicit-requirement');
  }, 30000);

  it('allows choosing vanilla JS when nothing requires a framework', async () => {
    const dir = makeProject('vanilla-ok');
    const llm = new ScriptedMockLlm([
      () => JSON.stringify({
        action: {
          type: 'record_decision',
          decision: 'Vanilla JS',
          alternatives: ['React', 'Svelte'],
          repoEvidence: 'existing static frontend, no build system',
          rejected: [
            { alternative: 'React', reason: 'no build system; adds tooling' },
            { alternative: 'Svelte', reason: 'same tooling cost' },
          ],
          reconsiderIf: 'shared-state complexity grows',
          basis: 'repository-constraint',
        },
      }),
      () => JSON.stringify({ action: { type: 'request_block', reason: 'decision scenario complete' } }),
    ]);
    const hermes = new Hermes({ cwd: dir, llm, mode: 'fast' });
    const { ledger } = await hermes.run('Build a small 6-view frontend SPA');

    const decisions = ledger.data.architectureDecisions ?? [];
    expect(decisions.length).toBe(1);
    expect(decisions[0]!.decision).toContain('Vanilla');
    expect(decisions[0]!.status).toBe('active');
  }, 30000);

  it('records telemetry on the ledger and report for a completed run', async () => {
    const dir = makeProject('telemetry');
    const llm = new ScriptedMockLlm([
      () => JSON.stringify({ action: { type: 'set_criteria', criteria: ['verification command passes'] } }),
      () => JSON.stringify({ action: { type: 'set_plan', steps: [{ description: 'verify', verification: 'node --version' }] } }),
      () => JSON.stringify({ action: { type: 'tool_call', stepId: 'step-1', tool: 'run_command', params: { command: 'node --version' }, reason: 'verify', expected: 'exit 0' } }),
      (_n, messages) => JSON.stringify({ action: { type: 'claim_criterion', criterionId: 'ac-1', evidenceId: findEvidenceId(messages as LlmMessage[]) } }),
      () => JSON.stringify({ action: { type: 'complete', summary: 'verified', risks: [], followUps: [] } }),
    ]);
    const hermes = new Hermes({ cwd: dir, llm, mode: 'fast' });
    const { ledger, report } = await hermes.run('Verify node works');

    expect(report.status).toBe('complete');
    const t = ledger.data.tokenTelemetry;
    expect(t).toBeDefined();
    expect(t!.calls).toBeGreaterThanOrEqual(5);
    expect(t!.toolCalls).toBeGreaterThanOrEqual(1);
    expect(t!.estimatedInputTokens).toBeGreaterThan(0);
    expect(report.tokenTelemetry).toBeDefined();
  }, 30000);

  it('keeps the stable prefix byte-identical across turns (prefix-cache friendly)', async () => {
    const dir = makeProject('prefix-stable');
    const prefixes: string[] = [];
    const llm = new ScriptedMockLlm([
      (_n, messages) => {
        prefixes.push(JSON.stringify(messages.slice(0, 2)));
        return JSON.stringify({ action: { type: 'set_criteria', criteria: ['verification command passes'] } });
      },
      (_n, messages) => {
        prefixes.push(JSON.stringify(messages.slice(0, 2)));
        return JSON.stringify({ action: { type: 'set_plan', steps: [{ description: 'verify', verification: 'node --version' }] } });
      },
      (_n, messages) => {
        prefixes.push(JSON.stringify(messages.slice(0, 2)));
        return JSON.stringify({ action: { type: 'tool_call', stepId: 'step-1', tool: 'run_command', params: { command: 'node --version' }, reason: 'verify', expected: 'exit 0' } });
      },
      (_n, messages) => JSON.stringify({ action: { type: 'claim_criterion', criterionId: 'ac-1', evidenceId: findEvidenceId(messages) } }),
      () => JSON.stringify({ action: { type: 'complete', summary: 'verified', risks: [], followUps: [] } }),
    ]);
    const hermes = new Hermes({ cwd: dir, llm, mode: 'fast' });
    const { report } = await hermes.run('Verify prefix stability');

    expect(report.status).toBe('complete');
    expect(prefixes.length).toBeGreaterThanOrEqual(3);
    for (const p of prefixes) expect(p).toBe(prefixes[0]);
  }, 30000);

  it('attaches targeted recovery context after a failed tool call', async () => {
    const dir = makeProject('recovery');
    const seen: string[] = [];
    // Prefer the PASS evidence id (a failed command records a FAIL evidence
    // first, so "first match" would pick the wrong one).
    const findPassEvidenceId = (messages: LlmMessage[]): string => {
      for (let i = messages.length - 1; i >= 0; i--) {
        const c = messages[i]!.content;
        if (typeof c !== 'string') continue;
        const pass = c.match(/EVIDENCE RECORDED: (ev-\d{8}-[0-9a-f]{6}) \[PASS\]/);
        if (pass) return pass[1]!;
      }
      return 'ev-missing';
    };
    const llm = new ScriptedMockLlm([
      () => JSON.stringify({ action: { type: 'set_criteria', criteria: ['verification command passes'] } }),
      () => JSON.stringify({ action: { type: 'set_plan', steps: [{ description: 'verify', verification: 'node --version' }] } }),
      // `git status` is a safe-tier command, but fails in a non-repo tmp dir →
      // a real tool error (not a policy denial) to exercise the recovery path.
      () => JSON.stringify({ action: { type: 'tool_call', stepId: 'step-1', tool: 'run_command', params: { command: 'git status' }, reason: 'try', expected: 'works' } }),
      (_n, messages) => {
        const last = messages.filter((m) => typeof m.content === 'string').map((m) => String(m.content)).join('\n');
        seen.push(last);
        return JSON.stringify({ action: { type: 'tool_call', stepId: 'step-1', tool: 'run_command', params: { command: 'node --version' }, reason: 'retry with real command', expected: 'exit 0' } });
      },
      (_n, messages) => JSON.stringify({ action: { type: 'claim_criterion', criterionId: 'ac-1', evidenceId: findPassEvidenceId(messages) } }),
      () => JSON.stringify({ action: { type: 'complete', summary: 'recovered', risks: [], followUps: [] } }),
    ]);
    const hermes = new Hermes({ cwd: dir, llm, mode: 'fast' });
    const { report } = await hermes.run('Recover from a failed command');

    expect(report.status).toBe('complete');
    const failureObservation = seen.find((s) => s.includes('RESULT [error]'));
    expect(failureObservation).toBeDefined();
    expect(failureObservation).toContain('RECOVERY (targeted, not the full history)');
    expect(failureObservation).toContain('open criteria');
  }, 30000);
});
