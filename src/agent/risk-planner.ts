import type { EffortPlan, RecommendedSpecialist, RiskDomain, RiskPlan, TaskComplexity } from '../types.js';

/**
 * Risk-based specialist selection.
 *
 * Instead of "high effort -> use 3 specialists", this layer answers
 * "what kind of risk does this task contain?" and selects only the agents
 * that cover that risk (bounded by the effort planner's specialist budget).
 * The selection is persisted on the ledger as `RiskPlan`, so continuation
 * knows WHY the limits and rosters were chosen instead of recalculating blindly.
 */

export interface SpecialistDescriptor {
  name: string;
  role: string;
}

export interface RiskPlannerOptions {
  complexity?: TaskComplexity;
  /** The actually-registered specialist agents. Recommendations only ever
   *  point at real agent names, so delegations cannot fail at runtime. */
  specialists?: SpecialistDescriptor[];
  /** Upper bound from the effort planner (maxSpecialists). */
  maxSpecialists?: number;
}

const STRICT_DOMAINS = new Set<RiskDomain>(['security', 'payments', 'data']);

/** Priority order: when a goal matches several risks, the first wins as primary. */
const PRIORITY: RiskDomain[] = ['security', 'payments', 'data', 'performance', 'frontend', 'refactor', 'bug'];

const RISK_RULES: { domain: RiskDomain; label: string; strict: boolean; patterns: RegExp[] }[] = [
  {
    domain: 'security',
    label: 'security / access control',
    strict: true,
    patterns: [
      /\b(session|refresh token|token|login|logout|authenticat\w*|auth|password|credential|csrf|rbac|2fa|mfa|permissions?|ssh|encrypt|decrypt|vuln|injection|xss|ssrf|idor)\b/i,
      /\b(secret|apikey|api ?key|identity provider)\b/i,
    ],
  },
  {
    domain: 'payments',
    label: 'payment / financial integrity',
    strict: true,
    patterns: [
      /\b(payment|payments|billing|stripe|checkout|invoice|refund|charge|ledger|transaction|revenue)\b/i,
      /\b(financial|money|price|pricing|subscription)\b/i,
    ],
  },
  {
    domain: 'data',
    label: 'data / migration',
    strict: true,
    patterns: [
      /\b(database|db|schema\w*|sql|query|migrat\w*|backfill|replication|datastore|data integrity|data loss)\b/i,
      /\b(etl|warehouse|postgres|mysql|redis|mongo)\b/i,
    ],
  },
  {
    domain: 'performance',
    label: 'performance / latency',
    strict: false,
    patterns: [/\b(performance|perf|latency|throughput|slow|speed|optimiz(e|ing|ation)|bottleneck|hanging|freeze|load test|scal(e|ing|ability))\b/i],
  },
  {
    domain: 'frontend',
    label: 'frontend / UI',
    strict: false,
    patterns: [/\b(frontend|ui ?\/? ?ux|react|vue|angular|component|rendering|layout|styling|css|responsive|button|user-?facing)\b/i],
  },
  {
    domain: 'refactor',
    label: 'refactor / architecture',
    strict: false,
    patterns: [/\b(refactor|refactoring|restructur|architecture|simplify|deduplicate|extract|modulariz|decompose|clean up|technical debt|monolith split)\b/i],
  },
  {
    domain: 'bug',
    label: 'bug / regression',
    strict: false,
    patterns: [/\b(bug|crash|broken|failing test|flaky|error|exception|stack trace|memory leak|race condition|deadlock|sporadic)\b/i],
  },
];

/** Keyword matchers for each risk domain, used to pick real specialists from
 *  the registered roster by their name or role text. */
const SELECTION_KEYWORDS: Record<Exclude<RiskDomain, 'unknown'>, RegExp> = {
  security: /\b(secu\w*|authentic\w*|auth\b|crypto\w*|token\w*|credential\w*|vuln\w*|rbac|identity\w*|access\w*|iac)\b/i,
  payments: /\b(pay\w*|bill\w*|stripe\w*|financ\w*|invoice\w*|ledger\w*|money|compliance\w*|txn)\b/i,
  data: /\b(data\w*|database\w*|sql|schema\w*|migrat\w*|store\w*|warehouse\w*|elt)\b/i,
  performance: /\b(perf\w*|profile\w*|optim\w*|latency\w*|load\w*|speed\w*)\b/i,
  frontend: /\b(front\w*|ui|uix|react\w*|css|web\w*|browser\w*|component\w*|visual\w*)\b/i,
  refactor: /\b(arch\w*|refactor\w*|structure\w*|dependenc\w*|cleanup\w*|design\w*)\b/i,
  bug: /\b(debug\w*|bug\w*|diagnos\w*|triage\w*|investigat\w*|trace\w*)\b/i,
};

const TEST_KEYWORD = /\b(test\w*|qa\b|verifi\w*|assert\w*|e2e|spec(?!ialist)\w*)\b/i;

function domainLabelOf(domain: RiskDomain): string {
  return RISK_RULES.find((r) => r.domain === domain)?.label ?? domain;
}

/** Collect every risk domain the goal text matches, in no particular order. */
export function classifyRiskDomains(goal: string): RiskDomain[] {
  if (!goal.trim()) return ['unknown'];
  const found: RiskDomain[] = [];
  for (const rule of RISK_RULES) {
    const hit = rule.patterns.some((re) => re.test(goal));
    if (hit && !found.includes(rule.domain)) found.push(rule.domain);
  }
  return found.length > 0 ? found : ['unknown'];
}

function primaryOf(domains: RiskDomain[]): RiskDomain {
  const known: RiskDomain[] = domains.filter((d): boolean => d !== 'unknown');
  for (const p of PRIORITY) {
    if (known.includes(p)) return p;
  }
  return known[0] ?? 'unknown';
}

/** Pick the right specialists for the risk domains, from the REGISTERED roster
 *  only, capped by the effort budget. A test/QA mate is appended for any
 *  non-trivial task that already justifies specialists. */
export function selectSpecialists(
  domains: RiskDomain[],
  specialists: SpecialistDescriptor[],
  max: number,
): RecommendedSpecialist[] {
  if (!specialists || specialists.length === 0 || max <= 0) return [];
  const known: RiskDomain[] = domains.filter((d): boolean => d !== 'unknown');
  if (known.length === 0) return [];

  const chosen: RecommendedSpecialist[] = [];
  const used = new Set<string>();
  const trySelect = (keywordDomain: Exclude<RiskDomain, 'unknown'>, forDomain: RiskDomain): void => {
    if (chosen.length >= max) return;
    const kw = SELECTION_KEYWORDS[keywordDomain];
    const candidate = specialists.find((s) => !used.has(s.name) && kw.test(`${s.name} ${s.role}`));
    if (!candidate) return;
    used.add(candidate.name);
    chosen.push({
      agent: candidate.name,
      role: candidate.role,
      rationale: `${domainLabelOf(forDomain)} specialist for risk detected in this task`,
      domain: forDomain,
    });
  };

  // Primary risk first, then the remaining risks in priority order.
  const ordered = PRIORITY.filter((d): d is Exclude<RiskDomain, 'unknown'> => known.includes(d));
  for (const d of ordered) {
    trySelect(d, d);
  }

  // Verification companion: for non-trivial specialist work, prefer a
  // test/verification agent if the roster has one and the budget allows.
  if (chosen.length > 0 && chosen.length < max) {
    const candidate = specialists.find((s) => !used.has(s.name) && TEST_KEYWORD.test(`${s.name} ${s.role}`));
    if (candidate) {
      used.add(candidate.name);
      chosen.push({
        agent: candidate.name,
        role: candidate.role,
        rationale: 'verification companion: independently reproduces the acceptance criteria',
        domain: 'bug',
      });
    }
  }

  return chosen.slice(0, max);
}

/**
 * Plan the full risk posture for a task: primary risk, detected domains,
 * strict-verification flag, required review pass, and the right-sized
 * specialist recommendation (bounded by the effort planner's budget).
 */
export function planRisk(goal: string, opts: RiskPlannerOptions = {}): RiskPlan {
  const domains = classifyRiskDomains(goal);
  const primary = primaryOf(domains);
  const complexity = opts.complexity ?? 'medium';
  const max = opts.maxSpecialists ?? 0;
  const strictVerification = domains.some((d) => STRICT_DOMAINS.has(d));

  // Trivial + no strict risk: the right answer is ZERO specialists, even though
  // the effort budget would allow one.
  const trivial = complexity === 'low' && !strictVerification;
  const recommended = trivial
    ? []
    : selectSpecialists(domains, opts.specialists ?? [], Math.max(0, max));

  const reason = buildReason(domains, primary, complexity, strictVerification, recommended);

  return {
    risk: primary,
    domains,
    strictVerification,
    requiredReview: strictVerification ? primary : undefined,
    recommendedSpecialists: recommended,
    reason,
  };
}

function buildReason(
  domains: RiskDomain[],
  primary: RiskDomain,
  complexity: TaskComplexity,
  strictVerification: boolean,
  recommended: RecommendedSpecialist[],
): string {
  const riskLabel =
    domains.length === 1 && domains[0] === 'unknown'
      ? 'no specific risk detected'
      : `${domains.join(', ')} risk detected`;
  const roster = recommended.map((r) => `"${r.agent}"`).join(', ');
  const verify =
    strictVerification ? 'strict verification required' : complexity === 'low' ? 'minimal verification' : 'standard verification';
  return `${riskLabel} (primary: ${primary}); complexity ${complexity} -> ${verify}${roster ? `; recommended specialists: ${roster}` : ''}`;
}

/** Compact agent-facing guidance merging effort budget + risk plan into the per-turn state note. */
export function buildPlanNote(effort: EffortPlan, risk: RiskPlan): string {
  const rec =
    risk.recommendedSpecialists.length > 0
      ? risk.recommendedSpecialists.map((r) => `"${r.agent}" (${r.rationale})`).join(', ')
      : 'none recommended - do the work yourself with your own tools';
  const review = risk.requiredReview ? ` Required review pass: ${risk.requiredReview}.` : '';
  return (
    `PLANNED EFFORT - ${effort.complexity} (${effort.reason}). ` +
    `Turn budget ${effort.maxTurns}; ${effort.maxSpecialists} specialists; ${effort.contextBudget.maxBytes} bytes context; verification ${effort.verificationDepth}.` +
    `\nRISK ANALYSIS - ${risk.risk}: ${risk.reason}. Recommended specialists: ${rec}.${review} ` +
    `Spend specialists intentionally: only for the risks above, never beyond the budget.`
  );
}