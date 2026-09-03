import type { EvidenceImpact, ProblemState, StrategyIdentity } from './problem-state.js';
import { sha256 } from '../util.js';
import { canonicalStatement, digestFields, redactParams, semanticDigest } from './evidence-utils.js';

export interface StrategyCheckInput {
  tool: string;
  params?: Record<string, unknown>;
  reason?: string;
  expected?: string;
  /** Active hypothesis statement (for semantic identity when ids differ). */
  hypothesisStatement?: string;
  /** Digest of the evidence basis supporting the current hypothesis. */
  evidenceBasisDigest?: string;
}

/** Material change context that may unlock a previously failed strategy (AC-25). */
export interface StrategyUnlockContext {
  /** Per-evidence materiality assessments since the last attempt. */
  evidenceImpacts?: EvidenceImpact[];
  /** Relevant resource epochs now (scope -> epoch). Compared to attempt time. */
  relevantStateEpochs?: Record<string, number>;
  /** World/resource state materially changed (adapter-attested). */
  relevantStateChanged?: boolean;
  /** Active hypothesis materially changed (semantic digest differs). */
  hypothesisChanged?: boolean;
  /** A repair was applied since the last attempt. */
  repairApplied?: boolean;
  /** User instruction materially changed the goal/constraints. */
  userInstructionChanged?: boolean;
  /** A required capability became available. */
  capabilityAvailable?: boolean;
}

export interface StrategyVerdict {
  allowed: boolean;
  reason?: string;
  strategyFingerprint?: string;
  semanticDuplicate?: boolean;
}

interface RecordedStrategy {
  fingerprint: string;
  identity: StrategyIdentity;
  problemId: string;
  hypothesisSemanticDigest: string;
  intendedEffectDigest: string;
  /** Relevant resource epochs at last attempt (scope -> epoch). */
  resourceEpochs: Record<string, number>;
  /** Global epoch at last attempt (fallback for scope-less strategies). */
  globalEpoch: number;
  evidenceBasisDigest: string;
  attempts: number;
  lastAttemptAt: number;
  failed: boolean;
}

/**
 * Strategy guard (AC-25/AC-26/AC-29).
 *
 * - Retry requires MATERIAL change (relevant state, hypothesis, repair,
 *   user instruction, capability) — never mere evidence-count growth.
 * - Strategy identity is semantic/canonical (secrets redacted): trivial
 *   rewording does not bypass anti-loop protection.
 * - State epochs are resource-scoped: unrelated changes do not unlock retry.
 */
export class StrategyGuard {
  private globalEpoch = 0;
  private readonly resourceEpochs = new Map<string, number>();
  private readonly strategies = new Map<string, RecordedStrategy>();

  advanceEpoch(reason?: string): number {
    this.globalEpoch += 1;
    return this.globalEpoch;
  }

  /** Advance a resource-scoped epoch (AC-29). Unrelated scopes stay put. */
  advanceResourceEpoch(scope: string): number {
    const next = (this.resourceEpochs.get(scope) ?? 0) + 1;
    this.resourceEpochs.set(scope, next);
    this.globalEpoch += 1;
    return next;
  }

  getEpoch(): number {
    return this.globalEpoch;
  }

  getResourceEpochs(): Record<string, number> {
    return Object.fromEntries(this.resourceEpochs.entries());
  }

  getResourceEpoch(scope: string): number {
    return this.resourceEpochs.get(scope) ?? 0;
  }

  /** Relevant scopes for a problem/strategy (explicit resource + problem target). */
  relevantScopes(activeProblem: ProblemState, input?: StrategyCheckInput): string[] {
    const scopes = new Set<string>();
    const target = (activeProblem as { repairTarget?: { resourceId?: string; kind?: string } }).repairTarget;
    if (target?.resourceId) scopes.add(target.resourceId);
    if (target?.kind && target.kind !== 'unknown') scopes.add(target.kind);
    const paramScope = input?.params?.['resourceScope'] ?? input?.params?.['resourceId'];
    if (typeof paramScope === 'string' && paramScope) scopes.add(paramScope);
    return [...scopes];
  }

  evaluate(
    input: StrategyCheckInput,
    activeProblem: ProblemState,
    evidenceCountOrContext: number | StrategyUnlockContext = 0,
    legacyEvidenceCount = 0,
  ): StrategyVerdict {
    const ctx = this.normalizeContext(evidenceCountOrContext, legacyEvidenceCount);
    const identity = this.buildIdentity(input, activeProblem, ctx);
    const fingerprint = sha256(
      [identity.problemFingerprint, identity.hypothesisSemanticDigest, identity.intendedEffectDigest, identity.relevantStateDigest, identity.evidenceBasisDigest].join('|'),
    );

    const recorded = this.strategies.get(fingerprint);
    if (recorded) {
      const unlock = this.materialUnlock(recorded, ctx, activeProblem);
      if (!unlock.unlocked) {
        recorded.attempts += 1;
        recorded.lastAttemptAt = Date.now();
        return {
          allowed: false,
          strategyFingerprint: fingerprint,
          semanticDuplicate: true,
          reason:
            `STRATEGY LOOP BLOCKED: You are repeating the same strategy ("${this.describeIntendedEffect(input)}") ` +
            `for unresolved problem ${activeProblem.id} without any material change ` +
            `(relevant state unchanged; hypothesis unchanged; no decision-changing evidence; no repair applied). ` +
            `Form a materially different hypothesis or mutate the controllable repair target before retrying. ` +
            `Adding more observations of the same state does not unlock retry.`,
        };
      }
      recorded.resourceEpochs = { ...ctx.relevantStateEpochs };
      recorded.globalEpoch = this.globalEpoch;
      recorded.evidenceBasisDigest = identity.evidenceBasisDigest;
      recorded.attempts += 1;
      recorded.lastAttemptAt = Date.now();
      return { allowed: true, strategyFingerprint: fingerprint };
    }

    // Semantic-duplicate sweep: a differently-worded but semantically
    // identical strategy under the same problem must not bypass the guard.
    for (const existing of this.strategies.values()) {
      if (
        existing.problemId === activeProblem.id &&
        existing.hypothesisSemanticDigest === identity.hypothesisSemanticDigest &&
        existing.intendedEffectDigest === identity.intendedEffectDigest &&
        existing.identity.relevantStateDigest === identity.relevantStateDigest &&
        existing.failed
      ) {
        const unlock = this.materialUnlock(existing, ctx, activeProblem);
        if (!unlock.unlocked) {
          existing.attempts += 1;
          existing.lastAttemptAt = Date.now();
          return {
            allowed: false,
            strategyFingerprint: existing.fingerprint,
            semanticDuplicate: true,
            reason:
              `STRATEGY LOOP BLOCKED (semantic duplicate): "${this.describeIntendedEffect(input)}" is semantically equivalent to a ` +
              `previously failed strategy for problem ${activeProblem.id} with no material change. ` +
              `Rewording does not bypass anti-loop protection — change the hypothesis, target, or relevant state.`,
          };
        }
      }
    }

    this.strategies.set(fingerprint, {
      fingerprint,
      identity,
      problemId: activeProblem.id,
      hypothesisSemanticDigest: identity.hypothesisSemanticDigest,
      intendedEffectDigest: identity.intendedEffectDigest,
      resourceEpochs: { ...ctx.relevantStateEpochs },
      globalEpoch: this.globalEpoch,
      evidenceBasisDigest: identity.evidenceBasisDigest,
      attempts: 1,
      lastAttemptAt: Date.now(),
      failed: false,
    });

    return { allowed: true, strategyFingerprint: fingerprint };
  }

  /** Mark a strategy outcome (failed strategies stay blocked until material change). */
  markOutcome(fingerprint: string | undefined, failed: boolean): void {
    if (!fingerprint) return;
    const rec = this.strategies.get(fingerprint);
    if (rec) rec.failed = failed;
  }

  buildIdentity(
    input: StrategyCheckInput,
    activeProblem: ProblemState,
    ctx?: StrategyUnlockContext,
  ): StrategyIdentity {
    const hypStatement =
      input.hypothesisStatement ??
      activeProblem.hypotheses.find((h) => h.id === activeProblem.activeHypothesisId)?.statement ??
      activeProblem.activeHypothesisId ??
      'no-hypothesis';
    const intendedEffect = this.describeIntendedEffect(input);
    const relevantScopes = this.relevantScopes(activeProblem, input);
    const relevantEpochs = relevantScopes.map((s) => `${s}@${this.resourceEpochs.get(s) ?? 0}`).join(',');
    const evidenceBasis =
      ctx?.evidenceImpacts?.filter((e) => e.material).map((e) => e.evidenceId).join(',') ??
      input.evidenceBasisDigest ??
      activeProblem.evidenceIds.join(',');
    return {
      problemFingerprint: activeProblem.fingerprint,
      hypothesisSemanticDigest: semanticDigest(hypStatement),
      intendedEffectDigest: sha256(canonicalStatement(intendedEffect)),
      relevantStateDigest: sha256(relevantEpochs || `global@${this.globalEpoch}`),
      evidenceBasisDigest: sha256(evidenceBasis || 'no-evidence'),
    };
  }

  private normalizeContext(evidenceCountOrContext: number | StrategyUnlockContext, legacyCount: number): Required<Pick<StrategyUnlockContext, 'relevantStateEpochs'>> & StrategyUnlockContext {
    if (typeof evidenceCountOrContext === 'number') {
      // Legacy evidence-count callers: count growth alone NEVER unlocks.
      // Only resource epochs / explicit material flags unlock.
      return { relevantStateEpochs: this.getResourceEpochs() };
    }
    return {
      ...evidenceCountOrContext,
      relevantStateEpochs: evidenceCountOrContext.relevantStateEpochs ?? this.getResourceEpochs(),
    };
  }

  private materialUnlock(
    recorded: RecordedStrategy,
    ctx: StrategyUnlockContext,
    activeProblem: ProblemState,
  ): { unlocked: boolean } {
    // Explicit material signals unlock.
    if (ctx.relevantStateChanged) return { unlocked: true };
    if (ctx.hypothesisChanged) return { unlocked: true };
    if (ctx.repairApplied) return { unlocked: true };
    if (ctx.userInstructionChanged) return { unlocked: true };
    if (ctx.capabilityAvailable) return { unlocked: true };
    if (ctx.evidenceImpacts?.some((e) => e.material)) {
      // Material evidence must change hypothesis, relevant state, repair
      // decision, or expected outcome — not merely exist.
      const material = ctx.evidenceImpacts.some(
        (e) => e.material && (e.changedHypothesis || e.changedRelevantState || e.changedRepairDecision || e.changedExpectedOutcome),
      );
      if (material) return { unlocked: true };
    }
    // Relevant resource epoch change unlocks; unrelated global drift does not.
    const now = ctx.relevantStateEpochs ?? this.getResourceEpochs();
    const relevant = this.relevantScopes(activeProblem);
    for (const [scope, epoch] of Object.entries(now)) {
      if ((recorded.resourceEpochs[scope] ?? 0) < epoch) {
        // Only unlock when the changed scope is relevant to this strategy.
        if (relevant.length === 0 || relevant.includes(scope)) return { unlocked: true };
      }
    }
    // Scope-less strategies (no resource target): a global repair epoch
    // advance unlocks retry — there is no "unrelated" scope to protect.
    if (relevant.length === 0 && this.globalEpoch > recorded.globalEpoch) {
      return { unlocked: true };
    }
    // NOTE: evidence-count growth alone intentionally never unlocks.
    return { unlocked: false };
  }

  private describeIntendedEffect(input: StrategyCheckInput): string {
    return this.normalizeIntendedEffect(input);
  }

  private normalizeIntendedEffect(input: StrategyCheckInput): string {
    const tool = input.tool;
    const p = redactParams(input.params);
    if (tool === 'run_command') {
      const cmd = String(p['command'] || '').trim();
      const baseCmd = cmd.split(/\s+/).slice(0, 3).join(' ');
      return `cmd:${canonicalStatement(baseCmd)}`;
    }
    if (tool === 'browse') {
      const action = String(p['action'] || 'nav');
      const target = String(p['url'] || p['selector'] || p['text'] || '');
      return `browse:${action}:${canonicalStatement(target).slice(0, 60)}`;
    }
    if (tool === 'connection_action' || tool === 'connection_operation') {
      const conn = String(p['connectionId'] || '');
      const op = String(p['operationId'] || (p['operation'] as Record<string, unknown> | undefined)?.['id'] || '');
      return `connection:${conn}:${op}`;
    }
    if (tool === 'write_file' || tool === 'apply_edit') {
      const path = String(p['path'] || p['file'] || '');
      return `edit:${path}`;
    }
    const text = canonicalStatement(`${input.expected || ''} ${input.reason || ''}`.trim().slice(0, 80));
    void digestFields;
    return `${tool}:${text}`;
  }
}
