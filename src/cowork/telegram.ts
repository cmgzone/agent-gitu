import { excerpt } from '../util.js';

/**
 * Telegram message gateway for cowork conversations. One long-polling bot per
 * connected conversation: inbound group messages become user messages in the
 * cowork chat, and agent replies are mirrored back to the Telegram chat.
 * fetch is injectable so tests can script the API without network.
 */

export type TelegramFetch = (
  url: string,
  init?: { method?: string; headers?: Record<string, string>; body?: string; signal?: AbortSignal },
) => Promise<{ ok: boolean; status: number; text: () => Promise<string> }>;

const API_BASE = 'https://api.telegram.org';
const POLL_TIMEOUT_S = 25;

export function escapeTelegramHtml(text: string): string {
  return String(text ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export interface TelegramUpdate {
  update_id: number;
  message?: {
    message_id: number;
    date: number;
    chat?: { id?: number | string; title?: string; type?: string };
    from?: { first_name?: string; username?: string; is_bot?: boolean };
    text?: string;
  };
}

export class TelegramError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    readonly retryAfter?: number,
  ) {
    super(message);
  }
}

async function callTelegram(
  fetchImpl: TelegramFetch | undefined,
  token: string,
  method: string,
  params?: Record<string, unknown>,
  signal?: AbortSignal,
): Promise<Record<string, unknown>> {
  const doFetch = fetchImpl ?? defaultFetch;
  if (!/^\d{5,}:[\w-]{20,}$/.test(token.trim())) throw new TelegramError('That does not look like a Telegram bot token (expected "123456:ABC-..."). Get one from @BotFather.');
  let res: { ok: boolean; status: number; text: () => Promise<string> };
  try {
    res = await doFetch(`${API_BASE}/bot${token.trim()}/${method}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(params ?? {}),
      signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(40_000)]) : AbortSignal.timeout(40_000),
    });
  } catch (err) {
    throw new TelegramError(`Telegram API unreachable: ${(err as Error).message.replaceAll(token.trim(), '[redacted]')}`);
  }
  const bodyText = await res.text();
  let parsed: { ok?: boolean; description?: string; result?: unknown; parameters?: { retry_after?: number } } = {};
  try {
    parsed = JSON.parse(bodyText) as typeof parsed;
  } catch {
    /* non-JSON error page */
  }
  if (!res.ok || parsed.ok !== true) {
    throw new TelegramError(
      `Telegram ${method} failed (HTTP ${res.status}): ${(parsed.description ?? excerpt(bodyText, 200)).replaceAll(token.trim(), '[redacted]')}`,
      res.status,
      parsed.parameters?.retry_after,
    );
  }
  return (parsed.result ?? {}) as Record<string, unknown>;
}

/** Production fetch bound to the shape the module expects; tests inject their own. */
const defaultFetch: TelegramFetch = (url, init) => fetch(url, init as RequestInit) as unknown as Promise<{ ok: boolean; status: number; text: () => Promise<string> }>;

export interface TelegramChatInfo {
  id: string;
  title: string;
}

/** Recent chats that messaged the bot — used by the pairing UI. */
export async function recentTelegramChats(fetchImpl: TelegramFetch | undefined, token: string): Promise<TelegramChatInfo[]> {
  const result = await callTelegram(fetchImpl, token, 'getUpdates', { limit: 100, timeout: 0 });
  const updates = (Array.isArray(result) ? result : []) as unknown as TelegramUpdate[];
  const chats = new Map<string, string>();
  for (const update of updates) {
    const chat = update.message?.chat;
    if (chat?.id === undefined) continue;
    const id = String(chat.id);
    const title = chat.title || update.message?.from?.first_name || update.message?.from?.username || id;
    if (!chats.has(id)) chats.set(id, title);
  }
  return [...chats.entries()].map(([id, title]) => ({ id, title }));
}

export function telegramChunks(text: string): string[] {
  const chunks: string[] = [];
  let rest = text;
  while (rest.length > 0) {
    if (rest.length <= 3_800) {
      chunks.push(rest);
      break;
    }
    let cut = 3_800;
    if (/[\uD800-\uDBFF]/.test(rest[cut - 1]!)) cut -= 1;
    chunks.push(rest.slice(0, cut));
    rest = rest.slice(cut);
  }
  return chunks;
}

async function delivery(fetchImpl: TelegramFetch | undefined, token: string, method: string, params: Record<string, unknown>): Promise<Record<string, unknown>> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await callTelegram(fetchImpl, token, method, params);
    } catch (err) {
      if (err instanceof TelegramError && /message is not modified/i.test(err.message)) return {};
      if (!(err instanceof TelegramError) || err.status !== 429 || attempt >= 2) throw err;
      await new Promise((resolve) => setTimeout(resolve, Math.min(60, Math.max(1, err.retryAfter ?? 1)) * 1000));
    }
  }
}

export async function sendTelegramMessage(fetchImpl: TelegramFetch | undefined, token: string, chatId: string, text: string): Promise<void> {
  const chunks = telegramChunks(text);
  for (const chunk of chunks) {
    await delivery(fetchImpl, token, 'sendMessage', {
      chat_id: chatId,
      text: chunk,
      disable_web_page_preview: true,
    });
  }
}

/** One editable reply per agent turn. Coalesces deltas, serializes edits and
 * drains final chunks before the next teammate starts. All text is plain text,
 * so code, angle brackets and split entities cannot break Telegram parsing. */
export class TelegramReplyStream {
  private pending = '';
  private sent: string[] = [];
  private ids: number[] = [];
  private timer?: ReturnType<typeof setTimeout>;
  private queue: Promise<void> = Promise.resolve();
  private flushing = false;
  private closed = false;
  private lastError?: Error;
  constructor(
    private readonly token: string,
    private readonly chatId: string,
    private readonly fetchImpl?: TelegramFetch,
    private readonly intervalMs = 1200,
  ) {}

  update(text: string): void {
    if (this.closed) return;
    this.pending = text;
    if (this.timer || this.flushing) return;
    this.timer = setTimeout(() => {
      this.timer = undefined;
      this.enqueue();
    }, this.intervalMs);
  }

  private enqueue(): void {
    if (this.flushing) return;
    this.flushing = true;
    const text = this.pending;
    this.queue = this.queue
      .then(() => this.flush(text))
      .catch((err: Error) => {
        this.lastError = err;
      })
      .finally(() => {
        this.flushing = false;
        if (!this.closed && this.pending !== text) this.update(this.pending);
      });
  }

  private async flush(text: string): Promise<void> {
    const chunks = telegramChunks(text);
    for (let index = 0; index < Math.max(chunks.length, this.ids.length); index++) {
      const chunk = chunks[index];
      const id = this.ids[index];
      if (!chunk && id !== undefined) {
        await delivery(this.fetchImpl, this.token, 'deleteMessage', { chat_id: this.chatId, message_id: id });
        continue;
      }
      if (!chunk || this.sent[index] === chunk) continue;
      const params = { chat_id: this.chatId, text: chunk, disable_web_page_preview: true };
      if (id !== undefined) await delivery(this.fetchImpl, this.token, 'editMessageText', { ...params, message_id: id });
      else {
        const result = await delivery(this.fetchImpl, this.token, 'sendMessage', params);
        if (typeof result['message_id'] !== 'number') throw new Error('Telegram did not return a message id.');
        this.ids[index] = result['message_id'];
      }
      this.sent[index] = chunk;
    }
    this.ids.length = chunks.length;
    this.sent.length = chunks.length;
    this.lastError = undefined;
  }

  async finish(text: string): Promise<void> {
    this.closed = true;
    if (this.timer) clearTimeout(this.timer);
    this.pending = text;
    await this.queue;
    this.enqueue();
    await this.queue;
    if (this.lastError) throw this.lastError;
  }
}

export interface TelegramPollerOptions {
  token: string;
  chatId: string;
  /** Human-readable Telegram chat title for status display. */
  chatTitle?: string;
  fetchImpl?: TelegramFetch;
  onMessage: (from: string, text: string, chatId: string) => void;
  /** Called with a plain-text diagnosis when polling stops working. */
  onError?: (message: string) => void;
}

/** Long-polling loop for one conversation's bot. Ignores updates from other
 * chats and messages that predate the poller by more than a minute (no replay
 * of history, but network/queue latency must not drop fresh messages). */
export class TelegramPoller {
  private stopped = false;
  private controller?: AbortController;
  private offset?: number;
  private readonly startedAt: number;
  private started = false;
  private readonly seenChats = new Map<string, string>();

  chats(): TelegramChatInfo[] {
    return [...this.seenChats].map(([id, title]) => ({ id, title }));
  }

  constructor(private readonly options: TelegramPollerOptions) {
    this.startedAt = Date.now() / 1000 - 60;
  }

  start(): void {
    if (this.stopped || this.started) return;
    this.started = true;
    void this.loop();
  }

  stop(): void {
    this.stopped = true;
    this.controller?.abort();
  }

  get running(): boolean {
    return !this.stopped;
  }

  private async loop(): Promise<void> {
    const fetchImpl = this.options.fetchImpl ?? defaultFetch;
    while (!this.stopped) {
      this.controller = new AbortController();
      try {
        const result = await callTelegram(
          fetchImpl,
          this.options.token,
          'getUpdates',
          {
            offset: this.offset,
            timeout: POLL_TIMEOUT_S,
            limit: 10,
            allowed_updates: ['message'],
          },
          this.controller.signal,
        );
        const updates = (Array.isArray(result) ? result : []) as unknown as TelegramUpdate[];
        for (const update of updates) {
          if (this.stopped) break;
          if (this.offset !== undefined && update.update_id < this.offset) continue;
          this.offset = Math.max(this.offset ?? 0, update.update_id + 1);
          const message = update.message;
          if (message?.chat?.id !== undefined) this.seenChats.set(String(message.chat.id), message.chat.title || message.from?.first_name || String(message.chat.id));
          if (!message?.text || message.date < this.startedAt) continue;
          if (this.options.chatId !== '*' && String(message.chat?.id ?? '') !== String(this.options.chatId)) continue;
          if (message.from?.is_bot) continue;
          const from = message.from?.first_name || message.from?.username || 'telegram user';
          try {
            this.options.onMessage(from, message.text, String(message.chat?.id ?? ''));
          } catch (err) {
            this.options.onError?.(`cowork telegram handler failed: ${(err as Error).message}`);
          }
        }
      } catch (err) {
        if (this.stopped) return;
        const message = (err as Error).message || 'telegram poll failed';
        this.options.onError?.(message);
        // Back off before retrying so a bad token does not hammer the API.
        await new Promise((resolve) => setTimeout(resolve, 5_000));
      }
    }
  }
}
