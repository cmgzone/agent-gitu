import { readFileSync } from 'node:fs';
import { createContext, Script } from 'node:vm';
import { describe, expect, it, vi } from 'vitest';

function worker() {
  const chunks: unknown[] = [];
  class LLM {}
  class LLMStream {
    chatCtx: unknown; abortController = new AbortController(); queue = { put: (chunk: unknown) => chunks.push(chunk) };
    constructor(_model: unknown, options: { chatCtx: unknown }) { this.chatCtx = options.chatCtx; }
  }
  const source = readFileSync(new URL('../voice-worker/agent.mjs', import.meta.url), 'utf8')
    .replace(/^import .*;\r?\n/gm, '').replace('export default defineAgent(', 'const workerAgent = defineAgent(')
    .replace(/^cli\.runApp\(.*;\r?$/m, '');
  const context = createContext({ llm: { LLM, LLMStream }, AbortController, defineAgent: (value: unknown) => value, console, process: { env: {} } });
  new Script(source + '\nthis.ExistingGituModel = ExistingGituModel; this.workerAgent = workerAgent;').runInContext(context);
  return { context, chunks };
}

describe('Cloud worker speech bridge', () => {
  it('waits for a realistic backend round trip and passes the reply to speech synthesis', async () => {
    const w = worker();
    const performRpc = vi.fn(async (options: { responseTimeout: number }) => new Promise<string>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('RPC timed out')), options.responseTimeout);
      setTimeout(() => { clearTimeout(timeout); resolve('{"text":"Hi, I’m Atlas. How can I help?"}'); }, 150);
    }));
    const model = new w.context.ExistingGituModel({ localParticipant: { performRpc } }, 'user-test', 'call-test');
    const stream = model.chat({ chatCtx: { items: [{ type: 'message', role: 'user', id: 'turn-1', textContent: 'Hello' }] } });
    await stream.run();
    expect(performRpc.mock.calls[0]?.[0].responseTimeout).toBe(40_000);
    expect(w.chunks).toEqual([{ id: 'turn-1', delta: { role: 'assistant', content: 'Hi, I’m Atlas. How can I help?' } }]);
  });
  it('does not speak a late reply after interruption', async () => {
    const w = worker();
    const model = new w.context.ExistingGituModel({ localParticipant: { performRpc: async () => '{"text":"late reply"}' } }, 'user-test', 'call-test');
    const stream = model.chat({ chatCtx: { items: [] } }); stream.abortController.abort();
    await stream.run(); expect(w.chunks).toEqual([]);
  });
});
