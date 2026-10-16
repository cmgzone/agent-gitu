import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createReadStream, existsSync, readdirSync, lstatSync, readlinkSync } from 'node:fs';
import { readFile, lstat } from 'node:fs/promises';
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

const FINGERPRINT_MAX_FILE_BYTES = 256 * 1024;
export interface FingerprintOptions {
  signal?: AbortSignal;
  onProgress?: (checked: number, total: number) => void;
  /** Optional dependency scope; callers validate these project-relative paths. */
  paths?: string[];
}

function inFingerprintScope(relative: string, options: FingerprintOptions): boolean {
  if (!options.paths?.length) return true;
  // Configuration and dependency changes invalidate even focused checks.
  if (!relative.includes('/') && /(?:^\.|^package(?:-lock)?\.json$|lock|config|^(?:Cargo|go|requirements|pyproject|Gemfile|Makefile|Dockerfile))/i.test(relative)) return true;
  return options.paths.some((entry) => entry === '.' || relative === entry || relative.startsWith(entry + '/'));
}
const contentCache = new Map<string, { metadata: string; digest: string }>();

/** Content identity, with bounded memory even for images and other large files. */
async function contentSignature(full: string, options: FingerprintOptions): Promise<string> {
  options.signal?.throwIfAborted();
  // Nanosecond timestamps include change time: restoring mtime after a
  // same-size edit must not reuse the old content hash.
  const metadata = await lstat(full, { bigint: true });
  const stamp = [metadata.dev, metadata.ino, metadata.size, metadata.mtimeNs, metadata.ctimeNs, metadata.mode].join(':');
  const cached = contentCache.get(full);
  if (cached?.metadata === stamp) return cached.digest;
  const hash = createHash('sha256');
  if (metadata.isSymbolicLink()) hash.update('symlink:' + readlinkSync(full));
  else if (metadata.size <= BigInt(FINGERPRINT_MAX_FILE_BYTES)) {
    hash.update(await readFile(full, { signal: options.signal }));
  } else {
    for await (const chunk of createReadStream(full, { signal: options.signal })) hash.update(chunk);
  }
  const after = await lstat(full, { bigint: true });
  const afterStamp = [after.dev, after.ino, after.size, after.mtimeNs, after.ctimeNs, after.mode].join(':');
  if (stamp !== afterStamp) throw new Error('File changed during workspace verification.');
  const digest = hash.digest('hex').slice(0, 16);
  contentCache.set(full, { metadata: stamp, digest });
  return digest;
}

/** Bound simultaneous reads, never the number of files included in proof. */
async function contentSignatures(root: string, paths: string[], options: FingerprintOptions): Promise<{ signatures: string[]; partial: boolean }> {
  const signatures: string[] = [];
  let next = 0,
    partial = false;
  let checked = 0, lastProgress = 0;
  options.onProgress?.(0, paths.length);
  await Promise.all(
    Array.from({ length: Math.min(16, paths.length) }, async () => {
      for (;;) {
        const relative = paths[next++];
        if (relative === undefined) return;
        options.signal?.throwIfAborted();
        try {
          signatures.push(`${relative}:${await contentSignature(path.join(root, relative), options)}`);
        } catch (error) {
          options.signal?.throwIfAborted();
          contentCache.delete(path.join(root, relative));
          if ((error as NodeJS.ErrnoException).code === 'ENOENT') signatures.push(`${relative}:deleted`);
          else {
            partial = true;
            signatures.push(`${relative}:unreadable`);
          }
        }
        checked++;
        if (Date.now() - lastProgress >= 1000) { lastProgress = Date.now(); options.onProgress?.(checked, paths.length); }
      }
    }),
  );
  options.onProgress?.(checked, paths.length);
  return { signatures, partial };
}

export async function getWorkspaceFingerprint(root: string, options: FingerprintOptions = {}): Promise<string> {
  options.signal?.throwIfAborted();
  if (!isGitRepo(root)) {
    // Non-git projects use content identity too: timestamps and identical
    // rewrites must not invalidate valid verification.
    return nonGitFingerprint(root, options);
  }
  try {
    // Hash all tracked+untracked project contents without a file-count ceiling.
    // Hashing only dirty files collapsed the fingerprint to a constant
    // whenever a checkpoint commit flipped the tree clean, falsely marking
    // valid evidence stale — while clean-tree stamps stayed fresh forever.
    // Commits and staging only move bookkeeping state; worktree CONTENT is
    // untouched, so this fingerprint survives them by construction yet still
    // reacts to any real edit, addition, or deletion.
    const listing = await gitExec(root, ['ls-files', '-co', '--exclude-standard', '-z']);
    const paths = [...new Set(listing.split('\0').filter(Boolean))].sort();
    const included: string[] = [];
    for (const p of paths) {
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
      if (inFingerprintScope(normPath, options)) included.push(normPath);
    }
    const { signatures, partial } = await contentSignatures(root, included, options);
    const payload = signatures.sort().join('|');
    const fingerprint = createHash('sha256').update(payload).digest('hex').slice(0, 16);
    return partial ? `partial-${fingerprint}` : fingerprint;
  } catch {
    options.signal?.throwIfAborted();
    return nonGitFingerprint(root, options);
  }
}

export function gitExec(root: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile('git', args, { cwd: root, encoding: 'utf8', windowsHide: true, maxBuffer: 8 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) reject(new Error((stderr || err.message).trim().slice(0, 500)));
      else resolve(stdout);
    });
  });
}

export function isGitRepo(root: string): boolean {
  let current = path.resolve(root);
  for (;;) {
    if (existsSync(path.join(current, '.git'))) return true;
    const parent = path.dirname(current);
    if (parent === current) return false;
    current = parent;
  }
}

const NON_GIT_SKIP = new Set(['.git', '.hermes', 'node_modules', 'coverage', '.cache', '.freebuff']);

/**
 * Fallback fingerprint for non-git workspaces: sorted paths and content hashes.
 * File-count/depth ceilings would silently miss later edits. Symbolic links
 * are fingerprinted as links rather than traversed outside the workspace.
 */
async function nonGitFingerprint(root: string, options: FingerprintOptions): Promise<string> {
  const paths: string[] = [];
  let partial = false;
  const walk = async (dir: string): Promise<void> => {
    options.signal?.throwIfAborted();
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      partial = true;
      return;
    }
    for (const name of entries.sort()) {
      if (NON_GIT_SKIP.has(name)) continue;
      const full = path.join(dir, name);
      let st;
      try {
        st = lstatSync(full);
      } catch {
        partial = true;
        continue;
      }
      if (st.isDirectory()) {
        await walk(full);
      } else {
        const rel = path.relative(root, full).replace(/\\/g, '/');
        if (inFingerprintScope(rel, options)) paths.push(rel);
      }
    }
  };
  try {
    await walk(root);
  } catch {
    options.signal?.throwIfAborted();
    return 'unknown-fp';
  }
  const scanned = await contentSignatures(root, paths, options);
  const fingerprint = createHash('sha256')
    .update(`nogit-v2|${scanned.signatures.sort().join('|')}`)
    .digest('hex')
    .slice(0, 16);
  return partial || scanned.partial ? `partial-${fingerprint}` : fingerprint;
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
