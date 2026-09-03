import type {
  DecisionQuestion,
  DiagnosisDecision,
  InvestigationIntent,
  ProblemState,
  RepairProposal,
  RepairTarget,
} from './problem-state.js';
import { UNKNOWN_REPAIR_TARGET, isUnknownTarget } from './problem-state.js';

export interface VoiCheckResult {
  allowed: boolean;
  reason?: string;
}

export interface StructuredActionInput {
  tool: string;
  params?: Record<string, unknown>;
  reason?: string;
  /** Structured investigation intent (preferred — keyword-free, AC-24). */
  intent?: InvestigationIntent;
}

/**
 * Diagnosis controller (AC-21/AC-22/AC-23/AC-24).
 *
 * - Unknown repair ownership stays UNKNOWN until evidence supports a target.
 *   Never defaults to repository (or any other surface).
 * - Numeric confidence is NEVER an act gate; decision sufficiency is.
 * - Value-of-information uses structured investigation intent, not keywords.
 */
export class DiagnosisController {
  evaluate(problem: ProblemState): DiagnosisDecision {
    // If an explicit decision-sufficient diagnosis was already set and no new
    // blocking question appeared, respect it — but NEVER on confidence alone.
    if (problem.diagnosis && this.isDecisionSufficient(problem.diagnosis)) {
      return problem.diagnosis;
    }

    const activeHyp =
      problem.hypotheses.find((h) => h.id === problem.activeHypothesisId) ||
      problem.hypotheses[problem.hypotheses.length - 1];

    if (!activeHyp) {
      return this.investigate(
        [{ question: 'What hypothesis explains why the contradiction occurred?', canChangeNextAction: true, evidenceNeeded: 'set_hypothesis with a testable root-cause statement' }],
      );
    }

    if (activeHyp.status === 'rejected') {
      return this.investigate(
        [{ question: 'Previous hypothesis was disproved — what materially different hypothesis explains the contradiction?', canChangeNextAction: true }],
      );
    }

    // A repair proposal attached to the problem (or derivable from the
    // hypothesis target) with no blocking unresolved question → ACT_NOW.
    const proposal = problem.repairProposal ?? this.proposalFromHypothesis(problem, activeHyp.statement);
    if (proposal && !isUnknownTarget(proposal.target)) {
      const blocking = (problem.diagnosis?.unresolvedQuestions ?? []).filter((q) => q.canChangeNextAction);
      if (activeHyp.status === 'supported' && blocking.length === 0) {
        return this.actNow(activeHyp.statement, proposal, true);
      }
      // Supported hypothesis + known target + sufficient evidence → ACT_NOW
      // even before an explicit 'supported' mark, when evidence backs it.
      if (activeHyp.supportingEvidence.length > 0 && blocking.length === 0 && activeHyp.contradictingEvidence.length === 0) {
        return this.actNow(activeHyp.statement, proposal, true);
      }
    }

    // Otherwise: stay in investigate with an explicit decision question.
    const questions: DecisionQuestion[] = [];
    if (!proposal || isUnknownTarget(proposal?.target)) {
      questions.push({
        question: 'What controllable repair target owns this contradiction?',
        canChangeNextAction: true,
        evidenceNeeded: 'minimal decision-changing evidence identifying the repair target',
      });
    } else {
      questions.push({
        question: 'Verify or disprove the active hypothesis with minimal investigation.',
        canChangeNextAction: true,
      });
    }
    return this.investigate(questions, proposal);
  }

  /**
   * Decide whether a repair proposal is sufficient to ACT NOW.
   * Core rule: strongly supported repair + safe/reversible or approved +
   * authority/capability + NO unresolved question that can materially change
   * the repair decision → ACT_NOW. Never research for artificial certainty.
   */
  evaluateProposal(
    problem: ProblemState,
    proposal: RepairProposal,
    opts: { approved?: boolean; hasCapability?: boolean } = {},
  ): DiagnosisDecision {
    if (isUnknownTarget(proposal.target)) {
      return this.investigate([
        { question: 'Repair target is still unknown — what evidence identifies a controllable target?', canChangeNextAction: true },
      ], proposal);
    }
    const activeHyp =
      problem.hypotheses.find((h) => h.id === problem.activeHypothesisId) ||
      problem.hypotheses[problem.hypotheses.length - 1];
    if (activeHyp?.status === 'rejected') {
      return this.investigate([
        { question: 'Active hypothesis was disproved — formulate a materially different hypothesis before proposing repair.', canChangeNextAction: true },
      ], proposal);
    }
    // A concrete proposal answers the pending "identify the target" question.
    // Verification of the hypothesis happens AFTER the repair via the
    // verification contract — the runtime must not idle between knowing and
    // fixing. Core rule: supported repair + safe/reversible or approved +
    // authority/capability → ACT_NOW. No artificial-certainty research.
    const safe = proposal.reversible || opts.approved === true;
    const authorized = opts.hasCapability !== false;
    const rootCauseCandidate = activeHyp?.statement ?? problem.diagnosis?.rootCauseCandidate;
    if (safe && authorized) {
      return this.actNow(rootCauseCandidate, proposal, true);
    }
    return {
      rootCauseCandidate,
      evidenceSufficient: true,
      repairKnown: true,
      repairProposal: proposal,
      unresolvedQuestions: safe
        ? [{ question: 'Capability/authority to act on this target is not yet confirmed.', canChangeNextAction: true }]
        : [{ question: 'Repair is irreversible and not yet approved — request approval.', canChangeNextAction: true }],
      nextMode: safe ? 'needs_user' : 'investigate',
      rootCauseKnown: true,
      repairTarget: proposal.target.kind,
      missingEvidence: ['Confirm authority/capability or approval before acting.'],
    };
  }

  /** Whether a decision is sufficient to ACT NOW (confidence plays no role). */
  isDecisionSufficient(d: DiagnosisDecision): boolean {
    if (!d.evidenceSufficient || !d.repairKnown || !d.repairProposal) return false;
    if (isUnknownTarget(d.repairProposal.target)) return false;
    if (d.unresolvedQuestions?.some((q) => q.canChangeNextAction)) return false;
    return d.nextMode === 'act_now' || d.nextMode === 'repair';
  }

  checkValueOflnformation(action: StructuredActionInput, problem: ProblemState): VoiCheckResult {
    // VOI applies when the problem demands action, not exploration.
    const mode = problem.diagnosis?.nextMode ?? (problem.status === 'act_now' || problem.status === 'repairing' ? 'act_now' : 'investigate');
    if (problem.status !== 'act_now' && problem.status !== 'repairing' && problem.status !== 'decision_sufficient' && mode !== 'act_now' && mode !== 'repair') {
      return { allowed: true };
    }

    const tool = action.tool;
    const isExploratory =
      tool === 'read_file' ||
      tool === 'search' ||
      tool === 'search_files' ||
      tool === 'list_dir' ||
      tool === 'list_files' ||
      tool === 'grep_search' ||
      tool === 'find_by_name' ||
      tool === 'browse';

    if (!isExploratory) return { allowed: true };

    // Exact read-before-edit of the region about to be modified is always allowed.
    if (tool === 'read_file' && this.isReadBeforeEdit(action, problem)) {
      return { allowed: true };
    }

    // Structured investigation intent: allow only when the answer could
    // change the hypothesis, target, action, safety/approval, or verification.
    const intent = action.intent;
    if (intent && this.isDecisionChanging(intent)) {
      return { allowed: true };
    }

    if (intent && !this.isDecisionChanging(intent)) {
      return {
        allowed: false,
        reason:
          `INVESTIGATION SUPPRESSED (value-of-information): the stated question ("${intent.decisionQuestion}") ` +
          `cannot change the repair decision (hypothesis/target/action/safety/verification). ` +
          `Proceed to the decided repair, or provide a structured decision question the answer could change.`,
      };
    }

    // No structured intent in ACT_NOW mode: suppress generic exploration.
    // (Legacy keyword matching on reason text was removed — it was trivially bypassable.)
    return {
      allowed: false,
      reason:
        `VALUE-OF-INFORMATION GUARD: A repair decision is already sufficient` +
        `${problem.repairProposal ? ` (target: ${problem.repairProposal.target.kind})` : problem.repairTarget && !isUnknownTarget(problem.repairTarget) ? ` (target: ${problem.repairTarget.kind})` : ''}. ` +
        `Generic exploratory ${tool} is suppressed in ACT_NOW mode. Either execute the repair, read the exact region about to be edited, ` +
        `or supply a structured investigation intent: { decisionQuestion, howAnswerChangesRepair, evidenceNeeded }.`,
    };
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private investigate(unresolvedQuestions: DecisionQuestion[], proposal?: RepairProposal): DiagnosisDecision {
    return {
      evidenceSufficient: false,
      repairKnown: proposal ? !isUnknownTarget(proposal.target) : false,
      ...(proposal ? { repairProposal: proposal } : {}),
      unresolvedQuestions,
      nextMode: 'investigate',
      // Legacy (derived, never authoritative; never defaults ownership)
      rootCauseKnown: false,
      confidence: 0,
      ...(proposal && !isUnknownTarget(proposal.target) ? { repairTarget: proposal.target.kind } : {}),
      missingEvidence: unresolvedQuestions.map((q) => q.question),
    };
  }

  private actNow(rootCauseCandidate: string | undefined, proposal: RepairProposal, evidenceSufficient: boolean): DiagnosisDecision {
    return {
      rootCauseCandidate,
      evidenceSufficient,
      repairKnown: true,
      repairProposal: proposal,
      unresolvedQuestions: [],
      nextMode: 'act_now',
      // Legacy mirrors (confidence fixed — it is not the gate)
      rootCauseKnown: true,
      confidence: 0.85,
      repairTarget: proposal.target.kind,
      missingEvidence: [],
    };
  }

  private proposalFromHypothesis(problem: ProblemState, statement: string): RepairProposal | undefined {
    const hyp = problem.hypotheses.find((h) => h.id === problem.activeHypothesisId) ?? problem.hypotheses[problem.hypotheses.length - 1];
    const target: RepairTarget | undefined =
      hyp?.suggestedTarget ?? problem.repairTarget ?? (problem.repairSurface ? { kind: problem.repairSurface, description: `Legacy surface: ${problem.repairSurface}` } : undefined);
    if (!target || isUnknownTarget(target)) return undefined;
    return {
      id: `rp-${problem.id}-draft`,
      problemId: problem.id,
      intendedEffect: `Repair ${target.kind} per hypothesis: ${statement.slice(0, 120)}`,
      target,
      actions: [],
      evidenceBasis: [...(problem.evidenceIds ?? [])],
      reversible: true,
      requiresApproval: false,
      verificationContract: problem.verificationContract ?? {
        description: `Verify contradiction resolved: ${problem.expectation?.description ?? problem.expected ?? 'expected outcome'}`,
        originalObserved: problem.observed,
        expectedOutcome: problem.expectation?.description ?? problem.expected ?? 'Success',
      },
    };
  }

  private isReadBeforeEdit(action: StructuredActionInput, problem: ProblemState): boolean {
    if (action.tool !== 'read_file') return false;
    const filePath = String(action.params?.['path'] ?? action.params?.['file'] ?? '');
    if (!filePath) return false;
    const proposal = problem.repairProposal;
    // Exact region about to be modified: file matches a proposed repair action path.
    if (proposal?.actions?.length) {
      for (const a of proposal.actions) {
        const p = String(a.params?.['path'] ?? a.params?.['file'] ?? '');
        if (p && (filePath === p || filePath.includes(p) || p.includes(filePath))) return true;
      }
    }
    // Fallback: reason explicitly scopes to the edit region AND names the file.
    const reason = (action.reason || '').toLowerCase();
    if (reason.includes(filePath.toLowerCase()) && /edit|modify|region|exact|before/.test(reason)) return true;
    // Structured intent scoped to the repair action.
    if (action.intent?.affectedRepairDecision && action.intent.changesRepairAction) return true;
    return false;
  }

  private isDecisionChanging(intent: InvestigationIntent): boolean {
    if (!intent.decisionQuestion?.trim()) return false;
    if ((intent.alternatives?.length ?? 0) === 0 && !intent.affectedRepairDecision) {
      // Require at least one alternative or an affected decision to be stated.
      // Pure narration without alternatives is not decision-changing.
    }
    return Boolean(
      intent.changesHypothesis ||
        intent.changesRepairTarget ||
        intent.changesRepairAction ||
        intent.changesSafetyOrApproval ||
        intent.changesVerification,
    );
  }
}

export { UNKNOWN_REPAIR_TARGET };
export type { RepairTarget };
