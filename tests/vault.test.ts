import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { VaultService, getVault, resetVaultForTest } from '../src/vault/vault.js';
import { mergedEnv } from '../src/llm/keys.js';
import { HermesServer } from '../src/server/server.js';
import { ScriptedMockLlm } from '../src/llm/llm.js';

describe('VaultService', () => {
  const homes: string[] = [];
  const servers: HermesServer[] = [];
  const prevHome = process.env['AGENT_GITU_HOME'];
  const prevKey = process.env['AGENT_GITU_SECRETS_KEY'];

  beforeEach(() => {
    // 64 hex characters (32 bytes) allows SecretVault to run fast in-memory crypto
    process.env['AGENT_GITU_SECRETS_KEY'] = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
    const tmp = mkdtempSync(path.join(os.tmpdir(), 'gitu-vault-test-'));
    homes.push(tmp);
    process.env['AGENT_GITU_HOME'] = tmp;
    resetVaultForTest();
  });

  afterEach(async () => {
    for (const s of servers.splice(0)) {
      try {
        await s.stop();
      } catch {
        // ignore
      }
    }
    if (prevHome !== undefined) process.env['AGENT_GITU_HOME'] = prevHome;
    else delete process.env['AGENT_GITU_HOME'];
    if (prevKey !== undefined) process.env['AGENT_GITU_SECRETS_KEY'] = prevKey;
    else delete process.env['AGENT_GITU_SECRETS_KEY'];
    resetVaultForTest();
    for (const h of homes.splice(0)) {
      try {
        rmSync(h, { recursive: true, force: true });
      } catch {
        // cleanup
      }
    }
  });

  it('stores and retrieves secrets securely', () => {
    const vault = getVault();
    const meta = vault.set('DATABASE_URL', 'postgres://user:pass@localhost:5432/mydb', {
      description: 'Primary production database connection string',
      tags: ['database', 'production'],
    });

    expect(meta.name).toBe('DATABASE_URL');
    expect(meta.description).toBe('Primary production database connection string');
    expect(meta.tags).toEqual(['database', 'production']);
    expect(meta.createdAt).toBeDefined();
    expect(meta.updatedAt).toBeDefined();

    // Verify getting single secret
    const entry = vault.get('DATABASE_URL');
    expect(entry).toBeDefined();
    expect(entry?.value).toBe('postgres://user:pass@localhost:5432/mydb');
    expect(vault.getValue('DATABASE_URL')).toBe('postgres://user:pass@localhost:5432/mydb');
  });

  it('lists stored secrets without revealing secret values', () => {
    const vault = getVault();
    vault.set('API_KEY', 'secret-api-token-123', { description: 'Main API key' });
    vault.set('SIGNING_SECRET', 'super-secret-hmac-key', { tags: ['auth'] });

    const list = vault.list();
    expect(list.length).toBe(2);
    expect(list.map((s) => s.name)).toEqual(['API_KEY', 'SIGNING_SECRET']);

    // Ensure raw secret values are NEVER present in list()
    for (const item of list) {
      expect((item as Record<string, unknown>)['value']).toBeUndefined();
    }
  });

  it('updates an existing secret while preserving createdAt', async () => {
    const vault = getVault();
    const initial = vault.set('STRIPE_KEY', 'sk_live_old');
    const firstCreatedAt = initial.createdAt;

    await new Promise((r) => setTimeout(r, 10));

    const updated = vault.set('STRIPE_KEY', 'sk_live_new', { description: 'Updated Stripe key' });
    expect(updated.createdAt).toBe(firstCreatedAt);
    expect(vault.getValue('STRIPE_KEY')).toBe('sk_live_new');
    expect(updated.description).toBe('Updated Stripe key');
  });

  it('deletes secrets correctly', () => {
    const vault = getVault();
    vault.set('TEMP_SECRET', 'to-be-deleted');
    expect(vault.getValue('TEMP_SECRET')).toBe('to-be-deleted');

    const deleted = vault.delete('TEMP_SECRET');
    expect(deleted).toBe(true);
    expect(vault.get('TEMP_SECRET')).toBeUndefined();
    expect(vault.delete('TEMP_SECRET')).toBe(false);
  });

  it('validates secret names and values', () => {
    const vault = getVault();
    expect(() => vault.set('', 'val')).toThrow(/Invalid secret name/);
    expect(() => vault.set('invalid name with spaces', 'val')).toThrow(/Invalid secret name/);
    expect(() => vault.set('invalid$symbol!', 'val')).toThrow(/Invalid secret name/);
    expect(() => vault.set('VALID_NAME_123', '')).toThrow(/cannot be empty/);
  });

  it('redacts stored secret values from text outputs', () => {
    const vault = getVault();
    vault.set('TOKEN_A', 'my-super-secret-token-value');
    vault.set('SHORT', 'abc'); // short secrets (< 4 chars) should not be blindly redacted

    const raw = 'Connected with token my-super-secret-token-value successfully. Short is abc.';
    const redacted = vault.redact(raw);

    expect(redacted).toBe('Connected with token [REDACTED_SECRET:TOKEN_A] successfully. Short is abc.');
  });

  it('integrates with mergedEnv() so tools and agents can access vaulted secrets', () => {
    const vault = getVault();
    vault.set('CUSTOM_SERVICE_TOKEN', 'vault-token-xyz-987');

    const env = mergedEnv();
    expect(env['CUSTOM_SERVICE_TOKEN']).toBe('vault-token-xyz-987');
  });

  it('supports API routes: list, create, get, reveal, and delete', async () => {
    const projectDir = mkdtempSync(path.join(os.tmpdir(), 'gitu-vault-proj-'));
    writeFileSync(path.join(projectDir, 'package.json'), JSON.stringify({ name: 'vault-test' }));
    homes.push(projectDir);

    const server = new HermesServer({
      passwordRequired: false,
      autoInstallLsp: false,
      cwd: projectDir,
      port: 0,
      llm: new ScriptedMockLlm([]),
    });
    servers.push(server);
    const port = await server.start();
    const base = `http://127.0.0.1:${port}`;

    // 1. Create a secret via POST /api/vault/secrets
    const postRes = await fetch(`${base}/api/vault/secrets`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name: 'WEBHOOK_KEY',
        value: 'whsec_999888777',
        description: 'Webhook verification key',
        tags: ['webhooks'],
      }),
    });
    expect(postRes.status).toBe(200);
    const postData = await postRes.json();
    expect(postData.ok).toBe(true);
    expect(postData.secret.name).toBe('WEBHOOK_KEY');
    expect(postData.secret.description).toBe('Webhook verification key');

    // 2. List secrets via GET /api/vault/secrets
    const listRes = await fetch(`${base}/api/vault/secrets`);
    expect(listRes.status).toBe(200);
    const listData = await listRes.json();
    expect(Array.isArray(listData.secrets)).toBe(true);
    const found = listData.secrets.find((s: { name: string }) => s.name === 'WEBHOOK_KEY');
    expect(found).toBeDefined();
    expect(found.value).toBeUndefined(); // value is NOT exposed

    // 3. Get secret metadata via GET /api/vault/secrets/WEBHOOK_KEY (without reveal)
    const getRes = await fetch(`${base}/api/vault/secrets/WEBHOOK_KEY`);
    expect(getRes.status).toBe(200);
    const getData = await getRes.json();
    expect(getData.name).toBe('WEBHOOK_KEY');
    expect(getData.value).toBeUndefined();

    // 4. Get secret value with reveal=1
    const revealRes = await fetch(`${base}/api/vault/secrets/WEBHOOK_KEY?reveal=1`);
    expect(revealRes.status).toBe(200);
    const revealData = await revealRes.json();
    expect(revealData.value).toBe('whsec_999888777');

    // 5. Delete secret via DELETE /api/vault/secrets/WEBHOOK_KEY
    const delRes = await fetch(`${base}/api/vault/secrets/WEBHOOK_KEY`, { method: 'DELETE' });
    expect(delRes.status).toBe(200);
    const delData = await delRes.json();
    expect(delData.ok).toBe(true);
    expect(delData.deleted).toBe('WEBHOOK_KEY');

    // 6. Verify 404 after deletion
    const notFoundRes = await fetch(`${base}/api/vault/secrets/WEBHOOK_KEY`);
    expect(notFoundRes.status).toBe(404);
  });
});
