import type { CodingEventListener } from './contract.js';
import type { CodingEvent, CodingEventPayload, CodingEventType } from './events.js';
import { codingEventType, stampEvent, toCodingEvent } from './events.js';

/**
 * Kinds a native emitter already publishes.
 *
 * This is the dedup set, and it is deliberately a *different* set from
 * `NATIVE_ONLY_EVENT_TYPES` (which lists what the legacy shim cannot derive).
 * A kind can be derivable from text and still have a native emitter —
 * `command_started` is the example: the shim reads it out of `run      $ npm
 * test`, while the executor publishes the same transition natively.
 *
 * The rule the log enforces:
 *
 *   native event exists for a transition -> native event is authoritative
 *   legacy text remains as prose         -> shim MUST NOT republish that kind
 *
 * It is explicit and kind-based rather than inferred from timing ("same shape
 * within 500ms"), because a run legitimately repeats actions and a time-window
 * rule would silently discard real events. As native coverage grows this set
 * grows with it, until the shim has nothing left to publish.
 */
export const NATIVELY_EMITTED_EVENT_TYPES = ['policy_denied', 'operation_blocked', 'command_started', 'command_finished'] as const satisfies readonly CodingEventType[];

export interface CodingEventLogOptions {
  /** Override the dedup set. Defaults to `NATIVELY_EMITTED_EVENT_TYPES`. */
  nativeTypes?: Iterable<CodingEventType>;
  /** Retained events; the oldest drop off while `seq` keeps climbing so a
   *  consumer's cursor never goes backwards. */
  capacity?: number;
}

/**
 * The one ordered stream for a session.
 *
 * Two producers feed it and only one of them is authoritative per transition.
 * Native payloads are published as reported. Legacy lines are classified by the
 * shim, and a line whose kind a native emitter already owns is demoted to
 * `log`: the line is preserved as prose so nothing disappears from the record,
 * but it never becomes a second lifecycle event.
 *
 * The envelope is stamped here and nowhere else. A gate reports what it decided;
 * it does not choose its position in the stream, so a replayed event keeps the
 * position it was first published with.
 */
export class CodingEventLog {
  private seq = 0;
  private readonly log: CodingEvent[] = [];
  private readonly subscribers = new Set<CodingEventListener>();
  private readonly nativeTypes: Set<CodingEventType>;
  private readonly capacity: number;

  constructor(options: CodingEventLogOptions = {}) {
    this.nativeTypes = new Set(options.nativeTypes ?? NATIVELY_EMITTED_EVENT_TYPES);
    this.capacity = options.capacity ?? 2_000;
  }

  /** Authoritative path — a subsystem reported the transition itself. */
  publishNative(payload: CodingEventPayload): CodingEvent {
    return this.append(payload);
  }

  /**
   * Legacy path — a free-text line from the runtime's prose stream.
   *
   * Returns the event that was published, which is a `log` when the line's
   * transition was already published natively.
   */
  publishLegacy(line: string): CodingEvent {
    const payload = toCodingEvent(line);
    if (this.nativeTypes.has(codingEventType(payload))) return this.append({ type: 'log', text: line.trim() });
    return this.append(payload);
  }

  /** Replay from `sinceSeq` (exclusive). Absent means the whole retained log. */
  events(sinceSeq?: number): CodingEvent[] {
    return sinceSeq === undefined ? [...this.log] : this.log.filter((event) => event.seq > sinceSeq);
  }

  /** Live tail. Returns an unsubscribe function. */
  subscribe(listener: CodingEventListener): () => void {
    this.subscribers.add(listener);
    return () => this.subscribers.delete(listener);
  }

  get size(): number {
    return this.log.length;
  }

  private append(payload: CodingEventPayload): CodingEvent {
    this.seq += 1;
    const event = stampEvent(payload, this.seq);
    this.log.push(event);
    if (this.log.length > this.capacity) this.log.splice(0, this.log.length - this.capacity);
    for (const listener of this.subscribers) listener(event);
    return event;
  }
}
