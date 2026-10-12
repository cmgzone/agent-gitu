import { randomUUID } from 'node:crypto';
import type { OAuthClientProvider } from '@modelcontextprotocol/sdk/client/auth.js';
import type { OAuthClientMetadata, OAuthClientInformationMixed, OAuthTokens } from '@modelcontextprotocol/sdk/shared/auth.js';
import type { SecretVault } from '../connections/secret-vault.js';
interface SavedAuth {
  client?: OAuthClientInformationMixed;
  tokens?: OAuthTokens;
  verifier?: string;
  state?: string;
  authorizationUrl?: string;
}
export class McpOAuth implements OAuthClientProvider {
  constructor(
    private readonly vault: SecretVault,
    private readonly id: string,
    readonly redirectUrl: string,
  ) {}
  private read(): SavedAuth {
    return this.vault.read<SavedAuth>(this.id) ?? {};
  }
  private save(patch: Partial<SavedAuth>): void {
    this.vault.save(this.id, { ...this.read(), ...patch });
  }
  get clientMetadata(): OAuthClientMetadata {
    return {
      redirect_uris: [this.redirectUrl],
      client_name: 'Agent Gitu',
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      token_endpoint_auth_method: 'none',
    };
  }
  state(): string {
    const state = randomUUID();
    this.save({ state });
    return state;
  }
  clientInformation(): OAuthClientInformationMixed | undefined {
    return this.read().client;
  }
  saveClientInformation(client: OAuthClientInformationMixed): void {
    this.save({ client });
  }
  tokens(): OAuthTokens | undefined {
    return this.read().tokens;
  }
  saveTokens(tokens: OAuthTokens): void {
    this.save({ tokens, authorizationUrl: undefined });
  }
  redirectToAuthorization(url: URL): void {
    this.save({ authorizationUrl: url.href });
  }
  saveCodeVerifier(verifier: string): void {
    this.save({ verifier });
  }
  codeVerifier(): string {
    const verifier = this.read().verifier;
    if (!verifier) throw new Error('Start MCP authorization again.');
    return verifier;
  }
  authorizationUrl(): string | undefined {
    return this.read().authorizationUrl;
  }
  consumeState(state: string): void {
    const saved = this.read();
    if (!saved.state || saved.state !== state) throw new Error('Invalid MCP authorization state.');
    this.save({ state: undefined });
  }
}
