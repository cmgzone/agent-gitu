import { createHash } from 'node:crypto';

/** Field definitions are public metadata. Values live only in the encrypted key vault. */
export interface CredentialField {
  id: string; label: string; secret: boolean; required: boolean;
  inputType?: 'text' | 'email' | 'password'; header?: string; prefix?: string;
}
export interface StructuredConnectionAuth {
  type: 'basic' | 'headers' | 'oauth2'; fields: CredentialField[];
  usernameField?: string; passwordField?: string; tokenPath?: string; tokenUrl?: string; scope?: string;
  grantType?: 'client_credentials' | 'password';
  clientAuthentication?: 'body' | 'basic';
}
export const CONTABO_TOKEN_URL = 'https://auth.contabo.com/auth/realms/contabo/protocol/openid-connect/token';

/** Correct the existing Contabo profile in place. Keep field IDs so its saved
 * vault entry, connection ID, operations and resource grants remain usable. */
export function providerAuthConfiguration(baseUrl: string | undefined, input: unknown): unknown {
  const raw = input as StructuredConnectionAuth | undefined;
  if (baseUrl !== 'https://api.contabo.com' || raw?.type !== 'oauth2' || !Array.isArray(raw.fields)) return input;
  const fields = [...raw.fields];
  const select = (configured: string | undefined, aliases: string[], fallback: CredentialField) => {
    const found = fields.find(f => f.id === configured) ?? aliases.map(id => fields.find(f => f.id === id)).find(Boolean);
    if (found) return found.id;
    fields.push(fallback); return fallback.id;
  };
  const usernameField = select(raw.usernameField, ['username', 'api_username', 'api_user', 'email'], { id: 'username', label: 'API username', secret: false, required: true, inputType: 'email' });
  const passwordField = select(raw.passwordField, ['password', 'api_password', 'api_pass'], { id: 'password', label: 'API password', secret: true, required: true, inputType: 'password' });
  return { ...raw, fields, grantType: 'password', clientAuthentication: 'body', tokenPath: undefined, tokenUrl: CONTABO_TOKEN_URL, usernameField, passwordField };
}

export type AuthenticationErrorCode = 'INVALID_CREDENTIALS' | 'TOKEN_ENDPOINT_FAILED' | 'NETWORK_ERROR' | 'CONFIG_INVALID' | 'TOKEN_RESPONSE_INVALID';
export class ConnectionAuthenticationError extends Error {
  constructor(readonly code: AuthenticationErrorCode, message: string) { super(message); this.name = 'ConnectionAuthenticationError'; }
}
const configError = (message: string) => new ConnectionAuthenticationError('CONFIG_INVALID', 'OAuth configuration error: ' + message);

function normalizedTokenUrl(value: string): string {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || !url.hostname || url.pathname === '/') throw Error();
    return url.href;
  } catch { throw configError('Use a documented HTTPS token URL without credentials, query parameters or fragments.'); }
}
export function isStructuredAuth(value: { type: string } | undefined): value is StructuredConnectionAuth {
  return !!value && ['basic', 'headers', 'oauth2'].includes(value.type);
}
const validHeader = (value: string) => /^[a-z][a-z0-9-]{0,79}$/i.test(value) && !/^(?:host|cookie|set-cookie|connection|content-type|content-length|transfer-encoding|accept|origin|referer|proxy-.*|sec-.*)$/i.test(value);
export function normalizeStructuredAuth(input: unknown): StructuredConnectionAuth {
  const raw = input as StructuredConnectionAuth;
  if (!raw || !['basic', 'headers', 'oauth2'].includes(raw.type) || !Array.isArray(raw.fields) || !raw.fields.length || raw.fields.length > 12) throw Error('Define the service’s required credential fields.');
  const fields = raw.fields.map(field => {
    if (!/^[a-z][a-z0-9_]{0,63}$/i.test(field.id) || typeof field.label !== 'string' || !field.label.trim() || field.label.length > 100) throw Error('Credential fields need a stable name and label.');
    if (field.header && !validHeader(field.header)) throw Error('Use a valid authentication header.');
    if (field.prefix && !/^[a-z][a-z0-9_-]{0,31}$/i.test(field.prefix)) throw Error('Use a valid authentication scheme prefix.');
    if (raw.type === 'headers' && !field.header) throw Error('Each credential needs its documented authentication header.');
    return { id: field.id, label: field.label.trim(), secret: /secret|password|token|api_?key/i.test(field.id) || field.inputType === 'password' || field.secret !== false, required: field.required !== false,
      ...(field.inputType && ['text', 'email', 'password'].includes(field.inputType) ? { inputType: field.inputType } : {}), ...(field.header ? { header: field.header } : {}), ...(field.prefix ? { prefix: field.prefix } : {}) };
  });
  if (new Set(fields.map(f => f.id)).size !== fields.length || new Set(fields.filter(f => f.header).map(f => f.header!.toLowerCase())).size !== fields.filter(f => f.header).length) throw Error('Credential field names and headers must be unique.');
  if (raw.type === 'basic' && (!fields.some(f => f.id === raw.usernameField) || !fields.some(f => f.id === raw.passwordField) || raw.usernameField === raw.passwordField)) throw Error('Choose the username and password fields for Basic authentication.');
  if (raw.type === 'oauth2') {
    if (!fields.some(f => f.id === 'client_id') || !fields.some(f => f.id === 'client_secret') || fields.some(f => ['grant_type', 'scope', 'refresh_token'].includes(f.id))) throw configError('Define client_id and client_secret as credential fields; grant, scope and refresh tokens are managed by Gitu.');
    if (raw.tokenUrl && raw.tokenPath) throw configError('Choose tokenUrl or tokenPath, not both.');
    if (raw.tokenUrl !== undefined) normalizedTokenUrl(raw.tokenUrl);
    else if (typeof raw.tokenPath !== 'string' || !/^\/(?!\/)[a-zA-Z0-9/_.-]+$/.test(raw.tokenPath) || raw.tokenPath.split('/').includes('..')) throw configError('Set a documented tokenPath or HTTPS tokenUrl.');
    if (raw.grantType !== undefined && !['client_credentials', 'password'].includes(raw.grantType)) throw configError('This OAuth grant is not supported. Choose client_credentials or password.');
    if (raw.clientAuthentication !== undefined && !['body', 'basic'].includes(raw.clientAuthentication)) throw configError('Choose body or basic client authentication.');
    if (raw.grantType === 'password' && (!fields.some(f => f.id === (raw.usernameField ?? 'username')) || !fields.some(f => f.id === (raw.passwordField ?? 'password')) || (raw.usernameField ?? 'username') === (raw.passwordField ?? 'password'))) throw configError('Password grant requires API username and API password fields.');
    if (raw.grantType === 'password' && [raw.usernameField ?? 'username', raw.passwordField ?? 'password'].some(id => ['client_id', 'client_secret'].includes(id))) throw configError('API username/password must be separate from client credentials.');
    for (const field of fields) if (['client_id', 'client_secret', ...(raw.grantType === 'password' ? [raw.usernameField ?? 'username', raw.passwordField ?? 'password'] : [])].includes(field.id)) field.required = true;
  }
  if (raw.scope !== undefined && (typeof raw.scope !== 'string' || raw.scope.length > 1000 || /[\x00-\x1f]/.test(raw.scope))) throw Error('Provide a valid OAuth scope.');
  return { type: raw.type, fields, ...(raw.type === 'basic' ? { usernameField: raw.usernameField, passwordField: raw.passwordField } : {}), ...(raw.type === 'oauth2' ? {
    ...(raw.tokenUrl ? { tokenUrl: normalizedTokenUrl(raw.tokenUrl) } : { tokenPath: raw.tokenPath }),
    ...(raw.grantType ? { grantType: raw.grantType } : {}), ...(raw.clientAuthentication ? { clientAuthentication: raw.clientAuthentication } : {}),
    ...(raw.grantType === 'password' ? { usernameField: raw.usernameField ?? 'username', passwordField: raw.passwordField ?? 'password' } : {}), ...(raw.scope ? { scope: raw.scope } : {}) } : {}) };
}
export function encodeStructuredCredentials(auth: StructuredConnectionAuth, value: unknown): string {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('Complete the service credential fields.');
  const raw = value as Record<string, unknown>, values: Record<string, string> = Object.create(null);
  if (Object.keys(raw).some(key => !auth.fields.some(field => field.id === key))) throw Error('Unexpected credential field.');
  for (const field of auth.fields) {
    const item = raw[field.id] ?? '';
    if (typeof item !== 'string' || item.length > 8192 || /[\x00-\x1f\x7f]/.test(item) || field.required && !item) throw Error('Complete all required credential fields using valid values.');
    if (field.inputType === 'email' && item && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(item)) throw Error('Enter a valid email address.');
    if (auth.type === 'basic' && field.id === auth.usernameField && item.includes(':')) throw Error('Basic authentication usernames cannot contain a colon.');
    values[field.id] = item;
  }
  const encoded = JSON.stringify(values);
  if (encoded.length > 16384) throw Error('The credential fields are too large.');
  return encoded;
}
export function structuredSecrets(auth: StructuredConnectionAuth, encoded: string): string[] {
  const values = decode(auth, encoded);
  return [encoded, ...Object.values(values).filter(Boolean), ...(auth.type === 'basic' ? [Buffer.from(values[auth.usernameField!] + ':' + values[auth.passwordField!]).toString('base64')] : [])];
}
type OAuthSession = { accessToken: string; refreshToken?: string; expiresAt: number; refreshExpiresAt: number; secrets: string[] };
const oauthSessions = new Map<string, OAuthSession>();
const oauthRequests = new Map<string, Promise<OAuthSession>>();
const sessionKey = (auth: StructuredConnectionAuth, encoded: string, baseUrl: string, scope: string) => createHash('sha256').update(JSON.stringify([scope, baseUrl, auth, encoded])).digest('hex');

export function invalidateStructuredAuth(auth: StructuredConnectionAuth, encoded: string, baseUrl: string, scope: string, rejectedAuthorization?: string): void {
  const session = oauthSessions.get(sessionKey(auth, encoded, baseUrl, scope));
  if (session && (!rejectedAuthorization || rejectedAuthorization === 'Bearer ' + session.accessToken)) session.expiresAt = 0;
}

async function tokenResponse(response: Response): Promise<Record<string, unknown>> {
  if (!response.body) return {};
  const reader = response.body.getReader(), chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const next = await reader.read(); if (next.done) break;
      size += next.value.byteLength;
      if (size > 65536) { await reader.cancel(); throw new ConnectionAuthenticationError('TOKEN_RESPONSE_INVALID', 'OAuth token endpoint returned an oversized response.'); }
      chunks.push(next.value);
    }
    const data: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    return data && typeof data === 'object' && !Array.isArray(data) ? data as Record<string, unknown> : {};
  } catch (error) {
    if (error instanceof ConnectionAuthenticationError) throw error;
    throw new ConnectionAuthenticationError('TOKEN_RESPONSE_INVALID', 'OAuth token endpoint returned an unreadable response.');
  } finally { reader.releaseLock(); }
}

async function oauthToken(auth: StructuredConnectionAuth, encoded: string, baseUrl: string, fetcher: (url: string | URL, options: RequestInit) => Promise<Response>, scope: string): Promise<OAuthSession> {
  const key = sessionKey(auth, encoded, baseUrl, scope), existing = oauthSessions.get(key), now = Date.now();
  if (existing && existing.expiresAt > now) return existing;
  const pending = oauthRequests.get(key); if (pending) return pending;
  const work = (async () => {
    const origin = new URL(baseUrl);
    if (origin.protocol !== 'https:') throw configError('OAuth credential exchange requires HTTPS.');
    const endpoint = auth.tokenUrl ? normalizedTokenUrl(auth.tokenUrl) : new URL(auth.tokenPath!, origin.origin).href;
    const values = decode(auth, encoded);
    const exchange = async (refresh?: string): Promise<OAuthSession> => {
      const body = new URLSearchParams();
      if (refresh) { body.set('grant_type', 'refresh_token'); body.set('refresh_token', refresh); }
      else {
        body.set('grant_type', auth.grantType ?? 'client_credentials');
        if (auth.grantType === 'password') {
          body.set('username', values[auth.usernameField ?? 'username']!);
          body.set('password', values[auth.passwordField ?? 'password']!);
        }
        for (const [name, value] of Object.entries(values)) if (name !== auth.usernameField && name !== auth.passwordField && !(auth.grantType === 'password' && ['username', 'password'].includes(name))) body.set(name, value);
        if (auth.scope) body.set('scope', auth.scope);
      }
      const headers: Record<string, string> = { accept: 'application/json', 'content-type': 'application/x-www-form-urlencoded' };
      if (auth.clientAuthentication === 'basic') {
        const encode = (v: string) => new URLSearchParams({ v }).toString().slice(2);
        headers.authorization = 'Basic ' + Buffer.from(encode(values.client_id!) + ':' + encode(values.client_secret!)).toString('base64');
        body.delete('client_id'); body.delete('client_secret');
      } else { body.set('client_id', values.client_id!); body.set('client_secret', values.client_secret!); }
      let response: Response;
      try { response = await fetcher(endpoint, { method: 'POST', headers, body: body.toString(), redirect: 'error', signal: AbortSignal.timeout(30000) }); }
      catch { throw new ConnectionAuthenticationError('NETWORK_ERROR', 'OAuth token request failed to connect, timed out, or encountered a redirect. Check the token endpoint and network.'); }
      if (!response.ok) {
        const data = await tokenResponse(response).catch(() => ({} as Record<string, unknown>));
        if (data.error === 'invalid_grant' || data.error === 'invalid_client' || response.status === 401) {
          throw new ConnectionAuthenticationError('INVALID_CREDENTIALS', data.error === 'invalid_client' ? 'OAuth client ID or client secret was rejected.' : refresh ? 'OAuth refresh token was rejected or expired.' : 'OAuth API username/password or client credentials were rejected. Use the API password required by the provider.');
        }
        if (['unsupported_grant_type', 'invalid_scope', 'invalid_request', 'unauthorized_client'].includes(String(data.error)) || [301, 302, 303, 307, 308, 404, 405].includes(response.status)) throw configError('The token endpoint, grant type, scope or client authentication settings were rejected.');
        throw new ConnectionAuthenticationError('TOKEN_ENDPOINT_FAILED', `OAuth token endpoint failed (HTTP ${response.status}). Try again when the authentication service is available.`);
      }
      const data = await tokenResponse(response);
      const validToken = (v: unknown): v is string => typeof v === 'string' && !!v && v.length <= 16384 && !/\s|[\x00-\x1f\x7f]/.test(v);
      if (!validToken(data.access_token) || data.token_type && String(data.token_type).toLowerCase() !== 'bearer') throw new ConnectionAuthenticationError('TOKEN_RESPONSE_INVALID', 'OAuth token endpoint did not return a usable Bearer access token.');
      const seconds = (v: unknown) => typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.min(v, 86400 * 30) : 0;
      const lifetime = seconds(data.expires_in), refreshLifetime = seconds(data.refresh_expires_in ?? data.refresh_token_expires_in);
      const refreshToken = validToken(data.refresh_token) ? data.refresh_token : refresh ? existing?.refreshToken : undefined;
      const secrets = [...(existing?.secrets ?? []), data.access_token, ...(refreshToken ? [refreshToken] : [])].slice(-16);
      return { accessToken: data.access_token, ...(refreshToken ? { refreshToken } : {}), expiresAt: Date.now() + Math.max(0, lifetime - Math.min(30, lifetime * .1)) * 1000, refreshExpiresAt: refreshToken ? refreshLifetime ? Date.now() + refreshLifetime * 1000 : refresh && !data.refresh_token ? existing!.refreshExpiresAt : Infinity : 0, secrets };
    };
    let session: OAuthSession;
    if (existing?.refreshToken && existing.refreshExpiresAt > now) {
      try { session = await exchange(existing.refreshToken); }
      catch (error) {
        if (!(error instanceof ConnectionAuthenticationError) || error.code !== 'INVALID_CREDENTIALS') throw error;
        session = await exchange();
      }
    } else session = await exchange();
    if (oauthSessions.size >= 128) oauthSessions.delete(oauthSessions.keys().next().value!);
    oauthSessions.set(key, session); return session;
  })();
  oauthRequests.set(key, work);
  try { return await work; } finally { oauthRequests.delete(key); }
}

export async function structuredAuthHeaders(auth: StructuredConnectionAuth, encoded: string, baseUrl: string, fetcher: (url: string | URL, options: RequestInit) => Promise<Response>, secrets: string[], scope = ''): Promise<Record<string, string>> {
  const values = decode(auth, encoded);
  const headers: Record<string, string> = {};
  for (const field of auth.fields) if (field.header && values[field.id]) headers[field.header] = field.prefix ? field.prefix + ' ' + values[field.id] : values[field.id]!;
  if (auth.type === 'basic') headers.authorization = 'Basic ' + Buffer.from(values[auth.usernameField!] + ':' + values[auth.passwordField!]).toString('base64');
  if (auth.type === 'oauth2') {
    const session = await oauthToken(auth, encoded, baseUrl, fetcher, scope);
    secrets.push(...session.secrets); headers.authorization = 'Bearer ' + session.accessToken;
  }
  return headers;
}

function decode(auth: StructuredConnectionAuth, encoded: string): Record<string,string> {
  try { return JSON.parse(encodeStructuredCredentials(auth,JSON.parse(encoded))); }
  catch { throw configError('The saved credentials do not match the required named fields. Update them through the secure credential card.'); }
}
