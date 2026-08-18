import { appendFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { ensureHermesHome } from '../workspace/home.js';
import { CheckpointManager } from '../checkpoint/checkpoint.js';
import { CodeIndex } from '../context/code-index.js';
import { ContextEngine, contextBudgetForWindow } from '../context/context-engine.js';
import { EvidenceEngine, classifyEvidenceKind } from '../evidence/evidence.js';
import { Executor } from '../executor/executor.js';
import { ProjectGuard, ProjectGuardError } from '../guard/project-guard.js';
import { TaskLedger } from '../ledger/task-ledger.js';
import { LoopDetector } from '../loop/loop-detector.js';
import {
  extractJson,
  findXmlCallStart,
  parseXmlFunctionCall,
  xmlMarkerHoldBack,
  type LlmClient,
  type LlmContentPart,
  type LlmMessage,
} from '../llm/llm.js';
import { KNOWN_TOOL_NAMES } from '../tools/tools.js';
import { MemoryStore } from '../memory/memory-store.js';
import type { McpManager } from '../mcp/client.js';
import type { ApprovalHandler } from '../policy/policy.js';
import { PolicyEngine } from '../policy/policy.js';
import { Reporter } from '../report/reporter.js';
import { SkillStore } from '../skills/skills.js';
import type { BrowserBridge } from '../browser/browser.js';
import type { SubAgentRunner } from './subagent.js';
import type { CompletionReport, CriterionSpec, EvidenceKind } from '../types.js';
import { buildStateMessage, buildSystemPrompt } from './prompt.js';

export interface HermesConfig {
  cwd: string;
  llm: LlmClient;
  /** Shared code index to reuse (e.g. a watched one owned by the server). */
  index?: CodeIndex;
  mode?: 'fast' | 'standard' | 'chat';
  autoApprove?: boolean;
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
  subagents?: SubAgentRunner;
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

type ParsedAction =
  | { type: 'set_criteria'; criteria: string[] }
  | { type: 'set_plan'; steps: { description: string; verification: string }[] }
  | { type: 'add_criteria'; criteria: string[] }
  | { type: 'append_plan'; steps: { description: string; verification: string }[] }
  | { type: 'set_hypothesis'; text: string }
  | { type: 'tool_call'; tool: string; params: Record<string, unknown>; reason: string; expected: string; stepId?: string }
  | { type: 'claim_criterion'; criterionId: string; evidenceId: string; justification?: string }
    | { type: 'complete'; summary: string; risks?: string[]; followUps?: string[]; chat?: boolean }
  | { type: 'request_block'; reason: string }
  | { type: 'ask_user'; questions: AskUserQuestion[] }
  | { type: 'delegate'; tasks: { agent: string; task: string; criteria?: (string | CriterionSpec)[] }[]; background?: boolean }
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
        .map((s) => ({ description: String(s['description'] ?? ''), verification: String(s['verification'] ?? 'manual check') }))
        .filter((s) => s.description);
      if (parsed.length === 0) return undefined;
      return { type, steps: parsed.slice(0, 15) };
    }
    case 'set_hypothesis':
      if (typeof action['text'] !== 'string') return undefined;
      return { type, text: action['text'] };
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
  'tool_call',
  'claim_criterion',
  'complete',
  'request_block',
  'ask_user',
  'delegate',
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

/**
 * Compact a growing conversation as the run goes: older turns collapse into a
 * single digest while the recent tail stays verbatim. The ledger state message
 * re-emitted on every turn remains authoritative, so compacted details (old
 * tool outputs, stale file dumps) are exactly the noise the model doesn't
 * need — keeping the context small and protocol adherence sharp on long tasks.
 */
export function compactHistory(messages: LlmMessage[], onEvent?: (text: string) => void): boolean {
  if (messages.length <= COMPACT_TRIGGER) return false;
  const keepFrom = messages.length - COMPACT_KEEP_RECENT;
  const old = messages.splice(1, keepFrom - 1);
  const excerpts = old
    .map((m) => {
      const text = typeof m.content === 'string' ? m.content : '[image attached]';
      return `${m.role}: ${text.replace(/\s+/g, ' ').trim().slice(0, 220)}`;
    })
    .join('\n');
  messages.splice(1, 0, {
    role: 'user',
    content:
      `COMPACTED HISTORY — ${old.length} earlier messages were condensed into the excerpts below. ` +
      `The TASK STATE message that follows is authoritative; do not re-read or repeat work already recorded there.\n${excerpts.slice(0, 8000)}`,
  });
  onEvent?.(`context compacted ${old.length} earlier messages into a digest — ${messages.length} messages retained`);
  return true;
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

function proseCutIndex(text: string): number {
  const brace = text.indexOf('{');
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
    const { cwd, llm } = this.config;

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
    this.emit(`branch   ${branchInfo.message}`);

    const policy = new PolicyEngine(this.config.autoApprove ?? false, this.config.approvalHandler);
    const loopDetector = new LoopDetector();
    const evidence = new EvidenceEngine();
    const skills = this.config.skills ?? SkillStore.forProject(guard.lock.repoRoot);
    const executor = new Executor(
      guard,
      ledger,
      policy,
      loopDetector,
      this.emit,
      skills,
      this.config.mcp,
      this.config.browser,
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

    let contextNote = '';
    if (ledger.data.mode === 'standard') {
      const contextBudget = contextBudgetForWindow(this.config.contextWindowTokens);
      const pack = context.buildPack(goal, contextBudget);
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
          skillsSection: skills.renderForPrompt(),
          agentsSection: this.config.agentsSection,
          mcpSection: this.config.mcp
            ? this.config.mcp.servers().map((s) => `- mcp server "${s.name}" (${s.command})`).join('\n') || undefined
            : undefined,
          vision: this.config.supportsImages ?? false,
          hasBrowser: this.config.browser ? this.config.browser.available() : false,
          autoLearn: this.config.autoLearn ?? true,
        }),
      },
    ];
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
        { effort: this.config.effort },
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

    let invalidStreak = 0;
    let loopBlocks = 0;
    let followUpCriteriaAdded = false;
    const actionsAtStart = ledger.data.actions.length;
    let exitReason: 'complete' | 'blocked' | 'stalled' = 'stalled';
    let completionInput: { summary: string; risks: string[]; followUps: string[] } | undefined;

    const ask = async (note?: string): Promise<ParsedAction | undefined> => {
      messages.push({ role: 'user', content: buildStateMessage(ledger, note) });
      this.emit('think  reviewing task state and choosing the next action');
      let pending = '';
      let lastFlush = Date.now();
      const flush = (): void => {
        if (pending) this.emit(`tdelta ${pending}`);
        pending = '';
        lastFlush = Date.now();
      };
      const streamer = createProseStreamer((chunk) => {
        pending += chunk;
        if (pending.length >= 32 || Date.now() - lastFlush > 50) flush();
      });
      this.abortController = new AbortController();
      const reply = await llm.completeStream(
        messages,
        { effort: this.config.effort, signal: this.abortController.signal },
        (delta) => streamer(delta),
      );
      flush();
      const cutAt = proseCutIndex(reply);
      const prose = (cutAt >= 0 ? reply.slice(0, cutAt) : '').trim();
      if (prose) this.emit(`say ${prose}`);
      messages.push({ role: 'assistant', content: reply });
      let parsed = parseReplyAction(reply);
      const reasoning = llm.lastReasoning;
      // Thinking models under long context sometimes keep the action JSON in
      // the reasoning trace and only emit commentary as visible content.
      if (!parsed && reasoning) parsed = parseReplyAction(reasoning);
      if (!parsed) {
        invalidStreak += 1;
        logParseFailure(ledger.data.taskId, reply, reasoning);
        this.emit(`warn    response ${invalidStreak}/3 had no executable action — raw reply saved to logs/parse-failures.log`);
      } else {
        invalidStreak = 0;
      }
      return parsed;
    };

    const observe = (content: string | LlmContentPart[]): void => {
      messages.push({ role: 'user', content });
      compactHistory(messages, (t) => this.emit(t));
    };

    try {
    for (;;) {
      if (this.aborted) {
        ledger.addBlocker('Stopped by user.');
        exitReason = 'blocked';
        break;
      }

      const action = await ask();

      if (!action) {
        if (invalidStreak >= 3) {
          ledger.addBlocker('LLM produced 3 consecutive unparseable responses.');
          exitReason = 'stalled';
          break;
        }
        observe(
          'Your last response contained no executable JSON action — describing intentions is not enough. ' +
            'Reply with one short sentence followed by exactly one JSON object on a new line, e.g. ' +
            '{"thought":"...","action":{"type":"tool_call","tool":"list_files","params":{"path":"src"},"reason":"...","expected":"..."}}',
        );
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
            observe('Plan recorded. Execute one step at a time. Verify with commands; evidence ids will be reported.');
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
            const ev = evidence.record(ledger.data, {
              kind,
              label: action.expected || String(action.params['command']),
              command: String(action.params['command']),
              exitCode: outcome.result.exitCode,
              passed: outcome.result.ok,
              output: outcome.result.output,
            });
            ledger.save();
            evidenceNote = `\nEVIDENCE RECORDED: ${ev.id} [${ev.passed ? 'PASS' : 'FAIL'}] (${kind}). You may cite it with claim_criterion.`;
            this.emit(`evidence ${ev.id} ${ev.passed ? 'PASS' : 'FAIL'} (${kind})`);
          }

          if (action.tool === 'browse' && outcome.result.image) {
            this.emit(`browseshot ${outcome.result.image}`);
          }

          if (action.stepId && outcome.result.ok) {
            const step = ledger.step(action.stepId);
            if (step && step.status === 'in_progress') {
              ledger.updateStep(action.stepId, { status: 'done' });
              checkpoints.snapshot(ledger, action.stepId, step.description.slice(0, 60));
            }
          }

          const resultText =
            `RESULT [${outcome.result.ok ? 'success' : 'error'}] ${outcome.record.paramsSummary}\n` +
            `${outcome.result.output.slice(0, 2500)}${evidenceNote}`;
          const img = outcome.result.image;
          const imgValid = typeof img === 'string' && /^data:image\/(png|jpe?g|webp);base64,[A-Za-z0-9+/=]{200,}$/.test(img);
          if (imgValid && this.config.supportsImages) {
            observe([
              { type: 'text', text: resultText },
              { type: 'image_url', image_url: { url: img! } },
            ]);
            this.emit('image    visual result attached to model context');
          } else if (img) {
            observe(`${resultText}\n(A screenshot was captured but is not deliverable to the current model${this.config.supportsImages ? ' (invalid image data)' : ' (no image support)'}; it is visible in the desktop Browser panel.)`);
          } else {
            observe(resultText);
          }
          break;
        }
        case 'claim_criterion': {
          const link = evidence.link(ledger.data, action.criterionId, action.evidenceId);
          ledger.save();
          this.emit(`claim    ${action.criterionId} <- ${action.evidenceId}: ${link.ok ? 'accepted' : link.reason}`);
          observe(link.ok ? `Accepted: ${link.reason}` : `Rejected: ${link.reason}`);
          break;
        }
        case 'complete': {
          const gate = evidence.gate(ledger.data);
          const chatOnly = Boolean(action.chat) && ledger.data.actions.length === actionsAtStart;
          if (!gate.open && !chatOnly) {
            observe(
              `COMPLETION REJECTED by evidence gate (${gate.satisfiedCount}/${gate.totalCount} criteria backed).\n` +
                `Still missing:\n${gate.missing.map((m) => `  - ${m}`).join('\n')}\n` +
                `Continue working, or request_block if you cannot proceed.`,
            );
            break;
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
              });
              ledger.save();
              this.emit(`evidence ${ev.id} ${ev.passed ? 'PASS' : 'FAIL'} (${kind})`);
            }
            return `[${i + 1}] ${o.record.paramsSummary} → ${o.result.ok ? 'success' : 'error'}\n${o.result.output.slice(0, 1200)}`;
          });
          observe(`PARALLEL RESULTS:\n${parts.join('\n\n')}`);
          break;
        }
        case 'request_block': {
          ledger.addBlocker(action.reason);
          exitReason = 'blocked';
          observe(`Block recorded: ${action.reason}`);
          break;
        }
        case 'delegate': {
          this.emit(`delegate ${action.tasks.length} sub-task(s) to ${action.tasks.map((t) => t.agent).join(', ')}${action.background ? ' in background' : ''}`);
          const outcome = await executor.execute({
            tool: 'delegate',
            params: { tasks: action.tasks, background: action.background },
            reason: action.background ? 'background specialist sub-tasks' : 'parallel specialist sub-tasks',
            expected: action.background ? 'tracked background agent jobs' : 'summaries from each agent',
          });
          observe(`${action.background ? 'BACKGROUND AGENTS' : 'DELEGATE RESULTS'} [${outcome.result.ok ? 'started/ok' : 'some agents failed'}]\n${outcome.result.output.slice(0, 5000)}`);
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

    const status = exitReason === 'complete' ? 'completed' : exitReason === 'blocked' ? 'blocked' : 'failed';
    ledger.setStatus(status);

    const report = reporter.build(ledger, exitReason, completionInput);
    ledger.data.report = report;
    ledger.save();

    if ((this.config.autoLearn ?? true) && exitReason === 'complete') {
      await this.autoLearn(messages, ledger, executor, skills);
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
