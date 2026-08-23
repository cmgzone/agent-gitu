import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { AgentStore } from '../src/agents/registry.js';
import {
  buildQualityReviewMessages,
  braceBalance,
  classifyBadReply,
  extractFailureDigest,
  findLastScreenshotUrl,
  parseReviewVerdict,
} from '../src/agent/hermes.js';
import { tokenize } from '../src/context/context-engine.js';
import { CodeIndex } from '../src/context/code-index.js';
import type { LlmMessage } from '../src/llm/llm.js';
import { Executor } from '../src/executor/executor.js';
import { ProjectGuard } from '../src/guard/project-guard.js';
import { TaskLedger } from '../src/ledger/task-ledger.js';
import { LoopDetector } from '../src/loop/loop-detector.js';
import { PolicyEngine } from '../src/policy/policy.js';

// ---- helpers ------------------------------------------------------------

function makeExecutor(dir: string): Executor {
  const guard = ProjectGuard.detect(dir);
  const ledger = TaskLedger.create({ repoRoot: path.resolve(dir), goal: 'quality', project: guard.lock, mode: 'fast' });
  const policy = { evaluate: async () => ({ allowed: true, tier: 'safe' as const, reason: 'stub' }) } as unknown as PolicyEngine;
  const loopDetector = {
    evaluate: () => ({ allowed: true, reason: undefined, errorSig: undefined }),
    fileEditPressure: () => ({ blocked: false, edits: 0, evidence: 0 }),
  } as unknown as LoopDetector;
  return new Executor(guard, ledger, policy, loopDetector);
}

function makeProject(): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'hermes-quality-'));
  writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: 'q' }));
  return dir;
}

// ---- apply_edit replaceAll ----------------------------------------------

describe('apply_edit replaceAll', () => {
  it('replaces every occurrence when replaceAll:true', async () => {
    const dir = makeProject();
    const executor = makeExecutor(dir);
    writeFileSync(path.join(dir, 'a.ts'), 'old old old\n');
    const out = await executor.execute({
      tool: 'apply_edit',
      params: { path: 'a.ts', oldString: 'old', newString: 'new', replaceAll: true },
    });
    expect(out.result.ok).toBe(true);
    expect(out.result.output).toContain('3 occurrences');
    expect(readFileSync(path.join(dir, 'a.ts'), 'utf8')).toBe('new new new\n');
  });

  it('still refuses ambiguous edits without the flag', async () => {
    const dir = makeProject();
    const executor = makeExecutor(dir);
    writeFileSync(path.join(dir, 'b.ts'), 'x x\n');
    const out = await executor.execute({ tool: 'apply_edit', params: { path: 'b.ts', oldString: 'x', newString: 'y' } });
    expect(out.result.ok).toBe(false);
    expect(out.result.output).toContain('replaceAll');
  });
});

// ---- quality review verdict parsing (fail-open) --------------------------

describe('parseReviewVerdict', () => {
  it('flags explicit REVISE with feedback', () => {
    const r = parseReviewVerdict('VERDICT: REVISE\nFEEDBACK: login button overlaps the nav; fix z-index.');
    expect(r.verdict).toBe('revise');
    expect(r.feedback).toContain('z-index');
  });

  it('passes on PASS and on garbage (fail-open)', () => {
    expect(parseReviewVerdict('VERDICT: PASS').verdict).toBe('pass');
    expect(parseReviewVerdict('the diff looks fine to me').verdict).toBe('pass');
    expect(parseReviewVerdict('').verdict).toBe('pass');
  });
});

describe('findLastScreenshotUrl', () => {
  it('returns the most recent data-image across messages and parts', () => {
    const msgs: LlmMessage[] = [
      { role: 'user', content: 'text only' },
      {
        role: 'user',
        content: [
          { type: 'text', text: 'shot' },
          { type: 'image_url', image_url: { url: 'data:image/png;base64,AAA' } },
        ],
      },
      {
        role: 'user',
        content: [{ type: 'image_url', image_url: { url: 'data:image/jpeg;base64,BBB' } }],
      },
    ];
    expect(findLastScreenshotUrl(msgs)).toBe('data:image/jpeg;base64,BBB');
    expect(findLastScreenshotUrl(msgs.slice(0, 2))).toBe('data:image/png;base64,AAA');
    expect(findLastScreenshotUrl([{ role: 'user', content: 'no images' }])).toBeUndefined();
  });
});

describe('buildQualityReviewMessages', () => {
  it('attaches the screenshot for UI review and demands a strict format', () => {
    const msgs = buildQualityReviewMessages({
      goal: 'build login page',
      criteria: ['renders form'],
      filesChanged: ['login.html'],
      diffStat: ' login.html | 10 ++',
      summary: 'done',
      screenshotUrl: 'data:image/png;base64,XYZ',
    });
    expect(Array.isArray(msgs[1]!.content)).toBe(true);
    const parts = msgs[1]!.content as { type: string; text?: string; image_url?: { url: string } }[];
    const text = parts.map((p) => p.text ?? '').join('');
    expect(text).toContain('JUDGE IT');
    expect(text).toContain('VERDICT:');
    expect(parts.some((p) => p.type === 'image_url' && p.image_url?.url === 'data:image/png;base64,XYZ')).toBe(true);
  });
});

// ---- built-in specialist roster ------------------------------------------

describe('AgentStore built-in roster', () => {
  it('serves built-in specialists when no agents.json exists', () => {
    const dir = makeProject();
    const store = new AgentStore(path.join(dir, 'does-not-exist.json'));
    const names = store.list().map((a) => a.name);
    for (const expected of ['explore', 'backend', 'frontend', 'tester', 'reviewer', 'docs']) {
      expect(names).toContain(expected);
    }
    expect(store.list().every((a) => a.builtin)).toBe(true);
    expect(store.renderForPrompt()).toContain('"explore"');
  });

  it('lets custom agents override same-name defaults without freezing built-ins to disk', () => {
    const dir = makeProject();
    const file = path.join(dir, 'agents.json');
    const store = new AgentStore(file);
    store.save({ name: 'explore', role: 'my custom explorer' });
    const explore = store.get('explore')!;
    expect(explore.role).toBe('my custom explorer');
    expect(explore.builtin).toBeUndefined();
    // The file contains ONLY the custom entry — defaults are not snapshotted.
    const raw = JSON.parse(readFileSync(file, 'utf8')) as { agents: { name: string }[] };
    expect(raw.agents.map((a) => a.name)).toEqual(['explore']);
    // And removing it restores the default again.
    expect(store.remove(explore.id)).toBe(true);
    expect(store.get('explore')?.builtin).toBe(true);
  });

  it('save/remove never write built-ins into the custom file', () => {
    const dir = makeProject();
    const file = path.join(dir, 'agents.json');
    const store = new AgentStore(file);
    store.save({ name: 'tester', role: 'custom tester' });
    store.remove(store.get('tester')!.id);
    const raw = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : { agents: [] };
    expect(raw.agents).toEqual([]);
  });
});

// ---- retrieval upgrades ----------------------------------------------------

describe('tokenize identifier awareness', () => {
  it('emits compound tokens AND their camelCase parts', () => {
    const t = tokenize('parseUserToken(id_value)');
    expect(t).toContain('parseusertoken');
    expect(t).toContain('parse');
    expect(t).toContain('user');
    expect(t).toContain('token');
    expect(t).toContain('idvalue');
  });
});

describe('CodeIndex IDF-weighted content scoring', () => {
  it('ranks files matching RARE terms above files matching only COMMON terms', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'hermes-idf-'));
    writeFileSync(path.join(dir, 'common.ts'), 'data helper\nexport const a = 1;\n');
    writeFileSync(path.join(dir, 'other.ts'), 'data processing module\nexport const c = 3;\n');
    writeFileSync(path.join(dir, 'rare.ts'), 'kubernetes webhook reconciler\nexport const b = 2;\n');
    const idx = new CodeIndex(dir, path.join(dir, 'idx.db'));
    idx.refresh(dir, []);
    // "data" appears in two of three files; "kubernetes" in exactly one.
    const scores = idx.contentMatchScores(['data', 'kubernetes']);
    const rareScore = scores.get('rare.ts') ?? 0;
    const commonScore = scores.get('common.ts') ?? 0;
    expect(rareScore).toBeGreaterThan(0);
    expect(commonScore).toBeGreaterThan(0);
    expect(rareScore).toBeGreaterThan(commonScore);
    idx.close();
  });

  it('returns empty for no terms and caps at 1', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'hermes-idf2-'));
    writeFileSync(path.join(dir, 'only.ts'), 'alpha beta gamma\n');
    const idx = new CodeIndex(dir, path.join(dir, 'idx.db'));
    idx.refresh(dir, []);
    expect(idx.contentMatchScores([]).size).toBe(0);
    const s = idx.contentMatchScores(['alpha']).get('only.ts') ?? 0;
    expect(s).toBeGreaterThan(0.99); // sole matched term of one → full recall
    idx.close();
  });
});

// ---- failure digest ---------------------------------------------------------

describe('extractFailureDigest', () => {
  it('keeps error lines and the tail from long logs, dropping the noise head', () => {
    const lines: string[] = ['compiling...'];
    for (let i = 0; i < 200; i++) lines.push(`webpack module ${i} processed fine`);
    lines.push('FAIL src/app.test.ts', 'Expected: 200 Received: 500', 'at Object.<anonymous> (src/app.test.ts:12:5)', 'Tests: 1 failed, 9 passed');
    const digest = extractFailureDigest(lines.join('\n'), 900);
    expect(digest).toContain('FAIL src/app.test.ts');
    expect(digest).toContain('Expected: 200');
    expect(digest).toContain('Tests: 1 failed');
    expect(digest).not.toContain('webpack module 10 ');
  });

  it('falls back to trimmed output when nothing matches', () => {
    expect(extractFailureDigest('plain exit code 3')).toContain('plain exit code 3');
  });
});

// ---- bad-reply classification (rescue path) ---------------------------------

describe('classifyBadReply', () => {
  it('flags empty completions as retryable', () => {
    expect(classifyBadReply('')).toBe('empty');
    expect(classifyBadReply('   \n  ')).toBe('empty');
    expect(classifyBadReply(undefined)).toBe('empty');
  });

  it('flags prose followed by cut-off JSON as truncated-json', () => {
    const reply = 'Both searches came up empty. {"thought":"The evidence markup i';
    expect(classifyBadReply(reply)).toBe('truncated-json');
  });

  it('accepts COMPLETE json as fine (null)', () => {
    const ok = 'thinking... {"thought":"done","action":{"type":"complete","summary":"s"}}';
    expect(classifyBadReply(ok)).toBeNull();
  });

  it('treats plain prose without any brace as a real failure, not retryable', () => {
    expect(classifyBadReply('I think we are done here.')).toBeNull();
  });

  it('ignores braces inside strings when balancing', () => {
    const tricky = '{"thought":"use { and } carefully","action":{"type":"run_co';
    expect(braceBalance(tricky)).toBeGreaterThan(0);
    expect(classifyBadReply(tricky)).toBe('truncated-json');
    const closed = '{"thought":"use { and } carefully","action":{"type":"run_command"}}';
    expect(braceBalance(closed)).toBeLessThanOrEqual(0);
    expect(classifyBadReply(closed)).toBeNull();
  });
});
