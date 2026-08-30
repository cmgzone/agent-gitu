import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { Hermes } from '../src/agent/gitu.js';
import { buildTaskStrategySection, classifyTaskKind } from '../src/agent/task-strategy.js';
import { ScriptedMockLlm, type LlmMessage } from '../src/llm/llm.js';

const FAKE_SERVER = fileURLToPath(new URL('./helpers/fake-lsp-server.mjs', import.meta.url));
const tmpDirs: string[] = [];

afterEach(() => {
  for (const dir of tmpDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

function makeProject(withFakeLsp: boolean): string {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'strategy-e2e-'));
  tmpDirs.push(dir);
  writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: 'e2e', scripts: { test: 'node --version' } }, null, 2));
  mkdirSync(path.join(dir, 'src'), { recursive: true });
  if (withFakeLsp) {
    mkdirSync(path.join(dir, '.hermes'), { recursive: true });
    writeFileSync(
      path.join(dir, '.hermes', 'lsp.json'),
      JSON.stringify({ servers: [{ name: 'rust', languageIds: ['rust'], command: 'node', args: [FAKE_SERVER] }] }),
    );
  }
  return dir;
}

describe('classifyTaskKind', () => {
  it('detects bug fixes', () => {
    expect(classifyTaskKind('Fix the crash in auth')).toBe('bug-fix');
    expect(classifyTaskKind('the login flow is broken')).toBe('bug-fix');
    expect(classifyTaskKind('investigate issue #42')).toBe('bug-fix');
    expect(classifyTaskKind('error handling is wrong')).toBe('bug-fix');
  });

  it('detects failing tests before bug fixes', () => {
    expect(classifyTaskKind('Fix the failing test in cart.spec')).toBe('test-failure');
    expect(classifyTaskKind('make the tests pass')).toBe('test-failure');
    expect(classifyTaskKind('the test suite is failing')).toBe('test-failure');
  });

  it('detects refactors', () => {
    expect(classifyTaskKind('Refactor the payment module')).toBe('refactor');
    expect(classifyTaskKind('rename User to Account')).toBe('refactor');
    expect(classifyTaskKind('extract the validation logic')).toBe('refactor');
  });

  it('detects exploration', () => {
    expect(classifyTaskKind('Explain how the scheduler works')).toBe('explore');
    expect(classifyTaskKind('what does the ContextEngine do')).toBe('explore');
    expect(classifyTaskKind('review the auth module')).toBe('explore');
  });

  it('defaults to feature for build-style requests', () => {
    expect(classifyTaskKind('Add a dark mode toggle')).toBe('feature');
    expect(classifyTaskKind('Create a new endpoint')).toBe('feature');
  });
});

describe('buildTaskStrategySection', () => {
  it('returns the matching strategy only when LSP is available', () => {
    expect(buildTaskStrategySection('Fix the crash', true)).toContain('TASK STRATEGY — bug fix');
    expect(buildTaskStrategySection('Refactor auth', true)).toContain('TASK STRATEGY — refactor');
    expect(buildTaskStrategySection('Fix the crash', false)).toBeUndefined();
    expect(buildTaskStrategySection('', true)).toBeUndefined();
  });

  it('never lets a strategy substitute for real verification', () => {
    const strategy = buildTaskStrategySection('Fix the failing test', true)!;
    expect(strategy).toContain('lsp_definition');
    expect(strategy).toContain('run the full suite');
    expect(strategy).toContain('search_files/read_file');
  });
});

describe('Hermes task-strategy injection', () => {
  it('injects the bug-fix strategy at intake when LSP servers exist', async () => {
    const dir = makeProject(true);
    const seen: string[] = [];
    const capture = (fn: (n: number, messages: LlmMessage[]) => string) => (n: number, messages: LlmMessage[]) => {
      for (const m of messages) {
        if (m.role === 'user' && typeof m.content === 'string') seen.push(m.content);
      }
      return fn(n, messages);
    };
    const llm = new ScriptedMockLlm([
      capture(() => JSON.stringify({ action: { type: 'set_criteria', criteria: ['done'] } })),
      capture(() => JSON.stringify({ action: { type: 'set_plan', steps: [{ description: 'x', verification: 'node --version' }] } })),
      capture(() =>
        JSON.stringify({
          action: { type: 'tool_call', stepId: 'step-1', tool: 'run_command', params: { command: 'node --version' }, reason: 'verify', expected: 'exit 0' },
        }),
      ),
      capture((_n, messages) => {
        const text = messages.map((m) => (typeof m.content === 'string' ? m.content : '')).join(' ');
        const match = text.match(/(ev-\d{8}-[0-9a-f]{6})/);
        return JSON.stringify({ action: { type: 'claim_criterion', criterionId: 'ac-1', evidenceId: match?.[1] ?? 'ev-missing' } });
      }),
      capture(() => JSON.stringify({ action: { type: 'complete', summary: 'done', risks: [], followUps: [] } })),
    ]);
    const hermes = new Hermes({ cwd: dir, llm, mode: 'fast' });
    const { report } = await hermes.run('Fix the crash in the login flow');

    expect(report.status).toBe('complete');
    const strategy = seen.find((s) => s.includes('TASK STRATEGY'));
    expect(strategy).toBeDefined();
    expect(strategy).toContain('TASK STRATEGY — bug fix');
    expect(strategy).toContain('lsp_definition');
  }, 30000);

  it('does not inject a strategy when no LSP servers are available', async () => {
    const dir = makeProject(false);
    // Guarantee hasServers() === false regardless of what is on PATH.
    mkdirSync(path.join(dir, '.hermes'), { recursive: true });
    writeFileSync(
      path.join(dir, '.hermes', 'lsp.json'),
      JSON.stringify({ servers: [{ name: 'rust', languageIds: ['rust'], command: 'definitely-not-a-real-binary-xyz' }] }),
    );
    const seen: string[] = [];
    const llm = new ScriptedMockLlm([
      (_n, messages) => {
        for (const m of messages) {
          if (m.role === 'user' && typeof m.content === 'string') seen.push(m.content);
        }
        return JSON.stringify({ action: { type: 'set_criteria', criteria: ['done'] } });
      },
      () => JSON.stringify({ action: { type: 'set_plan', steps: [{ description: 'x', verification: 'node --version' }] } }),
      () =>
        JSON.stringify({
          action: { type: 'tool_call', stepId: 'step-1', tool: 'run_command', params: { command: 'node --version' }, reason: 'verify', expected: 'exit 0' },
        }),
      (_n, messages) => {
        const text = messages.map((m) => (typeof m.content === 'string' ? m.content : '')).join(' ');
        const match = text.match(/(ev-\d{8}-[0-9a-f]{6})/);
        return JSON.stringify({ action: { type: 'claim_criterion', criterionId: 'ac-1', evidenceId: match?.[1] ?? 'ev-missing' } });
      },
      () => JSON.stringify({ action: { type: 'complete', summary: 'done', risks: [], followUps: [] } }),
    ]);
    const hermes = new Hermes({ cwd: dir, llm, mode: 'fast' });
    const { report } = await hermes.run('Fix the crash in the login flow');

    expect(report.status).toBe('complete');
    expect(seen.some((s) => s.includes('TASK STRATEGY'))).toBe(false);
  }, 30000);

  it('skips the strategy in chat mode', async () => {
    const dir = makeProject(true);
    const llm = new ScriptedMockLlm([() => 'Just answering a question.']);
    const hermes = new Hermes({ cwd: dir, llm, mode: 'chat' });
    const { report } = await hermes.run('What does this repo do?');
    expect(report.status).toBe('complete');
  }, 30000);
});
