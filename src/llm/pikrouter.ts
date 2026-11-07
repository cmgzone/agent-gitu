import { OpenAiCompatClient, type LlmClient } from './llm.js';
import { mergedEnv, setStoredKey } from './keys.js';
import { PiNativeRuntime } from './pi-native.js';
import { selectedRuntime } from './runtime-mode.js';
import { ensureGituHome } from '../workspace/home.js';

export const DEFAULT_PIKROUTER_AUTH_URL = 'https://pikrouter.pikpam.com/api/auth/login';
export const DEFAULT_PIKROUTER_REGISTER_URL = 'https://pikrouter.pikpam.com/api/auth/register';
export const DEFAULT_PIKROUTER_AUTHORIZE_URL = 'https://pikrouter.pikpam.com/oauth/authorize';
export const DEFAULT_PIKROUTER_OAUTH_CLIENT_ID = 'client_nexus_65f8f5f9a0c92bf1';
export const DEFAULT_PIKROUTER_BASE_URL = 'https://pikrouter.pikpam.com/v1';
export const DEFAULT_PIKROUTER_MODEL = 'gpt-4o-mini';

export interface PikRouterAuthorizeOptions {
  redirectUri: string;
  state?: string;
  clientId?: string;
  authorizeUrl?: string;
}

export interface PikRouterOAuthCallbackResult {
  token: string;
  userId?: string;
  email?: string;
  state?: string;
}

/**
 * Builds the Pikpam Hosted Authorize & Register OAuth URL.
 */
export function buildPikRouterAuthorizeUrl(opts: PikRouterAuthorizeOptions): string {
  const authorizeUrl = opts.authorizeUrl ?? DEFAULT_PIKROUTER_AUTHORIZE_URL;
  const clientId = opts.clientId ?? DEFAULT_PIKROUTER_OAUTH_CLIENT_ID;
  const state = opts.state ?? 'random_state';
  return `${authorizeUrl}?client_id=${encodeURIComponent(clientId)}&redirect_uri=${encodeURIComponent(opts.redirectUri)}&state=${encodeURIComponent(state)}`;
}

/**
 * Parses PikRouter OAuth callback query parameters (?token=<JWT>&user_id=<UUID>&email=<EMAIL>&state=<STATE>)
 * and persists the token to localStorage (browser) and/or Agent Gitu's secure key store (Node).
 */
export function parsePikRouterOAuthCallback(
  searchOrParams: string | URLSearchParams,
  opts: { saveKey?: boolean } = {},
): PikRouterOAuthCallbackResult | null {
  const params =
    typeof searchOrParams === 'string'
      ? new URLSearchParams(searchOrParams.includes('?') ? searchOrParams.slice(searchOrParams.indexOf('?')) : searchOrParams)
      : searchOrParams;
  const token = params.get('token')?.trim();
  if (!token) return null;
  const userId = params.get('user_id')?.trim() || undefined;
  const email = params.get('email')?.trim() || undefined;
  const state = params.get('state')?.trim() || undefined;

  if (typeof localStorage !== 'undefined') {
    try {
      localStorage.setItem('auth_token', token);
    } catch {
      // Ignore storage errors in restricted environments
    }
  }

  const shouldSave = opts.saveKey ?? (typeof process !== 'undefined' && Boolean(process?.env));
  if (shouldSave) {
    try {
      setStoredKey('PIKROUTER_API_KEY', token);
    } catch {
      // Best-effort storage in non-Node or restricted environments
    }
  }

  return { token, userId, email, state };
}

export interface PikRouterUser {
  id?: string | number;
  email: string;
  name?: string;
  [key: string]: unknown;
}

export interface PikRouterLoginResponse {
  token: string;
  user?: PikRouterUser;
}

export interface PikRouterLoginOptions {
  email: string;
  password: string;
  authUrl?: string;
  signal?: AbortSignal;
  /** Save token to local persistent secure key storage (default: true in Node environment). */
  saveKey?: boolean;
}

export interface PikRouterRegisterOptions {
  name: string;
  email: string;
  password: string;
  registerUrl?: string;
  signal?: AbortSignal;
  /** Save token to local persistent secure key storage (default: true in Node environment). */
  saveKey?: boolean;
}

export interface PikRouterClientOptions {
  token?: string;
  apiKey?: string;
  baseUrl?: string;
  model?: string;
}

/**
 * Authenticates a user against PikRouter with email and password.
 * Returns the JWT token and user profile.
 * Automatically persists the token to Agent Gitu's secure keys when saveKey is true.
 */
export async function loginPikRouter(opts: PikRouterLoginOptions): Promise<PikRouterLoginResponse> {
  const authUrl = opts.authUrl ?? DEFAULT_PIKROUTER_AUTH_URL;
  const res = await fetch(authUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: opts.email, password: opts.password }),
    signal: opts.signal,
  });

  if (!res.ok) {
    let message = `HTTP ${res.status}`;
    try {
      const errJson = (await res.json()) as { error?: string; message?: string };
      message = errJson.error || errJson.message || message;
    } catch {
      const errText = await res.text().catch(() => '');
      if (errText) message = errText;
    }
    throw new Error(`PikRouter authentication failed (${res.status}): ${message}`);
  }

  const data = (await res.json()) as { token?: string; user?: PikRouterUser };
  if (!data || typeof data.token !== 'string' || !data.token.trim()) {
    throw new Error('PikRouter login succeeded but no authentication token was returned.');
  }

  const token = data.token.trim();
  const shouldSave = opts.saveKey ?? (typeof process !== 'undefined' && Boolean(process?.env));
  if (shouldSave) {
    try {
      setStoredKey('PIKROUTER_API_KEY', token);
    } catch {
      // Best-effort storage in non-Node or restricted environments
    }
  }

  return { token, user: data.user };
}

/**
 * Creates a new user account on PikRouter and returns the JWT token and user profile.
 * Automatically persists the token to Agent Gitu's secure keys when saveKey is true.
 */
export async function registerPikRouter(opts: PikRouterRegisterOptions): Promise<PikRouterLoginResponse> {
  const registerUrl = opts.registerUrl ?? DEFAULT_PIKROUTER_REGISTER_URL;
  const res = await fetch(registerUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: opts.name, email: opts.email, password: opts.password }),
    signal: opts.signal,
  });

  if (!res.ok) {
    let message = `HTTP ${res.status}`;
    try {
      const errJson = (await res.json()) as { error?: string; message?: string };
      message = errJson.error || errJson.message || message;
    } catch {
      const errText = await res.text().catch(() => '');
      if (errText) message = errText;
    }
    throw new Error(`PikRouter registration failed (${res.status}): ${message}`);
  }

  const data = (await res.json()) as { token?: string; user?: PikRouterUser };
  if (!data || typeof data.token !== 'string' || !data.token.trim()) {
    throw new Error('PikRouter registration succeeded but no authentication token was returned.');
  }

  const token = data.token.trim();
  const shouldSave = opts.saveKey ?? (typeof process !== 'undefined' && Boolean(process?.env));
  if (shouldSave) {
    try {
      setStoredKey('PIKROUTER_API_KEY', token);
    } catch {
      // Best-effort storage in non-Node or restricted environments
    }
  }

  return { token, user: data.user };
}

/**
 * Creates an OpenAI-compatible client targeted at PikRouter with the user's token.
 */
export function createPikRouterClient(opts: PikRouterClientOptions = {}): OpenAiCompatClient & LlmClient {
  const env = typeof process !== 'undefined' && process?.env ? mergedEnv() : {};
  const token =
    opts.token ??
    opts.apiKey ??
    (typeof localStorage !== 'undefined' ? localStorage.getItem('auth_token') ?? undefined : undefined) ??
    env['HERMES_PIKROUTER_API_KEY'] ??
    env['PIKROUTER_API_KEY'] ??
    env['PIKROUTER_TOKEN'];

  if (!token) {
    throw new Error(
      'PikRouter token not found. Call loginPikRouter({ email, password }) or set PIKROUTER_API_KEY.',
    );
  }

  const baseUrl = opts.baseUrl ?? DEFAULT_PIKROUTER_BASE_URL;
  const model = opts.model ?? DEFAULT_PIKROUTER_MODEL;

  const client = new OpenAiCompatClient({
    apiKey: token,
    baseUrl,
    model,
    rateLimitKey: 'pikrouter:user-token:chat',
    capabilities: { streamingTools: true },
  });
  const nativeTask =
    selectedRuntime(env) === 'pi'
      ? new PiNativeRuntime({
          agentDir: ensureGituHome().root,
          target: {
            providerId: 'gitu-pikrouter',
            label: 'PikRouter (pikrouter.pikpam.com, OpenAI-compatible)',
            baseUrl,
            apiKey: token,
            modelId: model,
            vision: false,
          },
        })
      : undefined;
  return nativeTask ? Object.assign(client, { nativeTask }) : client;
}

export interface StreamPikRouterMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface StreamPikRouterOptions {
  token?: string;
  baseUrl?: string;
  model?: string;
  messages: StreamPikRouterMessage[];
  signal?: AbortSignal;
}

/**
 * Lightweight, zero-dependency async generator that streams chunks from PikRouter.
 * Works seamlessly in both browser and Node.js environments.
 */
export async function* streamPikRouterCompletion(
  opts: StreamPikRouterOptions,
): AsyncGenerator<string, void, unknown> {
  const env = typeof process !== 'undefined' && process?.env ? mergedEnv() : {};
  const token =
    opts.token ??
    (typeof localStorage !== 'undefined' ? localStorage.getItem('auth_token') : null) ??
    env['HERMES_PIKROUTER_API_KEY'] ??
    env['PIKROUTER_API_KEY'] ??
    env['PIKROUTER_TOKEN'];

  if (!token) {
    throw new Error('Authentication token is required to query PikRouter.');
  }

  const baseUrl = (opts.baseUrl ?? DEFAULT_PIKROUTER_BASE_URL).replace(/\/$/, '');
  const model = opts.model ?? DEFAULT_PIKROUTER_MODEL;

  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      model,
      messages: opts.messages,
      stream: true,
    }),
    signal: opts.signal,
  });

  if (!res.ok || !res.body) {
    const errorText = await res.text().catch(() => '');
    throw new Error(`PikRouter query failed (HTTP ${res.status}): ${errorText || res.statusText}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let newline: number;
      while ((newline = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, newline).trim();
        buffer = buffer.slice(newline + 1);
        if (!line.startsWith('data:')) continue;
        const payload = line.slice(5).trim();
        if (payload === '[DONE]') return;
        try {
          const json = JSON.parse(payload) as {
            choices?: { delta?: { content?: string } }[];
          };
          const delta = json.choices?.[0]?.delta?.content;
          if (delta) yield delta;
        } catch {
          // ignore incomplete lines
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}
