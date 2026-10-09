import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LiveKitCloudWorker } from '../src/voice/cloud-worker.js';
import { AgentDispatchClient, RoomServiceClient, TokenVerifier } from 'livekit-server-sdk';
import { GituVoiceCalls, validateLiveKitConfiguration, decideVoiceTurn } from '../src/voice/livekit.js';
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
});
