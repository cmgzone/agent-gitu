import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { ProjectGuard } from '../guard/project-guard.js';
import type { TaskLedger } from '../ledger/task-ledger.js';

const execGit = promisify(execFile);

export interface CheckpointResult {
  ok: boolean;
  ref?: string;
  message: string;
}

export class CheckpointManager {
  private available: boolean | undefined;

  constructor(private readonly guard: ProjectGuard) {}

  private async git(args: string[]): Promise<string> {
    const { stdout } = await execGit('git', args, {
      cwd: this.guard.activeWritableRoot,
      encoding: 'utf8',
      timeout: 30_000,
      windowsHide: true,
    });
    return stdout.trim();
  }

  private async gitSafe(args: string[]): Promise<string | undefined> {
    try {
      return await this.git(args);
    } catch {
      return undefined;
    }
  }

  async isGitRepo(): Promise<boolean> {
    if (this.available === undefined) {
      this.available = await this.gitSafe(['rev-parse', '--is-inside-work-tree']) === 'true';
    }
    return this.available;
  }

  async ensureTaskBranch(taskId: string): Promise<{ ok: boolean; branch?: string; message: string }> {
    if (!await this.isGitRepo()) {
      return { ok: false, message: 'Not a git repository; checkpoints disabled. Changes are still tracked in the ledger.' };
    }
    const branch = `gitu/${taskId}`;
    const legacyBranch = `hermes/${taskId}`;
    const current = await this.gitSafe(['rev-parse', '--abbrev-ref', 'HEAD']);
    if (current === branch) return { ok: true, branch, message: `Already on ${branch}` };
    // A resumed legacy task must stay on the branch recorded by earlier
    // versions. New tasks use gitu/*; no existing work is silently forked.
    if (current === legacyBranch) return { ok: true, branch: legacyBranch, message: `Already on legacy ${legacyBranch}` };
    const exists = await this.gitSafe(['rev-parse', '--verify', branch]);
    if (exists) {
      if (await this.gitSafe(['checkout', branch]) === undefined) {
        return { ok: false, message: `Failed to switch to existing branch ${branch}` };
      }
      return { ok: true, branch, message: `Switched to existing ${branch}` };
    }
    const legacyExists = await this.gitSafe(['rev-parse', '--verify', legacyBranch]);
    if (legacyExists) {
      if (await this.gitSafe(['checkout', legacyBranch]) === undefined) {
        return { ok: false, message: `Failed to switch to legacy branch ${legacyBranch}` };
      }
      return { ok: true, branch: legacyBranch, message: `Switched to legacy ${legacyBranch}` };
    }
    const created = await this.gitSafe(['checkout', '-b', branch]);
    if (created === undefined) {
      return { ok: false, message: `Failed to create branch ${branch}` };
    }
    return { ok: true, branch, message: `Created ${branch} from ${current ?? 'HEAD'}` };
  }

  async snapshot(ledger: TaskLedger, stepId: string, label: string): Promise<CheckpointResult> {
    if (!await this.isGitRepo()) {
      return { ok: false, message: 'No git repository; skipping checkpoint.' };
    }
    // A transient git failure here (e.g. a stale index.lock from concurrent
    // IDE activity) must never fail the whole run — degrade to "skipped".
    // .hermes is execution metadata, never product state. Older versions
    // checkpointed it with `git add -A`; once tracked, an ignored worktree can
    // keep surfacing metadata changes as if they were specialist output. Drop
    // any legacy index entry (without deleting the on-disk ledger), then stage
    // only product paths through Git's object model.
    const trackedPrivateState = await this.gitSafe(['ls-files', '.hermes']);
    if (trackedPrivateState?.trim()) {
      const removed = await this.gitSafe(['rm', '-r', '--cached', '--ignore-unmatch', '.hermes']);
      if (removed === undefined) {
        return { ok: false, message: 'Could not detach legacy .hermes metadata from the Git index; checkpoint skipped.' };
      }
    }
    const staged = await this.gitSafe(['add', '-A', '--', ':(exclude).hermes']);
    if (staged === undefined) {
      return { ok: false, message: 'git add failed during checkpoint; skipping snapshot.' };
    }
    // Inspect the index, not generic status. Untracked/private agent state is
    // intentionally ignored and must never create a checkpoint by itself.
    const dirty = await this.gitSafe(['diff', '--cached', '--name-only']);
    const message = `gitu(${ledger.data.taskId}): ${stepId} ${label}`.slice(0, 200);
    if (!dirty) {
      const ref = await this.gitSafe(['rev-parse', 'HEAD']);
      if (ref) ledger.addCheckpoint(stepId, ref);
      return { ok: true, ref, message: 'No changes to snapshot; recorded HEAD.' };
    }
    const sha = await this.gitSafe(['commit', '-m', message, '--no-verify']);
    if (!sha) return { ok: false, message: 'git commit failed during checkpoint.' };
    const ref = await this.gitSafe(['rev-parse', 'HEAD']) ?? sha;
    ledger.addCheckpoint(stepId, ref);
    return { ok: true, ref, message: `Checkpoint ${ref.slice(0, 8)} for ${stepId}` };
  }

  async rollback(ref: string): Promise<CheckpointResult> {
    if (!await this.isGitRepo()) return { ok: false, message: 'No git repository.' };
    const result = await this.gitSafe(['reset', '--hard', ref]);
    if (result === undefined) return { ok: false, message: `Rollback to ${ref} failed.` };
    return { ok: true, ref, message: `Rolled back to ${ref.slice(0, 8)}` };
  }
}
