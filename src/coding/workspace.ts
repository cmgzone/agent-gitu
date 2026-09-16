/**
 * Transport-independent workspace identity.
 *
 * Gitu today assumes one notion of "the repo": a `cwd`, a git branch, and a
 * worktree under the session root. Cowork already thinks in Docker containers
 * with a `/workspace` mount plus a "My computer" host mode. Neither model may
 * leak into the other, so the coding runtime takes a `WorkspaceRef` instead of
 * assuming `cwd`, and nothing below the adapter needs to know which kind it was
 * handed. That is what later allows one container or VM per employee without
 * touching the orchestrator, the executor, or the policy engine.
 */

export type WorkspaceRef =
  /** A directory on the machine running the runtime. */
  | { type: 'host'; path: string }
  /** An isolated git worktree of `repo`; the unit of concurrent work. */
  | { type: 'worktree'; repo: string; path: string }
  /** A path inside a container; `path` is as the runtime sees it, not the host's. */
  | { type: 'container'; containerId: string; path: string }
  /** A path on another machine (future cloud/VM worker). */
  | { type: 'remote'; machineId: string; path: string };

/**
 * Where the model is told the workspace lives. Cowork teaches `/workspace`, so
 * a container workspace keeps that convention while a host/worktree workspace
 * uses its real path.
 */
export const MODEL_WORKSPACE_ROOT = '/workspace';

/** The root path tools operate against. */
export function workspacePath(ref: WorkspaceRef): string {
  return ref.path;
}

/** The git repository a worktree belongs to, when it is one. */
export function workspaceRepo(ref: WorkspaceRef): string | undefined {
  return ref.type === 'worktree' ? ref.repo : undefined;
}

/**
 * True when the workspace needs no transport: the runtime can read and write it
 * directly. Callers use this to decide whether a remote/container hop is needed
 * rather than assuming a local filesystem.
 */
export function isLocalWorkspace(ref: WorkspaceRef): boolean {
  return ref.type === 'host' || ref.type === 'worktree';
}

/**
 * Stable identity for per-workspace caches and scoping — the code index, the
 * LSP manager, and memory scoping are all keyed by workspace, and two refs that
 * merely look alike (same path, different container) are different workspaces.
 */
export function workspaceKey(ref: WorkspaceRef): string {
  switch (ref.type) {
    case 'host':
      return `host:${ref.path}`;
    case 'worktree':
      return `worktree:${ref.repo}:${ref.path}`;
    case 'container':
      return `container:${ref.containerId}:${ref.path}`;
    case 'remote':
      return `remote:${ref.machineId}:${ref.path}`;
  }
}

/** Human-readable label for logs and UI headers. */
export function describeWorkspace(ref: WorkspaceRef): string {
  switch (ref.type) {
    case 'host':
      return ref.path;
    case 'worktree':
      return `${ref.path} (worktree of ${ref.repo})`;
    case 'container':
      return `${ref.containerId}:${ref.path}`;
    case 'remote':
      return `${ref.machineId}:${ref.path}`;
  }
}

/**
 * Translate a model-supplied path into a workspace-relative one.
 *
 * Models are briefed with `/workspace/...` even when the real root is a host
 * directory, so a path has to be rebased before it reaches a tool. Rebasing is
 * deliberately mechanical: an absolute path that is not inside this workspace
 * is returned untouched for `ProjectGuard` to reject, never silently rewritten
 * into something inside it.
 */
export function normalizeWorkspacePath(ref: WorkspaceRef, candidate: string): string {
  const trimmed = candidate.trim();
  if (!trimmed) return '.';
  // Comparison, not the returned value, is separator- and case-insensitive:
  // Windows paths arrive as `C:\proj`, `C:/proj` or `c:\PROJ`, and a mismatch
  // here would silently leave a model-briefed path unrebaseable.
  const normalize = (value: string): string => value.replace(/\\/g, '/').toLowerCase();
  const target = normalize(trimmed);
  const prefixes = [MODEL_WORKSPACE_ROOT, workspacePath(ref)].filter((prefix) => prefix.length > 0);
  for (const prefix of prefixes) {
    const normalizedPrefix = normalize(prefix);
    if (!normalizedPrefix) continue;
    if (target === normalizedPrefix) return '.';
    // Normalizing preserves length, so the original prefix length is still the
    // correct slice offset into the original, case-preserving path.
    if (target.startsWith(`${normalizedPrefix}/`)) return trimmed.slice(prefix.length + 1) || '.';
  }
  return trimmed;
}
