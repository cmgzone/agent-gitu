import type { LlmClient, LlmMessage } from '../llm/llm.js';
import { resilientLlm } from '../llm/resilient.js';
import type { ToolContext } from '../tools/tools.js';
import { excerpt } from '../util.js';
import { coworkToolDocs, executeCoworkTool, parseToolCalls, stripToolMarkers, type CoworkToolScope } from './tools.js';
import { extractLastJsonObject } from '../llm/llm.js';
import type { CoworkMemory } from './memory.js';
import type { CoworkAgent, CoworkConversation, CoworkMessage, CoworkMission, CoworkStore } from './store.js';

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
  /** Wake exactly this agent (autonomy: follow-ups, inbox delivery). */
  forceAgentId?: string;
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

function systemPrompt(agent: CoworkAgent, conversation: CoworkConversation, members: CoworkAgent[], deps?: CoworkRunnerDeps, mission?: CoworkMission): string {
  const now = new Date();
  const parts: string[] = [
    `You are "${agent.name}"${agent.tagline ? ` — ${agent.tagline}` : ''}, a teammate in Agent Gitu's cowork mode.`,
    `Your personality and operating instructions:\n${agent.systemPrompt}`,
    `Current date: ${now.toDateString()}.`,
    deps?.computerFor
      ? `You have your own persistent Linux virtual computer, private files, shell and browser. Paths are relative to /workspace. Teammates cannot read your private files. Share findings in the conversation; use share_file and receive_file for artifacts. Never claim a tool succeeded unless its result says so. If a tool result reports the virtual computer is unavailable, you are running on the user's computer instead: drop the /workspace prefix and use workspace-relative paths, and remember shell commands then execute on the host machine.`
      : `Paths in tool calls are relative to your workspace.`,
    `AUTONOMY: schedule_followup lets you promise and keep future work (you are woken with your note). message_teammate hands work to a teammate's inbox (they are woken to act). Use both deliberately — and always tell the user what you committed to.`,
  ];
  if (deps?.userContext)
    parts.push(
      `ABOUT THE USER (shared by the whole team — keep it current with the user_profile tool when the user shares something durable about themselves or asks you to update it):\n${deps.userContext}`,
    );
  const memory = deps?.memoryFor?.(agent);
  if (memory) parts.push(`YOUR PERSISTED MEMORY (facts you chose to keep across conversations — update with the agent_memory tool when they change):\n${memory}`);
  const inbox = deps?.store?.inboxFor(agent.id) ?? [];
  if (inbox.length > 0) {
    const lines = inbox.map((m) => {
      const from = deps?.store?.getAgent(m.fromAgentId)?.name ?? 'a teammate';
      return `- from @${from}: ${m.text}`;
    });
    parts.push(`INBOX — teammates handed you work. Act on it now with your tools, or explain your plan and schedule_followup:\n${lines.join('\n')}`);
  }
  if (mission) {
    const briefing = [
      `AUTONOMOUS MISSION ${mission.id} — you are working on your own toward:`,
      `GOAL: ${mission.goal}`,
      mission.criteria.length > 0
        ? `ACCEPTANCE CRITERIA (every one must be met before you report done):\n${mission.criteria.map((c, i) => `- [${i + 1}] ${c}`).join('\n')}`
        : '(no explicit criteria — decide yourself when the goal is achieved)',
      `PROGRESS SO FAR: ${mission.progress || '(none yet — this is session 1)'}`,
      `TURNS USED: ${mission.turns} / ${mission.maxTurns}`,
      mission.guidance.length > 0 ? `GUIDANCE FROM THE USER:\n${mission.guidance.map((g) => `- ${g}`).join('\n')}` : '',
    ].filter(Boolean).join('\n');
    parts.push(briefing);
  } else if (conversation.kind === 'group') {
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
  const pendingInbox = deps.store?.inboxFor(agent.id) ?? [];
  if (pendingInbox.length > 0) deps.store?.markInboxDelivered(pendingInbox.map((m) => m.id));
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
    const forced = deps.forceAgentId ? members.find((member) => member.id === deps.forceAgentId) : undefined;
    if (conversation.kind === 'dm' || forced) {
      const agent = forced ?? members[0]!;
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

export interface MissionSessionResult {
  status: 'working' | 'done' | 'blocked';
  progress: string;
  result?: string;
  blockers?: string;
  criteriaMet?: boolean[];
}

const MISSION_STATUS_PROTOCOL =
  'End your reply with EXACTLY ONE line of JSON (after any tool markers):\n' +
  '{"status":"working","progress":"what you completed this session and what remains","criteriaMet":[true,false,...]}\n' +
  'or, when every criterion is satisfied:\n' +
  '{"status":"done","progress":"summary","criteriaMet":[true,...],"result":"the final result for the user"}\n' +
  'or, when you cannot continue:\n' +
  '{"status":"blocked","progress":"what you tried","blocker":"exactly what you need from the user"}';

/**
 * One bounded autonomous work session for a mission. The agent gets the
 * mission briefing (not the chat transcript), works with its tools, and
 * reports a structured status. The caller updates the mission and decides
 * whether to schedule the next session.
 */
export async function runMissionSession(input: {
  mission: CoworkMission;
  agent: CoworkAgent;
  deps: CoworkRunnerDeps;
  append: (m: Omit<CoworkMessage, 'seq' | 'id' | 'ts'>) => CoworkMessage;
}): Promise<MissionSessionResult> {
  let out!: MissionSessionResult;
  const work = async (): Promise<void> => {
    const { mission, agent, deps } = input;
    const client = deps.resolveLlm(agent);
    const llm = resilientLlm(client, { label: `mission ${agent.name}` });
    const scope: CoworkToolScope | undefined =
      deps.store && deps.memory ? { store: deps.store, agent, memory: deps.memory, conversationId: mission.conversationId, computerFor: deps.computerFor, signal: deps.signal } : undefined;
    let ctx: ToolContext | undefined;
    const messages: LlmMessage[] = [
      // The transcript is deliberately not included: missions run in their own
      // sessions, and the briefing + progress line carry the state.
      { role: 'system', content: systemPrompt(agent, { ...mission, kind: 'dm', title: `mission`, memberIds: [agent.id], updatedAt: mission.createdAt } as CoworkConversation, [agent], deps, mission) },
      {
        role: 'user',
        content: `WORK SESSION ${mission.turns + 1}/${mission.maxTurns}. Do the next concrete chunk of work toward the mission with your tools (write code and files where relevant, verify with commands). ${MISSION_STATUS_PROTOCOL}`,
      },
    ];

    let reply = '';
    for (let round = 0; round <= MAX_TOOL_ROUNDS_PER_TURN; round++) {
      deps.signal?.throwIfAborted();
      let streamed = '';
      const options = {
        temperature: 0.4,
        effort: agent.effort,
        signal: deps.signal,
        onStreamReset: () => {
          streamed = '';
          deps.onProgress?.({ agentId: agent.id, agentName: agent.name, text: '' });
        },
      };
      reply =
        deps.onProgress && typeof client.completeStream === 'function'
          ? await llm.completeStream(messages, options, (delta) => {
              streamed += delta;
              deps.onProgress?.({ agentId: agent.id, agentName: agent.name, text: stripToolMarkers(streamed, true) });
            })
          : await llm.complete(messages, options);
      const calls = parseToolCalls(reply);
      if (calls.length === 0 || round === MAX_TOOL_ROUNDS_PER_TURN) break;
      messages.push({ role: 'assistant', content: reply });
      for (const call of calls.slice(0, 4)) {
        deps.signal?.throwIfAborted();
        ctx ??= deps.toolContext(agent);
        const result = await executeCoworkTool(
          ctx,
          call.tool,
          call.params,
          { allowShell: agent.allowShell, allowWrites: agent.allowWrites, allowConfig: agent.allowConfig, chief: agent.chiefOfStaff, browser: Boolean(deps.browser) },
          scope,
        );
        messages.push({ role: 'user', content: `TOOL RESULT ${call.tool} (ok=${result.ok}):\n${excerpt(result.output, 4_000)}` });
      }
      messages.push({ role: 'user', content: 'Continue the work session. Remember to end with your status JSON when this session is done.' });
    }

    const text = stripToolMarkers(reply);
    const parsed = extractLastJsonObject(reply) as { status?: unknown; progress?: unknown; result?: unknown; blocker?: unknown; blockers?: unknown; criteriaMet?: unknown } | null;
    let status: MissionSessionResult['status'] = 'working';
    if (parsed && typeof parsed === 'object') {
      const raw = String(parsed.status ?? '').toLowerCase();
      if (raw === 'done' || raw === 'blocked' || raw === 'working') status = raw;
    }
    const criteriaMet = parsed && Array.isArray(parsed.criteriaMet) ? (parsed.criteriaMet as unknown[]).map((value) => value === true) : undefined;
    const allCriteriaMet = mission.criteria.length === 0 || (criteriaMet?.length === mission.criteria.length && criteriaMet.every(Boolean));
    if (status === 'done' && !allCriteriaMet) status = 'working';
    const rawProgress = parsed && typeof parsed.progress === 'string' && parsed.progress.trim() ? parsed.progress : text;
    const session: MissionSessionResult = {
      status,
      progress: `${rawProgress.trim() || '(no report)'}${parsed?.status === 'done' && !allCriteriaMet ? ' Acceptance criteria remain incomplete.' : ''}`.slice(0, 1_500),
    };
    if (status === 'done' && parsed && typeof parsed.result === 'string') session.result = parsed.result.slice(0, 4_000);
    if (status === 'blocked' && parsed && typeof (parsed.blockers ?? parsed.blocker) === 'string') session.blockers = String(parsed.blockers ?? parsed.blocker).slice(0, 1_500);
    if (criteriaMet) session.criteriaMet = criteriaMet;
    if (session.status === 'working') {
      const stored = input.append({ role: 'agent', agentId: agent.id, agentName: agent.name, via: 'agent', text: '[mission] ' + session.progress });
      await deps.onMessage?.(stored);
    }
    out = session;
  };
  if (input.deps.withAgent) await input.deps.withAgent(input.agent, work);
  else await work();
  return out;
}
