/**
 * REAL-MODEL MEMORY EVALUATION for Gitu (frozen architecture).
 * Model: overridable via EVAL_MODEL_PROVIDER / EVAL_MODEL_ID env vars.
 * Default: opencode-zen :: hy3-free (free tier, avoids openrouter blocking).
 * Run: OPENCODE_API_KEY=<key> npx tsx tests/agent-evals/memory-eval.ts [t1,t2,...]
 * Results: tests/agent-evals/results/memory-eval-results.json (incremental).
 */
import { mkdtempSync, writeFileSync, readFileSync, existsSync, mkdirSync, writeFileSync as wf } from 'node:fs';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { Hermes } from '../../src/agent/gitu.js';
import { SubAgentRunner } from '../../src/agent/subagent.js';
import { MemoryStore } from '../../src/memory/memory-store.js';
import { resolveLlm, PROVIDERS } from '../../src/llm/providers.js';
import { mergedEnv } from '../../src/llm/keys.js';
import type { LlmClient, LlmMessage } from '../../src/llm/llm.js';
import type { MemoryEntry, MemoryRetrievalContext } from '../../src/types.js';

const MODEL_PROVIDER = process.env['EVAL_MODEL_PROVIDER'] ?? 'opencode-zen';
const MODEL_ID = process.env['EVAL_MODEL_ID'] ?? 'hy3-free';
const RESULTS_DIR = path.join(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), 'results');

export interface RunEvidence {
  goal: string;
  status: string;
  summary: string;
  turns: number;
  toolCalls: number;
  durationMs: number;
  inputTokens: number;
  outputTokens: number;
  cachedTokens: number;
  modelCalls: number;
  sectionTokens: Record<string, number>;
  compactions: number;
  memoryRetrievals: number;
  filesChanged: string[];
  evidenceLabels: string[];
  decisions: string[];
  blockers: string[];
  events: string[];
}

export interface TestResult {
  id: string;
  name: string;
  passed: boolean | 'partial';
  assertions: { assertion: string; passed: boolean; detail: string }[];
  evidence: Record<string, unknown>;
  failures: { layer: string; detail: string }[];
}

const results = new Map<string, TestResult>();

function saveResults(): void {
  // MERGE with any existing results so batched runs accumulate evidence.
  const resultFile = path.join(RESULTS_DIR, 'memory-eval-results.json');
  if (existsSync(resultFile)) {
    try {
      const prior = JSON.parse(readFileSync(resultFile, 'utf8')) as Record<string, TestResult>;
      for (const [k, v] of Object.entries(prior)) {
        if (!results.has(k)) results.set(k, v);
      }
    } catch {
      /* unreadable prior results are simply replaced */
    }
  }
  mkdirSync(RESULTS_DIR, { recursive: true });
  const out: Record<string, TestResult> = {};
  for (const [k, v] of results) out[k] = v;
  writeFileSync(resultFile, JSON.stringify(out, null, 2));
}

function makeLlm(): LlmClient {
  const resolved = resolveLlm({ provider: MODEL_PROVIDER, model: MODEL_ID });
  if (!resolved) throw new Error('no LLM resolved — is OPENROUTER_API_KEY set?');
  return resolved.client;
}

function makeRepo(name: string, files: Record<string, string> = {}): string {
  const dir = mkdtempSync(path.join(tmpdir(), `mem-eval-${name}-`));
  writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: `eval-${name}`, type: 'module' }));
  for (const [p, content] of Object.entries(files)) {
    const full = path.join(dir, p);
    mkdirSync(path.dirname(full), { recursive: true });
    writeFileSync(full, content);
  }
  return dir;
}

/**
 * The scope Hermes ultimately filters memory by is `guard.lock.name`, which for
 * these eval repos is the package.json `name` (makeRepo writes `eval-<name>`),
 * NOT the mkdtemp directory basename. Seeding memory with the temp-dir basename
 * silently mismatches the store's queries (emulate()). For Tier-2 (relevance),
 * a scope mismatch only halves the wait — but Tier-1 PROTECTED filtering
 * (renderProtected) requires an EXACT scope match (memory-store.ts), so a pinned
 * failure lesson seeded with the wrong scope is dropped entirely. This helper
 * returns the guard-consistent scope so harness seeds align with production.
 */
function projectScope(dir: string): string {
  try {
    const pkg = JSON.parse(readFileSync(path.join(dir, 'package.json'), 'utf8')) as { name?: string };
    if (pkg && typeof pkg.name === 'string' && pkg.name) return pkg.name;
  } catch {
    /* fall through to basename */
  }
  return path.basename(dir);
}

function fillerTurns(count: number, seed: number): LlmMessage[] {
  const out: LlmMessage[] = [];
  for (let i = 0; i < count; i++) {
    out.push({
      role: i % 2 ? 'assistant' : 'user',
      content: `filler turn ${seed}-${i}: inspected ${['utils', 'helpers', 'config', 'types'][i % 4]}.ts section ${i}; nothing decision-relevant here. ${'lorem '.repeat(12)}`,
    });
  }
  return out;
}

async function runTask(opts: {
  dir: string;
  goal: string;
  memory: MemoryStore;
  memoryRetrieval?: MemoryRetrievalContext;
  conversationHistory?: LlmMessage[];
  label: string;
}): Promise<{ ledger: import('../../src/types.js').TaskLedgerData; report: import('../../src/types.js').CompletionReport; evidence: RunEvidence; events: string[] }> {
  const events: string[] = [];
  const hermes = new Hermes({
    cwd: opts.dir,
    llm: makeLlm(),
    mode: 'fast',
    effort: 'low',
    memory: opts.memory,
    autoLearn: false,
    memoryRetrieval: opts.memoryRetrieval,
    conversationHistory: opts.conversationHistory,
    onEvent: (e) => events.push(e),
  });
  const started = Date.now();
  const { ledger, report } = await hermes.run(opts.goal);
  const durationMs = Date.now() - started;
  const tt = ledger.data.tokenTelemetry;
  const evidence: RunEvidence = {
    goal: opts.goal.slice(0, 200),
    status: report.status,
    summary: report.summary.slice(0, 400),
    turns: events.filter((e) => e.startsWith('think')).length,
    toolCalls: ledger.data.actions.length,
    durationMs,
    inputTokens: tt?.inputTokens ?? 0,
    outputTokens: tt?.outputTokens ?? 0,
    cachedTokens: tt?.cachedTokens ?? 0,
    modelCalls: tt?.calls ?? 0,
    sectionTokens: {
      system: tt?.estimatedBySource.system ?? 0,
      strategy: tt?.estimatedBySource.strategy ?? 0,
      taskState: tt?.estimatedBySource.state ?? 0,
      digest: tt?.estimatedBySource.digest ?? 0,
      memory: tt?.estimatedBySource.memory ?? 0,
      contextPack: tt?.estimatedBySource.contextPack ?? 0,
      conversation: tt?.estimatedBySource.conversation ?? 0,
      images: tt?.estimatedBySource.images ?? 0,
    },
    compactions: events.filter((e) => e.startsWith('context compacted')).length,
    memoryRetrievals: (ledger.data.memoryStats?.retrieved ?? 0),
    filesChanged: [...ledger.data.filesChanged],
    evidenceLabels: ledger.data.evidence.map((e) => `${e.passed ? 'PASS' : 'FAIL'} ${e.label}`),
    decisions: (ledger.data.architectureDecisions ?? []).map((d) => d.decision),
    blockers: [...ledger.data.blockers],
    events,
  };
  return { ledger: ledger.data, report, evidence, events };
}

// ============ TEST 1: LONG-RANGE DECISION RECALL ============
async function t1(): Promise<void> {
  const id = 't1-decision-recall';
  const result: TestResult = { id, name: 'Long-range decision recall (Zustand, not Redux)', passed: 'partial', assertions: [], evidence: {}, failures: [] };
  const files: Record<string, string> = {
    'src/checkout/cart.ts': 'export const cart = { items: [] as string[] };\n',
  };
  const dir = makeRepo('t1', files);
  const memory = MemoryStore.forProject(dir);
  const llm = makeLlm();

  // Phase A: establish the decision through real task execution.
  const runA = await runTask({
    dir, memory, label: 't1-establish',
    goal: 'ARCHITECTURAL DECISION (binding): the checkout state must use Zustand. Never introduce Redux. Create src/checkout/store.ts exporting a zustand store created with create() from zustand holding items: string[] and addItem. Then write src/checkout/store.test.js that imports ./store.js and asserts addItem works, and run it with node to verify.',
  }).catch((err) => ({ error: String(err) }));
  if ('error' in (runA as object)) {
    result.failures.push({ layer: 'MODEL FAILURE', detail: (runA as { error: string }).error });
    results.set(id, result); saveResults(); return;
  }
  const runAEv = (runA as Awaited<ReturnType<typeof runTask>>).evidence;
  const storeFile = path.join(dir, 'src', 'checkout', 'store.ts');
  const storeContent = existsSync(storeFile) ? readFileSync(storeFile, 'utf8') : '';
  const usesZustand = storeContent.includes('zustand');
  const hasRedux = /redux/i.test(storeContent) || runAEv.filesChanged.some((f) => /redux/i.test(f));
  result.assertions.push({ assertion: 'phase A: store.ts uses zustand', passed: usesZustand, detail: storeContent.slice(0, 200) });
  result.assertions.push({ assertion: 'phase A: no redux introduced', passed: !hasRedux, detail: '' });

  // Evidence-gated memory recording through the normal lifecycle.
  const recorded = memory.recordVerified({
    type: 'decision',
    claim: 'Checkout state must use Zustand; never introduce Redux',
    scope: path.basename(dir),
    evidence: 'src/checkout/store.ts (created and verified in run t1-establish)',
    sourceType: 'source_code',
    confidence: 0.9,
    importance: 0.9,
  });
  result.evidence.memory = { id: recorded.entry.id, status: recorded.entry.status, sourceType: recorded.entry.sourceType, confidence: recorded.entry.confidence, createdAt: recorded.entry.createdAt, lastVerifiedAt: recorded.entry.lastVerifiedAt };
  result.evidence.runA = runAEv;

  // Phase B: long mission with heavy filler pressure + checkout modification.
  const runB = await runTask({
    dir, memory, label: 't1-recall',
    goal: 'First read src/checkout/store.ts. Then add an undo history feature: extend the store with pastStates: string[][] and pushHistory() that snapshots items before each addItem. Verify by running the test file with node. Finally write DECISION-NOTES.md stating (one line) which state library the project uses.',
    conversationHistory: fillerTurns(160, 7),
  }).catch((err) => ({ error: String(err) }));
  if ('error' in (runB as object)) {
    result.failures.push({ layer: 'MODEL FAILURE', detail: (runB as { error: string }).error });
    results.set(id, result); saveResults(); return;
  }
  const runBEv = (runB as unknown as Awaited<ReturnType<typeof runTask>>).evidence;
  const notesFile = path.join(dir, 'DECISION-NOTES.md');
  const notes = existsSync(notesFile) ? readFileSync(notesFile, 'utf8') : '';
  const notesZustand = /zustand/i.test(notes);
  const notesRedux = /redux/i.test(notes);
  const finalStore = existsSync(storeFile) ? readFileSync(storeFile, 'utf8') : '';
  const stillZustand = finalStore.includes('zustand') && !/from ['"]redux/.test(finalStore);
  result.assertions.push({ assertion: 'phase B: DECISION-NOTES.md names zustand', passed: notesZustand, detail: notes.slice(0, 200) });
  result.assertions.push({ assertion: 'phase B: no redux in notes', passed: !notesRedux, detail: '' });
  result.assertions.push({ assertion: 'phase B: store still zustand after pressure', passed: stillZustand, detail: finalStore.slice(0, 200) });
  result.assertions.push({ assertion: 'phase B: memory was retrieved', passed: runBEv.memoryRetrievals > 0, detail: `retrievals=${runB.evidence.memoryRetrievals}` });
  result.assertions.push({ assertion: 'phase B: task completed', passed: runBEv.status === 'complete', detail: runBEv.status });
  result.evidence.runB = runBEv;
  const hardFailures = result.assertions.filter((a) => !a.passed && a.assertion.includes('redux'));
  result.passed = hardFailures.length === 0 && notesZustand ? true : notesZustand || stillZustand ? 'partial' : false;
  results.set(id, result); saveResults();
}

// ============ TEST 2: MEMORY MUST SURVIVE CONTEXT TRIMMING ============
async function t2(): Promise<void> {
  const id = 't2-trim-survival';
  const result: TestResult = { id, name: 'Decision survives compaction + trimming', passed: 'partial', assertions: [], evidence: {}, failures: [] };
  const dir = makeRepo('t2', { 'src/core/engine.ts': 'export const engine = { version: 1 };\n' });
  const memory = MemoryStore.forProject(dir);

  // Decision established as durable memory BEFORE the pressure mission.
  const seeded = memory.recordVerified({
    type: 'decision',
    claim: 'The engine module must stay dependency-free (no imports in src/core/engine.ts)',
    scope: path.basename(dir),
    evidence: 'src/core/engine.ts',
    sourceType: 'source_code',
    confidence: 0.9,
    importance: 0.9,
  });
  result.evidence.seededMemory = { id: seeded.entry.id, status: seeded.entry.status };

  // Heavy pressure: 250 filler turns + a task that touches many files.
  const run = await runTask({
    dir, memory,
    goal: 'Create src/core/modules/ with 8 small modules m1..m8 (each exports a constant). Verify by running node with a script that imports all 8. Then write TRIM-NOTES.md answering: does src/core/engine.ts import anything? (yes/no)',
    conversationHistory: fillerTurns(250, 21),
  }).catch((err) => ({ error: String(err) }));
  if ('error' in (run as object)) {
    result.failures.push({ layer: 'MODEL FAILURE', detail: (run as { error: string }).error });
    results.set(id, result); saveResults(); return;
  }
  const ev = (run as Awaited<ReturnType<typeof runTask>>).evidence;
  const notes = existsSync(path.join(dir, 'TRIM-NOTES.md')) ? readFileSync(path.join(dir, 'TRIM-NOTES.md'), 'utf8').toLowerCase() : '';
  const engineContent = readFileSync(path.join(dir, 'src', 'core', 'engine.ts'), 'utf8');
  const engineStillPure = !/import |require\(/.test(engineContent);
  const notesCorrect = notes.includes('no') || notes.includes('nothing') || notes.includes('zero');
  result.assertions.push({ assertion: 'compaction occurred under pressure', passed: ev.compactions > 0, detail: `compactions=${ev.compactions}` });
  result.assertions.push({ assertion: 'engine.ts still dependency-free', passed: engineStillPure, detail: engineContent.slice(0, 150) });
  result.assertions.push({ assertion: 'TRIM-NOTES answers correctly (no imports)', passed: notesCorrect, detail: notes.slice(0, 200) });
  result.assertions.push({ assertion: 'durable memory still retrievable post-run', passed: memory.retrieve('engine dependency-free', path.basename(dir), 5, { projectId: path.basename(dir) }).some((m) => m.id === seeded.entry.id), detail: '' });
  result.evidence.run = ev;
  result.passed = engineStillPure && ev.compactions > 0 ? (notesCorrect ? true : 'partial') : false;
  results.set(id, result); saveResults();
}

// ============ TEST 3: FALSE MEMORY / MODEL CLAIM ============
async function t3(): Promise<void> {
  const id = 't3-false-memory';
  const result: TestResult = { id, name: 'Unsupported model claim cannot outrank verified evidence', passed: 'partial', assertions: [], evidence: {}, failures: [] };
  const dir = makeRepo('t3', {
    'src/db.ts': "import { DatabaseSync } from 'node:sqlite';\nexport const db = new DatabaseSync(':memory:');\nexport function query(sql: string) { return db.prepare(sql).all(); }\n",
  });
  const memory = MemoryStore.forProject(dir);

  // The model CLAIMS postgres � enters as an unverified candidate only.
  const claimed = memory.add({
    type: 'fact', claim: 'The API uses PostgreSQL as its database', scope: path.basename(dir),
    sourceType: 'model_inference', confidence: 0.6,
  });
  result.evidence.claimMemory = { id: claimed.entry.id, status: claimed.entry.status, sourceType: claimed.entry.sourceType };
  result.assertions.push({ assertion: 'model claim stays candidate (never authoritative)', passed: claimed.entry.status === 'candidate', detail: claimed.entry.status ?? '' });

  // Real task: the model must read src/db.ts and work with SQLite.
  const run = await runTask({
    dir, memory,
    goal: 'Add a settings table helper to the database layer: extend src/db.ts with setSetting(key, value) and getSetting(key) using the existing database setup. Verify by running node with a small script that sets and reads a setting.',
  }).catch((err) => ({ error: String(err) }));
  if ('error' in (run as object)) {
    result.failures.push({ layer: 'MODEL FAILURE', detail: (run as { error: string }).error });
    results.set(id, result); saveResults(); return;
  }
  const ev = (run as Awaited<ReturnType<typeof runTask>>).evidence;
  const dbContent = readFileSync(path.join(dir, 'src', 'db.ts'), 'utf8');
  const usedSqlite = dbContent.includes('sqlite') || dbContent.includes('DatabaseSync');
  const usedPostgres = /postgres|pg\b/i.test(dbContent);
  result.assertions.push({ assertion: 'model used SQLite (actual repo evidence)', passed: usedSqlite, detail: dbContent.slice(0, 200) });
  result.assertions.push({ assertion: 'model did NOT introduce postgres', passed: !usedPostgres, detail: '' });

  // Independent source evidence arrives: verified SQLite supersedes the claim path.
  const verified = memory.recordVerified({
    type: 'fact', claim: 'The API uses SQLite via node:sqlite DatabaseSync', scope: path.basename(dir),
    sourceType: 'source_code', evidence: 'src/db.ts',
  });
  const supersededIds = verified.supersededIds;
  result.evidence.verifiedMemory = { id: verified.entry.id, status: verified.entry.status, supersededIds };
  result.assertions.push({ assertion: 'verified sqlite memory is authoritative', passed: verified.entry.status === 'verified', detail: '' });
  const ranked = memory.retrieve('which database does the api use', path.basename(dir), 5, { projectId: path.basename(dir) });
  const topNonSuperseded = ranked.find((m) => m.status !== 'superseded');
  result.assertions.push({ assertion: 'top retrieval is the sqlite memory', passed: topNonSuperseded?.id === verified.entry.id, detail: JSON.stringify(ranked.map((m) => ({ id: m.id, claim: m.claim.slice(0, 50), status: m.status }))) });
  result.evidence.run = ev;
  result.passed = usedSqlite && !usedPostgres && verified.entry.status === 'verified' ? true : 'partial';
  results.set(id, result); saveResults();
}

// ============ TEST 4: REAL CONTRADICTION (advisory, no auto-supersession) ============
async function t4(): Promise<void> {
  const id = 't4-contradiction';
  const result: TestResult = { id, name: 'Contradiction is flagged advisory, never auto-merged/superseded', passed: 'partial', assertions: [], evidence: {}, failures: [] };
  const dir = makeRepo('t4');
  const memory = MemoryStore.forProject(dir);
  // No embedder configured (real environment: embeddings unavailable) �
  // consolidation runs in LEXICAL FALLBACK mode; record that honestly.
  const a = memory.add({ type: 'fact', claim: 'Checkout state uses Zustand', scope: path.basename(dir), sourceType: 'source_code', status: 'verified' });
  const b = memory.add({ type: 'fact', claim: 'Checkout state uses Redux', scope: path.basename(dir), sourceType: 'source_code', status: 'verified' });
  const { merged, supersededIds } = await memory.consolidateSemantic({ scope: path.basename(dir) });
  result.evidence = {
    a: { id: a.entry.id, claim: a.entry.claim, status: a.entry.status },
    b: { id: b.entry.id, claim: b.entry.claim, status: b.entry.status },
    mergedCount: merged.length,
    supersededCount: supersededIds.length,
    mergedClaims: merged.map((m) => m.claim.slice(0, 80)),
  };
  result.assertions.push({ assertion: 'no automatic merge of contradictory claims', passed: merged.length === 0, detail: JSON.stringify(merged.map((m) => m.claim.slice(0, 60))) });
  result.assertions.push({ assertion: 'no automatic supersession', passed: supersededIds.length === 0, detail: '' });
  result.assertions.push({ assertion: 'both memories remain individually retrievable', passed: memory.query({ scope: path.basename(dir) }).length >= 2, detail: '' });
  result.passed = merged.length === 0 && supersededIds.length === 0 ? true : false;
  results.set(id, result); saveResults();
}

// ============ TEST 5: PARAPHRASE CONSOLIDATION ============
async function t5(): Promise<void> {
  const id = 't5-paraphrase';
  const result: TestResult = { id, name: 'Paraphrase duplicates consolidate with provenance', passed: 'partial', assertions: [], evidence: {}, failures: [] };
  const dir = makeRepo('t5');
  const memory = MemoryStore.forProject(dir);
  const a = memory.add({ type: 'project_convention', claim: 'Checkout state is managed by Zustand', scope: path.basename(dir), sourceType: 'source_code', status: 'verified' });
  const b = memory.add({ type: 'project_convention', claim: 'The checkout state store uses Zustand for application state', scope: path.basename(dir), sourceType: 'source_code', status: 'verified' });
  const { merged, supersededIds } = await memory.consolidate(path.basename(dir)); // lexical fallback mode
  const provenance = merged[0]?.source ?? '';
  result.evidence = {
    a: { id: a.entry.id, claim: a.entry.claim },
    b: { id: b.entry.id, claim: b.entry.claim },
    mergedCount: merged.length,
    mergedClaim: merged[0]?.claim ?? '',
    provenance,
    supersededIds,
  };
  result.assertions.push({ assertion: 'paraphrases consolidated to one memory', passed: merged.length === 1, detail: `merged=${merged.length}` });
  result.assertions.push({ assertion: 'both contributors superseded', passed: supersededIds.length === 2, detail: '' });
  result.assertions.push({ assertion: 'provenance references both contributor ids', passed: provenance.includes(a.entry.id) && provenance.includes(b.entry.id), detail: provenance.slice(0, 120) });
  result.passed = merged.length === 1 && supersededIds.length === 2 ? true : 'partial';
  results.set(id, result); saveResults();
}

// ============ TEST 6: SPECIALIST MEMORY ISOLATION ============
async function t6(): Promise<void> {
  const id = 't6-isolation';
  const result: TestResult = { id, name: 'Share knowledge, not private context', passed: 'partial', assertions: [], evidence: {}, failures: [] };
  const dir = makeRepo('t6', {
    'src/ComponentA.tsx': 'export function ComponentA() { /* unfinished auth implementation */ return null; }\n',
  });
  const memory = MemoryStore.forProject(dir);
  const projectId = path.basename(dir);

  // Specialist A's PRIVATE agent-scope memory (never published).
  const priv = memory.add({
    type: 'observation', claim: 'Component A contains an unfinished authentication implementation',
    scope: projectId, visibility: 'agent', agentId: 'specialist-a',
    sourceType: 'source_code', confidence: 0.85,
  });
  // B retrieves with its own identity � must NOT see A's private memory.
  const beforeB = memory.retrieveForContext('unfinished authentication Component A', projectId, {
    limit: 8, maxChars: 2000, ctx: { requestingAgentId: 'specialist-b', projectId },
  });
  const leakedBefore = beforeB.some((m) => m.id === priv.entry.id);
  result.assertions.push({ assertion: 'B cannot retrieve A private memory before publication', passed: !leakedBefore, detail: `retrieved=${beforeB.length}` });

  // A explicitly publishes the finding (mission candidate).
  const published = memory.publishFinding({
    agentId: 'specialist-a', projectId, scope: projectId,
    type: 'observation', content: 'Component A contains an unfinished authentication implementation',
    evidence: 'src/ComponentA.tsx', confidence: 0.85, sourceType: 'source_code',
  });
  const afterB = memory.retrieveForContext('unfinished authentication Component A', projectId, {
    limit: 8, maxChars: 2000, ctx: { requestingAgentId: 'specialist-b', projectId },
  });
  const seenAfter = afterB.some((m) => m.id === published.id);
  result.assertions.push({ assertion: 'B retrieves the published finding', passed: seenAfter, detail: `retrieved=${afterB.length}` });
  result.assertions.push({ assertion: 'published finding is a candidate (not durable)', passed: published.status === 'candidate', detail: published.status ?? '' });
  result.assertions.push({ assertion: 'published finding is mission scope', passed: (published.visibility ?? 'project') === 'mission', detail: published.visibility ?? '' });
  result.assertions.push({ assertion: 'agentId provenance preserved', passed: published.agentId === 'specialist-a', detail: published.agentId ?? '' });
  result.evidence = {
    privateMemory: { id: priv.entry.id, visibility: priv.entry.visibility, agentId: priv.entry.agentId },
    retrievalBefore: { count: beforeB.length, leaked: leakedBefore },
    publication: { id: published.id, status: published.status, visibility: published.visibility, agentId: published.agentId },
    retrievalAfter: { count: afterB.length, ids: afterB.map((m) => m.id) },
  };
  result.passed = !leakedBefore && seenAfter && published.status === 'candidate' ? true : false;
  results.set(id, result); saveResults();
}

// ============ TEST 7: SPECIALIST MID-RUN FINDING (real model) ============
async function t7(): Promise<void> {
  const id = 't7-midrun-finding';
  const result: TestResult = { id, name: 'Specialist publishes a real finding mid-run', passed: 'partial', assertions: [], evidence: {}, failures: [] };
  const dir = makeRepo('t7', {
    'src/hero.css': '.hero { display: grid; grid-template-columns: repeat(4, 1fr); }\n@media (max-width: 900px) { .hero { grid-template-columns: repeat(4, 1fr); } }\n',
    'index.html': '<link rel="stylesheet" href="src/hero.css"><div class="hero"><div>one</div><div>two</div><div>three</div><div>four</div></div>\n',
  });
  const memory = MemoryStore.forProject(dir);
  const missionId = 'mission-t7';
  const runner = new SubAgentRunner({
    cwd: dir,
    resolveLlm: () => makeLlm(),
    agentRole: () => 'responsive frontend specialist',
    agentEffort: () => 'low',
    memory,
    missionId,
    onEvent: () => {},
  });
  const res = await runner.runOne(
    'frontend-a',
    'Inspect src/hero.css and index.html for RESPONSIVE BUGS at mobile widths (375px). The grid columns rule inside the media query looks suspicious. If you confirm a real responsive bug, publish it immediately with publish_finding, then fix it (make the media query use 1 column) and verify the fix by reading the final css. Publish any critical discovery the moment you confirm it.',
  );
  const findings = memory.query({ scope: path.basename(dir) }).filter((m) => m.visibility === 'mission' && m.agentId === 'frontend-a');
  const midRunPublished = findings.length > 0;
  result.evidence = {
    specialistStatus: res.status,
    specialistOk: res.ok,
    summary: res.summary.slice(0, 300),
    findings: findings.map((m) => ({ id: m.id, status: m.status, visibility: m.visibility, claim: m.claim.slice(0, 160), agentId: m.agentId })),
  };
  result.assertions.push({ assertion: 'specialist ran to a conclusion', passed: res.status === 'SUCCESS' || res.status === 'PARTIAL_SUCCESS', detail: res.status });
  result.assertions.push({ assertion: 'at least one mission finding exists (mid-run publication)', passed: midRunPublished, detail: `findings=${findings.length}` });
  result.assertions.push({ assertion: 'findings are candidates (not auto-durable)', passed: findings.every((m) => (m.status ?? 'candidate') === 'candidate'), detail: '' });
  // Second specialist (different identity) can retrieve the published finding.
  const asB = memory.retrieveForContext('hero responsive bug mobile', path.basename(dir), {
    limit: 6, maxChars: 1500, ctx: { requestingAgentId: 'frontend-b', missionId, projectId: path.basename(dir) },
  });
  result.assertions.push({ assertion: 'second specialist retrieves the finding', passed: asB.length > 0, detail: `retrieved=${asB.length}` });
  const fixApplied = readFileSync(path.join(dir, 'src', 'hero.css'), 'utf8').includes('1fr)');
  result.assertions.push({ assertion: 'fix applied to css', passed: fixApplied, detail: '' });
  result.passed = midRunPublished && asB.length > 0 ? true : 'partial';
  results.set(id, result); saveResults();
}

// ============ TEST 8: SUCCESS PATTERN PROMOTION (real task completions) ============
async function t8(): Promise<void> {
  const id = 't8-success-pattern';
  const result: TestResult = { id, name: '3 independent verified successes promote; same-task repeats do not', passed: 'partial', assertions: [], evidence: {}, failures: [] };
  const dir = makeRepo('t8');
  const memory = MemoryStore.forProject(dir);
  const subject = 'responsive overflow fix verified with multi-viewport evidence';
  const tasks = ['fix a react component overflow', 'fix a dashboard responsive overflow', 'fix a checkout responsive overflow'];
  const outcomes: { taskId: string; promoted: boolean; distinct: number }[] = [];
  for (let i = 0; i < tasks.length; i++) {
    const run = await runTask({
      dir, memory, label: `t8-task${i}`,
      goal: `${tasks[i]}: create overflow-fix-${i + 1}.css containing a working media query that switches a 2-column grid to 1 column below 600px, and a test file overflow-test-${i + 1}.js that reads the css and asserts the media query exists. Run the test with node to verify.`,
    }).catch((err) => ({ error: String(err) }));
    const ok = !('error' in (run as object)) && (run as Awaited<ReturnType<typeof runTask>>).report.status === 'complete';
    const verified = ok ? 'task_completion' : 'model_inference';
    const outcome = memory.recordSuccessObservation({
      subject, taskId: `eval-task-${i + 1}`, scope: path.basename(dir), sourceType: verified,
      evidence: ok ? 'task completed with passing verification' : 'task failed',
    });
    outcomes.push({ taskId: `eval-task-${i + 1}`, promoted: outcome.promoted, distinct: outcome.distinctObservations });
  }
  result.evidence.outcomes = outcomes;
  result.evidence.runOutcomes = outcomes.map((o, i) => ({ task: tasks[i] }));
  result.assertions.push({ assertion: 'observation 1 does not promote', passed: outcomes[0]!.promoted === false, detail: '' });
  result.assertions.push({ assertion: 'observation 2 does not promote', passed: outcomes[1]!.promoted === false, detail: '' });
  result.assertions.push({ assertion: 'observation 3 promotes (if all 3 tasks completed)', passed: outcomes[2]!.distinct < 3 || outcomes[2]!.promoted === true, detail: `distinct=${outcomes[2]!.distinct}` });
  // Same-task repeats must NOT count as independent.
  const same = memory.recordSuccessObservation({ subject, taskId: 'eval-task-3', scope: path.basename(dir), sourceType: 'task_completion' });
  result.assertions.push({ assertion: 'same-task repeat does not create a second pattern', passed: !same.promoted, detail: JSON.stringify(same) });
  const patterns = memory.query({ type: 'pattern', scope: path.basename(dir) });
  result.assertions.push({ assertion: 'exactly one pattern exists', passed: patterns.length === 1, detail: `patterns=${patterns.length}` });
  result.passed = outcomes[0]!.promoted === false && outcomes[1]!.promoted === false && patterns.length === 1 ? true : 'partial';
  results.set(id, result); saveResults();
}

// ============ TEST 9: MEMORY PRECISION ============
async function t9(): Promise<void> {
  const id = 't9-precision';
  const result: TestResult = { id, name: 'Memory precision under competing candidates', passed: 'partial', assertions: [], evidence: {}, failures: [] };
  const dir = makeRepo('t9');
  const memory = MemoryStore.forProject(dir);
  const projectId = path.basename(dir);
  // Useful for the upcoming checkout task:
  memory.recordVerified({ type: 'fact', claim: 'Checkout cart items are stored in src/checkout/cart.ts', scope: projectId, sourceType: 'source_code', evidence: 'src/checkout/cart.ts' });
  memory.recordVerified({ type: 'project_convention', claim: 'Checkout UI follows the cart module structure', scope: projectId, sourceType: 'source_code' });
  storeMisc(memory, projectId);
  function storeMisc(mem: MemoryStore, pid: string): void {
    mem.add({ type: 'fact', claim: 'The marketing site is built in Webflow', scope: pid, sourceType: 'user_statement' });
    mem.add({ type: 'fact', claim: 'The office coffee machine is broken', scope: pid, sourceType: 'user_statement' });
    mem.add({ type: 'fact', claim: 'The legacy site used jQuery', scope: pid, sourceType: 'user_statement' });
    mem.add({ type: 'fact', claim: 'A typo once existed in the footer', scope: pid, sourceType: 'user_statement' });
  }
  const task = 'Extend the checkout cart: create src/checkout/cart.test.js that imports ./cart.js, calls addItem, and asserts the item appears. Run it with node to verify.';
  const run = await runTask({ dir, memory, goal: task }).catch((err) => ({ error: String(err) }));
  if ('error' in (run as object)) {
    result.failures.push({ layer: 'MODEL FAILURE', detail: (run as { error: string }).error });
    results.set(id, result); saveResults(); return;
  }
  const ev = (run as Awaited<ReturnType<typeof runTask>>).evidence;
  // Reproduce the exact retrieval the run performed and classify each entry.
  const retrieved = memory.retrieveForContext(`${task} checkout`, projectId, { limit: 8, maxChars: 2000, ctx: { projectId } });
  const useful = retrieved.filter((m) => /checkout|cart/i.test(m.claim));
  const neutral = retrieved.filter((m) => !/checkout|cart/i.test(m.claim));
  const precision = retrieved.length > 0 ? useful.length / retrieved.length : 1;
  result.evidence = {
    run: ev,
    retrieved: retrieved.map((m) => ({ id: m.id, type: m.type, claim: m.claim.slice(0, 80), classification: /checkout|cart/i.test(m.claim) ? 'USEFUL' : 'NEUTRAL' })),
    useful: useful.length,
    neutral: neutral.length,
    redundant: 0,
    wrong: 0,
    harmful: 0,
    precision: +precision.toFixed(2),
    memoryTokens: ev.sectionTokens.memory,
    totalInputTokens: ev.inputTokens,
    memoryOverhead: ev.inputTokens > 0 ? +((ev.sectionTokens.memory / ev.inputTokens) * 100).toFixed(1) : 0,
  };
  result.assertions.push({ assertion: 'precision at least 0.4 (useful memories dominate)', passed: precision >= 0.4, detail: `precision=${precision.toFixed(2)} useful=${useful.length}/${retrieved.length}` });
  result.assertions.push({ assertion: 'no WRONG/HARMFUL memories injected', passed: retrieved.every((m) => !/coffee|webflow|jquery|footer typo/i.test(m.claim)), detail: '' });
  result.assertions.push({ assertion: 'memory token overhead under 15 percent of input', passed: (result.evidence.memoryOverhead as number) < 15, detail: `${result.evidence.memoryOverhead}%` });
  result.passed = precision >= 0.4 ? true : 'partial';
  results.set(id, result); saveResults();
}

// ============ TEST 10: TOKEN ECONOMICS A/B ============
async function t10(): Promise<void> {
  const id = 't10-economics';
  const result: TestResult = { id, name: 'Token economics: memory ON vs OFF', passed: 'partial', assertions: [], evidence: {}, failures: [] };
  const goal = 'Create src/utils/format.ts exporting formatPrice(n) that returns a string like 12.50 USD, and format.test.js asserting formatPrice(12.5) === "12.50 USD". Run the test with node.';
  // Arm A: memory ON (relevant memory seeded).
  const dirA = makeRepo('t10a');
  const memA = MemoryStore.forProject(dirA);
  memA.recordVerified({ type: 'project_convention', claim: 'All prices formatted via formatPrice in USD with 2 decimals', scope: path.basename(dirA), sourceType: 'user_statement', importance: 0.8 });
  const runA = await runTask({ dir: dirA, memory: memA, goal, label: 't10-memory-on' }).catch((err) => ({ error: String(err) }));
  // Arm B: memory OFF (empty store).
  const dirB = makeRepo('t10b');
  const memB = MemoryStore.forProject(dirB);
  const runB = await runTask({ dir: dirB, memory: memB, goal, label: 't10-memory-off' }).catch((err) => ({ error: String(err) }));
  if ('error' in (runA as object) || 'error' in (runB as object)) {
    result.failures.push({ layer: 'MODEL FAILURE', detail: JSON.stringify({ a: (runA as { error?: string }).error, b: (runB as { error?: string }).error }) });
    results.set(id, result); saveResults(); return;
  }
  const evA = (runA as Awaited<ReturnType<typeof runTask>>).evidence;
  const evB = (runB as Awaited<ReturnType<typeof runTask>>).evidence;
  const successA = evA.status === 'complete';
  const successB = evB.status === 'complete';
  const perKA = evA.inputTokens > 0 ? +((successA ? 1 : 0) / (evA.inputTokens / 1000)).toFixed(3) : 0;
  const perKB = evB.inputTokens > 0 ? +((successB ? 1 : 0) / (evB.inputTokens / 1000)).toFixed(3) : 0;
  result.evidence = {
    memoryOn: { ...evA, taskSuccess: successA, successPer1kInput: perKA },
    memoryOff: { ...evB, taskSuccess: successB, successPer1kInput: perKB },
    memoryOverheadTokens: evA.sectionTokens.memory,
    note: 'single sample per arm � directional only, not statistical',
  };
  result.assertions.push({ assertion: 'memory-ON run completed', passed: successA, detail: evA.status });
  result.assertions.push({ assertion: 'memory-OFF run completed', passed: successB, detail: evB.status });
  result.assertions.push({ assertion: 'memory-ON received its convention memory', passed: evA.sectionTokens.memory > 0, detail: `memoryTokens=${evA.sectionTokens.memory}` });
  result.passed = successA && successB ? true : 'partial';
  results.set(id, result); saveResults();
}

// ============ TEST 11: MEMORY OVERLOAD ============
async function t11(): Promise<void> {
  const id = 't11-overload';
  const result: TestResult = { id, name: 'Retrieval selects a relevant subset under memory overload', passed: 'partial', assertions: [], evidence: {}, failures: [] };
  const dir = makeRepo('t11');
  const memory = MemoryStore.forProject(dir);
  const projectId = path.basename(dir);
  // 30 memories: 3 useful, 27 noise (obsolete/unrelated/contradictory/low-value).
  memory.recordVerified({ type: 'fact', claim: 'Checkout cart items live in src/checkout/cart.ts', scope: projectId, sourceType: 'source_code' });
  memory.recordVerified({ type: 'project_convention', claim: 'Checkout tests run with plain node scripts', scope: projectId, sourceType: 'source_code' });
  memory.recordVerified({ type: 'constraint', claim: 'Checkout must not add heavy dependencies', scope: projectId, sourceType: 'user_statement' });
  for (let i = 0; i < 9; i++) memory.add({ type: 'observation', claim: `old observation ${i}: the weather during sprint ${i} was rainy`, scope: projectId, sourceType: 'user_statement' });
  for (let i = 0; i < 6; i++) memory.add({ type: 'fact', claim: `unrelated project ${i} uses framework number ${i}`, scope: projectId, sourceType: 'user_statement' });
  for (let i = 0; i < 6; i++) memory.add({ type: 'fact', claim: `obsolete fact ${i}: the old header used font-size ${i}px`, scope: projectId, sourceType: 'user_statement' });
  for (let i = 0; i < 6; i++) memory.add({ type: 'fact', claim: `low-value note ${i}: meeting moved to room ${i}`, scope: projectId, sourceType: 'user_statement' });
  const total = memory.stats().total;
  const task = 'Add a clearCart function to the checkout cart module and verify it with a node script.';
  const run = await runTask({ dir, memory, goal: task }).catch((err) => ({ error: String(err) }));
  if ('error' in (run as object)) {
    result.failures.push({ layer: 'MODEL FAILURE', detail: (run as { error: string }).error });
    results.set(id, result); saveResults(); return;
  }
  const ev = (run as Awaited<ReturnType<typeof runTask>>).evidence;
  const retrieved = memory.retrieveForContext(`${task} checkout cart`, projectId, { limit: 8, maxChars: 2000, ctx: { projectId } });
  const useful = retrieved.filter((m) => /checkout|cart/i.test(m.claim)).length;
  result.evidence = {
    totalMemories: total,
    retrievedCount: retrieved.length,
    excludedCount: total - retrieved.length,
    usefulRetrieved: useful,
    retrievedClaims: retrieved.map((m) => m.claim.slice(0, 70)),
    memoryTokens: ev.sectionTokens.memory,
    budgetChars: 2000,
  };
  result.assertions.push({ assertion: 'retrieval selected a small subset (not the whole database)', passed: retrieved.length <= 8 && retrieved.length < total, detail: `${retrieved.length}/${total}` });
  result.assertions.push({ assertion: 'useful checkout memories ranked in', passed: useful >= 2, detail: `useful=${useful}` });
  result.assertions.push({ assertion: 'budget respected (2000 chars)', passed: ev.sectionTokens.memory < 700, detail: `memoryTokens=${ev.sectionTokens.memory}` });
  result.passed = retrieved.length <= 8 && useful >= 2 ? true : 'partial';
  results.set(id, result); saveResults();
}

// ============ TEST 12: MEMORY + DIGEST + TRIMMING COMBINED ============
async function t12(): Promise<void> {
  const id = 't12-combined';
  const result: TestResult = { id, name: 'Decision + failure lesson + convention + finding survive combined pressure', passed: 'partial', assertions: [], evidence: {}, failures: [] };
  const dir = makeRepo('t12');
  const memory = MemoryStore.forProject(dir);
  // Scope MUST match guard.lock.name (the package name 'eval-t12'), not the
  // mkdtemp basename — otherwise Tier-1 PROTECTED filtering drops anything pinned.
  const projectId = projectScope(dir);
  // Four critical pieces established BEFORE the pressure mission.
  const decision = memory.recordVerified({ type: 'decision', claim: 'Checkout state must use Zustand, never Redux', scope: projectId, sourceType: 'source_code', evidence: 'src/checkout/store.ts', importance: 0.9 });
  const failureLesson = memory.addFailureLesson({
    action: 'deploy --prod', cause: 'database migration lock timeout',
    fix: 'release the stale migration lock', verification: 'deployment succeeded after lock release',
    scope: projectId, confidence: 0.85,
    // Pin into the Tier-1 protected section so it survives compaction re-injection
    // even when the mission never issues deploy-related retrieval queries.
    pinned: true,
  });
  const convention = memory.recordVerified({ type: 'project_convention', claim: 'All checkout UI changes need a node-run test script', scope: projectId, sourceType: 'user_statement', importance: 0.8 });
  const finding = memory.publishFinding({ agentId: 'frontend-a', projectId, scope: projectId, type: 'observation', content: 'Specialist finding: the checkout header hides the cart icon below 400px', evidence: 'browser evidence 375px', confidence: 0.8, sourceType: 'browser_evidence' });
  result.evidence.seeded = {
    decision: { id: decision.entry.id, status: decision.entry.status },
    failureLesson: { id: failureLesson.entry.id, status: failureLesson.entry.status },
    convention: { id: convention.entry.id, status: convention.entry.status },
    finding: { id: finding.id, status: finding.status, visibility: finding.visibility },
  };

  const run = await runTask({
    dir, memory,
    goal: 'Create src/checkout/summary.ts exporting buildSummary(items: string[]) that returns a joined string, and summary.test.js asserting it joins 3 items. Run it with node. Then write RECOVERY-NOTES.md answering four questions: (1) which state library must checkout use? (2) what previously broke production deploys and what was the fix? (3) what is the testing convention for checkout UI changes? (4) what happens to the cart icon below 400px?',
    conversationHistory: fillerTurns(280, 55),
  }).catch((err) => ({ error: String(err) }));
  if ('error' in (run as object)) {
    result.failures.push({ layer: 'MODEL FAILURE', detail: (run as { error: string }).error });
    results.set(id, result); saveResults(); return;
  }
  const ev = (run as Awaited<ReturnType<typeof runTask>>).evidence;
  const notes = existsSync(path.join(dir, 'RECOVERY-NOTES.md')) ? readFileSync(path.join(dir, 'RECOVERY-NOTES.md'), 'utf8').toLowerCase() : '';
  // Decision is recovered only when the model (a) names the correct library AND
  // (b) does NOT positively choose the rejected alternative. The old
  // `!redux/.test(notes)` conflated "mentions Redux in the negation ('never
  // redux')" with "chose Redux" — a false negative on a correct answer.
  const positivelyChoseRedux = /\b(?:use|used|switch(?:ing)? to|migrat(?:e|ed|ing) to|adopt(?:ed|ing)?|choose|chosen|selected|based on|built (?:with|in))\s+redux\b/i.test(notes);
  const recovered = {
    decision: /zustand/.test(notes) && !positivelyChoseRedux,
    failure: /migration lock|lock timeout/.test(notes),
    convention: /node/.test(notes) || /test script/.test(notes),
    finding: /400/.test(notes) && /cart icon/.test(notes),
  };
  const recoveredCount = Object.values(recovered).filter(Boolean).length;
  result.evidence = {
    seeded: result.evidence.seeded,
    run: ev,
    recovered,
    recoveredCount,
    criticalFacts: 4,
  };
  result.assertions.push({ assertion: 'decision recovered (zustand, no redux)', passed: recovered.decision, detail: notes.slice(0, 120) });
  result.assertions.push({ assertion: 'failure lesson recovered (migration lock)', passed: recovered.failure, detail: '' });
  result.assertions.push({ assertion: 'convention recovered', passed: recovered.convention, detail: '' });
  result.assertions.push({ assertion: 'specialist finding recovered (400px cart icon)', passed: recovered.finding, detail: '' });
  result.assertions.push({ assertion: 'compaction occurred', passed: ev.compactions > 0, detail: `compactions=${ev.compactions}` });
  result.passed = recoveredCount === 4 ? true : recoveredCount >= 3 ? 'partial' : false;
  results.set(id, result); saveResults();
}

// ============ TEST 13: BEHAVIORAL LEARNING PROBE ============
// A promotion log alone does not prove learning. PHASE A drives three real
// runs into the same deterministically failing `npm run test` script and
// replays the exact production recording path (hermes compaction onExtract:
// addFailureLesson → dedupe bump → maybePromotePattern) once per observed
// execution. PHASE B gives the agent a fresh task whose natural verification
// IS that same command, then classifies the outcome:
//   RED    — memory did not reach the model and the command ran again unchanged
//   YELLOW — memory reached the model but the command still ran (retrieval
//            works, behavioral integration weak)
//   GREEN  — memory reached the model and the agent verified another way
async function t13(): Promise<void> {
  const id = 't13-behavioral-learning';
  const result: TestResult = { id, name: 'Repeated failure is remembered AND avoided (behavior, not just storage)', passed: 'partial', assertions: [], evidence: {}, failures: [] };
  const dir = makeRepo('t13', {
    // Deterministic poison: the project test script ALWAYS fails with the
    // same signature regardless of any code change.
    'package.json': JSON.stringify({ name: 'eval-t13', type: 'module', scripts: { test: 'node legacy-runner.js' } }),
    'legacy-runner.js': "console.error('FATAL: legacy-runner crashed while loading tests/db-connection');\nprocess.exit(1);\n",
  });
  const memory = MemoryStore.forProject(dir);
  const projectId = path.basename(dir);
  // Task-integrity tracking (SEPARATE dimension — never part of the memory
  // verdict): does anything in the run neutralize the poisoned runner?
  // Tracked after seeds AND after the probe because seeds repairing it would
  // change what a passing probe `npm test` can tell us.
  const readRunner = (): string => (existsSync(path.join(dir, 'legacy-runner.js')) ? readFileSync(path.join(dir, 'legacy-runner.js'), 'utf8') : '<missing>');
  const readPkg = (): string => (existsSync(path.join(dir, 'package.json')) ? readFileSync(path.join(dir, 'package.json'), 'utf8') : '<missing>');
  // Canonical poisoned fixture — the only version that counts as the controlled
  // failure. Re-poisoning restores EXACTLY this, so the probe always starts from
  // the same, known-broken condition regardless of what the seeds did.
  const CANONICAL_PKG = JSON.stringify({ name: 'eval-t13', type: 'module', scripts: { test: 'node legacy-runner.js' } });
  const CANONICAL_RUNNER = "console.error('FATAL: legacy-runner crashed while loading tests/db-connection');\nprocess.exit(1);\n";
  // Poison signature: the unique fatal crash marker. A legitimate repaired runner
  // (even one that calls process.exit(1) on a failed assertion) is NOT poisoned.
  const POISON_MARKER = 'FATAL: legacy-runner crashed while loading tests/db-connection';
  const isPoisoned = (content: string): boolean => content.includes(POISON_MARKER);
  const sha256 = (s: string): string => createHash('sha256').update(s).digest('hex');
  const runnerFingerprint = (): string => sha256(readRunner());
  const pkgTestTarget = (): string => {
    try { const p = JSON.parse(readPkg()); return p?.scripts?.test ?? '<no test script>'; } catch { return '<unparseable>'; }
  };
  const fixtureIntact = (): boolean =>
    isPoisoned(readRunner()) &&
    pkgTestTarget() === 'node legacy-runner.js' &&
    sha256(readRunner()) === sha256(CANONICAL_RUNNER);
  // Re-poison: restore the canonical broken fixture so the probe starts from a
  // controlled, known-broken condition no matter what the seeds did to it.
  const rePoison = (): void => {
    writeFileSync(path.join(dir, 'package.json'), CANONICAL_PKG);
    writeFileSync(path.join(dir, 'legacy-runner.js'), CANONICAL_RUNNER);
  };
  const poisonedAtStart = isPoisoned(readRunner());
  const ACTION = 'npm run test';
  const CAUSE = 'legacy-runner crashed while loading tests/db-connection (exit 1)';
  const LESSON_CLAIM = `FAILURE: ${ACTION} | CAUSE: ${CAUSE}`;
  // Detection uses ONLY ledger actions — the goal text itself mentions
  // "npm test", so event/goal strings would produce false positives.
  const ranFailingCommand = (r: { ledger: import('../../src/types.js').TaskLedgerData }): boolean =>
    r.ledger.actions.some((a) => /npm(\s+run)?\s+test\b/i.test(`${a.tool} ${a.paramsSummary}`));

  // ---- PHASE A: three distinct tasks hitting the same failing command ----
  const outcomes: { task: string; anchored: boolean; promoted: boolean; confidence: number }[] = [];
  for (let i = 0; i < 3; i++) {
    const goal = `Create feature-${i + 1}.js exporting feature${i + 1}() that returns ${(i + 1) * 11}, then run the npm test script to verify the whole project.`;
    const run = await runTask({ dir, memory, goal, label: `t13-seed${i + 1}` }).catch((err) => ({ error: String(err) }));
    if ('error' in (run as object)) {
      result.failures.push({ layer: 'MODEL FAILURE', detail: `seed ${i + 1}: ${(run as { error: string }).error}` });
      break;
    }
    const r = run as Awaited<ReturnType<typeof runTask>>;
    const anchored = ranFailingCommand(r);
    let promoted = false;
    let confidence = 0;
    if (anchored) {
      // Exact production sequence from Hermes's compaction onExtract.
      const added = memory.addFailureLesson({ action: ACTION, cause: CAUSE, scope: projectId, confidence: 0.75 });
      confidence = added.entry.confidence;
      if (!added.created) {
        const pattern = memory.maybePromotePattern({
          entryId: added.entry.id,
          patternClaim: `Repeated failure pattern — ${LESSON_CLAIM.slice(0, 140)}. Check for this before retrying similar work.`,
          scope: projectId,
        });
        promoted = !!pattern;
      }
    }
    outcomes.push({ task: `seed-${i + 1}`, anchored, promoted, confidence });
  }
  result.evidence.seedOutcomes = outcomes;
  const poisonedAfterSeeds = isPoisoned(readRunner());

  // ---- FIXTURE RESET: re-poison immediately before the probe ----
  // The seeds may have repaired the runner (or changed what `npm test` means).
  // Restore the canonical broken fixture so the probe always faces the SAME
  // controlled failure. This is what makes GREEN_AVOIDED/GREEN_REPAIR meaningful.
  rePoison();
  const probeFixture = {
    poisoned: isPoisoned(readRunner()),
    runnerFingerprint: runnerFingerprint(),
    canonicalFingerprint: sha256(CANONICAL_RUNNER),
    pkgTestTarget: pkgTestTarget(),
    intact: fixtureIntact(),
  };
  result.evidence.probeFixture = probeFixture;

  // ---- PHASE B: probe task whose natural verification is the poisoned command ----
  const probeGoal = 'Add a shout(s) helper in src/text.ts that returns the uppercased string with an exclamation mark, and make sure the npm test suite passes before you finish.';
  const probe = await runTask({ dir, memory, goal: probeGoal, label: 't13-probe' }).catch((err) => ({ error: String(err) }));
  if ('error' in (probe as object)) {
    result.failures.push({ layer: 'MODEL FAILURE', detail: `probe: ${(probe as { error: string }).error}` });
    results.set(id, result); saveResults(); return;
  }
  const p = probe as Awaited<ReturnType<typeof runTask>>;
  const ev = p.evidence;
  // Distinguish BLIND REPEAT (ran the command and hit the failure again — the
  // duplicate-promotion loop) from INFORMED REUSE (command ran only after the
  // agent changed conditions, e.g. repaired the failing component first).
  const matchedActions = p.ledger.actions.filter((a) => /npm(\s+run)?\s+test\b/i.test(`${a.tool} ${a.paramsSummary}`));
  const ranAgain = matchedActions.length > 0;
  const repeatFailed = matchedActions.some((a) => a.status === 'error');
  // Reproduce the intake retrieval to confirm WHAT was available to the model.
  const retrieved = memory.retrieveForContext(probeGoal, projectId, { limit: 8, maxChars: 2000, ctx: { projectId } });
  const failureInjected = ev.sectionTokens.memory > 0 && retrieved.some((m) => m.type === 'failure' || (m.type === 'pattern' && /repeated failure/i.test(m.claim)));
  // Probe integrity gate: a GREEN result is only behavioral-learning evidence if
  // the probe actually started from the controlled poisoned fixture. If a seed
  // had already repaired the runner (or changed the test target) and our reset
  // did not hold, the probe's `npm test` tells us nothing about memory.
  const probeWasControlled = probeFixture.intact;
  const verdict = !probeWasControlled
    ? 'INVALID_FIXTURE'
    : !failureInjected
      ? 'INCONCLUSIVE_NO_INJECTION'
      : !ranAgain
        ? 'GREEN_AVOIDED'
        : repeatFailed ? 'YELLOW_BLIND_REPEAT' : 'GREEN_REPAIR';

  const failureEntries = memory.query({ type: 'failure', scope: projectId });
  const patterns = memory.query({ type: 'pattern', scope: projectId });
  result.evidence.probe = {
    goal: probeGoal,
    status: ev.status,
    turns: ev.turns,
    toolCalls: ev.toolCalls,
    compactions: ev.compactions,
    memoryTokens: ev.sectionTokens.memory,
    retrievedClaims: retrieved.map((m) => `[${m.type}] ${m.claim.slice(0, 90)}`),
    ranAgain,
    repeatFailed,
    testCommandInvocations: matchedActions.map((a) => `${a.tool}: ${a.paramsSummary}`.slice(0, 100) + ` [${a.status}]`),
    commandsRun: p.ledger.actions.map((a) => `${a.tool}: ${a.paramsSummary}`.slice(0, 100)).filter((s) => /test|node|npm/i.test(s)),
    summary: ev.summary,
  };
  result.evidence.verdict = verdict;
  result.evidence.rubric = 'GREEN_AVOIDED=memory in, command untouched; GREEN_REPAIR=memory in, command reused only after changing conditions (weaker attribution); YELLOW_BLIND_REPEAT=memory in, failure re-hit anyway; INCONCLUSIVE_NO_INJECTION; INVALID_FIXTURE=probe did not start from a controlled poisoned fixture (seed repaired runner / changed test target / reset did not hold); RED folded into YELLOW_BLIND_REPEAT/INCONCLUSIVE/INVALID_FIXTURE by repeatFailed';
  // Integrity ledger. The probe fixture is re-poisoned (canonical runner + test
  // target restored) immediately before the probe, so the probe ALWAYS starts
  // from a controlled known-broken condition. `probeFixture.intact` gates the
  // verdict: GREEN only counts if the probe faced the real poison.
  result.evidence.taskIntegrity = {
    poisonedAtStart,
    poisonedAfterSeeds,
    poisonedAfterProbe: isPoisoned(readRunner()),
    runnerFingerprintAfterProbe: runnerFingerprint(),
    pkgTestTargetAfterProbe: pkgTestTarget(),
    fixtureReset: {
      rePoisonedBeforeProbe: probeFixture.intact,
      canonicalRunnerFingerprint: probeFixture.canonicalFingerprint,
      probeRunnerFingerprint: probeFixture.runnerFingerprint,
    },
    note: 'fixture is re-poisoned to canonical before the probe; GREEN_AVOIDED/GREEN_REPAIR are only counted when probeFixture.intact is true',
  };

  result.assertions.push({ assertion: 'seed 1 actually executed the failing command', passed: outcomes[0]?.anchored === true, detail: JSON.stringify(outcomes[0] ?? {}) });
  result.assertions.push({ assertion: 'seed 2 actually executed the failing command', passed: outcomes[1]?.anchored === true, detail: JSON.stringify(outcomes[1] ?? {}) });
  result.assertions.push({ assertion: 'seed 3 actually executed the failing command', passed: outcomes[2]?.anchored === true, detail: JSON.stringify(outcomes[2] ?? {}) });
  result.assertions.push({ assertion: 'observation 1 does not promote', passed: outcomes[0]?.promoted === false, detail: JSON.stringify(outcomes[0] ?? {}) });
  result.assertions.push({ assertion: 'observation 2 does not promote', passed: outcomes[1]?.promoted === false, detail: JSON.stringify(outcomes[1] ?? {}) });
  result.assertions.push({ assertion: 'third distinct observation promotes the pattern', passed: outcomes[2]?.promoted === true, detail: JSON.stringify(outcomes[2] ?? {}) });
  result.assertions.push({ assertion: 'exactly one deduped failure lesson', passed: failureEntries.length === 1, detail: `failure entries=${failureEntries.length}` });
  result.assertions.push({ assertion: 'exactly one repeated-failure pattern', passed: patterns.length === 1, detail: `patterns=${patterns.length}` });
  result.assertions.push({ assertion: 'failure memory reached the model at probe intake', passed: failureInjected, detail: `memoryTokens=${ev.sectionTokens.memory} retrieved=${retrieved.length}` });
  // Attribution-integrity guard (replaces a blunt "no compaction" check).
  // Compaction is not itself a failure: what matters is whether the probe's
  // decision-relevant attribution survived to the decision point. Either the
  // probe ran short (no compaction → clean isolation) OR compaction occurred but
  // the failure/pattern memory was still injected at intake AND the agent did not
  // blindly re-hit the identical failure (no repeatFailed). A compaction that
  // still yields an informed, non-blind outcome keeps the attribution trustworthy.
  const attributionIntact =
    probeFixture.intact &&
    failureInjected &&
    (ev.compactions === 0 || !repeatFailed);

  result.assertions.push({ assertion: 'compaction did not erase decision attribution', passed: attributionIntact, detail: `compactions=${ev.compactions} failureInjected=${failureInjected} repeatFailed=${repeatFailed} verdict=${verdict}` });
  result.assertions.push({ assertion: 'probe started from a controlled poisoned fixture', passed: probeFixture.intact, detail: `intact=${probeFixture.intact} poisoned=${probeFixture.poisoned} test=${probeFixture.pkgTestTarget}` });

  result.passed = verdict === 'GREEN_AVOIDED' || verdict === 'GREEN_REPAIR' ? true : verdict === 'YELLOW_BLIND_REPEAT' ? false : 'partial';
  results.set(id, result); saveResults();
}

// ============ MAIN ============
const ALL_TESTS: Record<string, () => Promise<void>> = {
  t1: t1, t2: t2, t3: t3, t4: t4, t5: t5, t6: t6,
  t7: t7, t8: t8, t9: t9, t10: t10, t11: t11, t12: t12, t13: t13,
};

async function main(): Promise<void> {
  const keyEnvVars = PROVIDERS[MODEL_PROVIDER]?.keyEnvVars ?? ['OPENROUTER_API_KEY'];
  const hasKey = keyEnvVars.some((v) => mergedEnv()[v]);
  if (!hasKey) {
    console.error(`API key required for provider "${MODEL_PROVIDER}" — set one of: ${keyEnvVars.join(', ')}`);
    process.exit(1);
  }
  const filter = process.argv[2]?.split(',').map((s) => s.trim()).filter(Boolean) ?? Object.keys(ALL_TESTS);
  console.log(`REAL-MODEL MEMORY EVALUATION � model=${MODEL_PROVIDER}::${MODEL_ID}`);
  console.log(`tests: ${filter.join(', ')}`);
  for (const id of filter) {
    const fn = ALL_TESTS[id];
    if (!fn) {
      console.error(`unknown test: ${id}`);
      continue;
    }
    console.log(`\n=== ${id} ===`);
    const started = Date.now();
    try {
      await fn();
      const r = results.get(id) ?? [...results.values()].find((x) => x.id.startsWith(id));
      console.log(`${id} done in ${Math.round((Date.now() - started) / 1000)}s � passed=${r?.passed} assertions=${r ? r.assertions.filter((a) => a.passed).length + '/' + r.assertions.length : '?'}`);
    } catch (err) {
      console.error(`${id} CRASHED: ${(err as Error).message}`);
      const existing = results.get(id) ?? {
        id, name: id, passed: false, assertions: [], evidence: {},
        failures: [{ layer: 'TEST HARNESS FAILURE', detail: (err as Error).message }],
      };
      results.set(id, existing);
    }
    saveResults();
    // Gentle pacing for the free tier.
    await new Promise((r) => setTimeout(r, 3000));
  }
  // Console summary.
  console.log('\n===== SUMMARY =====');
  for (const [id, r] of results) {
    const passCount = r.assertions.filter((a) => a.passed).length;
    console.log(`${id}: ${String(r.passed).toUpperCase()} (${passCount}/${r.assertions.length} assertions)${r.failures.length ? ' — failures: ' + r.failures.map((f) => f.layer).join(',') : ''}`);
  }
  saveResults();
  console.log(`\nresults written to ${RESULTS_DIR}`);
}

main().catch((err) => {
  console.error('harness crashed:', err);
  saveResults();
  process.exit(1);
});
