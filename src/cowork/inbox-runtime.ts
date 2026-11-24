import type { LlmClient, LlmMessage } from '../llm/llm.js';
import type { ToolContext } from '../tools/tools.js';
import { PROVIDERS, providerKey } from '../llm/providers.js';
import type { CoworkAgent } from './store.js';
import { coworkToolDocs, executeCoworkTool, parseToolCalls, stripToolMarkers } from './tools.js';
import { mentionNames } from './runner.js';
import {
  clampInboxAgentForMember,
  effectiveInboxPolicy,
  type InboxMember,
  type InboxMessage,
  type InboxRoom,
  type InboxStore,
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
  if (mentioned.length > 0) return mentioned;

  if (input.room.agentTriggerMode === 'auto') {
    return eligible;
  }
  return [];
}

/**
 * Execute one agent's reply inside a shared Inbox room.
 *
 * Privacy guarantee: when replying in an Inbox room with invited humans, the
 * owner's private `user_profile`, private `agent_memory`, and private Cowork
 * chats are intentionally excluded from the prompt.
 */
export async function runInboxAgentReply(input: {
  store: InboxStore;
  room: InboxRoom;
  agent: CoworkAgent;
  senderType: 'owner' | 'member';
  member?: InboxMember;
  resolveLlm: (agent: CoworkAgent) => LlmClient;
  toolContext: (agent: CoworkAgent) => ToolContext;
  onMessage?: (msg: InboxMessage) => void;
  signal?: AbortSignal;
}): Promise<InboxMessage> {
  const { store, room, senderType, member } = input;
  const { policy, customPerms } =
    senderType === 'member' ? effectiveInboxPolicy(member, room) : { policy: 'standard' as const, customPerms: undefined };

  const clamped =
    senderType === 'member'
      ? clampInboxAgentForMember(input.agent, policy, customPerms)
      : { agent: { ...input.agent, chiefOfStaff: false }, allowTools: true, browser: true };

  const effectiveAgent = clamped.agent;
  const history = store.messages(room.id).slice(-30);

  const toolDocs = clamped.allowTools ? coworkToolDocs(effectiveAgent, clamped.browser) : '';
  const systemParts = [
    `You are "${effectiveAgent.name}"${effectiveAgent.tagline ? ` — ${effectiveAgent.tagline}` : ''}, an AI teammate participating in a shared Agent Gitu Inbox ${room.kind === 'group' ? `group "${room.title}"` : `conversation "${room.title}"`}.`,
    effectiveAgent.systemPrompt ? `Role instructions:\n${effectiveAgent.systemPrompt}` : '',
    'INBOX PRIVACY RULE: This is a shared collaborative Inbox where invited humans may be present. Never reveal the workspace owner’s private settings, API keys, credentials, private chats, or personal profile. Base your answers strictly on this Inbox conversation and authorized tool results.',
    'Keep replies concise, clear, and helpful. Address the human who spoke by name when helpful.',
    toolDocs
      ? `TOOLS (optional — emit <tool>{"name":"...","params":{...}}</tool> to run an allowed tool):\n${toolDocs}`
      : 'You are in chat-only mode in this Inbox room (no external tools enabled). Answer directly from the conversation.',
  ].filter(Boolean);

  const messages: LlmMessage[] = [
    { role: 'system', content: systemParts.join('\n\n') },
    ...history.map((m) => ({
      role: m.senderType === 'agent' && m.senderId === effectiveAgent.id ? ('assistant' as const) : ('user' as const),
      content: `[${m.senderName}${m.senderType === 'agent' ? ' (agent)' : m.senderType === 'owner' ? ' (owner)' : ''}]: ${m.text}`,
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
    const calls = clamped.allowTools ? parseToolCalls(reply) : [];
    if (calls.length === 0) break;
    messages.push({ role: 'assistant', content: reply });
    const ctx = input.toolContext(effectiveAgent);
    for (const call of calls.slice(0, 3)) {
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
  });
  input.onMessage?.(saved);
  return saved;
}
