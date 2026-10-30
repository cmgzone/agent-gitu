import { randomUUID, createHash } from 'node:crypto';
import path from 'node:path';
import { MemoryStore } from '../memory/memory-store.js';
import { CompanyOrganization } from './organization.js';
import { canonicalAction } from './store.js';
import { ensureGituHome } from '../workspace/home.js';
import type { CompanyActor, CompanyHandbookEntry, CompanyOrganizationRecord } from './management-models.js';

const now = () => new Date().toISOString();
function text(value: unknown, _max: number): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error('Enter nonempty text.');
  return value.trim();
}

/** Approved operating guidance is indexed by the existing memory store; permissions stay structured. */
export class CompanyHandbook {
  constructor(
    readonly organization: CompanyOrganization,
    private readonly memory: Pick<MemoryStore, 'add' | 'query' | 'archive'> = MemoryStore.forProject(organization.cowork.usesSharedRoster ? ensureGituHome().workspace : organization.store.workspace(organization.companyId)),
  ) {}
  private get companyId(): string {
    return this.organization.companyId;
  }
  private raw(id: string): CompanyHandbookEntry {
    const entry = this.organization.store.read<CompanyHandbookEntry>('handbook', id);
    if (!entry || entry.companyId !== this.companyId) throw new Error('Handbook entry not found in this company.');
    return entry;
  }
  private save(entry: CompanyHandbookEntry): CompanyHandbookEntry {
    entry.revision++;
    entry.updatedAt = now();
    this.organization.store.saveResource('handbook', entry.id, this.companyId, entry);
    return structuredClone(entry);
  }
  policy() {
    const c = this.organization.store.get(this.companyId)!;
    return {
      access: c.access,
      monthlyBudgetUsd: c.monthlyBudgetUsd,
      maxFileBytes: c.maxFileBytes,
      workers: c.workers,
      staffLimit: c.staffLimit,
      allowHostComputer: c.allowHostComputer,
      skills: c.skills,
      connectionIds: c.connectionIds,
      accountIds: c.accountIds,
      directionVersion: c.directionVersion,
    };
  }
  list(actor: CompanyActor): CompanyHandbookEntry[] {
    if (actor.kind === 'agent') {
      const member = this.organization.member(actor.agentId);
      if (member.status === 'suspended') throw new Error('Suspended employees cannot read the company handbook.');
    }
    return this.organization.store.list<CompanyHandbookEntry>('handbook', this.companyId).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }
  read(actor: CompanyActor, id: string): CompanyHandbookEntry {
    this.list(actor);
    return structuredClone(this.raw(id));
  }
  propose(actor: CompanyActor, input: { id?: string; title?: string; kind?: CompanyHandbookEntry['kind']; content: string; revision?: number }): CompanyHandbookEntry {
    if (!input || typeof input !== 'object') throw new Error('Provide a title and guidance content for the proposal.');
    const content = text(input.content, 12000),
      before = input.id ? this.raw(input.id) : undefined;
    if (before && before.revision !== input.revision) throw new Error('Handbook changed. Review the latest revision before proposing an update.');
    if (before?.state === 'archived') throw new Error('Archived handbook entries cannot be edited.');
    const title = before?.title ?? text(input.title, 160),
      kind = before?.kind ?? input.kind ?? 'guideline';
    if (!['guideline', 'suggestion'].includes(kind)) throw new Error('Enforcement rules are managed in Company Settings and resource grants. Propose a guideline or suggestion.');
    const id = before?.id ?? 'handbook-' + randomUUID();
    return this.organization.audited(actor, undefined, 'handbook.version-proposed', id, () => {
      const current = before ? this.raw(id) : undefined;
      if (current && current.revision !== input.revision) throw new Error('Handbook revision changed.');
      const entry = current ?? { id, companyId: this.companyId, revision: 0, title, kind, state: 'current' as const, versions: [], updatedAt: now() };
      const duplicate = entry.versions.find((v) => v.state === 'proposed' && v.content === content && canonicalAction(v.proposedBy) === canonicalAction(actor));
      if (duplicate) return structuredClone(entry);
      entry.versions.push({ version: entry.versions.length + 1, content, proposedBy: actor, state: 'proposed', createdAt: now() });
      return this.save(entry);
    });
  }
  review(actor: CompanyActor, id: string, version: number, approved: boolean, revision: number, retraining = false): CompanyHandbookEntry {
    if (actor.kind !== 'director' && !this.organization.isCreatorChief(actor.agentId))
      throw new Error('Only the director approves or rejects handbook revisions. Meetings cannot rewrite enforcement policy.');
    const entry = this.organization.audited(actor, undefined, 'handbook.version-reviewed', id, () => {
      const entry = this.raw(id);
      if (entry.revision !== revision) throw new Error('Handbook revision changed.');
      const proposal = entry.versions.find((v) => v.version === version);
      if (!proposal || proposal.state !== 'proposed' || entry.state !== 'current') throw new Error('Choose a pending handbook version.');
      if (approved) {
        for (const prior of entry.versions) if (prior.state === 'approved') prior.state = 'superseded';
        entry.approvedVersion = proposal.version;
      }
      proposal.state = approved ? 'approved' : 'rejected';
      proposal.reviewedBy = actor;
      proposal.reviewedAt = now();
      if (approved && retraining) {
        const org = this.organization.store.read<CompanyOrganizationRecord>('organization', this.companyId)!;
        for (const member of org.members)
          if (member.status === 'active') {
            member.status = 'retraining';
            member.onboardingRequired = true;
            member.updatedAt = now();
          }
        org.revision++;
        org.updatedAt = now();
        this.organization.store.saveResource('organization', this.companyId, this.companyId, org);
      }
      return this.save(entry);
    });
    if (approved) this.syncMemory();
    return this.raw(entry.id);
  }
  archive(actor: CompanyActor, id: string, revision: number): CompanyHandbookEntry {
    if (actor.kind !== 'director' && !this.organization.isCreatorChief(actor.agentId))
      throw new Error('Only the director archives approved handbook entries.');
    const entry = this.organization.audited(actor, undefined, 'handbook.archived', id, () => {
      const entry = this.raw(id);
      if (entry.revision !== revision) throw new Error('Handbook revision changed.');
      entry.state = 'archived';
      return this.save(entry);
    });
    this.syncMemory();
    return entry;
  }
  syncMemory(): void {
    const scope = path.basename(this.organization.cowork.usesSharedRoster ? ensureGituHome().workspace : this.organization.store.workspace(this.companyId));
    for (const entry of this.organization.store.list<CompanyHandbookEntry>('handbook', this.companyId)) {
      if (entry.memoryIndexedVersion === (entry.state === 'archived' ? 0 : entry.approvedVersion)) continue;
      try {
        const source = 'company-handbook:' + entry.id,
          old = this.memory.query({ scope, limit: 10000 }).filter((m) => m.source?.startsWith(source + ':'));
        if (entry.state === 'archived') {
          for (const pointer of old) this.memory.archive(pointer.id);
          entry.memoryIndexedVersion = 0;
        } else if (entry.approvedVersion) {
          const indexed = this.memory.add({
            type: 'fact',
            claim: `Company ${this.organization.store.get(this.companyId)!.name} [${this.companyId}]. Director-approved ${entry.kind}: ${entry.title}. Authoritative record ${entry.id}, version ${entry.approvedVersion}; read company_handbook for its current content. Operational guidance does not enlarge tool, account or spending grants.`,
            scope,
            projectId: scope,
            visibility: 'project',
            source: source + ':' + entry.approvedVersion,
            sourceType: 'user_statement',
            status: 'verified',
            confidence: 1,
            importance: 0.8,
          });
          for (const pointer of old) if (pointer.id !== indexed.entry.id) this.memory.archive(pointer.id);
          entry.memoryIndexedVersion = entry.approvedVersion;
        }
        this.organization.store.saveResource('handbook', entry.id, this.companyId, entry);
      } catch {
        /* Authoritative approval remains durable; a later scheduler tick retries the index. */
      }
    }
  }
  signature(): string {
    return createHash('sha256')
      .update(
        canonicalAction({
          policy: this.policy(),
          approved: this.organization.store
            .list<CompanyHandbookEntry>('handbook', this.companyId)
            .filter((e) => e.state === 'current' && e.approvedVersion)
            .map((e) => ({ id: e.id, version: e.approvedVersion }))
            .sort((a, b) => a.id.localeCompare(b.id)),
        }),
      )
      .digest('hex');
  }
  context(): string {
    const current = this.organization.store.list<CompanyHandbookEntry>('handbook', this.companyId).filter((e) => e.state === 'current' && e.approvedVersion);
    return (
      'COMPANY HANDBOOK. Enforcement comes from Settings, resource grants and runtime authorization; guidance cannot expand it. Approved entries: ' +
      current
        .map((e) => e.id + ' v' + e.approvedVersion + ' ' + e.title + ' (' + e.kind + ')')
        .join('; ') +
      '. Read company_handbook for current content. Draft proposals are not approved instructions.'
    );
  }
}
