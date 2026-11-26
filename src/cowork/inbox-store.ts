import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import nodePath from 'node:path';
import type { IncomingMessage } from 'node:http';
import type { CoworkAgent } from './store.js';

export type InboxToolPolicy = 'chat_only' | 'read_only' | 'standard' | 'custom';
export type InboxAgentTriggerMode = 'mention' | 'auto' | 'watch';
export type InboxMessageVisibility = 'public' | 'owner_only';
export type InboxNotesVisibility = 'owner_only' | 'shared_readonly';
export type InboxNoteKind = 'note' | 'summary' | 'decision';
export type InboxTaskKind = 'action' | 'coding' | 'research';
export type InboxTaskStatus = 'pending_approval' | 'todo' | 'in_progress' | 'done';

export interface InboxRoomNote {
  id: string;
  roomId: string;
  kind: InboxNoteKind;
  title: string;
  content: string;
  createdByType: 'owner' | 'agent';
  createdById: string;
  createdByName: string;
  sharedToChat?: boolean;
  sharedMessageId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface InboxRoomTask {
  id: string;
  roomId: string;
  title: string;
  description?: string;
  kind: InboxTaskKind;
  status: InboxTaskStatus;
  assignee?: string;
  projectPath?: string;
  requestedByType: 'owner' | 'member' | 'agent';
  requestedByName: string;
  /** Private Code run ID once delegated (strictly owner-only). */
  codeRunId?: string;
  /** Latest outcome summary from a coding run or research sub-agent. */
  delegationSummary?: string;
  subAgentRole?: string;
  createdAt: string;
  updatedAt: string;
}

export interface InboxCustomPerms {
  allowShell?: boolean;
  allowWrites?: boolean;
  allowConfig?: boolean;
  browser?: boolean;
}

export interface InboxMember {
  id: string;
  pikpamUserId: string;
  email: string;
  name: string;
  status: 'active' | 'revoked';
  /** Agents the owner explicitly allows this individual human to activate. */
  allowedAgentIds: string[];
  toolPolicy: InboxToolPolicy;
  customPerms?: InboxCustomPerms;
  budgetLimitUsd?: number;
  joinedAt: string;
  lastSeenAt?: string;
}

export interface InboxInvite {
  id: string;
  code?: string;
  pikpamInviteUrl?: string;
  label?: string;
  scopeType: 'dm' | 'group' | 'workspace';
  roomId?: string;
  targetEmail?: string;
  defaultAgentIds: string[];
  toolPolicy: InboxToolPolicy;
  customPerms?: InboxCustomPerms;
  budgetLimitUsd?: number;
  maxUses: number;
  usedCount: number;
  expiresAt?: string;
  revokedAt?: string;
  createdAt: string;
}

export interface InboxRoom {
  id: string;
  kind: 'dm' | 'group';
  title: string;
  /** Invited human member IDs in this room (owner always has access). */
  memberIds: string[];
  /** Agents activated by the owner for this room. */
  activeAgentIds: string[];
  /** Whether active agents reply only on @mention or automatically to messages. */
  agentTriggerMode: InboxAgentTriggerMode;
  toolPolicyOverride?: InboxToolPolicy;
  customPermsOverride?: InboxCustomPerms;
  /** Visibility of room notes, summaries, and saved tasks. Defaults to owner_only. */
  notesVisibility?: InboxNotesVisibility;
  /** Optional linked workspace project path for coding delegations from this room. */
  projectPath?: string;
  createdAt: string;
  updatedAt: string;
}

export interface InboxMessage {
  id: string;
  roomId: string;
  seq: number;
  senderType: 'owner' | 'member' | 'agent' | 'system';
  senderId: string;
  senderName: string;
  text: string;
  /** 'owner_only' messages are private owner <-> agent whispers, never sent to invited guests. */
  visibility?: InboxMessageVisibility;
  mentionedAgentIds?: string[];
  ts: string;
}

interface StoredMemberSession {
  tokenHash: string;
  memberId: string;
  createdAt: string;
  expiresAt: string;
}

interface InboxData {
  version: 1;
  members: InboxMember[];
  invites: InboxInvite[];
  rooms: InboxRoom[];
  messages: Record<string, InboxMessage[]>;
  notes: Record<string, InboxRoomNote[]>;
  tasks: Record<string, InboxRoomTask[]>;
  sessions: StoredMemberSession[];
}

const EMPTY_DATA: InboxData = {
  version: 1,
  members: [],
  invites: [],
  rooms: [],
  messages: {},
  notes: {},
  tasks: {},
  sessions: [],
};

/**
 * Strip owner-private workspace metadata from a room before returning it to
 * invited members (e.g. linked local project paths and silent watch mode
 * never leave the owner view).
 */
export function sanitizeInboxRoomForMember(room: InboxRoom): InboxRoom {
  const { projectPath: _hiddenPath, ...rest } = room;
  return {
    ...rest,
    agentTriggerMode: room.agentTriggerMode === 'watch' ? 'mention' : room.agentTriggerMode,
    notesVisibility: room.notesVisibility ?? 'owner_only',
  };
}

/**
 * Strip private coding run IDs, local project paths, and internal delegation
 * output from a task when a room's notes/tasks are explicitly shared read-only.
 */
export function sanitizeInboxTaskForMember(task: InboxRoomTask): InboxRoomTask {
  return {
    id: task.id,
    roomId: task.roomId,
    title: task.title,
    ...(task.description ? { description: task.description } : {}),
    kind: task.kind,
    status: task.status === 'pending_approval' ? 'todo' : task.status,
    ...(task.assignee ? { assignee: task.assignee } : {}),
    requestedByType: task.requestedByType,
    requestedByName: task.requestedByName,
    createdAt: task.createdAt,
    updatedAt: task.updatedAt,
  };
}

export const INBOX_MEMBER_COOKIE = 'gitu_inbox_member';
const MEMBER_SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function makeId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${randomBytes(4).toString('hex')}`;
}

export function parseCookieHeader(header: string | undefined, name: string): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx < 0) continue;
    const key = part.slice(0, idx).trim();
    if (key === name) return decodeURIComponent(part.slice(idx + 1).trim());
  }
  return undefined;
}

export function effectiveInboxPolicy(
  member: InboxMember | undefined,
  room: InboxRoom,
): { policy: InboxToolPolicy; customPerms?: InboxCustomPerms } {
  if (room.toolPolicyOverride) {
    return { policy: room.toolPolicyOverride, customPerms: room.customPermsOverride };
  }
  if (member) {
    return { policy: member.toolPolicy, customPerms: member.customPerms };
  }
  return { policy: 'standard' };
}

/**
 * Clamp an agent's capabilities for an invited human according to the owner's
 * chosen tool policy. Never elevates beyond the agent's own grants.
 */
export function clampInboxAgentForMember(
  agent: CoworkAgent,
  policy: InboxToolPolicy,
  customPerms?: InboxCustomPerms,
): { agent: CoworkAgent; allowTools: boolean; browser: boolean } {
  if (policy === 'chat_only') {
    return {
      agent: { ...agent, allowShell: false, allowWrites: false, allowConfig: false, chiefOfStaff: false },
      allowTools: false,
      browser: false,
    };
  }
  if (policy === 'read_only') {
    return {
      agent: { ...agent, allowShell: false, allowWrites: false, allowConfig: false, chiefOfStaff: false },
      allowTools: true,
      browser: false,
    };
  }
  if (policy === 'custom') {
    return {
      agent: {
        ...agent,
        allowShell: agent.allowShell && Boolean(customPerms?.allowShell),
        allowWrites: agent.allowWrites && Boolean(customPerms?.allowWrites),
        allowConfig: agent.allowConfig && Boolean(customPerms?.allowConfig),
        chiefOfStaff: false,
      },
      allowTools: true,
      browser: Boolean(customPerms?.browser),
    };
  }
  // standard: keep agent's normal permissions, without chiefOfStaff admin escalation
  return {
    agent: { ...agent, chiefOfStaff: false },
    allowTools: true,
    browser: true,
  };
}

export class InboxStore {
  private cache?: InboxData;

  constructor(private readonly filePath: string) {}

  private load(): InboxData {
    if (this.cache) return this.cache;
    if (!existsSync(this.filePath)) {
      this.cache = {
        version: 1,
        members: [],
        invites: [],
        rooms: [],
        messages: {},
        notes: {},
        tasks: {},
        sessions: [],
      };
      return this.cache;
    }
    try {
      const parsed = JSON.parse(readFileSync(this.filePath, 'utf8')) as Partial<InboxData>;
      this.cache = {
        version: 1,
        members: Array.isArray(parsed.members) ? parsed.members : [],
        invites: Array.isArray(parsed.invites) ? parsed.invites : [],
        rooms: Array.isArray(parsed.rooms) ? parsed.rooms : [],
        messages: parsed.messages && typeof parsed.messages === 'object' ? parsed.messages : {},
        notes: parsed.notes && typeof parsed.notes === 'object' ? parsed.notes : {},
        tasks: parsed.tasks && typeof parsed.tasks === 'object' ? parsed.tasks : {},
        sessions: Array.isArray(parsed.sessions) ? parsed.sessions : [],
      };
    } catch {
      this.cache = { ...EMPTY_DATA, members: [], invites: [], rooms: [], messages: {}, notes: {}, tasks: {}, sessions: [] };
    }
    return this.cache;
  }

  private save(): void {
    const data = this.load();
    mkdirSync(nodePath.dirname(this.filePath), { recursive: true });
    const tmp = `${this.filePath}.${process.pid}.${Date.now()}.tmp`;
    writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
    renameSync(tmp, this.filePath);
  }

  // ─── Members ───────────────────────────────────────────────────────────────

  listMembers(): InboxMember[] {
    return [...this.load().members];
  }

  getMember(id: string): InboxMember | undefined {
    return this.load().members.find((m) => m.id === id);
  }

  getMemberByPikpamId(pikpamUserId: string): InboxMember | undefined {
    return this.load().members.find((m) => m.pikpamUserId === pikpamUserId);
  }

  upsertMemberFromPikpam(input: {
    pikpamUserId: string;
    email: string;
    name: string;
    allowedAgentIds?: string[];
    toolPolicy?: InboxToolPolicy;
    customPerms?: InboxCustomPerms;
    budgetLimitUsd?: number;
  }): InboxMember {
    const data = this.load();
    const now = new Date().toISOString();
    const existing = data.members.find((m) => m.pikpamUserId === input.pikpamUserId);
    if (existing) {
      existing.email = input.email.trim().toLowerCase();
      existing.name = input.name.trim() || existing.name;
      existing.status = 'active';
      existing.lastSeenAt = now;
      if (input.allowedAgentIds) {
        existing.allowedAgentIds = [...new Set([...existing.allowedAgentIds, ...input.allowedAgentIds])];
      }
      this.save();
      return existing;
    }
    const member: InboxMember = {
      id: makeId('imb'),
      pikpamUserId: input.pikpamUserId,
      email: input.email.trim().toLowerCase(),
      name: input.name.trim() || input.email.split('@')[0] || 'Collaborator',
      status: 'active',
      allowedAgentIds: [...new Set(input.allowedAgentIds ?? [])],
      toolPolicy: input.toolPolicy ?? 'read_only',
      ...(input.customPerms ? { customPerms: input.customPerms } : {}),
      ...(input.budgetLimitUsd !== undefined ? { budgetLimitUsd: input.budgetLimitUsd } : {}),
      joinedAt: now,
      lastSeenAt: now,
    };
    data.members.push(member);
    this.save();
    return member;
  }

  updateMember(
    id: string,
    patch: Partial<Pick<InboxMember, 'name' | 'status' | 'allowedAgentIds' | 'toolPolicy' | 'customPerms' | 'budgetLimitUsd'>>,
  ): InboxMember | undefined {
    const data = this.load();
    const member = data.members.find((m) => m.id === id);
    if (!member) return undefined;
    if (patch.name !== undefined) member.name = patch.name.trim() || member.name;
    if (patch.status !== undefined) member.status = patch.status;
    if (patch.allowedAgentIds !== undefined) member.allowedAgentIds = [...new Set(patch.allowedAgentIds)];
    if (patch.toolPolicy !== undefined) member.toolPolicy = patch.toolPolicy;
    if (patch.customPerms !== undefined) member.customPerms = patch.customPerms;
    if ('budgetLimitUsd' in patch) member.budgetLimitUsd = patch.budgetLimitUsd;
    if (member.status === 'revoked') {
      data.sessions = data.sessions.filter((s) => s.memberId !== member.id);
    }
    this.save();
    return member;
  }

  // ─── Invites ───────────────────────────────────────────────────────────────

  listInvites(): InboxInvite[] {
    return [...this.load().invites].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  getInvite(id: string): InboxInvite | undefined {
    return this.load().invites.find((i) => i.id === id);
  }

  createInvite(input: {
    label?: string;
    scopeType?: 'dm' | 'group' | 'workspace';
    roomId?: string;
    targetEmail?: string;
    defaultAgentIds?: string[];
    toolPolicy?: InboxToolPolicy;
    customPerms?: InboxCustomPerms;
    budgetLimitUsd?: number;
    maxUses?: number;
    expiresAt?: string;
  }): InboxInvite {
    const data = this.load();
    const invite: InboxInvite = {
      id: makeId('inv'),
      ...(input.label?.trim() ? { label: input.label.trim() } : {}),
      scopeType: input.scopeType ?? 'workspace',
      ...(input.roomId ? { roomId: input.roomId } : {}),
      ...(input.targetEmail?.trim() ? { targetEmail: input.targetEmail.trim().toLowerCase() } : {}),
      defaultAgentIds: [...new Set(input.defaultAgentIds ?? [])],
      toolPolicy: input.toolPolicy ?? 'read_only',
      ...(input.customPerms ? { customPerms: input.customPerms } : {}),
      ...(input.budgetLimitUsd !== undefined ? { budgetLimitUsd: input.budgetLimitUsd } : {}),
      maxUses: Math.max(1, Math.min(1000, Math.floor(input.maxUses ?? 1))),
      usedCount: 0,
      ...(input.expiresAt ? { expiresAt: input.expiresAt } : {}),
      createdAt: new Date().toISOString(),
    };
    data.invites.push(invite);
    this.save();
    return invite;
  }

  attachPikpamInvite(id: string, code: string, pikpamInviteUrl: string): InboxInvite | undefined {
    const invite = this.getInvite(id);
    if (!invite) return undefined;
    invite.code = code;
    invite.pikpamInviteUrl = pikpamInviteUrl;
    this.save();
    return invite;
  }

  markInviteUsed(id: string): InboxInvite | undefined {
    const invite = this.getInvite(id);
    if (!invite) return undefined;
    invite.usedCount += 1;
    this.save();
    return invite;
  }

  revokeInvite(id: string): InboxInvite | undefined {
    const invite = this.getInvite(id);
    if (!invite) return undefined;
    invite.revokedAt = new Date().toISOString();
    this.save();
    return invite;
  }

  // ─── Rooms ─────────────────────────────────────────────────────────────────

  listRooms(forMemberId?: string): InboxRoom[] {
    const rooms = this.load().rooms;
    const filtered = forMemberId ? rooms.filter((r) => r.memberIds.includes(forMemberId)) : rooms;
    return [...filtered].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  getRoom(id: string): InboxRoom | undefined {
    return this.load().rooms.find((r) => r.id === id);
  }

  createRoom(input: {
    kind: 'dm' | 'group';
    title: string;
    memberIds?: string[];
    activeAgentIds?: string[];
    agentTriggerMode?: InboxAgentTriggerMode;
    toolPolicyOverride?: InboxToolPolicy;
    customPermsOverride?: InboxCustomPerms;
    notesVisibility?: InboxNotesVisibility;
    projectPath?: string;
  }): InboxRoom {
    const data = this.load();
    const now = new Date().toISOString();
    const room: InboxRoom = {
      id: makeId('irm'),
      kind: input.kind,
      title: input.title.trim() || (input.kind === 'group' ? 'New Group' : 'Direct Inbox'),
      memberIds: [...new Set(input.memberIds ?? [])],
      activeAgentIds: [...new Set(input.activeAgentIds ?? [])],
      agentTriggerMode: input.agentTriggerMode ?? (input.kind === 'group' ? 'mention' : 'auto'),
      ...(input.toolPolicyOverride ? { toolPolicyOverride: input.toolPolicyOverride } : {}),
      ...(input.customPermsOverride ? { customPermsOverride: input.customPermsOverride } : {}),
      notesVisibility: input.notesVisibility ?? 'owner_only',
      ...(input.projectPath?.trim() ? { projectPath: input.projectPath.trim() } : {}),
      createdAt: now,
      updatedAt: now,
    };
    data.rooms.push(room);
    data.messages[room.id] = [];
    data.notes[room.id] = [];
    data.tasks[room.id] = [];
    this.save();
    return room;
  }

  updateRoom(
    id: string,
    patch: Partial<
      Pick<
        InboxRoom,
        | 'title'
        | 'memberIds'
        | 'activeAgentIds'
        | 'agentTriggerMode'
        | 'toolPolicyOverride'
        | 'customPermsOverride'
        | 'notesVisibility'
        | 'projectPath'
      >
    >,
  ): InboxRoom | undefined {
    const room = this.getRoom(id);
    if (!room) return undefined;
    if (patch.title !== undefined) room.title = patch.title.trim() || room.title;
    if (patch.memberIds !== undefined) room.memberIds = [...new Set(patch.memberIds)];
    if (patch.activeAgentIds !== undefined) room.activeAgentIds = [...new Set(patch.activeAgentIds)];
    if (patch.agentTriggerMode !== undefined) room.agentTriggerMode = patch.agentTriggerMode;
    if ('toolPolicyOverride' in patch) room.toolPolicyOverride = patch.toolPolicyOverride;
    if ('customPermsOverride' in patch) room.customPermsOverride = patch.customPermsOverride;
    if (patch.notesVisibility === 'owner_only' || patch.notesVisibility === 'shared_readonly') {
      room.notesVisibility = patch.notesVisibility;
    }
    if ('projectPath' in patch) {
      room.projectPath = patch.projectPath?.trim() || undefined;
    }
    room.updatedAt = new Date().toISOString();
    this.save();
    return room;
  }

  deleteRoom(id: string): boolean {
    const data = this.load();
    const before = data.rooms.length;
    data.rooms = data.rooms.filter((r) => r.id !== id);
    delete data.messages[id];
    delete data.notes[id];
    delete data.tasks[id];
    if (data.rooms.length === before) return false;
    this.save();
    return true;
  }

  ensureMemberInRoom(roomId: string, memberId: string): InboxRoom | undefined {
    const room = this.getRoom(roomId);
    if (!room) return undefined;
    if (!room.memberIds.includes(memberId)) {
      room.memberIds.push(memberId);
      room.updatedAt = new Date().toISOString();
      this.save();
    }
    return room;
  }

  ensureDmRoomForMember(member: InboxMember, defaultAgentIds: string[]): InboxRoom {
    const existing = this.load().rooms.find(
      (r) => r.kind === 'dm' && r.memberIds.length === 1 && r.memberIds[0] === member.id,
    );
    if (existing) {
      if (defaultAgentIds.length > 0) {
        const merged = [...new Set([...existing.activeAgentIds, ...defaultAgentIds])];
        if (merged.length !== existing.activeAgentIds.length) {
          existing.activeAgentIds = merged;
          existing.updatedAt = new Date().toISOString();
          this.save();
        }
      }
      return existing;
    }
    return this.createRoom({
      kind: 'dm',
      title: member.name || member.email,
      memberIds: [member.id],
      activeAgentIds: defaultAgentIds,
      agentTriggerMode: 'auto',
    });
  }

  // ─── Messages ──────────────────────────────────────────────────────────────

  messages(roomId: string, opts?: { includeOwnerOnly?: boolean }): InboxMessage[] {
    const includeOwnerOnly = opts?.includeOwnerOnly !== false;
    const list = this.load().messages[roomId] ?? [];
    if (includeOwnerOnly) return [...list];
    return list.filter((m) => m.visibility !== 'owner_only');
  }

  appendMessage(
    roomId: string,
    input: Omit<InboxMessage, 'id' | 'roomId' | 'seq' | 'ts'>,
  ): InboxMessage {
    const data = this.load();
    const room = data.rooms.find((r) => r.id === roomId);
    if (!room) throw new Error('Inbox room not found.');
    const list = (data.messages[roomId] ??= []);
    const seq = (list.at(-1)?.seq ?? 0) + 1;
    const message: InboxMessage = {
      id: makeId('imsg'),
      roomId,
      seq,
      senderType: input.senderType,
      senderId: input.senderId,
      senderName: input.senderName,
      text: input.text,
      ...(input.visibility === 'owner_only' ? { visibility: 'owner_only' } : {}),
      ...(input.mentionedAgentIds?.length ? { mentionedAgentIds: input.mentionedAgentIds } : {}),
      ts: new Date().toISOString(),
    };
    list.push(message);
    room.updatedAt = message.ts;
    this.save();
    return message;
  }

  // ─── Room Notes & Summaries ────────────────────────────────────────────────

  listNotes(roomId: string): InboxRoomNote[] {
    return [...(this.load().notes[roomId] ?? [])].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  getNote(roomId: string, noteId: string): InboxRoomNote | undefined {
    return (this.load().notes[roomId] ?? []).find((n) => n.id === noteId);
  }

  addNote(
    roomId: string,
    input: {
      kind?: InboxNoteKind;
      title: string;
      content: string;
      createdByType: 'owner' | 'agent';
      createdById: string;
      createdByName: string;
    },
  ): InboxRoomNote {
    const data = this.load();
    const room = data.rooms.find((r) => r.id === roomId);
    if (!room) throw new Error('Inbox room not found.');
    const content = input.content.trim();
    if (!content) throw new Error('Note content is required.');
    const now = new Date().toISOString();
    const note: InboxRoomNote = {
      id: makeId('int'),
      roomId,
      kind: input.kind === 'summary' || input.kind === 'decision' ? input.kind : 'note',
      title: input.title.trim() || (input.kind === 'summary' ? 'Meeting Summary' : 'Meeting Note'),
      content,
      createdByType: input.createdByType,
      createdById: input.createdById,
      createdByName: input.createdByName,
      createdAt: now,
      updatedAt: now,
    };
    const list = (data.notes[roomId] ??= []);
    list.push(note);
    room.updatedAt = now;
    this.save();
    return note;
  }

  updateNote(
    roomId: string,
    noteId: string,
    patch: Partial<Pick<InboxRoomNote, 'kind' | 'title' | 'content' | 'sharedToChat' | 'sharedMessageId'>>,
  ): InboxRoomNote | undefined {
    const note = this.getNote(roomId, noteId);
    if (!note) return undefined;
    if (patch.kind === 'note' || patch.kind === 'summary' || patch.kind === 'decision') note.kind = patch.kind;
    if (patch.title !== undefined) note.title = patch.title.trim() || note.title;
    if (patch.content !== undefined && patch.content.trim()) note.content = patch.content.trim();
    if (typeof patch.sharedToChat === 'boolean') note.sharedToChat = patch.sharedToChat;
    if (patch.sharedMessageId !== undefined) note.sharedMessageId = patch.sharedMessageId;
    note.updatedAt = new Date().toISOString();
    this.save();
    return note;
  }

  deleteNote(roomId: string, noteId: string): boolean {
    const data = this.load();
    const list = data.notes[roomId];
    if (!list) return false;
    const before = list.length;
    data.notes[roomId] = list.filter((n) => n.id !== noteId);
    if (data.notes[roomId].length === before) return false;
    this.save();
    return true;
  }

  // ─── Room Tasks & Delegations ──────────────────────────────────────────────

  listTasks(roomId: string): InboxRoomTask[] {
    return [...(this.load().tasks[roomId] ?? [])].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  getTask(roomId: string, taskId: string): InboxRoomTask | undefined {
    return (this.load().tasks[roomId] ?? []).find((t) => t.id === taskId);
  }

  addTask(
    roomId: string,
    input: {
      title: string;
      description?: string;
      kind?: InboxTaskKind;
      status?: InboxTaskStatus;
      assignee?: string;
      projectPath?: string;
      requestedByType: 'owner' | 'member' | 'agent';
      requestedByName: string;
      codeRunId?: string;
      delegationSummary?: string;
      subAgentRole?: string;
    },
  ): InboxRoomTask {
    const data = this.load();
    const room = data.rooms.find((r) => r.id === roomId);
    if (!room) throw new Error('Inbox room not found.');
    const title = input.title.trim();
    if (!title) throw new Error('Task title is required.');
    const now = new Date().toISOString();
    const task: InboxRoomTask = {
      id: makeId('itk'),
      roomId,
      title,
      ...(input.description?.trim() ? { description: input.description.trim() } : {}),
      kind: input.kind === 'coding' || input.kind === 'research' ? input.kind : 'action',
      status:
        input.status === 'pending_approval' || input.status === 'in_progress' || input.status === 'done'
          ? input.status
          : 'todo',
      ...(input.assignee?.trim() ? { assignee: input.assignee.trim() } : {}),
      ...(input.projectPath?.trim() ? { projectPath: input.projectPath.trim() } : {}),
      requestedByType: input.requestedByType,
      requestedByName: input.requestedByName,
      ...(input.codeRunId ? { codeRunId: input.codeRunId } : {}),
      ...(input.delegationSummary?.trim() ? { delegationSummary: input.delegationSummary.trim() } : {}),
      ...(input.subAgentRole?.trim() ? { subAgentRole: input.subAgentRole.trim() } : {}),
      createdAt: now,
      updatedAt: now,
    };
    const list = (data.tasks[roomId] ??= []);
    list.push(task);
    room.updatedAt = now;
    this.save();
    return task;
  }

  updateTask(
    roomId: string,
    taskId: string,
    patch: Partial<
      Pick<
        InboxRoomTask,
        | 'title'
        | 'description'
        | 'kind'
        | 'status'
        | 'assignee'
        | 'projectPath'
        | 'codeRunId'
        | 'delegationSummary'
        | 'subAgentRole'
      >
    >,
  ): InboxRoomTask | undefined {
    const task = this.getTask(roomId, taskId);
    if (!task) return undefined;
    if (patch.title !== undefined) task.title = patch.title.trim() || task.title;
    if ('description' in patch) task.description = patch.description?.trim() || undefined;
    if (patch.kind === 'action' || patch.kind === 'coding' || patch.kind === 'research') task.kind = patch.kind;
    if (
      patch.status === 'pending_approval' ||
      patch.status === 'todo' ||
      patch.status === 'in_progress' ||
      patch.status === 'done'
    ) {
      task.status = patch.status;
    }
    if ('assignee' in patch) task.assignee = patch.assignee?.trim() || undefined;
    if ('projectPath' in patch) task.projectPath = patch.projectPath?.trim() || undefined;
    if ('codeRunId' in patch) task.codeRunId = patch.codeRunId || undefined;
    if ('delegationSummary' in patch) task.delegationSummary = patch.delegationSummary?.trim() || undefined;
    if ('subAgentRole' in patch) task.subAgentRole = patch.subAgentRole?.trim() || undefined;
    task.updatedAt = new Date().toISOString();
    this.save();
    return task;
  }

  deleteTask(roomId: string, taskId: string): boolean {
    const data = this.load();
    const list = data.tasks[roomId];
    if (!list) return false;
    const before = list.length;
    data.tasks[roomId] = list.filter((t) => t.id !== taskId);
    if (data.tasks[roomId].length === before) return false;
    this.save();
    return true;
  }

  // ─── Member Sessions ───────────────────────────────────────────────────────

  createSession(memberId: string): { token: string; expiresAt: string } {
    const data = this.load();
    const now = Date.now();
    // Prune expired sessions
    data.sessions = data.sessions.filter((s) => Date.parse(s.expiresAt) > now);
    const token = randomBytes(32).toString('hex');
    const expiresAt = new Date(now + MEMBER_SESSION_TTL_MS).toISOString();
    data.sessions.push({
      tokenHash: sha256(token),
      memberId,
      createdAt: new Date(now).toISOString(),
      expiresAt,
    });
    // Cap stored sessions
    if (data.sessions.length > 200) data.sessions = data.sessions.slice(-200);
    this.save();
    return { token, expiresAt };
  }

  authenticateRequest(req: IncomingMessage): InboxMember | undefined {
    const raw = parseCookieHeader(req.headers.cookie, INBOX_MEMBER_COOKIE);
    if (!raw || !/^[a-f0-9]{64}$/.test(raw)) return undefined;
    const candidateHash = Buffer.from(sha256(raw), 'utf8');
    const data = this.load();
    const now = Date.now();
    const matched = data.sessions.find((session) => {
      if (Date.parse(session.expiresAt) <= now) return false;
      const stored = Buffer.from(session.tokenHash, 'utf8');
      return stored.length === candidateHash.length && timingSafeEqual(stored, candidateHash);
    });
    if (!matched) return undefined;
    const member = data.members.find((m) => m.id === matched.memberId && m.status === 'active');
    return member;
  }

  destroySession(req: IncomingMessage): void {
    const raw = parseCookieHeader(req.headers.cookie, INBOX_MEMBER_COOKIE);
    if (!raw) return;
    const hash = sha256(raw);
    const data = this.load();
    const before = data.sessions.length;
    data.sessions = data.sessions.filter((s) => s.tokenHash !== hash);
    if (data.sessions.length !== before) this.save();
  }
}
