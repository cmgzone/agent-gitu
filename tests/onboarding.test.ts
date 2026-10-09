import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { createContext, Script } from 'node:vm';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { readOnboarding, saveOnboarding } from '../src/server/onboarding.js';
import { ONBOARDING_JS } from '../src/server/ui-onboarding.js';
import { HermesServer } from '../src/server/server.js';
import { ScriptedMockLlm } from '../src/llm/llm.js';

const roots: string[] = [];
afterEach(() => { vi.unstubAllEnvs(); for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });
function isolatedHome() {
  const root = mkdtempSync(path.join(tmpdir(), 'gitu-onboarding-test-'));
  roots.push(root);
  vi.stubEnv('AGENT_GITU_HOME', root);
  return root;
}

describe('onboarding preferences', () => {
  it('starts incomplete, persists choices across reads, and excludes credentials', () => {
    const root = isolatedHome();
    expect(readOnboarding()).toEqual({ completed: false, theme: 'system', mode: 'coding', model: '' });
    saveOnboarding({ theme: 'dark', mode: 'cowork', model: 'openai::test-model', apiKey: 'do-not-save' });
    expect(readOnboarding()).toEqual({ completed: true, theme: 'dark', mode: 'cowork', model: 'openai::test-model' });
    expect(readFileSync(path.join(root, 'Settings', 'onboarding.json'), 'utf8')).not.toContain('do-not-save');
    expect(() => saveOnboarding({ theme: 'invalid', mode: 'cowork' })).toThrow('valid theme');
    expect(readOnboarding().theme).toBe('dark');
  });

  it('serves first-run state and validates writes through the HTTP API', async () => {
    const root = isolatedHome();
    const server = new HermesServer({ passwordRequired: false, cwd: root, port: 0, llm: new ScriptedMockLlm([]) });
    const base = 'http://127.0.0.1:' + await server.start();
    try {
      expect(await fetch(base + '/api/onboarding').then(r => r.json())).toMatchObject({ completed: false });
      const post = (body: unknown) => fetch(base + '/api/onboarding', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
      expect((await post({ theme: 'light', mode: 'unknown' })).status).toBe(400);
      expect((await post({ theme: 'light', mode: 'coding', model: '' })).status).toBe(200);
      expect(await fetch(base + '/api/onboarding').then(r => r.json())).toMatchObject({ completed: true, theme: 'light', mode: 'coding' });
    } finally { await server.stop(); }
  });
});

function wizard() {
  const elements: Record<string, any> = {};
  const shell = { inert: false };
  const make = () => ({ hidden: false, textContent: '', value: '', type: 'password', disabled: false, isConnected: true, className: '', focus: vi.fn(), setAttribute: vi.fn(), querySelectorAll: () => [] });
  const root = {
    hidden: true,
    set innerHTML(html: string) {
      for (const [id, node] of Object.entries(elements)) if (id !== 'setupWizard' && id.startsWith('setup')) { node.isConnected = false; delete elements[id]; }
      for (const match of html.matchAll(/id="([^"]+)"/g)) elements[match[1]!] = make();
    },
    querySelectorAll: () => [],
  };
  elements.setupWizard = root;
  elements.startupCover = make(); elements.startupMessage = make(); elements.startupReload = make();
  const api = vi.fn(async () => ({}));
  const context = createContext({
    S: { sel: { model: '' }, settings: { theme: 'light' }, modelsLoaded: true, models: [{ id: 'openai', label: 'OpenAI', keyEnvVars: ['OPENAI_API_KEY'], models: [{ id: 'test-model' }], defaultModel: 'test-model', hasKey: false }] },
    $: (id: string) => elements[id], esc: (text: unknown) => String(text ?? ''),
    document: { querySelector: () => shell },
    themeOptionsHtml: () => '', providerIsUsable: (p: any) => Boolean(p?.hasKey || p?.signedIn),
    api, persist: vi.fn(), applyTheme: vi.fn(), openCowork: vi.fn(), cwExit: vi.fn(),
    loadModelCatalog: vi.fn(async () => {}), localStorage: { getItem: () => null }, AbortSignal,
  });
  new Script(ONBOARDING_JS).runInContext(context);
  return { context, elements, shell, api };
}

describe('setup wizard flow', () => {
  it('requires connection or an explicit skip and opens the chosen workspace after saving', async () => {
    const u = wizard();
    u.context.openSetupWizard();
    expect(u.shell.inert).toBe(true);
    u.elements.setupNext.onclick();
    expect(u.context.setupState.step).toBe(1);
    u.elements.setupNext.onclick();
    expect(u.context.setupState.step).toBe(1);
    expect(u.elements.setupMessage.textContent).toContain('Connect a provider');
    u.elements.setupSkip.onclick();
    u.context.setupState.mode = 'cowork';
    await u.context.finishSetup();
    expect(u.api).toHaveBeenCalledWith('/api/onboarding', expect.objectContaining({ body: JSON.stringify({ theme: 'light', mode: 'cowork', model: '' }) }));
    expect(u.context.openCowork).toHaveBeenCalledOnce();
    expect(u.elements.setupWizard.hidden).toBe(true);
    expect(u.shell.inert).toBe(false);
  });

  it('saves keys only to the key endpoint, clears the password field and selects a model', async () => {
    const u = wizard();
    u.context.openSetupWizard(); u.elements.setupNext.onclick();
    const input = u.elements.setupKey;
    input.value = 'test-secret';
    u.context.loadModelCatalog.mockImplementation(async () => { u.context.S.models[0].hasKey = true; });
    await u.context.saveSetupKey();
    expect(u.api).toHaveBeenCalledWith('/api/keys', expect.objectContaining({ body: JSON.stringify({ envVar: 'OPENAI_API_KEY', key: 'test-secret' }) }));
    expect(input.value).toBe('');
    expect(JSON.stringify(u.context.S)).not.toContain('test-secret');
    u.elements.setupNext.onclick();
    expect(u.context.S.sel.model).toBe('openai::test-model');
    expect(u.context.setupState.step).toBe(2);
  });

  it('keeps the wizard open and allows a retry when saving preferences fails', async () => {
    const u = wizard();
    u.context.openSetupWizard();
    u.api.mockRejectedValueOnce(new Error('disk failure'));
    await u.context.finishSetup();
    expect(u.elements.setupWizard.hidden).toBe(false);
    expect(u.context.S.settings.onboardingComplete).toBeUndefined();
    expect(u.context.setupState.busy).toBe(false);
    expect(u.elements.setupMessage.setAttribute).toHaveBeenCalledWith('role', 'alert');
    await u.context.finishSetup();
    expect(u.context.cwExit).toHaveBeenCalledOnce();
  });

  it('skips completed setup on a new origin and restores saved theme and mode', async () => {
    const u = wizard();
    u.api.mockResolvedValue({ completed: true, theme: 'dark', mode: 'cowork', model: 'openai::test-model' });
    await u.context.initializeOnboarding();
    expect(u.context.S.settings.theme).toBe('dark');
    expect(u.context.S.sel.model).toBe('openai::test-model');
    expect(u.context.openCowork).toHaveBeenCalledOnce();
    expect(u.elements.setupWizard.hidden).toBe(true);
    expect(u.elements.startupCover.hidden).toBe(true);
  });

  it('shows a retry after a loading failure and clears the error state when retrying', async () => {
    const u = wizard();
    u.api.mockRejectedValueOnce(new Error('offline'));
    await u.context.initializeOnboarding();
    expect(u.elements.startupCover.className).toBe('gitu-opening is-error');
    expect(u.elements.startupReload.hidden).toBe(false);
    expect(u.elements.startupReload.focus).toHaveBeenCalledOnce();
    u.api.mockResolvedValueOnce({ completed: true, theme: 'light', mode: 'coding', model: '' });
    await u.elements.startupReload.onclick();
    expect(u.elements.startupCover.className).toBe('gitu-opening');
    expect(u.elements.startupReload.hidden).toBe(true);
    expect(u.elements.startupCover.hidden).toBe(true);
    expect(u.shell.inert).toBe(false);
  });
});
