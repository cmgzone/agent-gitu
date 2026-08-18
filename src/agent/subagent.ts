import { Executor } from '../executor/executor.js';
import { ProjectGuard } from '../guard/project-guard.js';
import { TaskLedger } from '../ledger/task-ledger.js';
import { extractJson, parseXmlFunctionCall, type LlmClient, type LlmMessage } from '../llm/llm.js';
import { LoopDetector } from '../loop/loop-detector.js';
import { PolicyEngine } from '../policy/policy.js';
import { KNOWN_TOOL_NAMES } from '../tools/tools.js';

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

export type SubAgentJobStatus = 'queued' | 'running' | 'completed' | 'failed';

export interface SubAgentJob {
  id: string;
  agent: string;
  task: string;
  status: SubAgentJobStatus;
  queuedAt: string;
  startedAt?: string;
  finishedAt?: string;
  turn?: number;
  summary?: string;
}

export interface SubAgentRunnerDeps {
  cwd: string;
  resolveLlm: (agentName: string) => LlmClient;
  agentRole: (name: string) => string | undefined;
  agentEffort?: (name: string) => 'low' | 'medium' | 'high' | 'max' | undefined;
  /** Limits simultaneous workers; excess work remains visible as queued. */
  maxConcurrent?: number;
  onEvent?: (text: string) => void;
}

const MAX_TURNS = 20;
const MAX_CONCURRENT_SUBAGENTS = 5;

interface InternalSubAgentJob extends SubAgentJob {
  completion: Promise<SubAgentResult>;
  resolve: (result: SubAgentResult) => void;
}

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
  private readonly jobs = new Map<string, InternalSubAgentJob>();
  private readonly queue: InternalSubAgentJob[] = [];
  private running = 0;
  private nextJob = 1;

  constructor(private readonly deps: SubAgentRunnerDeps) {}

  /** Queue work immediately and let callers poll status without blocking. */
  startMany(specs: SubAgentSpec[]): SubAgentJob[] {
    const started = specs.map((spec) => this.enqueue(spec));
    this.drain();
    return started.map((job) => this.snapshot(job));
  }

  async runMany(specs: SubAgentSpec[]): Promise<SubAgentResult[]> {
    const jobs = this.startMany(specs);
    return this.waitFor(jobs.map((job) => job.id));
  }

  async runOne(name: string, task: string): Promise<SubAgentResult> {
    const [job] = this.startMany([{ agent: name, task }]);
    return (await this.waitFor([job!.id]))[0]!;
  }

  status(ids?: string[]): SubAgentJob[] {
    const wanted = ids && ids.length > 0 ? new Set(ids) : undefined;
    return [...this.jobs.values()]
      .filter((job) => !wanted || wanted.has(job.id))
      .sort((a, b) => a.queuedAt.localeCompare(b.queuedAt))
      .map((job) => this.snapshot(job));
  }

  async waitFor(ids: string[]): Promise<SubAgentResult[]> {
    const jobs = ids.map((id) => this.jobs.get(id)).filter((job): job is InternalSubAgentJob => Boolean(job));
    return Promise.all(jobs.map((job) => job.completion));
  }

  private concurrency(): number {
    const requested = Number(this.deps.maxConcurrent ?? MAX_CONCURRENT_SUBAGENTS);
    if (!Number.isFinite(requested)) return MAX_CONCURRENT_SUBAGENTS;
    return Math.max(1, Math.min(MAX_CONCURRENT_SUBAGENTS, Math.floor(requested)));
  }

  private enqueue(spec: SubAgentSpec): InternalSubAgentJob {
    const queuedAt = new Date().toISOString();
    let resolve!: (result: SubAgentResult) => void;
    const completion = new Promise<SubAgentResult>((done) => {
      resolve = done;
    });
    const job: InternalSubAgentJob = {
      id: `sub-${Date.now().toString(36)}-${this.nextJob++}`,
      agent: spec.agent,
      task: spec.task,
      status: 'queued',
      queuedAt,
      completion,
      resolve,
    };
    this.jobs.set(job.id, job);
    this.queue.push(job);
    (this.deps.onEvent ?? (() => {}))(`subagent ${job.agent} [queued] ${job.id} — ${job.task.slice(0, 100)}`);
    return job;
  }

  private drain(): void {
    while (this.running < this.concurrency() && this.queue.length > 0) {
      const job = this.queue.shift()!;
      this.running += 1;
      job.status = 'running';
      job.startedAt = new Date().toISOString();
      (this.deps.onEvent ?? (() => {}))(`subagent ${job.agent} [running] ${job.id} — started`);
      void this.executeOne(job)
        .catch(
          (err): SubAgentResult => ({
            agent: job.agent,
            task: job.task,
            ok: false,
            summary: (err as Error).message,
          }),
        )
        .then((result) => {
          job.status = result.ok ? 'completed' : 'failed';
          job.finishedAt = new Date().toISOString();
          job.summary = result.summary;
          job.resolve(result);
          (this.deps.onEvent ?? (() => {}))(`subagent ${job.agent} [${job.status}] ${job.id} — ${result.summary.slice(0, 160)}`);
        })
        .finally(() => {
          this.running = Math.max(0, this.running - 1);
          this.drain();
        });
    }
  }

  private snapshot(job: InternalSubAgentJob): SubAgentJob {
    const { completion: _completion, resolve: _resolve, ...snapshot } = job;
    return { ...snapshot };
  }

  private async executeOne(job: InternalSubAgentJob): Promise<SubAgentResult> {
    const { agent: name, task } = job;
    const emit = this.deps.onEvent ?? (() => {});
    const role = this.deps.agentRole(name) ?? 'general-purpose engineer';
    const llm = this.deps.resolveLlm(name);

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
      job.turn = turn + 1;
      emit(`subagent ${name} [running] ${job.id} — turn ${job.turn}/${MAX_TURNS}`);
      const reply = await llm.complete(messages, { temperature: 0.2, effort: this.deps.agentEffort?.(name) });
      messages.push({ role: 'assistant', content: reply });
      let raw = extractJson(reply) as { action?: Record<string, unknown> } | Record<string, unknown> | null;
      if (!raw || (typeof raw === 'object' && !raw['action'] && !(raw as Record<string, unknown>)['type'])) {
        const xml = parseXmlFunctionCall(reply);
        if (xml) raw = xml;
      }
      const action = (raw && typeof raw === 'object' && raw['action'] && typeof raw['action'] === 'object'
        ? (raw['action'] as Record<string, unknown>)
        : (raw as Record<string, unknown> | null)) ?? {};
      let type = String(action['type'] ?? '');
      if (!type) {
        messages.push({ role: 'user', content: 'Reply with exactly one JSON action object.' });
        continue;
      }
      if (type !== 'tool_call' && type !== 'answer' && type !== 'complete' && (KNOWN_TOOL_NAMES.has(type) || type.startsWith('mcp:'))) {
        const params: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(action)) if (k !== 'type') params[k] = v;
        action['tool'] = type;
        action['params'] = params;
        action['reason'] = action['reason'] ?? '';
        action['expected'] = action['expected'] ?? '';
        action['type'] = 'tool_call';
        type = 'tool_call';
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
    return { agent: name, task, ok, summary };
  }
}
