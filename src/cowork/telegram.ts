import { excerpt } from '../util.js';
import { MAX_ARTIFACT_BYTES, type CoworkRequest } from './store.js';

/**
 * Telegram message gateway for cowork conversations. One long-polling bot per
 * connected conversation: inbound group messages become user messages in the
 * cowork chat, and agent replies are mirrored back to the Telegram chat.
 * fetch is injectable so tests can script the API without network.
 */

export type TelegramFetch = (
  url: string,
  init?: { method?: string; headers?: Record<string, string>; body?: string | FormData; signal?: AbortSignal },
) => Promise<{ ok: boolean; status: number; text: () => Promise<string>; arrayBuffer?: () => Promise<ArrayBuffer> }>;

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
    caption?: string;
    document?: { file_id?: string; file_name?: string; mime_type?: string; file_size?: number };
    photo?: { file_id?: string; file_size?: number; width?: number; height?: number }[];
    voice?: { file_id?: string; file_name?: string; mime_type?: string; file_size?: number; duration?: number };
    audio?: { file_id?: string; file_name?: string; mime_type?: string; file_size?: number; duration?: number };
    video?: { file_id?: string; file_name?: string; mime_type?: string; file_size?: number; duration?: number };
    video_note?: { file_id?: string; file_name?: string; mime_type?: string; file_size?: number; duration?: number };
    animation?: { file_id?: string; file_name?: string; mime_type?: string; file_size?: number; duration?: number };
    sticker?: { file_id?: string; file_name?: string; mime_type?: string; file_size?: number; is_animated?: boolean; is_video?: boolean };
  };
  callback_query?: {
    id: string;
    data?: string;
    message?: { message_id: number; date?: number; chat?: { id?: number | string; title?: string; type?: string } };
    from?: { first_name?: string; username?: string; is_bot?: boolean };
  };
}

export interface TelegramInboundFile {
  name: string;
  mime: string;
  dataBase64: string;
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

async function downloadTelegramFile(fetchImpl: TelegramFetch | undefined, token: string, fileId: string, name: string, mime: string): Promise<TelegramInboundFile> {
  const info = await callTelegram(fetchImpl, token, 'getFile', { file_id: fileId });
  const filePath = String(info['file_path'] ?? '');
  if (!filePath || filePath.includes('..')) throw new TelegramError('Telegram returned an invalid file path.');
  const doFetch = fetchImpl ?? defaultFetch;
  const response = await doFetch(`${API_BASE}/file/bot${token.trim()}/${filePath}`, { method: 'GET', signal: AbortSignal.timeout(40_000) });
  if (!response.ok) throw new TelegramError(`Telegram file download failed (HTTP ${response.status}).`, response.status);
  if (!response.arrayBuffer) throw new TelegramError('Telegram file download did not provide binary data.');
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length === 0) throw new TelegramError('Telegram file was empty.');
  if (bytes.length > MAX_ARTIFACT_BYTES) throw new TelegramError(`Telegram file exceeds the ${MAX_ARTIFACT_BYTES / 1_000_000} MB Cowork limit.`);
  return { name, mime, dataBase64: bytes.toString('base64') };
}

export interface TelegramChatInfo {
  id: string;
  title: string;
}

export interface TelegramMessageOptions {
  replyMarkup?: Record<string, unknown>;
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

export function cleanTelegramText(text: string, fallback = 'Working...'): string {
  const cleaned = String(text ?? '')
    .replace(/\u001b\[[0-?]*[ -/]*[@-~]/g, '')
    // A marker alone on its line takes the whole line with it, otherwise the
    // stripped marker leaves an empty line behind in the Telegram message.
    .replace(/^[^\S\n]*<tool\b[\s\S]*?<\/tool>[^\S\n]*\n?/gim, '')
    .replace(/<tool\b[^>]*>[\s\S]*?<\/tool>/gi, '')
    .replace(/<tool[\s\S]*$/i, '')
    .replace(/<\/?tool[^>]*>/gi, '')
    // Progress/system lines vanish including their line ending, and the leading
    // \s* is kept inside a single line so they cannot swallow a blank separator.
    .replace(/^[^\S\n]*\[[\w.-]+:\s*(?:running|completed|failed)\][^\S\n]*\n?/gim, '')
    .replace(/^[^\S\n]*Tools:[^\n]*\n?/gim, '')
    .replace(/^```[^\n]*\n?/gm, '')
    .replace(/`([^`\n]+)`/g, '$1')
    .replace(/\*\*([^*\n]+)\*\*/g, '$1')
    .replace(/__([^_\n]+)__/g, '$1')
    .replace(/^\s{0,3}#{1,6}\s+/gm, '')
    .replace(/^\s*>+\s?/gm, '')
    .replace(/^\s*[-*+]\s+/gm, '- ')
    .replace(/\r\n?/g, '\n')
    .replace(/\u2026/g, '...')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/[•◦▪▫]/g, '-')
    .replace(/·/g, '-')
    .replace(/[✓✔]/g, 'done')
    .replace(/○/g, '-')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return cleaned || fallback;
}

function cleanTelegramLine(text: string, fallback: string): string {
  return cleanTelegramText(text, fallback).replace(/\s+/g, ' ').trim();
}

export function telegramAgentMessage(agentName: string | undefined, text: string, fallback = 'Working...'): string {
  const name = cleanTelegramLine(agentName || 'Agent Gitu', 'Agent Gitu').slice(0, 80);
  return `${name}\n${cleanTelegramText(text, fallback)}`;
}

function telegramRequestLabel(request: CoworkRequest): string {
  if (request.kind === 'permission') return 'Approval needed';
  if (request.kind === 'recommendation') return 'Recommendation';
  return 'Question';
}

function telegramButtonText(text: string, fallback: string): string {
  return cleanTelegramLine(text, fallback).slice(0, 48);
}

export function telegramRequestCardText(request: CoworkRequest, agentName?: string): string {
  const lines = [telegramRequestLabel(request)];
  if (agentName) lines.push(`From: ${cleanTelegramLine(agentName, 'teammate')}`);
  lines.push(cleanTelegramText(request.title, 'Untitled request'));
  if (request.detail && request.detail !== request.title) lines.push(cleanTelegramText(request.detail));
  if (request.options.length > 0) {
    lines.push('', 'Options:');
    request.options.forEach((option, index) => lines.push(`${index + 1}. ${cleanTelegramLine(option, `Option ${index + 1}`)}`));
  }
  lines.push('', `Request id: ${request.id}`);
  if (request.kind === 'permission') lines.push('Tap Allow or Deny, or reply approve / deny.');
  else if (request.kind === 'recommendation') lines.push('Tap Accept or Dismiss, or reply accept / dismiss.');
  else lines.push(request.options.length > 0 ? 'Tap an option, reply with the option number, or type your answer.' : 'Reply with your answer.');
  return lines.join('\n');
}

export function telegramRequestReplyMarkup(request: CoworkRequest): Record<string, unknown> | undefined {
  if (request.kind === 'permission') {
    return { inline_keyboard: [[
      { text: 'Allow', callback_data: `cwreq:${request.id}:approve` },
      { text: 'Deny', callback_data: `cwreq:${request.id}:deny` },
    ]] };
  }
  if (request.kind === 'recommendation') {
    return { inline_keyboard: [[
      { text: 'Accept', callback_data: `cwreq:${request.id}:accept` },
      { text: 'Dismiss', callback_data: `cwreq:${request.id}:dismiss` },
    ]] };
  }
  if (request.options.length === 0) return undefined;
  return {
    inline_keyboard: request.options.map((option, index) => [
      { text: telegramButtonText(option, `Option ${index + 1}`), callback_data: `cwreq:${request.id}:answer:${index}` },
    ]),
  };
}

export interface TelegramRequestAction {
  requestId: string;
  action: 'approve' | 'deny' | 'accept' | 'dismiss' | 'answer';
  optionIndex?: number;
}

export function parseTelegramRequestAction(data: string): TelegramRequestAction | undefined {
  const match = /^cwreq:([\w-]+):(approve|deny|accept|dismiss|answer)(?::(\d+))?$/.exec(String(data ?? '').trim());
  if (!match) return undefined;
  return {
    requestId: match[1]!,
    action: match[2]! as TelegramRequestAction['action'],
    optionIndex: match[3] === undefined ? undefined : Number(match[3]),
  };
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

export async function sendTelegramMessage(fetchImpl: TelegramFetch | undefined, token: string, chatId: string, text: string, options: TelegramMessageOptions = {}): Promise<void> {
  const chunks = telegramChunks(text);
  for (const [index, chunk] of chunks.entries()) {
    const params: Record<string, unknown> = {
      chat_id: chatId,
      text: chunk,
      disable_web_page_preview: true,
    };
    if (index === 0 && chunks.length === 1 && options.replyMarkup) params['reply_markup'] = options.replyMarkup;
    await delivery(fetchImpl, token, 'sendMessage', params);
  }
}

export async function sendTelegramRequestCard(fetchImpl: TelegramFetch | undefined, token: string, chatId: string, request: CoworkRequest, agentName?: string): Promise<void> {
  await sendTelegramMessage(fetchImpl, token, chatId, telegramRequestCardText(request, agentName), { replyMarkup: telegramRequestReplyMarkup(request) });
}

export async function sendTelegramDocument(
  fetchImpl: TelegramFetch | undefined,
  token: string,
  chatId: string,
  file: { name: string; mime: string; bytes: Uint8Array },
  caption?: string,
): Promise<void> {
  if (!/^\d{5,}:[\w-]{20,}$/.test(token.trim())) throw new TelegramError('That does not look like a Telegram bot token.');
  const doFetch = fetchImpl ?? defaultFetch;
  for (let attempt = 0; attempt < 3; attempt++) {
    const form = new FormData();
    form.set('chat_id', chatId);
    if (caption) form.set('caption', caption.slice(0, 1_000));
    form.set('document', new Blob([file.bytes], { type: file.mime }), file.name);
    const response = await doFetch(`${API_BASE}/bot${token.trim()}/sendDocument`, { method: 'POST', body: form, signal: AbortSignal.timeout(60_000) });
    const body = await response.text();
    let parsed: { ok?: boolean; description?: string; parameters?: { retry_after?: number } } = {};
    try { parsed = JSON.parse(body) as typeof parsed; } catch { /* Telegram may return a proxy error page. */ }
    if (response.ok && parsed.ok === true) return;
    const retryAfter = parsed.parameters?.retry_after;
    if (response.status !== 429 || attempt === 2) throw new TelegramError(`Telegram sendDocument failed (HTTP ${response.status}): ${(parsed.description ?? excerpt(body, 200)).replaceAll(token.trim(), '[redacted]')}`, response.status, retryAfter);
    await new Promise((resolve) => setTimeout(resolve, Math.min(60, Math.max(1, retryAfter ?? 1)) * 1_000));
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
  onMessage: (from: string, text: string, chatId: string, file?: TelegramInboundFile) => void | Promise<void>;
  onCallback?: (from: string, data: string, chatId: string, callbackId: string, messageId?: number) => void | string | Promise<void | string>;
  initialOffset?: number;
  onOffset?: (offset: number) => void;
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
    this.offset = options.initialOffset;
    this.startedAt = options.initialOffset === undefined ? Date.now() / 1000 - 60 : 0;
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
            allowed_updates: ['message', 'callback_query'],
          },
          this.controller.signal,
        );
        const updates = (Array.isArray(result) ? result : []) as unknown as TelegramUpdate[];
        for (const update of updates) {
          if (this.stopped) break;
          if (this.offset !== undefined && update.update_id < this.offset) continue;
          this.offset = Math.max(this.offset ?? 0, update.update_id + 1);
          this.options.onOffset?.(this.offset);
          const callback = update.callback_query;
          if (callback) {
            const chat = callback.message?.chat;
            if (chat?.id !== undefined) this.seenChats.set(String(chat.id), chat.title || callback.from?.first_name || String(chat.id));
            if (!callback.data || chat?.id === undefined) continue;
            if (this.options.chatId !== '*' && String(chat.id) !== String(this.options.chatId)) continue;
            if (callback.from?.is_bot) continue;
            const from = callback.from?.first_name || callback.from?.username || 'telegram user';
            try {
              const notice = await this.options.onCallback?.(from, callback.data, String(chat.id), callback.id, callback.message?.message_id);
              await callTelegram(
                fetchImpl,
                this.options.token,
                'answerCallbackQuery',
                { callback_query_id: callback.id, text: String(notice || 'Recorded').slice(0, 180), show_alert: false },
                this.controller.signal,
              );
            } catch (err) {
              this.options.onError?.(`cowork telegram callback failed: ${(err as Error).message}`);
            }
            continue;
          }
          const message = update.message;
          if (message?.chat?.id !== undefined) this.seenChats.set(String(message.chat.id), message.chat.title || message.from?.first_name || String(message.chat.id));
          if (!message || message.date < this.startedAt) continue;
          if (this.options.chatId !== '*' && String(message.chat?.id ?? '') !== String(this.options.chatId)) continue;
          if (message.from?.is_bot) continue;
          const from = message.from?.first_name || message.from?.username || 'telegram user';
          try {
            const document = message.document;
            const photo = message.photo?.at(-1);
            // Voice notes, audio, video, video notes, animations and stickers all
            // arrive as downloadable files, same as documents and photos.
            const track = message.audio ?? message.voice ?? message.video_note;
            const clip = message.video ?? message.animation;
            const sticker = message.sticker;
            const kind = message.voice ? 'voice' : message.video_note ? 'video-note' : message.audio ? 'audio' : message.video ? 'video' : message.animation ? 'animation' : 'sticker';
            const selected = document?.file_id
              ? { id: document.file_id, name: document.file_name || 'telegram-document', mime: document.mime_type || 'application/octet-stream', size: document.file_size }
              : photo?.file_id
                ? { id: photo.file_id, name: `telegram-photo-${message.message_id}.jpg`, mime: 'image/jpeg', size: photo.file_size }
                : track?.file_id
                  ? { id: track.file_id, name: track.file_name || `telegram-${kind}-${message.message_id}`, mime: track.mime_type || 'audio/ogg', size: track.file_size }
                  : clip?.file_id
                    ? { id: clip.file_id, name: clip.file_name || `telegram-${kind}-${message.message_id}.mp4`, mime: clip.mime_type || 'video/mp4', size: clip.file_size }
                    : sticker?.file_id
                      ? { id: sticker.file_id, name: sticker.file_name || `telegram-${kind}-${message.message_id}`, mime: sticker.mime_type || 'image/webp', size: sticker.file_size }
                      : undefined;
            if (selected?.size && selected.size > MAX_ARTIFACT_BYTES) throw new TelegramError(`Telegram file exceeds the ${MAX_ARTIFACT_BYTES / 1_000_000} MB Cowork limit.`);
            const file = selected ? await downloadTelegramFile(fetchImpl, this.options.token, selected.id, selected.name, selected.mime) : undefined;
            const text = message.text || message.caption || (file ? `Attached ${file.name}` : '');
            if (text || file) await this.options.onMessage(from, text, String(message.chat?.id ?? ''), file);
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
