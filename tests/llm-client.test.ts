import { afterEach, describe, expect, it } from 'vitest';
import {
  OpenAiCompatClient,
  classifyLlmHttpError,
  DASHSCOPE_THINKING_BUDGETS,
  effortStyleFor,
  effortWireValue,
  extractJson,
  findXmlCallStart,
  parseXmlFunctionCall,
  xmlMarkerHoldBack,
} from '../src/llm/llm.js';

describe('OpenAiCompatClient retry behavior', () => {
  const originalFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  function mockFetch(handler: (url: string, init?: RequestInit) => Promise<Response>): () => number {
    let calls = 0;
    globalThis.fetch = (async (input: unknown, init?: RequestInit) => {
      calls++;
      return handler(String(input), init);
    }) as typeof fetch;
    return () => calls;
  }

  function jsonResponse(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
    });
  }

  const client = () => new OpenAiCompatClient({ apiKey: 'sk-x', baseUrl: 'https://example.test/v1', model: 'm' });
  const msg = [{ role: 'user' as const, content: 'hi' }];

  it('retries a transient 429 and succeeds', async () => {
    const calls = mockFetch(async () => {
      if (calls() === 1) {
        return jsonResponse(
          { error: { type: 'FreeUsageLimitError', message: 'Rate limit exceeded. Please try again later.' } },
          429,
        );
      }
      return jsonResponse({ choices: [{ message: { content: 'ok' } }] });
    });
    const out = await client().complete(msg, { retries: 1, retryDelayMs: 1 });
    expect(out).toBe('ok');
    expect(calls()).toBe(2);
  });

  it('gives up after retries and surfaces a friendly rate-limit message', async () => {
    const calls = mockFetch(
      async () =>
        jsonResponse(
          { error: { type: 'FreeUsageLimitError', message: 'Rate limit exceeded. Please try again later.' } },
          429,
        ),
    );
    const err = await client().complete(msg, { retries: 2, retryDelayMs: 1 }).catch((e) => e as Error);
    expect(err).toBeInstanceOf(Error);
    expect(err.message).toContain('LLM rate limited (HTTP 429)');
    expect(err.message).toContain('try again later');
    expect(calls()).toBe(3); // initial + 2 retries
  });

  it('does not retry on 4xx client errors', async () => {
    const calls = mockFetch(async () => jsonResponse({ error: { message: 'bad model' } }, 400));
    await expect(client().complete(msg, { retries: 3, retryDelayMs: 1 })).rejects.toThrow(/LLM HTTP 400/);
    expect(calls()).toBe(1);
  });

  it('retries transient 503 in streaming mode', async () => {
    const calls = mockFetch(async () => {
      if (calls() === 1) return jsonResponse({ error: { message: 'upstream down' } }, 503);
      const body =
        'data: ' + JSON.stringify({ choices: [{ delta: { content: 'hi' } }] }) + '\n\ndata: [DONE]\n\n';
      return new Response(body, { status: 200, headers: { 'content-type': 'text/event-stream' } });
    });
    const out = await client().completeStream(msg, { retries: 1, retryDelayMs: 1 }, () => {});
    expect(out).toBe('hi');
    expect(calls()).toBe(2);
  });

  it('does not issue a duplicate completion when a healthy stream yields reasoning-only content', async () => {
    const calls = mockFetch(async () => {
      const body = 'data: ' + JSON.stringify({ choices: [{ delta: { reasoning_content: 'thinking...' } }] }) + '\n\ndata: [DONE]\n\n';
      return new Response(body, { status: 200, headers: { 'content-type': 'text/event-stream' } });
    });
    const out = await client().completeStream(msg, {}, () => {});
    expect(out).toBe('');
    expect(calls()).toBe(1);
  });

  it('falls back to a single completion only when the stream is broken or unsupported', async () => {
    const calls = mockFetch(async () => {
      if (calls() === 1) return new Response('not an sse stream at all', { status: 200, headers: { 'content-type': 'text/html' } });
      return jsonResponse({ choices: [{ message: { content: 'plain json' } }] });
    });
    const out = await client().completeStream(msg, {}, () => {});
    expect(out).toBe('plain json');
    expect(calls()).toBe(2);
  });

  it('does not hide a second HTTP request when a coordinated stream is unsupported', async () => {
    const calls = mockFetch(async () => new Response('not an sse stream at all', { status: 200, headers: { 'content-type': 'text/html' } }));
    const err = await client().completeStream(msg, { logicalRequestId: 'task:main:1' }, () => {}).catch((e) => e as Error);
    expect(err.message).toContain('streaming response was incomplete or unsupported');
    expect(calls()).toBe(1);
  });

  it('does not retry internally by default; the shared coordinator owns retries', async () => {
    const calls = mockFetch(async () => {
      if (calls() === 1) return jsonResponse({ error: { message: 'busy' } }, 429);
      return jsonResponse({ choices: [{ message: { content: 'recovered' } }] });
    });
    await expect(client().complete(msg)).rejects.toThrow(/rate limited/);
    expect(calls()).toBe(1);
  });

  it('surfaces a clear message when the account has no credits', async () => {
    const calls = mockFetch(
      async () =>
        jsonResponse(
          { error: { type: 'CreditsError', message: 'Insufficient balance. Manage your billing here: https://opencode.ai' } },
          401,
        ),
    );
    const err = await client().complete(msg, { retries: 0 }).catch((e) => e as Error);
    expect(err.message).toContain('no credits');
    expect(err.message).toContain('paid model');
    expect(calls()).toBe(1);
  });

  it('surfaces a clear message when the plan cannot access the model', async () => {
    const calls = mockFetch(
      async () =>
        jsonResponse(
          { error: { type: 'AccessError', message: 'Access to model denied. Please make sure you are eligible for using the model.' } },
          403,
        ),
    );
    const err = await client().complete(msg, { retries: 0 }).catch((e) => e as Error);
    expect(err.message).toContain('model not available to you');
    expect(err.message).toContain('free');
    expect(calls()).toBe(1);
  });

  it('surfaces a clear message when the upstream endpoint is unavailable', async () => {
    const calls = mockFetch(
      async () =>
        jsonResponse(
          { error: { type: 'server_error', message: 'Upstream request failed: Endpoint is unavailable.' } },
          503,
        ),
    );
    const err = await client().complete(msg, { retries: 0 }).catch((e) => e as Error);
    expect(err.message).toContain('upstream unavailable');
    expect(err.message).toContain('try again later');
    expect(calls()).toBe(1);
  });

  it('normalizes native function calls into one discriminated tool-call turn', async () => {
    let requestBody: Record<string, unknown> | undefined;
    mockFetch(async (_url, init) => {
      requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
      return jsonResponse({
        id: 'req-native',
        choices: [
          {
            message: {
              content: 'I will inspect the files.',
              tool_calls: [{ id: 'call-1', function: { name: 'agent_gitu_action', arguments: '{"action":{"type":"show_plan"}}' } }],
            },
          },
        ],
      });
    });
    const turn = await client().completeTurn(msg, {
      protocolMode: 'native',
      tools: [{ name: 'agent_gitu_action', description: 'submit an action', parameters: { type: 'object' } }],
      toolChoice: 'required',
    });
    expect(requestBody).toMatchObject({ tool_choice: 'required' });
    expect(requestBody?.['tools']).toEqual([
      { type: 'function', function: { name: 'agent_gitu_action', description: 'submit an action', parameters: { type: 'object' } } },
    ]);
    expect(turn).toEqual({
      kind: 'tool_calls',
      calls: [{ id: 'call-1', name: 'agent_gitu_action', arguments: { action: { type: 'show_plan' } } }],
      preamble: 'I will inspect the files.',
      metadata: { providerRequestId: 'req-native', reasoning: undefined, usage: undefined, logicalRequestId: undefined },
    });
  });

  it('classifies unsupported tool schemas separately from malformed model output', () => {
    const error = classifyLlmHttpError(400, JSON.stringify({ error: { message: 'tools are not supported for this model' } }));
    expect(error.details.kind).toBe('tool_protocol_incompatible');
  });
});

describe('effort semantics', () => {
  it('detects the DashScope effort style from the base URL', () => {
    expect(effortStyleFor('https://dashscope-intl.aliyuncs.com/compatible-mode/v1')).toBe('dashscope');
    expect(effortStyleFor('https://api.deepseek.com')).toBe('deepseek');
    expect(effortStyleFor('https://api.openai.com/v1')).toBe('openai');
  });

  it('keeps max distinct on DashScope via thinking budgets', () => {
    expect(DASHSCOPE_THINKING_BUDGETS['max']).toBeGreaterThan(DASHSCOPE_THINKING_BUDGETS['high']);
    expect(DASHSCOPE_THINKING_BUDGETS['high']).toBeGreaterThan(DASHSCOPE_THINKING_BUDGETS['medium']);
    expect(DASHSCOPE_THINKING_BUDGETS['medium']).toBeGreaterThan(DASHSCOPE_THINKING_BUDGETS['low']);
    expect(effortWireValue('max', 'dashscope')).toBe('max');
  });

  it('collapses max to high for generic OpenAI-compatible endpoints', () => {
    expect(effortWireValue('max', 'openai')).toBe('high');
    expect(effortWireValue('low', 'openai')).toBe('low');
    expect(effortWireValue('high', 'openai')).toBe('high');
  });

  it('preserves DeepSeek max effort and maps its compatibility medium level', () => {
    expect(effortWireValue('low', 'deepseek')).toBe('low');
    expect(effortWireValue('medium', 'deepseek')).toBe('high');
    expect(effortWireValue('max', 'deepseek')).toBe('max');
  });

  it('sends DeepSeek thinking controls with its native effort value', async () => {
    let requestBody: Record<string, unknown> | undefined;
    const originalFetch = globalThis.fetch;
    try {
      globalThis.fetch = (async (_url: unknown, init?: RequestInit) => {
        requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
        return new Response(JSON.stringify({ choices: [{ message: { content: 'ok' } }] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }) as typeof fetch;
      const deepseek = new OpenAiCompatClient({ apiKey: 'ds-x', baseUrl: 'https://api.deepseek.com', model: 'deepseek-v4-pro' });
      await expect(deepseek.complete([{ role: 'user', content: 'hi' }], { effort: 'max', retries: 0 })).resolves.toBe('ok');
      expect(requestBody).toMatchObject({ reasoning_effort: 'max', thinking: { type: 'enabled' } });
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

describe('extractJson', () => {
  it('extracts a JSON object embedded in prose', () => {
    expect(extractJson('I will now act.\n{"action":{"type":"complete","summary":"done"}}')).toEqual({
      action: { type: 'complete', summary: 'done' },
    });
  });
  it('extracts a fenced json block', () => {
    expect(extractJson('```\n{"a":1}\n```')).toEqual({ a: 1 });
  });
  it('returns undefined when there is no JSON', () => {
    expect(extractJson('just plain text')).toBeUndefined();
  });
});

describe('parseXmlFunctionCall', () => {
  it('parses a dots_function_call block with a JSON-array parameter', () => {
    const text =
      'I will start by setting the acceptance criteria.\n' +
      '<dots_function_call>\n<invoke name="set_criteria">\n<parameter name="criteria">\n' +
      '["hello.ts exists", "tests pass"]\n</parameter>\n</invoke>\n</dots_function_call>';
    const out = parseXmlFunctionCall(text);
    expect(out).toEqual({ type: 'set_criteria', criteria: ['hello.ts exists', 'tests pass'] });
  });
  it('parses a tool call with object params (dots format)', () => {
    const text =
      '<dots_function_call>\n<invoke name="write_file">\n<parameter name="path">src/a.ts</parameter>\n' +
      '<parameter name="content">export const a = 1;</parameter>\n</invoke>\n</dots_function_call>';
    const out = parseXmlFunctionCall(text);
    expect(out).toEqual({ type: 'write_file', path: 'src/a.ts', content: 'export const a = 1;' });
  });
  it('parses a generic <function_call> variant', () => {
    const text = '<function_call name="run_command"><parameter name="command">node --version</parameter></function_call>';
    expect(parseXmlFunctionCall(text)).toEqual({ type: 'run_command', command: 'node --version' });
  });
  it('returns undefined when no invoke is present', () => {
    expect(parseXmlFunctionCall('just thinking out loud')).toBeUndefined();
  });
});

describe('findXmlCallStart', () => {
  it('locates the first marker', () => {
    const text = 'prose <dots_function_call>...';
    expect(findXmlCallStart(text)).toBe(6);
  });
  it('returns -1 when no marker is present', () => {
    expect(findXmlCallStart('no markers here')).toBe(-1);
  });
});

describe('xmlMarkerHoldBack', () => {
  it('holds back a partial marker at the tail', () => {
    expect(xmlMarkerHoldBack('thinking <dots_func')).toBe(10); // length of '<dots_func'
  });
  it('returns 0 when the tail cannot start a marker', () => {
    expect(xmlMarkerHoldBack('plain text ')).toBe(0);
  });
});
