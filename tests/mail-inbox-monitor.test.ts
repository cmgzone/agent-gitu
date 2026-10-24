import { EventEmitter } from 'node:events';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { ImapFlow } from 'imapflow';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { InboxArrivalJournal, MailInboxMonitor, type InboxArrival } from '../src/connections/mail-inbox-monitor.js';

class InboxClient extends EventEmitter {
  mailbox = { uidValidity: 1n, uidNext: 3, exists: 2 };
  capabilities = new Map([['IDLE', true]]);
  uids = [1, 2];
  connect = vi.fn(async () => {});
  close = vi.fn(() => { this.emit('close'); });
  release = vi.fn();
  getMailboxLock = vi.fn(async () => ({ release: this.release }));
  search = vi.fn(async (_query: unknown, _options: unknown) => [...this.uids]);
  receive(uid: number): void { this.uids.push(uid); this.mailbox.uidNext = uid + 1; this.mailbox.exists++; this.emit('exists', { count: this.mailbox.exists }); }
}
const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => { for (const cleanup of cleanups.splice(0)) await cleanup(); vi.restoreAllMocks(); });
function fixture(options: { file?: string; deliver?: (event: InboxArrival) => Promise<boolean>; client?: () => InboxClient } = {}) {
  const root = options.file ? undefined : mkdtempSync(path.join(os.tmpdir(), 'gitu-inbox-'));
  const file = options.file ?? path.join(root!, 'watch.sqlite');
  const journal = new InboxArrivalJournal(file);
  const clients: InboxClient[] = [];
  let ids = ['mail-own'];
  const deliver = vi.fn(options.deliver ?? (async () => true));
  const monitor = new MailInboxMonitor(journal, async () => ids, () => {
    const client = options.client?.() ?? new InboxClient(); clients.push(client); return client as unknown as ImapFlow;
  }, deliver);
  cleanups.push(async () => { await monitor.stop(); if (root) rmSync(root, { recursive: true, force: true }); });
  return { monitor, journal, clients, deliver, file, ids: (value: string[]) => { ids = value; } };
}
async function ready(f: ReturnType<typeof fixture>): Promise<InboxClient> {
  f.monitor.start();
  await vi.waitFor(() => expect(Object.values(f.monitor.statuses())[0]?.state).toMatch(/listening|polling/));
  return f.clients.at(-1)!;
}

describe('instant native inbox monitoring', () => {
  it('reports an inbox timeout distinctly without exposing the server response or blaming credentials', async () => {
    const f=fixture({client:()=>{const client=new InboxClient();client.connect.mockRejectedValue(Object.assign(new Error('private password must not appear'),{code:'CONNECT_TIMEOUT'}));return client;}});
    f.monitor.start();await vi.waitFor(()=>expect(f.monitor.statuses()['mail-own']?.state).toBe('reconnecting'));
    const status=f.monitor.statuses()['mail-own'];expect(status?.problem?.state).toBe('timeout');
    expect(status?.problem?.message).toContain('credentials were not verified');
    expect(JSON.stringify(status)).not.toContain('private password');
  });
  it('starts at the current inbox, then delivers new UIDs immediately without a timer tick', async () => {
    const f = fixture(), client = await ready(f);
    expect(f.deliver).not.toHaveBeenCalled();
    client.receive(8);
    await vi.waitFor(() => expect(f.deliver).toHaveBeenCalledOnce());
    expect(f.deliver.mock.calls[0]?.[0]).toMatchObject({ accountId: 'mail-own', uid: 8, uidValidity: '1' });
    expect(client.getMailboxLock).toHaveBeenCalledWith('INBOX');
    expect(client.search).toHaveBeenLastCalledWith({ uid: '3:*' }, { uid: true });
    expect(f.journal.pending()).toEqual([]);
  });

  it('deduplicates repeated EXISTS notifications and reversed UID ranges', async () => {
    const f = fixture(), client = await ready(f);
    client.receive(9); client.emit('exists', {}); client.emit('exists', {});
    await vi.waitFor(() => expect(f.deliver).toHaveBeenCalledOnce());
    await f.monitor.refresh();
    client.emit('exists', {});
    await vi.waitFor(() => expect(f.journal.checkpoint('mail-own')?.uid).toBe(9));
    expect(f.deliver).toHaveBeenCalledOnce();
  });

  it('keeps busy deliveries durable across a restart and does not replay them afterwards', async () => {
    const f = fixture({ deliver: async () => false }), client = await ready(f);
    client.receive(10);
    await vi.waitFor(() => expect(f.journal.pending()).toHaveLength(1));
    await f.monitor.stop();
    const resumed = fixture({ file: f.file });
    await ready(resumed); await resumed.monitor.refresh();
    await vi.waitFor(() => expect(resumed.deliver).toHaveBeenCalledOnce());
    expect(resumed.deliver.mock.calls[0]?.[0].uid).toBe(10);
    await resumed.monitor.refresh();
    expect(resumed.deliver).toHaveBeenCalledOnce();
    // Close the second handle before the owner fixture removes its directory.
    await resumed.monitor.stop();
  });

  it('catches up messages arriving during a connection loss using the saved UID', async () => {
    let now = Date.now(); vi.spyOn(Date, 'now').mockImplementation(() => now);
    let created = 0;
    const f = fixture({ client: () => { const client = new InboxClient(); if (created++) { client.uids.push(20); client.mailbox.uidNext = 21; } return client; } });
    const first = await ready(f);
    first.emit('close');
    expect(f.monitor.statuses()['mail-own']?.state).toBe('reconnecting');
    now += 1100; await f.monitor.refresh();
    await vi.waitFor(() => expect(f.deliver).toHaveBeenCalledOnce());
    expect(f.deliver.mock.calls[0]?.[0].uid).toBe(20);
    expect(f.clients).toHaveLength(2);
  });

  it('drops stale-generation arrivals when UIDVALIDITY changes', async () => {
    let now = Date.now(); vi.spyOn(Date, 'now').mockImplementation(() => now);
    let created = 0, busy = true;
    const f = fixture({ deliver: async () => !busy, client: () => { const client = new InboxClient(); if (created++) { client.mailbox.uidValidity = 2n; client.mailbox.uidNext = 100; client.uids = [99]; } return client; } });
    const first = await ready(f); first.receive(7);
    await vi.waitFor(() => expect(f.journal.pending()).toHaveLength(1));
    first.emit('close'); now += 1100; await f.monitor.refresh();
    await vi.waitFor(() => expect(f.journal.checkpoint('mail-own')).toEqual({ validity: '2', uid: 99 }));
    expect(f.journal.pending()).toEqual([]);
    f.deliver.mockClear(); busy = false;
    f.clients.at(-1)!.receive(100);
    await vi.waitFor(() => expect(f.deliver).toHaveBeenCalledOnce());
    expect(f.deliver.mock.calls[0]?.[0]).toMatchObject({ uidValidity: '2', uid: 100 });
  });

  it('does not queue an in-flight result after access is removed', async () => {
    const f = fixture(), client = await ready(f);
    let finish!: (uids: number[]) => void;
    client.search.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    client.receive(4);
    f.ids([]); await f.monitor.refresh(); finish([4]);
    await Promise.resolve(); await Promise.resolve();
    expect(f.monitor.statuses()).toEqual({});
    expect(f.journal.pending()).toEqual([]);
    expect(f.deliver).not.toHaveBeenCalled();
  });

  it('uses one listener owner per data directory and releases it on shutdown', async () => {
    const first = fixture(); await ready(first);
    const second = fixture({ file: first.file }); second.monitor.start(); await second.monitor.refresh();
    expect(second.clients).toHaveLength(0);
    await first.monitor.stop(); await second.monitor.refresh();
    await vi.waitFor(() => expect(second.clients).toHaveLength(1));
    await second.monitor.stop();
  });

  it('does not advance the checkpoint after a failed search', async () => {
    const f = fixture(), client = await ready(f);
    client.search.mockRejectedValueOnce(new Error('Connection stalled')); client.receive(5);
    await vi.waitFor(() => expect(client.search).toHaveBeenCalledTimes(2));
    expect(f.journal.checkpoint('mail-own')?.uid).toBe(2);
    await f.monitor.refresh();
    await vi.waitFor(() => expect(f.deliver).toHaveBeenCalledOnce());
    expect(f.deliver.mock.calls[0]?.[0].uid).toBe(5);
  });

  it('reports a polling fallback when the mail server does not offer IDLE', async () => {
    const f = fixture({ client: () => { const client = new InboxClient(); client.capabilities.clear(); return client; } });
    const client = await ready(f);
    expect(f.monitor.statuses()['mail-own']?.state).toBe('polling');
    client.uids.push(6); client.mailbox.uidNext = 7;
    await f.monitor.refresh();
    await vi.waitFor(() => expect(f.deliver).toHaveBeenCalledOnce());
  });
});
