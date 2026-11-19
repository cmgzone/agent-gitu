import { randomUUID } from 'node:crypto';
import type { ChiefDecision, ChiefRequestKind } from '../coding/chief.js';
import { readJson, writeJson } from '../util.js';
import {
  AUTHORITY_PRESETS,
  compileCommandPrefix,
  compileStandingPattern,
  highImpactSignal,
  presetAuthorityPolicy,
  type AuthorityPolicy,
  type AuthorityPolicyPatch,
  type ChiefAuthorityPreset,
} from './authority.js';
import type { ChiefDecisionSource } from './chief.js';

/** A persisted standing answer rule matched against agent/teammate questions. */
export interface StandingAnswerRule {
  id: string;
  pattern: string;
  answer: string;
  scope?: string;
  createdAt: string;
  source?: string;
}

/** A persisted routine-command prefix rule for automatic command approval. */
export interface StandingCommandRule {
  id: string;
  prefix: string;
  scope?: string;
  createdAt: string;
  source?: string;
}

/** Persisted Chief of Staff settings shared across Coding and Cowork surfaces. */
export interface PersistedChiefSettings {
  preset: ChiefAuthorityPreset;
  /** Whether the LLM advisor may answer escalations in Coding sessions. */
  advisorEnabled: boolean;
  /** Whether the LLM advisor may answer open Cowork request cards on the user's behalf. */
  coworkQuestionAdvisor: boolean;
  /** Optional override over the active preset's `planReviews.autoReview`. */
  autoReviewPlans?: boolean;
  /** Optional override over the active preset's `planReviews.maxSteps`. */
  maxPlanSteps?: number;
  /** Optional override over the active preset's `spendFloorUsd`. */
  spendFloorUsd?: number;
  standingAnswers: StandingAnswerRule[];
  standingCommands: StandingCommandRule[];
}

/** Patch shape accepted by `ChiefStore.updateSettings`. Pass `null` to clear optional overrides. */
export interface ChiefSettingsPatch {
  preset?: ChiefAuthorityPreset;
  advisorEnabled?: boolean;
  coworkQuestionAdvisor?: boolean;
  autoReviewPlans?: boolean | null;
  maxPlanSteps?: number | null;
  spendFloorUsd?: number | null;
}

/** A persisted audit entry for a decision resolved (or escalated/revoked) by Chief of Staff. */
export interface PersistedChiefDecision {
  id: string;
  at: string;
  surface: 'coding' | 'cowork';
  source: ChiefDecisionSource;
  requestKind: ChiefRequestKind;
  requestId: string;
  summary: string;
  decision: ChiefDecision;
  scope?: Record<string, string>;
  ruleId?: string;
  revokedAt?: string;
  revokeReason?: string;
}

interface ChiefStoreDiskState {
  version: 1;
  settings: PersistedChiefSettings;
  decisions: PersistedChiefDecision[];
}

export const DEFAULT_PERSISTED_CHIEF_SETTINGS: PersistedChiefSettings = {
  preset: 'balanced',
  advisorEnabled: true,
  coworkQuestionAdvisor: false,
  standingAnswers: [],
  standingCommands: [],
};

const DEFAULT_MAX_DECISIONS = 200;

function isPreset(value: unknown): value is ChiefAuthorityPreset {
  return value === 'conservative' || value === 'balanced' || value === 'autonomous';
}

function normalizeScope(scope: string | undefined): string | undefined {
  const trimmed = scope?.trim();
  return trimmed && trimmed !== 'global' ? trimmed : undefined;
}

function normalizeSpaces(text: string): string {
  return text.trim().replace(/\s+/g, ' ');
}

function scopeMatches(ruleScope: string | undefined, activeScopes: readonly string[]): boolean {
  if (!ruleScope || ruleScope === 'global') return true;
  return activeScopes.includes(ruleScope);
}

function cloneSettings(settings: PersistedChiefSettings): PersistedChiefSettings {
  return {
    ...settings,
    standingAnswers: settings.standingAnswers.map((rule) => ({ ...rule })),
    standingCommands: settings.standingCommands.map((rule) => ({ ...rule })),
  };
}

function cloneDecision(entry: PersistedChiefDecision): PersistedChiefDecision {
  return {
    ...entry,
    decision: { ...entry.decision },
    ...(entry.scope ? { scope: { ...entry.scope } } : {}),
  };
}

function sanitizeSettings(raw: unknown): PersistedChiefSettings {
  const base = cloneSettings(DEFAULT_PERSISTED_CHIEF_SETTINGS);
  if (!raw || typeof raw !== 'object') return base;
  const obj = raw as Record<string, unknown>;
  if (isPreset(obj['preset'])) base.preset = obj['preset'];
  if (typeof obj['advisorEnabled'] === 'boolean') base.advisorEnabled = obj['advisorEnabled'];
  if (typeof obj['coworkQuestionAdvisor'] === 'boolean') base.coworkQuestionAdvisor = obj['coworkQuestionAdvisor'];
  if (typeof obj['autoReviewPlans'] === 'boolean') base.autoReviewPlans = obj['autoReviewPlans'];
  if (typeof obj['maxPlanSteps'] === 'number' && Number.isFinite(obj['maxPlanSteps']) && obj['maxPlanSteps'] >= 1) {
    base.maxPlanSteps = Math.floor(obj['maxPlanSteps']);
  }
  if (typeof obj['spendFloorUsd'] === 'number' && Number.isFinite(obj['spendFloorUsd']) && obj['spendFloorUsd'] >= 0) {
    base.spendFloorUsd = obj['spendFloorUsd'];
  }
  if (Array.isArray(obj['standingAnswers'])) {
    base.standingAnswers = obj['standingAnswers']
      .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object'))
      .filter(
        (item) =>
          typeof item['pattern'] === 'string' &&
          typeof item['answer'] === 'string' &&
          item['pattern'].trim().length > 0 &&
          item['answer'].trim().length > 0 &&
          !highImpactSignal(item['pattern']) &&
          !highImpactSignal(item['answer']),
      )
      .map((item) => ({
        id: typeof item['id'] === 'string' && item['id'].trim() ? item['id'].trim() : `ca_${randomUUID().slice(0, 12)}`,
        pattern: String(item['pattern']).trim(),
        answer: String(item['answer']).trim(),
        ...(typeof item['scope'] === 'string' && normalizeScope(item['scope']) ? { scope: normalizeScope(item['scope']) } : {}),
        createdAt: typeof item['createdAt'] === 'string' && item['createdAt'] ? item['createdAt'] : new Date().toISOString(),
        ...(typeof item['source'] === 'string' && item['source'].trim() ? { source: item['source'].trim() } : {}),
      }));
  }
  if (Array.isArray(obj['standingCommands'])) {
    base.standingCommands = obj['standingCommands']
      .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object'))
      .filter((item) => typeof item['prefix'] === 'string' && item['prefix'].trim().length > 0 && !highImpactSignal(item['prefix']))
      .map((item) => ({
        id: typeof item['id'] === 'string' && item['id'].trim() ? item['id'].trim() : `cc_${randomUUID().slice(0, 12)}`,
        prefix: normalizeSpaces(String(item['prefix'])),
        ...(typeof item['scope'] === 'string' && normalizeScope(item['scope']) ? { scope: normalizeScope(item['scope']) } : {}),
        createdAt: typeof item['createdAt'] === 'string' && item['createdAt'] ? item['createdAt'] : new Date().toISOString(),
        ...(typeof item['source'] === 'string' && item['source'].trim() ? { source: item['source'].trim() } : {}),
      }));
  }
  return base;
}

function sanitizeDecisions(raw: unknown, maxDecisions: number): PersistedChiefDecision[] {
  if (!Array.isArray(raw)) return [];
  const clean: PersistedChiefDecision[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const obj = item as Record<string, unknown>;
    if (
      typeof obj['id'] !== 'string' ||
      typeof obj['at'] !== 'string' ||
      (obj['surface'] !== 'coding' && obj['surface'] !== 'cowork') ||
      typeof obj['source'] !== 'string' ||
      typeof obj['requestKind'] !== 'string' ||
      typeof obj['requestId'] !== 'string' ||
      typeof obj['summary'] !== 'string' ||
      !obj['decision'] ||
      typeof obj['decision'] !== 'object'
    ) {
      continue;
    }
    clean.push(cloneDecision(obj as unknown as PersistedChiefDecision));
  }
  return clean.slice(-maxDecisions);
}

/**
 * File-backed store for Chief of Staff authority settings, standing rules, and
 * a bounded persistent decision audit log.
 */
export class ChiefStore {
  private readonly filePath: string;
  private readonly maxDecisions: number;
  private readonly now: () => string;
  private state: ChiefStoreDiskState;

  constructor(
    filePath: string,
    options: { maxDecisions?: number; now?: () => string } = {},
  ) {
    this.filePath = filePath;
    this.maxDecisions = Math.max(10, options.maxDecisions ?? DEFAULT_MAX_DECISIONS);
    this.now = options.now ?? (() => new Date().toISOString());
    this.state = this.load();
  }

  private load(): ChiefStoreDiskState {
    const raw = readJson<Record<string, unknown>>(this.filePath);
    if (!raw || typeof raw !== 'object') {
      return {
        version: 1,
        settings: cloneSettings(DEFAULT_PERSISTED_CHIEF_SETTINGS),
        decisions: [],
      };
    }
    return {
      version: 1,
      settings: sanitizeSettings(raw['settings']),
      decisions: sanitizeDecisions(raw['decisions'], this.maxDecisions),
    };
  }

  private save(): void {
    writeJson(this.filePath, this.state);
  }

  getSettings(): PersistedChiefSettings {
    return cloneSettings(this.state.settings);
  }

  updateSettings(patch: ChiefSettingsPatch): PersistedChiefSettings {
    const next = cloneSettings(this.state.settings);
    if (patch.preset !== undefined) {
      if (!isPreset(patch.preset)) {
        throw new Error(`Invalid Chief preset "${String(patch.preset)}". Expected one of: ${Object.keys(AUTHORITY_PRESETS).join(', ')}.`);
      }
      next.preset = patch.preset;
    }
    if (typeof patch.advisorEnabled === 'boolean') {
      next.advisorEnabled = patch.advisorEnabled;
    }
    if (typeof patch.coworkQuestionAdvisor === 'boolean') {
      next.coworkQuestionAdvisor = patch.coworkQuestionAdvisor;
    }
    if (patch.autoReviewPlans === null) {
      delete next.autoReviewPlans;
    } else if (typeof patch.autoReviewPlans === 'boolean') {
      next.autoReviewPlans = patch.autoReviewPlans;
    }
    if (patch.maxPlanSteps === null) {
      delete next.maxPlanSteps;
    } else if (patch.maxPlanSteps !== undefined) {
      const steps = Number(patch.maxPlanSteps);
      if (!Number.isFinite(steps) || steps < 1) {
        throw new Error('maxPlanSteps must be a positive number.');
      }
      next.maxPlanSteps = Math.floor(steps);
    }
    if (patch.spendFloorUsd === null) {
      delete next.spendFloorUsd;
    } else if (patch.spendFloorUsd !== undefined) {
      const floor = Number(patch.spendFloorUsd);
      if (!Number.isFinite(floor) || floor < 0) {
        throw new Error('spendFloorUsd must be a non-negative number.');
      }
      next.spendFloorUsd = floor;
    }
    this.state.settings = next;
    this.save();
    return cloneSettings(next);
  }

  addStandingAnswer(input: {
    pattern: string;
    answer: string;
    scope?: string;
    source?: string;
  }): StandingAnswerRule {
    const pattern = input.pattern.trim();
    const answer = input.answer.trim();
    if (!pattern) throw new Error('Standing answer pattern cannot be empty.');
    if (!answer) throw new Error('Standing answer text cannot be empty.');
    const impact = highImpactSignal(pattern) ?? highImpactSignal(answer);
    if (impact) {
      throw new Error(`Cannot save standing answer rule for high-impact topic (${impact}).`);
    }
    const scope = normalizeScope(input.scope);
    const source = input.source?.trim();

    const existing = this.state.settings.standingAnswers.find(
      (rule) =>
        normalizeSpaces(rule.pattern).toLowerCase() === normalizeSpaces(pattern).toLowerCase() &&
        normalizeScope(rule.scope) === scope,
    );
    if (existing) {
      existing.pattern = pattern;
      existing.answer = answer;
      existing.createdAt = this.now();
      if (source) existing.source = source;
      this.save();
      return { ...existing };
    }

    const rule: StandingAnswerRule = {
      id: `ca_${randomUUID().slice(0, 12)}`,
      pattern,
      answer,
      ...(scope ? { scope } : {}),
      createdAt: this.now(),
      ...(source ? { source } : {}),
    };
    this.state.settings.standingAnswers.push(rule);
    this.save();
    return { ...rule };
  }

  removeStandingAnswer(id: string): boolean {
    const before = this.state.settings.standingAnswers.length;
    this.state.settings.standingAnswers = this.state.settings.standingAnswers.filter((rule) => rule.id !== id);
    if (this.state.settings.standingAnswers.length === before) return false;
    this.save();
    return true;
  }

  addStandingCommand(input: {
    prefix: string;
    scope?: string;
    source?: string;
  }): StandingCommandRule {
    const prefix = normalizeSpaces(input.prefix);
    if (!prefix) throw new Error('Standing command prefix cannot be empty.');
    const impact = highImpactSignal(prefix);
    if (impact) {
      throw new Error(`Cannot save standing command rule for high-impact command (${impact}).`);
    }
    const scope = normalizeScope(input.scope);
    const source = input.source?.trim();

    const existing = this.state.settings.standingCommands.find(
      (rule) => rule.prefix === prefix && normalizeScope(rule.scope) === scope,
    );
    if (existing) {
      existing.createdAt = this.now();
      if (source) existing.source = source;
      this.save();
      return { ...existing };
    }

    const rule: StandingCommandRule = {
      id: `cc_${randomUUID().slice(0, 12)}`,
      prefix,
      ...(scope ? { scope } : {}),
      createdAt: this.now(),
      ...(source ? { source } : {}),
    };
    this.state.settings.standingCommands.push(rule);
    this.save();
    return { ...rule };
  }

  removeStandingCommand(id: string): boolean {
    const before = this.state.settings.standingCommands.length;
    this.state.settings.standingCommands = this.state.settings.standingCommands.filter((rule) => rule.id !== id);
    if (this.state.settings.standingCommands.length === before) return false;
    this.save();
    return true;
  }

  /**
   * Build the effective `AuthorityPolicy` from the persisted preset, overrides,
   * standing rules matching `scopes`, and an optional host patch.
   */
  resolvePolicy(
    extra?: AuthorityPolicyPatch,
    context?: { scopes?: readonly string[] },
  ): AuthorityPolicy {
    const settings = this.state.settings;
    const presetPolicy = presetAuthorityPolicy(settings.preset);
    const scopes = context?.scopes ?? [];

    const persistedCommands = settings.standingCommands
      .filter((rule) => scopeMatches(rule.scope, scopes))
      .map((rule) => compileCommandPrefix(rule.prefix));

    const persistedAnswers = settings.standingAnswers
      .filter((rule) => scopeMatches(rule.scope, scopes))
      .map((rule) => ({
        when: compileStandingPattern(rule.pattern),
        answer: rule.answer,
      }));

    const baseCommands = extra?.approvals?.routineCommands ?? presetPolicy.approvals.routineCommands;
    const extraTools = extra?.approvals?.neverAutoApproveTools ?? [];
    const mergedTools = Array.from(new Set([...presetPolicy.approvals.neverAutoApproveTools, ...extraTools]));

    return presetAuthorityPolicy(settings.preset, {
      approvals: {
        routineCommands: [...baseCommands, ...persistedCommands],
        neverAutoApproveTools: mergedTools,
      },
      planReviews: {
        autoReview: extra?.planReviews?.autoReview ?? settings.autoReviewPlans ?? presetPolicy.planReviews.autoReview,
        requireVerification: extra?.planReviews?.requireVerification ?? presetPolicy.planReviews.requireVerification,
        maxSteps: extra?.planReviews?.maxSteps ?? settings.maxPlanSteps ?? presetPolicy.planReviews.maxSteps,
      },
      questions: {
        answers: [...persistedAnswers, ...(extra?.questions?.answers ?? [])],
      },
      spendFloorUsd: extra?.spendFloorUsd ?? settings.spendFloorUsd ?? presetPolicy.spendFloorUsd,
    });
  }

  recordDecision(
    entry: Omit<PersistedChiefDecision, 'id' | 'at'> & { id?: string; at?: string },
  ): PersistedChiefDecision {
    const record: PersistedChiefDecision = cloneDecision({
      ...entry,
      id: entry.id?.trim() || `cd_${randomUUID().slice(0, 12)}`,
      at: entry.at?.trim() || this.now(),
    });
    this.state.decisions.push(record);
    if (this.state.decisions.length > this.maxDecisions) {
      this.state.decisions = this.state.decisions.slice(-this.maxDecisions);
    }
    this.save();
    return cloneDecision(record);
  }

  listDecisions(options: {
    surface?: 'coding' | 'cowork';
    includeRevoked?: boolean;
    limit?: number;
  } = {}): PersistedChiefDecision[] {
    const includeRevoked = options.includeRevoked ?? true;
    const filtered = this.state.decisions
      .filter((entry) => (!options.surface || entry.surface === options.surface))
      .filter((entry) => (includeRevoked ? true : !entry.revokedAt))
      .slice()
      .reverse();
    const limit = options.limit !== undefined && options.limit > 0 ? Math.floor(options.limit) : filtered.length;
    return filtered.slice(0, limit).map(cloneDecision);
  }

  revokeDecision(id: string, reason?: string): PersistedChiefDecision | undefined {
    const entry = this.state.decisions.find((item) => item.id === id);
    if (!entry) return undefined;
    if (!entry.revokedAt) {
      entry.revokedAt = this.now();
    }
    if (reason?.trim()) {
      entry.revokeReason = reason.trim();
    }
    if (entry.ruleId) {
      this.state.settings.standingAnswers = this.state.settings.standingAnswers.filter((rule) => rule.id !== entry.ruleId);
      this.state.settings.standingCommands = this.state.settings.standingCommands.filter((rule) => rule.id !== entry.ruleId);
    }
    this.save();
    return cloneDecision(entry);
  }
}
