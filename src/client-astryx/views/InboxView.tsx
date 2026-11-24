import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { VStack, HStack, StackItem, Layout, LayoutContent } from '@astryxdesign/core/Layout';
import { Heading, Text } from '@astryxdesign/core/Text';
import { Card } from '@astryxdesign/core/Card';
import { Button } from '@astryxdesign/core/Button';
import { TextInput } from '@astryxdesign/core/TextInput';
import { TextArea } from '@astryxdesign/core/TextArea';
import { Selector } from '@astryxdesign/core/Selector';
import { Switch } from '@astryxdesign/core/Switch';
import { Divider } from '@astryxdesign/core/Divider';
import { List, ListItem } from '@astryxdesign/core/List';
import { StatusDot } from '@astryxdesign/core/StatusDot';
import { EmptyState } from '@astryxdesign/core/EmptyState';
import { Tab, TabList } from '@astryxdesign/core/TabList';
import { Dialog } from '@astryxdesign/core/Dialog';

type InboxToolPolicy = 'chat_only' | 'read_only' | 'standard' | 'custom';
type InboxTriggerMode = 'mention' | 'auto';

interface InboxAgentSummary {
  id: string;
  name: string;
  avatar?: string;
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

export function InboxView({
  standalone = false,
  onClose,
}: {
  standalone?: boolean;
  onClose?: () => void;
}) {
  const [state, setState] = useState<InboxStateResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [selectedRoomId, setSelectedRoomId] = useState<string>('');
  const [messages, setMessages] = useState<InboxMessageRecord[]>([]);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);

  const [ownerTab, setOwnerTab] = useState<'chat' | 'access' | 'invites'>('chat');
  const [newRoomOpen, setNewRoomOpen] = useState(false);
  const [newRoomKind, setNewRoomKind] = useState<'group' | 'dm'>('group');
  const [newRoomTitle, setNewRoomTitle] = useState('');
  const [newRoomTrigger, setNewRoomTrigger] = useState<InboxTriggerMode>('mention');
  const [newRoomMembers, setNewRoomMembers] = useState<string[]>([]);
  const [newRoomAgents, setNewRoomAgents] = useState<string[]>([]);

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
      return;
    }
    try {
      const data = await inboxFetch<{ messages: InboxMessageRecord[] }>(
        `/api/inbox/rooms/${encodeURIComponent(roomId)}/messages`,
      );
      setMessages(data.messages);
    } catch {
      // ignore transient poll errors
    }
  }, []);

  useEffect(() => {
    void loadState();
  }, [loadState]);

  useEffect(() => {
    void loadMessages(selectedRoomId);
  }, [selectedRoomId, loadMessages]);

  useEffect(() => {
    const es = new EventSource('/api/inbox/stream');
    const onInbox = (evt: MessageEvent) => {
      void loadState();
      try {
        const payload = JSON.parse(String(evt.data || '{}')) as { roomId?: string | null };
        if (!payload.roomId || payload.roomId === selectedRoomIdRef.current) {
          void loadMessages(selectedRoomIdRef.current);
        }
      } catch {
        void loadMessages(selectedRoomIdRef.current);
      }
    };
    es.addEventListener('inbox', onInbox as EventListener);
    return () => {
      es.removeEventListener('inbox', onInbox as EventListener);
      es.close();
    };
  }, [loadState, loadMessages]);

  const isOwner = state?.role === 'owner';
  const selectedRoom = useMemo(
    () => state?.rooms.find((r) => r.id === selectedRoomId) ?? null,
    [state, selectedRoomId],
  );

  const agentNameMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const a of state?.agents ?? []) map.set(a.id, a.name);
    return map;
  }, [state]);

  const handleSend = async () => {
    const text = draft.trim();
    if (!text || !selectedRoom || sending) return;
    setSending(true);
    setError(null);
    try {
      await inboxFetch(`/api/inbox/rooms/${encodeURIComponent(selectedRoom.id)}/messages`, {
        method: 'POST',
        body: JSON.stringify({ text }),
      });
      setDraft('');
      await loadMessages(selectedRoom.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send message.');
    } finally {
      setSending(false);
    }
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
        }),
      });
      setNewRoomOpen(false);
      setNewRoomTitle('');
      setNewRoomMembers([]);
      setNewRoomAgents([]);
      await loadState();
      setSelectedRoomId(res.room.id);
      setOwnerTab('chat');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create room.');
    }
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

  const activeAgentNames = (selectedRoom?.activeAgentIds ?? [])
    .map((id) => agentNameMap.get(id))
    .filter((name): name is string => Boolean(name));

  const content = (
    <>
      <Layout
        content={
          <LayoutContent maxWidth="xl" padding={5}>
            <VStack gap={4}>
              {/* Header */}
              <HStack hAlign="between" vAlign="center" wrap="wrap" gap={3}>
                <VStack gap={1}>
                  <Heading level={2}>
                    {state?.workspaceName ? `${state.workspaceName} · Inbox` : 'Collaborative Inbox'}
                  </Heading>
                  <Text size="sm" color="secondary">
                    {isOwner
                      ? 'Collaborate with invited humans and owner-approved agents in Groups or Individual DMs.'
                      : state?.member
                        ? `Signed in via Pikpam as ${state.member.name} (${state.member.email})`
                        : 'Shared workspace Inbox'}
                  </Text>
                </VStack>
                <HStack gap={2} wrap="wrap">
                  {isOwner ? (
                    <>
                      <Button label="New Room" variant="secondary" size="sm" onClick={() => setNewRoomOpen(true)} />
                      <Button label="Invite Human" variant="primary" size="sm" onClick={() => { setLatestInviteUrl(''); setInviteOpen(true); }} />
                    </>
                  ) : (
                    <>
                      <Button
                        label="Get Your Own Agent"
                        variant="secondary"
                        size="sm"
                        onClick={() => window.open(`${state?.pikpamBaseUrl || 'https://pikpam.com'}/portal/cloud`, '_blank', 'noopener')}
                      />
                      <Button label="Sign Out" variant="ghost" size="sm" onClick={() => void handleMemberLogout()} />
                    </>
                  )}
                  {onClose ? <Button label="Close" variant="ghost" size="sm" onClick={onClose} /> : null}
                </HStack>
              </HStack>

              {error ? (
                <Card padding={3}>
                  <Text color="danger" size="sm">{error}</Text>
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

              {isOwner ? (
                <TabList
                  selectedId={ownerTab}
                  onSelectionChange={(id) => setOwnerTab(id as 'chat' | 'access' | 'invites')}
                >
                  <Tab id="chat" label="Rooms & Chat" />
                  <Tab id="access" label={`Members & Access (${state?.members.length ?? 0})`} />
                  <Tab id="invites" label={`Pikpam Invites (${state?.invites?.length ?? 0})`} />
                </TabList>
              ) : null}

              {loading ? (
                <Card padding={6}>
                  <Text color="secondary">Loading Inbox…</Text>
                </Card>
              ) : ownerTab === 'access' && isOwner ? (
                <Card padding={5}>
                  <VStack gap={4}>
                    <Heading level={3}>Invited Humans & Individual Agent Access</Heading>
                    {!state?.members.length ? (
                      <EmptyState
                        isCompact
                        title="No invited humans yet"
                        description="Generate a Pikpam invite link to bring a collaborator into your Inbox."
                      />
                    ) : (
                      <VStack gap={4}>
                        {state.members.map((m) => (
                          <Card key={m.id} padding={4}>
                            <VStack gap={3}>
                              <HStack hAlign="between" vAlign="center" wrap="wrap" gap={2}>
                                <HStack gap={2} vAlign="center">
                                  <StatusDot
                                    variant={m.status === 'revoked' ? 'danger' : 'success'}
                                    label={m.status === 'revoked' ? 'Revoked' : 'Active'}
                                  />
                                  <VStack gap={0}>
                                    <Text weight="semibold">{m.name}</Text>
                                    <Text size="xs" color="secondary">{m.email}</Text>
                                  </VStack>
                                </HStack>
                                <HStack gap={2} vAlign="center" wrap="wrap">
                                  <Selector
                                    label="Tool policy"
                                    value={m.toolPolicy || 'read_only'}
                                    options={TOOL_POLICY_OPTIONS}
                                    onChange={(val) => void handleUpdateMember(m.id, { toolPolicy: val as InboxToolPolicy })}
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
                              <Divider />
                              <VStack gap={2}>
                                <Text size="xs" color="secondary">
                                  Agents allowed for {m.name} (individual access):
                                </Text>
                                <HStack gap={3} wrap="wrap">
                                  {state.agents.map((a) => {
                                    const enabled = (m.allowedAgentIds ?? []).includes(a.id);
                                    return (
                                      <Switch
                                        key={a.id}
                                        label={a.name}
                                        isSelected={enabled}
                                        onChange={(checked) =>
                                          void handleUpdateMember(m.id, {
                                            allowedAgentIds: toggleId(m.allowedAgentIds ?? [], a.id, checked),
                                          })
                                        }
                                      />
                                    );
                                  })}
                                </HStack>
                              </VStack>
                            </VStack>
                          </Card>
                        ))}
                      </VStack>
                    )}
                  </VStack>
                </Card>
              ) : ownerTab === 'invites' && isOwner ? (
                <Card padding={5}>
                  <VStack gap={4}>
                    <HStack hAlign="between" vAlign="center" wrap="wrap" gap={2}>
                      <VStack gap={1}>
                        <Heading level={3}>Pikpam Invite Links</Heading>
                        <Text size="sm" color="secondary">
                          Invited users register or sign in with Pikpam before entering your Inbox.
                        </Text>
                      </VStack>
                      <Button label="Create Invite Link" variant="primary" size="sm" onClick={() => { setLatestInviteUrl(''); setInviteOpen(true); }} />
                    </HStack>
                    {!state?.invites?.length ? (
                      <EmptyState
                        isCompact
                        title="No invite links yet"
                        description="Click Create Invite Link to invite a teammate via Pikpam."
                      />
                    ) : (
                      <List density="compact" hasDividers>
                        {state.invites.map((inv) => {
                          const active = !inv.revokedAt && inv.usedCount < inv.maxUses;
                          return (
                            <ListItem
                              key={inv.id}
                              label={inv.label || inv.targetEmail || `Invite (${inv.scopeType})`}
                              description={`${inv.pikpamInviteUrl || 'Local invite'} · Used ${inv.usedCount}/${inv.maxUses} · Policy: ${inv.toolPolicy}`}
                              startContent={<StatusDot variant={active ? 'success' : 'neutral'} label={active ? 'Active' : 'Closed'} />}
                              endContent={
                                <HStack gap={2}>
                                  {inv.pikpamInviteUrl && active ? (
                                    <Button label="Copy Link" size="sm" variant="secondary" onClick={() => handleCopy(inv.pikpamInviteUrl!)} />
                                  ) : null}
                                  {active ? (
                                    <Button label="Revoke" size="sm" variant="ghost" onClick={() => void handleRevokeInvite(inv.id)} />
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
              ) : (
                /* Main Rooms & Chat View */
                <HStack gap={4} vAlign="start" wrap="wrap">
                  {/* Left: Room list */}
                  <StackItem shrink={0}>
                    <Card padding={3}>
                      <VStack gap={2}>
                        <Text size="xs" color="secondary" weight="semibold">
                          INBOX ROOMS ({state?.rooms.length ?? 0})
                        </Text>
                        {!state?.rooms.length ? (
                          <EmptyState
                            isCompact
                            title="No rooms yet"
                            description={isOwner ? 'Create a group or invite a human to start.' : 'Wait for the owner to add you to a room.'}
                          />
                        ) : (
                          <List density="compact" hasDividers>
                            {state.rooms.map((room) => (
                              <ListItem
                                key={room.id}
                                label={room.title}
                                description={`${room.kind === 'group' ? 'Group' : 'Direct'} · ${room.activeAgentIds.length} agent(s)`}
                                startContent={
                                  <StatusDot
                                    variant={room.id === selectedRoomId ? 'accent' : 'neutral'}
                                    label={room.kind}
                                  />
                                }
                                onClick={() => setSelectedRoomId(room.id)}
                              />
                            ))}
                          </List>
                        )}
                      </VStack>
                    </Card>
                  </StackItem>

                  {/* Right: Active room conversation + owner controls */}
                  <StackItem grow={1}>
                    {!selectedRoom ? (
                      <Card padding={6}>
                        <EmptyState
                          isCompact
                          title="Select an Inbox room"
                          description="Pick a group or direct conversation on the left to start collaborating."
                        />
                      </Card>
                    ) : (
                      <VStack gap={3}>
                        <Card padding={4}>
                          <VStack gap={3}>
                            <HStack hAlign="between" vAlign="center" wrap="wrap" gap={2}>
                              <VStack gap={0}>
                                <Heading level={3}>{selectedRoom.title}</Heading>
                                <Text size="xs" color="secondary">
                                  Active agents:{' '}
                                  {activeAgentNames.length > 0 ? activeAgentNames.join(', ') : 'None (humans only)'}
                                  {' · '}
                                  {selectedRoom.agentTriggerMode === 'mention'
                                    ? 'Agents reply when @mentioned'
                                    : 'Agents auto-reply'}
                                </Text>
                              </VStack>
                              {isOwner ? (
                                <Selector
                                  label="Agent replies"
                                  value={selectedRoom.agentTriggerMode}
                                  options={[
                                    { value: 'mention', label: '@mention only' },
                                    { value: 'auto', label: 'Auto-reply' },
                                  ]}
                                  onChange={(val) =>
                                    void handleUpdateRoomTrigger(selectedRoom, val as InboxTriggerMode)
                                  }
                                />
                              ) : null}
                            </HStack>

                            {isOwner ? (
                              <>
                                <Divider />
                                <VStack gap={2}>
                                  <Text size="xs" color="secondary">
                                    Active agents in this room:
                                  </Text>
                                  <HStack gap={3} wrap="wrap">
                                    {state?.agents.map((a) => (
                                      <Switch
                                        key={a.id}
                                        label={a.name}
                                        isSelected={selectedRoom.activeAgentIds.includes(a.id)}
                                        onChange={(checked) => void handleToggleRoomAgent(selectedRoom, a.id, checked)}
                                      />
                                    ))}
                                  </HStack>
                                  {state?.members.length ? (
                                    <>
                                      <Text size="xs" color="secondary">
                                        Humans in this room:
                                      </Text>
                                      <HStack gap={3} wrap="wrap">
                                        {state.members
                                          .filter((m) => m.status !== 'revoked')
                                          .map((m) => (
                                            <Switch
                                              key={m.id}
                                              label={m.name}
                                              isSelected={selectedRoom.memberIds.includes(m.id)}
                                              onChange={(checked) =>
                                                void handleToggleRoomMember(selectedRoom, m.id, checked)
                                              }
                                            />
                                          ))}
                                      </HStack>
                                    </>
                                  ) : null}
                                </VStack>
                              </>
                            ) : null}
                          </VStack>
                        </Card>

                        {/* Message history */}
                        <Card padding={4}>
                          <VStack gap={3}>
                            {messages.length === 0 ? (
                              <EmptyState
                                isCompact
                                title="No messages yet"
                                description={
                                  activeAgentNames.length > 0 && selectedRoom.agentTriggerMode === 'mention'
                                    ? `Say hello, or mention @${activeAgentNames[0]} to bring an agent into the thread.`
                                    : 'Send a message to start collaborating.'
                                }
                              />
                            ) : (
                              <VStack gap={3}>
                                {messages.map((msg) => (
                                  <Card key={msg.id} padding={3}>
                                    <VStack gap={1}>
                                      <HStack hAlign="between" vAlign="center">
                                        <HStack gap={2} vAlign="center">
                                          <StatusDot
                                            variant={
                                              msg.senderType === 'agent'
                                                ? 'accent'
                                                : msg.senderType === 'owner'
                                                  ? 'success'
                                                  : 'neutral'
                                            }
                                            label={msg.senderType}
                                          />
                                          <Text size="sm" weight="semibold">
                                            {msg.senderName}
                                          </Text>
                                        </HStack>
                                        <Text size="xs" color="secondary">
                                          {new Date(msg.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                        </Text>
                                      </HStack>
                                      <Text size="sm">{msg.text}</Text>
                                    </VStack>
                                  </Card>
                                ))}
                              </VStack>
                            )}

                            <Divider />

                            <VStack gap={2}>
                              <TextArea
                                label="Message"
                                placeholder={
                                  activeAgentNames.length > 0 && selectedRoom.agentTriggerMode === 'mention'
                                    ? `Write a message… (use @${activeAgentNames[0]} to summon an agent)`
                                    : 'Write a message…'
                                }
                                value={draft}
                                onChange={(val) => setDraft(val)}
                                rows={2}
                              />
                              <HStack hAlign="end">
                                <Button
                                  label={sending ? 'Sending…' : 'Send'}
                                  variant="primary"
                                  size="sm"
                                  isDisabled={sending || !draft.trim()}
                                  onClick={() => void handleSend()}
                                />
                              </HStack>
                            </VStack>
                          </VStack>
                        </Card>
                      </VStack>
                    )}
                  </StackItem>
                </HStack>
              )}
            </VStack>
          </LayoutContent>
        }
      />

      {/* Owner: New Room Dialog */}
      <Dialog isOpen={newRoomOpen} onClose={() => setNewRoomOpen(false)} title="Create Inbox Room">
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
            placeholder="e.g. Product Launch Team"
            value={newRoomTitle}
            onChange={(val) => setNewRoomTitle(val)}
          />
          <Selector
            label="Agent reply mode"
            value={newRoomTrigger}
            options={[
              { value: 'mention', label: '@mention only (recommended for groups)' },
              { value: 'auto', label: 'Auto-reply to messages' },
            ]}
            onChange={(val) => setNewRoomTrigger(val as InboxTriggerMode)}
          />
          {state?.agents.length ? (
            <VStack gap={1}>
              <Text size="xs" color="secondary">Activate agents:</Text>
              <HStack gap={3} wrap="wrap">
                {state.agents.map((a) => (
                  <Switch
                    key={a.id}
                    label={a.name}
                    isSelected={newRoomAgents.includes(a.id)}
                    onChange={(checked) => setNewRoomAgents((prev) => toggleId(prev, a.id, checked))}
                  />
                ))}
              </HStack>
            </VStack>
          ) : null}
          {state?.members.filter((m) => m.status !== 'revoked').length ? (
            <VStack gap={1}>
              <Text size="xs" color="secondary">Include invited humans:</Text>
              <HStack gap={3} wrap="wrap">
                {state.members
                  .filter((m) => m.status !== 'revoked')
                  .map((m) => (
                    <Switch
                      key={m.id}
                      label={m.name}
                      isSelected={newRoomMembers.includes(m.id)}
                      onChange={(checked) => setNewRoomMembers((prev) => toggleId(prev, m.id, checked))}
                    />
                  ))}
              </HStack>
            </VStack>
          ) : null}
          <HStack hAlign="end" gap={2}>
            <Button label="Cancel" variant="ghost" onClick={() => setNewRoomOpen(false)} />
            <Button label="Create Room" variant="primary" isDisabled={!newRoomTitle.trim()} onClick={() => void handleCreateRoom()} />
          </HStack>
        </VStack>
      </Dialog>

      {/* Owner: Invite Human Dialog */}
      <Dialog isOpen={inviteOpen} onClose={() => setInviteOpen(false)} title="Invite Human via Pikpam">
        <VStack gap={3}>
          {!state?.pikpamConfigured ? (
            <Text size="sm" color="danger">
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
              <Text size="xs" color="secondary">Allowed agents for this invite:</Text>
              <HStack gap={3} wrap="wrap">
                {state.agents.map((a) => (
                  <Switch
                    key={a.id}
                    label={a.name}
                    isSelected={inviteAgents.includes(a.id)}
                    onChange={(checked) => setInviteAgents((prev) => toggleId(prev, a.id, checked))}
                  />
                ))}
              </HStack>
            </VStack>
          ) : null}

          {latestInviteUrl ? (
            <Card padding={3}>
              <VStack gap={2}>
                <Text size="xs" color="secondary">Share this Pikpam invite link:</Text>
                <Text type="code" size="sm">{latestInviteUrl}</Text>
                <HStack hAlign="end">
                  <Button label="Copy Invite Link" size="sm" variant="primary" onClick={() => handleCopy(latestInviteUrl)} />
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
      </Dialog>
    </>
  );

  if (standalone) return content;
  return (
    <Dialog isOpen onClose={() => onClose?.()} size="fullscreen" title="Collaborative Inbox">
      {content}
    </Dialog>
  );
}
