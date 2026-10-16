import type { AcceptanceCriterion, CriterionEvidenceType, CriterionSpec, Evidence, EvidenceKind, TaskLedgerData } from '../types.js';
import { errorSignature, excerpt, normalizeErrorText, nowIso, shortId } from '../util.js';

/**
 * Mapping from structured criterion evidence types to the EvidenceKind
 * that must be produced by the actual command classification.
 */
const EVIDENCE_TYPE_TO_KIND: Record<string, EvidenceKind> = {
  test_success: 'test',
  build_success: 'build',
  lint_success: 'lint',
  typecheck_success: 'typecheck',
  command_success: 'command',
};

export function evidenceKindForType(type: CriterionEvidenceType): EvidenceKind | undefined {
  return EVIDENCE_TYPE_TO_KIND[type];
}

/** Recheck the contract when loading a ledger as well as when first linking. */
export function criterionEvidenceMismatch(criterion: AcceptanceCriterion, evidence: Evidence): string | undefined {
  if (evidence.exitCode !== undefined && evidence.exitCode !== 0) return 'Evidence has a nonzero exit code.';
  if (criterion.verification && !evidence.command)
    return `Criterion requires verification command "${criterion.verification}" but evidence has no command. Run the required verification.`;
  if (criterion.verification && evidence.command && !commandsMatch(criterion.verification, evidence.command))
    return `Evidence command "${evidence.command.trim()}" does not match the required verification "${criterion.verification}". Run the correct command.`;
  const requiredType = criterion.evidenceType ?? 'any';
  const requiredKind = EVIDENCE_TYPE_TO_KIND[requiredType];
  if (requiredType !== 'any' && !requiredKind) return `Unknown required evidence type "${requiredType}".`;
  if (requiredKind && evidence.kind !== requiredKind)
    return `Evidence kind "${evidence.kind}" does not match the required type "${requiredType}" (needs "${requiredKind}"). Run the correct verification.`;
  return undefined;
}

/** A newer failure at the same workspace supersedes an older passing run. */
export function latestVerificationEvidence(ledger: Pick<TaskLedgerData, 'evidence'>, command: string, currentFingerprint?: string): Evidence | undefined {
  const checks = [...ledger.evidence].reverse().filter((e) => e.command && commandsMatch(e.command, command));
  const current = checks.find((e) => !currentFingerprint || !e.workspaceFingerprint || evidenceMatchesWorkspace(e, currentFingerprint));
  // Scoped reuse must never resurrect a pass superseded by a later failure,
  // including a failure whose full fingerprint predates an unrelated edit.
  if (currentFingerprint && current?.verificationScope?.validatedFor === currentFingerprint && current.workspaceFingerprint !== currentFingerprint) {
    const failure = checks.slice(0, checks.indexOf(current)).find((e) => !e.passed || (e.exitCode !== undefined && e.exitCode !== 0));
    if (failure) return failure;
  }
  return current;
}

export function evidenceMatchesWorkspace(evidence: Pick<Evidence, 'workspaceFingerprint' | 'verificationScope'>, fingerprint: string): boolean {
  if (incompleteFingerprint(fingerprint)) return false;
  return evidence.workspaceFingerprint === fingerprint || evidence.verificationScope?.validatedFor === fingerprint;
}

function incompleteFingerprint(value: string | undefined): boolean {
  return Boolean(value && /^(?:partial-|unknown(?:-fp)?$)/.test(value));
}

export function isTrivialEvidenceCommand(command: string): boolean {
  // Split on compound operators first: "cd client && npm test" must count as
  // real verification just because it STARTS with cd, while
  // "git status && git log" (every segment trivial) stays a no-op. Within a
  // segment, EVERY token must be trivial — "time npm run build" is real work
  // even though it starts with the wrapper word "time".
  const segments = command.split(/&&|\|\||[;|]/);
  if (segments.every((s) => s.trim() === '')) return true;
  return segments.every(isTrivialSegment);
}

/**
 * True when a command manufactures the value it later presents as proof.
 *
 * These commands are still useful as diagnostics, but a successful exit only
 * proves that the shell/runtime can print a literal. It does not observe the
 * application, execute a test, or make a falsifiable assertion. Keep this
 * deliberately conservative: an inline script that reads state, invokes a
 * child process, or contains a real failing assertion is not rejected here.
 */
export function isManufacturedEvidenceCommand(command: string): boolean {
  const c = command.trim();
  if (!c) return true;

  // Direct shell output is the simplest form of self-authored proof.
  if (/^(?:echo|printf|write-host|write-output)\b/i.test(c)) return true;

  const inlineRuntime = /^(?:node(?:\.exe)?\b[\s\S]*?\s-(?:e|p)\s+|(?:python|python3|py)(?:\.exe)?\b[\s\S]*?\s-c\s+|(?:powershell|pwsh)(?:\.exe)?\b[\s\S]*?\s-(?:command|c)\s+)/i;
  if (!inlineRuntime.test(c)) return false;

  // An inline program is manufactured evidence only when it emits output but
  // has no independent observation and no path that can fail the check.
  const emitsOutput =
    /process\.stdout\.write|process\.stderr\.write|console\.(?:log|info)|\bprint\s*\(|\bwrite-(?:output|host)\b|convertto-json|\s\|\s*convertto-json/i.test(c) ||
    /\s-p\s+/i.test(c);
  if (!emitsOutput) return false;

  const observesOrCanFail =
    /\brequire\s*\(|\bimport(?:\s|\{)|\bfrom\s+['"]|child_process|\b(?:spawn|spawnsync|exec|execfile|execfilesync)\s*\(|\b(?:readfile|readfilesync|exists|existssync|stat|statsync|access|accesssync)\s*\(|\bfetch\s*\(|\bhttps?\b|\bassert(?:\.|\s*\()|\bexpect\s*\(|\bthrow\b|\braise\b|\bif\s*\(|process\.exit\s*\(\s*[1-9]|sys\.exit\s*\(\s*[1-9]|\b(?:open|subprocess\.|requests\.)\s*\(|\btest-path\b|\bget-content\b|\bget-item\b|\binvoke-[\w-]+\b|\bcompare-object\b|\bwhere-object\b|\$lastexitcode\b/i.test(
      c,
    );

  return !observesOrCanFail;
}

const TRIVIAL_WORDS = new Set([
  'echo',
  '.',
  ':',
  'true',
  'pwd',
  'cd',
  'ls',
  'dir',
  'cls',
  'whoami',
  'hostname',
  'date',
  'ver',
  'tree',
  'sleep',
  'start-sleep',
  'write-host',
  'get-childitem',
  'gci',
  'set-location',
  'sl',
]);
/** Read-only git subcommands that keep a `git ...` segment trivial. Write ops
 *  (commit, push, reset, checkout, …) are NOT here on purpose: they mutate
 *  state, so they must never be dismissed as a no-op verification. */
const TRIVIAL_GIT_SUBCOMMANDS = new Set(['status', 'log', 'diff', 'show']);

function isTrivialSegment(raw: string): boolean {
  const tokens = raw.trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return true;
  let sawCommand = false;
  let sawGit = false;
  let gitSubcommandSeen = false;
  for (const tok of tokens) {
    if (/^[-/]/.test(tok)) continue; // flags and unix-style paths are inert
    const t = tok.toLowerCase().replace(/^["']|["']$/g, '');
    if (t === 'git') {
      // Only a read-only git invocation stays trivial; the first bare word after
      // `git` is the subcommand — if it mutates state, the segment is real work.
      sawGit = true;
      sawCommand = true;
      continue;
    }
    if (sawGit && !gitSubcommandSeen) {
      gitSubcommandSeen = true;
      if (TRIVIAL_GIT_SUBCOMMANDS.has(t)) continue; // git status / log / diff / show
      return false; // git <commit|push|reset|checkout|…> mutates state — not a no-op
    }
    if (sawGit) continue; // arguments to a read-only git subcommand stay inert
    if (TRIVIAL_WORDS.has(t)) {
      sawCommand = true;
      continue;
    }
    // Path-ish continuation AFTER a trivial command ("cd client", "echo done").
    if (sawCommand && /^[\w .~\\/:"'()-]+$/.test(tok)) continue;
    return false;
  }
  return true;
}

/**
 * Normalize a command string for exact comparison.
 * trim → collapse whitespace → lowercase.
 * This handles harmless variations like extra spaces but rejects
 * injected extra commands (&&, ;, |) or different arguments.
 */
function normalizeCommand(cmd: string): string {
  return cmd.trim().replace(/\s+/g, ' ').toLowerCase();
}

/**
 * Exact normalized command matching. The evidence command must be
 * exactly the required verification command after normalization.
 *
 * This intentionally does NOT use substring matching, because:
 *   "npm test -- auth && echo hacked"  must NOT match  "npm test -- auth"
 *   "npm test -- unrelated"            must NOT match  "npm test -- auth"
 */
export function commandsMatch(required: string, actual: string): boolean {
  return normalizeCommand(required) === normalizeCommand(actual);
}

export function classifyEvidenceKind(command: string): EvidenceKind {
  const c = command.toLowerCase();
  if (/\b(test|vitest|jest|pytest|cargo test|go test)\b/.test(c)) return 'test';
  if (/\b(lint|eslint)\b/.test(c)) return 'lint';
  if (/\b(typecheck|tsc)\b/.test(c)) return 'typecheck';
  if (/\bbuild\b/.test(c)) return 'build';
  return 'command';
}

/**
 * A verification failure identity should survive harmless value drift. Exact
 * assertion numbers, timings, ports, ids and line numbers can change between
 * runs while the underlying failure is the same. Normalize those values before
 * hashing so a genuinely NEW failure message supersedes an old diagnosis, while
 * a numerically different instance of the same assertion does not.
 */
export function verificationFailureSignature(output: string): string {
  const normalized = normalizeErrorText(output)
    .replace(/[-+]?\b\d+(?:\.\d+)?\b/g, '<num>')
    .replace(/\s+/g, ' ')
    .trim();
  return errorSignature(normalized);
}

/**
 * A current hypothesis belongs to the failure it was formed against. Retire it
 * only when the SAME verification command produces a materially different
 * failure signature. A later PASS keeps the diagnosed root cause available for
 * the bug-rigor completion gate and final report; it is resolved knowledge, not
 * an active reason to keep investigating.
 */
export function verificationSupersedesHypothesis(previousFailure: Pick<Evidence, 'passed' | 'outputExcerpt'> | undefined, next: { passed: boolean; output: string }): boolean {
  if (!previousFailure || previousFailure.passed || next.passed) return false;
  return verificationFailureSignature(previousFailure.outputExcerpt) !== verificationFailureSignature(next.output);
}

/** Structural slice of the ledger needed to prove a bug fix causally. */
export interface RegressionProofInput {
  evidence: { command?: string; passed: boolean; createdAt: string; workspaceFingerprint?: string }[];
  actions: { tool: string; status: string; createdAt?: string }[];
}

/**
 * True when the ledger proves CAUSALITY for a bug fix, not just a green suite:
 * the same non-trivial command FAILED before the fix, a file edit succeeded
 * in between, and the SAME command PASSED after. A post-fix-only passing run
 * proves nothing about the bug — the existing tests may never have covered it.
 */
export function hasRegressionProof(input: RegressionProofInput): boolean {
  const norm = (cmd: string): string => cmd.trim().replace(/\s+/g, ' ').toLowerCase();
  const real = (cmd: string | undefined): string | undefined => {
    if (!cmd) return undefined;
    const c = norm(cmd);
    return c && !isTrivialEvidenceCommand(c) && !isManufacturedEvidenceCommand(c) ? c : undefined;
  };
  // Latest PASS per command: an earlier green baseline must not hide a later
  // fail -> edit -> pass sequence. Any causal pair must precede this pass.
  const passAt = new Map<string, RegressionProofInput['evidence'][number]>();
  for (const ev of input.evidence) {
    const cmd = real(ev.command);
    if (!cmd || !ev.passed) continue;
    const prev = passAt.get(cmd);
    if (!prev || ev.createdAt > prev.createdAt) passAt.set(cmd, ev);
  }
  if (passAt.size === 0) return false;
  const edits = input.actions.filter((a) => (a.tool === 'write_file' || a.tool === 'apply_edit') && a.status === 'success' && a.createdAt);
  for (const ev of input.evidence) {
    const cmd = real(ev.command);
    if (!cmd || ev.passed) continue;
    const pass = passAt.get(cmd);
    // Inclusive lower bound: nowIso() has limited resolution, so a fast local
    // fail -> edit -> pass can record the SAME timestamp for all three. A fail
    // stamped at the same instant as the pass is still a genuine prior failure,
    // and an edit stamped at either boundary is still causally between them.
    // Strict > / < made a correct, fast fix unprovable purely on clock ties.
    if (!pass || ev.createdAt > pass.createdAt) continue;
    if (edits.some((a) => a.createdAt! >= ev.createdAt && a.createdAt! <= pass.createdAt)) return true;
    // Shell/native edits may not have a file-tool record. Independent content
    // identities prove that the failing and passing runs observed a real edit.
    if (ev.workspaceFingerprint && pass.workspaceFingerprint &&
        !incompleteFingerprint(ev.workspaceFingerprint) && !incompleteFingerprint(pass.workspaceFingerprint) &&
        ev.workspaceFingerprint !== pass.workspaceFingerprint) return true;
  }
  return false;
}

/**
 * True when this link is weakly bound: the criterion pins neither a
 * verification command nor an evidence type, so ANY passing command would
 * have satisfied it. The gate still accepts it, but callers should surface
 * the looseness instead of presenting it as hard proof.
 */
export function isWeakEvidenceLink(criterion: AcceptanceCriterion, evidence: Evidence): boolean {
  return !criterion.verification && (criterion.evidenceType ?? 'any') === 'any' && evidence.kind === 'command';
}

export interface GateResult {
  open: boolean;
  missing: string[];
  satisfiedCount: number;
  totalCount: number;
}

export class EvidenceEngine {
  record(
    ledger: TaskLedgerData,
    input: {
      kind: EvidenceKind;
      label: string;
      command?: string;
      exitCode?: number;
      passed: boolean;
      output: string;
      artifactPath?: string;
      workspaceFingerprint?: string;
      verificationScope?: Evidence['verificationScope'];
    },
  ): Evidence {
    // A hypothesis is scoped to the most recent failure of the same
    // verification command. If that command now fails in a materially
    // different way, retire the old hypothesis BEFORE the new evidence becomes
    // current state. A PASS intentionally preserves the diagnosed root cause.
    if (ledger.currentHypothesis && input.command) {
      const previousFailure = [...ledger.evidence]
        .reverse()
        .find((candidate) => !candidate.passed && typeof candidate.command === 'string' && commandsMatch(candidate.command, input.command!));
      if (verificationSupersedesHypothesis(previousFailure, input)) {
        ledger.currentHypothesis = undefined;
      }
    }

    const evidence: Evidence = {
      id: shortId('ev'),
      kind: input.kind,
      label: input.label,
      command: input.command,
      exitCode: input.exitCode,
      passed: input.passed,
      outputExcerpt: excerpt(input.output),
      artifactPath: input.artifactPath,
      createdAt: nowIso(),
      workspaceFingerprint: input.workspaceFingerprint,
      verificationScope: input.verificationScope,
      stale: false,
    };
    ledger.evidence.push(evidence);
    return evidence;
  }

  link(ledger: TaskLedgerData, criterionId: string, evidenceId: string, currentFingerprint?: string): { ok: boolean; reason: string } {
    const criterion = ledger.acceptanceCriteria.find((c) => c.id === criterionId);
    if (!criterion) return { ok: false, reason: `Unknown acceptance criterion: ${criterionId}` };
    const evidence = ledger.evidence.find((e) => e.id === evidenceId);
    if (!evidence) return { ok: false, reason: `Unknown evidence: ${evidenceId}` };
    if (!evidence.passed) {
      return { ok: false, reason: `Evidence ${evidenceId} did not pass; it cannot satisfy a criterion.` };
    }
    if (evidence.command && isManufacturedEvidenceCommand(evidence.command)) {
      return {
        ok: false,
        reason: `Evidence ${evidenceId} is self-authored output ("${evidence.command.trim()}") and cannot verify a criterion. Run a falsifiable check that observes the application or executes its tests.`,
      };
    }
    if (incompleteFingerprint(currentFingerprint) || incompleteFingerprint(evidence.workspaceFingerprint))
      return {
        ok: false,
        reason: 'Workspace fingerprint is incomplete; this evidence cannot establish fresh acceptance. Resolve the unreadable workspace paths and verify again.',
      };
    if (evidence.kind === 'command' && evidence.command && isTrivialEvidenceCommand(evidence.command)) {
      return {
        ok: false,
        reason: `Evidence ${evidenceId} is a no-op command ("${evidence.command.trim()}") and cannot verify a criterion. Run a real test/build/lint/typecheck.`,
      };
    }

    // Staleness is recomputed from the CURRENT fingerprint, never latched: if
    // the workspace reverts to the state this evidence was captured against,
    // the evidence is valid again instead of staying permanently stale.
    if (currentFingerprint && evidence.workspaceFingerprint) {
      evidence.stale = !evidenceMatchesWorkspace(evidence, currentFingerprint);
    }
    if (evidence.stale) {
      return {
        ok: false,
        reason: `Evidence ${evidenceId} is stale because the workspace was modified after the command ran. Re-run "${criterion.verification || evidence.command || 'verification'}" to produce fresh evidence.`,
      };
    }

    const mismatch = criterionEvidenceMismatch(criterion, evidence);
    if (mismatch) return { ok: false, reason: mismatch };
    const latest = evidence.command ? latestVerificationEvidence(ledger, evidence.command, currentFingerprint) : undefined;
    if (latest && (!latest.passed || (latest.exitCode !== undefined && latest.exitCode !== 0)))
      return { ok: false, reason: 'A newer verification failed for this workspace. Re-run the check; an older pass cannot satisfy the criterion.' };

    if (!criterion.evidenceIds.includes(evidenceId)) criterion.evidenceIds.push(evidenceId);
    criterion.satisfied = true;
    return { ok: true, reason: `Criterion "${criterion.text}" now backed by evidence ${evidence.label}.` };
  }

  gate(ledger: TaskLedgerData, currentFingerprint?: string): GateResult {
    const missing: string[] = [];
    let satisfiedCount = 0;

    for (const c of ledger.acceptanceCriteria) {
      // Recompute staleness against the CURRENT fingerprint (never latched):
      // evidence captured against a fingerprint the workspace has since
      // returned to is fresh again, not permanently stale.
      if (currentFingerprint) {
        for (const id of c.evidenceIds) {
          const ev = ledger.evidence.find((e) => e.id === id);
          if (ev && ev.workspaceFingerprint) {
            ev.stale = !evidenceMatchesWorkspace(ev, currentFingerprint);
          }
        }
      }

      const invalidManufactured = c.evidenceIds.some((id) => {
        const ev = ledger.evidence.find((e) => e.id === id);
        return Boolean(ev?.command && isManufacturedEvidenceCommand(ev.command));
      });
      const validEvidence = c.evidenceIds
        .map((id) => ledger.evidence.find((e) => e.id === id))
        .filter((e): e is Evidence =>
          Boolean(
            e &&
            e.passed &&
            !e.stale &&
            !incompleteFingerprint(currentFingerprint) &&
            !incompleteFingerprint(e.workspaceFingerprint) &&
            !criterionEvidenceMismatch(c, e) &&
            (!e.command ||
              (() => {
                const latest = latestVerificationEvidence(ledger, e.command!, currentFingerprint);
                return latest?.passed !== false && (latest?.exitCode === undefined || latest.exitCode === 0);
              })()) &&
            (!e.command || !isManufacturedEvidenceCommand(e.command)) &&
            !(e.kind === 'command' && e.command && isTrivialEvidenceCommand(e.command)),
          ),
        );

      const backed = c.satisfied && validEvidence.length > 0;
      if (backed) {
        satisfiedCount += 1;
      } else {
        if (c.satisfied && invalidManufactured) c.satisfied = false;
        const hasStale = c.evidenceIds.some((id) => ledger.evidence.find((e) => e.id === id)?.stale);
        if (incompleteFingerprint(currentFingerprint) || c.evidenceIds.some((id) => incompleteFingerprint(ledger.evidence.find((e) => e.id === id)?.workspaceFingerprint))) {
          missing.push(`[INCOMPLETE WORKSPACE] ${c.text} (a partial or unknown fingerprint cannot prove evidence freshness)`);
        } else if (invalidManufactured) {
          missing.push(`[INVALID EVIDENCE] ${c.text} (linked command only manufactured its expected output — run a falsifiable application check)`);
        } else if (hasStale) {
          missing.push(`[STALE EVIDENCE] ${c.text} (workspace was modified after verification ran — re-run ${c.verification || 'test'})`);
        } else if (c.satisfied && c.evidenceIds.length) {
          missing.push(`[INVALID EVIDENCE] ${c.text} (linked evidence does not satisfy the current command/type contract or a newer verification failed)`);
        } else {
          missing.push(c.text);
        }
      }
    }

    return {
      open: ledger.acceptanceCriteria.length > 0 && missing.length === 0,
      missing,
      satisfiedCount,
      totalCount: ledger.acceptanceCriteria.length,
    };
  }

  static criteriaFromTexts(texts: string[]): AcceptanceCriterion[] {
    return texts.map((text, i) => ({
      id: `ac-${i + 1}`,
      text,
      evidenceIds: [],
      satisfied: false,
    }));
  }

  static criteriaFromSpecs(specs: CriterionSpec[]): AcceptanceCriterion[] {
    return specs.map((spec, i) => ({
      id: `ac-${i + 1}`,
      text: spec.text,
      verification: spec.verification,
      evidenceType: spec.evidenceType,
      evidenceIds: [],
      satisfied: false,
    }));
  }

  /**
   * Normalize a mixed array of plain strings and CriterionSpec objects
   * into a uniform CriterionSpec[] array. Plain strings become specs
   * with evidenceType 'any' and no required verification.
   */
  static normalizeCriteria(criteria: (string | CriterionSpec)[]): CriterionSpec[] {
    return criteria.map((c) => (typeof c === 'string' ? { text: c } : c));
  }
}
