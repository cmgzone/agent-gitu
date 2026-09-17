/**
 * The authority policy — where a chief of staff's authority ends.
 *
 * The policy is an allow-list, not a classifier. Re-deriving the policy engine's
 * own verdict could never *add* authority: a gate exists precisely because that
 * engine refused to decide alone (an unrecognized command failing closed, a
 * destructive pattern, an external write). So the policy's job is to extend
 * authority to a named, bounded set of *routine* requests the person has said a
 * chief may settle, and to leave every other request to them.
 *
 * Two rules keep that safe:
 *
 *   1. A veto is final and comes before every other rule. High-impact actions —
 *      production deployment, destructive data operations, credential material,
 *      force pushes, privilege escalation — are never auto-decided by anything,
 *      including a judgment layer the host supplies. The allow-list cannot
 *      override a veto, so a routine-looking command that also touches prod stays
 *      the person's call.
 *   2. Anything unmatched escalates. A request the policy has no rule for is not
 *      "probably fine"; it is the person's decision, and an escalation is how
 *      they get it.
 *
 * Vetoes are deliberately over-broad. A false escalation costs one card; a false
 * approval costs the thing the policy existed to protect.
 */

import type { ChiefDecision, ChiefInput } from '../coding/chief.js';

/** Only the requests this policy explicitly names may be decided without a person. */
export interface AuthorityPolicy {
  approvals: {
    /**
     * Commands a chief may approve without asking, as patterns matched against the
     * command text. These are authority the person *grants*, which is why they are
     * written down here rather than inferred: the safer the pattern looks, the more
     * tempting it is to broaden it, and the whole list is reviewable at a glance.
     */
    routineCommands: RegExp[];
    /**
     * Tools a chief must never decide, by exact name. The two structural namespaces
     * (`connection:` and `mcp:`) are always vetoed and cannot be listed away — see
     * `neverAutoApprove`.
     */
    neverAutoApproveTools: string[];
  };
  planReviews: {
    /** Whether a chief may review a plan at all, instead of asking the person. */
    autoReview: boolean;
    /** Send a plan back for replanning when a step names no verification. */
    requireVerification: boolean;
    /** A plan larger than this escalates: it is a bigger commitment than routine work. */
    maxSteps: number;
  };
  questions: {
    /**
     * Answers the person has already given, matched against the question text. The
     * first matching rule answers; no match escalates. A rule is a standing answer,
     * so it should be written as narrowly as the person meant it.
     */
    answers: { when: RegExp; answer: string }[];
  };
  /**
   * Spend guard, in USD. A session with less than this left escalates any
   * spend-bearing approval rather than approving the last of its money: granting
   * more is a person's decision, and a chief cannot make it. A session whose calls
   * cannot be priced (`remainingUsd` undefined) is not guarded here — it enforces
   * turn ceilings instead, and the chief must not pretend to see money it cannot.
   */
  spendFloorUsd: number;
}

/** Overrides on top of `DEFAULT_AUTHORITY_POLICY`, as a host would configure them. */
export interface AuthorityPolicyPatch {
  approvals?: Partial<AuthorityPolicy['approvals']>;
  planReviews?: Partial<AuthorityPolicy['planReviews']>;
  questions?: Partial<AuthorityPolicy['questions']>;
  spendFloorUsd?: number;
}

/**
 * What a chief may decide without a person, for work nobody is watching.
 *
 * The default is deliberately narrow: verification and inspection commands for the
 * ecosystems this project actually runs, plus plans that prove their own
 * verification. Everything else — including every external action — waits for the
 * person, exactly as it did before a chief existed.
 */
export const DEFAULT_AUTHORITY_POLICY: AuthorityPolicy = {
  approvals: {
    routineCommands: [
      // The project's own verification runners.
      /^\s*(npm|pnpm|yarn|bun)\s+(run\s+)?(test|lint|typecheck|type-check|tsc|build|check|format)\b/,
      /^\s*(npx|pnpx|bunx)\s+(vitest|jest|tsc|eslint|prettier)\b/,
      /^\s*(pytest|python3?\s+-m\s+pytest|go\s+test|cargo\s+(test|check|build)|dotnet\s+(test|build))\b/,
      // Read-only inspection of the workspace the session is locked to.
      /^\s*git\s+(status|log|diff|show|branch|rev-parse|ls-files)\b/,
      /^\s*(ls|dir|pwd|cat|type|find|grep|rg|node\s+--version)\b/,
    ],
    neverAutoApproveTools: [],
  },
  planReviews: { autoReview: true, requireVerification: true, maxSteps: 12 },
  questions: { answers: [] },
  spendFloorUsd: 0.25,
};

/** Resolve a patch against the defaults into a complete policy. */
export function resolveAuthorityPolicy(patch: AuthorityPolicyPatch | undefined): AuthorityPolicy {
  return {
    approvals: { ...DEFAULT_AUTHORITY_POLICY.approvals, ...patch?.approvals },
    planReviews: { ...DEFAULT_AUTHORITY_POLICY.planReviews, ...patch?.planReviews },
    questions: { ...DEFAULT_AUTHORITY_POLICY.questions, ...patch?.questions },
    spendFloorUsd: patch?.spendFloorUsd ?? DEFAULT_AUTHORITY_POLICY.spendFloorUsd,
  };
}

/**
 * The policy in prose, for a prompt or a transcript.
 *
 * Written for a reader that has to know the *shape* of the authority in force — what
 * is automatic, what never is — rather than the patterns themselves, which are code.
 * The advisor prompt carries it so an answer is given inside the authority the
 * session was actually granted, not a general idea of what sounds safe.
 */
export function authorityPolicySummary(policy: AuthorityPolicy): string {
  const routines = policy.approvals.routineCommands.length;
  const answers = policy.questions.answers.length;
  const plans = policy.planReviews.autoReview
    ? `reviewed automatically when every step names its verification and the plan has at most ${policy.planReviews.maxSteps} steps`
    : 'always escalated to the person';
  const verification = policy.planReviews.requireVerification ? 'every step must name its verification' : 'step verification is not required';
  return [
    `Approvals: ${routines} routine command pattern${routines === 1 ? '' : 's'} may be approved automatically; every other action escalates to the person.`,
    `Plans: ${plans} (${verification}).`,
    `Questions: ${answers === 0 ? 'no standing answers — every question reaches the person' : `${answers} standing answer rule${answers === 1 ? '' : 's'}`}.`,
    `Spend: an approval escalates once the session is within $${policy.spendFloorUsd.toFixed(2)} of its ceiling; spend above that limit is the person's decision.`,
    'Always escalated: production deployment, destructive data operations, credential access, force pushes, privilege escalation, external provider or MCP writes.',
  ].join('\n');
}

/**
 * Actions no chief may decide, however routine the surrounding request looks.
 *
 * Each entry is a category the person keeps for themselves, phrased as what it
 * would cost them to be wrong. The list is matched against the request's own
 * words (`why` and `summary`), so it also catches a routine command that carries a
 * destructive flag, and a plan whose steps describe one.
 */
const HIGH_IMPACT_SIGNALS: { re: RegExp; why: string }[] = [
  { re: /\bdeploy\w*\b[^\n]*\b(prod|production|live|release)\b|\b(prod|production)\b[^\n]*\bdeploy/i, why: 'production deployment' },
  { re: /\bgit\s+push\b[^\n]*(--force\b|--force-with-lease|-f\b)/i, why: 'force push rewrites published history' },
  { re: /\bgit\s+(reset\s+--hard|clean\s+-[a-z]*f)\b/i, why: 'git history or untracked work is destroyed' },
  { re: /\b(sudo|doas|runas|pkexec)\b/i, why: 'privilege escalation' },
  { re: /\b(drop|truncate)\s+(database|table|schema|collection|index)\b/i, why: 'data destruction' },
  { re: /\brm\s+(-[a-z]+\s+)*-?[a-z]*r/i, why: 'recursive delete' },
  { re: /\b(del|erase|rmdir)\s+\/[sqf]/i, why: 'bulk delete' },
  { re: /\bremove-item\b[^\n]*-(?:recurse|r)\b/i, why: 'recursive delete' },
  { re: /\bkubectl\s+delete\b/i, why: 'cluster resource deletion' },
  { re: /\bterraform\s+(destroy|apply)\b|\bterragrunt\b/i, why: 'infrastructure mutation' },
  { re: /\b(mkfs|format|diskpart|fdisk)\b/i, why: 'disk operation' },
  { re: /\b(shutdown|reboot|halt|poweroff)\b/i, why: 'system power control' },
  { re: /\b(npm|pnpm|yarn)\s+(publish|unpublish)\b/i, why: 'package publication' },
  { re: /--no-verify\b/i, why: 'bypasses verification hooks' },
  { re: /\b(credentials?|password|passwd|secrets?|api[_-]?key|access[_-]?token|private[_-]?key|id_rsa|keychain|ssh[_-]?key)\b/i, why: 'credential material' },
  // Dotfiles are matched separately: `\b` cannot precede a leading dot (`cat .env`
  // has no word boundary between the space and the `.`), and a credential file read
  // is exactly the case this signal exists for.
  { re: /(^|[\s"'=:(])\.[a-z_-]*env\b/i, why: 'credential material' },
  { re: /\b(stripe|paypal|payment|invoice|refund|payout)\b/i, why: 'money movement' },
];

/** The high-impact reason a request carries, or undefined when it carries none. */
export function highImpactSignal(text: string): string | undefined {
  for (const { re, why } of HIGH_IMPACT_SIGNALS) {
    if (matches(re, text)) return why;
  }
  return undefined;
}

/** Reset lastIndex first: a caller's `/g` flag must not make a rule match every other time. */
function matches(pattern: RegExp, text: string): boolean {
  pattern.lastIndex = 0;
  return pattern.test(text);
}

/**
 * Tools a chief never decides, by tool or namespace.
 *
 * `connection:` (a write to an external provider) and `mcp:` (third-party code
 * running against an external system) are vetoed structurally rather than by
 * configuration: they act outside the workspace the session is locked to, so no
 * command-shaped allow-list can describe them, and their risk tier is an
 * informational label the connection subsystem owns — reading it as permission
 * would be a second, weaker authorization path.
 */
function neverAutoApprove(tool: string, policy: AuthorityPolicy): string | undefined {
  if (tool.startsWith('connection:')) return 'an external provider operation — the person who owns the credential authorizes those';
  if (tool.startsWith('mcp:')) return 'a third-party MCP operation on an external system';
  if (policy.approvals.neverAutoApproveTools.includes(tool)) return `"${tool}" is listed as a tool a chief never decides`;
  return undefined;
}

/**
 * The reason this request can never be auto-decided, or undefined when it can be
 * considered. A veto is final: it is checked before every other rule, is never
 * overridden by the allow-list, and is never offered to a judgment layer.
 */
export function authorityVeto(input: ChiefInput, policy: AuthorityPolicy): string | undefined {
  const { request, context } = input;

  if (request.kind === 'approval') {
    const tool = request.request.tool;
    const toolVeto = neverAutoApprove(tool, policy);
    if (toolVeto) return toolVeto;
    const impact = highImpactSignal(requestText(request));
    if (impact) return impact;
    const remaining = context.budget?.remainingUsd;
    if (remaining !== undefined && remaining <= policy.spendFloorUsd) {
      return `only $${remaining.toFixed(2)} of the session's budget is left — granting more spend is the person's call`;
    }
    return undefined;
  }

  if (request.kind === 'plan_review') {
    // A plan is a commitment to a whole sequence of actions, so every step's own
    // words are judged, not just the plan as a whole: "step 4: deploy to prod" is
    // exactly the sentence this policy exists to stop.
    for (const step of request.request.steps) {
      const impact = highImpactSignal(`${step.description} ${step.verification}`);
      if (impact) return `the plan contains a high-impact step (${impact})`;
    }
    return undefined;
  }

  // A question never carries high-impact authority by itself — an answer is
  // information, and the action an agent takes afterwards still faces its own gate.
  return undefined;
}

/** The words a request is judged on: its own explanation plus the payload it carries. */
function requestText(request: Extract<ChiefInput['request'], { kind: 'approval' }>): string {
  return [request.request.why, request.request.summary].filter(Boolean).join('\n');
}

/**
 * The command an approval is about, when the summary carries one.
 *
 * The engine's summary is the tool's own parameters, so a `run_command` approval
 * arrives as JSON. A summary that is not that shape yields no command, and an
 * approval with no command never matches the allow-list — fail closed, because a
 * policy that guessed at an unparsed action would be approving something it could
 * not read.
 */
export function approvalCommand(summary: string | undefined): string | undefined {
  if (!summary) return undefined;
  try {
    const parsed: unknown = JSON.parse(summary);
    if (parsed && typeof parsed === 'object' && typeof (parsed as { command?: unknown }).command === 'string') {
      return (parsed as { command: string }).command;
    }
  } catch {
    /* not JSON: no command to be found */
  }
  return undefined;
}

/**
 * The policy's decision for a request, when it has one.
 *
 * This is the deterministic layer: it returns an `escalate` decision when the
 * policy has no rule, which a caller with a judgment layer may then deliberately
 * go beyond for questions. It never throws, and it never returns a settling
 * decision for a vetoed request.
 */
export function evaluateAuthority(input: ChiefInput, policy: AuthorityPolicy): ChiefDecision {
  const veto = authorityVeto(input, policy);
  if (veto) return { action: 'escalate', reason: veto };

  const { request } = input;
  if (request.kind === 'approval') {
    const command = approvalCommand(request.request.summary);
    if (command && policy.approvals.routineCommands.some((pattern) => matches(pattern, command))) {
      return { action: 'approve', reason: `routine command under this session's authority policy: ${command}` };
    }
    return { action: 'escalate', reason: `not a routine action under the authority policy (${request.request.why || request.request.tool})` };
  }

  if (request.kind === 'plan_review') {
    const { steps, criteria } = request.request;
    if (!policy.planReviews.autoReview) return { action: 'escalate', reason: 'this session does not review plans automatically' };
    if (steps.length === 0) return { action: 'request_changes', note: 'The plan names no steps. Send it back with the concrete steps and how each one is verified.' };
    if (steps.length > policy.planReviews.maxSteps) {
      return { action: 'escalate', reason: `the plan has ${steps.length} steps, more than the ${policy.planReviews.maxSteps} this session's authority policy reviews automatically` };
    }
    if (policy.planReviews.requireVerification) {
      const unverified = steps.find((step) => step.verification.trim().length === 0);
      if (unverified) {
        return { action: 'request_changes', note: `Step "${unverified.description}" names no verification. Every step needs one before this plan is approved.` };
      }
    }
    const criteriaNote = criteria.length > 0 ? ` against ${criteria.length} recorded criteria` : '';
    return { action: 'approve', reason: `plan of ${steps.length} step${steps.length === 1 ? '' : 's'}${criteriaNote}, each naming its own verification` };
  }

  const text = request.request.questions.map((question) => question.question).join('\n');
  for (const rule of policy.questions.answers) {
    if (matches(rule.when, text)) return { action: 'answer', answer: rule.answer };
  }
  return { action: 'escalate', reason: 'no standing policy answer matches this question' };
}
