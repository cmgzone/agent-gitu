import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { resolveLlm } from '../src/llm/providers.js';
import { resilientLlm } from '../src/llm/resilient.js';
import { recoveringLlm } from '../src/agent/task-recovery.js';
import { UsageTrackingClient } from '../src/llm/llm.js';
import { selectedRuntime } from '../src/llm/runtime-mode.js';

const folders: string[] = [];
const previousHome = process.env['AGENT_GITU_HOME'];
afterEach(() => {
  for (const folder of folders.splice(0)) rmSync(folder, { force: true, recursive: true });
  if (previousHome === undefined) delete process.env['AGENT_GITU_HOME'];
  else process.env['AGENT_GITU_HOME'] = previousHome;
});

/** pi stores its sessions and provider registration under the Gitu home. */
function isolatedHome(): void {
  const home = mkdtempSync(path.join(tmpdir(), 'gitu-routing-'));
  folders.push(home);
  process.env['AGENT_GITU_HOME'] = home;
}

describe('runtime selection', () => {
  it('always resolves to pi as the sole provider-owned runtime', () => {
    expect(selectedRuntime({})).toBe('pi');
    expect(selectedRuntime({ RUNTIME: 'PI' })).toBe('pi');
    expect(selectedRuntime({ RUNTIME: 'codex' })).toBe('pi');
    expect(selectedRuntime({ GITU_RUNTIME: 'codex' })).toBe('pi');
    expect(selectedRuntime({ RUNTIME: 'node' })).toBe('pi');
  });
});

describe('pi runtime routing (default)', () => {
  it('gives an API-key provider the embedded pi loop', () => {
    isolatedHome();
    const resolved = resolveLlm({ provider: 'deepseek', model: 'deepseek-flash', env: { DEEPSEEK_API_KEY: 'test-key' } });
    expect(resolved.providerId).toBe('deepseek');
    expect(resolved.client.nativeTask?.mode).toBe('pi-native');
  });

  it('gives a custom OpenAI-compatible endpoint the pi loop too', () => {
    isolatedHome();
    const resolved = resolveLlm({ baseUrl: 'https://example.test/v1', model: 'local-model', env: { HERMES_API_KEY: 'test-key' } });
    expect(resolved.providerId).toBe('custom');
    expect(resolved.client.nativeTask?.mode).toBe('pi-native');
  });

  it('serves the ChatGPT subscription through pi, whatever RUNTIME says', () => {
    isolatedHome();
    for (const env of [{}, { RUNTIME: 'codex' }]) {
      const resolved = resolveLlm({ provider: 'chatgpt', model: 'gpt-5.6-luna', env });
      expect(resolved.providerId).toBe('chatgpt');
      expect(resolved.model).toBe('gpt-5.6-luna');
      expect(resolved.client.nativeTask?.mode).toBe('pi-native');
      expect(resolved.client.name).toBe('chatgpt-subscription:gpt-5.6-luna');
    }
  });

  it('preserves pi ownership through accounting and recovery wrappers', () => {
    isolatedHome();
    const client = resolveLlm({ provider: 'deepseek', model: 'deepseek-flash', env: { DEEPSEEK_API_KEY: 'test-key' } }).client;
    const resilient = resilientLlm(client);
    const recovering = recoveringLlm(resilient, { onWait: () => {} });
    expect(resilient.nativeTask).toBe(client.nativeTask);
    expect(recovering.nativeTask).toBe(client.nativeTask);
    expect(new UsageTrackingClient(recovering, () => {}).nativeTask?.mode).toBe('pi-native');
  });
});
