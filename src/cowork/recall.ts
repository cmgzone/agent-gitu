/**
 * Cross-session recall index — the "read" half of the memory system.
 *
 * One SQLite file indexes BOTH kinds of experience the team accumulates:
 *  - 'message' rows: every cowork chat message (the transcript pile), and
 *  - 'memory' rows: curated MemoryStore entries (shared knowledge only —
 *    agent-private memories are NEVER indexed; visibility isolation holds).
 * Keyword recall is FTS5; semantic recall blends embedding cosine (same
 * resolveEmbedder() as the code index, local hashing fallback). Degrades
 * safely: no embedder → pure FTS; no FTS → the store's substring scan.
 * Incremental via change cursors; schema-versioned so upgrades rebuild.
 */
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import type { CoworkStore } from './store.js';
import { ensureGituHome } from '../workspace/home.js';
import { cosineSimilarity, decodeVector, type Embedder } from '../context/embeddings.js';

export interface RecallHit {
  conversationId: string;
  conversationTitle: string;
  seq: number;
  id: string;
  role: string;
  agentName?: string;
  ts: string;
  snippet: string;
  score: number;
  semanticScore?: number;
}

export interface RecallSearchOptions {
  limit?: number;
  conversationId?: string;
}

const SYNC_BUDGET = 240;
const EMBED_BATCH = 32;
const SCHEMA_VERSION = '2';

export type RecallKind = 'message' | 'memory';

export class CoworkRecall {
  private readonly db: DatabaseSync;
  private ftsAvailable = true;
  private embedderBroken = false;

  constructor(
    readonly dbPath: string,
    private readonly store: CoworkStore,
    private readonly embedder?: Embedder,
  ) {
    mkdirSync(path.dirname(dbPath), { recursive: true });
    this.db = new DatabaseSync(dbPath);
    this.db.exec('CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT)');
    // Schema v2 tags rows with a kind (message | memory); older layouts rebuild.
    if (this.readMeta('schema') !== SCHEMA_VERSION) {
      this.db.exec('DROP TABLE IF EXISTS fts');
      this.db.exec('DROP TABLE IF EXISTS docs');
      this.db.exec('DROP TABLE IF EXISTS vecs');
      this.db.exec('DELETE FROM meta');
      this.db.exec(`INSERT INTO meta (key, value) VALUES ('schema', '${SCHEMA_VERSION}')`);
    }
    this.db.exec("CREATE TABLE IF NOT EXISTS docs (kind TEXT, key TEXT PRIMARY KEY, title TEXT, role TEXT, agent_name TEXT, ts TEXT, sort_ts INTEGER, text TEXT)");
    this.db.exec('CREATE TABLE IF NOT EXISTS vecs (key TEXT PRIMARY KEY, model TEXT, vec BLOB)');
    try {
      this.db.exec('CREATE VIRTUAL TABLE IF NOT EXISTS fts USING fts5(body, rowkey UNINDEXED, kind UNINDEXED, title UNINDEXED, role UNINDEXED, agent_name UNINDEXED, ts UNINDEXED)');
    } catch {
      this.ftsAvailable = false; // node built without FTS5 — substring fallback
    }
  }

  private readMeta(key: string): string | undefined {
    try {
      const row = this.db.prepare('SELECT value FROM meta WHERE key = ?').get(key) as { value?: string } | undefined;
      return row?.value;
    } catch {
      return undefined;
    }
  }

  private setMeta(key: string, value: string): void {
    this.db.prepare('INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value').run(key, value);
  }

  private metaKeysWithPrefix(prefix: string): string[] {
    return (this.db.prepare('SELECT key FROM meta WHERE key LIKE ?').all(`${prefix}%`) as { key: string }[]).map((row) => row.key);
  }

  /** Index for the current workspace, stored under the Gitu cache (one SQLite
   *  file, so growth is indexed rather than a full JSON rescan). */
  static forWorkspace(store: CoworkStore, embedder?: Embedder): CoworkRecall {
    return new CoworkRecall(path.join(ensureGituHome().cache, 'cowork-recall.db'), store, embedder);
  }

  /** Generic durable cursor (used by the distillation pass). */
  getMeta(key: string): string | undefined {
    return this.readMeta(key);
  }

  setCursor(key: string, value: string): void {
    this.setMeta(key, value);
  }

  /** Insert/replace one indexed row (shared by chat messages and memories). */
  indexDoc(doc: { kind: RecallKind; key: string; title: string; role: string; agentName?: string; ts: string; text: string; embed?: boolean }): void {
    const sortTs = Date.parse(doc.ts) || 0;
    this.db.prepare('INSERT OR REPLACE INTO docs (kind, key, title, role, agent_name, ts, sort_ts, text) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .run(doc.kind, doc.key, doc.title, doc.role, doc.agentName ?? '', doc.ts, sortTs, doc.text);
    if (this.ftsAvailable) {
      this.db.prepare('DELETE FROM fts WHERE rowkey = ?').run(doc.key);
      this.db.prepare('INSERT INTO fts (body, rowkey, kind, title, role, agent_name, ts) VALUES (?, ?, ?, ?, ?, ?, ?)')
        .run(doc.text, doc.key, doc.kind, doc.title, doc.role, doc.agentName ?? '', doc.ts);
    }
    if (doc.embed !== false) void this.embedKeys([{ key: doc.key, text: doc.text }]).catch(() => {});
  }

  /** Embed pending texts (batched); vectors land in the vecs table. */
  private async embedKeys(texts: { key: string; text: string }[]): Promise<void> {
    const embedder = this.embedder;
    if (!embedder || this.embedderBroken || texts.length === 0) return;
    const insertVec = this.db.prepare('INSERT OR REPLACE INTO vecs (key, model, vec) VALUES (?, ?, ?)');
    try {
      for (let i = 0; i < texts.length; i += EMBED_BATCH) {
        if (this.embedderBroken) return;
        const batch = texts.slice(i, i + EMBED_BATCH);
        const vectors = await embedder.embed(batch.map((t) => t.text.slice(0, 2_000)));
        for (let j = 0; j < batch.length; j += 1) {
          const vec = vectors[j];
          if (!vec) continue;
          insertVec.run(batch[j]!.key, embedder.model, new Uint8Array(vec.buffer as ArrayBuffer, vec.byteOffset, vec.byteLength));
        }
      }
    } catch {
      this.embedderBroken = true; // fail-quiet: FTS still works
    }
  }

  /** Re-index conversations whose change cursor advanced (budgeted). */
  sync(budget = SYNC_BUDGET): { indexed: number } {
    let left = budget;
    const live = new Set(this.store.listConversations().map((c) => c.id));
    for (const key of this.metaKeysWithPrefix('cursor:')) {
      const id = key.slice('cursor:'.length);
      if (!live.has(id)) {
        this.removeConversation(id);
        this.db.prepare('DELETE FROM meta WHERE key = ?').run(key);
      }
    }
    // Embedding model changed → every stored vector is stale; rebuild.
    if (this.embedder && this.readMeta('embed_model') !== this.embedder.model) {
      this.db.exec('DELETE FROM vecs');
      this.db.exec("DELETE FROM meta WHERE key LIKE 'cursor:%'");
      this.setMeta('embed_model', this.embedder.model);
    }
    for (const conv of this.store.listConversations()) {
      if (left <= 0) break;
      const cursor = this.store.messageChangeCursor(conv.id);
      if (cursor <= Number(this.readMeta(`cursor:${conv.id}`) ?? '-1')) continue;
      const messages = this.store.messages(conv.id);
      this.removeConversation(conv.id);
      for (const m of messages) {
        if (!m.text.trim()) continue;
        this.indexDoc({
          kind: 'message',
          key: `message:${conv.id}:${m.seq}`,
          title: conv.title,
          role: m.role,
          agentName: m.agentName,
          ts: m.ts,
          text: m.text,
          embed: false,
        });
      }
      const pending = messages.filter((m) => m.text.trim()).map((m) => ({ key: `message:${conv.id}:${m.seq}`, text: m.text }));
      if (pending.length > 0) void this.embedKeys(pending).catch(() => {});
      this.setMeta(`cursor:${conv.id}`, String(cursor));
      left -= messages.length;
    }
    return { indexed: budget - left };
  }

  private removeConversation(conversationId: string): void {
    this.db.prepare('DELETE FROM docs WHERE key LIKE ?').run(`message:${conversationId}:%`);
    if (this.ftsAvailable) this.db.prepare('DELETE FROM fts WHERE rowkey LIKE ?').run(`message:${conversationId}:%`);
    this.db.prepare('DELETE FROM vecs WHERE key LIKE ?').run(`message:${conversationId}:%`);
  }

  /** FTS MATCH expression: every term quoted (punctuation can never be read as
   *  FTS syntax) and ANDed together. */
  private matchExpression(query: string): string {
    const terms = query
      .toLowerCase()
      .split(/\s+/)
      .map((t) => t.replace(/[^\p{L}\p{N}_-]+/gu, ''))
      .filter((t) => t.length > 1);
    return terms.map((t) => `"${t.replace(/"/g, '""')}"`).join(' AND ');
  }

  /**
   * Hybrid recall over chat messages AND curated memory entries: FTS5 keyword
   * matches blended with embedding similarity, so "certificate mismatch on the
   * mail server" also finds "mailcow TLS hostname mismatch". Recency breaks
   * ties. Only the query embedding needs the network.
   */
  async search(query: string, opts: RecallSearchOptions = {}): Promise<RecallHit[]> {
    this.sync(120);
    const limit = Math.min(50, Math.max(1, opts.limit ?? 12));
    const match = this.matchExpression(query);
    const rows = match && this.ftsAvailable
      ? (this.db
          .prepare(`SELECT rowkey, kind FROM fts WHERE fts MATCH ?${opts.conversationId ? " AND kind = 'message' AND rowkey LIKE ?" : ''} ORDER BY rank LIMIT ?`)
          .all(...(opts.conversationId ? [match, `message:${opts.conversationId}:%`, limit * 4] : [match, limit * 4])) as { rowkey: string; kind: string }[])
      : [];

    // Blend: keyword rank and embedding similarity are independent signals, so
    // each keeps its own weight and the final score renormalises to whichever
    // signals actually fired (a pure-semantic hit must not be halved).
    const candidates = new Map<string, { lexical: number; semantic: number }>();
    rows.forEach((row, index) => candidates.set(row.rowkey, { lexical: 1 / (1 + index), semantic: 0 }));
    for (const [key, similarity] of await this.semanticScores(query, opts.conversationId)) {
      const existing = candidates.get(key) ?? { lexical: 0, semantic: 0 };
      existing.semantic = similarity;
      candidates.set(key, existing);
    }
    if (candidates.size === 0) return [];

    const titles = new Map(this.store.listConversations().map((c) => [c.id, c.title]));
    const hits: (RecallHit & { sortTs: number })[] = [];
    for (const [key, signals] of candidates) {
      const doc = this.db
        .prepare('SELECT kind, title, role, agent_name, ts, sort_ts, text FROM docs WHERE key = ?')
        .get(key) as { kind: RecallKind; title: string; role: string; agent_name: string; ts: string; sort_ts: number; text: string } | undefined;
      if (!doc) continue;
      const lexical = signals.lexical > 0;
      const semantic = signals.semantic > 0;
      const score = lexical && semantic ? 0.65 * signals.lexical + 0.35 * signals.semantic : semantic ? signals.semantic : signals.lexical;
      // Memory rows surface as their own "conversation" so the reader can tell
      // durable knowledge from raw transcript.
      const parts = key.split(':');
      const conversationId = doc.kind === 'memory' ? 'memory' : parts[1] ?? '';
      const seq = doc.kind === 'memory' ? 0 : Number(parts[2] ?? 0);
      hits.push({
        conversationId,
        conversationTitle: doc.kind === 'memory' ? `memory · ${doc.title}` : titles.get(conversationId) ?? doc.title ?? '(deleted chat)',
        seq,
        id: key,
        role: doc.kind === 'memory' ? 'memory' : doc.role,
        ...(doc.agent_name ? { agentName: doc.agent_name } : {}),
        ts: doc.ts,
        snippet: this.snippet(doc.text, query),
        score,
        ...(semantic ? { semanticScore: signals.semantic } : {}),
        sortTs: doc.sort_ts,
      });
    }
    hits.sort((a, b) => b.score - a.score || b.sortTs - a.sortTs);
    return hits.slice(0, limit).map(({ sortTs: _sortTs, ...hit }) => hit);
  }

  /** Cosine similarity of the query against stored vectors (bounded scan). */
  private async semanticScores(query: string, conversationId?: string): Promise<Map<string, number>> {
    const out = new Map<string, number>();
    if (!this.embedder || this.embedderBroken) return out;
    let queryVec: Float32Array | undefined;
    try {
      [queryVec] = await this.embedder.embed([query]);
    } catch {
      this.embedderBroken = true;
      return out;
    }
    if (!queryVec) return out;
    const rows = (conversationId
      ? this.db.prepare('SELECT key, vec FROM vecs WHERE key LIKE ?').all(`message:${conversationId}:%`)
      : this.db.prepare('SELECT key, vec FROM vecs LIMIT 20000').all()) as { key: string; vec: Uint8Array }[];
    for (const row of rows) {
      const similarity = cosineSimilarity(queryVec, decodeVector(row.vec));
      if (similarity >= 0.35) out.set(row.key, similarity);
    }
    return out;
  }

  /** Bounded snippet centred on the first matching term. */
  private snippet(text: string, query: string): string {
    const lower = text.toLowerCase();
    const first = query.toLowerCase().split(/\s+/).find((term) => term.length > 1 && lower.includes(term.toLowerCase()));
    const at = first ? lower.indexOf(first.toLowerCase()) : 0;
    const start = Math.max(0, at - 80);
    const end = Math.min(text.length, start + 220);
    return `${start > 0 ? '…' : ''}${text.slice(start, end)}${end < text.length ? '…' : ''}`;
  }

  /** Message count in the index (observability). */
  count(kind: RecallKind): number {
    const row = this.db.prepare('SELECT COUNT(*) AS n FROM docs WHERE kind = ?').get(kind) as { n: number } | undefined;
    return row?.n ?? 0;
  }

  close(): void {
    try {
      this.db.close();
    } catch {
      /* already closed */
    }
  }
}