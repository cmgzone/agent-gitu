import { afterEach, describe, expect, it, vi } from 'vitest';
import { HermesServer } from '../src/server/server.js';
import { ProjectGuard } from '../src/guard/project-guard.js';

type RecoveryServer = {
  resolveTaskRoot(task: string, project?: string, roots?: Map<string, string | undefined>): string | undefined;
};

function server(): RecoveryServer {
  return Object.assign(Object.create(HermesServer.prototype), {
    config: { cwd: '/fallback' }, sessions: new Map(),
  }) as RecoveryServer;
}

afterEach(() => vi.restoreAllMocks());

describe('startup project recovery', () => {
  it('checks a repeated project once during recovery and checks afresh afterwards', () => {
    const detect = vi.spyOn(ProjectGuard, 'detect').mockImplementation(project => ({ lock: { repoRoot: project + '/root' } }) as ProjectGuard);
    const instance = server(), roots = new Map<string, string | undefined>();
    for (let i = 0; i < 430; i++) expect(instance.resolveTaskRoot('task-' + i, '/project', roots)).toBe('/project/root');
    expect(detect).toHaveBeenCalledTimes(1);
    instance.resolveTaskRoot('current-task', '/project');
    expect(detect).toHaveBeenCalledTimes(2);
  });

  it('remembers missing projects during recovery while preserving the fallback', () => {
    const detect = vi.spyOn(ProjectGuard, 'detect').mockImplementation(project => {
      if (project === '/missing') throw new Error('Project no longer exists');
      return { lock: { repoRoot: '/fallback/root' } } as ProjectGuard;
    });
    const instance = server(), roots = new Map<string, string | undefined>();
    expect(instance.resolveTaskRoot('first', '/missing', roots)).toBe('/fallback/root');
    expect(instance.resolveTaskRoot('second', '/missing', roots)).toBe('/fallback/root');
    expect(detect).toHaveBeenCalledTimes(2);
    expect(instance.resolveTaskRoot('third', '/other', roots)).toBe('/fallback/root');
    expect(detect).toHaveBeenCalledTimes(3);
  });
});
