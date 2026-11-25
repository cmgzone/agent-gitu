import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { AccessToken, AgentDispatchClient, RoomServiceClient } from 'livekit-server-sdk';
import { loadStoredKeys, setStoredKey } from '../llm/keys.js';
import type { LlmClient, LlmMessage } from '../llm/llm.js';
import { extractLastJsonObject, requestLlmTurn } from '../llm/llm.js';

export const DEFAULT_PIKPAM_VOICE_BASE_URL = 'https://pikpam.com/api/voice';

export interface VoiceTarget {
  kind: 'main' | 'cowork'; runId?: string; conversationId?: string; threadId?: string;
  agentId?: string; provider?: string; model?: string; projectPath?: string;
}
export interface VoiceContext { name: string; instructions: string; state: string; history: LlmMessage[]; busy: boolean; }
export interface VoiceDecision { kind: 'question' | 'task' | 'steer' | 'queue' | 'stop'; reply: string; }
export interface LiveKitConfiguration { url: string; apiKey: string; apiSecret: string; agentName: string; }
export interface PikpamVoiceStatus {
  available: boolean;
  wsUrl: string;
  defaultAgentName?: string;
  pricing?: {
    participantUsdPerMin?: number;
    agentUsdPerMin?: number;
    participantCreditsPerMin?: number;
    agentCreditsPerMin?: number;
    creditsPerUsd?: number;
  };
  wallet?: {
    spendableCredits?: number;
    eligible?: boolean;
  };
}
export interface VoiceConfigSummary {
  configured: boolean;
  mode?: 'byok' | 'pikpam' | 'none';
  url?: string;
  agentName?: string;
  pikpamConnected?: boolean;
  pikpamAvailable?: boolean;
  wallet?: PikpamVoiceStatus['wallet'];
  pricing?: PikpamVoiceStatus['pricing'];
}
export interface VoiceCall {
  id: string; room: string; identity: string; target: VoiceTarget; name: string; expiresAt: number;
  mode: 'byok' | 'pikpam';
  pikpamToken?: string;
  responses: Map<string, Promise<Record<string, unknown>>>;
  history: LlmMessage[];
  greeted?: boolean;
}

export class VoiceProviderError extends Error {
  constructor(
    message: string,
    readonly statusCode: number = 502,
    readonly code: string = 'VOICE_ERROR',
  ) {
    super(message);
    this.name = 'VoiceProviderError';
  }
}

export function resolvePikpamVoiceToken(overrideToken?: string): string | undefined {
  const direct = overrideToken?.trim();
  if (direct) return direct;
  const stored = loadStoredKeys();
  const fromStored = (stored.PIKROUTER_API_KEY || stored.HERMES_PIKROUTER_API_KEY || stored.PIKROUTER_TOKEN || '').trim();
  if (fromStored) return fromStored;
  const fromEnv = (process.env.PIKROUTER_API_KEY || process.env.HERMES_PIKROUTER_API_KEY || process.env.PIKROUTER_TOKEN || '').trim();
  return fromEnv || undefined;
}

export function pikpamVoiceBaseUrl(): string {
  const explicitTokenUrl = (process.env.PIKPAM_VOICE_TOKEN_URL || '').trim();
  if (explicitTokenUrl) return explicitTokenUrl.replace(/\/token\/?$/, '').replace(/\/+$/, '');
  const explicitRoomsUrl = (process.env.PIKPAM_VOICE_ROOMS_URL || '').trim();
  if (explicitRoomsUrl) return explicitRoomsUrl.replace(/\/rooms\/?$/, '').replace(/\/+$/, '');
  const routerBase = (process.env.PIKROUTER_BASE_URL || '').trim();
  if (routerBase) return `${routerBase.replace(/\/+$/, '')}/voice`;
  return DEFAULT_PIKPAM_VOICE_BASE_URL;
}

async function fetchPikpamVoiceJson<T>(
  endpoint: string,
  token: string,
  init: { method?: string; body?: unknown; timeoutMs?: number } = {},
  fetcher: typeof fetch = fetch,
): Promise<T> {
  const response = await fetcher(endpoint, {
    method: init.method ?? 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
    signal: AbortSignal.timeout(init.timeoutMs ?? 15_000),
  });
  const text = await response.text();
  let parsed: Record<string, unknown> = {};
  try {
    parsed = text ? JSON.parse(text) as Record<string, unknown> : {};
  } catch {
    // non-JSON body
  }
  if (!response.ok) {
    const rawMsg = typeof parsed.error === 'string' && parsed.error.trim()
      ? parsed.error.trim()
      : typeof parsed.message === 'string' && parsed.message.trim()
        ? parsed.message.trim()
        : `Pikpam voice request failed (HTTP ${response.status}).`;
    const code = typeof parsed.code === 'string' && parsed.code.trim()
      ? parsed.code.trim()
      : response.status === 402
        ? 'INSUFFICIENT_CREDITS'
        : response.status === 401
          ? 'PIKPAM_AUTH_REQUIRED'
          : `HTTP_${response.status}`;
    throw new VoiceProviderError(rawMsg, response.status, code);
  }
  return parsed as T;
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
  private pikpamStatusCache?: { key: string; fetchedAt: number; data: PikpamVoiceStatus };

  constructor(private readonly fetcher: typeof fetch = fetch) {}

  async configure(input: Record<string, unknown>): Promise<void> {
    const config = validateLiveKitConfiguration(input);
    await this.close();
    setStoredKey('GITU_LIVEKIT_CONFIG', JSON.stringify(config));
  }
  status(overridePikpamToken?: string): VoiceConfigSummary {
    const config = liveKitConfiguration();
    if (config) return { configured: true, mode: 'byok', url: config.url, agentName: config.agentName };
    const pikpamToken = resolvePikpamVoiceToken(overridePikpamToken);
    if (pikpamToken) {
      const agentName = (process.env.GITU_VOICE_AGENT_NAME || process.env.PIKPAM_VOICE_DEFAULT_AGENT || 'gitu-voice').trim();
      return {
        configured: true,
        mode: 'pikpam',
        url: (process.env.PIKPAM_VOICE_WS_URL || '').trim() || undefined,
        agentName,
        pikpamConnected: true,
      };
    }
    return { configured: false, mode: 'none', pikpamConnected: false };
  }
  async resolveStatus(overridePikpamToken?: string): Promise<VoiceConfigSummary> {
    const config = liveKitConfiguration();
    if (config) return { configured: true, mode: 'byok', url: config.url, agentName: config.agentName };
    const token = resolvePikpamVoiceToken(overridePikpamToken);
    if (!token) return { configured: false, mode: 'none', pikpamConnected: false };

    const status = await this.getPikpamStatus(token);
    const agentName = (
      process.env.GITU_VOICE_AGENT_NAME ||
      process.env.PIKPAM_VOICE_DEFAULT_AGENT ||
      status?.defaultAgentName ||
      'gitu-voice'
    ).trim();

    if (status?.available) {
      return {
        configured: true,
        mode: 'pikpam',
        url: status.wsUrl || undefined,
        agentName,
        pikpamConnected: true,
        pikpamAvailable: true,
        wallet: status.wallet,
        pricing: status.pricing,
      };
    }
    if (status && !status.available) {
      return {
        configured: false,
        mode: 'pikpam',
        agentName,
        pikpamConnected: true,
        pikpamAvailable: false,
        wallet: status.wallet,
        pricing: status.pricing,
      };
    }
    // If Pikpam status endpoint is temporarily unreachable, still report Pikpam configured
    // so calls can attempt token minting and surface an actionable error if needed.
    return {
      configured: true,
      mode: 'pikpam',
      url: (process.env.PIKPAM_VOICE_WS_URL || '').trim() || undefined,
      agentName,
      pikpamConnected: true,
    };
  }
  private async getPikpamStatus(token: string): Promise<PikpamVoiceStatus | undefined> {
    const cacheKey = createHash('sha256').update(token).digest('hex').slice(0, 16);
    if (this.pikpamStatusCache && this.pikpamStatusCache.key === cacheKey && Date.now() - this.pikpamStatusCache.fetchedAt < 15_000) {
      return this.pikpamStatusCache.data;
    }
    try {
      const data = await fetchPikpamVoiceJson<PikpamVoiceStatus>(
        `${pikpamVoiceBaseUrl()}/status`,
        token,
        { method: 'GET', timeoutMs: 8_000 },
        this.fetcher,
      );
      this.pikpamStatusCache = { key: cacheKey, fetchedAt: Date.now(), data };
      return data;
    } catch {
      return undefined;
    }
  }
  get(id: string): VoiceCall | undefined {
    const call = this.calls.get(id);
    if (call && call.expiresAt > Date.now()) return call;
    if (call) void this.end(id);
    return undefined;
  }
  async start(
    target: VoiceTarget,
    name: string,
    opts?: { pikpamToken?: string },
  ): Promise<{ callId: string; url: string; token: string; name: string; mode?: 'byok' | 'pikpam' }> {
    for (const call of this.calls.values()) if (call.expiresAt <= Date.now()) await this.end(call.id);
    if (this.calls.size >= 4) throw new VoiceProviderError('End an existing call before starting another.', 429, 'TOO_MANY_CALLS');

    const config = liveKitConfiguration();
    if (config) {
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
        this.calls.set(id, { id, room, identity, mode: 'byok', target: { ...target }, name, expiresAt: Date.now() + 60 * 60_000, responses: new Map(), history: [] });
        return { callId: id, url: config.url, token: await token.toJwt(), name, mode: 'byok' };
      } catch {
        await rooms.deleteRoom(room).catch(() => undefined);
        throw new VoiceProviderError('Could not start the voice worker. Check your LiveKit credentials and deploy the gitu-voice worker.', 502, 'WORKER_DISPATCH_FAILED');
      }
    }

    const pikpamToken = resolvePikpamVoiceToken(opts?.pikpamToken);
    if (!pikpamToken) {
      throw new VoiceProviderError('Sign in with Pikpam for instant voice calling, or connect your own LiveKit Cloud project.', 400, 'VOICE_NOT_CONFIGURED');
    }

    const cachedStatus = await this.getPikpamStatus(pikpamToken);
    const id = randomUUID();
    const roomSlug = 'gitu-' + randomBytes(12).toString('hex');
    const identity = 'user-' + randomUUID();
    const agentName = (
      process.env.GITU_VOICE_AGENT_NAME ||
      process.env.PIKPAM_VOICE_DEFAULT_AGENT ||
      cachedStatus?.defaultAgentName ||
      'gitu-voice'
    ).trim();

    // Job metadata carries no Gitu credentials, tools, paths, or conversation text.
    const agentMetadata = JSON.stringify({ participantIdentity: identity, callId: id });
    const minted = await fetchPikpamVoiceJson<{
      token?: string;
      wsUrl?: string;
      roomName?: string;
      livekitRoomName?: string;
      identity?: string;
    }>(
      `${pikpamVoiceBaseUrl()}/token`,
      pikpamToken,
      {
        method: 'POST',
        body: {
          roomName: roomSlug,
          identity,
          participantName: 'You',
          agentName,
          agentMetadata,
          canPublish: true,
          canSubscribe: true,
          canPublishData: true,
          ttlMinutes: 15,
        },
        timeoutMs: 15_000,
      },
      this.fetcher,
    );

    if (!minted.token || !minted.wsUrl) {
      throw new VoiceProviderError('Pikpam voice service did not return a LiveKit room token.', 502, 'PIKPAM_TOKEN_INVALID');
    }

    const trackedRoom = minted.livekitRoomName || minted.roomName || roomSlug;
    this.calls.set(id, {
      id,
      room: trackedRoom,
      identity: minted.identity || identity,
      mode: 'pikpam',
      pikpamToken,
      target: { ...target },
      name,
      expiresAt: Date.now() + 60 * 60_000,
      responses: new Map(),
      history: [],
    });

    return {
      callId: id,
      url: minted.wsUrl,
      token: minted.token,
      name,
      mode: 'pikpam',
    };
  }
  async end(id: string): Promise<void> {
    const call = this.calls.get(id); this.calls.delete(id);
    if (!call) return;
    if (call.mode === 'pikpam') {
      const token = call.pikpamToken || resolvePikpamVoiceToken();
      if (!token) return;
      await fetchPikpamVoiceJson(
        `${pikpamVoiceBaseUrl()}/rooms/${encodeURIComponent(call.room)}`,
        token,
        { method: 'DELETE', timeoutMs: 10_000 },
        this.fetcher,
      ).catch(() => undefined);
      return;
    }
    const config = liveKitConfiguration();
    if (!config) return;
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