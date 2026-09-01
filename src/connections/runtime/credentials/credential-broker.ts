import { loadStoredKeys } from '../../../llm/keys.js';

/**
 * The CredentialBroker — MANDATORY for execution. Every authenticated request
 * flows: capability id + semantic parameters → executor → broker → request.
 * The model can never see, receive, or infer a raw credential; the broker is
 * the only component that touches secrets, and connection credentials are
 * distinct from any repository environment variable.
 */

export interface AuthMaterial {
  headers: Record<string, string>;
  /** Exact secret strings that must never appear in any model-facing trace. */
  secrets: string[];
}

export interface CredentialBroker {
  authFor(connectionId: string): Promise<AuthMaterial>;
}

/** Replace every known secret occurrence with a redaction marker. */
export function scrub(text: string, secrets: string[]): string {
  let out = text;
  for (const secret of secrets) {
    if (secret && secret.length > 0) out = out.split(secret).join('<redacted>');
  }
  return out;
}

export interface VaultBrokerOptions {
  /** Override the vault lookup (tests, custom vaults). Default: Gitu key vault. */
  readSecret?: (connectionId: string) => string | undefined;
  headerName?: string;
  scheme?: string;
}

function vaultKeyRef(connectionId: string): string {
  return `GITU_CONNECTION_${connectionId.toUpperCase().replace(/-/g, '_')}`;
}

/** Broker backed by the Gitu credential vault (Settings/keys.json). */
export class VaultCredentialBroker implements CredentialBroker {
  constructor(private options?: VaultBrokerOptions) {}

  async authFor(connectionId: string): Promise<AuthMaterial> {
    const secret = this.options?.readSecret ? this.options.readSecret(connectionId) : loadStoredKeys()[vaultKeyRef(connectionId)];
    if (!secret) throw new Error(`No stored credential for connection "${connectionId}". Configure it through the connection vault; credentials are never taken from the model, the repository, or the environment.`);
    const headerName = this.options?.headerName ?? 'authorization';
    const scheme = this.options?.scheme ?? 'Bearer';
    const value = scheme ? `${scheme} ${secret}` : secret;
    return { headers: { [headerName]: value }, secrets: [secret] };
  }
}
