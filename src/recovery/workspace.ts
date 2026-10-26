import { constants } from 'node:fs';
import { access, realpath, stat } from 'node:fs/promises';
import path from 'node:path';
import type { ProjectGuard } from '../guard/project-guard.js';
import type { MissingPrerequisite } from '../types.js';

/** Legacy models used resource/target for a local workspace. Never treat a
 * provider's remote repository or desktop as the host's selected checkout. */
export function isWorkspacePrerequisite(prerequisite: MissingPrerequisite): boolean {
  if (prerequisite.kind === 'workspace') return true;
  if (prerequisite.providerHint) return false;
  if (/\b(remote|github|gitlab|bitbucket|container|private desktop)\b/i.test(prerequisite.description)) return false;
  return /\b(workspace|repository|repo|project folder|working directory|cwd)\b/i.test(prerequisite.description)
    && /\b(open|select|choose|access|writ(?:e|able)|read.only|command|execution|outside|available)\b/i.test(prerequisite.description);
}

export function isWorkspaceIdentityQuestion(question: { question: string; header?: string; detail?: string }): boolean {
  const text = [question.header, question.question, question.detail].filter(Boolean).join(' ');
  return /\b(workspace|folder|directory|cwd)\b/i.test(text) && /\b(wrong|incorrect|mismatch(?:ed)?|different project|different repository|does not match|doesn't match|not the (?:requested|intended))\b/i.test(text);
}

export function isWorkspaceQuestion(question: { question: string; header?: string; detail?: string; kind?: string }): boolean {
  return question.kind === 'workspace' || isWorkspaceIdentityQuestion(question) || isWorkspacePrerequisite({ id: 'question', kind: 'target', description: question.question, requiredFor: '' });
}

export function isWorkspacePath(value: string): boolean {
  return path.isAbsolute(value.trim()) || path.win32.isAbsolute(value.trim());
}

export function matchesSelectedWorkspace(requested: string | undefined, selected: string): boolean {
  if (!requested) return true;
  if (!path.isAbsolute(requested)) return false;
  const fold = (value: string) => process.platform === 'win32' ? value.toLowerCase() : value;
  return fold(path.resolve(requested)) === fold(path.resolve(selected));
}

export interface WorkspaceAccess {
  path: string;
  exists: boolean;
  readable: boolean;
  writable: boolean;
  /** A usable working directory for run_command, which still applies policy. */
  executable: boolean;
}

export function workspaceReady(workspace: WorkspaceAccess, request: string): boolean {
  const readOnly = /\b(read.only|reference|inspect|read)\b/i.test(request)
    && !/\b(writ\w*|edit\w*|implement\w*|modify|fix|command\w*|execut\w*|shell|test|verify|build)\b/i.test(request);
  return workspace.exists && workspace.readable && (readOnly || workspace.writable && workspace.executable);
}

/** Probe only a host-authorized candidate. Model strings are never grants.
 * OS access is necessary, but doesn't replace ProjectGuard or command approval. */
export async function inspectWorkspace(candidate: string, guard: ProjectGuard): Promise<WorkspaceAccess> {
  const result: WorkspaceAccess = { path: candidate, exists: false, readable: false, writable: false, executable: false };
  if (!path.isAbsolute(candidate)) return result;
  try {
    const canonical = await realpath(candidate);
    if (!(await stat(canonical)).isDirectory()) return result;
    await guard.assertReadableAsync(canonical);
    result.path = canonical;
    result.exists = true;
    const check = async (mode: number): Promise<boolean> => access(canonical, mode).then(() => true, () => false);
    result.readable = await check(constants.R_OK);
    try { guard.assertInside(canonical); result.writable = await check(constants.W_OK); } catch { /* read grant only */ }
    // Folder tags authorize file tools, not arbitrary command working directories.
    result.executable = guard.isInsideProject(canonical) && result.readable
      && (process.platform === 'win32' || await check(constants.X_OK));
    await guard.assertReadableAsync(canonical);
    if (result.writable) { try { guard.assertInside(canonical); } catch { result.writable = false; } }
  } catch {
    // Revocation or retargeting during asynchronous checks invalidates the probe.
    result.exists = false; result.readable = false; result.writable = false; result.executable = false;
  }
  return result;
}

export function workspaceAccessSummary(workspace: WorkspaceAccess): string {
  return `Selected workspace: ${workspace.path}. Directory ${workspace.exists ? 'exists' : 'missing or outside granted access'}; `
    + `read ${workspace.readable ? 'available' : 'unavailable'}; file writes ${workspace.writable ? 'available' : 'unavailable'}; `
    + `command working directory ${workspace.executable ? 'available' : 'unavailable'}. `
    + 'Gitu file tools use this directory. The model transport sandbox is separate. Each write and command still passes the existing approval policy; these checks grant no permissions.';
}

export function workspaceUserDetail(workspace: WorkspaceAccess): string {
  return `Project: ${workspace.path}. Read access: ${workspace.readable ? 'available' : 'unavailable'}. `
    + `File writes: ${workspace.writable ? 'available' : 'unavailable'}. `
    + `Command directory: ${workspace.executable ? 'ready' : 'unavailable'}. `
    + 'Existing approvals still apply. Replying does not grant access.';
}

/** Only actual accessible directories under existing grants can become choices.
 * Keep distinct full paths (same basename need not mean the same repository). */
export async function workspaceQuestionOptions(options: readonly string[], guard: ProjectGuard, request = 'writable workspace with command execution'): Promise<string[]> {
  const verified: string[] = [];
  const seen = new Set<string>();
  for (const option of options.slice(0, 12)) {
    const workspace = await inspectWorkspace(option, guard);
    if (!workspaceReady(workspace, request)) continue;
    const key = process.platform === 'win32' ? workspace.path.toLowerCase() : workspace.path;
    if (seen.has(key)) continue;
    seen.add(key);
    verified.push(workspace.path);
  }
  return verified.slice(0, 6);
}
