import type { SemanticRoleBinding } from '../model/capability.js';

/**
 * Semantic role inference. Maps provider-specific parameter names onto
 * universal roles so the resolver works regardless of external vocabulary.
 * The original external name is ALWAYS preserved on the returned binding —
 * inference guides reasoning; it never rewrites the provider contract.
 */

interface RoleRule {
  role: string;
  confidence: number;
  /** Human-readable pattern family, used as inference evidence. */
  family: string;
  patterns: RegExp[];
}

/**
 * Ordered most-specific-first: a compound scope identifier like
 * `project_uuid` must classify as parent-scope before the generic
 * resource-id rule can claim it.
 */
const ROLE_RULES: RoleRule[] = [
  {
    role: 'database-admin-username',
    confidence: 0.82,
    family: 'database administrator username vocabulary',
    patterns: [/^(postgres|pgsql|pg|mysql|db|database|admin|owner|root)[_-]?(user|username|login|admin)(name)?$/i, /^(admin|owner)[_-]?name$/i, /^owner$/i],
  },
  {
    role: 'database-admin-password',
    confidence: 0.85,
    family: 'database administrator password vocabulary',
    patterns: [/^(postgres|pgsql|pg|mysql|db|database|admin|owner|root)[_-]?(password|passwd|pwd|secret)$/i],
  },
  {
    role: 'parent-scope-id',
    confidence: 0.88,
    family: 'scope/parent identifier vocabulary',
    patterns: [
      /^(project|workspace|zone|space|tenant|org|organization|account|team|environment|cluster|namespace|realm|folder|site|app|application|region|subscription)[_-]?(id|ids|uuid|guid|ref|reference|key|slug)$/i,
      /^(tenant|realm|namespace)$/i,
    ],
  },
  {
    role: 'credential-secret',
    confidence: 0.9,
    family: 'credential vocabulary',
    patterns: [/^(api[_-]?key|token|secret|access[_-]?token|auth[_-]?token|password|passwd|pwd)$/i],
  },
  {
    role: 'resource-type',
    confidence: 0.7,
    family: 'type/kind vocabulary',
    patterns: [/^(type|kind|engine|flavor|variant|tier|category|class)$/i],
  },
  {
    role: 'resource-name',
    confidence: 0.72,
    family: 'display-name vocabulary',
    patterns: [/^(name|label|title|display[_-]?name|friendly[_-]?name)$/i],
  },
  {
    role: 'resource-id',
    confidence: 0.78,
    family: 'identifier suffix pattern',
    patterns: [/^(id|uuid|uid|guid|key|slug|ref|reference)$/i, /^[a-z][a-z0-9]*[_-]?(id|uuid|guid|uid)$/i],
  },
];

/**
 * Infer the semantic role of a parameter from its external name (and, as
 * weaker evidence, its description). Returns undefined when no rule applies.
 */
export function inferSemanticRole(externalName: string, hints?: { description?: string }): SemanticRoleBinding | undefined {
  const name = externalName.trim();
  if (!name) return undefined;
  for (const rule of ROLE_RULES) {
    const pattern = rule.patterns.find((p) => p.test(name));
    if (pattern) {
      const evidence = [`name "${name}" matched ${rule.family}`];
      if (hints?.description && pattern.test(hints.description)) evidence.push(`description of "${name}" also matched ${rule.family}`);
      return { externalName: name, semanticRole: rule.role, confidence: rule.confidence, evidence };
    }
  }
  return undefined;
}
