import path from 'node:path';
import { readFileSync } from 'node:fs';
import { withMemoryFileLock } from './file-lock.js';
import { STOPWORDS } from '../context/context-engine.js';
import type { MemoryAuditEvent, MemoryEntry, MemoryRetrievalContext, MemorySourceType, MemoryStatus, MemoryType, MemoryVisibility } from '../types.js';
import { nowIso, readJson, shortId, writeJson } from '../util.js';
import type { Embedder } from '../context/embeddings.js';
import { cosineSimilarity } from '../context/embeddings.js';
import {
  classifyPair,
  contradictionSignals,
  hashContent,
  hybridSimilarity,
  isCorroborationType,
  MemoryEmbeddingCache,
  type PairRelationship,
} from './semantic.js';

export interface MemoryQuery {
  type?: MemoryType;
  scope?: string;
  text?: string;
  limit?: number;
}

/** Options for explicit MemoryStore.search() (Memory Search milestone).
 *  Reuses the retrieval pipeline: same tokenizer, same STOPWORDS, same score
 *  weights, authorization via visibleTo() BEFORE any scoring. */
export interface MemorySearchOptions {
  /** Maximum number of ranked results (default 10). */
  limit?: number;
  /** Isolation context — enforced BEFORE selection/scoring, same as retrieve(). */
  ctx?: MemoryRetrievalContext;
  /** Structured filters (ac-14). */
  scope?: string;
  visibility?: MemoryVisibility;
  agentId?: string;
  projectId?: string;
  type?: MemoryType;
  status?: MemoryStatus;
}

/** Ranked structured search result. Read-only: search NEVER mutates the
 *  entry's access lifecycle (unlike retrieve(), which feeds auto-injection). */
export interface MemorySearchResult {
  id: string;
  claim: string;
  type: MemoryType;
  scope: string;
  visibility: MemoryVisibility;
  agentId?: string;
  confidence: number;
  importance: number;
  status: MemoryStatus;
  sourceType?: MemorySourceType;
  /** Provenance origin note (entry.source). */
  provenance?: string;
  createdAt: string;
  updatedAt?: string;
  /** Blended rank score — identical weight formula as retrieve(). */
  score: number;
  lexicalScore: number;
  /** Present only when an embedder produced a usable query vector. */
  semanticScore?: number;
  matchReason: 'exact' | 'lexical' | 'semantic';
}

type MemoryBoundary = Pick<MemoryEntry, 'scope' | 'visibility' | 'agentId' | 'missionId' | 'projectId'>;

function boundaryKey(entry: MemoryBoundary): string {
  const visibility = entry.visibility ?? 'project';
  return JSON.stringify([entry.scope, visibility,
    visibility === 'global' ? null : entry.projectId ?? entry.scope,
    visibility === 'agent' || visibility === 'mission' ? entry.missionId ?? null : null,
    visibility === 'agent' ? entry.agentId ?? null : null]);
}

function dedupeKey(type: MemoryType, scope: string, claim: string, boundary: Partial<MemoryBoundary> = {}): string {
  return JSON.stringify([type, boundaryKey({ ...boundary, scope }), claim.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim()]);
}
export class MemoryStore {
  private entries: MemoryEntry[] = [];
  private baseline = new Map<string, MemoryEntry>();
  private diskText?: string;
  /** Structured audit ring — PERSISTED to a sibling file so the provenance
   *  trail survives restarts (review hardening #1). Retention: last 500. */
  private readonly auditFile: string;
  private audit: MemoryAuditEvent[] = [];
  private static readonly AUDIT_RETENTION = 500;
  /** Observability counters (per-store, per-run when fresh). */
  private retrievedCount = 0;
  private injectedCount = 0;
  private supersededSkippedCount = 0;
  private promotionsCount = 0;

  constructor(private readonly file: string) {
    this.auditFile = path.join(path.dirname(file), 'memory-audit.json');
    this.refresh();
    const persistedAudit = readJson<MemoryAuditEvent[]>(this.auditFile);
    if (Array.isArray(persistedAudit)) {
      this.audit = persistedAudit.slice(-MemoryStore.AUDIT_RETENTION);
    }
    // Migration (review Phase 16): legacy entries predate visibility/ownership.
    // They lived at project visibility scoped to their project name — migrate
    // them safely rather than losing them. Never deletes anything.
    let migrated = 0;
    for (const e of this.entries) {
      if (!e.visibility) {
        e.visibility = 'project';
        e.projectId = e.projectId ?? e.scope;
        migrated += 1;
      }
      e.projectId = e.projectId ?? (e.visibility === 'project' ? e.scope : undefined);
    }
    if (migrated > 0) this.flush();
  }
  static forProject(repoRoot: string): MemoryStore {
    return new MemoryStore(path.join(repoRoot, '.hermes', 'memory.json'));
  }

  /**
   * Add a memory with DEDUPLICATION: the same claim (same type + scope,
   * normalized text) updates the existing entry — bumps confidence, refreshes
   * recency — instead of piling up near-identical rows. Returns the stored
   * entry and whether it was new.
   */
  add(input: {
    type: MemoryType;
    claim: string;
    evidence?: string;
    scope: string;
    confidence?: number;
    importance?: number;
    source?: string;
    sourceType?: MemorySourceType;
    status?: MemoryStatus;
    /** Visibility scope — defaults to the narrowest appropriate: 'project'. */
    visibility?: MemoryVisibility;
    agentId?: string;
    missionId?: string;
    projectId?: string;
    /** Tier 1 pin: promotes this memory into the protected/active tier. */
    pinned?: boolean;
  }): { entry: MemoryEntry; created: boolean } {
    return this.atomic(() => {
      this.refresh();
      const claim = input.claim.trim().replace(/\s+/g, ' ');
      // Visibility-aware dedupe identity (review fix #2): a specialist's
      // PRIVATE memory and their PUBLISHED mission finding are different
      // objects even with identical text — publishing must create a new
      // shareable entry, not collapse into the private one.
      const visibility: MemoryVisibility = input.visibility ?? 'project';
      const key = dedupeKey(input.type, input.scope, claim, input);
      const existing = this.entries.find((e) => dedupeKey(e.type, e.scope, e.claim, e) === key);
      if (existing) {
        existing.confidence = Math.min(1, Math.max(existing.confidence, input.confidence ?? 0.7) + 0.05);
        existing.reobservations = (existing.reobservations ?? 0) + 1;
        existing.evidence = input.evidence ?? existing.evidence;
        existing.importance = Math.max(existing.importance ?? 0.5, input.importance ?? 0.5);
        // Re-observation with a STRONGER source can verify a candidate.
        if (input.status !== 'candidate' && input.sourceType && input.sourceType !== 'model_inference' && (existing.status ?? 'candidate') === 'candidate') {
          existing.status = 'verified';
          existing.lastVerifiedAt = nowIso();
          this.logAudit({ event: 'verified', memoryId: existing.id, agentId: input.agentId, missionId: input.missionId, projectId: existing.projectId, source: input.sourceType });
        }
        existing.updatedAt = nowIso();
        this.flush();
        return { entry: existing, created: false };
      }
      // Lifecycle default: bare model inference starts as an UNVERIFIED
      // candidate; trustworthy sources start verified. Nothing is durable on
      // arrival — durability is earned via promote().
      const status: MemoryStatus =
        input.status ?? (input.sourceType && input.sourceType !== 'model_inference' ? 'verified' : 'candidate');
      // Visibility default: the narrowest appropriate scope. Ownership rules
      // (review Phase 2): agent→agentId, mission→missionId+projectId,
      // project→projectId (defaults to the lexical scope = project name).
      const entry: MemoryEntry = {
        id: shortId('mem'),
        type: input.type,
        claim,
        evidence: input.evidence,
        scope: input.scope,
        confidence: input.confidence ?? 0.7,
        createdAt: nowIso(),
        importance: input.importance ?? 0.5,
        accessCount: 0,
        status,
        source: input.source,
        sourceType: input.sourceType,
        visibility,
        // agentId is ORIGIN PROVENANCE (who created this) at every scope —
        // visibility filtering uses scope + missionId/projectId, so recording
        // the author on mission/project entries never leaks private context.
        ...(input.agentId ? { agentId: input.agentId } : {}),
        ...(visibility === 'agent' ? { missionId: input.missionId, projectId: input.projectId ?? input.scope } : {}),
        ...(visibility === 'mission' ? { missionId: input.missionId, projectId: input.projectId ?? input.scope } : {}),
        ...(visibility === 'project' ? { projectId: input.projectId ?? input.scope } : {}),
        ...(input.pinned ? { pinned: true } : {}),
      };
      if (status === 'verified' || status === 'durable') entry.lastVerifiedAt = nowIso();
      this.entries.push(entry);
      this.flush();
      this.logAudit({ event: 'created', memoryId: entry.id, agentId: entry.agentId, missionId: entry.missionId, projectId: entry.projectId, newVisibility: visibility, source: input.sourceType });
      return { entry, created: true };
    });
  }

  query(q: MemoryQuery = {}, ctx?: MemoryRetrievalContext): MemoryEntry[] {
    this.refresh();
    let results = this.entries;
    // Isolation BEFORE filtering: agent/mission-private memories are invisible
    // to callers outside their boundary (agent-facing memory tool reads).
    if (ctx) results = results.filter((e) => this.visibleTo(e, ctx));
    if (q.type) results = results.filter((e) => e.type === q.type);
    if (q.scope) results = results.filter((e) => e.scope === q.scope);
    if (q.text) {
      const needle = q.text.toLowerCase();
      results = results.filter((e) => e.claim.toLowerCase().includes(needle));
    }
    results = [...results].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return results.slice(0, q.limit ?? 50);
  }

  /**
   * Ranked retrieval (review Phase 7): relevance to the query text + scope
   * match + confidence + importance + recency (14-day half-life decay) +
   * successful-usage bonus, minus nothing — duplicates never exist because
   * add() dedupes. Returned entries get their access lifecycle updated, so
   * memories that keep proving useful surface more readily later.
   */
  retrieve(text: string, scope: string, limit = 8, ctx?: MemoryRetrievalContext): MemoryEntry[] {
    return this.atomic(() => {
      this.refresh();
      const queryTokens = new Set(
        text
          .toLowerCase()
          .split(/[^a-z0-9]+/)
          .filter((t) => t.length > 2 && !STOPWORDS.has(t)),
      );
      const now = Date.now();
      // Isolation BEFORE ranking (review Phase 3): invisible memories never
      // reach the scorer, so filtering cannot be undone by prompt assembly.
      const visible = this.entries.filter((e) => this.visibleTo(e, ctx));
      const scored = visible.map((e) => {
        const claimTokens = e.claim
          .toLowerCase()
          .split(/[^a-z0-9]+/)
          .filter((t) => t.length > 2);
        const overlap = claimTokens.filter((t) => queryTokens.has(t) && !STOPWORDS.has(t)).length;
        const relevance = claimTokens.length > 0 ? Math.min(1, overlap / Math.min(6, Math.max(2, claimTokens.length))) : 0;
        const scopeMatch = e.scope === scope ? 1 : 0.4;
        const ageDays = (now - Date.parse(e.createdAt)) / 86_400_000;
        const recency = Math.pow(0.5, Math.max(0, ageDays) / 14);
        const usage = Math.min(1, (e.accessCount ?? 0) / 10);
        const score =
          0.4 * relevance + 0.2 * scopeMatch + 0.15 * e.confidence + 0.15 * (e.importance ?? 0.5) + 0.08 * recency + 0.02 * usage;
        return { entry: e, score, relevance };
      });
      // Superseded entries that WOULD have matched are counted (telemetry), not shown.
      this.supersededSkippedCount += scored.filter(
        (s) => s.relevance > 0 && (s.entry.status === 'superseded' || s.entry.status === 'archived'),
      ).length;
      const ranked = scored
        // Relevance gate: when a query is given, a memory must actually SHARE
        // ground with it (or be marked critical) — scope/confidence alone never
        // justify injecting information. "The model should never receive
        // information merely because Gitu has it."
        .filter((s) => s.score > 0.2 && (s.relevance > 0 || (s.entry.importance ?? 0.5) >= 0.9))
        // Lifecycle gate: superseded memories are history, not authority — they
        // never surface as current facts. Archived memories stay archived.
        .filter((s) => s.entry.status !== 'superseded' && s.entry.status !== 'archived')
        // Verification preference: verified/durable knowledge outranks equally
        // similar unverified model inference.
        .sort((a, b) => {
          const rank = (e: MemoryEntry): number =>
            (e.status === 'durable' ? 2 : e.status === 'verified' ? 1 : 0);
          const verificationDiff = rank(b.entry) - rank(a.entry);
          if (verificationDiff !== 0) return verificationDiff;
          return b.score - a.score;
        })
        .slice(0, limit)
        .map((s) => s.entry);
      for (const e of ranked) {
        e.accessCount = (e.accessCount ?? 0) + 1;
        e.lastUsedAt = nowIso();
      }
      if (ranked.length > 0) {
        this.flush();
        this.retrievedCount += ranked.length;
        this.logAudit({
          event: 'retrieved',
          memoryId: ranked[0]!.id,
          agentId: ctx?.requestingAgentId,
          missionId: ctx?.missionId,
          projectId: ctx?.projectId,
          reason: `${ranked.length} memory(ies) retrieved`,
        });
      }
      return ranked;
    });
  }

  /**
   * Budgeted context retrieval (review Phase 9): ranked memories that fit a
   * character budget. The context authority decides injection; this only
   * provides candidates that FIT.
   */
  retrieveForContext(
    text: string,
    scope: string,
    opts: { limit?: number; maxChars?: number; ctx?: MemoryRetrievalContext } = {},
  ): MemoryEntry[] {
    const maxChars = opts.maxChars ?? 2_000;
    const out: MemoryEntry[] = [];
    let used = 0;
    for (const e of this.retrieve(text, scope, opts.limit ?? 12, opts.ctx)) {
      const cost = e.claim.length + e.type.length + 12;
      if (used + cost > maxChars) continue;
      out.push(e);
      used += cost;
    }
    this.injectedCount += out.length;
    return out;
  }

  renderForPrompt(scope: string, max = 12, query?: string): string {
    let all: MemoryEntry[];
    if (query && query.trim()) {
      // Ranked retrieval: relevance + scope + confidence + importance +
      // recency + usage — not just "most recent wins".
      all = this.retrieve(query, scope, max);
    } else {
      const relevant = this.query({ scope, limit: max });
      const general = this.query({ limit: max })
        .filter((e) => e.scope !== scope)
        .slice(0, 4);
      all = [...relevant, ...general];
    }
    if (all.length === 0) return '(no stored memory for this project yet)';
    return all.map((e) => `[${e.type}] ${e.claim}${e.evidence ? ` (evidence: ${e.evidence})` : ''}`).join('\n');
  }

  // ── Two-tier retrieval ──────────────────────────────────────────────────
  //
  // Tier 1 — PROTECTED / ACTIVE memory: durable guidance that survives
  // compaction and remains available even when lexical relevance to the active
  // goal is weak. Covers explicit user decisions, hard constraints, active
  // conventions, critical (unresolved/high-importance) failure lessons, safety
  // constraints, and any explicitly pinned memory. These are few and stable, so
  // injecting them is bounded, labeled guidance — not context pollution.
  //
  // Tier 2 — RETRIEVED memory: normal facts/observations/findings/patterns/
  // ordinary lessons use the existing relevance-based lexical/semantic/hybrid
  // retrieval (retrieveForContext). Searchable knowledge, surfaced on relevance.

  /** Memory types that form the protected/active tier by virtue of their kind. */
  private static readonly TIER1_TYPES = new Set<MemoryType>([
    'decision',
    'constraint',
    'project_convention',
  ]);

  /** An entry belongs to Tier 1 (protected) when pinned, of a Tier-1 type, or
   *  a critical/unresolved failure lesson (high importance). */
  private isTier1(entry: MemoryEntry): boolean {
    if (entry.status === 'superseded' || entry.status === 'archived') return false;
    if (entry.pinned) return true;
    if (MemoryStore.TIER1_TYPES.has(entry.type)) return true;
    // Critical failure lessons earn protection: a production-breaking failure
    // (high importance) must not be buried by relevance filtering even after
    // it is resolved — it guards against repeating the mistake.
    if (entry.type === 'failure' && (entry.importance ?? 0) >= 0.9) return true;
    return false;
  }

  /**
   * Tier 1 retrieval: protected/active memories visible to `ctx`, ranked by
   * importance then recency, budgeted. Independent of the goal's lexical
   * relevance — these are durable guidance, not search results.
   */
  retrieveProtected(
    scope: string,
    opts: { limit?: number; maxChars?: number; ctx?: MemoryRetrievalContext } = {},
  ): MemoryEntry[] {
    this.refresh();
    const maxChars = opts.maxChars ?? 2_000;
    const candidates = this.entries
      .filter(
        (e) =>
          e.scope === scope &&
          this.visibleTo(e, opts.ctx) &&
          this.isTier1(e) &&
          e.status !== 'superseded' &&
          e.status !== 'archived',
      )
      .sort(
        (a, b) =>
          (b.importance ?? 0.5) - (a.importance ?? 0.5) ||
          Date.parse(b.createdAt) - Date.parse(a.createdAt),
      );
    const out: MemoryEntry[] = [];
    let used = 0;
    for (const e of candidates) {
      const cost = e.claim.length + e.type.length + 12;
      if (used + cost > maxChars) continue;
      out.push(e);
      used += cost;
      if (out.length >= (opts.limit ?? 12)) break;
    }
    if (out.length > 0) this.injectedCount += out.length;
    return out;
  }

  /** Formatted Tier 1 section for the prompt, or undefined when none. */
  renderProtected(scope: string, max = 12, ctx?: MemoryRetrievalContext): string | undefined {
    const entries = this.retrieveProtected(scope, { limit: max, maxChars: 2_000, ctx });
    if (entries.length === 0) return undefined;
    return `ACTIVE CONSTRAINTS & DECISIONS (protected — always available):\n${entries
      .map((e) => `- [${e.type}] ${e.claim}`)
      .join('\n')}`;
  }

  // ── Lifecycle: candidate → verified → durable; superseded/archived ──────

  /**
   * Promote a memory along the lifecycle. A candidate becomes verified only
   * with real support (evidence, or a trustworthy sourceType — anything but
   * bare model inference). Only verified memories become durable.
   */
  promote(
    id: string,
    opts: { to: 'verified' | 'durable'; evidence?: string; verifiedBy?: string; confidence?: number; importance?: number },
  ): MemoryEntry | undefined {
    return this.atomic(() => {
      this.refresh();
      const e = this.entries.find((m) => m.id === id);
      if (!e) return undefined;
      if (opts.to === 'durable' && (e.status ?? 'candidate') === 'candidate') {
        throw new Error(`memory ${id} is still a candidate — verify it before making it durable`);
      }
      if (opts.to === 'verified' && !opts.evidence && (e.sourceType === 'model_inference' || !e.sourceType)) {
        throw new Error(`memory ${id} has no verification support — model inference needs evidence before promotion`);
      }
      e.status = opts.to;
      if (opts.evidence) e.evidence = opts.evidence;
      if (opts.verifiedBy) e.source = opts.verifiedBy;
      if (opts.confidence !== undefined) e.confidence = Math.max(e.confidence, opts.confidence);
      if (opts.importance !== undefined) e.importance = Math.max(e.importance ?? 0.5, opts.importance);
      e.lastVerifiedAt = nowIso();
      e.updatedAt = nowIso();
      this.flush();
      this.logAudit({ event: 'verified', memoryId: id, reason: opts.verifiedBy, source: opts.to });
      return e;
    });
  }

  /**
   * Contradiction handling (review Phase 6): the old memory is marked
   * superseded (history preserved, never authoritative again) and points at
   * its replacement. The model receives the current verified memory by
   * default because retrieval excludes superseded entries.
   */
  supersede(oldId: string, newId: string): MemoryEntry | undefined {
    return this.atomic(() => {
      this.refresh();
      const old = this.entries.find((m) => m.id === oldId);
      if (!old) return undefined;
      old.status = 'superseded';
      old.supersededBy = newId;
      old.updatedAt = nowIso();
      this.flush();
      this.logAudit({ event: 'superseded', memoryId: oldId, reason: `superseded by ${newId}` });
      return old;
    });
  }

  /**
   * Record a verified fact. Similar wording is not proof of contradiction;
   * replacement requires explicit predecessor IDs and verification support.
   */
  recordVerified(input: {
    type: MemoryType;
    claim: string;
    scope: string;
    evidence?: string;
    sourceType?: MemorySourceType;
    confidence?: number;
    importance?: number;
    replaces?: string[];
  }): { entry: MemoryEntry; supersededIds: string[] } {
    return this.atomic(() => {
      this.refresh();
      const predecessors = (input.replaces ?? []).map((id) => this.entries.find((e) => e.id === id));
      if (predecessors.length && !input.evidence?.trim() && (!input.sourceType || input.sourceType === 'model_inference')) {
        throw new Error('Replacing memory requires verification support');
      }
      if (predecessors.some((e) => !e || e.type !== input.type || boundaryKey(e) !== boundaryKey({ scope: input.scope }))) {
        throw new Error('Replacement memories must exist and have the same type and ownership scope');
      }
      const result = this.add({ ...input, status: 'verified' });
      const supersededIds: string[] = [];
      for (const e of predecessors) {
        if (!e || e.id === result.entry.id || e.status === 'superseded' || e.status === 'archived') continue;
        this.supersede(e.id, result.entry.id);
        supersededIds.push(e.id);
      }
      return { entry: result.entry, supersededIds };
    });
  }

  /** Revalidate a memory (review Phase 14): refresh verification state. */
  verify(id: string, opts: { evidence?: string; by?: string } = {}): MemoryEntry | undefined {
    return this.atomic(() => {
      this.refresh();
      const e = this.entries.find((m) => m.id === id);
      if (!e || e.status === 'superseded' || e.status === 'archived') return e;
      e.status = e.status === 'durable' ? 'durable' : 'verified';
      e.lastVerifiedAt = nowIso();
      e.updatedAt = nowIso();
      if (opts.evidence) e.evidence = opts.evidence;
      if (opts.by) e.source = opts.by;
      this.flush();
      this.logAudit({ event: 'verified', memoryId: id, reason: opts.by ?? 'revalidation', source: opts.evidence });
      return e;
    });
  }

  /** Archive (never destroy) — the terminal rest for decayed memories. */
  archive(id: string): boolean {
    return this.atomic(() => {
      this.refresh();
      const e = this.entries.find((m) => m.id === id);
      if (!e) return false;
      e.status = 'archived';
      e.updatedAt = nowIso();
      this.flush();
      this.logAudit({ event: 'archived', memoryId: id, reason: 'archived' });
      return true;
    });
  }

  /**
   * Conservative decay (review Phase 7): archive low-confidence,
   * low-importance, never-used observations older than the window.
   * Decisions, architecture, constraints, preferences, lessons and patterns
   * have ZERO decay — important knowledge is never destroyed for being old.
   */
  decay(opts: { olderThanDays?: number } = {}): string[] {
    return this.atomic(() => {
      this.refresh();
      const windowDays = opts.olderThanDays ?? 30;
      const zeroDecayTypes = new Set<MemoryType>(['decision', 'architecture', 'constraint', 'preference', 'lesson', 'pattern', 'project_convention']);
      const cutoff = Date.now() - windowDays * 86_400_000;
      const archived: string[] = [];
      for (const e of this.entries) {
        if (e.status === 'archived' || e.status === 'superseded') continue;
        if (zeroDecayTypes.has(e.type)) continue;
        if ((e.importance ?? 0.5) >= 0.7) continue;
        if (e.confidence >= 0.5) continue;
        if ((e.accessCount ?? 0) > 0) continue;
        if (Date.parse(e.createdAt) > cutoff) continue;
        e.status = 'archived';
        e.updatedAt = nowIso();
        archived.push(e.id);
        this.logAudit({ event: 'archived', memoryId: e.id, reason: 'decay' });
      }
      if (archived.length > 0) this.flush();
      return archived;
    });
  }

  /**
   * Consolidation (review Phase 5): group same-type, same-scope memories
   * with high claim overlap and merge each group into ONE stronger memory
   * whose claim combines the contributors. Contributors are marked
   * superseded (history preserved) and point at the consolidated memory.
   */
  consolidate(scope?: string): { merged: MemoryEntry[]; supersededIds: string[]; flagged: { aId: string; bId: string; reason: string }[] } {
    return this.atomic(() => {
      this.refresh();
      const pool = this.entries.filter(
        (e) => (e.status === 'candidate' || e.status === 'verified') && (!scope || e.scope === scope),
      );
      const groups: MemoryEntry[][] = [];
      const flagged: { aId: string; bId: string; reason: string }[] = [];
      for (const e of pool) {
        // The LEXICAL fallback applies the same contradiction protection as the
        // semantic path: high-overlap pairs whose unique substantive terms
        // differ (Zustand vs Redux) are subject swaps — keep both and flag,
        // never merge.
        const target = groups.find(
          (g) => g[0]!.type === e.type && boundaryKey(g[0]!) === boundaryKey(e) && overlapRatio(g[0]!.claim, e.claim) >= 0.45,
        );
        if (target) {
          // Corroboration types (failures, lessons, observations...) REINFORCE
          // each other — the same failure seen twice is evidence, not a
          // contradiction. The gate protects only state-assertion memories.
          const signals = isCorroborationType(e.type) ? 0 : contradictionSignals(target[0]!.claim, e.claim);
          if (signals >= 2) {
            flagged.push({ aId: target[0]!.id, bId: e.id, reason: `possible contradiction (${signals} unique substantive terms differ) — kept separate` });
            this.logAudit({
              event: 'flagged',
              memoryId: target[0]!.id,
              projectId: e.projectId,
              reason: `POSSIBLE MEMORY CONTRADICTION with ${e.id} — lexical fallback kept both; supersession requires independent evidence`,
              source: 'lexical-contradiction-check',
            });
            continue;
          }
          target.push(e);
        } else {
          groups.push([e]);
        }
      }
      const merged: MemoryEntry[] = [];
      const supersededIds: string[] = [];
      for (const group of groups) {
        if (group.length < 2) continue;
        const result = this.mergeGroup(group);
        if (result) {
          merged.push(result);
          for (const g of group) {
            supersededIds.push(g.id);
          }
        }
      }
      return { merged, supersededIds, flagged };
    });
  }

  /** Merge a compatible group into one stronger memory (provenance kept). */
  private mergeGroup(group: MemoryEntry[]): MemoryEntry | undefined {
    const expected = group.map((g) => JSON.stringify([g.claim, g.status, boundaryKey(g)]));
    return this.atomic(() => {
      this.refresh();
      // Embedding work can yield to other sessions. Recheck ownership and
      // lifecycle under the write lock before publishing a derived memory.
      if (group.some((g, i) => !this.entries.includes(g)
        || JSON.stringify([g.claim, g.status, boundaryKey(g)]) !== expected[i]
        || (g.status !== 'candidate' && g.status !== 'verified')
        || boundaryKey(g) !== boundaryKey(group[0]!))) return undefined;
      const combined = group
        .map((g) => g.claim.replace(/^(the |a |an )/i, ''))
        .join('; ')
        .slice(0, 400);
      const best = group.reduce((a, b) => ((b.confidence ?? 0) > (a.confidence ?? 0) ? b : a));
      const result = this.add({
        type: best.type,
        claim: combined,
        scope: best.scope,
        visibility: best.visibility,
        agentId: best.agentId,
        missionId: best.missionId,
        projectId: best.projectId,
        pinned: group.some((g) => g.pinned),
        evidence: group.map((g) => g.evidence).filter(Boolean).join(' | ') || undefined,
        confidence: Math.min(1, Math.max(...group.map((g) => g.confidence)) + 0.05),
        importance: Math.max(...group.map((g) => g.importance ?? 0.5)),
        source: `consolidated from ${group.length} memories (${group.map((g) => g.id).join(', ')})`,
        sourceType: group.every((g) => g.sourceType === 'model_inference') ? 'model_inference' : 'tool_result',
        status: group.every((g) => g.status === 'verified') ? 'verified' : 'candidate',
      }).entry;
      for (const entry of group) this.supersede(entry.id, result.id);
      this.logAudit({ event: 'consolidated', memoryId: result.id, projectId: result.projectId, reason: `merged ${group.length} memories`, source: group.map((g) => g.id).join(',') });
      return result;
    });
  }

  // ── Semantic layer (review: semantic consolidation / advisory
  //    contradictions / success patterns). Embeddings FIND candidates;
  //    lexical + compatibility checks decide. Failures degrade to lexical. ──

  private embedder?: Embedder;
  private embeddingCache?: MemoryEmbeddingCache;
  private readonly entryVectors = new Map<string, Float32Array>();
  private semanticCandidates = 0;
  private semanticDuplicates = 0;
  private semanticRelated = 0;
  private semanticContradictions = 0;
  private semanticMerged = 0;
  private embeddingFallbacks = 0;
  private successObservations = 0;
  private successPatternsPromoted = 0;
  private possibleContradictions = 0;

  /**
   * Explicit structured search (Memory Search milestone). Mirrors retrieve()'s
   * scoring EXACTLY — same tokenizer, canonical STOPWORDS, same weight formula
   * (0.4 relevance + 0.2 scope + 0.15 confidence + 0.15 importance + 0.08
   * recency + 0.02 usage) — but is READ-ONLY (never mutates accessCount/
   * lastUsedAt, unlike retrieve() which feeds automatic context injection),
   * applies structured filters, and returns a per-result score breakdown.
   * Authorization runs BEFORE selection/scoring via visibleTo(), so invisible
   * memories can never leak through filters or rank order. When an embedder is
   * configured, a semantic component (cosine similarity against cached claim
   * vectors) blends into the SAME relevance term via max(); failures degrade
   * to the pure lexical path. Entries are returned with status/provenance
   * intact — search NEVER merges, supersedes, or rewrites anything.
   */
  async search(query: string, options: MemorySearchOptions = {}): Promise<MemorySearchResult[]> {
    this.refresh();
    const limit = options.limit ?? 10;
    const ctx = options.ctx;
    // Isolation BEFORE filtering/ranking (same invariant as retrieve()).
    let candidates = this.entries.filter((e) => this.visibleTo(e, ctx));
    // Structured filters (ac-14).
    if (options.scope !== undefined) candidates = candidates.filter((e) => e.scope === options.scope);
    if (options.visibility !== undefined)
      candidates = candidates.filter((e) => (e.visibility ?? 'project') === options.visibility);
    if (options.agentId !== undefined) candidates = candidates.filter((e) => e.agentId === options.agentId);
    if (options.projectId !== undefined) candidates = candidates.filter((e) => e.projectId === options.projectId);
    if (options.type !== undefined) candidates = candidates.filter((e) => e.type === options.type);
    if (options.status !== undefined)
      candidates = candidates.filter((e) => (e.status ?? 'candidate') === options.status);

    // Identical tokenizer to retrieve(): lowercase, split non-alphanumerics,
    // drop tokens <= 2 chars and canonical stopwords.
    const queryTokens = new Set(
      query
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .filter((t) => t.length > 2 && !STOPWORDS.has(t)),
    );
    const normalizedQuery = query.trim().replace(/\s+/g, ' ').toLowerCase();
    const now = Date.now();

    // Optional semantic component — failure-safe, degrades to lexical-only.
    let queryVec: Float32Array | undefined;
    if (this.embedder && query.trim()) {
      try {
        const [vec] = await this.embedder.embed([query.slice(0, 2_000)]);
        queryVec = vec;
      } catch {
        queryVec = undefined;
      }
    }

    const scored = await Promise.all(
      candidates.map(async (e) => {
        const claimTokens = e.claim
          .toLowerCase()
          .split(/[^a-z0-9]+/)
          .filter((t) => t.length > 2);
        const overlap = claimTokens.filter((t) => queryTokens.has(t) && !STOPWORDS.has(t)).length;
        const lexicalScore =
          claimTokens.length > 0 ? Math.min(1, overlap / Math.min(6, Math.max(2, claimTokens.length))) : 0;
        const exact = e.claim.trim().replace(/\s+/g, ' ').toLowerCase() === normalizedQuery;
        let semanticScore: number | undefined;
        if (queryVec && this.embedder) {
          const vec = await this.vectorFor(e, this.embedder);
          if (vec) semanticScore = cosineSimilarity(queryVec, vec);
        }
        // One relevance term feeds ONE weight formula — lexical and semantic
        // are alternative measures of "shares ground with the query", not two
        // competing rankings.
        const relevance = Math.max(exact ? 1 : 0, lexicalScore, semanticScore ?? 0);
        const scopeMatch = options.scope !== undefined ? (e.scope === options.scope ? 1 : 0.4) : 1;
        const ageDays = (now - Date.parse(e.createdAt)) / 86_400_000;
        const recency = Math.pow(0.5, Math.max(0, ageDays) / 14);
        const usage = Math.min(1, (e.accessCount ?? 0) / 10);
        const score =
          0.4 * relevance + 0.2 * scopeMatch + 0.15 * e.confidence + 0.15 * (e.importance ?? 0.5) + 0.08 * recency + 0.02 * usage;
        return { e, score, lexicalScore, semanticScore, exact, relevance };
      }),
    );

    // Relevance gate (mirrors retrieve()): a result must actually SHARE ground
    // with the query — confidence/importance/scope alone never qualify, so an
    // unrelated high-importance memory cannot dominate.
    return scored
      .filter((s) => s.exact || s.lexicalScore > 0 || (s.semanticScore ?? 0) >= 0.5)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map<MemorySearchResult>((s) => ({
        id: s.e.id,
        claim: s.e.claim,
        type: s.e.type,
        scope: s.e.scope,
        visibility: s.e.visibility ?? 'project',
        agentId: s.e.agentId,
        confidence: s.e.confidence,
        importance: s.e.importance ?? 0.5,
        status: s.e.status ?? 'candidate',
        sourceType: s.e.sourceType,
        provenance: s.e.source,
        createdAt: s.e.createdAt,
        updatedAt: s.e.updatedAt ?? s.e.createdAt,
        score: s.score,
        lexicalScore: s.lexicalScore,
        ...(s.semanticScore !== undefined ? { semanticScore: s.semanticScore } : {}),
        matchReason: s.exact ? 'exact' : (s.semanticScore ?? 0) > s.lexicalScore ? 'semantic' : 'lexical',
      }));
  }

  /** Provide the run's embedder. Failure-safe: without it everything falls
   *  back to the lexical path. */
  setEmbedder(embedder: Embedder | undefined): void {
    this.embedder = embedder;
    if (embedder && !this.embeddingCache) {
      this.embeddingCache = new MemoryEmbeddingCache(path.join(path.dirname(this.file), 'memory-vectors.json'));
    }
  }

  /** Cached vector for a memory's claim; recomputed only when the content
   *  hash changes. Any embedding failure returns undefined (lexical fallback)
   *  and never throws. */
  private async vectorFor(e: MemoryEntry, embedder: Embedder): Promise<Float32Array | undefined> {
    const hash = hashContent(e.claim);
    const cached = this.embeddingCache?.get(embedder.model, hash);
    if (cached) return cached;
    const runtime = this.entryVectors.get(`${e.id}:${hash}`);
    if (runtime) return runtime;
    try {
      const [vec] = await embedder.embed([e.claim.slice(0, 2_000)]);
      if (!vec) {
        this.embeddingFallbacks += 1;
        return undefined;
      }
      this.embeddingCache?.put(embedder.model, hash, vec);
      this.entryVectors.set(`${e.id}:${hash}`, vec);
      return vec;
    } catch {
      this.embeddingFallbacks += 1;
      return undefined;
    }
  }

  /**
   * Hybrid semantic consolidation (review semantic phase): scope/type/lifecycle
   * filtering first, then lexical + embedding candidate scoring, then
   * compatibility checks. ONLY strong duplicates auto-consolidate; possible
   * duplicates and possible contradictions are FLAGGED for evaluation.
   * Without an embedder this is exactly the lexical consolidate().
   */
  async consolidateSemantic(opts: { scope?: string; embedder?: Embedder; maxPool?: number } = {}): Promise<{
    merged: MemoryEntry[];
    supersededIds: string[];
    flagged: { aId: string; bId: string; hybrid: number; relationship: PairRelationship }[];
    classified: Record<string, number>;
  }> {
    const embedder = opts.embedder ?? this.embedder;
    this.refresh();
    if (!embedder) {
      this.embeddingFallbacks += 1;
      const lexical = this.consolidate(opts.scope);
      this.semanticMerged += lexical.merged.length;
      return { ...lexical, flagged: [], classified: { 'lexical-fallback': lexical.merged.length } };
    }
    const pool = this.entries
      .filter((e) => (e.status === 'candidate' || e.status === 'verified') && (!opts.scope || e.scope === opts.scope))
      .slice(-(opts.maxPool ?? 40));
    // Precompute vectors (cache makes this incremental across runs).
    const withVectors: { entry: MemoryEntry; vector: Float32Array }[] = [];
    for (const e of pool) {
      const vec = await this.vectorFor(e, embedder);
      if (vec) withVectors.push({ entry: e, vector: vec });
    }
    if (withVectors.length < 2) {
      this.embeddingFallbacks += 1;
      const lexical = this.consolidate(opts.scope);
      this.semanticMerged += lexical.merged.length;
      return { ...lexical, flagged: [], classified: { 'lexical-fallback': lexical.merged.length } };
    }
    this.embeddingCache?.flush();

    // The grouping below mutates entries (merge/supersede) based on vectors we
    // computed across awaits — publish it under the cross-process file lock so
    // another session's writes cannot interleave mid-merge. No awaits inside:
    // the lock is held only for this brief section.
    const { merged, supersededIds, flagged, classified } = await this.publishSemanticGroups(withVectors);
    return { merged, supersededIds, flagged, classified };
  }

  /** Grouping + merge/flag pass over precomputed vectors, under the file lock. */
  private async publishSemanticGroups(withVectors: { entry: MemoryEntry; vector: Float32Array }[]): Promise<{
    merged: MemoryEntry[];
    supersededIds: string[];
    flagged: { aId: string; bId: string; hybrid: number; relationship: PairRelationship }[];
    classified: Record<string, number>;
  }> {
    return this.withLock(() => {
      // Union-find style grouping over strong duplicates; flags for the rest.
      const groups: MemoryEntry[][] = withVectors.map((w) => [w.entry]);
      const vectorById = new Map(withVectors.map((w) => [w.entry.id, w.vector]));
      const flagged: { aId: string; bId: string; hybrid: number; relationship: PairRelationship }[] = [];
      const classified: Record<string, number> = {};
      for (let i = 0; i < withVectors.length; i++) {
        for (let j = i + 1; j < withVectors.length; j++) {
          const a = withVectors[i]!.entry;
          const b = withVectors[j]!.entry;
          if (a.type !== b.type) continue; // incompatible types never merge
          if (boundaryKey(a) !== boundaryKey(b)) continue;
          if (a.status === 'superseded' || b.status === 'superseded') continue;
          const semantic = cosineSimilarity(vectorById.get(a.id)!, vectorById.get(b.id)!);
          const lexical = overlapRatio(a.claim, b.claim);
          const hybrid = hybridSimilarity(semantic, lexical);
          let relationship = classifyPair(hybrid, lexical, isCorroborationType(a.type) ? 0 : contradictionSignals(a.claim, b.claim));
          if (relationship === 'possible-contradiction' && (isCorroborationType(a.type) || isCorroborationType(b.type))) {
            relationship = hybrid >= 0.55 && lexical >= 0.2 ? 'strong-duplicate' : 'related';
          }
          classified[relationship] = (classified[relationship] ?? 0) + 1;
          this.semanticCandidates += 1;
          if (relationship === 'strong-duplicate') {
            // Same-project check for project-scoped memories before merging.
            if ((a.projectId && b.projectId && a.projectId !== b.projectId) || a.scope !== b.scope) continue;
            const ga = groups.find((g) => g.includes(a));
            const gb = groups.find((g) => g.includes(b));
            if (ga && gb && ga !== gb) {
              ga.push(...gb);
              const idx = groups.indexOf(gb);
              if (idx >= 0) groups.splice(idx, 1);
            }
          } else if (relationship === 'possible-duplicate' || relationship === 'possible-contradiction') {
            flagged.push({ aId: a.id, bId: b.id, hybrid, relationship });
            if (relationship === 'possible-contradiction') {
              this.semanticContradictions += 1;
              this.possibleContradictions += 1;
              this.logAudit({
                event: 'flagged',
                memoryId: a.id,
                projectId: a.projectId,
                reason: `POSSIBLE MEMORY CONTRADICTION with ${b.id} (similarity ${semantic.toFixed(2)}, lexical ${lexical.toFixed(2)}) — advisory only, no automatic supersession`,
                source: 'semantic-analysis',
              });
            }
          } else if (relationship === 'related') {
            this.semanticRelated += 1;
          }
        }
      }
      this.semanticDuplicates = classified['strong-duplicate'] ?? 0;
      const merged: MemoryEntry[] = [];
      const supersededIds: string[] = [];
      for (const group of groups) {
        if (group.length < 2) continue;
        const result = this.mergeGroup(group);
        if (!result) continue;
        merged.push(result);
        this.semanticMerged += 1;
        for (const g of group) {
          supersededIds.push(g.id);
        }
      }
      return { merged, supersededIds, flagged, classified };
    });
  }

  /**
   * Verified SUCCESS-pattern observations (review success-pattern phase).
   * Only trusted evidence sources count — model claims never do. A pattern
   * requires ≥3 DISTINCT task observations of the same subject, matching the
   * failure-pattern threshold; independent tasks are what make it evidence.
   */
  recordSuccessObservation(input: {
    subject: string;
    taskId: string;
    scope: string;
    sourceType: MemorySourceType;
    evidence?: string;
  }): { promoted: boolean; pattern?: MemoryEntry; distinctObservations: number; reason?: string } {
    return this.atomic(() => {
      const trusted: MemorySourceType[] = ['test', 'browser_evidence', 'task_completion', 'tool_result', 'source_code'];
      if (!trusted.includes(input.sourceType)) {
        return { promoted: false, distinctObservations: 0, reason: `unverified source (${input.sourceType}) — model claims cannot create success patterns` };
      }
      const subject = input.subject.trim().replace(/\s+/g, ' ').toLowerCase();
      this.successObservations += 1;
      const added = this.add({
        type: 'evidence',
        claim: subject,
        scope: input.scope,
        evidence: input.evidence ?? input.taskId,
        confidence: 0.8,
        sourceType: input.sourceType,
        status: 'verified',
      });
      const obs = added.entry.observations ?? [];
      if (!obs.includes(input.taskId)) obs.push(input.taskId);
      added.entry.observations = obs;
      added.entry.updatedAt = nowIso();
      const distinct = obs.length;
      if (distinct < 3) {
        this.flush();
        return { promoted: false, distinctObservations: distinct, reason: `${distinct} independent observation(s) — need 3` };
      }
      // Pattern already exists? Dedupe keeps it single (case-insensitive).
      const existing = this.entries.find((m) => m.type === 'pattern' && m.scope === input.scope && m.claim.toLowerCase().includes(subject));
      if (existing) {
        // The observation appended above still needs persisting on this path.
        this.flush();
        return { promoted: false, pattern: existing, distinctObservations: distinct, reason: 'pattern already promoted' };
      }
      const pattern = this.add({
        type: 'pattern',
        claim: `PATTERN: ${input.subject} — verified across ${distinct} independent task(s)`,
        scope: input.scope,
        evidence: `observations: ${obs.join(', ')}${input.evidence ? ` | ${input.evidence}` : ''}`,
        confidence: Math.min(0.95, 0.7 + 0.05 * distinct),
        importance: 0.8,
        sourceType: 'task_completion',
        status: 'verified',
        source: `success observations from tasks ${obs.join(', ')}`,
      }).entry;
      this.successPatternsPromoted += 1;
      this.logAudit({ event: 'promoted', memoryId: pattern.id, projectId: input.scope, reason: `success pattern from ${distinct} independent verified observations` });
      this.flush();
      return { promoted: true, pattern, distinctObservations: distinct };
    });
  }

  /**
   * ADVISORY contradiction detection (review contradiction phase): semantic
   * similarity FINDS candidates; it NEVER supersedes. Possible contradictions
   * are audited and returned for evaluation — supersession happens only
   * through recordVerified()/supersede() with independent evidence.
   */
  async detectContradictions(
    target: { claim: string; type: MemoryType; scope: string },
    embedder?: Embedder,
  ): Promise<{ possibleContradictions: { existingId: string; claim: string; similarity: number; reason: string }[] }> {
    const activeEmbedder = embedder ?? this.embedder;
    const out: { existingId: string; claim: string; similarity: number; reason: string }[] = [];
    if (!activeEmbedder) {
      this.embeddingFallbacks += 1;
      return { possibleContradictions: out }; // advisory unavailable — lexical only
    }
    try {
      const [targetVec] = await activeEmbedder.embed([target.claim.slice(0, 2_000)]);
      if (!targetVec) return { possibleContradictions: out };
      const related = this.entries.filter(
        (e) => e.type === target.type && e.scope === target.scope && e.status !== 'superseded' && e.status !== 'archived',
      );
      for (const e of related) {
        const vec = await this.vectorFor(e, activeEmbedder);
        if (!vec) continue;
        const semantic = cosineSimilarity(targetVec, vec);
        const lexical = overlapRatio(target.claim, e.claim);
        const signals = contradictionSignals(target.claim, e.claim);
        // Subject vocabulary is shared by both claims (authentication/
        // session/tokens), so lexical overlap runs HIGH for real
        // contradictions — the discriminator is the unique substantive
        // terms (httpOnly vs localStorage), not the overlap ratio.
        if (semantic >= 0.75 && signals >= 2) {
          out.push({
            existingId: e.id,
            claim: e.claim.slice(0, 200),
            similarity: semantic,
            reason: `semantically close (${semantic.toFixed(2)}) but lexically divergent — different implementation/terms for the same subject`,
          });
          this.possibleContradictions += 1;
          this.semanticContradictions += 1;
          this.logAudit({
            event: 'flagged',
            memoryId: e.id,
            projectId: e.projectId,
            reason: `POSSIBLE MEMORY CONTRADICTION with new claim "${target.claim.slice(0, 120)}" (similarity ${semantic.toFixed(2)}) — advisory; supersession requires independent evidence via recordVerified()`,
            source: 'semantic-contradiction-check',
          });
        }
      }
    } catch {
      this.embeddingFallbacks += 1; // advisory layer is always failure-safe
    }
    return { possibleContradictions: out };
  }

  /** Structured failure lesson (review Phase 12): action, cause, fix,
   *  verification, lesson — one retrievable record. */
  addFailureLesson(input: {
    action: string;
    cause: string;
    fix?: string;
    verification?: string;
    scope: string;
    confidence?: number;
    importance?: number;
    /** Pin into Tier 1 when this is a critical failure worth protecting. */
    pinned?: boolean;
  }): { entry: MemoryEntry; created: boolean } {
    const parts = [`FAILURE: ${input.action}`, `CAUSE: ${input.cause}`];
    if (input.fix) parts.push(`FIX: ${input.fix}`);
    if (input.verification) parts.push(`VERIFICATION: ${input.verification}`);
    return this.add({
      type: 'failure',
      claim: parts.join(' | '),
      scope: input.scope,
      confidence: input.confidence ?? 0.8,
      importance: input.importance ?? 0.7,
      sourceType: 'failure_analysis',
      status: 'verified',
      ...(input.pinned ? { pinned: true } : {}),
    });
  }

  /**
   * Learned patterns (review Phase 13): a repeated VERIFIED observation may
   * become a pattern — never a single speculative observation. The store
   * tracks re-observations via dedupe confidence bumps; ≥3 occurrences with
   * confidence ≥ 0.85 earns the pattern.
   */
  maybePromotePattern(input: { entryId: string; patternClaim: string; scope: string }): MemoryEntry | undefined {
    return this.atomic(() => {
      this.refresh();
      const e = this.entries.find((m) => m.id === input.entryId);
      if (!e) return undefined;
      // Occurrences = creation + explicit re-observation counter. Entries that
      // predate the counter fall back to the historical confidence-step
      // estimate (which assumed a 0.7 base and +0.05 per bump).
      const occurrences = (e.reobservations ?? Math.round((e.confidence - 0.7) / 0.05)) + 1;
      if (occurrences < 3 || e.confidence < 0.85) return undefined;
      const existing = this.entries.find((m) => m.type === 'pattern' && m.scope === input.scope && dedupeKey(m.type, m.scope, m.claim) === dedupeKey('pattern', input.scope, input.patternClaim));
      if (existing) return existing;
      const pattern = this.add({
        type: 'pattern',
        claim: `PATTERN: ${input.patternClaim}`,
        scope: input.scope,
        confidence: 0.85,
        importance: 0.8,
        sourceType: 'task_completion',
        status: 'verified',
      });
      return pattern.entry;
    });
  }

  /** Observability (review Phase 16): lifecycle counters. */
  stats(): {
    total: number;
    byStatus: Record<string, number>;
    byType: Record<string, number>;
    byVisibility: Record<string, number>;
    retrieved: number;
    injected: number;
    supersededSkipped: number;
    promotions: number;
    auditEvents: number;
    semantic: {
      semanticCandidates: number;
      semanticDuplicates: number;
      semanticRelated: number;
      semanticContradictions: number;
      semanticMerged: number;
      embeddingCacheHits: number;
      embeddingCacheMisses: number;
      embeddingFallbacks: number;
      successObservations: number;
      successPatternsPromoted: number;
      possibleContradictions: number;
    };
  } {
    this.refresh();
    const byStatus: Record<string, number> = {};
    const byType: Record<string, number> = {};
    const byVisibility: Record<string, number> = {};
    for (const e of this.entries) {
      byStatus[e.status ?? 'candidate'] = (byStatus[e.status ?? 'candidate'] ?? 0) + 1;
      byType[e.type] = (byType[e.type] ?? 0) + 1;
      const v = e.visibility ?? 'project';
      byVisibility[v] = (byVisibility[v] ?? 0) + 1;
    }
    return {
      total: this.entries.length,
      byStatus,
      byType,
      byVisibility,
      retrieved: this.retrievedCount,
      injected: this.injectedCount,
      supersededSkipped: this.supersededSkippedCount,
      promotions: this.promotionsCount,
      auditEvents: this.audit.length,
      semantic: {
        semanticCandidates: this.semanticCandidates,
        semanticDuplicates: this.semanticDuplicates,
        semanticRelated: this.semanticRelated,
        semanticContradictions: this.semanticContradictions,
        semanticMerged: this.semanticMerged,
        embeddingCacheHits: this.embeddingCache?.hits ?? 0,
        embeddingCacheMisses: this.embeddingCache?.misses ?? 0,
        embeddingFallbacks: this.embeddingFallbacks,
        successObservations: this.successObservations,
        successPatternsPromoted: this.successPatternsPromoted,
        possibleContradictions: this.possibleContradictions,
      },
    };
  }

  /**
   * Scope promotion (review Phases 5-8): the ONLY path between visibility
   * scopes. Allowed: agent→mission, agent→project, mission→project,
   * project→global. Reverse transitions are rejected — create a new scoped
   * derived memory instead. The original provenance trail is extended, never
   * destroyed.
   */
  promoteScope(
    id: string,
    target: MemoryVisibility,
    opts: { reason?: string; by?: string; missionId?: string; projectId?: string } = {},
  ): MemoryEntry | undefined {
    return this.atomic(() => {
      this.refresh();
      const e = this.entries.find((m) => m.id === id);
      if (!e) return undefined;
      const from: MemoryVisibility = e.visibility ?? 'project';
      const allowed: Record<MemoryVisibility, MemoryVisibility[]> = {
        agent: ['mission', 'project'],
        mission: ['project'],
        project: ['global'],
        global: [],
      };
      if (!allowed[from].includes(target)) {
        throw new Error(`cannot promote memory ${id} from ${from} to ${target} — allowed: ${from} → ${allowed[from].join(', ') || 'nothing'}`);
      }
      // Ownership requirements for the TARGET scope.
      const missionId = target === 'mission' ? (opts.missionId ?? e.missionId) : e.missionId;
      const projectId = target === 'project' || target === 'mission' ? (opts.projectId ?? e.projectId ?? e.scope) : e.projectId;
      if (target === 'mission' && !missionId) throw new Error(`mission-scope memory ${id} requires a missionId`);
      if ((target === 'mission' || target === 'project') && !projectId) throw new Error(`${target}-scope memory ${id} requires a projectId`);
      e.promotedFrom = [...(e.promotedFrom ?? []), { visibility: from, at: nowIso(), reason: opts.reason }];
      e.visibility = target;
      if (missionId) e.missionId = missionId;
      if (projectId) e.projectId = projectId;
      e.updatedAt = nowIso();
      this.promotionsCount += 1;
      this.flush();
      this.logAudit({
        event: 'promoted',
        memoryId: id,
        agentId: e.agentId,
        missionId: e.missionId,
        projectId: e.projectId,
        oldVisibility: from,
        newVisibility: target,
        reason: opts.reason,
        source: opts.by,
      });
      return e;
    });
  }

  /**
   * Cross-specialist findings (review Phase 12): a specialist publishes a
   * finding into the NORMAL evaluation pipeline — mission-visible but a
   * CANDIDATE until verified. It never auto-becomes durable project memory.
   */
  publishFinding(input: {
    agentId: string;
    missionId?: string;
    projectId?: string;
    scope: string;
    type: MemoryType;
    content: string;
    evidence?: string;
    confidence?: number;
    sourceType?: MemorySourceType;
  }): MemoryEntry {
    // Publication is NEVER verification (review trust model): a specialist's
    // finding — even one claiming evidence — enters as a CANDIDATE for the
    // mission's evaluation pipeline. Only independent verification promotes.
    const entry = this.add({
      type: input.type,
      claim: input.content,
      scope: input.scope,
      evidence: input.evidence,
      confidence: input.confidence ?? 0.6,
      source: `specialist ${input.agentId}`,
      sourceType: input.sourceType ?? (input.evidence ? 'browser_evidence' : 'model_inference'),
      status: 'candidate',
      visibility: 'mission',
      agentId: input.agentId,
      missionId: input.missionId,
      projectId: input.projectId ?? input.scope,
    }).entry;
    return entry;
  }

  snapshotStats() {
    return this.stats();
  }

  private flush(): void {
    this.atomic(() => {
      this.refresh();
      writeJson(this.file, this.entries);
      this.baseline = new Map(this.entries.map((e) => [e.id, structuredClone(e)]));
      this.diskText = `${JSON.stringify(this.entries, null, 2)}\n`;
    });
  }

  /**
   * Concurrency model:
   * - Sync methods (add/promote/retrieve/...) run their read-modify-write in a
   *   single event-loop turn via atomic(), so they are atomic within a process.
   *   Across processes, refresh()'s field-level merge converges concurrent
   *   writers; the residual last-writer window is sub-millisecond.
   * - Operations that mutate ACROSS await points (embedding-backed
   *   consolidation) must hold the real cross-process file lock via withLock()
   *   around the mutating section. The lock is async (never blocks the event
   *   loop) and is never held during long awaits such as embedding calls.
   */
  async withLock<T>(action: () => Promise<T> | T): Promise<T> {
    return await withMemoryFileLock(this.file, async () => {
      this.refresh();
      try {
        return await action();
      } finally {
        this.refresh();
      }
    });
  }

  /** Synchronous in-process critical section. See the class concurrency notes. */
  private atomic<T>(action: () => T): T {
    return action();
  }

  private readDisk<T>(file: string): T[] {
    const data: unknown = JSON.parse(this.readDiskText(file));
    if (!Array.isArray(data)) throw new Error(`Invalid memory file: ${file}`);
    return data as T[];
  }

  private readDiskText(file: string): string {
    try {
      return readFileSync(file, 'utf8');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return '[]';
      // Never turn an unreadable/corrupt store into an empty writable one.
      throw error;
    }
  }

  /** Merge only locally changed fields into the latest disk snapshot. This
   * keeps access updates from reverting another session's lifecycle changes.
   * Preserve entry references held by callers and by consolidation groups. */
  private refresh(): void {
      const diskText = this.readDiskText(this.file);
      if (diskText === this.diskText) {
        return;
      }
      const disk: MemoryEntry[] = JSON.parse(diskText);
      if (!Array.isArray(disk)) throw new Error(`Invalid memory file: ${this.file}`);
      const merged = new Map(disk.map((e) => [e.id, e]));
      for (const local of this.entries) {
        const previous = this.baseline.get(local.id);
        const latest = merged.get(local.id);
        if (!previous) {
          merged.set(local.id, local);
          continue;
        }
        // A removed disk entry must not be resurrected by an old reader.
        if (!latest) continue;
        const fields = new Set([...Object.keys(previous), ...Object.keys(local)]);
        const changes: Record<string, unknown> = {};
        for (const field of fields) {
          const key = field as keyof MemoryEntry;
          if (JSON.stringify(local[key]) === JSON.stringify(previous[key])) continue;
          changes[key] = key === 'accessCount'
            ? (latest.accessCount ?? 0) + (local.accessCount ?? 0) - (previous.accessCount ?? 0)
            : key === 'observations'
              ? [...new Set([...(latest.observations ?? []), ...(local.observations ?? [])])]
              : local[key];
        }
        // Remove fields that another session removed (e.g. scope promotion).
        for (const key of Object.keys(local)) delete (local as unknown as Record<string, unknown>)[key];
        Object.assign(local, latest, changes);
        merged.set(local.id, local);
      }
      this.entries = [...merged.values()];
      this.baseline = new Map(disk.map((e) => [e.id, structuredClone(e)]));
      this.diskText = diskText;
  }

  /** Structured audit event — appended to the PERSISTED ring (retention 500). */
  private logAudit(event: Omit<MemoryAuditEvent, 'at'>): void {
    try {
      this.audit = this.readDisk<MemoryAuditEvent>(this.auditFile);
      this.audit.push({ at: nowIso(), ...event });
      this.audit = this.audit.slice(-MemoryStore.AUDIT_RETENTION);
      writeJson(this.auditFile, this.audit);
    } catch {
      /* audit persistence must never break memory operations */
    }
  }

  /** Visibility/explainability (review Phase 9): full provenance for one memory. */
  explain(id: string): {
    entry: MemoryEntry | undefined;
    audit: MemoryAuditEvent[];
  } {
    this.refresh();
    try { this.audit = this.readDisk<MemoryAuditEvent>(this.auditFile); } catch {}
    const entry = this.entries.find((m) => m.id === id);
    return { entry, audit: this.audit.filter((a) => a.memoryId === id) };
  }

  /**
   * Visibility rules (review Phase 3), enforced BEFORE ranking:
   *   global  → everyone
   *   project → same project (legacy entries carry projectId = their scope)
   *   mission → same mission
   *   agent   → only the owning specialist
   */
  private visibleTo(e: MemoryEntry, ctx?: MemoryRetrievalContext): boolean {
    const v: MemoryVisibility = e.visibility ?? 'project';
    if (ctx?.allowedScopes && !ctx.allowedScopes.includes(v)) return false;
    if (v === 'global') return true;
    if (v === 'project') return !ctx?.projectId || !e.projectId || e.projectId === ctx.projectId;
    // Mission visibility: shared within a mission. A published finding WITHOUT
    // a missionId is a deliberate project-wide share — visible to any member.
    if (v === 'mission') {
      if (e.missionId) return !!ctx?.missionId && e.missionId === ctx.missionId;
      return !ctx?.projectId || !e.projectId || e.projectId === ctx.projectId;
    }
    return !!ctx?.requestingAgentId && e.agentId === ctx.requestingAgentId;
  }
}

/** Lexical overlap ratio between two claims (token Jaccard-ish). */
function overlapRatio(a: string, b: string): number {
  const ta = new Set(a.toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length > 3));
  const tb = new Set(b.toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length > 3));
  if (ta.size === 0 || tb.size === 0) return 0;
  let shared = 0;
  for (const t of ta) if (tb.has(t)) shared += 1;
  return shared / Math.min(ta.size, tb.size);
}
