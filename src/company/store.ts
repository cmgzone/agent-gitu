import { DatabaseSync } from 'node:sqlite';
import type { CompanyPricing } from './pricing.js';
import { randomUUID, createHash } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import type { WalletTransaction } from './wallets.js';
import type { CompanyMeeting } from './management-models.js';

export type CompanyResourceKind = 'storage' | 'transfer' | 'webhook' | 'wallet' | 'computer' | 'file-reference' | 'cowork-company' | 'connected-account' | 'organization' | 'department' | 'management-event' | 'meeting' | 'onboarding' | 'handbook' | 'workflow' | 'workflow-run' | 'workflow-mission' | 'workflow-simulation' | 'company-decision' | 'calendar-link';

export type CompanyState = 'draft' | 'running' | 'paused' | 'archived';
export interface Company {
  id: string;
  name: string;
  purpose: string;
  logoArtifactId?: string;
  state: CompanyState;
  leadId?: string;
  conversationId?: string;
  access: 'supervised' | 'full';
  monthlyBudgetUsd: number | null;
  budgetChosen: boolean;
  fileLimitChosen: boolean;
  maxFileBytes?: number | null;
  timezone: string;
  reviewMinutes: number;
  workers: number;
  staffLimit: number;
  computerLimit: number;
  missionSessions: number;
  skills: string[];
  connectionIds: string[];
  accountIds: string[];
  computerServerId?: string;
  allowHostComputer: boolean;
  defaultStorageId?: string;
  cpu: number;
  memoryMb: number;
  diskMb: number;
  direction: string;
  directionVersion: number;
  nextReviewAt?: string;
  createdAt: string;
  updatedAt: string;
}
export interface CompanyUsage {
  id: string;
  companyId: string;
  agentId: string;
  taskId?: string;
  meetingId?: string;
  meetingTurnId?: string;
  provider: string;
  model: string;
  inputTokens?: number;
  outputTokens?: number;
  cachedTokens?: number;
  costUsd?: number;
  provenance: 'catalog' | 'unknown';
  pricing?: CompanyPricing;
  outcome: 'running' | 'completed' | 'failed' | 'uncertain';
  createdAt: string;
}
export interface CompanyJob {
  id: string;
  companyId: string;
    kind: 'review' | 'message' | 'mission' | 'wake' | 'meeting' | 'calendar';
  payload: Record<string, unknown>;
  version: number;
  state: 'queued' | 'running' | 'done' | 'failed' | 'superseded';
  error?: string;
  createdAt: string;
  updatedAt: string;
}
export interface CompanyAction {
  id: string;
  companyId: string;
  agentId: string;
  tool: string;
  digest: string;
  version: number;
  state: 'pending' | 'approved' | 'rejected' | 'executing' | 'done' | 'uncertain' | 'agent-managed';
  createdAt: string;
  receipt?: string;
  parameters?: unknown;
  wallet?: WalletTransaction;
}
const stamp = () => new Date().toISOString();
export function canonicalAction(value: unknown): string {
  return JSON.stringify(value, (_key, item) =>
    item && typeof item === 'object' && !Array.isArray(item)
      ? Object.fromEntries(
          Object.keys(item)
            .sort()
            .map((key) => [key, item[key]]),
        )
      : item,
  );
}
const stringList = (value: unknown): string[] =>
  Array.isArray(value)
    ? [
        ...new Set(
          value
            .map(String)
            .map((s) => s.trim())
            .filter(Boolean),
        ),
      ].slice(0, 100)
    : [];
export function fileLimit(value: unknown): number | null {
  if (value === null) return null;
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1) throw new Error('Choose Unlimited or a positive file size in bytes.');
  return value;
}
export function effectiveFileLimit(workspace: number | null, company?: number | null): number | null {
  if (company === undefined) return workspace;
  if (workspace === null) return company;
  return company === null ? workspace : Math.min(workspace, company);
}

/** The coordinator and scoped Cowork snapshots share one durable SQLite transaction boundary. */
export class CompanyStore {
  readonly db: DatabaseSync;
  constructor(readonly root: string) {
    mkdirSync(root, { recursive: true });
    this.db = new DatabaseSync(path.join(root, 'companies.sqlite'));
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS records(kind TEXT NOT NULL,id TEXT NOT NULL,company_id TEXT,data TEXT NOT NULL,PRIMARY KEY(kind,id));
      CREATE INDEX IF NOT EXISTS company_records ON records(company_id,kind);
      CREATE TABLE IF NOT EXISTS reservations(id TEXT PRIMARY KEY,company_id TEXT NOT NULL,month TEXT NOT NULL,cost REAL NOT NULL);
      CREATE TABLE IF NOT EXISTS meeting_reservations(id TEXT PRIMARY KEY,company_id TEXT NOT NULL,meeting_id TEXT NOT NULL,cost REAL NOT NULL);
      CREATE TABLE IF NOT EXISTS scheduler_lock(id INTEGER PRIMARY KEY CHECK(id=1),owner TEXT NOT NULL,expires INTEGER NOT NULL);`);
    this.manageCommandReviews();
  }
  close(): void {
    this.db.close();
  }
  private put(kind: string, id: string, value: unknown, companyId?: string): void {
    this.db
      .prepare('INSERT INTO records(kind,id,company_id,data) VALUES(?,?,?,?) ON CONFLICT(kind,id) DO UPDATE SET data=excluded.data,company_id=excluded.company_id')
      .run(kind, id, companyId ?? null, JSON.stringify(value));
  }
  read<T>(kind: string, id: string): T | undefined {
    const row = this.db.prepare('SELECT data FROM records WHERE kind=? AND id=?').get(kind, id) as { data: string } | undefined;
    return row ? (JSON.parse(row.data) as T) : undefined;
  }
  saveResource(
    kind: CompanyResourceKind,
    id: string,
    companyId: string,
    value: unknown,
  ): void {
    if (!this.get(companyId)) throw new Error('Company not found.');
    const existing = this.db.prepare('SELECT company_id FROM records WHERE kind=? AND id=?').get(kind, id);
    if (existing && existing['company_id'] !== companyId) throw new Error('Resource belongs to another company.');
    this.put(kind, id, value, companyId);
  }
  removeResource(kind: 'storage' | 'transfer' | 'webhook' | 'wallet' | 'file-reference' | 'connected-account', id: string, companyId: string): void {
    this.db.prepare('DELETE FROM records WHERE kind=? AND id=? AND company_id=?').run(kind, id, companyId);
  }
  list<T>(kind: string, companyId?: string): T[] {
    const rows =
      companyId === undefined
        ? this.db.prepare('SELECT data FROM records WHERE kind=? ORDER BY rowid').all(kind)
        : this.db.prepare('SELECT data FROM records WHERE kind=? AND company_id=? ORDER BY rowid').all(kind, companyId);
    return rows.map((row) => JSON.parse(String(row['data'])) as T);
  }
  workspaceFileLimit(): number | null {
    return this.read<{ maxFileBytes: number | null }>('settings', 'files')?.maxFileBytes ?? null;
  }
  setWorkspaceFileLimit(value: unknown): number | null {
    const limit = fileLimit(value);
    this.put('settings', 'files', { maxFileBytes: limit });
    return limit;
  }
  runtimeSettings(): { workers: number; computers: number } {
    return this.read('settings', 'runtime') ?? { workers: 4, computers: 4 };
  }
  setRuntimeSettings(input: Record<string, unknown>): { workers: number; computers: number } {
    const settings = this.runtimeSettings();
    for (const key of ['workers', 'computers'] as const) {
      if (input[key] !== undefined) {
        const n = Number(input[key]);
        if (!Number.isInteger(n) || n < 1 || n > 64) throw new Error('Choose a runtime limit between 1 and 64.');
        settings[key] = n;
      }
    }
    this.put('settings', 'runtime', settings);
    return settings;
  }
  reserveComputer(companyId: string, agentId: string, computerServerId?: string): void {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const c = this.get(companyId);
      if (!c) throw new Error('Company not found.');
      const previous = this.read<{ companyId: string; heldSlot?: boolean; state: string; computerServerId?: string | null }>('computer', agentId);
      if (previous && previous.companyId !== companyId) throw new Error('Private computer belongs to another company.');
      if (
        previous &&
        (previous.heldSlot ?? ['starting', 'running', 'sleeping', 'unavailable'].includes(previous.state)) &&
        (!Object.hasOwn(previous, 'computerServerId') || (previous.computerServerId ?? undefined) !== computerServerId)
      )
        throw new Error('Reconcile and stop the previous private computer before selecting another server.');
      const computers = this.list<{ id: string; companyId: string; state: string; heldSlot?: boolean }>('computer').filter(
        (v) => (v.heldSlot ?? ['starting', 'running', 'sleeping'].includes(v.state)) && v.id !== agentId,
      );
      if (computers.length >= this.runtimeSettings().computers || computers.filter((v) => v.companyId === companyId).length >= (c.computerLimit ?? 2))
        throw new Error('Private computer concurrency limit reached. Stop an idle desktop before starting another.');
      this.put('computer', agentId, { id: agentId, companyId, computerServerId: computerServerId ?? null, state: 'starting', heldSlot: true }, companyId);
      this.db.exec('COMMIT');
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }
  computerState(companyId: string, id: string, state: string): void {
    const previous = this.read<{ heldSlot?: boolean; state: string; computerServerId?: string | null }>('computer', id);
    this.saveResource('computer', id, companyId, {
      ...previous,
      id,
      companyId,
      state,
      heldSlot: state === 'stopped' ? false : state === 'unavailable' ? (previous?.heldSlot ?? ['starting', 'running', 'sleeping'].includes(previous?.state ?? '')) : true,
    });
  }
  companies(): Company[] {
    return this.list<Company>('company').map((c) => ({ ...c, allowHostComputer: c.allowHostComputer === true }));
  }
  get(id: string): Company | undefined {
    const c = this.read<Company>('company', id);
    return c ? { ...c, allowHostComputer: c.allowHostComputer === true } : undefined;
  }
  workspace(id: string): string {
    if (!this.get(id)) throw new Error('Company not found.');
    return path.join(this.root, id, 'Workspace');
  }
  create(input: Partial<Company> = {}): Company {
    const now = stamp();
    const company: Company = {
      id: `company-${randomUUID()}`,
      name: 'New company',
      purpose: '',
      state: 'draft',
      access: 'supervised',
      monthlyBudgetUsd: null,
      budgetChosen: false,
      fileLimitChosen: false,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      reviewMinutes: 15,
      workers: 2,
      staffLimit: 10,
      computerLimit: 2,
      missionSessions: 12,
      skills: [],
      connectionIds: [],
      accountIds: [],
      allowHostComputer: false,
      cpu: 2,
      memoryMb: 2048,
      diskMb: 10240,
      direction: '',
      directionVersion: 0,
      createdAt: now,
      updatedAt: now,
    };
    this.put('company', company.id, company, company.id);
    try {
      return this.update(company.id, input);
    } catch (error) {
      this.db.prepare('DELETE FROM records WHERE kind=? AND id=?').run('company', company.id);
      throw error;
    }
  }
  update(id: string, input: Partial<Company>): Company {
    const old = this.get(id);
    if (!old) throw new Error('Company not found.');
    const company = { ...old };
    if (input.allowHostComputer !== undefined) {
      if (typeof input.allowHostComputer !== 'boolean') throw new Error('Choose whether to grant use of this computer.');
      company.allowHostComputer = input.allowHostComputer;
    }
    for (const key of ['name', 'purpose', 'timezone', 'computerServerId', 'defaultStorageId', 'logoArtifactId', 'leadId', 'conversationId'] as const) {
      if (input[key] !== undefined)
        company[key] = String(input[key])
          .trim()
          .slice(0, key === 'purpose' ? 8000 : 200);
    }
    if (!company.name) throw new Error('Company name is required.');
    try {
      new Intl.DateTimeFormat('en', { timeZone: company.timezone });
    } catch {
      throw new Error('Invalid company timezone.');
    }
    if (input.access !== undefined) {
      if (!['supervised', 'full'].includes(input.access)) throw new Error('Invalid access mode.');
      company.access = input.access;
    }
    if (input.monthlyBudgetUsd !== undefined) {
      if (input.monthlyBudgetUsd !== null && (!Number.isFinite(input.monthlyBudgetUsd) || input.monthlyBudgetUsd <= 0))
        throw new Error('Choose a positive monthly budget or Unlimited.');
      company.monthlyBudgetUsd = input.monthlyBudgetUsd;
      company.budgetChosen = true;
    }
    if (input.maxFileBytes !== undefined) {
      company.maxFileBytes = fileLimit(input.maxFileBytes);
      const cap = this.workspaceFileLimit();
      if (cap !== null && (company.maxFileBytes === null || company.maxFileBytes > cap)) throw new Error('Company limit exceeds the workspace limit.');
      company.fileLimitChosen = true;
    }
    if (input.fileLimitChosen === true && input.maxFileBytes === undefined) {
      delete company.maxFileBytes;
      company.fileLimitChosen = true;
    }
    for (const key of ['skills', 'connectionIds', 'accountIds'] as const) if (input[key] !== undefined) company[key] = stringList(input[key]);
    const limits = {
      reviewMinutes: [1, 10080],
      workers: [1, 64],
      staffLimit: [1, 100],
      computerLimit: [1, 64],
      missionSessions: [1, 50],
      cpu: [1, 32],
      memoryMb: [256, 65536],
      diskMb: [256, 1048576],
    };
    for (const key of Object.keys(limits) as (keyof typeof limits)[])
      if (input[key] !== undefined) {
        const n = input[key]!;
        const [min, max] = limits[key]!;
        if (!Number.isInteger(n) || n < min! || n > max!) throw new Error(`Invalid ${key}.`);
        company[key] = n;
      }
    company.updatedAt = stamp();
    this.put('company', id, company, id);
    if (company.access === 'full') this.manageCommandReviews(id);
    return company;
  }
  transition(id: string, state: CompanyState): Company {
    const company = this.get(id);
    if (!company) throw new Error('Company not found.');
    if (state === 'running' && (!company.purpose || !company.leadId || !company.budgetChosen || !company.fileLimitChosen))
      throw new Error('Complete company setup before starting.');
    company.state = state;
    company.updatedAt = stamp();
    company.nextReviewAt = state === 'running' ? stamp() : undefined;
    this.put('company', id, company, id);
    return company;
  }
  steer(id: string, direction: string): Company {
    const company = this.get(id);
    if (!company) throw new Error('Company not found.');
    if (!direction.trim()) throw new Error('Direction is required.');
    if (direction.trim().length > 64000) throw new Error('Company direction exceeds 64,000 characters. Shorten it before sending.');
    company.direction = direction.trim();
    company.directionVersion++;
    company.updatedAt = stamp();
    this.put('company', id, company, id);
    for (const job of this.jobs(id))
      if (job.state === 'queued' && job.version !== company.directionVersion && job.payload['delivery'] !== 'question') this.finishJob(job, 'superseded');
    return company;
  }
  scheduleReview(id: string): void {
    const c = this.get(id);
    if (c) {
      c.nextReviewAt = new Date(Date.now() + c.reviewMinutes * 60000).toISOString();
      this.put('company', id, c, id);
    }
  }
  snapshot(id: string): { read: () => string | undefined; write: (data: string) => void } {
    return { read: () => this.read<string>('cowork', id), write: (data) => this.put('cowork', id, data, id) };
  }
  jobs(companyId?: string): CompanyJob[] {
    return this.list<CompanyJob>('job', companyId);
  }
  enqueue(companyId: string, kind: CompanyJob['kind'], payload: Record<string, unknown>, dedupe?: string): CompanyJob {
    const c = this.get(companyId);
    if (!c) throw new Error('Company not found.');
    const prior = dedupe ? this.jobs(companyId).find((j) => j.payload['dedupe'] === dedupe && ['queued', 'running'].includes(j.state)) : undefined;
    if (prior) return prior;
    const now = stamp();
    const job: CompanyJob = {
      id: randomUUID(),
      companyId,
      kind,
      payload: { ...payload, ...(dedupe ? { dedupe } : {}) },
      version: c.directionVersion,
      state: 'queued',
      createdAt: now,
      updatedAt: now,
    };
    this.put('job', job.id, job, companyId);
    return job;
  }
  claim(job: CompanyJob): void {
    job.state = 'running';
    job.updatedAt = stamp();
    this.put('job', job.id, job, job.companyId);
  }
  finishJob(job: CompanyJob, state: CompanyJob['state'], error?: string): void {
    job.state = state;
    job.error = error?.slice(0, 500);
    job.updatedAt = stamp();
    this.put('job', job.id, job, job.companyId);
  }
  acquireScheduler(owner: string, now = Date.now()): boolean {
    const result = this.db
      .prepare(
        'INSERT INTO scheduler_lock VALUES(1,?,?) ON CONFLICT(id) DO UPDATE SET owner=excluded.owner,expires=excluded.expires WHERE scheduler_lock.owner=excluded.owner OR scheduler_lock.expires<?',
      )
      .run(owner, now + 60000, now);
    return result.changes > 0;
  }
  releaseScheduler(owner: string): void {
    this.db.prepare('DELETE FROM scheduler_lock WHERE owner=?').run(owner);
  }
  recover(): void {
    this.manageCommandReviews();
    for (const job of this.jobs()) if (job.state === 'running') this.finishJob(job, 'queued');
    for (const action of this.list<CompanyAction>('action'))
      if (action.state === 'executing') {
        action.state = 'uncertain';
        this.put('action', action.id, action, action.companyId);
      }
    for (const attempt of this.usage())
      if (attempt.outcome === 'running') {
        // A restarted process cannot know whether the provider billed this
        // attempt. Preserve its reservation until usage can be reconciled.
        attempt.outcome = 'uncertain';
        this.put('usage', attempt.id, attempt, attempt.companyId);
      }
  }
  month(c: Company, date = new Date()): string {
    const parts = new Intl.DateTimeFormat('en', { timeZone: c.timezone, year: 'numeric', month: '2-digit' }).formatToParts(date);
    return `${parts.find((p) => p.type === 'year')!.value}-${parts.find((p) => p.type === 'month')!.value}`;
  }
  usage(companyId?: string): CompanyUsage[] {
    return this.list<CompanyUsage>('usage', companyId);
  }
  monthlyAccounting(companyId: string): { month: string; knownCostUsd: number; reservedUsd: number; unknownCalls: number } {
    const c = this.get(companyId);
    if (!c) throw new Error('Company not found.');
    const month = this.month(c),
      events = this.usage(companyId).filter((u) => this.month(c, new Date(u.createdAt)) === month);
    return {
      month,
      knownCostUsd: events.reduce((n, u) => n + (u.costUsd ?? 0), 0),
      reservedUsd: Number(this.db.prepare('SELECT COALESCE(SUM(cost),0) AS cost FROM reservations WHERE company_id=? AND month=?').get(companyId, month)?.['cost']),
      unknownCalls: events.filter((u) => u.costUsd === undefined).length,
    };
  }
  meetingAccounting(companyId: string, meetingId: string): { knownCostUsd: number; reservedUsd: number; unknownCalls: number } {
    const meeting = this.read<CompanyMeeting>('meeting', meetingId);
    if (!meeting || meeting.companyId !== companyId) throw new Error('Meeting not found in this company.');
    const events = this.usage(companyId).filter(u => u.meetingId === meetingId);
    return { knownCostUsd: events.reduce((sum, u) => sum + (u.costUsd ?? 0), 0), reservedUsd: Number(this.db.prepare('SELECT COALESCE(SUM(cost),0) AS cost FROM meeting_reservations WHERE company_id=? AND meeting_id=?').get(companyId, meetingId)?.['cost']), unknownCalls: events.filter(u => u.costUsd === undefined).length };
  }
  reserve(companyId: string, estimate: number | undefined, attempt?: Pick<CompanyUsage, 'agentId' | 'taskId' | 'provider' | 'model' | 'pricing' | 'meetingId' | 'meetingTurnId'>): string {
    const c = this.get(companyId);
    if (!c || c.state !== 'running') throw new Error('Company is paused.');
    if (c.monthlyBudgetUsd !== null && estimate === undefined) throw new Error('Configure model prices before using a finite company budget.');
    if (estimate !== undefined && (!Number.isFinite(estimate) || estimate < 0)) throw new Error('Model pricing must produce a finite, nonnegative cost.');
    const id = randomUUID(),
      month = this.month(c);
    this.db.exec('BEGIN IMMEDIATE');
    try {
      if (attempt?.meetingId) {
        const meeting = this.read<CompanyMeeting>('meeting', attempt.meetingId), lease = meeting?.lease;
        if (!meeting || meeting.companyId !== companyId || meeting.state !== 'active' || meeting.directionVersion !== c.directionVersion || Date.parse(meeting.endAt) <= Date.now() || !lease || lease.id !== attempt.meetingTurnId || lease.agentId !== attempt.agentId || Date.parse(lease.expiresAt) <= Date.now()) throw new Error('Meeting speaking permission expired or was revoked.');
        const accounting = this.meetingAccounting(companyId, meeting.id);
        if (meeting.budgetUsd !== null && estimate === undefined) throw new Error('Configure usable model prices before a meeting with a finite budget.');
        if (meeting.budgetUsd !== null && accounting.knownCostUsd + accounting.reservedUsd + (estimate ?? 0) > meeting.budgetUsd) throw new Error('Meeting budget reached.');
        if (this.usage(companyId).filter(u => u.meetingTurnId === lease.id).length >= 6) throw new Error('Meeting contribution attempt limit reached. Retain outstanding matters.');
        this.db.prepare('INSERT INTO meeting_reservations VALUES(?,?,?,?)').run(id, companyId, meeting.id, estimate ?? 0);
      } else if (attempt?.meetingTurnId) throw new Error('A meeting turn requires its company-scoped meeting.');
      const spend = this.usage(companyId)
        .filter((u) => this.month(c, new Date(u.createdAt)) === month)
        .reduce((n, u) => n + (u.costUsd ?? 0), 0);
      const reserved = Number(this.db.prepare('SELECT COALESCE(SUM(cost),0) AS cost FROM reservations WHERE company_id=? AND month=?').get(companyId, month)?.['cost']);
      if (c.monthlyBudgetUsd !== null && spend + reserved + (estimate ?? 0) > c.monthlyBudgetUsd) throw new Error('Company monthly budget reached.');
      this.db.prepare('INSERT INTO reservations VALUES(?,?,?,?)').run(id, companyId, month, estimate ?? 0);
      if (attempt) this.put('usage', id, { ...attempt, companyId, id, createdAt: stamp(), provenance: 'unknown', outcome: 'running' }, companyId);
      this.db.exec('COMMIT');
      return id;
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }
  recordUsage(id: string, event: Omit<CompanyUsage, 'id' | 'createdAt' | 'provenance'>): void {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const previous = this.read<CompanyUsage>('usage', id);
      if (previous && previous.companyId !== event.companyId) throw new Error('Usage attempt belongs to another company.');
      const reservation = this.db.prepare('SELECT company_id FROM reservations WHERE id=?').get(id);
      if (reservation && reservation['company_id'] !== event.companyId) throw new Error('Usage reservation belongs to another company.');
      if (previous && (previous.meetingId !== event.meetingId || previous.meetingTurnId !== event.meetingTurnId)) throw new Error('Usage meeting identity cannot change during reconciliation.');
      if (!this.get(event.companyId)) throw new Error('Company not found.');
      if (previous && !['running', 'uncertain'].includes(previous.outcome)) {
        this.db.exec('COMMIT');
        return;
      }
      if (event.costUsd !== undefined && (!Number.isFinite(event.costUsd) || event.costUsd < 0)) throw new Error('Invalid model cost.');
      this.put('usage', id, { ...event, id, createdAt: previous?.createdAt ?? stamp(), provenance: event.costUsd === undefined ? 'unknown' : 'catalog' }, event.companyId);
      if (event.costUsd !== undefined) {
        this.db.prepare('DELETE FROM reservations WHERE id=?').run(id);
        this.db.prepare('DELETE FROM meeting_reservations WHERE id=?').run(id);
      }
      this.db.exec('COMMIT');
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }
  actions(companyId: string): CompanyAction[] {
    return this.list<CompanyAction>('action', companyId);
  }
  /** Retain legacy command records without claiming they completed. Only the
   * owner's Full access setting delegates their recovery back to the agent. */
  manageCommandReviews(companyId?: string): void {
    const full = new Set(
      this.companies()
        .filter((c) => c.access === 'full' && (!companyId || c.id === companyId))
        .map((c) => c.id),
    );
    if (!full.size) return;
    const commands = this.list<CompanyAction>('action', companyId).filter(
      (a) => full.has(a.companyId) && a.tool === 'run_command' && !a.wallet && ['pending', 'approved', 'executing', 'uncertain'].includes(a.state),
    );
    if (!commands.length) return;
    this.db.exec('BEGIN IMMEDIATE');
    try {
      for (const candidate of commands) {
        const action = this.read<CompanyAction>('action', candidate.id);
        if (
          !action ||
          action.companyId !== candidate.companyId ||
          action.wallet ||
          this.get(action.companyId)?.access !== 'full' ||
          !['pending', 'approved', 'executing', 'uncertain'].includes(action.state)
        )
          continue;
        this.put(
          'action',
          action.id,
          {
            ...action,
            state: 'agent-managed',
            receipt:
              'Command verification remains with the agent under Full access. This record does not confirm completion; check its output and resulting files before retrying.',
          },
          action.companyId,
        );
      }
      this.db.exec('COMMIT');
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }
  intent(companyId: string, agentId: string, tool: string, args: unknown, version: number): CompanyAction {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const digest = createHash('sha256').update(canonicalAction(args)).digest('hex');
      const prior = this.actions(companyId).find((a) => a.state !== 'agent-managed' && a.agentId === agentId && a.tool === tool && a.digest === digest && a.version === version);
      if (prior) {
        this.db.exec('COMMIT');
        return prior;
      }
      const parameters = JSON.parse(JSON.stringify(args, (key, value) => (/token|password|secret|authorization|credential|api.?key/i.test(key) ? '[protected]' : value)));
      const action: CompanyAction = { id: randomUUID(), companyId, agentId, tool, digest, version, parameters, state: 'pending', createdAt: stamp() };
      this.put('action', action.id, action, companyId);
      this.db.exec('COMMIT');
      return action;
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }
  prepareAction(action: CompanyAction, prepare: (current: CompanyAction) => void, execute = false): void {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const current = this.read<CompanyAction>('action', action.id),
        company = this.get(action.companyId);
      if (!current || !company || company.state !== 'running' || company.directionVersion !== action.version)
        throw new Error('Company paused or direction changed before action submission.');
      if (!['pending', 'approved'].includes(current.state)) throw new Error('Action was already submitted or settled. Reconcile its result before retrying.');
      prepare(current);
      if (execute) current.state = 'executing';
      this.put('action', current.id, current, current.companyId);
      Object.assign(action, current);
      this.db.exec('COMMIT');
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }
  actionState(action: CompanyAction, state: CompanyAction['state'], receipt?: string, expected?: CompanyAction['state']): void {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const current = this.read<CompanyAction>('action', action.id);
      if (!current || current.companyId !== action.companyId) throw new Error('Action not found.');
      if (expected && current.state !== expected) throw new Error('Action state changed. Refresh before deciding.');
      const next = { ...current, state, receipt: receipt?.slice(0, 1000), wallet: action.wallet ?? current.wallet };
      this.put('action', action.id, next, action.companyId);
      Object.assign(action, next);
      this.db.exec('COMMIT');
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }
}
