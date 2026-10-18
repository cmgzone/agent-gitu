import { mkdtempSync, mkdirSync, writeFileSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MailConnections, MailSecretStore } from '../src/connections/mail.js';
import { ensureGituHome } from '../src/workspace/home.js';

type Dpapi = { cryptAsync(value: string, decrypt: boolean): Promise<string>; crypt(value: string, decrypt: boolean): string };
const originalHome = process.env['AGENT_GITU_HOME'];
const record = { id: 'mail-fixture', address: 'fixture@example.com', label: 'Fixture', provider: 'custom', username: 'fixture', password: 'test-only-password', imap: { host: 'imap.example.com', port: 993, secure: true }, smtp: { host: 'smtp.example.com', port: 465, secure: true }, allowSelfSigned: false, createdAt: '2026-10-18T00:00:00Z' };
let file: string;
beforeEach(() => {
  process.env['AGENT_GITU_HOME'] = mkdtempSync(path.join(tmpdir(), 'gitu-mail-dpapi-read-'));
  file = path.join(ensureGituHome().settings, 'mail-accounts.dpapi');
  mkdirSync(path.dirname(file), { recursive: true });
});
afterEach(() => {
  vi.restoreAllMocks();
  if (originalHome === undefined) delete process.env['AGENT_GITU_HOME'];
  else process.env['AGENT_GITU_HOME'] = originalHome;
});

describe('nonblocking mailbox credential reads', () => {
  it('shares a pending Windows decryption and reuses the snapshot across watcher and tool reads', async () => {
    writeFileSync(file, 'encrypted-fixture');
    const secrets = new MailSecretStore('win32');
    let finish!: (text: string) => void;
    const decrypt = vi.spyOn(secrets as unknown as Dpapi, 'cryptAsync').mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    const sync = vi.spyOn(secrets as unknown as Dpapi, 'crypt').mockImplementation(() => { throw new Error('Synchronous decryption blocks the engine'); });
    const mail = new MailConnections(secrets);
    const pending = Promise.all([mail.accounts(), mail.accounts(), secrets.readAsync()]);
    await new Promise(resolve => setTimeout(resolve, 1));
    expect(decrypt).toHaveBeenCalledTimes(1);
    finish(JSON.stringify([record]));
    await pending;
    for (let i = 0; i < 5; i++) expect(await mail.accounts()).toMatchObject([{ id: record.id }]);
    const copy = secrets.read()!;
    copy[0]!.watchInbox = false;
    expect(secrets.read()![0]!.watchInbox).toBeUndefined();
    expect(decrypt).toHaveBeenCalledTimes(1);
    expect(sync).not.toHaveBeenCalled();
  });

  it('invalidates credentials on external changes, removal and data-home switches', async () => {
    writeFileSync(file, 'first');
    const secrets = new MailSecretStore('win32');
    const decrypt = vi.spyOn(secrets as unknown as Dpapi, 'cryptAsync').mockImplementation(async raw => JSON.stringify([{ ...record, label: raw }]));
    expect((await secrets.readAsync())![0]!.label).toBe('first');
    writeFileSync(file, 'replacement');
    expect((await secrets.readAsync())![0]!.label).toBe('replacement');
    unlinkSync(file);
    expect(await secrets.readAsync()).toBeUndefined();
    process.env['AGENT_GITU_HOME'] = mkdtempSync(path.join(tmpdir(), 'gitu-mail-other-owner-'));
    const other = path.join(ensureGituHome().settings, 'mail-accounts.dpapi');
    writeFileSync(other, 'replacement');
    expect((await secrets.readAsync())![0]!.label).toBe('replacement');
    expect(decrypt).toHaveBeenCalledTimes(3);
  });

  it('does not restore an account disconnected while DPAPI was still reading it', async () => {
    writeFileSync(file, 'old');
    const secrets = new MailSecretStore('win32');
    let finish!: (text: string) => void;
    const decrypt = vi.spyOn(secrets as unknown as Dpapi, 'cryptAsync').mockImplementationOnce(() => new Promise(resolve => { finish = resolve; })).mockResolvedValue('[]');
    const pending = secrets.readAsync();
    writeFileSync(file, 'disconnected');
    finish(JSON.stringify([record]));
    expect(await pending).toEqual([]);
    expect(await secrets.readAsync()).toEqual([]);
    expect(decrypt).toHaveBeenCalledTimes(2);
  });

  it('retries failed decryptions instead of returning an earlier cached account', async () => {
    writeFileSync(file, 'valid');
    const secrets = new MailSecretStore('win32');
    const decrypt = vi.spyOn(secrets as unknown as Dpapi, 'cryptAsync').mockResolvedValueOnce(JSON.stringify([record])).mockRejectedValueOnce(new Error('Locked')).mockResolvedValueOnce('[]');
    expect(await secrets.readAsync()).toHaveLength(1);
    writeFileSync(file, 'new-envelope');
    await expect(secrets.readAsync()).rejects.toThrow('Locked');
    expect(await secrets.readAsync()).toEqual([]);
    expect(decrypt).toHaveBeenCalledTimes(3);
  });

  it.runIf(process.platform === 'win32')('keeps timers responsive while real Windows DPAPI opens an encrypted store', async () => {
    const writer = new MailSecretStore('win32');
    writer.save([record]);
    const reader = new MailSecretStore('win32');
    let opened = false;
    const pending = reader.readAsync().then(value => { opened = true; return value; });
    await new Promise(resolve => setTimeout(resolve, 10));
    expect(opened).toBe(false);
    expect(await pending).toMatchObject([{ id: record.id }]);
    expect(await reader.readAsync()).toMatchObject([{ id: record.id }]);
  }, 45_000);
});
