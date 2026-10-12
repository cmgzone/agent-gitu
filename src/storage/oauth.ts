import { randomBytes, createHash, randomUUID } from 'node:crypto';
import type { SecretVault } from '../connections/secret-vault.js';
import type { StorageConnection } from './types.js';
export interface StorageSecret {
  /** Changes only when the owner replaces credentials or authorizes an account. */
  authorityId?: string;
  accessToken?: string;
  refreshToken?: string;
  clientId?: string;
  clientSecret?: string;
  expiresAt?: number;
  state?: string;
  verifier?: string;
  redirectUri?: string;
  authCreatedAt?: number;
  accessKeyId?: string;
  secretAccessKey?: string;
  sessionToken?: string;
}
const providers = {
  'google-drive': { authorize: 'https://accounts.google.com/o/oauth2/v2/auth', token: 'https://oauth2.googleapis.com/token', scope: 'https://www.googleapis.com/auth/drive' },
  onedrive: {
    authorize: 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize',
    token: 'https://login.microsoftonline.com/common/oauth2/v2.0/token',
    scope: 'offline_access Files.ReadWrite',
  },
  dropbox: { authorize: 'https://www.dropbox.com/oauth2/authorize', token: 'https://api.dropboxapi.com/oauth2/token', scope: '' },
};
export class StorageOAuth {
  private refreshing = new Map<string, Promise<string>>();
  private revoked = new Set<string>();
  constructor(
    private readonly vault: SecretVault,
    private readonly fetcher: typeof fetch = fetch,
    private readonly beforeAuthorize: (connection: StorageConnection) => void = () => {},
  ) {}
  secret(connection: StorageConnection): StorageSecret {
    if (this.revoked.has(connection.id)) throw new Error('Storage account is disconnected.');
    return this.vault.read<StorageSecret>(connection.id) ?? {};
  }
  save(connection: StorageConnection, secret: StorageSecret): void {
    if (this.revoked.has(connection.id)) throw new Error('Storage account is disconnected.');
    this.vault.save(connection.id, secret);
  }
  revoke(connection: StorageConnection): void {
    this.revoked.add(connection.id);
    this.vault.remove(connection.id);
  }
  begin(connection: StorageConnection, redirectUri: string): string {
    if (!(connection.provider in providers)) throw new Error('This provider does not use OAuth.');
    this.beforeAuthorize(connection);
    const p = providers[connection.provider as keyof typeof providers],
      saved = this.secret(connection);
    if (!saved.clientId) throw new Error('Save an OAuth client ID first.');
    const verifier = randomBytes(32).toString('base64url'),
      state = randomUUID();
    this.save(connection, { ...saved, state, verifier, redirectUri, authCreatedAt: Date.now() });
    const url = new URL(p.authorize);
    url.search = new URLSearchParams({
      client_id: saved.clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      state,
      code_challenge: createHash('sha256').update(verifier).digest('base64url'),
      code_challenge_method: 'S256',
      ...(p.scope ? { scope: p.scope } : {}),
      ...(connection.provider === 'google-drive' ? { access_type: 'offline', prompt: 'consent' } : {}),
      ...(connection.provider === 'dropbox' ? { token_access_type: 'offline' } : {}),
    }).toString();
    return url.href;
  }
  async finish(connection: StorageConnection, code: string, state: string): Promise<void> {
    const saved = this.secret(connection);
    if (!saved.state || saved.state !== state || Date.now() - (saved.authCreatedAt ?? 0) > 600000) throw new Error('Storage authorization expired. Reconnect.');
    this.beforeAuthorize(connection);
    await this.exchange(connection, { grant_type: 'authorization_code', code, redirect_uri: saved.redirectUri ?? '', code_verifier: saved.verifier ?? '' });
  }
  private async exchange(connection: StorageConnection, params: Record<string, string>): Promise<string> {
    const p = providers[connection.provider as keyof typeof providers];
    if (!p) throw new Error('OAuth provider unavailable.');
    const saved = this.secret(connection);
    const response = await this.fetcher(p.token, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ ...params, client_id: saved.clientId ?? '', ...(saved.clientSecret ? { client_secret: saved.clientSecret } : {}) }),
      signal: AbortSignal.timeout(30000),
    });
    if (!response.ok) throw new Error('Storage sign-in expired or was rejected. Reconnect the account.');
    const token = (await response.json()) as { access_token?: string; refresh_token?: string; expires_in?: number };
    if (!token.access_token) throw new Error('Storage sign-in did not return an access token.');
    const current = this.secret(connection),
      authorizing = params['grant_type'] === 'authorization_code';
    if (current.authorityId !== saved.authorityId) throw new Error('Storage credentials changed while authentication was running. Retry with the current account.');
    if (authorizing) {
      this.beforeAuthorize(connection);
      if (current.state !== saved.state) throw new Error('Storage authorization changed. Reconnect the account.');
    }
    this.save(connection, {
      ...current,
      ...(authorizing ? { state: undefined, verifier: undefined, authorityId: randomUUID() } : {}),
      accessToken: token.access_token,
      refreshToken: token.refresh_token ?? (authorizing ? undefined : current.refreshToken),
      expiresAt: Date.now() + (token.expires_in ?? 3600) * 1000,
    });
    return token.access_token;
  }
  async refresh(connection: StorageConnection): Promise<string> {
    const current = this.secret(connection);
    this.save(connection, { ...current, expiresAt: 0 });
    return this.token(connection);
  }
  async token(connection: StorageConnection): Promise<string> {
    const saved = this.secret(connection);
    if (saved.accessToken && (saved.expiresAt === undefined || saved.expiresAt > Date.now() + 60000)) return saved.accessToken;
    if (!saved.refreshToken) throw new Error('Reconnect this storage account.');
    let promise = this.refreshing.get(connection.id);
    if (!promise) {
      promise = this.exchange(connection, { grant_type: 'refresh_token', refresh_token: saved.refreshToken }).finally(() => this.refreshing.delete(connection.id));
      this.refreshing.set(connection.id, promise);
    }
    return promise;
  }
}
