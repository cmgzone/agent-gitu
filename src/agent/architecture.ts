import { readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import type { ArchitectureDecision, DecisionBasis, TaskLedgerData } from '../types.js';

/**
 * Architecture decision support.
 *
 * Design goals:
 *  - decisions are COMPACT records in the ledger (they ride along in every
 *    state message, so they must stay small);
 *  - explicit user requirements outrank the agent's preferences — the agent
 *    may never reject a technology the user explicitly asked for, but it may
 *    reject a popular one when nothing requires it and the repository
 *    evidence supports a simpler solution;
 *  - completion audits flag drift (chosen tech absent / rejected tech
 *    introduced) without hard-blocking reasonable engineering judgment.
 */

export const TECHNOLOGY_KEYWORDS: Record<string, RegExp> = {
  react: /\breact(?:\.js|js)?\b/i,
  preact: /\bpreact\b/i,
  svelte: /\bsvelte(?:kit)?\b/i,
  vue: /\bvue(?:\.js|js)?\b/i,
  angular: /\bangular\b/i,
  solidjs: /\bsolid(?:js)?\b/i,
  astro: /\bastro\b/i,
  vanilla: /\bvanilla\s*(?:js|javascript)\b/i,
  jquery: /\bjquery\b/i,
};

const NEGATION_RE = /\b(not|no|don'?t|never|without|avoid|skip|exclude(?:d)?|instead\s+of)\b(?:\s+\w+){0,2}\s*$/i;

export interface ExplicitTechnologyScan {
  /** Technologies the user explicitly asked to be used. */
  required: string[];
  /** Technologies the user explicitly excluded. */
  excluded: string[];
}

/** Scan goal/criteria/constraint texts for explicit technology mentions and
 *  split them into required vs excluded based on nearby negation. */
export function detectExplicitTechnologies(texts: string[]): ExplicitTechnologyScan {
  const required = new Set<string>();
  const excluded = new Set<string>();
  for (const raw of texts) {
    if (!raw) continue;
    const text = raw.replace(/\s+/g, ' ');
    for (const [tech, re] of Object.entries(TECHNOLOGY_KEYWORDS)) {
      let match: RegExpExecArray | null;
      const global = new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g');
      while ((match = global.exec(text)) !== null) {
        const before = text.slice(Math.max(0, match.index - 24), match.index);
        if (NEGATION_RE.test(before)) excluded.add(tech);
        else required.add(tech);
      }
    }
  }
  for (const tech of excluded) required.delete(tech);
  return { required: [...required], excluded: [...excluded] };
}

export interface DecisionDraft {
  decision: string;
  alternatives: string[];
  repoEvidence: string;
  requirements: string[];
  rejected: { alternative: string; reason: string }[];
  reconsiderIf?: string;
  basis?: DecisionBasis;
  supersedes?: string;
}

const VALID_BASES: DecisionBasis[] = ['explicit-requirement', 'repository-constraint', 'recommendation', 'preference'];

/** Normalize a raw record_decision payload into a bounded draft. Returns
 *  undefined when the payload is too malformed to record. */
export function normalizeDecisionDraft(raw: Record<string, unknown>): DecisionDraft | undefined {
  const decision = String(raw['decision'] ?? '').trim().slice(0, 200);
  if (!decision) return undefined;
  const strList = (key: string, cap: number, itemCap: number): string[] => {
    const value = raw[key];
    if (!Array.isArray(value)) return [];
    return value.map((v) => String(v).trim().slice(0, itemCap)).filter(Boolean).slice(0, cap);
  };
  const rejectedRaw = raw['rejected'];
  const rejected: { alternative: string; reason: string }[] = [];
  if (Array.isArray(rejectedRaw)) {
    for (const item of rejectedRaw.slice(0, 6)) {
      if (typeof item === 'string') {
        rejected.push({ alternative: item.trim().slice(0, 80), reason: '' });
      } else if (item && typeof item === 'object') {
        const alt = String((item as Record<string, unknown>)['alternative'] ?? '').trim().slice(0, 80);
        const reason = String((item as Record<string, unknown>)['reason'] ?? '').trim().slice(0, 160);
        if (alt) rejected.push({ alternative: alt, reason });
      }
    }
  }
  const basisRaw = String(raw['basis'] ?? '').trim();
  return {
    decision,
    alternatives: strList('alternatives', 6, 80),
    repoEvidence: String(raw['repoEvidence'] ?? '').trim().slice(0, 300),
    requirements: strList('requirements', 8, 120),
    rejected,
    reconsiderIf: String(raw['reconsiderIf'] ?? '').trim().slice(0, 200) || undefined,
    basis: (VALID_BASES as string[]).includes(basisRaw) ? (basisRaw as DecisionBasis) : undefined,
    supersedes: typeof raw['supersedes'] === 'string' && raw['supersedes'] ? raw['supersedes'] : undefined,
  };
}

/** Which known technologies does a decision text choose? */
export function technologiesIn(text: string): string[] {
  const found: string[] = [];
  for (const [tech, re] of Object.entries(TECHNOLOGY_KEYWORDS)) {
    if (re.test(text)) found.push(tech);
  }
  return found;
}

/**
 * Validate a draft decision against explicit user requirements.
 * A technology the user explicitly required may not be rejected or omitted
 * in favor of something else; the agent keeps full freedom when nothing is
 * required.
 */
export function decisionConflicts(draft: DecisionDraft, required: string[]): string[] {
  const conflicts: string[] = [];
  if (required.length === 0) return conflicts;
  const chosen = technologiesIn(draft.decision);
  const rejectedNames = draft.rejected.map((r) => r.alternative.toLowerCase());
  for (const tech of required) {
    if (chosen.includes(tech)) continue;
    const explicitlyRejected = rejectedNames.some((name) => TECHNOLOGY_KEYWORDS[tech]?.test(name));
    conflicts.push(
      explicitlyRejected
        ? `The task explicitly requires ${tech}; it cannot be rejected. Use ${tech} or ask the user to change the requirement.`
        : `The task explicitly requires ${tech}, but the decision "${draft.decision}" does not use it. Include ${tech} in the chosen approach.`,
    );
  }
  return conflicts;
}

/** Compact one-line rendering for the per-turn state message. */
export function renderDecisions(decisions: ArchitectureDecision[]): string {
  const active = decisions.filter((d) => d.status === 'active');
  if (active.length === 0) return '(none recorded — use record_decision before significant technology/architecture choices)';
  return active
    .map((d) => {
      const rejected = d.rejected.length
        ? ` | rejected: ${d.rejected.map((r) => `${r.alternative}${r.reason ? ` (${r.reason})` : ''}`).join('; ')}`
        : '';
      const reconsider = d.reconsiderIf ? ` | reconsider if: ${d.reconsiderIf}` : '';
      return `${d.id} [${d.basis}] ${d.decision}${rejected}${reconsider}`;
    })
    .join('\n');
}

// ── Completion audit ──────────────────────────────────────────────────────

interface TechUsageMarkers {
  imports: RegExp;
  files?: RegExp;
  deps: string[];
}

const TECH_USAGE: Record<string, TechUsageMarkers> = {
  react: { imports: /from\s+['"]react['"]|require\(\s*['"]react['"]\)/, files: /\.(tsx|jsx)$/i, deps: ['react', 'react-dom'] },
  preact: { imports: /from\s+['"]preact['"]|require\(\s*['"]preact['"]\)/, files: /\.(tsx|jsx)$/i, deps: ['preact'] },
  vue: { imports: /from\s+['"]vue['"]|require\(\s*['"]vue['"]\)/, files: /\.vue$/i, deps: ['vue'] },
  svelte: { imports: /from\s+['"]svelte['"]|require\(\s*['"]svelte['"]\)/, files: /\.svelte$/i, deps: ['svelte'] },
  angular: { imports: /@angular\//, deps: ['@angular/core'] },
  solidjs: { imports: /from\s+['"]solid-js['"]/, deps: ['solid-js'] },
  jquery: { imports: /from\s+['"]jquery['"]|require\(\s*['"]jquery['"]\)|\$\(\s*['"#.]/, deps: ['jquery'] },
};

const FRAMEWORK_IMPORT_ANY = /from\s+['"](?:react|react-dom|preact|vue|svelte|solid-js|@angular\/)[^'"]*['"]|require\(\s*['"](?:react|preact|vue|svelte|solid-js)[^'"]*['"]\)/;
const BUILD_TOOL_FILE = /(?:^|\/)(vite|webpack|rollup|esbuild|parcel)\.config\.[a-z]+$|(?:^|\/)vite\.config\./i;

const AUDIT_MAX_FILES = 40;
const AUDIT_MAX_FILE_BYTES = 256 * 1024;

export interface ArchitectureAudit {
  ok: boolean;
  /** Concrete drift problems that should block completion (until explained). */
  issues: string[];
  /** Informational checks performed. */
  checks: string[];
}

function readRepoDependencies(repoRoot: string): Set<string> {
  try {
    const pkg = JSON.parse(readFileSync(path.join(repoRoot, 'package.json'), 'utf8')) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    return new Set([...Object.keys(pkg.dependencies ?? {}), ...Object.keys(pkg.devDependencies ?? {})]);
  } catch {
    return new Set();
  }
}

/**
 * Verify that the implementation follows the recorded architecture decisions:
 *  - a chosen framework must actually appear in the changed files or deps;
 *  - a decision for vanilla/no-framework code must not gain framework imports;
 *  - a decision justified by "no build system" must not add build tooling.
 * The audit is deliberately conservative: only clear marker-based violations
 * become issues, so reasonable engineering judgment is never hard-blocked.
 */
export function auditArchitecture(data: TaskLedgerData, repoRoot: string): ArchitectureAudit {
  const issues: string[] = [];
  const checks: string[] = [];
  const active = (data.architectureDecisions ?? []).filter((d) => d.status === 'active');
  if (active.length === 0) return { ok: true, issues, checks };

  const deps = readRepoDependencies(repoRoot);
  const changed = data.filesChanged.slice(0, AUDIT_MAX_FILES);
  const contents = new Map<string, string>();
  for (const rel of changed) {
    try {
      const abs = path.isAbsolute(rel) ? rel : path.join(repoRoot, rel);
      const st = statSync(abs);
      if (st.isFile() && st.size <= AUDIT_MAX_FILE_BYTES) contents.set(rel.replace(/\\/g, '/'), readFileSync(abs, 'utf8'));
    } catch {
      /* deleted/unreadable files carry no evidence */
    }
  }
  const allContent = [...contents.values()].join('\n');

  for (const decision of active) {
    const chosen = technologiesIn(decision.decision);
    const rejectedNames = decision.rejected.map((r) => r.alternative);
    const vanillaChosen = chosen.includes('vanilla') || /\bno\s+framework\b/i.test(decision.decision);
    const noBuildJustification = /\bno build (system|step|tooling)\b/i.test(`${decision.repoEvidence} ${decision.decision}`);

    // 1. Chosen framework must be actually used.
    for (const tech of chosen) {
      const markers = TECH_USAGE[tech];
      if (!markers || tech === 'vanilla') continue;
      const usedByFile = changed.some((f) => markers.files?.test(f.replace(/\\/g, '/')));
      const usedByImport = markers.imports.test(allContent);
      const usedByDep = markers.deps.some((dep) => deps.has(dep));
      if (usedByFile || usedByImport || usedByDep) {
        checks.push(`${decision.id}: ${tech} usage confirmed (${usedByImport ? 'imports' : usedByFile ? 'files' : 'dependency'})`);
      } else {
        issues.push(
          `${decision.id} chose ${tech}, but no ${tech} usage was found in changed files or package dependencies. ` +
            `Implement with ${tech} or record a new decision (record_decision with supersedes) explaining the change.`,
        );
      }
    }

    // 2. Vanilla decision: no framework imports may be introduced.
    if (vanillaChosen && FRAMEWORK_IMPORT_ANY.test(allContent)) {
      const offenders = [...contents.keys()].filter((f) => FRAMEWORK_IMPORT_ANY.test(contents.get(f) ?? ''));
      issues.push(
        `${decision.id} chose a vanilla/no-framework approach, but framework imports appear in: ${offenders.slice(0, 5).join(', ')}. ` +
          `Remove the framework usage or supersede the decision with justification.`,
      );
    }

    // 3. Rejected/excluded technologies must not sneak in via changed files.
    for (const alt of rejectedNames) {
      for (const [tech, markers] of Object.entries(TECH_USAGE)) {
        if (!TECHNOLOGY_KEYWORDS[tech]?.test(alt)) continue;
        const filesWithImport = [...contents.entries()]
          .filter(([, body]) => markers.imports.test(body))
          .map(([f]) => f);
        if (filesWithImport.length > 0) {
          issues.push(
            `${decision.id} rejected ${tech} (${decision.rejected.find((r) => TECHNOLOGY_KEYWORDS[tech]?.test(r.alternative))?.reason || 'see decision'}), ` +
              `but ${tech} imports appear in: ${filesWithImport.slice(0, 5).join(', ')}.`,
          );
        }
      }
    }

    // 4. "No build system" justification: no build tooling may be added.
    if (noBuildJustification && changed.some((f) => BUILD_TOOL_FILE.test(f.replace(/\\/g, '/')))) {
      issues.push(
        `${decision.id} is justified by the repository having no build system, but a build-tool config was added. ` +
          `Keep the no-build approach or supersede the decision with justification.`,
      );
    }
  }

  return { ok: issues.length === 0, issues, checks };
}
