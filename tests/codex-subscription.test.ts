import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CodexSubscriptionClient, codexExecutable } from '../src/llm/codex-subscription.js';
import { PROVIDERS, resolveImageSupport, resolveLlm } from '../src/llm/providers.js';

describe('ChatGPT subscription provider', () => {
  const originalCodexPath = process.env['HERMES_CODEX_PATH'];
  const originalGituCodexPath = process.env['GITU_CODEX_PATH'];

  afterEach(() => {
    if (originalCodexPath === undefined) delete process.env['HERMES_CODEX_PATH'];
    else process.env['HERMES_CODEX_PATH'] = originalCodexPath;
    if (originalGituCodexPath === undefined) delete process.env['GITU_CODEX_PATH'];
    else process.env['GITU_CODEX_PATH'] = originalGituCodexPath;
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

  it('ignores an invalid runtime override instead of failing later with spawn EFTYPE', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'agent-gitu-invalid-codex-'));
    const invalid = join(dir, 'not-codex.cmd');
    await writeFile(invalid, '@echo off\n');
    try {
      process.env['GITU_CODEX_PATH'] = invalid;
      delete process.env['HERMES_CODEX_PATH'];
      expect(codexExecutable()).toBeTruthy();
      expect(codexExecutable()).not.toBe(invalid);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('allows image attachments through the Codex subscription bridge', async () => {
    await expect(resolveImageSupport({ providerId: 'chatgpt', model: 'gpt-5.6-terra', env: {} })).resolves.toBe(true);
  });
});
