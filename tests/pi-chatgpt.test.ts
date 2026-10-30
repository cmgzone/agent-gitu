import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  CHATGPT_PI_PROVIDER,
  chatgptLoginPending,
  chatgptLogout,
  chatgptSubscriptionInfo,
  configurePiChatgpt,
  startChatgptLogin,
  subscriptionModelContextWindow,
  waitForChatgptLogin,
} from '../src/llm/pi-chatgpt.js';
import { PiSubscriptionClient, subscriptionUserTurn } from '../src/llm/pi-subscription-client.js';
import { PiNativeRuntime } from '../src/llm/pi-native.js';
import type { NativeTaskInput } from '../src/llm/native-task.js';
import type { PiAuthInteraction, PiModelRuntime, PiSdk } from '../src/llm/pi/sdk.js';

function jwt(claims: Record<string, unknown>): string {
  const part = (value: unknown): string => Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${part({ alg: 'none' })}.${part(claims)}.sig`;
}

interface Fake {
  sdk: PiSdk;
  credentials: Map<string, { type: string; access: string }>;
  logins: { method?: string; agentName?: string }[];
  logouts: string[];
  registered: string[];
  completions: { systemPrompt?: string; messages: unknown[]; reasoning?: string }[];
  /** Resolve the sign-in that is waiting for the user. */
  approve: () => void;
  reject: (message: string) => void;
  nextResponse: { content: { type: string; text?: string; thinking?: string }[]; stopReason?: string; errorMessage?: string; usage?: { input: number; output: number; cacheRead: number; cacheWrite: number } };
}

function fake(): Fake {
  const state: Fake = {
    credentials: new Map(),
    logins: [],
    logouts: [],
    registered: [],
    completions: [],
    approve: () => {},
    reject: () => {},
    nextResponse: { content: [{ type: 'text', text: 'answer' }], stopReason: 'stop' },
    sdk: undefined as unknown as PiSdk,
  };
  const runtime: PiModelRuntime = {
    registerProvider: (providerId) => void state.registered.push(providerId),
    getModel: (providerId, modelId) => (modelId === 'unknown-model' ? undefined : { providerId, modelId }),
    getModels: () => [
      { id: 'gpt-6-astra', name: 'GPT-6 Astra', contextWindow: 272_000, input: ['text', 'image'], thinkingLevelMap: { off: null, low: 'low', high: 'high', max: 'max' } },
      { id: 'gpt-6.1-sol', name: 'GPT-6.1 Sol', contextWindow: 500_000, input: ['text', 'image'], thinkingLevelMap: { off: null, medium: 'medium' } },
    ],
    listCredentials: async () => [...state.credentials].map(([providerId, credential]) => ({ providerId, type: credential.type })),
    getAuth: async (providerId) => {
      const credential = state.credentials.get(providerId);
      return credential ? { auth: { apiKey: credential.access } } : undefined;
    },
    completeSimple: async (_model, context, options) => {
      state.completions.push({ ...context, ...(options?.reasoning ? { reasoning: options.reasoning } : {}) });
      return state.nextResponse;
    },
    login: async (providerId, _type, interaction: PiAuthInteraction, options) => {
      const method = await interaction.prompt({
        type: 'select',
        message: 'Select login method',
        options: [{ id: 'browser' }, { id: 'device_code' }],
      });
      state.logins.push({ method, agentName: options?.agentName });
      if (method === 'device_code') {
        interaction.notify({ type: 'device_code', userCode: 'ABCD-1234', verificationUri: 'https://auth.openai.com/codex/device' });
      } else {
        interaction.notify({ type: 'auth_url', url: 'https://auth.openai.com/oauth/authorize?x=1' });
      }
      await new Promise<void>((resolve, reject) => {
        state.approve = resolve;
        state.reject = (message) => reject(new Error(message));
        interaction.signal?.addEventListener('abort', () => reject(new Error('Login cancelled')), { once: true });
      });
      const credential = { type: 'oauth', access: jwt({ 'https://api.openai.com/auth': { chatgpt_plan_type: 'plus' } }) };
      state.credentials.set(providerId, credential);
      return credential;
    },
    logout: async (providerId) => {
      state.logouts.push(providerId);
      state.credentials.delete(providerId);
    },
  };
  state.sdk = { ModelRuntime: { create: async () => runtime } } as unknown as PiSdk;
  return state;
}

const folders: string[] = [];
const savedOrigin = process.env['AGENT_GITU_PUBLIC_ORIGIN'];
let pi: Fake;

beforeEach(() => {
  delete process.env['AGENT_GITU_PUBLIC_ORIGIN'];
  const home = mkdtempSync(path.join(tmpdir(), 'gitu-chatgpt-'));
  folders.push(home);
  pi = fake();
  configurePiChatgpt({ loadSdk: async () => pi.sdk, authPath: () => path.join(home, 'pi', 'auth.json') });
});

afterEach(() => {
  configurePiChatgpt();
  for (const folder of folders.splice(0)) rmSync(folder, { force: true, recursive: true });
  if (savedOrigin === undefined) delete process.env['AGENT_GITU_PUBLIC_ORIGIN'];
  else process.env['AGENT_GITU_PUBLIC_ORIGIN'] = savedOrigin;
});

describe('ChatGPT subscription state', () => {
  it('reports signed out with the plan catalog, newest model first', async () => {
    const info = await chatgptSubscriptionInfo(true);
    expect(info).toMatchObject({ available: true, signedIn: false });
    expect(info.models.map((model) => model.id)).toEqual(['gpt-6.1-sol', 'gpt-6-astra']);
    expect(info.models[1]).toMatchObject({ displayName: 'GPT-6 Astra', vision: true, contextTokens: 272_000, effortLevels: ['low', 'high', 'max'] });
    expect(subscriptionModelContextWindow('gpt-6.1-sol')).toBe(500_000);
    expect(subscriptionModelContextWindow('nope')).toBeUndefined();
  });

  it('reports signed in with the plan read from public token claims only', async () => {
    const access = jwt({ 'https://api.openai.com/auth': { chatgpt_plan_type: 'pro' } });
    pi.credentials.set(CHATGPT_PI_PROVIDER, { type: 'oauth', access });
    const info = await chatgptSubscriptionInfo(true);
    expect(info).toMatchObject({ signedIn: true, planType: 'pro' });
    expect(JSON.stringify(info)).not.toContain(access);
  });

  it('ignores a stored API-key entry as a ChatGPT sign-in', async () => {
    pi.credentials.set(CHATGPT_PI_PROVIDER, { type: 'api_key', access: 'k' });
    expect((await chatgptSubscriptionInfo(true)).signedIn).toBe(false);
  });
});

describe('ChatGPT sign-in', () => {
  it('uses the browser flow on a desktop and connects when the user approves', async () => {
    const started = await startChatgptLogin();
    expect(started).toMatchObject({ alreadySignedIn: false, authUrl: 'https://auth.openai.com/oauth/authorize?x=1' });
    expect(started.userCode).toBeUndefined();
    expect(pi.logins[0]).toEqual({ method: 'browser', agentName: 'agent_gitu' });
    expect(chatgptLoginPending()).toBe(true);
    expect(await startChatgptLogin()).toEqual(started);

    pi.approve();
    expect(await waitForChatgptLogin(started.loginId!)).toBe(true);
    expect(chatgptLoginPending()).toBe(false);
    expect((await chatgptSubscriptionInfo()).signedIn).toBe(true);
  });

  it('uses device authorization when hosted and returns the one-time code', async () => {
    process.env['AGENT_GITU_PUBLIC_ORIGIN'] = 'https://gitu.example';
    const started = await startChatgptLogin();
    expect(pi.logins[0]?.method).toBe('device_code');
    expect(started).toMatchObject({ authUrl: 'https://auth.openai.com/codex/device', userCode: 'ABCD-1234' });
    pi.approve();
    expect(await waitForChatgptLogin(started.loginId!)).toBe(true);
  });

  it('does not start another sign-in when already signed in', async () => {
    pi.credentials.set(CHATGPT_PI_PROVIDER, { type: 'oauth', access: jwt({}) });
    expect(await startChatgptLogin()).toEqual({ alreadySignedIn: true });
    expect(pi.logins).toHaveLength(0);
  });

  it('reports a failed sign-in as not connected and clears the pending state', async () => {
    const started = await startChatgptLogin();
    pi.reject('access_denied');
    expect(await waitForChatgptLogin(started.loginId!)).toBe(false);
    expect(chatgptLoginPending()).toBe(false);
    expect((await chatgptSubscriptionInfo()).signedIn).toBe(false);
  });
});

describe('ChatGPT sign-out', () => {
  it('removes the stored sign-in and the state follows immediately', async () => {
    pi.credentials.set(CHATGPT_PI_PROVIDER, { type: 'oauth', access: jwt({}) });
    expect((await chatgptSubscriptionInfo(true)).signedIn).toBe(true);
    await chatgptLogout();
    expect(pi.logouts).toEqual([CHATGPT_PI_PROVIDER]);
    expect((await chatgptSubscriptionInfo()).signedIn).toBe(false);
  });

  it('cancels a sign-in that is still waiting', async () => {
    const started = await startChatgptLogin();
    await chatgptLogout();
    expect(await waitForChatgptLogin(started.loginId!)).toBe(false);
    expect(chatgptLoginPending()).toBe(false);
  });

  it('is harmless when nobody is signed in', async () => {
    await expect(chatgptLogout()).resolves.toBeUndefined();
    expect((await chatgptSubscriptionInfo()).signedIn).toBe(false);
  });
});

describe('PiSubscriptionClient', () => {
  it('refuses to answer when signed out, with a sign-in instruction', async () => {
    await expect(new PiSubscriptionClient('gpt-6-astra').complete([{ role: 'user', content: 'hi' }])).rejects.toMatchObject({
      message: expect.stringContaining('Sign in to ChatGPT'),
      details: { kind: 'auth' },
    });
  });

  it('answers with system prompt, effort, usage and reasoning handled', async () => {
    pi.credentials.set(CHATGPT_PI_PROVIDER, { type: 'oauth', access: jwt({}) });
    pi.nextResponse = {
      content: [{ type: 'thinking', thinking: 'weighing' }, { type: 'text', text: 'Hello ' }, { type: 'text', text: 'there' }],
      stopReason: 'stop',
      usage: { input: 10, output: 4, cacheRead: 3, cacheWrite: 1 },
    };
    const usage: unknown[] = [];
    const client = new PiSubscriptionClient('gpt-6-astra');
    const text = await client.complete(
      [
        { role: 'system', content: 'Be brief.' },
        { role: 'user', content: 'hi' },
      ],
      { effort: 'high', onUsage: (value) => usage.push(value) },
    );
    expect(text).toBe('Hello there');
    expect(client.lastReasoning).toBe('weighing');
    expect(usage).toEqual([{ inputTokens: 10, outputTokens: 4, cachedTokens: 4 }]);
    expect(pi.completions[0]).toMatchObject({ systemPrompt: 'Be brief.', reasoning: 'high' });
    expect((pi.completions[0]!.messages[0] as { content: string }).content).toBe('hi');
  });

  it('turns a model failure into a classified error, and a usage window into quota exhaustion', async () => {
    pi.credentials.set(CHATGPT_PI_PROVIDER, { type: 'oauth', access: jwt({}) });
    pi.nextResponse = { content: [], stopReason: 'error', errorMessage: 'HTTP 429: You have hit your usage limit' };
    await expect(new PiSubscriptionClient('gpt-6-astra').complete([{ role: 'user', content: 'hi' }])).rejects.toMatchObject({ details: { kind: 'quota_exhausted' } });
  });

  it('streams the whole answer as one delta outside an agent turn', async () => {
    pi.credentials.set(CHATGPT_PI_PROVIDER, { type: 'oauth', access: jwt({}) });
    const deltas: string[] = [];
    const text = await new PiSubscriptionClient('gpt-6-astra').completeStream([{ role: 'user', content: 'hi' }], {}, (delta) => deltas.push(delta));
    expect(deltas).toEqual([text]);
  });

  it('keeps a multi-turn exchange as a labelled transcript', () => {
    const turn = subscriptionUserTurn([
      { role: 'system', content: 'sys' },
      { role: 'user', content: 'one' },
      { role: 'assistant', content: 'two' },
      { role: 'user', content: 'three' },
    ]);
    expect(turn.text).toBe('User:\none\n\nAssistant:\ntwo\n\nUser:\nthree');
  });
});

describe('PiNativeRuntime on the built-in ChatGPT provider', () => {
  function turnInput(): NativeTaskInput {
    return {
      cwd: folders[0]!,
      text: 'go',
      instructions: 'sys',
      config: {},
      permissions: {},
      signal: new AbortController().signal,
      tools: [],
      onThread: () => {},
      onTurn: () => {},
      onEvent: async () => {},
      onRequest: async () => ({}),
    } as unknown as NativeTaskInput;
  }

  it('stops with a sign-in instruction when nobody is signed in, without registering anything', async () => {
    const runtime = new PiNativeRuntime({
      agentDir: folders[0]!,
      target: { providerId: CHATGPT_PI_PROVIDER, builtin: true, baseUrl: '', apiKey: '', modelId: 'gpt-6-astra' },
      loadSdk: async () => ({
        ...pi.sdk,
        SettingsManager: { create: () => ({}) },
        SessionManager: { create: () => ({ getSessionId: () => 's', getSessionFile: () => undefined }) },
      }) as unknown as PiSdk,
    });
    await expect(runtime.runTurn(turnInput())).rejects.toMatchObject({ message: expect.stringContaining('Sign in to ChatGPT'), details: { kind: 'auth' } });
    expect(pi.registered).toEqual([]);
  });
});
