import { randomUUID, createHash } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import type { ImapFlow } from 'imapflow';
import { mailConnectionFailure, type MailConnectionCheck } from './mail-status.js';

export interface InboxArrival {
  id: string;
  accountId: string;
  uidValidity: string;
  uid: number;
  detectedAt: string;
}
export type InboxWatchStatus = { state: 'connecting' | 'listening' | 'polling' | 'reconnecting'; lastEventAt?: string; problem?: MailConnectionCheck };
type Watch = { client: ImapFlow; state: InboxWatchStatus; closed: boolean; scanning: boolean; dirty: boolean; retryAt: number; failures: number; release?: () => void };

/** UID checkpoints and pending arrivals are committed together. No message bodies
 * or credentials are stored here. A lease admits only one watcher per data home. */
export class InboxArrivalJournal {
  private db: DatabaseSync;
  constructor(file: string) {
    mkdirSync(path.dirname(file), { recursive: true });
    this.db = new DatabaseSync(file);
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=3000;
      CREATE TABLE IF NOT EXISTS lease (id INTEGER PRIMARY KEY CHECK(id=1), owner TEXT NOT NULL, expires INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS cursors (account TEXT PRIMARY KEY, validity TEXT NOT NULL, uid INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS arrivals (id TEXT PRIMARY KEY, account TEXT NOT NULL, validity TEXT NOT NULL, uid INTEGER NOT NULL, detected TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS arrivals_account ON arrivals(account,uid);`);
  }
  acquire(owner: string, now = Date.now()): boolean {
    this.db.prepare('INSERT INTO lease VALUES(1,?,?) ON CONFLICT(id) DO UPDATE SET owner=excluded.owner, expires=excluded.expires WHERE lease.owner=excluded.owner OR lease.expires<=?').run(owner, now + 30_000, now);
    return this.owns(owner, now);
  }
  owns(owner: string, now = Date.now()): boolean {
    return Boolean(this.db.prepare('SELECT 1 FROM lease WHERE id=1 AND owner=? AND expires>?').get(owner, now));
  }
  release(owner: string): void { this.db.prepare('DELETE FROM lease WHERE owner=?').run(owner); }
  baseline(account: string, validity: string, uid: number): number {
    const prior = this.db.prepare('SELECT validity,uid FROM cursors WHERE account=?').get(account) as { validity: string; uid: number } | undefined;
    if (prior?.validity === validity) return prior.uid;
    this.db.exec('BEGIN IMMEDIATE');
    try {
      this.db.prepare('DELETE FROM arrivals WHERE account=?').run(account);
      this.db.prepare('INSERT INTO cursors VALUES(?,?,?) ON CONFLICT(account) DO UPDATE SET validity=excluded.validity,uid=excluded.uid').run(account, validity, uid);
      this.db.exec('COMMIT');
    } catch (error) { this.db.exec('ROLLBACK'); throw error; }
    return uid;
  }
  checkpoint(account: string): { validity: string; uid: number } | undefined {
    return this.db.prepare('SELECT validity,uid FROM cursors WHERE account=?').get(account) as { validity: string; uid: number } | undefined;
  }
  append(account: string, validity: string, uids: number[], detectedAt = new Date().toISOString()): void {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const cursor = this.checkpoint(account);
      if (!cursor || cursor.validity !== validity) throw new Error('Mailbox generation changed');
      for (const uid of uids.filter(uid => uid > cursor.uid)) {
        const id = 'mail-' + createHash('sha256').update(JSON.stringify([account, validity, uid])).digest('hex');
        this.db.prepare('INSERT OR IGNORE INTO arrivals VALUES(?,?,?,?,?)').run(id, account, validity, uid, detectedAt);
      }
      if (uids.length) this.db.prepare('UPDATE cursors SET uid=MAX(uid,?) WHERE account=? AND validity=?').run(Math.max(...uids), account, validity);
      this.db.exec('COMMIT');
    } catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }
  pending(): InboxArrival[] {
    return this.db.prepare('SELECT id,account AS accountId,validity AS uidValidity,uid,detected AS detectedAt FROM arrivals ORDER BY detected,uid LIMIT 100').all() as unknown as InboxArrival[];
  }
  acknowledge(id: string): void { this.db.prepare('DELETE FROM arrivals WHERE id=?').run(id); }
  close(): void { this.db.close(); }
}

/** Dedicated IMAP connections listen for server notifications. The five-second
 * timer reconciles assignments/reconnects; it does not poll an IDLE-capable inbox. */
export class MailInboxMonitor {
  private readonly owner = randomUUID();
  private watches = new Map<string, Watch>();
  private timer?: ReturnType<typeof setInterval>;
  private reconciling = false;
  private pumping = false;
  private stopped = true;
  private closed = false;
  private leased = false;
  constructor(
    private readonly journal: InboxArrivalJournal,
    private readonly accountIds: () => Promise<string[]>,
    private readonly createClient: (accountId: string) => ImapFlow,
    private readonly deliver: (event: InboxArrival, stillCurrent: () => boolean) => Promise<boolean>,
  ) {}
  start(): void {
    if (!this.stopped || this.closed) return;
    this.stopped = false;
    void this.refresh();
    this.timer = setInterval(() => { void this.refresh(); }, 5_000);
    this.timer.unref();
  }
  statuses(): Record<string, InboxWatchStatus> {
    return Object.fromEntries([...this.watches].map(([id, watch]) => [id, { ...watch.state }]));
  }
  private current(id: string, watch: Watch): boolean {
    return !this.stopped && this.leased && !watch.closed && this.watches.get(id) === watch && this.journal.owns(this.owner);
  }
  async refresh(): Promise<void> {
    if (this.stopped || this.reconciling) return;
    this.reconciling = true;
    try {
      this.leased = this.journal.acquire(this.owner);
      if (!this.leased) { for (const [id, watch] of this.watches) this.drop(id, watch); return; }
      const ids = new Set(await this.accountIds());
      if (this.stopped) return;
      for (const [id, watch] of this.watches) if (!ids.has(id)) this.drop(id, watch);
      for (const id of ids) {
        const previous = this.watches.get(id);
        if (previous && !previous.closed) {
          // Servers without IDLE get an honest polling fallback, not an instant label.
          if (previous.state.state === 'polling') previous.dirty = true;
          if (previous.dirty) void this.scan(id, previous);
          continue;
        }
        if (previous && previous.retryAt > Date.now()) continue;
        try { this.open(id, previous?.failures ?? 0); } catch { /* Retry next reconciliation without exposing credentials. */ }
      }
      await this.pump(ids);
    } catch { /* An unavailable credential store must not be logged or erase checkpoints. */ }
    finally { this.reconciling = false; }
  }
  private drop(id: string, watch: Watch): void {
    watch.closed = true;
    watch.release?.(); watch.release = undefined;
    watch.client.close();
    if (this.watches.get(id) === watch) this.watches.delete(id);
  }
  private open(id: string, failures: number): void {
    const client = this.createClient(id);
    const watch: Watch = { client, state: { state: 'connecting' }, closed: false, scanning: false, dirty: false, retryAt: 0, failures };
    this.watches.set(id, watch);
    const disconnected = (error?: unknown) => {
      if (this.watches.get(id) !== watch || watch.closed) return;
      watch.closed = true;
      watch.state.state = 'reconnecting';
      watch.state.problem = mailConnectionFailure(error, 'imap');
      watch.failures++;
      watch.retryAt = Date.now() + Math.min(60_000, 1000 * 2 ** Math.min(watch.failures - 1, 6));
      watch.release?.(); watch.release = undefined;
      client.close();
    };
    client.on('error', disconnected);
    client.on('close', disconnected);
    client.on('exists', () => { watch.dirty = true; void this.scan(id, watch); });
    void (async () => {
      try {
        await client.connect();
        if (!this.current(id, watch)) { client.close(); return; }
        const lock = await client.getMailboxLock('INBOX');
        watch.release = () => lock.release();
        if (!this.current(id, watch)) { lock.release(); client.close(); return; }
        const mailbox = client.mailbox;
        if (!mailbox || !mailbox.uidValidity || !Number.isSafeInteger(mailbox.uidNext) || mailbox.uidNext < 1) throw new Error('Mailbox UID state unavailable');
        this.journal.baseline(id, mailbox.uidValidity.toString(), mailbox.uidNext - 1);
        // This connection is dedicated to the watcher. Holding its selection lock
        // suppresses automatic IDLE in ImapFlow, so release before listening.
        lock.release(); watch.release = undefined;
        watch.state.state = client.capabilities.has('IDLE') ? 'listening' : 'polling';
        watch.failures = 0;
        watch.dirty = true;
        await this.scan(id, watch);
      } catch (error) { disconnected(error); }
    })();
  }
  private async scan(id: string, watch: Watch): Promise<void> {
    if (watch.scanning || !this.current(id, watch) || !['listening', 'polling'].includes(watch.state.state)) return;
    watch.scanning = true;
    try {
      do {
        watch.dirty = false;
        const cursor = this.journal.checkpoint(id);
        if (!cursor) return;
        const found = await watch.client.search({ uid: `${cursor.uid + 1}:*` }, { uid: true });
        if (!this.current(id, watch)) return;
        // IMAP reversed ranges may include the previous highest UID. Filter it.
        const foundUids = [...new Set(Array.isArray(found) ? found : [])].filter(uid => Number.isSafeInteger(uid) && uid > cursor.uid).sort((a, b) => a - b);
        const uids = foundUids.slice(0, 500);
        if (foundUids.length > uids.length) watch.dirty = true;
        if (uids.length) {
          this.journal.append(id, cursor.validity, uids);
          watch.state.lastEventAt = new Date().toISOString();
          void this.pump();
        }
      } while (watch.dirty && this.current(id, watch));
    } catch {
      watch.dirty = true; // retry next reconciliation, never advance a failed scan
    } finally { watch.scanning = false; }
  }
  private async pump(eligible?: Set<string>): Promise<void> {
    if (this.pumping || this.stopped || !this.leased) return;
    this.pumping = true;
    try {
      const ids = eligible ?? new Set(await this.accountIds());
      for (const event of this.journal.pending()) {
        const current = () => !this.stopped && this.leased && this.journal.owns(this.owner);
        if (!current()) return;
        if (!ids.has(event.accountId)) { this.journal.acknowledge(event.id); continue; }
        try { if (await this.deliver(event, current) && current()) this.journal.acknowledge(event.id); }
        catch { /* Keep the event queued while delivery is temporarily unavailable. */ }
      }
    } catch { /* Keep durable arrivals when account metadata cannot be refreshed. */ }
    finally { this.pumping = false; }
  }
  async stop(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    this.stopped = true;
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
    for (const [id, watch] of this.watches) this.drop(id, watch);
    // In-flight callbacks may still be unwinding; their current() guard stops admission.
    while (this.reconciling || this.pumping || [...this.watches.values()].some(watch => watch.scanning)) await new Promise(resolve => setTimeout(resolve, 10));
    this.journal.release(this.owner);
    this.leased = false;
    this.journal.close();
  }
}
