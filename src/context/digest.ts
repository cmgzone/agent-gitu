/**
 * Conversation digest core — shared by the per-turn compactor (agent loop)
 * and the context authority (buildModelContext). One format, one set of
 * markers: a digest built anywhere is carried forward correctly everywhere.
 *
 * The invariant this module exists for: NEVER trim historical conversation
 * that has not first been incorporated into durable state. Trimming without
 * digesting is information loss; digesting is lossy compression with a
 * guaranteed floor (objective, failures, evidence, decisions excerpts).
 */
import type { LlmMessage } from '../llm/llm.js';

export const DIGEST_HEADER_PREFIX = 'COMPACTED HISTORY —';
export const DIGEST_FAILURES_MARKER = 'KEY FAILURES (do not repeat blindly):';
export const DIGEST_DECISIONS_MARKER = 'KEY DECISIONS (still binding):';
export const DIGEST_EVIDENCE_MARKER = 'EVIDENCE ALREADY RECORDED:';

/** Digest size ceiling: unbounded excerpts could re-inject megabytes into
 *  context, defeating the very budget that triggered compaction. */
export const COMPACT_DIGEST_MAX_CHARS = 24_000;

/** Bound the digest by dropping the OLDEST excerpt lines first: the retained
 *  recent tail already covers the recent end, so when the cap bites, the
 *  newest digest lines are the only bridge between tail and deep history. */
export function boundedDigest(lines: string[], maxChars = COMPACT_DIGEST_MAX_CHARS): string {
  const kept: string[] = [];
  let total = 0;
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i]!;
    if (total + line.length + 1 > maxChars) break;
    kept.unshift(line);
    total += line.length + 1;
  }
  return kept.join('\n');
}

/** Split a previous digest message back into its excerpt/decision/failure/evidence lines. */
export function parseCarriedDigest(text: string): { lines: string[]; decisions: string[]; failures: string[]; evidence: string[] } {
  const lines: string[] = [];
  const decisions: string[] = [];
  const failures: string[] = [];
  const evidence: string[] = [];
  let section: 'lines' | 'decisions' | 'failures' | 'evidence' = 'lines';
  for (const line of text.split('\n')) {
    if (line.startsWith(DIGEST_HEADER_PREFIX)) continue;
    if (line.startsWith('KEY DECISIONS')) {
      section = 'decisions';
      continue;
    }
    if (line.startsWith('KEY FAILURES')) {
      section = 'failures';
      continue;
    }
    if (line.startsWith('EVIDENCE ALREADY RECORDED:')) {
      section = 'evidence';
      continue;
    }
    if (!line.trim()) continue;
    if (section === 'lines') lines.push(line);
    else if (section === 'decisions') decisions.push(line);
    else if (section === 'failures') failures.push(line);
    else evidence.push(line);
  }
  return { lines, decisions, failures, evidence };
}

export interface DigestMaterial {
  excerptLines: string[];
  decisions: string[];
  failures: string[];
  evidenceLines: string[];
  /** Messages that were themselves previous digests (counted, not re-excerpted). */
  carriedMessages: number;
}

/** Lines that state a binding decision — the durable floor keeps them in full. */
const DECISION_LINE_RE = /^(ARCHITECTURE DECISION|DECISION[:\s])/;

/**
 * Extract the durable material from messages about to be dropped: one excerpt
 * line each, plus the signal lines (decisions, failures, evidence) that must
 * survive. A previous digest found among them is CARRIED FORWARD, not
 * flattened — re-excerpting a digest is how history-of-history collapse
 * happens.
 */
export function extractDigestMaterial(old: LlmMessage[]): DigestMaterial {
  const excerptLines: string[] = [];
  const decisions: string[] = [];
  const failures: string[] = [];
  const evidenceLines: string[] = [];
  let carriedMessages = 0;
  for (const m of old) {
    const text = typeof m.content === 'string' ? m.content : '[image attached]';
    const flat = text.replace(/\s+/g, ' ').trim();
    if (flat.startsWith(DIGEST_HEADER_PREFIX)) {
      const carried = parseCarriedDigest(text);
      excerptLines.push(...carried.lines);
      decisions.push(...carried.decisions);
      failures.push(...carried.failures);
      evidenceLines.push(...carried.evidence);
      const countMatch = /(\d+) earlier messages/.exec(flat);
      carriedMessages += countMatch ? Number(countMatch[1]) : 1;
      continue;
    }
    excerptLines.push(`${m.role}: ${flat.slice(0, 220)}`);
    const lines = text.split('\n');
    for (let li = 0; li < lines.length; li++) {
      const line = lines[li]!;
      if (DECISION_LINE_RE.test(line.trim())) decisions.push(line.trim().slice(0, 200));
      else if (line.startsWith('RESULT [error]')) {
        // The RESULT line names the failed action; the NEXT line usually
        // carries the actual cause. Keep both — a failure without its
        // diagnostic core is a failure half-remembered.
        const cause = (lines[li + 1] ?? '').trim();
        failures.push(`${line.slice(0, 160)}${cause ? ` | ${cause.slice(0, 120)}` : ''}`);
        li += 1; // the cause line is consumed
      } else if (line.startsWith('EVIDENCE RECORDED:')) evidenceLines.push(line.slice(0, 160));
    }
  }
  return { excerptLines, decisions, failures, evidenceLines, carriedMessages };
}

/** Assemble the digest message content. Format is stable — parsers rely on it. */
export function buildDigestContent(opts: {
  condensedCount: number;
  excerptLines: string[];
  decisions?: string[];
  failures: string[];
  evidence: string[];
  snapshot?: string;
}): string {
  const dedupe = (lines: string[]): string[] => [...new Set(lines.map((l) => l.replace(/\s+/g, ' ').trim()))];
  const keptDecisions = dedupe(opts.decisions ?? []).slice(-6);
  const keptFailures = dedupe(opts.failures).slice(-8);
  const keptEvidence = dedupe(opts.evidence).slice(-10);
  const preserved =
    (keptDecisions.length ? `\n${DIGEST_DECISIONS_MARKER}\n${keptDecisions.join('\n')}` : '') +
    (keptFailures.length ? `\n${DIGEST_FAILURES_MARKER}\n${keptFailures.join('\n')}` : '') +
    (keptEvidence.length ? `\n${DIGEST_EVIDENCE_MARKER}\n${keptEvidence.join('\n')}` : '');
  const snapshotBlock = opts.snapshot ? `\n${opts.snapshot}\n` : '';
  return (
    `${DIGEST_HEADER_PREFIX} ${opts.condensedCount} earlier messages were condensed into the excerpts below. ` +
    `The TASK STATE message that follows is authoritative (goal, criteria, architecture decisions, evidence, current state); do not re-read or repeat work already recorded there.` +
    `${snapshotBlock}\n${boundedDigest(opts.excerptLines)}${preserved}`
  );
}

/** Convenience: digest a batch of dropped messages, merging any prior digest. */
export function buildHistoryDigest(dropped: LlmMessage[], priorDigestContent?: string): { content: string; condensedCount: number } {
  const material = extractDigestMaterial(dropped);
  let priorCondensed = 0;
  let prior: { lines: string[]; decisions: string[]; failures: string[]; evidence: string[] } = {
    lines: [],
    decisions: [],
    failures: [],
    evidence: [],
  };
  if (priorDigestContent) {
    prior = parseCarriedDigest(priorDigestContent);
    priorCondensed = Number(/(\d+) earlier messages/.exec(priorDigestContent)?.[1] ?? 0);
  }
  const condensedCount = material.carriedMessages + dropped.length + priorCondensed;
  const content = buildDigestContent({
    condensedCount,
    excerptLines: [...prior.lines, ...material.excerptLines],
    decisions: [...prior.decisions, ...material.decisions],
    failures: [...prior.failures, ...material.failures],
    evidence: [...prior.evidence, ...material.evidenceLines],
  });
  return { content, condensedCount };
}

/** Target size for a compressed (v2) digest. The 24K bound above is a hard
 *  ceiling; this is the size a digest is compressed DOWN to when it grows
 *  past it — the digest is never deleted, only re-compacted. */
export const DIGEST_TARGET_CHARS = 8_000;

/**
 * Digest self-compaction (v1 -> v2): an over-large digest is compressed into
 * a smaller PROTECTED digest, never deleted. The durable floor — KEY FAILURES
 * and EVIDENCE lines — is always preserved in full; only excerpt lines yield,
 * oldest first, via boundedDigest. Format is unchanged, so the compressed
 * digest is still carried forward correctly by every parser.
 */
export function compressDigest(content: string, maxChars = DIGEST_TARGET_CHARS): string {
  if (content.length <= maxChars) return content;
  const parsed = parseCarriedDigest(content);
  const headerEnd = content.indexOf('\n');
  const header = headerEnd > 0 ? content.slice(0, headerEnd) : content;
  const preserved =
    (parsed.decisions.length ? `\n${DIGEST_DECISIONS_MARKER}\n${parsed.decisions.join('\n')}` : '') +
    (parsed.failures.length ? `\n${DIGEST_FAILURES_MARKER}\n${parsed.failures.join('\n')}` : '') +
    (parsed.evidence.length ? `\n${DIGEST_EVIDENCE_MARKER}\n${parsed.evidence.join('\n')}` : '');
  let excerptBudget = maxChars - header.length - preserved.length - 2;
  if (excerptBudget < 500) excerptBudget = 500; // the floor is the floor
  const body = boundedDigest(parsed.lines, excerptBudget);
  return `${header}\n${body}${preserved}`;
}
