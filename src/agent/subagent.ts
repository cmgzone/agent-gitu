import { rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Executor } from '../executor/executor.js';
import { gitExec, isGitRepo } from '../git/git.js';
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
  /** When the project is a git repo, run each specialist in its own worktree and merge back on success (default true). */
  isolate?: boolean;
  onEvent?: (text: string) => void;
}

const MAX_TURNS = 20;
const MAX_CONCURRENT_SUBAGENTS = 5;

interface InternalSubAgentJob extends SubAgentJob {
  completion: Promise<SubAgentResult>;
  resolve: (result: SubAgentResult) => void;
}

interface Worktree {
  branch: string;
  root: string;
}

// Serializes merges back into the main working tree so two specialists that
// finish at the same time never race for git's index lock.
let mergeChain: Promise<unknown> = Promise.resolve();

function buildSystemPrompt(name: string, role: string, root: string, isolated: boolean): string {
  return `You are "${name}", a specialist worker agent dispatched to handle one self-contained task.
Specialty: ${role}
You work inside the locked project at ${root}.
${isolated ? 'You are working in an ISOLATED git worktree copy of the project. Your changes are committed and merged back by the orchestrator when you finish; you can never conflict with other specialists while you work.' : ''}

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

    const repoRoot = ProjectGuard.detect(this.deps.cwd).lock.repoRoot;
    const wt = await this.createWorktree(job, repoRoot);
    const workRoot = wt ? wt.root : repoRoot;

    let summary = '';
    let ok = false;
    try {
      const guard = ProjectGuard.detect(workRoot);
      const ledger = TaskLedger.create({
        repoRoot: workRoot,
        goal: `[subagent:${name}] ${task.slice(0, 120)}`,
        project: guard.lock,
        mode: 'fast',
      });
      ledger.setStatus('executing');
      const policy = new PolicyEngine(false);
      const executor = new Executor(guard, ledger, policy, new LoopDetector(), (e) => emit(`subagent ${name}: ${e}`));

      const messages: LlmMessage[] = [
        { role: 'system', content: buildSystemPrompt(name, role, guard.lock.repoRoot, Boolean(wt)) },
        { role: 'user', content: `TASK: ${task}` },
      ];

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
    } finally {
      if (wt) {
        if (ok) {
          const reconciled = await this.reconcileWorktree(wt, repoRoot, name, task);
          summary = reconciled.summary;
          ok = reconciled.ok;
        } else {
          emit(`subagent ${name} — discarding worktree changes (agent did not finish cleanly)`);
        }
        await this.removeWorktree(wt, repoRoot);
      }
    }
    return { agent: name, task, ok, summary };
  }

  /**
   * Create an isolated git worktree for a specialist job. Falls back to the
   * main working tree (direct mode) when the project is not a git repo, has
   * no commits, or git worktrees are unavailable.
   */
  private async createWorktree(job: InternalSubAgentJob, repoRoot: string): Promise<Worktree | undefined> {
    if (this.deps.isolate === false) return undefined;
    try {
      if (!isGitRepo(repoRoot)) return undefined;
      const branch = `hermes-sub-${job.id.replace(/[^\w-]/g, '')}`;
      const root = path.join(os.tmpdir(), 'hermes-subagent-wt', `${job.id}-${Date.now().toString(36)}`);
      await gitExec(repoRoot, ['worktree', 'add', '-b', branch, root, 'HEAD']);
      (this.deps.onEvent ?? (() => {}))(`subagent ${job.agent} isolated in git worktree ${root} (branch ${branch})`);
      return { branch, root };
    } catch (err) {
      (this.deps.onEvent ?? (() => {}))(
        `subagent ${job.agent} worktree isolation unavailable (${(err as Error).message}) — running in the main working tree`,
      );
      return undefined;
    }
  }

  /**
   * Commit the specialist's changes in its worktree and merge them back into
   * the main working tree. On a merge conflict the merge is aborted and the
   * result is marked failed so the orchestrator cannot rely on unmerged work.
   */
  private async reconcileWorktree(wt: Worktree, repoRoot: string, name: string, task: string): Promise<{ ok: boolean; summary: string }> {
    const emit = this.deps.onEvent ?? (() => {});
    try {
      const status = await gitExec(wt.root, ['status', '--porcelain']);
      if (!status.trim()) {
        emit(`subagent ${name} produced no changes — nothing to merge`);
        return { ok: true, summary: '(isolated worktree: no changes were produced)' };
      }
      const commitMsg = `subagent ${name}: ${task.slice(0, 80)}`.replace(/[\r\n]+/g, ' ');
      // Never merge the specialist's private .hermes state (ledgers, locks)
      // back into the main working tree — only its product changes.
      await gitExec(wt.root, ['add', '-A', '--', ':(exclude).hermes']);
      await gitExec(wt.root, ['commit', '-m', commitMsg]);
      emit(`subagent ${name} — merging worktree changes back`);
      await (mergeChain = mergeChain.then(() => gitExec(repoRoot, ['merge', wt.branch, '--no-ff', '-m', `merge ${commitMsg}`])));
      emit(`subagent ${name} — merged cleanly into the main working tree`);
      return { ok: true, summary: '(isolated worktree: changes committed and merged back cleanly)' };
    } catch (err) {
      try {
        await gitExec(repoRoot, ['merge', '--abort']);
      } catch {
        /* not mid-merge */
      }
      const conflicts = await gitExec(repoRoot, ['status', '--porcelain']).catch(() => '');
      emit(`subagent ${name} — merge conflict, changes NOT merged`);
      return {
        ok: false,
        summary: `Merge conflict when reconciling worktree changes — they were NOT merged into the main tree. Conflicting paths: ${conflicts.trim() || 'unknown'}`,
      };
    }
  }

  private async removeWorktree(wt: Worktree, repoRoot: string): Promise<void> {
    try {
      await gitExec(repoRoot, ['worktree', 'remove', '--force', wt.root]);
    } catch {
      /* best effort */
    }
    try {
      await gitExec(repoRoot, ['branch', '-D', wt.branch]);
    } catch {
      /* best effort */
    }
    try {
      rmSync(wt.root, { recursive: true, force: true });
    } catch {
      /* best effort */
    }
  }
}
