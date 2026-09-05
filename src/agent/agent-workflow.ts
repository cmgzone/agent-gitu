import type { TaskLedgerData } from '../types.js';
import { isTrivialEvidenceCommand } from '../evidence/evidence.js';

/** Conservative discovery allowlist for temporary planning and conversational reads. */
export function isObservationTool(tool: string, params: Record<string, unknown> = {}): boolean {
  if (['read_file', 'search_files', 'list_files', 'web_fetch', 'list_skills', 'use_skill', 'use_skill_reference',
    'lsp_diagnostics', 'lsp_definition', 'lsp_references', 'lsp_hover', 'lsp_symbols', 'agent_status'].includes(tool)) return true;
  return tool === 'browse' && ['screenshot', 'evidence'].includes(String(params['action']));
}

/** Quick work needs fresh checks, without inventing formal acceptance criteria. */
export function agentVerificationGate(data: TaskLedgerData, baselineFingerprint: string, currentFingerprint: string): { open: boolean; reason: string } {
  const actions = data.actions.filter(a => a.status === 'success');
  const work = actions.some(a => !isObservationTool(a.tool));
  if (!work && baselineFingerprint === currentFingerprint) return { open: true, reason: 'Conversation or read-only investigation.' };

  const checks = data.evidence.filter(e => e.command && !isTrivialEvidenceCommand(e.command));
  const latest = new Map<string, typeof checks[number]>();
  for (const check of checks) latest.set(check.command!.trim(), check);
  const fresh = [...latest.values()].filter(e => !e.stale && e.workspaceFingerprint === currentFingerprint);
  if (fresh.some(e => !e.passed)) return { open: false, reason: 'A check still fails on the current workspace. Resolve it or report the blocker.' };
  if (fresh.some(e => e.passed)) return { open: true, reason: 'Fresh, lightweight verification passed.' };
  return { open: false, reason: 'Run a focused test, lint, typecheck, build, or a meaningful assertion against the changed result. Checks from before the latest edit do not count.' };
}

export function agentWorkflowPrompt(planRequested: boolean): string {
  return `UNIFIED AGENT WORKFLOW:
- Handle conversation, investigation, quick edits, and larger builds in this same conversation. Infer the next useful action from the user's intent; never ask them to choose chat or build.
- For questions, answer directly using complete with chat:true when no tools are needed. For repository questions, read the relevant files and then complete normally. Do not invent edits or verification work for a conversation.
- For a clear, small edit: read the target, edit it, run the cheapest meaningful check, then complete. No formal acceptance criteria, design document, or plan is required. Do not create set_criteria or set_plan just to unlock tools.
- For substantial work, keep a concise plan only when it helps track dependencies. Formal criteria are optional unless supplied by the user. Honor any criteria that are recorded.
- Verification scales with actual risk and changed scope, independently of the selected model reasoning effort. Prefer a focused existing test, lint/typecheck, build, or a small assertion of the requested result. Do not invent a full test suite for a wording edit. Keep stronger checks for risky behavior and report what ran and any limitations.
- At the start of substantial work, inspect existing project instructions and check commands. If the required verification scope cannot be inferred, ask one brief question with a recommended lightweight check and an optional broader check. Reuse answers already present in this task; never ask on every edit. If there is no runnable check, suggest a concrete alternative and clarify what the user expects before claiming completion.
- When the request is unclear, offer a specific recommendation and two or three concrete options using ask_user. Ask only about choices that change the result; make routine reversible decisions yourself. Inspect relevant context first when it can answer the question.
${planRequested
    ? '- TEMPORARY PLAN REQUEST: investigate with read-only tools, propose a concise set_plan, and wait for the user to approve it. Do not edit, run commands, delegate, or perform external actions until approval. Once approved, execute immediately in the same task. Approval is needed only for this requested planning step.'
    : '- Planning is optional. Proceed with authorized work without requiring plan acceptance. A plan from an earlier turn does not put this request into plan review.'}`;
}
