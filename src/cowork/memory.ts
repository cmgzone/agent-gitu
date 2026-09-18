import { existsSync, readFileSync, readdirSync, renameSync } from 'node:fs';
import path from 'node:path';
import { MemoryStore } from '../memory/memory-store.js';
import type { MemoryRetrievalContext, MemoryType } from '../types.js';
import { ensureGituHome } from '../workspace/home.js';
import type { CoworkAgent } from './store.js';

/**
 * Cowork agents share the SAME memory architecture as the main Gitu agent:
 * one MemoryStore (typed entries, candidate→verified lifecycle, confidence,
 * audit trail) kept at <workspace>/.hermes/memory.json. Isolation reuses the
 * store's visibility rules: an agent's private notes are visibility 'agent'
 * (visible only to that agent), while anything recorded as project/global —
 * including knowledge learned by Gitu runs in the same workspace — is shared
 * team knowledge.
 */

const PREFERENCE_RE = /\b(prefer|prefers|likes|dislikes|hates|avoid|favorite|tone|style)\b|\buser\b/i;

function guessType(text: string): MemoryType {
  return PREFERENCE_RE.test(text) ? 'preference' : 'fact';
}

export class CoworkMemory {
  constructor(
    private readonly memory: MemoryStore,
    private readonly scope: string,
  ) {}

  static forWorkspace(): CoworkMemory {
    const workspace = ensureGituHome().workspace;
    return new CoworkMemory(MemoryStore.forProject(workspace), path.basename(workspace));
  }

  private ctx(agent: CoworkAgent): MemoryRetrievalContext {
    return { requestingAgentId: agent.name, projectId: this.scope };
  }

  remember(agent: CoworkAgent, text: string): number {
    const claim = text.trim();
    if (!claim) throw new Error('Memory text is required');
    this.memory.add({
      type: guessType(claim),
      claim,
      scope: this.scope,
      visibility: 'agent',
      agentId: agent.name,
      sourceType: 'user_statement',
      source: 'cowork chat',
      confidence: 0.8,
      importance: 0.6,
    });
    return this.count(agent);
  }

  recall(agent: CoworkAgent, query?: string): string {
    const ctx = this.ctx(agent);
    if (query && query.trim()) {
      const hits = this.memory.retrieveForContext(query, this.scope, { limit: 12, maxChars: 4_000, ctx });
      if (hits.length === 0) return `No memories match "${query}".`;
      return hits.map((e) => `[${e.type}] ${e.claim}`).join('\n');
    }
    const own = this.memory
      .query({ limit: 50 }, ctx)
      .filter((e) => e.agentId === agent.name && e.status !== 'archived' && e.status !== 'superseded')
      .slice(0, 20);
    if (own.length === 0) return 'Your memory is empty — use action "remember" to persist durable knowledge about the user and your work.';
    return own.map((e, i) => `${i + 1}. [${e.type}] ${e.claim}`).join('\n');
  }

  forget(agent: CoworkAgent, query: string): number {
    const matches = this.memory
      .query({ text: query.trim(), limit: 50 }, this.ctx(agent))
      .filter((e) => e.agentId === agent.name && e.status !== 'archived' && e.status !== 'superseded');
    for (const entry of matches) this.memory.archive(entry.id);
    return matches.length;
  }

  /** Prompt block: the agent's own recent memories plus shared team knowledge. */
  promptBlock(agent: CoworkAgent): string {
    const entries = this.memory
      .query({ limit: 30 }, this.ctx(agent))
      .filter((e) => e.status !== 'archived' && e.status !== 'superseded')
      .slice(0, 12);
    if (entries.length === 0) return '';
    return entries.map((e) => `- [${e.type}] ${e.claim}`).join('\n');
  }

  count(agent: CoworkAgent): number {
    return this.memory
      .query({ limit: 500 }, this.ctx(agent))
      .filter((e) => e.agentId === agent.name && e.status !== 'archived' && e.status !== 'superseded').length;
  }

  clear(agent: CoworkAgent): number {
    const own = this.memory
      .query({ limit: 500 }, this.ctx(agent))
      .filter((e) => e.agentId === agent.name && e.status !== 'archived' && e.status !== 'superseded');
    for (const entry of own) this.memory.archive(entry.id);
    return own.length;
  }

  /** Trusted success-pattern observation from a completed turn. The model
   *  contributes the generalized SUBJECT, never the trust: sourceType is
   *  always 'task_completion' (the same trusted source the main agent's
   *  autoLearn uses), and the store rejects untrusted sources outright. */
  recordSuccessObservation(
    agent: CoworkAgent,
    input: { subject: string; evidence?: string },
  ): { promoted: boolean; distinctObservations: number; reason?: string } {
    return this.memory.recordSuccessObservation({
      subject: input.subject,
      taskId: `cowork-${agent.name}`,
      scope: this.scope,
      sourceType: 'task_completion',
      evidence: input.evidence,
    });
  }

  /** Proactive-learning consolidation sweep: merge duplicates, supersede
   *  contradicted entries, and flag conflicts across the whole team memory.
   *  Pure curation over what agents already wrote — never invents claims. */
  consolidate(): { merged: unknown[]; supersededIds: string[]; flagged: { aId: string; bId: string; reason: string }[] } {
    return this.memory.consolidate(this.scope);
  }

  /** Bounded store: archive the least valuable entries once the active set
   *  exceeds the cap (pinned/verified/high-importance knowledge survives). */
  prune(cap?: number): { archived: number } {
    return this.memory.enforceCap(cap);
  }

  /** Decay: archive stale, low-value, never-retrieved observations. */
  decay(olderThanDays?: number): string[] {
    return this.memory.decay(olderThanDays === undefined ? {} : { olderThanDays });
  }

  /** Shared (non-private) knowledge, for indexing into the recall index.
   *  Agent-private memories are deliberately excluded — visibility holds. */
  sharedEntries(limit = 500): { id: string; type: string; claim: string; confidence: number; createdAt: string }[] {
    return this.memory
      .query({ limit }, this.ctx({ name: '' } as CoworkAgent))
      .filter((e) => (e.visibility ?? 'project') !== 'agent' && e.status !== 'archived' && e.status !== 'superseded')
      .slice(0, limit)
      .map((e) => ({ id: e.id, type: e.type, claim: e.claim, confidence: e.confidence, createdAt: e.createdAt }));
  }

  /** Compaction flush / distillation: record a claim an LLM extracted from old
   *  transcripts. It arrives as an UNVERIFIED candidate via the store's own
   *  trust rule (sourceType model_inference), never as durable knowledge.
   *  Returns false when the claim was already known (dedupe). */
  recordDistilled(input: { agent: CoworkAgent; type: MemoryType; claim: string; source: string; evidence?: string }): boolean {
    const claim = input.claim.trim();
    if (!claim) return false;
    const dup = this.memory
      .query({ text: claim.slice(0, 60), limit: 5 }, this.ctx(input.agent))
      .some((e) => e.claim.toLowerCase().replace(/\s+/g, ' ') === claim.toLowerCase().replace(/\s+/g, ' ') && e.status !== 'archived' && e.status !== 'superseded');
    if (dup) return false;
    this.memory.add({
      type: input.type,
      claim,
      scope: this.scope,
      visibility: 'project',
      sourceType: 'model_inference',
      source: input.source,
      ...(input.evidence ? { evidence: input.evidence } : {}),
      confidence: 0.6,
      importance: 0.5,
    });
    return true;
  }

  /** Stats for the learning loop's activity gate (e.g. only review agents that
   *  actually produced or received memory recently). */
  stats(): { total: number } {
    return { total: this.memory.query({ limit: 10_000 }, undefined).length };
  }

  /** One-time import of the earlier flat fact files into the shared store. */
  migrateLegacyFactFiles(agentNameById: Map<string, string>): number {
    const dir = path.join(ensureGituHome().root, 'Cowork', 'memory');
    if (!existsSync(dir)) return 0;
    let migrated = 0;
    for (const file of readdirSync(dir)) {
      if (!file.endsWith('.json') || file.includes('memory')) continue;
      const agentId = file.replace(/\.json$/, '');
      const name = agentNameById.get(agentId);
      if (!name) continue;
      try {
        const parsed = JSON.parse(readFileSync(path.join(dir, file), 'utf8')) as { facts?: unknown };
        if (!Array.isArray(parsed.facts)) continue;
        for (const fact of parsed.facts.map(String).filter(Boolean)) {
          this.memory.add({
            type: guessType(fact),
            claim: fact,
            scope: this.scope,
            visibility: 'agent',
            agentId: name,
            sourceType: 'user_statement',
            source: 'cowork chat (migrated)',
            confidence: 0.8,
            importance: 0.6,
          });
          migrated += 1;
        }
        renameSync(path.join(dir, file), `${path.join(dir, file)}.migrated`);
      } catch {
        /* skip damaged files; they stay on disk */
      }
    }
    return migrated;
  }
}
