import type { ActionRecord } from '../types.js';
import { normalizeToolPath } from '../util.js';

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
  /** Tighten duplicate-read handling after a still-unresolved command failure.
   * Fresh line ranges and questions remain available for diagnosis. */
  maxInvestigationReadsPerFailureEpisode: number;
}

export const DEFAULT_LOOP_POLICY: LoopPolicy = {
  maxSameActionSameError: 2,
  maxSameActionFailures: 3,
  maxFileEditsWithoutEvidence: 3,
  maxSameSuccessfulRead: 2,
  maxInvestigationReadsPerFailureEpisode: 10,
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

function differentApproach(tool: string): string {
  return tool === 'run_command'
    ? 'Inspect the previous output, run a narrower test case or a different verification command, make a targeted repair, or move to the next validation step. A successful source edit permits re-verifying this command.'
    : 'Form a new hypothesis or reduce scope.';
}

function lastMatchingIndex(actions: ActionRecord[], matches: (action: ActionRecord) => boolean): number {
  for (let i = actions.length - 1; i >= 0; i -= 1) {
    if (matches(actions[i]!)) return i;
  }
  return -1;
}

function isSuccessfulMutation(action: ActionRecord): boolean {
  return action.status === 'success' && (action.tool === 'write_file' || action.tool === 'apply_edit');
}

function isCachedInvestigation(action: ActionRecord): boolean {
  return action.status === 'success' && Boolean(action.observation?.startsWith(CACHED_INVESTIGATION_PREFIX));
}

/**
 * Find the newest command failure that still has no later PASS for the exact
 * same command identity. A successful diagnostic command with a different hash
 * does NOT resolve the failing test/build command. If source was edited after
 * the failure, begin the investigation count after that edit so a repair gets a
 * fresh local-inspection allowance before re-verification.
 */
function unresolvedFailureEpisodeStart(actions: ActionRecord[]): number | undefined {
  for (let failureIndex = actions.length - 1; failureIndex >= 0; failureIndex -= 1) {
    const failure = actions[failureIndex]!;
    if (failure.tool !== 'run_command' || failure.status !== 'error') continue;

    const resolvedLater = actions
      .slice(failureIndex + 1)
      .some(
        (candidate) =>
          candidate.tool === 'run_command' &&
          candidate.paramsHash === failure.paramsHash &&
          candidate.status === 'success' &&
          // A command only resolves a failure episode if it actually exited 0: a
          // command that is still running (or that never reported an exit status)
          // has not proven anything about the failure.
          candidate.exitCode === 0,
      );
    if (resolvedLater) continue;

    let start = failureIndex;
    for (let i = failureIndex + 1; i < actions.length; i += 1) {
      if (isSuccessfulMutation(actions[i]!)) start = i;
    }
    return start;
  }
  return undefined;
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
      // Compare CANONICAL paths: the read summary carries the raw path
      // spelling while identity hashing canonicalizes it (./ prefix,
      // backslashes). An apply_edit on './src/a.ts' must still reset the
      // window for reads of 'src/a.ts'.
      const readPath = normalizeToolPath(file);
      for (let i = actions.length - 1; i >= 0; i -= 1) {
        const action = actions[i]!;
        if (!isSuccessfulMutation(action)) continue;
        const s = action.paramsSummary;
        const writtenPath = s.startsWith('write ')
          ? normalizeToolPath(s.slice('write '.length))
          : s.startsWith('edit ')
            ? normalizeToolPath(s.slice('edit '.length))
            : '';
        if (writtenPath && writtenPath === readPath) {
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
  reusableSuccessfulRead(actions: ActionRecord[], tool: string, paramsHash: string, contextFingerprint?: string): ActionRecord | undefined {
    if (tool !== 'read_file' || !contextFingerprint) return undefined;
    const sameAction = evidenceWindow(actions, tool, paramsHash).filter(
      (a) => a.tool === tool && a.paramsHash === paramsHash && a.contextFingerprint === contextFingerprint,
    );
    const cachedReplayExists = sameAction.some(isCachedInvestigation);
    if (cachedReplayExists) return undefined;
    const realSuccesses = sameAction.filter((a) => a.status === 'success' && !isCachedInvestigation(a) && a.readObservationComplete !== false && Boolean(a.observation));
    return realSuccesses.length >= this.policy.maxSameSuccessfulRead ? realSuccesses.at(-1) : undefined;
  }

  /** Number of successful investigation reads spent on the newest unresolved
   * command failure since its last source edit. Undefined means no unresolved
   * failing command currently owns the investigation lane. */
  investigationPressure(actions: ActionRecord[]): { reads: number; failure?: ActionRecord } | undefined {
    const start = unresolvedFailureEpisodeStart(actions);
    if (start === undefined) return undefined;
    const failure = [...actions.slice(0, start + 1)].reverse().find((action) => action.tool === 'run_command' && action.status === 'error');
    const reads = actions.slice(start + 1).filter((action) => INVESTIGATION_READ_TOOLS.has(action.tool) && action.status === 'success' && !isCachedInvestigation(action)).length;
    return { reads, failure };
  }

  evaluate(actions: ActionRecord[], tool: string, paramsHash: string, errorSig: string | undefined, contextFingerprint?: string, refreshRead = false): LoopVerdict {
    const relevantActions = evidenceWindow(actions, tool, paramsHash);
    const sameAction = relevantActions.filter((a) => a.tool === tool && a.paramsHash === paramsHash);
    // A PASS resolves the failure episode for this exact action. A successful
    // source edit also gives a failing command a fresh verification chance.
    // Keep the full window for successful-read thrift; guard rejections are
    // not executions and cannot increase the failure count.
    const latestEdit = tool === 'run_command' ? lastMatchingIndex(relevantActions, isSuccessfulMutation) : -1;
    const sameActionSinceEdit = relevantActions.slice(latestEdit + 1).filter((a) => a.tool === tool && a.paramsHash === paramsHash);
    const latestSuccess = lastMatchingIndex(sameActionSinceEdit, (a) => a.status === 'success');
    const failureEpisode = sameActionSinceEdit.slice(latestSuccess + 1);
    const failures = failureEpisode.filter((a) => a.status === 'error' && !a.observation?.startsWith('LOOP PREVENTION:'));
    const priorFailures = failures.map(
      (a) => `- ${a.paramsSummary} → ${a.observation ? a.observation.slice(0, 200) : a.status}`,
    );

    if (INVESTIGATION_READ_TOOLS.has(tool)) {
      if (tool === 'read_file' && refreshRead && contextFingerprint) {
        const lastProgress = lastMatchingIndex(relevantActions, (a) => a.status === 'success' && (a.tool === 'run_command' || isSuccessfulMutation(a)));
        const alreadyRefreshed = relevantActions.slice(lastProgress + 1).some(
          (a) => a.tool === 'read_file' && a.paramsHash === paramsHash && a.contextFingerprint === contextFingerprint && a.readRefresh && a.status === 'success',
        );
        if (alreadyRefreshed) {
          return {
            allowed: false,
            attempts: sameAction.length,
            priorFailures,
            reason: 'An explicit fresh read already confirmed this exact request and file version since the last edit or successful command. Use that result until there is new work to verify.',
          };
        }
      }
      // A repeated read is only redundant when its earlier observation is
      // complete, the exact requested range matches, and the file is still
      // the same version. Search/LSP/list calls do not carry this context.
      const successfulReads = tool === 'read_file' && contextFingerprint
        ? sameAction.filter((a) => a.status === 'success' && a.contextFingerprint === contextFingerprint && a.readObservationComplete !== false && Boolean(a.observation))
        : [];
      const pressure = this.investigationPressure(actions);
      if (!refreshRead && pressure && pressure.reads >= this.policy.maxInvestigationReadsPerFailureEpisode && successfulReads.length > 0) {
        return {
          allowed: false,
          attempts: sameAction.length,
          priorFailures,
          reason:
            `The exact read request already succeeded for this file version. ${pressure.reads} real investigation reads followed the current verification failure. ` +
            `Use the recorded observation or request a different line range to answer a new question.`,
        };
      }
      if (!refreshRead && successfulReads.length >= this.policy.maxSameSuccessfulRead) {
        return {
          allowed: false,
          attempts: sameAction.length,
          priorFailures,
          reason:
            `The exact read request already succeeded ${successfulReads.length}× for this file version. ` +
            `Use the existing observation, request a different region, or set refresh:true once for a deliberate fresh confirmation.`,
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
            `Repeating it is blocked. ${differentApproach(tool)}`,
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
              `Repeating it is blocked. ${differentApproach(tool)}`,
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
          `Action failed ${failures.length}× (across ${failureEpisode.length} attempts). ` +
          `It is now hard-blocked. Choose a different approach. ${differentApproach(tool)}`,
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
