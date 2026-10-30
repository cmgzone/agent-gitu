/**
 * The ChatGPT subscription, served by pi.
 *
 * pi ships an `openai-codex` provider ("OpenAI (ChatGPT Plus/Pro)") with its
 * own sign-in and model catalog, so the subscription needs no separate local
 * runtime. This module is the one place that talks to pi about the account:
 * who is signed in, which models the plan offers, and the sign-in flow. The
 * credentials live in pi's own `auth.json` under the Gitu home (the same file
 * `PiNativeRuntime` reads when it runs a turn); Gitu never reads or stores the
 * tokens itself, beyond decoding the plan label from the access token.
 */
import { mkdirSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { ensureGituHome } from '../workspace/home.js';
import { loadPiSdk, type PiAuthInteraction, type PiCatalogModel, type PiModelRuntime, type PiSdk } from './pi/sdk.js';

/** pi's id for the ChatGPT Plus/Pro subscription provider. */
export const CHATGPT_PI_PROVIDER = 'openai-codex';

const INFO_TTL_MS = 30_000;
const LOGIN_TIMEOUT_MS = 5 * 60_000;

export interface ChatgptSubscriptionModel {
  id: string;
  displayName?: string;
  vision: boolean;
  effortLevels: string[];
  isDefault: boolean;
  contextTokens?: number;
}

export interface ChatgptSubscriptionInfo {
  available: boolean;
  signedIn: boolean;
  planType?: string;
  models: ChatgptSubscriptionModel[];
  error?: string;
}

export interface ChatgptLoginStart {
  alreadySignedIn: boolean;
  authUrl?: string;
  loginId?: string;
  userCode?: string;
}

/** Injectable for tests; production loads the real SDK and Gitu home. */
export interface PiChatgptDeps {
  loadSdk: () => Promise<PiSdk>;
  authPath: () => string;
}

const defaultDeps: PiChatgptDeps = {
  loadSdk: loadPiSdk,
  authPath: () => path.join(ensureGituHome().root, 'pi', 'auth.json'),
};
let deps: PiChatgptDeps = defaultDeps;

/** Test seam: replace the SDK and auth location, and forget cached state. */
export function configurePiChatgpt(next?: Partial<PiChatgptDeps>): void {
  deps = { ...defaultDeps, ...next };
  infoCache = undefined;
  infoPending = undefined;
  infoGeneration++;
  activeLogin?.abort.abort();
  activeLogin = undefined;
  loginStart = undefined;
}

let infoCache: { expiresAt: number; value: ChatgptSubscriptionInfo } | undefined;
let infoPending: Promise<ChatgptSubscriptionInfo> | undefined;
let infoGeneration = 0;
let loginStart: Promise<ChatgptLoginStart> | undefined;
let activeLogin:
  | {
      loginId: string;
      authUrl: string;
      userCode?: string;
      completion: Promise<boolean>;
      abort: AbortController;
      timeout: NodeJS.Timeout;
    }
  | undefined;

/** The pi model runtime bound to Gitu's stored sign-in (`<home>/pi/auth.json`). */
export async function piModelRuntime(): Promise<PiModelRuntime> {
  const authPath = deps.authPath();
  mkdirSync(path.dirname(authPath), { recursive: true });
  const sdk = await deps.loadSdk();
  return sdk.ModelRuntime.create({ authPath, modelsPath: null, refreshOnCreate: false });
}

const modelRuntime = piModelRuntime;

function invalidate(): void {
  infoCache = undefined;
  infoPending = undefined;
  infoGeneration++;
}

/** Thinking levels the model accepts, in pi's own vocabulary, `off` excluded. */
function effortLevelsOf(model: PiCatalogModel): string[] {
  const map = model.thinkingLevelMap;
  if (!map) return [];
  return Object.entries(map)
    .filter(([level, mapped]) => level !== 'off' && mapped !== null)
    .map(([level]) => level);
}

function toModel(model: PiCatalogModel): ChatgptSubscriptionModel {
  const contextTokens = typeof model.contextWindow === 'number' && model.contextWindow > 0 ? model.contextWindow : undefined;
  return {
    id: model.id,
    ...(model.name ? { displayName: model.name } : {}),
    vision: (model.input ?? []).includes('image'),
    effortLevels: effortLevelsOf(model),
    // The provider spec names the default; the plan does not promote one here.
    isDefault: false,
    ...(contextTokens ? { contextTokens } : {}),
  };
}

/** The plan label (`plus`, `pro`, ...) from the access token's public claims. */
function planFromToken(accessToken: string | undefined): string | undefined {
  const payload = accessToken?.split('.')[1];
  if (!payload) return undefined;
  try {
    const claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as Record<string, unknown>;
    const auth = claims['https://api.openai.com/auth'];
    const plan = auth && typeof auth === 'object' ? (auth as Record<string, unknown>)['chatgpt_plan_type'] : undefined;
    return typeof plan === 'string' && plan ? plan : undefined;
  } catch {
    return undefined;
  }
}

/** Context window pi reports for a subscription model, from the warm cache. */
export function subscriptionModelContextWindow(model: string): number | undefined {
  const tokens = infoCache?.value.models.find((entry) => entry.id === model)?.contextTokens;
  return tokens && Number.isFinite(tokens) && tokens > 0 ? tokens : undefined;
}

export async function chatgptSubscriptionInfo(refresh = false): Promise<ChatgptSubscriptionInfo> {
  if (!refresh && infoCache && Date.now() < infoCache.expiresAt) return infoCache.value;
  if (!refresh && infoPending) return infoPending;
  const generation = ++infoGeneration;
  const work = readInfo(generation);
  infoPending = work;
  try {
    return await work;
  } finally {
    if (infoPending === work) infoPending = undefined;
  }
}

async function readInfo(generation: number): Promise<ChatgptSubscriptionInfo> {
  try {
    const runtime = await modelRuntime();
    const models = runtime
      .getModels(CHATGPT_PI_PROVIDER)
      .map(toModel)
      .sort((a, b) => b.id.localeCompare(a.id));
    const signedIn = (await runtime.listCredentials()).some((credential) => credential.providerId === CHATGPT_PI_PROVIDER && credential.type === 'oauth');
    let planType: string | undefined;
    if (signedIn) {
      try {
        planType = planFromToken((await runtime.getAuth(CHATGPT_PI_PROVIDER))?.auth.apiKey);
      } catch {
        // The plan label is cosmetic; a failed token refresh must not hide the sign-in.
      }
    }
    const value: ChatgptSubscriptionInfo = { available: true, signedIn, ...(planType ? { planType } : {}), models };
    if (generation === infoGeneration) infoCache = { expiresAt: Date.now() + INFO_TTL_MS, value };
    return value;
  } catch (error) {
    const value: ChatgptSubscriptionInfo = { available: true, signedIn: false, models: [], error: (error as Error).message };
    if (generation === infoGeneration) infoCache = { expiresAt: Date.now() + 5_000, value };
    return value;
  }
}

export function chatgptLoginPending(): boolean {
  return Boolean(activeLogin);
}

/** Hosted apps use device authorization; desktops keep the local browser flow. */
export async function startChatgptLogin(): Promise<ChatgptLoginStart> {
  if (loginStart) return loginStart;
  const work = beginLogin();
  loginStart = work;
  try {
    return await work;
  } finally {
    if (loginStart === work) loginStart = undefined;
  }
}

function describe(login: NonNullable<typeof activeLogin>): ChatgptLoginStart {
  return { alreadySignedIn: false, authUrl: login.authUrl, loginId: login.loginId, ...(login.userCode ? { userCode: login.userCode } : {}) };
}

async function beginLogin(): Promise<ChatgptLoginStart> {
  if (activeLogin) return describe(activeLogin);
  if ((await chatgptSubscriptionInfo(true)).signedIn) return { alreadySignedIn: true };

  const runtime = await modelRuntime();
  const hosted = Boolean(process.env['AGENT_GITU_PUBLIC_ORIGIN']);
  const abort = new AbortController();
  const loginId = randomUUID();

  let announce: (instructions: { authUrl: string; userCode?: string }) => void = () => {};
  let failBeforeAnnounce: (error: Error) => void = () => {};
  const announced = new Promise<{ authUrl: string; userCode?: string }>((resolve, reject) => {
    announce = resolve;
    failBeforeAnnounce = reject;
  });

  const interaction: PiAuthInteraction = {
    signal: abort.signal,
    prompt: (request) => {
      if (request.type === 'select') {
        const wanted = hosted ? 'device_code' : 'browser';
        const offered = request.options?.map((option) => option.id) ?? [];
        return Promise.resolve(offered.includes(wanted) ? wanted : (offered[0] ?? wanted));
      }
      // The pasted-code fallback has no surface in the app: the pending sign-in
      // simply waits for the browser callback or the device code, until it ends.
      return new Promise<string>((_resolve, reject) => {
        const cancel = (): void => reject(new Error('Login cancelled'));
        if (abort.signal.aborted || request.signal?.aborted) return cancel();
        abort.signal.addEventListener('abort', cancel, { once: true });
        request.signal?.addEventListener('abort', cancel, { once: true });
      });
    },
    notify: (event) => {
      if (event.type === 'auth_url' && typeof event['url'] === 'string') announce({ authUrl: event['url'] });
      if (event.type === 'device_code' && typeof event['userCode'] === 'string' && typeof event['verificationUri'] === 'string') {
        announce({ authUrl: event['verificationUri'], userCode: event['userCode'] });
      }
    },
  };

  const completion = runtime
    .login(CHATGPT_PI_PROVIDER, 'oauth', interaction, { agentName: 'agent_gitu' })
    .then(() => true)
    .catch((error: unknown) => {
      failBeforeAnnounce(error instanceof Error ? error : new Error(String(error)));
      return false;
    })
    .finally(() => {
      if (activeLogin?.loginId === loginId) {
        clearTimeout(activeLogin.timeout);
        activeLogin = undefined;
      }
      invalidate();
    });

  const timeout = setTimeout(() => abort.abort(), LOGIN_TIMEOUT_MS);
  timeout.unref?.();
  let instructions: { authUrl: string; userCode?: string };
  try {
    instructions = await announced;
  } catch (error) {
    clearTimeout(timeout);
    abort.abort();
    throw new Error(`ChatGPT sign-in could not start: ${(error as Error).message}`);
  }
  activeLogin = { loginId, ...instructions, completion, abort, timeout };
  return describe(activeLogin);
}

/** Wait for a sign-in started by this process to finish. */
export async function waitForChatgptLogin(loginId: string): Promise<boolean> {
  const pending = activeLogin;
  if (pending?.loginId === loginId) return pending.completion;
  return (await chatgptSubscriptionInfo(true)).signedIn;
}

/** Remove the stored ChatGPT sign-in. */
export async function chatgptLogout(): Promise<void> {
  activeLogin?.abort.abort();
  const runtime = await modelRuntime();
  await runtime.logout(CHATGPT_PI_PROVIDER);
  invalidate();
}
