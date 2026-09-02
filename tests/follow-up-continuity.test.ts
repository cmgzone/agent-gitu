import { describe, expect, it } from 'vitest';
import { classifyFollowUp, extractTargetHints, extractInstructionsFromFollowUp, applyFollowUpToLedger, evaluateInstructionGate } from '../src/agent/follow-up.js';
import { TaskLedger } from '../src/ledger/task-ledger.js';
import type { ProjectLock } from '../src/types.js';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

function createMockProject(): { repoRoot: string; project: ProjectLock; cleanup: () => void } {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'gitu-fu-test-'));
  const project: ProjectLock = {
    name: 'test-project',
    repoRoot,
    techStack: ['typescript'],
    entrypoints: ['src/index.ts'],
    ignorePaths: ['node_modules'],
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

describe('Follow-up Continuity & Delta Routing', () => {
  it('classifies various user intent categories accurately', () => {
    expect(classifyFollowUp('continue').kind).toBe('CONTINUE');
    expect(classifyFollowUp('proceed').kind).toBe('CONTINUE');
    expect(classifyFollowUp('finish it').kind).toBe('CONTINUE');

    expect(classifyFollowUp('make the cards smaller').kind).toBe('REFINE');
    expect(classifyFollowUp('the typing is still delayed').kind).toBe('REFINE');

    expect(classifyFollowUp('No, backend is fine. The problem is the frontend.').kind).toBe('CORRECT');
    expect(classifyFollowUp('Actually, use src/llm/llm.ts instead').kind).toBe('CORRECT');

    expect(classifyFollowUp("don't change the database").kind).toBe('CONSTRAIN');
    expect(classifyFollowUp('only edit src/llm/llm.ts').kind).toBe('CONSTRAIN');

    expect(classifyFollowUp('also support mobile viewports').kind).toBe('EXTEND');
    expect(classifyFollowUp('in addition, add support for DeepSeek V4').kind).toBe('EXTEND');

    expect(classifyFollowUp('now add GitHub OAuth').kind).toBe('NEW_TASK');
    expect(classifyFollowUp('use this screenshot as reference', true).kind).toBe('VISUAL_REFERENCE');
  });

  it('extracts target hints accurately from message text', () => {
    const hints = extractTargetHints('Fix bug in src/agent/gitu.ts and check parseReplyAction() when Error: ECONNRESET occurs');
    expect(hints.files).toContain('src/agent/gitu.ts');
    expect(hints.symbols).toContain('parseReplyAction');
    expect(hints.errors.some((e) => e.includes('ECONNRESET'))).toBe(true);
  });

  it('extracts hard constraints and requirements from follow-up messages', () => {
    const instructions = extractInstructionsFromFollowUp("Don't modify backend. Must pass tests. Prefer cleaner syntax.");
    expect(instructions.some((i) => i.enforcement === 'hard' && i.text.includes("Don't modify backend"))).toBe(true);
    expect(instructions.some((i) => i.enforcement === 'completion' && i.text.includes('Must pass tests'))).toBe(true);
    expect(instructions.some((i) => i.enforcement === 'advisory' && i.text.includes('Prefer cleaner syntax'))).toBe(true);
  });

  it('applies follow-up delta to TaskLedger seamlessly', () => {
    const { repoRoot, project, cleanup } = createMockProject();
    try {
      const ledger = TaskLedger.create({
        repoRoot,
        goal: 'Fix backend SSE stream',
        project,
        mode: 'standard',
      });

      ledger.data.currentHypothesis = 'Backend SSE chunking is dropped';

      const followUp = applyFollowUpToLedger(
        ledger,
        'No, backend is fine. The issue is in src/frontend/stream-view.tsx animation. Do not touch server.ts.',
      );

      expect(followUp.kind).toBe('CORRECT');
      expect(ledger.data.taskAuthority?.currentGoal).toContain('src/frontend/stream-view.tsx');
      expect(ledger.data.currentHypothesis).toBeUndefined(); // Hypothesis invalidated
      expect(ledger.data.taskAuthority?.targetHints.files).toContain('src/frontend/stream-view.tsx');
      expect(ledger.hardInstructions().some((i) => i.text.includes('Do not touch server.ts'))).toBe(true);
    } finally {
      cleanup();
    }
  });

  it('instruction completion gate blocks unmet requirements and unrecovered policy denials', () => {
    const now = new Date('2026-01-01T00:00:00Z').toISOString();
    const later = new Date('2026-01-01T00:10:00Z').toISOString();
    const latest = new Date('2026-01-01T00:20:00Z').toISOString();

    // A completion-type requirement with no work after issuance blocks completion.
    const unmet = evaluateInstructionGate(
      [{ text: 'You must run the full test suite', enforcement: 'completion', status: 'active', createdAt: now }],
      [{ status: 'success', createdAt: now }],
    );
    expect(unmet.unmetRequirements).toEqual(['You must run the full test suite']);
    expect(unmet.denialUnrecovered).toBe(false);

    // Work recorded after the requirement satisfies it.
    const met = evaluateInstructionGate(
      [{ text: 'You must run the full test suite', enforcement: 'completion', status: 'active', createdAt: now }],
      [{ status: 'success', createdAt: now }, { status: 'success', createdAt: later }],
    );
    expect(met.unmetRequirements).toEqual([]);

    // A blocked instruction violation with no compliant action afterwards blocks completion.
    const unrecovered = evaluateInstructionGate(
      [],
      [
        { status: 'success', createdAt: now },
        { status: 'denied', createdAt: later, observation: 'DENIED by user instruction policy: hard user instruction forbids writes' },
      ],
    );
    expect(unrecovered.denialUnrecovered).toBe(true);

    // A compliant action after the denial recovers it.
    const recovered = evaluateInstructionGate(
      [],
      [
        { status: 'success', createdAt: now },
        { status: 'denied', createdAt: later, observation: 'DENIED by user instruction policy' },
        { status: 'success', createdAt: latest },
      ],
    );
    expect(recovered.denialUnrecovered).toBe(false);

    // Superseded instructions and advisory preferences never block.
    const ignored = evaluateInstructionGate(
      [
        { text: 'old preference', enforcement: 'advisory', status: 'active', createdAt: latest },
        { text: 'old constraint', enforcement: 'hard', status: 'superseded', createdAt: latest },
      ],
      [],
    );
    expect(ignored.unmetRequirements).toEqual([]);
    expect(ignored.denialUnrecovered).toBe(false);
  });
});
