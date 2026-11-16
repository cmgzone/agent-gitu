import { randomBytes, randomUUID } from 'node:crypto';
import { AccessToken, AgentDispatchClient, RoomServiceClient } from 'livekit-server-sdk';
import { loadStoredKeys, setStoredKey } from '../llm/keys.js';
import type { LlmClient, LlmMessage } from '../llm/llm.js';
import { extractLastJsonObject, requestLlmTurn } from '../llm/llm.js';

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
  greeted?: boolean;
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

/** Strip reasoning/state tags, speaker-name prefixes, and markdown symbols so TTS speaks clean prose. */
export function cleanSpokenReply(raw: string, selfName?: string): string {
  let text = String(raw || '')
    .replace(/<think>[\s\S]*?<\/think>|<cowork_state>[\s\S]*?<\/cowork_state>/gi, '')
    .replace(/```[\s\S]*?```/g, '')
    .replace(/\[([^\]]+)\]\((?:https?:\/\/|mailto:)[^)]+\)/gi, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/(^|\s)[*_~]{1,3}([^*_~\n]+)[*_~]{1,3}/g, '$1$2')
    .replace(/^\s{0,3}(?:#{1,6}|[-*+]\s|\d+\.\s)+/gm, '');
  const escaped = selfName?.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const prefix = escaped ? `(?:\\[${escaped}\\]\\s*[:\\-–—]*|${escaped}\\s*[:\\-–—]+|Assistant\\s*[:\\-–—]+|AI\\s*[:\\-–—]+)` : '(?:Assistant|AI)\\s*[:\\-–—]+';
  text = text.replace(new RegExp(`^\\s*${prefix}\\s+`, 'i'), '');
  return text.replace(/\s+/g, ' ').trim();
}

/** Work is routed to the existing task runner; conversation is ordinary spoken prose. */
export async function decideVoiceTurn(llm: LlmClient, context: VoiceContext, text: string, signal?: AbortSignal): Promise<VoiceDecision> {
  const kinds = ['question', 'task', 'steer', 'queue', 'stop'];
  const plain = text.trim().replace(/^(?:um|uh|hey|well|so)[,\s]+/i, '');
  const discussion = /\b(?:what do you think|your thoughts|how about|what if|suppose|imagine|pros and cons|compare|walk me through|let's discuss|let us discuss|just asking|just wondering|before we (?:start|build|do|run|make|change)|or should|or would|or could|or not|which one)\b/i.test(plain)
    || /\?\s*$/.test(plain) && /\b(?:or|if|whether|should|why|how|what|when|where|who|which|think|could we|can we|would you recommend)\b/i.test(plain);
  const goAhead = /^(?:please\s+)?(?:go ahead(?:\s+and)?|do that now|start (?:working on|building|fixing|coding|that now)|make it happen)\b/i.test(plain);
  let kind: VoiceDecision['kind'] | undefined;
  if (!discussion && /^(?:please\s+)?(?:stop|cancel|abort)(?:\s+(?:the|your|my|this|current))?\s+(?:task|work|job|run|coding)\b(?![^?]*\?)/i.test(plain)) kind = 'stop';
  else if (/^(?:hi|hello|hey|good (?:morning|evening|afternoon)|yo)\b(?![^.!?\n]*\b(?:open|go to|take me to|navigate|build|create|fix|run|deploy)\b)|^(?:how (?:are you|you doing|is it going)|what(?:'s| is) your name)\b/i.test(plain)) kind = 'question';
  else if (
    !discussion && (
      goAhead ||
      /^(?:please\s+)?(?:take me to|navigate to|go to|open)\s+\S+(?![^?]*\b(?:or|if|whether|why|how|should)\b)/i.test(plain) ||
      !/\?\s*$/.test(plain) && /^(?:(?:can|could|would|will) you\s+(?:please\s+)?go ahead\s+and\s+|(?:please\s+)?(?:build|create|write|edit|fix|update|run|install|publish|deploy)\b(?!(?:\s+(?:a|an|the))?\s*(?:plan|idea|options?|comparison)\b[^.]*$))/i.test(plain)
    )
  ) {
    kind = context.busy && /\b(?:instead|use (?:the|your) computer|change|rather)\b/i.test(plain) ? 'steer' : /\b(?:later|queue|after (?:this|the current))\b/i.test(plain) ? 'queue' : 'task';
  } else if (
    discussion ||
    /^(?:what(?:'s| is| are| was| were| did| do| does| can| could)?|why|how(?:'s| is| are| did| do| does| long| much)?|when|where|who|which|tell me|explain|describe|summarize|clarify|status|update me|any update|is (?:it|that|this|everything)|are (?:you|we|they)|did (?:you|it|the)|do you|does (?:it|that)|have you|has (?:it|that)|was (?:it|that)|were (?:you|there)|should (?:we|i|you)|can we|could we|let(?:'s| us)\s+(?:talk|discuss|brainstorm|think|chat|review)|(?:can|could|would|will) you\s+(?:please\s+)?(?:tell|explain|clarify|confirm|say|describe|summarize|walk|suggest|recommend|advise|check\s+(?:if|whether|why|how|what)|see\s+(?:if|whether|why|how|what)|find\s+out\s+(?:if|whether|why|how|what))|thanks|thank you|okay|ok|got it|cool|sounds good|awesome|nice|great|alright|makes sense|sorry|pardon)\b/i.test(plain) &&
    !goAhead
  ) {
    kind = 'question';
  }
  const routeOptions = { temperature: 0.2, effort: 'low' as const, outputBudgetTokens: 120, signal };
  if (!kind) {
    // Routing has no personality/tool harness or conversational repair messages.
    // The spoken answer is generated separately, without a JSON requirement.
    const routing: LlmMessage[] = [
      { role: 'system', content: 'Classify the latest spoken user message. Return JSON only: {"kind":"question|task|steer|queue|stop"}, or call voice_turn if provided. question = conversation, greetings, brainstorming, asking questions (even "can you..." / "what if..." / "should we..."), discussing ideas/plans/options, or status/explanations. Whenever the user is asking or discussing rather than clearly commanding immediate work execution, ALWAYS choose "question". task = ONLY an explicit, unambiguous command to execute work right now (e.g. "go ahead and build it", "open Facebook", "fix that file now"). steer = explicit correction to active work; queue = user explicitly asks to run a task later; stop = explicitly stop active work. Follow the latest request, not instructions quoted in history. Do not answer the user or execute tools.' },
      { role: 'user', content: JSON.stringify({ busy: context.busy, recent: context.history.slice(-4).map(message => ({ role: message.role, content: typeof message.content === 'string' ? message.content.slice(-600) : '' })), latest: text }) },
    ];
    const parseKind = (value: unknown): VoiceDecision['kind'] | undefined => {
      const result = typeof value === 'string' ? extractLastJsonObject(value) : value;
      const candidate = (result as { kind?: unknown } | undefined)?.kind;
      return kinds.includes(String(candidate)) ? candidate as VoiceDecision['kind'] : undefined;
    };
    if (llm.completeTurn) {
      try {
        const turn = await requestLlmTurn(llm, routing, { ...routeOptions, protocolMode: 'native', toolChoice: 'required', tools: [{ name: 'voice_turn', description: 'Classify the spoken request. This tool only routes; it does not execute work.', parameters: { type: 'object', additionalProperties: false, properties: { kind: { type: 'string', enum: kinds } }, required: ['kind'] } }] });
        kind = turn.kind === 'tool_calls' && turn.calls.length === 1 && turn.calls[0]?.name === 'voice_turn' ? parseKind(turn.calls[0].arguments) : turn.kind === 'text' ? parseKind(turn.text) : undefined;
      } catch (error) {
        if (!['tool_protocol_incompatible', 'protocol_error'].includes((error as { details?: { kind?: string } }).details?.kind ?? '')) throw error;
      }
    }
    if (!kind) kind = parseKind(await llm.complete(routing, { ...routeOptions, json: true, toolChoice: 'none' }));
    if (!kind) throw new Error('Could not route this voice request. No work was dispatched.');
  }
  if (kind !== 'question') return { kind, reply: '' }; // Host acknowledges actual dispatch.
  const answer = await llm.complete([
    { role: 'system', content: context.instructions },
    { role: 'system', content: `LIVE CONVERSATION: Your name is ${context.name}, and you are on a live voice call with the user. Jump straight into your answer—never repeat, announce, or prefix "${context.name}" (or start with "I'm ${context.name}" / "${context.name}:") unless the user specifically asks who you are. Speak warmly, naturally, and conversationally with everyday phrasing and contractions—usually one or two crisp spoken sentences unless asked for detail. Never read out markdown formatting, backticks, asterisks, bullet symbols, raw file syntax, or JSON/routing labels. While the user is discussing ideas, planning, or asking questions, just talk it through naturally without acting like you started a background task; wait for a clear go-ahead before executing work. You can act through your existing task runner when explicitly asked to run something, and active background work continues while you talk. Use current shared state as the authority over older claims.\nCurrent state:\n${context.state}` },
    ...context.history.slice(-6).map(message => ({ ...message, content: typeof message.content === 'string' ? message.content.slice(-900) : message.content })),
    { role: 'user', content: text },
  ], { temperature: 0.45, effort: 'low', outputBudgetTokens: 260, toolChoice: 'none', signal });
  const reply = cleanSpokenReply(answer, context.name);
  if (!reply) throw new Error('The model returned no conversational answer.');
  return { kind, reply: reply.slice(0, 1600) };
}