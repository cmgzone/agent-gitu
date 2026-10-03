import type { TaskLedgerData } from '../types.js';
import { isTrivialEvidenceCommand } from '../evidence/evidence.js';
import type { AskUserQuestion } from './recovery-synthesizer.js';

/** Conservative discovery allowlist for temporary planning and conversational reads. */
export function isObservationTool(tool: string, params: Record<string, unknown> = {}): boolean {
  // Polling a managed command is a read: it executes nothing, so it must not be
  // treated as a new command action.
  if (tool === 'run_command') return String(params['action'] ?? 'run') === 'status';
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

  const checks = data.evidence.filter(e => e.command && !isTrivialEvidenceCommand(e.command));
  const commandKey = (command: string): string => command.trim().replace(/\s+/g, ' ').toLowerCase();
  const latest = new Map<string, typeof checks[number]>();
  for (const check of checks) latest.set(commandKey(check.command!), check);
  const fresh = [...latest.values()].filter(e => !e.stale && e.workspaceFingerprint === currentFingerprint);
  // Formal criteria identify the checks that are required for completion.
  // A failed exploratory command remains history unless a criterion requires
  // it; the evidence gate separately validates every linked criterion.
  if (fresh.some(e => !e.passed && (!criterionCommands || criterionCommands.has(commandKey(e.command!))))) {
    return { open: false, reason: 'A required check still fails on the current workspace. Resolve it or report the blocker.' };
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

/** Choosing routine checks is the agent's job, not a user-facing decision. */
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
- For substantial work, keep a concise plan only when it helps track dependencies. Formal criteria are optional unless supplied by the user. Honor any criteria that are recorded.
- Verification scales with actual risk and changed scope, independently of the selected model reasoning effort. Prefer a focused existing test, lint/typecheck, build, or a small assertion of the requested result. Do not invent a full test suite for a wording edit. Keep stronger checks for risky behavior and report what ran and any limitations.
- At the start of substantial work, inspect project instructions and available check commands. Choose and run the smallest meaningful check for the changed result yourself. Do not ask the user which tests, build, lint, or browser checks to run, including after a completion gate rejection. Reuse fresh passing evidence after the last edit. If verification is genuinely impossible because a tool, environment, or credential is unavailable, report that concrete dependency with request_block instead of asking the user to choose checks.
- When the request is unclear, offer a specific recommendation and two or three concrete options using ask_user. Ask only about choices that change the result; make routine reversible decisions yourself. Inspect relevant context first when it can answer the question.
${planRequested
    ? '- TEMPORARY PLAN REQUEST: investigate with read-only tools, propose a concise set_plan, and wait for the user to approve it. Do not edit, run commands, delegate, or perform external actions until approval. Once approved, execute immediately in the same task. Approval is needed only for this requested planning step.'
    : '- Planning is optional. Proceed with authorized work without requiring plan acceptance. A plan from an earlier turn does not put this request into plan review.'}`;
}
