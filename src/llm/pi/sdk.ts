/**
 * The one boundary between Gitu and the pi SDK.
 *
 * Gitu is ESM (`"type": "module"`), so pi's ESM-only package can be imported
 * directly — no bridge module and no child process are needed. The interface
 * below is deliberately *structural*: it names only the SDK surface Gitu uses,
 * so a test can inject a fake without reproducing pi's full type surface, while
 * the values Gitu *produces* (tool definitions, results) are typed with pi's
 * real exported types so the adapter itself is genuinely typechecked.
 *
 * Verified against `@earendil-works/pi-coding-agent@1.4.0`.
 */
import type { ToolDefinition } from '@earendil-works/pi-coding-agent';

/** pi's thinking levels, verified from `@earendil-works/pi-agent-core`. */
export type PiThinkingLevel = 'off' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh' | 'max';

/** A model as returned by the model runtime. Opaque here; only passed back in. */
export type PiModel = unknown;

export type PiImage = { type: 'image'; data: string; mimeType: string };

/** A model definition registered on the runtime (see pi's `custom-provider.md`). */
export interface PiChatModelConfig {
  type: 'chat';
  id: string;
  name: string;
  reasoning: boolean;
  input: ('text' | 'image')[];
  cost: { input: number; output: number; cacheRead: number; cacheWrite: number };
  contextWindow: number;
  maxTokens: number;
}

export interface PiProviderConfig {
  name?: string;
  baseUrl?: string;
  apiKey?: string;
  api?: string;
  models?: PiChatModelConfig[];
}

/** A catalog model as the runtime reports it. Read defensively; the shape is versioned. */
export interface PiCatalogModel {
  id: string;
  name?: string;
  contextWindow?: number;
  input?: readonly string[];
  /** Pi thinking level → provider level; `null` marks a level the model cannot use. */
  thinkingLevelMap?: Readonly<Record<string, string | null>>;
}

/** What a sign-in flow may ask of, and tell, its host. */
export interface PiAuthInteraction {
  signal?: AbortSignal;
  prompt(prompt: { type: string; message: string; signal?: AbortSignal; options?: readonly { id: string }[] }): Promise<string>;
  notify(event: { type: string; [key: string]: unknown }): void;
}

export interface PiUsage {
  input?: number;
  output?: number;
  cacheRead?: number;
  cacheWrite?: number;
}

/** A finished model response as pi reports it. Read defensively. */
export interface PiAssistantMessage {
  content: readonly { type: string; text?: string; thinking?: string }[];
  stopReason?: string;
  errorMessage?: string;
  usage?: PiUsage;
}

export interface PiModelRuntime {
  registerProvider(providerId: string, config: PiProviderConfig): void;
  getModel(providerId: string, modelId: string): PiModel | undefined;
  getModels(providerId?: string): readonly PiCatalogModel[];
  listCredentials(): Promise<readonly { providerId: string; type: string }[]>;
  getAuth(providerId: string): Promise<{ auth: { apiKey?: string } } | undefined>;
  /** One model response without tools: the text-only path used outside an agent turn. */
  completeSimple(
    model: PiModel,
    context: { systemPrompt?: string; messages: unknown[] },
    options?: { signal?: AbortSignal; reasoning?: PiThinkingLevel },
  ): Promise<PiAssistantMessage>;
  login(providerId: string, type: 'oauth' | 'api_key', interaction: PiAuthInteraction, options?: { agentName?: string }): Promise<unknown>;
  logout(providerId: string): Promise<void>;
}

export interface PiSettingsManager {
  readonly [key: string]: unknown;
}

export interface PiSessionManager {
  getSessionId(): string;
  getSessionFile(): string | undefined;
}

export interface PiResourceLoaderOptions {
  cwd: string;
  agentDir: string;
  settingsManager?: PiSettingsManager;
  systemPrompt?: string;
  /** Inline extension factories — no extension files on disk are required. */
  extensionFactories?: unknown[];
  noSkills?: boolean;
  noPromptTemplates?: boolean;
  noThemes?: boolean;
  noContextFiles?: boolean;
  /** Built-in pi extensions that must never load (e.g. `mcp`). */
  disabledBuiltinExtensions?: string[];
}

export interface PiResourceLoader {
  reload(): Promise<void>;
}

/** Events pi's session emits. Read defensively; the union is large and versioned. */
export interface PiSessionEvent {
  type: string;
  [key: string]: unknown;
}

export interface PiSession {
  readonly sessionId: string;
  prompt(text: string, options?: { images?: PiImage[] }): Promise<void>;
  steer(text: string, images?: PiImage[], options?: unknown): Promise<void>;
  abort(): Promise<void>;
  subscribe(listener: (event: PiSessionEvent) => void): () => void;
  dispose(): void;
}

export interface PiCreateAgentSessionOptions {
  cwd: string;
  agentDir: string;
  modelRuntime: PiModelRuntime;
  model: PiModel;
  thinkingLevel?: PiThinkingLevel;
  /** OpenClaw's `builtInTools: []`: pi's own read/bash/edit/write stay off. */
  noTools: 'builtin';
  tools: string[];
  customTools: ToolDefinition[];
  sessionManager: PiSessionManager;
  settingsManager: PiSettingsManager;
  resourceLoader: PiResourceLoader;
}

/** The subset of the pi SDK Gitu depends on. */
export interface PiSdk {
  ModelRuntime: { create(options?: unknown): Promise<PiModelRuntime> };
  SettingsManager: { create(cwd: string, agentDir?: string, options?: unknown): PiSettingsManager };
  SessionManager: {
    create(cwd: string, sessionDir?: string, options?: unknown): PiSessionManager;
    open(path: string, sessionDir?: string, cwdOverride?: string): PiSessionManager;
    findById(cwd: string, id: string, sessionDir?: string): string | undefined;
  };
  DefaultResourceLoader: new (options: PiResourceLoaderOptions) => PiResourceLoader;
  createAgentSession(options: PiCreateAgentSessionOptions): Promise<{ session: PiSession }>;
}

let pending: Promise<PiSdk> | undefined;

/**
 * Load the SDK once and cache it. Every caller shares one module instance so pi
 * keeps a single set of registries for the process.
 */
export function loadPiSdk(): Promise<PiSdk> {
  pending ??= import('@earendil-works/pi-coding-agent').then((module) => {
    const sdk = module as unknown as PiSdk;
    // Fail loudly at boot rather than deep inside the first turn if the pinned
    // SDK drops a member this integration depends on.
    for (const member of ['createAgentSession', 'ModelRuntime', 'SettingsManager', 'SessionManager', 'DefaultResourceLoader'] as const) {
      if (!(member in sdk)) throw new Error(`The installed agent runtime is missing "${member}". Repair or reinstall Agent Gitu.`);
    }
    return sdk;
  });
  return pending;
}

/** Test seam: forget the cached module so a fake SDK can be installed. */
export function resetPiSdkCache(): void {
  pending = undefined;
}
