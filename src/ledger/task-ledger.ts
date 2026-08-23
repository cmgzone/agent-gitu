import { readdirSync } from 'node:fs';
import path from 'node:path';
import type {
  AcceptanceCriterion,
  ActionRecord,
  ArchitectureDecision,
  CriterionSpec,
  DecisionBasis,
  PlanArea,
  PlanDesign,
  PlanStep,
  ProjectLock,
  TaskFinding,
  TaskLedgerData,
  TaskStatus,
} from '../types.js';

/** Raw step spec accepted by setPlan/appendPlan; bounded on ingest. */
export interface PlanStepInput {
  description: string;
  verification: string;
  area?: PlanArea;
  /** Raw todo texts for this step (≤8 kept, each ≤140 chars). */
  subtasks?: string[];
}

const STEP_LIMITS = { count: 30, description: 220, verification: 180, todosPerStep: 8, todoText: 140 } as const;

type NormalizedStep = Required<Pick<PlanStepInput, 'description' | 'verification'>> & Pick<PlanStepInput, 'area' | 'subtasks'>;

function normalizeStepInput(steps: PlanStepInput[]): NormalizedStep[] {
  return steps.map((s) => ({
    description: String(s.description ?? '').slice(0, STEP_LIMITS.description),
    verification: String(s.verification ?? '').slice(0, STEP_LIMITS.verification),
    ...(s.area ? { area: s.area } : {}),
    ...(Array.isArray(s.subtasks)
      ? { subtasks: s.subtasks.map((t) => String(t).slice(0, STEP_LIMITS.todoText)).filter(Boolean).slice(0, STEP_LIMITS.todosPerStep) }
      : {}),
  }));
}
import { gitExec } from '../git/git.js';
import { nowIso, readJson, shortId, writeJson } from '../util.js';

export class TaskLedger {
  readonly data: TaskLedgerData;

  private constructor(
    data: TaskLedgerData,
    private readonly file: string,
  ) {
    this.data = data;
  }

  static create(input: {
    repoRoot: string;
    goal: string;
    project: ProjectLock;
    mode: 'fast' | 'standard' | 'chat';
    gitBranch?: string;
    worktreePath?: string;
    activeSkills?: string[];
  }): TaskLedger {
    const taskId = shortId('hermes-task');
    const now = nowIso();
    const data: TaskLedgerData = {
      schemaVersion: 1,
      taskId,
      goal: input.goal,
      status: 'intake',
      mode: input.mode,
      project: input.project,
      gitBranch: input.gitBranch ?? input.project.branch,
      worktreePath: input.worktreePath,
      activeSkills: input.activeSkills ?? [],
      usedSkills: [],
      acceptanceCriteria: [],
      constraints: [],
      nonGoals: [],
      plan: [],
      actions: [],
      evidence: [],
      filesChanged: [],
      checkpoints: [],
      blockers: [],
      createdAt: now,
      updatedAt: now,
    };
    const file = path.join(input.repoRoot, '.hermes', 'tasks', `${taskId}.json`);
    const ledger = new TaskLedger(data, file);
    ledger.save();
    return ledger;
  }

  static load(repoRoot: string, taskId: string): TaskLedger | undefined {
    const file = path.join(repoRoot, '.hermes', 'tasks', `${taskId}.json`);
    const data = readJson<TaskLedgerData>(file);
    if (!data) return undefined;
    return new TaskLedger(data, file);
  }

  static list(repoRoot: string): TaskLedger[] {
    const dir = path.join(repoRoot, '.hermes', 'tasks');
    try {
      return readdirSync(dir)
        .filter((f) => f.endsWith('.json'))
        .map((f) => TaskLedger.load(repoRoot, f.replace(/\.json$/, '')))
        .filter((t): t is TaskLedger => t !== undefined)
        .sort((a, b) => b.data.createdAt.localeCompare(a.data.createdAt));
    } catch {
      return [];
    }
  }

  save(): void {
    this.data.updatedAt = nowIso();
    writeJson(this.file, this.data);
  }

  setStatus(status: TaskStatus): void {
    this.data.status = status;
    if (status === 'executing' && !this.data.startedAt) this.data.startedAt = nowIso();
    if (status === 'completed' || status === 'failed' || status === 'aborted' || status === 'blocked') {
      this.data.completedAt = nowIso();
    }
    this.save();
  }

  setCriteria(texts: string[]): void {
    this.data.acceptanceCriteria = texts.map((text, i) => ({
      id: `ac-${i + 1}`,
      text,
      evidenceIds: [],
      satisfied: false,
    }));
    this.save();
  }

  setCriteriaFromSpecs(specs: CriterionSpec[]): void {
    this.data.acceptanceCriteria = specs.map((spec, i) => ({
      id: `ac-${i + 1}`,
      text: spec.text,
      verification: spec.verification,
      evidenceType: spec.evidenceType,
      evidenceIds: [],
      satisfied: false,
    }));
    this.save();
  }

  /**
   * Extend a completed task with a new, follow-up scope without discarding
   * the criteria and evidence that made the earlier work complete.
   */
  appendCriteria(texts: string[]): AcceptanceCriterion[] {
    const known = new Set(this.data.acceptanceCriteria.map((c) => c.text.trim().replace(/\s+/g, ' ').toLowerCase()));
    const next = this.data.acceptanceCriteria.reduce((max, c) => {
      const match = /^ac-(\d+)$/.exec(c.id);
      return Math.max(max, match ? Number(match[1]) : 0);
    }, 0);
    const added: AcceptanceCriterion[] = [];
    for (const raw of texts) {
      const text = raw.trim().replace(/\s+/g, ' ');
      const key = text.toLowerCase();
      if (!text || known.has(key)) continue;
      known.add(key);
      added.push({
        id: 'ac-' + (next + added.length + 1),
        text,
        evidenceIds: [],
        satisfied: false,
      });
    }
    if (added.length > 0) {
      this.data.acceptanceCriteria.push(...added);
      this.save();
    }
    return added;
  }

  setPlan(steps: PlanStepInput[]): void {
    const normalized = normalizeStepInput(steps).slice(0, STEP_LIMITS.count);
    this.data.plan = normalized.map((s, i) => ({
      id: `step-${i + 1}`,
      description: s.description,
      verification: s.verification,
      status: 'pending' as const,
      attempts: 0,
      ...(s.area ? { area: s.area } : {}),
      ...(s.subtasks && s.subtasks.length > 0
        ? { subtasks: s.subtasks.map((text) => ({ text, done: false })) }
        : {}),
    }));
    this.save();
  }

  /** Add plan steps for a follow-up scope, retaining completed plan history. */
  appendPlan(steps: PlanStepInput[]): PlanStep[] {
    const room = Math.max(0, STEP_LIMITS.count - this.data.plan.length);
    if (room === 0) return [];
    const next = this.data.plan.reduce((max, step) => {
      const match = /^step-(\d+)$/.exec(step.id);
      return Math.max(max, match ? Number(match[1]) : 0);
    }, 0);
    const added = normalizeStepInput(steps)
      .slice(0, room)
      .map((s, index) => ({
        id: 'step-' + (next + index + 1),
        description: s.description,
        verification: s.verification,
        status: 'pending' as const,
        attempts: 0,
        ...(s.area ? { area: s.area } : {}),
        ...(s.subtasks && s.subtasks.length > 0
          ? { subtasks: s.subtasks.map((text) => ({ text, done: false })) }
          : {}),
      }));
    if (added.length > 0) {
      this.data.plan.push(...added);
      this.save();
    }
    return added;
  }

  step(id: string): PlanStep | undefined {
    return this.data.plan.find((s) => s.id === id);
  }

  updateStep(id: string, patch: Partial<PlanStep>): void {
    const step = this.step(id);
    if (!step) return;
    Object.assign(step, patch);
    // Completing a step completes its todo breakdown — todos are execution
    // detail, not a second gate.
    if (patch.status === 'done' && step.subtasks) {
      for (const t of step.subtasks) t.done = true;
    }
    this.save();
  }

  /** Record compact design notes (bounded) for the current plan. */
  setPlanDesign(design: { frontend?: string; backend?: string; integration?: string }): void {
    const DESIGN_CAPS = { frontend: 1200, backend: 1200, integration: 800 } as const;
    const next: PlanDesign = {};
    let total = 0;
    for (const key of ['frontend', 'backend', 'integration'] as const) {
      const raw = design[key];
      if (!raw || !raw.trim()) continue;
      const text = raw.trim().slice(0, DESIGN_CAPS[key]);
      total += text.length;
      if (total > 3200) break;
      next[key] = text;
    }
    this.data.planDesign = next;
    this.save();
  }

  /**
   * Dynamic replanning: revise ONE step in place and record why. The original
   * intent stays reconstructable from the revision log; nothing else moves.
   */
  reviseStep(
    stepId: string,
    patch: { description?: string; verification?: string; area?: PlanArea; addSubtasks?: string[] },
    reason: string,
  ): PlanStep | undefined {
    const step = this.step(stepId);
    if (!step) return undefined;
    if (patch.description !== undefined) step.description = patch.description.slice(0, STEP_LIMITS.description);
    if (patch.verification !== undefined) step.verification = patch.verification.slice(0, STEP_LIMITS.verification);
    if (patch.area !== undefined) step.area = patch.area;
    if (patch.addSubtasks && patch.addSubtasks.length > 0) {
      step.subtasks ??= [];
      const room = Math.max(0, STEP_LIMITS.todosPerStep - step.subtasks.length);
      for (const text of patch.addSubtasks.slice(0, room)) {
        step.subtasks.push({ text: text.slice(0, STEP_LIMITS.todoText), done: false });
      }
    }
    this.data.planRevisions ??= [];
    this.data.planRevisions.push({ stepId, reason: reason.slice(0, 300), createdAt: nowIso() });
    if (this.data.planRevisions.length > 20) this.data.planRevisions.splice(0, this.data.planRevisions.length - 20);
    this.save();
    return step;
  }

  /** Flip one subtask's done state (todo-level progress during execution). */
  toggleSubtask(stepId: string, index: number, done?: boolean): boolean {
    const step = this.step(stepId);
    const subtask = step?.subtasks?.[index];
    if (!subtask) return false;
    subtask.done = done ?? !subtask.done;
    // Step status mirrors its todos in BOTH directions: all checked → done,
    // any unchecked → back to pending (unless a step was completed explicitly
    // without todos, which this branch never touches).
    if (step!.subtasks!.length > 0) {
      step!.status = step!.subtasks!.every((t) => t.done) ? 'done' : 'pending';
    }
    this.save();
    return true;
  }

  /** Aggregate plan/todo progress for the compact state line. */
  planProgress(): { stepsDone: number; stepsTotal: number; todosDone: number; todosTotal: number } {
    let stepsDone = 0;
    let todosDone = 0;
    let todosTotal = 0;
    for (const s of this.data.plan) {
      if (s.status === 'done') stepsDone += 1;
      if (s.subtasks) {
        for (const t of s.subtasks) {
          todosTotal += 1;
          if (t.done) todosDone += 1;
        }
      }
    }
    return { stepsDone, stepsTotal: this.data.plan.length, todosDone, todosTotal };
  }
  recordAction(action: Omit<ActionRecord, 'id' | 'createdAt'>): ActionRecord {
    const record: ActionRecord = { ...action, id: shortId('act'), createdAt: nowIso() };
    this.data.actions.push(record);
    this.save();
    return record;
  }

  trackFile(relPath: string): void {
    if (!this.data.filesChanged.includes(relPath)) {
      this.data.filesChanged.push(relPath);
      this.save();
    }
  }

  addCheckpoint(stepId: string, ref: string): void {
    this.data.checkpoints.push({ stepId, ref, createdAt: nowIso() });
    this.save();
  }

  addBlocker(reason: string): void {
    this.data.blockers.push(reason);
    this.save();
  }

  setActiveSkills(skills: string[]): void {
    this.data.activeSkills = [...new Set(skills)];
    this.save();
  }

  addUsedSkill(skill: string): void {
    const list = this.data.usedSkills ?? [];
    if (!list.includes(skill)) {
      list.push(skill);
      this.data.usedSkills = list;
      this.save();
    }
  }

  /** Register a discovered problem. Dedupes on normalized claim text. */
  addFinding(finding: Omit<TaskFinding, 'id' | 'createdAt' | 'status' | 'evidenceIds'>): TaskFinding {
    this.data.findings ??= [];
    const key = finding.claim.trim().replace(/\s+/g, ' ').toLowerCase();
    const existing = this.data.findings.find((f) => f.claim.trim().replace(/\s+/g, ' ').toLowerCase() === key);
    if (existing) return existing;
    const record: TaskFinding = {
      ...finding,
      id: shortId('finding'),
      status: 'unverified',
      evidenceIds: [],
      createdAt: nowIso(),
    };
    this.data.findings.push(record);
    this.save();
    return record;
  }

  finding(id: string): TaskFinding | undefined {
    return this.data.findings?.find((f) => f.id === id);
  }

  updateFinding(id: string, patch: Partial<Pick<TaskFinding, 'status' | 'evidenceIds' | 'verifierSummary'>>): TaskFinding | undefined {
    const finding = this.finding(id);
    if (!finding) return undefined;
    Object.assign(finding, patch);
    this.save();
    return finding;
  }

  /**
   * Record a compact architecture/technology decision. When `supersedes` is
   * provided (or a single active decision exists), the prior decision is
   * marked superseded — architecture drift must always be explicit, never
   * silent.
   */
  recordArchitectureDecision(input: {
    decision: string;
    alternatives: string[];
    repoEvidence: string;
    requirements: string[];
    rejected: { alternative: string; reason: string }[];
    reconsiderIf?: string;
    basis: DecisionBasis;
    supersedes?: string;
  }): ArchitectureDecision {
    this.data.architectureDecisions ??= [];
    const target = input.supersedes ?? (this.activeArchitectureDecisions().length === 1 ? this.activeArchitectureDecisions()[0]!.id : undefined);
    if (target) {
      const prior = this.data.architectureDecisions.find((d) => d.id === target && d.status === 'active');
      if (prior) {
        prior.status = 'superseded';
        prior.supersededReason = `superseded by new decision: ${input.decision}`;
      }
    }
    const record: ArchitectureDecision = {
      id: shortId('ad'),
      decision: input.decision,
      alternatives: input.alternatives,
      repoEvidence: input.repoEvidence,
      requirements: input.requirements,
      rejected: input.rejected,
      reconsiderIf: input.reconsiderIf,
      basis: input.basis,
      status: 'active',
      createdAt: nowIso(),
    };
    this.data.architectureDecisions.push(record);
    this.save();
    return record;
  }

  activeArchitectureDecisions(): ArchitectureDecision[] {
    return (this.data.architectureDecisions ?? []).filter((d) => d.status === 'active');
  }

  /** Distinct recent failures (deduped by error signature) for the compact state. */
  failureSummary(max = 3): string[] {
    const seen = new Set<string>();
    const out: string[] = [];
    for (let i = this.data.actions.length - 1; i >= 0 && out.length < max; i--) {
      const a = this.data.actions[i]!;
      if (a.status !== 'error') continue;
      const key = a.errorSignature ?? a.paramsSummary;
      if (seen.has(key)) continue;
      seen.add(key);
      const obs = a.observation ? ` → ${a.observation.slice(0, 140)}` : '';
      out.push(`${a.paramsSummary}${obs}`);
    }
    return out;
  }

  /** The next plan step the agent should work on, for the compact state. */
  nextStep(): PlanStep | undefined {
    return this.data.plan.find((s) => s.status === 'pending' || s.status === 'in_progress');
  }

  async validateEnvironment(cwd: string): Promise<{ ok: boolean; reason?: string }> {
    const expected = this.data.worktreePath || this.data.project.repoRoot;
    const normCwd = path.resolve(cwd).toLowerCase();
    const normExpected = path.resolve(expected).toLowerCase();
    if (normCwd !== normExpected) {
      return {
        ok: false,
        reason: `Environment path mismatch: task expected "${expected}", but current working directory is "${cwd}".`,
      };
    }
    if (this.data.gitBranch) {
      const current = await gitExec(cwd, ['rev-parse', '--abbrev-ref', 'HEAD']).catch(() => '');
      if (current.trim() && current.trim() !== this.data.gitBranch) {
        return {
          ok: false,
          reason: `Branch mismatch: task is bound to branch "${this.data.gitBranch}", but the working tree is on "${current.trim()}".`,
        };
      }
    }
    return { ok: true };
  }

  transcriptTail(maxActions = 8): string {
    const tail = this.data.actions.slice(-maxActions);
    if (tail.length === 0) return '(no actions yet)';
    return tail
      .map((a) => {
        const obs = a.observation ? ` → ${a.observation.slice(0, 300)}` : '';
        return `[${a.status}] ${a.paramsSummary}${obs}`;
      })
      .join('\n');
  }
}
