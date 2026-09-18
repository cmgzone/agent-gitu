import { canonicalStatement, redactSecrets } from './evidence-utils.js';
import { sha256 } from '../util.js';

/**
 * InvestigationGuard — semantic successful-read deduplication (loop class the
 * LoopDetector cannot see: SUCCESSFUL reads repeated indefinitely).
 *
 * The LoopDetector only counts failed/blocked exact actions, so a model that
 * re-reads the same unchanged file through slightly different windows
 * ("lines 180–240", "lines 200–260", "the full assertion", "the complete test
 * body") loops forever with every call green. This guard records what each
 * successful read ANSWERED — {file, fingerprint, semantic region, question,
 * episode, observation} — and refuses to re-run a read whose answer is already
 * in hand for the current problem episode, returning the cached observation
 * instead.
 *
 * Deliberately separate from LoopDetector: different input (successful reads,
    * not failures), different key (semantic subject, not exact paramsHash),
 * different remedy (cached answer, not a block).
 */

export interface FileFingerprint {
  mtimeMs: number;
  size: number;
}

export type StatFn = (file: string) => FileFingerprint | undefined;

export interface InvestigationReadEntry {
  /** Canonical file path (or search/list subject key). */
  subject: string;
  /** mtimeMs:size — reads of a changed file are never duplicates. */
  fingerprint: string;
  /** Merged 1-based inclusive line ranges already read for this subject+version. */
  ranges: Array<[number, number]>;
  /** Semantic digest of the question the read answered (reason/intent text). */
  questionDigest: string;
  /** The question in plain text (for the cached-answer message). */
  question: string;
  /** Bounded observation text captured from the successful read. */
  observationExcerpt: string;
  /** Problem episode this read belongs to ('none' outside recovery). */
  episodeKey: string;
  at: number;
}

export interface InvestigationCheckResult {
  allowed: boolean;
  reason?: string;
  /** Cached answer(s) to hand back instead of running the read again. */
  cachedObservation?: string;
}

export interface InvestigationGuardOptions {
  statFile?: StatFn;
  /** Requested-range coverage above this fraction counts as already-read. */
  coverageThreshold?: number;
  /** Max observation chars replayed in a cached answer. */
  cachedObservationMaxChars?: number;
}

const READ_TOOLS = new Set(['read_file', 'search_files', 'search', 'list_files', 'list_dir', 'find_by_name', 'grep_search']);
const DEFAULT_COVERAGE_THRESHOLD = 0.8;
const DEFAULT_CACHED_CHARS = 1800;

function normalizePath(p: unknown): string {
  return typeof p === 'string' ? p.replace(/\\/g, '/').replace(/^\.\//, '').trim() : '';
}

/** Digest of the investigation question: stable across trivial rewording. */
function questionDigestOf(reason: string | undefined, decisionQuestion: string | undefined): { digest: string; text: string } {
  const text = (decisionQuestion || reason || '').trim().slice(0, 300);
  return { digest: sha256(canonicalStatement(text)), text };
}

export function mergeRanges(ranges: Array<[number, number]>): Array<[number, number]> {
  const sorted = [...ranges].sort((a, b) => a[0] - b[0]);
  const merged: Array<[number, number]> = [];
  for (const [start, end] of sorted) {
    const last = merged[merged.length - 1];
    if (last && start <= last[1] + 1) last[1] = Math.max(last[1], end);
    else merged.push([start, end]);
  }
  return merged;
}

export function coverageFraction(merged: Array<[number, number]>, start: number, end: number): number {
  if (end < start) return 1;
  let covered = 0;
  for (const [s, e] of merged) {
    const lo = Math.max(s, start);
    const hi = Math.min(e, end);
    if (hi >= lo) covered += hi - lo + 1;
  }
  return covered / (end - start + 1);
}

export class InvestigationGuard {
  private readonly entries = new Map<string, InvestigationReadEntry[]>();
  private readonly statFile: StatFn;
  private readonly coverageThreshold: number;
  private readonly cachedObservationMaxChars: number;

  // Telemetry (mirrored into the recovery telemetry snapshot).
  public semanticDuplicateReadsPrevented = 0;
  public cachedObservationHits = 0;

  constructor(opts: InvestigationGuardOptions = {}) {
    this.statFile = opts.statFile ?? (() => undefined);
    this.coverageThreshold = opts.coverageThreshold ?? DEFAULT_COVERAGE_THRESHOLD;
    this.cachedObservationMaxChars = opts.cachedObservationMaxChars ?? DEFAULT_CACHED_CHARS;
  }

  fingerprintOf(subject: string): string | undefined {
    const fp = this.statFile(subject);
    return fp ? `${fp.mtimeMs}:${fp.size}` : undefined;
  }

  /** Subject key + fingerprint + requested range for a read-ish call. */
  private describeRead(tool: string, params: Record<string, unknown>): { subject: string; range: [number, number]; searchKey?: string } {
    if (tool === 'search_files' || tool === 'search' || tool === 'grep_search' || tool === 'find_by_name') {
      const pattern = tool === 'find_by_name' ? String(params['pattern'] ?? params['name'] ?? '') : String(params['pattern'] ?? params['query'] ?? '');
      const scope = normalizePath(params['path'] ?? '');
      return { subject: `search:${scope}`, range: [1, Number.MAX_SAFE_INTEGER], searchKey: sha256(canonicalStatement(`${pattern}|${scope}`)) };
    }
    if (tool === 'list_files' || tool === 'list_dir') {
      return { subject: `list:${normalizePath(params['path'] ?? '')}`, range: [1, Number.MAX_SAFE_INTEGER] };
    }
    const file = normalizePath(params['path'] ?? params['file'] ?? '');
    const offset = Math.max(1, Number(params['offset'] ?? 1) || 1);
    const limit = params['limit'] === undefined ? Number.MAX_SAFE_INTEGER : Math.max(0, Number(params['limit']) || 0);
    return { subject: `file:${file}`, range: [offset, limit === 0 ? Number.MAX_SAFE_INTEGER : offset + limit - 1] };
  }

  /**
   * Pre-dispatch check. `episodeKey` scopes deduplication to the current
   * problem episode — a NEW episode may legitimately re-read sources the old
   * episode already covered (the question changed with the failure).
   */
  check(tool: string, params: Record<string, unknown>, reason: string | undefined, episodeKey: string, investigationIntent?: { decisionQuestion?: string }): InvestigationCheckResult {
    if (!READ_TOOLS.has(tool)) return { allowed: true };
    const read = this.describeRead(tool, params);
    if (read.subject === 'file:' || read.subject === 'search:' || read.subject === 'list:') return { allowed: true };

    const fingerprint = this.fingerprintOf(read.subject.slice(read.subject.indexOf(':') + 1));
    const q = questionDigestOf(reason, investigationIntent?.decisionQuestion);
    // Cross-episode candidates: the same question about the same unchanged
    // file version has the same answer regardless of which episode asked it.
    // Coverage-based dedup (below) stays episode-scoped: a NEW episode with a
    // NEW question may legitimately inspect overlapping windows.
    const priorAll = (this.entries.get(read.subject) ?? []).filter((e) => fingerprint === undefined || e.fingerprint === fingerprint);
    const priorEpisode = priorAll.filter((e) => e.episodeKey === episodeKey);
    if (priorAll.length === 0) return { allowed: true };

    const cached = this.renderCached(priorAll);

    // Search dedup: the ANSWER is determined by pattern+scope on an unchanged
    // file version — re-running an identical search answers nothing new,
    // however the question is phrased.
    if (read.searchKey !== undefined) {
      const answered = priorAll.some((e) => e.questionDigest === read.searchKey);
      if (answered) {
        this.semanticDuplicateReadsPrevented += 1;
        return { allowed: false, reason: this.blockMessage(read.subject, 'the exact same search over the same unchanged scope', q.text), cachedObservation: cached };
      }
      return { allowed: true };
    }

    // Read dedup, two dimensions:
    // (a) content coverage — the requested window is ≥threshold covered by
    //     windows already read on this unchanged file version IN THIS EPISODE:
    //     the answer is already in hand regardless of how the question is phrased.
    const merged = mergeRanges(priorEpisode.flatMap((e) => e.ranges));
    if (merged.length > 0) {
      const covered = coverageFraction(merged, read.range[0], read.range[1]);
      if (covered >= this.coverageThreshold) {
        this.semanticDuplicateReadsPrevented += 1;
        return { allowed: false, reason: this.blockMessage(read.subject, `${Math.round(covered * 100)}% of the requested lines were already read on this unchanged file version`, q.text), cachedObservation: cached };
      }
    }

    // (b) question identity (cross-episode) — this exact investigation question
    //     about this unchanged file version was already answered: re-reading a
    //     different slice to "check" the same answer is drift.
    const sameQuestion = priorAll.find((e) => e.questionDigest === q.digest);
    if (sameQuestion) {
      this.semanticDuplicateReadsPrevented += 1;
      return {
        allowed: false,
        reason: this.blockMessage(read.subject, `this exact question was already answered for this unchanged file version (asked: "${sameQuestion.question.slice(0, 140)}")`, q.text),
        cachedObservation: cached,
      };
    }

    return { allowed: true };
  }

  /** Post-dispatch recording of a successful read for future dedup. */
  record(tool: string, params: Record<string, unknown>, reason: string | undefined, episodeKey: string, output: string, investigationIntent?: { decisionQuestion?: string }): void {
    if (!READ_TOOLS.has(tool)) return;
    const read = this.describeRead(tool, params);
    const subjectFile = read.subject.slice(read.subject.indexOf(':') + 1);
    const fingerprint = this.fingerprintOf(subjectFile) ?? 'untracked';
    const q = questionDigestOf(reason, investigationIntent?.decisionQuestion);
    const list = this.entries.get(read.subject) ?? [];
    // Search identity is the pattern+scope key; read identity is the question digest.
    const identity = read.searchKey ?? q.digest;
    // Same version + same identity: extend ranges instead of accumulating entries.
    const existing = list.find((e) => e.episodeKey === episodeKey && e.fingerprint === fingerprint && e.questionDigest === identity);
    const excerpt = redactSecrets(output || '').slice(0, 1200);
    if (existing) {
      existing.ranges = mergeRanges([...existing.ranges, read.range]);
      existing.observationExcerpt = existing.observationExcerpt.length >= excerpt.length ? existing.observationExcerpt : excerpt;
      existing.at = Date.now();
      return;
    }
    list.push({
      subject: read.subject,
      fingerprint,
      ranges: [read.range],
      questionDigest: identity,
      question: q.text,
      observationExcerpt: excerpt,
      episodeKey,
      at: Date.now(),
    });
    // Bounded per subject: 40 recorded answers is plenty for one file/scope.
    if (list.length > 40) list.splice(0, list.length - 40);
    this.entries.set(read.subject, list);
  }

  /** Invalidate a file's recorded answers (an edit changed the content). */
  invalidateFile(file: string): void {
    const norm = normalizePath(file);
    for (const key of this.entries.keys()) {
      if (key === `file:${norm}`) this.entries.delete(key);
    }
  }

  /** New episode: reads recorded for other episodes stay, keyed separately. */
  clearEpisode(episodeKey: string): void {
    for (const [key, list] of this.entries) {
      const kept = list.filter((e) => e.episodeKey !== episodeKey);
      if (kept.length === 0) this.entries.delete(key);
      else this.entries.set(key, kept);
    }
  }

  private renderCached(prior: InvestigationReadEntry[]): string | undefined {
    const chunks = prior
      .slice(-3)
      .map((e) => `— already-observed (${e.question ? `question: ${e.question.slice(0, 160)}` : 'prior read'}):\n${e.observationExcerpt}`)
      .join('\n\n');
    if (!chunks) return undefined;
    this.cachedObservationHits += 1;
    return chunks.length > this.cachedObservationMaxChars ? `${chunks.slice(0, this.cachedObservationMaxChars)}\n[…cached answer truncated…]` : chunks;
  }

  private blockMessage(subject: string, evidence: string, question: string): string {
    return (
      `DUPLICATE INVESTIGATION PREVENTED (NO_NEW_INFORMATION): ${evidence}.\n` +
      `Subject: ${subject}${question ? `; stated question: "${question.slice(0, 160)}"` : ''}.\n` +
      `The cached observation below is the answer — do NOT read it again. ` +
      `If the answer is genuinely insufficient, state a MATERIALLY DIFFERENT question ` +
      `(what decision it changes), run a targeted diagnostic command, or act on the evidence you have.`
    );
  }
}
