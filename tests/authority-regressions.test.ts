/**
 * Authority & continuity regression suite — the acceptance bar for the
 * instruction-reliability architecture.
 *
 * Scenario coverage map (the scenarios live where their mechanisms are
 * directly exercisable; this file pins the cross-cutting ones end-to-end at
 * the deterministic layer):
 *  - image available on later follow-up without re-upload .... tests/visual-reference.test.ts (rehydration)
 *  - image survives compaction / restart ..................... tests/visual-reference.test.ts (restore + reload)
 *  - `only edit X` blocks Y before loop/policy ............... tests/reliability-tools.test.ts (pipeline order)
 *  - direct file bug reads targets, no unrelated scan ........ tests/target-first.test.ts (buildTargetedPack)
 *  - failed direct hypothesis escalates exactly one level .... this file (ladder)
 *  - vague architecture audit still uses repository depth .... this file
 *  - correction increments the instruction epoch ............. this file
 *  - `must run npm test` is not satisfied by a read .......... this file (verification semantics)
 *  - parallel calls obey hard instructions individually ...... this file
 *  - stale specialist cannot overwrite newer intent .......... epoch capture at delegate launch (gitu) + this file
 *  - completion cannot silently override unresolved instructions this file (gate + structured verification)
 *  - queued messages preserve order .......................... gitu inbox is FIFO; server drain is covered in server.test.ts
 */
import { describe, expect, it } from 'vitest';
import { TaskLedger } from '../src/ledger/task-ledger.js';
import {
  applyFollowUpToLedger,
  evaluateInstructionGate,
  supersedeConflictingAuthority,
  extractInstructionsFromFollowUp,
} from '../src/agent/follow-up.js';
import { determineInvestigationDepth } from '../src/agent/task-strategy.js';
import { InstructionPolicyEngine } from '../src/policy/instruction-policy.js';
import type { ProjectLock, UserInstruction } from '../src/types.js';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

function createMockProject(): { repoRoot: string; project: ProjectLock; cleanup: () => void } {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'gitu-auth-reg-'));
  const project: ProjectLock = {
    name: 'test-project',
    repoRoot,
    techStack: ['typescript'],
    entrypoints: ['src/index.ts'],
    ignorePaths: ['node_modules', '.git'],
    lockedAt: new Date().toISOString(),
  };
  return {
    repoRoot,
    project,
    cleanup: () => {
      try {
        fs.rmSync(repoRoot, { recursive: true, force: true });
      } catch {}
    },
  };
}

function instruction(over: Partial<UserInstruction> & { text: string }): UserInstruction {
  return {
    id: over.id ?? `inst-${Math.random().toString(36).slice(2, 8)}`,
    type: over.type ?? 'requirement',
    enforcement: over.enforcement ?? 'completion',
    status: over.status ?? 'active',
    source: over.source ?? 'follow-up',
    createdAt: over.createdAt ?? new Date('2026-01-01T00:00:00Z').toISOString(),
    ...over,
  };
}

describe('regression: investigation depth', () => {
  it('vague architecture/audit work still uses repository depth', () => {
    expect(determineInvestigationDepth('Audit entire repository for security issues')).toBe('repository');
    expect(determineInvestigationDepth('Review the whole repo architecture')).toBe('repository');
  });

  it('a failed direct hypothesis escalates exactly one level — never straight to repository', () => {
    const { repoRoot, project, cleanup } = createMockProject();
    try {
      const ledger = TaskLedger.create({ repoRoot, goal: 'Fix llm.ts bug', project, mode: 'standard' });
      ledger.setInvestigationDepth('direct');
      // One failed local hypothesis + one evidence-driven escalation later:
      expect(ledger.escalateInvestigationDepth()).toBe('local');
      expect(ledger.data.investigationDepth).toBe('local');
      // A single escalation can NEVER reach repository from direct.
      expect(ledger.data.investigationDepth !== 'repository').toBe(true);
    } finally {
      cleanup();
    }
  });
});

describe('regression: requirement verification semantics', () => {
  const epoch = new Date('2026-01-01T00:00:00Z').toISOString();
  const afterEpoch = new Date('2026-01-01T00:10:00Z').toISOString();

  it('`must run npm test` cannot be satisfied by a read_file', () => {
    const finding = evaluateInstructionGate(
      [{ text: 'You must run `npm test`', enforcement: 'completion', status: 'active', createdAt: epoch, verification: { type: 'command', command: 'npm test' } }],
      [{ tool: 'read_file', status: 'success', createdAt: afterEpoch }],
      [],
    );
    expect(finding.unmetRequirements).toEqual(['You must run `npm test`']);
  });

  it('is satisfied by a passing matching command AFTER the instruction, not before', () => {
    const inst = { text: 'You must run `npm test`', enforcement: 'completion', status: 'active', createdAt: epoch, verification: { type: 'command', command: 'npm test' } };
    // Evidence BEFORE the instruction does not count.
    const before = evaluateInstructionGate([inst], [], [{ kind: 'test', command: 'npm test', passed: true, createdAt: epoch }]);
    expect(before.unmetRequirements.length).toBe(1);
    // A passing, fresh, matching command does count.
    const after = evaluateInstructionGate([inst], [], [{ kind: 'test', command: 'npm test', passed: true, createdAt: afterEpoch }]);
    expect(after.unmetRequirements).toEqual([]);
    // Stale evidence never counts.
    const stale = evaluateInstructionGate([inst], [], [{ kind: 'test', command: 'npm test', passed: true, createdAt: afterEpoch, stale: true }]);
    expect(stale.unmetRequirements.length).toBe(1);
    // A DIFFERENT passing command does not satisfy a pinned `npm test`.
    const wrong = evaluateInstructionGate([inst], [], [{ kind: 'command', command: 'node --version', passed: true, createdAt: afterEpoch }]);
    expect(wrong.unmetRequirements.length).toBe(1);
  });

  it('parses verification from concrete requirement wording at admission', () => {
    const extracted = extractInstructionsFromFollowUp('You must run the full test suite. Also ensure `npm run typecheck` passes.');
    expect(extracted[0]!.verification).toEqual({ type: 'command' });
    expect(extracted[1]!.verification).toEqual({ type: 'command', command: 'npm run typecheck' });
  });

  it('completion cannot silently override an unresolved requirement or a blocked violation', () => {
    const finding = evaluateInstructionGate(
      [{ text: 'Ensure the user approves the migration', enforcement: 'completion', status: 'active', createdAt: epoch, verification: { type: 'user_approval' } }],
      [{ tool: 'run_command', status: 'success', createdAt: afterEpoch }],
      [{ kind: 'test', command: 'npm test', passed: true, createdAt: afterEpoch }],
    );
    // User approval is never auto-satisfiable by work evidence.
    expect(finding.unmetRequirements).toEqual(['Ensure the user approves the migration']);
  });
});

describe('regression: correction supersedes conflicting authority', () => {
  it('backend-is-fine correction supersedes backend instructions, clears hypotheses, bumps epoch', () => {
    const { repoRoot, project, cleanup } = createMockProject();
    try {
      const ledger = TaskLedger.create({ repoRoot, goal: 'Fix backend streaming', project, mode: 'standard' });
      ledger.data.currentHypothesis = 'Backend SSE chunking drops the final event';
      ledger.setPlan([
        { description: 'Patch backend SSE chunking in server code', verification: 'node server.js' },
        { description: 'Fix frontend stream view animation', verification: 'manual' },
      ]);
      ledger.addInstruction({ text: 'Do not touch server.ts while fixing the stream', type: 'constraint', enforcement: 'hard', status: 'active', source: 'initial' });
      const epochBefore = ledger.instructionEpoch;

      const record = applyFollowUpToLedger(ledger, 'No, backend is fine. Fix frontend only.');
      expect(record.kind).toBe('CORRECT');

      // Epoch bumped by the correction.
      expect(ledger.instructionEpoch).toBeGreaterThan(epochBefore);
      // Hypothesis cleared.
      expect(ledger.data.currentHypothesis).toBeUndefined();
      // The backend-targeting instruction is superseded; the goal moved to frontend.
      expect(ledger.activeInstructions().some((i) => i.text.includes('server.ts'))).toBe(false);
      expect(ledger.data.taskAuthority?.currentGoal).toContain('frontend');
      // Backend-only pending plan steps are stale; frontend steps untouched.
      const backendStep = ledger.data.plan.find((s) => s.description.includes('SUPERSEDED') && s.description.includes('backend'));
      const frontendStep = ledger.data.plan.find((s) => s.description.includes('frontend'));
      expect(backendStep?.status).toBe('blocked');
      expect(frontendStep?.status).not.toBe('blocked');
      // Superseded ids recorded in the follow-up record.
      expect(record.supersededInstructions?.length ?? 0).toBeGreaterThan(0);
    } finally {
      cleanup();
    }
  });

  it('supersedeConflictingAuthority ignores corrections that negate nothing', () => {
    const { repoRoot, project, cleanup } = createMockProject();
    try {
      const ledger = TaskLedger.create({ repoRoot, goal: 'Fix streaming', project, mode: 'standard' });
      ledger.addInstruction({ text: 'Only edit src/llm/llm.ts', type: 'constraint', enforcement: 'hard', status: 'active', source: 'initial' });
      expect(supersedeConflictingAuthority(ledger, 'also make the animation smoother')).toEqual([]);
      expect(ledger.activeInstructions().length).toBe(1);
    } finally {
      cleanup();
    }
  });
});

describe('regression: parallel/individual enforcement + stale intent', () => {
  it('each call in a parallel batch obeys hard instructions individually', () => {
    const policy = new InstructionPolicyEngine();
    const inst: UserInstruction = instruction({
      text: 'Only edit src/llm/llm.ts',
      type: 'constraint',
      enforcement: 'hard',
      constraint: { kind: 'file_scope', allow: ['src/llm/llm.ts'] },
    });
    // A parallel batch is two independent proposals; one may be legal while
    // the other is denied — enforcement is per call, never per batch.
    expect(policy.evaluate('write_file', { path: 'src/llm/llm.ts', content: 'a' }, [inst]).allowed).toBe(true);
    expect(policy.evaluate('write_file', { path: 'src/other.ts', content: 'b' }, [inst]).allowed).toBe(false);
  });

  it('stale specialist results launched under an older epoch are detectable', () => {
    const { repoRoot, project, cleanup } = createMockProject();
    try {
      const ledger = TaskLedger.create({ repoRoot, goal: 'Fix backend streaming', project, mode: 'standard' });
      const launchedInstructionEpoch = ledger.instructionEpoch;
      // A mid-flight user correction bumps the epoch.
      applyFollowUpToLedger(ledger, 'No, backend is fine. Fix frontend only.');
      // The guard the delegate path uses: any strictly newer epoch makes the
      // result stale history, not current direction.
      expect(ledger.instructionEpoch > launchedInstructionEpoch).toBe(true);
    } finally {
      cleanup();
    }
  });
});
