import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CodexSubscriptionClient, codexExecutable, subscriptionModelContextWindow } from '../src/llm/codex-subscription.js';
import { PROVIDERS, modelMetadataFor, resolveImageSupport, resolveLlm } from '../src/llm/providers.js';
import { compactHistory, compactionPolicyForWindow } from '../src/agent/compaction.js';
import type { LlmMessage } from '../src/llm/llm.js';

describe('ChatGPT subscription provider', () => {
  const originalCodexPath = process.env['HERMES_CODEX_PATH'];
  const originalGituCodexPath = process.env['GITU_CODEX_PATH'];

  afterEach(() => {
    vi.unstubAllEnvs();
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

  it('keeps its offline seed usable when the runtime cannot be queried', () => {
    const spec = PROVIDERS['chatgpt']!;
    // The picker is filled from the runtime's live list; the seed only answers
    // when that query fails, so the default must always be among the seeds and
    // no retired model may linger there (the service rejects retired ids).
    expect(spec.models).toContain(spec.defaultModel);
    expect(spec.models).toContain('gpt-6.1-sol');
    expect(new Set(spec.models).size).toBe(spec.models.length);
    expect(spec.models.every((id) => /^gpt-[\w.-]+$/.test(id))).toBe(true);
  });

  it('constructs the subscription bridge client without an API key', () => {
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
    expect(resolved.toolMode).toBe('native');
  });

  it('uses the subscription runtime window for compaction even without a catalog entry', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'gitu-model-metadata-'));
    vi.stubEnv('CODEX_HOME', dir);
    try {
      await writeFile(join(dir, 'models_cache.json'), JSON.stringify({ models: [{ slug: 'test-subscription-model', context_window: 272000 }] }));
      expect(subscriptionModelContextWindow('test-subscription-model')).toBe(272000);
      expect(modelMetadataFor(undefined, 'chatgpt', 'test-subscription-model')).toMatchObject({ contextTokens: 272000, source: 'codex-runtime' });
      const history: LlmMessage[] = [{ role: 'system', content: 's'.repeat(46_000) }, ...Array.from({ length: 10 }, (_, index): LlmMessage => ({ role: 'user', content: `Read result ${index}: ` + 'source\n'.repeat(3_000) }))];
      const meta = modelMetadataFor(undefined, 'chatgpt', 'test-subscription-model');
      expect(compactHistory(history, undefined, compactionPolicyForWindow(meta?.contextTokens))).toBe(false);
      expect(history).toHaveLength(11);
      expect(compactHistory(history, undefined, compactionPolicyForWindow())).toBe(true);
      expect(modelMetadataFor(undefined, 'openrouter', 'test-subscription-model')).toBeUndefined();
      expect(subscriptionModelContextWindow('unknown')).toBeUndefined();
      await writeFile(join(dir, 'models_cache.json'), '{malformed');
      expect(subscriptionModelContextWindow('test-subscription-model')).toBeUndefined();
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
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
