import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { Hermes } from '../src/agent/gitu.js';
import { normalizeUrl, type BrowserBridge, type BrowserState } from '../src/browser/browser.js';
import { PolicyEngine } from '../src/policy/policy.js';
import { formatPageDiagnostics, toolBrowse } from '../src/tools/tools.js';
import { ScriptedMockLlm, type LlmMessage } from '../src/llm/llm.js';
import { modelSupportsImages } from '../src/llm/providers.js';

function makeProject(name: string): string {
  const dir = mkdtempSync(path.join(tmpdir(), `hermes-browser-${name}-`));
  writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: `browser-${name}`, scripts: { test: 'node --version' } }, null, 2));
  return dir;
}

function fakeBridge(): BrowserBridge & { log: string[] } {
  const log: string[] = [];
  const state = (): BrowserState => ({ available: true, url: 'http://localhost:3000/', title: 'Fake App', canBack: true, canForward: false, loading: false });
  return {
    log,
    state,
    available: () => true,
    async navigate(url: string) {
      log.push(`navigate ${url}`);
      return state();
    },
    async back() {
      log.push('back');
      return state();
    },
    async forward() {
      log.push('forward');
      return state();
    },
    async reload() {
      log.push('reload');
      return state();
    },
    async click(x: number, y: number) {
      log.push(`click ${x},${y}`);
      return state();
    },
    async type(text: string) {
      log.push(`type ${text}`);
      return state();
    },
    async screenshot() {
      log.push('screenshot');
      return {
        pngBase64: Buffer.alloc(4096, 7).toString('base64'),
        state: state(),
        consoleErrors: ['warn: [vite] connection lost (main.tsx:1)'],
        textDigest: 'Welcome to Fake App\nGet started',
        loadIncomplete: false,
      };
    },
  };
}

describe('normalizeUrl', () => {
  it('adds protocols and rejects non-http schemes', () => {
    expect(normalizeUrl('localhost:3000')).toBe('http://localhost:3000/');
    expect(normalizeUrl('example.com/x')).toBe('https://example.com/x');
    expect(() => normalizeUrl('file:///etc/passwd')).toThrow();
  });
});

describe('vision capability', () => {
  it('flags vision models and text-only models', () => {
    expect(modelSupportsImages('qwen3.8-max')).toBe(true);
    expect(modelSupportsImages('gpt-4o')).toBe(true);
    expect(modelSupportsImages('qwen3-coder-plus')).toBe(false);
    expect(modelSupportsImages('deepseek-v4-pro')).toBe(false);
  });
});

describe('browse tool', () => {
  it('is safe-tier in policy and returns screenshots as images', async () => {
    const policy = new PolicyEngine(false);
    const decision = await policy.evaluate('browse', { action: 'screenshot' });
    expect(decision.allowed).toBe(true);
    expect(decision.tier).toBe('safe');

    const bridge = fakeBridge();
    const guard = { lock: { repoRoot: makeProject('tool') } } as never;
    const nav = await toolBrowse({ guard, cwd: '.', browser: bridge }, { action: 'navigate', url: 'localhost:3000' });
    expect(nav.ok).toBe(true);

    const shot = await toolBrowse({ guard, cwd: '.', browser: bridge }, { action: 'screenshot' });
    expect(shot.ok).toBe(true);
    expect(shot.image).toMatch(/^data:image\/png;base64,/);
    expect(shot.output).toContain('CONSOLE PROBLEMS (1)');
    expect(shot.output).toContain('PAGE TEXT (digest)');
    expect(shot.output).toContain('Welcome to Fake App');

    const missing = await toolBrowse({ guard, cwd: '.' }, { action: 'screenshot' });
    expect(missing.ok).toBe(false);
    expect(missing.output).toMatch(/desktop/i);
  });
});

describe('formatPageDiagnostics', () => {
  it('returns empty string when the bridge provides no diagnostics', () => {
    expect(formatPageDiagnostics({})).toBe('');
  });

  it('lists console problems and an explicit clean signal', () => {
    const dirty = formatPageDiagnostics({ consoleErrors: ['error: Uncaught TypeError: x is undefined (app.js:12)'] });
    expect(dirty).toContain('CONSOLE PROBLEMS (1)');
    expect(dirty).toContain('Uncaught TypeError');

    const clean = formatPageDiagnostics({ consoleErrors: [] });
    expect(clean).toContain('CONSOLE PROBLEMS: none');
    expect(clean).not.toContain('PAGE TEXT');
  });

  it('surfaces incomplete loads and caps the text digest', () => {
    const out = formatPageDiagnostics({ loadIncomplete: true, textDigest: 't'.repeat(2000) });
    expect(out).toContain('PAGE LOAD: incomplete');
    expect(out).toContain('PAGE TEXT (digest)');
    const digest = out.split('PAGE TEXT (digest):\n')[1] ?? '';
    expect(digest.length).toBeLessThanOrEqual(1200);
  });
});

describe('Hermes with in-app browser', () => {
  it('delivers screenshots to vision models as image parts', async () => {
    const dir = makeProject('vision');
    const bridge = fakeBridge();
    let sawImage = false;
    const llm = new ScriptedMockLlm([
      () => JSON.stringify({ action: { type: 'set_criteria', criteria: ['page renders'] } }),
      () => JSON.stringify({ action: { type: 'set_plan', steps: [{ description: 'look at the page', verification: 'screenshot' }] } }),
      () => JSON.stringify({ action: { type: 'tool_call', stepId: 'step-1', tool: 'browse', params: { action: 'screenshot' }, reason: 'verify visually', expected: 'png' } }),
      (_n, messages: LlmMessage[]) => {
        sawImage = messages.some(
          (m) => Array.isArray(m.content) && m.content.some((p) => p.type === 'image_url'),
        );
        return JSON.stringify({ action: { type: 'request_block', reason: 'done looking' } });
      },
    ]);
    const hermes = new Hermes({ cwd: dir, llm, mode: 'fast', browser: bridge, supportsImages: true });
    await hermes.run('check the page');
    expect(bridge.log).toContain('screenshot');
    expect(sawImage).toBe(true);
  }, 30000);

  it('notes screenshots as undeliverable for text-only models', async () => {
    const dir = makeProject('novision');
    const bridge = fakeBridge();
    let note = '';
    const llm = new ScriptedMockLlm([
      () => JSON.stringify({ action: { type: 'set_criteria', criteria: ['page renders'] } }),
      () => JSON.stringify({ action: { type: 'set_plan', steps: [{ description: 'look', verification: 'screenshot' }] } }),
      () => JSON.stringify({ action: { type: 'tool_call', stepId: 'step-1', tool: 'browse', params: { action: 'screenshot' }, reason: 'verify', expected: 'png' } }),
      (_n, messages: LlmMessage[]) => {
        note = messages
          .filter((m) => typeof m.content === 'string')
          .map((m) => String(m.content))
          .join('\n');
        return JSON.stringify({ action: { type: 'request_block', reason: 'done' } });
      },
    ]);
    const hermes = new Hermes({ cwd: dir, llm, mode: 'fast', browser: bridge, supportsImages: false });
    await hermes.run('check the page');
    expect(note).toMatch(/not deliverable/i);
  }, 30000);
});
