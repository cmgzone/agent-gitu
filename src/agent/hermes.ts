import { appendFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { ensureHermesHome } from '../workspace/home.js';
import { CheckpointManager } from '../checkpoint/checkpoint.js';
import { CodeIndex } from '../context/code-index.js';
import { ContextEngine, contextBudgetForWindow } from '../context/context-engine.js';
import { EvidenceEngine, classifyEvidenceKind, commandsMatch, isWeakEvidenceLink } from '../evidence/evidence.js';
import { Executor } from '../executor/executor.js';
import { getWorkspaceFingerprint, gitExec } from '../git/git.js';
import { ProjectGuard, ProjectGuardError } from '../guard/project-guard.js';
import { TaskLedger } from '../ledger/task-ledger.js';
import { LoopDetector } from '../loop/loop-detector.js';
import { MalformedCallTracker, malformedIntervention, malformedKindFor } from '../loop/malformed-tracker.js';
import {
  extractJson,
  findXmlCallStart,
  parseXmlFunctionCall,
  xmlMarkerHoldBack,
  type LlmClient,
  type LlmContentPart,
  type LlmMessage,
  type LlmUsage,
} from '../llm/llm.js';
import { resolveEmbedder } from '../llm/providers.js';
import { resilientLlm } from '../llm/resilient.js';
import { KNOWN_TOOL_NAMES } from '../tools/tools.js';
import { LspManager } from '../lsp/manager.js';
import { MemoryStore } from '../memory/memory-store.js';
import type { McpManager } from '../mcp/client.js';
import type { ApprovalHandler } from '../policy/policy.js';
import { PolicyEngine } from '../policy/policy.js';
import { Reporter } from '../report/reporter.js';
import { SkillStore } from '../skills/skills.js';
import type { BrowserBridge } from '../browser/browser.js';
import type { SubAgentResult, SubAgentRunner } from './subagent.js';
import { validateSpecialistEvidence } from './specialist-evidence.js';
import { VERIFIER_AGENT, buildVerifierContract, verdictForFinding } from './findings.js';
import type { CompletionReport, CriterionSpec, DecisionBasis, EvidenceKind, PlanArea, TaskFinding } from '../types.js';
import { buildStateMessage, buildSystemPrompt, renderFullPlanMessage } from './prompt.js';
import { buildTaskStrategySection } from './task-strategy.js';
import { planEffort, isFrontendGoal, type EffortPlan } from './effort-planner.js';
import { uiVisualGate, isUiTask } from './ui-gate.js';
import { buildPlanNote, planRisk } from './risk-planner.js';
import {
  auditArchitecture,
  decisionConflicts,
  detectExplicitTechnologies,
  normalizeDecisionDraft,
} from './architecture.js';
import { RunTelemetry, estimatePlanningArtifactTokens, renderTelemetry } from './telemetry.js';

export interface HermesConfig {
  cwd: string;
  llm: LlmClient;
  /** Shared code index to reuse (e.g. a watched one owned by the server). */
  index?: CodeIndex;
  mode?: 'fast' | 'standard' | 'chat';
  autoApprove?: boolean;
  /** Never auto-approve dangerous commands, even with autoApprove — the
   *  unattended-but-cautious middle ground. */
  safeMode?: boolean;
  approvalHandler?: ApprovalHandler;
  criteria?: string[] | CriterionSpec[];
  requirePlanReview?: boolean;
  planReviewHandler?: PlanReviewHandler;
  askUserHandler?: AskUserHandler;
  scopeFiles?: string[];
  extraConstraints?: string[];
  effort?: 'low' | 'medium' | 'high' | 'max';
  skills?: SkillStore;
  mcp?: McpManager;
  browser?: BrowserBridge;
  /** Optional LSP intelligence layer. When omitted, one is created lazily for the repo. */
  lsp?: LspManager;
  subagents?: SubAgentRunner;
  /** Registered specialist agents (name + role). Used by the risk planner to
   *  recommend a right-sized roster that actually exists in the registry. */
  specialists?: { name: string; role: string }[];
  agentsSection?: string;
  images?: { name: string; dataUrl: string }[];
  supportsImages?: boolean;
  /** Live context-window metadata for the selected provider/model. */
  contextWindowTokens?: number;
  resume?: { taskId: string; message: string };
  /** Prior user/assistant turns for a resumed server session. */
  conversationHistory?: LlmMessage[];
  autoLearn?: boolean;
  onEvent?: (event: string) => void;
}

export interface AskUserQuestion {
  question: string;
  header?: string;
  options: string[];
}

export type AskUserHandler = (questions: AskUserQuestion[]) => Promise<string>;

export interface PlanReviewInput {
  criteria: string[];
  steps: { description: string; verification: string }[];
}

export interface PlanReviewDecision {
  approved: boolean;
  note?: string;
  criteria?: string[];
  steps?: { description: string; verification: string }[];
}

export type PlanReviewHandler = (input: PlanReviewInput) => Promise<PlanReviewDecision>;

export interface HermesRunResult {
  ledger: TaskLedger;
  report: CompletionReport;
}

/** One planned step as offered by the model: bounded on ingest, optionally
 *  tagged with its surface (frontend/backend/...) and broken into todos. */
interface PlanActionStep {
  description: string;
  verification: string;
  area?: PlanArea;
  subtasks?: string[];
}

const PLAN_AREAS: readonly PlanArea[] = ['frontend', 'backend', 'integration', 'shared', 'database', 'infra', 'tests', 'docs'];

function parseArea(value: unknown): PlanArea | undefined {
  const text = String(value ?? '').trim().toLowerCase();
  return (PLAN_AREAS as readonly string[]).includes(text) ? (text as PlanArea) : undefined;
}

function parseSubtasks(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const items = value.map((t) => String(t).trim().slice(0, 140)).filter(Boolean).slice(0, 8);
  return items.length > 0 ? items : undefined;
}

type ParsedAction =
  | { type: 'set_criteria'; criteria: string[] }
  | { type: 'set_plan'; steps: PlanActionStep[] }
  | { type: 'add_criteria'; criteria: string[] }
  | { type: 'append_plan'; steps: PlanActionStep[] }
  | {
      type: 'set_design';
      design: { frontend?: string; backend?: string; integration?: string };
    }
  | {
      type: 'revise_step';
      stepId: string;
      description?: string;
      verification?: string;
      area?: PlanArea;
      addSubtasks?: string[];
      reason: string;
    }
  | { type: 'toggle_todo'; stepId: string; index: number; done?: boolean }
  | { type: 'show_plan' }
  | { type: 'set_hypothesis'; text: string }
  | {
      type: 'record_decision';
      decision: string;
      alternatives: string[];
      repoEvidence: string;
      requirements: string[];
      rejected: { alternative: string; reason: string }[];
      reconsiderIf?: string;
      basis: DecisionBasis;
      supersedes?: string;
    }
  | { type: 'tool_call'; tool: string; params: Record<string, unknown>; reason: string; expected: string; stepId?: string }
  | { type: 'claim_criterion'; criterionId: string; evidenceId: string; justification?: string }
    | { type: 'complete'; summary: string; risks?: string[]; followUps?: string[]; chat?: boolean }
  | { type: 'request_block'; reason: string }
  | { type: 'ask_user'; questions: AskUserQuestion[] }
  | { type: 'delegate'; tasks: { agent: string; task: string; criteria?: (string | CriterionSpec)[] }[]; background?: boolean }
  | {
      type: 'report_finding';
      claim: string;
      kind?: string;
      severity?: string;
      location?: string;
      reproductionCommand?: string;
    }
  | {
      type: 'parallel';
      calls: { tool: string; params: Record<string, unknown>; reason: string; expected: string }[];
    };

function parseAction(raw: unknown): ParsedAction | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const root = raw as Record<string, unknown>;
  const action = (root['action'] ?? root) as Record<string, unknown>;
  const type = action['type'];
  // Some models emit dots-style JSON where the tool name is the action type
  // ({"type":"run_command",...}) instead of {"type":"tool_call","tool":...}.
  if (typeof type === 'string' && !KNOWN_ACTION_TYPES.has(type) && (KNOWN_TOOL_NAMES.has(type) || type.startsWith('mcp:'))) {
    const nested = action['params'];
    const params: Record<string, unknown> = {};
    if (nested && typeof nested === 'object') {
      Object.assign(params, nested as Record<string, unknown>);
    } else {
      for (const [key, value] of Object.entries(action)) {
        if (key !== 'type' && key !== 'thought' && key !== 'reason' && key !== 'expected' && key !== 'stepId') params[key] = value;
      }
    }
    return {
      type: 'tool_call',
      tool: type,
      params,
      reason: String(action['reason'] ?? ''),
      expected: String(action['expected'] ?? ''),
      stepId: typeof action['stepId'] === 'string' ? action['stepId'] : undefined,
    };
  }
  switch (type) {
    case 'set_criteria':
    case 'add_criteria': {
      const criteria = action['criteria'];
      if (!Array.isArray(criteria) || criteria.length === 0) return undefined;
      return { type, criteria: criteria.map(String).slice(0, 10) };
    }
    case 'set_plan':
    case 'append_plan': {
      const steps = action['steps'];
      if (!Array.isArray(steps) || steps.length === 0) return undefined;
      const parsed = steps
        .filter((s): s is Record<string, unknown> => !!s && typeof s === 'object')
        .map((s) => {
          const area = parseArea(s['area']);
          const subtasks = parseSubtasks(s['subtasks']);
          return {
            description: String(s['description'] ?? '').slice(0, 220),
            verification: String(s['verification'] ?? 'manual check').slice(0, 180),
            ...(area ? { area } : {}),
            ...(subtasks ? { subtasks } : {}),
          };
        })
        .filter((s) => s.description);
      if (parsed.length === 0) return undefined;
      // Bounded plan: ≤30 top-level steps keeps the compact state render cheap.
      return { type, steps: parsed.slice(0, 30) };
    }
    case 'set_design': {
      const raw = action['design'];
      if (!raw || typeof raw !== 'object') return undefined;
      const src = raw as Record<string, unknown>;
      const cap = (value: unknown, max: number): string | undefined => {
        const text = String(value ?? '').trim();
        return text ? text.slice(0, max) : undefined;
      };
      const design = {
        frontend: cap(src['frontend'], 1200),
        backend: cap(src['backend'], 1200),
        integration: cap(src['integration'], 800),
      };
      if (!design.frontend && !design.backend && !design.integration) return undefined;
      return { type, design };
    }
    case 'revise_step': {
      if (typeof action['stepId'] !== 'string' || !action['stepId']) return undefined;
      const reason = String(action['reason'] ?? '').trim();
      if (!reason) return undefined;
      const area = parseArea(action['area']);
      const addSubtasks = parseSubtasks(action['todos']);
      const description = typeof action['description'] === 'string' && action['description'].trim() ? action['description'].slice(0, 220) : undefined;
      const verification = typeof action['verification'] === 'string' && action['verification'].trim() ? action['verification'].slice(0, 180) : undefined;
      if (description === undefined && verification === undefined && !area && !addSubtasks) return undefined;
      return { type, stepId: action['stepId'], reason, description, verification, area, addSubtasks };
    }
    case 'toggle_todo': {
      if (typeof action['stepId'] !== 'string' || !action['stepId']) return undefined;
      if (typeof action['index'] !== 'number' || !Number.isFinite(action['index'])) return undefined;
      const done = typeof action['done'] === 'boolean' ? action['done'] : undefined;
      return { type, stepId: action['stepId'], index: Math.max(0, Math.floor(action['index'])), done };
    }
    case 'show_plan':
      return { type: 'show_plan' };
    case 'set_hypothesis':
      if (typeof action['text'] !== 'string') return undefined;
      return { type, text: action['text'] };
    case 'record_decision': {
      const draft = normalizeDecisionDraft(action);
      if (!draft) return undefined;
      return { type, ...draft, basis: draft.basis ?? 'recommendation' };
    }
    case 'tool_call': {
      if (typeof action['tool'] !== 'string') return undefined;
      const params = action['params'];
      if (!params || typeof params !== 'object') return undefined;
      return {
        type,
        tool: action['tool'],
        params: params as Record<string, unknown>,
        reason: String(action['reason'] ?? ''),
        expected: String(action['expected'] ?? ''),
        stepId: typeof action['stepId'] === 'string' ? action['stepId'] : undefined,
      };
    }
    case 'claim_criterion':
      if (typeof action['criterionId'] !== 'string' || typeof action['evidenceId'] !== 'string') return undefined;
      return { type, criterionId: action['criterionId'], evidenceId: action['evidenceId'], justification: action['justification'] ? String(action['justification']) : undefined };
    case 'complete':
      if (typeof action['summary'] !== 'string') return undefined;
      return {
        type,
        summary: action['summary'],
        risks: Array.isArray(action['risks']) ? action['risks'].map(String) : [],
        followUps: Array.isArray(action['followUps']) ? action['followUps'].map(String) : [],
        chat: action['chat'] === true,
      };
    case 'request_block':
      if (typeof action['reason'] !== 'string') return undefined;
      return { type, reason: action['reason'] };
    case 'delegate': {
      const tasks = action['tasks'];
      if (!Array.isArray(tasks) || tasks.length === 0) return undefined;
      const parsed = (tasks as Record<string, unknown>[])
        .map((t) => {
          const agent = String(t?.['agent'] ?? '');
          const task = String(t?.['task'] ?? '');
          const rawCrit = t?.['criteria'];
          const criteria = Array.isArray(rawCrit)
            ? (rawCrit as unknown[])
                .map((c) =>
                  typeof c === 'string'
                    ? c
                    : typeof c === 'object' && c !== null
                      ? (c as CriterionSpec)
                      : String(c),
                )
                .slice(0, 10)
            : undefined;
          return { agent, task, criteria };
        })
        .filter((t) => t.agent && t.task)
        .slice(0, 6);
      if (parsed.length === 0) return undefined;
      return { type, tasks: parsed, background: action['background'] === true };
    }
    case 'report_finding': {
      if (typeof action['claim'] !== 'string' || !action['claim'].trim()) return undefined;
      return {
        type,
        claim: action['claim'],
        kind: typeof action['kind'] === 'string' ? action['kind'] : undefined,
        severity: typeof action['severity'] === 'string' ? action['severity'] : undefined,
        location: typeof action['location'] === 'string' ? action['location'] : undefined,
        reproductionCommand: typeof action['reproductionCommand'] === 'string' ? action['reproductionCommand'] : undefined,
      };
    }
    case 'ask_user': {
      const questions = action['questions'];
      if (!Array.isArray(questions) || questions.length === 0) return undefined;
      const parsed = (questions as Record<string, unknown>[])
        .map((q) => ({
          question: String(q['question'] ?? ''),
          header: typeof q['header'] === 'string' ? q['header'] : undefined,
          options: Array.isArray(q['options']) ? (q['options'] as unknown[]).map(String).slice(0, 6) : [],
        }))
        .filter((q) => q.question);
      if (parsed.length === 0) return undefined;
      return { type, questions: parsed.slice(0, 4) };
    }
    case 'parallel': {
      const calls = action['calls'];
      if (!Array.isArray(calls)) return undefined;
      const parsedCalls = (calls as Record<string, unknown>[])
        .map((c) => ({
          tool: String(c['tool'] ?? ''),
          params: (c['params'] && typeof c['params'] === 'object' ? c['params'] : {}) as Record<string, unknown>,
          reason: String(c['reason'] ?? ''),
          expected: String(c['expected'] ?? ''),
        }))
        .filter((c) => c.tool);
      if (parsedCalls.length < 2) return undefined;
      return { type, calls: parsedCalls.slice(0, 6) };
    }
    default:
      return undefined;
  }
}

const KNOWN_ACTION_TYPES = new Set([
  'set_criteria',
  'set_plan',
  'add_criteria',
  'append_plan',
  'set_hypothesis',
  'record_decision',
  'set_design',
  'revise_step',
  'toggle_todo',
  'show_plan',
  'tool_call',
  'claim_criterion',
  'complete',
  'request_block',
  'ask_user',
  'delegate',
  'report_finding',
  'parallel',
]);

function parseReplyAction(reply: string): ParsedAction | undefined {
  const fromJson = parseAction(extractJson(reply));
  if (fromJson) return fromJson;
  const xml = parseXmlFunctionCall(reply);
  if (!xml) return undefined;
  const type = String(xml['type'] ?? '');
  if (!type) return undefined;
  if (KNOWN_ACTION_TYPES.has(type)) return parseAction({ action: xml });
  if (KNOWN_TOOL_NAMES.has(type) || type.startsWith('mcp:')) {
    const params: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(xml)) {
      if (key !== 'type') params[key] = value;
    }
    return parseAction({ action: { type: 'tool_call', tool: type, params, reason: '', expected: '' } });
  }
  return undefined;
}

export const COMPACT_KEEP_RECENT = 12;
const COMPACT_TRIGGER = 32;
/** Token-aware compaction budget: ~50K tokens estimated at 4 chars/token.
 *  Compaction now triggers on cumulative conversation size (not just message
 *  count), because a handful of huge tool outputs can blow the context long
 *  before 32 messages accumulate. */
export const COMPACT_CHAR_BUDGET = 200_000;

export function estimateMessageChars(messages: LlmMessage[]): number {
  let total = 0;
  for (const m of messages) {
    if (typeof m.content === 'string') total += m.content.length;
    else {
      for (const part of m.content) {
        if (part.type === 'text') total += part.text.length;
        else total += Math.floor(part.image_url.url.length / 4);
      }
    }
  }
  return total;
}

/**
 * How many of the most recent screenshots stay in model context when a fresh
 * one arrives. One destroyed cross-page/state consistency on frontend runs
 * (the model could never compare views it had already built); four preserves
 * before/after comparisons while bounding vision token cost.
 */
const KEEP_RECENT_SCREENSHOTS = 4;

/**
 * Replace image parts in older messages with a short text note so obsolete
 * screenshots do not keep billing vision tokens turn after turn. Returns the
 * number of images removed. `keepLast` messages are left untouched, and
 * `fromIndex` protects the stable prefix (e.g. the user's original attached
 * images) from being stripped.
 */
export function stripStaleImages(messages: LlmMessage[], keepLast = 1, fromIndex = 0): number {
  let removed = 0;
  const stopAt = Math.max(fromIndex, messages.length - keepLast);
  for (let i = fromIndex; i < stopAt; i++) {
    const m = messages[i]!;
    if (typeof m.content === 'string') continue;
    const images = m.content.filter((p) => p.type === 'image_url').length;
    if (images === 0) continue;
    removed += images;
    const textParts = m.content.filter((p): p is Extract<LlmContentPart, { type: 'text' }> => p.type === 'text');
    m.content =
      textParts.length > 0
        ? [...textParts, { type: 'text', text: `[${images} earlier screenshot(s) removed from context — take a fresh one if needed]` }]
        : `[${images} earlier screenshot(s) removed from context — take a fresh one if needed]`;
  }
  return removed;
}

/** Digest size ceiling: 8000 EXCERPTS (not chars) could re-inject megabytes
 *  into context, defeating the char budget that triggered compaction. */
const COMPACT_DIGEST_MAX_CHARS = 24_000;

function compactDigest(excerpts: string[]): string {
  let out = '';
  for (const ex of excerpts) {
    if (out.length + ex.length + 1 > COMPACT_DIGEST_MAX_CHARS) break;
    out += (out ? '\n' : '') + ex;
  }
  return out;
}

/**
 * Recompute the stable-prefix boundary after compactHistory() splices
 * messages. Post-compaction the layout is always [system prompt, digest,
 * ...retained tail]: everything that was prefix beyond index 0 is either gone
 * or now lives in the retained history, and the digest itself is stable going
 * forward — so the cacheable prefix is exactly system + digest.
 */
export function shiftPrefixEndAfterCompaction(prefixEnd: number, _keepFrom: number): number {
  return prefixEnd > 0 ? Math.min(prefixEnd + 1, 2) : 0;
}

/** Most recent screenshot attached anywhere in the conversation, if any. */
export function findLastScreenshotUrl(messages: LlmMessage[]): string | undefined {
  for (let i = messages.length - 1; i >= 0; i--) {
    const content = messages[i]?.content;
    if (!content || typeof content === 'string') continue;
    for (let j = content.length - 1; j >= 0; j--) {
      const part = content[j];
      if (!part || part.type !== 'image_url') continue;
      if (part.image_url.url.startsWith('data:image/')) return part.image_url.url;
    }
  }
  return undefined;
}

/**
 * Parse the reviewer's reply. Fail-open: anything without an explicit
 * `VERDICT: REVISE` counts as a pass so a flaky reviewer can never deadlock
 * completion.
 */
export function parseReviewVerdict(reply: string): { verdict: 'pass' | 'revise'; feedback: string } {
  const m = /VERDICT:\s*(REVISE|PASS|REJECT)/i.exec(reply);
  if (m && m[1] && /revise|reject/i.test(m[1])) {
    const fbIdx = reply.search(/FEEDBACK:/i);
    const feedback = (fbIdx >= 0 ? reply.slice(fbIdx + 8) : reply.slice((m.index ?? 0) + m[0].length))
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 600);
    return { verdict: 'revise', feedback: feedback || 'Reviewer did not provide specifics — re-check the diff against the acceptance criteria.' };
  }
  return { verdict: 'pass', feedback: '' };
}

export interface QualityReviewInput {
  goal: string;
  criteria: string[];
  filesChanged: string[];
  diffStat: string;
  summary: string;
  screenshotUrl?: string;
}

/** Build the strict-reviewer message list. UI tasks attach the final screenshot for vision judging. */
export function buildQualityReviewMessages(input: QualityReviewInput): LlmMessage[] {
  const criteriaText = input.criteria.length
    ? input.criteria.map((c, i) => `${i + 1}. ${c}`).join('\n')
    : '(no explicit criteria — judge against the goal)';
  const text =
    `Review this COMPLETED engineering task with fresh eyes. Be strict about real defects; do not nitpick style.\n\n` +
    `GOAL: ${input.goal}\n\nACCEPTANCE CRITERIA:\n${criteriaText}\n\n` +
    `FILES CHANGED: ${input.filesChanged.slice(0, 30).join(', ') || '(none recorded)'}\n\n` +
    `DIFF SUMMARY:\n${(input.diffStat || '(unavailable)').slice(0, 4000)}\n\n` +
    `AGENT'S CLAIMED RESULT: ${input.summary.slice(0, 1500)}\n\n` +
    (input.screenshotUrl
      ? `The final UI state is attached as an image. JUDGE IT: does it look complete, correctly laid out, and consistent with the goal? Broken layouts, placeholder text, overlapping elements, or missing sections are defects.\n\n`
      : '') +
    `Reply EXACTLY in this format:\nVERDICT: PASS\nor\nVERDICT: REVISE\nFEEDBACK: <one short paragraph of concrete issues to fix>`;
  const userContent: LlmContentPart[] = [{ type: 'text', text }];
  if (input.screenshotUrl) userContent.push({ type: 'image_url', image_url: { url: input.screenshotUrl } });
  return [
    {
      role: 'system',
      content:
        'You are a strict senior engineer reviewing a colleague\'s finished work before it ships. You have no stake in being agreeable. Judge only what is visible in the goal, criteria, diff and screenshot.',
    },
    { role: 'user', content: userContent },
  ];
}

/**
 * Compact a growing conversation as the run goes: older turns collapse into a
 * single digest while the recent tail stays verbatim. The ledger state message
 * re-emitted on every turn remains authoritative (goal, criteria, architecture
 * decisions, evidence, current state), so compacted details — old tool
 * outputs, stale file dumps, obsolete screenshots — are exactly the noise the
 * model doesn't need.
 *
 * Triggers when EITHER the message count or the cumulative character size
 * (~4 chars/token) crosses its budget.
 */
export function compactHistory(
  messages: LlmMessage[],
  onEvent?: (text: string) => void,
  opts: { charBudget?: number; keepRecent?: number; triggerMessages?: number } = {},
): boolean {
  const charBudget = opts.charBudget ?? COMPACT_CHAR_BUDGET;
  const keepRecent = opts.keepRecent ?? COMPACT_KEEP_RECENT;
  const triggerMessages = opts.triggerMessages ?? COMPACT_TRIGGER;

  const chars = estimateMessageChars(messages);
  if (messages.length <= triggerMessages && chars <= charBudget) return false;
  if (messages.length <= keepRecent + 2) return false;

  const keepFrom = messages.length - keepRecent;
  const old = messages.splice(1, keepFrom - 1);
  const excerpts: string[] = [];
  const failures: string[] = [];
  const evidenceLines: string[] = [];
  for (const m of old) {
    const text = typeof m.content === 'string' ? m.content : '[image attached]';
    const flat = text.replace(/\s+/g, ' ').trim();
    excerpts.push(`${m.role}: ${flat.slice(0, 220)}`);
    // Preserve the signal from stale observations: what failed, what was
    // verified. Everything else in them is safe to drop.
    for (const line of text.split('\n')) {
      if (line.startsWith('RESULT [error]')) failures.push(line.slice(0, 200));
      else if (line.startsWith('EVIDENCE RECORDED:')) evidenceLines.push(line.slice(0, 160));
    }
  }
  const preserved =
    (failures.length ? `\nKEY FAILURES (do not repeat blindly):\n${failures.slice(-6).join('\n')}` : '') +
    (evidenceLines.length ? `\nEVIDENCE ALREADY RECORDED:\n${evidenceLines.slice(-8).join('\n')}` : '');
  messages.splice(1, 0, {
    role: 'user',
    content:
      `COMPACTED HISTORY — ${old.length} earlier messages were condensed into the excerpts below. ` +
      `The TASK STATE message that follows is authoritative (goal, criteria, architecture decisions, evidence, current state); do not re-read or repeat work already recorded there.\n${compactDigest(excerpts)}${preserved}`,
  });
  onEvent?.(
    `context compacted ${old.length} earlier messages into a digest (${chars} chars before) — ${messages.length} messages retained`,
  );
  return true;
}

/**
 * Digest a failed command's output down to its diagnostic core: error-ish
 * lines plus the tail (where summaries/stacks end). Test and build logs put
 * the actual cause at the END; the old first-2500-chars slice usually cut it
 * off entirely.
 */
const FAILURE_LINE_RE =
  /\b(fail(?:ed|ure|ing)?s?|error(?:s)?|exception|assert(?:ion)?|expected|received|cannot|unable|refused|denied|invalid|missing|timeout|timed\s*out|enoent|eacces|eperm|stack\s+trace)\b|[✗×]/i;

export function extractFailureDigest(output: string, maxChars = 1200): string {
  const lines = output.split(/\r?\n/);
  const seen = new Set<string>();
  const picked: string[] = [];
  const push = (line: string): void => {
    const t = line.replace(/\s+/g, ' ').trim();
    if (!t || seen.has(t)) return;
    seen.add(t);
    picked.push(t.slice(0, 240));
  };
  for (const l of lines) {
    if (FAILURE_LINE_RE.test(l)) push(l);
  }
  const tailStart = Math.max(0, lines.length - 8);
  for (const l of lines.slice(tailStart)) push(l);
  let out = '';
  for (const p of picked) {
    if (out.length + p.length + 1 > maxChars) break;
    out += (out ? '\n' : '') + p;
  }
  return out || output.replace(/\s+/g, ' ').trim().slice(0, maxChars);
}

/**
 * Net curly-brace balance of a text chunk, ignoring braces inside strings.
 */
export function braceBalance(text: string): number {
  let bal = 0;
  let inStr: string | null = null;
  let esc = false;
  for (const ch of text) {
    if (inStr) {
      if (esc) esc = false;
      else if (ch === '\\') esc = true;
      else if (ch === inStr) inStr = null;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') { inStr = ch; continue; }
    if (ch === '{') bal += 1;
    else if (ch === '}') bal -= 1;
  }
  return bal;
}

export type BadReplyKind = 'empty' | 'truncated-json';

/**
 * Distinguish RETRYABLE model failures from real protocol errors:
 *  - empty completions (provider returned nothing — often output budget or a
 *    transport hiccup under huge contexts)
 *  - prose followed by an UNTERMINATED action object (output cut mid-JSON)
 * Anything else (prose-only replies, malformed but complete JSON) is a genuine
 * unparseable turn and must count toward the anti-spiral streak.
 */
export function classifyBadReply(reply: string | undefined | null): BadReplyKind | null {
  if (!reply || !reply.trim()) return 'empty';
  // Two real-world truncation shapes:
  //   A) cut inside the thought STRING: `prose… {"thought":"The markup i`
  //   B) cut inside the INNER action object: `{"thought":"x","action":{"type":"run_co`
  // Anchor on the last '{' and accept either the key visible just after it
  // (shape A) or immediately before it (shape B).
  const idx = reply.lastIndexOf('{');
  if (idx >= 0) {
    const tail = reply.slice(idx);
    const before = reply.slice(Math.max(0, idx - 32), idx);
    const nearProtocol =
      /"(?:thought|action)"\s*:/.test(tail.slice(0, 60)) || /"(?:thought|action)"\s*:\s*$/.test(before);
    if (tail.length <= 8000 && nearProtocol && braceBalance(tail) > 0) return 'truncated-json';
  }
  return null;
}

/** Persist raw unparseable replies so stalls can be diagnosed from logs. */
function logParseFailure(taskId: string, reply: string, reasoning?: string): void {
  try {
    const logs = path.join(ensureHermesHome().root, 'logs');
    mkdirSync(logs, { recursive: true });
    const entry =
      `\n=== ${new Date().toISOString()} task=${taskId} ===\n--- reply ---\n${reply.slice(0, 4000)}\n` +
      (reasoning ? `--- reasoning ---\n${reasoning.slice(0, 4000)}\n` : '');
    appendFileSync(path.join(logs, 'parse-failures.log'), entry);
  } catch {
    /* diagnostics must never break the run */
  }
}

/** A '{' only starts a JSON action when a protocol key follows it nearby;
 *  prose that merely mentions braces (config examples, code quotes) must not
 *  truncate the user-facing streamed text. */
const ACTION_BRACE_RE = /\{\s*"(?:thought|action|type)"/;

function proseCutIndex(text: string): number {
  const braceMatch = ACTION_BRACE_RE.exec(text);
  const brace = braceMatch ? braceMatch.index : -1;
  const xml = findXmlCallStart(text);
  if (brace < 0) return xml;
  if (xml < 0) return brace;
  return Math.min(brace, xml);
}

function createProseStreamer(emitDelta: (chunk: string) => void): (delta: string) => void {
  let raw = '';
  let emitted = 0;
  let stopped = false;
  return (delta: string) => {
    if (stopped) return;
    raw += delta;
    const cut = proseCutIndex(raw);
    let upTo: number;
    if (cut >= 0) {
      stopped = true;
      upTo = cut;
    } else {
      upTo = raw.length - xmlMarkerHoldBack(raw);
    }
    if (upTo > emitted) {
      emitDelta(raw.slice(emitted, upTo));
      emitted = upTo;
    }
  };
}



export class Hermes {
  private readonly config: HermesConfig;
  private readonly emit: (event: string) => void;
  private readonly inbox: string[] = [];
  private aborted = false;
  private abortController?: AbortController;

  constructor(config: HermesConfig) {
    this.config = config;
    this.emit = config.onEvent ?? (() => {});
  }

  queueMessage(text: string): void {
    this.inbox.push(text);
  }

  stop(): void {
    this.aborted = true;
    this.abortController?.abort();
  }

  async run(goal: string): Promise<HermesRunResult> {
    const { cwd } = this.config;
    // Dynamic auto-retry: network blips and provider outages delay the run
    // (with visible events) instead of failing it.
    const llm = resilientLlm(this.config.llm, {
      label: 'main agent',
      onRetry: ({ attempt, maxRetries, delayMs, error }) =>
        this.emit(`recover  ${error.message.slice(0, 120)} — retry ${attempt}/${maxRetries} in ${(delayMs / 1000).toFixed(1)}s`),
    });

    let guard: ProjectGuard;
    try {
      guard = ProjectGuard.detect(cwd);
    } catch (err) {
      if (err instanceof ProjectGuardError) throw err;
      throw err;
    }
    guard.persist();
    this.emit(`project  locked: ${guard.lock.name} @ ${guard.lock.repoRoot} (${guard.lock.branch ?? 'no branch'})`);

    const memory = MemoryStore.forProject(guard.lock.repoRoot);
    let ledger: TaskLedger;
    let resumeNote: string | undefined;
    if (this.config.resume) {
      const loaded = TaskLedger.load(guard.lock.repoRoot, this.config.resume.taskId);
      if (!loaded) {
        throw new ProjectGuardError(`Cannot resume: task not found: ${this.config.resume.taskId}`);
      }
      ledger = loaded;
      // An explicit mode change from the caller (e.g. the UI's workflow
      // dropdown) switches this continuation to the newly chosen mode instead
      // of being locked into the mode the session was created with.
      if (this.config.mode && this.config.mode !== ledger.data.mode) {
        ledger.data.mode = this.config.mode;
        this.emit(`mode     switched to ${this.config.mode} for this continuation`);
      }
      ledger.data.planApproved = false;
      ledger.data.blockers = [];
      ledger.data.completedAt = undefined;
      ledger.data.report = undefined;
      ledger.data.startedAt = undefined;
      resumeNote = this.config.resume.message;
      this.emit(`ledger   resumed: ${ledger.data.taskId}`);
      // Exempt already-accepted history from future staleness: criteria gated
      // complete under an earlier workspace stay complete through follow-up
      // phases. Git projects get this implicitly (checkpoint commits collapse
      // the fingerprint to a stable "clean" hash); here we opt those evidence
      // records out explicitly. Fresh evidence from THIS phase stays strict.
      try {
        const acceptedIds = new Set(
          ledger.data.acceptanceCriteria.filter((c) => c.satisfied).flatMap((c) => c.evidenceIds),
        );
        let rebased = 0;
        for (const ev of ledger.data.evidence) {
          if (ev.passed && acceptedIds.has(ev.id) && ev.workspaceFingerprint !== undefined) {
            ev.workspaceFingerprint = undefined;
            ev.stale = false;
            rebased += 1;
          }
        }
        if (rebased > 0) {
          ledger.save();
          this.emit(`resume   ${rebased} accepted evidence record(s) exempted from staleness (prior completed phase)`);
        }
      } catch {
        /* diagnostics must never block a resume */
      }
    } else {
      ledger = TaskLedger.create({
        repoRoot: guard.lock.repoRoot,
        goal,
        project: guard.lock,
        mode: this.config.mode ?? 'standard',
      });
      if (this.config.extraConstraints && this.config.extraConstraints.length > 0) {
        ledger.data.constraints = [...ledger.data.constraints, ...this.config.extraConstraints];
      }
      this.emit(`ledger   created: ${ledger.data.taskId}`);
    }

    const checkpoints = new CheckpointManager(guard);
    const branchInfo = checkpoints.ensureTaskBranch(ledger.data.taskId);
    if (branchInfo.branch) {
      ledger.data.gitBranch = branchInfo.branch;
      ledger.save();
    }
    this.emit(`branch   ${branchInfo.message}`);

    const policy = new PolicyEngine(this.config.autoApprove ?? false, this.config.approvalHandler, this.config.safeMode ?? false);
    const loopDetector = new LoopDetector();
    const evidence = new EvidenceEngine();
    const skills = this.config.skills ?? SkillStore.forProject(guard.lock.repoRoot);
    const lsp = this.config.lsp ?? new LspManager(guard.lock.repoRoot);
    const executor = new Executor(
      guard,
      ledger,
      policy,
      loopDetector,
      this.emit,
      skills,
      this.config.mcp,
      this.config.browser,
      lsp,
      this.config.subagents ? (specs) => this.config.subagents!.runMany(specs) : undefined,
      this.config.subagents ? (specs) => this.config.subagents!.startMany(specs) : undefined,
      this.config.subagents ? (ids) => this.config.subagents!.status(ids) : undefined,
    );
    const context = new ContextEngine(guard, this.config.index ?? new CodeIndex(guard.lock.repoRoot));
    const reporter = new Reporter();

    const userCriteriaProvided = Boolean(this.config.criteria && this.config.criteria.length > 0);
    if (userCriteriaProvided) {
      const raw = this.config.criteria!;
      const hasSpecs = raw.some((c) => typeof c === 'object');
      if (hasSpecs) {
        const specs = EvidenceEngine.normalizeCriteria(raw as (string | CriterionSpec)[]);
        ledger.setCriteriaFromSpecs(specs);
      } else {
        ledger.setCriteria(raw as string[]);
      }
      this.emit(`criteria provided by user (${raw.length})`);
    }

    // Auto-resolve high-confidence skills based on user goal & follow-up
    const skillResolution = skills.resolver().resolve(goal + (resumeNote ? ` ${resumeNote}` : ''));
    const activeSkills = new Set(ledger.data.activeSkills ?? []);
    for (const match of skillResolution.highConfidence) {
      if (!activeSkills.has(match.name)) {
        activeSkills.add(match.name);
        this.emit(`skill    auto-activated high-confidence skill "${match.name}" (${match.description})`);
      }
    }
    ledger.data.activeSkills = [...activeSkills];
    ledger.save();

    const effortPlan = planEffort(goal, {
      scopeFiles: this.config.scopeFiles,
      criteriaCount: ledger.data.acceptanceCriteria.length,
      mode: ledger.data.mode,
      explicitEffort: this.config.effort,
      contextWindowTokens: this.config.contextWindowTokens,
    });
    ledger.data.effortPlan = effortPlan;
    ledger.save();

    const riskPlan = planRisk(goal, {
      complexity: effortPlan.complexity,
      specialists: this.config.specialists,
      maxSpecialists: effortPlan.maxSpecialists,
    });
    ledger.data.riskPlan = riskPlan;
    ledger.save();
    this.emit(
      `risk    ${riskPlan.risk} - ${riskPlan.reason}${
        riskPlan.recommendedSpecialists.length > 0
          ? ` (relevant specialists: ${riskPlan.recommendedSpecialists.map((r) => r.agent).join(', ')})`
          : ' (no specialists needed)'
      }`,
    );
    this.emit(`effort   ${effortPlan.complexity} — ${effortPlan.reason} (budget: ${effortPlan.maxTurns} turns, ${effortPlan.maxSpecialists} specialists, ${effortPlan.contextBudget.maxBytes} bytes context${effortPlan.requireReview ? ', review required' : ''})`);

    // Full skill instructions are delivered exactly once (first state message
    // that includes them); later turns carry only names + descriptions so the
    // per-turn context stops paying for static text every single call.
    const deliveredSkills = new Set<string>();
    const activeSkillsSection = (): string | undefined => {
      const names = ledger.data.activeSkills ?? [];
      if (names.length === 0) return undefined;
      const parts = names.map((name) => {
        const s = skills.get(name);
        if (!s) return `✓ ${name}`;
        if (deliveredSkills.has(s.name)) return `✓ ${s.name}: ${s.description} (full instructions provided earlier)`;
        return `✓ ${s.name}: ${s.description}\n  Instructions:\n  ${s.instructions}`;
      });
      for (const name of names) {
        const s = skills.get(name);
        if (s) deliveredSkills.add(s.name);
      }
      return parts.join('\n\n');
    };

    let contextNote = '';
    if (ledger.data.mode === 'standard') {
      const contextBudget = effortPlan.contextBudget;
      // Retrieval sees the criteria and their pinned verification commands,
      // not just the one-line goal — they name concrete APIs/files the goal
      // wording often omits.
      const retrievalTexts = [
        ...ledger.data.acceptanceCriteria.map((c) => c.text),
        ...ledger.data.acceptanceCriteria.map((c) => c.verification ?? ''),
      ].filter(Boolean);
      // Hybrid retrieval: lexical/IDF + embedding cosine when an embeddings
      // endpoint is configured; silent fallback otherwise.
      const { pack, semantic } = await context.buildPackHybrid(goal, contextBudget, retrievalTexts, resolveEmbedder());
      if (semantic) this.emit('context  semantic retrieval active (embeddings + lexical blend)');
      ledger.data.contextPack = pack;
      ledger.data.contextPack = pack;
      contextNote = `CONTEXT PACK (ranked, role-labeled, budgeted):\n${context.renderPackWithContent(pack)}`;
      this.emit(
        `context  ${pack.primaryFiles.length} primary, ${pack.testFiles.length} test files selected ` +
          `(${this.config.contextWindowTokens ? `${this.config.contextWindowTokens} token model window; ` : ''}${pack.budget.maxBytes} character source budget)`,
      );
    }

    const messages: LlmMessage[] = [
      {
        role: 'system',
        content: buildSystemPrompt(guard, memory, {
          scopeFiles: this.config.scopeFiles,
          extraConstraints: this.config.extraConstraints,
          skillsSection: skills.renderForPrompt(ledger.data.activeSkills),
          agentsSection: this.config.agentsSection,
          mcpSection: this.config.mcp
            ? this.config.mcp.servers().map((s) => `- mcp server "${s.name}" (${s.command})`).join('\n') || undefined
            : undefined,
          lspSection: lsp.hasServers()
            ? lsp
                .status()
                .filter((s) => s.configured)
                .map((s) => `- ${s.server} server → lsp tools for: ${s.languageIds.join(', ')}`)
                .join('\n')
            : undefined,
          vision: this.config.supportsImages ?? false,
          hasBrowser: this.config.browser ? this.config.browser.available() : false,
          autoLearn: this.config.autoLearn ?? true,
          uiTask: isFrontendGoal(goal),
        }),
      },
    ];
    if (ledger.data.mode !== 'chat') {
      const strategy = buildTaskStrategySection(resumeNote ?? goal, lsp.hasServers());
      if (strategy) messages.push({ role: 'user', content: strategy });
    }
    if (contextNote) messages.push({ role: 'user', content: contextNote });
    if (this.config.conversationHistory?.length) {
      messages.push(...this.config.conversationHistory);
    }
    if (this.config.images && this.config.images.length > 0) {
      if (this.config.supportsImages) {
        const parts: LlmContentPart[] = [
          { type: 'text', text: `The user attached ${this.config.images.length} image(s) relevant to the task. Inspect them carefully and ground your work in what they show.` },
        ];
        for (const img of this.config.images) {
          parts.push({ type: 'image_url', image_url: { url: img.dataUrl } });
        }
        messages.push({ role: 'user', content: parts });
        this.emit(`images   ${this.config.images.length} user image(s) attached`);
      } else {
        messages.push({
          role: 'user',
          content: `The user attached ${this.config.images.length} image(s), but the current model does not support images; they were not delivered. Suggest a vision-capable model if visual input is essential.`,
        });
        this.emit('images   skipped — model does not support images');
      }
    }
    if (resumeNote && ledger.data.mode !== 'chat') {
      messages.push({
        role: 'user',
        content:
          `FOLLOW-UP MESSAGE in an ongoing session. The user wrote:\n"${resumeNote}"\n` +
          `If the user asks to continue, resume, finish, proceed, or keep working — or the existing task is unfinished — resume the existing task immediately. Review the ledger and take the next useful action; do not return a chat-only completion. ` +
          `If they clearly request a change, update the acceptance criteria/plan as needed and execute it, reusing what was already built. ` +
          `Only when this is purely a comment, thanks, opinion, or question with no request to continue work may you answer briefly and end with {"type":"complete","summary":"<your short conversational reply>","chat":true}.`,
      });
    }

    if (
      resumeNote &&
      ledger.data.mode !== 'chat' &&
      ledger.data.acceptanceCriteria.length > 0 &&
      ledger.data.acceptanceCriteria.every((criterion) => criterion.satisfied)
    ) {
      messages.push({
        role: 'user',
        content:
          'The earlier scope is fully satisfied. If this follow-up asks for different work, keep this task and use add_criteria followed by append_plan. ' +
          'Do not erase prior criteria/evidence and do not request_block just because the earlier scope is complete.',
      });
    }

    if (ledger.data.mode === 'chat') {
      ledger.setStatus('executing');
      this.emit('think  composing answer');
      messages.push({
        role: 'user',
        content: `User request (chat mode — answer directly and helpfully in plain text only; no tools, no JSON): ${resumeNote ?? goal}`,
      });
      const reply = await llm.completeStream(
        messages,
        { effort: effortPlan.llmEffort ?? this.config.effort },
        createProseStreamer((chunk) => this.emit(`tdelta ${chunk}`)),
      );
      const parsedReply = parseReplyAction(reply);
      const cutAt = proseCutIndex(reply);
      const prose = (parsedReply && cutAt >= 0 ? reply.slice(0, cutAt) : reply).trim();
      if (prose) this.emit(`say ${prose}`);
      ledger.setStatus('completed');
      const report = reporter.build(ledger, 'complete', {
        summary: prose.slice(0, 600) || 'Answered.',
        risks: [],
        followUps: [],
      });
      ledger.data.report = report;
      ledger.save();
      this.emit('done     completed — chat answer delivered');
      return { ledger, report };
    }

    ledger.setStatus('planning');

    // Token telemetry: attribute every call's input to its source so token
    // spend can be diagnosed. Everything pushed so far (system prompt,
    // strategy, context pack, resumed conversation, user images) forms the
    // byte-stable prefix that providers can prefix-cache across turns.
    const telemetry = new RunTelemetry();
    let prefixEnd = messages.length;
    if (ledger.data.contextPack) {
      telemetry.filesInContextPack =
        ledger.data.contextPack.primaryFiles.length +
        ledger.data.contextPack.testFiles.length +
        ledger.data.contextPack.relatedFiles.length +
        ledger.data.contextPack.configFiles.length;
    }
    // Explicit technology requirements bound this whole run: decisions and
    // their audits are checked against them.
    const explicitTech = detectExplicitTechnologies([
      goal,
      resumeNote ?? '',
      ...ledger.data.acceptanceCriteria.map((c) => c.text),
      ...ledger.data.constraints,
    ]);

    let invalidStreak = 0;
    let loopBlocks = 0;
    let followUpCriteriaAdded = false;
    let architectureAuditRejections = 0;
    let planningNudged = false;
    const malformed = new MalformedCallTracker();
    const actionsAtStart = ledger.data.actions.length;
    let exitReason: 'complete' | 'blocked' | 'stalled' = 'stalled';
    let completionInput: { summary: string; risks: string[]; followUps: string[] } | undefined;

    // Adaptive effort enforcement (P1 — effort planner): the plan sets a turn
    // budget and a specialist budget. The turn budget is DYNAMIC: it extends
    // itself whenever the run keeps producing verified progress (evidence,
    // satisfied criteria, completed steps, changed files) and only stalls when
    // turns are being spent without any of those moving.
    const effortMaxTurns = effortPlan?.maxTurns ?? Number.MAX_SAFE_INTEGER;
    const effortMaxSpecialists = effortPlan?.maxSpecialists ?? Number.MAX_SAFE_INTEGER;
    const BUDGET_EXTENSIONS_MAX = 4;
    const budgetExtensionTurns = Number.isFinite(effortMaxTurns) ? Math.max(10, Math.ceil(effortMaxTurns / 2)) : 0;
    let budgetCap = effortMaxTurns;
    let budgetExtensions = 0;
    const progressSnapshot = (): { evidence: number; satisfied: number; files: number; todos: number; browses: number } => ({
      evidence: ledger.data.evidence.length,
      satisfied: ledger.data.acceptanceCriteria.filter((c) => c.satisfied).length,
      files: ledger.data.filesChanged?.length ?? 0,
      // Checked todos are real execution progress — they let fine-grained
      // breakdowns keep the dynamic budget alive without new evidence records.
      todos: ledger.data.plan.reduce((n, s) => n + (s.subtasks?.filter((t) => t.done).length ?? 0), 0),
      // Visual-verification turns are real progress on UI work: screenshot /
      // click-through inspection produces no new commands or diffs, but a run
      // that is actively LOOKING at what it built must not be killed mid-QA.
      browses: ledger.data.actions.filter((a) => a.tool === 'browse' && a.status === 'success').length,
    });
    let lastProgress = progressSnapshot();
    let turns = 0;
    let budgetWarned = false;
    let delegateSlotsUsed = 0;
    let visualGateRejections = 0;
    let qualityReviewRejections = 0;
    const effortNote = buildPlanNote(effortPlan, riskPlan);

    const ask = async (note?: string): Promise<ParsedAction | undefined> => {
      messages.push({ role: 'user', content: buildStateMessage(ledger, note, activeSkillsSection()) });
      this.emit('think  reviewing task state and choosing the next action');
      let pending = '';
      let lastFlush = Date.now();
      const flush = (): void => {
        if (pending) this.emit(`tdelta ${pending}`);
        pending = '';
        lastFlush = Date.now();
      };
      const sink = (chunk: string): void => {
        pending += chunk;
        if (pending.length >= 32 || Date.now() - lastFlush > 50) flush();
      };
      let streamer = createProseStreamer(sink);
      const resetProse = (): void => {
        pending = '';
        streamer = createProseStreamer(sink);
      };
      this.abortController = new AbortController();
      let callUsage: LlmUsage | undefined;
      const phase = ledger.data.status === 'intake' || ledger.data.status === 'planning' || ledger.data.status === 'review' ? 'planning' : 'execution';
      const callOpts = () => ({
        effort: effortPlan.llmEffort ?? this.config.effort,
        signal: this.abortController!.signal,
        onUsage: (u: LlmUsage) => {
          callUsage = u;
        },
        onStreamReset: () => {
          // The connection died after partial deltas went out and the LLM
          // client fell back to a full completion. Discard streamed state so
          // the authoritative final text is not overlaid on stale fragments.
          resetProse();
        },
      });
      const callOnce = async (): Promise<string> => {
        const r = await llm.completeStream(messages, callOpts(), (delta) => streamer(delta));
        flush();
        telemetry.recordCall(messages, callUsage, prefixEnd, phase);
        return r;
      };
      const finishParse = (r: string): ParsedAction | undefined => {
        let parsed = parseReplyAction(r);
        const reasoning = llm.lastReasoning;
        // Thinking models under long context sometimes keep the action JSON in
        // the reasoning trace and only emit commentary as visible content.
        if (!parsed && reasoning) parsed = parseReplyAction(reasoning);
        return parsed;
      };
      let reply = await callOnce();
      let parsed = finishParse(reply);
      // Rescue retry for RETRYABLE failures only. Under saturated context the
      // model often returns an EMPTY completion, or prose followed by JSON cut
      // off mid-object by the output limit — both previously burned a whole
      // wasted turn each and spiraled into 6-in-a-row stalls. One targeted
      // retry with a corrective note breaks that loop; genuine protocol errors
      // still fall through to the streak counter below.
      if (!parsed && !this.aborted) {
        const badKind = classifyBadReply(reply);
        if (badKind) {
          telemetry.noteWastedCall();
          const note =
            badKind === 'empty'
              ? '[RETRY] Your previous response was EMPTY (no content at all). Respond again now: one short sentence of prose, then EXACTLY one complete JSON action object.'
              : '[RETRY] Your previous response was cut off mid-JSON (output length limit). Respond AGAIN with ONLY the JSON action object — no prose before it, keep thought brief so it fits.';
          this.emit(`recover ${badKind === 'empty' ? 'empty completion' : 'truncated action JSON'} — retrying once`);
          messages.push({ role: 'user', content: note });
          resetProse();
          reply = await callOnce();
          parsed = finishParse(reply);
        }
      }
      const cutAt = proseCutIndex(reply);
      const prose = (cutAt >= 0 ? reply.slice(0, cutAt) : '').trim();
      if (prose) this.emit(`say ${prose}`);
      messages.push({ role: 'assistant', content: reply });
      if (!parsed) {
        invalidStreak += 1;
        telemetry.noteWastedCall();
        malformed.note('unparseable');
        logParseFailure(ledger.data.taskId, reply, llm.lastReasoning);
        this.emit(`warn    response had no executable action (streak ${invalidStreak}) — raw reply saved to logs/parse-failures.log`);
      } else {
        invalidStreak = 0;
      }
      return parsed;
    };

    const observe = (content: string | LlmContentPart[]): void => {
      messages.push({ role: 'user', content });
      const lengthBefore = messages.length;
      if (compactHistory(messages, (t) => this.emit(t))) {
        telemetry.noteCompaction();
        // Compaction removes messages[1..keepFrom) and inserts the digest at
        // index 1, shifting every retained message. The prefix boundary must
        // move with it — otherwise later calls misattribute live history as a
        // stable cached prefix and stripStaleImages silently skips.
        prefixEnd = shiftPrefixEndAfterCompaction(prefixEnd, lengthBefore - COMPACT_KEEP_RECENT);
      }
    };

    try {
    mainLoop: for (;;) {
      if (this.aborted) {
        ledger.addBlocker('Stopped by user.');
        exitReason = 'blocked';
        break;
      }

      // Adaptive effort: the turn budget is a floor, not a cliff. Keep going
      // while verified progress continues; stall only when turns are spent
      // without anything verifiable moving.
      if (turns >= budgetCap) {
        const now = progressSnapshot();
        // Only hard outcomes count as progress: bookkeeping like marking a
        // plan step done must not keep an aimless run alive on its own. Active
        // browser verification (screenshots, click-throughs) counts too — it is
        // how frontend work proves anything.
        const progressing =
          now.evidence > lastProgress.evidence ||
          now.satisfied > lastProgress.satisfied ||
          now.files > lastProgress.files ||
          now.todos > lastProgress.todos ||
          now.browses > lastProgress.browses;
        if (progressing && budgetExtensions < BUDGET_EXTENSIONS_MAX) {
          budgetExtensions += 1;
          lastProgress = now;
          budgetCap = turns + budgetExtensionTurns;
          this.emit(
            `effort  ${turns} turns in, but verified progress continues — budget extended by ${budgetExtensionTurns} turns (extension ${budgetExtensions}/${BUDGET_EXTENSIONS_MAX})`,
          );
          observe(
            `Your turn budget was extended by ${budgetExtensionTurns} turns because you kept making verified progress. ` +
              'Keep working, but steer toward completing and verifying acceptance criteria rather than exploring.',
          );
        } else {
          ledger.addBlocker(
            `Exhausted the task's effort budget (${turns} turns used` +
              `${budgetExtensions ? `, ${budgetExtensions} extension(s) granted` : ''}) without reaching completion. ` +
              `Retry with effort=high to grant a larger budget, or narrow the task.`,
          );
          exitReason = 'stalled';
          this.emit(`stall   effort budget of ${budgetCap} turns reached without verified progress — stopping`);
          break;
        }
      }

      // Every model exchange costs a turn — including replies with no usable
      // action — so a garbage spiral is bounded by the same dynamic budget.
      turns += 1;
      const warnAt = Math.max(1, Math.floor(budgetCap * 0.66));
      if (!budgetWarned && turns >= warnAt && turns < budgetCap) {
        budgetWarned = true;
        this.emit(
          `effort  ${turns}/${budgetCap} turns used — about ${budgetCap - turns} left; wrap up verified work if you can`,
        );
      }

      const action = await ask(effortNote);

      if (!action) {
        // No forced stop here: unparseable replies are coached until the model
        // recovers. The dynamic turn budget above is what eventually bounds a
        // model that never recovers, so a rough patch does not kill an
        // otherwise healthy run.
        observe(
          invalidStreak >= 3
            ? `STILL no executable action (${invalidStreak} replies in a row). Stop writing prose. Reply with exactly ONE JSON object and nothing else. ` +
              'If you truly cannot proceed, {"thought":"...","action":{"type":"request_block","reason":"what is blocking you"}} is a valid action.'
            : 'Your last response contained no executable JSON action — describing intentions is not enough. ' +
              'Reply with one short sentence followed by exactly one JSON object on a new line, e.g. ' +
              '{"thought":"...","action":{"type":"tool_call","tool":"list_files","params":{"path":"src"},"reason":"...","expected":"..."}}',
        );
        if (invalidStreak >= 3) {
          this.emit(`warn    ${invalidStreak} replies in a row had no executable action — final instruction repeated`);
        }
        continue;
      }

      switch (action.type) {
        case 'set_criteria': {
          const criteriaAlreadySet = ledger.data.acceptanceCriteria.length > 0;
          const hasEvidence = ledger.data.evidence.length > 0;
          if (userCriteriaProvided) {
            observe(
              'Acceptance criteria were provided by the user and are immutable. Work against the existing criteria; do not redefine them.',
            );
            break;
          }
          if (criteriaAlreadySet && (hasEvidence || ledger.data.planApproved)) {
            const completedScope = ledger.data.acceptanceCriteria.every((criterion) => criterion.satisfied);
            if (resumeNote && completedScope) {
              const added = ledger.appendCriteria(action.criteria);
              if (added.length > 0) {
                followUpCriteriaAdded = true;
                this.emit('criteria added ' + added.map((criterion) => '"' + criterion.text + '"').join('; '));
                observe(
                  'The previous scope is complete. Added ' +
                    added.length +
                    ' acceptance criterion/criteria for this follow-up work. Now use append_plan with small, verifiable steps for the new scope.',
                );
              } else {
                observe('Those follow-up criteria are already recorded. Use append_plan for the remaining work, or continue the current plan.');
              }
              break;
            }
            observe(
              'Criteria are locked once a plan is approved or evidence is recorded; they cannot be redefined. ' +
                'For a new scope in a resumed completed task, use add_criteria instead; otherwise continue working against them.',
            );
            break;
          }
          ledger.setCriteria(action.criteria);
          this.emit(`criteria ${action.criteria.map((c) => `"${c}"`).join('; ')}`);
          observe('Criteria recorded. Now propose a plan (set_plan) with small, verifiable steps.');
          break;
        }
        case 'add_criteria': {
          if (!resumeNote) {
            observe('add_criteria is for a new scope in a resumed task. Use set_criteria for a new task.');
            break;
          }
          const added = ledger.appendCriteria(action.criteria);
          if (added.length === 0) {
            observe('Those criteria are already recorded. Use append_plan for the remaining work.');
            break;
          }
          followUpCriteriaAdded = true;
          this.emit('criteria added ' + added.map((criterion) => '"' + criterion.text + '"').join('; '));
          observe(
            'Added ' +
              added.length +
              ' follow-up acceptance criterion/criteria while preserving the earlier completed scope. Now use append_plan with small, verifiable steps.',
          );
          break;
        }
        case 'set_plan':
        case 'append_plan': {
          const append = action.type === 'append_plan' || followUpCriteriaAdded;
          if (append) ledger.appendPlan(action.steps);
          else ledger.setPlan(action.steps);
          checkpoints.snapshot(ledger, append ? 'follow-up-plan' : 'plan', append ? 'follow-up plan created' : 'plan created');
          this.emit('plan     ' + action.steps.length + (append ? ' follow-up' : '') + ' steps');
          if (this.config.requirePlanReview && this.config.planReviewHandler && !ledger.data.planApproved) {
            ledger.setStatus('review');
            this.emit('plan-review waiting for user review');
            const decision = await this.config.planReviewHandler({
              criteria: ledger.data.acceptanceCriteria.map((c) => c.text),
              steps: append ? ledger.data.plan.map((step) => ({ description: step.description, verification: step.verification })) : action.steps,
            });
            if (decision.criteria && decision.criteria.length > 0) ledger.setCriteria(decision.criteria);
            if (decision.steps && decision.steps.length > 0) ledger.setPlan(decision.steps);
            if (decision.approved) {
              ledger.data.planApproved = true;
              ledger.save();
              ledger.setStatus('executing');
              this.emit('plan approved — switching to build');
              observe('The user reviewed and approved the plan. Execute the approved plan one step at a time; verify with commands.');
            } else {
              ledger.setStatus('planning');
              this.emit(`plan-review changes requested: ${decision.note ?? '(no note)'}`);
              observe(
                `The user reviewed the plan and requested changes: ${decision.note || '(no note)'}\n` +
                  `Revise the plan with set_plan. Keep it small, reversible, and verifiable.`,
              );
            }
          } else {
            ledger.setStatus('executing');
            // Soft planning-quality nudge — once per run, never a hard gate:
            // richer design/breakdown helps multi-surface work, but simple
            // tasks should not pay for ceremony.
            const areas = new Set(action.steps.map((s) => s.area).filter(Boolean));
            const wantsDesign = effortPlan.complexity !== 'low' && !ledger.data.planDesign && !planningNudged;
            const wantsTodos = effortPlan.complexity !== 'low' && action.steps.length >= 3 && !action.steps.some((s) => s.subtasks?.length);
            let note = 'Plan recorded. Execute one step at a time. Verify with commands; evidence ids will be reported.';
            if (wantsDesign || wantsTodos) {
              planningNudged = true;
              const tips: string[] = [];
              if (wantsDesign) {
                tips.push(
                  `no DESIGN recorded yet${areas.size >= 2 ? ` and this plan spans ${[...areas].join(' + ')}` : ''} — consider set_design with bounded frontend/backend/integration notes before building`,
                );
              }
              if (wantsTodos) {
                tips.push('consider revising key steps (revise_step) to add small todo subtasks so progress is verifiable incrementally');
              }
              note += `\nPLANNING NOTE: ${tips.join('; ')}. This is guidance, not a blocker.`;
            }
            observe(note);
          }
          break;
        }
        case 'set_hypothesis': {
          ledger.data.currentHypothesis = action.text;
          ledger.save();
          this.emit(`hypothesis ${action.text.slice(0, 120)}`);
          observe('Hypothesis recorded. Proceed with the next action.');
          break;
        }
        case 'set_design': {
          ledger.setPlanDesign(action.design);
          const present = [
            action.design.frontend ? `frontend(${action.design.frontend.length})` : '',
            action.design.backend ? `backend(${action.design.backend.length})` : '',
            action.design.integration ? `integration(${action.design.integration.length})` : '',
          ].filter(Boolean);
          this.emit(`design   recorded: ${present.join(' ')}`);
          observe(
            'DESIGN RECORDED and pinned to task state (shown in compact form each turn; use show_plan for full detail). ' +
              'Now break the work into SMALL todo-sized steps grouped by area (frontend/backend/...), each with concrete subtasks and a real verification.',
          );
          break;
        }
        case 'revise_step': {
          const revised = ledger.reviseStep(
            action.stepId,
            { description: action.description, verification: action.verification, area: action.area, addSubtasks: action.addSubtasks },
            action.reason,
          );
          if (!revised) {
            observe(`Cannot revise: unknown step "${action.stepId}". Use show_plan to see current step ids.`);
            break;
          }
          this.emit(`replan   ${action.stepId} revised — ${action.reason.slice(0, 90)}`);
          observe(
            `STEP REVISED (${action.stepId}) — reason recorded in the revision log. Continue with the UPDATED step only; do not replan unrelated steps.`,
          );
          break;
        }
        case 'toggle_todo': {
          const ok = ledger.toggleSubtask(action.stepId, action.index, action.done);
          if (!ok) {
            observe(`Cannot update todo #${action.index} of ${action.stepId}: out of range. Use show_plan if unsure.`);
            break;
          }
          const step = ledger.step(action.stepId)!;
          const todo = step.subtasks?.[action.index];
          this.emit(
            step.status === 'done'
              ? `step     ${action.stepId} done (all todos checked)`
              : `todo     ${action.stepId}[${action.index}] ${todo?.done ? '✓' : '·'} ${(todo?.text ?? '').slice(0, 60)}`,
          );
          observe('Noted.');
          break;
        }
        case 'show_plan': {
          observe(renderFullPlanMessage(ledger));
          break;
        }
        case 'record_decision': {
          const conflicts = decisionConflicts(action, explicitTech.required);
          if (conflicts.length > 0) {
            observe(
              `DECISION REJECTED — it conflicts with an explicit requirement:\n${conflicts.map((c) => `  - ${c}`).join('\n')}\n` +
                `Record a decision that honors the explicit requirement (or ask the user to change it).`,
            );
            break;
          }
          const superseded = action.supersedes ?? (ledger.activeArchitectureDecisions().length === 1 ? ledger.activeArchitectureDecisions()[0]!.id : undefined);
          const record = ledger.recordArchitectureDecision(action);
          this.emit(`decision ${record.id} — ${record.decision.slice(0, 100)}`);
          observe(
            `ARCHITECTURE DECISION RECORDED (${record.id})${superseded && superseded !== record.id ? `, superseding ${superseded}` : ''}: ${record.decision}\n` +
              `It is now part of the task state and will be checked against the implementation at completion. ` +
              `Implement accordingly; if you change course later, record a new decision with supersedes.`,
          );
          break;
        }
        case 'tool_call': {
          if (ledger.data.acceptanceCriteria.length === 0) {
            observe('No acceptance criteria exist yet. Use set_criteria first.');
            break;
          }
          const outcome = await executor.execute({
            tool: action.tool,
            params: action.params,
            reason: action.reason,
            expected: action.expected,
            stepId: action.stepId,
          });

          const malformedKind = malformedKindFor(outcome.result.errorSignature);
          const malformedVerdict = malformedKind ? malformed.note(malformedKind) : (malformed.reset(), undefined);

          if (outcome.blockedByLoop) {
            loopBlocks += 1;
            memory.add({
              type: 'failure',
              claim: `Repeated failure on ${outcome.record.paramsSummary}: ${action.reason}`,
              scope: guard.lock.name,
              confidence: 0.8,
            });
            if (loopBlocks >= 3) {
              ledger.addBlocker('Three loop-prevention blocks occurred; task escalated.');
              exitReason = 'blocked';
              observe(outcome.result.output);
              break;
            }
            observe(outcome.result.output);
            break;
          }
          if (outcome.deniedByPolicy) {
            observe(outcome.result.output);
            break;
          }

          let evidenceNote = '';
          if (action.tool === 'run_command') {
            const kind = classifyEvidenceKind(String(action.params['command'] ?? ''));
            const currentFp = await getWorkspaceFingerprint(guard.lock.repoRoot);
            const ev = evidence.record(ledger.data, {
              kind,
              label: action.expected || String(action.params['command']),
              command: String(action.params['command']),
              exitCode: outcome.result.exitCode,
              passed: outcome.result.ok,
              output: outcome.result.output,
              workspaceFingerprint: currentFp,
            });
            ledger.save();
            evidenceNote = `\nEVIDENCE RECORDED: ${ev.id} [${ev.passed ? 'PASS' : 'FAIL'}] (${kind}). You may cite it with claim_criterion.`;
            this.emit(`evidence ${ev.id} ${ev.passed ? 'PASS' : 'FAIL'} (${kind})`);
          }

          if (action.tool === 'browse' && outcome.result.image) {
            this.emit(`browseshot ${outcome.result.image}`);
          }

          // Track every skill the model actually loads so continuations and the
          // report can show which reusable knowledge drove the task.
          if (action.tool === 'use_skill' && outcome.result.ok) {
            const skillName = String(action.params['name'] ?? '').trim();
            if (skillName) {
              ledger.addUsedSkill(skillName);
              this.emit(`skill    used "${skillName}"`);
            }
          }

          if (action.stepId && outcome.result.ok) {
            const step = ledger.step(action.stepId);
            if (step && step.status === 'in_progress') {
              ledger.updateStep(action.stepId, { status: 'done' });
              checkpoints.snapshot(ledger, action.stepId, step.description.slice(0, 60));
            }
          } else if (!action.stepId && action.tool === 'run_command' && outcome.result.ok) {
            // Models frequently omit stepId. When a verification command passes,
            // auto-complete every open plan step that names exactly this
            // command as its verification — otherwise plans silently never
            // progress even though the work was verified.
            const cmd = String(action.params['command'] ?? '');
            if (cmd.trim()) {
              for (const step of ledger.data.plan) {
                if (step.status === 'done' || !step.verification) continue;
                if (commandsMatch(step.verification, cmd)) {
                  ledger.updateStep(step.id, { status: 'done' });
                  checkpoints.snapshot(ledger, step.id, step.description.slice(0, 60));
                  this.emit(`step     ${step.id} done — verification "${cmd}" passed`);
                }
              }
            }
          }

          // LSP post-edit gate: after any successful edit, surface diagnostics
          // for the touched files so introduced errors are caught at the source
          // instead of at the evidence gate. Silently skipped when no language
          // server is configured for the file (LSP stays optional).
          let lspNote = '';
          if ((action.tool === 'write_file' || action.tool === 'apply_edit') && outcome.result.ok) {
            const touched = outcome.result.filesTouched ?? [];
            const issues: string[] = [];
            for (const file of touched) {
              const diag = await lsp.diagnostics(file);
              if (diag.ok && /^\[(ERROR|WARNING)\]/m.test(diag.output)) {
                issues.push(diag.output);
              }
            }
            if (issues.length > 0) {
              lspNote = `\nLSP DIAGNOSTICS (post-edit check):\n${issues.join('\n\n')}`;
              this.emit(`lsp      post-edit diagnostics: issues in ${issues.length} file(s) — fix before the evidence gate`);
            }
          }

          // Failed commands get the failure DIGEST (error lines + tail) rather
          // than a head slice that typically misses the actual cause.
          const outputForModel = outcome.result.ok
            ? outcome.result.output.slice(0, 2500)
            : `${extractFailureDigest(outcome.result.output)}${outcome.result.output.length > 2500 ? `\n[... ${outcome.result.output.length} chars total; showing failure-relevant lines]` : ''}`;
          let observedResult = `RESULT [${outcome.result.ok ? 'success' : 'error'}] ${outcome.record.paramsSummary}\n${outputForModel}${evidenceNote}${lspNote}`;
          telemetry.noteToolCall();
          if (!outcome.result.ok) {
            // Targeted failure recovery: hand back the compact state needed to
            // diagnose THIS failure — not a replay of the whole conversation.
            const openCriteria = ledger.data.acceptanceCriteria.filter((c) => !c.satisfied);
            const recentFiles = ledger.data.filesChanged.slice(-5);
            observedResult +=
              `\nRECOVERY (targeted, not the full history):\n` +
              `  failure: ${outcome.record.paramsSummary}\n` +
              (outcome.record.errorSignature ? `  signature: ${outcome.record.errorSignature}\n` : '') +
              (openCriteria.length ? `  open criteria: ${openCriteria.map((c) => `${c.id}:${c.text}`).join('; ').slice(0, 300)}\n` : '') +
              (recentFiles.length ? `  files in play: ${recentFiles.join(', ')}\n` : '') +
              `  Next: form a new hypothesis about this specific error, make a targeted fix, then re-verify.`;
          }
          if (malformedVerdict) {
            if (malformedVerdict.remind && !malformedVerdict.escalate) {
              this.emit(`warn    malformed call streak ${malformedVerdict.streak}/6 — schema errors repeating`);
            } else if (malformedVerdict.escalate && !malformedVerdict.halt) {
              this.emit(`warn    malformed call streak ${malformedVerdict.streak}/6 — strategy change injected`);
              observedResult = `${observedResult}\n${malformedIntervention(malformedVerdict.streak, action.tool)}`;
            } else if (malformedVerdict.halt) {
              memory.add({
                type: 'failure',
                claim: `Repeated malformed tool calls (${malformedVerdict.streak}×): ${action.tool}`,
                scope: guard.lock.name,
                confidence: 0.8,
              });
              ledger.addBlocker(`LLM produced ${malformedVerdict.streak} consecutive malformed tool calls (${action.tool}); task stalled.`);
              exitReason = 'stalled';
              this.emit('stall   malformed-call spiral detected — stopping');
              observe(`${observedResult}\n${malformedIntervention(malformedVerdict.streak, action.tool)}`);
              break mainLoop;
            }
          }
          const img = outcome.result.image;
          const imgValid = typeof img === 'string' && /^data:image\/(png|jpe?g|webp);base64,[A-Za-z0-9+/=]{200,}$/.test(img);
          if (imgValid && this.config.supportsImages) {
            // Older screenshots are cost, but keeping ONLY the newest destroyed
            // cross-page/state consistency on frontend runs: the model could
            // never compare what it changed against what it built before. Keep
            // the most recent few (plus user attachments in the stable prefix,
            // which are always preserved).
            const dropped = stripStaleImages(messages, KEEP_RECENT_SCREENSHOTS, prefixEnd);
            if (dropped > 0) this.emit(`image    dropped ${dropped} stale screenshot(s) from model context`);
            telemetry.noteScreenshot(img!.length - img!.indexOf(',') - 1);
            observe([
              { type: 'text', text: observedResult },
              { type: 'image_url', image_url: { url: img! } },
            ]);
            this.emit('image    visual result attached to model context');
          } else if (img) {
            observe(`${observedResult}\n(A screenshot was captured but is not deliverable to the current model${this.config.supportsImages ? ' (invalid image data)' : ' (no image support)'}; it is visible in the desktop Browser panel.)`);
          } else {
            observe(observedResult);
          }
          break;
        }
        case 'claim_criterion': {
          const currentFp = await getWorkspaceFingerprint(guard.lock.repoRoot);
          const link = evidence.link(ledger.data, action.criterionId, action.evidenceId, currentFp);
          ledger.save();
          this.emit(`claim    ${action.criterionId} <- ${action.evidenceId}: ${link.ok ? 'accepted' : link.reason}`);
          if (link.ok) {
            const criterion = ledger.data.acceptanceCriteria.find((c) => c.id === action.criterionId);
            const evidenceRecord = ledger.data.evidence.find((e) => e.id === action.evidenceId);
            const weak =
              criterion && evidenceRecord && isWeakEvidenceLink(criterion, evidenceRecord)
                ? '\nNOTE: weakly bound — this criterion pins no verification command, so any passing command would satisfy it. Pin it with a real verification command for hard proof.'
                : '';
            observe(`Accepted: ${link.reason}${weak}`);
          } else {
            observe(`Rejected: ${link.reason}`);
          }
          break;
        }
        case 'complete': {
          const currentFp = await getWorkspaceFingerprint(guard.lock.repoRoot);
          const gate = evidence.gate(ledger.data, currentFp);
          const chatOnly = Boolean(action.chat) && ledger.data.actions.length === actionsAtStart;
          if (!gate.open && !chatOnly) {
            observe(
              `COMPLETION REJECTED by evidence gate (${gate.satisfiedCount}/${gate.totalCount} criteria backed).\n` +
                `Still missing:\n${gate.missing.map((m) => `  - ${m}`).join('\n')}\n` +
                `Continue working, or request_block if you cannot proceed.`,
            );
            break;
          }
          // Visual-verification gate: UI work is only done when the final state
          // was actually SEEN. Command evidence cannot see pixels, so without
          // this gate broken/unfinished layouts ship as "complete". Soft-capped
          // like the architecture audit so it can never deadlock a task.
          const visual = uiVisualGate(ledger.data, { browserAvailable: Boolean(this.config.browser?.available()) });
          if (!visual.verified && !chatOnly) {
            if (visualGateRejections < 2) {
              visualGateRejections += 1;
              observe(
                `COMPLETION REJECTED by visual-verification gate — ${visual.reason}.\n` +
                  `Serve or rebuild the app (run_command), browse navigate to it, take a screenshot of every changed view ` +
                  `(and exercise interactions with click/type where relevant), confirm layout, content, and states look right, then complete again.`,
              );
              break;
            }
            this.emit('visual-gate screenshot requirement unmet — overriding after repeated rejections');
            action.risks = [
              ...(action.risks ?? []),
              'Final UI state was never verified with a screenshot',
            ];
          }
          // Architecture audit: verify the implementation actually follows the
          // recorded decisions. A soft gate — after two rejections the agent's
          // judgment wins so this can never deadlock a legitimate task.
          if (!chatOnly && (ledger.data.architectureDecisions ?? []).some((d) => d.status === 'active')) {
            const audit = auditArchitecture(ledger.data, guard.lock.repoRoot);
            if (!audit.ok && architectureAuditRejections < 2) {
              architectureAuditRejections += 1;
              observe(
                `COMPLETION REJECTED by architecture review — the implementation does not match the recorded decision(s):\n` +
                  `${audit.issues.map((i) => `  - ${i}`).join('\n')}\n` +
                  `Either bring the implementation in line with the decision, or record a new decision (record_decision with supersedes) explaining the change, then complete again.`,
              );
              break;
            }
            if (!audit.ok) {
              this.emit('decision architecture drift noted but overridden by engineering judgment — recorded as a risk');
              action.risks = [
                ...(action.risks ?? []),
                `Architecture drift: ${audit.issues[0]?.slice(0, 200)}`,
              ];
            }
          }
          // Final quality review: a strict second-opinion pass over the finished
          // work — diff summary + criteria, and for UI tasks the last screenshot
          // judged by the model itself (vision), closing the "nobody looks at
          // the pixels" gap. Fail-open: errors or ambiguous verdicts accept
          // completion, and only ONE forced revision is possible so this can
          // never deadlock a legitimate task.
          const wantsReview = !chatOnly && this.config.mode !== 'chat' && qualityReviewRejections < 1;
          if (wantsReview) {
            try {
              const diffStat = await gitExec(guard.lock.repoRoot, ['diff', 'HEAD', '--stat']).catch(() => '');
              const reviewMsgs = buildQualityReviewMessages({
                goal,
                criteria: ledger.data.acceptanceCriteria.map((c) => c.text),
                filesChanged: ledger.data.filesChanged ?? [],
                diffStat,
                summary: action.summary,
                screenshotUrl: isUiTask(ledger.data) ? findLastScreenshotUrl(messages) : undefined,
              });
              const reviewReply = await llm.completeStream(reviewMsgs, { effort: 'low', signal: this.abortController?.signal }, () => {});
              telemetry.recordCall(reviewMsgs, undefined, 0, 'planning');
              const review = parseReviewVerdict(reviewReply);
              if (review.verdict === 'revise') {
                qualityReviewRejections += 1;
                this.emit(`review   quality reviewer flagged the result — one revision requested`);
                observe(
                  `COMPLETION REJECTED by final quality review. Issues found:\n${review.feedback}\n` +
                    `Fix these problems, then call complete again. If you already addressed them or disagree with the review, call complete again — it will be accepted.`,
                );
                break;
              }
            } catch {
              // Reviewer unavailable (no vision, provider error) → fail open.
            }
          }
          completionInput = {
            summary: action.summary,
            risks: action.risks ?? [],
            followUps: action.followUps ?? [],
          };
          exitReason = 'complete';
          break;
        }
        case 'ask_user': {
          if (this.config.askUserHandler) {
            this.emit(`ask-user ${action.questions.length} question(s) for you`);
            const answer = await this.config.askUserHandler(action.questions);
            this.emit('ask-user answered');
            observe(`User answered your clarifying questions:\n${answer}\nUse these answers to set criteria and plan.`);
          } else {
            observe('No interactive user is available. State explicit assumptions with set_hypothesis and proceed.');
          }
          break;
        }
        case 'parallel': {
          this.emit(`parallel ${action.calls.length} concurrent tool calls`);
          // The in-app browser is stateful: only one state-changing browser
          // operation may run at a time.  Non-browser tools stay parallel;
          // browser calls are serialized afterwards so a click/type/screenshot
          // sequence never races against itself.
          const browserCalls: { call: typeof action.calls[number]; index: number }[] = [];
          const otherCalls: { call: typeof action.calls[number]; index: number }[] = [];
          action.calls.forEach((call, index) => {
            (call.tool === 'browse' ? browserCalls : otherCalls).push({ call, index });
          });
          const outcomes: (Awaited<ReturnType<typeof executor.execute>> | undefined)[] = new Array(action.calls.length);
          const runOne = async (call: typeof action.calls[number], index: number): Promise<void> => {
            // Batched calls are real tool executions too; without this every
            // parallel turn undercounts tokenTelemetry.toolCalls.
            telemetry.noteToolCall();
            outcomes[index] = await executor.execute({
              tool: call.tool,
              params: call.params,
              reason: call.reason,
              expected: call.expected,
            });
          };
          await Promise.all(otherCalls.map(({ call, index }) => runOne(call, index)));
          for (const { call, index } of browserCalls) {
            await runOne(call, index);
            this.emit(`browser action serialized — one state-changing operation at a time`);
          }
          const currentFp = await getWorkspaceFingerprint(guard.lock.repoRoot);
          const parts = outcomes.map((o, i) => {
            if (!o) return `[${i + 1}] (not executed)`;
            if (o.record.tool === 'run_command') {
              const kind = classifyEvidenceKind(String(action.calls[i]?.params['command'] ?? ''));
              const ev = evidence.record(ledger.data, {
                kind,
                label: o.record.paramsSummary,
                command: String(action.calls[i]?.params['command'] ?? ''),
                exitCode: o.result.exitCode,
                passed: o.result.ok,
                output: o.result.output,
                workspaceFingerprint: currentFp,
              });
              ledger.save();
              this.emit(`evidence ${ev.id} ${ev.passed ? 'PASS' : 'FAIL'} (${kind})`);
            }
            return `[${i + 1}] ${o.record.paramsSummary} → ${o.result.ok ? 'success' : 'error'}\n${o.result.output.slice(0, 1200)}`;
          });
          observe(`PARALLEL RESULTS:\n${parts.join('\n\n')}`);
          break;
        }
        case 'report_finding': {
          const finding = ledger.addFinding({
            claim: action.claim,
            kind: (action.kind as TaskFinding['kind']) ?? 'other',
            severity: action.severity as TaskFinding['severity'],
            location: action.location,
            reproductionCommand: action.reproductionCommand,
          });
          this.emit(`finding  ${finding.id} reported (${finding.kind}) — will be verified before the report`);
          observe(
            `FINDING RECORDED (${finding.id}). It will be handed to an independent verifier that attempts to reproduce it ` +
              `${action.reproductionCommand ? `with exactly: ${action.reproductionCommand}` : 'with its own reproduction attempt'}. ` +
              `Only findings that reproduce with real evidence are reported as confirmed; continue your task.`,
          );
          break;
        }
        case 'request_block': {
          ledger.addBlocker(action.reason);
          exitReason = 'blocked';
          observe(`Block recorded: ${action.reason}`);
          break;
        }
        case 'delegate': {
          // Adaptive effort: never spend beyond the task's specialist budget.
          const remSpec = effortMaxSpecialists - delegateSlotsUsed;
          if (remSpec <= 0) {
            this.emit(`delegate budget exhausted — ${effortMaxSpecialists}/${effortMaxSpecialists} specialists used`);
            observe(
              `SPECIALIST BUDGET EXHAUSTED — you have already used all ${effortMaxSpecialists} specialist delegation(s) for this task. ` +
                `Complete any remaining work with your own tools; do not call delegate again.`,
            );
            break;
          }
          const runTasks =
            action.tasks.length <= remSpec ? action.tasks : action.tasks.slice(0, remSpec);
          const droppedTasks = action.tasks.length - runTasks.length;
          delegateSlotsUsed += runTasks.length;
          this.emit(
            `delegate ${runTasks.length} sub-task(s) to ${runTasks.map((t) => t.agent).join(', ')}${action.background ? ' in background' : ''} ` +
              `(${delegateSlotsUsed}/${effortMaxSpecialists} specialists used)`,
          );
          if (droppedTasks > 0) {
            this.emit(`delegate dropped ${droppedTasks} sub-task(s) over the ${effortMaxSpecialists}-specialist budget`);
            observe(
              `DROPPED ${droppedTasks} delegated sub-task(s): they exceeded the task's ${effortMaxSpecialists}-specialist budget ` +
                `and were not started. Handle that ${droppedTasks} yourself with your own tools instead of delegating again.`,
            );
          }
          // Risk-based steering: keep delegations on the recommended (right-sized)
          // roster for this task's risk. A gentle steer, not a hard block: the
          // model can still justify a different specialist by ignoring the note.
          if (riskPlan && riskPlan.recommendedSpecialists.length > 0) {
            const recommendedNames = new Set(riskPlan.recommendedSpecialists.map((r) => r.agent));
            const stray = runTasks.filter((t) => !recommendedNames.has(t.agent));
            if (stray.length > 0) {
              this.emit(
                `delegate note: ${stray.map((t) => t.agent).join(', ')} not among the ${riskPlan.risk}-risk recommendations`,
              );
              observe(
                `DELEGATION STEERING - ${stray.map((t) => `"${t.agent}"`).join(', ')} not in the recommended roster for this task's ` +
                  `${riskPlan.risk} risk (${riskPlan.recommendedSpecialists.map((r) => `"${r.agent}"`).join(', ')}). ` +
                  `Prefer those specialists unless you have a concrete reason not to.`,
              );
            }
          }
          const outcome = await executor.execute({
            tool: 'delegate',
            params: { tasks: runTasks, background: action.background },
            reason: action.background ? 'background specialist sub-tasks' : 'parallel specialist sub-tasks',
            expected: action.background ? 'tracked background agent jobs' : 'summaries from each agent',
          });
          const output = outcome.result.output;
          const payload = (outcome.result.payload ?? {}) as { results?: SubAgentResult[] };
          const results = payload.results ?? [];

          // P1.1 — Specialist Evidence Inheritance: a specialist's evidence is
          // evidence for Hermes to evaluate, never automatic proof. Each report
          // is revalidated against the exact contract that was delegated; only
          // evidence that passes is mirrored into the MAIN ledger through the
          // EvidenceEngine so the acceptance gate keeps its authority.
          const validationLines: string[] = [];
          if (results.length > 0) {
            for (let j = 0; j < results.length; j++) {
              const r = results[j]!;
              const specs = runTasks[j]?.criteria ?? [];
              const expected = specs.map((spec, k) => ({
                id: `ac-${k + 1}`,
                verification: typeof spec === 'object' ? spec.verification : undefined,
                evidenceType: typeof spec === 'object' ? spec.evidenceType : undefined,
              }));
              const verdict = validateSpecialistEvidence(r.evidenceReport, expected);
              for (const a of verdict.accepted) {
                const mainCriterion = ledger.data.acceptanceCriteria.find((c) => c.id === a.criterionId);
                if (!mainCriterion) {
                  validationLines.push(`  ✗ ${a.criterionId}: main ledger has no criterion ${a.criterionId} to attach specialist evidence to`);
                  this.emit(`delegate-claim ${r.agent} ${a.criterionId}: REJECTED — no matching criterion in the main ledger`);
                  continue;
                }
                const currentFp = await getWorkspaceFingerprint(guard.lock.repoRoot);
                const ev = evidence.record(ledger.data, {
                  kind: a.evidence.kind,
                  label: `delegated: ${r.agent} — ${a.evidence.command ?? a.evidence.id}`,
                  command: a.evidence.command,
                  passed: true,
                  output: a.evidence.outputExcerpt,
                  workspaceFingerprint: currentFp,
                });
                ledger.save();
                const link = evidence.link(ledger.data, a.criterionId, ev.id, currentFp);
                ledger.save();
                if (link.ok) {
                  validationLines.push(`  ✓ ${a.criterionId} backed by ${a.evidenceId} (${a.evidence.command ?? a.evidence.id}) via ${r.agent}`);
                  this.emit(`delegate-claim ${r.agent} ${a.criterionId} <- ${a.evidenceId}: accepted — ${a.evidence.command ?? 'evidence'}`);
                  this.emit(`evidence ${ev.id} PASS (delegated)`);
                } else {
                  validationLines.push(`  ✗ ${a.criterionId}: main ledger rejected the mirror evidence — ${link.reason}`);
                  this.emit(`delegate-claim ${r.agent} ${a.criterionId}: REJECTED by main ledger — ${link.reason}`);
                }
              }
              for (const rej of verdict.rejected) {
                validationLines.push(`  ✗ ${rej.criterionId}${rej.evidenceId ? ` (${rej.evidenceId})` : ''}: ${rej.reason} (via ${r.agent})`);
                this.emit(`delegate-claim ${r.agent} ${rej.criterionId}: REJECTED — ${rej.reason}`);
              }
            }
          }
          const validationText =
            validationLines.length > 0
              ? `\nEVIDENCE VALIDATION (specialist evidence enters the gate only through the main ledger):\n${validationLines.join('\n')}`
              : '';
          observe(`${action.background ? 'BACKGROUND AGENTS' : 'DELEGATE RESULTS'} [${outcome.result.ok ? 'started/ok' : 'some agents failed'}]\n${output.slice(0, 5000)}${validationText}`);
          break;
        }
      }

      while (this.inbox.length > 0) {
        const msg = this.inbox.shift()!;
        this.emit(`user-msg ${msg}`);
        observe(`USER MESSAGE (sent while you were working — take it into account now): ${msg}`);
      }

      if (exitReason === 'complete' || exitReason === 'blocked') break;
    }
    } catch (err) {
      if (!this.aborted) throw err;
    }

    if (this.aborted && exitReason === 'stalled') {
      ledger.addBlocker('Stopped by user.');
      exitReason = 'blocked';
    }

    // ── Finding Verification Gate ──────────────────────────────────────────
    // Before the report is built, every unverified finding must face an
    // independent verifier. Only mechanically-reproduced findings are
    // reported as confirmed; everything else is downgraded explicitly.
    const pendingFindings = (ledger.data.findings ?? []).filter((f) => f.status === 'unverified');
    if (pendingFindings.length > 0) {
      if (this.config.subagents) {
        this.emit(`findings verifying ${pendingFindings.length} finding(s) with independent specialists`);
        for (const finding of pendingFindings) {
          const criteria = finding.reproductionCommand
            ? [{ text: `reproduce: ${finding.claim}`, verification: finding.reproductionCommand, evidenceType: 'command_success' as const }]
            : [{ text: `reproduce: ${finding.claim}` }];
          try {
            const result = await this.config.subagents.runOne(VERIFIER_AGENT, buildVerifierContract(finding), criteria);
            const verdict = verdictForFinding(finding, result);
            ledger.updateFinding(finding.id, {
              status: verdict.status,
              evidenceIds: verdict.evidenceIds,
              verifierSummary: verdict.verifierSummary,
            });
            this.emit(`finding  ${finding.id} [${verdict.status.toUpperCase()}] ${finding.claim.slice(0, 100)}`);
          } catch (err) {
            ledger.updateFinding(finding.id, {
              status: 'unverifiable',
              verifierSummary: `verifier crashed: ${(err as Error).message.slice(0, 200)}`,
            });
            this.emit(`finding  ${finding.id} [UNVERIFIABLE] verifier crashed`);
          }
        }
      } else {
        for (const finding of pendingFindings) {
          ledger.updateFinding(finding.id, {
            status: 'unverifiable',
            verifierSummary: 'no specialist agents configured to verify findings independently',
          });
        }
        this.emit(`findings ${pendingFindings.length} finding(s) left unverifiable — no specialists configured`);
      }
    }

    const status = exitReason === 'complete' ? 'completed' : exitReason === 'blocked' ? 'blocked' : 'failed';
    ledger.setStatus(status);

    // Persist token telemetry so spend can be attributed after the fact.
    const snap = telemetry.snapshot();
    const artifacts = estimatePlanningArtifactTokens(ledger.data);
    ledger.data.tokenTelemetry = { ...snap, ...artifacts };
    ledger.save();
    this.emit(`telemetry ${renderTelemetry(ledger.data.tokenTelemetry)}`);

    const report = reporter.build(ledger, exitReason, completionInput);
    ledger.data.report = report;
    ledger.save();

    if ((this.config.autoLearn ?? true) && exitReason === 'complete') {
      try {
        await this.autoLearn(messages, ledger, executor, skills);
      } catch (err) {
        // The run already completed and the report is saved; a transient
        // failure in this optional reflection pass must not flip the session
        // to errored after the fact.
        this.emit(`warn    post-run learning skipped: ${(err as Error).message}`);
      }
    }

    memory.add({
      type: 'task',
      claim:
        `Task "${goal}" finished as ${status}: ${report.summary}` +
        `${ledger.data.filesChanged.length ? ` Changed files: ${ledger.data.filesChanged.slice(0, 16).join(', ')}.` : ''}` +
        `${ledger.data.evidence.some((e) => e.passed) ? ` Passing checks: ${ledger.data.evidence.filter((e) => e.passed).slice(-4).map((e) => e.label).join('; ')}.` : ''}`,
      evidence: ledger.data.taskId,
      scope: guard.lock.name,
      confidence: 0.9,
    });
    if (status !== 'completed') {
      memory.add({
        type: 'failure',
        claim: `Task "${goal}" did not complete (${status}). Blockers: ${ledger.data.blockers.join('; ') || 'none recorded'}`,
        scope: guard.lock.name,
        confidence: 0.85,
      });
    }

    this.emit(`done     ${status} — ${report.summary.slice(0, 160)}`);
    if (!this.config.lsp) {
      // We created the LSP manager for this run — shut its servers down.
      await lsp.shutdown().catch(() => {});
    }
    return { ledger, report };
  }

  private async autoLearn(
    messages: LlmMessage[],
    ledger: TaskLedger,
    executor: Executor,
    skills: SkillStore,
  ): Promise<void> {
    const d = ledger.data;
    const didWork = d.actions.length > 0 && (d.filesChanged.length > 0 || d.evidence.some((e) => e.passed));
    const alreadyLearned = d.actions.some((a) => a.tool === 'create_skill' && a.status === 'success');
    if (!didWork || alreadyLearned) return;
    this.emit('learn   reflecting on the completed work to extract a reusable skill');
    const existing = skills.list().map((s) => s.name).join(', ') || '(none)';
    messages.push({
      role: 'user',
      content:
        `REFLECTION (auto-learn pass — optional, after a successful task).\n` +
        `Goal: ${d.goal}\nSummary: ${d.report?.summary ?? ''}\nFiles changed: ${d.filesChanged.join(', ') || '(none)'}\n` +
        `Existing skills: ${existing}\n` +
        `If this task revealed a genuinely repeatable multi-step pattern (deploy flow, design convention, checklist, project-specific process), save it as a skill:\n` +
        `{"thought":"...","action":{"type":"tool_call","stepId":"step-1","tool":"create_skill","params":{"name":"kebab-case-name","description":"when to use it","instructions":"step-by-step reusable knowledge"},"reason":"auto-learned from completed task","expected":"skill saved"}}\n` +
        `Otherwise respond with: {"thought":"nothing reusable","action":{"type":"complete","summary":"nothing to learn","chat":true}}`,
    });
    const reply = await this.config.llm.completeStream(
      messages,
      { effort: this.config.effort, signal: this.abortController?.signal },
      () => {},
    );
    messages.push({ role: 'assistant', content: reply });
    const parsed = parseReplyAction(reply);
    if (parsed?.type === 'tool_call' && parsed.tool === 'create_skill') {
      const outcome = await executor.execute({
        tool: 'create_skill',
        params: parsed.params,
        reason: 'auto-learned from completed task',
        expected: 'skill saved',
      });
      ledger.save();
      const name = String(parsed.params['name'] ?? 'skill');
      this.emit(
        outcome.result.ok
          ? `learn   auto-saved skill "${name}"`
          : `learn   could not save skill: ${outcome.result.output.slice(0, 200)}`,
      );
    } else {
      this.emit('learn   nothing new worth saving');
    }
  }
}
