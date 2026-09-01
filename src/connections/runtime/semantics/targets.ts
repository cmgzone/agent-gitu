import type { SemanticConcept } from '../model/capability.js';

/**
 * Semantic target inference. Builds semantic concepts from schema enums,
 * descriptions and names. Word singularization is deliberately a WEAK lexical
 * hint: schema structure, descriptions, enums and relationships are the
 * strong evidence; word normalization only fills the gaps.
 */

/** Vocabulary mapping external words to semantic concepts. */
const VOCABULARY: Record<string, { id: string; label: string }> = {
  postgres: { id: 'postgresql-database', label: 'PostgreSQL database' },
  pgsql: { id: 'postgresql-database', label: 'PostgreSQL database' },
  postgresql: { id: 'postgresql-database', label: 'PostgreSQL database' },
  mysql: { id: 'mysql-database', label: 'MySQL database' },
  mariadb: { id: 'mysql-database', label: 'MySQL-compatible database' },
  redis: { id: 'redis-cache', label: 'Redis cache' },
  valkey: { id: 'redis-cache', label: 'Redis-compatible cache' },
  mongo: { id: 'mongodb-database', label: 'MongoDB database' },
  mongodb: { id: 'mongodb-database', label: 'MongoDB database' },
  database: { id: 'database', label: 'Database' },
  db: { id: 'database', label: 'Database' },
  engine: { id: 'managed-service', label: 'Managed service' },
  service: { id: 'managed-service', label: 'Managed service' },
  'data-service': { id: 'managed-service', label: 'Managed service' },
  bucket: { id: 'storage-bucket', label: 'Storage bucket' },
  deployment: { id: 'deployment', label: 'Deployment' },
  application: { id: 'application', label: 'Application' },
  app: { id: 'application', label: 'Application' },
  project: { id: 'project', label: 'Project' },
  workspace: { id: 'workspace', label: 'Workspace' },
  zone: { id: 'zone', label: 'Zone' },
  space: { id: 'space', label: 'Space' },
  account: { id: 'account', label: 'Account' },
  environment: { id: 'environment', label: 'Environment' },
  cluster: { id: 'cluster', label: 'Cluster' },
  server: { id: 'server', label: 'Server' },
};

const IRREGULAR_SINGULARS: Record<string, string> = {
  people: 'person',
  children: 'child',
  data: 'data',
  series: 'series',
  species: 'species',
  indices: 'index',
  matrices: 'matrix',
  vertices: 'vertex',
  statuses: 'status',
};

/**
 * Weak singularization hint. Weird plurals (data, series, statuses) are
 * handled by a small irregular map; anything unrecognizable is returned
 * unchanged rather than guessed at.
 */
export function singularize(word: string): string {
  const lower = word.toLowerCase();
  if (IRREGULAR_SINGULARS[lower]) return IRREGULAR_SINGULARS[lower]!;
  if (/ies$/.test(lower) && lower.length > 4) return `${lower.slice(0, -3)}y`;
  if (/(ches|shes|xes|sses)$/.test(lower) && lower.length > 4) return lower.slice(0, -2);
  if (/(us|is|ss)$/.test(lower)) return lower;
  if (/s$/.test(lower) && lower.length > 3) return lower.slice(0, -1);
  return lower;
}

/** Map a single word to a semantic concept, using vocabulary then weak singularization. */
export function conceptFromWord(word: string): { id: string; label: string } {
  const vocab = VOCABULARY[word.toLowerCase()];
  if (vocab) return { id: vocab.id, label: vocab.label };
  const singular = singularize(word);
  const singularVocab = VOCABULARY[singular];
  if (singularVocab) return { id: singularVocab.id, label: singularVocab.label };
  const label = singular.replace(/[_-]+/g, ' ');
  return { id: singular.replace(/[_-]+/g, '-'), label: label.charAt(0).toUpperCase() + label.slice(1) };
}

function scanWords(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 1);
}

export interface TargetInference {
  target: SemanticConcept;
  variants: SemanticConcept[];
}

export interface TargetHints {
  /** Operation or path name, e.g. "createEngine" or the last path literal. */
  name?: string;
  description?: string;
  /** Enum values found in the schema, e.g. ["postgres","mysql","redis"]. */
  enumValues?: string[];
  /** Additional evidence strings to attach to the inference. */
  evidence?: string[];
}

/**
 * First vocabulary concept embedded in a compound enum value, e.g.
 * "relational-postgres" → postgresql-database. Naming conventions must not be
 * able to hide a type the schema explicitly declares.
 */
function embeddedVocabularyConcept(value: string): { id: string; label: string } | undefined {
  for (const token of scanWords(value)) {
    const vocab = VOCABULARY[token] ?? VOCABULARY[singularize(token)];
    if (vocab) return vocab;
  }
  return undefined;
}

/**
 * Infer the semantic target of an operation plus its type variants. Confidence
 * ranking: schema enum (strongest) > description > name > weak lexical hint.
 * Exact enum matches outrank compound enum values; plural forms resolve at the
 * same tier as their singulars.
 */
export function inferSemanticTarget(hints: TargetHints): TargetInference {
  const evidence: string[] = [...(hints.evidence ?? [])];
  const variants: SemanticConcept[] = [];

  // Enum values are the strongest signal: a schema that literally offers
  // ["postgres","mysql","redis"] is declaring its type variants.
  for (const value of hints.enumValues ?? []) {
    const exact = VOCABULARY[value.toLowerCase()];
    const concept = exact ?? embeddedVocabularyConcept(value);
    if (concept && !variants.some((v) => v.id === concept.id)) {
      variants.push({
        ...concept,
        confidence: exact ? 0.92 : 0.85,
        evidence: exact ? [`schema enum contains "${value}"`] : [`schema enum value "${value}" contains vocabulary token`],
      });
    }
  }

  // Description keywords outrank the name.
  let target: SemanticConcept | undefined;
  if (hints.description) {
    for (const word of scanWords(hints.description)) {
      const vocab = VOCABULARY[word] ?? VOCABULARY[singularize(word)];
      if (vocab) {
        evidence.push(`description mentions "${word}"`);
        target = { ...vocab, confidence: 0.8, evidence: [...evidence] };
        break;
      }
    }
  }

  // Name / path segment keywords.
  if (!target && hints.name) {
    for (const word of scanWords(hints.name.replace(/([a-z])([A-Z])/g, '$1 $2'))) {
      const vocab = VOCABULARY[word] ?? VOCABULARY[singularize(word)];
      if (vocab) {
        evidence.push(`name "${hints.name}" contains "${word}"`);
        target = { ...vocab, confidence: 0.68, evidence: [...evidence] };
        break;
      }
    }
  }

  // Nothing recognized: derive from the name as a weak lexical hint only.
  if (!target) {
    const name = hints.name ?? 'unknown-resource';
    const { id, label } = conceptFromWord(name);
    evidence.push(`no schema, description, or vocabulary evidence — derived from name "${name}" (weak hint)`);
    target = { id, label, confidence: 0.45, evidence: [...evidence] };
  } else {
    target = { ...target, confidence: Math.min(0.97, target.confidence + 0.03 * Math.max(0, evidence.length - 1)), evidence: [...evidence] };
  }

  return { target, variants };
}
