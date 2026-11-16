import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LiveKitCloudWorker } from '../src/voice/cloud-worker.js';
import { AgentDispatchClient, RoomServiceClient, TokenVerifier } from 'livekit-server-sdk';
import { GituVoiceCalls, cleanSpokenReply, validateLiveKitConfiguration, decideVoiceTurn } from '../src/voice/livekit.js';
import type { LlmClient, LlmMessage } from '../src/llm/llm.js';
import { GituServer } from '../src/server/server.js';
import type { CoworkMessage } from '../src/cowork/store.js';

const secrets = vi.hoisted(() => ({ keys: {} as Record<string, string> }));
vi.mock('../src/llm/keys.js', async importOriginal => ({ ...await importOriginal<typeof import('../src/llm/keys.js')>(), loadStoredKeys: () => secrets.keys, setStoredKey: (key: string, value: string) => { secrets.keys[key] = value; } }));
const config = { url: 'wss://test-project.livekit.cloud', apiKey: 'test-key', apiSecret: 'test-secret-used-only-for-unit-tests', agentName: 'gitu-voice' };
beforeEach(() => { vi.spyOn(LiveKitCloudWorker.prototype, 'ensure').mockResolvedValue(undefined); });
afterEach(() => { vi.restoreAllMocks(); secrets.keys = {}; });

describe('LiveKit voice bridge', () => {
  it('validates the endpoint and keeps keys out of status and dispatch metadata', async () => {
    expect(() => validateLiveKitConfiguration({ ...config, url: 'https://example.com' })).toThrow();
    expect(() => validateLiveKitConfiguration({ ...config, url: 'wss://user:pass@example.com' })).toThrow();
    const rooms = vi.spyOn(RoomServiceClient.prototype, 'createRoom').mockResolvedValue({} as never);
    vi.spyOn(RoomServiceClient.prototype, 'deleteRoom').mockResolvedValue(undefined);
    const dispatch = vi.spyOn(AgentDispatchClient.prototype, 'createDispatch').mockResolvedValue({} as never);
    const calls = new GituVoiceCalls(); await calls.configure(config);
    const result = await calls.start({ kind: 'cowork', conversationId: 'c', agentId: 'a' }, 'Atlas');
    expect(JSON.stringify(calls.status())).not.toContain(config.apiSecret);
    expect(JSON.stringify(dispatch.mock.calls)).not.toContain(config.apiSecret);
    expect(JSON.stringify(dispatch.mock.calls)).not.toContain('conversationId');
    const claims = await new TokenVerifier(config.apiKey, config.apiSecret).verify(result.token);
    expect(claims.video?.roomJoin).toBe(true);
    expect(claims.video?.roomAdmin).toBeUndefined();
    expect(claims.video?.room).toBe(rooms.mock.calls[0]?.[0]?.name);
    await calls.end(result.callId); expect(calls.get(result.callId)).toBeUndefined();
  });

  it('answers naturally without injecting routing format instructions into conversation', async () => {
    let seen: LlmMessage[] = [];
    const llm: LlmClient = { name: 'test', complete: async messages => { seen = messages; return 'The page is being tested.'; } };
    expect((await decideVoiceTurn(llm, { name: 'Atlas', instructions: 'Your role is software engineering.', state: 'Testing the page.', history: [{ role: 'user', content: 'Make a blue page' }], busy: true }, 'How is it going?')).reply).toBe('The page is being tested.');
    expect(JSON.stringify(seen)).toContain('Atlas'); expect(JSON.stringify(seen)).toContain('Make a blue page');
    expect(JSON.stringify(seen)).toContain('Testing the page');
    expect(JSON.stringify(seen)).not.toContain('Return JSON only');
  });
  it('routes a clear spoken work request immediately without a conversational model claiming it lacks tools', async () => {
    const llm: LlmClient = { name: 'test', complete: vi.fn(), completeTurn: vi.fn().mockResolvedValue({ kind: 'tool_calls', calls: [{ id: 'route', name: 'voice_turn', arguments: { kind: 'task', reply: 'Open Facebook.' } }], metadata: {} }) };
    const decision = await decideVoiceTurn(llm, { name: 'Atlas', instructions: 'Software engineer', state: 'Idle', history: [], busy: false }, 'Take me to Facebook using my computer.');
    expect(decision.kind).toBe('task');
    expect(llm.complete).not.toHaveBeenCalled();
    expect(llm.completeTurn).not.toHaveBeenCalled();
  });
  it('surfaces invalid ambiguous routing instead of silently dropping a request', async () => {
    const complete = vi.fn().mockResolvedValue('invalid');
    await expect(decideVoiceTurn({ name: 'test', complete }, { name: 'Atlas', instructions: '', state: '', history: [], busy: false }, 'Would a launch plan be possible?')).rejects.toThrow('No work was dispatched');
    expect(complete).toHaveBeenCalledOnce();
  });

  it('routes voice into the selected existing teammate, deduplicates turns, and leaves work running when the call ends', async () => {
    vi.spyOn(RoomServiceClient.prototype, 'createRoom').mockResolvedValue({} as never);
    vi.spyOn(RoomServiceClient.prototype, 'deleteRoom').mockResolvedValue(undefined);
    vi.spyOn(AgentDispatchClient.prototype, 'createDispatch').mockResolvedValue({} as never);
    secrets.keys.GITU_LIVEKIT_CONFIG = JSON.stringify(config);
    const home = mkdtempSync(path.join(tmpdir(), 'gitu-voice-'));
    const oldHome = process.env.AGENT_GITU_HOME; process.env.AGENT_GITU_HOME = home;
    let release!: (text: string) => void;
    const held = new Promise<string>(resolve => { release = resolve; });
    let started = false;
    const llm: LlmClient = { name: 'test', complete: async messages => {
      if (messages.some(message => typeof message.content === 'string' && message.content.includes('Return JSON only:'))) return JSON.stringify({ kind: 'question' });
      if (messages.some(message => typeof message.content === 'string' && message.content.includes('LIVE CONVERSATION:'))) return 'I’m Atlas, and your page is still in progress.';
      if (!started) { started = true; return held; } return 'Done.';
    } };
    const server = new GituServer({ cwd: home, port: 0, passwordRequired: false, llm, coworkCompletionProtocol: 'legacy' });
    try {
      const base = 'http://127.0.0.1:' + await server.start();
      const request = async (route: string, method = 'GET', body?: unknown) => {
        const response = await fetch(base + route, { method, headers: { 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
        return { status: response.status, data: await response.json() };
      };
      const agent = (await request('/api/cowork/agents', 'POST', { name: 'Atlas', systemPrompt: 'Software engineer' })).data.agent;
      const conv = (await request('/api/cowork/conversations', 'POST', { kind: 'dm', memberIds: [agent.id] })).data.conversation;
      const route = '/api/cowork/conversations/' + conv.id + '/messages';
      await request(route, 'POST', { text: 'Build my page' });
      for (let i = 0; i < 100 && !started; i++) await new Promise(resolve => setTimeout(resolve, 20));
      const call = (await request('/api/voice/calls', 'POST', { kind: 'cowork', conversationId: conv.id, agentId: agent.id })).data;
      expect(call.name).toBe('Atlas');
      const voiceRoute = '/api/voice/calls/' + call.callId;
      const payload = { id: 'utterance-1', text: 'What are you building for me?' };
      const first = await request(voiceRoute + '/reply', 'POST', payload);
      const replay = await request(voiceRoute + '/reply', 'POST', payload);
      expect(replay.data).toEqual(first.data);
      const view = (await request(route)).data;
      expect(view.busy).toBe(true);
      expect(view.messages.filter((message: CoworkMessage) => message.text === payload.text)).toHaveLength(1);
      expect(view.messages.find((message: CoworkMessage) => message.text === payload.text).status).toBe('sent');
      expect(view.messages.find((message: CoworkMessage) => message.delivery === 'question' && message.role === 'agent').agentId).toBe(agent.id);
      const task = { id: 'utterance-2', text: 'Take me to Facebook using my computer.' };
      const dispatched = await request(voiceRoute + '/reply', 'POST', task);
      expect(dispatched.data.text).toContain('queued');
      expect((await request(voiceRoute + '/reply', 'POST', task)).data).toEqual(dispatched.data);
      expect((await request(route)).data.messages.filter((message: CoworkMessage) => message.text === task.text)).toHaveLength(1);
      await request(voiceRoute, 'DELETE');
      expect((await request(route)).data.busy).toBe(true);
      expect((await request(voiceRoute + '/reply', 'POST', payload)).status).toBe(404);
      release('Done.');
    } finally { release('Done.'); await server.stop(); if (oldHome === undefined) delete process.env.AGENT_GITU_HOME; else process.env.AGENT_GITU_HOME = oldHome; rmSync(home, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }); }
  }, 20_000);

  it('fast-paths natural conversational questions in one LLM call, strips markdown for TTS, and retries failed turns cleanly', async () => {
    const complete = vi.fn().mockResolvedValue('<think>internal</think>All checks passed in `src/auth.ts` with **zero errors** — check [report](https://example.com).');
    const decision = await decideVoiceTurn(
      { name: 'test', complete },
      { name: 'Atlas', instructions: 'Helper', state: 'Ready', history: [], busy: false },
      'Did the tests pass?',
    );
    expect(decision.kind).toBe('question');
    expect(decision.reply).toBe('All checks passed in src/auth.ts with zero errors — check report.');
    expect(complete).toHaveBeenCalledOnce();
    expect(cleanSpokenReply('## Title\n- **Done** with `foo.ts`')).toBe('Title Done with foo.ts');

    // Verify failed replies are not cached forever and empty mid-call turns do not re-greet
    vi.spyOn(RoomServiceClient.prototype, 'createRoom').mockResolvedValue({} as never);
    vi.spyOn(RoomServiceClient.prototype, 'deleteRoom').mockResolvedValue(undefined);
    vi.spyOn(AgentDispatchClient.prototype, 'createDispatch').mockResolvedValue({} as never);
    secrets.keys.GITU_LIVEKIT_CONFIG = JSON.stringify(config);
    const home = mkdtempSync(path.join(tmpdir(), 'gitu-voice-retry-'));
    const oldHome = process.env.AGENT_GITU_HOME; process.env.AGENT_GITU_HOME = home;
    let attempt = 0;
    let lastServerMessages: LlmMessage[] = [];
    const llm: LlmClient = {
      name: 'test',
      complete: async messages => {
        attempt++;
        lastServerMessages = messages;
        if (attempt === 1) throw new Error('temporary network drop');
        return 'Everything looks good.';
      },
    };
    const server = new GituServer({ cwd: home, port: 0, passwordRequired: false, llm });
    try {
      const base = 'http://127.0.0.1:' + await server.start();
      const post = async (route: string, body?: unknown) => {
        const res = await fetch(base + route, { method: 'POST', headers: { 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
        return { status: res.status, data: await res.json() };
      };
      const agent = (await post('/api/cowork/agents', { name: 'Atlas', systemPrompt: 'Engineer' })).data.agent;
      const conv = (await post('/api/cowork/conversations', { kind: 'dm', memberIds: [agent.id] })).data.conversation;
      const call = (await post('/api/voice/calls', { kind: 'cowork', conversationId: conv.id, agentId: agent.id })).data;
      const greeting = await post('/api/voice/calls/' + call.callId + '/reply', { id: 'greeting', text: '' });
      expect(greeting.data.text).toContain('Atlas');
      const blankMid = await post('/api/voice/calls/' + call.callId + '/reply', { id: 'turn-blank', text: '' });
      expect(blankMid.data.text).toBe('');
      const failed = await post('/api/voice/calls/' + call.callId + '/reply', { id: 'turn-retry', text: 'What is the status?' });
      expect(failed.status).toBe(502);
      const recovered = await post('/api/voice/calls/' + call.callId + '/reply', { id: 'turn-retry', text: 'What is the status?' });
      expect(recovered.status).toBe(200);
      expect(recovered.data.text).toBe('Everything looks good.');

      // Asking/discussing phrasing stays conversational without starting background work or repeating own name prefix
      let seenFollowup: LlmMessage[] = [];
      const captureLlm: LlmClient = { name: 'test', complete: async messages => { seenFollowup = messages; return 'Atlas: Let’s keep the current header and add dark mode second.'; } };
      const discussed = await decideVoiceTurn(captureLlm, { name: 'Atlas', instructions: 'Engineer', state: 'Idle', history: [{ role: 'assistant', content: 'Earlier reply' }], busy: false }, 'Can you check why the sidebar shows Thinking or should we fix CSS?');
      expect(discussed.kind).toBe('question');
      expect(discussed.reply).toBe('Let’s keep the current header and add dark mode second.');
      expect(String(seenFollowup[1]?.content)).toContain('never repeat, announce, or prefix "Atlas"');

      const goAhead = await decideVoiceTurn({ name: 'test', complete: vi.fn() }, { name: 'Atlas', instructions: 'Engineer', state: 'Idle', history: [], busy: false }, 'Go ahead and build the settings page.');
      expect(goAhead.kind).toBe('task');

      // Cowork follow-up call should not inject "Atlas: " prefixes into its own prior assistant turns
      const followup = await post('/api/voice/calls/' + call.callId + '/reply', { id: 'turn-discuss', text: 'What if we change the layout first?' });
      expect(followup.status).toBe(200);
      expect(followup.data.text).toBe('Everything looks good.');
      const assistantHistory = lastServerMessages.filter(message => message.role === 'assistant').map(message => String(message.content));
      expect(assistantHistory).toContain('Everything looks good.');
      expect(assistantHistory.some(entry => entry.startsWith('Atlas:'))).toBe(false);
      expect(cleanSpokenReply('Assistant: Sure, let us simplify it.')).toBe('Sure, let us simplify it.');
      expect(cleanSpokenReply('Atlas: Here is the idea.', 'Atlas')).toBe('Here is the idea.');
      expect(cleanSpokenReply('[Atlas] Here is the idea.', 'Atlas')).toBe('Here is the idea.');
      expect(cleanSpokenReply('Atlas — sounds good.', 'Atlas')).toBe('sounds good.');
      const convView = await (await fetch(base + '/api/cowork/conversations/' + conv.id + '/messages')).json() as { busy: boolean };
      expect(convView.busy).toBe(false);
    } finally {
      await server.stop();
      if (oldHome === undefined) delete process.env.AGENT_GITU_HOME; else process.env.AGENT_GITU_HOME = oldHome;
      rmSync(home, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
    }
  }, 20_000);
});
