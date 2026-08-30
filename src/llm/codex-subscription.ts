import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, extname, join } from 'node:path';
import { createInterface } from 'node:readline';
import { Codex, type Input } from '@openai/codex-sdk';
import { LlmError, type LlmClient, type LlmContentPart, type LlmDeltaHandler, type LlmMessage, type LlmOptions, type LlmUsage } from './llm.js';

/**
 * Supported bridge from Agent Gitu to a person's ChatGPT subscription.  It
 * talks to the local Codex runtime, which owns OAuth, refreshes tokens, and
 * exposes the models actually included in the active ChatGPT plan.  No web
 * cookies or ChatGPT tokens are read by Agent Gitu.
 */

const moduleRequire = createRequire(import.meta.url);
const INFO_TTL_MS = 30_000;
const APP_SERVER_TIMEOUT_MS = 12_000;
const LOGIN_TIMEOUT_MS = 5 * 60_000;

type JsonRecord = Record<string, unknown>;

export interface CodexSubscriptionModel {
  id: string;
  displayName?: string;
  vision: boolean;
  effortLevels: string[];
  isDefault: boolean;
}

export interface CodexSubscriptionInfo {
  available: boolean;
  signedIn: boolean;
  planType?: string;
  models: CodexSubscriptionModel[];
  error?: string;
}

export interface CodexLoginStart {
  alreadySignedIn: boolean;
  authUrl?: string;
  loginId?: string;
}

let infoCache: { expiresAt: number; value: CodexSubscriptionInfo } | undefined;
let activeLogin: {
  app: AppServerConnection;
  loginId: string;
  authUrl: string;
  completion: Promise<boolean>;
  settle: (completed: boolean) => void;
  timeout: NodeJS.Timeout;
} | undefined;

function platformPackage(): { name: string; target: string } | undefined {
  if (process.platform === 'win32' && process.arch === 'x64') return { name: '@openai/codex-win32-x64', target: 'x86_64-pc-windows-msvc' };
  if (process.platform === 'win32' && process.arch === 'arm64') return { name: '@openai/codex-win32-arm64', target: 'aarch64-pc-windows-msvc' };
  if (process.platform === 'darwin' && process.arch === 'x64') return { name: '@openai/codex-darwin-x64', target: 'x86_64-apple-darwin' };
  if (process.platform === 'darwin' && process.arch === 'arm64') return { name: '@openai/codex-darwin-arm64', target: 'aarch64-apple-darwin' };
  if (process.platform === 'linux' && process.arch === 'x64') return { name: '@openai/codex-linux-x64', target: 'x86_64-unknown-linux-musl' };
  if (process.platform === 'linux' && process.arch === 'arm64') return { name: '@openai/codex-linux-arm64', target: 'aarch64-unknown-linux-musl' };
  return undefined;
}

/** Locate the Codex binary bundled by the official SDK. */
export function codexExecutable(): string | undefined {
  const configured = process.env['HERMES_CODEX_PATH'];
  if (configured && existsSync(configured)) return configured;
  const platform = platformPackage();
  if (!platform) return undefined;
  try {
    const packageRoot = dirname(moduleRequire.resolve(`${platform.name}/package.json`));
    const binary = join(packageRoot, 'vendor', platform.target, 'bin', process.platform === 'win32' ? 'codex.exe' : 'codex');
    return existsSync(binary) ? binary : undefined;
  } catch {
    return undefined;
  }
}

class AppServerConnection {
  private readonly child: ChildProcessWithoutNullStreams;
  private readonly pending = new Map<number, { resolve: (value: JsonRecord) => void; reject: (reason: Error) => void; timer: NodeJS.Timeout }>();
  private readonly notifications = new Set<(method: string, params: JsonRecord) => void>();
  private nextId = 1;
  private closed = false;
  private stderr = '';

  private constructor(child: ChildProcessWithoutNullStreams) {
    this.child = child;
    const lines = createInterface({ input: child.stdout });
    lines.on('line', (line) => this.onLine(line));
    child.stderr.on('data', (chunk: Buffer) => {
      this.stderr = (this.stderr + chunk.toString()).slice(-2000);
    });
    child.once('error', (err) => this.rejectAll(new Error(`Could not start the local Codex runtime: ${err.message}`)));
    child.once('exit', () => this.rejectAll(new Error(this.stderr.trim() || 'The local Codex runtime stopped unexpectedly.')));
  }

  static async connect(): Promise<AppServerConnection> {
    const executable = codexExecutable();
    if (!executable) throw new Error('Codex is not installed. Install or update Codex, then restart Agent Gitu.');
    const child = spawn(executable, ['app-server', '--stdio'], { stdio: 'pipe', windowsHide: true });
    const app = new AppServerConnection(child);
    await app.request('initialize', {
      clientInfo: { name: 'agent_gitu', title: 'Agent Gitu', version: '0.2.3' },
      capabilities: { optOutNotificationMethods: ['item/agentMessage/delta'] },
    });
    app.notify('initialized', {});
    return app;
  }

  request(method: string, params: JsonRecord): Promise<JsonRecord> {
    if (this.closed) return Promise.reject(new Error('The local Codex runtime is not connected.'));
    const id = this.nextId++;
    return new Promise<JsonRecord>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Timed out while waiting for Codex (${method}).`));
      }, APP_SERVER_TIMEOUT_MS);
      this.pending.set(id, { resolve, reject, timer });
      this.child.stdin.write(`${JSON.stringify({ method, id, params })}\n`);
    });
  }

  notify(method: string, params: JsonRecord): void {
    if (!this.closed) this.child.stdin.write(`${JSON.stringify({ method, params })}\n`);
  }

  onNotification(listener: (method: string, params: JsonRecord) => void): () => void {
    this.notifications.add(listener);
    return () => this.notifications.delete(listener);
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.child.kill();
    this.rejectAll(new Error('The local Codex runtime connection was closed.'));
  }

  private onLine(line: string): void {
    let message: JsonRecord;
    try {
      message = JSON.parse(line) as JsonRecord;
    } catch {
      return;
    }
    if (typeof message['id'] === 'number') {
      const request = this.pending.get(message['id']);
      if (!request) return;
      this.pending.delete(message['id']);
      clearTimeout(request.timer);
      if (message['error'] && typeof message['error'] === 'object') {
        const error = message['error'] as JsonRecord;
        request.reject(new Error(String(error['message'] ?? 'Codex request failed.')));
      } else {
        request.resolve((message['result'] as JsonRecord | undefined) ?? {});
      }
      return;
    }
    if (typeof message['method'] === 'string') {
      const params = message['params'];
      const value = params && typeof params === 'object' && !Array.isArray(params) ? (params as JsonRecord) : {};
      for (const listener of this.notifications) listener(message['method'], value);
    }
  }

  private rejectAll(error: Error): void {
    for (const [id, request] of this.pending) {
      this.pending.delete(id);
      clearTimeout(request.timer);
      request.reject(error);
    }
  }
}

function accountIsChatGpt(account: unknown): account is JsonRecord {
  return Boolean(account && typeof account === 'object' && !Array.isArray(account) && (account as JsonRecord)['type'] === 'chatgpt');
}

function appServerModels(value: unknown): CodexSubscriptionModel[] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return [];
  const data = (value as JsonRecord)['data'];
  if (!Array.isArray(data)) return [];
  return data
    .flatMap((entry): CodexSubscriptionModel[] => {
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return [];
      const raw = entry as JsonRecord;
      const id = typeof raw['id'] === 'string' ? raw['id'] : typeof raw['model'] === 'string' ? raw['model'] : '';
      if (!id) return [];
      const modalities = Array.isArray(raw['inputModalities']) ? raw['inputModalities'] : [];
      const efforts = Array.isArray(raw['supportedReasoningEfforts'])
        ? raw['supportedReasoningEfforts']
            .flatMap((effort) => (effort && typeof effort === 'object' && typeof (effort as JsonRecord)['reasoningEffort'] === 'string' ? [String((effort as JsonRecord)['reasoningEffort'])] : []))
        : [];
      return [{
        id,
        displayName: typeof raw['displayName'] === 'string' ? raw['displayName'] : undefined,
        vision: modalities.some((modality) => modality === 'image'),
        effortLevels: efforts,
        isDefault: raw['isDefault'] === true,
      }];
    })
    .sort((a, b) => Number(b.isDefault) - Number(a.isDefault) || a.id.localeCompare(b.id));
}

export async function codexSubscriptionInfo(refresh = false): Promise<CodexSubscriptionInfo> {
  if (!refresh && infoCache && Date.now() < infoCache.expiresAt) return infoCache.value;
  if (!codexExecutable()) {
    return { available: false, signedIn: false, models: [], error: 'Codex is not installed.' };
  }
  let app: AppServerConnection | undefined;
  try {
    app = await AppServerConnection.connect();
    const [accountResult, modelResult] = await Promise.all([
      app.request('account/read', { refreshToken: false }),
      app.request('model/list', { limit: 100, includeHidden: false }),
    ]);
    const account = accountResult['account'];
    const value: CodexSubscriptionInfo = {
      available: true,
      signedIn: accountIsChatGpt(account),
      planType: accountIsChatGpt(account) && typeof account['planType'] === 'string' ? account['planType'] : undefined,
      models: appServerModels(modelResult),
    };
    infoCache = { expiresAt: Date.now() + INFO_TTL_MS, value };
    return value;
  } catch (err) {
    const value: CodexSubscriptionInfo = { available: true, signedIn: false, models: [], error: (err as Error).message };
    infoCache = { expiresAt: Date.now() + 5_000, value };
    return value;
  } finally {
    app?.close();
  }
}

/** Begin Codex's supported browser OAuth flow. Tokens stay in Codex's own store. */
export async function startCodexSubscriptionLogin(): Promise<CodexLoginStart> {
  const current = await codexSubscriptionInfo(true);
  if (current.signedIn) return { alreadySignedIn: true };
  if (activeLogin) return { alreadySignedIn: false, authUrl: activeLogin.authUrl, loginId: activeLogin.loginId };

  const app = await AppServerConnection.connect();
  try {
    const started = await app.request('account/login/start', {
      type: 'chatgpt',
      useHostedLoginSuccessPage: true,
      appBrand: 'chatgpt',
    });
    const authUrl = typeof started['authUrl'] === 'string' ? started['authUrl'] : undefined;
    const loginId = typeof started['loginId'] === 'string' ? started['loginId'] : undefined;
    if (!authUrl || !loginId) throw new Error('Codex did not return a ChatGPT sign-in link.');
    let settle: (completed: boolean) => void = () => {};
    const completion = new Promise<boolean>((resolve) => { settle = resolve; });
    const timeout = setTimeout(() => {
      if (!activeLogin || activeLogin.loginId !== loginId) return;
      const pending = activeLogin;
      activeLogin = undefined;
      pending.app.close();
      pending.settle(false);
    }, LOGIN_TIMEOUT_MS);
    activeLogin = { app, authUrl, loginId, completion, settle, timeout };
    const unsubscribe = app.onNotification((method, params) => {
      if (method !== 'account/login/completed' || params['loginId'] !== loginId) return;
      unsubscribe();
      const completed = activeLogin;
      activeLogin = undefined;
      infoCache = undefined;
      app.close();
      if (completed) {
        clearTimeout(completed.timeout);
        completed.settle(true);
      }
    });
    return { alreadySignedIn: false, authUrl, loginId };
  } catch (err) {
    app.close();
    throw err;
  }
}

/** Wait for a browser sign-in started by this process to finish. */
export async function waitForCodexSubscriptionLogin(loginId: string): Promise<boolean> {
  const pending = activeLogin;
  if (pending?.loginId === loginId) return pending.completion;
  return (await codexSubscriptionInfo(true)).signedIn;
}

function contentText(content: string | LlmContentPart[]): string {
  if (typeof content === 'string') return content;
  return content
    .map((part) => (part.type === 'text' ? part.text : '[An image is attached below.]'))
    .filter(Boolean)
    .join('\n');
}

function fingerprint(message: LlmMessage): string {
  if (typeof message.content === 'string') return `${message.role}\u0000${message.content}`;
  return `${message.role}\u0000${message.content.map((part) => (part.type === 'text' ? `t:${part.text}` : `i:${part.image_url.url}`)).join('\u0001')}`;
}

function isDataImage(url: string): { extension: string; payload: string } | undefined {
  const match = /^data:image\/(png|jpe?g|webp);base64,([A-Za-z0-9+/=]+)$/i.exec(url);
  if (!match?.[1] || !match[2]) return undefined;
  const kind = match[1].toLowerCase();
  return { extension: kind === 'jpeg' ? '.jpg' : `.${kind}`, payload: match[2] };
}

async function codexInput(messages: LlmMessage[]): Promise<{ input: Input; cleanup: () => Promise<void> }> {
  const parts: { type: 'text'; text: string }[] = [
    {
      type: 'text',
      text:
        'You are the reasoning model inside Agent Gitu. Follow the supplied SYSTEM and USER messages exactly. ' +
        'Do not run shell commands or edit files yourself; Agent Gitu owns tool execution. ' +
        'When the user asks for an action, respond in the format the SYSTEM message requests.\n',
    },
  ];
  const images: { type: 'local_image'; path: string }[] = [];
  let imageDir: string | undefined;
  for (const message of messages) {
    parts.push({ type: 'text', text: `\n--- ${message.role.toUpperCase()} ---\n${contentText(message.content)}` });
    if (!Array.isArray(message.content)) continue;
    for (const part of message.content) {
      if (part.type !== 'image_url') continue;
      const data = isDataImage(part.image_url.url);
      if (!data) {
        parts.push({ type: 'text', text: '[Image attachment could not be forwarded because it is not a local image.]' });
        continue;
      }
      imageDir ??= await mkdtemp(join(tmpdir(), 'agent-gitu-codex-'));
      const imagePath = join(imageDir, `image-${images.length + 1}${data.extension}`);
      await writeFile(imagePath, Buffer.from(data.payload, 'base64'));
      images.push({ type: 'local_image', path: imagePath });
    }
  }
  return {
    input: [...parts, ...images],
    cleanup: async () => {
      if (imageDir) await rm(imageDir, { recursive: true, force: true }).catch(() => {});
    },
  };
}

function mapUsage(usage: JsonRecord | undefined): LlmUsage | undefined {
  if (!usage) return undefined;
  const number = (key: string): number => (typeof usage[key] === 'number' && Number.isFinite(usage[key]) ? Math.floor(usage[key] as number) : 0);
  return {
    inputTokens: number('input_tokens'),
    outputTokens: number('output_tokens'),
    cachedTokens: number('cached_input_tokens'),
  };
}

function sameMessages(current: LlmMessage[], previous: string[]): boolean {
  return current.length >= previous.length && previous.every((entry, index) => fingerprint(current[index]!) === entry);
}

export interface CodexSubscriptionClientConfig {
  model: string;
  workingDirectory: string;
}

/** LlmClient backed by a ChatGPT-authenticated local Codex thread. */
export class CodexSubscriptionClient implements LlmClient {
  readonly name: string;
  lastReasoning?: string;
  private readonly codex: Codex;
  private thread: ReturnType<Codex['startThread']> | undefined;
  private previousMessages: string[] | undefined;
  private previousResponse: string | undefined;
  private activeEffort: string | undefined;

  constructor(private readonly config: CodexSubscriptionClientConfig) {
    const executable = codexExecutable();
    if (!executable) throw new LlmError('ChatGPT subscription access needs the local Codex runtime. Install or update Codex, then restart Agent Gitu.');
    this.codex = new Codex({ codexPathOverride: executable });
    this.name = `chatgpt-subscription:${config.model}`;
  }

  async complete(messages: LlmMessage[], opts: LlmOptions = {}): Promise<string> {
    return this.run(messages, opts);
  }

  async completeStream(messages: LlmMessage[], opts: LlmOptions = {}, onDelta: LlmDeltaHandler): Promise<string> {
    return this.run(messages, opts, onDelta);
  }

  private async run(messages: LlmMessage[], opts: LlmOptions, onDelta?: LlmDeltaHandler): Promise<string> {
    const effort = opts.effort ?? 'medium';
    let send = messages;
    const prior = this.previousMessages;
    const response = this.previousResponse;
    const continuation = Boolean(
      this.thread && prior && response && sameMessages(messages, prior) && messages[prior.length]?.role === 'assistant' && contentText(messages[prior.length]!.content) === response,
    );
    if (continuation) {
      send = messages.slice(prior!.length + 1);
    } else if (this.activeEffort !== undefined && this.activeEffort !== effort) {
      this.thread = undefined;
    }
    if (send.length === 0) send = [{ role: 'user', content: 'Continue with the next required response.' }];
    if (!this.thread) {
      this.thread = this.codex.startThread({
        model: this.config.model,
        workingDirectory: this.config.workingDirectory,
        skipGitRepoCheck: true,
        sandboxMode: 'read-only',
        networkAccessEnabled: false,
        webSearchMode: 'disabled',
        approvalPolicy: 'never',
        modelReasoningEffort: effort === 'max' ? 'max' : effort,
      });
      this.activeEffort = effort;
    }

    const prepared = await codexInput(send);
    let finalResponse = '';
    let emitted = '';
    let usage: LlmUsage | undefined;
    let reasoning = '';
    try {
      const streamed = await this.thread.runStreamed(prepared.input, { signal: opts.signal });
      for await (const event of streamed.events) {
        if (event.type === 'item.updated' || event.type === 'item.completed') {
          const item = event.item as JsonRecord;
          if (item['type'] === 'agent_message' && typeof item['text'] === 'string') {
            finalResponse = item['text'];
            if (onDelta && finalResponse.startsWith(emitted)) {
              const delta = finalResponse.slice(emitted.length);
              if (delta) onDelta(delta);
              emitted = finalResponse;
            }
          }
          if (item['type'] === 'reasoning' && typeof item['text'] === 'string') reasoning = item['text'];
        }
        if (event.type === 'turn.completed') usage = mapUsage(event.usage as unknown as JsonRecord);
      }
    } catch (err) {
      this.thread = undefined;
      this.previousMessages = undefined;
      this.previousResponse = undefined;
      throw new LlmError(`ChatGPT subscription request failed: ${(err as Error).message}`);
    } finally {
      await prepared.cleanup();
    }
    if (!finalResponse.trim()) throw new LlmError('ChatGPT subscription returned no response.');
    if (onDelta && emitted.length === 0) onDelta(finalResponse);
    this.lastReasoning = reasoning || undefined;
    if (usage && opts.onUsage) opts.onUsage(usage);
    this.previousMessages = messages.map(fingerprint);
    this.previousResponse = finalResponse;
    return finalResponse;
  }
}
