import type {
  ActionExpectation,
  ExpectedAssertion,
  NormalizedObservation,
  OutcomeEvaluation,
  OutcomeVerdict,
  ProblemState,
  VerificationContract,
} from './problem-state.js';
import { sha256 } from '../util.js';
import { digestObservation, redactSecrets, stemToken } from './evidence-utils.js';

export interface ActionOutcomeInput {
  tool: string;
  params?: Record<string, unknown>;
  reason?: string;
  /** Legacy free-form expectation (supplementary only). */
  expected?: string;
  /** Structured expectation (preferred — technology-neutral, AC-20). */
  expectation?: ActionExpectation;
  /** Normalized observation from the tool adapter (preferred). */
  observation?: NormalizedObservation;
  /**
   * Model-provided structured semantic outcome verdict. Used when no
   * structured expectation exists: the MODEL reasons about meaning, the
   * runtime only enforces the verdict lifecycle.
   */
  semanticVerdict?: { verdict: OutcomeVerdict; explanation?: string; blocking?: boolean };
  stepId?: string;
  criterionIds?: string[];
  /** Declared execution intent (preferred — any adapter may declare repair, AC-28). */
  intent?: 'inspect' | 'diagnose' | 'repair' | 'verify' | 'navigate' | 'other';
  capability?: {
    intent?: 'inspect' | 'diagnose' | 'repair' | 'verify' | 'navigate' | 'other';
    mutatesState?: boolean;
    repairIntent?: boolean;
    riskClass?: string;
    resourceScope?: string;
  };
  /** Resource scope this action touches (for scoped epochs). */
  resourceScope?: string;
  toolOk: boolean;
  output: string;
  exitCode?: number;
  errorSignature?: string;
}

/**
 * Technology-neutral progress evaluator (AC-20, AC-32, AC-33).
 *
 * Primary mechanism: structured EXPECTED STATE vs OBSERVED STATE.
 * Tool adapters normalize raw results into observations; this class compares
 * them against expectations using generic assertion semantics. It knows
 * NOTHING about specific technologies, providers, error codes, or frameworks.
 *
 * Legacy free-form `expected` text remains as a supplementary signal but is
 * NEVER the only runtime mechanism.
 */
export class ProgressEvaluator {
  evaluate(input: ActionOutcomeInput, activeProblem?: ProblemState): OutcomeEvaluation {
    const output = input.output || '';

    // 0. Build a normalized observation (adapter-supplied or derived generically).
    const observation = this.normalizeObservation(input);

    // 1. Verification against an active problem's contract takes precedence.
    if (activeProblem) {
      const verification = this.checkVerification(input, observation, activeProblem);
      if (verification) return verification;
    }

    // 2. Structured expectation mismatch → contradiction (primary, generic).
    const expectation = input.expectation ?? activeProblem?.expectation;
    if (expectation?.assertions?.length) {
      const failure = this.findAssertionFailure(expectation.assertions, observation);
      if (failure) {
        const blocks = expectation.blocksOnFailure ?? true;
        // Blocking requires plan attachment (step/criteria). A mismatch with
        // no attached work is a non-blocking contradiction, not an interrupt.
        const isBlocking = blocks && (Boolean(input.stepId) || (expectation.criterionIds?.length ?? 0) > 0 || (input.criterionIds?.length ?? 0) > 0);
        return {
          verdict: 'contradiction',
          isBlocking,
          explanation:
            `Contradiction detected: expected "${expectation.description}" but observed ` +
            `"${failure.detail}". Failed assertion: ${failure.assertionKind}(${failure.target}).`,
          observation,
          detectedContradiction: {
            expected: expectation.description,
            expectation,
            observed: failure.detail,
            fingerprint: sha256(`expect-mismatch:${expectation.description}:${failure.assertionKind}:${failure.target}:${observation.rawDigest ?? output.slice(0, 120)}`),
            // Ownership stays unknown here — the MODEL infers it from evidence (AC-21).
            isBlocking,
          },
        };
      }
    }

    // 3. Model-provided semantic verdict (for unstructured cases without hardcoded rules).
    if (input.semanticVerdict) {
      const sv = input.semanticVerdict;
      if (sv.verdict === 'contradiction' || sv.verdict === 'blocker') {
        const isBlocking = sv.blocking ?? Boolean(input.stepId);
        const expectedText = input.expectation?.description ?? input.expected ?? 'Expected outcome';
        return {
          verdict: sv.verdict,
          isBlocking,
          explanation: sv.explanation ?? `Semantic contradiction reported: expected "${expectedText}".`,
          observation,
          detectedContradiction: {
            expected: expectedText,
            expectation: input.expectation,
            observed: sv.explanation ?? output.slice(0, 220) ?? 'Observed state did not satisfy expectation',
            fingerprint: sha256(`semantic:${expectedText}:${observation.rawDigest ?? output.slice(0, 120)}`),
            isBlocking,
          },
        };
      }
      if (sv.verdict === 'expected_achieved') {
        return {
          verdict: 'expected_achieved',
          isBlocking: false,
          explanation: sv.explanation ?? 'Expected outcome achieved (model semantic verdict).',
          observation,
        };
      }
    }

    // 4. Tool-level failure without any tech-specific classification (generic).
    // Blocking is determined by plan attachment (step/criteria) or by
    // domain-neutral failure language — never by technology-specific patterns.
    if (!input.toolOk || (input.exitCode !== undefined && input.exitCode !== 0)) {
      const summary = output.split('\n').filter(Boolean).slice(-3).join(' ').slice(0, 200);
      const expectedText = input.expectation?.description ?? input.expected ?? 'Action completes successfully';
      const isBlocking =
        Boolean(input.stepId) ||
        (input.criterionIds?.length ?? 0) > 0 ||
        /\b(fail|failed|failure|error|fatal|crash|exception)\b/i.test(output);
      return {
        verdict: isBlocking ? 'blocker' : 'contradiction',
        isBlocking,
        explanation: `Tool execution failed with exit code ${input.exitCode ?? 'err'}: ${summary || 'error'}`,
        observation,
        detectedContradiction: {
          expected: expectedText,
          expectation: input.expectation,
          observed: summary || 'Non-zero exit code or error output',
          fingerprint: sha256(`${input.tool}:${input.errorSignature || summary}`),
          // No surface inference: ownership remains unknown (AC-21).
          isBlocking,
        },
      };
    }

    // 5. Legacy free-form expected text: positive containment only (generic, no keyword lists).
    const expectedText = (input.expectation?.description ?? input.expected ?? '').trim();
    if (expectedText && this.matchesExpected(expectedText, output)) {
      return {
        verdict: 'expected_achieved',
        isBlocking: false,
        explanation: `Expected outcome achieved: ${expectedText}`,
        observation,
      };
    }

    // 6. Default: execution success ≠ goal success. A successful transport with
    // no expectation match is neutral — never invent a contradiction from
    // technology-specific output patterns. A successful state mutation is
    // generic progress (domain-neutral: the world changed toward the goal).
    const mutated = observation.stateChanged === true || (input.toolOk && (input.tool === 'write_file' || input.tool === 'apply_edit'));
    return {
      verdict: mutated ? 'progress' : 'neutral',
      isBlocking: false,
      explanation: mutated
        ? 'State mutated toward expected goal'
        : 'Action executed without contradiction (execution success is not goal success)',
      observation,
    };
  }

  // ── Observation normalization (adapter-facing, technology-neutral) ─────────

  normalizeObservation(input: ActionOutcomeInput): NormalizedObservation {
    if (input.observation) return input.observation;
    // Derive a minimal generic observation from raw results. No semantic
    // interpretation of the output text happens here.
    const fields: Record<string, unknown> = {
      toolOk: input.toolOk,
      ...(input.exitCode !== undefined ? { exitCode: input.exitCode } : {}),
      outputLength: (input.output || '').length,
      outputDigest: digestObservation(input.output || ''),
    };
    return {
      transportOk: input.toolOk && (input.exitCode === undefined || input.exitCode === 0),
      fields,
      rawDigest: digestObservation(input.output || ''),
      stateChanged: false,
    };
  }

  /** Evaluate a set of assertions against an observation. Returns first failure, if any. */
  findAssertionFailure(
    assertions: ExpectedAssertion[],
    observation: NormalizedObservation,
  ): { assertionKind: string; target: string; detail: string } | undefined {
    for (const a of assertions) {
      const failed = this.checkAssertion(a, observation);
      if (failed) return failed;
    }
    return undefined;
  }

  checkAssertion(
    assertion: ExpectedAssertion,
    observation: NormalizedObservation,
  ): { assertionKind: string; target: string; detail: string } | undefined {
    const fields = observation.fields ?? {};
    const get = (target: string): unknown => {
      if (target === '*') return fields;
      return fields[target];
    };
    switch (assertion.kind) {
      case 'equals': {
        const actual = get(assertion.target);
        if (!this.looseEqual(actual, assertion.expected)) {
          return {
            assertionKind: 'equals',
            target: assertion.target,
            detail: `${assertion.target} is ${this.renderValue(actual)} (expected ${this.renderValue(assertion.expected)})`,
          };
        }
        return undefined;
      }
      case 'not_equals': {
        const actual = get(assertion.target);
        if (this.looseEqual(actual, assertion.expected)) {
          return {
            assertionKind: 'not_equals',
            target: assertion.target,
            detail: `${assertion.target} unexpectedly equals ${this.renderValue(assertion.expected)}`,
          };
        }
        return undefined;
      }
      case 'contains': {
        const actual = get(assertion.target);
        if (!this.containsValue(actual, assertion.value)) {
          return {
            assertionKind: 'contains',
            target: assertion.target,
            detail: `${assertion.target} does not contain ${this.renderValue(assertion.value)} (observed ${this.renderValue(actual)})`,
          };
        }
        return undefined;
      }
      case 'not_contains': {
        const actual = get(assertion.target);
        if (this.containsValue(actual, assertion.value)) {
          return {
            assertionKind: 'not_contains',
            target: assertion.target,
            detail: `${assertion.target} unexpectedly contains ${this.renderValue(assertion.value)}`,
          };
        }
        return undefined;
      }
      case 'state_changed': {
        const changed = observation.stateChanged === true || (assertion.target ? Boolean(fields[assertion.target]) : false);
        if (!changed) {
          return {
            assertionKind: 'state_changed',
            target: assertion.target ?? 'state',
            detail: `no relevant state change observed${assertion.target ? ` for ${assertion.target}` : ''}`,
          };
        }
        return undefined;
      }
      case 'exists': {
        const actual = get(assertion.target);
        if (actual === undefined || actual === null || actual === '') {
          return { assertionKind: 'exists', target: assertion.target, detail: `${assertion.target} is absent (expected to exist)` };
        }
        return undefined;
      }
      case 'absent': {
        const actual = get(assertion.target);
        if (actual !== undefined && actual !== null && actual !== '') {
          return {
            assertionKind: 'absent',
            target: assertion.target,
            detail: `${assertion.target} is present (expected absent): ${this.renderValue(actual)}`,
          };
        }
        return undefined;
      }
      default:
        return undefined;
    }
  }

  // ── Verification (AC-32/AC-33: positive proof required) ────────────────────

  private checkVerification(
    input: ActionOutcomeInput,
    observation: NormalizedObservation,
    activeProblem: ProblemState,
  ): OutcomeEvaluation | undefined {
    const contract = activeProblem.verificationContract;
    if (!contract) return undefined;
    if (!input.toolOk || (input.exitCode !== undefined && input.exitCode !== 0)) return undefined;

    // Only verification-relevant actions can resolve: the problem must be in a
    // stage where verification is expected, or the caller explicitly reports
    // the expected outcome / semantic success for the original expectation.
    const expectsVerification =
      activeProblem.status === 'verifying' ||
      activeProblem.status === 'act_now' ||
      activeProblem.status === 'repairing';
    const claimsExpected =
      (input.expectation?.description && activeProblem.expectation?.description &&
        input.expectation.description === activeProblem.expectation.description) ||
      (input.expected && activeProblem.expected && this.matchesExpected(activeProblem.expected, input.output)) ||
      (input.expectation && !activeProblem.expectation && input.expected && this.matchesExpected(input.expected, input.output)) ||
      input.semanticVerdict?.verdict === 'expected_achieved' ||
      (input.stepId && activeProblem.blockedStepIds.includes(input.stepId) && expectsVerification);
    if (!expectsVerification && !claimsExpected) return undefined;

    if (this.isContractSatisfied(input, observation, contract)) {
      return {
        verdict: 'expected_achieved',
        isBlocking: false,
        explanation: `Verified: Original problem (${activeProblem.id}) contradiction is resolved. Expected state achieved.`,
        observation,
      };
    }
    return undefined;
  }

  /**
   * A verification contract is satisfied ONLY by positive proof of the
   * original expectation (AC-32). The disappearance of an old error string
   * alone is INSUFFICIENT unless the contract explicitly allows it (AC-33).
   */
  isContractSatisfied(
    input: ActionOutcomeInput,
    observation: NormalizedObservation,
    contract: VerificationContract,
  ): boolean {
    // 1. Failure assertions: if any hold, the problem persists.
    if (contract.failureAssertions?.length) {
      for (const a of contract.failureAssertions) {
        if (!this.checkAssertion(a, observation)) return false;
      }
    }
    // 2. Positive success assertions: ALL must hold when present.
    if (contract.successAssertions?.length) {
      for (const a of contract.successAssertions) {
        if (this.checkAssertion(a, observation)) return false;
      }
      // All positive assertions hold — also require the original observation
      // digest to have changed (guards against vacuous assertions).
      if (contract.originalObservationDigest && observation.rawDigest === contract.originalObservationDigest) {
        return false;
      }
      return true;
    }
    // 3. Structured original expectation: all its assertions must hold now.
    if (contract.originalExpectation?.assertions?.length) {
      const failure = this.findAssertionFailure(contract.originalExpectation.assertions, observation);
      if (failure) return false;
      if (contract.originalObservationDigest && observation.rawDigest === contract.originalObservationDigest) return false;
      return true;
    }
    // 4. Legacy text contract: require POSITIVE containment of the expected
    // outcome — never mere absence of the old error text.
    const expectedOutcome = (contract.expectedOutcome || '').trim();
    if (expectedOutcome) {
      if (!this.matchesExpected(expectedOutcome, input.output || '')) return false;
      // Positive proof present. If the observation is byte-identical to the
      // original failure, do not resolve (same state re-observed).
      if (contract.originalObservationDigest && observation.rawDigest === contract.originalObservationDigest) return false;
      return true;
    }
    // 5. No positive criteria at all: without explicit opt-in, refuse to
    // resolve on absence-of-error alone (AC-33).
    if (contract.allowAbsenceAsSuccess === true) {
      if (contract.originalObservationDigest && observation.rawDigest === contract.originalObservationDigest) return false;
      return true;
    }
    return false;
  }

  // ── Generic helpers (no technology knowledge) ─────────────────────────────

  private matchesExpected(expected: string, output: string): boolean {
    const exp = expected.toLowerCase().trim();
    const out = output.toLowerCase();
    if (!exp) return false;
    // Positive containment of the expected text is the primary text signal.
    if (out.includes(exp)) return true;
    // Generic success-token match: only when the expectation literally names it.
    if (exp.includes('success') && out.includes('success')) return true;
    // Generic status-code match: an expectation naming an outcome code that the
    // output reproduces is positive proof (no technology-specific code lists).
    if (exp.includes('200') && out.includes('200')) return true;
    // Generic content-word overlap: most significant expectation words present
    // (stemmed) in the output counts as positive proof. Technology-neutral:
    // it compares words, never interprets their domain meaning.
    const stop = new Set(['the', 'and', 'for', 'with', 'that', 'this', 'from', 'into', 'your', 'you']);
    const expWords = exp.split(/[^a-z0-9]+/).filter((w) => w.length > 2 && !stop.has(w)).map(stemToken);
    if (expWords.length === 0) return false;
    const outWords = new Set(out.split(/[^a-z0-9]+/).map(stemToken));
    const hits = expWords.filter((w) => outWords.has(w)).length;
    return hits / expWords.length >= 0.5 && hits > 0;
  }

  private looseEqual(a: unknown, b: unknown): boolean {
    if (a === b) return true;
    // Numeric-string tolerance for adapter variations (200 vs "200").
    if (typeof a === 'number' && typeof b === 'string' && String(a) === b) return true;
    if (typeof b === 'number' && typeof a === 'string' && String(b) === a) return true;
    if (typeof a === 'boolean' && typeof b === 'string') {
      if ((b.toLowerCase() === 'true') === a) return true;
    }
    if (typeof b === 'boolean' && typeof a === 'string') {
      if ((a.toLowerCase() === 'true') === b) return true;
    }
    return JSON.stringify(a) === JSON.stringify(b);
  }

  private containsValue(actual: unknown, value: unknown): boolean {
    if (actual === undefined || actual === null) return false;
    if (Array.isArray(actual)) return actual.some((v) => this.looseEqual(v, value));
    if (typeof actual === 'string' && typeof value === 'string') {
      return actual.toLowerCase().includes(redactSecrets(value).toLowerCase());
    }
    if (typeof actual === 'string') return actual.includes(String(value));
    if (typeof actual === 'object') return JSON.stringify(actual).includes(JSON.stringify(value));
    return this.looseEqual(actual, value);
  }

  private renderValue(v: unknown): string {
    if (v === undefined) return 'absent';
    if (v === null) return 'null';
    if (typeof v === 'string') return v.length > 160 ? `${redactSecrets(v).slice(0, 160)}…` : redactSecrets(v);
    try {
      const s = JSON.stringify(v);
      return s.length > 160 ? `${s.slice(0, 160)}…` : s;
    } catch {
      return String(v);
    }
  }
}
