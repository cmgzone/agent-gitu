import { Executor } from '../executor/executor.js';
import { ProjectGuard } from '../guard/project-guard.js';
import { TaskLedger } from '../ledger/task-ledger.js';
import { extractJson, type LlmClient, type LlmMessage } from '../llm/llm.js';
import { LoopDetector } from '../loop/loop-detector.js';
import { PolicyEngine } from '../policy/policy.js';

export interface SubAgentSpec {
  agent: string;
  task: string;
}

export interface SubAgentResult {
  agent: string;
  task: string;
  ok: boolean;
  summary: string;
}

export interface SubAgentRunnerDeps {
  cwd: string;
  resolveLlm: (agentName: string) => LlmClient;
  agentRole: (name: string) => string | undefined;
  onEvent?: (text: string) => void;
}

const MAX_TURNS = 20;

function buildSystemPrompt(name: string, role: string, root: string): string {
  return `You are "${name}", a specialist worker agent dispatched to handle one self-contained task.
Specialty: ${role}
You work inside the locked project at ${root}.

RULES:
1. Read files before editing them. Ground every edit in actual code.
2. Make small, focused changes. Verify with commands (test/build/typecheck/lint) when relevant.
3. Never claim success without evidence from a command or a file you actually wrote.
4. Stay inside the task you were given. Do not expand scope.

PROTOCOL — respond each turn with EXACTLY ONE JSON object:
{"action":{"type":"tool_call","tool":"<tool>","params":{...},"reason":"why","expected":"what should happen"}}
Tools:
- read_file    {"path":"src/x.ts"}
- write_file   {"path":"src/x.ts","content":"full content"}
- apply_edit   {"path":"src/x.ts","oldString":"exact text","newString":"replacement"}
- list_files   {"path":"src"}
- search_files {"pattern":"regex","path":"src"}
- run_command  {"command":"npm test"}

When the task is finished, respond with:
{"action":{"type":"answer","summary":"what you did, files touched, verification results, open issues"}}`;
}

export class SubAgentRunner {
  constructor(private readonly deps: SubAgentRunnerDeps) {}

  async runMany(specs: SubAgentSpec[]): Promise<SubAgentResult[]> {
    return Promise.all(
      specs.map((s) =>
        this.runOne(s.agent, s.task).catch((err): SubAgentResult => ({ agent: s.agent, task: s.task, ok: false, summary: (err as Error).message })),
      ),
    );
  }

  async runOne(name: string, task: string): Promise<SubAgentResult> {
    const emit = this.deps.onEvent ?? (() => {});
    const role = this.deps.agentRole(name) ?? 'general-purpose engineer';
    const llm = this.deps.resolveLlm(name);
    emit(`subagent ${name}: started — ${task.slice(0, 100)}`);

    const guard = ProjectGuard.detect(this.deps.cwd);
    const ledger = TaskLedger.create({
      repoRoot: guard.lock.repoRoot,
      goal: `[subagent:${name}] ${task.slice(0, 120)}`,
      project: guard.lock,
      mode: 'fast',
    });
    ledger.setStatus('executing');
    const policy = new PolicyEngine(false);
    const executor = new Executor(guard, ledger, policy, new LoopDetector(), (e) => emit(`subagent ${name}: ${e}`));

    const messages: LlmMessage[] = [
      { role: 'system', content: buildSystemPrompt(name, role, guard.lock.repoRoot) },
      { role: 'user', content: `TASK: ${task}` },
    ];

    let summary = '';
    let ok = false;
    for (let turn = 0; turn < MAX_TURNS; turn++) {
      const reply = await llm.complete(messages, { temperature: 0.2 });
      messages.push({ role: 'assistant', content: reply });
      const raw = extractJson(reply) as { action?: Record<string, unknown> } | Record<string, unknown> | null;
      const action = (raw && typeof raw === 'object' && raw['action'] && typeof raw['action'] === 'object'
        ? (raw['action'] as Record<string, unknown>)
        : (raw as Record<string, unknown> | null)) ?? {};
      const type = String(action['type'] ?? '');
      if (!type) {
        messages.push({ role: 'user', content: 'Reply with exactly one JSON action object.' });
        continue;
      }
      if (type === 'answer' || type === 'complete') {
        summary = String(action['summary'] ?? '').slice(0, 4000);
        ok = true;
        break;
      }
      if (type === 'tool_call' && typeof action['tool'] === 'string') {
        const outcome = await executor.execute({
          tool: String(action['tool']),
          params: (action['params'] ?? {}) as Record<string, unknown>,
          reason: String(action['reason'] ?? ''),
          expected: String(action['expected'] ?? ''),
        });
        messages.push({
          role: 'user',
          content: `RESULT [${outcome.result.ok ? 'success' : 'error'}] ${outcome.record.paramsSummary}\n${outcome.result.output.slice(0, 3000)}`,
        });
        continue;
      }
      messages.push({ role: 'user', content: 'Unknown action. Use tool_call or answer.' });
    }

    if (!ok) summary = summary || `subagent ${name} stopped after ${MAX_TURNS} turns without a final answer`;
    ledger.setStatus(ok ? 'completed' : 'blocked');
    emit(`subagent ${name}: ${ok ? 'finished' : 'stopped'} — ${summary.slice(0, 120)}`);
    return { agent: name, task, ok, summary };
  }
}
