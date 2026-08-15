import { readdirSync } from 'node:fs';
import path from 'node:path';
import type {
  ActionRecord,
  Budgets,
  PlanStep,
  ProjectLock,
  TaskLedgerData,
  TaskStatus,
} from '../types.js';
import { nowIso, readJson, shortId, writeJson } from '../util.js';

export const DEFAULT_BUDGETS: Budgets = {
  maxActions: 40,
  maxPlanAttempts: 12,
  maxWallClockMs: 30 * 60 * 1000,
};

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
    budgets?: Partial<Budgets>;
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
      acceptanceCriteria: [],
      constraints: [],
      nonGoals: [],
      plan: [],
      actions: [],
      evidence: [],
      filesChanged: [],
      checkpoints: [],
      blockers: [],
      budgets: { ...DEFAULT_BUDGETS, ...input.budgets },
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

  setPlan(steps: { description: string; verification: string }[]): void {
    this.data.plan = steps.map((s, i) => ({
      id: `step-${i + 1}`,
      description: s.description,
      verification: s.verification,
      status: 'pending',
      attempts: 0,
    }));
    this.save();
  }

  step(id: string): PlanStep | undefined {
    return this.data.plan.find((s) => s.id === id);
  }

  updateStep(id: string, patch: Partial<PlanStep>): void {
    const step = this.step(id);
    if (!step) return;
    Object.assign(step, patch);
    this.save();
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

  budgetExceeded(): string | undefined {
    const { budgets } = this.data;
    if (this.data.actions.length >= budgets.maxActions) {
      return `Action budget exhausted (${budgets.maxActions}).`;
    }
    const totalAttempts = this.data.plan.reduce((sum, s) => sum + s.attempts, 0);
    if (totalAttempts >= budgets.maxPlanAttempts) {
      return `Plan attempt budget exhausted (${budgets.maxPlanAttempts}).`;
    }
    if (this.data.startedAt) {
      const elapsed = Date.now() - new Date(this.data.startedAt).getTime();
      if (elapsed > budgets.maxWallClockMs) {
        return `Wall-clock budget exhausted (${Math.round(elapsed / 60000)} min).`;
      }
    }
    return undefined;
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
