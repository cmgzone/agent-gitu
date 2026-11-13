import { OpenAiCompatClient, type LlmClient } from './llm.js';
import { mergedEnv, setStoredKey } from './keys.js';
import { PiNativeRuntime, type PiModelTarget } from './pi-native.js';
import { modelMetadataFor, peekModelCatalog } from './providers.js';
import { selectedRuntime } from './runtime-mode.js';
import { ensureGituHome } from '../workspace/home.js';

export const DEFAULT_PIKROUTER_AUTH_URL = 'https://pikrouter.pikpam.com/api/auth/login';
export const DEFAULT_PIKROUTER_REGISTER_URL = 'https://pikrouter.pikpam.com/api/auth/register';
export const DEFAULT_PIKROUTER_AUTHORIZE_URL = 'https://pikpam.com/oauth/authorize';
export const DEFAULT_PIKROUTER_TOPUP_URL = 'https://pikpam.com/oauth/topup';
export const DEFAULT_PIKROUTER_CREDITS_URL = 'https://pikrouter.pikpam.com/api/user/credits';
export const DEFAULT_PIKROUTER_OAUTH_CLIENT_ID = 'client_gitu_agent';
export const DEFAULT_PIKROUTER_BASE_URL = 'https://pikrouter.pikpam.com/v1';
export const DEFAULT_PIKROUTER_MODEL = 'DeepSeek-V4.1-Flash';
export const PIKROUTER_CREDITS_PER_USD = 100;

export interface PikRouterCreditsInfo {
  balance: number;
  available?: number;
  usdValue?: number;
  currencyFormatted?: string;
  creditRate?: string;
}

export interface PikRouterUsageInfo {
  lifetimeSpentCredits?: number;
  totalUsageCalls?: number;
}

export interface PikRouterCreditsResponse {
  ok?: boolean;
  credits: PikRouterCreditsInfo;
  usage?: PikRouterUsageInfo;
}

/**
 * Converts a USD amount to PikRouter credits at the fixed exchange rate (100 Credits = $1.00 USD).
 */
export function usdToPikRouterCredits(usd: number): number {
  if (typeof usd !== 'number' || !isFinite(usd) || usd <= 0) return 0;
  const credits = usd * PIKROUTER_CREDITS_PER_USD;
  return credits < 0.01 && credits > 0 ? Number(credits.toFixed(4)) : Number(credits.toFixed(2));
}

/**
 * Formats PikRouter credits for display.
 * Examples: 0 -> '0 credits', 0.005 -> '0.005 credits', 1 -> '1 credit', 50 -> '50 credits', 49.8 -> '49.8 credits'
 */
export function formatPikRouterCredits(credits: number, opts: { includeUnit?: boolean } = {}): string {
  const includeUnit = opts.includeUnit !== false;
  if (typeof credits !== 'number' || !isFinite(credits) || credits <= 0) {
    return includeUnit ? '0 credits' : '0';
  }
  let numStr: string;
  if (credits < 0.01) {
    numStr = credits.toFixed(4).replace(/0+$/, '').replace(/\.$/, '');
  } else if (credits % 1 === 0) {
    numStr = credits.toFixed(0);
  } else {
    numStr = credits.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
  }
  if (!includeUnit) return numStr;
  return credits === 1 ? '1 credit' : `${numStr} credits`;
}

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

export interface PikRouterTopupOptions {
  token?: string;
  clientId?: string;
  redirectUri?: string;
  topupUrl?: string;
}

/**
 * Builds the PikRouter Top Up URL.
 * When user clicks "Top Up" or runs out of credits:
 * https://pikrouter.pikpam.com/oauth/topup?client_id=YOUR_CLIENT_ID&token=${userToken}&redirect_uri=${encodeURIComponent('https://your-app.com/dashboard')}
 */
export function buildPikRouterTopupUrl(opts: PikRouterTopupOptions = {}): string {
  const topupUrl = opts.topupUrl ?? DEFAULT_PIKROUTER_TOPUP_URL;
  const clientId = opts.clientId ?? DEFAULT_PIKROUTER_OAUTH_CLIENT_ID;
  const browserOrigin = (globalThis as unknown as { location?: { origin?: string } }).location?.origin;
  const redirectUri = opts.redirectUri ?? (browserOrigin ? `${browserOrigin}/` : 'https://pikpam.com/');
  const env = typeof process !== 'undefined' && process?.env ? mergedEnv() : {};
  const token =
    opts.token ??
    (typeof localStorage !== 'undefined' ? localStorage.getItem('auth_token') ?? undefined : undefined) ??
    env['HERMES_PIKROUTER_API_KEY'] ??
    env['PIKROUTER_API_KEY'] ??
    env['PIKROUTER_TOKEN'];

  const url = new URL(topupUrl);
  url.searchParams.set('client_id', clientId);
  if (token) url.searchParams.set('token', token);
  url.searchParams.set('redirect_uri', redirectUri);
  return url.toString();
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
  /** Model window for the pi registration. Resolved from the live catalog when
   *  omitted, and clamped to Gitu's prompt ceiling by `piProviderConfig`. */
  contextWindow?: number;
}

/**
 * The pi registration target for a PikRouter token client. PikRouter always
 * runs through pi, so its registration needs the same model window `resolveLlm`
 * supplies; without it pi falls back to 128k and compacts at the wrong point.
 */
export function pikRouterPiTarget(
  opts: PikRouterClientOptions,
  model: string,
  baseUrl: string,
  apiKey: string,
): PiModelTarget {
  return {
    providerId: 'gitu-pikrouter',
    label: 'PikRouter (pikrouter.pikpam.com, OpenAI-compatible)',
    baseUrl,
    apiKey,
    modelId: model,
    vision: false,
    contextWindow: opts.contextWindow ?? modelMetadataFor(peekModelCatalog(), 'pikrouter', model)?.contextTokens,
  };
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

export interface FetchPikRouterCreditsOptions {
  token?: string;
  creditsUrl?: string;
  signal?: AbortSignal;
}

/**
 * Fetches the user's current credit balance and usage from the PikRouter API.
 */
export async function fetchPikRouterCredits(
  opts: FetchPikRouterCreditsOptions = {},
): Promise<PikRouterCreditsResponse> {
  const env = typeof process !== 'undefined' && process?.env ? mergedEnv() : {};
  const token =
    opts.token ??
    (typeof localStorage !== 'undefined' ? localStorage.getItem('auth_token') : null) ??
    env['HERMES_PIKROUTER_API_KEY'] ??
    env['PIKROUTER_API_KEY'] ??
    env['PIKROUTER_TOKEN'];

  if (!token) {
    throw new Error('PikRouter authentication token is required to fetch credits.');
  }

  const creditsUrl = opts.creditsUrl ?? DEFAULT_PIKROUTER_CREDITS_URL;
  const res = await fetch(creditsUrl, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
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
    throw new Error(`Failed to fetch PikRouter credits (${res.status}): ${message}`);
  }

  const data = (await res.json()) as {
    credits?: PikRouterCreditsInfo;
    usage?: PikRouterUsageInfo;
  };

  if (!data || !data.credits || typeof data.credits.balance !== 'number') {
    throw new Error('Invalid response received from PikRouter credits endpoint.');
  }

  return {
    ok: true,
    credits: {
      balance: data.credits.balance,
      available: data.credits.available ?? data.credits.balance,
      usdValue: data.credits.usdValue ?? (data.credits.balance / PIKROUTER_CREDITS_PER_USD),
      currencyFormatted: data.credits.currencyFormatted,
      creditRate: data.credits.creditRate ?? '100 Credits = $1.00 USD',
    },
    usage: data.usage,
  };
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
          target: pikRouterPiTarget(opts, model, baseUrl, token),
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
