import type { ProblemState } from './problem-state.js';
import { sha256 } from '../util.js';

export interface StrategyCheckInput {
  tool: string;
  params?: Record<string, unknown>;
  reason?: string;
  expected?: string;
}

export interface StrategyVerdict {
  allowed: boolean;
  reason?: string;
  strategyFingerprint?: string;
}

interface RecordedStrategy {
  fingerprint: string;
  problemId: string;
  hypothesisId?: string;
  intendedEffect: string;
  stateEpoch: number;
  evidenceCount: number;
  attempts: number;
  lastAttemptAt: number;
}

export class StrategyGuard {
  private stateEpoch = 0;
  private readonly strategies = new Map<string, RecordedStrategy>();

  advanceEpoch(reason?: string): number {
    this.stateEpoch += 1;
    return this.stateEpoch;
  }

  getEpoch(): number {
    return this.stateEpoch;
  }

  evaluate(
    input: StrategyCheckInput,
    activeProblem: ProblemState,
    evidenceCount: number,
  ): StrategyVerdict {
    const intendedEffect = this.normalizeIntendedEffect(input);
    const hypothesisId = activeProblem.activeHypothesisId || 'no-hypothesis';
    const strategyKey = `${activeProblem.id}:${hypothesisId}:${intendedEffect}`;
    const fingerprint = sha256(strategyKey);

    const recorded = this.strategies.get(fingerprint);

    if (recorded) {
      // Check if meaningful state or evidence has advanced
      const stateChanged = this.stateEpoch > recorded.stateEpoch;
      const evidenceChanged = evidenceCount > recorded.evidenceCount;

      if (!stateChanged && !evidenceChanged) {
        recorded.attempts += 1;
        recorded.lastAttemptAt = Date.now();
        return {
          allowed: false,
          strategyFingerprint: fingerprint,
          reason:
            `STRATEGY LOOP BLOCKED: You are repeating the same strategy ("${intendedEffect}") ` +
            `for unresolved problem ${activeProblem.id} under hypothesis "${hypothesisId}" without any ` +
            `material state change (state epoch ${this.stateEpoch}) or new evidence. ` +
            `Form a new hypothesis (set_hypothesis) or mutate the controllable repair surface before retrying.`,
        };
      }

      // State or evidence changed: update the record and allow
      recorded.stateEpoch = this.stateEpoch;
      recorded.evidenceCount = evidenceCount;
      recorded.attempts += 1;
      recorded.lastAttemptAt = Date.now();
      return { allowed: true, strategyFingerprint: fingerprint };
    }

    // First time seeing this strategy under this problem & hypothesis
    this.strategies.set(fingerprint, {
      fingerprint,
      problemId: activeProblem.id,
      hypothesisId,
      intendedEffect,
      stateEpoch: this.stateEpoch,
      evidenceCount,
      attempts: 1,
      lastAttemptAt: Date.now(),
    });

    return { allowed: true, strategyFingerprint: fingerprint };
  }

  private normalizeIntendedEffect(input: StrategyCheckInput): string {
    const tool = input.tool;
    const p = input.params || {};

    if (tool === 'run_command') {
      const cmd = String(p['command'] || '').trim();
      // Normalize generic probes (e.g. curl /api/auth/*)
      const baseCmd = cmd.split(/\s+/).slice(0, 3).join(' ');
      return `cmd:${baseCmd}`;
    }

    if (tool === 'browse') {
      const action = String(p['action'] || 'nav');
      const target = String(p['url'] || p['selector'] || p['text'] || '');
      return `browse:${action}:${target.slice(0, 40)}`;
    }

    if (tool === 'connection_action' || tool === 'connection_operation') {
      const conn = String(p['connectionId'] || '');
      const op = String(p['operationId'] || '');
      return `connection:${conn}:${op}`;
    }

    if (tool === 'write_file' || tool === 'apply_edit') {
      const path = String(p['path'] || p['file'] || '');
      return `edit:${path}`;
    }

    return `${tool}:${(input.expected || input.reason || '').slice(0, 40)}`;
  }
}
