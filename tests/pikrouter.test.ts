import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import {
  DEFAULT_PIKROUTER_AUTH_URL,
  DEFAULT_PIKROUTER_BASE_URL,
  DEFAULT_PIKROUTER_MODEL,
  createPikRouterClient,
  loginPikRouter,
  streamPikRouterCompletion,
} from '../src/llm/pikrouter.js';
import { PROVIDERS, providerSpec, resolveLlm } from '../src/llm/providers.js';
import { effortStyleFor } from '../src/llm/llm.js';
import { piProviderConfig } from '../src/llm/pi-native.js';

describe('PikRouter integration', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('registers pikrouter in PROVIDERS registry', () => {
    const spec = PROVIDERS['pikrouter'];
    expect(spec).toBeDefined();
    expect(spec!.id).toBe('pikrouter');
    expect(spec!.baseUrl).toBe('https://pikrouter.pikpam.com/v1');
    expect(spec!.defaultModel).toBe('gpt-4o-mini');
    expect(spec!.keyEnvVars).toContain('PIKROUTER_API_KEY');
    expect(spec!.publicModels).toBe(true);
    expect(spec!.capabilities?.streamingTools).toBe(true);
  });

  it('authenticates user and returns token and user info', async () => {
    const fakeToken = 'pikrouter_jwt_test_token_12345';
    const fakeUser = { id: 'usr_1', email: 'customer@app.com', name: 'Test User' };

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ token: fakeToken, user: fakeUser }),
    } as unknown as Response);

    const result = await loginPikRouter({
      email: 'customer@app.com',
      password: 'password123',
      saveKey: false,
    });

    expect(globalThis.fetch).toHaveBeenCalledWith(
      DEFAULT_PIKROUTER_AUTH_URL,
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'customer@app.com', password: 'password123' }),
      }),
    );
    expect(result.token).toBe(fakeToken);
    expect(result.user).toEqual(fakeUser);
  });

  it('throws descriptive error on authentication failure', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({ error: 'Invalid credentials' }),
      text: async () => 'Invalid credentials',
    } as unknown as Response);

    await expect(
      loginPikRouter({
        email: 'customer@app.com',
        password: 'wrongpassword',
        saveKey: false,
      }),
    ).rejects.toThrow(/PikRouter authentication failed \(401\): Invalid credentials/);
  });

  it('creates an OpenAiCompatClient configured with PikRouter credentials', () => {
    const client = createPikRouterClient({
      token: 'test_token',
      model: 'gemini-1.5-flash',
    });
    expect(client).toBeDefined();
    expect(client.name).toBe('openai-compat:gemini-1.5-flash');
  });

  it('resolves pikrouter provider using resolveLlm when key is in env', () => {
    const resolved = resolveLlm({
      provider: 'pikrouter',
      env: { PIKROUTER_API_KEY: 'test-token' } as NodeJS.ProcessEnv,
    });
    expect(resolved.providerId).toBe('pikrouter');
    expect(resolved.baseUrl).toBe('https://pikrouter.pikpam.com/v1');
    expect(resolved.model).toBe('gpt-4o-mini');
  });

  it('streams completion deltas via streamPikRouterCompletion', async () => {
    const chunks = [
      'data: {"choices":[{"delta":{"content":"Hello"}}]}\n\n',
      'data: {"choices":[{"delta":{"content":" from"}}]}\n\n',
      'data: {"choices":[{"delta":{"content":" PikRouter!"}}]}\n\n',
      'data: [DONE]\n\n',
    ];

    let chunkIdx = 0;
    const stream = new ReadableStream({
      pull(controller) {
        if (chunkIdx < chunks.length) {
          controller.enqueue(new TextEncoder().encode(chunks[chunkIdx++]));
        } else {
          controller.close();
        }
      },
    });

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      body: stream,
    } as unknown as Response);

    const received: string[] = [];
    for await (const delta of streamPikRouterCompletion({
      token: 'fake-token',
      messages: [{ role: 'user', content: 'Hi' }],
    })) {
      received.push(delta);
    }

    expect(received.join('')).toBe('Hello from PikRouter!');
  });

  it('applies deepseek effort style and flattens array messages to strings for PikRouter wire payloads', async () => {
    expect(effortStyleFor(DEFAULT_PIKROUTER_BASE_URL)).toBe('deepseek');

    let sentBody: Record<string, unknown> | undefined;
    globalThis.fetch = vi.fn().mockImplementation(async (_url, opts) => {
      sentBody = JSON.parse(opts.body);
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('data: {"choices":[{"delta":{"content":"ok"}}]}\n\n'));
          controller.enqueue(new TextEncoder().encode('data: [DONE]\n\n'));
          controller.close();
        },
      });
      return {
        ok: true,
        status: 200,
        body: stream,
      };
    });

    const client = createPikRouterClient({ token: 'test-token' });
    const messages = [
      { role: 'system', content: 'You are helpful' },
      {
        role: 'user',
        content: [
          { type: 'text', text: 'Hello' },
          { type: 'text', text: 'world' },
        ],
      },
    ] as unknown as Parameters<typeof client.completeTurnStream>[0];

    let output = '';
    await client.completeTurnStream!(messages, {}, (delta) => {
      output += delta;
    });

    expect(output).toBe('ok');
    expect(sentBody).toBeDefined();
    // Verify that message content at index 1 is strictly a string (not an array)
    const wireMessages = sentBody!.messages as Array<{ role: string; content: unknown }>;
    expect(typeof wireMessages[1].content).toBe('string');
    expect(wireMessages[1].content).toBe('Hello\nworld');
  });

  it('supports pikprovider alias and configures piProviderConfig for PiNativeRuntime', () => {
    expect(providerSpec('pikprovider')?.id).toBe('pikrouter');
    expect(providerSpec('pik')?.id).toBe('pikrouter');

    const resolved = resolveLlm({
      provider: 'pikprovider',
      env: { PIKROUTER_API_KEY: 'test-token', HERMES_RUNTIME: 'pi' } as NodeJS.ProcessEnv,
    });
    expect(resolved.providerId).toBe('pikrouter');
    expect(resolved.client.nativeTask?.mode).toBe('pi-native');

    const piConfig = piProviderConfig({
      providerId: 'gitu-pikrouter',
      baseUrl: DEFAULT_PIKROUTER_BASE_URL,
      apiKey: 'test-token',
      modelId: 'deepseek-chat',
      vision: true,
    });
    const model = piConfig.models?.[0];
    expect(model?.input).toEqual(['text']);
    expect(model?.thinkingLevelMap).toMatchObject({
      medium: 'high',
      high: 'high',
      max: 'max',
    });
    expect(model?.compat).toMatchObject({
      thinkingFormat: 'deepseek',
      requiresReasoningContentOnAssistantMessages: true,
      maxTokensField: 'max_tokens',
      supportsDeveloperRole: false,
      supportsStore: false,
    });
  });
});
