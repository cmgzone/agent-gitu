import type { ProjectGuard } from '../guard/project-guard.js';
import type { TaskLedger } from '../ledger/task-ledger.js';
import type { MemoryStore } from '../memory/memory-store.js';
import type { PlanArea, PlanDesign, PlanStep, TaskLedgerData } from '../types.js';
import { commandsMatch } from '../evidence/evidence.js';
import { builtinSkillByName } from '../skills/builtin.js';
import { buildCapabilityContracts, contractIdsFor, type PromptCapabilityContext } from './prompt-capabilities.js';
import { renderDecisions } from './architecture.js';

// ── Plan & design rendering (token-disciplined) ──────────────────────────
//
// Two representations, per spec:
//   FULL    — planning/review phases, and on demand via show_plan
//   COMPACT — normal execution: collapsed completed steps, open todos only,
//             bounded previews. Richness must not become a token problem.

const COMPACT_TODO_LINES_CAP = 18;
/** Execution view caps — keep the compact state bounded as plans grow. */
const DONE_TAIL_CAP = 8;
const ACTIVE_TODO_CAP = 6;
const NEXT_ACTIONABLE_CAP = 3;
const STATE_GOAL_MAX_CHARS = 4_000;
const STATE_CRITERION_MAX_CHARS = 360;
const STATE_EVIDENCE_CAP = 12;
const STATE_EVIDENCE_MAX_CHARS = 260;
const STATE_FILES_CAP = 20;
const STATE_DECISIONS_MAX_CHARS = 2_400;
const STATE_TRANSCRIPT_ACTIONS = 6;
const STATE_FULL_PLAN_MAX_STEPS = 10;

function trunc(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function isPlanningPhase(data: TaskLedgerData): boolean {
  return data.status === 'intake' || data.status === 'planning' || data.status === 'review';
}

function stepCounts(plan: PlanStep[]): { done: number; todosDone: number; todosTotal: number } {
  let done = 0;
  let todosDone = 0;
  let todosTotal = 0;
  for (const s of plan) {
    if (s.status === 'done') done += 1;
    for (const t of s.subtasks ?? []) {
      todosTotal += 1;
      if (t.done) todosDone += 1;
    }
  }
  return { done, todosDone, todosTotal };
}

function renderStepFull(s: PlanStep): string {
  const area = s.area ? ` (${s.area})` : '';
  let line = `  ${s.id}: [${s.status}]${area} ${s.description} | verify: ${s.verification}`;
  if (s.subtasks?.length) {
    line += `\n${s.subtasks.map((t) => `     [${t.done ? 'x' : ' '}] ${t.text}`).join('\n')}`;
  }
  return line;
}

/**
 * Compact EXECUTION view. Deterministic and bounded:
 *   - completed steps collapse to capped one-liners (oldest dropped first);
 *   - the ACTIVE step stays fully detailed (verification + its open todos);
 *   - only the next few actionable steps appear, compactly;
 *   - failed/blocked steps are never hidden;
 *   - everything else becomes a queue count.
 */
function renderPlanBodyCompact(plan: PlanStep[]): string {
  const lines: string[] = [];
  let todoLines = 0;

  // The active step: first in_progress, else the first actionable pending.
  const activeIndex = plan.findIndex((s) => s.status === 'in_progress');
  const active = activeIndex >= 0 ? activeIndex : plan.findIndex((s) => s.status === 'pending');

  const doneLines: string[] = [];
  let nextActionable = 0;
  let queued = 0;

  for (let i = 0; i < plan.length; i++) {
    const s = plan[i]!;
    if (s.status === 'done') {
      doneLines.push(`✓ ${s.id}${s.area ? ` (${s.area})` : ''} ${trunc(s.description, 64)}`);
      continue;
    }
    const isProblem = s.status === 'failed' || s.status === 'blocked';
    if (isProblem) {
      const marker = s.status === 'failed' ? '⚠' : '⊘';
      lines.push(`${marker} ${s.id}${s.area ? ` (${s.area})` : ''} ${trunc(s.description, 110)} | verify: ${trunc(s.verification, 110)}`);
      continue;
    }
    if (i === active) {
      lines.push(`▶ ${s.id}${s.area ? ` (${s.area})` : ''} ${trunc(s.description, 140)} | verify: ${s.verification}`);
      const openTodos = s.subtasks ?? [];
      for (const t of openTodos) {
        if (t.done || todoLines >= COMPACT_TODO_LINES_CAP) continue;
        lines.push(`   [ ] ${trunc(t.text, 90)}`);
        todoLines += 1;
        if (todoLines >= ACTIVE_TODO_CAP) {
          const remainingOpen = openTodos.filter((t2) => !t2.done).length - ACTIVE_TODO_CAP;
          if (remainingOpen > 0) lines.push(`   … (+${remainingOpen} more open todos)`);
          break;
        }
      }
      continue;
    }
    if (s.status === 'pending') {
      if (active >= 0 && nextActionable >= NEXT_ACTIONABLE_CAP) {
        queued += 1;
        continue;
      }
      nextActionable += 1;
      lines.push(`· ${s.id}${s.area ? ` (${s.area})` : ''} ${trunc(s.description, 100)}`);
      continue;
    }
    // Unknown future statuses render like queued work.
    queued += 1;
  }

  const body: string[] = [];
  if (doneLines.length > DONE_TAIL_CAP) {
    body.push(`… (+${doneLines.length - DONE_TAIL_CAP} earlier completed)`);
    body.push(...doneLines.slice(-DONE_TAIL_CAP));
  } else {
    body.push(...doneLines);
  }
  body.push(...lines);
  if (queued > 0) body.push(`… (+${queued} more queued)`);
  return body.join('\n');
}

function renderPlanBody(plan: PlanStep[], detail: 'full' | 'compact'): string {
  if (detail === 'compact') return renderPlanBodyCompact(plan);
  return plan.map(renderStepFull).join('\n');
}

function renderDesign(design: PlanDesign | undefined, detail: 'full' | 'compact'): string {
  if (!design) return '';
  const section = (label: string, text: string | undefined): string => {
    if (!text) return '';
    if (detail === 'full') {
      return text.includes('\n')
        ? `  ${label}:\n${text
            .split('\n')
            .map((l) => `    ${l.trim()}`)
            .join('\n')}`
        : `  ${label}: ${text}`;
    }
    return `  ${label}: ${trunc(text.replace(/\s+/g, ' ').trim(), 240)}`;
  };
  const parts = [section('FRONTEND', design.frontend), section('BACKEND', design.backend), section('INTEGRATION', design.integration)].filter(Boolean);
  if (parts.length === 0) return '';
  const hint = detail === 'compact' ? '\n  (show_plan for full design text)' : '';
  return `PLAN DESIGN:\n${parts.join('\n')}${hint}`;
}

/** Full plan + design + recent revisions — injected once by the show_plan action. */
export function renderFullPlanMessage(ledger: TaskLedger): string {
  const d = ledger.data;
  const counts = stepCounts(d.plan);
  const parts: string[] = [`FULL PLAN (${counts.done}/${d.plan.length} steps · ${counts.todosDone}/${counts.todosTotal} todos):`];
  const design = renderDesign(d.planDesign, 'full');
  if (design) parts.push(design);
  parts.push(d.plan.length === 0 ? '(no steps yet)' : d.plan.map(renderStepFull).join('\n'));
  const revisions = (d.planRevisions ?? []).slice(-3);
  if (revisions.length > 0) {
    parts.push(`RECENT REVISIONS:\n${revisions.map((r) => `  ${r.stepId}: ${r.reason}`).join('\n')}`);
  }
  parts.push('Respond with exactly one JSON action.');
  return parts.join('\n\n');
}

export function buildSystemPrompt(
  guard: ProjectGuard,
  memory: MemoryStore,
  opts: {
    scopeFiles?: string[];
    extraConstraints?: string[];
    skillsSection?: string;
    mcpSection?: string;
    agentsSection?: string;
    lspSection?: string;
    vision?: boolean;
    hasBrowser?: boolean;
    autoLearn?: boolean; /** Ranked memory retrieval query (usually the goal) — memories that matter
     *  for THIS task surface first; everything else stays out of context. */
    memoryQuery?: string;
    /** Prebuilt RELEVANT MEMORY section — when provided it replaces the static
     *  stored-memory block (memory enters context via buildModelContext). */
    memorySection?: string;
    /** Tier 1 PROTECTED memory (ACTIVE CONSTRAINTS & DECISIONS) — durable
     *  guidance that survives compaction regardless of lexical relevance. */
    protectedSection?: string;
    uiTask?: boolean;
    /** Overrides the frontend-quality-bar builtin (user skill shadowing). */ uiQualityInstructions?: string;
    /** Compact, durable frontend skill contract. Prefer this in long-running
     *  agent sessions; full instructions are delivered only on skill activation. */
    uiQualityContract?: string;
    /** Explicit capability selection (layer 2). When omitted, a conservative
     *  context is derived from the other opts so legacy callers keep working. */
    capabilityContext?: Partial<PromptCapabilityContext>;
    /** Receives the measured split between core and capability chars (telemetry). */
    onMetrics?: (metrics: { coreChars: number; capabilityChars: number; contracts: string[] }) => void;
  } = {},
): string {
  const lock = guard.lock;
  const autoLearn = opts.autoLearn ?? true;

  // ── Dynamic, run-relevant context (small by design) ─────────────────────
  const scopeSection =
    opts.scopeFiles && opts.scopeFiles.length > 0
      ? `\nUSER-SELECTED SCOPE (the user chose these files to work on — prefer them, avoid everything else):\n${opts.scopeFiles.map((f) => `  - ${f}`).join('\n')}\n`
      : '';
  const constraintSection = opts.extraConstraints && opts.extraConstraints.length > 0 ? `\nUSER CONSTRAINTS:\n${opts.extraConstraints.map((c) => `  - ${c}`).join('\n')}\n` : '';
  const skillsSection = opts.skillsSection
    ? `\nACTIVE SKILLS IN TASK (apply their knowledge; full instructions arrive on activation):\n${opts.skillsSection}\n`
    : '';
  const mcpSection = opts.mcpSection ? `\nCONNECTED MCP SERVERS (tools are exposed as mcp:<server>:<tool>; they require approval):\n${opts.mcpSection}\n` : '';
  const agentsSection = opts.agentsSection
    ? `\nDELEGATABLE SPECIALIST AGENTS (named workers you can run IN PARALLEL with the delegate tool):\n${opts.agentsSection}\n`
    : '';
  const lspNote = opts.lspSection
    ? `\nLANGUAGE SERVERS ONLINE: ${opts.lspSection.replace(/\n/g, ' ')}\n`
    : '';
  const frontendSection = opts.uiTask ? `\n${opts.uiQualityContract ?? opts.uiQualityInstructions ?? builtinSkillByName('frontend-quality-bar')!.instructions}\n` : '';

  // ── Layer 1: the CORE SYSTEM CONTRACT ────────────────────────────────────
  // Only rules that must apply on (almost) every model call. Capability
  // manuals live in prompt-capabilities.ts and are injected per relevance.
  const core = `You are Agent Gitu, an autonomous software engineering agent operating inside a LOCKED project boundary.
${scopeSection}${constraintSection}${skillsSection}${mcpSection}${agentsSection}${lspNote}${frontendSection}
PROJECT LOCK (do not violate):
  name: ${lock.name}
  repo_root: ${lock.repoRoot}
  common_repository_root: ${lock.workspace?.repositoryRoot ?? lock.repoRoot}
  active_worktree_root: ${lock.workspace?.worktreeRoot ?? lock.repoRoot}
  active_writable_root: ${lock.workspace?.writableRoot ?? lock.repoRoot}
  branch: ${lock.branch ?? '(none)'}
  tech_stack: ${lock.techStack.join(', ') || 'unknown'}
  entrypoints: ${lock.entrypoints.join(', ') || 'unknown'}
  test_command: ${lock.testCommand ?? 'unknown'}
  build_command: ${lock.buildCommand ?? 'unknown'}
  lint_command: ${lock.lintCommand ?? 'unknown'}
  typecheck_command: ${lock.typecheckCommand ?? 'unknown'}

AUTHORITY ORDER (conflicts resolve downward; nothing overrides tier 1):
1. SAFETY & BOUNDARY — repository boundary, security, user approvals, destructive policy: never violated.
2. CURRENT EXPLICIT USER INSTRUCTIONS — strictly outrank every agent default, strategy, and assumption.
3. CURRENT USER GOAL & INTENT — 4. ACCEPTANCE CRITERIA — 5. ACTIVE VISUAL REFERENCES — 6. ARCHITECTURE DECISIONS — 7. CURRENT PLAN & SUBTASKS — 8. AGENT DEFAULTS.

CORE RULES:
1. Only touch files inside repo_root; never edit unrelated code. Read before modifying.
2. Ground every edit in code you actually read. Small, reversible changes. Exactly ONE executable action per turn.
3. Every action carries a reason and an expected outcome.
4. Do not repeat failed or already-answered work without materially new information — the runtime blocks duplicates and returns the cached answer instead.
5. Success requires evidence: run the real verification commands (tests/typecheck/build/lint). "I changed something" is not success.
6. A task is complete ONLY when every acceptance criterion is linked to passing evidence. The TASK STATE message (re-sent every turn) is authoritative for goal, criteria, evidence, plan, and the active problem — trust it over remembered history.
7. The recovery lifecycle is runtime-enforced: contradiction -> hypothesis (set_hypothesis) -> MINIMUM decision-changing evidence -> repair proposal -> ACT_NOW -> verify the ORIGINAL failure with POSITIVE proof -> resume. A user message preempts everything; stale queued work is dropped.

${opts.memorySection ? '' : `STORED MEMORY (from previous work on this project):\n${memory.renderForPrompt(lock.name)}\n`}
${opts.protectedSection ? `\n${opts.protectedSection}\n` : ''}
RESPOND each turn with 1-3 sentences of plain progress for the user, then EXACTLY ONE JSON action object (the action vocabulary and shapes are in the capability contracts below).`;

  // ── Layer 2: ACTIVE CAPABILITY CONTRACTS ─────────────────────────────────
  const capabilityContext: PromptCapabilityContext = {
    protocolMode: opts.capabilityContext?.protocolMode ?? 'native',
    planningRelevant: opts.capabilityContext?.planningRelevant ?? true,
    uiTask: opts.uiTask ?? opts.capabilityContext?.uiTask ?? false,
    hasBrowser: opts.hasBrowser ?? opts.capabilityContext?.hasBrowser ?? false,
    vision: opts.vision ?? opts.capabilityContext?.vision ?? false,
    lspAvailable: opts.capabilityContext?.lspAvailable ?? Boolean(opts.lspSection),
    skillsAvailable: opts.capabilityContext?.skillsAvailable ?? true,
    autoLearn,
    mcpAvailable: opts.capabilityContext?.mcpAvailable ?? Boolean(opts.mcpSection),
    connectionsRelevant: opts.capabilityContext?.connectionsRelevant ?? false,
    delegationAvailable: opts.capabilityContext?.delegationAvailable ?? Boolean(opts.agentsSection),
    testCommand: opts.capabilityContext?.testCommand ?? lock.testCommand,
  };
  const capabilities = buildCapabilityContracts(capabilityContext);
  opts.onMetrics?.({
    coreChars: core.length,
    capabilityChars: capabilities.length,
    contracts: contractIdsFor(capabilityContext),
  });

  return `${core}\n\n${capabilities}\n\nRESPOND WITH EXACTLY ONE JSON ACTION.`;
}

export interface TaskStateScope {
  goal: string;
  criterionIds: string[];
  planStepIds: string[];
  evidenceStartIndex: number;
  /** Files are intentionally omitted for a follow-up until touched in this
   * phase, rather than replaying the old task's file list every turn. */
  files?: string[];
}

export function buildStateMessage(
  ledger: TaskLedger,
  extra?: string,
  activeSkillsSection?: string,
  scope?: TaskStateScope,
  recoverySection?: string,
): string {
  const d = ledger.data;
  // A full 30-step plan can exceed the useful working-memory budget on every
  // planning turn. Small plans remain rich for review; larger ones use the
  // compact view and can always be expanded with show_plan.
  const scopedPlan = scope ? d.plan.filter((step) => scope.planStepIds.includes(step.id)) : d.plan;
  const scopedCriteria = scope ? d.acceptanceCriteria.filter((criterion) => scope.criterionIds.includes(criterion.id)) : d.acceptanceCriteria;
  const scopedEvidence = scope ? d.evidence.slice(scope.evidenceStartIndex) : d.evidence;
  const detail: 'full' | 'compact' = isPlanningPhase(d) && scopedPlan.length <= STATE_FULL_PLAN_MAX_STEPS ? 'full' : 'compact';
  const stateGoal = scope?.goal ?? d.goal;
  const auth = d.taskAuthority;
  const currentGoal = scope?.goal ?? auth?.currentGoal ?? stateGoal;
  const taskGoal =
    currentGoal.length <= STATE_GOAL_MAX_CHARS
      ? currentGoal
      : `${currentGoal.slice(0, 3_000)}\n… [${currentGoal.length - 3_700} characters omitted from this live state. The complete original request is durable in .hermes/tasks/${d.taskId}.json; read it if a missing requirement matters.]\n${currentGoal.slice(-700)}`;

  const hardInstructions = auth?.instructions.filter((i) => i.status === 'active' && i.enforcement === 'hard') ?? [];
  const activeRequirements = auth?.instructions.filter((i) => i.status === 'active' && i.type === 'requirement') ?? [];
  const userPreferences = auth?.instructions.filter((i) => i.status === 'active' && i.type === 'preference') ?? [];
  const supersededInstructions = auth?.instructions.filter((i) => i.status === 'superseded') ?? [];
  const visualReferences = auth?.visualReferences.filter((v) => v.status === 'active') ?? [];
  const latestFollowUp = auth?.followUps.length ? auth.followUps[auth.followUps.length - 1] : undefined;

  // ── TASK (top of the state; the authority header must stay first) ────────
  // The goal is stated ONCE. The original request is shown only when a
  // follow-up phase has moved the current goal away from it.
  const taskParts: string[] = [
    'TASK AUTHORITY (Precedence: 1. Safety > 2. Hard Instructions > 3. User Goal > 4. Criteria > 5. Visual References > 6. Decisions > 7. Plan)',
    `TASK: ${taskGoal}`,
  ];
  if (!scope && currentGoal.trim() !== stateGoal.trim()) {
    taskParts.push(`ORIGINAL REQUEST:\n${stateGoal}`);
  }
  const taskBlock = taskParts.join('\n');

  // ── USER AUTHORITY (explicit user constraints outrank everything below) ──
  const authorityParts: string[] = [];
  if (latestFollowUp && latestFollowUp.kind !== 'CONTINUE') {
    authorityParts.push(`LATEST DIRECTION (${latestFollowUp.kind}):\n${latestFollowUp.rawMessage}`);
  }
  if (hardInstructions.length > 0) {
    authorityParts.push(`ACTIVE HARD INSTRUCTIONS (MANDATORY ENFORCEMENT):\n${hardInstructions.map((i) => `- ${i.text}`).join('\n')}`);
  }
  if (activeRequirements.length > 0) {
    authorityParts.push(`ACTIVE REQUIREMENTS:\n${activeRequirements.map((i) => `- ${i.text}`).join('\n')}`);
  }
  if (userPreferences.length > 0) {
    authorityParts.push(`USER PREFERENCES:\n${userPreferences.map((i) => `- ${i.text}`).join('\n')}`);
  }
  if (visualReferences.length > 0) {
    authorityParts.push(`ACTIVE VISUAL REFERENCES:\n${visualReferences.map((v) => `- [${v.id}] ${v.kind}: ${v.path}${v.pinned ? ' (pinned)' : ''}`).join('\n')}`);
  }
  const unavailableVisualRefs = auth?.visualReferences.filter((v) => v.status === 'unavailable') ?? [];
  if (unavailableVisualRefs.length > 0) {
    authorityParts.push(
      `UNAVAILABLE VISUAL REFERENCES (the saved image files could not be read — do NOT pretend to know their content; ask the user to re-attach if the visual is essential):\n${unavailableVisualRefs.map((v) => `- [${v.id}] ${v.path}`).join('\n')}`,
    );
  }
  if (supersededInstructions.length > 0) {
    authorityParts.push(`SUPERSEDED INSTRUCTIONS (DO NOT FOLLOW):\n${supersededInstructions.map((i) => `- [SUPERSEDED] ${i.text}`).join('\n')}`);
  }
  const userAuthorityBlock = authorityParts.length > 0 ? `USER AUTHORITY:\n${authorityParts.join('\n')}` : '';

  // ── ACCEPTANCE (formal vs observed progress) ─────────────────────────────
  const criteria = scopedCriteria
    .map(
      (c) =>
        `  ${c.id}: [${c.satisfied ? 'SATISFIED' : 'open'}] ${trunc(c.text, STATE_CRITERION_MAX_CHARS)}${c.evidenceIds.length ? ` (evidence: ${c.evidenceIds.join(', ')})` : ''}`,
    )
    .join('\n');
  const satisfiedCount = scopedCriteria.filter((c) => c.satisfied).length;
  const citedEvidenceIds = new Set(scopedCriteria.flatMap((c) => c.evidenceIds));
  const unclaimedPassing = scopedEvidence.filter((e) => e.passed && !citedEvidenceIds.has(e.id)).length;
  const criteriaHeader =
    `ACCEPTANCE (formally satisfied: ${satisfiedCount}/${scopedCriteria.length}` +
    (unclaimedPassing > 0
      ? ` · ${unclaimedPassing} passing evidence record(s) NOT yet linked — unlinked evidence NEVER satisfies a criterion; link it with claim_criterion`
      : '') +
    ')';

  // ── PLAN (current step + next relevant steps; no history dump) ───────────
  const next = scopedPlan.find((step) => step.status === 'in_progress') ?? scopedPlan.find((step) => step.status === 'pending');
  const counts = stepCounts(scopedPlan);
  const verifiedOpenCount = scopedPlan.filter(
    (s) => s.status !== 'done' && s.verification && scopedEvidence.some((e) => e.passed && !e.stale && e.command && commandsMatch(s.verification!, e.command)),
  ).length;
  const verifiedOpenLine = verifiedOpenCount > 0 ? ` · ${verifiedOpenCount} step(s) verified-but-uncounted` : '';
  const planBlock =
    scopedPlan.length === 0
      ? 'PLAN: 0/0 steps · 0/0 todos\n  (none set yet — record set_design for multi-surface work, then set_plan)'
      : `PLAN: ${counts.done}/${scopedPlan.length} steps · ${counts.todosDone}/${counts.todosTotal} todos${verifiedOpenLine}${renderPlanBody(scopedPlan, detail) ? `\n${renderPlanBody(scopedPlan, detail)}` : ''}`;
  const designBlock = renderDesign(d.planDesign, detail);

  // ── EVIDENCE (recent/current only) ────────────────────────────────────────
  const evidence = scopedEvidence
    .slice(-STATE_EVIDENCE_CAP)
    .map((e) => `  ${e.id}: [${e.passed ? 'PASS' : 'FAIL'}] (${e.kind}) ${trunc(`${e.label}${e.command ? ` — ${e.command}` : ''}`, STATE_EVIDENCE_MAX_CHARS)}`)
    .join('\n');

  // ── KNOWN FACTS (hypothesis + historical failures; never live state) ─────
  const failures = ledger.failureSummary();
  const knownFacts: string[] = [];
  if (d.currentHypothesis) knownFacts.push(`CURRENT HYPOTHESIS: ${d.currentHypothesis}`);
  if (failures.length) knownFacts.push(`RECENT FAILURES (history — the ACTIVE PROBLEM above is authoritative):\n${failures.map((f) => `  ${f}`).join('\n')}`);
  const knownFactsBlock = knownFacts.length > 0 ? `KNOWN FACTS:\n${knownFacts.join('\n')}` : '';

  const decisions = trunc(renderDecisions(d.architectureDecisions ?? []), STATE_DECISIONS_MAX_CHARS);
  const phaseFiles = scope?.files ?? d.filesChanged;
  const files =
    phaseFiles.length > STATE_FILES_CAP ? `… (+${phaseFiles.length - STATE_FILES_CAP} earlier) ${phaseFiles.slice(-STATE_FILES_CAP).join(', ')}` : phaseFiles.join(', ');

  const effortLine = d.effortPlan
    ? `EFFORT: ${d.effortPlan.complexity} — ${d.effortPlan.reason} (budget: ${d.effortPlan.maxTurns} turns, ${d.effortPlan.maxSpecialists} specialists, ${d.effortPlan.contextBudget.maxBytes} bytes)`
    : '';
  const depthLine = d.investigationDepth
    ? `INVESTIGATION DEPTH: ${d.investigationDepth.toUpperCase()} — start from the strongest evidence and the named targets; widen ONLY when local evidence is insufficient, one ladder level at a time (direct → local → dependency → subsystem → repository).`
    : '';
  const riskLine = d.riskPlan
    ? `RISK: ${d.riskPlan.risk} — ${d.riskPlan.reason}${d.riskPlan.recommendedSpecialists.length > 0 ? ` | suggested: ${d.riskPlan.recommendedSpecialists.map((r) => r.agent).join(', ')}` : ''}`
    : '';

  // ── Assembled in dominance order: current state outranks history ─────────
  return [
    taskBlock,
    `STATUS: ${d.status} | mode: ${d.mode}`,
    effortLine,
    depthLine,
    riskLine,
    recoverySection ? recoverySection : '',
    knownFactsBlock,
    criteriaHeader,
    criteria || '  (none set yet — use set_criteria)',
    planBlock,
    ...(designBlock ? [designBlock] : []),
    userAuthorityBlock,
    `EVIDENCE:\n${evidence || '  (none yet)'}`,
    decisions.trim() ? `ARCHITECTURE:\n${decisions}` : '',
    activeSkillsSection ? `ACTIVE SKILLS IN TASK:\n${activeSkillsSection}` : '',
    `FILES CHANGED: ${files || '(none)'}`,
    next ? `NEXT: ${next.id}${next.area ? ` (${next.area})` : ''} — ${next.description}` : '',
    d.blockers.length
      ? `BLOCKERS: ${d.blockers
          .slice(-3)
          .map((b) => trunc(b, 300))
          .join('; ')}`
      : '',
    `RECENT ACTIONS:\n${ledger.transcriptTail(STATE_TRANSCRIPT_ACTIONS)}`,
    extra ? `SYSTEM NOTE: ${trunc(extra, 900)}` : '',
    'Respond with exactly one JSON action.',
  ]
    .filter(Boolean)
    .join('\n\n');
}
