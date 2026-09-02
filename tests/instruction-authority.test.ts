import { describe, expect, it } from 'vitest';
import { TaskLedger } from '../src/ledger/task-ledger.js';
import { InstructionPolicyEngine } from '../src/policy/instruction-policy.js';
import { ProjectGuard } from '../src/guard/project-guard.js';
import { buildStateMessage } from '../src/agent/prompt.js';
import { computeBehaviorMetrics } from '../src/agent/telemetry.js';
import type { ProjectLock } from '../src/types.js';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

function createMockProject(): { repoRoot: string; guard: ProjectGuard; project: ProjectLock; cleanup: () => void } {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'gitu-inst-test-'));
  const project: ProjectLock = {
    name: 'test-project',
    repoRoot,
    techStack: ['typescript', 'node'],
    entrypoints: ['src/index.ts'],
    ignorePaths: ['node_modules', '.git'],
    lockedAt: new Date().toISOString(),
  };
  const guard = new ProjectGuard(project);
  return {
    repoRoot,
    guard,
    project,
    cleanup: () => {
      try {
        fs.rmSync(repoRoot, { recursive: true, force: true });
      } catch {}
    },
  };
}

describe('Instruction Authority & Policy Enforcement', () => {
  it('records, supersedes, and queries hard instructions in TaskLedger', () => {
    const { repoRoot, project, cleanup } = createMockProject();
    try {
      const ledger = TaskLedger.create({
        repoRoot,
        goal: 'Fix streaming',
        project,
        mode: 'standard',
      });

      const inst1 = ledger.addInstruction({
        text: 'Only edit src/llm/llm.ts',
        type: 'constraint',
        enforcement: 'hard',
        status: 'active',
        source: 'initial',
      });

      expect(ledger.activeInstructions().length).toBe(1);
      expect(ledger.hardInstructions().length).toBe(1);
      expect(ledger.hardInstructions()[0]!.id).toBe(inst1.id);

      const inst2 = ledger.addInstruction({
        text: 'Allow editing src/llm/providers.ts',
        type: 'constraint',
        enforcement: 'hard',
        status: 'active',
        source: 'follow-up',
        supersedes: [inst1.id],
      });

      expect(ledger.activeInstructions().length).toBe(1);
      expect(ledger.activeInstructions()[0]!.id).toBe(inst2.id);
      expect(ledger.data.taskAuthority?.instructions.find((i) => i.id === inst1.id)?.status).toBe('superseded');
    } finally {
      cleanup();
    }
  });

  it('InstructionPolicyEngine blocks write_file outside "only edit <file>" boundary', () => {
    const policy = new InstructionPolicyEngine();
    const hardInstructions = [
      {
        id: 'inst-1',
        text: 'Only edit src/llm/llm.ts',
        type: 'constraint' as const,
        enforcement: 'hard' as const,
        status: 'active' as const,
        source: 'initial' as const,
        createdAt: new Date().toISOString(),
      },
    ];

    // Allowed edit to llm.ts
    const allowed = policy.evaluate('write_file', { path: 'src/llm/llm.ts', content: 'export {}' }, hardInstructions);
    expect(allowed.allowed).toBe(true);

    // Blocked edit to server.ts
    const blocked = policy.evaluate('write_file', { path: 'src/server/server.ts', content: 'export {}' }, hardInstructions);
    expect(blocked.allowed).toBe(false);
    expect(blocked.reason).toContain('USER INSTRUCTION VIOLATION');
    expect(blocked.reason).toContain('restricts edits to');
  });

  it('InstructionPolicyEngine blocks modifying forbidden paths ("don\'t modify backend")', () => {
    const policy = new InstructionPolicyEngine();
    const hardInstructions = [
      {
        id: 'inst-2',
        text: "Don't modify backend",
        type: 'constraint' as const,
        enforcement: 'hard' as const,
        status: 'active' as const,
        source: 'follow-up' as const,
        createdAt: new Date().toISOString(),
      },
    ];

    const blocked = policy.evaluate('apply_edit', { path: 'src/backend/server.ts', oldString: 'a', newString: 'b' }, hardInstructions);
    expect(blocked.allowed).toBe(false);
    expect(blocked.reason).toContain('prohibits modifying');

    const allowed = policy.evaluate('apply_edit', { path: 'src/frontend/app.tsx', oldString: 'a', newString: 'b' }, hardInstructions);
    expect(allowed.allowed).toBe(true);
  });

  it('InstructionPolicyEngine blocks package installation commands', () => {
    const policy = new InstructionPolicyEngine();
    const hardInstructions = [
      {
        id: 'inst-3',
        text: 'Do not install packages',
        type: 'constraint' as const,
        enforcement: 'hard' as const,
        status: 'active' as const,
        source: 'initial' as const,
        createdAt: new Date().toISOString(),
      },
    ];

    const blockedNpm = policy.evaluate('run_command', { command: 'npm install lodash' }, hardInstructions);
    expect(blockedNpm.allowed).toBe(false);
    expect(blockedNpm.reason).toContain('prohibits installing packages');

    const blockedPnpm = policy.evaluate('run_command', { command: 'pnpm add axios' }, hardInstructions);
    expect(blockedPnpm.allowed).toBe(false);

    const allowedTest = policy.evaluate('run_command', { command: 'npm test' }, hardInstructions);
    expect(allowedTest.allowed).toBe(true);
  });

  it('InstructionPolicyEngine blocks specialist delegation when instructed', () => {
    const policy = new InstructionPolicyEngine();
    const hardInstructions = [
      {
        id: 'inst-4',
        text: "Don't use specialists",
        type: 'constraint' as const,
        enforcement: 'hard' as const,
        status: 'active' as const,
        source: 'initial' as const,
        createdAt: new Date().toISOString(),
      },
    ];

    const blocked = policy.evaluate('delegate', { tasks: [{ agent: 'explore', task: 'check files' }] }, hardInstructions);
    expect(blocked.allowed).toBe(false);
    expect(blocked.reason).toContain('prohibits specialist delegation');
  });

  it('InstructionPolicyEngine blocks web browsing when instructed', () => {
    const policy = new InstructionPolicyEngine();
    const hardInstructions = [
      {
        id: 'inst-5',
        text: "Don't browse the web",
        type: 'constraint' as const,
        enforcement: 'hard' as const,
        status: 'active' as const,
        source: 'initial' as const,
        createdAt: new Date().toISOString(),
      },
    ];

    const blockedFetch = policy.evaluate('web_fetch', { url: 'https://google.com' }, hardInstructions);
    expect(blockedFetch.allowed).toBe(false);

    const blockedBrowse = policy.evaluate('browse', { action: 'navigate', url: 'https://docs.com' }, hardInstructions);
    expect(blockedBrowse.allowed).toBe(false);
  });

  it('renders TASK AUTHORITY at the top of buildStateMessage with strict precedence', () => {
    const { repoRoot, project, cleanup } = createMockProject();
    try {
      const ledger = TaskLedger.create({
        repoRoot,
        goal: 'Initial Goal',
        project,
        mode: 'standard',
      });

      ledger.setCurrentGoal('Refined Goal');
      ledger.addInstruction({
        text: 'Do not modify database',
        type: 'constraint',
        enforcement: 'hard',
        status: 'active',
        source: 'follow-up',
      });

      const stateMsg = buildStateMessage(ledger);
      expect(stateMsg.startsWith('TASK AUTHORITY')).toBe(true);
      expect(stateMsg).toContain('CURRENT USER INTENT:\nRefined Goal');
      expect(stateMsg).toContain('ACTIVE HARD INSTRUCTIONS (MANDATORY ENFORCEMENT):\n- Do not modify database');
    } finally {
      cleanup();
    }
  });

  it('computes behavior metrics: reads before first edit and blocked instruction violations', () => {
    const actions = [
      { tool: 'read_file', status: 'success', paramsSummary: 'src/a.ts' },
      { tool: 'read_file', status: 'success', paramsSummary: 'src/b.ts' },
      { tool: 'read_file', status: 'success', paramsSummary: 'src/a.ts' },
      { tool: 'write_file', status: 'denied', observation: 'DENIED by user instruction policy: hard instruction forbids writes' },
      { tool: 'delegate', status: 'success', paramsSummary: 'explore' },
      { tool: 'apply_edit', status: 'success', paramsSummary: 'src/a.ts' },
    ];
    const metrics = computeBehaviorMetrics(actions, 2);
    expect(metrics.filesReadBeforeFirstEdit).toBe(2);
    expect(metrics.turnsBeforeFirstEdit).toBe(5);
    expect(metrics.specialistsBeforeFirstEdit).toBe(1);
    expect(metrics.instructionViolationsBlocked).toBe(1);
    expect(metrics.imagesRetained).toBe(2);

    // A run that never edits reports undefined investigation metrics but still counts blocks.
    const noEdit = computeBehaviorMetrics([{ tool: 'read_file', status: 'success', paramsSummary: 'src/a.ts' }], 0);
    expect(noEdit.turnsBeforeFirstEdit).toBeUndefined();
    expect(noEdit.instructionViolationsBlocked).toBe(0);
  });
});
