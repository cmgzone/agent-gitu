import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { MemoryStore } from '../src/memory/memory-store.js';
import { Hermes } from '../src/agent/hermes.js';
import { ScriptedMockLlm, type LlmMessage } from '../src/llm/llm.js';

const dir = mkdtempSync(path.join(tmpdir(), 'hermes-fix3-debug-'));
writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: 'fix3' }));
const memory = MemoryStore.forProject(dir);
memory.recordVerified({ type: 'decision', claim: 'Checkout state must use Zustand, never Redux', scope: path.basename(dir), sourceType: 'user_statement', importance: 0.9 });
const llm = new ScriptedMockLlm([
  (n) => { console.log(`LLM call ${n}: -> set_plan`); return JSON.stringify({ action: { type: 'set_plan', steps: [{ description: 'work', verification: 'node --version' }] } }); },
  (n, messages) => {
    console.log(`LLM call ${n}: -> run_command (messages=${messages.length}, lastRoles=${messages.slice(-4).map((m) => m.role).join(',')})`);
    return JSON.stringify({ action: { type: 'tool_call', tool: 'run_command', params: { command: 'node --version' }, reason: 'verify', expected: 'exit 0' } });
  },
  (n) => { console.log(`LLM call ${n}: -> complete`); return JSON.stringify({ action: { type: 'complete', summary: 'done', risks: [], followUps: [] } }); },
]);

const events: string[] = [];
const hermes = new Hermes({ cwd: dir, llm, mode: 'fast', memory, onEvent: (e) => events.push(e) });
const { report } = await hermes.run('work on checkout with zustand');
console.log('STATUS:', report.status);
console.log('SUMMARY:', report.summary);
console.log('BLOCKERS:', report.blockers);
const interesting = events.filter((e) => !e.startsWith('think') && !e.startsWith('context compacted'));
console.log('NON-THINK EVENTS:', interesting.length);
for (const e of interesting) console.log(' ', e.slice(0, 300));

