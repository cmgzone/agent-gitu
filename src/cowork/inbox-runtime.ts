import type { LlmClient, LlmMessage } from '../llm/llm.js';
import type { ToolContext } from '../tools/tools.js';
import { PROVIDERS, providerKey } from '../llm/providers.js';
import type { CoworkAgent } from './store.js';
import { coworkToolDocs, executeCoworkTool, parseToolCalls, stripToolMarkers } from './tools.js';
import { mentionNames } from './runner.js';
import {
  clampInboxAgentForMember,
  effectiveInboxPolicy,
  sanitizeInboxTaskForMember,
  type InboxMember,
  type InboxMessage,
  type InboxMessageVisibility,
  type InboxNoteKind,
  type InboxRoom,
  type InboxRoomNote,
  type InboxRoomTask,
  type InboxStore,
  type InboxTaskKind,
} from './inbox-store.js';

export function resolvePikpamApiBase(): string {
  const configured = process.env['PIKPAM_BASE_URL'] || process.env['PIKPAM_INTEGRATIONS_URL'];
  if (configured) {
    try {
      const parsed = new URL(configured);
      if (parsed.hostname !== 'pikrouter.pikpam.com') return parsed.origin;
    } catch {
      // fall back to default
    }
  }
  return 'https://pikpam.com';
}

export function resolveOwnerPikpamKey(): string | undefined {
  const fromEnv = process.env['PIKPAM_API_KEY'] || process.env['PIKROUTER_API_KEY'];
  if (fromEnv?.trim()) return fromEnv.trim();
  const spec = PROVIDERS['pikrouter'];
  const keyInfo = spec ? providerKey(spec) : undefined;
  return keyInfo?.key?.trim() || undefined;
}

export async function createPikpamWorkspaceInvite(input: {
  workspaceUrl: string;
  workspaceName: string;
  inviteId: string;
  scopeType: 'dm' | 'group' | 'workspace';
  targetEmail?: string;
  maxUses?: number;
  expiresAt?: string;
  apiKey?: string;
  baseUrl?: string;
}): Promise<{ code: string; inviteUrl: string }> {
  const apiKey = input.apiKey || resolveOwnerPikpamKey();
  if (!apiKey) {
    throw new Error('Connect your Pikpam / PikRouter API key in Settings first so invite links can be tied to Pikpam accounts.');
  }
  const baseUrl = (input.baseUrl || resolvePikpamApiBase()).replace(/\/+$/, '');
  const res = await fetch(`${baseUrl}/api/workspace-invites`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      workspaceUrl: input.workspaceUrl,
      workspaceName: input.workspaceName,
      inviteId: input.inviteId,
      scopeType: input.scopeType,
      ...(input.targetEmail ? { targetEmail: input.targetEmail } : {}),
      ...(input.maxUses ? { maxUses: input.maxUses } : {}),
      ...(input.expiresAt ? { expiresAt: input.expiresAt } : {}),
    }),
  });
  const data = (await res.json().catch(() => ({}))) as { code?: string; inviteUrl?: string; error?: string };
  if (!res.ok || !data.code || !data.inviteUrl) {
    throw new Error(data.error || `Pikpam invite creation failed (HTTP ${res.status}).`);
  }
  return { code: data.code, inviteUrl: data.inviteUrl };
}

export async function revokePikpamWorkspaceInvite(opts: { code?: string; inviteId?: string; baseUrl?: string; apiKey?: string }): Promise<void> {
  const apiKey = opts.apiKey || resolveOwnerPikpamKey();
  if (!apiKey) return;
  const baseUrl = (opts.baseUrl || resolvePikpamApiBase()).replace(/\/+$/, '');
  await fetch(`${baseUrl}/api/workspace-invites/revoke`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ ...(opts.code ? { code: opts.code } : {}), ...(opts.inviteId ? { inviteId: opts.inviteId } : {}) }),
  }).catch(() => undefined);
}

export async function revokePikpamWorkspaceMember(opts: {
  workspaceUrl: string;
  memberUserId: string;
  baseUrl?: string;
  apiKey?: string;
}): Promise<void> {
  const apiKey = opts.apiKey || resolveOwnerPikpamKey();
  if (!apiKey) return;
  const baseUrl = (opts.baseUrl || resolvePikpamApiBase()).replace(/\/+$/, '');
  await fetch(`${baseUrl}/api/workspace-invites/revoke-member`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ workspaceUrl: opts.workspaceUrl, memberUserId: opts.memberUserId }),
  }).catch(() => undefined);
}

export interface VerifiedPikpamTicket {
  ok: true;
  userId: string;
  email: string;
  name: string;
  inviteId: string | null;
  workspaceUrl: string;
  ownerUserId: string;
}

export async function verifyPikpamWorkspaceTicket(
  ticket: string,
  workspaceUrl?: string,
  baseUrl?: string,
): Promise<VerifiedPikpamTicket | { ok: false; error: string }> {
  const apiBase = (baseUrl || resolvePikpamApiBase()).replace(/\/+$/, '');
  try {
    const res = await fetch(`${apiBase}/api/workspace-invites/verify-ticket`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ticket, ...(workspaceUrl ? { workspaceUrl } : {}) }),
    });
    const data = (await res.json().catch(() => ({}))) as Partial<VerifiedPikpamTicket> & { ok?: boolean; error?: string };
    if (!res.ok || !data.ok || !data.userId || !data.email) {
      return { ok: false, error: data.error || 'Could not verify Pikpam invitation ticket.' };
    }
    return {
      ok: true,
      userId: data.userId,
      email: data.email,
      name: data.name || data.email.split('@')[0] || 'Collaborator',
      inviteId: data.inviteId ?? null,
      workspaceUrl: data.workspaceUrl || workspaceUrl || '',
      ownerUserId: data.ownerUserId || '',
    };
  } catch (err) {
    return { ok: false, error: `Could not reach Pikpam to verify invite: ${(err as Error).message}` };
  }
}

/** Determine which active agents in an Inbox room should respond to a human message. */
export function selectInboxRespondingAgents(input: {
  room: InboxRoom;
  text: string;
  allAgents: CoworkAgent[];
  senderType: 'owner' | 'member';
  member?: InboxMember;
  visibility?: InboxMessageVisibility;
}): CoworkAgent[] {
  const activeSet = new Set(input.room.activeAgentIds);
  let eligible = input.allAgents.filter((a) => activeSet.has(a.id));

  // For individual DMs initiated by an invited human, also require the agent to
  // be in the member's allowedAgentIds when the owner configured that list.
  if (input.senderType === 'member' && input.member && input.room.kind === 'dm') {
    const allowed = new Set(input.member.allowedAgentIds);
    eligible = eligible.filter((a) => allowed.has(a.id));
  }

  if (eligible.length === 0) return [];

  const mentioned = mentionNames(input.text, eligible);

  // Private owner whisper: always route to mentioned active agents, or to all
  // active room agents if the owner whispered without typing @Name.
  if (input.senderType === 'owner' && input.visibility === 'owner_only') {
    return mentioned.length > 0 ? mentioned : eligible;
  }

  // Silent Watch mode: stay completely quiet in public chat (guests never
  // trigger public replies; normal owner messages are only watched & noted
  // silently, unless the owner explicitly @mentions an agent publicly).
  if (input.room.agentTriggerMode === 'watch') {
    if (input.senderType === 'owner' && mentioned.length > 0) {
      return mentioned;
    }
    return [];
  }

  if (mentioned.length > 0) return mentioned;

  if (input.room.agentTriggerMode === 'auto') {
    return eligible;
  }
  return [];
}

const TRIVIAL_WATCH_TOKEN =
  '(?:ok(?:ay)?|k|kk|yes|yeah|yep|yup|no|nope|nah|sure|cool|nice|great|thanks|thank you|thx|ty|got it|sounds good|hi|hello|hey|morning|good morning|lol|haha|👍|👌|🙏|✅)';
const TRIVIAL_WATCH_RE = new RegExp(
  `^${TRIVIAL_WATCH_TOKEN}(?:[\\s,!?.]+${TRIVIAL_WATCH_TOKEN}){0,2}[.!?,\\s]*$`,
  'i',
);

interface ParsedWatchExtraction {
  shouldRecord?: boolean;
  notes?: Array<{ kind?: string; title?: string; content?: string }>;
  tasks?: Array<{ title?: string; description?: string; kind?: string; assignee?: string }>;
}

function parseWatchExtractionJson(raw: string): ParsedWatchExtraction | null {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidates = [fenced?.[1]?.trim(), trimmed].filter((c): c is string => Boolean(c));
  for (const candidate of candidates) {
    const start = candidate.indexOf('{');
    const end = candidate.lastIndexOf('}');
    if (start < 0 || end <= start) continue;
    try {
      const parsed = JSON.parse(candidate.slice(start, end + 1)) as ParsedWatchExtraction;
      if (parsed && typeof parsed === 'object') return parsed;
    } catch {
      // try next candidate
    }
  }
  return null;
}

/**
 * Silent Watch observer for an Inbox room in `watch` mode.
 *
 * Reads the latest public messages without posting any chat reply, silently
 * extracting genuinely new decisions, requirements, notes, and tasks (with
 * guest coding requests marked `pending_approval`) into the room's Notes &
 * Tasks pad.
 */
export async function runInboxSilentWatch(input: {
  store: InboxStore;
  room: InboxRoom;
  agent: CoworkAgent;
  latestMessage: InboxMessage;
  resolveLlm: (agent: CoworkAgent) => LlmClient;
  onWorkspaceChange?: (roomId: string) => void;
  signal?: AbortSignal;
}): Promise<{ savedNotes: InboxRoomNote[]; savedTasks: InboxRoomTask[] }> {
  const { store, room, agent, latestMessage } = input;
  const text = latestMessage.text.trim();
  if (text.length < 4 || TRIVIAL_WATCH_RE.test(text)) {
    return { savedNotes: [], savedTasks: [] };
  }

  const recentPublic = store.messages(room.id, { includeOwnerOnly: false }).slice(-12);
  const existingNotes = store.listNotes(room.id);
  const existingTasks = store.listTasks(room.id);

  const llm = input.resolveLlm(agent);
  const raw = await llm.complete(
    [
      {
        role: 'system',
        content: [
          `You are "${agent.name}" silently observing Agent Gitu Inbox room "${room.title}" in Watch & Note mode.`,
          'You MUST NOT reply in chat. Your ONLY job is to decide whether the latest message introduced important new information worth saving into the room’s owner-private Notes & Tasks pad.',
          'Return ONLY valid JSON matching this schema:',
          '{"shouldRecord":true|false,"notes":[{"kind":"note"|"decision","title":"short unique title","content":"concise bullet or fact"}],"tasks":[{"title":"concrete action item","description":"optional detail","kind":"action"|"coding"|"research","assignee":"optional person or agent"}]}',
          'Rules:',
          '- Set shouldRecord=false (with empty arrays) for greetings, small talk, acknowledgments, or things already captured in existing notes/tasks.',
          '- Record durable facts, client requirements, budgets, deadlines, or agreed decisions as notes.',
          '- Record concrete follow-ups as tasks: kind="coding" for software/website/bug/feature builds, kind="research" for scoping/investigation, kind="action" for human follow-ups.',
          '- Never duplicate an already-saved note or task.',
        ].join('\n'),
      },
      {
        role: 'user',
        content: [
          `Existing saved note titles:\n${existingNotes.length ? existingNotes.slice(0, 15).map((n) => `- ${n.title}`).join('\n') : '(none)'}`,
          `Existing saved task titles:\n${existingTasks.length ? existingTasks.slice(0, 20).map((t) => `- ${t.title}`).join('\n') : '(none)'}`,
          `Recent room transcript:\n${recentPublic.map((m) => `[${m.senderName} (${m.senderType})]: ${m.text}`).join('\n')}`,
          `Latest message to evaluate:\n[${latestMessage.senderName} (${latestMessage.senderType})]: ${latestMessage.text}`,
        ].join('\n\n'),
      },
    ],
    { temperature: 0.2, signal: input.signal },
  );

  const parsed = parseWatchExtractionJson(raw);
  if (!parsed || parsed.shouldRecord === false) {
    return { savedNotes: [], savedTasks: [] };
  }

  const noteTitles = new Set(existingNotes.map((n) => n.title.trim().toLowerCase()));
  const taskTitles = new Set(existingTasks.map((t) => t.title.trim().toLowerCase()));
  const savedNotes: InboxRoomNote[] = [];
  const savedTasks: InboxRoomTask[] = [];

  for (const item of (parsed.notes ?? []).slice(0, 3)) {
    const title = String(item?.title ?? '').trim();
    const content = String(item?.content ?? '').trim();
    if (!title || !content) continue;
    const norm = title.toLowerCase();
    if (noteTitles.has(norm)) continue;
    noteTitles.add(norm);
    const kind: InboxNoteKind = item?.kind === 'decision' ? 'decision' : 'note';
    savedNotes.push(
      store.addNote(room.id, {
        kind,
        title,
        content,
        createdByType: 'agent',
        createdById: agent.id,
        createdByName: `${agent.name} (Watch)`,
      }),
    );
  }

  for (const item of (parsed.tasks ?? []).slice(0, 4)) {
    const title = String(item?.title ?? '').trim();
    if (!title) continue;
    const norm = title.toLowerCase();
    if (taskTitles.has(norm)) continue;
    taskTitles.add(norm);
    const kind: InboxTaskKind =
      item?.kind === 'coding' || item?.kind === 'research' ? item.kind : 'action';
    const isGuestCoding = latestMessage.senderType === 'member' && kind === 'coding';
    savedTasks.push(
      store.addTask(room.id, {
        title,
        description: typeof item?.description === 'string' ? item.description : undefined,
        kind,
        status: isGuestCoding ? 'pending_approval' : 'todo',
        assignee: typeof item?.assignee === 'string' ? item.assignee : undefined,
        projectPath: kind === 'coding' ? room.projectPath : undefined,
        requestedByType: latestMessage.senderType === 'member' ? 'member' : 'owner',
        requestedByName: latestMessage.senderName,
      }),
    );
  }

  if (savedNotes.length > 0 || savedTasks.length > 0) {
    input.onWorkspaceChange?.(room.id);
  }

  return { savedNotes, savedTasks };
}

export type InboxStartCodingRun = (input: {
  roomId: string;
  taskId: string;
  title: string;
  goal: string;
  projectPath?: string;
  mode?: 'agent' | 'fast';
  agent: CoworkAgent;
}) => Promise<{ runId: string; projectPath?: string }>;

function inboxMeetingToolDocs(senderType: 'owner' | 'member', room: InboxRoom): string {
  const visibilityNote =
    (room.notesVisibility ?? 'owner_only') === 'owner_only'
      ? 'Room notes & saved tasks are strictly OWNER-PRIVATE unless the owner shares them.'
      : 'Room notes & saved tasks are visible read-only to room members (coding run IDs & paths remain owner-private).';

  const codingGuidance =
    senderType === 'owner'
      ? 'Starts a private Agent Gitu Code run immediately against the room project (or specified project) and saves a linked task.'
      : 'NEVER runs code directly for guests — safely saves a pending coding proposal so the workspace owner can review and click "Approve & Run in Code" privately.';

  return [
    `INBOX MEETING & DELEGATION TOOLS (emit <tool>{"name":"...","params":{...}}</tool>; ${visibilityNote}):`,
    '- inbox_write_note — Save a structured meeting note, decision, or summary into the room Notes pad. params: {"kind":"note"|"decision"|"summary","title":"short title","content":"markdown bullet points or notes"}',
    '- inbox_save_task — Save an action item / to-do task for this room. params: {"title":"concrete task","description":"optional details","kind":"action"|"coding"|"research","assignee":"optional owner/client/agent name"}',
    `- inbox_delegate_coding — Delegate project/coding work from this chat. ${codingGuidance} params: {"title":"short task title","goal":"concrete engineering brief and acceptance criteria","projectPath":"optional project folder","mode":"agent|fast"}`,
    '- inbox_delegate_subagent — Spawn an isolated temporary sub-agent for research, architecture scoping, estimation, or drafting; its report returns only to you so you can summarize cleanly for the room. params: {"role":"researcher|architect|estimator|writer","objective":"concrete bounded objective","saveNoteTitle":"optional title to also save the report as a room note"}',
  ].join('\n');
}

/**
 * Run a bounded, isolated helper sub-agent on behalf of an Inbox room agent.
 * Respects Inbox privacy rules: never reads owner private memory/settings, and
 * for invited members never enables shell, file writes, or config changes.
 */
export async function runInboxSubAgent(input: {
  room: InboxRoom;
  parentAgent: CoworkAgent;
  role: string;
  objective: string;
  senderType: 'owner' | 'member';
  allowReadTools?: boolean;
  resolveLlm: (agent: CoworkAgent) => LlmClient;
  toolContext?: (agent: CoworkAgent) => ToolContext;
  signal?: AbortSignal;
}): Promise<{ ok: boolean; role: string; report: string }> {
  const role = input.role.trim() || 'research-helper';
  const objective = input.objective.trim();
  if (!objective) {
    return { ok: false, role, report: 'Sub-agent objective is required.' };
  }

  const readOnlyAgent: CoworkAgent = {
    ...input.parentAgent,
    allowShell: false,
    allowWrites: false,
    allowConfig: false,
    chiefOfStaff: false,
  };
  const allowTools = Boolean(input.allowReadTools && input.toolContext);
  const readToolDocs = allowTools ? coworkToolDocs(readOnlyAgent, false) : '';

  const messages: LlmMessage[] = [
    {
      role: 'system',
      content: [
        `You are a temporary "${role}" sub-agent assisting "${input.parentAgent.name}" for Inbox room "${input.room.title}".`,
        'Work strictly on the assigned objective and return a concise, structured report for your parent agent.',
        'INBOX PRIVACY RULE: Never disclose local credentials, API keys, private owner settings, or internal secrets. Never fabricate facts or claims.',
        readToolDocs
          ? `READ-ONLY TOOLS (optional — emit <tool>{"name":"...","params":{...}}</tool>):\n${readToolDocs}`
          : 'No external tools are enabled for this helper turn; reason directly from the objective and context provided.',
      ].join('\n\n'),
    },
    {
      role: 'user',
      content: `Objective:\n${objective}`,
    },
  ];

  const llm = input.resolveLlm(readOnlyAgent);
  const perms = {
    allowShell: false,
    allowWrites: false,
    allowConfig: false,
    chief: false,
    browser: false,
  };

  let output = '';
  for (let round = 0; round < 3; round++) {
    input.signal?.throwIfAborted();
    output = await llm.complete(messages, {
      temperature: 0.35,
      effort: readOnlyAgent.effort,
      signal: input.signal,
    });
    const calls = allowTools ? parseToolCalls(output) : [];
    if (calls.length === 0) break;
    messages.push({ role: 'assistant', content: output });
    const ctx = input.toolContext!(readOnlyAgent);
    for (const call of calls.slice(0, 2)) {
      const res = await executeCoworkTool(ctx, call.tool, call.params, perms);
      messages.push({
        role: 'user',
        content: `TOOL RESULT ${call.tool} (ok=${res.ok}):\n${res.output.slice(0, 4000)}`,
      });
    }
  }

  const cleanReport = stripToolMarkers(output).trim() || '(no findings returned)';
  return { ok: true, role, report: cleanReport };
}

interface ParsedMeetingSummary {
  title?: string;
  summary?: string;
  decisions?: string[];
  keyPoints?: string[];
  openQuestions?: string[];
  tasks?: Array<{
    title?: string;
    description?: string;
    kind?: string;
    assignee?: string;
  }>;
}

function parseMeetingSummaryJson(raw: string): ParsedMeetingSummary | null {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidates = [fenced?.[1]?.trim(), trimmed].filter((c): c is string => Boolean(c));
  for (const candidate of candidates) {
    const start = candidate.indexOf('{');
    const end = candidate.lastIndexOf('}');
    if (start < 0 || end <= start) continue;
    try {
      const parsed = JSON.parse(candidate.slice(start, end + 1)) as ParsedMeetingSummary;
      if (parsed && typeof parsed === 'object') return parsed;
    } catch {
      // try next candidate
    }
  }
  return null;
}

function formatMeetingSummaryMarkdown(parsed: ParsedMeetingSummary): string {
  const sections: string[] = [];
  if (parsed.summary?.trim()) {
    sections.push(parsed.summary.trim());
  }
  const keyPoints = (parsed.keyPoints ?? []).map((s) => String(s).trim()).filter(Boolean);
  if (keyPoints.length > 0) {
    sections.push(`### Key Points\n${keyPoints.map((p) => `- ${p}`).join('\n')}`);
  }
  const decisions = (parsed.decisions ?? []).map((s) => String(s).trim()).filter(Boolean);
  if (decisions.length > 0) {
    sections.push(`### Decisions\n${decisions.map((d) => `- ${d}`).join('\n')}`);
  }
  const openQuestions = (parsed.openQuestions ?? []).map((s) => String(s).trim()).filter(Boolean);
  if (openQuestions.length > 0) {
    sections.push(`### Open Questions\n${openQuestions.map((q) => `- ${q}`).join('\n')}`);
  }
  return sections.join('\n\n').trim() || 'Meeting summary captured.';
}

/**
 * Generate an owner-private end-of-meeting summary and extract structured
 * action items / coding tasks from an Inbox room transcript.
 */
export async function summarizeInboxMeeting(input: {
  store: InboxStore;
  room: InboxRoom;
  llm: LlmClient;
  authorId?: string;
  authorName?: string;
  focus?: string;
  signal?: AbortSignal;
}): Promise<{ note: InboxRoomNote; createdTasks: InboxRoomTask[]; allTasks: InboxRoomTask[] }> {
  const { store, room } = input;
  // Summarize only public room messages so private owner whispers never leak
  // into a meeting summary the owner might later share with clients.
  const recentMessages = store.messages(room.id, { includeOwnerOnly: false }).slice(-120);
  if (recentMessages.length === 0) {
    throw new Error('There are no public messages in this room yet to summarize.');
  }

  const existingNotes = store.listNotes(room.id).slice(0, 8);
  const existingTasks = store.listTasks(room.id);

  const transcript = recentMessages
    .map((m) => `[${m.senderName} (${m.senderType})]: ${m.text}`)
    .join('\n');

  const existingTaskList = existingTasks.length
    ? existingTasks.map((t) => `- [${t.status}] ${t.title}`).join('\n')
    : '(none yet)';

  const existingNotesContext = existingNotes.length
    ? existingNotes.map((n) => `- (${n.kind}) ${n.title}: ${n.content.slice(0, 260)}`).join('\n')
    : '(none yet)';

  const raw = await input.llm.complete(
    [
      {
        role: 'system',
        content: [
          `You are summarizing a collaborative meeting in Agent Gitu Inbox room "${room.title}".`,
          'Return ONLY a valid JSON object matching this exact schema (no commentary outside the JSON):',
          '{"title":"Meeting Summary — <short topic>","summary":"2-3 sentence executive recap","keyPoints":["..."],"decisions":["..."],"openQuestions":["..."],"tasks":[{"title":"concrete action item","description":"optional detail","kind":"action|coding|research","assignee":"person or agent name"}]}',
          'Rules:',
          '- Only include facts, decisions, and tasks actually discussed in the transcript.',
          '- Tag engineering/software/website/code/bug-fix work with kind="coding", investigation/scoping with kind="research", and human follow-ups with kind="action".',
          '- Avoid duplicating already-saved tasks unless there is a genuinely new follow-up.',
          '- Write client-safe language (no local file paths, credentials, or internal secrets) so the owner can optionally share the summary straight to chat.',
        ].join('\n'),
      },
      {
        role: 'user',
        content: [
          input.focus?.trim() ? `Owner focus instructions: ${input.focus.trim()}` : '',
          `Existing saved notes:\n${existingNotesContext}`,
          `Existing saved tasks:\n${existingTaskList}`,
          `Conversation transcript:\n${transcript}`,
        ]
          .filter(Boolean)
          .join('\n\n'),
      },
    ],
    { temperature: 0.25, signal: input.signal },
  );

  const parsed = parseMeetingSummaryJson(raw);
  const dateLabel = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const title = parsed?.title?.trim() || `Meeting Summary — ${room.title} (${dateLabel})`;
  const content = parsed
    ? formatMeetingSummaryMarkdown(parsed)
    : stripToolMarkers(raw).trim() || 'Meeting summary captured.';

  const note = store.addNote(room.id, {
    kind: 'summary',
    title,
    content,
    createdByType: input.authorId && input.authorId !== 'owner' ? 'agent' : 'owner',
    createdById: input.authorId || 'owner',
    createdByName: input.authorName || 'Meeting Assistant',
  });

  const existingNormalized = new Set(existingTasks.map((t) => t.title.trim().toLowerCase()));
  const createdTasks: InboxRoomTask[] = [];
  for (const item of (parsed?.tasks ?? []).slice(0, 15)) {
    const taskTitle = String(item?.title ?? '').trim();
    if (!taskTitle) continue;
    const norm = taskTitle.toLowerCase();
    if (existingNormalized.has(norm)) continue;
    existingNormalized.add(norm);
    const kind: InboxTaskKind =
      item?.kind === 'coding' || item?.kind === 'research' ? item.kind : 'action';
    const created = store.addTask(room.id, {
      title: taskTitle,
      description: typeof item?.description === 'string' ? item.description : undefined,
      kind,
      status: 'todo',
      assignee: typeof item?.assignee === 'string' ? item.assignee : undefined,
      projectPath: kind === 'coding' ? room.projectPath : undefined,
      requestedByType: 'agent',
      requestedByName: input.authorName || 'Meeting Assistant',
    });
    createdTasks.push(created);
  }

  return {
    note,
    createdTasks,
    allTasks: store.listTasks(room.id),
  };
}

/**
 * Build a compact, strictly one-way Collaborative Inbox briefing for a coworker
 * operating inside the owner's private Cowork chat.
 *
 * One-way privacy guarantee:
 * - Inbox -> Private Cowork (allowed for the workspace owner so coworkers know
 *   which Inbox rooms they are in, what clients asked for, and what summaries/
 *   tasks/coding approvals are waiting).
 * - Private Cowork -> Inbox (NEVER allowed; `runInboxAgentReply` excludes all
 *   private Cowork chats, user_profile, and agent_memory).
 */
export function buildCoworkInboxAwareness(store: InboxStore, agent: CoworkAgent): string {
  const allRooms = store.listRooms();
  const assignedRooms = allRooms.filter((r) => r.activeAgentIds.includes(agent.id));
  const visibleRooms = agent.chiefOfStaff ? allRooms : assignedRooms;

  if (visibleRooms.length === 0) {
    return (
      'COLLABORATIVE INBOX (Agent Gitu shared human + AI rooms, separate from external email/Gmail): ' +
      'You are not currently assigned to any Collaborative Inbox room.'
    );
  }

  const membersById = new Map(store.listMembers().map((m) => [m.id, m]));
  const roomLines: string[] = [];

  for (const room of visibleRooms.slice(0, 6)) {
    const isAssigned = room.activeAgentIds.includes(agent.id);
    const guestNames = room.memberIds
      .map((id) => membersById.get(id)?.name)
      .filter((n): n is string => Boolean(n));
    const notes = store.listNotes(room.id);
    const tasks = store.listTasks(room.id);
    const pendingApprovals = tasks.filter((t) => t.status === 'pending_approval');
    const openTasks = tasks.filter((t) => t.status !== 'done' && t.status !== 'pending_approval');
    const recentMsgs = store.messages(room.id).slice(-2);

    const triggerLabel =
      room.agentTriggerMode === 'watch'
        ? 'watching silently'
        : room.agentTriggerMode === 'mention'
          ? '@mention'
          : 'auto';
    const headerBits = [
      room.kind,
      isAssigned ? 'you are active here' : 'other room',
      `trigger=${triggerLabel}`,
      `notes=${room.notesVisibility ?? 'owner_only'}`,
      guestNames.length ? `guests: ${guestNames.join(', ')}` : 'no guests yet',
    ];
    const details: string[] = [`- Room "${room.title}" (${headerBits.join(' · ')}):`];

    if (pendingApprovals.length > 0) {
      details.push(
        `  · Pending owner coding approvals (${pendingApprovals.length}): ` +
          pendingApprovals
            .slice(0, 4)
            .map((t) => `"${t.title}" (by ${t.requestedByName})`)
            .join('; '),
      );
    }
    if (openTasks.length > 0) {
      details.push(
        `  · Open tasks (${openTasks.length}): ` +
          openTasks
            .slice(0, 5)
            .map((t) => `[${t.kind}/${t.status}] ${t.title}${t.assignee ? ` (${t.assignee})` : ''}`)
            .join('; '),
      );
    }
    if (notes.length > 0) {
      const latestNote = notes[0]!;
      const snippet = latestNote.content.replace(/\s+/g, ' ').slice(0, 180);
      details.push(
        `  · Latest ${latestNote.kind} (${notes.length} total): "${latestNote.title}" — ${snippet}${latestNote.content.length > 180 ? '…' : ''}`,
      );
    }
    if (recentMsgs.length > 0) {
      details.push(
        '  · Recent messages: ' +
          recentMsgs
            .map((m) => `${m.senderName}: ${m.text.replace(/\s+/g, ' ').slice(0, 110)}`)
            .join(' | '),
      );
    }
    roomLines.push(details.join('\n'));
  }

  return [
    'COLLABORATIVE INBOX AWARENESS (Agent Gitu shared client/human + AI rooms — distinct from external email/Gmail; ONE-WAY PRIVATE OWNER VIEW: you may discuss these rooms, notes, tasks, and pending client approvals privately with the owner here in Cowork, and nothing from private Cowork ever leaks back into Inbox):',
    ...roomLines,
  ].join('\n');
}

/**
 * Execute one agent's reply inside a shared Inbox room.
 *
 * Privacy guarantee: when replying in an Inbox room with invited humans, the
 * owner's private `user_profile`, private `agent_memory`, and private Cowork
 * chats are intentionally excluded from the prompt. On invited-member turns,
 * owner-private room notes and tasks (`notesVisibility === 'owner_only'`) are
 * also excluded so guest prompts cannot extract them.
 */
export async function runInboxAgentReply(input: {
  store: InboxStore;
  room: InboxRoom;
  agent: CoworkAgent;
  senderType: 'owner' | 'member';
  member?: InboxMember;
  visibility?: InboxMessageVisibility;
  allAgents?: CoworkAgent[];
  ownerName?: string;
  resolveLlm: (agent: CoworkAgent) => LlmClient;
  toolContext: (agent: CoworkAgent) => ToolContext;
  startCodingRun?: InboxStartCodingRun;
  onMessage?: (msg: InboxMessage) => void;
  onWorkspaceChange?: (roomId: string) => void;
  signal?: AbortSignal;
}): Promise<InboxMessage> {
  const { store, room, senderType, member } = input;
  const replyVisibility: InboxMessageVisibility =
    senderType === 'owner' && input.visibility === 'owner_only' ? 'owner_only' : 'public';
  const isPrivateWhisper = replyVisibility === 'owner_only';
  const { policy, customPerms } =
    senderType === 'member' ? effectiveInboxPolicy(member, room) : { policy: 'standard' as const, customPerms: undefined };

  const clamped =
    senderType === 'member'
      ? clampInboxAgentForMember(input.agent, policy, customPerms)
      : { agent: { ...input.agent, chiefOfStaff: false }, allowTools: true, browser: true };

  const effectiveAgent = clamped.agent;
  // Critical isolation: on guest turns, private owner whispers MUST NOT enter the prompt.
  const history = store
    .messages(room.id, { includeOwnerOnly: senderType === 'owner' })
    .slice(-30);
  const visibility = room.notesVisibility ?? 'owner_only';
  const ownerLabel = input.ownerName?.trim() || 'Workspace Owner';

  // Build room participant roster (display names only — never emails or private IDs).
  const membersById = new Map(store.listMembers().map((m) => [m.id, m]));
  const roomGuestNames = room.memberIds
    .map((id) => membersById.get(id)?.name)
    .filter((n): n is string => Boolean(n));
  const roomAgentList = (input.allAgents ?? [effectiveAgent])
    .filter((a) => room.activeAgentIds.includes(a.id) || a.id === effectiveAgent.id)
    .map((a) => `${a.name}${a.id === effectiveAgent.id ? ' (you)' : ''}${a.tagline ? ` — ${a.tagline}` : ''}`);

  const triggerLabel =
    room.agentTriggerMode === 'watch'
      ? 'watch & note silently'
      : room.agentTriggerMode === 'mention'
        ? '@mention'
        : 'auto-reply';
  const roomAwarenessBlock = [
    `CURRENT SURFACE: Agent Gitu Collaborative Inbox (${room.kind === 'group' ? 'shared group room' : 'direct inbox room'} "${room.title}", trigger=${triggerLabel}, notesVisibility=${visibility}).`,
    `PARTICIPANTS IN THIS ROOM:\n- Owner: ${ownerLabel}\n- Invited humans: ${roomGuestNames.length ? roomGuestNames.join(', ') : '(none yet)'}\n- Active AI teammates: ${roomAgentList.join('; ')}`,
    isPrivateWhisper
      ? `CURRENT SPEAKER: Workspace Owner (${ownerLabel}) via PRIVATE WHISPER (OWNER-ONLY — invited guests CANNOT see this message or your reply). Answer candidly for the owner and use inbox_* tools freely.`
      : senderType === 'owner'
        ? `CURRENT SPEAKER: Workspace Owner (${ownerLabel}) in public room chat (visible to invited guests). Effective tool policy: standard (owner turn).`
        : `CURRENT SPEAKER: Invited guest "${member?.name ?? 'Member'}". Effective tool policy: ${policy}. Coding requests from guests must always be logged for owner approval via inbox_delegate_coding.`,
  ].join('\n');

  // Privacy-gated room notes & tasks context:
  // - Owner turns receive owner-private notes/tasks (with strict non-disclosure reminder).
  // - Guest turns ONLY receive notes/tasks if the owner explicitly set `shared_readonly`
  //   (and even then, tasks are sanitized to strip coding runs, paths, and pending approvals).
  const rawNotes = store.listNotes(room.id).slice(0, 6);
  const rawTasks = store.listTasks(room.id).slice(0, 12);
  let notesContext = '';
  let tasksContext = '';
  if (senderType === 'owner') {
    if (rawNotes.length > 0) {
      notesContext =
        'SAVED ROOM NOTES & SUMMARIES (OWNER-PRIVATE — never reveal private notes to external guests unless the owner explicitly shared them):\n' +
        rawNotes
          .map((n) => `- [${n.kind}${n.sharedToChat ? ', shared' : ', private'}] ${n.title}: ${n.content.replace(/\s+/g, ' ').slice(0, 220)}`)
          .join('\n');
    }
    if (rawTasks.length > 0) {
      tasksContext =
        'SAVED ROOM TASKS (OWNER-PRIVATE — do not quote private task status or coding run IDs to external guests unless asked):\n' +
        rawTasks.map((t) => `- [${t.status}] (${t.kind}) ${t.title}${t.assignee ? ` — ${t.assignee}` : ''}`).join('\n');
    }
  } else if (visibility === 'shared_readonly') {
    if (rawNotes.length > 0) {
      notesContext =
        'SHARED ROOM NOTES & SUMMARIES (read-only):\n' +
        rawNotes
          .map((n) => `- [${n.kind}] ${n.title}: ${n.content.replace(/\s+/g, ' ').slice(0, 220)}`)
          .join('\n');
    }
    const guestTasks = rawTasks
      .filter((t) => t.status !== 'pending_approval')
      .map(sanitizeInboxTaskForMember);
    if (guestTasks.length > 0) {
      tasksContext =
        'SHARED ROOM TASKS (read-only):\n' +
        guestTasks.map((t) => `- [${t.status}] (${t.kind}) ${t.title}${t.assignee ? ` — ${t.assignee}` : ''}`).join('\n');
    }
  }

  const meetingTools = inboxMeetingToolDocs(senderType, room);
  const toolDocs = clamped.allowTools ? coworkToolDocs(effectiveAgent, clamped.browser) : '';
  const systemParts = [
    `You are "${effectiveAgent.name}"${effectiveAgent.tagline ? ` — ${effectiveAgent.tagline}` : ''}, an AI teammate participating in a shared Agent Gitu Inbox ${room.kind === 'group' ? `group "${room.title}"` : `conversation "${room.title}"`}.`,
    roomAwarenessBlock,
    effectiveAgent.systemPrompt ? `Role instructions:\n${effectiveAgent.systemPrompt}` : '',
    'INBOX PRIVACY RULE: This is a shared collaborative Inbox where invited humans (such as clients or teammates) may be present. Never reveal the workspace owner’s private settings, API keys, credentials, local file paths, private chats, or personal profile. Base your answers strictly on this Inbox conversation and authorized tool results.',
    'Keep replies concise, clear, and helpful. Address the human who spoke by name when helpful. When someone asks you to take notes, save action items, summarize the meeting, research via a sub-agent, or delegate coding/project work, call the matching inbox_* tool rather than only promising to do it.',
    senderType === 'owner' && room.projectPath
      ? `Linked workspace project for coding delegations (OWNER-PRIVATE — never print this local path in the group chat): ${room.projectPath}`
      : '',
    notesContext,
    tasksContext,
    meetingTools,
    toolDocs
      ? `ADDITIONAL WORKSPACE TOOLS (optional — emit <tool>{"name":"...","params":{...}}</tool> to run an allowed tool):\n${toolDocs}`
      : 'External workspace tools are in chat-only mode for this turn; only the Inbox meeting & delegation tools above are available.',
  ].filter(Boolean);

  const messages: LlmMessage[] = [
    { role: 'system', content: systemParts.join('\n\n') },
    ...history.map((m) => ({
      role: m.senderType === 'agent' && m.senderId === effectiveAgent.id ? ('assistant' as const) : ('user' as const),
      content: `[${m.senderName}${m.senderType === 'agent' ? ' (agent)' : m.senderType === 'owner' ? ' (owner)' : ''}${m.visibility === 'owner_only' ? ' — PRIVATE OWNER WHISPER' : ''}]: ${m.text}`,
    })),
  ];

  const llm = input.resolveLlm(effectiveAgent);
  const perms = {
    allowShell: effectiveAgent.allowShell,
    allowWrites: effectiveAgent.allowWrites,
    allowConfig: effectiveAgent.allowConfig,
    chief: false,
    browser: clamped.browser,
  };

  let reply = '';
  for (let round = 0; round < 6; round++) {
    input.signal?.throwIfAborted();
    reply = await llm.complete(messages, { temperature: 0.5, effort: effectiveAgent.effort, signal: input.signal });
    const calls = parseToolCalls(reply);
    if (calls.length === 0) break;
    messages.push({ role: 'assistant', content: reply });
    let ctx: ToolContext | undefined;

    for (const call of calls.slice(0, 3)) {
      if (call.tool === 'inbox_write_note') {
        try {
          const kindRaw = String(call.params['kind'] ?? 'note');
          const kind: InboxNoteKind =
            kindRaw === 'summary' || kindRaw === 'decision' ? kindRaw : 'note';
          const title = String(call.params['title'] ?? '').trim() || (kind === 'summary' ? 'Meeting Summary' : 'Meeting Note');
          const content = String(call.params['content'] ?? '').trim();
          const savedNote = store.addNote(room.id, {
            kind,
            title,
            content,
            createdByType: 'agent',
            createdById: effectiveAgent.id,
            createdByName: effectiveAgent.name,
          });
          input.onWorkspaceChange?.(room.id);
          messages.push({
            role: 'user',
            content: `TOOL RESULT inbox_write_note (ok=true):\nSaved ${savedNote.kind} "${savedNote.title}" (id=${savedNote.id}) in the room's Notes pad.`,
          });
        } catch (err) {
          messages.push({
            role: 'user',
            content: `TOOL RESULT inbox_write_note (ok=false):\n${(err as Error).message}`,
          });
        }
        continue;
      }

      if (call.tool === 'inbox_save_task') {
        try {
          const title = String(call.params['title'] ?? '').trim();
          const description = typeof call.params['description'] === 'string' ? call.params['description'] : undefined;
          const kindRaw = String(call.params['kind'] ?? 'action');
          const kind: InboxTaskKind =
            kindRaw === 'coding' || kindRaw === 'research' ? kindRaw : 'action';
          const assignee = typeof call.params['assignee'] === 'string' ? call.params['assignee'] : undefined;
          const reqProject =
            senderType === 'owner' && typeof call.params['projectPath'] === 'string'
              ? call.params['projectPath']
              : room.projectPath;
          const savedTask = store.addTask(room.id, {
            title,
            description,
            kind,
            status: senderType === 'member' && kind === 'coding' ? 'pending_approval' : 'todo',
            assignee,
            projectPath: kind === 'coding' ? reqProject : undefined,
            requestedByType: senderType === 'member' ? 'member' : 'owner',
            requestedByName: senderType === 'member' ? (member?.name ?? 'Member') : 'Owner',
          });
          input.onWorkspaceChange?.(room.id);
          messages.push({
            role: 'user',
            content: `TOOL RESULT inbox_save_task (ok=true):\nSaved ${savedTask.kind} task "${savedTask.title}" (id=${savedTask.id}, status=${savedTask.status}).`,
          });
        } catch (err) {
          messages.push({
            role: 'user',
            content: `TOOL RESULT inbox_save_task (ok=false):\n${(err as Error).message}`,
          });
        }
        continue;
      }

      if (call.tool === 'inbox_delegate_coding') {
        try {
          const title = String(call.params['title'] ?? call.params['goal'] ?? '').trim().slice(0, 140);
          const goal = String(call.params['goal'] ?? title).trim();
          if (!goal) throw new Error('goal is required for inbox_delegate_coding.');
          const mode = call.params['mode'] === 'fast' ? 'fast' : 'agent';

          if (senderType === 'member') {
            const proposed = store.addTask(room.id, {
              title: title || 'Coding Request',
              description: goal,
              kind: 'coding',
              status: 'pending_approval',
              assignee: effectiveAgent.name,
              projectPath: room.projectPath,
              requestedByType: 'member',
              requestedByName: member?.name ?? 'Member',
            });
            input.onWorkspaceChange?.(room.id);
            messages.push({
              role: 'user',
              content: `TOOL RESULT inbox_delegate_coding (ok=true):\nLogged coding proposal "${proposed.title}" (taskId=${proposed.id}, status=pending_approval). Because this came from an invited member, no code was executed yet — the workspace owner can review and click "Approve & Run in Code" privately. Confirm politely without exposing local paths or internal systems.`,
            });
            continue;
          }

          const requestedProject =
            typeof call.params['projectPath'] === 'string' && call.params['projectPath'].trim()
              ? call.params['projectPath'].trim()
              : room.projectPath;
          const task = store.addTask(room.id, {
            title: title || 'Coding Delegation',
            description: goal,
            kind: 'coding',
            status: input.startCodingRun ? 'in_progress' : 'todo',
            assignee: 'Code Agent',
            projectPath: requestedProject,
            requestedByType: 'owner',
            requestedByName: 'Owner',
          });

          if (!input.startCodingRun) {
            input.onWorkspaceChange?.(room.id);
            messages.push({
              role: 'user',
              content: `TOOL RESULT inbox_delegate_coding (ok=true):\nSaved coding task "${task.title}" (taskId=${task.id}). The owner can launch it in Code from the room's Tasks panel.`,
            });
            continue;
          }

          try {
            const started = await input.startCodingRun({
              roomId: room.id,
              taskId: task.id,
              title: task.title,
              goal,
              projectPath: requestedProject,
              mode,
              agent: effectiveAgent,
            });
            store.updateTask(room.id, task.id, {
              status: 'in_progress',
              codeRunId: started.runId,
              ...(started.projectPath ? { projectPath: started.projectPath } : {}),
            });
            input.onWorkspaceChange?.(room.id);
            messages.push({
              role: 'user',
              content: `TOOL RESULT inbox_delegate_coding (ok=true):\nDelegated coding task "${task.title}" privately to Code (runId=${started.runId}, taskId=${task.id}). Report concisely that engineering work has been kicked off without exposing internal filesystem paths in the shared room.`,
            });
          } catch (runErr) {
            store.updateTask(room.id, task.id, {
              status: 'todo',
              delegationSummary: `Could not auto-start Code run: ${(runErr as Error).message}`,
            });
            input.onWorkspaceChange?.(room.id);
            messages.push({
              role: 'user',
              content: `TOOL RESULT inbox_delegate_coding (ok=false):\nSaved task "${task.title}" (taskId=${task.id}), but starting the Code run failed: ${(runErr as Error).message}`,
            });
          }
        } catch (err) {
          messages.push({
            role: 'user',
            content: `TOOL RESULT inbox_delegate_coding (ok=false):\n${(err as Error).message}`,
          });
        }
        continue;
      }

      if (call.tool === 'inbox_delegate_subagent') {
        try {
          const role = String(call.params['role'] ?? 'research-helper').trim();
          const objective = String(call.params['objective'] ?? '').trim();
          const saveNoteTitle =
            typeof call.params['saveNoteTitle'] === 'string' ? call.params['saveNoteTitle'].trim() : '';
          const subRes = await runInboxSubAgent({
            room,
            parentAgent: effectiveAgent,
            role,
            objective,
            senderType,
            allowReadTools: clamped.allowTools,
            resolveLlm: input.resolveLlm,
            toolContext: input.toolContext,
            signal: input.signal,
          });
          if (subRes.ok && saveNoteTitle) {
            store.addNote(room.id, {
              kind: 'note',
              title: saveNoteTitle,
              content: subRes.report,
              createdByType: 'agent',
              createdById: effectiveAgent.id,
              createdByName: `${effectiveAgent.name} (${subRes.role})`,
            });
            input.onWorkspaceChange?.(room.id);
          }
          messages.push({
            role: 'user',
            content: `TOOL RESULT inbox_delegate_subagent (ok=${subRes.ok}, role=${subRes.role}):\n${subRes.report.slice(0, 6000)}`,
          });
        } catch (err) {
          messages.push({
            role: 'user',
            content: `TOOL RESULT inbox_delegate_subagent (ok=false):\n${(err as Error).message}`,
          });
        }
        continue;
      }

      if (!clamped.allowTools) {
        messages.push({
          role: 'user',
          content: `TOOL RESULT ${call.tool} (ok=false):\nExternal tool "${call.tool}" is disabled in chat-only mode for this room. Use only inbox_write_note, inbox_save_task, inbox_delegate_coding, or inbox_delegate_subagent.`,
        });
        continue;
      }

      ctx ??= input.toolContext(effectiveAgent);
      const res = await executeCoworkTool(ctx, call.tool, call.params, perms);
      messages.push({
        role: 'user',
        content: `TOOL RESULT ${call.tool} (ok=${res.ok}):\n${res.output.slice(0, 6000)}`,
      });
    }
  }

  const cleanText = stripToolMarkers(reply).trim() || '(no reply)';
  const saved = store.appendMessage(room.id, {
    senderType: 'agent',
    senderId: effectiveAgent.id,
    senderName: effectiveAgent.name,
    text: cleanText,
    ...(isPrivateWhisper ? { visibility: 'owner_only' } : {}),
  });
  input.onMessage?.(saved);
  return saved;
}
