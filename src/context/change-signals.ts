import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';

/**
 * Small, local-only change-history signal for context retrieval.
 *
 * A task is often related to a recently edited area even when the goal and
 * filenames share no vocabulary. Git history is only a tie-breaker: it can
 * surface a nearby file, never overwhelm an exact lexical match. The helper
 * deliberately reads metadata only (paths and statuses), never diffs or
 * sends repository content anywhere.
 */
export interface ChangeSignalOptions {
  /** Number of recent commits whose touched paths should contribute. */
  maxCommits?: number;
  /** Maximum number of files returned, ordered by confidence. */
  maxFiles?: number;
}

function normalizePath(value: string): string | undefined {
  const normalized = value.trim().replace(/\\/g, '/').replace(/^\.\//, '');
  if (!normalized || normalized.startsWith('../') || normalized === '..') return undefined;
  return normalized;
}

/** Parse `git log --name-only` output into bounded, recency-weighted scores. */
export function scoreRecentChangePaths(logOutput: string, statusOutput = '', maxFiles = 48): Map<string, number> {
  const scores = new Map<string, number>();
  let weight = 1;
  for (const raw of logOutput.split(/\r?\n/)) {
    const file = normalizePath(raw);
    if (!file) {
      // Empty lines delimit commits in the format emitted below. The first
      // commit remains the strongest signal and older commits decay quickly.
      weight *= 0.78;
      continue;
    }
    scores.set(file, (scores.get(file) ?? 0) + weight);
  }

  // Uncommitted work is the clearest available edit-history signal. Porcelain
  // paths begin at column three; a renamed item contains the current path last
  // when parsed by this line-oriented fallback, which is still safe to boost.
  for (const raw of statusOutput.split(/\r?\n/)) {
    const file = normalizePath(raw.slice(3));
    if (file) scores.set(file, (scores.get(file) ?? 0) + 1.15);
  }

  const top = [...scores.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, maxFiles);
  const peak = top[0]?.[1] ?? 0;
  return new Map(top.map(([file, value]) => [file, peak > 0 ? Math.min(1, value / peak) : 0]));
}

/**
 * Return normalized change-history relevance for a git checkout. A missing
 * git executable, non-git folder, or unusual history format is intentionally
 * a no-op so context construction stays available everywhere.
 */
export function recentChangeScores(root: string, opts: ChangeSignalOptions = {}): Map<string, number> {
  if (!existsSync(path.join(root, '.git'))) return new Map();
  const maxCommits = Math.max(1, Math.min(80, opts.maxCommits ?? 18));
  const maxFiles = Math.max(1, Math.min(200, opts.maxFiles ?? 48));
  try {
    const log = execFileSync('git', ['log', `--max-count=${maxCommits}`, '--format=', '--name-only'], {
      cwd: root,
      encoding: 'utf8',
      windowsHide: true,
      timeout: 2_000,
      maxBuffer: 512 * 1024,
    });
    const status = execFileSync('git', ['status', '--porcelain=v1', '-uall'], {
      cwd: root,
      encoding: 'utf8',
      windowsHide: true,
      timeout: 2_000,
      maxBuffer: 256 * 1024,
    });
    return scoreRecentChangePaths(log, status, maxFiles);
  } catch {
    return new Map();
  }
}
