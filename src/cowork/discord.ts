/**
 * Discord channel for Cowork — the second messaging surface, proving the
 * channel abstraction beyond Telegram.
 *
 * Transport: Discord bots receive messages over its Gateway WebSocket (there is
 * no long-poll API), so this module owns a minimal gateway client: HELLO →
 * heartbeat → IDENTIFY → MESSAGE_CREATE. Outbound uses the REST API. Both the
 * WebSocket constructor and fetch are injectable so tests run without a network.
 */
import type { CoworkRequest } from './store.js';

export const DISCORD_MESSAGE_LIMIT = 2_000;

export class DiscordError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'DiscordError';
  }
}

export interface DiscordFetchResponse {
  ok: boolean;
  status: number;
  text(): Promise<string>;
}

export type DiscordFetch = (url: string, init?: { method?: string; headers?: Record<string, string>; body?: string }) => Promise<DiscordFetchResponse>;

/** Discord caps messages at 2000 characters; split on line/word boundaries. */
export function discordChunks(text: string, limit = DISCORD_MESSAGE_LIMIT): string[] {
  const clean = text.replace(/\r\n/g, '\n');
  if (clean.length <= limit) return [clean];
  const chunks: string[] = [];
  let rest = clean;
  while (rest.length > limit) {
    const window = rest.slice(0, limit);
    const at = Math.max(window.lastIndexOf('\n'), window.lastIndexOf(' '));
    const cut = at > limit * 0.5 ? at : limit;
    chunks.push(rest.slice(0, cut).trimEnd());
    rest = rest.slice(cut).replace(/^\n/, '');
  }
  if (rest.trim()) chunks.push(rest.trimEnd());
  return chunks;
}

/** Strip HTML that Discord must never receive (the Telegram helpers emit it). */
export function cleanDiscordText(text: string, fallback = 'Working...'): string {
  const plain = text
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/?(?:b|i|u|s|code|pre)>/gi, '')
    .replace(/<[^>]+>/g, '')
    .trim();
  return plain || fallback;
}

async function discordRequest(fetchImpl: DiscordFetch | undefined, token: string, apiPath: string, init?: { method?: string; body?: unknown }): Promise<unknown> {
  const doFetch: DiscordFetch = fetchImpl ?? ((url, opts) => fetch(url, opts) as unknown as Promise<DiscordFetchResponse>);
  const response = await doFetch(`https://discord.com/api/v10${apiPath}`, {
    method: init?.method ?? 'GET',
    headers: {
      authorization: `Bot ${token}`,
      'content-type': 'application/json',
      // Discord requires a user agent for bot REST calls.
      'user-agent': 'AgentGitu (https://github.com/cmgzone/agent-gitu, 0.3.2)',
    },
    ...(init?.body === undefined ? {} : { body: JSON.stringify(init.body) }),
  });
  const text = await response.text();
  if (!response.ok) throw new DiscordError(`Discord ${init?.method ?? 'GET'} ${apiPath} failed (HTTP ${response.status}): ${text.slice(0, 300)}`, response.status);
  if (!text) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

/** Send a (chunked, HTML-stripped) message to a channel. */
export async function sendDiscordMessage(fetchImpl: DiscordFetch | undefined, token: string, channelId: string, content: string): Promise<void> {
  for (const chunk of discordChunks(cleanDiscordText(content))) {
    await discordRequest(fetchImpl, token, `/channels/${channelId}/messages`, { method: 'POST', body: { content: chunk } });
  }
}

/** Recent guilds the bot is a member of — used by the pairing UI. */
export async function recentDiscordGuilds(fetchImpl: DiscordFetch | undefined, token: string): Promise<{ id: string; name: string }[]> {
  const result = await discordRequest(fetchImpl, token, '/users/@me/guilds');
  const guilds = (Array.isArray(result) ? result : []) as unknown as { id?: string; name?: string }[];
  return guilds.filter((g) => g.id && g.name).slice(0, 100).map((g) => ({ id: String(g.id), name: String(g.name) }));
}

/** Text channels in a guild — used by the pairing UI once a server is picked. */
export async function recentDiscordChannels(fetchImpl: DiscordFetch | undefined, token: string, guildId: string): Promise<{ id: string; name: string }[]> {
  const result = await discordRequest(fetchImpl, token, `/guilds/${guildId}/channels`);
  const channels = (Array.isArray(result) ? result : []) as unknown as { id?: string; name?: string; type?: number }[];
  return channels.filter((c) => c.id && c.name && c.type === 0).slice(0, 100).map((c) => ({ id: String(c.id), name: String(c.name) }));
}

/** Gateway frame shapes we consume. */
export interface DiscordGatewayFrame {
  op: number;
  t?: string;
  s?: number;
  d?: Record<string, unknown>;
}

export interface DiscordWebSocketLike {
  send(data: string): void;
  close(): void;
  onopen?: (() => void) | null;
  onmessage?: ((event: { data: string }) => void) | null;
  onclose?: ((event?: unknown) => void) | null;
  onerror?: ((event?: unknown) => void) | null;
}

export type DiscordWebSocketFactory = (url: string) => DiscordWebSocketLike;

export interface DiscordGatewayOptions {
  token: string;
  /** Only messages in this channel are delivered. */
  channelId: string;
  /** Injectable transport (defaults to the global WebSocket). */
  webSocketFactory?: DiscordWebSocketFactory;
  /** Message text after mention stripping; author display name; message id. */
  onMessage: (authorName: string, text: string, messageId: string) => void | Promise<void>;
  onError?: (message: string) => void;
  gatewayUrl?: string;
}

/**
 * One gateway connection per bot token. Reconnects with a bounded backoff and
 * never throws out of a socket callback (an uncaught error there would kill the
 * server process).
 */
export class DiscordGateway {
  private socket?: DiscordWebSocketLike;
  private heartbeat?: ReturnType<typeof setInterval>;
  private stopped = false;
  private botId?: string;
  private attempts = 0;
  private lastSeq: number | null = null;

  constructor(private readonly options: DiscordGatewayOptions) {}

  start(): void {
    this.stopped = false;
    this.connect();
  }

  stop(): void {
    this.stopped = true;
    if (this.heartbeat) clearInterval(this.heartbeat);
    this.heartbeat = undefined;
    try {
      this.socket?.close();
    } catch {
      /* already closed */
    }
    this.socket = undefined;
  }

  private fail(message: string): void {
    this.options.onError?.(message);
  }

  private connect(): void {
    if (this.stopped) return;
    const factory = this.options.webSocketFactory ?? ((url: string) => new WebSocket(url) as unknown as DiscordWebSocketLike);
    let socket: DiscordWebSocketLike;
    try {
      socket = factory(this.options.gatewayUrl ?? 'wss://gateway.discord.gg/?v=10&encoding=json');
    } catch (err) {
      this.fail(`gateway connect failed: ${(err as Error).message}`);
      this.scheduleReconnect();
      return;
    }
    this.socket = socket;
    socket.onopen = () => {
      this.attempts = 0;
    };
    socket.onmessage = (event) => {
      try {
        this.handleFrame(JSON.parse(String(event.data)) as DiscordGatewayFrame);
      } catch (err) {
        this.fail(`bad gateway frame: ${(err as Error).message}`);
      }
    };
    socket.onclose = () => {
      if (this.heartbeat) clearInterval(this.heartbeat);
      this.heartbeat = undefined;
      this.scheduleReconnect();
    };
    socket.onerror = () => this.fail('gateway socket error');
  }

  private scheduleReconnect(): void {
    if (this.stopped) return;
    this.attempts += 1;
    const delay = Math.min(30_000, 1_000 * 2 ** Math.min(this.attempts, 5));
    setTimeout(() => this.connect(), delay).unref?.();
  }

  private send(payload: Record<string, unknown>): void {
    try {
      this.socket?.send(JSON.stringify(payload));
    } catch (err) {
      this.fail(`gateway send failed: ${(err as Error).message}`);
    }
  }

  /** Exposed for tests: process one gateway frame. */
  handleFrame(frame: DiscordGatewayFrame): void {
    if (frame.s !== undefined && frame.s !== null) this.lastSeq = frame.s;
    if (frame.op === 10) {
      // HELLO: start heartbeating, then identify.
      const interval = Number((frame.d as { heartbeat_interval?: number } | undefined)?.heartbeat_interval ?? 45_000);
      if (this.heartbeat) clearInterval(this.heartbeat);
      this.heartbeat = setInterval(() => this.send({ op: 1, d: this.lastSeq }), Math.max(5_000, interval));
      this.heartbeat.unref?.();
      this.send({
        op: 2,
        d: {
          token: this.options.token,
          intents: (1 << 9) | (1 << 12), // GUILD_MESSAGES | DIRECT_MESSAGES
          properties: { os: process.platform, browser: 'agent-gitu', device: 'agent-gitu' },
        },
      });
      return;
    }
    if (frame.op === 7) {
      // RECONNECT requested.
      this.socket?.close();
      return;
    }
    if (frame.t === 'READY') {
      this.botId = (frame.d as { user?: { id?: string } } | undefined)?.user?.id;
      return;
    }
    if (frame.t !== 'MESSAGE_CREATE') return;
    const data = frame.d as
      | { id?: string; channel_id?: string; content?: string; author?: { id?: string; username?: string; global_name?: string; bot?: boolean } }
      | undefined;
    if (!data) return;
    if (data.channel_id !== this.options.channelId) return;
    if (data.author?.bot || (this.botId && data.author?.id === this.botId)) return;
    const text = (data.content ?? '').replace(/<@!?\d+>/g, '').trim();
    if (!text) return;
    const author = data.author?.global_name || data.author?.username || 'discord';
    void Promise.resolve(this.options.onMessage(author, text, data.id ?? '')).catch((err: Error) => this.fail(`handler failed: ${err.message}`));
  }
}

/** Discord request card: the text the paired channel receives. Resolution is
 *  text-first (buttons are a Discord App registration step we do not do), so
 *  the card always explains the keyword to reply with. */
export function discordRequestText(request: CoworkRequest, agentName?: string): string {
  const lines = [discordRequestLabel(request)];
  if (agentName) lines.push(`From: ${agentName}`);
  lines.push(request.title || 'Untitled request');
  if (request.detail && request.detail !== request.title) lines.push(request.detail);
  if (request.options.length > 0) {
    lines.push('', 'Options:');
    request.options.forEach((option, index) => lines.push(`${index + 1}. ${option}`));
  }
  if (request.kind === 'permission') lines.push('', 'Reply approve or deny.');
  else if (request.kind === 'recommendation') lines.push('', 'Reply accept or dismiss.');
  else lines.push('', request.options.length > 0 ? 'Reply with the option number, or type your answer.' : 'Reply with your answer.');
  return lines.join('\n');
}

/** Post a request card to the paired channel. */
export async function sendDiscordRequestCard(fetchImpl: DiscordFetch | undefined, token: string, channelId: string, request: CoworkRequest, agentName?: string): Promise<void> {
  await sendDiscordMessage(fetchImpl, token, channelId, discordRequestText(request, agentName));
}

/**
 * Resolve a request from a plain Discord reply, mirroring the Telegram
 * request-keyword handler. Returns a user-visible note, or undefined when the
 * reply is not about a request (the message should then be treated as chat).
 * Resolution happens via the caller's resolver so it stays channel-agnostic.
 */
export function parseDiscordRequestReply(
  text: string,
  openRequests: CoworkRequest[],
  resolve: (requestId: string, action: string, response?: string) => { ok: boolean; answer?: string; error?: string },
): string | undefined {
  const trimmed = text.trim().toLowerCase();
  const actionable = openRequests.filter((r) => r.kind !== 'question');
  if (trimmed === 'approve' || trimmed === 'deny' || trimmed === 'accept' || trimmed === 'dismiss') {
    const action = trimmed === 'deny' || trimmed === 'dismiss' ? trimmed : trimmed;
    const candidate = actionable.find((r) => (r.kind === 'permission' && (action === 'approve' || action === 'deny')) || (r.kind === 'recommendation' && (action === 'accept' || action === 'dismiss')));
    if (!candidate) return `No open ${action === 'approve' || action === 'deny' ? 'approval' : 'recommendation'} request in this chat.`;
    const result = resolve(candidate.id, action);
    return result.ok ? `Recorded: ${result.answer ?? action}.` : result.error ?? 'Could not record that response.';
  }
  // Question answers: an option number or free text against the newest open question.
  const question = openRequests.filter((r) => r.kind === 'question').at(-1);
  if (question) {
    const asNumber = Number(trimmed);
    const response = Number.isInteger(asNumber) && asNumber >= 1 && asNumber <= question.options.length ? question.options[asNumber - 1]! : text.trim();
    const result = resolve(question.id, 'answer', response);
    return result.ok ? `Recorded: ${result.answer ?? 'answer'}.` : result.error ?? 'Could not record that answer.';
  }
  return undefined;
}

function discordRequestLabel(request: CoworkRequest): string {
  if (request.kind === 'permission') return '**Approval needed**';
  if (request.kind === 'recommendation') return '**Recommendation**';
  return '**Question**';
}