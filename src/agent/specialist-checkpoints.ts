import { createHash } from 'node:crypto';
import { existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { getWorkspaceFingerprint, gitExec, isGitRepo } from '../git/git.js';
import type { SkillIdentity, SkillStore } from '../skills/skills.js';

/** Why a logical specialist attempt stopped. Infrastructure stops remain resumable. */
export type SpecialistStopReason =
  | 'completed'
  | 'task_failed'
  | 'model_transport_failure'
  | 'model_timeout'
  | 'tool_policy_block'
  | 'turn_budget_exhausted'
  | 'process_interrupted';

/** The only recovery claims the UI/orchestrator is allowed to make. */
export type SpecialistResumeState =
  | 'RESUME_WITH_CHANGES'
  /** Git found durable edits written after the last metadata checkpoint. */
  | 'RESUME_WITH_UNCHECKPOINTED_CHANGES'
  | 'RESUME_CONTEXT_ONLY'
  | 'RESUME_CHECKPOINT_MISSING'
  | 'RESUME_CHECKPOINT_DIVERGED';

/** Exact-instruction recovery outcome, kept distinct from Git/worktree truth. */
export type SpecialistSkillState = 'SKILL_STATE_MATCH' | 'SKILL_STATE_CHANGED' | 'SKILL_STATE_MISSING';

export interface SpecialistCheckpoint {
  /** Stable identity across retries. This is the ID accepted by delegate.resume. */
  logicalJobId: string;
  /** Most recent physical execution attempt ID, useful for UI/telemetry only. */
  executionJobId: string;
  executionAttempt: number;
  specialistType: string;
  delegatedTask: string;
  delegatedTaskHash: string;
  repositoryPath: string;
  worktreePath: string;
  branch: string;
  currentTurn: number;
  changedFiles: string[];
  /** Loaded skill identities governing this specialist attempt. */
  selectedSkills: SkillIdentity[];
  baseCommit?: string;
  headCommit?: string;
  workspaceFingerprint?: string;
  checkpointedAt: string;
  lastSuccessfulAction?: string;
  resumeStatus: SpecialistResumeState;
  stopReason?: SpecialistStopReason;
  summary?: string;
  resumable: boolean;
  createdAt: string;
  updatedAt: string;
}

interface CheckpointRow extends Omit<SpecialistCheckpoint, 'changedFiles' | 'selectedSkills' | 'resumable'> {
  changedFiles: string;
  selectedSkills: string;
  resumable: number;
}

function parseFiles(value: string | null | undefined): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((file): file is string => typeof file === 'string').sort() : [];
  } catch {
    return [];
  }
}

function parseSkills(value: string | null | undefined): SkillIdentity[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed)
      ? parsed
          .filter((entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === 'object')
          .map((entry): SkillIdentity => ({ name: String(entry['name'] ?? ''), version: String(entry['version'] ?? ''), contentHash: String(entry['contentHash'] ?? ''), scope: entry['scope'] === 'global' || entry['scope'] === 'builtin' ? entry['scope'] : 'project' }))
          .filter((entry) => entry.name && entry.version && entry.contentHash)
      : [];
  } catch {
    return [];
  }
}

function normalizeFiles(files: Iterable<string>): string[] {
  return [...new Set([...files].map((file) => file.replace(/\\/g, '/').trim()).filter(Boolean))].sort();
}

function rowToCheckpoint(row: CheckpointRow): SpecialistCheckpoint {
  return {
    ...row,
    changedFiles: parseFiles(row.changedFiles),
    selectedSkills: parseSkills(row.selectedSkills),
    resumable: Boolean(row.resumable),
    stopReason: row.stopReason || undefined,
    summary: row.summary || undefined,
    baseCommit: row.baseCommit || undefined,
    headCommit: row.headCommit || undefined,
    workspaceFingerprint: row.workspaceFingerprint || undefined,
    lastSuccessfulAction: row.lastSuccessfulAction || undefined,
  };
}

export function delegatedTaskHash(task: string): string {
  return createHash('sha256').update(task.trim()).digest('hex').slice(0, 16);
}

/**
 * Durable metadata lives beside the repository's private Agent Gitu state.
 * Git remains the source of truth for source files; this database makes the
 * job identity and the expected Git snapshot survive process/app restarts.
 */
export class SpecialistCheckpointStore {
  private readonly db: DatabaseSync;

  constructor(readonly repositoryPath: string, file = path.join(repositoryPath, '.hermes', 'specialists.db')) {
    mkdirSync(path.dirname(file), { recursive: true });
    this.db = new DatabaseSync(file);
    // A desktop run can retain a previous runner while a resumed attempt is
    // constructed. WAL + a short busy window keeps those durable readers and
    // writers from turning an infrastructure hiccup into a lost checkpoint.
    this.db.exec('PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;');
    this.db.exec(
      `CREATE TABLE IF NOT EXISTS specialist_checkpoints (
         logicalJobId TEXT PRIMARY KEY,
         executionJobId TEXT NOT NULL,
         executionAttempt INTEGER NOT NULL,
         specialistType TEXT NOT NULL,
         delegatedTask TEXT NOT NULL,
         delegatedTaskHash TEXT NOT NULL,
         repositoryPath TEXT NOT NULL,
         worktreePath TEXT NOT NULL,
         branch TEXT NOT NULL,
         currentTurn INTEGER NOT NULL,
         changedFiles TEXT NOT NULL,
         baseCommit TEXT,
         headCommit TEXT,
         workspaceFingerprint TEXT,
         checkpointedAt TEXT NOT NULL,
         lastSuccessfulAction TEXT,
         resumeStatus TEXT NOT NULL,
         stopReason TEXT,
         summary TEXT,
         resumable INTEGER NOT NULL DEFAULT 1,
         createdAt TEXT NOT NULL,
         updatedAt TEXT NOT NULL
       );
       CREATE INDEX IF NOT EXISTS specialist_checkpoints_resumable
       ON specialist_checkpoints (resumable, updatedAt DESC);`,
    );
    // Existing desktop installations have the original schema. SQLite has no
    // portable ADD COLUMN IF NOT EXISTS, so a duplicate-column error is safe.
    try {
      this.db.exec(`ALTER TABLE specialist_checkpoints ADD COLUMN selectedSkills TEXT NOT NULL DEFAULT '[]';`);
    } catch {
      // Already migrated.
    }
  }

  get(logicalJobId: string): SpecialistCheckpoint | undefined {
    const row = this.db
      .prepare(`SELECT logicalJobId, executionJobId, executionAttempt, specialistType, delegatedTask, delegatedTaskHash, repositoryPath, worktreePath, branch, currentTurn, changedFiles, selectedSkills, baseCommit, headCommit, workspaceFingerprint, checkpointedAt, lastSuccessfulAction, resumeStatus, stopReason, summary, resumable, createdAt, updatedAt FROM specialist_checkpoints WHERE logicalJobId = ?`)
      .get(logicalJobId) as CheckpointRow | undefined;
    return row ? rowToCheckpoint(row) : undefined;
  }

  listResumable(): SpecialistCheckpoint[] {
    const rows = this.db
      .prepare(`SELECT logicalJobId, executionJobId, executionAttempt, specialistType, delegatedTask, delegatedTaskHash, repositoryPath, worktreePath, branch, currentTurn, changedFiles, selectedSkills, baseCommit, headCommit, workspaceFingerprint, checkpointedAt, lastSuccessfulAction, resumeStatus, stopReason, summary, resumable, createdAt, updatedAt FROM specialist_checkpoints WHERE resumable = 1 ORDER BY updatedAt DESC`)
      .all() as unknown as CheckpointRow[];
    return rows.map(rowToCheckpoint);
  }

  upsert(checkpoint: SpecialistCheckpoint): SpecialistCheckpoint {
    const normalized: SpecialistCheckpoint = {
      ...checkpoint,
      changedFiles: normalizeFiles(checkpoint.changedFiles),
      delegatedTaskHash: checkpoint.delegatedTaskHash || delegatedTaskHash(checkpoint.delegatedTask),
      updatedAt: new Date().toISOString(),
    };
    this.db
      .prepare(
        `INSERT INTO specialist_checkpoints (logicalJobId, executionJobId, executionAttempt, specialistType, delegatedTask, delegatedTaskHash, repositoryPath, worktreePath, branch, currentTurn, changedFiles, selectedSkills, baseCommit, headCommit, workspaceFingerprint, checkpointedAt, lastSuccessfulAction, resumeStatus, stopReason, summary, resumable, createdAt, updatedAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(logicalJobId) DO UPDATE SET
           executionJobId = excluded.executionJobId,
           executionAttempt = excluded.executionAttempt,
           specialistType = excluded.specialistType,
           delegatedTask = excluded.delegatedTask,
           delegatedTaskHash = excluded.delegatedTaskHash,
           repositoryPath = excluded.repositoryPath,
           worktreePath = excluded.worktreePath,
           branch = excluded.branch,
           currentTurn = excluded.currentTurn,
           changedFiles = excluded.changedFiles,
           selectedSkills = excluded.selectedSkills,
           baseCommit = excluded.baseCommit,
           headCommit = excluded.headCommit,
           workspaceFingerprint = excluded.workspaceFingerprint,
           checkpointedAt = excluded.checkpointedAt,
           lastSuccessfulAction = excluded.lastSuccessfulAction,
           resumeStatus = excluded.resumeStatus,
           stopReason = excluded.stopReason,
           summary = excluded.summary,
           resumable = excluded.resumable,
           updatedAt = excluded.updatedAt`,
      )
      .run(
        normalized.logicalJobId,
        normalized.executionJobId,
        normalized.executionAttempt,
        normalized.specialistType,
        normalized.delegatedTask,
        normalized.delegatedTaskHash,
        normalized.repositoryPath,
        normalized.worktreePath,
        normalized.branch,
        normalized.currentTurn,
        JSON.stringify(normalized.changedFiles),
        JSON.stringify(normalized.selectedSkills),
        normalized.baseCommit ?? null,
        normalized.headCommit ?? null,
        normalized.workspaceFingerprint ?? null,
        normalized.checkpointedAt,
        normalized.lastSuccessfulAction ?? null,
        normalized.resumeStatus,
        normalized.stopReason ?? null,
        normalized.summary ?? null,
        normalized.resumable ? 1 : 0,
        normalized.createdAt,
        normalized.updatedAt,
      );
    return normalized;
  }

  markCompleted(logicalJobId: string, summary?: string): void {
    const checkpoint = this.get(logicalJobId);
    if (!checkpoint) return;
    this.upsert({
      ...checkpoint,
      stopReason: 'completed',
      summary: summary ?? checkpoint.summary,
      resumable: false,
    });
  }

  close(): void {
    this.db.close();
  }
}

async function gitFilesSince(root: string, baseCommit: string | undefined): Promise<string[]> {
  if (!isGitRepo(root)) return [];
  const files = new Set<string>();
  if (baseCommit) {
    const committed = await gitExec(root, ['diff', '--name-only', `${baseCommit}..HEAD`, '--', ':(exclude).hermes']).catch(() => '');
    for (const file of committed.split(/\r?\n/)) if (file.trim()) files.add(file.trim());
  }
  const dirty = await gitExec(root, ['diff', '--name-only', 'HEAD', '--', ':(exclude).hermes']).catch(() => '');
  for (const file of dirty.split(/\r?\n/)) if (file.trim()) files.add(file.trim());
  const untracked = await gitExec(root, ['ls-files', '--others', '--exclude-standard', '--', ':(exclude).hermes']).catch(() => '');
  for (const file of untracked.split(/\r?\n/)) if (file.trim()) files.add(file.trim());
  return normalizeFiles(files);
}

export interface GitCheckpointSnapshot {
  baseCommit?: string;
  headCommit?: string;
  workspaceFingerprint?: string;
  changedFiles: string[];
}

/** Capture the verified Git/worktree facts that accompany checkpoint metadata. */
export async function captureGitCheckpoint(root: string, baseCommit?: string): Promise<GitCheckpointSnapshot> {
  if (!existsSync(root)) return { baseCommit, changedFiles: [] };
  if (!isGitRepo(root)) {
    return { baseCommit, workspaceFingerprint: await getWorkspaceFingerprint(root), changedFiles: [] };
  }
  const headCommit = (await gitExec(root, ['rev-parse', 'HEAD']).catch(() => '')).trim() || undefined;
  const resolvedBase = baseCommit || headCommit;
  return {
    baseCommit: resolvedBase,
    headCommit,
    workspaceFingerprint: await getWorkspaceFingerprint(root),
    changedFiles: await gitFilesSince(root, resolvedBase),
  };
}

/**
 * Verify durable metadata against the actual branch/worktree before a resume.
 * It intentionally fails closed: stale metadata can never become a claim that
 * source files were recovered.
 */
export async function reconcileSpecialistCheckpoint(checkpoint: SpecialistCheckpoint | undefined): Promise<SpecialistResumeState> {
  if (!checkpoint || !checkpoint.resumable) return 'RESUME_CHECKPOINT_MISSING';
  if (!existsSync(checkpoint.worktreePath)) return 'RESUME_CHECKPOINT_MISSING';
  if (isGitRepo(checkpoint.worktreePath)) {
    const currentBranch = (await gitExec(checkpoint.worktreePath, ['branch', '--show-current']).catch(() => '')).trim();
    const branchHead = (await gitExec(checkpoint.worktreePath, ['rev-parse', checkpoint.branch]).catch(() => '')).trim();
    if (!branchHead || currentBranch !== checkpoint.branch) return 'RESUME_CHECKPOINT_DIVERGED';
  }
  const actual = await captureGitCheckpoint(checkpoint.worktreePath, checkpoint.baseCommit);
  if (checkpoint.changedFiles.length === 0) {
    // A process can stop after the editor wrote a file but before the next
    // SQLite update completed. This is an isolated specialist worktree, so
    // Git can truthfully identify those durable files. Recover them under a
    // distinct state and require the resumed specialist to inspect them; do
    // not discard valid work or silently pretend it was checkpointed.
    if (actual.changedFiles.length === 0) return 'RESUME_CONTEXT_ONLY';
    return actual.workspaceFingerprint ? 'RESUME_WITH_UNCHECKPOINTED_CHANGES' : 'RESUME_CHECKPOINT_DIVERGED';
  }
  const expectedFiles = normalizeFiles(checkpoint.changedFiles);
  const sameFiles = JSON.stringify(expectedFiles) === JSON.stringify(actual.changedFiles);
  const sameFingerprint = Boolean(checkpoint.workspaceFingerprint) && checkpoint.workspaceFingerprint === actual.workspaceFingerprint;
  if (sameFiles && sameFingerprint) return 'RESUME_WITH_CHANGES';
  return 'RESUME_CHECKPOINT_DIVERGED';
}

/** Verify exact selected-skill identities before a checkpoint is resumed. */
export function reconcileSpecialistSkillState(checkpoint: SpecialistCheckpoint | undefined, skills: SkillStore): SpecialistSkillState {
  if (!checkpoint || checkpoint.selectedSkills.length === 0) return 'SKILL_STATE_MATCH';
  for (const expected of checkpoint.selectedSkills) {
    const current = skills.identity(expected.name);
    if (!current) return 'SKILL_STATE_MISSING';
    if (current.version !== expected.version || current.contentHash !== expected.contentHash || current.scope !== expected.scope) return 'SKILL_STATE_CHANGED';
  }
  return 'SKILL_STATE_MATCH';
}
