import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { ensureGituHome } from '../workspace/home.js';

/**
 * Cowork mode: a small team of named agent profiles the user chats with
 * directly (DMs) and assemblies into group chats. Everything persists in one
 * JSON document under the Agent Gitu home so a desktop restart keeps the
 * whole team, every transcript, and gateway settings.
 */

/** Voxel character configuration for an agent's three.js avatar. The UI
 *  renders it to an image once and reuses that everywhere. */
export interface CoworkAvatar {
  /** Hex accent color of the character body. */
  color: string;
  /** Head style rendered by the three.js character builder. */
  shape: 'cube' | 'visor' | 'antenna' | 'bot';
}

export interface CoworkAgent {
  id: string;
  name: string;
  /** three.js character config; the UI snapshots it to a PNG for lists. */
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
  via: 'web' | 'telegram' | 'schedule';
  /** Telegram author name / schedule label, for display. */
  from?: string;
  /** Tool calls the agent made while composing this message. */
  tools?: { name: string; ok: boolean }[];
  ts: string;
}

export interface CoworkTelegramConfig {
  enabled: boolean;
  /** Bot token from BotFather. Local-only file, never sent anywhere else. */
  token?: string;
  chatId?: string;
  chatTitle?: string;
}

export interface CoworkSchedule {
  every: string;
  goal: string;
  enabled: boolean;
  lastRunAt?: string;
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

export interface CoworkData {
  agents: CoworkAgent[];
  conversations: CoworkConversation[];
  /** Messages are keyed by conversation id to keep the document navigable. */
  messages: Record<string, CoworkMessage[]>;
  /** Shared "about the user" context injected into every teammate. */
  userProfile?: CoworkUserProfile;
}

export const EMPTY_COWORK_DATA: CoworkData = { agents: [], conversations: [], messages: {} };

const MAX_MESSAGES_PER_CONVERSATION = 2_000;

export class CoworkStore {
  private data: CoworkData = { ...EMPTY_COWORK_DATA, messages: {} };
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
      };
    } catch {
      // A corrupt file must not wipe the team silently: keep defaults in
      // memory; the next successful save replaces the damaged document.
      this.data = { ...EMPTY_COWORK_DATA, messages: {} };
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
      skills: sanitizeNames(input.skills ?? existing?.skills ?? []),
      allowShell: input.allowShell ?? existing?.allowShell ?? false,
      allowWrites: input.allowWrites ?? existing?.allowWrites ?? false,
      allowConfig: input.allowConfig ?? existing?.allowConfig ?? false,
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
    data.agents = data.agents.filter((a) => a.id !== id);
    // Remove the agent from every group; delete DMs that were only with them.
    data.conversations = data.conversations.filter((c) => {
      if (!c.memberIds.includes(id)) return true;
      if (c.kind === 'dm') return false;
      c.memberIds = c.memberIds.filter((m) => m !== id);
      if (c.chiefId === id) delete c.chiefId;
      return c.memberIds.length > 0;
    });
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

  deleteConversation(id: string): boolean {
    const data = this.load();
    if (!data.conversations.some((c) => c.id === id)) return false;
    data.conversations = data.conversations.filter((c) => c.id !== id);
    delete data.messages[id];
    this.save(true);
    return true;
  }

  // -------------------------------------------------------------- messages

  messages(conversationId: string, afterSeq = 0): CoworkMessage[] {
    const all = this.load().messages[conversationId] ?? [];
    return afterSeq > 0 ? all.filter((m) => m.seq > afterSeq) : [...all];
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

const AVATAR_SHAPES = new Set(['cube', 'visor', 'antenna', 'bot']);
const AVATAR_COLORS = new Set(['#8f80ff', '#5ba8ff', '#3fd68f', '#c9a86a', '#ff6465', '#e670c8', '#4ec3d9', '#9dd65b']);

function sanitizeAvatar(value: unknown, fallback: CoworkAvatar | undefined): CoworkAvatar {
  const raw = (value ?? {}) as Record<string, unknown>;
  const color = typeof raw['color'] === 'string' && AVATAR_COLORS.has(raw['color'].toLowerCase()) ? raw['color'].toLowerCase() : fallback?.color ?? '#8f80ff';
  const shape = typeof raw['shape'] === 'string' && AVATAR_SHAPES.has(raw['shape']) ? (raw['shape'] as CoworkAvatar['shape']) : fallback?.shape ?? 'cube';
  return { color, shape };
}

function sanitizeTelegram(value: unknown): CoworkTelegramConfig {
  const raw = (value ?? {}) as Record<string, unknown>;
  return {
    enabled: raw['enabled'] === true,
    token: typeof raw['token'] === 'string' && raw['token'].trim() ? raw['token'].trim() : undefined,
    chatId: raw['chatId'] !== undefined && raw['chatId'] !== '' ? String(raw['chatId']) : undefined,
    chatTitle: typeof raw['chatTitle'] === 'string' ? raw['chatTitle'] : undefined,
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
