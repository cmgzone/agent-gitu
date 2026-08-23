import { execFileSync } from 'node:child_process';
import type { ProjectGuard } from '../guard/project-guard.js';
import type { TaskLedger } from '../ledger/task-ledger.js';

export interface CheckpointResult {
  ok: boolean;
  ref?: string;
  message: string;
}

export class CheckpointManager {
  private available: boolean | undefined;

  constructor(private readonly guard: ProjectGuard) {}

  private git(args: string[]): string {
    return execFileSync('git', args, {
      cwd: this.guard.lock.repoRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
  }

  private gitSafe(args: string[]): string | undefined {
    try {
      return this.git(args);
    } catch {
      return undefined;
    }
  }

  isGitRepo(): boolean {
    if (this.available === undefined) {
      this.available = this.gitSafe(['rev-parse', '--is-inside-work-tree']) === 'true';
    }
    return this.available;
  }

  ensureTaskBranch(taskId: string): { ok: boolean; branch?: string; message: string } {
    if (!this.isGitRepo()) {
      return { ok: false, message: 'Not a git repository; checkpoints disabled. Changes are still tracked in the ledger.' };
    }
    const branch = `hermes/${taskId}`;
    const current = this.gitSafe(['rev-parse', '--abbrev-ref', 'HEAD']);
    if (current === branch) return { ok: true, branch, message: `Already on ${branch}` };
    const exists = this.gitSafe(['rev-parse', '--verify', branch]);
    if (exists) {
      if (this.gitSafe(['checkout', branch]) === undefined) {
        return { ok: false, message: `Failed to switch to existing branch ${branch}` };
      }
      return { ok: true, branch, message: `Switched to existing ${branch}` };
    }
    const created = this.gitSafe(['checkout', '-b', branch]);
    if (created === undefined) {
      return { ok: false, message: `Failed to create branch ${branch}` };
    }
    return { ok: true, branch, message: `Created ${branch} from ${current ?? 'HEAD'}` };
  }

  snapshot(ledger: TaskLedger, stepId: string, label: string): CheckpointResult {
    if (!this.isGitRepo()) {
      return { ok: false, message: 'No git repository; skipping checkpoint.' };
    }
    // A transient git failure here (e.g. a stale index.lock from concurrent
    // IDE activity) must never fail the whole run — degrade to "skipped".
    const staged = this.gitSafe(['add', '-A']);
    if (staged === undefined) {
      return { ok: false, message: 'git add failed during checkpoint; skipping snapshot.' };
    }
    const dirty = this.gitSafe(['status', '--porcelain']);
    const message = `hermes(${ledger.data.taskId}): ${stepId} ${label}`.slice(0, 200);
    if (!dirty) {
      const ref = this.gitSafe(['rev-parse', 'HEAD']);
      if (ref) ledger.addCheckpoint(stepId, ref);
      return { ok: true, ref, message: 'No changes to snapshot; recorded HEAD.' };
    }
    const sha = this.gitSafe(['commit', '-m', message, '--no-verify']);
    if (!sha) return { ok: false, message: 'git commit failed during checkpoint.' };
    const ref = this.gitSafe(['rev-parse', 'HEAD']) ?? sha;
    ledger.addCheckpoint(stepId, ref);
    return { ok: true, ref, message: `Checkpoint ${ref.slice(0, 8)} for ${stepId}` };
  }

  rollback(ref: string): CheckpointResult {
    if (!this.isGitRepo()) return { ok: false, message: 'No git repository.' };
    const result = this.gitSafe(['reset', '--hard', ref]);
    if (result === undefined) return { ok: false, message: `Rollback to ${ref} failed.` };
    return { ok: true, ref, message: `Rolled back to ${ref.slice(0, 8)}` };
  }
}
