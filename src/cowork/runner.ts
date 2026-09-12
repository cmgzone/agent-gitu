import type { LlmClient, LlmMessage } from '../llm/llm.js';
import { resilientLlm } from '../llm/resilient.js';
import type { ToolContext } from '../tools/tools.js';
import { excerpt } from '../util.js';
import { coworkToolDocs, executeCoworkTool, parseToolCalls, stripToolMarkers, type CoworkToolScope } from './tools.js';
import type { CoworkMemory } from './memory.js';
import type { CoworkAgent, CoworkConversation, CoworkMessage, CoworkStore } from './store.js';

/**
 * The cowork conversation engine.
 *
 * DMs are simple: the member agent answers with full tool access.
 * Group chats route turns through a bounded mention chain: an explicit
 * @mention answers directly; otherwise the chief of staff opens, and agents
 * summon teammates by mentioning them mid-reply. The chain ends when nobody
 * new is summoned or the per-message agent budget is spent, so two chatty
 * teammates can never loop forever at the user's expense.
 */

const MAX_AGENT_MESSAGES_PER_TRIGGER = 5;
const MAX_TOOL_ROUNDS_PER_TURN = 8;
const TRANSCRIPT_MESSAGES = 40;
const MAX_TRANSCRIPT_CHARS = 24_000;

export interface CoworkRunnerDeps {
  agents: CoworkAgent[];
  /** LLM per agent id (already resolved to the agent's provider/model). */
  resolveLlm: (agent: CoworkAgent) => LlmClient;
  /** Tool context factory — lazy so MCP/Skill stores only spin up when needed. */
  toolContext: (agent: CoworkAgent) => ToolContext;
  /** Isolated computer tool dispatcher; never falls back to the host shell. */
  computerFor?: CoworkToolScope['computerFor'];
  onProgress?: (progress: CoworkProgress) => void;
  withAgent?: (agent: CoworkAgent, work: () => Promise<void>) => Promise<void>;
  /** Backing store for chief team management. Optional in tests. */
  store?: CoworkStore;
  /** Shared MemoryStore facade backing the agent_memory tool. */
  memory?: CoworkMemory;
  /** Whether the in-app browser bridge is connected (enables `browse`). */
  browser?: boolean;
  /** "About the user" context shared by every teammate. */
  userContext?: string;
  /** Rendered per-agent persistent memory block. */
  memoryFor?: (agent: CoworkAgent) => string;
  /** Called after every appended agent/system message (Telegram mirror). */
  onMessage?: (message: CoworkMessage) => void | Promise<void>;
  /** Called when an agent starts composing (UI "thinking" indicator). */
  onWorking?: (agentName: string) => void;
  signal?: AbortSignal;
}

export interface CoworkProgress {
  agentId: string;
  agentName: string;
  text: string;
  tool?: string;
  toolOk?: boolean;
}

export interface TurnResult {
  messages: CoworkMessage[];
  error?: string;
}

function mentionNames(text: string, members: CoworkAgent[]): CoworkAgent[] {
  const found: CoworkAgent[] = [];
  const ordered = [...members].sort((a, b) => b.name.length - a.name.length);
  for (const match of text.matchAll(/@/g)) {
    const tail = text.slice(match.index! + 1).toLowerCase();
    const agent = ordered.find((m) => tail.startsWith(m.name.toLowerCase()) && !/[\p{L}\p{N}_-]/u.test(tail[m.name.length] ?? ''));
    if (agent && !found.includes(agent)) found.push(agent);
  }
  return found;
}

function resolveChief(conversation: CoworkConversation, members: CoworkAgent[]): CoworkAgent | undefined {
  return members.find((m) => m.id === conversation.chiefId) ?? members.find((m) => m.chiefOfStaff) ?? members[0];
}

function systemPrompt(agent: CoworkAgent, conversation: CoworkConversation, members: CoworkAgent[], deps?: CoworkRunnerDeps): string {
  const now = new Date();
  const parts: string[] = [
    `You are "${agent.name}"${agent.tagline ? ` — ${agent.tagline}` : ''}, a teammate in Agent Gitu's cowork mode.`,
    `Your personality and operating instructions:\n${agent.systemPrompt}`,
    `Current date: ${now.toDateString()}.`,
    deps?.computerFor
      ? `You have your own persistent Linux virtual computer, private files, shell and browser. Paths are relative to /workspace. Teammates cannot read your private files. Share findings in the conversation; use share_file and receive_file for artifacts. Never claim a tool succeeded unless its result says so.`
      : `Paths in tool calls are relative to your workspace.`,
  ];
  if (deps?.userContext)
    parts.push(
      `ABOUT THE USER (shared by the whole team — keep it current with the user_profile tool when the user shares something durable about themselves or asks you to update it):\n${deps.userContext}`,
    );
  const memory = deps?.memoryFor?.(agent);
  if (memory) parts.push(`YOUR PERSISTED MEMORY (facts you chose to keep across conversations — update with the agent_memory tool when they change):\n${memory}`);
  if (conversation.kind === 'group') {
    const roster = members
      .map((m) => `- @${m.name}${m.id === agent.id ? ' (you)' : ''}${m.id === conversation.chiefId ? ' (chief of staff)' : ''}: ${m.tagline || m.systemPrompt.slice(0, 80)}`)
      .join('\n');
    parts.push(
      `GROUP CHAT: "${conversation.title}" with these teammates:\n${roster}\n` +
        `The user sees every message. Answer with your own expertise; when a teammate's specialty is needed, summon them by mentioning @Name (exactly their name) anywhere in your reply. Do not summon someone for what you can already answer. Never answer as or impersonate another teammate.`,
    );
    if (agent.id === resolveChief(conversation, members)?.id) {
      parts.push(
        `YOU ARE THE CHIEF OF STAFF for this group. For broad requests: split the work, summon the right teammates with @Name mentions, then (in a later reply) synthesize their answers into one clear result. For narrow questions in your own lane, just answer directly.`,
      );
    }
  } else {
    parts.push(`You are in a direct one-on-one chat with the user. Be helpful and concise.`);
  }
  const docs = coworkToolDocs(agent, Boolean(deps?.browser));
  if (docs) {
    parts.push(
      `TOOLS — to use one, include a marker in your reply:\n<tool>{"name":"read_file","params":{"path":"src/x.ts"}}</tool>\n` +
        `The result is returned to you and you continue. You may chain several tool calls before finishing. Available tools:\n${docs}\n` +
        `Your final visible reply must be plain text: the markers are stripped and never shown to the user.\n` +
        `Use the agent_memory tool proactively: when you learn something durable about the user, their projects, or how work should be done, remember it for future conversations.`,
    );
  }
  const skills = agent.skills.length > 0 ? `\n${agent.skills.map((s) => `- ${s}`).join('\n')}` : '';
  if (skills) parts.push(`Your assigned skills (activate with use_skill when relevant):${skills}`);
  return parts.join('\n\n');
}

function transcript(messages: CoworkMessage[]): LlmMessage[] {
  const recent = messages.slice(-TRANSCRIPT_MESSAGES);
  const lines: string[] = [];
  let chars = 0;
  for (const m of [...recent].reverse()) {
    const who =
      m.role === 'user'
        ? `USER${m.via === 'telegram' && m.from ? ` (via Telegram: ${m.from})` : m.via === 'schedule' ? ' (scheduled task)' : ''}`
        : m.role === 'agent'
          ? `${m.agentName ?? 'agent'} (assistant)`
          : 'system';
    const toolNote = m.tools && m.tools.length > 0 ? ` [used tools: ${m.tools.map((t) => t.name).join(', ')}]` : '';
    const line = `${who}${toolNote}: ${m.text}`.slice(-MAX_TRANSCRIPT_CHARS);
    chars += line.length;
    if (chars > MAX_TRANSCRIPT_CHARS && lines.length > 0) break;
    lines.unshift(line);
  }
  return [
    { role: 'user' as const, content: `CONVERSATION SO FAR:\n${lines.join('\n\n')}\n\nContinue as your character. Reply with your chat message (and any tool markers you need).` },
  ];
}

function agentById(deps: CoworkRunnerDeps, id: string | undefined): CoworkAgent | undefined {
  if (deps.store) return id ? deps.store.getAgent(id) : undefined;
  return deps.agents.find((a) => a.id === id);
}

function currentMembers(conversation: CoworkConversation, deps: CoworkRunnerDeps): CoworkAgent[] {
  const current = deps.store?.getConversation(conversation.id) ?? conversation;
  return current.memberIds.map((id) => agentById(deps, id)).filter((agent): agent is CoworkAgent => Boolean(agent));
}

export function buildCoworkMessages(agent: CoworkAgent, conversation: CoworkConversation, members: CoworkAgent[], history: CoworkMessage[], deps?: CoworkRunnerDeps): LlmMessage[] {
  return [{ role: 'system', content: systemPrompt(agent, conversation, members, deps) }, ...transcript(history)];
}

/** Run one agent's turn: LLM → tools → LLM … until a marker-free reply. */
async function agentTurn(input: {
  agent: CoworkAgent;
  conversation: CoworkConversation;
  members: CoworkAgent[];
  history: CoworkMessage[];
  deps: CoworkRunnerDeps;
  append: (m: Omit<CoworkMessage, 'seq' | 'id' | 'ts'>) => CoworkMessage;
}): Promise<void> {
  if (input.deps.withAgent) {
    return input.deps.withAgent(input.agent, () => agentTurn({ ...input, deps: { ...input.deps, withAgent: undefined } }));
  }
  const { agent, conversation, members, history, deps, append } = input;
  const client = deps.resolveLlm(agent);
  const llm = resilientLlm(client, { label: `cowork ${agent.name}` });
  const messages = buildCoworkMessages(agent, conversation, members, history, deps);
  const usedTools: { name: string; ok: boolean }[] = [];
  let ctx: ToolContext | undefined;
  const scope: CoworkToolScope | undefined =
    deps.store && deps.memory ? { store: deps.store, agent, memory: deps.memory, conversationId: conversation.id, computerFor: deps.computerFor, signal: deps.signal } : undefined;
  let reply = '';
  const progress = (text: string, tool?: string, toolOk?: boolean) => deps.onProgress?.({ agentId: agent.id, agentName: agent.name, text, tool, toolOk });

  for (let round = 0; round <= MAX_TOOL_ROUNDS_PER_TURN; round++) {
    deps.signal?.throwIfAborted();
    if (deps.store) messages[0] = { role: 'system', content: systemPrompt(agent, conversation, currentMembers(conversation, deps), deps) };
    let streamed = '';
    const opts = {
      temperature: 0.6,
      effort: agent.effort,
      signal: deps.signal,
      onStreamReset: () => {
        streamed = '';
        progress('');
      },
    };
    reply =
      deps.onProgress && typeof client.completeStream === 'function'
        ? await llm.completeStream(messages, opts, (delta) => {
            streamed += delta;
            progress(stripToolMarkers(streamed, true));
          })
        : await llm.complete(messages, opts);
    deps.signal?.throwIfAborted();
    const calls = parseToolCalls(reply);
    if (calls.length === 0 && !/<tool[\s>]/i.test(reply)) break;
    if (round === MAX_TOOL_ROUNDS_PER_TURN) {
      reply = 'Tool budget reached. Work is incomplete; the last requested actions were not executed.';
      break;
    }
    messages.push({ role: 'assistant', content: reply });
    if (calls.length === 0) {
      messages.push({ role: 'user', content: 'Invalid tool marker. Use valid JSON with name and an object params, enclosed in <tool>...</tool>, or finish with plain text.' });
    }
    for (const [index, call] of calls.entries()) {
      deps.signal?.throwIfAborted();
      if (index >= 4) {
        messages.push({
          role: 'user',
          content: `TOOL RESULT ${call.tool} (ok=false): Not executed: at most four calls per round. Retry this call in the next round if still needed.`,
        });
        continue;
      }
      ctx ??= deps.toolContext(agent);
      progress(stripToolMarkers(reply), call.tool);
      const result = await executeCoworkTool(
        ctx,
        call.tool,
        call.params,
        { allowShell: agent.allowShell, allowWrites: agent.allowWrites, allowConfig: agent.allowConfig, chief: agent.chiefOfStaff, browser: Boolean(deps.browser) },
        scope,
      );
      usedTools.push({ name: call.tool, ok: result.ok });
      progress(stripToolMarkers(reply), call.tool, result.ok);
      messages.push({ role: 'user', content: `TOOL RESULT ${call.tool} (ok=${result.ok}):\n${excerpt(result.output, 4_000)}` });
    }
  }

  const text = stripToolMarkers(reply) || '(no reply)';
  deps.signal?.throwIfAborted();
  const stored = append({ role: 'agent', agentId: agent.id, agentName: agent.name, text, via: 'web', tools: usedTools.length ? usedTools : undefined });
  await deps.onMessage?.(stored);
}

/**
 * Produce the agent-side response to a user trigger message (already appended
 * to history). Returns the messages that were appended.
 */
export async function runConversationTurn(input: {
  conversation: CoworkConversation;
  history: CoworkMessage[];
  trigger: CoworkMessage;
  deps: CoworkRunnerDeps;
  append: (m: Omit<CoworkMessage, 'seq' | 'id' | 'ts'>) => CoworkMessage;
}): Promise<TurnResult> {
  const { conversation, history, trigger, deps, append } = input;
  let members = currentMembers(conversation, deps);
  if (members.length === 0) return { messages: [], error: 'No team members in this conversation' };
  const messages: CoworkMessage[] = [];
  const track = (m: Omit<CoworkMessage, 'seq' | 'id' | 'ts'>): CoworkMessage => {
    const stored = append(m);
    messages.push(stored);
    return stored;
  };

  try {
    if (conversation.kind === 'dm') {
      const agent = members[0]!;
      deps.onWorking?.(agent.name);
      await agentTurn({ agent, conversation, members, history, deps, append: track });
      return { messages };
    }

    const mentioned = mentionNames(trigger.text, members);
    const queue: CoworkAgent[] = mentioned.length > 0 ? mentioned : [resolveChief(conversation, members)!];
    const responded = new Set<string>();
    for (const agent of queue) responded.add(agent.id);
    const chief = resolveChief(conversation, members)!;
    let count = 0;
    // Reserve the last slot for synthesis. Each worker answers once.
    while (queue.length > 0 && count < MAX_AGENT_MESSAGES_PER_TRIGGER - 1) {
      deps.signal?.throwIfAborted();
      const queued = queue.shift()!;
      members = currentMembers(conversation, deps);
      const agent = members.find((member) => member.id === queued.id);
      if (!agent) continue;
      deps.onWorking?.(agent.name);
      const historyAtStart = [...history, ...messages];
      try {
        await agentTurn({ agent, conversation, members, history: historyAtStart, deps, append: track });
      } catch (err) {
        deps.signal?.throwIfAborted();
        const failed = track({ role: 'agent', agentId: agent.id, agentName: agent.name, text: `Could not complete my part: ${(err as Error).message}`, via: 'web' });
        await deps.onMessage?.(failed);
        count += 1;
        continue;
      }
      count += 1;
      members = currentMembers(conversation, deps);
      const last = messages[messages.length - 1];
      for (const summoned of mentionNames(last?.text ?? '', members)) {
        if (responded.has(summoned.id)) continue;
        responded.add(summoned.id);
        queue.push(summoned);
      }
    }
    if (queue.length > 0) track({ role: 'system', text: `Team turn limit reached; not run: ${queue.map((a) => a.name).join(', ')}.`, via: 'web' });
    if (messages.filter((m) => m.role === 'agent').length > 1 && messages.at(-1)?.agentId !== chief.id) {
      deps.onWorking?.(chief.name);
      await agentTurn({
        agent: chief,
        conversation,
        members,
        history: [
          ...history,
          ...messages,
          {
            ...trigger,
            role: 'system',
            text: 'Synthesize the team findings into the final answer. Identify incomplete work and failures. Do not summon more teammates this turn.',
          },
        ],
        deps,
        append: track,
      });
    }
    return { messages };
  } catch (err) {
    const error = (err as Error).message || 'cowork turn failed';
    try {
      const stored = track({ role: 'system', text: deps.signal?.aborted ? 'Stopped by user. Remaining work was cancelled.' : `Error: ${error}`, via: 'web' });
      await deps.onMessage?.(stored);
    } catch {
      /* the error itself is returned regardless */
    }
    return { messages, error };
  }
}
