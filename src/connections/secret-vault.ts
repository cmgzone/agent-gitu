import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { readCredentialJson, writeCredentialFile, withCredentialFileLock } from '../llm/credential-file.js';

/** Owner-managed connector credentials. The agent only receives opaque IDs. */
export class SecretVault {
  private cachedKey?: Buffer;
  constructor(private readonly root: string) {
    mkdirSync(root, { recursive: true });
  }
  private cryptWindows(value: string, decrypt: boolean): string {
    const script =
      'Add-Type -AssemblyName System.Security; $value=[Console]::In.ReadToEnd(); ' +
      (decrypt
        ? '$bytes=[Convert]::FromBase64String($value);[Console]::Out.Write([Text.Encoding]::UTF8.GetString([Security.Cryptography.ProtectedData]::Unprotect($bytes,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser)))'
        : '[Console]::Out.Write([Convert]::ToBase64String([Security.Cryptography.ProtectedData]::Protect([Text.Encoding]::UTF8.GetBytes($value),$null,[Security.Cryptography.DataProtectionScope]::CurrentUser)))');
    return execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], {
      input: value,
      encoding: 'utf8',
      windowsHide: true,
      timeout: 15000,
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
  }
  private key(): Buffer {
    const env = process.env['AGENT_GITU_SECRETS_KEY'];
    if (env) {
      if (!/^[a-f0-9]{64}$/i.test(env)) throw new Error('Invalid server encryption key.');
      return Buffer.from(env, 'hex');
    }
    if (this.cachedKey) return this.cachedKey;
    const file = path.join(this.root, 'master.key');
    if (!existsSync(file)) {
      const key = randomBytes(32).toString('hex'),
        stored = process.platform === 'win32' ? this.cryptWindows(key, false) : key;
      try {
        writeFileSync(file, stored, { mode: 0o600, flag: 'wx' });
        return (this.cachedKey = Buffer.from(key, 'hex'));
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
      }
    }
    const stored = readFileSync(file, 'utf8'),
      value = process.platform === 'win32' ? this.cryptWindows(stored, true) : stored;
    if (!/^[a-f0-9]{64}$/i.test(value)) throw new Error('Connector encryption key is unavailable.');
    return (this.cachedKey = Buffer.from(value, 'hex'));
  }
  private file(id: string): string {
    if (!/^[\w-]{1,150}$/.test(id)) throw new Error('Invalid credential reference.');
    return path.join(this.root, id + '.secret');
  }
  encryptionKey(): Buffer {
    return this.key();
  }
  seal(id: string, value: unknown): { iv: string; tag: string; data: string } {
    const iv = randomBytes(12),
      cipher = createCipheriv('aes-256-gcm', this.key(), iv);
    cipher.setAAD(Buffer.from(id));
    const data = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()]);
    return { iv: iv.toString('hex'), tag: cipher.getAuthTag().toString('hex'), data: data.toString('base64') };
  }
  save(id: string, value: unknown): void {
    writeCredentialFile(this.file(id), JSON.stringify(this.seal(id, value)));
  }
  remove(id: string): void {
    const file = this.file(id);
    withCredentialFileLock(file, () => {
      // Remove both protected copies so recovery cannot restore revoked tokens.
      rmSync(file + '.bak', { force: true });
      rmSync(file, { force: true });
    });
  }
  read<T>(id: string): T | undefined {
    const record = readCredentialJson(this.file(id), (raw) => raw as { iv: string; tag: string; data: string });
    if (!record) return undefined;
    return this.open<T>(id, record);
  }
  open<T>(id: string, record: { iv: string; tag: string; data: string }): T {
    try {
      const decipher = createDecipheriv('aes-256-gcm', this.key(), Buffer.from(record.iv, 'hex'));
      decipher.setAAD(Buffer.from(id));
      decipher.setAuthTag(Buffer.from(record.tag, 'hex'));
      return JSON.parse(Buffer.concat([decipher.update(Buffer.from(record.data, 'base64')), decipher.final()]).toString('utf8')) as T;
    } catch {
      throw new Error('Connector credentials could not be decrypted.');
    }
  }
}
