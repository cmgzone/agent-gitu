import { describe, expect, it } from 'vitest';
import { createCliPresenter } from '../src/cli/presenter.js';
import type { CompletionReport, MemoryEntry, ProjectLock, TaskLedgerData } from '../src/types.js';

const project: ProjectLock = {
  name: 'agentgitu',
  repoRoot: '/workspace/agentgitu',
  branch: 'main',
  techStack: ['TypeScript'],
  entrypoints: ['src/cli.ts'],
  testCommand: 'npm test',
  buildCommand: 'npm run build',
  lintCommand: 'npm run lint',
  typecheckCommand: 'npm run typecheck',
  ignorePaths: [],
  lockedAt: '2026-09-01T00:00:00.000Z',
};

const task: TaskLedgerData = {
  schemaVersion: 1,
  taskId: 'task-123',
  goal: 'Improve the terminal interface',
  status: 'executing',
  mode: 'standard',
  project,
  acceptanceCriteria: [{ id: 'c1', text: 'CLI is clearer', evidenceIds: [], satisfied: false }],
  constraints: [],
  nonGoals: [],
  plan: [{ id: 'p1', description: 'Render a useful task summary', verification: 'npm test', status: 'in_progress', attempts: 1 }],
  actions: [],
  evidence: [],
  filesChanged: [],
  checkpoints: [],
  blockers: [],
  createdAt: '2026-09-01T00:00:00.000Z',
  updatedAt: '2026-09-01T00:01:00.000Z',
};

describe('CLI presenter', () => {
  const presenter = createCliPresenter({ color: false, unicode: false, width: 76 });

  it('renders a concise run header without terminal control characters from the goal', () => {
    const rendered = presenter.runHeader({ project: 'agentgitu', provider: 'chatgpt', model: 'gpt-5', mode: 'standard', goal: 'Fix\u001b[31m the CLI' });
    expect(rendered).toContain('Agent Gitu');
    expect(rendered).toContain('verified workflow');
    expect(rendered).toContain('Fix[31m the CLI');
    expect(rendered).not.toContain('\u001b');
  });

  it('turns raw orchestrator events into stable terminal status lines', () => {
    expect(presenter.event('context  4 primary, 2 tests selected')).toContain('CONTEXT');
    expect(presenter.event('error  test failed')).toContain('ERROR');
    expect(presenter.event('done     completed — verified')).toContain('DONE');
  });

  it('renders saved tasks as a scannable table and details as a focused view', () => {
    expect(presenter.taskList([task])).toContain('Improve the terminal interface');
    const details = presenter.taskDetails(task);
    expect(details).toContain('Task task-123');
    expect(details).toContain('Render a useful task summary');
    expect(details).not.toContain('"schemaVersion"');
  });

  it('renders project memory with lifecycle and scope information', () => {
    const entry: MemoryEntry = {
      id: 'm1',
      type: 'project_convention',
      claim: 'Run npm test before completing work',
      scope: 'agentgitu',
      confidence: 0.9,
      createdAt: '2026-09-01T00:00:00.000Z',
      visibility: 'project',
      status: 'verified',
    };
    const rendered = presenter.memoryList([entry]);
    expect(rendered).toContain('project_convention');
    expect(rendered).toContain('verified');
    expect(rendered).toContain('Run npm test before completing work');
  });

  it('summarizes completion with verification and quality', () => {
    const report: CompletionReport = {
      taskId: 'task-123',
      goal: task.goal,
      status: 'complete',
      summary: 'The terminal interface is clearer.',
      changes: [],
      filesChanged: ['src/cli.ts'],
      verification: ['PASS [test] npm test'],
      verificationDetails: [{ id: 'e1', kind: 'test', label: 'npm test', passed: true, authority: 'latest' }],
      qualityMetrics: {
        score: 94,
        criteria: { total: 1, satisfied: 1, coverage: 1 },
        verification: { authoritative: 1, passing: 1, failing: 0, passRate: 1 },
      },
      evidence: [],
      remainingRisks: [],
      followUps: [],
      generatedAt: '2026-09-01T00:00:00.000Z',
    };
    const rendered = presenter.completion(report);
    expect(rendered).toContain('1/1 current checks passed');
    expect(rendered).toContain('94/100 outcome quality');
  });
});
