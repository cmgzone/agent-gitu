import { existsSync, mkdirSync, rmdirSync, readFileSync, readdirSync, renameSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { EvidenceEngine, classifyEvidenceKind } from '../evidence/evidence.js';
import { Executor } from '../executor/executor.js';
import { getWorkspaceFingerprint, gitExec, isGitRepo } from '../git/git.js';
import { ProjectGuard } from '../guard/project-guard.js';
import { TaskLedger } from '../ledger/task-ledger.js';
import { extractJson, LlmError, parseXmlFunctionCall, type LlmClient, type LlmMessage } from '../llm/llm.js';
import { resilientLlm } from '../llm/resilient.js';
import { LoopDetector } from '../loop/loop-detector.js';
import { MalformedCallTracker, malformedIntervention, malformedKindFor } from '../loop/malformed-tracker.js';
import { PolicyEngine } from '../policy/policy.js';
import { KNOWN_TOOL_NAMES } from '../tools/tools.js';
import { buildSpecialistEvidenceReport, type SpecialistEvidenceReport } from './specialist-evidence.js';
import { MemoryStore } from '../memory/memory-store.js';
import {
  captureGitCheckpoint,
  delegatedTaskHash,
  reconcileSpecialistCheckpoint,
  reconcileSpecialistSkillState,
  SpecialistCheckpointStore,
  type SpecialistCheckpoint,
  type SpecialistResumeState,
  type SpecialistSkillState,
  type SpecialistStopReason,
} from './specialist-checkpoints.js';
import { SkillStore, type SkillIdentity } from '../skills/skills.js';
import type { AcceptanceCriterion, CriterionSpec, MemoryType, SpecialistHandoff } from '../types.js';

export interface SubAgentSpec {
  agent: string;
  task: string;
  criteria?: (string | CriterionSpec)[];
  /** Bounded parent context so a new worker can start from assigned files
   * instead of rediscovering the whole repository. */
  handoff?: SpecialistHandoff;
  /** Continue a previously PAUSED specialist in its preserved worktree,
   *  picking up where it left off instead of starting over. */
  resume?: { jobId: string; note?: string; /** Explicit policy approval to continue after selected skill drift. */ allowSkillRecovery?: boolean };
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
  /** Stable identity that persists across infrastructure recovery attempts. */
  logicalJobId?: string;
  /** Physical execution number for this logical specialist job. */
  executionAttempt?: number;
  /** Truthful Git-verified recovery state, when this job was resumed or paused. */
  resumeState?: SpecialistResumeState;
  /** Exact selected-skill identity check made during checkpoint recovery. */
  skillState?: SpecialistSkillState;
  stopReason?: SpecialistStopReason;
}

export type SubAgentJobStatus = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';

export interface SubAgentJob {
  id: string;
  /** Stable job identity. It equals id on the first attempt and survives resumes. */
  logicalJobId?: string;
  executionAttempt?: number;
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
  /**
   * Hard wall-clock limit for a single specialist model turn.  This is a
   * watchdog around providers such as the local Codex subscription client,
   * whose streaming request can otherwise wait forever if its transport stops
   * producing events. Default: eight minutes.
   */
  turnTimeoutMs?: number;
  /** When the project is a git repo, run each specialist in its own worktree and merge back on success (default true). */
  isolate?: boolean;
  /** Shared memory store (review: ONE memory store). Specialists retrieve
   *  through the ISOLATION FILTER — they see mission/project/global memory
   *  and their own agent memories, never another specialist's private ones —
   *  and publish their results as mission-scope candidate findings. */
  memory?: MemoryStore;
  /** Mission id for scoped retrieval and finding publication. */
  missionId?: string;
  onEvent?: (text: string) => void;
}

const DEFAULT_BASE_TURNS = 30;
const DEFAULT_HARD_CEILING_TURNS = 150;
const MAX_CONCURRENT_SUBAGENTS = 5;
const DEFAULT_SPECIALIST_TURN_TIMEOUT_MS = 8 * 60_000;
const MAX_SPECIALIST_TURN_TIMEOUT_MS = 15 * 60_000;

/** Finished jobs stay queryable for this long, then their memory is freed. */
const JOB_RETENTION_MS = 10 * 60_000;
interface InternalSubAgentJob extends SubAgentJob {
  completion: Promise<SubAgentResult>;
  resolve: (result: SubAgentResult) => void;
  spec: SubAgentSpec;
  /** Each job gets its own cancellation channel so stopping the parent task
   * also interrupts its currently awaited model turn. */
  abortController: AbortController;
  cancelReason?: string;
}

/** A paused specialist's preserved worktree, resumable by jobId. */
interface RetainedWorktree {
  logicalJobId?: string;
  root: string;
  branch: string;
  agent: string;
  task: string;
  summary: string;
  filesChanged: string[];
  createdAt: number;
  /** Emergency records preserve the Git facts needed for restart recovery. */
  baseCommit?: string;
  headCommit?: string;
  workspaceFingerprint?: string;
  currentTurn?: number;
  selectedSkills?: SkillIdentity[];
  stopReason?: SpecialistStopReason;
  resumeStatus?: SpecialistResumeState;
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

function abortReason(signal: AbortSignal, fallback: string): string {
  const reason = signal.reason;
  if (reason instanceof Error && reason.message) return reason.message;
  if (typeof reason === 'string' && reason.trim()) return reason;
  return fallback;
}

/**
 * Run one specialist request with two independent escape hatches:
 * - the job's cancellation signal (Stop, delete, or parent task abort), and
 * - a bounded per-turn watchdog for provider streams that ignore cancellation.
 *
 * The race is intentional. Some SDKs acknowledge AbortSignal late (or not at
 * all); resolving this wrapper immediately prevents a dead provider call from
 * holding the whole specialist queue forever.
 */
function completeSpecialistTurn(
  llm: LlmClient,
  messages: LlmMessage[],
  opts: { effort?: 'low' | 'medium' | 'high' | 'max' },
  parentSignal: AbortSignal,
  timeoutMs: number,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const controller = new AbortController();
    let settled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const cleanup = (): boolean => {
      if (settled) return false;
      settled = true;
      if (timer) clearTimeout(timer);
      parentSignal.removeEventListener('abort', onParentAbort);
      return true;
    };
    const succeed = (value: string): void => {
      if (cleanup()) resolve(value);
    };
    const fail = (error: Error): void => {
      if (cleanup()) reject(error);
    };
    const onParentAbort = (): void => {
      const reason = abortReason(parentSignal, 'Specialist cancelled.');
      controller.abort(new Error(reason));
      fail(new Error(`Specialist cancelled: ${reason}`));
    };

    if (parentSignal.aborted) {
      onParentAbort();
      return;
    }
    parentSignal.addEventListener('abort', onParentAbort, { once: true });
    timer = setTimeout(() => {
      const error = new Error(`Specialist turn timed out after ${timeoutMs}ms without a model response.`);
      controller.abort(error);
      fail(error);
    }, timeoutMs);

    void llm
      .complete(messages, { temperature: 0.2, effort: opts.effort, signal: controller.signal })
      .then(succeed)
      .catch((err) => fail(err instanceof Error ? err : new Error(String(err))));
  });
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
6. When a WORK HANDOFF is supplied, it is your starting map. First read its listed files in the worktree (the excerpts are orientation only), then use targeted symbol/import searches only when the assigned change requires them. Do NOT list the repository root or perform a broad repository scan unless the handoff has no usable starting file.

PROTOCOL — respond each turn with EXACTLY ONE JSON object:
{"action":{"type":"tool_call","tool":"<tool>","params":{...},"reason":"why","expected":"what should happen"}}
Tools:
- read_file       {"path":"src/x.ts"}
- write_file      {"path":"src/x.ts","content":"full content"}
- apply_edit      {"path":"src/x.ts","oldString":"exact text","newString":"replacement"}
- list_files      {"path":"src"}
- search_files    {"pattern":"regex","path":"src"}
- list_skills     {}
- use_skill       {"name":"skill-name"}
- use_skill_reference {"skill":"skill-name","path":"references/file.md"}
- run_command     {"command":"npm test"}
- claim_criterion {"criterionId":"ac-1","evidenceId":"ev-..."}

IMPORTANT DISCOVERIES: if you find something other specialists on this mission should know (a critical bug, an environment quirk, a root cause), publish it IMMEDIATELY — do not wait until you finish:
{"action":{"type":"publish_finding","findingType":"observation|fact|failure|lesson","content":"the finding, self-contained","evidence":"what proves it (optional)","confidence":0.8}}
The finding is shared with the mission as a CANDIDATE (unverified) — publishing never makes it durable, and your conversation stays private.

When the task is finished and all criteria are verified, respond with:
{"action":{"type":"answer","summary":"what you did, files touched, verification results, open issues"}}`;
}

/** Render the parent briefing for a new specialist. It is intentionally small:
 * enough concrete context to avoid rediscovery, never a repository dump. */
function renderSpecialistHandoff(handoff: SpecialistHandoff): string {
  const files = handoff.startingFiles.length > 0
    ? handoff.startingFiles.map((file) => `  - ${file.path} [${file.role}]${file.note ? ` — ${file.note}` : ''}`).join('\n')
    : '  (No ranked source file was available; use a narrow task-named search instead of scanning the repository.)';
  const plan = handoff.planSteps.length > 0
    ? handoff.planSteps.map((step) => `  - ${step.description}${step.verification ? `\n    Verification target: ${step.verification}` : ''}`).join('\n')
    : '  (No matching parent plan step was recorded.)';
  const verification = handoff.verificationTargets.length > 0
    ? handoff.verificationTargets.map((target) => `  - ${target}`).join('\n')
    : '  (Use task-appropriate verification for the changed code.)';
  const excerpts = handoff.excerpts.length > 0
    ? `\n\nSOURCE EXCERPTS (orientation only; read the actual file before editing):\n${handoff.excerpts.map((excerpt) => `--- ${excerpt.path} ---\n${excerpt.content}`).join('\n\n')}`
    : '';
  return [
    'WORK HANDOFF — START HERE',
    `PARENT GOAL:\n${handoff.parentGoal}`,
    "YOUR ASSIGNMENT is the TASK message. Keep ownership limited to that assignment; do not redo the parent's investigation.",
    `STARTING FILES (ranked for your assignment):\n${files}`,
    `RELEVANT PARENT PLAN:\n${plan}`,
    `VERIFICATION TARGETS:\n${verification}`,
    'EXPLORATION LIMIT:\n- Begin with read_file on a listed starting file in this worktree.\n- Do not call list_files on the repository root and do not inventory unrelated directories.\n- Expand with a targeted search only for a symbol, import, caller, or test directly needed by the assigned change.',
  ].join('\n\n') + excerpts;
}

export class SubAgentRunner {
  private readonly jobs = new Map<string, InternalSubAgentJob>();
  private readonly queue: InternalSubAgentJob[] = [];
  private running = 0;
  private nextJob = 1;
  private readonly checkpointStores = new Map<string, SpecialistCheckpointStore>();
  /** Jobs protected by the file-backed recovery path in this runner. */
  private readonly emergencyRecoveries = new Set<string>();

  constructor(private readonly deps: SubAgentRunnerDeps) {}

  /**
   * Specialist system prompt with SCOPED memory (review Phase 11): the
   * specialist sees mission/project/global memory and its OWN agent memories
   * through the isolation filter — never another specialist's private memory,
   * conversation, or reasoning. Retrieval happens inside the memory store.
   */
  private specialistSystemPrompt(name: string, role: string, root: string, isolated: boolean, criteria: AcceptanceCriterion[] | undefined, agentId: string | undefined, projectScope: string): string {
    const base = buildSystemPrompt(name, role, root, isolated, criteria);
    const memory = this.deps.memory;
    if (!memory) return base;
    const entries = memory.retrieveForContext(`${name} ${role}`, projectScope, {
      limit: 6,
      maxChars: 1_200,
      ctx: { requestingAgentId: agentId, missionId: this.deps.missionId, projectId: projectScope },
    });
    if (entries.length === 0) return base;
    return (
      base +
      `\n\nRELEVANT MEMORY for your specialty (verified knowledge first — do not re-derive what is already recorded):\n${entries
        .map((m) => `- [${m.type}${m.status ? `/${m.status}` : ''}] ${m.claim}`)
        .join('\n')}`
    );
  }

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
    const live = [...this.jobs.values()]
      .filter((job) => !wanted || wanted.has(job.id))
      .map((job) => this.snapshot(job));
    // A runner is intentionally short-lived (one Gitu execution), while a
    // worktree can outlive an app restart. Expose durable paused/interrupted
    // attempts through agent_status so the next parent agent can resume them
    // instead of silently starting duplicate work.
    let recovered: SubAgentJob[] = [];
    try {
      const repoRoot = ProjectGuard.detect(this.deps.cwd).lock.repoRoot;
      recovered = this.checkpointStore(repoRoot)
        .listResumable()
        .filter((checkpoint) => (!wanted || wanted.has(checkpoint.logicalJobId)) && ![...this.jobs.values()].some((job) => job.logicalJobId === checkpoint.logicalJobId))
        .map((checkpoint) => ({
          id: checkpoint.logicalJobId,
          logicalJobId: checkpoint.logicalJobId,
          executionAttempt: checkpoint.executionAttempt,
          agent: checkpoint.specialistType,
          task: checkpoint.delegatedTask,
          status: 'cancelled' as const,
          queuedAt: checkpoint.createdAt,
          startedAt: checkpoint.createdAt,
          finishedAt: checkpoint.updatedAt,
          summary:
            `Checkpoint discovered for branch ${checkpoint.branch}. It will be reconciled with Git before any resume; ` +
            `Agent Gitu will only claim recovered edits after that verification. ` +
            `resume with delegate {\"tasks\":[{\"agent\":\"${checkpoint.specialistType}\",\"task\":\"…\",\"resume\":{\"jobId\":\"${checkpoint.logicalJobId}\"}}]}.`,
        }));
    } catch {
      /* Status must stay available even when the project root is unavailable. */
    }
    return [...live, ...recovered].sort((a, b) => a.queuedAt.localeCompare(b.queuedAt));
  }

  async waitFor(ids: string[]): Promise<SubAgentResult[]> {
    const jobs = ids.map((id) => this.jobs.get(id)).filter((job): job is InternalSubAgentJob => Boolean(job));
    return Promise.all(jobs.map((job) => job.completion));
  }

  /**
   * Stop all queued/running specialists belonging to this parent run. Running
   * jobs receive an AbortSignal; queued jobs resolve immediately so a stopped
   * parent is never held behind a queue it can no longer use.
   */
  stop(reason = 'Stopped by user.'): void {
    const queued = this.queue.splice(0, this.queue.length);
    for (const job of queued) {
      job.cancelReason = reason;
      job.abortController.abort(new Error(reason));
      job.status = 'cancelled';
      job.finishedAt = new Date().toISOString();
      job.summary = `Specialist cancelled before it started: ${reason}`;
      job.resolve({
        agent: job.agent,
        task: job.task,
        ok: false,
        status: 'CANCELLED',
        summary: job.summary,
        turnsUsed: 0,
        turnsBudgeted: this.deps.baseTurns ?? DEFAULT_BASE_TURNS,
        filesInspected: [],
        filesChanged: [],
        evidenceIds: [],
        blockers: [reason],
        recommendation: 'Resume or re-delegate this specialist task when ready.',
      });
      emitSafe(this.deps.onEvent, `subagent ${job.agent} [cancelled] ${job.id} — ${job.summary}`);
    }
    for (const job of this.jobs.values()) {
      if (job.status !== 'running' || job.abortController.signal.aborted) continue;
      job.cancelReason = reason;
      job.abortController.abort(new Error(reason));
      emitSafe(this.deps.onEvent, `subagent ${job.agent} [running] ${job.id} — cancellation requested`);
    }
  }

  private concurrency(): number {
    const requested = Number(this.deps.maxConcurrent ?? MAX_CONCURRENT_SUBAGENTS);
    if (!Number.isFinite(requested)) return MAX_CONCURRENT_SUBAGENTS;
    return Math.max(1, Math.min(MAX_CONCURRENT_SUBAGENTS, Math.floor(requested)));
  }

  /** SQLite is the durable checkpoint authority. Import legacy and emergency
   * file records once so a transient SQLite failure never strands a worktree. */
  private checkpointStore(repoRoot: string): SpecialistCheckpointStore {
    const existing = this.checkpointStores.get(repoRoot);
    if (existing) return existing;
    const store = new SpecialistCheckpointStore(repoRoot);
    this.checkpointStores.set(repoRoot, store);
    const retained = { ...this.loadPausedIndex(repoRoot), ...this.loadEmergencyRecoveries(repoRoot) };
    for (const [logicalJobId, legacy] of Object.entries(retained)) {
      const prior = store.get(logicalJobId);
      // A file-backed emergency record is created only after a database write
      // failed. It must win over an older, incomplete database row.
      const legacyIsNewer = (legacy.createdAt || 0) >= Date.parse(prior?.updatedAt ?? '') || Boolean(legacy.workspaceFingerprint);
      if (prior && !legacyIsNewer) continue;
      const now = new Date(legacy.createdAt || Date.now()).toISOString();
      store.upsert({
        logicalJobId,
        executionJobId: logicalJobId,
        executionAttempt: prior?.executionAttempt ?? 1,
        specialistType: legacy.agent,
        delegatedTask: legacy.task,
        delegatedTaskHash: delegatedTaskHash(legacy.task),
        repositoryPath: repoRoot,
        worktreePath: legacy.root,
        branch: legacy.branch,
        currentTurn: legacy.currentTurn ?? 0,
        changedFiles: legacy.filesChanged,
        selectedSkills: legacy.selectedSkills ?? prior?.selectedSkills ?? [],
        baseCommit: legacy.baseCommit,
        headCommit: legacy.headCommit,
        workspaceFingerprint: legacy.workspaceFingerprint,
        checkpointedAt: now,
        resumeStatus: legacy.resumeStatus ?? (legacy.filesChanged.length ? 'RESUME_CHECKPOINT_DIVERGED' : 'RESUME_CONTEXT_ONLY'),
        stopReason: legacy.stopReason,
        summary: legacy.summary,
        resumable: true,
        createdAt: prior?.createdAt ?? now,
        updatedAt: now,
      });
    }
    return store;
  }

  /**
   * SQLite is normally the checkpoint authority. If it is busy or damaged at
   * the exact instant progress is recorded, put a complete per-job recovery
   * record beside the repository instead of leaving an invisible worktree.
   * The next healthy runner imports this record before a resume is attempted.
   */
  private async persistEmergencyRecovery(input: {
    repoRoot: string;
    job: InternalSubAgentJob;
    wt: Worktree;
    currentTurn: number;
    filesChanged: Iterable<string>;
    selectedSkills: SkillIdentity[];
    summary: string;
    stopReason?: SpecialistStopReason;
  }): Promise<RetainedWorktree> {
    const baseCommit = (await gitExec(input.repoRoot, ['merge-base', input.wt.branch, 'HEAD']).catch(() => '')).trim() || undefined;
    const git = await captureGitCheckpoint(input.wt.root, baseCommit).catch(() => ({ baseCommit, headCommit: undefined, workspaceFingerprint: undefined, changedFiles: [] as string[] }));
    const filesChanged = git.changedFiles.length > 0
      ? git.changedFiles
      : [...new Set([...input.filesChanged].map((file) => file.replace(/\\/g, '/').trim()).filter(Boolean))].sort();
    const record: RetainedWorktree = {
      logicalJobId: input.job.logicalJobId,
      root: input.wt.root,
      branch: input.wt.branch,
      agent: input.job.agent,
      task: input.job.task,
      summary: input.summary,
      filesChanged,
      createdAt: Date.now(),
      baseCommit: git.baseCommit ?? baseCommit,
      headCommit: git.headCommit,
      workspaceFingerprint: git.workspaceFingerprint,
      currentTurn: input.currentTurn,
      selectedSkills: input.selectedSkills,
      stopReason: input.stopReason,
      resumeStatus: filesChanged.length > 0 && git.workspaceFingerprint ? 'RESUME_WITH_CHANGES' : 'RESUME_CONTEXT_ONLY',
    };
    const target = this.emergencyRecoveryPath(input.repoRoot, input.job.logicalJobId!);
    mkdirSync(path.dirname(target), { recursive: true });
    const temporary = `${target}.${process.pid}.${Date.now()}.tmp`;
    writeFileSync(temporary, JSON.stringify(record), 'utf8');
    renameSync(temporary, target);
    this.emergencyRecoveries.add(input.job.logicalJobId!);
    return record;
  }

  private async persistEmergencyRecoverySafely(
    input: Parameters<SubAgentRunner['persistEmergencyRecovery']>[0],
    emit: (text: string) => void,
    name: string,
    label: string,
  ): Promise<RetainedWorktree | undefined> {
    try {
      return await this.persistEmergencyRecovery(input);
    } catch (err) {
      emit(`subagent ${name} — ${label} and emergency recovery both failed: ${(err as Error).message}`);
      return undefined;
    }
  }

  private hasResumableRecovery(repoRoot: string, logicalJobId: string): boolean {
    if (this.emergencyRecoveries.has(logicalJobId)) return true;
    try {
      return Boolean(this.checkpointStore(repoRoot).get(logicalJobId)?.resumable);
    } catch {
      return false;
    }
  }

  /** Capture Git facts and commit metadata together after every durable unit
   * of specialist progress. The changed-file list always comes from Git when
   * isolation is active; model/tool bookkeeping cannot manufacture it. */
  private async persistCheckpoint(input: {
    repoRoot: string;
    job: InternalSubAgentJob;
    wt: Worktree;
    currentTurn: number;
    filesChanged: Iterable<string>;
    lastSuccessfulAction?: string;
    summary?: string;
    stopReason?: SpecialistStopReason;
    resumable: boolean;
    selectedSkills?: SkillIdentity[];
  }): Promise<SpecialistCheckpoint> {
    let failure: unknown;
    // Database locks can occur while a previous desktop process is closing.
    // Brief retries cover that ordinary race; the caller writes an emergency
    // recovery record if all attempts still fail.
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const store = this.checkpointStore(input.repoRoot);
        const prior = store.get(input.job.logicalJobId!);
        const git = await captureGitCheckpoint(input.wt.root, prior?.baseCommit);
        const isIsolatedGit = isGitRepo(input.wt.root);
        const changedFiles = isIsolatedGit ? git.changedFiles : [...input.filesChanged];
        const hasVerifiedChanges = changedFiles.length > 0 && Boolean(git.workspaceFingerprint);
        const now = new Date().toISOString();
        return store.upsert({
          logicalJobId: input.job.logicalJobId!,
          executionJobId: input.job.id,
          executionAttempt: input.job.executionAttempt ?? 1,
          specialistType: input.job.agent,
          delegatedTask: input.job.task,
          delegatedTaskHash: delegatedTaskHash(input.job.task),
          repositoryPath: input.repoRoot,
          worktreePath: input.wt.root,
          branch: input.wt.branch,
          currentTurn: input.currentTurn,
          changedFiles,
          selectedSkills: input.selectedSkills ?? prior?.selectedSkills ?? [],
          baseCommit: git.baseCommit ?? prior?.baseCommit,
          headCommit: git.headCommit ?? prior?.headCommit,
          workspaceFingerprint: git.workspaceFingerprint ?? prior?.workspaceFingerprint,
          checkpointedAt: now,
          lastSuccessfulAction: input.lastSuccessfulAction ?? prior?.lastSuccessfulAction,
          resumeStatus: hasVerifiedChanges ? 'RESUME_WITH_CHANGES' : 'RESUME_CONTEXT_ONLY',
          stopReason: input.stopReason,
          summary: input.summary ?? prior?.summary,
          resumable: input.resumable,
          createdAt: prior?.createdAt ?? now,
          updatedAt: now,
        });
      } catch (err) {
        failure = err;
        if (attempt < 2) await new Promise((resolve) => setTimeout(resolve, 50 * (attempt + 1)));
      }
    }
    throw failure instanceof Error ? failure : new Error(String(failure ?? 'checkpoint persistence failed'));
  }

  private classifyStopReason(err: unknown, cancelled: boolean): SpecialistStopReason {
    if (cancelled) return 'process_interrupted';
    const message = err instanceof Error ? err.message : String(err);
    if (/timed out|timeout/i.test(message)) return 'model_timeout';
    if (err instanceof LlmError) return 'model_transport_failure';
    if (/\b(policy|permission|denied|not allowed)\b/i.test(message)) return 'tool_policy_block';
    if (/\b(provider|transport|network|connection|rate limit|http \d{3}|fetch|codex exec)\b/i.test(message)) return 'model_transport_failure';
    return 'task_failed';
  }

  private enqueue(spec: SubAgentSpec): InternalSubAgentJob {
    const queuedAt = new Date().toISOString();
    let resolve!: (result: SubAgentResult) => void;
    const completion = new Promise<SubAgentResult>((done) => {
      resolve = done;
    });
    const id = `sub-${Date.now().toString(36)}-${this.nextJob++}`;
    const logicalJobId = spec.resume?.jobId || id;
    let executionAttempt = 1;
    if (spec.resume?.jobId) {
      try {
        const repoRoot = ProjectGuard.detect(this.deps.cwd).lock.repoRoot;
        executionAttempt = (this.checkpointStore(repoRoot).get(logicalJobId)?.executionAttempt ?? 0) + 1;
      } catch {
        // The resume path itself reports a missing checkpoint truthfully.
      }
    }
    const job: InternalSubAgentJob = {
      id,
      logicalJobId,
      executionAttempt,
      agent: spec.agent,
      task: spec.task,
      criteria: spec.criteria,
      status: 'queued',
      queuedAt,
      completion,
      resolve,
      spec,
      abortController: new AbortController(),
    };
    this.jobs.set(job.id, job);
    this.queue.push(job);
    (this.deps.onEvent ?? (() => {}))(`subagent ${job.agent} [queued] ${job.id} — ${job.task.slice(0, 100)}${job.executionAttempt && job.executionAttempt > 1 ? ` (resume attempt ${job.executionAttempt}, logical ${logicalJobId})` : ''}`);
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
          job.status = result.status === 'CANCELLED' ? 'cancelled' : result.ok ? 'completed' : 'failed';
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
    const handoff = job.spec.handoff;
    const emit = this.deps.onEvent ?? (() => {});
    const role = this.deps.agentRole(name) ?? 'general-purpose engineer';
    const llm = resilientLlm(this.deps.resolveLlm(name), {
      label: `specialist ${name}`,
      onRetry: ({ attempt, maxRetries, delayMs, error }) =>
        emit(`subagent ${name} — LLM ${error.message.slice(0, 100)} — retry ${attempt}/${maxRetries} in ${(delayMs / 1000).toFixed(1)}s`),
    });

    const repoRoot = ProjectGuard.detect(this.deps.cwd).lock.repoRoot;
    const logicalJobId = job.logicalJobId ?? job.id;
    const checkpointStore = this.checkpointStore(repoRoot);
    const specialistSkillContext = {
      task,
      specialist: name,
      // Specialist worktrees intentionally do not inherit browser-only
      // capabilities. Skills that require them fail closed instead.
      availableTools: [...KNOWN_TOOL_NAMES],
    };
    let selectedSkills: SkillIdentity[] = [];
    let skillState: SpecialistSkillState | undefined;
    // Resume mode: adopt the paused attempt's preserved worktree instead of
    // starting from a fresh copy — nothing gets redone.
    const resumeKey = job.spec.resume?.jobId;
    let resumedFrom: RetainedWorktree | undefined;
    let resumeState: SpecialistResumeState | undefined;
    if (resumeKey) {
      const liveAttempt = [...this.jobs.values()].find(
        (candidate) => candidate.id !== job.id && candidate.logicalJobId === resumeKey && (candidate.status === 'queued' || candidate.status === 'running'),
      );
      if (liveAttempt) {
        emit(`subagent ${name} resume ${resumeKey} unavailable — that specialist is still active`);
      } else {
        const checkpoint = checkpointStore.get(resumeKey);
        const taskMatches = checkpoint?.delegatedTaskHash === delegatedTaskHash(task);
        const agentMatches = checkpoint?.specialistType === name;
        if (checkpoint && taskMatches && agentMatches) {
          skillState = reconcileSpecialistSkillState(checkpoint, SkillStore.forProject(checkpoint.worktreePath));
          if (skillState !== 'SKILL_STATE_MATCH' && !job.spec.resume?.allowSkillRecovery) {
            const message = `${skillState}: the checkpoint's selected skill instructions are no longer identical. Recovery requires explicit allowSkillRecovery policy and will not claim identical instructions.`;
            checkpointStore.upsert({
              ...checkpoint,
              executionJobId: job.id,
              executionAttempt: job.executionAttempt ?? checkpoint.executionAttempt + 1,
              summary: message,
              resumable: true,
            });
            emit(`subagent ${name} [blocked] ${job.id} — ${message}`);
            return {
              agent: name,
              task,
              ok: false,
              status: 'BLOCKED',
              summary: message,
              turnsUsed: 0,
              turnsBudgeted: this.deps.baseTurns ?? DEFAULT_BASE_TURNS,
              filesInspected: [],
              filesChanged: [],
              evidenceIds: [],
              blockers: [message],
              recommendation: 'Restore the original selected skill files, or explicitly approve safe skill recovery for this specialist.',
              resumableJobId: logicalJobId,
              logicalJobId,
              executionAttempt: job.executionAttempt,
              skillState,
              stopReason: 'process_interrupted',
            };
          }
        }
        resumeState = checkpoint && taskMatches && agentMatches
          ? await reconcileSpecialistCheckpoint(checkpoint)
          : checkpoint
            ? 'RESUME_CHECKPOINT_DIVERGED'
            : 'RESUME_CHECKPOINT_MISSING';
        if (resumeState === 'RESUME_WITH_CHANGES' || resumeState === 'RESUME_WITH_UNCHECKPOINTED_CHANGES' || resumeState === 'RESUME_CONTEXT_ONLY') {
          const recoveredFiles = resumeState === 'RESUME_WITH_UNCHECKPOINTED_CHANGES'
            ? (await captureGitCheckpoint(checkpoint!.worktreePath, checkpoint!.baseCommit)).changedFiles
            : checkpoint!.changedFiles;
          resumedFrom = {
            root: checkpoint!.worktreePath,
            branch: checkpoint!.branch,
            agent: checkpoint!.specialistType,
            task: checkpoint!.delegatedTask,
            summary: checkpoint!.summary ?? 'Recovered checkpoint.',
            filesChanged: recoveredFiles,
            createdAt: Date.parse(checkpoint!.createdAt) || Date.now(),
          };
          emit(
            resumeState === 'RESUME_WITH_CHANGES'
              ? `subagent ${name} resuming ${resumeKey} — Git verified ${checkpoint!.changedFiles.length} durable changed file(s) on ${checkpoint!.branch}`
              : resumeState === 'RESUME_WITH_UNCHECKPOINTED_CHANGES'
                ? `subagent ${name} resuming ${resumeKey} — Git discovered ${recoveredFiles.length} durable change(s) written after the last checkpoint on ${checkpoint!.branch}`
              : `subagent ${name} resuming ${resumeKey} — checkpoint has context only; no durable edited files were verified`,
          );
        } else {
          if (checkpoint) {
            checkpointStore.upsert({
              ...checkpoint,
              executionJobId: job.id,
              executionAttempt: job.executionAttempt ?? checkpoint.executionAttempt + 1,
              resumeStatus: resumeState,
              summary:
                resumeState === 'RESUME_CHECKPOINT_DIVERGED'
                  ? 'Checkpoint metadata no longer matches the actual Git worktree; recovery was stopped before any false file claim.'
                  : 'Checkpoint or preserved worktree could not be found; recovery was stopped.',
              // Keep the logical record available for an explicit repair and
              // retry. It is not runnable *now*, but deleting it would force
              // an unnecessary new specialist allocation after recovery.
              resumable: true,
            });
          }
          const message =
            resumeState === 'RESUME_CHECKPOINT_DIVERGED'
              ? 'Specialist checkpoint diverged from the real Git worktree. Agent Gitu did not start from a clean baseline or claim that edits were recovered.'
              : 'Specialist checkpoint is missing or its worktree cannot be recovered. Agent Gitu did not start a replacement specialist automatically.';
          emit(`subagent ${name} [failed] ${job.id} — ${resumeState}: ${message}`);
          return {
            agent: name,
            task,
            ok: false,
            status: 'FAILED',
            summary: `${resumeState}: ${message}`,
            turnsUsed: 0,
            turnsBudgeted: this.deps.baseTurns ?? DEFAULT_BASE_TURNS,
            filesInspected: [],
            filesChanged: [],
            evidenceIds: [],
            blockers: [message],
            recommendation: 'Restore the preserved branch/worktree or explicitly delegate a new specialist task.',
            resumableJobId: checkpoint ? logicalJobId : undefined,
            logicalJobId,
            executionAttempt: job.executionAttempt,
            resumeState,
            skillState,
            stopReason: 'process_interrupted',
          };
        }
      }
    }
    // Keep the caller-facing recovery diagnosis stable. Later checkpoints can
    // correctly upgrade the persisted branch to WITH_CHANGES, but that must
    // not erase the fact that this execution recovered uncheckpointed work.
    const recoveryState = resumeState;
    const wt = resumedFrom ? { root: resumedFrom.root, branch: resumedFrom.branch } : await this.createWorktree(job, repoRoot);
    const workRoot = wt ? wt.root : repoRoot;
    let specialistSkills: SkillStore;
    let recoveredCheckpoint: SpecialistCheckpoint | undefined;
    try {
      specialistSkills = SkillStore.forProject(workRoot);
      recoveredCheckpoint = resumedFrom ? checkpointStore.get(logicalJobId) : undefined;
      if (recoveredCheckpoint && skillState === 'SKILL_STATE_MATCH') {
        selectedSkills = recoveredCheckpoint.selectedSkills;
      } else {
        const selection = specialistSkills.resolver().resolve(task, specialistSkillContext);
        for (const candidate of selection.highConfidence.slice(0, 3)) {
          if (candidate.scope === 'builtin' && candidate.name.startsWith('strategy-')) continue;
          const activation = specialistSkills.activate(candidate.name, specialistSkillContext);
          if (activation.ok && activation.identity) selectedSkills.push(activation.identity);
        }
      }

      // Register an isolated worktree before the first model request. A process
      // restart cannot execute the normal finally block, so waiting until a
      // partial result would otherwise leave this worktree orphaned and invisible
      // to agent_status/resume.
      if (wt) {
        await this.persistCheckpoint({
          repoRoot,
          job,
          wt,
          currentTurn: resumedFrom ? checkpointStore.get(logicalJobId)?.currentTurn ?? 0 : 0,
          filesChanged: resumedFrom?.filesChanged ?? [],
          selectedSkills,
          summary: resumedFrom ? 'Specialist resumed and is working.' : 'Specialist is working; its worktree is recoverable after a restart.',
          resumable: true,
        });
        if (!resumedFrom) {
          emit(`subagent ${name} isolated in git worktree ${wt.root} (branch ${wt.branch})`);
        }
      }
    } catch (err) {
      const message = `Specialist setup stopped before its first model turn: ${(err as Error).message}`;
      if (wt) {
        try {
          const emergency = await this.persistEmergencyRecovery({
            repoRoot,
            job,
            wt,
            currentTurn: resumedFrom ? recoveredCheckpoint?.currentTurn ?? 0 : 0,
            filesChanged: resumedFrom?.filesChanged ?? [],
            selectedSkills,
            summary: message,
            stopReason: 'process_interrupted',
          });
          emit(`subagent ${name} [paused] ${job.id} — checkpoint database unavailable; recovery file preserved on ${wt.branch}`);
          return {
            agent: name,
            task,
            ok: false,
            status: 'BLOCKED',
            summary: `${message}\n\nRECOVERY FILE PRESERVED on branch ${wt.branch}. Resume with delegate {"tasks":[{"agent":"${name}","task":"…","resume":{"jobId":"${logicalJobId}"}}]}.`,
            turnsUsed: 0,
            turnsBudgeted: this.deps.baseTurns ?? DEFAULT_BASE_TURNS,
            filesInspected: [],
            filesChanged: emergency.filesChanged,
            evidenceIds: [],
            blockers: [message],
            recommendation: 'Resume the preserved specialist once the local checkpoint store is available.',
            resumableJobId: logicalJobId,
            logicalJobId,
            executionAttempt: job.executionAttempt,
            resumeState: emergency.resumeStatus,
            skillState,
            stopReason: 'process_interrupted',
          };
        } catch (recoveryErr) {
          emit(`subagent ${name} — emergency checkpoint failed: ${(recoveryErr as Error).message}`);
        }
      }
      throw err;
    }

    let summary = '';
    let ok = false;
    let status: SpecialistStatus = 'FAILED';
    let turnBudget = this.deps.baseTurns ?? DEFAULT_BASE_TURNS;
    const hardCeiling = this.deps.hardCeilingTurns ?? DEFAULT_HARD_CEILING_TURNS;
    const rawTurnTimeout = Number(this.deps.turnTimeoutMs ?? DEFAULT_SPECIALIST_TURN_TIMEOUT_MS);
    const turnTimeoutMs = Number.isFinite(rawTurnTimeout)
      ? Math.max(10, Math.min(MAX_SPECIALIST_TURN_TIMEOUT_MS, Math.floor(rawTurnTimeout)))
      : DEFAULT_SPECIALIST_TURN_TIMEOUT_MS;
    const filesInspected = new Set<string>();
    const filesChanged = new Set<string>(resumedFrom?.filesChanged ?? []);
    const evidenceIds: string[] = [];
    const blockers: string[] = [];
    let consecutiveNoProgress = 0;
    // Isolated from the parent and from other specialists: only this lane's
    // missing executable actions can stop this lane.
    let consecutiveNoAction = 0;
    let consecutiveErrors = 0;
    const malformed = new MalformedCallTracker({ remindAt: 1, escalateAt: 2, haltAt: 3 });
    let turnsUsed = 0;
    let recommendation = '';
    let stopReason: SpecialistStopReason = 'task_failed';
    let toolPolicyBlocked = false;
    let ledger: TaskLedger | undefined;
    let projectScope = '';

    try {
      const guard = ProjectGuard.detect(workRoot);
      projectScope = guard.lock.name;
      ledger = TaskLedger.create({
        repoRoot: workRoot,
        goal: `[subagent:${name}] ${task.slice(0, 120)}`,
        project: guard.lock,
        mode: 'fast',
        activeSkills: selectedSkills.map((skill) => skill.name),
      });
      ledger.setSelectedSkills(selectedSkills);
      for (const identity of selectedSkills) {
        ledger.recordSkillEvent({ stage: 'selected', name: identity.name, version: identity.version, contentHash: identity.contentHash, scope: identity.scope, specialist: name, reason: recoveredCheckpoint ? 'checkpoint skill state matched' : 'specialist contextual selection' });
      }
      const evidenceEngine = new EvidenceEngine();
      if (rawCriteria && rawCriteria.length > 0) {
        const specs = EvidenceEngine.normalizeCriteria(rawCriteria);
        ledger.setCriteriaFromSpecs(specs);
      }
      ledger.setStatus('executing');
      const policy = new PolicyEngine(false);
      const executor = new Executor(guard, ledger, policy, new LoopDetector(), (e) => emit(`subagent ${name}: ${e}`), specialistSkills);

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
        { role: 'system', content: this.specialistSystemPrompt(name, role, guard.lock.repoRoot, Boolean(wt), criteriaList, job.spec.agent, guard.lock.name) },
        { role: 'user', content: `TASK: ${task}${criteriaPrompt}` },
      ];
      if (handoff) {
        messages.push({ role: 'user', content: renderSpecialistHandoff(handoff) });
      }
      const activeSkillBodies = selectedSkills
        .map((identity) => specialistSkills.get(identity.name))
        .filter((skill): skill is NonNullable<typeof skill> => Boolean(skill))
        .map((skill) => `ACTIVE SKILL ${skill.name}@${String(skill.version ?? '1')}\n${skill.instructions}`)
        .join('\n\n');
      messages.push({
        role: 'user',
        content: `AVAILABLE SKILLS (metadata only)\n${specialistSkills.renderForPrompt(selectedSkills.map((skill) => skill.name), { maxSkills: 8 })}${activeSkillBodies ? `\n\n${activeSkillBodies}` : ''}`,
      });
      if (resumedFrom) {
        // Wake-where-it-left-off briefing so the specialist does not redo or
        // clobber the earlier attempt's committed work.
        const priorFiles = resumedFrom.filesChanged.length
          ? resumedFrom.filesChanged.map((f) => `  - ${f}`).join('\n')
          : '  (none recorded)';
        messages.push({
          role: 'user',
          content:
            (resumeState === 'RESUME_WITH_CHANGES'
              ? `RESUME MODE: Git verified that a previous attempt's edits are present on the current branch.\nPreviously changed files:\n${priorFiles}\n`
              : resumeState === 'RESUME_WITH_UNCHECKPOINTED_CHANGES'
                ? `RESUME MODE: Git found edits written after the last checkpoint. They are durable in this isolated worktree but were not previously recorded; inspect them before continuing.\nDiscovered files:\n${priorFiles}\n`
              : `RESUME MODE: the previous attempt has durable task context, but Git verified NO edited files to recover. Do not claim otherwise.\n`) +
            `Previous attempt's last status:\n${resumedFrom.summary.slice(0, 1200)}\n` +
            (job.spec.resume?.note ? `Orchestrator note: ${job.spec.resume.note}\n` : '') +
            `First inspect current state, then CONTINUE from where it stopped toward completing the task and its criteria. Do not claim recovered edits unless they are listed above.`,
        });
      }
      // Mid-run checkpoints: commit accumulated product changes on the branch
      // after every turn that touched new files, so even a hard stop leaves a
      // recoverable trail instead of losing everything.
      let checkpointedFiles = filesChanged.size;
      const checkpoint = async (label: string, lastSuccessfulAction?: string): Promise<void> => {
        if (!wt) return;
        try {
          if (isGitRepo(wt.root)) {
            const dirty = await gitExec(wt.root, ['status', '--porcelain']);
            if (dirty.trim()) {
              // Same .hermes exclusion as the final merge staging — private agent
              // state must never leak into committed product branches.
              await gitExec(wt.root, ['add', '-A', '--', ':(exclude).hermes']);
              const staged = await gitExec(wt.root, ['diff', '--cached', '--name-only']).catch(() => '');
              if (staged.trim()) {
                const ident = await this.identityArgs(repoRoot);
                await gitExec(wt.root, [...ident, 'commit', '-m', `subagent ${name}: checkpoint (${label})`.slice(0, 180), '--no-verify']);
                emit(`subagent ${name} checkpoint (${label}) committed`);
              }
            }
          }
          const saved = await this.persistCheckpoint({
            repoRoot,
            job,
            wt,
            currentTurn: turnsUsed,
            filesChanged,
            selectedSkills,
            lastSuccessfulAction,
            resumable: true,
          });
          filesChanged.clear();
          for (const file of saved.changedFiles) filesChanged.add(file);
          checkpointedFiles = filesChanged.size;
          resumeState = saved.resumeStatus;
        } catch (err) {
          // A failed database checkpoint must not leave a branch invisible.
          // Preserve a per-job emergency record; it is imported by the next
          // healthy runner before any resume claims are made.
          try {
            const emergency = await this.persistEmergencyRecovery({
              repoRoot,
              job,
              wt,
              currentTurn: turnsUsed,
              filesChanged,
              selectedSkills,
              summary: `Checkpoint ${label} could not be written to SQLite: ${(err as Error).message}`,
              stopReason,
            });
            filesChanged.clear();
            for (const file of emergency.filesChanged) filesChanged.add(file);
            checkpointedFiles = filesChanged.size;
            resumeState = emergency.resumeStatus;
            emit(`subagent ${name} — checkpoint ${label} saved to emergency recovery file`);
          } catch (recoveryErr) {
            emit(`subagent ${name} — checkpoint ${label} and emergency recovery both failed: ${(recoveryErr as Error).message}`);
          }
        }
      };

      for (let turn = 0; turn < turnBudget; turn++) {
        turnsUsed = turn + 1;
        job.turn = turnsUsed;
        emit(`subagent ${name} [running] ${job.id} — turn ${turnsUsed}/${turnBudget}`);
        const reply = await completeSpecialistTurn(
          llm,
          messages,
          { effort: this.deps.agentEffort?.(name) },
          job.abortController.signal,
          turnTimeoutMs,
        );
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
          consecutiveNoAction += 1;
          if (consecutiveNoAction >= 3) {
            blockers.push(`Specialist lane stopped after ${consecutiveNoAction} consecutive replies without a valid action`);
            status = filesInspected.size > 0 || filesChanged.size > 0 ? 'PARTIAL_SUCCESS' : 'BLOCKED';
            recommendation = 'Return structured JSON actions (tool_call / claim_criterion / answer) each turn.';
            emit(`subagent ${name} — loop/stagnation detected, stopping early`);
            break;
          }
          messages.push({ role: 'user', content: 'Reply with exactly one JSON action object.' });
          continue;
        }
        consecutiveNoAction = 0;
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
            for (const identity of ledger.data.usedSkillIdentities ?? []) {
              ledger.recordSkillEvent({ stage: 'verified', name: identity.name, version: identity.version, contentHash: identity.contentHash, scope: identity.scope, specialist: name, reason: `criterion ${critId} accepted` });
            }
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
          stopReason = 'completed';
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
            if (toolName === 'use_skill') {
              const skillName = String(params['name'] ?? '');
              const identity = specialistSkills.identity(skillName);
              if (identity) {
                ledger.addUsedSkill(identity.name, identity);
                ledger.recordSkillEvent({ stage: 'loaded', name: identity.name, version: identity.version, contentHash: identity.contentHash, scope: identity.scope, specialist: name, reason: 'explicit use_skill', loadChars: specialistSkills.get(skillName)?.instructions.length });
                ledger.recordSkillEvent({ stage: 'applied', name: identity.name, version: identity.version, contentHash: identity.contentHash, scope: identity.scope, specialist: name, reason: 'use_skill tool completed' });
              }
            }
            // New product files on disk → commit a checkpoint NOW so a later
            // timeout/stall can never lose this work.
            if (toolName === 'write_file' || toolName === 'apply_edit' || filesChanged.size > checkpointedFiles) {
              await checkpoint('progress', toolName);
            }
          } else {
            consecutiveErrors += 1;
            consecutiveNoProgress += 1;
            if (/\b(policy|permission|denied|not allowed)\b/i.test(`${outcome.result.errorSignature ?? ''}\n${outcome.result.output ?? ''}`)) {
              toolPolicyBlocked = true;
            }
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
        if (type === 'publish_finding') {
          // Mid-run finding publication (review: share knowledge, not
          // context). The finding enters the pipeline as a MISSION-SCOPE
          // CANDIDATE — publishing never makes it durable, and the
          // specialist's conversation stays private.
          const content = String(action['content'] ?? '').trim();
          if (!content) {
            messages.push({ role: 'user', content: 'publish_finding requires non-empty "content".' });
            continue;
          }
          if (!this.deps.memory) {
            messages.push({ role: 'user', content: 'No memory store is connected — the finding could not be published. Continue working.' });
            continue;
          }
          const findingType = (['fact', 'observation', 'failure', 'lesson'].includes(String(action['findingType'])) ? String(action['findingType']) : 'observation') as MemoryType;
          try {
            const finding = this.deps.memory.publishFinding({
              agentId: name,
              missionId: this.deps.missionId,
              projectId: projectScope,
              scope: projectScope,
              type: findingType,
              content: `${name}: ${content.slice(0, 280)}`,
              evidence: action['evidence'] ? String(action['evidence']).slice(0, 200) : undefined,
              confidence: Number.isFinite(Number(action['confidence'])) ? Math.min(1, Math.max(0, Number(action['confidence']))) : 0.6,
            });
            emit(`subagent ${name} published finding ${finding.id} to the mission (candidate — needs verification)`);
            messages.push({
              role: 'user',
              content: `Finding published to the mission as a CANDIDATE (${finding.id}). Other specialists may see it, but it is not yet verified knowledge — keep working.`,
            });
            consecutiveNoProgress = 0;
          } catch (err) {
            messages.push({ role: 'user', content: `Finding publication failed: ${(err as Error).message.slice(0, 160)}. Continue working.` });
          }
          continue;
        }
        consecutiveNoAction += 1;
        if (consecutiveNoAction >= 3) {
          blockers.push(`Specialist lane stopped after ${consecutiveNoAction} consecutive unknown actions`);
          status = filesInspected.size > 0 || filesChanged.size > 0 ? 'PARTIAL_SUCCESS' : 'BLOCKED';
          recommendation = 'Return structured JSON actions (tool_call / claim_criterion / answer) each turn.';
          emit(`subagent ${name} — loop/stagnation detected, stopping early`);
          break;
        }
        messages.push({ role: 'user', content: 'Unknown action. Use tool_call, claim_criterion, or answer.' });
      }

      if (!ok && toolPolicyBlocked) stopReason = 'tool_policy_block';
      else if (!ok && turnsUsed >= turnBudget) stopReason = 'turn_budget_exhausted';
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
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const cancelled = job.abortController.signal.aborted;
      const hasProgress = filesInspected.size > 0 || filesChanged.size > 0;
      ok = false;
      status = cancelled ? 'CANCELLED' : hasProgress ? 'PARTIAL_SUCCESS' : 'FAILED';
      stopReason = this.classifyStopReason(err, cancelled);
      blockers.push(cancelled ? (job.cancelReason ?? abortReason(job.abortController.signal, 'Specialist cancelled.')) : message);
      recommendation = cancelled
        ? 'Resume this specialist from its preserved worktree when ready.'
        : /timed out/i.test(message)
          ? 'Retry or resume the specialist; its model turn exceeded the watchdog timeout.'
          : 'Retry the specialist task with clearer instructions; the previous run crashed.';
      summary = [
        `SPECIALIST ${cancelled ? 'CANCELLED' : 'FAILED'}`,
        `Agent: ${name}`,
        `Turns: ${turnsUsed}/${turnBudget}`,
        `Reason: ${cancelled ? (job.cancelReason ?? message) : message}`,
        `Recommendation: ${recommendation}`,
      ].join('\n');
      try {
        ledger?.setStatus('blocked');
      } catch {
        /* Failure reporting must not be blocked by a damaged private ledger. */
      }
      emit(
        cancelled
          ? `subagent ${name} — cancelled: ${job.cancelReason ?? message}`
          : `subagent ${name} — stopped: ${message.slice(0, 180)}`,
      );
    } finally {
      if (wt) {
        if (ok) {
          const reconciled = await this.reconcileWorktree(wt, repoRoot, name, task);
          summary = reconciled.summary;
          ok = reconciled.ok;
          if (!ok) {
            status = 'FAILED';
            stopReason = 'task_failed';
          }
          if (reconciled.ok) {
            // Fully delivered → nothing to retain.
            try {
              checkpointStore.markCompleted(logicalJobId, summary);
            } catch (err) {
              // The product merge is already durable on the main branch. Do
              // not report it as lost merely because cleanup metadata raced.
              emit(`subagent ${name} — merge succeeded but completion checkpoint cleanup failed: ${(err as Error).message}`);
            }
            this.clearEmergencyRecovery(repoRoot, logicalJobId);
            await this.removeWorktree(wt, repoRoot);
          } else {
            // Merge conflict path already preserves the branch — register it
            // so the orchestrator can resume instead of losing the attempt.
            try {
              const saved = await this.persistCheckpoint({
                repoRoot,
                job,
                wt,
                currentTurn: turnsUsed,
                filesChanged,
                selectedSkills,
                summary,
                stopReason,
                resumable: true,
              });
              filesChanged.clear();
              for (const file of saved.changedFiles) filesChanged.add(file);
              resumeState = saved.resumeStatus;
            } catch (err) {
              const emergency = await this.persistEmergencyRecoverySafely({
                repoRoot,
                job,
                wt,
                currentTurn: turnsUsed,
                filesChanged,
                selectedSkills,
                summary: `${summary}\n\nSQLite checkpoint failed after merge rejection: ${(err as Error).message}`,
                stopReason,
              }, emit, name, 'merge-rejection checkpoint');
              if (emergency) {
                filesChanged.clear();
                for (const file of emergency.filesChanged) filesChanged.add(file);
                resumeState = emergency.resumeStatus;
                summary += `\n\nRECOVERY FILE PRESERVED for branch ${wt.branch}; the worktree remains resumable.`;
              }
            }
          }
        } else {
          // Model/provider/process failures remain resumable even before the
          // first edit. That is a context-only recovery, never a false claim
          // that code was preserved.
          const infrastructureStop = stopReason === 'model_transport_failure' || stopReason === 'model_timeout' || stopReason === 'process_interrupted';
          const hasProduct = filesChanged.size > 0;
          const shouldRetain = hasProduct || infrastructureStop;
          if (shouldRetain) {
            let saved: Pick<SpecialistCheckpoint, 'changedFiles' | 'resumeStatus'> | undefined;
            try {
              saved = await this.persistCheckpoint({
                repoRoot,
                job,
                wt,
                currentTurn: turnsUsed,
                filesChanged,
                selectedSkills,
                summary: summary || 'stopped early',
                stopReason,
                resumable: true,
              });
            } catch (err) {
              const emergency = await this.persistEmergencyRecoverySafely({
                repoRoot,
                job,
                wt,
                currentTurn: turnsUsed,
                filesChanged,
                selectedSkills,
                summary: `${summary || 'stopped early'}\n\nSQLite checkpoint failed: ${(err as Error).message}`,
                stopReason,
              }, emit, name, 'final checkpoint');
              saved = emergency
                ? { changedFiles: emergency.filesChanged, resumeStatus: emergency.resumeStatus ?? 'RESUME_CONTEXT_ONLY' }
                : undefined;
            }
            if (saved) {
              filesChanged.clear();
              for (const file of saved.changedFiles) filesChanged.add(file);
              resumeState = saved.resumeStatus;
            }
            // Do not turn tool bookkeeping into a durability claim when both
            // checkpoint stores failed. The branch is still left untouched,
            // but recovery must be described as context-only until Git facts
            // can be recorded by a healthy process.
            const recoveredState = saved?.resumeStatus ?? 'RESUME_CONTEXT_ONLY';
            const hint = recoveredState === 'RESUME_WITH_CHANGES'
              ? `WORK PRESERVED: DURABLE CHANGES VERIFIED on branch ${wt.branch} (${filesChanged.size} file(s)) — resume with delegate {"tasks":[{"agent":"${name}","task":"…","resume":{"jobId":"${logicalJobId}"}}]}`
              : `RESUME CONTEXT ONLY on branch ${wt.branch} — no durable edited files were verified; resume with delegate {"tasks":[{"agent":"${name}","task":"…","resume":{"jobId":"${logicalJobId}"}}]}`;
            emit(`subagent ${name} [paused] ${job.id} — ${hint}`);
            summary = `${summary}\n\nPAUSED AFTER ${turnsUsed}/${turnBudget} TURNS. ${hint}`;
          } else {
            emit(`subagent ${name} — no product changes to keep — discarding worktree`);
            const checkpoint = checkpointStore.get(logicalJobId);
            if (checkpoint) checkpointStore.upsert({ ...checkpoint, stopReason, resumable: false, summary });
            await this.removeWorktree(wt, repoRoot);
          }
        }
      }
    }

    // Cross-specialist findings (review Phase 12): a completed specialist's
    // result summary enters the memory pipeline as a MISSION-SCOPE CANDIDATE
    // — visible to the mission's specialists, never auto-durable. Verified
    // specialists publish with browser/test evidence when they have it.
    if (this.deps.memory && summary && (status === 'SUCCESS' || status === 'PARTIAL_SUCCESS')) {
      try {
        this.deps.memory.publishFinding({
          agentId: name,
          missionId: this.deps.missionId,
          projectId: projectScope,
          scope: projectScope,
          type: status === 'SUCCESS' ? 'task_result' : 'observation',
          content: `${name} (${role ?? 'specialist'}): ${summary.slice(0, 300)}`,
          evidence: filesChanged.size > 0 ? `files: ${[...filesChanged].slice(0, 6).join(', ')}` : undefined,
          confidence: status === 'SUCCESS' ? 0.7 : 0.55,
          sourceType: 'task_completion',
        });
      } catch {
        /* finding publication must never break the specialist result */
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
      resumableJobId: this.hasResumableRecovery(repoRoot, logicalJobId) ? logicalJobId : undefined,
      logicalJobId,
      executionAttempt: job.executionAttempt,
      resumeState: recoveryState ?? resumeState,
      skillState,
      stopReason,
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

  /** Legacy migration input. New checkpoints are authoritative in SQLite. */
  private pausedIndexPath(repoRoot: string): string {
    return path.join(repoRoot, '.hermes', 'paused-specialists.json');
  }

  private emergencyRecoveryPath(repoRoot: string, logicalJobId: string): string {
    // Job IDs are generated internally, but normalize defensively before
    // using one as a filename in the project's private recovery directory.
    const safeId = logicalJobId.replace(/[^\w.-]/g, '_');
    return path.join(repoRoot, '.hermes', 'specialist-recovery', `${safeId}.json`);
  }

  private loadPausedIndex(repoRoot: string): Record<string, RetainedWorktree> {
    try {
      const raw = JSON.parse(readFileSync(this.pausedIndexPath(repoRoot), 'utf8')) as Record<string, RetainedWorktree>;
      return raw && typeof raw === 'object' ? raw : {};
    } catch {
      return {};
    }
  }

  private loadEmergencyRecoveries(repoRoot: string): Record<string, RetainedWorktree> {
    const directory = path.join(repoRoot, '.hermes', 'specialist-recovery');
    let files: string[] = [];
    try {
      files = readdirSync(directory);
    } catch {
      return {};
    }
    const records: Record<string, RetainedWorktree> = {};
    for (const file of files) {
      if (!file.endsWith('.json')) continue;
      try {
        const raw = JSON.parse(readFileSync(path.join(directory, file), 'utf8')) as RetainedWorktree;
        if (!raw || typeof raw !== 'object' || !raw.root || !raw.branch || !raw.agent || !raw.task) continue;
        const logicalJobId = raw.logicalJobId || path.basename(file, '.json');
        records[logicalJobId] = raw;
      } catch {
        // One damaged emergency record must not hide other preserved work.
      }
    }
    return records;
  }

  private clearEmergencyRecovery(repoRoot: string, logicalJobId: string): void {
    this.emergencyRecoveries.delete(logicalJobId);
    const recoveryPath = this.emergencyRecoveryPath(repoRoot, logicalJobId);
    try {
      unlinkSync(recoveryPath);
    } catch {
      /* Best effort only; an old recovery record is harmless and ignored once completed. */
    }
    // A fully delivered specialist must leave no private state behind: when
    // this was the last record, prune the now-empty recovery directory too.
    // Other paused specialists keep theirs (rmdir fails on a non-empty dir).
    try {
      rmdirSync(path.dirname(recoveryPath));
    } catch {
      /* Directory still holds other records or is already gone. */
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
