import { describe, expect, it } from 'vitest';
import { CodingEventLog, NATIVELY_EMITTED_EVENT_TYPES } from '../src/coding/event-log.js';
import { NATIVE_ONLY_EVENT_TYPES } from '../src/coding/events.js';

describe('CodingEventLog envelopes', () => {
  it('stamps a monotonic cursor on everything it publishes', () => {
    const log = new CodingEventLog();
    const first = log.publishNative({ type: 'run_started', goal: 'Fix it' });
    const second = log.publishNative({ type: 'plan_created', steps: 2 });
    expect(first.seq).toBe(1);
    expect(second.seq).toBe(2);
    expect(Number.isNaN(Date.parse(first.at))).toBe(false);
  });
});

describe('CodingEventLog native-first suppression', () => {
  it('does not republish a legacy line whose transition a native emitter owns', () => {
    const log = new CodingEventLog();
    log.publishNative({ type: 'command_started', command: 'npm test' });
    const fromLegacy = log.publishLegacy('run      $ npm test');
    expect(fromLegacy).toEqual({ seq: 2, at: fromLegacy.at, type: 'log', text: 'run      $ npm test' });
    expect(log.events().filter((event) => event.type === 'command_started')).toHaveLength(1);
  });

  it('suppresses each natively-owned kind, including the completion line', () => {
    const log = new CodingEventLog();
    log.publishNative({ type: 'command_finished', command: 'npm test', ok: true, durationMs: 10 });
    log.publishLegacy('ok       $ npm test (1840ms)');
    const kinds = log.events().map((event) => event.type);
    expect(kinds).toEqual(['command_finished', 'log']);
  });

  it('still publishes legacy lines for transitions nothing owns natively', () => {
    const log = new CodingEventLog();
    log.publishLegacy('lines    src/cli.ts +12 lines');
    expect(log.events()[0]).toMatchObject({ type: 'file_changed', path: 'src/cli.ts', linesAdded: 12 });
  });

  it('keeps the suppression set explicit and overridable', () => {
    const log = new CodingEventLog({ nativeTypes: [] });
    log.publishLegacy('run      $ npm test');
    // Nothing is natively owned here, so the shim's classification stands.
    expect(log.events()[0]).toMatchObject({ type: 'command_started', command: 'npm test' });
    expect(NATIVELY_EMITTED_EVENT_TYPES).toContain('command_started');
  });

  it('preserves the legacy line as prose even when suppressed', () => {
    const log = new CodingEventLog();
    log.publishNative({ type: 'command_finished', command: 'npm test', ok: false, exitCode: 2 });
    log.publishLegacy('error    $ npm test (900ms)');
    const last = log.events().at(-1);
    expect(last?.type).toBe('log');
    expect((last as { text?: string }).text).toContain('npm test');
  });
});

describe('CodingEventLog replay and subscription', () => {
  it('replays from a cursor without repeating what came before', () => {
    const log = new CodingEventLog();
    log.publishNative({ type: 'run_started', goal: 'a' });
    log.publishNative({ type: 'plan_created', steps: 1 });
    log.publishNative({ type: 'plan_created', steps: 2 });
    const replay = log.events(2);
    expect(replay.map((event) => event.seq)).toEqual([3]);
    expect(log.events().map((event) => event.seq)).toEqual([1, 2, 3]);
  });

  it('delivers live events to subscribers and stops on unsubscribe', () => {
    const log = new CodingEventLog();
    const seen: string[] = [];
    const unsubscribe = log.subscribe((event) => seen.push(event.type));
    log.publishNative({ type: 'run_started', goal: 'a' });
    unsubscribe();
    log.publishNative({ type: 'plan_created', steps: 1 });
    expect(seen).toEqual(['run_started']);
  });

  it('drops the oldest events past capacity while the cursor keeps climbing', () => {
    const log = new CodingEventLog({ capacity: 2 });
    log.publishNative({ type: 'run_started', goal: 'a' });
    log.publishNative({ type: 'plan_created', steps: 1 });
    const third = log.publishNative({ type: 'plan_created', steps: 2 });
    expect(log.size).toBe(2);
    expect(third.seq).toBe(3);
    expect(log.events().map((event) => event.seq)).toEqual([2, 3]);
  });
});

describe('dedup set coherence', () => {
  it('is a different set from the shim-gap list, and the overlap is the point', () => {
    // `command_started` has a native emitter AND a legacy line that describes
    // it. That overlap is exactly what the suppression rule exists for; the
    // shim-gap list is about kinds no line can express at all.
    expect(NATIVELY_EMITTED_EVENT_TYPES).toContain('command_started');
    expect(NATIVE_ONLY_EVENT_TYPES).not.toContain('command_started');
    expect(NATIVE_ONLY_EVENT_TYPES).toContain('checkpoint_created');
    expect(NATIVELY_EMITTED_EVENT_TYPES).not.toContain('checkpoint_created');
  });
});
