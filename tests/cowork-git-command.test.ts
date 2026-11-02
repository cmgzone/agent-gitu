import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { toolRunCommand } from '../src/tools/tools.js';
import { executeCoworkTool } from '../src/cowork/tools.js';
import { ProjectGuard } from '../src/guard/project-guard.js';
import { saveRuntimeSelection } from '../src/workspace/runtime-selection.js';
import { isDeploymentAction, deploymentIntent } from '../src/coding/deployment-authority.js';

describe('Cowork git operations and run_command cwd resolution', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'cowork-git-test-'));
  writeFileSync(path.join(root, 'package.json'), '{"name":"test-root"}');
  afterAll(() => rmSync(root, { recursive: true, force: true }));

  it('recognizes git push as a deployment action and push as deployment intent', () => {
    expect(isDeploymentAction('run_command', { command: 'git push origin main' })).toBe(true);
    expect(isDeploymentAction('run_command', { command: 'git push' })).toBe(true);
    expect(deploymentIntent('please push to github')).toBe(true);
    expect(deploymentIntent('git push on main')).toBe(true);
  });

  it('allows git commands in executeCoworkTool without rejecting as repository coding', async () => {
    const guard = ProjectGuard.detect(root);
    const ctx = { cwd: root, guard };
    const perms = { allowShell: true, allowWrites: true, allowConfig: true };
    const scope = {
      conversationId: 'test-conv',
      agent: { id: 'agent-1', name: 'Atlas', systemPrompt: '', allowShell: true, allowWrites: true, useHostComputer: true, skills: [] },
      delegation: { run: async () => ({ ok: true, output: '' }), start: async () => ({ ok: true, output: '' }) },
      isSubAgent: false,
    };

    // A normal code command like `npm test` without delegation triggers the coding ownership guard
    const codeResult = await executeCoworkTool(ctx as any, 'run_command', { command: 'npm test' }, perms, scope as any);
    expect(codeResult.ok).toBe(false);
    expect(codeResult.output).toContain('Main Agent Gitu owns repository coding');

    // But git push, git commit, git status, git add must NOT be blocked
    const gitPushResult = await executeCoworkTool(ctx as any, 'run_command', { command: 'git push origin main' }, perms, scope as any);
    // Git push will fail with git error (remote or repo), but NOT with "Main Agent Gitu owns repository coding"
    expect(gitPushResult.output).not.toContain('Main Agent Gitu owns repository coding');

    const gitCommitResult = await executeCoworkTool(ctx as any, 'run_command', { command: 'git commit -m "update"' }, perms, scope as any);
    expect(gitCommitResult.output).not.toContain('Main Agent Gitu owns repository coding');

    const gitStatusResult = await executeCoworkTool(ctx as any, 'run_command', { command: 'git status' }, perms, scope as any);
    expect(gitStatusResult.output).not.toContain('Main Agent Gitu owns repository coding');
  });

  it('runs run_command with explicit cwd parameter', async () => {
    const subDir = path.join(root, 'subdir');
    mkdirSync(subDir, { recursive: true });
    writeFileSync(path.join(subDir, 'package.json'), '{"name":"subdir-pkg"}');
    const guard = ProjectGuard.detect(root);

    const ctx = {
      cwd: root,
      guard,
    };

    const res = await toolRunCommand(ctx as any, {
      command: process.platform === 'win32' ? 'cmd /c cd' : 'pwd',
      cwd: 'subdir',
      waitMs: 5000,
    });

    expect(res.ok).toBe(true);
    expect(String(res.output).toLowerCase()).toContain('subdir');
  });

  it('auto-resolves git commands to active runtime project when workspace has no .git', async () => {
    const workspaceDir = path.join(root, 'non-git-workspace');
    const projectRepoDir = path.join(root, 'actual-git-repo');
    mkdirSync(workspaceDir, { recursive: true });
    mkdirSync(projectRepoDir, { recursive: true });
    execFileSync('git', ['init', '-b', 'main'], { cwd: projectRepoDir, stdio: 'ignore' });
    writeFileSync(path.join(workspaceDir, 'package.json'), '{"name":"workspace"}');
    writeFileSync(path.join(projectRepoDir, 'package.json'), '{"name":"repo"}');

    saveRuntimeSelection({ projectPath: projectRepoDir });

    const guard = ProjectGuard.detect(workspaceDir);
    guard.setTaggedReadFolders(() => [projectRepoDir]);
    guard.setTaggedWriteFolders(() => [projectRepoDir]);

    const ctx = {
      cwd: workspaceDir,
      guard,
    };

    const res = await toolRunCommand(ctx as any, {
      command: 'git rev-parse --is-inside-work-tree',
      waitMs: 5000,
    });

    expect(res.ok).toBe(true);
    expect(String(res.output).trim()).toBe('true');
  });
});
