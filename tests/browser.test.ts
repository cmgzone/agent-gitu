import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { Hermes } from '../src/agent/hermes.js';
import { normalizeUrl, type BrowserBridge, type BrowserState } from '../src/browser/browser.js';
import { PolicyEngine } from '../src/policy/policy.js';
import { toolBrowse } from '../src/tools/tools.js';
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
    async screenshot() {
      log.push('screenshot');
      return { pngBase64: Buffer.from('fake-png-bytes').toString('base64'), state: state() };
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

    const missing = await toolBrowse({ guard, cwd: '.' }, { action: 'screenshot' });
    expect(missing.ok).toBe(false);
    expect(missing.output).toMatch(/desktop/i);
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
    expect(note).toMatch(/cannot see images/i);
  }, 30000);
});
