/**
 * pi as Gitu's provider-owned agent loop.
 *
 * This is the OpenClaw shape from the migration plan: `createAgentSession()`
 * runs in-process, pi's built-in tools are disabled (`noTools: 'builtin'`, the
 * equivalent of OpenClaw's `builtInTools: []`), and every Gitu capability is
 * injected as a custom tool so one approval path governs all side effects.
 *
 * It attaches at Gitu's existing `NativeTaskRuntime` seam rather than beside
 * it. That is deliberate: the cowork runner, the coding supervisor, missions,
 * temporary workers and sub-agents already treat "the provider owns the loop"
 * as a supported case, so steering, question cards, budgets, loop detection,
 * admission, narration and usage reporting all keep working unchanged — and so
 * do cron and channel runs, which drive the same runners.
 */
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import type { AgentToolResult, ToolDefinition } from '@earendil-works/pi-coding-agent';
import { LlmError, type LlmUsage } from './llm.js';
import type { NativeRecord, NativeTaskInput, NativeTaskResult, NativeTaskRuntime } from './native-task.js';
import {
  piCompactionExtension,
  type GituCompactionContext,
  type PiCompactionExtensionOptions,
} from './pi-compaction-extension.js';
import {
  loadPiSdk,
  type PiImage,
  type PiProviderConfig,
  type PiSession,
  type PiSessionEvent,
  type PiSessionManager,
  type PiSdk,
  type PiThinkingLevel,
} from './pi/sdk.js';

function record(value: unknown): NativeRecord {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as NativeRecord) : {};
}

/**
 * pi registers Gitu's provider under a namespace (`gitu-<provider>`) so it can
 * never replace a pi built-in's own catalog. That namespace is an internal
 * registration detail: a message a user can read names the provider the way
 * Gitu does.
 */
function userFacingProviderId(providerId: string): string {
  return providerId.startsWith('gitu-') ? providerId.slice('gitu-'.length) : providerId;
}

/** Strip the internal namespace from text pi itself produced. */
function withoutProviderNamespace(text: string, providerId: string): string {
  const plain = userFacingProviderId(providerId);
  return plain === providerId ? text : text.split(providerId).join(plain);
}

/** Everything needed to reach one model through pi. */
export interface PiModelTarget {
  /** Namespaced so Gitu's catalog never replaces a pi built-in provider's own. */
  providerId: string;
  /**
   * The provider is one pi already ships (with its own models and sign-in), so
   * Gitu neither registers it nor supplies a key: the stored sign-in is used.
   */
  builtin?: boolean;
  label?: string;
  baseUrl: string;
  apiKey: string;
  modelId: string;
  /** Wire protocol; Gitu's providers all speak OpenAI-compatible chat completions. */
  api?: string;
  vision?: boolean;
  reasoning?: boolean;
  contextWindow?: number;
  maxTokens?: number;
}

/** Gitu provider spec → pi provider registration (pi's `custom-provider.md`). */
export function piProviderConfig(target: PiModelTarget): PiProviderConfig {
  return {
    name: target.label ?? target.providerId,
    baseUrl: target.baseUrl,
    apiKey: target.apiKey,
    api: target.api ?? 'openai-completions',
    models: [
      {
        type: 'chat',
        id: target.modelId,
        name: target.modelId,
        reasoning: target.reasoning ?? true,
        input: target.vision ? ['text', 'image'] : ['text'],
        // Provider pricing is unknown here; leaving it zero keeps cost reporting
        // from inventing a number. Gitu's own budgets own spend accounting.
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        contextWindow: target.contextWindow ?? 128_000,
        maxTokens: target.maxTokens ?? 8_192,
      },
    ],
  };
}

const EFFORT_TO_THINKING: Record<string, PiThinkingLevel> = {
  low: 'low',
  medium: 'medium',
  high: 'high',
  max: 'max',
};

/** Gitu effort level → pi thinking level. Unknown effort falls back to medium. */
export function thinkingLevelFor(effort: string | undefined): PiThinkingLevel {
  if (!effort) return 'medium';
  return EFFORT_TO_THINKING[effort.toLowerCase()] ?? 'medium';
}

function toImage(url: string): PiImage | undefined {
  const match = /^data:([^;,]+);base64,(.*)$/s.exec(url);
  if (match?.[1] && match[2] !== undefined) return { type: 'image', mimeType: match[1], data: match[2] };
  // A bare base64 payload with no declared type is still usable as an image.
  return url ? { type: 'image', mimeType: 'image/png', data: url } : undefined;
}

function toImages(urls: string[]): PiImage[] {
  return urls.map(toImage).filter((image): image is PiImage => image !== undefined);
}

/** The consumer's `{ success, contentItems }` answer → pi's tool result shape. */
export function toToolResult(answer: NativeRecord, allowImages = true): AgentToolResult {
  const content: ({ type: 'text'; text: string } | PiImage)[] = [];
  const items = Array.isArray(answer['contentItems']) ? answer['contentItems'] : [];
  for (const entry of items) {
    const item = record(entry);
    if (item['type'] === 'inputImage' && typeof item['imageUrl'] === 'string') {
      if (!allowImages) continue;
      const image = toImage(item['imageUrl']);
      if (image) content.push(image);
      continue;
    }
    if (item['type'] === 'inputText') content.push({ type: 'text', text: String(item['text'] ?? '') });
  }
  if (!content.length) {
    content.push({ type: 'text', text: answer['success'] === false ? 'The operation was refused.' : 'The operation completed.' });
  }
  return { content, details: undefined, isError: answer['success'] === false };
}

function toUsage(usage: NativeRecord): LlmUsage {
  const input = Number(usage['input'] ?? 0);
  const output = Number(usage['output'] ?? 0);
  return {
    inputTokens: Number.isFinite(input) ? input : 0,
    outputTokens: Number.isFinite(output) ? output : 0,
    cachedTokens: Number(usage['cacheRead'] ?? 0) + Number(usage['cacheWrite'] ?? 0),
  };
}

function messageHasToolCall(message: NativeRecord): boolean {
  const content = Array.isArray(message['content']) ? message['content'] : [];
  return content.some((part) => {
    const kind = String(record(part)['type'] ?? '');
    return kind === 'toolCall' || kind === 'tool_call';
  });
}

/** Prefer the streamed narration; fall back to the finalized message content. */
function assistantText(message: NativeRecord, narration: string): string {
  if (narration.trim()) return narration;
  const content = Array.isArray(message['content']) ? message['content'] : [];
  return content
    .map((part) => {
      const entry = record(part);
      return entry['type'] === 'text' ? String(entry['text'] ?? '') : '';
    })
    .join('');
}

/**
 * Fill Gitu's `FailureClass` from a pi failure, reusing Gitu's own taxonomy.
 * `providerId` is the namespaced registration id, scrubbed from the text so an
 * error the user reads never carries it.
 */
export function classifyPiError(error: unknown, providerId?: string): LlmError {
  if (error instanceof LlmError) return error;
  const raw = error instanceof Error ? error.message : String(error);
  const message = providerId ? withoutProviderNamespace(raw, providerId) : raw;
  const kind = /context.?(?:window|length)|too many tokens|maximum context/i.test(message)
    ? 'protocol_error'
    : /abort|cancell?ed/i.test(message)
      ? 'aborted'
      : /401|403|unauthor|invalid.?api.?key|authentication/i.test(message)
        ? 'auth'
        : // A subscription usage window is not a temporary request-rate limit.
          /usage limit|usage cap|quota (?:exceeded|exhausted)|insufficient[_ -]quota/i.test(message)
          ? 'quota_exhausted'
          : /429|rate.?limit/i.test(message)
            ? 'rate_limit_temporary'
            : /quota|insufficient|billing|credit/i.test(message)
              ? 'quota_exhausted'
              : /ENOTFOUND|ECONNREFUSED|ETIMEDOUT|fetch failed|network|socket hang up/i.test(message)
                ? 'network'
                : 'provider_unavailable';
  return new LlmError(`The model turn failed: ${message}`, { kind });
}

/**
 * The `tool_call` policy hook (plan §6.3). Gitu's permission semantics stay in
 * the consumer's `item/tool/call` handler; this hook owns the two things that
 * must be impossible to route around: only declared tools may run, and every
 * admitted call is written to the audit sink.
 */
export function piAdmissionExtension(
  exposed: ReadonlySet<string>,
  onAdmission?: (entry: { tool: string; args: NativeRecord }) => void,
): (pi: { on(event: 'tool_call', handler: (event: NativeRecord) => Promise<{ block: true; reason: string } | undefined>): unknown }) => void {
  return (pi) => {
    pi.on('tool_call', async (event) => {
      const tool = String(event['toolName'] ?? '');
      if (!exposed.has(tool)) return { block: true, reason: `The function "${tool}" is not available to this task.` };
      onAdmission?.({ tool, args: record(event['input']) });
      return undefined;
    });
  };
}

export interface PiRuntimeOptions {
  /** State directory for pi (auth, models, sessions). Usually the Gitu home. */
  agentDir: string;
  target: PiModelTarget;
  /** Injected for tests; defaults to the cached real SDK loader. */
  loadSdk?: () => Promise<PiSdk>;
  /** Audit sink for admitted tool calls. */
  onAdmission?: (entry: { tool: string; args: NativeRecord }) => void;
  /** Context provider for Gitu-aware compaction summarization. */
  getCompactionContext?: (reason: string) => GituCompactionContext | undefined;
  /** Compaction notification hook. */
  onCompacted?: (result: { reason: string; tokensBefore: number; summary: string }) => void;
  /** Custom compactor injected for tests. */
  compactFn?: PiCompactionExtensionOptions['compactFn'];
}

/** One pi `AgentSession` owns every model and tool round of a turn. */
export class PiNativeRuntime implements NativeTaskRuntime {
  readonly mode = 'pi-native' as const;
  private running = false;
  private active?: { session: PiSession; sessionId: string; turnId: string };
  private turns = 0;

  constructor(private readonly options: PiRuntimeOptions) {}

  async steer(text: string): Promise<void> {
    const active = this.active;
    if (!active) throw new Error('There is no active turn to steer.');
    await active.session.steer(text);
  }

  async runTurn(input: NativeTaskInput): Promise<NativeTaskResult> {
    if (this.running) throw new Error('This task already has a turn in progress.');
    input.signal.throwIfAborted();
    this.running = true;
    let session: PiSession | undefined;
    let unsubscribe: (() => void) | undefined;
    let onAbort: (() => void) | undefined;
    try {
      const sdk = await (this.options.loadSdk ?? loadPiSdk)();
      const agentDir = this.options.agentDir;
      const sessionsDir = path.join(agentDir, 'pi', 'sessions');
      mkdirSync(sessionsDir, { recursive: true });

      const settingsManager = sdk.SettingsManager.create(input.cwd, agentDir);
      const modelRuntime = await sdk.ModelRuntime.create({
        authPath: path.join(agentDir, 'pi', 'auth.json'),
        modelsPath: null,
        refreshOnCreate: false,
      });
      if (this.options.target.builtin) {
        // A pi-owned provider (the ChatGPT subscription) brings its own models
        // and sign-in; registering Gitu's catalog over it would replace both.
        const signedIn = (await modelRuntime.listCredentials()).some((credential) => credential.providerId === this.options.target.providerId);
        if (!signedIn) {
          throw new LlmError('Sign in to ChatGPT in Settings → Providers to use your subscription.', { kind: 'auth' });
        }
      } else {
        modelRuntime.registerProvider(this.options.target.providerId, piProviderConfig(this.options.target));
      }
      const model = modelRuntime.getModel(this.options.target.providerId, this.options.target.modelId);
      if (!model) {
        throw new LlmError(
          `The model "${this.options.target.modelId}" is not available from provider "${userFacingProviderId(this.options.target.providerId)}". Check the provider configuration.`,
          { kind: 'provider_unavailable' },
        );
      }

      const sessionManager = input.threadId
        ? this.resumeSession(sdk, input.threadId, input.cwd, sessionsDir)
        : sdk.SessionManager.create(input.cwd, sessionsDir);
      const sessionId = sessionManager.getSessionId();
      input.onThread(sessionId);

      // The allowlist is exact: only tools this task declared are exposed.
      const declared = (input.tools ?? [])
        .map((tool) => record(tool))
        .filter((tool) => typeof tool['name'] === 'string' && tool['name'])
        .map((tool) => ({ name: String(tool['name']), description: String(tool['description'] ?? ''), schema: tool['inputSchema'] }));
      const exposed = new Set(declared.map((tool) => tool.name));
      const turnId = `pi-turn-${++this.turns}`;

      let events: Promise<void> = Promise.resolve();
      const emit = (method: string, params: NativeRecord): void => {
        events = events.then(() => input.onEvent(method, params)).catch(() => undefined);
      };

      const allowImages = this.options.target.vision !== false;
      const customTools: ToolDefinition[] = declared.map((tool) => ({
        name: tool.name,
        label: tool.name,
        description: tool.description,
        parameters: (tool.schema ?? { type: 'object', properties: {} }) as ToolDefinition['parameters'],
        // Side effects are serial, matching Gitu's existing semantics.
        executionMode: 'sequential',
        execute: async (toolCallId, params) => {
          await events;
          const answer = await input.onRequest('item/tool/call', {
            callId: toolCallId,
            turnId,
            tool: tool.name,
            arguments: record(params),
          });
          return toToolResult(answer, allowImages);
        },
      }));

      const compactionExt = piCompactionExtension({
        getContext: (reason) => {
          const fromInput = input.config['compactionContext'] as GituCompactionContext | undefined;
          return fromInput ?? this.options.getCompactionContext?.(reason);
        },
        onCompacted: (result) => {
          this.options.onCompacted?.(result);
          emit('compaction/completed', result);
        },
        compactFn: this.options.compactFn,
      });

      const resourceLoader = new sdk.DefaultResourceLoader({
        cwd: input.cwd,
        agentDir,
        settingsManager,
        // Gitu keeps building the prompt; this applies it as the session's own.
        systemPrompt: input.instructions,
        noSkills: true,
        noPromptTemplates: true,
        noThemes: true,
        noContextFiles: true,
        // Gitu owns MCP, so pi's built-in MCP extension must not also load one.
        disabledBuiltinExtensions: ['mcp'],
        extensionFactories: [
          piAdmissionExtension(exposed, this.options.onAdmission),
          compactionExt,
        ],
      });
      await resourceLoader.reload();

      const created = await sdk.createAgentSession({
        cwd: input.cwd,
        agentDir,
        modelRuntime,
        model,
        thinkingLevel: thinkingLevelFor(input.effort),
        noTools: 'builtin',
        tools: [...exposed],
        customTools,
        sessionManager,
        settingsManager,
        resourceLoader,
      });
      session = created.session;
      this.active = { session, sessionId, turnId };
      input.onTurn(turnId);
      input.onSettings?.({ model: this.options.target.modelId, requestedEffort: input.effort, effectiveEffort: input.effort });

      let narration = '';
      let itemId = '';
      let messageSeq = 0;

      unsubscribe = session.subscribe((event: PiSessionEvent) => {
        const kind = String(event['type'] ?? '');
        if (kind === 'compaction_start') {
          emit('compaction/started', { reason: event['reason'] });
          return;
        }
        if (kind === 'compaction_end') {
          emit('compaction/completed', {
            reason: event['reason'],
            result: event['result'],
            aborted: event['aborted'],
            errorMessage: event['errorMessage'],
          });
          return;
        }
        if (kind === 'message_start') {
          const message = record(event['message']);
          if (message['role'] === 'assistant') {
            itemId = `pi-msg-${++messageSeq}`;
            narration = '';
            emit('item/started', { item: { type: 'agentMessage', id: itemId } });
          }
          return;
        }
        if (kind === 'message_update') {
          const update = record(event['assistantMessageEvent']);
          const delta = typeof update['delta'] === 'string' ? update['delta'] : '';
          if (!delta) return;
          if (update['type'] === 'text_delta') {
            narration += delta;
            emit('item/agentMessage/delta', { itemId, delta });
          } else if (update['type'] === 'thinking_delta') {
            emit('item/reasoning/delta', { itemId, delta });
          }
          return;
        }
        if (kind === 'message_end') {
          const message = record(event['message']);
          if (message['role'] !== 'assistant') return;
          // A message that called tools is commentary; the answer is the one
          // that did not. This is the same distinction Codex reported.
          emit('item/completed', {
            item: {
              type: 'agentMessage',
              id: itemId,
              text: assistantText(message, narration),
              phase: messageHasToolCall(message) ? 'commentary' : 'final_answer',
            },
          });
          if (message['usage']) input.onUsage?.(toUsage(record(message['usage'])));
          return;
        }
      });

      let aborted = false;
      onAbort = () => {
        aborted = true;
        void session?.abort().catch(() => {});
      };
      input.signal.addEventListener('abort', onAbort, { once: true });

      const images = allowImages ? toImages(input.images ?? []) : [];
      await session.prompt(input.text, images.length ? { images } : undefined);
      await events;
      return {
        threadId: sessionId,
        turnId,
        status: aborted || input.signal.aborted ? 'interrupted' : 'completed',
      };
    } catch (error) {
      if (input.signal.aborted) throw new LlmError('The model turn was stopped by the user.', { kind: 'aborted' });
      throw classifyPiError(error, this.options.target.providerId);
    } finally {
      if (onAbort) input.signal.removeEventListener('abort', onAbort);
      unsubscribe?.();
      this.active = undefined;
      try {
        session?.dispose();
      } catch {
        // The transcript is already on disk; a disposal failure must not mask
        // the turn's own outcome.
      }
      this.running = false;
    }
  }

  /** Resume the transcript recorded for this thread, never a fresh session. */
  private resumeSession(sdk: PiSdk, threadId: string, cwd: string, sessionsDir: string): PiSessionManager {
    const file = sdk.SessionManager.findById(cwd, threadId, sessionsDir);
    if (!file) {
      throw new LlmError('The saved session for this task no longer exists. Start an explicit new task.', { kind: 'protocol_error' });
    }
    return sdk.SessionManager.open(file, sessionsDir, cwd);
  }
}
