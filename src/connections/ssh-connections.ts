import path from 'node:path';
import { Client } from 'ssh2';
import { loadStoredKeys, removeStoredKey, setStoredKey } from '../llm/keys.js';
import { readJson, writeJson } from '../util.js';
import { ensureGituHome } from '../workspace/home.js';

export interface SshConnectionProfile {
  id: string;
  label: string;
  host: string;
  port: number;
  username: string;
  hostFingerprint: string;
  createdAt: string;
  updatedAt: string;
}

export interface SshConnectionView extends SshConnectionProfile {
  hasCredential: boolean;
}

const TIMEOUT_MS = 15_000;

function displayFingerprint(hexHash: string): string {
  return `SHA256:${Buffer.from(hexHash, 'hex').toString('base64').replace(/=+$/, '')}`;
}

function file(): string {
  return path.join(ensureGituHome().settings, 'ssh-connections.json');
}

function keyRef(id: string): string {
  return `GITU_SSH_PASSWORD_${id.toUpperCase().replace(/[^A-Z0-9]/g, '_')}`;
}

export function parseSshUrl(value: string): { host: string; port: number; username: string } {
  let url: URL;
  try { url = new URL(value.trim()); }
  catch { throw new Error('Enter an SSH address like ssh://user@host:22.'); }
  if (url.protocol !== 'ssh:' || !url.hostname || !url.username || url.password || url.search || url.hash || (url.pathname !== '/' && url.pathname !== '')) {
    throw new Error('SSH address must be ssh://user@host:port, without a password, path, or query.');
  }
  const port = url.port ? Number(url.port) : 22;
  if (!Number.isInteger(port) || port < 1 || port > 65_535) throw new Error('SSH port must be between 1 and 65535.');
  const username = decodeURIComponent(url.username);
  if (!username || /[\x00-\x1f\x7f]/.test(username)) throw new Error('SSH username is invalid.');
  return { host: url.hostname.replace(/^\[|\]$/g, ''), port, username };
}

function sshError(error: unknown): Error {
  const message = String((error as Error)?.message ?? 'SSH connection failed.');
  // ssh2 errors normally omit secrets. Keep only known, bounded diagnostics.
  if (/All configured authentication methods failed|authentication failed/i.test(message)) return new Error('SSH authentication failed. Check the username, password, and server authentication settings.');
  if (/host verification failed/i.test(message)) return new Error('SSH host key changed or does not match the confirmed fingerprint.');
  if (/timeout|timed out/i.test(message)) return new Error('SSH connection timed out. Check the host, port, and network.');
  if (/ECONNREFUSED/i.test(message)) return new Error('SSH connection was refused. Check the host and port.');
  if (/ENOTFOUND|EAI_AGAIN/i.test(message)) return new Error('SSH host could not be resolved.');
  return new Error('SSH connection failed. Check the host, port, and server settings.');
}

/** Read the server key without sending a credential. The user must confirm it. */
export function probeSshHost(baseUrl: string): Promise<string> {
  const target = parseSshUrl(baseUrl);
  return new Promise((resolve, reject) => {
    const client = new Client();
    let fingerprint = '';
    let settled = false;
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      client.end();
      if (fingerprint) resolve(displayFingerprint(fingerprint));
      else reject(error ?? new Error('Could not read the SSH host key.'));
    };
    client.once('error', (error) => finish(sshError(error)));
    client.once('close', () => finish(new Error('SSH server closed before sending a host key.')));
    client.connect({ ...target, password: '', readyTimeout: TIMEOUT_MS, hostHash: 'sha256', hostVerifier: (hash: string) => {
      fingerprint = hash;
      return false;
    } });
  });
}

function openSsh(profile: Pick<SshConnectionProfile, 'host' | 'port' | 'username' | 'hostFingerprint'>, password: string): Promise<Client> {
  return new Promise((resolve, reject) => {
    const client = new Client();
    let settled = false;
    let hostKeyMismatch = false;
    const fail = (error: unknown) => {
      if (settled) return;
      settled = true;
      client.end();
      reject(hostKeyMismatch ? new Error('SSH host key changed or does not match the confirmed fingerprint.') : sshError(error));
    };
    client.once('ready', () => { settled = true; resolve(client); });
    client.once('error', fail);
    client.once('close', () => { if (!settled) fail(new Error('SSH connection closed.')); });
    client.on('keyboard-interactive', (_name, _instructions, _lang, prompts, done) => {
      done(prompts.length === 1 ? [password] : prompts.map(() => ''));
    });
    client.connect({
      host: profile.host, port: profile.port, username: profile.username, password,
      tryKeyboard: true, readyTimeout: TIMEOUT_MS, hostHash: 'sha256',
      hostVerifier: (hash: string) => {
        hostKeyMismatch = profile.hostFingerprint !== displayFingerprint(hash);
        return !hostKeyMismatch;
      },
    });
  });
}

export class SshConnectionRegistry {
  list(): SshConnectionView[] {
    const raw = readJson<{ connections?: SshConnectionProfile[] }>(file());
    const keys = loadStoredKeys();
    return (Array.isArray(raw?.connections) ? raw.connections : [])
      .filter((profile) => profile && typeof profile.id === 'string' && typeof profile.host === 'string' && typeof profile.hostFingerprint === 'string')
      .map((profile) => ({ ...profile, hasCredential: Boolean(keys[keyRef(profile.id)]) }));
  }

  get(id: string): SshConnectionView | undefined {
    return this.list().find((profile) => profile.id === id);
  }

  renderForAgent(): string {
    const profiles = this.list();
    return profiles.length ? profiles.map((profile) =>
      `- ${profile.id}: ${profile.label} [SSH ${profile.username}@${profile.host}:${profile.port}; credential ${profile.hasCredential ? 'available' : 'missing'}; host key pinned; use ssh_exec only for authorized commands]`,
    ).join('\n') : 'No saved SSH connections.';
  }

  async saveAndValidate(input: { label: string; baseUrl: string; password: string; hostFingerprint: string }): Promise<SshConnectionView> {
    const target = parseSshUrl(input.baseUrl);
    const label = input.label.trim().slice(0, 120);
    const password = input.password;
    const hostFingerprint = input.hostFingerprint.trim();
    if (!label || !password) throw new Error('Connection name and SSH password are required.');
    if (!/^SHA256:[A-Za-z0-9+/]{43}$/.test(hostFingerprint)) throw new Error('Check and confirm the SSH host key first.');
    const connected = await openSsh({ ...target, hostFingerprint }, password);
    connected.end();
    const existing = this.list().find((profile) => profile.host === target.host && profile.port === target.port && profile.username === target.username);
    const id = existing?.id ?? `ssh-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e5).toString(36)}`;
    const now = new Date().toISOString();
    const profile: SshConnectionProfile = { id, label, ...target, hostFingerprint, createdAt: existing?.createdAt ?? now, updatedAt: now };
    const profiles = this.list().filter((item) => item.id !== id).map(({ hasCredential: _hasCredential, ...item }) => item);
    writeJson(file(), { version: 1, connections: [...profiles, profile] });
    setStoredKey(keyRef(id), password);
    return { ...profile, hasCredential: true };
  }

  async execute(id: string, command: string): Promise<{ exitCode: number | null; stdout: string; stderr: string }> {
    const profile = this.get(id);
    if (!profile) throw new Error('Saved SSH connection not found.');
    const password = loadStoredKeys()[keyRef(id)];
    if (!password) throw new Error('Saved SSH password is missing.');
    if (!command.trim() || command.length > 2_000 || /[\x00]/.test(command)) throw new Error('SSH command is empty or too long.');
    const client = await openSsh(profile, password);
    try {
      return await new Promise((resolve, reject) => {
        let done = false;
        let stdout = '';
        let stderr = '';
        const finish = (error?: Error, exitCode: number | null = null) => {
          if (done) return;
          done = true;
          clearTimeout(timer);
          if (error) reject(error); else resolve({ exitCode, stdout, stderr });
        };
        const timer = setTimeout(() => { client.end(); finish(new Error('SSH command timed out after 30 seconds.')); }, 30_000);
        client.exec(command, (error, stream) => {
          if (error) { finish(sshError(error)); return; }
          stream.on('data', (chunk: Buffer) => { stdout += chunk.toString('utf8').slice(0, Math.max(0, 16_000 - stdout.length)); });
          stream.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString('utf8').slice(0, Math.max(0, 8_000 - stderr.length)); });
          stream.on('close', (code: number | null) => finish(undefined, code));
          stream.on('error', (streamError: Error) => finish(sshError(streamError)));
        });
      });
    } finally {
      client.end();
    }
  }

  remove(id: string): boolean {
    const profile = this.get(id);
    if (!profile) return false;
    const profiles = this.list().filter((item) => item.id !== id).map(({ hasCredential: _hasCredential, ...item }) => item);
    writeJson(file(), { version: 1, connections: profiles });
    removeStoredKey(keyRef(id));
    return true;
  }
}
