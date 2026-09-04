import { describe, expect, it } from 'vitest';
import { applyFollowUpToLedger, classifyFollowUp, isNonMutatingStatusQuestion } from '../src/agent/follow-up.js';
import type { TaskLedger } from '../src/ledger/task-ledger.js';

describe('live steering — status questions are non-mutating', () => {
  it('recognizes the exact stuck-on-step question from the runaway Flappy session', () => {
    expect(isNonMutatingStatusQuestion('are you stuck on step 1')).toBe(true);
    const result = classifyFollowUp('are you stuck on step 1');
    expect(result.kind).toBe('CONTINUE');
    expect(result.goalDelta).toBeUndefined();
    expect(result.extractedInstructions).toEqual([]);
    expect(result.targetHints).toEqual({ files: [], symbols: [], errors: [] });
  });

  it('does not turn a progress question mentioning a file into a new target hint', () => {
    const result = classifyFollowUp('why are you still reading js/logic.js?');
    expect(result.kind).toBe('CONTINUE');
    expect(result.goalDelta).toBeUndefined();
    expect(result.targetHints.files).toEqual([]);
  });

  it('recognizes common progress/status questions', () => {
    for (const message of [
      'what step are you on?',
      'what is happening?',
      "what's going on?",
      'how far along are you?',
      'status?',
      'progress update',
    ]) {
      expect(isNonMutatingStatusQuestion(message), message).toBe(true);
      expect(classifyFollowUp(message).kind, message).toBe('CONTINUE');
    }
  });

  it('does not bump instruction epoch or replace currentGoal for a live status question', () => {
    let epochBumps = 0;
    let goalChanges = 0;
    let recordedKind = '';
    const ledger = {
      data: { currentHypothesis: 'active diagnosis', plan: [] },
      setTargetHints: () => {},
      bumpInstructionEpoch: () => {
        epochBumps += 1;
      },
      addInstruction: () => {
        throw new Error('status question must not add instructions');
      },
      setCurrentGoal: () => {
        goalChanges += 1;
      },
      activeVisualReferences: () => [],
      recordFollowUp: (input: { kind: string }) => {
        recordedKind = input.kind;
        return { id: 'fu-1', kind: input.kind, rawMessage: 'are you stuck on step 1', timestamp: new Date().toISOString() };
      },
    } as unknown as TaskLedger;

    applyFollowUpToLedger(ledger, 'are you stuck on step 1');

    expect(recordedKind).toBe('CONTINUE');
    expect(epochBumps).toBe(0);
    expect(goalChanges).toBe(0);
  });

  it('still treats real scope changes as authority-changing follow-ups', () => {
    const extend = classifyFollowUp('also add keyboard controls');
    expect(extend.kind).toBe('EXTEND');
    expect(extend.goalDelta).toContain('keyboard controls');

    const constrain = classifyFollowUp('do not edit server.ts');
    expect(constrain.kind).toBe('CONSTRAIN');
    expect(constrain.extractedInstructions.length).toBeGreaterThan(0);
  });
});
