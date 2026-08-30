import { afterEach, describe, expect, it } from 'vitest';
import { CodexSubscriptionClient, codexExecutable } from '../src/llm/codex-subscription.js';
import { PROVIDERS, resolveImageSupport, resolveLlm } from '../src/llm/providers.js';

describe('ChatGPT subscription provider', () => {
  const originalCodexPath = process.env['HERMES_CODEX_PATH'];

  afterEach(() => {
    if (originalCodexPath === undefined) delete process.env['HERMES_CODEX_PATH'];
    else process.env['HERMES_CODEX_PATH'] = originalCodexPath;
  });

  it('is explicitly configured to use the local Codex bridge', () => {
    const spec = PROVIDERS['chatgpt'];
    expect(spec).toMatchObject({
      id: 'chatgpt',
      auth: 'chatgpt-subscription',
      baseUrl: 'codex://chatgpt',
      keyEnvVars: [],
    });
  });

  it('constructs the official SDK-backed client without an API key', () => {
    // The constructor only needs a resolvable local binary; it does not start
    // Codex or make a network request. Point it at Node for an isolated test.
    process.env['HERMES_CODEX_PATH'] = process.execPath;
    expect(codexExecutable()).toBe(process.execPath);
    const resolved = resolveLlm({
      provider: 'chatgpt',
      model: 'gpt-5.6-terra',
      workingDirectory: process.cwd(),
      env: {},
    });
    expect(resolved.providerId).toBe('chatgpt');
    expect(resolved.baseUrl).toBe('codex://chatgpt');
    expect(resolved.model).toBe('gpt-5.6-terra');
    expect(resolved.client).toBeInstanceOf(CodexSubscriptionClient);
  });

  it('allows image attachments through the Codex subscription bridge', async () => {
    await expect(resolveImageSupport({ providerId: 'chatgpt', model: 'gpt-5.6-terra', env: {} })).resolves.toBe(true);
  });
});
