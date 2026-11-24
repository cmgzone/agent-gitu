import { mkdtempSync, rmSync } from 'node:fs';
import type { IncomingMessage } from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  clampInboxAgentForMember,
  INBOX_MEMBER_COOKIE,
  InboxStore,
} from '../src/cowork/inbox-store.js';
import {
  runInboxAgentReply,
  selectInboxRespondingAgents,
} from '../src/cowork/inbox-runtime.js';
import type { CoworkAgent } from '../src/cowork/store.js';
import type { LlmClient, LlmMessage } from '../src/llm/llm.js';
import { ProjectGuard } from '../src/guard/project-guard.js';

const dirs: string[] = [];
function tempDir(): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'gitu-inbox-'));
  dirs.push(dir);
  return dir;
}

afterEach(() => {
  while (dirs.length) rmSync(dirs.pop()!, { recursive: true, force: true });
});

function fakeAgent(id: string, name: string, overrides: Partial<CoworkAgent> = {}): CoworkAgent {
  return {
    id,
    name,
    avatar: '🤖',
    tagline: 'Helper',
    systemPrompt: 'Be helpful.',
    skills: [],
    allowShell: true,
    allowWrites: true,
    allowConfig: true,
    chiefOfStaff: true,
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

describe('InboxStore lifecycle & member session isolation', () => {
  it('manages invites, members, rooms, messages, and invalidates sessions on revoke', () => {
    const dir = tempDir();
    const store = new InboxStore(path.join(dir, 'inbox.json'));

    const invite = store.createInvite({
      label: 'Sarah invite',
      scopeType: 'workspace',
      targetEmail: 'sarah@example.com',
      defaultAgentIds: ['ag-research'],
      toolPolicy: 'read_only',
    });
    store.attachPikpamInvite(invite.id, 'abc123', 'https://pikpam.com/invite/abc123');
    expect(store.getInvite(invite.id)?.pikpamInviteUrl).toBe('https://pikpam.com/invite/abc123');

    const member = store.upsertMemberFromPikpam({
      pikpamUserId: 'pik-user-1',
      email: 'sarah@example.com',
      name: 'Sarah',
      allowedAgentIds: invite.defaultAgentIds,
      toolPolicy: invite.toolPolicy,
    });
    const dm = store.ensureDmRoomForMember(member, invite.defaultAgentIds);
    expect(store.listRooms(member.id).map((r) => r.id)).toEqual([dm.id]);

    const session = store.createSession(member.id);
    const req = { headers: { cookie: `${INBOX_MEMBER_COOKIE}=${session.token}` } } as IncomingMessage;
    expect(store.authenticateRequest(req)?.id).toBe(member.id);

    // Revoking the member immediately invalidates their session cookie.
    store.updateMember(member.id, { status: 'revoked' });
    expect(store.authenticateRequest(req)).toBeUndefined();
  });
});

describe('Inbox agent selection & permission clamping', () => {
  it('enforces @mention vs auto trigger modes and per-individual allowedAgentIds', () => {
    const dir = tempDir();
    const store = new InboxStore(path.join(dir, 'inbox.json'));
    const researcher = fakeAgent('ag-1', 'Researcher');
    const coder = fakeAgent('ag-2', 'Coder');

    const member = store.upsertMemberFromPikpam({
      pikpamUserId: 'pik-2',
      email: 'alex@example.com',
      name: 'Alex',
      allowedAgentIds: ['ag-1'],
      toolPolicy: 'read_only',
    });

    // Group in @mention mode: no reply unless @mentioned
    const group = store.createRoom({
      kind: 'group',
      title: 'Launch',
      memberIds: [member.id],
      activeAgentIds: ['ag-1', 'ag-2'],
      agentTriggerMode: 'mention',
    });
    expect(
      selectInboxRespondingAgents({ room: group, text: 'Hey team, any updates?', allAgents: [researcher, coder], senderType: 'member', member }),
    ).toEqual([]);
    expect(
      selectInboxRespondingAgents({ room: group, text: '@Researcher summarize the notes', allAgents: [researcher, coder], senderType: 'member', member }).map((a) => a.id),
    ).toEqual(['ag-1']);

    // Individual DM: respects member.allowedAgentIds even if another agent is on the room
    const dm = store.createRoom({
      kind: 'dm',
      title: 'Alex DM',
      memberIds: [member.id],
      activeAgentIds: ['ag-1', 'ag-2'],
      agentTriggerMode: 'auto',
    });
    expect(
      selectInboxRespondingAgents({ room: dm, text: 'Hello', allAgents: [researcher, coder], senderType: 'member', member }).map((a) => a.id),
    ).toEqual(['ag-1']);
  });

  it('clamps agent permissions safely by owner tool policy and strips chiefOfStaff', () => {
    const chief = fakeAgent('ag-chief', 'Chief', { allowShell: true, allowWrites: true, allowConfig: true, chiefOfStaff: true });

    const chatOnly = clampInboxAgentForMember(chief, 'chat_only');
    expect(chatOnly.allowTools).toBe(false);
    expect(chatOnly.agent.allowShell).toBe(false);
    expect(chatOnly.agent.allowWrites).toBe(false);
    expect(chatOnly.agent.chiefOfStaff).toBe(false);

    const readOnly = clampInboxAgentForMember(chief, 'read_only');
    expect(readOnly.allowTools).toBe(true);
    expect(readOnly.agent.allowShell).toBe(false);
    expect(readOnly.agent.allowWrites).toBe(false);
    expect(readOnly.agent.allowConfig).toBe(false);

    const custom = clampInboxAgentForMember(chief, 'custom', { allowWrites: true, allowShell: false });
    expect(custom.agent.allowWrites).toBe(true);
    expect(custom.agent.allowShell).toBe(false);
    expect(custom.agent.chiefOfStaff).toBe(false);
  });

  it('runs an isolated Inbox agent reply with privacy rules and persists the response', async () => {
    const dir = tempDir();
    const store = new InboxStore(path.join(dir, 'inbox.json'));
    const agent = fakeAgent('ag-1', 'Nova');
    const member = store.upsertMemberFromPikpam({
      pikpamUserId: 'pik-3',
      email: 'sam@example.com',
      name: 'Sam',
      allowedAgentIds: ['ag-1'],
      toolPolicy: 'chat_only',
    });
    const room = store.createRoom({
      kind: 'group',
      title: 'Design Review',
      memberIds: [member.id],
      activeAgentIds: ['ag-1'],
      agentTriggerMode: 'mention',
    });
    store.appendMessage(room.id, {
      senderType: 'member',
      senderId: member.id,
      senderName: member.name,
      text: '@Nova what is our next milestone?',
    });

    const seenPrompts: string[] = [];
    const llm: LlmClient = {
      async complete(messages: LlmMessage[]): Promise<string> {
        const sys = messages.find((m) => m.role === 'system');
        if (sys && typeof sys.content === 'string') seenPrompts.push(sys.content);
        return 'Hi Sam, the next milestone is finalizing the launch checklist.';
      },
    };

    const reply = await runInboxAgentReply({
      store,
      room,
      agent,
      senderType: 'member',
      member,
      resolveLlm: () => llm,
      toolContext: () => ({ cwd: dir, guard: ProjectGuard.detect(dir, { allowUnmarked: true }) }),
    });

    expect(reply.senderType).toBe('agent');
    expect(reply.senderName).toBe('Nova');
    expect(reply.text).toContain('launch checklist');
    expect(seenPrompts[0]).toContain('INBOX PRIVACY RULE');
    expect(seenPrompts[0]).toContain('chat-only mode');
    expect(store.messages(room.id)).toHaveLength(2);
  });
});
