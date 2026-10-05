import type { StepStatus, TaskLedgerData } from '../types.js';
import { isManufacturedEvidenceCommand, isTrivialEvidenceCommand } from '../evidence/evidence.js';
import type { AskUserQuestion } from './recovery-synthesizer.js';
import { classifyCommand } from '../policy/policy.js';

/** This classification reduces workflow ceremony; it never grants tool permission. */
function isInspectionCommand(command: string): boolean {
  // The host conservatively rates runtime invocations as moderate. This exact
  // version probe is observation, but still goes through that permission policy.
  if (/^node(?:\.exe)?\s+--version\s*$/i.test(command.trim())) return true;
  const classified = classifyCommand(command);
  if (classified.tier !== 'safe') return false;
  if (classified.why === 'PowerShell read-only inspection') return true;
  // Some inspection commands have an output-file option. Keep those as work,
  // and rely on the policy classifier to reject chaining and redirection.
  if (/--(?:output|ext-diff|textconv)\b/i.test(command)) return false;
  return /^(?:git\s+(?:status|log|diff|show|rev-parse|ls-files|remote\s+-v)\b|(?:ls|dir|cat|type|pwd)\b|node\s+--version\b|npm\s+ls\b)/i.test(command.trim());
}

/** Conservative discovery allowlist for temporary planning and conversational reads. */
export function isObservationTool(tool: string, params: Record<string, unknown> = {}): boolean {
  // Polling a managed command is a read: it executes nothing, so it must not be
  // treated as a new command action.
  if (tool === 'run_command') {
    const action = String(params['action'] ?? 'run');
    return action === 'status' || (action === 'run' && typeof params['command'] === 'string' && isInspectionCommand(params['command']));
  }
  if (['read_file', 'search_files', 'list_files', 'web_fetch', 'list_skills', 'use_skill', 'use_skill_reference',
    'lsp_diagnostics', 'lsp_definition', 'lsp_references', 'lsp_hover', 'lsp_symbols', 'agent_status', 'list_mcp', 'list_connections', 'connection_read', 'inspect_connection_response'].includes(tool)) return true;
  if (tool === 'schedule_manage') return params['action'] === 'list';
  return tool === 'browse' && ['screenshot', 'evidence'].includes(String(params['action']));
}

/** Quick work needs fresh checks, without inventing formal acceptance criteria. */
export function agentVerificationGate(data: TaskLedgerData, baselineFingerprint: string, currentFingerprint: string, criterionCommands?: ReadonlySet<string>): { open: boolean; reason: string } {
  const actions = data.actions.filter(a => a.status === 'success');
  const work = actions.some(a => !(a.observationOnly ?? isObservationTool(a.tool)));
  if (!work && baselineFingerprint === currentFingerprint) return { open: true, reason: 'Conversation or read-only investigation.' };

  const checks = data.evidence.filter(e => e.command && !isTrivialEvidenceCommand(e.command) && !isManufacturedEvidenceCommand(e.command));
  const commandKey = (command: string): string => command.trim().replace(/\s+/g, ' ').toLowerCase();
  const latest = new Map<string, typeof checks[number]>();
  for (const check of checks) latest.set(commandKey(check.command!), check);
  const fresh = checks.filter(e => latest.get(commandKey(e.command!)) === e && !e.stale && e.workspaceFingerprint === currentFingerprint);
  // Formal criteria identify the checks that are required for completion.
  // A failed exploratory command remains history unless a criterion requires
  // it; the evidence gate separately validates every linked criterion.
  const failing = fresh.find(e => !e.passed && criterionCommands?.has(commandKey(e.command!)))
    ?? (!criterionCommands?.size && fresh.at(-1)?.passed === false ? fresh.at(-1) : undefined);
  if (failing) {
    return { open: false, reason: `Verification failed: ${failing.command}. ${failing.outputExcerpt?.slice(0, 600) ?? ''} Resolve this check or replace an incorrect diagnostic with a meaningful passing check; pinned criterion commands remain required.` };
  }
  if (criterionCommands?.size) {
    const requiredPassing = [...criterionCommands].every(command =>
      fresh.some(e => e.passed && commandKey(e.command!) === command),
    );
    if (!requiredPassing) return { open: false, reason: 'Fresh passing verification is required for every criterion command.' };
    return { open: true, reason: 'Fresh verification passed for every criterion command.' };
  }
  if (fresh.some(e => e.passed)) return { open: true, reason: 'Fresh, lightweight verification passed.' };
  const productWork = actions.every(a => (a.observationOnly ?? isObservationTool(a.tool)) || ['browse', 'create_document', 'schedule_manage'].includes(a.tool));
  const verifiedResults = data.evidence.filter(e => !e.command && e.passed && !e.stale && e.workspaceFingerprint === currentFingerprint && ['file', 'manual', 'log'].includes(e.kind));
  if (productWork && verifiedResults.length) return { open: true, reason: 'Fresh browser, document or schedule verification recorded.' };
  return { open: false, reason: 'Verify the changed result: a focused check for code, a fresh browser screenshot/evidence for web work, or the document/schedule tool’s verified result. Checks from before the latest edit do not count.' };
}

/** Terminal plan states. 'failed' and 'blocked' are deliberately NOT terminal:
 *  they are unresolved contracted work that must not be silently dropped. */
const RESOLVED_STEP_STATUSES: ReadonlySet<StepStatus> = new Set<StepStatus>(['done', 'cancelled'] as StepStatus[]);

/** Deterministic, runtime-owned completion readiness.
 *
 *  This is deliberately separate from agentVerificationGate. The gate answers
 *  "is the most recent check fresh and passing?"; this answers "is there any
 *  contracted work still open?". Termination requires BOTH, so green evidence
 *  can never terminate a task that still has open plan steps, open todos, or an
 *  unresolved blocker.
 */
export function agentCompletionReady(data: TaskLedgerData): { ready: boolean; reason: string } {
  const unsatisfied = data.acceptanceCriteria.filter((criterion) => !criterion.satisfied);
  if (unsatisfied.length > 0) {
    return { ready: false, reason: `${unsatisfied.length} acceptance criterion/criteria not satisfied: ${unsatisfied.map((c) => c.text).join('; ')}` };
  }
  const openSteps = data.plan.filter((step) => !RESOLVED_STEP_STATUSES.has(step.status));
  if (openSteps.length > 0) {
    return { ready: false, reason: `${openSteps.length} plan step(s) unresolved: ${openSteps.map((s) => `${s.id} (${s.status})`).join(', ')}` };
  }
  const openTodos = data.plan.flatMap((step) => (step.subtasks ?? []).filter((todo) => !todo.done).map((todo) => todo.text));
  if (openTodos.length > 0) {
    return { ready: false, reason: `${openTodos.length} unresolved todo(s): ${openTodos.join('; ')}` };
  }
  if (data.blockers.length > 0) {
    return { ready: false, reason: `${data.blockers.length} unresolved blocker(s): ${data.blockers.join('; ')}` };
  }
  return { ready: true, reason: 'Acceptance contract satisfied, plan resolved, no open todos or blockers.' };
}

/** Deterministic code prefix for refusals issued by the finalization state. */
export const FINALIZATION_ERROR_CODE = 'TASK_COMPLETE';

/** Bounded on purpose: finalization must not become a new verification loop. */
export const FINALIZATION_ACTION_BUDGET = 8;

/** The minimum surface still accepted once the runtime owns completion:
 *  cleanup, stopping temporary processes, repository/diff inspection, the
 *  final report, and the terminal stop itself. */
export function isFinalizationAction(action: { type: string; tool?: string; params?: Record<string, unknown> }): boolean {
  if (action.type === 'complete') return true;
  if (action.type !== 'tool_call' || !action.tool) return false;
  if (['read_file', 'list_files', 'search_files'].includes(action.tool)) return true;
  if (action.tool === 'run_command') {
    const verb = String(action.params?.['action'] ?? 'run');
    // Stopping a temporary process this run started is cleanup, not new work.
    if (verb === 'stop') return true;
    const command = action.params?.['command'];
    return verb === 'status' || (verb === 'run' && typeof command === 'string' && isInspectionCommand(command));
  }
  return false;
}

/** Deterministic, identical text for every non-finalization action refused
 *  while finalizing, so the model cannot re-enter ordinary execution. */
export function finalizationRejection(): string {
  return `${FINALIZATION_ERROR_CODE}: the runtime owns completion for this task; only finalization actions are accepted. `
    + 'Stop any temporary processes you started, inspect the repository or diff if the report needs it, then emit complete with the final report. '
    + 'New execution, evidence collection and verification are refused, and this state is bounded — it does not reopen verification.';
}

export function asksOnlyForVerificationChoice(questions: readonly AskUserQuestion[]): boolean {
  if (questions.length === 0) return false;
  return questions.every(({ question, header, options }) => {
    const text = `${header ?? ''} ${question} ${options.join(' ')}`;
    if (/\b(credential|password|token|permission|approval|approve|authorize|production|deploy|release|payment|billing|cost|access|destructive)\b/i.test(text)) return false;
    const check = /\b(verif(?:y|ication)|tests?|checks?|typecheck|lint|build|screenshot)\b/i.test(text);
    const choice = /\b(which|what|how|can|could|should|would|prefer|choose|select|run|want|need|expect)\b/i.test(question) || Boolean(header && /verif|check|test/i.test(header) && options.length > 1);
    return check && choice;
  });
}

export function agentWorkflowPrompt(planRequested: boolean): string {
  return `UNIFIED AGENT WORKFLOW:
- Handle conversation, investigation, quick edits, and larger builds in this same conversation. Infer the next useful action from the user's intent; never ask them to choose chat or build.
- For questions, answer directly using complete with chat:true when no tools are needed. For repository questions, read the relevant files and then complete normally. Do not invent edits or verification work for a conversation.
- Give complete, useful responses. Explain meaningful findings and results in connected prose, include examples or clear lists when they help, and address every part of the request. Match depth to the task and the user's preferences rather than forcing a short answer. Progress updates should name the actual work in natural language without a "Next:" prefix; the final response should explain the outcome, relevant checks, and material limitations without replaying every tool call.
- For a clear, small edit: read the target, edit it, run the cheapest meaningful check, then complete. No formal acceptance criteria, design document, or plan is required. Do not create set_criteria or set_plan just to unlock tools.
- The normal coding path is understand → inspect → edit → verify → explain. Take the next useful action without announcing internal bookkeeping. A short plan is useful when dependencies, risk, or multiple outcomes need tracking; its existence does not require a design document, subtasks, or a second planning round.
- For substantial work, keep a concise plan only when it helps track dependencies. Formal criteria are optional unless supplied by the user. Honor any criteria that are recorded.
- Verification scales with actual risk and changed scope, independently of the selected model reasoning effort. Prefer a focused existing test, lint/typecheck, build, or a small assertion of the requested result. Do not invent a full test suite for a wording edit. Keep stronger checks for risky behavior and report what ran and any limitations.
- After a meaningful check passes, finish unless a new edit, failure, explicit requirement, or unresolved risk calls for another check. Read-only inspection and command status polling are not edits. Reuse a browser check bound to the unchanged workspace rather than taking another screenshot after every test command.
- At the start of substantial work, inspect project instructions and available check commands. Choose and run the smallest meaningful check for the changed result yourself. Do not ask the user which tests, build, lint, or browser checks to run, including after a completion gate rejection. Reuse fresh passing evidence after the last edit. If verification is genuinely impossible because a tool, environment, or credential is unavailable, report that concrete dependency with request_block instead of asking the user to choose checks.
- When the request is unclear, offer a specific recommendation and two or three concrete options using ask_user. Ask only about choices that change the result; make routine reversible decisions yourself. Inspect relevant context first when it can answer the question.
- Permissions come from the host policy and existing user authorization. Do not ask again for routine work the user already authorized. When an action is denied, explain the exact action and policy reason, then use a compliant alternative if one exists. A denial does not authorize another tool, path, or command to evade the same restriction. Ask only for the missing decision, scoped access, or credential that actually prevents progress; credentials belong in the private connection form.
${planRequested
    ? '- TEMPORARY PLAN REQUEST: investigate with read-only tools and inspection commands, propose a concise set_plan, and wait for the user to approve it. Do not edit, run mutating commands, delegate, or perform external writes until approval. Once approved, execute immediately in the same task. Approval is needed only for this requested planning step.'
    : '- Planning is optional. Proceed with authorized work without requiring plan acceptance. A plan from an earlier turn does not put this request into plan review.'}`;
}
