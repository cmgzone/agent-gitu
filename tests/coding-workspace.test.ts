import { describe, expect, it } from 'vitest';
import { MODEL_WORKSPACE_ROOT, describeWorkspace, isLocalWorkspace, normalizeWorkspacePath, workspaceKey, workspacePath, workspaceRepo } from '../src/coding/workspace.js';
import type { WorkspaceRef } from '../src/coding/workspace.js';

const host: WorkspaceRef = { type: 'host', path: 'C:\\proj' };
const worktree: WorkspaceRef = { type: 'worktree', repo: 'C:\\proj', path: 'C:\\proj\\.hermes\\worktrees\\t1' };
const container: WorkspaceRef = { type: 'container', containerId: 'abc123', path: MODEL_WORKSPACE_ROOT };
const remote: WorkspaceRef = { type: 'remote', machineId: 'employee-17', path: MODEL_WORKSPACE_ROOT };

describe('workspace identity', () => {
  it('keeps cache keys distinct when the same path means different machines', () => {
    const otherContainer: WorkspaceRef = { type: 'container', containerId: 'def456', path: MODEL_WORKSPACE_ROOT };
    expect(workspaceKey(container)).not.toBe(workspaceKey(otherContainer));
    expect(workspaceKey(container)).not.toBe(workspaceKey(host));
    expect(workspaceKey(host)).toBe('host:C:\\proj');
    expect(workspaceKey(remote)).toBe('remote:employee-17:/workspace');
  });

  it('only treats host and worktree workspaces as directly reachable', () => {
    expect(isLocalWorkspace(host)).toBe(true);
    expect(isLocalWorkspace(worktree)).toBe(true);
    expect(isLocalWorkspace(container)).toBe(false);
    expect(isLocalWorkspace(remote)).toBe(false);
  });

  it('reports the owning repository only for a worktree', () => {
    expect(workspaceRepo(worktree)).toBe('C:\\proj');
    expect(workspaceRepo(host)).toBeUndefined();
    expect(workspacePath(worktree)).toBe('C:\\proj\\.hermes\\worktrees\\t1');
  });

  it('labels each kind for logs and UI headers', () => {
    expect(describeWorkspace(host)).toBe('C:\\proj');
    expect(describeWorkspace(worktree)).toBe('C:\\proj\\.hermes\\worktrees\\t1 (worktree of C:\\proj)');
    expect(describeWorkspace(container)).toBe('abc123:/workspace');
    expect(describeWorkspace(remote)).toBe('employee-17:/workspace');
  });
});

describe('normalizeWorkspacePath', () => {
  it('rebases the path models are briefed with onto a host workspace', () => {
    expect(normalizeWorkspacePath(host, '/workspace/src/index.ts')).toBe('src/index.ts');
    expect(normalizeWorkspacePath(host, '/workspace')).toBe('.');
  });

  it('rebases an absolute host path onto the workspace root', () => {
    expect(normalizeWorkspacePath(host, 'C:\\proj\\src\\cli.ts')).toBe('src\\cli.ts');
    expect(normalizeWorkspacePath(host, 'C:/proj/src/cli.ts')).toBe('src/cli.ts');
    expect(normalizeWorkspacePath(host, 'C:\\proj')).toBe('.');
  });

  it('leaves paths that are outside the workspace untouched for the guard to reject', () => {
    expect(normalizeWorkspacePath(host, 'C:\\elsewhere\\secret.ts')).toBe('C:\\elsewhere\\secret.ts');
    expect(normalizeWorkspacePath(host, 'src/cli.ts')).toBe('src/cli.ts');
    expect(normalizeWorkspacePath(host, '/etc/passwd')).toBe('/etc/passwd');
  });

  it('treats a container workspace root as the rebase boundary', () => {
    expect(normalizeWorkspacePath(container, '/workspace/lib/a.ts')).toBe('lib/a.ts');
    expect(normalizeWorkspacePath(container, 'lib/a.ts')).toBe('lib/a.ts');
  });

  it('falls back to the current directory for empty input', () => {
    expect(normalizeWorkspacePath(host, '')).toBe('.');
    expect(normalizeWorkspacePath(host, '   ')).toBe('.');
  });
});
