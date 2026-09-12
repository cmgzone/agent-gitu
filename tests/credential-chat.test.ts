import { describe, expect, it } from 'vitest';
import { createContext, Script } from 'node:vm';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { setTimeout as delay } from 'node:timers/promises';
import path from 'node:path';
import { credentialChatInput } from '../src/server/credential-chat.js';
import { UI_HTML } from '../src/server/ui.js';
import { UI_CONNECTIONS_JS } from '../src/server/ui-connections.js';
import { GituServer } from '../src/server/server.js';
import { ScriptedMockLlm } from '../src/llm/llm.js';

describe('chat credential handoff', () => {
  it('removes labelled and provider-shaped credentials before persistence or model context', () => {
    const labelled = credentialChatInput('Use Coolify. API key = super-secret-token-123456789');
    expect(labelled.detected).toBe(true);
    expect(labelled.providerHint).toBe('coolify');
    expect(labelled.safeText).toBe('Use Coolify. API key = [credential removed — use secure form]');
    expect(labelled.safeText).not.toContain('super-secret');

    const github = credentialChatInput('Here is github_pat_1234567890abcdefghijklmnop');
    expect(github).toMatchObject({ detected: true, providerHint: 'github' });
    expect(github.safeText).not.toContain('github_pat_');

    const deepseek = credentialChatInput('DeepSeek API key is sk-1234567890abcdefghijklmnop');
    expect(deepseek).toMatchObject({ detected: true, providerHint: 'deepseek' });

    const mixedServices = credentialChatInput('Deploy to GitHub after this. OpenAI API key is sk-proj-1234567890abcdefghijklmnop');
    expect(mixedServices).toMatchObject({ detected: true, providerHint: 'openai' });
  });

  it('does not mistake ordinary planning text for a secret', () => {
    expect(credentialChatInput('Keep the token budget at 128000 and discuss the API first')).toEqual({
      safeText: 'Keep the token budget at 128000 and discuss the API first', detected: false,
    });
  });

  it('uses one shared redactor for saved drafts and pending message bubbles', () => {
    expect(UI_HTML).toContain("draft: credentialChatInput(S.draft || '').safeText");
    expect(UI_HTML).toContain("userBubble('Sending message…', runId)");
    expect(UI_HTML).toContain('result.credentialRequired');
  });

  it('shows only missing connection values in the primary form', () => {
    const context = createContext({});
    new Script(UI_CONNECTIONS_JS).runInContext(context);
    const saved = context.connectionRequestFields({
      existingConnectionId: 'github', requestType: 'reauth', providerHint: 'github', requiredFields: ['token'],
      setup: { label: 'GitHub', baseUrl: 'https://api.github.com', validationPath: '/user' },
    });
    expect(saved.required).toEqual(['token']);
    const firstTime = context.connectionRequestFields({ requestType: 'setup', requiredFields: ['provider', 'baseUrl', 'token'], setup: {} });
    expect(firstTime.required).toEqual(['provider', 'baseUrl', 'token']);
  });

  it('keeps the final report in chat and rebuilds it when a task is reopened', () => {
    const side = UI_HTML.slice(UI_HTML.indexOf('  function renderRunSide('), UI_HTML.indexOf('  function switchSide('));
    expect(side).not.toContain('reportSideCard(');
    expect(UI_HTML).toContain('resetStreamRenderState(sess)');
    expect(UI_HTML).toContain('sess.summaryShown = summaryKey');
  });

  it('retains the last known price when a temporary catalog response omits it', () => {
    const context = createContext({});
    const source = UI_HTML.slice(UI_HTML.indexOf('  function retainUsageEstimate('), UI_HTML.indexOf('  function updateJumpLatest('));
    new Script(source).runInContext(context);
    const incoming = { usage: { messages: 3, inputTokens: 100, outputTokens: 10, cachedTokens: 0 } };
    context.retainUsageEstimate({ session: { usage: { costUsd: 0.0123 } } }, incoming);
    expect(incoming.usage).toMatchObject({ costUsd: 0.0123, costIncomplete: true });
    expect(UI_HTML).toContain("U.costIncomplete ? 'Estimated cost' : 'Total cost'");
  });

  it('intercepts a pasted key before starting the agent and returns a narrow secure form', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'gitu-credential-chat-'));
    writeFileSync(path.join(root, 'package.json'), JSON.stringify({ name: 'credential-chat' }));
    const secret = 'github_pat_1234567890abcdefghijklmnop';
    const server = new GituServer({ cwd: root, port: 0, llm: new ScriptedMockLlm([]), approvalTimeoutMs: 200 });
    try {
      const port = await server.start();
      const created = await fetch(`http://127.0.0.1:${port}/api/runs`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ goal: `Use this key ${secret}`, mode: 'agent' }),
      }).then((response) => response.json()) as { runId: string; safeText: string; credentialRequired: boolean };
      expect(created.credentialRequired).toBe(true);
      expect(created.safeText).not.toContain(secret);
      const view = await fetch(`http://127.0.0.1:${port}/api/runs/${created.runId}`).then((response) => response.json()) as {
        status: string; pendingConnection?: { requirement: { providerHint?: string; requiredFields?: string[] } };
      };
      expect(view.status).toBe('blocked');
      expect(view.pendingConnection?.requirement.providerHint).toBe('github');
      expect(view.pendingConnection?.requirement.requiredFields).toEqual(['token']);
      expect(JSON.stringify(view)).not.toContain(secret);
    } finally {
      await server.stop();
      rmSync(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
    }
  });

  it('defers model resolution and shows one provider-key input when the key was pasted into chat', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'gitu-model-key-chat-'));
    writeFileSync(path.join(root, 'package.json'), JSON.stringify({ name: 'model-key-chat' }));
    const previousHome = process.env.AGENT_GITU_HOME;
    process.env.AGENT_GITU_HOME = path.join(root, 'home');
    const server = new GituServer({ cwd: root, port: 0, approvalTimeoutMs: 1000 });
    try {
      const port = await server.start();
      const created = await fetch(`http://127.0.0.1:${port}/api/runs`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ goal: 'OpenAI API key is sk-proj-1234567890abcdefghijklmnop', provider: 'openai', model: 'gpt-4.1-mini' }),
      }).then((response) => response.json()) as { runId: string; credentialRequired: boolean };
      expect(created.credentialRequired).toBe(true);
      expect(created.runId).toBeTruthy();
      const view = await fetch(`http://127.0.0.1:${port}/api/runs/${created.runId}`).then((response) => response.json()) as {
        pendingConnection?: { requirement: { requiredFields?: string[]; credentialTarget?: { kind: string; provider: string; envVar: string } } };
      };
      expect(view.pendingConnection?.requirement.requiredFields).toEqual(['token']);
      expect(view.pendingConnection?.requirement.credentialTarget).toMatchObject({ kind: 'model-provider', provider: 'openai', envVar: 'HERMES_OPENAI_API_KEY' });
    } finally {
      await server.stop();
      // node:sqlite releases its Windows file handle just after close(). Give
      // the runtime one turn before deleting the isolated test home. Use the
      // async remover so Windows retry delays yield to that release work.
      await delay(100);
      if (previousHome === undefined) delete process.env.AGENT_GITU_HOME;
      else process.env.AGENT_GITU_HOME = previousHome;
      await rm(root, { recursive: true, force: true, maxRetries: 30, retryDelay: 100 });
    }
  }, { timeout: 90_000, retry: 1 });

  it('uses an explicitly selected provider for a pasted model key in a continuation', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'gitu-followup-model-key-'));
    writeFileSync(path.join(root, 'package.json'), JSON.stringify({ name: 'followup-model-key' }));
    const server = new GituServer({ cwd: root, port: 0, llm: new ScriptedMockLlm([]), approvalTimeoutMs: 1000 });
    const runId = 'followup-model-key';
    try {
      const port = await server.start();
      const sessions = (server as unknown as { sessions: Map<string, Record<string, unknown>> }).sessions;
      sessions.set(runId, {
        runId, goal: 'Continue the saved task', status: 'blocked', startedAt: new Date().toISOString(),
        provider: 'chatgpt', model: 'gpt-5.6-sol', requestedProvider: 'chatgpt', requestedModel: 'gpt-5.6-sol',
        activeProvider: 'chatgpt', activeModel: 'gpt-5.6-sol', mode: 'agent', events: [], subscribers: new Set(), approvals: new Map(), files: [],
      });
      const response = await fetch(`http://127.0.0.1:${port}/api/runs/${runId}/message`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          text: 'API key = opaque-model-key-123456789', provider: 'openai', model: 'gpt-4.1-mini', useSelectedModel: true,
        }),
      }).then((value) => value.json()) as { credentialRequired?: boolean };
      expect(response.credentialRequired).toBe(true);
      const view = await fetch(`http://127.0.0.1:${port}/api/runs/${runId}`).then((value) => value.json()) as {
        pendingConnection?: { requirement?: { requiredFields?: string[]; credentialTarget?: { provider: string } } };
      };
      expect(view.pendingConnection?.requirement?.requiredFields).toEqual(['token']);
      expect(view.pendingConnection?.requirement?.credentialTarget?.provider).toBe('openai');
    } finally {
      await server.stop();
      await delay(25);
      await rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
    }
  });
});
