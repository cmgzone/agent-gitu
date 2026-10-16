import { describe, expect, it, vi } from 'vitest';
import { resolveLlm } from '../src/llm/providers.js';
import { resilientLlm } from '../src/llm/resilient.js';
import { recoveringLlm } from '../src/agent/task-recovery.js';
import { UsageTrackingClient } from '../src/llm/llm.js';

vi.mock('../src/llm/codex-subscription.js', () => ({
  codexExecutable: () => '/bundled/codex',
  subscriptionModelContextWindow: () => undefined,
  CodexSubscriptionClient: class {
    name = 'chatgpt-subscription:test';
    async complete() {
      return 'legacy response';
    }
    async completeStream() {
      return 'legacy response';
    }
  },
}));

describe('provider-specific native execution routing', () => {
  it('selects the native runner only for ChatGPT subscriptions', () => {
    const native = resolveLlm({ provider: 'chatgpt', model: 'gpt-5.6-luna', env: {} });
    expect(native.client.nativeTask?.mode).toBe('codex-native');
    const openrouter = resolveLlm({ provider: 'openrouter', model: 'test/model', env: { OPENROUTER_API_KEY: 'test-key' } });
    expect(openrouter.client.nativeTask).toBeUndefined();
    expect(openrouter.providerId).toBe('openrouter');
  });

  it('keeps the legacy bridge behind an explicit compatibility option', () => {
    expect(resolveLlm({ provider: 'chatgpt', model: 'gpt-5.6-luna', env: {}, subscriptionExecutionMode: 'legacy' }).client.nativeTask).toBeUndefined();
    expect(resolveLlm({ provider: 'chatgpt', model: 'gpt-5.6-luna', env: { GITU_CHATGPT_EXECUTION_MODE: 'legacy' } }).client.nativeTask).toBeUndefined();
    expect(
      resolveLlm({ provider: 'chatgpt', model: 'gpt-5.6-luna', env: { GITU_CHATGPT_EXECUTION_MODE: 'legacy' }, subscriptionExecutionMode: 'native' }).client.nativeTask?.mode,
    ).toBe('codex-native');
  });

  it('preserves native ownership through accounting and recovery wrappers', () => {
    const client = resolveLlm({ provider: 'chatgpt', model: 'gpt-5.6-luna', env: {} }).client;
    const resilient = resilientLlm(client);
    const recovering = recoveringLlm(resilient, { onWait: () => {} });
    expect(resilient.nativeTask).toBe(client.nativeTask);
    expect(recovering.nativeTask).toBe(client.nativeTask);
    expect(new UsageTrackingClient(recovering, () => {}).nativeTask?.mode).toBe('codex-native');
  });
});
