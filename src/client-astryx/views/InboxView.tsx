import { Avatar } from '@astryxdesign/core/Avatar';
import { Button } from '@astryxdesign/core/Button';
import { Card } from '@astryxdesign/core/Card';
import { Center } from '@astryxdesign/core/Center';
import { Dialog, DialogHeader } from '@astryxdesign/core/Dialog';
import { Divider } from '@astryxdesign/core/Divider';
import { Drawer, DrawerHeader } from '@astryxdesign/core/Drawer';
import { DropdownMenu, type DropdownMenuOption } from '@astryxdesign/core/DropdownMenu';
import { EmptyState } from '@astryxdesign/core/EmptyState';
import { IconButton } from '@astryxdesign/core/IconButton';
import {
  HStack,
  Layout,
  LayoutContent,
  StackItem,
  VStack,
} from '@astryxdesign/core/Layout';
import { List, ListItem } from '@astryxdesign/core/List';
import { Selector } from '@astryxdesign/core/Selector';
import { StatusDot } from '@astryxdesign/core/StatusDot';
import { Switch } from '@astryxdesign/core/Switch';
import { Heading, Text } from '@astryxdesign/core/Text';
import { TextArea } from '@astryxdesign/core/TextArea';
import { TextInput } from '@astryxdesign/core/TextInput';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getHostBridge, type CoworkAvatar } from '../bridge';
import {
  AppIcon,
  ArrowLeft,
  ArrowUp,
  ChevronDown,
  ExternalLink,
  Eye,
  FileText,
  Home,
  Link2,
  Lock,
  MessageSquare,
  MoreHorizontal,
  Plus,
  Settings,
  Shield,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  User,
  Users,
} from '../components/AppIcons';
import { PlushPortrait } from '../components/PlushPortrait';
import {
  InboxWorkspaceDrawer,
  type InboxNoteKind,
  type InboxNotesVisibility,
  type InboxProjectSummary,
  type InboxRoomNoteRecord,
  type InboxRoomTaskRecord,
  type InboxTaskKind,
  type InboxTaskStatus,
} from './InboxWorkspaceDrawer';

type InboxToolPolicy = 'chat_only' | 'read_only' | 'standard' | 'custom';
type InboxTriggerMode = 'mention' | 'auto' | 'watch';
type InboxMessageVisibility = 'public' | 'owner_only';

interface InboxAgentSummary {
  id: string;
  name: string;
  avatar?: CoworkAvatar | string;
  tagline?: string;
}

interface InboxMemberRecord {
  id: string;
  pikpamUserId?: string;
  name: string;
  email?: string;
  status?: 'active' | 'revoked';
  allowedAgentIds?: string[];
  toolPolicy?: InboxToolPolicy;
  joinedAt?: string;
}

interface InboxInviteRecord {
  id: string;
  code?: string;
  pikpamInviteUrl?: string;
  label?: string;
  scopeType: 'dm' | 'group' | 'workspace';
  roomId?: string;
  targetEmail?: string;
  defaultAgentIds: string[];
  toolPolicy: InboxToolPolicy;
  maxUses: number;
  usedCount: number;
  expiresAt?: string;
  revokedAt?: string;
  createdAt: string;
}

interface InboxRoomRecord {
  id: string;
  kind: 'dm' | 'group';
  title: string;
  memberIds: string[];
  activeAgentIds: string[];
  agentTriggerMode: InboxTriggerMode;
  toolPolicyOverride?: InboxToolPolicy;
  notesVisibility?: InboxNotesVisibility;
  projectPath?: string;
  noteCount?: number;
  openTaskCount?: number;
  pendingApprovalCount?: number;
  activeAgentTurnIds?: string[];
  watching?: boolean;
  createdAt: string;
  updatedAt: string;
}

interface InboxMessageRecord {
  id: string;
  roomId: string;
  seq: number;
  senderType: 'owner' | 'member' | 'agent' | 'system';
  senderId: string;
  senderName: string;
  text: string;
  visibility?: InboxMessageVisibility;
  ts: string;
}

interface InboxStateResponse {
  role: 'owner' | 'member';
  workspaceName: string;
  workspaceUrl?: string;
  pikpamBaseUrl: string;
  pikpamConfigured?: boolean;
  member?: InboxMemberRecord;
  rooms: InboxRoomRecord[];
  members: InboxMemberRecord[];
  invites?: InboxInviteRecord[];
  agents: InboxAgentSummary[];
  projects?: InboxProjectSummary[];
}

interface InboxWorkspaceResponse {
  notesVisibility: InboxNotesVisibility;
  projectPath?: string | null;
  notes: InboxRoomNoteRecord[];
  tasks: InboxRoomTaskRecord[];
}

const TOOL_POLICY_OPTIONS: Array<{ value: InboxToolPolicy; label: string }> = [
  { value: 'chat_only', label: 'Chat only (no tools)' },
  { value: 'read_only', label: 'Read-only tools (safe)' },
  { value: 'standard', label: 'Standard agent tools' },
  { value: 'custom', label: 'Custom permissions' },
];

async function inboxFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    credentials: 'same-origin',
    headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) },
    ...init,
  });
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

function asCoworkAvatar(raw?: CoworkAvatar | string): CoworkAvatar | undefined {
  if (raw && typeof raw === 'object') return raw;
  return undefined;
}

export function InboxView({
  standalone = false,
  onClose,
  onSwitchToCowork,
  onSwitchToCode,
  onOpenSettings,
}: {
  standalone?: boolean;
  onClose?: () => void;
  onSwitchToCowork?: () => void;
  onSwitchToCode?: () => void;
  onOpenSettings?: () => void;
}) {
  const host = getHostBridge();
  const [state, setState] = useState<InboxStateResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [selectedRoomId, setSelectedRoomId] = useState<string>('');
  const [messages, setMessages] = useState<InboxMessageRecord[]>([]);
  const [activeAgentTurnIds, setActiveAgentTurnIds] = useState<string[]>([]);
  const [watchingNow, setWatchingNow] = useState(false);
  const [privateWhisper, setPrivateWhisper] = useState(false);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);

  const [workspaceDrawerOpen, setWorkspaceDrawerOpen] = useState(false);
  const [workspaceTab, setWorkspaceTab] = useState<'notes' | 'tasks'>('notes');
  const [roomNotes, setRoomNotes] = useState<InboxRoomNoteRecord[]>([]);
  const [roomTasks, setRoomTasks] = useState<InboxRoomTaskRecord[]>([]);
  const [workspaceLoading, setWorkspaceLoading] = useState(false);
  const [summarizing, setSummarizing] = useState(false);
  const [delegatingTaskId, setDelegatingTaskId] = useState<string | null>(null);

  const [ownerTab, setOwnerTab] = useState<'chat' | 'access' | 'invites'>('chat');
  const [roomsDrawerOpen, setRoomsDrawerOpen] = useState(false);
  const [roomSearch, setRoomSearch] = useState('');
  const [roomAccessOpen, setRoomAccessOpen] = useState(false);
  const [editRoomTitle, setEditRoomTitle] = useState('');

  const [newRoomOpen, setNewRoomOpen] = useState(false);
  const [newRoomKind, setNewRoomKind] = useState<'group' | 'dm'>('group');
  const [newRoomTitle, setNewRoomTitle] = useState('');
  const [newRoomTrigger, setNewRoomTrigger] = useState<InboxTriggerMode>('mention');
  const [newRoomMembers, setNewRoomMembers] = useState<string[]>([]);
  const [newRoomAgents, setNewRoomAgents] = useState<string[]>([]);
  const [newRoomVisibility, setNewRoomVisibility] = useState<InboxNotesVisibility>('owner_only');
  const [newRoomProject, setNewRoomProject] = useState('');

  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteLabel, setInviteLabel] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRoomId, setInviteRoomId] = useState('');
  const [invitePolicy, setInvitePolicy] = useState<InboxToolPolicy>('read_only');
  const [inviteAgents, setInviteAgents] = useState<string[]>([]);
  const [inviteMaxUses, setInviteMaxUses] = useState('1');
  const [creatingInvite, setCreatingInvite] = useState(false);
  const [latestInviteUrl, setLatestInviteUrl] = useState('');

  const selectedRoomIdRef = useRef(selectedRoomId);
  selectedRoomIdRef.current = selectedRoomId;
  const composerRef = useRef<HTMLTextAreaElement | null>(null);
  const feedEndRef = useRef<HTMLDivElement | null>(null);

  const loadState = useCallback(async () => {
    try {
      const data = await inboxFetch<InboxStateResponse>('/api/inbox/state');
      setState(data);
      setError(null);
      setSelectedRoomId((prev) => {
        if (prev && data.rooms.some((r) => r.id === prev)) return prev;
        return data.rooms[0]?.id ?? '';
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load Inbox.');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadMessages = useCallback(async (roomId: string) => {
    if (!roomId) {
      setMessages([]);
      setActiveAgentTurnIds([]);
      setWatchingNow(false);
      return;
    }
    try {
      const data = await inboxFetch<{
        messages: InboxMessageRecord[];
        activeAgentTurnIds?: string[];
        watching?: boolean;
      }>(`/api/inbox/rooms/${encodeURIComponent(roomId)}/messages`);
      setMessages(data.messages);
      setActiveAgentTurnIds(Array.isArray(data.activeAgentTurnIds) ? data.activeAgentTurnIds : []);
      setWatchingNow(Boolean(data.watching));
    } catch {
      // ignore transient poll errors
    }
  }, []);

  const loadWorkspace = useCallback(async (roomId: string, silent = false) => {
    if (!roomId) {
      setRoomNotes([]);
      setRoomTasks([]);
      return;
    }
    if (!silent) setWorkspaceLoading(true);
    try {
      const data = await inboxFetch<InboxWorkspaceResponse>(
        `/api/inbox/rooms/${encodeURIComponent(roomId)}/workspace`,
      );
      setRoomNotes(data.notes ?? []);
      setRoomTasks(data.tasks ?? []);
    } catch {
      // ignore transient errors
    } finally {
      if (!silent) setWorkspaceLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadState();
  }, [loadState]);

  useEffect(() => {
    void loadMessages(selectedRoomId);
    void loadWorkspace(selectedRoomId);
  }, [selectedRoomId, loadMessages, loadWorkspace]);

  useEffect(() => {
    const es = new EventSource('/api/inbox/stream');
    const onInbox = (evt: MessageEvent) => {
      void loadState();
      try {
        const payload = JSON.parse(String(evt.data || '{}')) as { roomId?: string | null };
        if (!payload.roomId || payload.roomId === selectedRoomIdRef.current) {
          void loadMessages(selectedRoomIdRef.current);
          void loadWorkspace(selectedRoomIdRef.current, true);
        }
      } catch {
        void loadMessages(selectedRoomIdRef.current);
        void loadWorkspace(selectedRoomIdRef.current, true);
      }
    };
    es.addEventListener('inbox', onInbox as EventListener);
    return () => {
      es.removeEventListener('inbox', onInbox as EventListener);
      es.close();
    };
  }, [loadState, loadMessages, loadWorkspace]);

  useEffect(() => {
    if (ownerTab !== 'chat') return;
    feedEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages.length, selectedRoomId, ownerTab]);

  const isOwner = state?.role === 'owner';
  const selectedRoom = useMemo(
    () => state?.rooms.find((r) => r.id === selectedRoomId) ?? null,
    [state, selectedRoomId],
  );

  const agentById = useMemo(() => {
    const map = new Map<string, InboxAgentSummary>();
    for (const a of state?.agents ?? []) map.set(a.id, a);
    return map;
  }, [state]);

  const activeRoomAgents = useMemo(
    () =>
      (selectedRoom?.activeAgentIds ?? [])
        .map((id) => agentById.get(id))
        .filter((a): a is InboxAgentSummary => Boolean(a)),
    [selectedRoom, agentById],
  );

  const coworkAvatarSrc = useMemo(() => {
    const cw = host?.ensureCowork?.();
    const sel =
      cw?.agents?.find((a) => a.id === cw.selectedAgentId) ||
      cw?.agents?.[0] ||
      state?.agents?.[0];
    const av = asCoworkAvatar(sel?.avatar);
    return host?.getAvatarImageUrl?.(av?.shape) || '/characters/orb.png?v=opendots1';
  }, [host, state]);

  const filteredRooms = useMemo(() => {
    const q = roomSearch.trim().toLowerCase();
    const list = state?.rooms ?? [];
    if (!q) return list;
    return list.filter((r) => r.title.toLowerCase().includes(q));
  }, [state, roomSearch]);

  const handleSend = useCallback(async () => {
    const text = draft.trim();
    if (!text || !selectedRoom || sending) return;
    setSending(true);
    setError(null);
    try {
      await inboxFetch(`/api/inbox/rooms/${encodeURIComponent(selectedRoom.id)}/messages`, {
        method: 'POST',
        body: JSON.stringify({
          text,
          ...(isOwner && privateWhisper ? { visibility: 'owner_only' } : {}),
        }),
      });
      setDraft('');
      await loadMessages(selectedRoom.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send message.');
    } finally {
      setSending(false);
    }
  }, [draft, selectedRoom, sending, isOwner, privateWhisper, loadMessages]);

  useEffect(() => {
    const el = composerRef.current;
    if (!el) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
        e.preventDefault();
        void handleSend();
      }
    };
    el.addEventListener('keydown', onKeyDown);
    return () => el.removeEventListener('keydown', onKeyDown);
  }, [handleSend, selectedRoom?.id, ownerTab]);

  const insertMention = (agentName: string) => {
    const token = `@${agentName} `;
    setDraft((prev) => (prev ? `${prev.replace(/\s*$/, '')} ${token}` : token));
    composerRef.current?.focus();
  };

  const handleSwitchCowork = () => {
    if (onSwitchToCowork) {
      onSwitchToCowork();
      return;
    }
    if (onClose && !standalone) {
      onClose();
      host?.openCowork?.();
      return;
    }
    window.location.assign('/');
  };

  const handleSwitchCode = () => {
    if (onSwitchToCode) {
      onSwitchToCode();
      return;
    }
    if (onClose && !standalone) {
      onClose();
      host?.openHome?.();
      return;
    }
    window.location.assign('/');
  };

  const handleCreateRoom = async () => {
    if (!newRoomTitle.trim()) return;
    setError(null);
    try {
      const res = await inboxFetch<{ room: InboxRoomRecord }>('/api/inbox/rooms', {
        method: 'POST',
        body: JSON.stringify({
          kind: newRoomKind,
          title: newRoomTitle.trim(),
          memberIds: newRoomMembers,
          activeAgentIds: newRoomAgents,
          agentTriggerMode: newRoomTrigger,
          notesVisibility: newRoomVisibility,
          ...(newRoomProject ? { projectPath: newRoomProject } : {}),
        }),
      });
      setNewRoomOpen(false);
      setNewRoomTitle('');
      setNewRoomMembers([]);
      setNewRoomAgents([]);
      setNewRoomVisibility('owner_only');
      setNewRoomProject('');
      await loadState();
      setSelectedRoomId(res.room.id);
      setOwnerTab('chat');
      setRoomsDrawerOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create room.');
    }
  };

  const handleUpdateRoom = async (
    roomId: string,
    patch: {
      title?: string;
      notesVisibility?: InboxNotesVisibility;
      projectPath?: string;
      agentTriggerMode?: InboxTriggerMode;
    },
  ) => {
    try {
      await inboxFetch(`/api/inbox/rooms/${encodeURIComponent(roomId)}`, {
        method: 'PATCH',
        body: JSON.stringify(patch),
      });
      await loadState();
      await loadWorkspace(roomId, true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update room.');
    }
  };

  const handleDeleteRoom = async (roomId: string) => {
    try {
      await inboxFetch(`/api/inbox/rooms/${encodeURIComponent(roomId)}`, {
        method: 'DELETE',
      });
      setRoomAccessOpen(false);
      setWorkspaceDrawerOpen(false);
      setNotice('Room deleted.');
      await loadState();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete room.');
    }
  };

  const handleSummarizeMeeting = async () => {
    if (!selectedRoom || summarizing) return;
    setSummarizing(true);
    setError(null);
    try {
      const res = await inboxFetch<{
        note: InboxRoomNoteRecord;
        createdTasks: InboxRoomTaskRecord[];
      }>(`/api/inbox/rooms/${encodeURIComponent(selectedRoom.id)}/summarize`, {
        method: 'POST',
        body: JSON.stringify({}),
      });
      await loadWorkspace(selectedRoom.id, true);
      await loadState();
      setWorkspaceTab('notes');
      setWorkspaceDrawerOpen(true);
      const count = res.createdTasks?.length ?? 0;
      setNotice(
        count > 0
          ? `Meeting summarized and ${count} task${count === 1 ? '' : 's'} saved (owner-private until you share).`
          : 'Meeting summarized (owner-private until you share).',
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not summarize meeting.');
    } finally {
      setSummarizing(false);
    }
  };

  const handleAddNote = async (input: {
    kind: InboxNoteKind;
    title: string;
    content: string;
  }) => {
    if (!selectedRoom) return;
    try {
      await inboxFetch(`/api/inbox/rooms/${encodeURIComponent(selectedRoom.id)}/notes`, {
        method: 'POST',
        body: JSON.stringify(input),
      });
      await loadWorkspace(selectedRoom.id, true);
      await loadState();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save note.');
    }
  };

  const handleDeleteNote = async (noteId: string) => {
    if (!selectedRoom) return;
    try {
      await inboxFetch(
        `/api/inbox/rooms/${encodeURIComponent(selectedRoom.id)}/notes/${encodeURIComponent(noteId)}`,
        { method: 'DELETE' },
      );
      await loadWorkspace(selectedRoom.id, true);
      await loadState();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete note.');
    }
  };

  const handleShareNote = async (
    noteId: string,
    opts: { text: string; includeTasks: boolean },
  ) => {
    if (!selectedRoom) return;
    try {
      await inboxFetch(
        `/api/inbox/rooms/${encodeURIComponent(selectedRoom.id)}/notes/${encodeURIComponent(noteId)}/share`,
        {
          method: 'POST',
          body: JSON.stringify(opts),
        },
      );
      await loadMessages(selectedRoom.id);
      await loadWorkspace(selectedRoom.id, true);
      setNotice('Summary shared to room chat.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not share summary.');
    }
  };

  const handleAddTask = async (input: {
    title: string;
    description?: string;
    kind: InboxTaskKind;
    assignee?: string;
  }) => {
    if (!selectedRoom) return;
    try {
      await inboxFetch(`/api/inbox/rooms/${encodeURIComponent(selectedRoom.id)}/tasks`, {
        method: 'POST',
        body: JSON.stringify(input),
      });
      await loadWorkspace(selectedRoom.id, true);
      await loadState();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save task.');
    }
  };

  const handleUpdateTaskStatus = async (taskId: string, status: InboxTaskStatus) => {
    if (!selectedRoom) return;
    try {
      await inboxFetch(
        `/api/inbox/rooms/${encodeURIComponent(selectedRoom.id)}/tasks/${encodeURIComponent(taskId)}`,
        {
          method: 'PATCH',
          body: JSON.stringify({ status }),
        },
      );
      await loadWorkspace(selectedRoom.id, true);
      await loadState();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update task.');
    }
  };

  const handleDeleteTask = async (taskId: string) => {
    if (!selectedRoom) return;
    try {
      await inboxFetch(
        `/api/inbox/rooms/${encodeURIComponent(selectedRoom.id)}/tasks/${encodeURIComponent(taskId)}`,
        { method: 'DELETE' },
      );
      await loadWorkspace(selectedRoom.id, true);
      await loadState();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete task.');
    }
  };

  const handleDelegateTaskCode = async (taskId: string) => {
    if (!selectedRoom || delegatingTaskId) return;
    setDelegatingTaskId(taskId);
    setError(null);
    try {
      const res = await inboxFetch<{ runId: string }>(
        `/api/inbox/rooms/${encodeURIComponent(selectedRoom.id)}/tasks/${encodeURIComponent(taskId)}/delegate-code`,
        {
          method: 'POST',
          body: JSON.stringify({}),
        },
      );
      await loadWorkspace(selectedRoom.id, true);
      await loadState();
      setNotice(`Delegated privately to Code (${res.runId}). Click "Open in Code" to inspect progress.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not start Code run.');
    } finally {
      setDelegatingTaskId(null);
    }
  };

  const handleDelegateTaskSubAgent = async (taskId: string) => {
    if (!selectedRoom || delegatingTaskId) return;
    setDelegatingTaskId(taskId);
    setError(null);
    try {
      await inboxFetch(
        `/api/inbox/rooms/${encodeURIComponent(selectedRoom.id)}/tasks/${encodeURIComponent(taskId)}/delegate-subagent`,
        {
          method: 'POST',
          body: JSON.stringify({ saveAsNote: true }),
        },
      );
      await loadWorkspace(selectedRoom.id, true);
      await loadState();
      setNotice('Sub-agent finished and saved its findings to Notes.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sub-agent delegation failed.');
    } finally {
      setDelegatingTaskId(null);
    }
  };

  const handleOpenCodeRun = (runId: string, projectPath?: string) => {
    setWorkspaceDrawerOpen(false);
    if (onClose && !standalone) onClose();
    if (host?.openRun) {
      host.openRun(runId, { ...(projectPath ? { projectPath } : {}) });
      return;
    }
    window.location.assign('/');
  };

  const handleToggleRoomAgent = async (room: InboxRoomRecord, agentId: string, enabled: boolean) => {
    const next = enabled
      ? [...new Set([...room.activeAgentIds, agentId])]
      : room.activeAgentIds.filter((id) => id !== agentId);
    try {
      await inboxFetch(`/api/inbox/rooms/${encodeURIComponent(room.id)}`, {
        method: 'PATCH',
        body: JSON.stringify({ activeAgentIds: next }),
      });
      await loadState();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update room agents.');
    }
  };

  const handleToggleRoomMember = async (room: InboxRoomRecord, memberId: string, enabled: boolean) => {
    const next = enabled
      ? [...new Set([...room.memberIds, memberId])]
      : room.memberIds.filter((id) => id !== memberId);
    try {
      await inboxFetch(`/api/inbox/rooms/${encodeURIComponent(room.id)}`, {
        method: 'PATCH',
        body: JSON.stringify({ memberIds: next }),
      });
      await loadState();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update room members.');
    }
  };

  const handleUpdateRoomTrigger = async (room: InboxRoomRecord, mode: InboxTriggerMode) => {
    try {
      await inboxFetch(`/api/inbox/rooms/${encodeURIComponent(room.id)}`, {
        method: 'PATCH',
        body: JSON.stringify({ agentTriggerMode: mode }),
      });
      await loadState();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update trigger mode.');
    }
  };

  const handleUpdateMember = async (
    memberId: string,
    patch: { allowedAgentIds?: string[]; toolPolicy?: InboxToolPolicy; status?: 'active' | 'revoked' },
  ) => {
    try {
      await inboxFetch(`/api/inbox/members/${encodeURIComponent(memberId)}`, {
        method: 'PATCH',
        body: JSON.stringify(patch),
      });
      await loadState();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update member.');
    }
  };

  const handleCreateInvite = async () => {
    setCreatingInvite(true);
    setError(null);
    setLatestInviteUrl('');
    try {
      const res = await inboxFetch<{ invite: InboxInviteRecord }>('/api/inbox/invites', {
        method: 'POST',
        body: JSON.stringify({
          label: inviteLabel.trim() || undefined,
          targetEmail: inviteEmail.trim() || undefined,
          scopeType: inviteRoomId ? 'group' : 'workspace',
          roomId: inviteRoomId || undefined,
          defaultAgentIds: inviteAgents,
          toolPolicy: invitePolicy,
          maxUses: Math.max(1, Number(inviteMaxUses) || 1),
          expiresInDays: 7,
        }),
      });
      setLatestInviteUrl(res.invite.pikpamInviteUrl || '');
      setInviteLabel('');
      setInviteEmail('');
      setNotice('Pikpam invite link created.');
      await loadState();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create Pikpam invite link.');
    } finally {
      setCreatingInvite(false);
    }
  };

  const handleRevokeInvite = async (inviteId: string) => {
    try {
      await inboxFetch(`/api/inbox/invites/${encodeURIComponent(inviteId)}/revoke`, { method: 'POST' });
      await loadState();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not revoke invite.');
    }
  };

  const handleCopy = (value: string) => {
    void navigator.clipboard?.writeText(value);
    setNotice('Invite link copied to clipboard.');
  };

  const handleMemberLogout = async () => {
    await inboxFetch('/api/inbox/logout', { method: 'POST' }).catch(() => undefined);
    window.location.assign(state?.pikpamBaseUrl || 'https://pikpam.com');
  };

  const toggleId = (list: string[], id: string, checked: boolean) =>
    checked ? [...new Set([...list, id])] : list.filter((item) => item !== id);

  const pendingApprovalCount = useMemo(
    () => roomTasks.filter((t) => t.status === 'pending_approval').length,
    [roomTasks],
  );
  const openTaskCount = useMemo(
    () => roomTasks.filter((t) => t.status !== 'done' && t.status !== 'pending_approval').length,
    [roomTasks],
  );
  const canViewWorkspace = Boolean(
    selectedRoom && (isOwner || selectedRoom.notesVisibility === 'shared_readonly'),
  );
  const thinkingAgentNames = useMemo(() => {
    const ids = activeAgentTurnIds.length
      ? activeAgentTurnIds
      : (selectedRoom?.activeAgentTurnIds ?? []);
    return ids
      .map((id) => agentById.get(id)?.name)
      .filter((n): n is string => Boolean(n));
  }, [activeAgentTurnIds, selectedRoom?.activeAgentTurnIds, agentById]);

  const projectOptions = useMemo(() => {
    const base = [{ value: '', label: 'Workspace default project' }];
    for (const p of state?.projects ?? []) {
      base.push({ value: p.path, label: p.name });
    }
    return base;
  }, [state?.projects]);

  const toolsMenuItems = useMemo<DropdownMenuOption[]>(() => {
    if (isOwner) {
      const items: DropdownMenuOption[] = [];
      if (selectedRoom && ownerTab === 'chat') {
        items.push(
          {
            id: 'notes-tasks',
            label:
              pendingApprovalCount > 0
                ? `Notes & Tasks (${pendingApprovalCount} approval)`
                : `Notes & Tasks (${roomNotes.length + openTaskCount})`,
            icon: <AppIcon icon={FileText} size="sm" />,
            onClick: () => setWorkspaceDrawerOpen(true),
          },
          {
            id: 'summarize-meeting',
            label: summarizing ? 'Summarizing meeting…' : 'Summarize meeting',
            icon: <AppIcon icon={Sparkles} size="sm" />,
            onClick: () => void handleSummarizeMeeting(),
          },
          {
            id: 'participants',
            label: 'Room settings & agents',
            icon: <AppIcon icon={SlidersHorizontal} size="sm" />,
            onClick: () => {
              setEditRoomTitle(selectedRoom.title);
              setRoomAccessOpen(true);
            },
          },
          { type: 'divider' },
        );
      }
      items.push(
        {
          id: 'new-room',
          label: 'New room',
          icon: <AppIcon icon={Plus} size="sm" />,
          onClick: () => setNewRoomOpen(true),
        },
        {
          id: 'invite',
          label: 'Invite human',
          icon: <AppIcon icon={Link2} size="sm" />,
          onClick: () => {
            setLatestInviteUrl('');
            setInviteOpen(true);
          },
        },
        { type: 'divider' },
        {
          id: 'rooms-view',
          label: `Rooms & Chat (${state?.rooms.length ?? 0})`,
          icon: <AppIcon icon={MessageSquare} size="sm" />,
          onClick: () => setOwnerTab('chat'),
        },
        {
          id: 'access-view',
          label: `Members & Access (${state?.members.length ?? 0})`,
          icon: <AppIcon icon={Shield} size="sm" />,
          onClick: () => setOwnerTab('access'),
        },
        {
          id: 'invites-view',
          label: `Pikpam Invites (${state?.invites?.length ?? 0})`,
          icon: <AppIcon icon={Users} size="sm" />,
          onClick: () => setOwnerTab('invites'),
        },
      );
      if (onOpenSettings && !standalone) {
        items.push(
          { type: 'divider' },
          {
            id: 'settings',
            label: 'Settings',
            icon: <AppIcon icon={Settings} size="sm" />,
            onClick: onOpenSettings,
          },
        );
      }
      return items;
    }
    const guestItems: DropdownMenuOption[] = [];
    if (selectedRoom && selectedRoom.notesVisibility === 'shared_readonly') {
      guestItems.push(
        {
          id: 'shared-notes',
          label: `Meeting Notes (${roomNotes.length})`,
          icon: <AppIcon icon={FileText} size="sm" />,
          onClick: () => setWorkspaceDrawerOpen(true),
        },
        { type: 'divider' },
      );
    }
    guestItems.push(
      {
        id: 'get-agent',
        label: 'Get Your Own Agent',
        icon: <AppIcon icon={ExternalLink} size="sm" />,
        onClick: () =>
          window.open(
            `${state?.pikpamBaseUrl || 'https://pikpam.com'}/portal/cloud`,
            '_blank',
            'noopener',
          ),
      },
      { type: 'divider' },
      {
        id: 'sign-out',
        label: 'Sign out',
        variant: 'destructive',
        onClick: () => void handleMemberLogout(),
      },
    );
    return guestItems;
  }, [
    isOwner,
    selectedRoom,
    ownerTab,
    pendingApprovalCount,
    roomNotes.length,
    openTaskCount,
    summarizing,
    state?.rooms.length,
    state?.members.length,
    state?.invites?.length,
    state?.pikpamBaseUrl,
    onOpenSettings,
    standalone,
  ]);

  const isChatCanvas = !loading && ownerTab === 'chat' && Boolean(selectedRoom);

  return (
    <VStack
      className="gitu-astryx-overlay gitu-inbox-shell"
      width="100%"
      height="100%"
      padding={0}
      aria-label="Collaborative Inbox"
    >
      <VStack
        className="gitu-inbox-canvas"
        width="100%"
        height="100%"
        padding={0}
        data-chat-active={isChatCanvas ? 'true' : 'false'}
      >
        {/* Floating Cowork-identical top bar: Left Rooms Drawer · Center Mode Pill · Right Tools Menu */}
        <HStack className="gitu-inbox-topbar">
          <HStack className="gitu-inbox-left-slot">
            <IconButton
              className="gitu-inbox-circle-btn"
              label="Rooms and threads"
              tooltip="Rooms and threads"
              variant="ghost"
              size="sm"
              icon={<AppIcon icon={MessageSquare} size="sm" />}
              onClick={() => setRoomsDrawerOpen(true)}
            />
          </HStack>

          <HStack className="gitu-inbox-mode-wrap">
            {isOwner || !standalone ? (
              <HStack className="gitu-inbox-mode-nav" role="navigation" aria-label="App modes">
                <Button
                  className="gitu-inbox-mode-btn"
                  label="Cowork"
                  variant="ghost"
                  size="sm"
                  aria-pressed={false}
                  icon={
                    <img
                      className="gitu-inbox-cowork-face"
                      src={coworkAvatarSrc}
                      alt=""
                      draggable={false}
                    />
                  }
                  onClick={handleSwitchCowork}
                />
                <Button
                  className="gitu-inbox-mode-btn"
                  label="Code"
                  variant="ghost"
                  size="sm"
                  aria-pressed={false}
                  icon={<AppIcon icon={Home} size="sm" />}
                  onClick={handleSwitchCode}
                />
                <Button
                  className="gitu-inbox-mode-btn"
                  label="Inbox"
                  variant="ghost"
                  size="sm"
                  aria-pressed={true}
                  icon={<AppIcon icon={Users} size="sm" />}
                  onClick={() => setOwnerTab('chat')}
                />
              </HStack>
            ) : (
              <HStack className="gitu-inbox-member-pill" gap={2} vAlign="center">
                <AppIcon icon={Users} size="sm" color="accent" />
                <Text size="sm" weight="semibold">
                  {selectedRoom?.title || state?.workspaceName || 'Collaborative Inbox'}
                </Text>
              </HStack>
            )}
          </HStack>

          <HStack className="gitu-inbox-right-slot">
            <DropdownMenu
              placement="below"
              alignment="end"
              menuWidth={224}
              items={toolsMenuItems}
              renderTrigger={(triggerProps) => (
                <IconButton
                  {...triggerProps}
                  className="gitu-inbox-circle-btn"
                  label="Inbox tools and settings"
                  tooltip="Inbox tools"
                  variant="ghost"
                  size="sm"
                  icon={<AppIcon icon={MoreHorizontal} size="sm" />}
                />
              )}
            />
          </HStack>
        </HStack>

        {/* Main Canvas Area */}
        {loading ? (
          <Center width="100%" height="100%" className="gitu-inbox-hero">
            <Text color="secondary">Loading Inbox…</Text>
          </Center>
        ) : ownerTab === 'access' && isOwner ? (
          <VStack className="gitu-inbox-admin-scroll" gap={4}>
            <HStack hAlign="between" vAlign="center" wrap="wrap" gap={2}>
              <Button
                label={selectedRoom ? `Back to ${selectedRoom.title}` : 'Back to Inbox'}
                variant="ghost"
                size="sm"
                icon={<AppIcon icon={ArrowLeft} size="sm" />}
                onClick={() => setOwnerTab('chat')}
              />
              <Button
                label="Invite Human"
                variant="primary"
                size="sm"
                icon={<AppIcon icon={Link2} size="sm" />}
                onClick={() => {
                  setLatestInviteUrl('');
                  setInviteOpen(true);
                }}
              />
            </HStack>

            {error ? (
              <Card padding={3}>
                <HStack hAlign="between" vAlign="center">
                  <Text size="sm" weight="semibold">{error}</Text>
                  <Button label="Dismiss" size="sm" variant="ghost" onClick={() => setError(null)} />
                </HStack>
              </Card>
            ) : null}

            <Card padding={4}>
              <VStack gap={4}>
                <VStack gap={1}>
                  <Heading level={4}>Invited Humans &amp; Agent Access</Heading>
                  <Text size="sm" color="secondary">
                    Control tool policies and which agents each invited collaborator can talk to.
                  </Text>
                </VStack>

                {!state?.members.length ? (
                  <EmptyState
                    isCompact
                    title="No invited humans yet"
                    description="Create a Pikpam invite link to bring a collaborator into your Inbox."
                  />
                ) : (
                  <VStack gap={3}>
                    {state.members.map((m, idx) => (
                      <VStack key={m.id} gap={3}>
                        {idx > 0 ? <Divider /> : null}
                        <HStack hAlign="between" vAlign="center" wrap="wrap" gap={2}>
                          <HStack gap={2} vAlign="center">
                            <StatusDot
                              variant={m.status === 'revoked' ? 'error' : 'success'}
                              label={m.status === 'revoked' ? 'Revoked' : 'Active'}
                            />
                            <VStack gap={0}>
                              <Text weight="semibold">{m.name}</Text>
                              <Text size="sm" color="secondary">
                                {m.email}
                              </Text>
                            </VStack>
                          </HStack>
                          <HStack gap={2} vAlign="center" wrap="wrap">
                            <Selector
                              label="Tool policy"
                              value={m.toolPolicy || 'read_only'}
                              options={TOOL_POLICY_OPTIONS}
                              onChange={(val) =>
                                void handleUpdateMember(m.id, { toolPolicy: val as InboxToolPolicy })
                              }
                            />
                            <Button
                              label={m.status === 'revoked' ? 'Restore' : 'Revoke'}
                              size="sm"
                              variant={m.status === 'revoked' ? 'secondary' : 'ghost'}
                              onClick={() =>
                                void handleUpdateMember(m.id, {
                                  status: m.status === 'revoked' ? 'active' : 'revoked',
                                })
                              }
                            />
                          </HStack>
                        </HStack>
                        {state.agents.length ? (
                          <HStack gap={3} wrap="wrap" vAlign="center">
                            <Text size="sm" color="secondary">
                              Allowed agents:
                            </Text>
                            {state.agents.map((a) => {
                              const enabled = (m.allowedAgentIds ?? []).includes(a.id);
                              return (
                                <Switch
                                  key={a.id}
                                  label={a.name}
                                  value={enabled}
                                  onChange={(checked) =>
                                    void handleUpdateMember(m.id, {
                                      allowedAgentIds: toggleId(m.allowedAgentIds ?? [], a.id, checked),
                                    })
                                  }
                                />
                              );
                            })}
                          </HStack>
                        ) : null}
                      </VStack>
                    ))}
                  </VStack>
                )}
              </VStack>
            </Card>
          </VStack>
        ) : ownerTab === 'invites' && isOwner ? (
          <VStack className="gitu-inbox-admin-scroll" gap={4}>
            <HStack hAlign="between" vAlign="center" wrap="wrap" gap={2}>
              <Button
                label={selectedRoom ? `Back to ${selectedRoom.title}` : 'Back to Inbox'}
                variant="ghost"
                size="sm"
                icon={<AppIcon icon={ArrowLeft} size="sm" />}
                onClick={() => setOwnerTab('chat')}
              />
              <Button
                label="Create Invite Link"
                variant="primary"
                size="sm"
                icon={<AppIcon icon={Plus} size="sm" />}
                onClick={() => {
                  setLatestInviteUrl('');
                  setInviteOpen(true);
                }}
              />
            </HStack>

            {notice ? (
              <Card padding={3}>
                <HStack hAlign="between" vAlign="center">
                  <Text color="accent" size="sm">{notice}</Text>
                  <Button label="Dismiss" size="sm" variant="ghost" onClick={() => setNotice(null)} />
                </HStack>
              </Card>
            ) : null}

            <Card padding={4}>
              <VStack gap={4}>
                <VStack gap={1}>
                  <Heading level={4}>Pikpam Invite Links</Heading>
                  <Text size="sm" color="secondary">
                    Invited teammates sign in with Pikpam and enter only the rooms and agents you assign.
                  </Text>
                </VStack>

                {!state?.invites?.length ? (
                  <EmptyState
                    isCompact
                    title="No invite links yet"
                    description="Create a Pikpam invite link to bring a collaborator into your Inbox."
                  />
                ) : (
                  <List density="compact" hasDividers edge="flush">
                    {state.invites.map((inv) => {
                      const active = !inv.revokedAt && inv.usedCount < inv.maxUses;
                      return (
                        <ListItem
                          key={inv.id}
                          label={inv.label || inv.targetEmail || `Invite (${inv.scopeType})`}
                          description={`${inv.pikpamInviteUrl || 'Local invite'} · Used ${inv.usedCount}/${inv.maxUses} · Policy: ${inv.toolPolicy}`}
                          startContent={
                            <StatusDot
                              variant={active ? 'success' : 'neutral'}
                              label={active ? 'Active' : 'Closed'}
                            />
                          }
                          endContent={
                            <HStack gap={2}>
                              {inv.pikpamInviteUrl && active ? (
                                <Button
                                  label="Copy Link"
                                  size="sm"
                                  variant="secondary"
                                  onClick={() => handleCopy(inv.pikpamInviteUrl!)}
                                />
                              ) : null}
                              {active ? (
                                <Button
                                  label="Revoke"
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => void handleRevokeInvite(inv.id)}
                                />
                              ) : null}
                            </HStack>
                          }
                        />
                      );
                    })}
                  </List>
                )}
              </VStack>
            </Card>
          </VStack>
        ) : !selectedRoom ? (
          <Center width="100%" height="100%" className="gitu-inbox-hero">
            <VStack gap={4} hAlign="center" maxWidth={480}>
              <AppIcon icon={Users} size="lg" color="accent" />
              <VStack gap={1} hAlign="center">
                <Heading level={2}>Your shared inbox, in one place</Heading>
                <Text color="secondary" justify="center">
                  {isOwner
                    ? 'Collaborate with invited humans and your AI teammates inside shared rooms with clear tool permissions.'
                    : 'No rooms have been assigned to your account yet.'}
                </Text>
              </VStack>
              {isOwner ? (
                <HStack gap={2} wrap="wrap" hAlign="center">
                  <Button
                    label="New room"
                    variant="primary"
                    icon={<AppIcon icon={Plus} size="sm" />}
                    onClick={() => setNewRoomOpen(true)}
                  />
                  <Button
                    label="Invite human"
                    variant="secondary"
                    icon={<AppIcon icon={Link2} size="sm" />}
                    onClick={() => {
                      setLatestInviteUrl('');
                      setInviteOpen(true);
                    }}
                  />
                </HStack>
              ) : null}
            </VStack>
          </Center>
        ) : (
          <>
            {/* Cowork-style scrollable chat transcript */}
            <VStack className="gitu-inbox-msgs" gap={3}>
              {error ? (
                <Card padding={3}>
                  <HStack hAlign="between" vAlign="center">
                    <Text size="sm" weight="semibold">{error}</Text>
                    <Button label="Dismiss" size="sm" variant="ghost" onClick={() => setError(null)} />
                  </HStack>
                </Card>
              ) : null}

              {notice ? (
                <Card padding={3}>
                  <HStack hAlign="between" vAlign="center">
                    <Text color="accent" size="sm">{notice}</Text>
                    <Button label="Dismiss" size="sm" variant="ghost" onClick={() => setNotice(null)} />
                  </HStack>
                </Card>
              ) : null}

              {messages.length === 0 ? (
                <Center width="100%" padding={6}>
                  <VStack gap={3} hAlign="center" maxWidth={440}>
                    <AppIcon
                      icon={selectedRoom.kind === 'group' ? Users : User}
                      size="lg"
                      color="accent"
                    />
                    <Heading level={3}>{selectedRoom.title}</Heading>
                    <Text color="secondary" justify="center">
                      {activeRoomAgents.length > 0 && selectedRoom.agentTriggerMode === 'mention'
                        ? `Start the conversation below, or mention @${activeRoomAgents[0].name} to summon an agent.`
                        : 'Send a message below to start collaborating in this room.'}
                    </Text>
                    {activeRoomAgents.length > 0 ? (
                      <HStack gap={2} wrap="wrap" hAlign="center">
                        {activeRoomAgents.map((agent) => (
                          <Button
                            key={agent.id}
                            className="gitu-inbox-pill-btn"
                            label={`@${agent.name}`}
                            variant="ghost"
                            size="sm"
                            onClick={() => insertMention(agent.name)}
                          />
                        ))}
                      </HStack>
                    ) : null}
                  </VStack>
                </Center>
              ) : (
                messages.map((msg, idx) => {
                  const isMe = isOwner
                    ? msg.senderType === 'owner'
                    : msg.senderType === 'member' && msg.senderId === state?.member?.id;
                  const isSystem = msg.senderType === 'system';
                  const isPrivateMsg = msg.visibility === 'owner_only';
                  const prev = idx > 0 ? messages[idx - 1] : null;
                  const isGrouped = Boolean(
                    !isSystem &&
                      prev &&
                      prev.senderType === msg.senderType &&
                      prev.senderId === msg.senderId &&
                      (prev.visibility === 'owner_only') === isPrivateMsg,
                  );
                  const timeStr = new Date(msg.ts).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                  });

                  if (isSystem) {
                    return (
                      <HStack key={msg.id} className="gitu-inbox-sys" gap={2} vAlign="center">
                        {isPrivateMsg ? <AppIcon icon={Lock} size="xsm" color="accent" /> : null}
                        <Text size="sm" color="secondary">
                          {msg.text}
                        </Text>
                      </HStack>
                    );
                  }

                  if (isMe) {
                    return (
                      <VStack
                        key={msg.id}
                        className="gitu-inbox-row is-me"
                        data-grouped={isGrouped ? 'true' : undefined}
                        gap={1}
                        hAlign="end"
                      >
                        <VStack
                          className={
                            isPrivateMsg
                              ? 'gitu-inbox-bubble is-me is-private'
                              : 'gitu-inbox-bubble is-me'
                          }
                          gap={1}
                        >
                          {isPrivateMsg ? (
                            <HStack gap={1} vAlign="center">
                              <AppIcon icon={Lock} size="xsm" color="accent" />
                              <Text type="supporting" color="accent" weight="semibold">
                                Private whisper · hidden from guests
                              </Text>
                            </HStack>
                          ) : null}
                          <Text className="gitu-inbox-msg-text">{msg.text}</Text>
                        </VStack>
                      </VStack>
                    );
                  }

                  const agentObj =
                    msg.senderType === 'agent' ? agentById.get(msg.senderId) : undefined;

                  return (
                    <HStack
                      key={msg.id}
                      className="gitu-inbox-row is-other"
                      data-grouped={isGrouped ? 'true' : undefined}
                      vAlign="start"
                      gap={2}
                    >
                      <VStack
                        className="gitu-inbox-avatar-slot"
                        data-hidden={isGrouped ? 'true' : 'false'}
                      >
                        {msg.senderType === 'agent' ? (
                          <PlushPortrait
                            avatar={asCoworkAvatar(agentObj?.avatar)}
                            name={msg.senderName}
                            size={36}
                          />
                        ) : (
                          <Avatar
                            name={msg.senderName}
                            size={36}
                            shape="rounded"
                            tooltip={false}
                          />
                        )}
                      </VStack>

                      <VStack
                        className={
                          isPrivateMsg
                            ? 'gitu-inbox-bubble is-other is-private'
                            : 'gitu-inbox-bubble is-other'
                        }
                        gap={1}
                      >
                        {!isGrouped || isPrivateMsg ? (
                          <HStack gap={2} vAlign="center" wrap="wrap">
                            <Text size="sm" weight="semibold">
                              {msg.senderName}
                            </Text>
                            {isPrivateMsg ? (
                              <HStack gap={1} vAlign="center">
                                <AppIcon icon={Lock} size="xsm" color="accent" />
                                <Text type="supporting" color="accent" weight="semibold">
                                  Private reply · only you
                                </Text>
                              </HStack>
                            ) : (
                              <Text type="supporting" color="secondary">
                                {msg.senderType === 'agent'
                                  ? 'Agent'
                                  : msg.senderType === 'owner'
                                    ? 'Owner'
                                    : 'Member'}{' '}
                                · {timeStr}
                              </Text>
                            )}
                          </HStack>
                        ) : null}
                        <Text className="gitu-inbox-msg-text">{msg.text}</Text>
                      </VStack>
                    </HStack>
                  );
                })
              )}
              {thinkingAgentNames.length > 0 ? (
                <HStack className="gitu-inbox-thinking" gap={2} vAlign="center">
                  <StatusDot variant="accent" isPulsing label="Working" />
                  <Text size="sm" color="secondary">
                    {thinkingAgentNames.join(', ')}{' '}
                    {thinkingAgentNames.length === 1 ? 'is' : 'are'} working…
                  </Text>
                </HStack>
              ) : isOwner && (watchingNow || selectedRoom.watching) ? (
                <HStack className="gitu-inbox-thinking" gap={2} vAlign="center">
                  <StatusDot variant="accent" isPulsing label="Watching" />
                  <Text size="sm" color="secondary">
                    Watching &amp; noting silently…
                  </Text>
                </HStack>
              ) : null}
              <VStack ref={feedEndRef} height={1} />
            </VStack>

            {/* Floating Cowork-identical bottom composer */}
            <VStack className="gitu-inbox-composer-wrap" gap={2}>
              <HStack gap={2} vAlign="center" wrap="wrap">
                <Button
                  className="gitu-inbox-pill-btn"
                  label={selectedRoom.title}
                  variant="ghost"
                  size="sm"
                  icon={<AppIcon icon={selectedRoom.kind === 'group' ? Users : User} size="sm" color="accent" />}
                  endContent={<AppIcon icon={ChevronDown} size="xsm" color="secondary" />}
                  onClick={() => setRoomsDrawerOpen(true)}
                />
                {isOwner ? (
                  <Button
                    className="gitu-inbox-pill-btn"
                    data-alert={privateWhisper ? 'true' : undefined}
                    label={privateWhisper ? 'Private whisper: ON' : 'Private'}
                    variant="ghost"
                    size="sm"
                    icon={<AppIcon icon={Lock} size="xsm" color={privateWhisper ? 'accent' : 'secondary'} />}
                    onClick={() => {
                      setPrivateWhisper((prev) => !prev);
                      composerRef.current?.focus();
                    }}
                  />
                ) : null}
                {isOwner && activeRoomAgents.length > 0 ? (
                  <Button
                    className="gitu-inbox-pill-btn"
                    data-alert={selectedRoom.agentTriggerMode === 'watch' ? 'true' : undefined}
                    label={
                      selectedRoom.agentTriggerMode === 'watch'
                        ? 'Watching silently'
                        : 'Watch & Note'
                    }
                    variant="ghost"
                    size="sm"
                    icon={
                      <AppIcon
                        icon={Eye}
                        size="xsm"
                        color={selectedRoom.agentTriggerMode === 'watch' ? 'accent' : 'secondary'}
                      />
                    }
                    onClick={() =>
                      void handleUpdateRoomTrigger(
                        selectedRoom,
                        selectedRoom.agentTriggerMode === 'watch' ? 'mention' : 'watch',
                      )
                    }
                  />
                ) : null}
                {canViewWorkspace ? (
                  <Button
                    className="gitu-inbox-pill-btn"
                    data-alert={isOwner && pendingApprovalCount > 0 ? 'true' : undefined}
                    label={
                      isOwner
                        ? pendingApprovalCount > 0
                          ? `Notes & Tasks · ${pendingApprovalCount} approval`
                          : roomNotes.length + openTaskCount > 0
                            ? `Notes & Tasks (${roomNotes.length + openTaskCount})`
                            : 'Notes & Tasks'
                        : roomNotes.length > 0
                          ? `Meeting Notes (${roomNotes.length})`
                          : 'Meeting Notes'
                    }
                    variant="ghost"
                    size="sm"
                    icon={<AppIcon icon={FileText} size="xsm" color={isOwner && pendingApprovalCount > 0 ? 'accent' : 'secondary'} />}
                    onClick={() => {
                      if (isOwner && pendingApprovalCount > 0) setWorkspaceTab('tasks');
                      setWorkspaceDrawerOpen(true);
                    }}
                  />
                ) : null}
                {isOwner && messages.length > 0 ? (
                  <Button
                    className="gitu-inbox-pill-btn"
                    label={summarizing ? 'Summarizing…' : 'Summarize'}
                    variant="ghost"
                    size="sm"
                    isDisabled={summarizing}
                    icon={<AppIcon icon={Sparkles} size="xsm" color="accent" />}
                    onClick={() => void handleSummarizeMeeting()}
                  />
                ) : null}
                {isOwner ? (
                  <Button
                    className="gitu-inbox-pill-btn"
                    label={`${activeRoomAgents.length} agent${activeRoomAgents.length === 1 ? '' : 's'} · ${selectedRoom.agentTriggerMode === 'watch' ? 'Watch' : selectedRoom.agentTriggerMode === 'mention' ? '@mention' : 'Auto'}`}
                    variant="ghost"
                    size="sm"
                    icon={<AppIcon icon={SlidersHorizontal} size="xsm" color="secondary" />}
                    onClick={() => {
                      setEditRoomTitle(selectedRoom.title);
                      setRoomAccessOpen(true);
                    }}
                  />
                ) : null}
                {activeRoomAgents.map((agent) => (
                  <Button
                    key={agent.id}
                    className="gitu-inbox-pill-btn"
                    label={`@${agent.name}`}
                    variant="ghost"
                    size="sm"
                    onClick={() => insertMention(agent.name)}
                  />
                ))}
              </HStack>

              <HStack
                className="gitu-inbox-composer"
                data-private={isOwner && privateWhisper ? 'true' : undefined}
                vAlign="end"
                gap={2}
                width="100%"
              >
                <StackItem size="fill">
                  <TextArea
                    ref={composerRef}
                    label="Message"
                    isLabelHidden
                    placeholder={
                      isOwner && privateWhisper
                        ? activeRoomAgents.length > 0
                          ? `Private whisper to ${activeRoomAgents.map((a) => a.name).join(', ')} (hidden from guests)…`
                          : 'Private whisper (activate an agent in this room to receive replies)…'
                        : isOwner && selectedRoom.agentTriggerMode === 'watch'
                          ? `Message ${selectedRoom.title} — agents are watching & noting silently`
                          : activeRoomAgents.length > 0 && selectedRoom.agentTriggerMode === 'mention'
                            ? `Message ${selectedRoom.title} — @${activeRoomAgents[0].name} summons an agent`
                            : `Message ${selectedRoom.title}…`
                    }
                    value={draft}
                    onChange={(val) => setDraft(val)}
                    rows={1}
                    width="100%"
                  />
                </StackItem>
                <IconButton
                  className="gitu-inbox-send-btn"
                  label={
                    sending
                      ? 'Sending message'
                      : isOwner && privateWhisper
                        ? 'Send private whisper'
                        : 'Send message'
                  }
                  tooltip={
                    isOwner && privateWhisper
                      ? 'Send private whisper (hidden from guests)'
                      : 'Send (Enter)'
                  }
                  variant="primary"
                  size="sm"
                  isDisabled={sending || !draft.trim()}
                  icon={<AppIcon icon={isOwner && privateWhisper ? Lock : ArrowUp} size="sm" />}
                  onClick={() => void handleSend()}
                />
              </HStack>
            </VStack>
          </>
        )}
      </VStack>

      {/* Slide-over Rooms & Admin Drawer */}
      <Drawer
        isOpen={roomsDrawerOpen}
        onOpenChange={setRoomsDrawerOpen}
        side="start"
        width={304}
        label="Inbox rooms"
      >
        <Layout
          height="fill"
          header={
            <DrawerHeader
              hasDivider
              title="Inbox"
              subtitle={state?.workspaceName || 'Shared rooms'}
              onOpenChange={setRoomsDrawerOpen}
            />
          }
          content={
            <LayoutContent padding={3}>
              <VStack gap={3} height="100%">
                {(state?.rooms.length ?? 0) > 3 ? (
                  <TextInput
                    label="Filter rooms"
                    isLabelHidden
                    startIcon="search"
                    hasClear
                    placeholder="Filter rooms…"
                    value={roomSearch}
                    onChange={setRoomSearch}
                    width="100%"
                  />
                ) : null}

                <HStack hAlign="between" vAlign="center">
                  <Text type="supporting" color="secondary">
                    Rooms ({filteredRooms.length})
                  </Text>
                  {isOwner ? (
                    <Button
                      label="New room"
                      variant="ghost"
                      size="sm"
                      icon={<AppIcon icon={Plus} size="sm" />}
                      onClick={() => {
                        setRoomsDrawerOpen(false);
                        setNewRoomOpen(true);
                      }}
                    />
                  ) : null}
                </HStack>

                <StackItem size="fill">
                  {!filteredRooms.length ? (
                    <Text type="supporting" color="secondary">
                      {isOwner
                        ? 'No rooms yet. Create one to start collaborating.'
                        : 'No rooms assigned yet.'}
                    </Text>
                  ) : (
                    <List density="compact" hasDividers={false} edge="flush">
                      {filteredRooms.map((room) => {
                        const isSelected = ownerTab === 'chat' && room.id === selectedRoomId;
                        return (
                          <ListItem
                            key={room.id}
                            label={room.title}
                            description={`${room.kind === 'group' ? 'Group' : 'Direct'} · ${room.activeAgentIds.length} agent(s)`}
                            startContent={
                              <AppIcon
                                icon={room.kind === 'group' ? Users : User}
                                size="sm"
                                color={isSelected ? 'accent' : 'secondary'}
                              />
                            }
                            isSelected={isSelected}
                            onClick={() => {
                              setSelectedRoomId(room.id);
                              setOwnerTab('chat');
                              setRoomsDrawerOpen(false);
                            }}
                          />
                        );
                      })}
                    </List>
                  )}
                </StackItem>

                {isOwner ? (
                  <VStack gap={1}>
                    <Divider />
                    <Text type="supporting" color="secondary">
                      Access &amp; Invites
                    </Text>
                    <List density="compact" hasDividers={false} edge="flush">
                      <ListItem
                        label={`Members & Access (${state?.members.length ?? 0})`}
                        startContent={<AppIcon icon={Shield} size="sm" />}
                        isSelected={ownerTab === 'access'}
                        onClick={() => {
                          setOwnerTab('access');
                          setRoomsDrawerOpen(false);
                        }}
                      />
                      <ListItem
                        label={`Pikpam Invites (${state?.invites?.length ?? 0})`}
                        startContent={<AppIcon icon={Link2} size="sm" />}
                        isSelected={ownerTab === 'invites'}
                        onClick={() => {
                          setOwnerTab('invites');
                          setRoomsDrawerOpen(false);
                        }}
                      />
                    </List>
                    <Button
                      label="Invite Human"
                      variant="primary"
                      size="sm"
                      width="100%"
                      icon={<AppIcon icon={Link2} size="sm" />}
                      onClick={() => {
                        setRoomsDrawerOpen(false);
                        setLatestInviteUrl('');
                        setInviteOpen(true);
                      }}
                    />
                  </VStack>
                ) : null}
              </VStack>
            </LayoutContent>
          }
        />
      </Drawer>

      {/* Owner: Room Settings, Participants & Agents Dialog */}
      {selectedRoom && isOwner ? (
        <Dialog
          isOpen={roomAccessOpen}
          onOpenChange={(open) => {
            if (!open) setRoomAccessOpen(false);
          }}
          purpose="info"
          width={560}
          maxHeight="85dvh"
          padding={5}
        >
          <Layout
            header={
              <DialogHeader
                hasDivider
                title={`${selectedRoom.title} · Room Settings`}
                onOpenChange={() => setRoomAccessOpen(false)}
              />
            }
            content={
              <VStack gap={4}>
                <HStack gap={2} vAlign="end" width="100%">
                  <StackItem size="fill">
                    <TextInput
                      label="Room name"
                      value={editRoomTitle}
                      onChange={setEditRoomTitle}
                    />
                  </StackItem>
                  <Button
                    label="Rename"
                    variant="secondary"
                    size="sm"
                    isDisabled={
                      !editRoomTitle.trim() || editRoomTitle.trim() === selectedRoom.title
                    }
                    onClick={() =>
                      void handleUpdateRoom(selectedRoom.id, { title: editRoomTitle.trim() })
                    }
                  />
                </HStack>

                <Selector
                  label="Agent reply trigger"
                  value={selectedRoom.agentTriggerMode}
                  options={[
                    { value: 'mention', label: '@mention only (recommended for groups)' },
                    { value: 'watch', label: 'Watch & Note silently (no public replies)' },
                    { value: 'auto', label: 'Auto-reply to every message' },
                  ]}
                  onChange={(val) =>
                    void handleUpdateRoomTrigger(selectedRoom, val as InboxTriggerMode)
                  }
                />

                <Selector
                  label="Notes, summaries & tasks visibility"
                  value={selectedRoom.notesVisibility || 'owner_only'}
                  options={[
                    {
                      value: 'owner_only',
                      label: 'Owner-private (default — share summaries manually)',
                    },
                    {
                      value: 'shared_readonly',
                      label: 'Shared read-only with members (Code runs stay private)',
                    },
                  ]}
                  onChange={(val) =>
                    void handleUpdateRoom(selectedRoom.id, {
                      notesVisibility: val as InboxNotesVisibility,
                    })
                  }
                />

                <Selector
                  label="Linked project for coding delegations"
                  value={selectedRoom.projectPath || ''}
                  options={projectOptions}
                  onChange={(val) =>
                    void handleUpdateRoom(selectedRoom.id, { projectPath: String(val) })
                  }
                />

                <VStack gap={2}>
                  <Text size="sm" weight="semibold">
                    Active agents in this room
                  </Text>
                  {!state?.agents.length ? (
                    <Text size="sm" color="secondary">
                      No agents created in your workspace yet.
                    </Text>
                  ) : (
                    <HStack gap={3} wrap="wrap">
                      {state.agents.map((a) => (
                        <Switch
                          key={a.id}
                          label={a.name}
                          value={selectedRoom.activeAgentIds.includes(a.id)}
                          onChange={(checked) => void handleToggleRoomAgent(selectedRoom, a.id, checked)}
                        />
                      ))}
                    </HStack>
                  )}
                </VStack>

                <Divider />

                <VStack gap={2}>
                  <Text size="sm" weight="semibold">
                    Invited humans in this room
                  </Text>
                  {!state?.members.filter((m) => m.status !== 'revoked').length ? (
                    <Text size="sm" color="secondary">
                      No active invited humans yet. Create an invite link first.
                    </Text>
                  ) : (
                    <HStack gap={3} wrap="wrap">
                      {state.members
                        .filter((m) => m.status !== 'revoked')
                        .map((m) => (
                          <Switch
                            key={m.id}
                            label={m.name}
                            value={selectedRoom.memberIds.includes(m.id)}
                            onChange={(checked) =>
                              void handleToggleRoomMember(selectedRoom, m.id, checked)
                            }
                          />
                        ))}
                    </HStack>
                  )}
                </VStack>

                <Divider />

                <HStack hAlign="between" vAlign="center">
                  <Button
                    label="Delete Room"
                    variant="ghost"
                    size="sm"
                    icon={<AppIcon icon={Trash2} size="xsm" color="error" />}
                    onClick={() => void handleDeleteRoom(selectedRoom.id)}
                  />
                  <Button label="Done" variant="primary" size="sm" onClick={() => setRoomAccessOpen(false)} />
                </HStack>
              </VStack>
            }
          />
        </Dialog>
      ) : null}

      {/* Room Notes, Meeting Summaries, Tasks & Safe Delegations Drawer */}
      {selectedRoom && canViewWorkspace ? (
        <InboxWorkspaceDrawer
          isOpen={workspaceDrawerOpen}
          onOpenChange={setWorkspaceDrawerOpen}
          roomTitle={selectedRoom.title}
          isOwner={isOwner}
          messageCount={messages.length}
          notesVisibility={selectedRoom.notesVisibility || 'owner_only'}
          projectPath={selectedRoom.projectPath}
          projects={state?.projects ?? []}
          notes={roomNotes}
          tasks={roomTasks}
          loading={workspaceLoading}
          summarizing={summarizing}
          delegatingTaskId={delegatingTaskId}
          activeTab={workspaceTab}
          onTabChange={setWorkspaceTab}
          onChangeVisibility={(visibility) =>
            handleUpdateRoom(selectedRoom.id, { notesVisibility: visibility })
          }
          onChangeProject={(projectPath) =>
            handleUpdateRoom(selectedRoom.id, { projectPath })
          }
          onSummarizeMeeting={handleSummarizeMeeting}
          onAddNote={handleAddNote}
          onDeleteNote={handleDeleteNote}
          onShareNote={handleShareNote}
          onAddTask={handleAddTask}
          onUpdateTaskStatus={handleUpdateTaskStatus}
          onDeleteTask={handleDeleteTask}
          onDelegateTaskCode={handleDelegateTaskCode}
          onDelegateTaskSubAgent={handleDelegateTaskSubAgent}
          onOpenCodeRun={handleOpenCodeRun}
        />
      ) : null}

      {/* Owner: New Room Dialog */}
      <Dialog
        isOpen={newRoomOpen}
        onOpenChange={(open) => {
          if (!open) setNewRoomOpen(false);
        }}
        purpose="info"
        width={560}
        maxHeight="85dvh"
        padding={5}
      >
        <Layout
          header={
            <DialogHeader
              hasDivider
              title="Create Inbox Room"
              onOpenChange={() => setNewRoomOpen(false)}
            />
          }
          content={
            <VStack gap={3}>
              <Selector
                label="Room type"
                value={newRoomKind}
                options={[
                  { value: 'group', label: 'Group (humans + agents)' },
                  { value: 'dm', label: 'Individual Direct Inbox' },
                ]}
                onChange={(val) => {
                  const kind = val as 'group' | 'dm';
                  setNewRoomKind(kind);
                  setNewRoomTrigger(kind === 'group' ? 'mention' : 'auto');
                }}
              />
              <TextInput
                label="Room title"
                placeholder="e.g. Acme Client Sync"
                value={newRoomTitle}
                onChange={(val) => setNewRoomTitle(val)}
              />
              <Selector
                label="Agent reply mode"
                value={newRoomTrigger}
                options={[
                  { value: 'mention', label: '@mention only (recommended for groups)' },
                  { value: 'watch', label: 'Watch & Note silently (no public replies)' },
                  { value: 'auto', label: 'Auto-reply to messages' },
                ]}
                onChange={(val) => setNewRoomTrigger(val as InboxTriggerMode)}
              />
              <Selector
                label="Notes & tasks visibility"
                value={newRoomVisibility}
                options={[
                  {
                    value: 'owner_only',
                    label: 'Owner-private (default — safest for client rooms)',
                  },
                  {
                    value: 'shared_readonly',
                    label: 'Shared read-only with members (Code runs stay private)',
                  },
                ]}
                onChange={(val) => setNewRoomVisibility(val as InboxNotesVisibility)}
              />
              <Selector
                label="Linked coding project (optional)"
                value={newRoomProject}
                options={projectOptions}
                onChange={(val) => setNewRoomProject(String(val))}
              />
              {state?.agents.length ? (
                <VStack gap={1}>
                  <Text size="sm" color="secondary">
                    Activate agents:
                  </Text>
                  <HStack gap={3} wrap="wrap">
                    {state.agents.map((a) => (
                      <Switch
                        key={a.id}
                        label={a.name}
                        value={newRoomAgents.includes(a.id)}
                        onChange={(checked) => setNewRoomAgents((prev) => toggleId(prev, a.id, checked))}
                      />
                    ))}
                  </HStack>
                </VStack>
              ) : null}
              {state?.members.filter((m) => m.status !== 'revoked').length ? (
                <VStack gap={1}>
                  <Text size="sm" color="secondary">
                    Include invited humans:
                  </Text>
                  <HStack gap={3} wrap="wrap">
                    {state.members
                      .filter((m) => m.status !== 'revoked')
                      .map((m) => (
                        <Switch
                          key={m.id}
                          label={m.name}
                          value={newRoomMembers.includes(m.id)}
                          onChange={(checked) =>
                            setNewRoomMembers((prev) => toggleId(prev, m.id, checked))
                          }
                        />
                      ))}
                  </HStack>
                </VStack>
              ) : null}
              <HStack hAlign="end" gap={2}>
                <Button label="Cancel" variant="ghost" onClick={() => setNewRoomOpen(false)} />
                <Button
                  label="Create Room"
                  variant="primary"
                  isDisabled={!newRoomTitle.trim()}
                  onClick={() => void handleCreateRoom()}
                />
              </HStack>
            </VStack>
          }
        />
      </Dialog>

      {/* Owner: Invite Human Dialog */}
      <Dialog
        isOpen={inviteOpen}
        onOpenChange={(open) => {
          if (!open) setInviteOpen(false);
        }}
        purpose="info"
        width={580}
        maxHeight="85dvh"
        padding={5}
      >
        <Layout
          header={
            <DialogHeader
              hasDivider
              title="Invite Human via Pikpam"
              onOpenChange={() => setInviteOpen(false)}
            />
          }
          content={
            <VStack gap={3}>
              {!state?.pikpamConfigured ? (
                <Text size="sm" weight="semibold">
                  Connect your Pikpam / PikRouter API key in Settings first so invite links can be tied to Pikpam accounts.
                </Text>
              ) : null}
              <TextInput
                label="Label (optional)"
                placeholder="e.g. Sarah — Marketing"
                value={inviteLabel}
                onChange={(val) => setInviteLabel(val)}
              />
              <TextInput
                label="Restrict to email (optional)"
                placeholder="sarah@company.com"
                value={inviteEmail}
                onChange={(val) => setInviteEmail(val)}
              />
              <Selector
                label="Assign to room (optional)"
                value={inviteRoomId}
                options={[
                  { value: '', label: 'Create a Direct Inbox automatically' },
                  ...(state?.rooms ?? []).map((r) => ({ value: r.id, label: `${r.title} (${r.kind})` })),
                ]}
                onChange={(val) => setInviteRoomId(String(val))}
              />
              <Selector
                label="Agent tool policy for this human"
                value={invitePolicy}
                options={TOOL_POLICY_OPTIONS}
                onChange={(val) => setInvitePolicy(val as InboxToolPolicy)}
              />
              <TextInput
                label="Max uses"
                value={inviteMaxUses}
                onChange={(val) => setInviteMaxUses(val)}
              />
              {state?.agents.length ? (
                <VStack gap={1}>
                  <Text size="sm" color="secondary">
                    Allowed agents for this invite:
                  </Text>
                  <HStack gap={3} wrap="wrap">
                    {state.agents.map((a) => (
                      <Switch
                        key={a.id}
                        label={a.name}
                        value={inviteAgents.includes(a.id)}
                        onChange={(checked) => setInviteAgents((prev) => toggleId(prev, a.id, checked))}
                      />
                    ))}
                  </HStack>
                </VStack>
              ) : null}

              {latestInviteUrl ? (
                <Card padding={3}>
                  <VStack gap={2}>
                    <Text size="sm" color="secondary">
                      Share this Pikpam invite link:
                    </Text>
                    <Text type="code" size="sm">
                      {latestInviteUrl}
                    </Text>
                    <HStack hAlign="end">
                      <Button
                        label="Copy Invite Link"
                        size="sm"
                        variant="primary"
                        onClick={() => handleCopy(latestInviteUrl)}
                      />
                    </HStack>
                  </VStack>
                </Card>
              ) : null}

              <HStack hAlign="end" gap={2}>
                <Button label="Close" variant="ghost" onClick={() => setInviteOpen(false)} />
                <Button
                  label={creatingInvite ? 'Generating…' : 'Generate Pikpam Link'}
                  variant="primary"
                  isDisabled={creatingInvite || !state?.pikpamConfigured}
                  onClick={() => void handleCreateInvite()}
                />
              </HStack>
            </VStack>
          }
        />
      </Dialog>
    </VStack>
  );
}
