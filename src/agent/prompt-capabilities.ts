/**
 * ACTIVE CAPABILITY CONTRACTS — layer 2 of the prompt architecture.
 *
 * Layer 1 (core system contract in buildSystemPrompt) carries only rules that
 * apply to every call. Everything else — tool manuals, action grammars,
 * provider/connection guidance, browser usage, specialist delegation, skill
 * creation, planning/architecture tutorials — lives here as small contracts
 * that are injected ONLY when the capability is relevant to the current run.
 *
 * Two composition rules keep this honest:
 * 1. A contract is a CAPABILITY MANUAL, not a warning label. Rules the runtime
 *    enforces deterministically (approval, boundary, duplicate reads, decision
 *    sufficiency, evidence gating) are stated once in the core contract and
 *    never restated here.
 * 2. Protocol compatibility is a first dimension: text/structured providers
 *    need the complete action grammar to emit valid actions; native-tool
 *    providers already carry the schemas in the tool definition and must not
 *    pay for a text duplicate. `actionGrammarContract()` switches on mode, and
 *    `ACTION_GRAMMAR_FULL` is injected into the conversation if a run
 *    downgrades mid-run (see gitu.ts protocol fallback).
 */

export type PromptProtocolMode = 'native' | 'structured_text' | 'text' | 'auto';

/** Selection inputs computed once per run by the orchestrator. */
export interface PromptCapabilityContext {
  protocolMode: PromptProtocolMode;
  /** Fresh task: planning (criteria/plan/design) is the next phase. */
  planningRelevant: boolean;
  uiTask: boolean;
  hasBrowser: boolean;
  vision: boolean;
  lspAvailable: boolean;
  skillsAvailable: boolean;
  autoLearn: boolean;
  /** MCP servers are configured for this run. */
  mcpAvailable: boolean;
  /** A saved-connection/provider context exists for this run. */
  connectionsRelevant: boolean;
  /** Delegatable specialist agents are registered. */
  delegationAvailable: boolean;
  /** The run has a project lock/test command worth restating. */
  testCommand?: string;
}

export interface PromptContract {
  id: string;
  text: string;
}

// ── Action grammar (protocol-mode aware) ────────────────────────────────────

/**
 * Compact action-type list for NATIVE providers: the tool definition carries
 * the parameter schemas; the model only needs the type vocabulary and the
 * universal envelope.
 */
export const ACTION_GRAMMAR_NATIVE =
  'ACTION TYPES (one per turn, inside {"thought","action"}): intake: set_criteria, set_design, set_plan, add_criteria, append_plan, set_hypothesis, propose_repair, record_decision; execution: tool_call (stepId, tool, params, reason, expected; optional intent/expectation/observation/semanticVerdict/investigationIntent), connection_action, connection_operation, parallel{calls[<=6]}, delegate{tasks[<=6]}, toggle_todo, complete_step, revise_step, show_plan; closure: claim_criterion{criterionId,evidenceId,justification}, complete{summary,risks,followUps}, request_block{reason,prerequisite?}, ask_user{questions}, report_finding{claim,kind,severity,location}.';

/**
 * Full action grammar for structured_text / text providers. This must remain
 * sufficient to emit parseable actions with NO native tool schema present.
 * Kept as one contract so a mid-run protocol downgrade can inject it verbatim.
 */
export const ACTION_GRAMMAR_FULL = `ACTION GRAMMAR — each turn: 1-3 sentences of plain progress, then EXACTLY ONE JSON object. {"thought":"...","action":{...}}
Intake/planning:
{"action":{"type":"set_criteria","criteria":["verifiable criterion",...]}}
{"action":{"type":"set_design","design":{"frontend":"views/controls/data-flow","backend":"routes/contracts/schema","integration":"shared contracts"}}}  (bounded notes before set_plan for multi-surface work; omit irrelevant sections)
{"action":{"type":"set_plan","steps":[{"description":"small focused change","verification":"how verified","area":"frontend|backend|integration|shared|database|infra|tests|docs","subtasks":["todo"]}...]}}  (<=30 steps, <=8 subtasks each)
{"action":{"type":"add_criteria","criteria":[...]}} / {"action":{"type":"append_plan","steps":[...]}}  (follow-up scope in a completed task; never erase prior criteria/evidence)
{"action":{"type":"set_hypothesis","text":"current hypothesis","target":"repair-target kind when known"}}  (confidence is telemetry only)
{"action":{"type":"propose_repair","targetKind":"...","targetDescription":"...","intendedEffect":"state change","reversible":true,"requiresApproval":false,"evidenceBasis":["ev-..."]}}  (decision sufficiency -> ACT_NOW)
{"action":{"type":"record_decision","decision":"one line","alternatives":[...],"repoEvidence":"...","requirements":[...],"rejected":[{"alternative","reason"}],"reconsiderIf":"...","basis":"explicit-requirement|repository-constraint|recommendation|preference","supersedes":"ad-..."}}
Execution:
{"action":{"type":"tool_call","stepId":"step-N","tool":"<tool>","params":{...},"reason":"why","expected":"what should happen"}}  (stepId does NOT complete the step; optional "intent":"inspect|diagnose|repair|verify", "expectation":{"description","assertions":[{"kind":"equals|not_equals|contains|not_contains|state_changed|exists|absent","target","expected"}]}, "observation":{"transportOk",fields}, "semanticVerdict":{"verdict","explanation","blocking"}, "investigationIntent":{"decisionQuestion","changesRepairAction",...})
{"action":{"type":"connection_action","connectionId":"saved-id","operationId":"registered-read-op"}}  (registered reads only; never credentials)
{"action":{"type":"connection_operation","connectionId":"saved-id","operation":{"id","label","capability","method","path","risk"},"body":{...},"documentationUrl":"https://...","reason":"..."}}  (safe GET auto-registers+runs; writes await user approval)
{"action":{"type":"parallel","calls":[{"tool","params","reason","expected"}...]}}  (independent calls only, <=6)
{"action":{"type":"toggle_todo","stepId":"step-N","index":0,"done":true}} / {"action":{"type":"complete_step","stepId":"step-N","reason":"..."}}
{"action":{"type":"revise_step","stepId":"step-N","reason":"what changed","description":"...","verification":"..."}}  (dynamic replanning of ONE affected step)
{"action":{"type":"show_plan"}}
Closure:
{"action":{"type":"claim_criterion","criterionId":"ac-N","evidenceId":"ev-...","justification":"why this proves it"}}
{"action":{"type":"complete","summary":"plain-language outcome","risks":[...],"followUps":[...]}}  (chat close: {"type":"complete","summary":"answer","chat":true} only with no actions taken)
{"action":{"type":"request_block","reason":"external prerequisite and what was tried","prerequisite":{"id","kind","description","requiredFor","providerHint?","capabilities":[...],"connectionSetup"?,"hints":[...]}}}  (ONLY user/host-owned prerequisites; never done/stop/give-up, bugs, skills/tools/dependencies, or failed tests/builds)
{"action":{"type":"ask_user","questions":[{"question","header","options":[...]}]}}  (before planning when the request has real ambiguity)
{"action":{"type":"report_finding","claim":"what is wrong and why it matters","kind":"security|bug|performance|data|other","severity":"low|medium|high|critical","location":"path:line"}}  (findings face independent reproduction)`;

/** Mode-aware grammar contract. `native` stays minimal; text modes get it all. */
export function actionGrammarContract(mode: PromptProtocolMode): string {
  return mode === 'structured_text' || mode === 'text' ? ACTION_GRAMMAR_FULL : ACTION_GRAMMAR_NATIVE;
}

// ── Capability contracts ────────────────────────────────────────────────────

const FILESYSTEM_CONTRACT = `FILESYSTEM TOOLS:
- read_file {"path":"src/x.ts","offset":1,"limit":200} — read the minimum needed; the InvestigationGuard refuses re-reads of unchanged files and returns the cached answer.
- write_file {"path":"src/x.ts","content":"full content"} — full-file writes.
- apply_edit {"path":"src/x.ts","oldString":"exact existing text","newString":"replacement","replaceAll":true}
- search_files {"pattern":"regex or text","path":"src","mode":"literal|regex","flags":"ims","include":["**/*.py"],"exclude":[...],"maxResults":50,"contextLines":2} — regex mode scans whole files, so patterns match ACROSS lines (use \\n, \\s, [\\s\\S]); mode "literal" for plain text; results end with a capability line.
- write_file accepts "scratch":true for THROWAWAY diagnostics: they land in the task's private temp dir, never the source tree or diff, and are deleted on completion. Promote a valuable diagnostic into a real test instead of keeping it.
- list_files {"path":"src"}`;

function testingContract(testCommand?: string): string {
  return (
    'COMMANDS & VERIFICATION:\n' +
    `- run_command {"command":"${testCommand ?? 'npm test'}","timeoutMs":120000} — verification commands are recorded as evidence (ev-...) automatically; cite them with claim_criterion. For a long-running dev server/watcher use {"command":"npm start","background":true,"startupWaitMs":1500}; the runtime keeps it alive for subsequent browser checks and cleans it up when the run ends.\n` +
    '- Failed commands return the failure DIGEST (error lines + tail), not the raw log. When a reproduction is expected to exit non-zero, declare it structurally, e.g. "expectation":{"description":"bug reproduced","assertions":[{"kind":"equals","target":"exitCode","expected":1}],"blocksOnFailure":false}; a matching non-zero exit is PASS evidence, not a blocker.'
  );
}

const LSP_CONTRACT = `LSP (optional; when it reports "unavailable", fall back to search_files/read_file — never treat LSP as verification):
- lsp_diagnostics {"path":"src/auth.ts"} — post-edit error check; fix surfaced issues BEFORE the real test/typecheck commands.
- lsp_definition {"path","line","column"} (1-based) — where a symbol is defined.
- lsp_references {"path","line","column"} — every use site (before refactors).
- lsp_hover {"path","line","column"} — type/docs. lsp_symbols {"path"} — file structure.
WHEN: unfamiliar file -> symbols first; "what else touches this?" -> references; never whole-project search.`;

function browserContract(vision: boolean): string {
  return (
    'BROWSER (real Chromium; use for UI work — verify what you build):\n' +
    'Call tool "browse" ("browser" is an exact compatibility alias): {"action":"navigate","url":"http://localhost:3000"} | {"action":"evidence"} | {"action":"screenshot"} | back/forward/reload | {"action":"click","selector":"#id"} | {"action":"fill","selector":"input[name=email]","text":".."} | {"action":"select","selector","#c","value":".."} | {"action":"press","key":"Enter"} | {"action":"type","text":".."} | {"action":"scroll","x":640,"y":450,"deltaY":400} | {"action":"wait","ms":1000}\n' +
    'ACT -> VERIFY with the cheapest proof: "evidence" (structured non-visual pass: DOM counts, a11y, layout overflow, clipped text, console errors) is the default look after navigate and edits; add "viewports":["mobile","tablet","desktop"] for responsive checks; escalate to "screenshot" only when a criterion needs pixels. Every result ends with a capability line saying what ran.\n' +
    (vision ? 'You can see screenshots — ground every visual claim in what they show.\n' : 'Screenshots are captured for the user but not delivered to you (no vision) — rely on "evidence" and DOM/tests.\n')
  );
}

const CONNECTIONS_CONTRACT = `CONNECTIONS & PROVIDERS (saved credentials; the host owns secrets):
- web_fetch {"url":"https://docs.example.com","render":true} is intentionally anonymous — NEVER put credentials in it. For saved providers use connection_action with the exact registered read operation; missing operation -> propose one documented connection_operation (safe GETs auto-register and run; writes need explicit user approval). Research official docs FIRST for writes.
- request_block with a structured prerequisite BEFORE declaring a missing credential/connection/permission blocked: include providerHint + the capability ids needed, and connectionSetup (label, baseUrl, documentationUrl, validationPath, validationCapability) when official docs expose a read-only validation route. The user sees a private connection form ONLY for missing credentials or positively rejected ones (401/expired) — never for a missing operation.
- RESOURCE FOLLOW-UP DISCOVERY: truncated/incomplete provider result or missing resource id -> chain narrower reads automatically (list -> locate by name -> get(id) -> status). Ask the user only after deterministic reads are exhausted.
- Verify provider-managed resources through REGISTERED READS (read back state), not DNS/ping probes; internal identifiers are not public DNS names. One failed verification method does not block a task — switch to a valid path (provider read-back, app health, logs).`;

const DELEGATION_CONTRACT = `DELEGATION (specialist agents run in parallel, <=6, each gets a WORK HANDOFF — not your conversation):
{"action":{"type":"delegate","tasks":[{"agent":"<registered specialist name>","task":"one concrete outcome: file/symbol boundary, what to change or verify, what is OUT of scope, expected verification"}]}}  ("agent" is the registered specialist name, never a model/provider string; vague "look into it" is rejected)
Background: add "background":true for independent research; poll agent_status before using results or claiming completion.
Resume a stopped specialist with the SAME agent + task + "resume":{"jobId":"<resumableJobId>","note":"..."} — never claim its files were recovered unless its checkpoint says DURABLE CHANGES VERIFIED.`;

function skillsContract(autoLearn: boolean): string {
  return (
    'SKILLS (reusable knowledge; load on demand):\n' +
    '- list_skills {} -> use_skill {"name":"skill-name"} -> use_skill_reference {"skill":"skill-name","path":"references/x.md"} for on-demand references. Saved connections are matched by host-provided capabilities; never pass credentials.\n' +
    '- Bundled skill scripts never run automatically; propose them via run_command so policy checks apply.\n' +
    (autoLearn
      ? '- create_skill {"name":"kebab-case","description":"when to use","instructions":"steps","global":true} — you MUST create a skill when the user asks for one that does not exist (research with web_fetch first if it needs external knowledge) and after any repeatable multi-step pattern; global:true for reusable-anywhere knowledge, project-local otherwise. Never answer "I don\'t have that skill" without creating it.\n'
      : '- create_skill only when the user explicitly asks for one.\n')
  );
}

const ARCHITECTURE_CONTRACT = `ARCHITECTURE DECISIONS: when a task turns on a real technology/architecture choice, record_decision BEFORE implementing — weigh explicit requirements > repository constraints > recommendations > preferences, name the alternatives you rejected and what would make you reconsider. If the user explicitly requires a technology, use it. Changing course later = a NEW decision with "supersedes" and a reason. The compact decision list is in TASK STATE every turn.`;

const PLANNING_CONTRACT = `PLANNING QUALITY (match ceremony to complexity):
- Small tasks: short plan, few/no subtasks, no design. Do not pay ceremony for trivial work.
- Medium/high or multi-surface: set_design FIRST with bounded frontend/backend/integration sections (controls' intent+placement, states, data flow; routes/contracts/schema/validation; shared contracts/realtime/persistence), then set_plan.
- Steps are SMALL and one-execution-cycle each, named to files/functions that exist (read before planning — do not plan from file names). Break big work into todo-sized subtasks.
- DYNAMIC REPLANNING: when execution proves the plan wrong (API differs, dependency missing), revise_step ONLY the affected step with a reason; toggle_todo as you complete each subtask. show_plan when you need full verification text/design detail.`;

const FINDINGS_CONTRACT = `FINDINGS: the moment you NOTICE a vulnerability, bug, or data risk, report_finding it — do not wait for completion. Every finding faces independent reproduction; only reproduced findings reach the user as confirmed.`;

const COMPLETION_CONTRACT = `COMPLETION & ESCALATION: claim_criterion links evidence to criteria (criterionId + evidenceId + why it proves it); "complete" requires every criterion claimed — write a plain-language outcome summary (the host builds the report). request_block is reserved for a concrete external prerequisite only the user/host can provide, and MUST include the structured prerequisite. It is rejected for done/stop/give-up, bugs, missing skills/tools/dependencies, failed builds/tests, or other implementation problems—repair or work around those. ask_user is for genuine ambiguities BEFORE planning. In chat-close ("chat":true) no actions may have been taken.`;

/**
 * Select and render the contracts relevant to this run. Order is stable:
 * grammar first (protocol-critical), then capabilities most-likely-to-matter.
 */
export function buildCapabilityContracts(ctx: PromptCapabilityContext): string {
  const contracts: string[] = [actionGrammarContract(ctx.protocolMode)];

  contracts.push(FILESYSTEM_CONTRACT);
  contracts.push(testingContract(ctx.testCommand));

  if (ctx.lspAvailable) contracts.push(LSP_CONTRACT);
  if (ctx.hasBrowser) contracts.push(browserContract(ctx.vision));
  if (ctx.mcpAvailable || ctx.connectionsRelevant) contracts.push(CONNECTIONS_CONTRACT);
  if (ctx.delegationAvailable) contracts.push(DELEGATION_CONTRACT);
  if (ctx.skillsAvailable) contracts.push(skillsContract(ctx.autoLearn));
  contracts.push(ARCHITECTURE_CONTRACT);
  if (ctx.planningRelevant) contracts.push(PLANNING_CONTRACT);
  contracts.push(FINDINGS_CONTRACT);
  contracts.push(COMPLETION_CONTRACT);

  return contracts.join('\n\n');
}

/** Per-contract visibility, exported for tests and telemetry attribution. */
export function contractIdsFor(ctx: PromptCapabilityContext): string[] {
  const ids: string[] = ['grammar', 'filesystem', 'testing'];
  if (ctx.lspAvailable) ids.push('lsp');
  if (ctx.hasBrowser) ids.push('browser');
  if (ctx.mcpAvailable || ctx.connectionsRelevant) ids.push('connections');
  if (ctx.delegationAvailable) ids.push('delegation');
  if (ctx.skillsAvailable) ids.push('skills');
  ids.push('architecture');
  if (ctx.planningRelevant) ids.push('planning');
  ids.push('findings', 'completion');
  return ids;
}
