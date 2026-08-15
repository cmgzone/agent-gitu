import path from 'node:path';
import type { MemoryEntry, MemoryType } from '../types.js';
import { nowIso, readJson, shortId, writeJson } from '../util.js';

export interface MemoryQuery {
  type?: MemoryType;
  scope?: string;
  text?: string;
  limit?: number;
}

export class MemoryStore {
  private entries: MemoryEntry[] = [];

  constructor(private readonly file: string) {
    const data = readJson<MemoryEntry[]>(file);
    if (Array.isArray(data)) this.entries = data;
  }

  static forProject(repoRoot: string): MemoryStore {
    return new MemoryStore(path.join(repoRoot, '.hermes', 'memory.json'));
  }

  add(input: { type: MemoryType; claim: string; evidence?: string; scope: string; confidence?: number }): MemoryEntry {
    const entry: MemoryEntry = {
      id: shortId('mem'),
      type: input.type,
      claim: input.claim,
      evidence: input.evidence,
      scope: input.scope,
      confidence: input.confidence ?? 0.7,
      createdAt: nowIso(),
    };
    this.entries.push(entry);
    this.flush();
    return entry;
  }

  query(q: MemoryQuery = {}): MemoryEntry[] {
    let results = this.entries;
    if (q.type) results = results.filter((e) => e.type === q.type);
    if (q.scope) results = results.filter((e) => e.scope === q.scope);
    if (q.text) {
      const needle = q.text.toLowerCase();
      results = results.filter((e) => e.claim.toLowerCase().includes(needle));
    }
    results = [...results].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return results.slice(0, q.limit ?? 50);
  }

  renderForPrompt(scope: string, max = 12): string {
    const relevant = this.query({ scope, limit: max });
    const general = this.query({ limit: max })
      .filter((e) => e.scope !== scope)
      .slice(0, 4);
    const all = [...relevant, ...general];
    if (all.length === 0) return '(no stored memory for this project yet)';
    return all.map((e) => `[${e.type}] ${e.claim}${e.evidence ? ` (evidence: ${e.evidence})` : ''}`).join('\n');
  }

  private flush(): void {
    writeJson(this.file, this.entries);
  }
}
