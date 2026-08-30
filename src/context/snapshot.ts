/**
 * ContextSnapshot — the canonical compressed state of a task.
 *
 * NOT the conversation: the minimum information another model turn needs to
 * continue correctly. Built from the task ledger (the authoritative source),
 * rendered into compaction digests and artifacts so durable state survives
 * even when verbose history is dropped.
 */
import type { TaskLedgerData } from '../types.js';

export interface ContextSnapshot {
  objective: string;
  status: string;
  decisions: string[];
  completed: string[];
  active: string[];
  blocked: string[];
  failedAttempts: string[];
  evidence: { pass: number; fail: number; recent: string[] };
  relevantFiles: string[];
  nextMove?: string;
}

export function buildContextSnapshot(data: TaskLedgerData): ContextSnapshot {
  const completed = data.plan.filter((s) => s.status === 'done').map((s) => s.description);
  const active = data.plan.filter((s) => s.status === 'in_progress' || s.status === 'pending').map((s) => s.description);
  const failed = data.plan.filter((s) => s.status === 'failed' || s.status === 'blocked').map((s) => `${s.description} (${s.status})`);
  const recentEvidence = data.evidence.slice(-4).map((e) => `${e.id} [${e.passed ? 'PASS' : 'FAIL'}] ${e.label}`);
  const next = data.plan.find((s) => s.status === 'in_progress') ?? data.plan.find((s) => s.status === 'pending');
  return {
    objective: data.goal,
    status: data.status,
    decisions: (data.architectureDecisions ?? [])
      .filter((d) => d.status === 'active')
      .map((d) => d.decision),
    completed,
    active,
    blocked: [...data.blockers, ...failed],
    failedAttempts: failureAttemptLines(data),
    evidence: {
      pass: data.evidence.filter((e) => e.passed).length,
      fail: data.evidence.filter((e) => !e.passed).length,
      recent: recentEvidence,
    },
    relevantFiles: (data.filesChanged ?? []).slice(-12),
    nextMove: next ? next.description : undefined,
  };
}

/** Distinct recent failures (reuses the ledger's dedupe-by-signature logic shape). */
function failureAttemptLines(data: TaskLedgerData): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (let i = data.actions.length - 1; i >= 0 && out.length < 5; i--) {
    const a = data.actions[i]!;
    if (a.status !== 'error') continue;
    const key = a.errorSignature ?? a.paramsSummary;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(a.paramsSummary.slice(0, 140));
  }
  return out;
}

/** Compact render for compaction digests and artifacts (bounded, ~15 lines). */
export function renderContextSnapshot(s: ContextSnapshot): string {
  const lines: string[] = [];
  lines.push(`MISSION SNAPSHOT (canonical task state — survives history compaction):`);
  lines.push(`objective: ${s.objective}`);
  if (s.decisions.length) lines.push(`decisions: ${s.decisions.slice(-3).join(' | ').slice(0, 240)}`);
  if (s.completed.length) lines.push(`completed: ${s.completed.length} step(s) — ${s.completed.slice(-3).map((c) => c.slice(0, 60)).join(' | ')}`);
  if (s.active.length) lines.push(`active: ${s.active.slice(0, 3).map((c) => c.slice(0, 60)).join(' | ')}`);
  if (s.blocked.length) lines.push(`blocked: ${s.blocked.slice(-3).map((c) => String(c).slice(0, 80)).join(' | ')}`);
  if (s.failedAttempts.length) lines.push(`failed attempts (do not repeat blindly): ${s.failedAttempts.slice(-3).join(' | ')}`);
  lines.push(`evidence: ${s.evidence.pass} passing / ${s.evidence.fail} failing${s.evidence.recent.length ? ` — latest: ${s.evidence.recent[s.evidence.recent.length - 1]!.slice(0, 100)}` : ''}`);
  if (s.relevantFiles.length) lines.push(`files in play: ${s.relevantFiles.slice(-6).join(', ')}`);
  if (s.nextMove) lines.push(`next: ${s.nextMove.slice(0, 120)}`);
  return lines.join('\n');
}
