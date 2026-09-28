/** Opt-in live check: synthetic files, an isolated Cowork store, no user history. */
import { mkdtempSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { CoworkStore } from '../src/cowork/store.js';
import { CoworkMemory } from '../src/cowork/memory.js';
import { MemoryStore } from '../src/memory/memory-store.js';
import { ProjectGuard } from '../src/guard/project-guard.js';
import { SkillStore } from '../src/skills/skills.js';
import { resolveLlm } from '../src/llm/providers.js';
import { runConversationTurn } from '../src/cowork/runner.js';

const provider = process.argv[2] ?? 'openrouter';
const model = process.argv[3];
const root = mkdtempSync(path.join(tmpdir(), 'gitu-continuation-check-'));
writeFileSync(path.join(root, 'package.json'), '{"name":"continuation-check"}');
writeFileSync(path.join(root, 'input.txt'), '18\n24\n');
const resolved = resolveLlm({ provider, model, workingDirectory: root });
const store = new CoworkStore(path.join(root, 'cowork.json'));
const agent = store.saveAgent({ name: 'ContinuationCheck', systemPrompt: 'Complete the requested local task using the available tools.', provider, model: resolved.model, useHostComputer: true, allowWrites: true, allowShell: false, allowConfig: false });
const conversation = store.saveConversation({ kind: 'dm', memberIds: [agent.id] });
const memory = new CoworkMemory(MemoryStore.forProject(root), path.basename(root));
const ctx = { cwd: root, guard: ProjectGuard.detect(root), skills: SkillStore.forProject(root) };
const trigger = store.appendMessage(conversation.id, { role: 'user', via: 'web', text: 'Read input.txt, calculate the sum, write the sum to result.txt, and read result.txt to verify it. Track these steps with a checklist and complete the checklist after verification. Do all the work in this turn. Do not browse, use shell commands, schedule anything, contact anyone, or ask for approval.' });
const originalFetch = globalThis.fetch;
let requests = 0;
const wire: Record<string, unknown>[] = [];
globalThis.fetch = async (url, init) => {
  if (++requests > 24) throw new Error('Live check request allowance exceeded');
  const response = await originalFetch(url, init);
  const raw = await response.clone().text();
  const events: Record<string, unknown>[] = [];
  for (const line of raw.split('\n')) {
    const payload = line.startsWith('data:') ? line.slice(5).trim() : line.trim();
    if (!payload.startsWith('{')) continue;
    try { events.push(JSON.parse(payload)); } catch { /* incomplete SSE line */ }
  }
  const choices = events.flatMap(event => (event['choices'] ?? []) as { finish_reason?: string; delta?: { content?: string; tool_calls?: unknown[] }; message?: { content?: string; tool_calls?: unknown[] } }[]);
  const text = choices.map(choice => choice.delta?.content ?? choice.message?.content ?? '').join('');
  const item = { request: requests, http: response.status, finishReasons: choices.map(c => c.finish_reason).filter(Boolean), apiError: events.some(event => Boolean(event['error'])), nativeToolCalls: choices.some(c => Boolean(c.delta?.tool_calls?.length || c.message?.tool_calls?.length)), state: /<cowork_state>(\w+)<\/cowork_state>/.exec(text)?.[1], textLength: text.length };
  wire.push(item);
  console.log(JSON.stringify(item));
  return response;
};
try {
  const result = await runConversationTurn({ conversation, trigger, history: [trigger], deps: {
    agents: [agent], resolveLlm: () => resolved.client, toolContext: () => ctx, store, memory,
    requireCompletionState: true, autoLearn: false, browser: false, signal: AbortSignal.timeout(180_000),
    onProgress: progress => { if (progress.tool && progress.toolOk !== undefined) console.log(`tool ${progress.tool}: ${progress.toolOk}`); },
  }, append: message => store.appendMessage(conversation.id, message) });
  const resultPath = path.join(root, 'result.txt');
  const correct = existsSync(resultPath) && /\b42\b/.test(readFileSync(resultPath, 'utf8'));
  const todos = store.todos(conversation.id);
  const passed = !result.error && correct && todos.length > 0 && todos.every(todo => todo.status === 'done');
  console.log(JSON.stringify({ provider, model: resolved.model, passed, correct, requests, todos: todos.map(todo => todo.status), reply: result.messages.filter(m => m.role === 'agent').map(m => m.text), error: result.error, root, wire }, null, 2));
  if (!passed) process.exitCode = 1;
} finally {
  globalThis.fetch = originalFetch;
}
