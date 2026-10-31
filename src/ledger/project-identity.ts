import { execFileSync } from 'node:child_process';
import path from 'node:path';
import type { ProjectIdentity } from '../types.js';
import { nowIso } from '../util.js';

/**
 * Project identity: what a task is bound to, independent of where the folder
 * currently lives.
 *
 * A path is not an identity. Renaming a folder, restoring a backup to another
 * drive, or re-cloning a repository all move a project legitimately, and a
 * ledger that only recorded `repoRoot` then looks unrecoverable. These helpers
 * read a stable identity from local Git state only — no network, no secrets:
 *
 * - `root`:       the absolute project root when the identity was recorded.
 * - `remoteUrl`:  `remote.origin.url` from the local Git config, when present.
 * - `fingerprint`: the root commit sha (survives a move and a fresh clone of the
 *                  same history), or the git directory when no commit exists.
 */

interface GitReadOptions {
  /** Hard cap per call: identity probing must never stall a resume. */
  timeoutMs?: number;
}

/** Read one local Git fact. Never throws: a non-repository is a valid answer. */
function readGit(repoRoot: string, args: string[], options: GitReadOptions = {}): string | undefined {
  try {
    const output = execFileSync('git', ['-C', repoRoot, ...args], {
      encoding: 'utf8',
      timeout: options.timeoutMs ?? 4000,
      windowsHide: true,
      maxBuffer: 1024 * 1024,
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    const trimmed = output.trim();
    return trimmed ? trimmed : undefined;
  } catch {
    return undefined;
  }
}

/** Normalize a path for comparison without touching the filesystem. */
export function samePath(a: string | undefined, b: string | undefined): boolean {
  if (!a || !b) return false;
  const left = path.resolve(a);
  const right = path.resolve(b);
  return process.platform === 'win32' ? left.toLowerCase() === right.toLowerCase() : left === right;
}

/** A remote URL compared without credential or trailing-slash noise. */
function normalizedRemote(url: string | undefined): string | undefined {
  if (!url) return undefined;
  return url
    .trim()
    .replace(/\/+$/, '')
    .replace(/^git@([^:]+):/, 'https://$1/')
    .replace(/\.git$/, '')
    .toLowerCase();
}

export function readProjectIdentity(repoRoot: string, recordedAt = nowIso()): ProjectIdentity {
  const root = path.resolve(repoRoot);
  const remoteUrl = readGit(root, ['config', '--get', 'remote.origin.url']);
  // `--max-parents=0` lists the root commit(s). Sorting keeps a merge-heavy
  // history deterministic instead of depending on parent order.
  const rootCommit = (readGit(root, ['rev-list', '--max-parents=0', 'HEAD']) ?? '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .sort()[0];
  // A repository with no commits still has an identity: its git directory.
  const gitDir = rootCommit ? undefined : readGit(root, ['rev-parse', '--absolute-git-dir']);
  const fingerprint = rootCommit ? `root-commit:${rootCommit}` : gitDir ? `git-dir:${gitDir.toLowerCase()}` : undefined;
  return {
    root,
    ...(remoteUrl ? { remoteUrl } : {}),
    ...(fingerprint ? { fingerprint } : {}),
    recordedAt,
  };
}

export type IdentityMatch = 'match' | 'mismatch' | 'unknown';

/**
 * Compare a recorded identity with what a candidate root actually is.
 *
 * `match`   — the candidate is this project (same path, fingerprint or remote).
 * `mismatch`— the candidate is demonstrably a different project.
 * `unknown` — nothing comparable was recorded (a non-Git project, or a ledger
 *             written before identities existed); the caller decides whether the
 *             task id alone is enough.
 */
export function compareProjectIdentity(recorded: ProjectIdentity | undefined, candidateRoot: string): IdentityMatch {
  if (!recorded) return 'unknown';
  if (samePath(recorded.root, candidateRoot)) return 'match';
  const candidate = readProjectIdentity(candidateRoot);
  if (recorded.fingerprint && candidate.fingerprint) {
    return recorded.fingerprint === candidate.fingerprint ? 'match' : 'mismatch';
  }
  const recordedRemote = normalizedRemote(recorded.remoteUrl);
  const candidateRemote = normalizedRemote(candidate.remoteUrl);
  if (recordedRemote && candidateRemote) {
    return recordedRemote === candidateRemote ? 'match' : 'mismatch';
  }
  return 'unknown';
}
