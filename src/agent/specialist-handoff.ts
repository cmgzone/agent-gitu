import type { ContextEngine } from '../context/context-engine.js';
import type { ContextPack, CriterionSpec, PlanStep, SpecialistHandoff } from '../types.js';

export function specialistHandoffTerms(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .split(/[^a-z0-9_./-]+/)
      .map((term) => term.replace(/[_./-]+/g, ''))
      .filter((term) => term.length >= 3),
  );
}

export function specialistHandoffOverlap(terms: Set<string>, text: string): number {
  if (terms.size === 0) return 0;
  const target = specialistHandoffTerms(text);
  let count = 0;
  for (const term of terms) if (target.has(term)) count += 1;
  return count;
}

/**
 * Build a small, task-specific briefing for one delegated specialist. The
 * parent has already read and indexed the project; passing its useful output
 * prevents every fresh worker from paying to rediscover the same codebase.
 */
export function buildSpecialistHandoff(
  task: string,
  parentGoal: string,
  context: ContextEngine,
  parentPack: ContextPack | undefined,
  parentPlan: PlanStep[],
  delegatedCriteria: (string | CriterionSpec)[] | undefined,
  budget?: { maxFiles: number; maxExcerptChars: number },
): SpecialistHandoff {
  const maxFiles = Math.max(1, Math.min(6, budget?.maxFiles ?? 6));
  const maxExcerptChars = Math.max(800, Math.min(6_000, budget?.maxExcerptChars ?? 6_000));
  const maxExcerpts = maxFiles <= 3 ? 1 : maxFiles <= 4 ? 2 : 3;
  const criteria = (delegatedCriteria ?? []).map((criterion) => (typeof criterion === 'string' ? { text: criterion } : criterion));
  const criterionText = criteria.flatMap((criterion) => [criterion.text, criterion.verification ?? '']).filter(Boolean);
  let scopedPack: ContextPack | undefined;
  try {
    // Keep this local and lexical. Semantic embedding calls can be expensive;
    // the worker needs an immediate starting map, not another broad analysis.
    scopedPack = context.buildPack(task, { maxFiles, maxBytes: Math.max(2_000, maxExcerptChars + 1_500) }, criterionText);
  } catch {
    // A handoff is an optimisation, never a reason to reject delegation.
  }

  const startingFiles: SpecialistHandoff['startingFiles'] = [];
  const seen = new Set<string>();
  const addFiles = (refs: SpecialistHandoff['startingFiles'], limit: number): void => {
    for (const ref of refs) {
      if (startingFiles.length >= maxFiles || seen.has(ref.path)) continue;
      seen.add(ref.path);
      startingFiles.push(ref);
      if (startingFiles.length >= limit) break;
    }
  };
  const source = scopedPack ?? parentPack;
  if (source) {
    addFiles(source.primaryFiles, Math.min(3, maxFiles));
    addFiles(source.testFiles, Math.min(4, maxFiles));
    addFiles(source.relatedFiles, Math.min(5, maxFiles));
    addFiles(source.configFiles, maxFiles);
  }
  // A very sparse task can have no lexical matches. Fall back to the parent
  // retrieval pack rather than making the specialist inventory the project.
  if (startingFiles.length === 0 && parentPack && parentPack !== source) {
    addFiles(parentPack.primaryFiles, Math.min(3, maxFiles));
    addFiles(parentPack.testFiles, Math.min(4, maxFiles));
    addFiles(parentPack.relatedFiles, Math.min(5, maxFiles));
    addFiles(parentPack.configFiles, maxFiles);
  }

  const excerpts: SpecialistHandoff['excerpts'] = [];
  let sourceCharsLeft = maxExcerptChars;
  for (const file of startingFiles) {
    if (excerpts.length >= maxExcerpts || sourceCharsLeft <= 0) break;
    const content = context.peekFile(file.path, Math.min(Math.ceil(maxExcerptChars / maxExcerpts), sourceCharsLeft));
    if (!content) continue;
    excerpts.push({ path: file.path, content });
    sourceCharsLeft -= content.length;
  }

  const taskTerms = specialistHandoffTerms([task, ...criterionText].join('\n'));
  const planSteps = parentPlan
    .filter((step) => step.status !== 'done')
    .map((step) => ({ step, score: specialistHandoffOverlap(taskTerms, `${step.description}\n${step.verification}`) }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map(({ step }) => ({ description: step.description, verification: step.verification }));
  const verificationTargets = [
    ...criteria.map((criterion) => (criterion.verification ? `${criterion.text} — verify: ${criterion.verification}` : criterion.text)),
    ...planSteps.map((step) => step.verification).filter((verification) => verification && !/^n\/?a$|^manual check$/i.test(verification)),
  ]
    .filter(Boolean)
    .slice(0, 5);

  return {
    parentGoal: parentGoal.slice(0, 1_200),
    startingFiles,
    excerpts,
    planSteps,
    verificationTargets,
  };
}
