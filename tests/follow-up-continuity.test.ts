import { describe, expect, it } from 'vitest';
import { classifyFollowUp, conversationIntent, extractTargetHints, extractInstructionsFromFollowUp, applyFollowUpToLedger, evaluateInstructionGate, supersedeConflictingAuthority, recoverProgressNudgeGoal } from '../src/agent/follow-up.js';
import { TaskLedger } from '../src/ledger/task-ledger.js';
import type { ProjectLock } from '../src/types.js';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildStateMessage } from '../src/agent/prompt.js';

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
  it('keeps requirements in the middle of a long original task in the live authority', () => {
    const { repoRoot, project, cleanup } = createMockProject();
    try {
      const requirement = 'Clicking a search result must open the exact matching message.';
      const goal = 'Fix individual email search.\n' + 'Existing repository context.\n'.repeat(120) + requirement + '\n' + 'Preserve inbox conversation grouping.\n'.repeat(50);
      const ledger = TaskLedger.create({ repoRoot, goal, project, mode: 'agent' });
      expect(buildStateMessage(ledger)).toContain(`CURRENT USER INTENT:\n${goal}`);
      expect(buildStateMessage(ledger)).toContain(requirement);
    } finally { cleanup(); }
  });

  it.each([
    'why you keep reapiting your self insteade of edditing',
    'Why do you keep repeating yourself instead of editing?',
    'Stop repeating yourself and implement the fix.',
    'You are still reading the same files instead of making progress',
    'Continue from where you stopped and implement the remaining fix',
    'and fix the issue',
    'eddit is available',
    'continue with task',
    'Continue with the task please.',
    'resume the original work',
    'proceed with our current implementation',
    'keep going on this project',
    'carry on with the same task',
  ])('preserves the mission and epoch for progress steering: %s', message => {
    const { repoRoot, project, cleanup } = createMockProject();
    try {
      const goal = 'Fix individual message search in src/search.ts';
      const ledger = TaskLedger.create({ repoRoot, goal, project, mode: 'agent' });
      ledger.ensureInitialWorkPhase();
      ledger.setTargetHints(extractTargetHints(goal));
      const epoch = ledger.instructionEpoch;
      expect(conversationIntent(message)).toBeUndefined();
      expect(applyFollowUpToLedger(ledger, message).kind).toBe('CONTINUE');
      const loaded = TaskLedger.load(repoRoot, ledger.data.taskId)!;
      expect(loaded.ensureTaskAuthority().currentGoal).toBe(goal);
      expect(loaded.activeWorkPhase()?.goal).toBe(goal);
      expect(loaded.instructionEpoch).toBe(epoch);
      expect(loaded.ensureTaskAuthority().targetHints.files).toContain('src/search.ts');
      expect(loaded.ensureTaskAuthority().followUps.at(-1)?.rawMessage).toBe(message);
    } finally { cleanup(); }
  });

  it('repairs old progress-only goals while retaining the latest real correction and evidence', () => {
    const { repoRoot, project, cleanup } = createMockProject();
    try {
      const ledger = TaskLedger.create({ repoRoot, goal: 'Fix original search', project, mode: 'agent' });
      ledger.ensureInitialWorkPhase();
      const latest = 'Actually, fix the selection handler in src/search.ts instead';
      applyFollowUpToLedger(ledger, latest);
      const epoch = ledger.instructionEpoch;
      for (const message of ['eddit is available', 'why you keep reapiting your self insteade of edditing', 'and fix the issue', 'continue with task']) {
        ledger.setCurrentGoal(message);
        ledger.recordFollowUp({ kind: 'REFINE', rawMessage: message, extractedGoalDelta: message, addedInstructions: [], supersededInstructions: [] });
      }
      const before = JSON.stringify({ actions: ledger.data.actions, evidence: ledger.data.evidence, followUps: ledger.ensureTaskAuthority().followUps });
      expect(recoverProgressNudgeGoal(ledger)).toBe(latest);
      expect(ledger.activeWorkPhase()?.goal).toBe(latest);
      expect(ledger.instructionEpoch).toBe(epoch);
      expect(JSON.stringify({ actions: ledger.data.actions, evidence: ledger.data.evidence, followUps: ledger.ensureTaskAuthority().followUps })).toBe(before);
      const state = buildStateMessage(ledger);
      expect(state).toContain(`LATEST DIRECTION (CORRECT):\n${latest}`);
      expect(state).not.toContain('LATEST DIRECTION (REFINE):\nand fix the issue');
      expect(recoverProgressNudgeGoal(ledger)).toBeUndefined();
    } finally { cleanup(); }
  });

  it('keeps actual repetition bug reports, implementation choices and explicit pauses intact', () => {
    expect(classifyFollowUp('Fix repeated messages in the search UI').kind).toBe('REFINE');
    expect(classifyFollowUp('Use React instead of Vue').kind).toBe('CORRECT');
    expect(conversationIntent('Stop and explain before editing')).toBe('pause');
  });

  it('does not discard a direction attached to a continuation', () => {
    expect(classifyFollowUp('continue with the README fix instead').kind).toBe('CORRECT');
    expect(classifyFollowUp('go ahead and fix src/new.ts').goalDelta).toContain('src/new.ts');
  });

  it('persists a replacement task and keeps its target on a later continue', () => {
    const { repoRoot, project, cleanup } = createMockProject();
    try {
      const ledger = TaskLedger.create({ repoRoot, goal: 'Fix the original backend task', project, mode: 'agent' });
      ledger.ensureInitialWorkPhase();
      const epoch = ledger.instructionEpoch;
      applyFollowUpToLedger(ledger, 'now implement src/new.ts');
      expect(ledger.data.taskAuthority?.currentGoal).toBe('now implement src/new.ts');
      expect(ledger.instructionEpoch).toBeGreaterThan(epoch);
      applyFollowUpToLedger(ledger, 'continue');
      const loaded = TaskLedger.load(repoRoot, ledger.data.taskId)!;
      expect(loaded.data.taskAuthority?.currentGoal).toBe('now implement src/new.ts');
      expect(loaded.data.taskAuthority?.targetHints.files).toContain('src/new.ts');
      expect(loaded.data.goal).toBe('Fix the original backend task');
      const state = buildStateMessage(loaded, undefined, undefined, {
        goal: 'Fix the original backend task', criterionIds: [], planStepIds: [], evidenceStartIndex: 0,
      });
      expect(state).toContain('CURRENT USER INTENT:\nnow implement src/new.ts');
      expect(state).toContain('LATEST DIRECTION (NEW_TASK):\nnow implement src/new.ts');
    } finally { cleanup(); }
  });

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

  it('treats an action request after discussion as work, even with polite transition words', () => {
    expect(conversationIntent('Can you now fix the connection form?')).toBeUndefined();
    expect(conversationIntent('Could you please go ahead and implement the new task?')).toBeUndefined();
    expect(conversationIntent('Can you explain why the connection form failed?')).toBe('question');
  });

  it.each(['Why am I getting a report when asking questions', 'What is this function doing', 'How does company memory work', "What's wrong with this layout"])(
    'recognizes an ordinary question without a question mark: %s', message => {
      expect(conversationIntent(message)).toBe('question');
    },
  );

  it.each(['What I want is a new checkout', 'Why is checkout failing; fix the checkout', 'How does auth work and add a logout button'])(
    'preserves explicit implementation requests: %s', message => {
      expect(conversationIntent(message)).toBeUndefined();
    },
  );

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

  it('cancels obsolete provider todos when the user requests a replacement', () => {
    const { repoRoot, project, cleanup } = createMockProject();
    try {
      const ledger = TaskLedger.create({ repoRoot, goal: 'Deploy with Coolify', project, mode: 'agent' });
      ledger.setPlan([{ description: 'Connect Coolify and deploy', verification: 'Coolify deployment ready', subtasks: ['add Coolify key', 'deploy with Coolify'] }]);
      const followUp = applyFollowUpToLedger(ledger, "I don't want Coolify; use Vercel instead");
      expect(followUp.kind).toBe('CORRECT');
      expect(ledger.step('step-1')?.status).toBe('cancelled');
      expect(ledger.data.taskAuthority?.currentGoal).toContain('Vercel');
      expect(ledger.data.planRevisions?.at(-1)?.reason).toContain('Superseded by user request');
    } finally {
      cleanup();
    }
  });

  it('never cancels plan steps from contrastive prose in a re-stated plan document (Black Box regression)', () => {
    const { repoRoot, project, cleanup } = createMockProject();
    try {
      const ledger = TaskLedger.create({ repoRoot, goal: 'Black Box security capability', project, mode: 'agent' });
      ledger.setPlan([
        { description: 'Build the deterministic Policy Enforcement Point in src/blackbox/policy.ts', verification: 'vitest run tests/blackbox-policy.test.ts', subtasks: ['the model must never decide its own authorization'] },
        { description: 'Integrate capability intersection into trusted Cowork delegation', verification: 'vitest run tests/blackbox-delegation.test.ts' },
      ]);
      // A re-stated plan document: contrastive prose that MENTIONS model/LLM
      // without rejecting them. This exact shape cancelled steps 4 and 7 of
      // the Black Box task via the harvested token "model".
      const planDocument = [
        'Yes. Here is a plan you can hand directly to your coding agent.',
        'The runtime, rather than the LLM, enforces exactly what is authorized.',
        'Successful ownership verification should still not automatically start testing.',
        'Gitu should receive a capability derived from it rather than being trusted to interpret a sentence.',
        'The LLM is never the security boundary.',
        'Without making "the model decided it had permission" part of your security model.',
      ].join('\n');
      supersedeConflictingAuthority(ledger, planDocument);
      expect(ledger.step('step-1')?.status).toBe('pending');
      expect(ledger.step('step-2')?.status).toBe('pending');
      expect(ledger.data.planRevisions ?? []).toHaveLength(0);
    } finally {
      cleanup();
    }
  });

  it('strong rejections cancel steps but weak contrastive prose only retires instructions', () => {
    const { repoRoot, project, cleanup } = createMockProject();
    try {
      const ledger = TaskLedger.create({ repoRoot, goal: 'Migrate persistence', project, mode: 'agent' });
      ledger.setPlan([
        { description: 'Move the repository layer to Prisma', verification: 'tests pass' },
        { description: 'Rewrite the database seeds', verification: 'tests pass' },
      ]);
      const createdAt = new Date().toISOString();
      ledger.addInstruction({ text: 'Use Prisma for all new schema work', enforcement: 'hard', status: 'active', createdAt });
      // Contrastive prose only: "not the Prisma client" is a weak negation.
      // It retires the standing Prisma instruction but must NOT cancel the
      // Prisma step — mention/comparison prose never deletes work items.
      supersedeConflictingAuthority(ledger, 'Actually not the Prisma client; keep the schema work on track.');
      expect(ledger.step('step-1')?.status).toBe('pending');
      expect(ledger.hardInstructions().some((i) => i.text.includes('Prisma'))).toBe(false);
      // Strong: an explicit rejection of Prisma cancels the Prisma step.
      supersedeConflictingAuthority(ledger, "I don't want Prisma; use Drizzle instead.");
      expect(ledger.step('step-1')?.status).toBe('cancelled');
      expect(ledger.step('step-2')?.status).toBe('pending');
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
