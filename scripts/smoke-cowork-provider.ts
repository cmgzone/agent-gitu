/** Opt-in live provider check; uses saved credentials, isolated files and no real scheduler. */
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { CoworkStore } from '../src/cowork/store.js';
import { CoworkMemory } from '../src/cowork/memory.js';
import { MemoryStore } from '../src/memory/memory-store.js';
import { ProjectGuard } from '../src/guard/project-guard.js';
import { SkillStore } from '../src/skills/skills.js';
import { resolveLlm } from '../src/llm/providers.js';
import { runConversationTurn } from '../src/cowork/runner.js';
import type { LlmClient } from '../src/llm/llm.js';

const provider = process.argv[2] ?? 'deepseek';
const root = mkdtempSync(path.join(tmpdir(), `gitu-provider-smoke-`));
writeFileSync(path.join(root, 'package.json'), '{"name":"provider-smoke"}');
const resolved = resolveLlm({ provider, workingDirectory: root });
const store = new CoworkStore(path.join(root, 'cowork.json'));
const agent = store.saveAgent({ name: 'SmokeWriter', systemPrompt: 'Complete the requested small task with tools and report only verified results. Keep the answer concise.', provider, model: resolved.model, effort: 'low', allowShell: false, allowWrites: true, allowConfig: false, useHostComputer: true });
const conversation = store.saveConversation({ kind: 'dm', memberIds: [agent.id] });
const memory = new CoworkMemory(MemoryStore.forProject(root), path.basename(root));
const context = { cwd: root, guard: ProjectGuard.detect(root), skills: SkillStore.forProject(root) };
const trigger = store.appendMessage(conversation.id, { role: 'user', via: 'web', text: 'Create smoke-brief.pdf with title "Provider check" and exactly two sections: "Result" with body "This is a local provider smoke check.", and "Next" with body "Review the generated file." Save a daily recurring schedule to "Prepare a local brief" using schedule_manage. Track this work with one todo and mark it done only when the PDF and schedule are saved. Do not browse, send messages, install anything, or use a shell. The scheduler is not running in this temporary test workspace.' });
let requests = 0;
let markupLeaked = false;
const seenTools: string[] = [];
const usage: unknown[] = [];
const checkBudget = () => { if (++requests > 10) throw new Error('Smoke check stopped after ten model requests.'); };
const llm: LlmClient = {
  name: resolved.client.name,
  complete: async (messages, options) => { checkBudget(); return resolved.client.complete(messages, { ...options, onUsage: value => usage.push(value) }); },
  completeStream: async (messages, options, delta) => {
    checkBudget();
    const reply = resolved.client.completeStream
      ? await resolved.client.completeStream(messages, { ...options, onUsage: value => usage.push(value) }, delta)
      : await resolved.client.complete(messages, options);
    writeFileSync(path.join(root, `response-${requests}.txt`), reply);
    return reply;
  },
};
const result = await runConversationTurn({ conversation, trigger, history: [trigger], deps: {
  agents: [agent], resolveLlm: () => llm, toolContext: () => context, memory, store,
  signal: AbortSignal.timeout(180_000), browser: false,
  onProgress: progress => {
    if (/<\s*[|｜]|<\/?(?:tool|invoke|parameter)/i.test(progress.text)) markupLeaked = true;
    if (progress.tool && progress.toolOk !== undefined) { seenTools.push(`${progress.tool}:${progress.toolOk}`); console.log(`tool ${progress.tool}: ${progress.toolOk ? 'ok' : 'failed'}`); }
  },
}, append: message => store.appendMessage(conversation.id, message) });
const artifacts = store.artifacts(conversation.id);
const schedule = store.getConversation(conversation.id)?.schedule;
const todos = store.todos(conversation.id);
const passed = !result.error && !markupLeaked && artifacts.some(a => a.name === 'smoke-brief.pdf') && schedule?.every === '1d' && todos.length === 1 && todos[0]?.status === 'done';
console.log(JSON.stringify({ provider, model: resolved.model, passed, requests, markupLeaked, tools: seenTools, artifacts: artifacts.map(a => a.name), schedule, todos: todos.map(t => ({ text: t.text, status: t.status })), result: result.messages.map(m => m.text), error: result.error, root, usage }, null, 2));
if (!passed) process.exitCode = 1;
