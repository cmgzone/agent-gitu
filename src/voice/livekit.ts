import { randomBytes, randomUUID } from 'node:crypto';
import { AccessToken, AgentDispatchClient, RoomServiceClient } from 'livekit-server-sdk';
import { loadStoredKeys, setStoredKey } from '../llm/keys.js';
import type { LlmClient, LlmMessage } from '../llm/llm.js';
import { extractLastJsonObject } from '../llm/llm.js';

export interface VoiceTarget {
  kind: 'main' | 'cowork'; runId?: string; conversationId?: string; threadId?: string;
  agentId?: string; provider?: string; model?: string; projectPath?: string;
}
export interface VoiceContext { name: string; instructions: string; state: string; history: LlmMessage[]; busy: boolean; }
export interface VoiceDecision { kind: 'question' | 'task' | 'steer' | 'queue' | 'stop'; reply: string; }
export interface LiveKitConfiguration { url: string; apiKey: string; apiSecret: string; agentName: string; }
export interface VoiceCall {
  id: string; room: string; identity: string; target: VoiceTarget; name: string; expiresAt: number;
  responses: Map<string, Promise<Record<string, unknown>>>;
  history: LlmMessage[];
}

export function validateLiveKitConfiguration(input: Record<string, unknown>): LiveKitConfiguration {
  const url = new URL(String(input.url ?? '').trim());
  if (url.protocol !== 'wss:' || url.username || url.password || url.search || url.hash || !['', '/'].includes(url.pathname)) throw new Error('Use your LiveKit project’s wss:// URL without a path or credentials.');
  const apiKey = String(input.apiKey ?? '').trim(), apiSecret = String(input.apiSecret ?? '').trim();
  if (!apiKey || apiKey.length > 256 || apiSecret.length < 20 || apiSecret.length > 4096) throw new Error('Enter your LiveKit API key and API secret.');
  const agentName = String(input.agentName ?? 'gitu-voice').trim();
  if (!/^[\w-]{1,64}$/.test(agentName)) throw new Error('Invalid voice worker name.');
  return { url: url.origin, apiKey, apiSecret, agentName };
}

export function liveKitConfiguration(): LiveKitConfiguration | undefined {
  const saved = loadStoredKeys().GITU_LIVEKIT_CONFIG;
  if (saved) { try { return validateLiveKitConfiguration(JSON.parse(saved)); } catch { return undefined; } }
  if (process.env.LIVEKIT_URL && process.env.LIVEKIT_API_KEY && process.env.LIVEKIT_API_SECRET) {
    try { return validateLiveKitConfiguration({ url: process.env.LIVEKIT_URL, apiKey: process.env.LIVEKIT_API_KEY, apiSecret: process.env.LIVEKIT_API_SECRET, agentName: process.env.GITU_VOICE_AGENT_NAME }); } catch { return undefined; }
  }
  return undefined;
}

export class GituVoiceCalls {
  private readonly calls = new Map<string, VoiceCall>();
  async configure(input: Record<string, unknown>): Promise<void> {
    const config = validateLiveKitConfiguration(input);
    await this.close();
    setStoredKey('GITU_LIVEKIT_CONFIG', JSON.stringify(config));
  }
  status(): { configured: boolean; url?: string; agentName?: string } {
    const config = liveKitConfiguration();
    return config ? { configured: true, url: config.url, agentName: config.agentName } : { configured: false };
  }
  get(id: string): VoiceCall | undefined {
    const call = this.calls.get(id);
    if (call && call.expiresAt > Date.now()) return call;
    if (call) void this.end(id);
    return undefined;
  }
  async start(target: VoiceTarget, name: string): Promise<{ callId: string; url: string; token: string; name: string }> {
    const config = liveKitConfiguration();
    if (!config) throw new Error('Connect your LiveKit Cloud project first.');
    for (const call of this.calls.values()) if (call.expiresAt <= Date.now()) await this.end(call.id);
    if (this.calls.size >= 4) throw new Error('End an existing call before starting another.');
    const id = randomUUID(), room = 'gitu-' + randomBytes(16).toString('hex'), identity = 'user-' + randomUUID();
    const token = new AccessToken(config.apiKey, config.apiSecret, { identity, name: 'You', ttl: '15m' });
    token.addGrant({ roomJoin: true, room, canPublish: true, canPublishData: true, canSubscribe: true, canUpdateOwnMetadata: false });
    const host = config.url.replace(/^wss:/, 'https:');
    const rooms = new RoomServiceClient(host, config.apiKey, config.apiSecret, { requestTimeout: 15 });
    const dispatch = new AgentDispatchClient(host, config.apiKey, config.apiSecret, { requestTimeout: 15 });
    await rooms.createRoom({ name: room, emptyTimeout: 60, maxParticipants: 2 });
    try {
      // Job metadata carries no Gitu credentials, tools, paths or conversation text.
      await dispatch.createDispatch(room, config.agentName, { metadata: JSON.stringify({ participantIdentity: identity, callId: id }) });
      this.calls.set(id, { id, room, identity, target: { ...target }, name, expiresAt: Date.now() + 60 * 60_000, responses: new Map(), history: [] });
      return { callId: id, url: config.url, token: await token.toJwt(), name };
    } catch {
      await rooms.deleteRoom(room).catch(() => undefined);
      throw new Error('Could not start the voice worker. Check your LiveKit credentials and deploy the gitu-voice worker.');
    }
  }
  async end(id: string): Promise<void> {
    const call = this.calls.get(id); this.calls.delete(id);
    const config = liveKitConfiguration();
    if (!call || !config) return;
    await new RoomServiceClient(config.url.replace(/^wss:/, 'https:'), config.apiKey, config.apiSecret, { requestTimeout: 10 }).deleteRoom(call.room).catch(() => undefined);
  }
  async close(): Promise<void> { await Promise.allSettled([...this.calls.keys()].map(id => this.end(id))); }
}

/** One model decision; task execution always goes through Gitu's existing dispatcher. */
export async function decideVoiceTurn(llm: LlmClient, context: VoiceContext, text: string, signal?: AbortSignal): Promise<VoiceDecision> {
  const reply = await llm.complete([
    { role: 'system', content: context.instructions },
    { role: 'system', content: `You are ${context.name} speaking live in your existing chat. Use the same personality and current conversation. Work already in progress continues independently. No direct tool calls on this voice path. Return JSON only: {"kind":"question|task|steer|queue|stop","reply":"brief spoken answer"}. Choose question for conversation, explanations or status; answer from known results without claiming new actions. Choose task only for an explicit request to do new work; steer for a correction to current work; queue only if the user asks to do it later; stop only if the user explicitly asks to stop the task (ending a call or interrupting speech does not stop work). For task/steer/queue, the host will perform the dispatch and generate the acknowledgment, so do not claim completion. Preserve permissions and do not ask for credentials in speech. Current public state:\n${context.state}` },
    ...context.history.slice(-24), { role: 'user', content: text },
  ], { json: true, temperature: 0.3, effort: 'low', outputBudgetTokens: 900, toolChoice: 'none', signal });
  const parsed = extractLastJsonObject(reply) as Record<string, unknown> | undefined;
  const kind = parsed?.kind;
  if (!['question', 'task', 'steer', 'queue', 'stop'].includes(String(kind)) || typeof parsed?.reply !== 'string') return { kind: 'question', reply: 'Could you say that again? I want to make sure I understood.' };
  return { kind: kind as VoiceDecision['kind'], reply: parsed.reply.slice(0, 4000) };
}
