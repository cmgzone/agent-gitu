import { describe, expect, it } from 'vitest';
import { classifyFollowUp, isNonMutatingStatusQuestion } from '../src/agent/follow-up.js';

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

  it('still treats real scope changes as authority-changing follow-ups', () => {
    const extend = classifyFollowUp('also add keyboard controls');
    expect(extend.kind).toBe('EXTEND');
    expect(extend.goalDelta).toContain('keyboard controls');

    const constrain = classifyFollowUp('do not edit server.ts');
    expect(constrain.kind).toBe('CONSTRAIN');
    expect(constrain.extractedInstructions.length).toBeGreaterThan(0);
  });
});
