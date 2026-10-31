import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';

/**
 * Advisory resume lock for one task.
 *
 * Two sessions can point at the same task id — a restarted app, a second window,
 * a delegated run. Resuming the same ledger from both at once corrupts it: each
 * run rewrites the whole file from its own copy. A lock file in the task's ledger
 * directory makes ownership explicit, and its staleness window keeps a crashed
 * run from blocking the task forever.
 *
 * The lock is advisory by design: it protects Gitu's own resume paths, not an
 * unrelated process that happens to write the same JSON file.
 */

/** A lock older than this is presumed abandoned and may be taken over. */
export const TASK_LOCK_STALE_MS = 30 * 60 * 1000;

export interface TaskLockRecord {
  taskId: string;
  /** The session run that owns the resume. */
  runId: string;
  pid: number;
  /** When the lock was taken (ISO, for humans reading the file). */
  startedAt: string;
  /** When the lock was taken (ms, for age arithmetic). */
  startedAtMs: number;
  /** The window this holder declared; recorded so the file explains itself. */
  staleAfterMs: number;
}

export interface TaskLockClaim {
  record: TaskLockRecord;
  /** True when an abandoned lock was replaced rather than a free lock taken. */
  takenOver: boolean;
  release(): void;
}

export interface TaskLockRefusal {
  held: TaskLockRecord;
  ageMs: number;
  staleAfterMs: number;
  /** A message a person can act on: who holds the task, and what to do next. */
  message: string;
}

export interface AcquireTaskLockInput {
  repoRoot: string;
  taskId: string;
  runId: string;
  pid?: number;
  /** Injectable clock: staleness must be testable without waiting. */
  now?: number;
  staleMs?: number;
}

/** Where a task's advisory lock lives: beside its ledger, never inside a checkout. */
export function taskLockPath(repoRoot: string, taskId: string): string {
  return path.join(repoRoot, '.hermes', 'tasks', `${taskId}.lock`);
}

/** Read the current lock, if any. An unreadable lock reads as absent. */
export function readTaskLock(repoRoot: string, taskId: string): TaskLockRecord | undefined {
  const file = taskLockPath(repoRoot, taskId);
  try {
    if (!existsSync(file)) return undefined;
    const raw = JSON.parse(readFileSync(file, 'utf8')) as Partial<TaskLockRecord>;
    if (!raw || typeof raw.runId !== 'string') return undefined;
    const startedAtMs = typeof raw.startedAtMs === 'number' ? raw.startedAtMs : Date.parse(String(raw.startedAt ?? ''));
    return {
      taskId: typeof raw.taskId === 'string' ? raw.taskId : taskId,
      runId: raw.runId,
      pid: typeof raw.pid === 'number' ? raw.pid : -1,
      startedAt: typeof raw.startedAt === 'string' ? raw.startedAt : new Date(startedAtMs || 0).toISOString(),
      startedAtMs: Number.isFinite(startedAtMs) ? startedAtMs : 0,
      staleAfterMs: typeof raw.staleAfterMs === 'number' ? raw.staleAfterMs : TASK_LOCK_STALE_MS,
    };
  } catch {
    return undefined;
  }
}

function describeAge(ms: number): string {
  const minutes = Math.max(1, Math.round(ms / 60000));
  return minutes >= 60 ? `${Math.round(minutes / 60)}h` : `${minutes}m`;
}

function refusalFor(held: TaskLockRecord, now: number, staleAfterMs: number): TaskLockRefusal {
  const ageMs = Math.max(0, now - held.startedAtMs);
  const minutesLeft = Math.max(1, Math.ceil((staleAfterMs - ageMs) / 60000));
  return {
    held,
    ageMs,
    staleAfterMs,
    message:
      `Task ${held.taskId} is already being resumed by run ${held.runId} (pid ${held.pid}, started ${describeAge(ageMs)} ago). ` +
      `Wait for that run to finish, or retry in about ${minutesLeft}m when its lock is presumed abandoned.`,
  };
}

/**
 * Take the advisory lock for a task.
 *
 * Succeeds when the lock is free, when the same run already holds it (a
 * continuation of the same owner is not a conflict), or when the existing lock
 * is older than the staleness window. Anything else is a refusal carrying an
 * actionable message — never a silent second writer on the same ledger.
 */
export function acquireTaskLock(input: AcquireTaskLockInput): { ok: true; lock: TaskLockClaim } | { ok: false; refusal: TaskLockRefusal } {
  const file = taskLockPath(input.repoRoot, input.taskId);
  const now = input.now ?? Date.now();
  const staleAfterMs = input.staleMs ?? TASK_LOCK_STALE_MS;
  const record: TaskLockRecord = {
    taskId: input.taskId,
    runId: input.runId,
    pid: input.pid ?? process.pid,
    startedAt: new Date(now).toISOString(),
    startedAtMs: now,
    staleAfterMs,
  };
  const write = (flag: 'wx' | 'w'): void => {
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, `${JSON.stringify(record, null, 2)}\n`, { flag });
  };
  const claim = (takenOver: boolean): { ok: true; lock: TaskLockClaim } => ({
    ok: true,
    lock: {
      record,
      takenOver,
      release: () => {
        // Only the owner removes the lock: a taken-over lock file belongs to
        // whoever replaced it, and deleting that would free a live run.
        const current = readTaskLock(input.repoRoot, input.taskId);
        if (current && current.runId !== record.runId) return;
        try {
          rmSync(file, { force: true });
        } catch {
          /* a lock that cannot be removed will age out instead */
        }
      },
    },
  });

  try {
    write('wx');
    return claim(false);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') {
      // A lock we cannot even create must not block the resume: the ledger is
      // the source of truth and the failure is reported by the run itself.
      throw error;
    }
  }

  const held = readTaskLock(input.repoRoot, input.taskId);
  // An unreadable or corrupt lock cannot prove ownership of anything.
  if (!held) {
    write('w');
    return claim(true);
  }
  if (held.runId === record.runId) {
    // The same run continuing (retry, model fallback) already owns the task.
    write('w');
    return claim(false);
  }
  const ageMs = Math.max(0, now - held.startedAtMs);
  if (ageMs > (held.staleAfterMs || staleAfterMs)) {
    write('w');
    return claim(true);
  }
  return { ok: false, refusal: refusalFor(held, now, held.staleAfterMs || staleAfterMs) };
}
