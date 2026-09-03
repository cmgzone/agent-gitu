import { sha256 } from '../util.js';

/** Secret field names whose values must never enter fingerprints/digests. */
const SECRET_KEYS = new Set([
  'password',
  'passwd',
  'pwd',
  'secret',
  'token',
  'api_key',
  'apikey',
  'access_token',
  'refresh_token',
  'auth',
  'authorization',
  'credential',
  'credentials',
  'private_key',
  'client_secret',
  'session_token',
]);

const SECRET_ASSIGNMENT_RE =
  /(password|passwd|pwd|secret|token|api[-_]?key|access[-_]?token|refresh[-_]?token|authorization|credential|private[-_]?key|client[-_]?secret|session[-_]?token)\s*[:=]\s*(?:"[^"]*"|'[^']*'|\S+)/gi;

/** Redact secret assignments from free text before hashing/display. */
export function redactSecrets(text: string): string {
  if (!text) return text;
  return text.replace(SECRET_ASSIGNMENT_RE, '$1=[redacted]');
}

/** Strip secret-valued fields from a params object before fingerprinting. */
export function redactParams(params: Record<string, unknown> | undefined): Record<string, unknown> {
  if (!params) return {};
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(params)) {
    if (SECRET_KEYS.has(k.toLowerCase().replace(/[^a-z]/g, '')) || SECRET_KEYS.has(k.toLowerCase())) {
      out[k] = '[redacted]';
    } else if (typeof v === 'string' && v.length > 0 && /token|secret|password|credential/i.test(k)) {
      out[k] = '[redacted]';
    } else if (v !== null && typeof v === 'object' && !Array.isArray(v)) {
      out[k] = redactParams(v as Record<string, unknown>);
    } else {
      out[k] = v;
    }
  }
  return out;
}

/** Stable digest of an observation/output with secrets redacted. */
export function digestObservation(output: string): string {
  return sha256(redactSecrets(output || '').slice(0, 4000));
}

/** Digest of structured fields with secrets redacted and keys canonicalized. */
export function digestFields(fields: Record<string, unknown>): string {
  const redacted = redactParams(fields);
  const keys = Object.keys(redacted).sort();
  const canonical = keys.map((k) => `${k}=${JSON.stringify(redacted[k])}`).join('|');
  return sha256(canonical);
}

// ── Semantic normalization (domain-neutral, no technology knowledge) ────────
// Maps superficial wording differences to a canonical form so trivial
// rewording cannot bypass strategy loop protection. The synonym groups below
// cover GENERIC retry/inspect/repair vocabulary only — never specific
// technologies, providers, or error codes.

const SYNONYMS: [RegExp, string][] = [
  [/\b(try|retry|reattempt|re-attempt|attempt again|attempt)\b/g, 'retry'],
  [/\b(again|once more|one more time)\b/g, 'retry'],
  [/\b(log\s?in|login|log-in|logging\s?in|sign\s?in|signin|authenticate|authentication|auth)\b/g, 'auth'],
  [/\b(submit|send|post|resend)\b/g, 'submit'],
  [/\b(same|identical|exact same)\b/g, 'same'],
  [/\b(credentials?|passwords?|passphrases?)\b/g, 'credential'],
  [/\b(check|inspect|look at|examine|review|verify|view|read)\b/g, 'inspect'],
  [/\b(fix|repair|patch|correct|resolve|remediate)\b/g, 'repair'],
  [/\b(test|probe|diagnose|diagnosis)\b/g, 'diagnose'],
  [/\b(restart|reboot|relaunch|recycle)\b/g, 'restart'],
  [/\b(reinstall|re-install)\b/g, 'reinstall'],
  [/\b(delete|remove|drop|destroy)\b/g, 'delete'],
  [/\b(create|provision|add|make)\b/g, 'create'],
  [/\b(update|upgrade|modify|change|edit)\b/g, 'update'],
];

const STOPWORDS = new Set([
  'a', 'an', 'the', 'to', 'of', 'in', 'on', 'for', 'with', 'and', 'or', 'is', 'are', 'be', 'please', 'just', 'now', 'then', 'it', 'this', 'that',
]);

/** Canonical semantic form of a hypothesis/strategy statement (secrets redacted). */
export function canonicalStatement(text: string): string {
  let s = redactSecrets(text || '').toLowerCase();
  s = s.replace(/[`"'“”‘’]/g, ' ');
  s = s.replace(/[^a-z0-9\s-]/g, ' ');
  for (const [re, replacement] of SYNONYMS) {
    s = s.replace(re, replacement);
  }
  const tokens = s
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 0 && !STOPWORDS.has(t));
  // Stem inflections for stability, then dedupe: repetition ("try ...
  // again") carries no semantic content for loop protection.
  const stemmed = tokens.map((t) => stemToken(t));
  const unique = [...new Set(stemmed)];
  unique.sort();
  return unique.join(' ');
}

/** Semantic digest: identical for trivial rewordings, secrets never included. */
export function semanticDigest(text: string): string {
  return sha256(canonicalStatement(text));
}

/** Whether two statements are semantically equivalent under canonicalization. */
export function isSemanticallyEquivalent(a: string, b: string): boolean {
  if (!a || !b) return false;
  return semanticDigest(a) === semanticDigest(b);
}

/**
 * Domain-neutral word stemmer (plural/past-tense/gerund folding only — no
 * technology knowledge). Shared by canonicalization and expected-text matching
 * so both treat inflections identically.
 */
export function stemToken(w: string): string {
  if (w.length > 5 && w.endsWith('ing')) return w.slice(0, -3);
  if (w.length > 4 && w.endsWith('ed')) return w.slice(0, -2);
  if (w.length > 4 && w.endsWith('es') && !w.endsWith('sses')) return w.slice(0, -2);
  if (w.length > 4 && w.endsWith('s') && !w.endsWith('ss')) return w.slice(0, -1);
  return w;
}
