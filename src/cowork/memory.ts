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
