import { readdirSync } from 'node:fs';
import path from 'node:path';
import type {
  AcceptanceCriterion,
  ActionRecord,
  ArchitectureDecision,
  BudgetExtensionRecord,
  CriterionSpec,
  DecisionBasis,
  FollowUpRecord,
  InvestigationDepth,
  PlanArea,
  PlanDesign,
  PlanStep,
  PrerequisiteRecoveryRecord,
  ProjectLock,
  TargetHints,
  TaskAuthority,
  TaskFinding,
  TaskLedgerData,
  TaskStatus,
  SkillLifecycleEvent,
  UserInstruction,
  VisualReference,
  WorkPhase,
  WorkPhaseKind,
} from '../types.js';
import type { SkillIdentity } from '../skills/skills.js';

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
      ? {
          subtasks: s.subtasks
            .map((t) => String(t).slice(0, STEP_LIMITS.todoText))
            .filter(Boolean)
            .slice(0, STEP_LIMITS.todosPerStep),
        }
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
    this.ensureTaskAuthority();
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
      taskAuthority: {
        originalGoal: input.goal,
        currentGoal: input.goal,
        instructionEpoch: 0,
        instructions: [],
        followUps: [],
        visualReferences: [],
        targetHints: {
          files: [],
          symbols: [],
          errors: [],
        },
      },
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

  ensureTaskAuthority(): TaskAuthority {
    if (!this.data.taskAuthority) {
      this.data.taskAuthority = {
        originalGoal: this.data.goal,
        currentGoal: this.data.goal,
        instructionEpoch: 0,
        instructions: [],
        followUps: [],
        visualReferences: [],
        targetHints: {
          files: [],
          symbols: [],
          errors: [],
        },
      };
    }
    // Hydrate ledgers created before the epoch field existed.
    if (typeof this.data.taskAuthority.instructionEpoch !== 'number') {
      this.data.taskAuthority.instructionEpoch = 0;
    }
    return this.data.taskAuthority;
  }

  get instructionEpoch(): number {
    return this.ensureTaskAuthority().instructionEpoch;
  }

  /** Bump when a meaningful user correction/refinement/constraint changes
   *  active authority. In-flight specialist results launched under an older
   *  epoch become stale (history/evidence only). */
  bumpInstructionEpoch(reason: string): number {
    const auth = this.ensureTaskAuthority();
    auth.instructionEpoch += 1;
    this.save();
    return auth.instructionEpoch;
  }

  setCurrentGoal(goal: string, _basis?: string): void {
    const auth = this.ensureTaskAuthority();
    auth.currentGoal = goal;
    this.save();
  }

  setInvestigationDepth(depth: InvestigationDepth): void {
    this.data.investigationDepth = depth;
    this.save();
  }

  /** Escalate investigation ONE level (direct → local → dependency →
   *  subsystem → repository). Returns the new depth, or undefined when the
   *  ladder is already at the top. */
  escalateInvestigationDepth(): InvestigationDepth | undefined {
    const ladder: InvestigationDepth[] = ['direct', 'local', 'dependency', 'subsystem', 'repository'];
    const current = this.data.investigationDepth ?? 'local';
    const next = ladder[Math.min(ladder.length - 1, ladder.indexOf(current) + 1)];
    if (next === current) return undefined;
    this.data.investigationDepth = next;
    this.save();
    return next;
  }

  addInstruction(input: Omit<UserInstruction, 'id' | 'createdAt'> & { id?: string; createdAt?: string }): UserInstruction {
    const auth = this.ensureTaskAuthority();
    const id = input.id ?? shortId('inst');
    const now = input.createdAt ?? nowIso();
    const instruction: UserInstruction = {
      id,
      text: input.text,
      type: input.type,
      enforcement: input.enforcement,
      status: input.status ?? 'active',
      source: input.source ?? 'follow-up',
      supersedes: input.supersedes,
      ...(input.constraint ? { constraint: input.constraint } : {}),
      instructionEpoch: auth.instructionEpoch,
      createdAt: now,
    };
    if (instruction.supersedes?.length) {
      for (const supId of instruction.supersedes) {
        this.supersedeInstruction(supId, `Superseded by ${id}: "${instruction.text}"`);
      }
    }
    auth.instructions.push(instruction);
    this.save();
    return instruction;
  }

  supersedeInstruction(targetId: string, reason?: string): void {
    const auth = this.ensureTaskAuthority();
    const inst = auth.instructions.find((i) => i.id === targetId);
    if (inst) {
      inst.status = 'superseded';
      this.save();
    }
  }

  activeInstructions(): UserInstruction[] {
    const auth = this.ensureTaskAuthority();
    return auth.instructions.filter((i) => i.status === 'active');
  }

  hardInstructions(): UserInstruction[] {
    return this.activeInstructions().filter((i) => i.enforcement === 'hard');
  }

  recordFollowUp(followUp: Omit<FollowUpRecord, 'id' | 'timestamp'> & { id?: string; timestamp?: string }): FollowUpRecord {
    const auth = this.ensureTaskAuthority();
    const record: FollowUpRecord = {
      id: followUp.id ?? shortId('fu'),
      kind: followUp.kind,
      rawMessage: followUp.rawMessage,
      extractedGoalDelta: followUp.extractedGoalDelta,
      addedInstructions: followUp.addedInstructions ?? [],
      supersededInstructions: followUp.supersededInstructions ?? [],
      timestamp: followUp.timestamp ?? nowIso(),
    };
    auth.followUps.push(record);
    this.save();
    return record;
  }

  addVisualReference(ref: Omit<VisualReference, 'id' | 'createdAt'> & { id?: string; createdAt?: string }): VisualReference {
    const auth = this.ensureTaskAuthority();
    const visualRef: VisualReference = {
      id: ref.id ?? shortId('vref'),
      path: ref.path,
      sourceMessageId: ref.sourceMessageId,
      kind: ref.kind,
      status: ref.status ?? 'active',
      createdAt: ref.createdAt ?? nowIso(),
      pinned: ref.pinned,
    };
    auth.visualReferences.push(visualRef);
    this.save();
    return visualRef;
  }

  replaceVisualReference(oldId: string, newRef: Omit<VisualReference, 'id' | 'createdAt'> & { id?: string; createdAt?: string }): VisualReference {
    const auth = this.ensureTaskAuthority();
    const old = auth.visualReferences.find((v) => v.id === oldId);
    if (old) {
      old.status = 'superseded';
    }
    return this.addVisualReference(newRef);
  }

  activeVisualReferences(): VisualReference[] {
    const auth = this.ensureTaskAuthority();
    return auth.visualReferences.filter((v) => v.status === 'active');
  }

  setTargetHints(hints: Partial<TargetHints>): void {
    const auth = this.ensureTaskAuthority();
    if (hints.files) {
      const existing = new Set(auth.targetHints.files);
      for (const f of hints.files) existing.add(f);
      auth.targetHints.files = Array.from(existing);
    }
    if (hints.symbols) {
      const existing = new Set(auth.targetHints.symbols);
      for (const s of hints.symbols) existing.add(s);
      auth.targetHints.symbols = Array.from(existing);
    }
    if (hints.errors) {
      const existing = new Set(auth.targetHints.errors);
      for (const e of hints.errors) existing.add(e);
      auth.targetHints.errors = Array.from(existing);
    }
    this.save();
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

  /**
   * Spec-aware append for follow-up scopes: preserves each appendix's pinned
   * verification command + evidence type so delegated / parent re-verification
   * can run the real oracle later.
   */
  appendCriteriaFromSpecs(specs: CriterionSpec[]): AcceptanceCriterion[] {
    const known = new Set(this.data.acceptanceCriteria.map((c) => c.text.trim().replace(/\s+/g, ' ').toLowerCase()));
    const next = this.data.acceptanceCriteria.reduce((max, c) => {
      const match = /^ac-(\d+)$/.exec(c.id);
      return Math.max(max, match ? Number(match[1]) : 0);
    }, 0);
    const added: AcceptanceCriterion[] = [];
    for (const spec of specs) {
      const text = (spec.text ?? '').trim().replace(/\s+/g, ' ');
      const key = text.toLowerCase();
      if (!text || known.has(key)) continue;
      known.add(key);
      added.push({
        id: 'ac-' + (next + added.length + 1),
        text,
        verification: spec.verification,
        evidenceType: spec.evidenceType,
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
      ...(s.subtasks && s.subtasks.length > 0 ? { subtasks: s.subtasks.map((text) => ({ text, done: false })) } : {}),
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
        ...(s.subtasks && s.subtasks.length > 0 ? { subtasks: s.subtasks.map((text) => ({ text, done: false })) } : {}),
      }));
    if (added.length > 0) {
      this.data.plan.push(...added);
      this.save();
    }
    return added;
  }

  /** Replace only a small named slice of a plan (used by a follow-up plan
   * review). Earlier completed steps remain untouched. */
  replacePlanSteps(ids: string[], steps: PlanStepInput[]): PlanStep[] {
    const replacing = new Set(ids);
    const retained = this.data.plan.filter((step) => !replacing.has(step.id));
    const room = Math.max(0, STEP_LIMITS.count - retained.length);
    const next = retained.reduce((max, step) => {
      const match = /^step-(\d+)$/.exec(step.id);
      return Math.max(max, match ? Number(match[1]) : 0);
    }, 0);
    const replacement = normalizeStepInput(steps)
      .slice(0, room)
      .map((step, index) => ({
        id: 'step-' + (next + index + 1),
        description: step.description,
        verification: step.verification,
        status: 'pending' as const,
        attempts: 0,
        ...(step.area ? { area: step.area } : {}),
        ...(step.subtasks && step.subtasks.length > 0 ? { subtasks: step.subtasks.map((text) => ({ text, done: false })) } : {}),
      }));
    this.data.plan = [...retained, ...replacement];
    this.save();
    return replacement;
  }

  /** Return the current work phase, if this ledger has been phase-enabled. */
  activeWorkPhase(): WorkPhase | undefined {
    const id = this.data.activeWorkPhaseId;
    return id ? this.data.workPhases?.find((phase) => phase.id === id) : undefined;
  }

  /**
   * Add phase tracking to new and older ledgers without changing their
   * contents. The initial phase deliberately begins at index zero: historical
   * task evidence stays attributable to the work that originally produced it.
   */
  ensureInitialWorkPhase(goal = this.data.goal, baseRef?: string): WorkPhase {
    const existing = this.data.workPhases?.find((phase) => phase.kind === 'initial');
    if (existing) {
      if (!this.data.activeWorkPhaseId) {
        this.data.activeWorkPhaseId = existing.id;
        this.save();
      }
      return existing;
    }
    const phase: WorkPhase = {
      id: 'phase-1',
      kind: 'initial',
      goal: goal.trim().slice(0, 1_500) || this.data.goal,
      startedAt: this.data.startedAt ?? this.data.createdAt,
      ...(baseRef?.trim() ? { baseRef: baseRef.trim() } : {}),
      evidenceStartIndex: 0,
      actionStartIndex: 0,
      fileStartIndex: 0,
      priorCriterionIds: [],
      priorPlanStepIds: [],
    };
    this.data.workPhases = [phase];
    this.data.activeWorkPhaseId = phase.id;
    this.save();
    return phase;
  }

  /** Start a distinct follow-up scope while preserving all earlier work. */
  startWorkPhase(input: { kind: WorkPhaseKind; goal: string; baseRef?: string }): WorkPhase {
    const phases = this.data.workPhases ?? [];
    const phase: WorkPhase = {
      id: `phase-${phases.length + 1}`,
      kind: input.kind,
      goal: input.goal.trim().slice(0, 1_500) || this.data.goal,
      startedAt: nowIso(),
      ...(input.baseRef?.trim() ? { baseRef: input.baseRef.trim() } : {}),
      evidenceStartIndex: this.data.evidence.length,
      actionStartIndex: this.data.actions.length,
      fileStartIndex: this.data.filesChanged.length,
      priorCriterionIds: this.data.acceptanceCriteria.map((criterion) => criterion.id),
      priorPlanStepIds: this.data.plan.map((step) => step.id),
    };
    this.data.workPhases = [...phases, phase];
    this.data.activeWorkPhaseId = phase.id;
    this.save();
    return phase;
  }

  /** Mark the active phase complete without erasing its durable baseline. */
  completeActiveWorkPhase(): void {
    const phase = this.activeWorkPhase();
    if (!phase || phase.completedAt) return;
    phase.completedAt = nowIso();
    this.save();
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
  reviseStep(stepId: string, patch: { description?: string; verification?: string; area?: PlanArea; addSubtasks?: string[] }, reason: string): PlanStep | undefined {
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

  /** Audit a granted budget extension: reason + evidence snapshot (cap 10). */
  addBudgetExtension(record: Omit<BudgetExtensionRecord, 'at'>): void {
    this.data.budgetExtensions ??= [];
    this.data.budgetExtensions.push({ ...record, at: nowIso() });
    if (this.data.budgetExtensions.length > 10) this.data.budgetExtensions.splice(0, this.data.budgetExtensions.length - 10);
    this.save();
  }

  setActiveSkills(skills: string[]): void {
    this.data.activeSkills = [...new Set(skills)];
    this.save();
  }

  /** Persist the exact selected instruction identities alongside legacy names. */
  setSelectedSkills(skills: SkillIdentity[]): void {
    const byName = new Map<string, SkillIdentity>();
    for (const skill of skills) byName.set(skill.name.toLowerCase(), skill);
    this.data.selectedSkills = [...byName.values()];
    this.data.activeSkills = this.data.selectedSkills.map((skill) => skill.name);
    this.save();
  }

  addUsedSkill(skill: string, identity?: SkillIdentity): void {
    const list = this.data.usedSkills ?? [];
    if (!list.includes(skill)) {
      list.push(skill);
      this.data.usedSkills = list;
    }
    if (identity) {
      const identities = this.data.usedSkillIdentities ?? [];
      if (
        !identities.some(
          (entry) => entry.name === identity.name && entry.version === identity.version && entry.contentHash === identity.contentHash && entry.scope === identity.scope,
        )
      ) {
        identities.push(identity);
        this.data.usedSkillIdentities = identities;
      }
    }
    this.save();
  }

  recordSkillEvent(event: Omit<SkillLifecycleEvent, 'createdAt'>): void {
    const events = this.data.skillEvents ?? [];
    events.push({ ...event, createdAt: nowIso() });
    if (events.length > 200) events.splice(0, events.length - 200);
    this.data.skillEvents = events;
    this.save();
  }

  /** Persist prerequisite recovery attempts without ever retaining secret values. */
  recordPrerequisiteRecovery(event: Omit<PrerequisiteRecoveryRecord, 'createdAt'>): void {
    const records = this.data.prerequisiteRecoveries ?? [];
    records.push({ ...event, createdAt: nowIso() });
    if (records.length > 120) records.splice(0, records.length - 120);
    this.data.prerequisiteRecoveries = records;
    this.save();
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
  failureSummary(max = 5): string[] {
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

  /** The next plan step the agent should work on, for the compact state.
   *  Prefers the step already in progress: pointing at the first pending
   *  step while another step is mid-flight made the state message nag the
   *  agent back to work it had deliberately set aside. */
  nextStep(): PlanStep | undefined {
    return this.data.plan.find((s) => s.status === 'in_progress') ?? this.data.plan.find((s) => s.status === 'pending');
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

  transcriptTail(maxActions = 16): string {
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
