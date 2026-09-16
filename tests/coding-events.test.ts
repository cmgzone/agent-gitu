import { describe, expect, it } from 'vitest';
import { CODING_EVENT_TYPES, NATIVE_ONLY_EVENT_TYPES, codingEventType, stampEvent, toCodingEvent } from '../src/coding/events.js';

/**
 * Lines below are copied from the real emitters (`src/agent/gitu.ts`,
 * `src/executor/executor.ts`, `src/server/server.ts`). The adapter exists only
 * to bridge the free-text stream to the typed contract, so it has to be judged
 * against what the runtime actually prints, not against invented examples.
 */
const REAL_LINES = {
  commandStarted: 'run      $ npm test',
  fileRead: 'run      read src/cli.ts',
  fileWrite: 'run      write src/cli.ts',
  fileEdit: 'run      edit src/util.ts',
  listAction: 'run      list .',
  searchAction: 'run      search /TODO/ in src',
  lspAction: 'run      lsp diagnostics src/util.ts',
  commandOk: 'ok       $ npm test (1840ms)',
  commandFailed: 'error    $ npm test (900ms)',
  writeOk: 'ok       write src/cli.ts (12ms)',
  writeFailed: 'error    write src/cli.ts (12ms)',
  schemaError: 'error    write src/cli.ts (invalid tool call schema: missing content)',
  linesAdded: 'lines    src/cli.ts +12 lines',
  plan: 'plan     3 steps',
  planFollowUp: 'plan     2 follow-up steps',
  evidencePass: 'evidence ev_ab12 PASS (test)',
  evidenceDelegated: 'evidence ev_ab12 PASS (delegated)',
  evidenceFail: 'evidence ev_ab12 FAIL (command)',
  approvalRequired: 'approval-required appr_9f [run_command] remove build output',
  approvalGranted: 'approval GRANTED for run_command (user approved)',
  approvalTimedOut: 'approval appr_9f timed out — denied',
  recovering: 'recover  socket hang up — retry 2/3 in 1.5s',
  doneComplete: 'done     complete — Fixed the parser bug',
  doneBlocked: 'done     blocked — missing credentials',
  donePaused: 'done     paused — waiting for your next instruction',
  denied: 'denied   write src/x.ts (outside project scope)',
  blocked: 'blocked  $ npm test (loop prevention)',
  stall: 'stall   effort budget of 40 turns reached without verified progress — stopping',
  think: 'think  reviewing task state and choosing the next action',
  streamDelta: 'tdelta Streaming prose chunk',
  bare: 'boom',
};

describe('toCodingEvent', () => {
  it('maps executor action lines onto typed progress', () => {
    expect(toCodingEvent(REAL_LINES.commandStarted)).toEqual({ type: 'command_started', command: 'npm test' });
    expect(toCodingEvent(REAL_LINES.fileRead)).toEqual({ type: 'file_read', path: 'src/cli.ts' });
    expect(toCodingEvent(REAL_LINES.fileWrite)).toEqual({ type: 'file_changed', path: 'src/cli.ts' });
    expect(toCodingEvent(REAL_LINES.fileEdit)).toEqual({ type: 'file_changed', path: 'src/util.ts' });
  });

  it('does not pretend investigation actions are targeted file reads', () => {
    expect(toCodingEvent(REAL_LINES.listAction)).toEqual({ type: 'log', text: 'list .' });
    expect(toCodingEvent(REAL_LINES.searchAction)).toEqual({ type: 'log', text: 'search /TODO/ in src' });
    expect(toCodingEvent(REAL_LINES.lspAction)).toEqual({ type: 'log', text: 'lsp diagnostics src/util.ts' });
  });

  it('maps completion lines, keeping the duration and the failure flag', () => {
    expect(toCodingEvent(REAL_LINES.commandOk)).toEqual({ type: 'command_finished', command: 'npm test', ok: true, durationMs: 1840 });
    expect(toCodingEvent(REAL_LINES.commandFailed)).toEqual({ type: 'command_finished', command: 'npm test', ok: false, durationMs: 900 });
    expect(toCodingEvent(REAL_LINES.writeOk)).toEqual({ type: 'file_changed', path: 'src/cli.ts' });
  });

  it('never reports a failed write as a file change', () => {
    expect(toCodingEvent(REAL_LINES.writeFailed)).toEqual({ type: 'log', text: 'write src/cli.ts (12ms)' });
    expect(toCodingEvent(REAL_LINES.schemaError)).toEqual({ type: 'log', text: 'write src/cli.ts (invalid tool call schema: missing content)' });
  });

  it('carries line counts from the executor edit summary', () => {
    expect(toCodingEvent(REAL_LINES.linesAdded)).toEqual({ type: 'file_changed', path: 'src/cli.ts', linesAdded: 12 });
  });

  it('maps plan creation including the follow-up wording', () => {
    expect(toCodingEvent(REAL_LINES.plan)).toEqual({ type: 'plan_created', steps: 3 });
    expect(toCodingEvent(REAL_LINES.planFollowUp)).toEqual({ type: 'plan_created', steps: 2 });
  });

  it('maps evidence records, with and without a kind suffix', () => {
    expect(toCodingEvent(REAL_LINES.evidencePass)).toEqual({ type: 'evidence_recorded', evidenceId: 'ev_ab12', passed: true, kind: 'test' });
    expect(toCodingEvent(REAL_LINES.evidenceFail)).toEqual({ type: 'evidence_recorded', evidenceId: 'ev_ab12', passed: false, kind: 'command' });
    expect(toCodingEvent(REAL_LINES.evidenceDelegated)).toEqual({ type: 'evidence_recorded', evidenceId: 'ev_ab12', passed: true, kind: 'delegated' });
  });

  it('keeps one approval object addressable across both emitter forms', () => {
    expect(toCodingEvent(REAL_LINES.approvalRequired)).toEqual({ type: 'approval_required', approvalId: 'appr_9f', tool: 'run_command', why: 'remove build output' });
    expect(toCodingEvent(REAL_LINES.approvalGranted)).toEqual({ type: 'approval_resolved', approved: true, tool: 'run_command', reason: 'user approved' });
    expect(toCodingEvent(REAL_LINES.approvalTimedOut)).toEqual({ type: 'approval_resolved', approvalId: 'appr_9f', approved: false, reason: 'timed out' });
  });

  it('extracts retry progress from a recovery line', () => {
    expect(toCodingEvent(REAL_LINES.recovering)).toEqual({ type: 'recovering', message: 'socket hang up — retry 2/3 in 1.5s', attempt: 2, maxAttempts: 3 });
  });

  it('reports the terminal outcome, including a paused-but-healthy run', () => {
    expect(toCodingEvent(REAL_LINES.doneComplete)).toEqual({ type: 'completed', summary: 'complete — Fixed the parser bug' });
    expect(toCodingEvent(REAL_LINES.donePaused)).toEqual({ type: 'completed', summary: 'paused — waiting for your next instruction' });
    expect(toCodingEvent(REAL_LINES.doneBlocked)).toEqual({ type: 'failed', reason: 'blocked — missing credentials' });
  });

  it('falls back to log rather than guessing at ambiguous lines', () => {
    expect(toCodingEvent(REAL_LINES.denied)).toEqual({ type: 'log', text: 'denied   write src/x.ts (outside project scope)' });
    expect(toCodingEvent(REAL_LINES.blocked)).toEqual({ type: 'log', text: 'blocked  $ npm test (loop prevention)' });
    expect(toCodingEvent(REAL_LINES.stall)).toEqual({ type: 'log', text: REAL_LINES.stall });
    expect(toCodingEvent(REAL_LINES.think)).toEqual({ type: 'log', text: REAL_LINES.think });
    expect(toCodingEvent(REAL_LINES.streamDelta)).toEqual({ type: 'log', text: REAL_LINES.streamDelta });
    expect(toCodingEvent(REAL_LINES.bare)).toEqual({ type: 'log', text: 'boom' });
  });

  it('is insensitive to the emitter padding column and surrounding whitespace', () => {
    expect(toCodingEvent('run $ npm test')).toEqual({ type: 'command_started', command: 'npm test' });
    expect(toCodingEvent('   run      read src/cli.ts   ')).toEqual({ type: 'file_read', path: 'src/cli.ts' });
    expect(toCodingEvent('')).toEqual({ type: 'log', text: '' });
  });

  it('never fabricates event kinds the legacy stream cannot know', () => {
    const produced = new Set(Object.values(REAL_LINES).map((line) => codingEventType(toCodingEvent(line))));
    for (const kind of NATIVE_ONLY_EVENT_TYPES) expect(produced.has(kind)).toBe(false);
    // Everything the adapter can classify is still a subset of the contract.
    for (const kind of produced) expect(CODING_EVENT_TYPES).toContain(kind);
  });
});

describe('stampEvent', () => {
  it('attaches the replay cursor and a timestamp without altering the payload', () => {
    const event = stampEvent({ type: 'run_started', goal: 'Fix the parser' }, 7, '2026-01-01T00:00:00.000Z');
    expect(event).toEqual({ seq: 7, at: '2026-01-01T00:00:00.000Z', type: 'run_started', goal: 'Fix the parser' });
  });

  it('defaults the timestamp to a real ISO instant', () => {
    const event = stampEvent({ type: 'log', text: 'x' }, 1);
    expect(Number.isNaN(Date.parse(event.at))).toBe(false);
    expect(event.at.endsWith('Z')).toBe(true);
  });
});

describe('CODING_EVENT_TYPES', () => {
  it('lists every kind exactly once and includes the native-only kinds', () => {
    expect(new Set(CODING_EVENT_TYPES).size).toBe(CODING_EVENT_TYPES.length);
    for (const kind of NATIVE_ONLY_EVENT_TYPES) expect(CODING_EVENT_TYPES).toContain(kind);
  });
});
