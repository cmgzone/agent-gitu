import { CheckpointManager } from '../checkpoint/checkpoint.js';
import { ContextEngine } from '../context/context-engine.js';
import { EvidenceEngine } from '../evidence/evidence.js';
import { Executor } from '../executor/executor.js';
import { ProjectGuard, ProjectGuardError } from '../guard/project-guard.js';
import { TaskLedger } from '../ledger/task-ledger.js';
import { LoopDetector } from '../loop/loop-detector.js';
import { extractJson, type LlmClient, type LlmMessage } from '../llm/llm.js';
import { MemoryStore } from '../memory/memory-store.js';
import type { ApprovalHandler } from '../policy/policy.js';
import { PolicyEngine } from '../policy/policy.js';
import { Reporter } from '../report/reporter.js';
import type { Budgets, CompletionReport, EvidenceKind } from '../types.js';
import { buildStateMessage, buildSystemPrompt } from './prompt.js';

export interface HermesConfig {
  cwd: string;
  llm: LlmClient;
  mode?: 'fast' | 'standard';
  autoApprove?: boolean;
  approvalHandler?: ApprovalHandler;
  budgets?: Partial<Budgets>;
  criteria?: string[];
  onEvent?: (event: string) => void;
}

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
  | { type: 'request_block'; reason: string };

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

  constructor(config: HermesConfig) {
    this.config = config;
    this.emit = config.onEvent ?? (() => {});
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
    const ledger = TaskLedger.create({
      repoRoot: guard.lock.repoRoot,
      goal,
      project: guard.lock,
      mode: this.config.mode ?? 'standard',
      budgets: this.config.budgets,
    });
    this.emit(`ledger   created: ${ledger.data.taskId}`);

    const checkpoints = new CheckpointManager(guard);
    const branchInfo = checkpoints.ensureTaskBranch(ledger.data.taskId);
    this.emit(`branch   ${branchInfo.message}`);

    const policy = new PolicyEngine(this.config.autoApprove ?? false, this.config.approvalHandler);
    const loopDetector = new LoopDetector();
    const evidence = new EvidenceEngine();
    const executor = new Executor(guard, ledger, policy, loopDetector, this.emit);
    const context = new ContextEngine(guard);
    const reporter = new Reporter();

    if (this.config.criteria && this.config.criteria.length > 0) {
      ledger.setCriteria(this.config.criteria);
      this.emit(`criteria provided by user (${this.config.criteria.length})`);
    }

    let contextNote = '';
    if (ledger.data.mode === 'standard') {
      const pack = context.buildPack(goal);
      ledger.data.contextPack = pack;
      contextNote = `CONTEXT PACK (ranked, role-labeled, budgeted):\n${context.renderPack(pack)}`;
      this.emit(`context  ${pack.primaryFiles.length} primary, ${pack.testFiles.length} test files selected`);
    }

    const messages: LlmMessage[] = [{ role: 'system', content: buildSystemPrompt(guard, memory) }];
    if (contextNote) messages.push({ role: 'user', content: contextNote });
    ledger.setStatus('planning');

    const maxTurns = ledger.data.budgets.maxActions + 12;
    let invalidStreak = 0;
    let loopBlocks = 0;
    let exitReason: 'complete' | 'blocked' | 'budget' | 'stalled' = 'stalled';
    let completionInput: { summary: string; risks: string[]; followUps: string[] } | undefined;

    const ask = async (note?: string): Promise<ParsedAction | undefined> => {
      messages.push({ role: 'user', content: buildStateMessage(ledger, note) });
      this.emit('think  reviewing task state and choosing the next action');
      const reply = await llm.complete(messages, { json: true });
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

    for (let turn = 0; turn < maxTurns; turn++) {
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
          ledger.setCriteria(action.criteria);
          this.emit(`criteria ${action.criteria.map((c) => `"${c}"`).join('; ')}`);
          observe('Criteria recorded. Now propose a plan (set_plan) with small, verifiable steps.');
          break;
        }
        case 'set_plan': {
          ledger.setPlan(action.steps);
          ledger.setStatus('executing');
          checkpoints.snapshot(ledger, 'plan', 'plan created');
          this.emit(`plan     ${action.steps.length} steps`);
          observe('Plan recorded. Execute one step at a time. Verify with commands; evidence ids will be reported.');
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
        case 'request_block': {
          ledger.addBlocker(action.reason);
          exitReason = 'blocked';
          observe(`Block recorded: ${action.reason}`);
          break;
        }
      }

      if (exitReason === 'complete' || exitReason === 'blocked') break;
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
