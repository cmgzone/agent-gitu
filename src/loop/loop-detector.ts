import type { ActionRecord } from '../types.js';

export interface LoopVerdict {
  allowed: boolean;
  reason?: string;
  attempts: number;
  priorFailures: string[];
}

export interface LoopPolicy {
  maxSameActionSameError: number;
  maxSameActionFailures: number;
  maxFileEditsWithoutEvidence: number;
}

export const DEFAULT_LOOP_POLICY: LoopPolicy = {
  maxSameActionSameError: 2,
  maxSameActionFailures: 3,
  maxFileEditsWithoutEvidence: 3,
};

export class LoopDetector {
  private readonly policy: LoopPolicy;

  constructor(policy: Partial<LoopPolicy> = {}) {
    this.policy = { ...DEFAULT_LOOP_POLICY, ...policy };
  }

  evaluate(actions: ActionRecord[], tool: string, paramsHash: string, errorSig: string | undefined): LoopVerdict {
    const sameAction = actions.filter((a) => a.tool === tool && a.paramsHash === paramsHash);
    const failures = sameAction.filter((a) => a.status === 'error' || a.status === 'blocked');
    const priorFailures = failures.map(
      (a) => `- ${a.paramsSummary} → ${a.observation ? a.observation.slice(0, 200) : a.status}`,
    );

    if (errorSig) {
      const sameError = failures.filter((a) => a.errorSignature === errorSig);
      if (sameError.length >= this.policy.maxSameActionSameError) {
        return {
          allowed: false,
          attempts: sameAction.length,
          priorFailures,
          reason:
            `Action failed ${sameError.length}× with the same error signature. ` +
            `Repeating it is blocked. Form a new hypothesis or reduce scope.`,
        };
      }
    } else {
      const sigCounts = new Map<string, number>();
      for (const f of failures) {
        if (f.errorSignature) sigCounts.set(f.errorSignature, (sigCounts.get(f.errorSignature) ?? 0) + 1);
      }
      for (const [sig, count] of sigCounts) {
        if (count >= this.policy.maxSameActionSameError) {
          return {
            allowed: false,
            attempts: sameAction.length,
            priorFailures,
            reason:
              `Action failed ${count}× with the same error signature (${sig}). ` +
              `Repeating it is blocked. Form a new hypothesis or reduce scope.`,
          };
        }
      }
    }

    if (failures.length >= this.policy.maxSameActionFailures) {
      return {
        allowed: false,
        attempts: sameAction.length,
        priorFailures,
        reason:
          `Action failed ${failures.length}× (across ${sameAction.length} attempts). ` +
          `It is now hard-blocked. Choose a different approach.`,
      };
    }

    return { allowed: true, attempts: sameAction.length, priorFailures };
  }

  fileEditPressure(actions: ActionRecord[], evidenceCount: number, file: string): { blocked: boolean; edits: number } {
    const editsSinceEvidence = actions.filter((a) => {
      if (a.tool !== 'write_file' && a.tool !== 'apply_edit') return false;
      return a.paramsSummary.includes(file) && a.status === 'success';
    });
    const edits = editsSinceEvidence.length;
    return { blocked: evidenceCount === 0 && edits >= this.policy.maxFileEditsWithoutEvidence, edits };
  }

  static summarizeBlock(verdict: LoopVerdict): string {
    return [
      'LOOP PREVENTION: action blocked.',
      verdict.reason ?? '',
      verdict.priorFailures.length > 0 ? 'Previous attempts:' : '',
      ...verdict.priorFailures,
      'You must propose a different action with a new hypothesis, or mark the step blocked.',
    ]
      .filter(Boolean)
      .join('\n');
  }
}
