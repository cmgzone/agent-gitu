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
  /** Successful investigation calls against unchanged evidence are useful
   * once or twice; beyond that they are usually context drift, not progress. */
  maxSameSuccessfulRead: number;
}

export const DEFAULT_LOOP_POLICY: LoopPolicy = {
  maxSameActionSameError: 2,
  maxSameActionFailures: 3,
  maxFileEditsWithoutEvidence: 3,
  maxSameSuccessfulRead: 2,
};

/** Prefix used on the one host-side cached replay of unchanged investigation
 * evidence. A second request after the replay is hard-blocked as drift. */
export const CACHED_INVESTIGATION_PREFIX = 'CACHED INVESTIGATION OBSERVATION';

const INVESTIGATION_READ_TOOLS = new Set([
  'read_file',
  'search_files',
  'list_files',
  'lsp_diagnostics',
  'lsp_definition',
  'lsp_references',
  'lsp_hover',
  'lsp_symbols',
]);

function isSuccessfulMutation(action: ActionRecord): boolean {
  return action.status === 'success' && (action.tool === 'write_file' || action.tool === 'apply_edit');
}

function isCachedInvestigation(action: ActionRecord): boolean {
  return action.status === 'success' && Boolean(action.observation?.startsWith(CACHED_INVESTIGATION_PREFIX));
}

/**
 * Investigation evidence becomes stale after a relevant edit. For read_file,
 * reset only when that file changed; for broader search/LSP/list evidence,
 * conservatively reset after any successful source edit.
 */
function evidenceWindow(actions: ActionRecord[], tool: string, paramsHash: string): ActionRecord[] {
  if (!INVESTIGATION_READ_TOOLS.has(tool)) return actions;

  const priorSame = actions.filter((action) => action.tool === tool && action.paramsHash === paramsHash);
  if (tool === 'read_file' && priorSame.length > 0) {
    const summary = priorSame.at(-1)?.paramsSummary ?? '';
    const file = summary.startsWith('read ') ? summary.slice('read '.length) : '';
    if (file) {
      for (let i = actions.length - 1; i >= 0; i -= 1) {
        const action = actions[i]!;
        if (!isSuccessfulMutation(action)) continue;
        if (action.paramsSummary === `write ${file}` || action.paramsSummary === `edit ${file}`) {
          return actions.slice(i + 1);
        }
      }
      return actions;
    }
  }

  for (let i = actions.length - 1; i >= 0; i -= 1) {
    if (isSuccessfulMutation(actions[i]!)) return actions.slice(i + 1);
  }
  return actions;
}

export class LoopDetector {
  private readonly policy: LoopPolicy;

  constructor(policy: Partial<LoopPolicy> = {}) {
    this.policy = { ...DEFAULT_LOOP_POLICY, ...policy };
  }

  /**
   * Return the most recent real successful observation when the model has
   * already gathered the same unchanged investigation evidence enough times.
   * The executor may replay this observation ONCE without touching the
   * filesystem/LSP again. Once such a cached replay is recorded, this method
   * returns undefined and evaluate() hard-blocks further repetition.
   */
  reusableSuccessfulRead(actions: ActionRecord[], tool: string, paramsHash: string): ActionRecord | undefined {
    if (!INVESTIGATION_READ_TOOLS.has(tool)) return undefined;
    const sameAction = evidenceWindow(actions, tool, paramsHash).filter((a) => a.tool === tool && a.paramsHash === paramsHash);
    const cachedReplayExists = sameAction.some(isCachedInvestigation);
    if (cachedReplayExists) return undefined;
    const realSuccesses = sameAction.filter((a) => a.status === 'success' && !isCachedInvestigation(a));
    return realSuccesses.length >= this.policy.maxSameSuccessfulRead ? realSuccesses.at(-1) : undefined;
  }

  evaluate(actions: ActionRecord[], tool: string, paramsHash: string, errorSig: string | undefined): LoopVerdict {
    const relevantActions = evidenceWindow(actions, tool, paramsHash);
    const sameAction = relevantActions.filter((a) => a.tool === tool && a.paramsHash === paramsHash);
    const failures = sameAction.filter((a) => a.status === 'error' || a.status === 'blocked');
    const priorFailures = failures.map(
      (a) => `- ${a.paramsSummary} → ${a.observation ? a.observation.slice(0, 200) : a.status}`,
    );

    if (INVESTIGATION_READ_TOOLS.has(tool)) {
      const successfulReads = sameAction.filter((a) => a.status === 'success');
      if (successfulReads.length >= this.policy.maxSameSuccessfulRead) {
        return {
          allowed: false,
          attempts: sameAction.length,
          priorFailures,
          reason:
            `The same investigation evidence already succeeded ${successfulReads.length}× without a relevant source change. ` +
            `Use the existing observation, inspect a genuinely different region/question, or edit/verify before rereading it.`,
        };
      }
    }

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
