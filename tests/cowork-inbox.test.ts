import { mkdtempSync, rmSync } from 'node:fs';
import type { IncomingMessage } from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  clampInboxAgentForMember,
  INBOX_MEMBER_COOKIE,
  InboxStore,
  sanitizeInboxRoomForMember,
  sanitizeInboxTaskForMember,
} from '../src/cowork/inbox-store.js';
import {
  buildCoworkInboxAwareness,
  runInboxAgentReply,
  runInboxSilentWatch,
  selectInboxRespondingAgents,
  summarizeInboxMeeting,
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
    expect(seenPrompts[0]).toContain('External workspace tools are in chat-only mode');
    expect(store.messages(room.id)).toHaveLength(2);
  });
});

describe('Inbox meeting notes, tasks, safe delegation, and meeting summary', () => {
  it('defaults rooms to owner_only notes visibility and sanitizes private coding metadata for members', () => {
    const dir = tempDir();
    const store = new InboxStore(path.join(dir, 'inbox.json'));
    const room = store.createRoom({
      kind: 'group',
      title: 'Acme Client Sync',
      projectPath: 'C:/secret/acme-repo',
    });
    expect(room.notesVisibility).toBe('owner_only');

    const safeRoom = sanitizeInboxRoomForMember(room);
    expect(safeRoom.projectPath).toBeUndefined();
    expect(safeRoom.notesVisibility).toBe('owner_only');

    const note = store.addNote(room.id, {
      kind: 'decision',
      title: 'Pricing agreed',
      content: 'Phase 1 budget approved.',
      createdByType: 'owner',
      createdById: 'owner',
      createdByName: 'Owner',
    });
    expect(store.listNotes(room.id)).toHaveLength(1);
    expect(store.getNote(room.id, note.id)?.title).toBe('Pricing agreed');

    const task = store.addTask(room.id, {
      title: 'Build client portal login',
      kind: 'coding',
      status: 'pending_approval',
      projectPath: 'C:/secret/acme-repo',
      codeRunId: 'run-private-99',
      delegationSummary: 'Internal stack trace',
      requestedByType: 'member',
      requestedByName: 'Client',
    });

    const sanitized = sanitizeInboxTaskForMember(task);
    expect(sanitized.codeRunId).toBeUndefined();
    expect(sanitized.projectPath).toBeUndefined();
    expect(sanitized.delegationSummary).toBeUndefined();
    expect(sanitized.status).toBe('todo');

    expect(store.deleteRoom(room.id)).toBe(true);
    expect(store.listNotes(room.id)).toEqual([]);
    expect(store.listTasks(room.id)).toEqual([]);
  });

  it('prevents invited clients from auto-executing Code runs and logs pending_approval proposals instead', async () => {
    const dir = tempDir();
    const store = new InboxStore(path.join(dir, 'inbox.json'));
    const agent = fakeAgent('ag-1', 'Nova');
    const client = store.upsertMemberFromPikpam({
      pikpamUserId: 'pik-client-1',
      email: 'client@acme.com',
      name: 'Client',
      allowedAgentIds: ['ag-1'],
      toolPolicy: 'chat_only',
    });
    const room = store.createRoom({
      kind: 'group',
      title: 'Acme Project',
      memberIds: [client.id],
      activeAgentIds: ['ag-1'],
      projectPath: path.join(dir, 'acme'),
    });
    store.appendMessage(room.id, {
      senderType: 'member',
      senderId: client.id,
      senderName: client.name,
      text: '@Nova please take a note and build the new checkout page',
    });

    let codingRunInvoked = 0;
    let callIdx = 0;
    const llm: LlmClient = {
      async complete(): Promise<string> {
        callIdx += 1;
        if (callIdx === 1) {
          return [
            '<tool>{"name":"inbox_write_note","params":{"kind":"note","title":"Checkout scope","content":"Client wants a new checkout page."}}</tool>',
            '<tool>{"name":"inbox_delegate_coding","params":{"title":"Build checkout page","goal":"Implement responsive checkout flow"}}</tool>',
          ].join('\n');
        }
        return 'Noted! I logged the checkout page build request for owner review.';
      },
    };

    const reply = await runInboxAgentReply({
      store,
      room,
      agent,
      senderType: 'member',
      member: client,
      resolveLlm: () => llm,
      toolContext: () => ({ cwd: dir, guard: ProjectGuard.detect(dir, { allowUnmarked: true }) }),
      startCodingRun: async () => {
        codingRunInvoked += 1;
        return { runId: 'run-should-not-happen' };
      },
    });

    expect(codingRunInvoked).toBe(0);
    expect(reply.text).toContain('owner review');
    expect(store.listNotes(room.id)).toHaveLength(1);
    const tasks = store.listTasks(room.id);
    expect(tasks).toHaveLength(1);
    expect(tasks[0]?.kind).toBe('coding');
    expect(tasks[0]?.status).toBe('pending_approval');
    expect(tasks[0]?.codeRunId).toBeUndefined();
  });

  it('allows owner to delegate coding runs and sandboxed sub-agents directly from Inbox', async () => {
    const dir = tempDir();
    const store = new InboxStore(path.join(dir, 'inbox.json'));
    const agent = fakeAgent('ag-1', 'Nova');
    const room = store.createRoom({
      kind: 'group',
      title: 'Acme Project',
      activeAgentIds: ['ag-1'],
      projectPath: path.join(dir, 'acme'),
    });
    store.appendMessage(room.id, {
      senderType: 'owner',
      senderId: 'owner',
      senderName: 'Owner',
      text: '@Nova scope the auth flow with a sub-agent and kick off the login build',
    });

    const delegatedGoals: string[] = [];
    let callIdx = 0;
    const llm: LlmClient = {
      async complete(messages: LlmMessage[]): Promise<string> {
        const sys = String(messages[0]?.content ?? '');
        if (sys.includes('temporary "architect" sub-agent')) {
          return 'Recommended OAuth2 PKCE with short-lived session cookies.';
        }
        callIdx += 1;
        if (callIdx === 1) {
          return [
            '<tool>{"name":"inbox_delegate_subagent","params":{"role":"architect","objective":"Recommend auth flow","saveNoteTitle":"Auth Architecture"}}</tool>',
            '<tool>{"name":"inbox_delegate_coding","params":{"title":"Build login page","goal":"Add login page using OAuth2 PKCE"}}</tool>',
          ].join('\n');
        }
        return 'Done — scoped the auth flow and started the engineering task in Code.';
      },
    };

    const reply = await runInboxAgentReply({
      store,
      room,
      agent,
      senderType: 'owner',
      resolveLlm: () => llm,
      toolContext: () => ({ cwd: dir, guard: ProjectGuard.detect(dir, { allowUnmarked: true }) }),
      startCodingRun: async (req) => {
        delegatedGoals.push(req.goal);
        return { runId: 'run-code-42', projectPath: req.projectPath };
      },
    });

    expect(delegatedGoals).toEqual(['Add login page using OAuth2 PKCE']);
    expect(reply.text).toContain('started the engineering task');
    expect(store.listNotes(room.id).map((n) => n.title)).toContain('Auth Architecture');
    const tasks = store.listTasks(room.id);
    expect(tasks).toHaveLength(1);
    expect(tasks[0]?.status).toBe('in_progress');
    expect(tasks[0]?.codeRunId).toBe('run-code-42');
  });

  it('summarizes a meeting transcript and saves deduplicated tasks as owner-private', async () => {
    const dir = tempDir();
    const store = new InboxStore(path.join(dir, 'inbox.json'));
    const room = store.createRoom({
      kind: 'group',
      title: 'Acme Kickoff',
      projectPath: path.join(dir, 'acme'),
    });
    store.appendMessage(room.id, {
      senderType: 'member',
      senderId: 'm1',
      senderName: 'Client',
      text: 'We need the landing page live by Friday and Stripe webhook fixed.',
    });
    store.appendMessage(room.id, {
      senderType: 'owner',
      senderId: 'owner',
      senderName: 'Owner',
      text: 'Agreed — we will ship the landing page first and fix Stripe webhooks tomorrow.',
    });
    // Pre-existing task should not be duplicated
    store.addTask(room.id, {
      title: 'Fix Stripe webhook',
      kind: 'coding',
      requestedByType: 'owner',
      requestedByName: 'Owner',
    });

    const llm: LlmClient = {
      async complete(): Promise<string> {
        return JSON.stringify({
          title: 'Meeting Summary — Acme Kickoff',
          summary: 'Aligned on Friday launch for the landing page and Stripe webhook repair.',
          keyPoints: ['Landing page target is Friday'],
          decisions: ['Prioritize landing page before billing tweaks'],
          openQuestions: ['Final hero copy sign-off'],
          tasks: [
            { title: 'Fix Stripe webhook', kind: 'coding', assignee: 'Owner' },
            { title: 'Ship landing page', description: 'Deploy hero + pricing sections', kind: 'coding', assignee: 'Nova' },
            { title: 'Send final hero copy', kind: 'action', assignee: 'Client' },
          ],
        });
      },
    };

    const result = await summarizeInboxMeeting({
      store,
      room,
      llm,
      authorId: 'ag-1',
      authorName: 'Nova',
    });

    expect(result.note.kind).toBe('summary');
    expect(result.note.title).toBe('Meeting Summary — Acme Kickoff');
    expect(result.note.content).toContain('### Decisions');
    expect(result.note.sharedToChat).toBeUndefined();
    // 2 new tasks created (Fix Stripe webhook was deduplicated)
    expect(result.createdTasks).toHaveLength(2);
    expect(result.allTasks).toHaveLength(3);
    // Transcript stays untouched until owner explicitly shares the summary
    expect(store.messages(room.id)).toHaveLength(2);
  });

  it('gives Inbox agents full room roster & speaker awareness while hiding owner-private notes from guest turns', async () => {
    const dir = tempDir();
    const store = new InboxStore(path.join(dir, 'inbox.json'));
    const nova = fakeAgent('ag-1', 'Nova', { tagline: 'Product lead' });
    const kai = fakeAgent('ag-2', 'Kai', { tagline: 'Engineer' });
    const client = store.upsertMemberFromPikpam({
      pikpamUserId: 'pik-client-2',
      email: 'sarah@acme.com',
      name: 'Sarah',
      allowedAgentIds: ['ag-1'],
      toolPolicy: 'read_only',
    });
    const room = store.createRoom({
      kind: 'group',
      title: 'Acme Design Sync',
      memberIds: [client.id],
      activeAgentIds: ['ag-1', 'ag-2'],
      notesVisibility: 'owner_only',
    });
    store.addNote(room.id, {
      kind: 'note',
      title: 'Internal pricing margin',
      content: 'SECRET_MARGIN_42_PERCENT',
      createdByType: 'owner',
      createdById: 'owner',
      createdByName: 'Owner',
    });
    store.appendMessage(room.id, {
      senderType: 'member',
      senderId: client.id,
      senderName: client.name,
      text: '@Nova who is in this room?',
    });

    const prompts: string[] = [];
    const llm: LlmClient = {
      async complete(messages: LlmMessage[]): Promise<string> {
        prompts.push(String(messages[0]?.content ?? ''));
        return 'We have you (Sarah), the workspace owner, Kai, and me (Nova).';
      },
    };

    // Guest turn: sees roster & surface, NEVER sees owner-private notes!
    await runInboxAgentReply({
      store,
      room,
      agent: nova,
      senderType: 'member',
      member: client,
      allAgents: [nova, kai],
      ownerName: 'Alex',
      resolveLlm: () => llm,
      toolContext: () => ({ cwd: dir, guard: ProjectGuard.detect(dir, { allowUnmarked: true }) }),
    });
    expect(prompts[0]).toContain('CURRENT SURFACE: Agent Gitu Collaborative Inbox');
    expect(prompts[0]).toContain('Invited humans: Sarah');
    expect(prompts[0]).toContain('Nova (you)');
    expect(prompts[0]).toContain('Kai — Engineer');
    expect(prompts[0]).toContain('CURRENT SPEAKER: Invited guest "Sarah"');
    expect(prompts[0]).not.toContain('SECRET_MARGIN_42_PERCENT');
    expect(prompts[0]).not.toContain('sarah@acme.com');

    // Owner turn: sees owner-private notes in the same room!
    await runInboxAgentReply({
      store,
      room,
      agent: nova,
      senderType: 'owner',
      allAgents: [nova, kai],
      ownerName: 'Alex',
      resolveLlm: () => llm,
      toolContext: () => ({ cwd: dir, guard: ProjectGuard.detect(dir, { allowUnmarked: true }) }),
    });
    expect(prompts[1]).toContain('CURRENT SPEAKER: Workspace Owner (Alex)');
    expect(prompts[1]).toContain('Internal pricing margin');
    expect(prompts[1]).toContain('SECRET_MARGIN_42_PERCENT');
  });

  it('builds one-way Collaborative Inbox awareness for coworkers inside private Cowork', () => {
    const dir = tempDir();
    const store = new InboxStore(path.join(dir, 'inbox.json'));
    const nova = fakeAgent('ag-1', 'Nova', { chiefOfStaff: false });
    const chief = fakeAgent('ag-chief', 'Chief', { chiefOfStaff: true });
    const unassigned = fakeAgent('ag-3', 'Scout', { chiefOfStaff: false });

    const client = store.upsertMemberFromPikpam({
      pikpamUserId: 'pik-client-3',
      email: 'client@acme.com',
      name: 'Client Maya',
      allowedAgentIds: ['ag-1'],
      toolPolicy: 'read_only',
    });
    const room = store.createRoom({
      kind: 'group',
      title: 'Maya Project Room',
      memberIds: [client.id],
      activeAgentIds: ['ag-1'],
    });
    store.appendMessage(room.id, {
      senderType: 'member',
      senderId: client.id,
      senderName: client.name,
      text: 'Please add dark mode to our portal.',
    });
    store.addNote(room.id, {
      kind: 'summary',
      title: 'Kickoff Recap',
      content: 'Agreed to deliver dark mode in sprint 1.',
      createdByType: 'agent',
      createdById: 'ag-1',
      createdByName: 'Nova',
    });
    store.addTask(room.id, {
      title: 'Add dark mode to portal',
      kind: 'coding',
      status: 'pending_approval',
      requestedByType: 'member',
      requestedByName: 'Client Maya',
    });

    const novaBrief = buildCoworkInboxAwareness(store, nova);
    expect(novaBrief).toContain('COLLABORATIVE INBOX AWARENESS');
    expect(novaBrief).toContain('Maya Project Room');
    expect(novaBrief).toContain('you are active here');
    expect(novaBrief).toContain('Pending owner coding approvals (1)');
    expect(novaBrief).toContain('Add dark mode to portal');
    expect(novaBrief).toContain('Kickoff Recap');

    // Chief of staff also gets visibility across Inbox rooms even if not directly active in the room
    const chiefBrief = buildCoworkInboxAwareness(store, chief);
    expect(chiefBrief).toContain('Maya Project Room');

    // Non-chief coworker not assigned to any room is told cleanly it isn't in any room
    const scoutBrief = buildCoworkInboxAwareness(store, unassigned);
    expect(scoutBrief).toContain('not currently assigned to any Collaborative Inbox room');
    expect(scoutBrief).not.toContain('Maya Project Room');
  });

  it('isolates owner_only private whispers from guests, guest prompts, and shareable summaries', async () => {
    const dir = tempDir();
    const store = new InboxStore(path.join(dir, 'inbox.json'));
    const nova = fakeAgent('ag-1', 'Nova');
    const client = store.upsertMemberFromPikpam({
      pikpamUserId: 'pik-client-4',
      email: 'client@acme.com',
      name: 'Client',
      allowedAgentIds: ['ag-1'],
      toolPolicy: 'chat_only',
    });
    const room = store.createRoom({
      kind: 'group',
      title: 'Acme Deal Room',
      memberIds: [client.id],
      activeAgentIds: ['ag-1'],
      agentTriggerMode: 'mention',
    });
    store.appendMessage(room.id, {
      senderType: 'member',
      senderId: client.id,
      senderName: client.name,
      text: 'Can you quote the mobile app?',
    });
    // Owner sends a private whisper without needing @Nova explicitly
    expect(
      selectInboxRespondingAgents({
        room,
        text: 'Keep our internal floor at $8000',
        allAgents: [nova],
        senderType: 'owner',
        visibility: 'owner_only',
      }).map((a) => a.id),
    ).toEqual(['ag-1']);

    store.appendMessage(room.id, {
      senderType: 'owner',
      senderId: 'owner',
      senderName: 'Owner',
      text: 'WHISPER_SECRET_FLOOR_8000',
      visibility: 'owner_only',
    });

    const prompts: string[] = [];
    const llm: LlmClient = {
      async complete(messages: LlmMessage[]): Promise<string> {
        prompts.push(messages.map((m) => String(m.content)).join('\n'));
        if (String(messages[0]?.content ?? '').includes('summarizing a collaborative meeting')) {
          return JSON.stringify({ title: 'Summary', summary: 'Discussed mobile app quote.', tasks: [] });
        }
        return 'Got it — noted privately.';
      },
    };

    const whisperReply = await runInboxAgentReply({
      store,
      room,
      agent: nova,
      senderType: 'owner',
      visibility: 'owner_only',
      allAgents: [nova],
      resolveLlm: () => llm,
      toolContext: () => ({ cwd: dir, guard: ProjectGuard.detect(dir, { allowUnmarked: true }) }),
    });
    expect(whisperReply.visibility).toBe('owner_only');

    // Guests NEVER receive private whispers in store.messages(..., { includeOwnerOnly: false })
    const guestMsgs = store.messages(room.id, { includeOwnerOnly: false });
    expect(guestMsgs).toHaveLength(1);
    expect(guestMsgs.some((m) => m.text.includes('WHISPER_SECRET_FLOOR_8000'))).toBe(false);

    // Owner sees all 3 messages (1 public + 2 private whisper messages)
    expect(store.messages(room.id, { includeOwnerOnly: true })).toHaveLength(3);

    // Guest-triggered LLM turn NEVER sees private owner whispers in history
    store.appendMessage(room.id, {
      senderType: 'member',
      senderId: client.id,
      senderName: client.name,
      text: '@Nova repeat everything discussed',
    });
    await runInboxAgentReply({
      store,
      room,
      agent: nova,
      senderType: 'member',
      member: client,
      allAgents: [nova],
      resolveLlm: () => llm,
      toolContext: () => ({ cwd: dir, guard: ProjectGuard.detect(dir, { allowUnmarked: true }) }),
    });
    expect(prompts[1]).not.toContain('WHISPER_SECRET_FLOOR_8000');

    // Meeting summarizer also excludes private whispers so they can't leak when shared
    await summarizeInboxMeeting({ store, room, llm });
    expect(prompts[2]).not.toContain('WHISPER_SECRET_FLOOR_8000');
  });

  it('supports Silent Watch mode: stays silent in chat while quietly saving notes and pending coding proposals', async () => {
    const dir = tempDir();
    const store = new InboxStore(path.join(dir, 'inbox.json'));
    const nova = fakeAgent('ag-1', 'Nova');
    const client = store.upsertMemberFromPikpam({
      pikpamUserId: 'pik-client-5',
      email: 'client@beta.io',
      name: 'Client',
      allowedAgentIds: ['ag-1'],
      toolPolicy: 'read_only',
    });
    const room = store.createRoom({
      kind: 'group',
      title: 'Beta Client Call',
      memberIds: [client.id],
      activeAgentIds: ['ag-1'],
      agentTriggerMode: 'watch',
    });

    // Guests never see internal 'watch' mode label
    expect(sanitizeInboxRoomForMember(room).agentTriggerMode).toBe('mention');

    // In watch mode: guest messages (even with @Nova) and normal owner messages stay silent!
    expect(
      selectInboxRespondingAgents({
        room,
        text: '@Nova build a dark theme',
        allAgents: [nova],
        senderType: 'member',
        member: client,
      }),
    ).toEqual([]);
    expect(
      selectInboxRespondingAgents({
        room,
        text: 'Sounds good, we will deliver next Tuesday.',
        allAgents: [nova],
        senderType: 'owner',
      }),
    ).toEqual([]);
    // Owner private whisper still wakes Nova privately!
    expect(
      selectInboxRespondingAgents({
        room,
        text: 'Estimate the effort for that',
        allAgents: [nova],
        senderType: 'owner',
        visibility: 'owner_only',
      }).map((a) => a.id),
    ).toEqual(['ag-1']);

    let llmCalls = 0;
    const llm: LlmClient = {
      async complete(): Promise<string> {
        llmCalls += 1;
        return JSON.stringify({
          shouldRecord: true,
          notes: [
            { kind: 'decision', title: 'Launch deadline', content: 'Client wants beta live next Tuesday.' },
          ],
          tasks: [
            { title: 'Add dark theme to beta dashboard', description: 'Client requested dark mode toggle', kind: 'coding', assignee: 'Nova' },
          ],
        });
      },
    };

    // Trivial ack does not even invoke the LLM
    const ack = store.appendMessage(room.id, {
      senderType: 'member',
      senderId: client.id,
      senderName: client.name,
      text: 'ok thanks!',
    });
    const ackRes = await runInboxSilentWatch({
      store,
      room,
      agent: nova,
      latestMessage: ack,
      resolveLlm: () => llm,
    });
    expect(llmCalls).toBe(0);
    expect(ackRes.savedNotes).toHaveLength(0);

    // Substantive client message silently records note + pending_approval coding proposal with zero chat replies
    const reqMsg = store.appendMessage(room.id, {
      senderType: 'member',
      senderId: client.id,
      senderName: client.name,
      text: 'We need the beta live next Tuesday and please add a dark theme to the dashboard.',
    });
    const watchRes = await runInboxSilentWatch({
      store,
      room,
      agent: nova,
      latestMessage: reqMsg,
      resolveLlm: () => llm,
    });
    expect(llmCalls).toBe(1);
    expect(watchRes.savedNotes).toHaveLength(1);
    expect(watchRes.savedNotes[0]?.title).toBe('Launch deadline');
    expect(watchRes.savedTasks).toHaveLength(1);
    expect(watchRes.savedTasks[0]?.status).toBe('pending_approval');
    // Zero agent replies were posted in chat!
    expect(store.messages(room.id).filter((m) => m.senderType === 'agent')).toHaveLength(0);
  });
});
