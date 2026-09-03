import type {
  DiagnosisDecision,
  ProblemState,
  RepairSurface,
} from './problem-state.js';

export interface VoiCheckResult {
  allowed: boolean;
  reason?: string;
}

export class DiagnosisController {
  evaluate(problem: ProblemState): DiagnosisDecision {
    // If an explicit diagnosis was already set, respect it
    if (problem.diagnosis && problem.diagnosis.rootCauseKnown && problem.diagnosis.confidence >= 0.8) {
      return problem.diagnosis;
    }

    // Check active hypothesis
    const activeHyp = problem.hypotheses.find((h) => h.id === problem.activeHypothesisId) ||
      problem.hypotheses[problem.hypotheses.length - 1];

    if (!activeHyp) {
      return {
        rootCauseKnown: false,
        confidence: 0,
        repairKnown: false,
        missingEvidence: ['Formulate a hypothesis (set_hypothesis) explaining why the contradiction occurred.'],
        nextMode: 'investigate',
      };
    }

    // Hypothesis supported by evidence or multiple matching observations
    const hasSupportingEvidence = activeHyp.supportingEvidence.length > 0 || (activeHyp.confidence !== undefined && activeHyp.confidence >= 0.8);
    const hasContradiction = activeHyp.contradictingEvidence.length > 0;

    if (activeHyp.status === 'supported' || (hasSupportingEvidence && !hasContradiction)) {
      const surface = activeHyp.suggestedSurface || problem.repairSurface || 'repository';
      return {
        rootCauseKnown: true,
        confidence: activeHyp.confidence ?? 0.85,
        repairKnown: true,
        repairSurface: surface,
        repairTarget: surface,
        nextMode: 'repair',
      };
    }

    if (activeHyp.status === 'rejected') {
      return {
        rootCauseKnown: false,
        confidence: 0.1,
        repairKnown: false,
        missingEvidence: ['Previous hypothesis was disproved. Formulate a NEW hypothesis.'],
        nextMode: 'investigate',
      };
    }

    return {
      rootCauseKnown: false,
      confidence: activeHyp.confidence ?? 0.5,
      repairKnown: false,
      missingEvidence: ['Verify or disprove the active hypothesis with minimal investigation.'],
      nextMode: 'investigate',
    };
  }

  checkValueOflnformation(
    action: { tool: string; params?: Record<string, unknown>; reason?: string },
    problem: ProblemState,
  ): VoiCheckResult {
    // VOI applies when problem is in 'repairing' mode or diagnosis indicates root cause is known
    if (problem.status !== 'repairing' && (!problem.diagnosis || problem.diagnosis.nextMode !== 'repair')) {
      return { allowed: true };
    }

    const tool = action.tool;
    const isExploratory = tool === 'read_file' || tool === 'search' || tool === 'list_dir' || tool === 'grep_search' || tool === 'find_by_name';
    if (!isExploratory) {
      return { allowed: true };
    }

    // Allow read-before-edit if the file matches the repair target or explicitly justified
    const filePath = String(action.params?.['path'] || action.params?.['file'] || '');
    const repairTarget = problem.diagnosis?.repairTarget || '';
    if (tool === 'read_file' && repairTarget && filePath.includes(repairTarget)) {
      return { allowed: true };
    }

    // If the reason explicitly explains a decision-critical question, allow once
    const reason = (action.reason || '').toLowerCase();
    if (reason.includes('decision') || reason.includes('verify exact syntax before edit') || reason.includes('inspect region to edit')) {
      return { allowed: true };
    }

    // Otherwise, suppress redundant investigation in repair mode
    return {
      allowed: false,
      reason:
        `VALUE-OF-INFORMATION GUARD: Root cause is already diagnosed (${problem.diagnosis?.repairSurface || 'known'}). ` +
        `Repeated exploratory reads/searches do not change the repair decision. Proceed directly to repair (${problem.repairSurface || 'corrective action'}), or explain what decision this read changes.`,
    };
  }
}
