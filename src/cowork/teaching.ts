import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { LlmContentPart, LlmMessage } from '../llm/llm.js';
import { ensureGituHome } from '../workspace/home.js';

/**
 * Teacher Mode records a human demonstration on an agent's desktop so the agent
 * can distil it into a skill. Input is captured in the browser by the desktop
 * view (RFB KeyEvent/PointerEvent packets), not by parsing the server-side VNC
 * stream: the same view is used for the private and cloud computers, so one
 * client-side capture covers both backends.
 */

export type TeachEventKind = 'click' | 'move' | 'drag' | 'key' | 'type' | 'scroll';

export interface TeachEvent {
  /** Milliseconds since the episode started. */
  t: number;
  kind: TeachEventKind;
  x?: number;
  y?: number;
  /** Key name for `key`, e.g. "Enter" or "ctrl". */
  key?: string;
  down?: boolean;
  /** Character count only — never the typed text unless captureKeys is on. */
  chars?: number;
  /** Present only when the workspace setting opts in. */
  text?: string;
  delta?: number;
}

export interface TeachFrame {
  t: number;
  /** File name inside the episode's frames/ directory. */
  file: string;
  /** Index into `events` this frame was captured after. */
  eventIndex: number;
}

export interface TeachingEpisode {
  id: string;
  agentId: string;
  title: string;
  startedAt: string;
  events: TeachEvent[];
  frames: TeachFrame[];
  truncated?: boolean;
}

export const TEACHING_LIMITS = {
  durationMs: 15 * 60 * 1000,
  events: 5000,
  frames: 24,
  /** Debounce after the last input before a keyframe is taken. */
  frameDebounceMs: 250,
  /** Never capture keyframes closer together than this. */
  frameMinGapMs: 2000,
  /** Hard cap on one `teach-input` request body. */
  bodyBytes: 262_144,
  /** Keyframes handed to the vision reflection call. */
  reflectionFrames: 8,
} as const;

/** RFB message types we decode from the browser's VNC socket. */
const RFB_KEY_EVENT = 4;
const RFB_POINTER_EVENT = 5;

/**
 * X11 keysyms for the keys a demonstration commonly uses. Only the name is
 * recorded; the actual typed characters are captured separately (and only when
 * the workspace opts in) so passwords typed into the desktop never reach disk.
 */
const KEYSYMS: Record<number, string> = {
  0xff0d: 'Enter',
  0xff1b: 'Escape',
  0xff08: 'Backspace',
  0xff09: 'Tab',
  0xffe1: 'shift',
  0xffe2: 'shift',
  0xffe3: 'ctrl',
  0xffe4: 'ctrl',
  0xffe9: 'alt',
  0xffea: 'alt',
  0xffeb: 'meta',
  0xffec: 'meta',
  0xffff: 'Delete',
  0xff51: 'Left',
  0xff52: 'Up',
  0xff53: 'Right',
  0xff54: 'Down',
  0xff50: 'Home',
  0xff57: 'End',
  0xff55: 'PageUp',
  0xff56: 'PageDown',
  0x20: 'Space',
};

export function keysymName(keysym: number): string | undefined {
  const named = KEYSYMS[keysym];
  if (named) return named;
  // Printable ASCII arrives as the codepoint itself.
  if (keysym >= 0x20 && keysym <= 0x7e) return String.fromCharCode(keysym);
  return undefined;
}

/**
 * Decode one RFB client-to-server input message. Returns undefined for server
 * traffic, unsupported types, or short/malformed buffers — a truncated packet
 * must never be recorded as a phantom click.
 */
export function decodeRfbInput(packet: Uint8Array, at: number): TeachEvent | undefined {
  if (packet.length < 2) return undefined;
  if (packet[0] === RFB_KEY_EVENT) {
    if (packet.length < 8) return undefined;
    const down = packet[1] === 1;
    const view = new DataView(packet.buffer, packet.byteOffset, packet.byteLength);
    const keysym = view.getUint32(4);
    const key = keysymName(keysym);
    if (!key) return undefined;
    return { t: at, kind: 'key', key, down };
  }
  if (packet[0] === RFB_POINTER_EVENT) {
    if (packet.length < 6) return undefined;
    const view = new DataView(packet.buffer, packet.byteOffset, packet.byteLength);
    const mask = packet[1]!;
    const x = view.getUint16(2);
    const y = view.getUint16(4);
    const pressed = mask !== 0;
    const scrolled = (mask & 0x08) !== 0 || (mask & 0x10) !== 0;
    if (scrolled) return { t: at, kind: 'scroll', x, y, delta: (mask & 0x08) !== 0 ? -1 : 1 };
    // A button press is the user acting at that point; the release repeats the
    // same coordinates and is dropped by coalescing.
    if (pressed) return { t: at, kind: 'click', x, y };
    return undefined;
  }
  return undefined;
}

/**
 * Collapse pointer moves. A demonstration can emit hundreds of interpolation
 * moves between two clicks; keeping a sparse path preserves the shape of the
 * gesture without spending the event budget on it.
 */
export function coalesceEvents(events: TeachEvent[]): TeachEvent[] {
  const out: TeachEvent[] = [];
  for (const event of events) {
    const previous = out[out.length - 1];
    if (
      previous &&
      previous.kind === 'move' &&
      event.kind === 'move' &&
      previous.x === event.x &&
      previous.y === event.y
    ) {
      continue;
    }
    if (event.kind === 'key' && event.down === false) {
      // A key release says nothing a later press does not; keep only presses.
      continue;
    }
    out.push(event);
  }
  return out;
}

export class TeachingRecorder {
  private readonly episodes = new Map<string, { episode: TeachingEpisode; dir: string; lastFrameAt: number; lastInputAt: number }>();

  constructor(private readonly root: string = path.join(ensureGituHome().root, 'Teaching')) {}

  private episodeDir(agentId: string, id: string): string {
    return path.join(this.root, agentId.replace(/[^\w-]/g, '_'), id);
  }

  start(agentId: string, title: string): TeachingEpisode {
    if (this.episodes.has(agentId)) throw new Error('A demonstration is already being recorded for this teammate.');
    const id = `teach-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e4)}`;
    const episode: TeachingEpisode = {
      id,
      agentId,
      title: title.trim().slice(0, 160) || 'Demonstrated task',
      startedAt: new Date().toISOString(),
      events: [],
      frames: [],
    };
    const dir = this.episodeDir(agentId, id);
    mkdirSync(path.join(dir, 'frames'), { recursive: true });
    this.episodes.set(agentId, { episode, dir, lastFrameAt: 0, lastInputAt: 0 });
    return episode;
  }

  active(agentId: string): TeachingEpisode | undefined {
    return this.episodes.get(agentId)?.episode;
  }

  /** True when the episode has run past its wall-clock budget. */
  expired(agentId: string): boolean {
    const entry = this.episodes.get(agentId);
    if (!entry) return false;
    return Date.now() - Date.parse(entry.episode.startedAt) > TEACHING_LIMITS.durationMs;
  }

  /**
   * Append decoded input events. Returns whether a keyframe is now due, so the
   * caller (which owns the computer handle) can capture it.
   */
  record(agentId: string, events: TeachEvent[]): { accepted: number; frameDue: boolean } {
    const entry = this.episodes.get(agentId);
    if (!entry || !events.length) return { accepted: 0, frameDue: false };
    const episode = entry.episode;
    let accepted = 0;
    for (const event of events) {
      if (episode.events.length >= TEACHING_LIMITS.events) {
        episode.truncated = true;
        break;
      }
      episode.events.push(event);
      accepted++;
    }
    if (!accepted) return { accepted: 0, frameDue: false };
    entry.lastInputAt = Date.now();
    const due =
      episode.frames.length < TEACHING_LIMITS.frames &&
      Date.now() - entry.lastFrameAt >= TEACHING_LIMITS.frameMinGapMs;
    return { accepted, frameDue: due };
  }

  /** Persist one keyframe image next to the episode. */
  addFrame(agentId: string, imageBase64: string, mimeType = 'image/jpeg'): TeachFrame | undefined {
    const entry = this.episodes.get(agentId);
    if (!entry) return undefined;
    const episode = entry.episode;
    if (episode.frames.length >= TEACHING_LIMITS.frames) return undefined;
    const ext = mimeType === 'image/png' ? 'png' : 'jpg';
    const file = `frame-${String(episode.frames.length + 1).padStart(2, '0')}.${ext}`;
    const bytes = Buffer.from(imageBase64, 'base64');
    if (!bytes.length) return undefined;
    writeFileSync(path.join(entry.dir, 'frames', file), bytes);
    const frame: TeachFrame = { t: Date.now() - Date.parse(episode.startedAt), file, eventIndex: episode.events.length - 1 };
    episode.frames.push(frame);
    entry.lastFrameAt = Date.now();
    return frame;
  }

  /** Finish and return the episode; the caller reflects on it. */
  finish(agentId: string): { episode: TeachingEpisode; dir: string } | undefined {
    const entry = this.episodes.get(agentId);
    if (!entry) return undefined;
    this.episodes.delete(agentId);
    entry.episode.events = coalesceEvents(entry.episode.events);
    writeFileSync(path.join(entry.dir, 'episode.json'), JSON.stringify(entry.episode, null, 2));
    return { episode: entry.episode, dir: entry.dir };
  }

  cancel(agentId: string): void {
    const entry = this.episodes.get(agentId);
    if (!entry) return;
    this.episodes.delete(agentId);
    try {
      rmSync(entry.dir, { recursive: true, force: true });
    } catch {
      // A half-written episode is harmless; the next start rewrites the id.
    }
  }

  /** Seconds since the last captured input, used to end a quiet demonstration. */
  idleMs(agentId: string): number {
    const entry = this.episodes.get(agentId);
    return entry ? Date.now() - entry.lastInputAt : 0;
  }
}

/** Render the demonstration as a timeline the model can reason about. */
export function describeEpisode(episode: TeachingEpisode): string {
  const lines: string[] = [];
  for (const event of episode.events) {
    const clock = `${(event.t / 1000).toFixed(1)}s`;
    switch (event.kind) {
      case 'click':
      case 'drag':
        lines.push(`${clock}  ${event.kind} at (${event.x}, ${event.y})`);
        break;
      case 'move':
        // Moves only matter as context for the click that follows.
        break;
      case 'scroll':
        lines.push(`${clock}  scroll ${event.delta === -1 ? 'up' : 'down'} at (${event.x}, ${event.y})`);
        break;
      case 'key':
        lines.push(`${clock}  key ${event.key}`);
        break;
      case 'type':
        lines.push(event.text ? `${clock}  type "${event.text}"` : `${clock}  type ${event.chars ?? 1} character(s)`);
        break;
    }
  }
  if (!lines.length) lines.push('(no input was captured)');
  const frameCount = episode.frames.length;
  return [
    `Task the user demonstrated: ${episode.title}`,
    `Input events: ${episode.events.length}${episode.truncated ? ' (capture was truncated at the recording limit)' : ''}`,
    `Screenshots: ${frameCount}`,
    '',
    lines.join('\n'),
  ].join('\n');
}

export interface DemonstrationSkill {
  name: string;
  description: string;
  instructions: string;
}

/**
 * Ask the agent to distil the demonstration into a reusable procedure. The
 * prompt deliberately mirrors coworkAutoLearn's contract but reflects on what
 * the HUMAN did rather than on the agent's own tool calls.
 */
export async function reflectOnDemonstration(input: {
  episode: TeachingEpisode;
  dir: string;
  agentName: string;
  llm: { complete(messages: LlmMessage[], opts?: { temperature?: number; signal?: AbortSignal }): Promise<string> };
  existingSkills?: string[];
  signal?: AbortSignal;
}): Promise<DemonstrationSkill | undefined> {
  const { episode, dir } = input;
  const images: LlmContentPart[] = [];
  for (const frame of episode.frames.slice(0, TEACHING_LIMITS.reflectionFrames)) {
    try {
      const bytes = readFileSync(path.join(dir, 'frames', frame.file));
      const mime = frame.file.endsWith('.png') ? 'image/png' : 'image/jpeg';
      images.push({ type: 'image_url', image_url: { url: `data:${mime};base64,${bytes.toString('base64')}` } });
    } catch {
      // A missing frame should not lose the whole demonstration.
    }
  }

  const prompt = [
    `The user just demonstrated a task on a desktop so you could learn it. You did not perform this task — the user did.`,
    '',
    describeEpisode(episode),
    '',
    `Existing skills you could extend instead of duplicating: ${(input.existingSkills ?? []).join(', ') || '(none)'}`,
    '',
    'Write ONE reusable skill that would let you repeat this task yourself next time.',
    'Rules:',
    '- Describe intent and the visible anchor to look for, not raw pixel coordinates: "click the Save button in the toolbar", not "click at (840, 320)". Coordinates drift; labels and layout do not.',
    '- Never copy literal values the user typed (URLs, emails, API keys, passwords). Speak about them generically: "enter the project URL".',
    '- Number the steps. Mention what confirms each step worked.',
    '- The instructions are the body of a SKILL.md file in Markdown.',
    '',
    'Reply with JSON only, no prose and no code fence:',
    '{"name":"kebab-case-name","description":"when to use this skill, one sentence","instructions":"## Steps\\n1. ..."}',
  ].join('\n');

  const messages: LlmMessage[] = [
    { role: 'system', content: 'You distil human demonstrations into precise, reusable procedural skills. You reply with JSON only.' },
    {
      role: 'user',
      content: images.length ? [{ type: 'text', text: prompt }, ...images] : prompt,
    },
  ];

  const reply = await input.llm.complete(messages, { temperature: 0.2, ...(input.signal ? { signal: input.signal } : {}) });
  if (input.signal?.aborted) return undefined;
  return parseDemonstrationSkill(reply);
}

/** Tolerates code fences and surrounding prose from otherwise-good replies. */
export function parseDemonstrationSkill(reply: string): DemonstrationSkill | undefined {
  const trimmed = reply.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  const start = trimmed.indexOf('{');
  const end = trimmed.lastIndexOf('}');
  if (start < 0 || end <= start) return undefined;
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed.slice(start, end + 1));
  } catch {
    return undefined;
  }
  if (!parsed || typeof parsed !== 'object') return undefined;
  const record = parsed as Record<string, unknown>;
  const name = typeof record['name'] === 'string' ? record['name'].trim() : '';
  const description = typeof record['description'] === 'string' ? record['description'].trim() : '';
  const instructions = typeof record['instructions'] === 'string' ? record['instructions'].trim() : '';
  if (!name || !description || !instructions) return undefined;
  return { name, description, instructions };
}
