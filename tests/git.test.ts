import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { gitCommit, gitDiff, gitDiscard, gitInfo, gitInit, isGitRepo } from '../src/git/git.js';
import { gitExec } from '../src/git/git.js';

function makeRepo(): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'hermes-git-'));
  writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: 'git-test' }, null, 2));
  return dir;
}

describe('git integration', () => {
  it('reports unavailable outside a repo, then initializes', async () => {
    const dir = makeRepo();
    expect(isGitRepo(dir)).toBe(false);
    const before = await gitInfo(dir);
    expect(before.available).toBe(false);
    await gitInit(dir);
    expect(isGitRepo(dir)).toBe(true);
    await gitExec(dir, ['config', 'user.email', 'test@hermes.dev']);
    await gitExec(dir, ['config', 'user.name', 'Hermes Test']);
  });

  it('shows working tree, commits, and discards', async () => {
    const dir = makeRepo();
    await gitInit(dir);
    await gitExec(dir, ['config', 'user.email', 'test@hermes.dev']);
    await gitExec(dir, ['config', 'user.name', 'Hermes Test']);

    writeFileSync(path.join(dir, 'a.txt'), 'one\n');
    let info = await gitInfo(dir);
    expect(info.files!.some((f) => f.path === 'a.txt' && f.untracked)).toBe(true);

    await gitCommit(dir, 'first commit');
    info = await gitInfo(dir);
    expect(info.files!.length).toBe(0);
    expect(info.branch).toBeTruthy();

    writeFileSync(path.join(dir, 'a.txt'), 'two\n');
    info = await gitInfo(dir);
    expect(info.files!.some((f) => f.path === 'a.txt')).toBe(true);

    const diff = await gitDiff(dir, 'a.txt');
    expect(diff).toContain('+two');

    await gitDiscard(dir, 'a.txt');
    info = await gitInfo(dir);
    expect(info.files!.length).toBe(0);

    writeFileSync(path.join(dir, 'b.txt'), 'b\n');
    const sha = await gitCommit(dir, 'add only b', ['b.txt']);
    expect(sha).toBeTruthy();
    info = await gitInfo(dir);
    expect(info.files!.length).toBe(0);
  });
});
