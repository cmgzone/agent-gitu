import { describe, expect, it } from 'vitest';
import { EventType, type BaseEvent, type RunAgentInput } from '@ag-ui/core';
import type { CodingEvent } from '../src/coding/events.js';
import {
  AguiTranslator,
  GITU_CUSTOM_EVENTS,
  GituAguiAgent,
  type GituRunBridge,
  type GituRunStatus,
  type GituStreamFrame,
} from '../src/server/ag-ui.js';

const envelope = { seq: 1, at: '2026-09-22T10:00:00.000Z' };

function codingEvent(payload: Omit<CodingEvent, 'seq' | 'at'> & { type: CodingEvent['type'] }): CodingEvent {
  return { ...envelope, ...payload } as CodingEvent;
}

function collect(events: BaseEvent[], type: EventType): BaseEvent[] {
  return events.filter((event) => event.type === type);
}

describe('AguiTranslator text frames', () => {
  it('projects a say row as a complete assistant text message', () => {
    const events = new AguiTranslator().fromText('say hello there');
    const [start, content, end] = events;
    expect(events).toHaveLength(3);
    expect(start?.type).toBe(EventType.TEXT_MESSAGE_START);
    expect((content as { delta: string }).delta).toBe('hello there');
    expect(end?.type).toBe(EventType.TEXT_MESSAGE_END);
    expect((start as { messageId: string }).messageId).toBe((content as { messageId: string }).messageId);
  });

  it('drops user-msg echoes the client already rendered', () => {
    expect(new AguiTranslator().fromText('user-msg fix the tests')).toHaveLength(0);
  });

  it('projects file rows as a custom file event with parsed metadata', () => {
    const events = new AguiTranslator().fromText('file {"id":"f1","name":"report.md","kind":"assistant"}');
    expect(events).toHaveLength(1);
    const event = events[0] as { type: EventType; name: string; value: { id: string } };
    expect(event.type).toBe(EventType.CUSTOM);
    expect(event.name).toBe(GITU_CUSTOM_EVENTS.fileShared);
    expect(event.value.id).toBe('f1');
  });

  it('projects unclassified prose as a log event', () => {
    const events = new AguiTranslator().fromText('cron job abc triggered (5m)');
    const event = events[0] as { name: string; value: { text: string } };
    expect(event.name).toBe(GITU_CUSTOM_EVENTS.log);
    expect(event.value.text).toContain('cron job abc');
  });
});

describe('AguiTranslator typed events', () => {
  it('correlates command_started and command_finished into one tool call', () => {
    const translator = new AguiTranslator();
    const started = translator.fromCodingEvent(codingEvent({ type: 'command_started', command: 'npm test' }));
    expect(started.map((event) => event.type)).toEqual([
      EventType.TOOL_CALL_START,
      EventType.TOOL_CALL_ARGS,
      EventType.TOOL_CALL_END,
    ]);
    const start = started[0] as { toolCallId: string; toolCallName: string };
    expect(start.toolCallName).toBe('run_command');
    const args = started[1] as { delta: string };
    expect(JSON.parse(args.delta)).toEqual({ command: 'npm test' });

    const finished = translator.fromCodingEvent(
      codingEvent({ type: 'command_finished', command: 'npm test', ok: true, exitCode: 0, durationMs: 1200 }),
    );
    expect(finished).toHaveLength(1);
    const result = finished[0] as { type: EventType; toolCallId: string; content: string };
    expect(result.type).toBe(EventType.TOOL_CALL_RESULT);
    expect(result.toolCallId).toBe(start.toolCallId);
    expect(JSON.parse(result.content)).toEqual({ ok: true, exitCode: 0, durationMs: 1200 });
  });

  it('synthesizes a complete call when the result arrives without a start', () => {
    const events = new AguiTranslator().fromCodingEvent(
      codingEvent({ type: 'command_finished', command: 'npm test', ok: false }),
    );
    expect(events.map((event) => event.type)).toEqual([
      EventType.TOOL_CALL_START,
      EventType.TOOL_CALL_ARGS,
      EventType.TOOL_CALL_END,
      EventType.TOOL_CALL_RESULT,
    ]);
  });

  it('opens a tool call for approvals so cards can answer, and closes it on resolution', () => {
    const translator = new AguiTranslator();
    const required = translator.fromCodingEvent(
      codingEvent({ type: 'approval_required', approvalId: 'a1', tool: 'shell', why: 'needs root', summary: 'rm -rf build' }),
    );
    const customs = collect(required, EventType.CUSTOM) as { name: string; value: { approvalId: string } }[];
    expect(customs[0]?.name).toBe(GITU_CUSTOM_EVENTS.approvalRequired);
    expect(customs[0]?.value.approvalId).toBe('a1');
    const callStart = collect(required, EventType.TOOL_CALL_START)[0] as { toolCallId: string; toolCallName: string };
    expect(callStart.toolCallName).toBe('approval_request');

    const resolved = translator.fromCodingEvent(
      codingEvent({ type: 'approval_resolved', approvalId: 'a1', approved: true }),
    );
    const result = collect(resolved, EventType.TOOL_CALL_RESULT)[0] as { toolCallId: string; content: string };
    expect(result.toolCallId).toBe(callStart.toolCallId);
    expect(JSON.parse(result.content)).toEqual({ approved: true });
  });

  it('emits evidence as a custom event plus a state delta appending to /evidence', () => {
    const events = new AguiTranslator().fromCodingEvent(
      codingEvent({ type: 'evidence_recorded', evidenceId: 'e9', passed: true, kind: 'test' }),
    );
    const delta = collect(events, EventType.STATE_DELTA)[0] as {
      delta: { op: string; path: string; value: { id: string; passed: boolean } }[];
    };
    expect(delta.delta).toEqual([
      { op: 'add', path: '/evidence/-', value: { id: 'e9', passed: true, kind: 'test', at: envelope.at } },
    ]);
    const custom = collect(events, EventType.CUSTOM)[0] as { name: string };
    expect(custom.name).toBe(GITU_CUSTOM_EVENTS.evidenceRecorded);
  });

  it('maps terminal events to custom run markers', () => {
    const translator = new AguiTranslator();
    const done = translator.fromCodingEvent(codingEvent({ type: 'completed', summary: 'all green' }));
    expect((done[0] as { name: string }).name).toBe(GITU_CUSTOM_EVENTS.runCompleted);
    const failed = translator.fromCodingEvent(codingEvent({ type: 'failed', reason: 'budget exhausted' }));
    expect((failed[0] as { name: string; value: { reason: string } }).value.reason).toBe('budget exhausted');
  });

  it('prefers the typed classification when a frame carries both', () => {
    const frame: GituStreamFrame = {
      i: 4,
      t: envelope.at,
      text: 'run      $ npm test',
      typed: codingEvent({ type: 'command_started', command: 'npm test' }),
    };
    const events = new AguiTranslator().fromFrame(frame);
    expect(events[0]?.type).toBe(EventType.TOOL_CALL_START);
  });
});


describe('GituAguiAgent', () => {
  /** Fake bridge: replays a fixed backlog, then reports a terminal status. */
  function fakeBridge(backlog: GituStreamFrame[], terminal: GituRunStatus): GituRunBridge & {
    started: { threadId: string; runId: string; goal: string }[];
  } {
    const started: { threadId: string; runId: string; goal: string }[] = [];
    return {
      started,
      startRun(input) {
        started.push(input);
        return Promise.resolve({ status: terminal });
      },
      subscribe(_threadId, listener) {
        for (const frame of backlog) listener(frame);
        return () => {};
      },
      status: () => terminal,
    };
  }

  function runInput(text: string): RunAgentInput {
    return {
      threadId: 'thread-1',
      runId: 'run-1',
      messages: [{ id: 'm1', role: 'user', content: text }],
      tools: [],
      context: [],
      state: {},
    } as unknown as RunAgentInput;
  }

  async function drain(agent: GituAguiAgent, input: RunAgentInput): Promise<BaseEvent[]> {
    const events: BaseEvent[] = [];
    await new Promise<void>((resolve, reject) => {
      agent.run(input).subscribe({ next: (event) => events.push(event), error: reject, complete: resolve });
    });
    return events;
  }

  it('streams RUN_STARTED, translated frames, then RUN_FINISHED', async () => {
    const bridge = fakeBridge(
      [
        { i: 1, t: envelope.at, text: 'user-msg fix the tests' },
        { i: 2, t: envelope.at, text: 'say On it — running the suite now.' },
        { seq: 3, t: envelope.at, typed: codingEvent({ type: 'command_started', command: 'npm test' }) },
        { seq: 4, t: envelope.at, typed: codingEvent({ type: 'command_finished', command: 'npm test', ok: true }) },
        { seq: 5, t: envelope.at, typed: codingEvent({ type: 'completed', summary: 'Suite green.' }) },
      ],
      'completed',
    );
    const events = await drain(new GituAguiAgent(bridge), runInput('fix the tests'));

    expect(events[0]?.type).toBe(EventType.RUN_STARTED);
    expect(events.at(-1)?.type).toBe(EventType.RUN_FINISHED);
    expect(collect(events, EventType.TEXT_MESSAGE_CONTENT)).toHaveLength(1);
    expect(collect(events, EventType.TOOL_CALL_RESULT)).toHaveLength(1);
    const names = (collect(events, EventType.CUSTOM) as { name: string }[]).map((event) => event.name);
    expect(names).toContain(GITU_CUSTOM_EVENTS.runCompleted);
    expect(bridge.started[0]).toEqual({ threadId: 'thread-1', runId: 'run-1', goal: 'fix the tests' });
  });

  it('ends with RUN_ERROR when the run fails', async () => {
    const bridge = fakeBridge(
      [{ seq: 1, t: envelope.at, typed: codingEvent({ type: 'failed', reason: 'budget exhausted' }) }],
      'failed',
    );
    const events = await drain(new GituAguiAgent(bridge), runInput('do the thing'));
    const error = events.at(-1) as { type: EventType; message: string };
    expect(error.type).toBe(EventType.RUN_ERROR);
    expect(error.message).toBe('budget exhausted');
  });

  it('reports RUN_ERROR when the bridge cannot start the run', async () => {
    const bridge: GituRunBridge = {
      startRun: () => Promise.reject(new Error('no model configured')),
      subscribe: () => () => {},
      status: () => 'unknown',
    };
    const events = await drain(new GituAguiAgent(bridge), runInput('hello'));
    const error = events.at(-1) as { type: EventType; message: string };
    expect(error.type).toBe(EventType.RUN_ERROR);
    expect(error.message).toBe('no model configured');
  });
});

