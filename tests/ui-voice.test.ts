import { createContext, Script } from 'node:vm';
import { describe, expect, it, vi } from 'vitest';
import { VOICE_JS } from '../src/server/ui-voice.js';

function voiceUi(agentPresent = true) {
  const elements: Record<string, any> = {};
  for (const id of ['voiceName', 'voicePhase', 'voiceCaption', 'voiceEnableAudio', 'voiceMute', 'voiceEnd']) elements[id] = { hidden: true, setAttribute: vi.fn() };
  const timers = new Map<number, () => void>();
  let nextTimer = 0;
  const audio = { remove: vi.fn() };
  const mic = { stop: vi.fn(), mute: vi.fn(), unmute: vi.fn() };
  const agent = { isAgent: true, attributes: { 'lk.agent.state': 'listening' } };
  const handlers: Record<string, (...args: any[]) => void> = {};
  const methods: Record<string, (args: any) => Promise<string>> = {};
  const room = {
    remoteParticipants: new Map(agentPresent ? [['agent', agent]] : []),
    localParticipant: { publishTrack: vi.fn().mockResolvedValue(undefined) },
    on: (event: string, fn: (...args: any[]) => void) => { handlers[event] = fn; },
    registerRpcMethod: (name: string, fn: (args: any) => Promise<string>) => { methods[name] = fn; },
    registerTextStreamHandler: vi.fn(), connect: vi.fn().mockResolvedValue(undefined),
    startAudio: vi.fn().mockRejectedValue(new Error('autoplay blocked')),
    disconnect: vi.fn().mockResolvedValue(undefined),
  };
  const sdk = { Room: function () { return room; }, RoomEvent: Object.fromEntries(['TrackSubscribed', 'TrackUnsubscribed', 'ParticipantConnected', 'ParticipantDisconnected', 'ParticipantAttributesChanged', 'AudioPlaybackStatusChanged', 'Reconnecting', 'Reconnected', 'Disconnected'].map(name => [name, name])), createLocalAudioTrack: vi.fn().mockResolvedValue(mic) };
  const api = vi.fn(async (route: string) => route === '/api/voice/config' ? { configured: true } : route === '/api/voice/worker' ? { phase: 'ready' } : route === '/api/voice/calls' ? { callId: 'call-1', name: 'Atlas', url: 'wss://project.livekit.cloud', token: 'room-token' } : { text: 'I am still working.' });
  const context = createContext({
    S: { active: 'cowork', cw: { active: 'atlas' } }, window: { LivekitClient: sdk, addEventListener: vi.fn() },
    document: { querySelectorAll: (selector: string) => selector.startsWith('[data-gitu-voice-audio=') ? [audio] : [], body: { appendChild: (element: any) => { elements[element.id] = element; } }, createElement: () => ({ dataset: {}, appendChild: (element: any) => { elements[element.id] = element; }, setAttribute: vi.fn(), remove: () => { delete elements.gituVoiceBar; } }) },
    $: (id: string) => elements[id], api, cwPoll: vi.fn(), toast: vi.fn(), clearTimeout: (id: number) => { timers.delete(id); },
    setTimeout: (fn: () => void) => { timers.set(++nextTimer, fn); return nextTimer; },
  });
  new Script(VOICE_JS).runInContext(context);
  return { context, api, mic, room, sdk, handlers, methods, elements, timers, audio };
}

describe('Live call lifecycle', () => {
  it('returns speech even if refreshing the conversation throws', async () => {
    const u = voiceUi();
    u.context.cwPoll.mockImplementation(() => { throw new Error('render failed'); });
    await u.context.startGituVoice({ kind: 'cowork', conversationId: 'atlas' });
    expect(JSON.parse(await u.methods['gitu.voice.reply']!({ callerIdentity: 'agent', payload: JSON.stringify({ callId: 'call-1', id: 'turn-2', text: 'Hello' }) })).text).toBe('I am still working.');
  });
  it('shows authenticated speech failures and records generated audio', async () => {
    const u = voiceUi();
    await u.context.startGituVoice({ kind: 'cowork', conversationId: 'atlas' });
    const report = (callerIdentity: string, status: object) => u.methods['gitu.voice.status']!({ callerIdentity, payload: JSON.stringify({ callId: 'call-1', ...status }) });
    await expect(report('stranger', { stage: 'tts', error: true })).rejects.toThrow('not authorized');
    await report('agent', { stage: 'tts', error: true, code: 'HTTP_402' });
    expect(u.elements.voicePhase.textContent).toContain('Speech generation failed (HTTP_402)');
    await report('agent', { stage: 'audio' });
    expect(u.elements.gituVoiceBar.dataset.audioGenerated).toBe('true');
  });
  it('returns the existing agent reply to the speech worker and surfaces failures without going silent', async () => {
    const u = voiceUi();
    await u.context.startGituVoice({ kind: 'cowork', conversationId: 'atlas' });
    const invocation = { callerIdentity: 'agent', payload: JSON.stringify({ callId: 'call-1', id: 'turn-1', text: 'Hello' }) };
    expect(JSON.parse(await u.methods['gitu.voice.reply']!(invocation)).text).toBe('I am still working.');
    u.api.mockRejectedValueOnce(new Error(JSON.stringify({ error: 'Model connection unavailable (EAI_AGAIN)' })));
    expect(JSON.parse(await u.methods['gitu.voice.reply']!(invocation)).text).toContain('having trouble');
    expect(u.elements.voicePhase.textContent).toBe('Model connection unavailable (EAI_AGAIN)');
    u.handlers.ParticipantAttributesChanged!({ 'lk.agent.state': 'listening' }, { isAgent: true, attributes: { 'lk.agent.state': 'listening' } });
    expect(u.elements.voicePhase.textContent).toContain('EAI_AGAIN');
    expect(u.context.voiceState.callId).toBe('call-1');
    expect(u.api.mock.calls.map(call => call[0])).not.toContain('/stop');
  });
  it('keeps setup failures visible and retries without stopping the task', async () => {
    const u = voiceUi();
    u.api.mockRejectedValueOnce(new Error('DNS temporarily unavailable'));
    await u.context.startGituVoice({ kind: 'cowork', conversationId: 'atlas' });
    expect(u.elements.gituVoiceBar.dataset.phase).toBe('failed');
    expect(u.elements.voicePhase.textContent).toBe('DNS temporarily unavailable');
    expect(u.elements.voiceMute.hidden).toBe(true);
    expect(u.mic.stop).not.toHaveBeenCalled();
    u.elements.voiceRetry.onclick();
    await vi.waitFor(() => expect(u.context.voiceState.callId).toBe('call-1'));
    expect(u.api.mock.calls.map(call => call[0])).not.toContain('/stop');
  });
  it('keeps the call alive when autoplay is blocked and ends audio without stopping work', async () => {
    const u = voiceUi();
    await u.context.startGituVoice({ kind: 'cowork', conversationId: 'atlas' });
    expect(u.context.voiceState.callId).toBe('call-1');
    expect(u.elements.voiceEnableAudio.hidden).toBe(false);
    expect(u.elements.voicePhase.textContent).toBe('Listening');
    expect(u.room.localParticipant.publishTrack).toHaveBeenCalledWith(u.mic);
    await expect(u.methods['gitu.voice.reply']!({ callerIdentity: 'stranger', payload: '{}' })).rejects.toThrow('Only the dispatched');
    await u.context.voiceEnd();
    expect(u.mic.stop).toHaveBeenCalledOnce();
    expect(u.audio.remove).toHaveBeenCalledOnce();
    expect(u.api.mock.calls.map(call => call[0])).not.toContain('/stop');
    expect(u.api).toHaveBeenLastCalledWith('/api/voice/calls/call-1', { method: 'DELETE' });
  });

  it('cleans up and gives a concrete recovery message if the worker never joins', async () => {
    const u = voiceUi(false);
    await u.context.startGituVoice({ kind: 'cowork', conversationId: 'atlas' });
    expect(u.elements.voicePhase.textContent).toBe('Connecting…');
    expect(u.timers.size).toBe(1);
    [...u.timers.values()][0]!();
    expect(u.context.voiceState.callId).toBeNull();
    expect(u.context.toast).toHaveBeenCalledWith(expect.stringContaining('Deploy gitu-voice'), true);
    await vi.waitFor(() => expect(u.api).toHaveBeenLastCalledWith('/api/voice/calls/call-1', { method: 'DELETE' }));
  });

  it('does not create a room when the user cancels while microphone permission is pending', async () => {
    const u = voiceUi();
    let grant!: (track: typeof u.mic) => void;
    u.sdk.createLocalAudioTrack.mockReturnValueOnce(new Promise(resolve => { grant = resolve; }));
    const starting = u.context.startGituVoice({ kind: 'cowork', conversationId: 'atlas' });
    await vi.waitFor(() => expect(u.sdk.createLocalAudioTrack).toHaveBeenCalledOnce());
    await u.context.voiceEnd(); grant(u.mic); await starting;
    expect(u.mic.stop).toHaveBeenCalledOnce();
    expect(u.api.mock.calls.map(call => call[0])).toEqual(['/api/voice/config', '/api/voice/prepare', '/api/voice/worker']);
  });
});
