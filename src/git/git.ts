import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
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

export async function gitInfo(root: string): Promise<GitInfo> {
  if (!isGitRepo(root)) return { available: false };
  try {
    const head = await gitExec(root, ['status', '--porcelain=v1', '-b', '-uall']);
    const lines = head.split(/\r?\n/).filter(Boolean);
    let branch = '';
    let ahead = 0;
    let behind = 0;
    const files: GitFile[] = [];
    for (const line of lines) {
      if (line.startsWith('## ')) {
        const m = line.slice(3).match(/^([^\s.]+(?:\.{3}[^\s[]+)?)\s*(?:\[ahead\s+(\d+)(?:,\s*behind\s+(\d+))?\]?)?/);
        if (m) {
          branch = m[1] ?? '';
          ahead = Number(m[2] ?? 0);
          behind = Number(m[3] ?? 0);
        }
        continue;
      }
      const xy = line.slice(0, 2);
      const p = line.slice(3).replace(/"$/g, '').replace(/^"/g, '');
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
  const args = ['diff', '--'];
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
  if (st.includes('?')) throw new Error('refusing to delete untracked file — remove it manually');
  return gitExec(root, ['restore', '--', file]);
}

export async function gitInit(root: string): Promise<string> {
  return gitExec(root, ['init']);
}
