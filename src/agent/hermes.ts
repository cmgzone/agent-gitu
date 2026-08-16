import { CheckpointManager } from '../checkpoint/checkpoint.js';
import { ContextEngine } from '../context/context-engine.js';
import { EvidenceEngine } from '../evidence/evidence.js';
import { Executor } from '../executor/executor.js';
import { ProjectGuard, ProjectGuardError } from '../guard/project-guard.js';
import { TaskLedger } from '../ledger/task-ledger.js';
import { LoopDetector } from '../loop/loop-detector.js';
import { extractJson, type LlmClient, type LlmMessage } from '../llm/llm.js';
import { MemoryStore } from '../memory/memory-store.js';
import type { McpManager } from '../mcp/client.js';
import type { ApprovalHandler } from '../policy/policy.js';
import { PolicyEngine } from '../policy/policy.js';
import { Reporter } from '../report/reporter.js';
import type { SkillStore } from '../skills/skills.js';
import type { Budgets, CompletionReport, EvidenceKind } from '../types.js';
import { buildStateMessage, buildSystemPrompt } from './prompt.js';

export interface HermesConfig {
  cwd: string;
  llm: LlmClient;
  mode?: 'fast' | 'standard' | 'chat';
  autoApprove?: boolean;
  approvalHandler?: ApprovalHandler;
  budgets?: Partial<Budgets>;
  criteria?: string[];
  requirePlanReview?: boolean;
  planReviewHandler?: PlanReviewHandler;
  askUserHandler?: AskUserHandler;
  scopeFiles?: string[];
  extraConstraints?: string[];
  effort?: 'low' | 'medium' | 'high' | 'max';
  skills?: SkillStore;
  mcp?: McpManager;
  resume?: { taskId: string; message: string };
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
  | { type: 'set_hypothesis'; text: string }
  | { type: 'tool_call'; tool: string; params: Record<string, unknown>; reason: string; expected: string; stepId?: string }
  | { type: 'claim_criterion'; criterionId: string; evidenceId: string; justification?: string }
  | { type: 'complete'; summary: string; risks?: string[]; followUps?: string[] }
  | { type: 'request_block'; reason: string }
  | { type: 'ask_user'; questions: AskUserQuestion[] }
  | {
      type: 'parallel';
      calls: { tool: string; params: Record<string, unknown>; reason: string; expected: string }[];
    };

function parseAction(raw: unknown): ParsedAction | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const root = raw as Record<string, unknown>;
  const action = (root['action'] ?? root) as Record<string, unknown>;
  const type = action['type'];
  switch (type) {
    case 'set_criteria': {
      const criteria = action['criteria'];
      if (!Array.isArray(criteria) || criteria.length === 0) return undefined;
      return { type, criteria: criteria.map(String).slice(0, 10) };
    }
    case 'set_plan': {
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
      return { type, summary: action['summary'], risks: Array.isArray(action['risks']) ? action['risks'].map(String) : [], followUps: Array.isArray(action['followUps']) ? action['followUps'].map(String) : [] };
    case 'request_block':
      if (typeof action['reason'] !== 'string') return undefined;
      return { type, reason: action['reason'] };
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
      return { type, calls: parsedCalls.slice(0, 4) };
    }
    default:
      return undefined;
  }
}

function classifyEvidenceKind(command: string): EvidenceKind {
  const c = command.toLowerCase();
  if (/\b(test|vitest|jest|pytest|cargo test|go test)\b/.test(c)) return 'test';
  if (/\b(lint|eslint)\b/.test(c)) return 'lint';
  if (/\b(typecheck|tsc)\b/.test(c)) return 'typecheck';
  if (/\bbuild\b/.test(c)) return 'build';
  return 'command';
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
      ledger.data.planApproved = false;
      ledger.data.blockers = [];
      ledger.data.completedAt = undefined;
      ledger.data.report = undefined;
      ledger.data.startedAt = undefined;
      ledger.data.budgetBaseline = {
        actions: ledger.data.actions.length,
        planAttempts: ledger.data.plan.reduce((sum, s) => sum + s.attempts, 0),
      };
      resumeNote = this.config.resume.message;
      this.emit(`ledger   resumed: ${ledger.data.taskId}`);
    } else {
      ledger = TaskLedger.create({
        repoRoot: guard.lock.repoRoot,
        goal,
        project: guard.lock,
        mode: this.config.mode ?? 'standard',
        budgets: this.config.budgets,
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
    const executor = new Executor(guard, ledger, policy, loopDetector, this.emit, this.config.skills, this.config.mcp);
    const context = new ContextEngine(guard);
    const reporter = new Reporter();

    const userCriteriaProvided = Boolean(this.config.criteria && this.config.criteria.length > 0);
    if (userCriteriaProvided) {
      ledger.setCriteria(this.config.criteria!);
      this.emit(`criteria provided by user (${this.config.criteria!.length})`);
    }

    let contextNote = '';
    if (ledger.data.mode === 'standard') {
      const pack = context.buildPack(goal);
      ledger.data.contextPack = pack;
      contextNote = `CONTEXT PACK (ranked, role-labeled, budgeted):\n${context.renderPackWithContent(pack)}`;
      this.emit(
        `context  ${pack.primaryFiles.length} primary, ${pack.testFiles.length} test files selected (code attached for grounding)`,
      );
    }

    const messages: LlmMessage[] = [
      {
        role: 'system',
        content: buildSystemPrompt(guard, memory, {
          scopeFiles: this.config.scopeFiles,
          extraConstraints: this.config.extraConstraints,
          skillsSection: this.config.skills ? this.config.skills.renderForPrompt() : undefined,
          mcpSection: this.config.mcp
            ? this.config.mcp.servers().map((s) => `- mcp server "${s.name}" (${s.command})`).join('\n') || undefined
            : undefined,
        }),
      },
    ];
    if (contextNote) messages.push({ role: 'user', content: contextNote });
    if (resumeNote) {
      messages.push({
        role: 'user',
        content: `CONTINUATION of a previous task in the same session. The user now asks:\n"${resumeNote}"\nUpdate acceptance criteria and plan as needed (set_criteria / set_plan), then execute. Reuse what was already built.`,
      });
    }

    if (ledger.data.mode === 'chat') {
      ledger.setStatus('executing');
      this.emit('think  composing answer');
      messages.push({ role: 'user', content: `User request (chat mode — answer directly and helpfully, no tools): ${goal}` });
      const reply = await llm.completeStream(messages, { effort: this.config.effort }, (d) => this.emit(`tdelta ${d}`));
      if (reply.trim()) this.emit(`say ${reply.trim()}`);
      ledger.setStatus('completed');
      const report = reporter.build(ledger, 'complete', {
        summary: reply.trim().slice(0, 600) || 'Answered.',
        risks: [],
        followUps: [],
      });
      ledger.data.report = report;
      ledger.save();
      this.emit('done     completed — chat answer delivered');
      return { ledger, report };
    }

    ledger.setStatus('planning');

    const maxTurns = ledger.data.budgets.maxActions + 12;
    let invalidStreak = 0;
    let loopBlocks = 0;
    let exitReason: 'complete' | 'blocked' | 'budget' | 'stalled' = 'stalled';
    let completionInput: { summary: string; risks: string[]; followUps: string[] } | undefined;

    const ask = async (note?: string): Promise<ParsedAction | undefined> => {
      messages.push({ role: 'user', content: buildStateMessage(ledger, note) });
      this.emit('think  reviewing task state and choosing the next action');
      let seenBrace = false;
      let pending = '';
      let lastFlush = Date.now();
      const flush = (): void => {
        if (pending) this.emit(`tdelta ${pending}`);
        pending = '';
        lastFlush = Date.now();
      };
      this.abortController = new AbortController();
      const reply = await llm.completeStream(messages, { effort: this.config.effort, signal: this.abortController.signal }, (delta) => {
        if (seenBrace) return;
        const braceAt = delta.indexOf('{');
        if (braceAt >= 0) {
          seenBrace = true;
          pending += delta.slice(0, braceAt);
          flush();
          return;
        }
        pending += delta;
        if (pending.length >= 32 || Date.now() - lastFlush > 50) flush();
      });
      flush();
      const braceIdx = reply.indexOf('{');
      const prose = (braceIdx >= 0 ? reply.slice(0, braceIdx) : '').trim();
      if (prose) this.emit(`say ${prose}`);
      messages.push({ role: 'assistant', content: reply });
      const parsed = parseAction(extractJson(reply));
      if (!parsed) invalidStreak += 1;
      else invalidStreak = 0;
      return parsed;
    };

    const observe = (text: string): void => {
      messages.push({ role: 'user', content: text });
      if (messages.length > 40) {
        messages.splice(1, messages.length - 40);
      }
    };

    try {
    for (let turn = 0; turn < maxTurns; turn++) {
      if (this.aborted) {
        ledger.addBlocker('Stopped by user.');
        exitReason = 'blocked';
        break;
      }
      const budgetProblem = ledger.budgetExceeded();
      if (budgetProblem) {
        ledger.addBlocker(budgetProblem);
        exitReason = 'budget';
        break;
      }

      const action = await ask();

      if (!action) {
        if (invalidStreak >= 3) {
          ledger.addBlocker('LLM produced 3 consecutive unparseable responses.');
          exitReason = 'stalled';
          break;
        }
        observe('Your last response was not a valid protocol action. Reply with exactly one JSON action object.');
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
            observe(
              'Criteria are locked once a plan is approved or evidence is recorded; they cannot be redefined. ' +
                'Continue working against them, or request_block if the scope is wrong.',
            );
            break;
          }
          ledger.setCriteria(action.criteria);
          this.emit(`criteria ${action.criteria.map((c) => `"${c}"`).join('; ')}`);
          observe('Criteria recorded. Now propose a plan (set_plan) with small, verifiable steps.');
          break;
        }
        case 'set_plan': {
          ledger.setPlan(action.steps);
          checkpoints.snapshot(ledger, 'plan', 'plan created');
          this.emit(`plan     ${action.steps.length} steps`);
          if (this.config.requirePlanReview && this.config.planReviewHandler && !ledger.data.planApproved) {
            ledger.setStatus('review');
            this.emit('plan-review waiting for user review');
            const decision = await this.config.planReviewHandler({
              criteria: ledger.data.acceptanceCriteria.map((c) => c.text),
              steps: action.steps,
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

          if (action.stepId && outcome.result.ok) {
            const step = ledger.step(action.stepId);
            if (step && step.status === 'in_progress') {
              ledger.updateStep(action.stepId, { status: 'done' });
              checkpoints.snapshot(ledger, action.stepId, step.description.slice(0, 60));
            }
          }

          observe(
            `RESULT [${outcome.result.ok ? 'success' : 'error'}] ${outcome.record.paramsSummary}\n` +
              `${outcome.result.output.slice(0, 2500)}${evidenceNote}`,
          );
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
          if (!gate.open) {
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
          const outcomes = await Promise.all(
            action.calls.map((c) =>
              executor.execute({ tool: c.tool, params: c.params, reason: c.reason, expected: c.expected }),
            ),
          );
          const parts = outcomes.map((o, i) => {
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

    if (exitReason === 'stalled') {
      ledger.addBlocker('Turn limit reached without completion.');
    }

    const status = exitReason === 'complete' ? 'completed' : exitReason === 'blocked' ? 'blocked' : 'failed';
    ledger.setStatus(status);

    const report = reporter.build(ledger, exitReason, completionInput);
    ledger.data.report = report;
    ledger.save();

    memory.add({
      type: 'task',
      claim: `Task "${goal}" finished as ${status}: ${report.summary}`,
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
}
