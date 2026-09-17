import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { ensureGituHome } from '../workspace/home.js';

/**
 * Cowork mode: a small team of named agent profiles the user chats with
 * directly (DMs) and assemblies into group chats. Everything persists in one
 * JSON document under the Agent Gitu home so a desktop restart keeps the
 * whole team, every transcript, and gateway settings.
 */

/** Saved appearance for animated vector characters and voxel avatars. */
export interface CoworkAvatar {
  /** Hex accent color of the character body. */
  color: string;
  /** Character style rendered consistently throughout the UI. */
  shape: 'orb' | 'jelly' | 'cat' | 'sprout' | 'ufo' | 'cube' | 'visor' | 'antenna' | 'bot';
}

export interface CoworkAgent {
  id: string;
  name: string;
  /** Saved character and accent color. */
  avatar: CoworkAvatar;
  /** One-line title shown under the name (e.g. "Backend engineer"). */
  tagline: string;
  /** Personality + operating instructions injected as the system prompt. */
  systemPrompt: string;
  provider?: string;
  model?: string;
  effort?: 'low' | 'medium' | 'high' | 'max';
  /** Global skill names this agent is allowed to activate. */
  skills: string[];
  /** Allow `run_command`. Off by default — chat agents start read-only. */
  allowShell: boolean;
  /** Allow write_file / apply_edit inside the cowork workspace. */
  allowWrites: boolean;
  /** Allow self-serve tooling: add MCP servers, create/update skills, manage
   *  connections, create projects. Off by default. */
  allowConfig: boolean;
  /** Route file, shell and browser tools directly to the shared user workspace. */
  useHostComputer: boolean;
  /** Default chief-of-staff suggestion when assembling new groups. */
  chiefOfStaff: boolean;
  createdAt: string;
}

export interface CoworkMessage {
  /** Monotonic per-conversation sequence; doubles as the polling cursor. */
  seq: number;
  id: string;
  role: 'user' | 'agent' | 'system';
  agentId?: string;
  agentName?: string;
  text: string;
  via: 'web' | 'telegram' | 'schedule' | 'agent';
  /** Telegram author name / schedule label, for display. */
  from?: string;
  /** Tool calls the agent made while composing this message. */
  tools?: { name: string; ok: boolean }[];
  /** Files attached by the user or explicitly presented by an agent. */
  artifactIds?: string[];
  /** Thread this message belongs to; absent means the Main thread. */
  threadId?: string;
  ts: string;
}

export interface CoworkTelegramConfig {
  enabled: boolean;
  /** Bot token from BotFather. Local-only file, never sent anywhere else. */
  token?: string;
  chatId?: string;
  chatTitle?: string;
  /** Durable getUpdates cursor so a restart neither replays nor drops queued messages. */
  offset?: number;
}

export interface CoworkSchedule {
  every: string;
  goal: string;
  enabled: boolean;
  lastRunAt?: string;
}

/** A folder the user or a teammate tagged for this conversation. Tagged
 *  folders become part of the shared working context: host-mode tools may
 *  read/write inside them, and the prompt lists them for every teammate. */
export interface CoworkFolderTag {
  id: string;
  /** Absolute folder path on the user's computer. */
  path: string;
  /** Short display name (defaults to the basename). */
  label: string;
  /** Teammate that tagged it; empty when the user tagged it. */
  agentId?: string;
  createdAt: string;
}

/** A topic-scoped thread inside a conversation. Messages without a threadId
 *  belong to the implicit "Main" thread. */
export interface CoworkThread {
  id: string;
  title: string;
  /** Optional goal/briefing that steers this thread. */
  topic?: string;
  createdByAgentId?: string;
  createdAt: string;
}

/** A small agent-authored dashboard card pinned in the cowork sidebar. */
export type CoworkWidgetKind = 'stats' | 'list' | 'progress' | 'links' | 'text';

export interface CoworkWidget {
  id: string;
  conversationId: string;
  title: string;
  icon?: string;
  kind: CoworkWidgetKind;
  /** Widget payload, strictly sanitized per kind (no raw HTML). */
  data: Record<string, unknown>;
  createdByAgentId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CoworkConversation {
  id: string;
  kind: 'dm' | 'group';
  title: string;
  memberIds: string[];
  /** Chief of staff for group chats: coordinates who answers. */
  chiefId?: string;
  telegram?: CoworkTelegramConfig;
  schedule?: CoworkSchedule;
  /** Folders tagged for this conversation (user or teammate). */
  folders?: CoworkFolderTag[];
  /** Topic threads; messages without a threadId live in the Main thread. */
  threads?: CoworkThread[];
  createdAt: string;
  updatedAt: string;
}

export interface CoworkUserProfile {
  name?: string;
  /** Free-form context the user wants every teammate to know. */
  about?: string;
  /** Working preferences (tone, hours, tools to prefer, etc.). */
  preferences?: string;
}

/** A long-running autonomous job: an agent keeps working toward a goal in
 *  bounded work sessions until its criteria are met, it gets blocked, or the
 *  turn budget runs out. Progress is posted into the conversation. */
export interface CoworkMission {
  id: string;
  conversationId: string;
  agentId: string;
  goal: string;
  criteria: string[];
  status: 'running' | 'done' | 'blocked' | 'failed' | 'cancelled';
  progress: string;
  result?: string;
  blockers?: string;
  /** User guidance collected while blocked (fed into the next session). */
  guidance: string[];
  turns: number;
  maxTurns: number;
  /**
   * The mission's spend envelope.
   *
   * `maxTurns` above counts work sessions; this bounds what the mission may
   * *cost* — the mission agent's own model calls and every `gitu_task` it
   * delegates draw from one allocation. Structurally a `RunBudget` (cost plus
   * recovery reserve); stated inline so the store stays self-contained.
   */
  budget?: { maxCostUsd: number; reserveUsd?: number };
  /**
   * Set when the mission stopped because its envelope ran out, so a host can
   * offer to raise it and the mission can be resumed rather than restarted.
   * Unlike being blocked on input, this is the one stop that more money fixes.
   */
  stoppedForBudget?: boolean;
  nextWakeAt?: string;
  createdAt: string;
  finishedAt?: string;
}

/** An agent's own reminder: wake me up at <dueAt> to do <note>. */
export interface CoworkFollowUp {
  id: string;
  conversationId: string;
  agentId: string;
  note: string;
  dueAt: string;
  createdAt: string;
}

/** Agent-to-agent mail: delivered when the recipient next wakes up. */
export interface CoworkInboxMessage {
  id: string;
  fromAgentId: string;
  toAgentId: string;
  conversationId: string;
  text: string;
  createdAt: string;
  deliveredAt?: string;
}

export interface CoworkArtifact {
  id: string;
  conversationId: string;
  /** Empty for files received directly from the user or Telegram. */
  agentId?: string;
  name: string;
  mime: string;
  size: number;
  /** Generated server-owned name below Cowork/artifacts/<conversation>. */
  storageName: string;
  createdAt: string;
}

export interface CoworkTodo {
  id: string;
  conversationId: string;
  agentId: string;
  text: string;
  status: 'pending' | 'in_progress' | 'done' | 'blocked' | 'cancelled';
  note?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CoworkRequest {
  id: string;
  conversationId: string;
  agentId: string;
  kind: 'permission' | 'question' | 'recommendation';
  title: string;
  detail: string;
  options: string[];
  /** Permission requests can enable one existing per-agent capability. */
  permission?: 'shell' | 'writes' | 'config' | 'host';
  status: 'open' | 'approved' | 'denied' | 'answered' | 'accepted' | 'dismissed';
  response?: string;
  telegramNotifiedAt?: string;
  createdAt: string;
  resolvedAt?: string;
}

export interface CoworkData {
  agents: CoworkAgent[];
  conversations: CoworkConversation[];
  /** Messages are keyed by conversation id to keep the document navigable. */
  messages: Record<string, CoworkMessage[]>;
  /** Shared "about the user" context injected into every teammate. */
  userProfile?: CoworkUserProfile;
  missions: CoworkMission[];
  followUps: CoworkFollowUp[];
  inbox: CoworkInboxMessage[];
  artifacts: CoworkArtifact[];
  todos: CoworkTodo[];
  requests: CoworkRequest[];
  workLog: CoworkWorkEntry[];
  /** Agent-authored sidebar widgets, scoped to their conversation. */
  widgets: CoworkWidget[];
}

export interface CoworkWorkEntry {
  conversationId: string;
  agentId: string;
  tool: string;
  ok: boolean;
  output: string;
  ts: string;
}

export const EMPTY_COWORK_DATA: CoworkData = { agents: [], conversations: [], messages: {}, missions: [], followUps: [], inbox: [], artifacts: [], todos: [], requests: [], workLog: [], widgets: [] };

function taskKey(text: string): string {
  return text.normalize('NFKC').trim().toLowerCase().replace(/\s+/g, ' ').replace(/[.!]+$/, '');
}

function emptyCoworkData(): CoworkData {
  return structuredClone(EMPTY_COWORK_DATA);
}

const MAX_MESSAGES_PER_CONVERSATION = 2_000;

/** Per-artifact ceiling (storage, Telegram download, share_file). Telegram bots
 *  can hand back at most 20 MB through getFile, so this is the practical cap for
 *  media the team exchanges; model input is bounded separately. */
export const MAX_ARTIFACT_BYTES = 20_000_000;

export class CoworkStore {
  private data: CoworkData = emptyCoworkData();
  private loaded = false;
  /** Process-local roster version; message appends do not change it. */
  rosterRevision = 0;

  constructor(private readonly filePath?: string, private readonly onRosterChange?: () => void) {}

  private file(): string {
    if (this.filePath) return this.filePath;
    return path.join(ensureGituHome().root, 'Cowork', 'cowork.json');
  }

  private load(): CoworkData {
    if (this.loaded) return this.data;
    this.loaded = true;
    const file = this.file();
    if (!existsSync(file)) return this.data;
    try {
      const parsed = JSON.parse(readFileSync(file, 'utf8')) as Partial<CoworkData>;
      this.data = {
        agents: Array.isArray(parsed.agents) ? parsed.agents : [],
        conversations: Array.isArray(parsed.conversations) ? parsed.conversations : [],
        messages: parsed.messages && typeof parsed.messages === 'object' ? parsed.messages : {},
        userProfile: parsed.userProfile && typeof parsed.userProfile === 'object'
          ? {
              name: typeof parsed.userProfile.name === 'string' ? parsed.userProfile.name : undefined,
              about: typeof parsed.userProfile.about === 'string' ? parsed.userProfile.about : undefined,
              preferences: typeof parsed.userProfile.preferences === 'string' ? parsed.userProfile.preferences : undefined,
            }
          : undefined,
        missions: Array.isArray(parsed.missions) ? parsed.missions : [],
        followUps: Array.isArray(parsed.followUps) ? parsed.followUps : [],
        inbox: Array.isArray(parsed.inbox) ? parsed.inbox : [],
        artifacts: Array.isArray(parsed.artifacts) ? parsed.artifacts : [],
        todos: Array.isArray(parsed.todos) ? parsed.todos : [],
        requests: Array.isArray(parsed.requests) ? parsed.requests : [],
        workLog: Array.isArray(parsed.workLog) ? parsed.workLog : [],
        widgets: Array.isArray(parsed.widgets) ? parsed.widgets.map(sanitizeWidget).filter((widget): widget is CoworkWidget => Boolean(widget)) : [],
      };
      // Repair older documents: conversations gain well-formed folders/threads.
      for (const conversation of this.data.conversations) {
        conversation.folders = Array.isArray(conversation.folders) ? conversation.folders.map(sanitizeFolderTag).filter((tag): tag is CoworkFolderTag => Boolean(tag)) : undefined;
        conversation.threads = Array.isArray(conversation.threads) ? conversation.threads.map(sanitizeThread).filter((thread): thread is CoworkThread => Boolean(thread)) : undefined;
      }
      // Repair exact legacy duplicates without reopening completed work.
      const unique = new Map<string, CoworkTodo>();
      for (const todo of this.data.todos) {
        const key = `${todo.conversationId}:${todo.agentId}:${taskKey(todo.text)}`;
        const prior = unique.get(key);
        if (!prior) unique.set(key, todo);
        else if (todo.status === 'done' || (prior.status !== 'done' && todo.updatedAt > prior.updatedAt)) Object.assign(prior, { status: todo.status, note: todo.note, updatedAt: todo.updatedAt });
      }
      this.data.todos = [...unique.values()];
      for (const agent of this.data.agents) agent.skills = [...new Set(['browser-workflow', ...(agent.skills ?? [])])];
    } catch {
      // A corrupt file must not wipe the team silently: keep defaults in
      // memory; the next successful save replaces the damaged document.
      this.data = emptyCoworkData();
    }
    return this.data;
  }

  private save(rosterChanged = false): void {
    const file = this.file();
    mkdirSync(path.dirname(file), { recursive: true });
    // Write-then-rename so a crash mid-write cannot truncate the document.
    const temporary = `${file}.${process.pid}.tmp`;
    writeFileSync(temporary, JSON.stringify(this.data, null, 2), 'utf8');
    try {
      renameSync(temporary, file);
    } catch {
      // Windows can refuse the rename while another handle holds the file;
      // fall back to a direct overwrite rather than losing the update.
      writeFileSync(file, JSON.stringify(this.data, null, 2), 'utf8');
      try {
        rmSync(temporary, { force: true });
      } catch {
        /* best effort */
      }
    }
    if (rosterChanged) {
      this.rosterRevision += 1;
      this.onRosterChange?.();
    }
  }

  // ---------------------------------------------------------------- agents

  listAgents(): CoworkAgent[] {
    return [...this.load().agents];
  }

  getAgent(id: string): CoworkAgent | undefined {
    return this.load().agents.find((a) => a.id === id);
  }

  saveAgent(input: Partial<Omit<CoworkAgent, 'avatar'>> & { name: string; systemPrompt: string; avatar?: unknown }): CoworkAgent {
    const data = this.load();
    const name = input.name.trim().slice(0, 60);
    if (!name) throw new Error('Agent name is required');
    if (!input.systemPrompt.trim()) throw new Error('Agent instructions are required');
    const existing = input.id ? data.agents.find((a) => a.id === input.id) : undefined;
    if (data.agents.some((a) => a.id !== existing?.id && a.name.toLowerCase() === name.toLowerCase())) throw new Error('Agent names must be unique so mentions identify one teammate.');
    const agent: CoworkAgent = {
      id: existing?.id ?? `ca-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e4)}`,
      name,
      avatar: sanitizeAvatar(input.avatar, existing?.avatar),
      tagline: (input.tagline ?? existing?.tagline ?? '').trim().slice(0, 120),
      systemPrompt: input.systemPrompt.trim().slice(0, 8_000),
      provider: input.provider?.trim() || existing?.provider || undefined,
      model: input.model?.trim() || existing?.model || undefined,
      effort: input.effort ?? existing?.effort,
      skills: sanitizeNames(['browser-workflow', ...(input.skills ?? existing?.skills ?? [])]),
      allowShell: input.allowShell ?? existing?.allowShell ?? false,
      allowWrites: input.allowWrites ?? existing?.allowWrites ?? false,
      allowConfig: input.allowConfig ?? existing?.allowConfig ?? false,
      useHostComputer: input.useHostComputer ?? existing?.useHostComputer ?? true,
      chiefOfStaff: input.chiefOfStaff ?? existing?.chiefOfStaff ?? false,
      createdAt: existing?.createdAt ?? new Date().toISOString(),
    };
    data.agents = existing ? data.agents.map((a) => (a.id === agent.id ? agent : a)) : [...data.agents, agent];
    this.save(true);
    return agent;
  }

  deleteAgent(id: string): boolean {
    const data = this.load();
    if (!data.agents.some((a) => a.id === id)) return false;
    const previousConversationIds = new Set(data.conversations.map((conversation) => conversation.id));
    data.agents = data.agents.filter((a) => a.id !== id);
    // Remove the agent from every group; delete DMs that were only with them.
    data.conversations = data.conversations.filter((c) => {
      if (!c.memberIds.includes(id)) return true;
      if (c.kind === 'dm') return false;
      c.memberIds = c.memberIds.filter((m) => m !== id);
      if (c.chiefId === id) delete c.chiefId;
      return c.memberIds.length > 0;
    });
    const conversationIds = new Set(data.conversations.map((conversation) => conversation.id));
    for (const conversationId of previousConversationIds) {
      if (!conversationIds.has(conversationId)) rmSync(this.artifactDir(conversationId), { recursive: true, force: true });
    }
    data.missions = data.missions.filter((mission) => mission.agentId !== id && conversationIds.has(mission.conversationId));
    data.followUps = data.followUps.filter((followUp) => followUp.agentId !== id && conversationIds.has(followUp.conversationId));
    data.inbox = data.inbox.filter((message) => message.fromAgentId !== id && message.toAgentId !== id && conversationIds.has(message.conversationId));
    data.todos = data.todos.filter((todo) => todo.agentId !== id && conversationIds.has(todo.conversationId));
    data.requests = data.requests.filter((request) => request.agentId !== id && conversationIds.has(request.conversationId));
    data.workLog = data.workLog.filter((entry) => entry.agentId !== id && conversationIds.has(entry.conversationId));
    data.artifacts = data.artifacts.filter((artifact) => conversationIds.has(artifact.conversationId));
    this.save(true);
    return true;
  }

  // ---------------------------------------------------------- conversations

  listConversations(): CoworkConversation[] {
    return [...this.load().conversations];
  }

  getConversation(id: string): CoworkConversation | undefined {
    return this.load().conversations.find((c) => c.id === id);
  }

  saveConversation(input: {
    id?: string;
    kind: 'dm' | 'group';
    title?: string;
    memberIds: string[];
    chiefId?: string;
    telegram?: CoworkTelegramConfig;
    schedule?: CoworkSchedule;
  }): CoworkConversation {
    const data = this.load();
    const memberIds = [...new Set(input.memberIds)].filter((id) => data.agents.some((a) => a.id === id));
    if (memberIds.length === 0) throw new Error('A conversation needs at least one team member');
    if (input.kind === 'group' && memberIds.length < 2) throw new Error('A group chat needs at least two team members');
    const existing = input.id ? data.conversations.find((c) => c.id === input.id) : undefined;
    const now = new Date().toISOString();
    const title = (input.title ?? existing?.title ?? '').trim().slice(0, 120);
    const conv: CoworkConversation = {
      id: existing?.id ?? `cc-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e4)}`,
      kind: input.kind,
      title: title || (input.kind === 'group' ? 'Team room' : data.agents.find((a) => a.id === memberIds[0])?.name ?? 'Chat'),
      memberIds,
      chiefId: input.chiefId && memberIds.includes(input.chiefId) ? input.chiefId : existing?.chiefId,
      telegram: input.telegram ?? existing?.telegram,
      schedule: input.schedule ?? existing?.schedule,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
    data.conversations = existing ? data.conversations.map((c) => (c.id === conv.id ? conv : c)) : [...data.conversations, conv];
    this.save(true);
    return conv;
  }

  updateConversation(id: string, patch: Partial<Pick<CoworkConversation, 'title' | 'memberIds' | 'chiefId' | 'telegram' | 'schedule'>>): CoworkConversation | undefined {
    const data = this.load();
    const existing = data.conversations.find((c) => c.id === id);
    if (!existing) return undefined;
    if (patch.memberIds) {
      const memberIds = [...new Set(patch.memberIds)].filter((m) => data.agents.some((a) => a.id === m));
      if (existing.kind === 'group' && memberIds.length < 2) throw new Error('A group chat needs at least two team members');
      existing.memberIds = memberIds;
      if (existing.chiefId && !memberIds.includes(existing.chiefId)) delete existing.chiefId;
    }
    if (patch.title !== undefined) existing.title = patch.title.trim().slice(0, 120) || existing.title;
    if (patch.chiefId !== undefined) {
      if (patch.chiefId && existing.memberIds.includes(patch.chiefId)) existing.chiefId = patch.chiefId;
      else if (!patch.chiefId) delete existing.chiefId;
    }
    if (patch.telegram !== undefined) existing.telegram = sanitizeTelegram(patch.telegram);
    if (patch.schedule !== undefined) existing.schedule = sanitizeSchedule(patch.schedule);
    existing.updatedAt = new Date().toISOString();
    this.save(true);
    return existing;
  }

  updateTelegramOffset(token: string, offset: number): void {
    if (!Number.isSafeInteger(offset) || offset < 0) return;
    let changed = false;
    for (const conversation of this.load().conversations) {
      if (conversation.telegram?.token !== token || conversation.telegram.offset === offset) continue;
      conversation.telegram.offset = offset;
      changed = true;
    }
    if (changed) this.save();
  }

  // ------------------------------------------------------- tagged folders

  folders(conversationId: string): CoworkFolderTag[] {
    return [...(this.getConversation(conversationId)?.folders ?? [])];
  }

  /** Tag a folder for the conversation. Adding the same path twice is a no-op. */
  addFolder(input: { conversationId: string; path: string; label?: string; agentId?: string }): CoworkFolderTag {
    const data = this.load();
    const conversation = data.conversations.find((candidate) => candidate.id === input.conversationId);
    if (!conversation) throw new Error('Conversation not found');
    if (input.agentId && !data.agents.some((agent) => agent.id === input.agentId)) throw new Error('Tagging agent not found');
    const requestedPath = String(input.path ?? '').trim();
    if (!requestedPath) throw new Error('Folder path is required');
    const folderPath = path.resolve(requestedPath);
    const existing = (conversation.folders ?? []).find((tag) => path.resolve(tag.path).toLowerCase() === folderPath.toLowerCase());
    if (existing) return existing;
    const label = (input.label ?? '').trim().slice(0, 80) || path.basename(folderPath) || folderPath;
    const tag: CoworkFolderTag = {
      id: `cfd-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e5)}`,
      path: folderPath.slice(0, 500),
      label,
      agentId: input.agentId,
      createdAt: new Date().toISOString(),
    };
    conversation.folders = [...(conversation.folders ?? []), tag];
    conversation.updatedAt = tag.createdAt;
    this.save(true);
    return tag;
  }

  removeFolder(conversationId: string, folderId: string): boolean {
    const data = this.load();
    const conversation = data.conversations.find((candidate) => candidate.id === conversationId);
    if (!conversation?.folders) return false;
    const before = conversation.folders.length;
    conversation.folders = conversation.folders.filter((tag) => tag.id !== folderId);
    if (conversation.folders.length === before) return false;
    conversation.updatedAt = new Date().toISOString();
    this.save(true);
    return true;
  }

  // ------------------------------------------------------------- threads

  threads(conversationId: string): CoworkThread[] {
    return [...(this.getConversation(conversationId)?.threads ?? [])];
  }

  getThread(conversationId: string, threadId: string): CoworkThread | undefined {
    return (this.getConversation(conversationId)?.threads ?? []).find((thread) => thread.id === threadId);
  }

  addThread(input: { conversationId: string; title: string; topic?: string; createdByAgentId?: string }): CoworkThread {
    const data = this.load();
    const conversation = data.conversations.find((candidate) => candidate.id === input.conversationId);
    if (!conversation) throw new Error('Conversation not found');
    if (input.createdByAgentId && !data.agents.some((agent) => agent.id === input.createdByAgentId)) throw new Error('Thread author not found');
    const title = String(input.title ?? '').trim().slice(0, 120);
    if (!title) throw new Error('Thread title is required');
    const duplicate = (conversation.threads ?? []).find((thread) => taskKey(thread.title) === taskKey(title));
    if (duplicate) return duplicate;
    const thread: CoworkThread = {
      id: `cth-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e5)}`,
      title,
      topic: typeof input.topic === 'string' && input.topic.trim() ? input.topic.trim().slice(0, 1_000) : undefined,
      createdByAgentId: input.createdByAgentId,
      createdAt: new Date().toISOString(),
    };
    conversation.threads = [...(conversation.threads ?? []), thread];
    conversation.updatedAt = thread.createdAt;
    this.save(true);
    return thread;
  }

  updateThread(conversationId: string, threadId: string, patch: { title?: string; topic?: string }): CoworkThread | undefined {
    const conversation = this.load().conversations.find((candidate) => candidate.id === conversationId);
    const thread = conversation?.threads?.find((candidate) => candidate.id === threadId);
    if (!conversation || !thread) return undefined;
    if (patch.title !== undefined) {
      const title = patch.title.trim().slice(0, 120);
      if (title) thread.title = title;
    }
    if (patch.topic !== undefined) thread.topic = patch.topic.trim().slice(0, 1_000) || undefined;
    conversation.updatedAt = new Date().toISOString();
    this.save(true);
    return thread;
  }

  /** Deleting a thread removes its messages; the Main thread cannot be deleted. */
  deleteThread(conversationId: string, threadId: string): boolean {
    const data = this.load();
    const conversation = data.conversations.find((candidate) => candidate.id === conversationId);
    if (!conversation?.threads?.some((thread) => thread.id === threadId)) return false;
    conversation.threads = conversation.threads.filter((thread) => thread.id !== threadId);
    const list = data.messages[conversationId];
    if (list) data.messages[conversationId] = list.filter((message) => message.threadId !== threadId);
    conversation.updatedAt = new Date().toISOString();
    this.save(true);
    return true;
  }

  deleteConversation(id: string): boolean {
    const data = this.load();
    if (!data.conversations.some((c) => c.id === id)) return false;
    data.conversations = data.conversations.filter((c) => c.id !== id);
    delete data.messages[id];
    data.missions = data.missions.filter((mission) => mission.conversationId !== id);
    data.followUps = data.followUps.filter((followUp) => followUp.conversationId !== id);
    data.inbox = data.inbox.filter((message) => message.conversationId !== id);
    data.todos = data.todos.filter((todo) => todo.conversationId !== id);
    data.workLog = data.workLog.filter((entry) => entry.conversationId !== id);
    data.requests = data.requests.filter((request) => request.conversationId !== id);
    data.artifacts = data.artifacts.filter((artifact) => artifact.conversationId !== id);
    data.widgets = data.widgets.filter((widget) => widget.conversationId !== id);
    rmSync(this.artifactDir(id), { recursive: true, force: true });
    this.save(true);
    return true;
  }

  // -------------------------------------------------------------- messages

  /** Messages in a conversation. `threadId` undefined returns every thread;
   *  null selects the Main thread; a string selects that thread. */
  messages(conversationId: string, afterSeq = 0, threadId?: string | null): CoworkMessage[] {
    const all = this.load().messages[conversationId] ?? [];
    const scoped = threadId === undefined ? all : all.filter((m) => (threadId === null ? !m.threadId : m.threadId === threadId));
    return afterSeq > 0 ? scoped.filter((m) => m.seq > afterSeq) : [...scoped];
  }

  // ------------------------------------------------------------ user profile

  userProfile(): CoworkUserProfile {
    return { ...(this.load().userProfile ?? {}) };
  }

  saveUserProfile(patch: CoworkUserProfile): CoworkUserProfile {
    const data = this.load();
    const clean = (value: unknown, max: number): string | undefined =>
      typeof value === 'string' && value.trim() ? value.trim().slice(0, max) : undefined;
    data.userProfile = {
      name: clean(patch.name, 80),
      about: clean(patch.about, 2_000),
      preferences: clean(patch.preferences, 2_000),
    };
    this.save();
    return { ...data.userProfile };
  }

  // ------------------------------------------------------- autonomy layer

  // Missions: long-running autonomous jobs worked in bounded sessions.

  missions(conversationId?: string): CoworkMission[] {
    const all = [...this.load().missions].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return conversationId ? all.filter((m) => m.conversationId === conversationId) : all;
  }

  getMission(id: string): CoworkMission | undefined {
    return this.load().missions.find((m) => m.id === id);
  }

  createMission(input: { conversationId: string; agentId: string; goal: string; criteria: string[]; maxTurns?: number; budgetUsd?: number; reserveUsd?: number }): CoworkMission {
    const data = this.load();
    if (!data.conversations.some((c) => c.id === input.conversationId)) throw new Error('Conversation not found');
    if (!data.agents.some((a) => a.id === input.agentId)) throw new Error('Unknown agent for mission');
    const goal = input.goal.trim();
    if (!goal) throw new Error('Mission goal is required');
    const mission: CoworkMission = {
      id: `cm-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e4)}`,
      conversationId: input.conversationId,
      agentId: input.agentId,
      goal: goal.slice(0, 2_000),
      criteria: (Array.isArray(input.criteria) ? input.criteria.map((c) => String(c).trim()).filter(Boolean) : []).slice(0, 12),
      status: 'running',
      progress: '',
      guidance: [],
      turns: 0,
      maxTurns: Math.max(1, Math.min(50, Math.floor(input.maxTurns ?? 12))),
      // Absent means "draw from the conversation pool without its own ceiling",
      // not "unlimited": the pool the mission draws from is finite either way.
      budget:
        input.budgetUsd !== undefined && Number.isFinite(input.budgetUsd) && input.budgetUsd > 0
          ? {
              maxCostUsd: Math.max(0.01, Math.round(input.budgetUsd * 100) / 100),
              ...(input.reserveUsd !== undefined && Number.isFinite(input.reserveUsd) && input.reserveUsd > 0
                ? { reserveUsd: Math.round(input.reserveUsd * 100) / 100 }
                : {}),
            }
          : undefined,
      nextWakeAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
    };
    data.missions.push(mission);
    this.save();
    return mission;
  }

  updateMission(id: string, patch: Partial<Omit<CoworkMission, 'id' | 'createdAt'>>): CoworkMission | undefined {
    const data = this.load();
    const mission = data.missions.find((m) => m.id === id);
    if (!mission) return undefined;
    Object.assign(mission, patch);
    this.save();
    return mission;
  }

  /** Cancel = terminal; finished missions stay for the transcript/history. */
  cancelMission(id: string): boolean {
    const mission = this.getMission(id);
    if (!mission || (mission.status !== 'running' && mission.status !== 'blocked')) return false;
    this.updateMission(id, { status: 'cancelled', finishedAt: new Date().toISOString(), nextWakeAt: undefined });
    return true;
  }

  // Follow-ups: an agent's own scheduled wake-ups.

  addFollowUp(input: { conversationId: string; agentId: string; note: string; dueAt: string }): CoworkFollowUp {
    const data = this.load();
    const conversation = data.conversations.find((candidate) => candidate.id === input.conversationId);
    if (!conversation || !conversation.memberIds.includes(input.agentId)) throw new Error('Follow-up agent is not in this conversation');
    const note = input.note.trim();
    if (!note) throw new Error('Follow-up note is required');
    if (!Number.isFinite(Date.parse(input.dueAt))) throw new Error('Follow-up due date is invalid');
    const existing = data.followUps.find((item) => item.conversationId === input.conversationId && item.agentId === input.agentId && taskKey(item.note) === taskKey(note.slice(0, 1_000)));
    if (existing) return existing;
    const followUp: CoworkFollowUp = {
      id: `cf-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e4)}`,
      conversationId: input.conversationId,
      agentId: input.agentId,
      note: note.slice(0, 1_000),
      dueAt: input.dueAt,
      createdAt: new Date().toISOString(),
    };
    data.followUps.push(followUp);
    this.save();
    return followUp;
  }

  dueFollowUps(now = Date.now()): CoworkFollowUp[] {
    return this.load().followUps.filter((f) => Date.parse(f.dueAt) <= now);
  }

  takeFollowUp(id: string): CoworkFollowUp | undefined {
    const data = this.load();
    const followUp = data.followUps.find((f) => f.id === id);
    if (!followUp) return undefined;
    data.followUps = data.followUps.filter((f) => f.id !== id);
    this.save();
    return followUp;
  }

  // Inbox: agent-to-agent mail, delivered on the recipient's next wake-up.

  addInbox(input: { fromAgentId: string; toAgentId: string; conversationId: string; text: string }): CoworkInboxMessage {
    const data = this.load();
    if (!data.agents.some((agent) => agent.id === input.fromAgentId)) throw new Error('Unknown inbox sender');
    if (!data.agents.some((agent) => agent.id === input.toAgentId)) throw new Error('Unknown inbox recipient');
    if (!data.conversations.some((conversation) => conversation.id === input.conversationId)) throw new Error('Unknown inbox conversation');
    const text = input.text.trim();
    if (!text) throw new Error('Inbox message is required');
    const existing = data.inbox.find((item) => !item.deliveredAt && item.fromAgentId === input.fromAgentId && item.toAgentId === input.toAgentId && item.conversationId === input.conversationId && taskKey(item.text) === taskKey(text.slice(0, 4_000)));
    if (existing) return existing;
    const message: CoworkInboxMessage = {
      id: `ci-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e4)}`,
      fromAgentId: input.fromAgentId,
      toAgentId: input.toAgentId,
      conversationId: input.conversationId,
      text: text.slice(0, 4_000),
      createdAt: new Date().toISOString(),
    };
    data.inbox.push(message);
    this.save();
    return message;
  }

  /** Undelivered mail for one agent. Accepts the id or the display name. */
  inboxFor(agentIdOrName: string): CoworkInboxMessage[] {
    const data = this.load();
    const agentId = data.agents.find((agent) => agent.id === agentIdOrName || agent.name.toLowerCase() === agentIdOrName.toLowerCase())?.id ?? agentIdOrName;
    return data.inbox.filter((message) => !message.deliveredAt && message.toAgentId === agentId);
  }

  markInboxDelivered(ids: string[]): void {
    const data = this.load();
    const now = new Date().toISOString();
    for (const message of data.inbox) {
      if (ids.includes(message.id) && !message.deliveredAt) message.deliveredAt = now;
    }
    this.save();
  }

  /** Inbox mail old enough to deliver proactively by the ticker. */
  dueInbox(now = Date.now(), graceMs = 20_000): CoworkInboxMessage[] {
    return this.load().inbox.filter((m) => !m.deliveredAt && now - Date.parse(m.createdAt) >= graceMs);
  }

  // Files: durable, server-owned copies shown in Cowork and delivered to Telegram.

  private artifactDir(conversationId: string): string {
    return path.join(path.dirname(this.file()), 'artifacts', conversationId);
  }

  addArtifact(input: { id?: string; conversationId: string; agentId?: string; name: string; mime?: string; dataBase64: string }): CoworkArtifact {
    const data = this.load();
    const conversation = data.conversations.find((candidate) => candidate.id === input.conversationId);
    if (!conversation) throw new Error('Artifact conversation not found');
    if (input.agentId && !data.agents.some((agent) => agent.id === input.agentId)) throw new Error('Artifact agent not found');
    const name = safeArtifactName(input.name);
    const bytes = Buffer.from(String(input.dataBase64 ?? '').replace(/\s+/g, ''), 'base64');
    if (bytes.length === 0) throw new Error('Artifact is empty');
    if (bytes.length > MAX_ARTIFACT_BYTES) throw new Error(`Artifact exceeds the ${MAX_ARTIFACT_BYTES / 1_000_000} MB Cowork limit`);
    const id = input.id && /^[a-z0-9-]{8,80}$/i.test(input.id) ? input.id : `cf-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6)}`;
    const storageName = `${id}-${name}`;
    const dir = this.artifactDir(conversation.id);
    mkdirSync(dir, { recursive: true });
    writeFileSync(path.join(dir, storageName), bytes);
    // Keep the existing private-computer exchange format so receive_file can
    // import files attached by the user or Telegram as well as agent exports.
    writeFileSync(path.join(dir, `${id}.json`), JSON.stringify({ agentId: input.agentId, path: name, data: bytes.toString('base64') }), 'utf8');
    const artifact: CoworkArtifact = {
      id,
      conversationId: conversation.id,
      agentId: input.agentId,
      name,
      mime: artifactMime(name, input.mime),
      size: bytes.length,
      storageName,
      createdAt: new Date().toISOString(),
    };
    data.artifacts = data.artifacts.filter((candidate) => candidate.id !== id);
    data.artifacts.push(artifact);
    this.save();
    return artifact;
  }

  artifacts(conversationId: string): CoworkArtifact[] {
    return this.load().artifacts.filter((artifact) => artifact.conversationId === conversationId);
  }

  getArtifact(id: string): CoworkArtifact | undefined {
    return this.load().artifacts.find((artifact) => artifact.id === id);
  }

  artifactPath(id: string): string | undefined {
    const artifact = this.getArtifact(id);
    if (!artifact || !/^[a-z0-9_.-]+$/i.test(artifact.storageName)) return undefined;
    const candidate = path.join(this.artifactDir(artifact.conversationId), artifact.storageName);
    return existsSync(candidate) ? candidate : undefined;
  }

  // Widgets: small dashboard cards the team pins to the cowork sidebar.

  widgets(conversationId: string): CoworkWidget[] {
    return this.load().widgets
      .filter((widget) => widget.conversationId === conversationId)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  getWidget(id: string): CoworkWidget | undefined {
    return this.load().widgets.find((widget) => widget.id === id);
  }

  /** Create or update a widget. Updating matches by id or by case-insensitive title. */
  saveWidget(input: { id?: string; conversationId: string; title: string; icon?: string; kind: CoworkWidgetKind; data: unknown; createdByAgentId?: string }): CoworkWidget {
    const data = this.load();
    const conversation = data.conversations.find((candidate) => candidate.id === input.conversationId);
    if (!conversation) throw new Error('Widget conversation not found');
    if (input.createdByAgentId && !data.agents.some((agent) => agent.id === input.createdByAgentId)) throw new Error('Widget author not found');
    const title = String(input.title ?? '').trim().slice(0, 120);
    if (!title) throw new Error('Widget title is required');
    const kind: CoworkWidgetKind = ['stats', 'list', 'progress', 'links', 'text'].includes(input.kind) ? input.kind : 'text';
    const sanitized = sanitizeWidgetData(kind, input.data);
    const existing = data.widgets.find((widget) => widget.conversationId === input.conversationId && (widget.id === input.id || taskKey(widget.title) === taskKey(title)));
    const now = new Date().toISOString();
    if (existing) {
      existing.title = title;
      existing.icon = typeof input.icon === 'string' && /^[a-z][a-z0-9-]{0,23}$/.test(input.icon) ? input.icon : existing.icon;
      existing.kind = kind;
      existing.data = sanitized;
      existing.createdByAgentId = input.createdByAgentId ?? existing.createdByAgentId;
      existing.updatedAt = now;
      this.save(true);
      return existing;
    }
    const widget: CoworkWidget = {
      id: `cw-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e5)}`,
      conversationId: input.conversationId,
      title,
      icon: typeof input.icon === 'string' && /^[a-z][a-z0-9-]{0,23}$/.test(input.icon) ? input.icon : undefined,
      kind,
      data: sanitized,
      createdByAgentId: input.createdByAgentId,
      createdAt: now,
      updatedAt: now,
    };
    data.widgets.push(widget);
    this.save(true);
    return widget;
  }

  /** Delete a widget. `agentId` restricts deletion to the author's own widgets. */
  deleteWidget(id: string, agentId?: string): boolean {
    const data = this.load();
    const before = data.widgets.length;
    data.widgets = data.widgets.filter((widget) => widget.id !== id || (agentId !== undefined && widget.createdByAgentId !== agentId));
    if (data.widgets.length === before) return false;
    this.save(true);
    return true;
  }

  // To-do list: one shared checklist per conversation, owned item-by-item.

  todos(conversationId: string): CoworkTodo[] {
    return this.load().todos.filter((todo) => todo.conversationId === conversationId).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  addTodo(input: { conversationId: string; agentId: string; text: string }): CoworkTodo {
    const data = this.load();
    const conversation = data.conversations.find((candidate) => candidate.id === input.conversationId);
    if (!conversation?.memberIds.includes(input.agentId)) throw new Error('Todo owner is not in this conversation');
    const text = input.text.trim().slice(0, 500);
    if (!text) throw new Error('Todo text is required');
    const existing = data.todos.find((todo) => todo.conversationId === input.conversationId && todo.agentId === input.agentId && taskKey(todo.text) === taskKey(text));
    if (existing) return existing;
    const now = new Date().toISOString();
    const todo: CoworkTodo = { id: `ct-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e5)}`, conversationId: input.conversationId, agentId: input.agentId, text: text.slice(0, 500), status: 'pending', createdAt: now, updatedAt: now };
    data.todos.push(todo);
    this.save();
    return todo;
  }

  updateTodo(id: string, agentId: string, patch: { status?: CoworkTodo['status']; note?: string }): CoworkTodo | undefined {
    const todo = this.load().todos.find((candidate) => candidate.id === id && candidate.agentId === agentId);
    if (!todo) return undefined;
    if (patch.status) todo.status = patch.status;
    if (patch.note !== undefined) todo.note = patch.note.trim().slice(0, 500) || undefined;
    todo.updatedAt = new Date().toISOString();
    this.save();
    return todo;
  }

  removeTodo(id: string, agentId: string): boolean {
    const data = this.load();
    const before = data.todos.length;
    data.todos = data.todos.filter((todo) => todo.id !== id || todo.agentId !== agentId);
    if (data.todos.length === before) return false;
    this.save();
    return true;
  }

  recordWork(input: Omit<CoworkWorkEntry, 'ts'>): void {
    const data = this.load();
    data.workLog.push({ ...input, output: input.output.slice(0, 3_000), ts: new Date().toISOString() });
    const own = data.workLog.filter((entry) => entry.conversationId === input.conversationId && entry.agentId === input.agentId);
    const expired = new Set(own.slice(0, -40));
    data.workLog = data.workLog.filter((entry) => !expired.has(entry));
    this.save();
  }

  workLog(conversationId: string, agentId: string): CoworkWorkEntry[] {
    return this.load().workLog.filter((entry) => entry.conversationId === conversationId && entry.agentId === agentId);
  }

  // Interactive cards: user questions, capability permission, recommendations.

  requests(conversationId: string): CoworkRequest[] {
    return this.load().requests.filter((request) => request.conversationId === conversationId).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  getRequest(id: string): CoworkRequest | undefined {
    return this.load().requests.find((request) => request.id === id);
  }

  addRequest(input: { conversationId: string; agentId: string; kind: CoworkRequest['kind']; title: string; detail: string; options?: string[]; permission?: CoworkRequest['permission'] }): CoworkRequest {
    const data = this.load();
    const conversation = data.conversations.find((candidate) => candidate.id === input.conversationId);
    if (!conversation?.memberIds.includes(input.agentId)) throw new Error('Requesting agent is not in this conversation');
    const title = input.title.trim();
    const detail = input.detail.trim();
    if (!title || !detail) throw new Error('Request title and detail are required');
    if (input.kind === 'permission' && !input.permission) throw new Error('Permission type is required');
    const request: CoworkRequest = {
      id: `cr-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e5)}`,
      conversationId: input.conversationId,
      agentId: input.agentId,
      kind: input.kind,
      title: title.slice(0, 180),
      detail: detail.slice(0, 2_000),
      options: [...new Set((input.options ?? []).map((option) => String(option).trim()).filter(Boolean))].slice(0, 6),
      permission: input.permission,
      status: 'open',
      createdAt: new Date().toISOString(),
    };
    data.requests.push(request);
    this.save();
    return request;
  }

  resolveRequest(id: string, status: Exclude<CoworkRequest['status'], 'open'>, response?: string): CoworkRequest | undefined {
    const request = this.getRequest(id);
    if (!request || request.status !== 'open') return undefined;
    request.status = status;
    request.response = response?.trim().slice(0, 2_000) || undefined;
    request.resolvedAt = new Date().toISOString();
    this.save();
    return request;
  }

  markRequestTelegramNotified(id: string): CoworkRequest | undefined {
    const request = this.getRequest(id);
    if (!request || request.status !== 'open') return undefined;
    request.telegramNotifiedAt = new Date().toISOString();
    this.save();
    return request;
  }

  // ------------------------------------------------- per-agent memory
  // Memory now lives in the shared MemoryStore (same architecture as the main
  // agent — typed entries, lifecycle, isolation). See cowork/memory.ts.

  appendMessage(conversationId: string, message: Omit<CoworkMessage, 'seq' | 'id' | 'ts'> & { id?: string; ts?: string }): CoworkMessage {
    const data = this.load();
    if (!data.conversations.some((c) => c.id === conversationId)) throw new Error(`Conversation ${conversationId} not found`);
    const list = (data.messages[conversationId] ??= []);
    const stored: CoworkMessage = {
      ...message,
      id: message.id ?? `cm-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6)}`,
      seq: list.length > 0 ? list[list.length - 1]!.seq + 1 : 1,
      ts: message.ts ?? new Date().toISOString(),
    };
    list.push(stored);
    if (list.length > MAX_MESSAGES_PER_CONVERSATION) list.splice(0, list.length - MAX_MESSAGES_PER_CONVERSATION);
    const conv = data.conversations.find((c) => c.id === conversationId);
    if (conv) conv.updatedAt = stored.ts;
    this.save();
    return stored;
  }
}

function sanitizeNames(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((v) => String(v).trim()).filter(Boolean))].slice(0, 24);
}

function safeArtifactName(value: string): string {
  return (path.basename(String(value || 'file')).replace(/[\x00-\x1f<>:"/\\|?*]+/g, '-').trim() || 'file').slice(0, 160);
}

function artifactMime(name: string, supplied?: string): string {
  const known: Record<string, string> = {
    '.txt': 'text/plain; charset=utf-8', '.md': 'text/markdown; charset=utf-8', '.json': 'application/json; charset=utf-8', '.csv': 'text/csv; charset=utf-8',
    '.pdf': 'application/pdf', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp',
    '.doc': 'application/msword', '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    '.xls': 'application/vnd.ms-excel', '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    '.ppt': 'application/vnd.ms-powerpoint', '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  };
  return known[path.extname(name).toLowerCase()] ?? (typeof supplied === 'string' && /^[\w.+-]+\/[\w.+-]+(?:;.*)?$/.test(supplied) ? supplied : 'application/octet-stream');
}

const AVATAR_SHAPES = new Set(['orb', 'jelly', 'cat', 'sprout', 'ufo', 'cube', 'visor', 'antenna', 'bot']);
const AVATAR_COLORS = new Set(['#8f80ff', '#5ba8ff', '#3fd68f', '#c9a86a', '#ff6465', '#e670c8', '#4ec3d9', '#9dd65b']);

function sanitizeAvatar(value: unknown, fallback: CoworkAvatar | undefined): CoworkAvatar {
  const raw = (value ?? {}) as Record<string, unknown>;
  const color = typeof raw['color'] === 'string' && AVATAR_COLORS.has(raw['color'].toLowerCase()) ? raw['color'].toLowerCase() : fallback?.color ?? '#8f80ff';
  const shape = typeof raw['shape'] === 'string' && AVATAR_SHAPES.has(raw['shape']) ? (raw['shape'] as CoworkAvatar['shape']) : fallback?.shape ?? 'orb';
  return { color, shape };
}

function sanitizeTelegram(value: unknown): CoworkTelegramConfig {
  const raw = (value ?? {}) as Record<string, unknown>;
  return {
    enabled: raw['enabled'] === true,
    token: typeof raw['token'] === 'string' && raw['token'].trim() ? raw['token'].trim() : undefined,
    chatId: raw['chatId'] !== undefined && raw['chatId'] !== '' ? String(raw['chatId']) : undefined,
    chatTitle: typeof raw['chatTitle'] === 'string' ? raw['chatTitle'] : undefined,
    offset: Number.isSafeInteger(raw['offset']) && Number(raw['offset']) >= 0 ? Number(raw['offset']) : undefined,
  };
}

function sanitizeSchedule(value: unknown): CoworkSchedule | undefined {
  const raw = (value ?? {}) as Record<string, unknown>;
  const goal = String(raw['goal'] ?? '').trim();
  const every = String(raw['every'] ?? '').trim();
  if (!goal || !every) return undefined;
  return {
    every: every.slice(0, 40),
    goal: goal.slice(0, 2_000),
    enabled: raw['enabled'] !== false,
    lastRunAt: typeof raw['lastRunAt'] === 'string' ? raw['lastRunAt'] : undefined,
  };
}

function randomId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e5)}`;
}

function cleanString(value: unknown, max: number): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function sanitizeFolderTag(value: unknown): CoworkFolderTag | undefined {
  const raw = (value ?? {}) as Record<string, unknown>;
  const folderPath = cleanString(raw['path'], 500);
  if (!folderPath) return undefined;
  return {
    id: typeof raw['id'] === 'string' && /^[\w-]{3,80}$/.test(raw['id']) ? raw['id'] : randomId('cfd'),
    path: folderPath,
    label: cleanString(raw['label'], 80) || path.basename(folderPath) || folderPath,
    agentId: cleanString(raw['agentId'], 80) || undefined,
    createdAt: typeof raw['createdAt'] === 'string' ? raw['createdAt'] : new Date().toISOString(),
  };
}

function sanitizeThread(value: unknown): CoworkThread | undefined {
  const raw = (value ?? {}) as Record<string, unknown>;
  const title = cleanString(raw['title'], 120);
  if (!title) return undefined;
  return {
    id: typeof raw['id'] === 'string' && /^[\w-]{3,80}$/.test(raw['id']) ? raw['id'] : randomId('cth'),
    title,
    topic: cleanString(raw['topic'], 1_000) || undefined,
    createdByAgentId: cleanString(raw['createdByAgentId'], 80) || undefined,
    createdAt: typeof raw['createdAt'] === 'string' ? raw['createdAt'] : new Date().toISOString(),
  };
}

/** Widget payloads are strict per kind: the UI renders them without HTML. */
function sanitizeWidgetData(kind: CoworkWidgetKind, value: unknown): Record<string, unknown> {
  const raw = (value ?? {}) as Record<string, unknown>;
  if (kind === 'stats') {
    const items = (Array.isArray(raw['items']) ? raw['items'] : []).slice(0, 12);
    return {
      items: items
        .map((item) => {
          const row = (item ?? {}) as Record<string, unknown>;
          return { label: cleanString(row['label'], 60), value: cleanString(row['value'], 120) };
        })
        .filter((row) => row.label),
    };
  }
  if (kind === 'list') {
    const items = (Array.isArray(raw['items']) ? raw['items'] : []).slice(0, 20);
    return {
      items: items
        .map((item) => {
          const row = (item ?? {}) as Record<string, unknown>;
          return { text: cleanString(row['text'], 200), done: row['done'] === true };
        })
        .filter((row) => row.text),
    };
  }
  if (kind === 'progress') {
    const percent = Math.round(Number(raw['value']));
    return { label: cleanString(raw['label'], 120), value: Number.isFinite(percent) ? Math.max(0, Math.min(100, percent)) : 0 };
  }
  if (kind === 'links') {
    const items = (Array.isArray(raw['items']) ? raw['items'] : []).slice(0, 10);
    return {
      items: items
        .map((item) => {
          const row = (item ?? {}) as Record<string, unknown>;
          const url = cleanString(row['url'], 500);
          const label = cleanString(row['label'], 80);
          if (!label || !/^https?:\/\//i.test(url)) return null;
          return { label, url };
        })
        .filter((row): row is { label: string; url: string } => Boolean(row)),
    };
  }
  return { text: cleanString(raw['text'], 2_000) };
}

function sanitizeWidget(value: unknown): CoworkWidget | undefined {
  const raw = (value ?? {}) as Record<string, unknown>;
  const conversationId = cleanString(raw['conversationId'], 80);
  const title = cleanString(raw['title'], 120);
  if (!conversationId || !title) return undefined;
  const kind: CoworkWidgetKind = ['stats', 'list', 'progress', 'links', 'text'].includes(String(raw['kind'])) ? (raw['kind'] as CoworkWidgetKind) : 'text';
  return {
    id: typeof raw['id'] === 'string' && /^[\w-]{3,80}$/.test(raw['id']) ? raw['id'] : randomId('cw'),
    conversationId,
    title,
    icon: typeof raw['icon'] === 'string' && /^[a-z][a-z0-9-]{0,23}$/.test(raw['icon']) ? raw['icon'] : undefined,
    kind,
    data: sanitizeWidgetData(kind, raw['data']),
    createdByAgentId: cleanString(raw['createdByAgentId'], 80) || undefined,
    createdAt: typeof raw['createdAt'] === 'string' ? raw['createdAt'] : new Date().toISOString(),
    updatedAt: typeof raw['updatedAt'] === 'string' ? raw['updatedAt'] : new Date().toISOString(),
  };
}
