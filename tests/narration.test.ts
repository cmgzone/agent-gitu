import { describe, expect, it } from 'vitest';
import {
  actNow,
  contextCompacted,
  duplicateInvestigationPrevented,
  episodeReopened,
  episodeSuperseded,
  hypothesisRecorded,
  nestedProblemDetected,
  planReconciled,
  problemDetected,
  problemResolved,
  quote,
  repairApplied,
  scratchRedirected,
} from '../src/agent/narration.js';

describe('narration', () => {
  it('quotes observed text safely on a single line', () => {
    expect(quote('expected 403.6\n\treceived 406.8')).toBe('“expected 403.6 received 406.8”');
    expect(quote('x'.repeat(500))).toMatch(/…”$/);
    expect(quote(undefined)).toBe('');
  });

  it('narrates the recovery story without internal ids in the lead', () => {
    const detected = problemDetected('expected steady speed 403.6 but received 406.8', 'prob-1');
    expect(detected).toContain('expected steady speed 403.6');
    expect(detected.startsWith('A check came back different')).toBe(true);
    expect(detected.endsWith('(prob-1)')).toBe(true);

    const superseded = episodeSuperseded('steady speed holds', 'five pipes culled by 700 meters', 'prob-2');
    expect(superseded).toContain('gone, but verification now fails differently');
    expect(superseded).toContain('five pipes culled');
    expect(superseded).toContain('closed for good');

    const reopened = episodeReopened('expected steady speed 403.6 but received 406.8', 'prob-3');
    expect(reopened).toContain('is back');
    expect(reopened).toContain("didn't hold");

    expect(nestedProblemDetected('database resource missing', 'prob-2')).toContain('clear this one first');
    expect(problemResolved('prob-1')).toContain('back on the plan');
    expect(problemResolved('prob-1').endsWith('(prob-1)')).toBe(true);
  });

  it('narrates hypotheses and repair decisions in first person', () => {
    expect(hypothesisRecorded('cull counter never increments', 'prob-1')).toContain('working theory');
    expect(hypothesisRecorded('cull counter never increments', 'prob-1')).toContain('smallest check');
    expect(actNow('game_logic', 'use the cull counter', 'prob-1')).toContain('applying the fix now');
    expect(actNow('unknown', undefined)).not.toContain(' on unknown');
    expect(repairApplied()).toContain('Re-running the exact check that failed before');
  });

  it('narrates plan and context moments with concrete numbers', () => {
    expect(planReconciled(1)).toContain('one step');
    expect(planReconciled(3)).toContain('3 steps');
    const compacted = contextCompacted(26, 44926, 40005);
    expect(compacted).toContain('26 earlier messages');
    expect(compacted).toContain('durable summary');
    expect(compacted).toContain('kept in full');
  });

  it('narrates guardrails and scratch placement', () => {
    expect(duplicateInvestigationPrevented()).toContain('already have this answer');
    expect(scratchRedirected('diag-speed.js', '.hermes/tmp/t1/diag-speed.js')).toContain('scratch space');
    expect(scratchRedirected('diag-speed.js', '.hermes/tmp/t1/diag-speed.js')).toContain('not your source tree');
  });
});
