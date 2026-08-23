import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { EvidenceEngine, classifyEvidenceKind } from '../evidence/evidence.js';
import { Executor } from '../executor/executor.js';
import { getWorkspaceFingerprint, gitExec, isGitRepo } from '../git/git.js';
import { ProjectGuard } from '../guard/project-guard.js';
import { TaskLedger } from '../ledger/task-ledger.js';
import { extractJson, parseXmlFunctionCall, type LlmClient, type LlmMessage } from '../llm/llm.js';
import { resilientLlm } from '../llm/resilient.js';
import { LoopDetector } from '../loop/loop-detector.js';
import { MalformedCallTracker, malformedIntervention, malformedKindFor } from '../loop/malformed-tracker.js';
import { PolicyEngine } from '../policy/policy.js';
import { KNOWN_TOOL_NAMES } from '../tools/tools.js';
import { buildSpecialistEvidenceReport, type SpecialistEvidenceReport } from './specialist-evidence.js';
import type { AcceptanceCriterion, CriterionSpec } from '../types.js';

export interface SubAgentSpec {
  agent: string;
  task: string;
  criteria?: (string | CriterionSpec)[];
  /** Continue a previously PAUSED specialist in its preserved worktree,
   *  picking up where it left off instead of starting over. */
  resume?: { jobId: string; note?: string };
}

export type SpecialistStatus = 'SUCCESS' | 'PARTIAL_SUCCESS' | 'BLOCKED' | 'FAILED' | 'CANCELLED';

export interface SubAgentResult {
  agent: string;
  task: string;
  ok: boolean;
  status: SpecialistStatus;
  summary: string;
  turnsUsed: number;
  turnsBudgeted: number;
  filesInspected: string[];
  filesChanged: string[];
  criteriaStatus?: { id: string; text: string; satisfied: boolean }[];
  evidenceIds: string[];
  /** Structured evidence report (P1.1) for the orchestrator to revalidate. */
  evidenceReport?: SpecialistEvidenceReport;
  blockers?: string[];
  recommendation?: string;
  /** Set when this paused attempt's worktree is preserved and resumable via
   *  delegate with resume:{jobId}. */
  resumableJobId?: string;
}

export type SubAgentJobStatus = 'queued' | 'running' | 'completed' | 'failed';

export interface SubAgentJob {
  id: string;
  agent: string;
  task: string;
  criteria?: (string | CriterionSpec)[];
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
  /** Base turn budget before dynamic extension. Default 20. */
  baseTurns?: number;
  /** Maximum turns ceiling for dynamic execution. Default 100. */
  hardCeilingTurns?: number;
  /** When the project is a git repo, run each specialist in its own worktree and merge back on success (default true). */
  isolate?: boolean;
  onEvent?: (text: string) => void;
}

const DEFAULT_BASE_TURNS = 30;
const DEFAULT_HARD_CEILING_TURNS = 150;
const MAX_CONCURRENT_SUBAGENTS = 5;

/** Finished jobs stay queryable for this long, then their memory is freed. */
const JOB_RETENTION_MS = 10 * 60_000;
/** Paused (failed/partial) specialists whose worktrees stay recoverable. */
const RETAINED_WORKTREES_MAX = 8;

interface InternalSubAgentJob extends SubAgentJob {
  completion: Promise<SubAgentResult>;
  resolve: (result: SubAgentResult) => void;
  spec: SubAgentSpec;
}

/** A paused specialist's preserved worktree, resumable by jobId. */
interface RetainedWorktree {
  root: string;
  branch: string;
  agent: string;
  task: string;
  summary: string;
  filesChanged: string[];
  createdAt: number;
}

interface Worktree {
  branch: string;
  root: string;
}

// Serializes merges back into the main working tree so two specialists that
// finish at the same time never race for git's index lock.
let mergeChain: Promise<unknown> = Promise.resolve();

function emitSafe(onEvent: ((text: string) => void) | undefined, text: string): void {
  try {
    (onEvent ?? (() => {}))(text);
  } catch {
    /* event listeners must never break the runner */
  }
}

function buildSystemPrompt(name: string, role: string, root: string, isolated: boolean, criteria?: AcceptanceCriterion[]): string {
  const criteriaSection = criteria && criteria.length > 0
    ? `\nACCEPTANCE CRITERIA (you MUST satisfy each criterion with passing evidence before answering):\n` +
      criteria.map((c) => `- [${c.id}] ${c.text}${c.verification ? ` (required verification: ${c.verification})` : ''}`).join('\n')
    : '';

  return `You are "${name}", a specialist worker agent dispatched to handle one self-contained task.
Specialty: ${role}
You work inside the locked project at ${root}.
${isolated ? 'You are working in an ISOLATED git worktree copy of the project. Your changes are committed and merged back by the orchestrator when you finish; you can never conflict with other specialists while you work.' : ''}${criteriaSection}

RULES:
1. Read files before editing them. Ground every edit in actual code.
2. Make small, focused changes. Verify with commands (test/build/typecheck/lint) when relevant.
3. When criteria are specified, run the exact verification command and claim it with claim_criterion. Your work WILL BE REJECTED and discarded if the evidence gate is closed.
4. Never claim success without evidence from a command or a file you actually wrote.
5. Stay inside the task you were given. Do not expand scope.

PROTOCOL — respond each turn with EXACTLY ONE JSON object:
{"action":{"type":"tool_call","tool":"<tool>","params":{...},"reason":"why","expected":"what should happen"}}
Tools:
- read_file       {"path":"src/x.ts"}
- write_file      {"path":"src/x.ts","content":"full content"}
- apply_edit      {"path":"src/x.ts","oldString":"exact text","newString":"replacement"}
- list_files      {"path":"src"}
- search_files    {"pattern":"regex","path":"src"}
- run_command     {"command":"npm test"}
- claim_criterion {"criterionId":"ac-1","evidenceId":"ev-..."}

When the task is finished and all criteria are verified, respond with:
{"action":{"type":"answer","summary":"what you did, files touched, verification results, open issues"}}`;
}

export class SubAgentRunner {
  private readonly jobs = new Map<string, InternalSubAgentJob>();
  private readonly queue: InternalSubAgentJob[] = [];
  private running = 0;
  private nextJob = 1;
  /** Paused specialists whose worktrees survive for later resume. */
  private readonly retained = new Map<string, RetainedWorktree>();

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

  async runOne(name: string, task: string, criteria?: (string | CriterionSpec)[]): Promise<SubAgentResult> {
    const [job] = this.startMany([{ agent: name, task, criteria }]);
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
      criteria: spec.criteria,
      status: 'queued',
      queuedAt,
      completion,
      resolve,
      spec,
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
            status: 'FAILED',
            summary: `Specialist crashed before returning a structured result: ${(err as Error).message}`,
            turnsUsed: job.turn ?? 0,
            turnsBudgeted: this.deps.baseTurns ?? DEFAULT_BASE_TURNS,
            filesInspected: [],
            filesChanged: [],
            evidenceIds: [],
            blockers: [(err as Error).message],
            recommendation: 'Retry the specialist task with clearer instructions; the previous run crashed.',
          }),
        )
        .then((result) => {
          job.status = result.ok ? 'completed' : 'failed';
          job.finishedAt = new Date().toISOString();
          job.summary = result.summary;
          job.resolve(result);
          // Prune finished jobs after a grace window: each entry retains its
          // completion promise, closures and full task text — without this the
          // map grows unboundedly in the long-lived desktop/server process.
          const prune = setTimeout(() => this.jobs.delete(job.id), JOB_RETENTION_MS);
          prune.unref?.();
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
    const { agent: name, task, criteria: rawCriteria } = job;
    const emit = this.deps.onEvent ?? (() => {});
    const role = this.deps.agentRole(name) ?? 'general-purpose engineer';
    const llm = resilientLlm(this.deps.resolveLlm(name), {
      label: `specialist ${name}`,
      onRetry: ({ attempt, maxRetries, delayMs, error }) =>
        emit(`subagent ${name} — LLM ${error.message.slice(0, 100)} — retry ${attempt}/${maxRetries} in ${(delayMs / 1000).toFixed(1)}s`),
    });

    const repoRoot = ProjectGuard.detect(this.deps.cwd).lock.repoRoot;
    // Resume mode: adopt the paused attempt's preserved worktree instead of
    // starting from a fresh copy — nothing gets redone.
    const resumeKey = job.spec.resume?.jobId;
    let resumedFrom: RetainedWorktree | undefined;
    if (resumeKey) {
      const r = this.retained.get(resumeKey) ?? this.loadPausedIndex(repoRoot)[resumeKey];
      if (r && existsSync(r.root)) {
        resumedFrom = r;
        this.retained.delete(resumeKey);
        this.removeFromPausedIndex(repoRoot, resumeKey);
        emit(`subagent ${name} resuming ${resumeKey} — reusing preserved worktree on ${r.branch}`);
      } else {
        this.retained.delete(resumeKey);
        this.removeFromPausedIndex(repoRoot, resumeKey);
        emit(`subagent ${name} resume ${resumeKey} unavailable (worktree gone) — starting fresh`);
      }
    }
    const wt = resumedFrom ? { root: resumedFrom.root, branch: resumedFrom.branch } : await this.createWorktree(job, repoRoot);
    const workRoot = wt ? wt.root : repoRoot;

    let summary = '';
    let ok = false;
    let status: SpecialistStatus = 'FAILED';
    let turnBudget = this.deps.baseTurns ?? DEFAULT_BASE_TURNS;
    const hardCeiling = this.deps.hardCeilingTurns ?? DEFAULT_HARD_CEILING_TURNS;
    const filesInspected = new Set<string>();
    const filesChanged = new Set<string>();
    const evidenceIds: string[] = [];
    const blockers: string[] = [];
    let consecutiveNoProgress = 0;
    let consecutiveErrors = 0;
    const malformed = new MalformedCallTracker({ escalateAt: 3 });
    let turnsUsed = 0;
    let recommendation = '';
    let ledger: TaskLedger | undefined;

    try {
      const guard = ProjectGuard.detect(workRoot);
      ledger = TaskLedger.create({
        repoRoot: workRoot,
        goal: `[subagent:${name}] ${task.slice(0, 120)}`,
        project: guard.lock,
        mode: 'fast',
      });
      const evidenceEngine = new EvidenceEngine();
      if (rawCriteria && rawCriteria.length > 0) {
        const specs = EvidenceEngine.normalizeCriteria(rawCriteria);
        ledger.setCriteriaFromSpecs(specs);
      }
      ledger.setStatus('executing');
      const policy = new PolicyEngine(false);
      const executor = new Executor(guard, ledger, policy, new LoopDetector(), (e) => emit(`subagent ${name}: ${e}`));

      const criteriaList = ledger.data.acceptanceCriteria;
      const criteriaPrompt = criteriaList.length > 0
        ? `\nACCEPTANCE CRITERIA (you MUST satisfy every one of these before answering):\n` +
          criteriaList
            .map((c) =>
              `  - [${c.id}] ${c.text}` +
              (c.verification ? `\n    Required verification: ${c.verification}` : '') +
              (c.evidenceType && c.evidenceType !== 'any' ? `\n    Evidence type: ${c.evidenceType}` : '') +
              `\n    Do not claim this criterion using unrelated commands.`
            )
            .join('\n')
        : '';

      const messages: LlmMessage[] = [
        { role: 'system', content: buildSystemPrompt(name, role, guard.lock.repoRoot, Boolean(wt), criteriaList) },
        { role: 'user', content: `TASK: ${task}${criteriaPrompt}` },
      ];
      if (resumedFrom) {
        // Wake-where-it-left-off briefing so the specialist does not redo or
        // clobber the earlier attempt's committed work.
        const priorFiles = resumedFrom.filesChanged.length
          ? resumedFrom.filesChanged.map((f) => `  - ${f}`).join('\n')
          : '  (none recorded)';
        messages.push({
          role: 'user',
          content:
            `RESUME MODE: a previous attempt of this exact task stopped early. Its work is ALREADY COMMITTED on the current branch.\n` +
            `Previously changed files:\n${priorFiles}\n` +
            `Previous attempt's last status:\n${resumedFrom.summary.slice(0, 1200)}\n` +
            (job.spec.resume?.note ? `Orchestrator note: ${job.spec.resume.note}\n` : '') +
            `First inspect current state (git log --oneline, read the changed files), then CONTINUE from where it stopped toward completing the task and its criteria. Do not redo finished work.`,
        });
      }
      // Mid-run checkpoints: commit accumulated product changes on the branch
      // after every turn that touched new files, so even a hard stop leaves a
      // recoverable trail instead of losing everything.
      let checkpointedFiles = resumedFrom ? resumedFrom.filesChanged.length : 0;
      let lastCheckpointAt = Date.now();
      const checkpoint = async (label: string): Promise<void> => {
        if (!wt || !isGitRepo(wt.root)) return;
        try {
          const dirty = await gitExec(wt.root, ['status', '--porcelain']);
          if (!dirty.trim()) return;
          // Same .hermes exclusion as the final merge staging — private agent
          // state must never leak into committed product branches.
          await gitExec(wt.root, ['add', '-A', '--', ':(exclude).hermes']);
          const staged = await gitExec(wt.root, ['diff', '--cached', '--name-only']).catch(() => '');
          if (!staged.trim()) return;
          const ident = await this.identityArgs(repoRoot);
          await gitExec(wt.root, [...ident, 'commit', '-m', `subagent ${name}: checkpoint (${label})`.slice(0, 180), '--no-verify']).catch(() => {});
          emit(`subagent ${name} checkpoint (${label}) committed`);
          lastCheckpointAt = Date.now();
        } catch {
          /* checkpointing must never break the run */
        }
      };

      for (let turn = 0; turn < turnBudget; turn++) {
        turnsUsed = turn + 1;
        job.turn = turnsUsed;
        emit(`subagent ${name} [running] ${job.id} — turn ${turnsUsed}/${turnBudget}`);
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
          consecutiveNoProgress += 1;
          if (consecutiveNoProgress >= 6) {
            blockers.push(`Stalled after ${consecutiveNoProgress} consecutive turns without a valid action`);
            status = filesInspected.size > 0 || filesChanged.size > 0 ? 'PARTIAL_SUCCESS' : 'BLOCKED';
            recommendation = 'Return structured JSON actions (tool_call / claim_criterion / answer) each turn.';
            emit(`subagent ${name} — loop/stagnation detected, stopping early`);
            break;
          }
          messages.push({ role: 'user', content: 'Reply with exactly one JSON action object.' });
          continue;
        }
        if (type !== 'tool_call' && type !== 'answer' && type !== 'complete' && type !== 'claim_criterion' && (KNOWN_TOOL_NAMES.has(type) || type.startsWith('mcp:'))) {
          const params: Record<string, unknown> = {};
          for (const [k, v] of Object.entries(action)) if (k !== 'type') params[k] = v;
          action['tool'] = type;
          action['params'] = params;
          action['reason'] = action['reason'] ?? '';
          action['expected'] = action['expected'] ?? '';
          action['type'] = 'tool_call';
          type = 'tool_call';
        }
        if (type === 'claim_criterion' || (typeof action['criterionId'] === 'string' && typeof action['evidenceId'] === 'string')) {
          const critId = String(action['criterionId']);
          const evId = String(action['evidenceId']);
          const currentFp = await getWorkspaceFingerprint(workRoot);
          const link = evidenceEngine.link(ledger.data, critId, evId, currentFp);
          ledger.save();
          emit(`subagent ${name} claim ${critId} <- ${evId}: ${link.ok ? 'accepted' : link.reason}`);
          if (link.ok) {
            consecutiveNoProgress = 0;
            consecutiveErrors = 0;
          } else {
            consecutiveErrors += 1;
          }
          messages.push({
            role: 'user',
            content: link.ok ? `Accepted: ${link.reason}` : `Rejected: ${link.reason}`,
          });
          continue;
        }
        if (type === 'answer' || type === 'complete') {
          // If the specialist had acceptance criteria, enforce the evidence gate!
          if (ledger.data.acceptanceCriteria.length > 0) {
            const currentFp = await getWorkspaceFingerprint(workRoot);
            const gate = evidenceEngine.gate(ledger.data, currentFp);
            if (!gate.open) {
              emit(`subagent ${name} — completion rejected by evidence gate (${gate.satisfiedCount}/${gate.totalCount} criteria satisfied)`);
              messages.push({
                role: 'user',
                content:
                  `COMPLETION REJECTED by evidence gate (${gate.satisfiedCount}/${gate.totalCount} criteria backed).\n` +
                  `Still missing:\n${gate.missing.map((m) => `  - ${m}`).join('\n')}\n` +
                  `You must run the required verification commands and link them with claim_criterion before answering.`,
              });
              consecutiveNoProgress += 1;
              continue;
            }
          }

          summary = String(action['summary'] ?? '').slice(0, 4000);
          status = 'SUCCESS';
          ok = true;
          break;
        }
        if (type === 'tool_call' && typeof action['tool'] === 'string') {
          const toolName = String(action['tool']);
          const outcome = await executor.execute({
            tool: toolName,
            params: (action['params'] ?? {}) as Record<string, unknown>,
            reason: String(action['reason'] ?? ''),
            expected: String(action['expected'] ?? ''),
          });

          if (outcome.result.ok) {
            consecutiveNoProgress = 0;
            consecutiveErrors = 0;
            malformed.reset();
            const params = (action['params'] ?? {}) as Record<string, unknown>;
            if (toolName === 'read_file' && typeof params['path'] === 'string') {
              filesInspected.add(String(params['path']));
            }
            if (outcome.result.filesTouched) {
              for (const f of outcome.result.filesTouched) filesChanged.add(f);
            }
            // New product files on disk → commit a checkpoint NOW so a later
            // timeout/stall can never lose this work.
            if (filesChanged.size > checkpointedFiles) {
              checkpointedFiles = filesChanged.size;
              await checkpoint('progress');
            }
          } else {
            consecutiveErrors += 1;
            consecutiveNoProgress += 1;
            const malformedKind = malformedKindFor(outcome.result.errorSignature);
            const malformedVerdict = malformedKind ? malformed.note(malformedKind) : (malformed.reset(), undefined);
            if (malformedVerdict?.escalate && !malformedVerdict.halt) {
              emit(`subagent ${name} — malformed call streak ${malformedVerdict.streak} — strategy change injected`);
            }
            if (malformedVerdict?.halt) {
              blockers.push(`Repeated malformed tool calls (${malformedVerdict.streak}×): ${toolName}`);
              status = filesInspected.size > 0 || filesChanged.size > 0 ? 'PARTIAL_SUCCESS' : 'BLOCKED';
              emit(`subagent ${name} — malformed-call spiral detected, stopping early`);
              break;
            }
          }

          let evidenceNote = '';
          if (toolName === 'run_command') {
            const cmd = String((action['params'] as Record<string, unknown>)?.['command'] ?? '');
            const kind = classifyEvidenceKind(cmd);
            const currentFp = await getWorkspaceFingerprint(workRoot);
            const ev = evidenceEngine.record(ledger.data, {
              kind,
              label: String(action['expected'] || cmd),
              command: cmd,
              exitCode: outcome.result.exitCode,
              passed: outcome.result.ok,
              output: outcome.result.output,
              workspaceFingerprint: currentFp,
            });
            ledger.save();
            evidenceIds.push(ev.id);
            evidenceNote = `\nEVIDENCE RECORDED: ${ev.id} [${ev.passed ? 'PASS' : 'FAIL'}] (${kind}). If this satisfies a criterion, use {"action":{"type":"claim_criterion","criterionId":"<id>","evidenceId":"${ev.id}"}}.`;
            emit(`subagent ${name} evidence ${ev.id} ${ev.passed ? 'PASS' : 'FAIL'} (${kind})`);
          }

          // Dynamic budget extension: if making progress and approaching the current budget
          if (turn >= turnBudget - 2 && consecutiveNoProgress <= 1 && turnBudget + 10 <= hardCeiling) {
            turnBudget += 10;
            emit(`subagent ${name} progress detected — dynamically extending budget to turn ${turnBudget}/${hardCeiling}`);
          }

          // Anti-loop / stagnation early exit:
          if (consecutiveErrors >= 5 || consecutiveNoProgress >= 6) {
            blockers.push(
              malformed.currentStreak >= 3
                ? `Repeated malformed tool calls (${malformed.currentStreak}×) stalled the specialist`
                : `Stalled after ${consecutiveErrors} consecutive errors or zero progress`,
            );
            status = filesInspected.size > 0 || filesChanged.size > 0 ? 'PARTIAL_SUCCESS' : 'BLOCKED';
            recommendation = `Review tool arguments and provide more specific guidance or schemas.`;
            emit(`subagent ${name} — loop/stagnation detected, stopping early`);
            break;
          }

          messages.push({
            role: 'user',
            content:
              `RESULT [${outcome.result.ok ? 'success' : 'error'}] ${outcome.record.paramsSummary}\n${outcome.result.output.slice(0, 3000)}${evidenceNote}` +
              (malformed.currentStreak >= 3 ? `\n${malformedIntervention(malformed.currentStreak, toolName)}` : ''),
          });
          continue;
        }
        consecutiveNoProgress += 1;
        if (consecutiveNoProgress >= 6) {
          blockers.push(`Stalled after ${consecutiveNoProgress} consecutive turns without a valid action`);
          status = filesInspected.size > 0 || filesChanged.size > 0 ? 'PARTIAL_SUCCESS' : 'BLOCKED';
          recommendation = 'Return structured JSON actions (tool_call / claim_criterion / answer) each turn.';
          emit(`subagent ${name} — loop/stagnation detected, stopping early`);
          break;
        }
        messages.push({ role: 'user', content: 'Unknown action. Use tool_call, claim_criterion, or answer.' });
      }

      if (!ok) {
        if (filesInspected.size > 0 || filesChanged.size > 0) {
          status = 'PARTIAL_SUCCESS';
        } else if (status !== 'BLOCKED') {
          status = blockers.length > 0 ? 'BLOCKED' : 'FAILED';
        }

        const completedList: string[] = [
          filesInspected.size > 0 ? `✓ Inspected ${filesInspected.size} file(s): ${[...filesInspected].slice(0, 5).join(', ')}` : '',
          filesChanged.size > 0 ? `✓ Modified ${filesChanged.size} file(s): ${[...filesChanged].slice(0, 5).join(', ')}` : '',
          evidenceIds.length > 0 ? `✓ Recorded evidence: ${evidenceIds.join(', ')}` : '',
        ].filter(Boolean);

        const unverified = ledger.data.acceptanceCriteria.filter((c) => !c.satisfied);
        const blockedList: string[] = [
          ...blockers,
          unverified.length > 0 ? `✗ Criteria not yet verified: ${unverified.map((c) => `[${c.id}] ${c.text}`).join(', ')}` : '',
          turnsUsed >= turnBudget ? `✗ Turn budget reached (${turnsUsed}/${turnBudget})` : '',
        ].filter(Boolean);

        recommendation = recommendation || (unverified.length > 0
          ? `Run required verification command(s) for ${unverified.map((c) => c.id).join(', ')}.`
          : `Continue exploration or refine instructions.`);

        summary = [
          `SPECIALIST PARTIAL RESULT`,
          `Agent: ${name}`,
          `Status: ${status}`,
          `Turns: ${turnsUsed}/${turnBudget}`,
          completedList.length > 0 ? `\nCompleted:\n${completedList.map((c) => `  ${c}`).join('\n')}` : '',
          blockedList.length > 0 ? `\nBlocked/Incomplete:\n${blockedList.map((b) => `  ${b}`).join('\n')}` : '',
          evidenceIds.length > 0 ? `\nEvidence:\n  ${evidenceIds.join(', ')}` : '',
          `\nRecommendation:\n  ${recommendation}`,
        ]
          .filter(Boolean)
          .join('\n');
      }
      // Final checkpoint before the outcome decision: capture any uncommitted
      // product state so the pause/resume flow below always has a clean trail.
      await checkpoint(ok ? 'pre-merge' : 'final-wip');
      ledger.setStatus(ok ? 'completed' : 'blocked');
    } finally {
      if (wt) {
        if (ok) {
          const reconciled = await this.reconcileWorktree(wt, repoRoot, name, task);
          summary = reconciled.summary;
          ok = reconciled.ok;
          if (!ok) status = 'FAILED';
          if (reconciled.ok) {
            // Fully delivered → nothing to retain.
            this.retained.delete(job.id);
            await this.removeWorktree(wt, repoRoot);
          } else {
            // Merge conflict path already preserves the branch — register it
            // so the orchestrator can resume instead of losing the attempt.
            this.retainWorktree(job.id, wt, name, task, summary, [...filesChanged]);
          }
        } else {
          // PAUSED, not discarded: the branch holds every checkpoint commit,
          // so the main agent can wake this specialist where it left off.
          const hasProduct = filesChanged.size > 0 || filesInspected.size > 0;
          if (hasProduct) {
            this.retainWorktree(job.id, wt, name, task, summary || 'stopped early', [...filesChanged]);
            const hint = `WORK PRESERVED on branch ${wt.branch} (${filesChanged.size} file(s)) — resume with delegate {"tasks":[{"agent":"${name}","task":"…","resume":{"jobId":"${job.id}"}}]}`;
            emit(`subagent ${name} [paused] ${job.id} — ${hint}`);
            summary = `${summary}\n\nPAUSED AFTER ${turnsUsed}/${turnBudget} TURNS. ${hint}`;
          } else {
            emit(`subagent ${name} — no product changes to keep — discarding worktree`);
            await this.removeWorktree(wt, repoRoot);
          }
        }
      }
    }
    return {
      agent: name,
      task,
      ok,
      status,
      summary,
      turnsUsed,
      turnsBudgeted: turnBudget,
      resumableJobId: this.retained.has(job.id) ? job.id : undefined,
      filesInspected: [...filesInspected],
      filesChanged: [...filesChanged],
      criteriaStatus: (ledger?.data.acceptanceCriteria ?? []).map((c) => ({
        id: c.id,
        text: c.text,
        satisfied: c.satisfied,
      })),
      evidenceIds,
      evidenceReport: ledger ? buildSpecialistEvidenceReport(ledger.data, status) : undefined,
      blockers: blockers.length > 0 ? blockers : undefined,
      recommendation: recommendation || undefined,
    };
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
      const commitMsg = `subagent ${name}: ${task.slice(0, 80)}`.replace(/[\r\n]+/g, ' ');
      // Mid-run checkpoints may have ALREADY committed product changes on the
      // branch — a clean status does NOT mean "no work". The only genuine
      // no-change case is: nothing dirty AND branch already merged into HEAD.
      const isAncestor = await gitExec(repoRoot, ['merge-base', '--is-ancestor', wt.branch, 'HEAD'])
        .then(() => true)
        .catch(() => false);
      // Never merge the specialist's private .hermes state (ledgers, locks)
      // back into the main working tree — only its product changes.
      await gitExec(wt.root, ['add', '-A', '--', ':(exclude).hermes']);
      const staged = await gitExec(wt.root, ['diff', '--cached', '--name-only']).catch(() => '');
      if (!staged.trim() && isAncestor) {
        emit(`subagent ${name} produced no product changes — only private agent state changed`);
        return { ok: true, summary: '(isolated worktree: no product changes were produced)' };
      }
      // Some machines (fresh CI, new laptops) have no git identity at all:
      // without it both the worktree commit AND the merge commit fail. Detect
      // it upfront and use a neutral author so the work is never lost.
      const ident = await this.identityArgs(repoRoot);
      if (staged.trim()) {
        await gitExec(wt.root, [...ident, 'commit', '-m', commitMsg]);
      } else {
        emit(`subagent ${name} — product work found in checkpoint commits, proceeding to merge`);
      }
      emit(`subagent ${name} — merging worktree changes back`);
      // The merge and any conflict cleanup run inside the same serialized
      // chain slot: a conflicting merge is aborted before the next merge ever
      // starts, and the slot never rejects, so one failure cannot poison or
      // race with later merges.
      const settle = mergeChain
        .catch(() => {})
        .then(async (): Promise<{ ok: boolean; summary: string }> => {
          const attemptMerge = (...extra: string[]): Promise<string> =>
            gitExec(repoRoot, [...ident, 'merge', wt.branch, '--no-ff', '-m', `merge ${commitMsg}`, ...extra]);
          try {
            await attemptMerge();
          } catch (errFirst) {
            // Undo the partial merge state, then retry once with the patient
            // diff strategy: many "conflicts" are just hunk relocations that
            // -X patience resolves cleanly.
            await gitExec(repoRoot, ['merge', '--abort']).catch(() => {});
            try {
              await attemptMerge('-X', 'patience');
            } catch {
              const dirty = await gitExec(repoRoot, ['status', '--porcelain']).catch(() => '');
              const unmerged = dirty
                .split(/\r?\n/)
                .filter((l) => /^(UU|AA|DD|AU|UA|UD|DU)\s/.test(l))
                .map((l) => l.slice(3).trim());
              await gitExec(repoRoot, ['merge', '--abort']).catch(() => {});
              if (unmerged.length > 0) {
                emit(`subagent ${name} — merge conflict; work PRESERVED on ${wt.branch} for manual recovery`);
                return {
                  ok: false,
                  summary:
                    `Merge conflict when reconciling worktree changes. The specialist's work is NOT lost — it is committed on branch ${wt.branch} ` +
                    `(worktree ${wt.root}). Recover it with: git merge ${wt.branch} — resolve conflicts manually, or re-delegate a narrower task. ` +
                    `Conflicting paths: ${unmerged.join(', ')}`,
                };
              }
              emit(`subagent ${name} — merge refused by main tree state; work PRESERVED on ${wt.branch}`);
              return {
                ok: false,
                summary:
                  `Worktree changes were NOT merged: ${(errFirst as Error).message} (the main working tree likely has conflicting uncommitted changes). ` +
                  `The work is committed on branch ${wt.branch}; recover later with: git merge ${wt.branch}`,
              };
            }
          }
          emit(`subagent ${name} — merged cleanly into the main working tree`);
          return { ok: true, summary: '(isolated worktree: changes committed and merged back cleanly)' };
        });
      mergeChain = settle;
      return settle;
    } catch (err) {
      // Safety net — the slot above already swallows its own errors, but if
      // the worktree commit itself failed, discard any partial merge state.
      try {
        await gitExec(repoRoot, ['merge', '--abort']);
      } catch {
        /* not mid-merge */
      }
      return { ok: false, summary: `Worktree changes were NOT merged: ${(err as Error).message}` };
    }
  }

  /**
   * Returns git -c identity flags when the repo (or machine) has no
   * user.name / user.email configured — commits and merges would otherwise
   * fail with "Committer identity unknown". An empty array means the machine
   * already has an identity and commits keep the user's real author.
   */
  private async identityArgs(repoRoot: string): Promise<string[]> {
    const [name, email] = await Promise.all([
      gitExec(repoRoot, ['config', 'user.name']).catch(() => ''),
      gitExec(repoRoot, ['config', 'user.email']).catch(() => ''),
    ]);
    if (name.trim() && email.trim()) return [];
    return ['-c', 'user.name=Agent Gitu', '-c', 'user.email=agent@agentgitu.dev'];
  }

  /**
   * Durable pause-index in the MAIN repo's .hermes dir: paused specialists
   * stay resumable even after an app restart (in-memory map alone would lose
   * them, while their worktree dirs sit orphaned on disk).
   */
  private pausedIndexPath(repoRoot: string): string {
    return path.join(repoRoot, '.hermes', 'paused-specialists.json');
  }

  private loadPausedIndex(repoRoot: string): Record<string, RetainedWorktree> {
    try {
      const raw = JSON.parse(readFileSync(this.pausedIndexPath(repoRoot), 'utf8')) as Record<string, RetainedWorktree>;
      return raw && typeof raw === 'object' ? raw : {};
    } catch {
      return {};
    }
  }

  private savePausedIndex(repoRoot: string, index: Record<string, RetainedWorktree>): void {
    try {
      mkdirSync(path.dirname(this.pausedIndexPath(repoRoot)), { recursive: true });
      writeFileSync(this.pausedIndexPath(repoRoot), `${JSON.stringify(index, null, 2)}\n`, 'utf8');
    } catch {
      /* best effort */
    }
  }

  private removeFromPausedIndex(repoRoot: string, jobId: string): void {
    const index = this.loadPausedIndex(repoRoot);
    if (index[jobId]) {
      delete index[jobId];
      this.savePausedIndex(repoRoot, index);
    }
  }

  /**
   * Preserve a paused attempt's worktree for later resume, evicting the
   * oldest retained entry (and its worktree) beyond the cap.
   */
  private retainWorktree(jobId: string, wt: Worktree, agent: string, task: string, summary: string, filesChanged: string[]): void {
    const repoRoot = ProjectGuard.detect(this.deps.cwd).lock.repoRoot;
    const record: RetainedWorktree = { root: wt.root, branch: wt.branch, agent, task, summary, filesChanged, createdAt: Date.now() };
    this.retained.set(jobId, record);
    const index = this.loadPausedIndex(repoRoot);
    index[jobId] = record;
    this.savePausedIndex(repoRoot, index);
    while (this.retained.size > RETAINED_WORKTREES_MAX) {
      const oldestKey = this.retained.keys().next().value;
      if (!oldestKey) break;
      const oldest = this.retained.get(oldestKey)!;
      this.retained.delete(oldestKey);
      delete index[oldestKey];
      void this.removeWorktree({ root: oldest.root, branch: oldest.branch }, repoRoot).catch(() => {});
      emitSafe(this.deps.onEvent, `subagent ${oldest.agent} retained worktree ${oldestKey} evicted (cap ${RETAINED_WORKTREES_MAX})`);
    }
    this.savePausedIndex(repoRoot, index);
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
