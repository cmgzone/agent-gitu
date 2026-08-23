import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, statSync } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';

export interface GitFile {
  path: string;
  status: string;
  untracked: boolean;
}

export interface GitInfo {
  available: boolean;
  branch?: string;
  remote?: string;
  ahead?: number;
  behind?: number;
  files?: GitFile[];
  error?: string;
}

const FINGERPRINT_MAX_FILES = 4000;
const FINGERPRINT_MAX_FILE_BYTES = 256 * 1024;

export async function getWorkspaceFingerprint(root: string): Promise<string> {
  if (!isGitRepo(root)) {
    // Non-git projects still deserve staleness detection: hash path+mtime+size
    // of project files so evidence recorded before an edit goes stale here
    // too. A constant placeholder would disable the check entirely.
    return nonGitFingerprint(root);
  }
  try {
    // Content hash of EVERY tracked+untracked project file (not just dirty
    // ones). Hashing only dirty files collapsed the fingerprint to a constant
    // whenever a checkpoint commit flipped the tree clean, falsely marking
    // valid evidence stale — while clean-tree stamps stayed fresh forever.
    // Commits and staging only move bookkeeping state; worktree CONTENT is
    // untouched, so this fingerprint survives them by construction yet still
    // reacts to any real edit, addition, or deletion.
    const listing = await gitExec(root, ['ls-files', '-co', '--exclude-standard', '-z']).catch(() => '');
    const paths = listing.split('\0').filter(Boolean);
    const fileSignatures: string[] = [];
    let budget = FINGERPRINT_MAX_FILES;
    for (const p of paths) {
      if (budget-- <= 0) break;
      const normPath = p.replace(/\\/g, '/');
      if (
        normPath.startsWith('.hermes/') ||
        normPath === '.hermes' ||
        normPath.startsWith('.git/') ||
        normPath === '.git' ||
        normPath.startsWith('node_modules/') ||
        normPath === 'node_modules'
      ) {
        continue;
      }
      const full = path.join(root, p);
      try {
        const st = await stat(full);
        if (st.size > FINGERPRINT_MAX_FILE_BYTES) {
          fileSignatures.push(`${normPath}:oversized`);
          continue;
        }
        const content = await readFile(full);
        fileSignatures.push(`${normPath}:${createHash('sha256').update(content).digest('hex').slice(0, 16)}`);
      } catch {
        fileSignatures.push(`${normPath}:deleted`);
      }
    }
    const payload = fileSignatures.sort().join('|');
    return createHash('sha256').update(payload).digest('hex').slice(0, 16);
  } catch {
    return 'unknown-fp';
  }
}

export function gitExec(root: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      'git',
      args,
      { cwd: root, encoding: 'utf8', windowsHide: true, maxBuffer: 8 * 1024 * 1024 },
      (err, stdout, stderr) => {
        if (err) reject(new Error((stderr || err.message).trim().slice(0, 500)));
        else resolve(stdout);
      },
    );
  });
}

export function isGitRepo(root: string): boolean {
  return existsSync(path.join(root, '.git'));
}

const NON_GIT_SKIP = new Set(['.git', '.hermes', 'node_modules', 'coverage', '.cache', '.freebuff']);
const NON_GIT_MAX_FILES = 5000;

/**
 * Fallback fingerprint for non-git workspaces: path + mtimeMs + size of every
 * project file (bounded walk). Deterministic while the tree is untouched and
 * changes the moment any file is written — same contract as the git-based
 * fingerprint, just content-blind.
 */
async function nonGitFingerprint(root: string): Promise<string> {
  const signatures: string[] = [];
  let count = 0;
  const walk = (dir: string, depth: number): void => {
    if (depth > 12 || count >= NON_GIT_MAX_FILES) return;
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      return;
    }
    for (const name of entries.sort()) {
      if (count >= NON_GIT_MAX_FILES) return;
      if (NON_GIT_SKIP.has(name)) continue;
      const full = path.join(dir, name);
      let st;
      try {
        st = statSync(full);
      } catch {
        continue;
      }
      if (st.isDirectory()) {
        walk(full, depth + 1);
      } else {
        count += 1;
        const rel = path.relative(root, full).replace(/\\/g, '/');
        signatures.push(`${rel}:${st.mtimeMs}:${st.size}`);
      }
    }
  };
  try {
    walk(root, 0);
  } catch {
    return 'unknown-fp';
  }
  return createHash('sha256').update(`nogit-v1|${signatures.join('|')}`).digest('hex').slice(0, 16);
}

export async function gitInfo(root: string): Promise<GitInfo> {
  if (!isGitRepo(root)) return { available: false };
  try {
    // -z gives NUL-separated, unquoted paths and full rename pairs — the
    // line-based parse mangled renames ("old -> new") and quoted/escaped
    // filenames.
    const head = await gitExec(root, ['status', '--porcelain=v1', '-z', '-b', '-uall']);
    const tokens = head.split('\0').filter(Boolean);
    let branch = '';
    let ahead = 0;
    let behind = 0;
    const files: GitFile[] = [];
    let i = 0;
    if (tokens[0]?.startsWith('## ')) {
      let header = tokens[0].slice(3);
      const bracket = /\[(.+)\]\s*$/.exec(header);
      if (bracket) {
        // Parse ahead/behind independently: git emits behind-only as
        // "[behind 2]" which the old single regex silently dropped.
        const counts = bracket[1] ?? '';
        ahead = Number(/ahead\s+(\d+)/i.exec(counts)?.[1] ?? 0) || 0;
        behind = Number(/behind\s+(\d+)/i.exec(counts)?.[1] ?? 0) || 0;
        header = header.slice(0, bracket.index).trim();
      }
      // Detached HEAD renders as "HEAD (no branch)".
      header = header.replace(/\s+\(no branch\)\s*$/i, '').trim();
      // Drop the upstream half of "main...origin/main" so dotted branch names
      // like release/v1.0 stay intact instead of being cut at the first dot.
      branch = header.split(/\.{3}/)[0]?.trim() ?? '';
      i = 1;
    }
    while (i < tokens.length) {
      const tok = tokens[i]!;
      i += 1;
      const xy = tok.slice(0, 2);
      const p = tok.slice(3);
      // Renames/copies are followed by the original path token.
      const kind = xy[0] ?? '';
      if (kind === 'R' || kind === 'C') i += 1;
      files.push({ path: p, status: xy.trim() || xy, untracked: xy.includes('?') });
    }
    let remote = '';
    try {
      remote = (await gitExec(root, ['remote', 'get-url', 'origin'])).trim();
    } catch {
      remote = '';
    }
    return { available: true, branch, remote, ahead, behind, files };
  } catch (err) {
    return { available: true, error: (err as Error).message, files: [] };
  }
}

export async function gitDiff(root: string, file?: string): Promise<string> {
  // "diff HEAD" covers staged AND unstaged changes; plain "diff" compares
  // worktree-vs-index only and reports nothing for staged-but-uncommitted
  // edits (e.g. after a failed commit following `git add`).
  const args = ['diff', 'HEAD', '--'];
  if (file) args.push(file);
  const tracked = await gitExec(root, args).catch(() => '');
  if (file) {
    const untracked = await gitExec(root, ['status', '--porcelain=v1', '-uall', '--', file]).catch(() => '');
    if (untracked.includes('?')) {
      return `(new untracked file)\n${tracked}`;
    }
  }
  return tracked;
}

export async function gitCommit(root: string, message: string, files?: string[]): Promise<string> {
  const msg = message.trim();
  if (!msg) throw new Error('commit message is required');
  if (files && files.length > 0) {
    await gitExec(root, ['add', '--', ...files]);
  } else {
    await gitExec(root, ['add', '-A']);
  }
  await gitExec(root, ['commit', '-m', msg]);
  const last = await gitExec(root, ['log', '-1', '--oneline']);
  return last.trim();
}

export async function gitPush(root: string): Promise<string> {
  try {
    return await gitExec(root, ['push']);
  } catch (err) {
    const msg = (err as Error).message;
    if (/no upstream|set-upstream|not found|could not read/i.test(msg)) {
      const out = await gitExec(root, ['push', '-u', 'origin', 'HEAD']);
      return out || 'pushed (new upstream)';
    }
    throw err;
  }
}

export async function gitDiscard(root: string, file: string): Promise<string> {
  const st = await gitExec(root, ['status', '--porcelain=v1', '--', file]);
  if (/^\?\?/.test(st)) throw new Error('refusing to delete untracked file — remove it manually');
  // Unstage first: plain `restore --` only reverts the worktree to the INDEX,
  // so staged edits (or a newly staged file) survived "successful" discards.
  await gitExec(root, ['restore', '--staged', '--', file]).catch(() => '');
  return gitExec(root, ['restore', '--', file]);
}

export async function gitInit(root: string): Promise<string> {
  return gitExec(root, ['init']);
}
