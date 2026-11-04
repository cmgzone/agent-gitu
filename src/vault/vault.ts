import path from 'node:path';
import { SecretVault } from '../connections/secret-vault.js';
import { ensureGituHome } from '../workspace/home.js';

export interface VaultSecretMeta {
  name: string;
  description?: string;
  tags?: string[];
  createdAt: string;
  updatedAt: string;
}

export interface VaultSecretEntry extends VaultSecretMeta {
  value: string;
}

/**
 * Universal encrypted secrets vault for credentials, tokens, and sensitive configuration.
 * Backed by AES-256-GCM and OS-protected master keys.
 */
export class VaultService {
  private readonly vault: SecretVault;

  constructor(vaultRoot?: string) {
    const root = vaultRoot ?? path.join(ensureGituHome().settings, 'Vault');
    this.vault = new SecretVault(root);
  }

  private normalizeName(name: string): string {
    const trimmed = String(name ?? '').trim();
    if (!/^[A-Za-z0-9_-]{1,100}$/.test(trimmed)) {
      throw new Error(`Invalid secret name "${trimmed}". Names may only contain letters, numbers, underscores, and dashes (1-100 characters).`);
    }
    return trimmed;
  }

  set(name: string, value: string, options?: { description?: string; tags?: string[] }): VaultSecretMeta {
    const key = this.normalizeName(name);
    if (typeof value !== 'string' || value.length === 0) {
      throw new Error('Secret value cannot be empty.');
    }
    const existing = this.vault.read<VaultSecretEntry>(key);
    const now = new Date().toISOString();
    const entry: VaultSecretEntry = {
      name: key,
      value,
      description: options?.description !== undefined ? options.description.trim() : existing?.description,
      tags: options?.tags !== undefined ? options.tags.map((t) => t.trim()).filter(Boolean) : existing?.tags,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
    this.vault.save(key, entry);
    return {
      name: entry.name,
      description: entry.description,
      tags: entry.tags,
      createdAt: entry.createdAt,
      updatedAt: entry.updatedAt,
    };
  }

  get(name: string): VaultSecretEntry | undefined {
    const key = this.normalizeName(name);
    return this.vault.read<VaultSecretEntry>(key);
  }

  getValue(name: string): string | undefined {
    return this.get(name)?.value;
  }

  delete(name: string): boolean {
    const key = this.normalizeName(name);
    if (!this.vault.read(key)) return false;
    this.vault.remove(key);
    return true;
  }

  list(): VaultSecretMeta[] {
    const keys = this.vault.list();
    const list: VaultSecretMeta[] = [];
    for (const key of keys) {
      try {
        const entry = this.vault.read<VaultSecretEntry>(key);
        if (entry && entry.name) {
          list.push({
            name: entry.name,
            description: entry.description,
            tags: entry.tags,
            createdAt: entry.createdAt,
            updatedAt: entry.updatedAt,
          });
        }
      } catch {
        // Skip corrupted or unreadable entries
      }
    }
    return list.sort((a, b) => a.name.localeCompare(b.name));
  }

  getAllValues(): Record<string, string> {
    const keys = this.vault.list();
    const values: Record<string, string> = {};
    for (const key of keys) {
      try {
        const entry = this.vault.read<VaultSecretEntry>(key);
        if (entry?.name && typeof entry.value === 'string') {
          values[entry.name] = entry.value;
        }
      } catch {
        // Skip unreadable
      }
    }
    return values;
  }

  redact(text: string): string {
    if (!text || typeof text !== 'string') return text;
    let result = text;
    const values = this.getAllValues();
    for (const [name, val] of Object.entries(values)) {
      if (val && val.length >= 4) {
        result = result.split(val).join(`[REDACTED_SECRET:${name}]`);
      }
    }
    return result;
  }
}

let defaultVault: VaultService | undefined;

export function getVault(): VaultService {
  if (!defaultVault) {
    defaultVault = new VaultService();
  }
  return defaultVault;
}

export function resetVaultForTest(): void {
  defaultVault = undefined;
}
