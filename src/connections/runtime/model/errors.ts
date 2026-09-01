/**
 * Semantic error normalization. The model never sees a bare HTTP status; it
 * sees a category, retryability, and suspected causes so recovery is
 * deterministic instead of "retry and hope".
 */

export type ErrorCategory =
  | 'AUTHENTICATION'
  | 'PERMISSION'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'VALIDATION'
  | 'RATE_LIMITED'
  | 'SERVER'
  | 'TIMEOUT'
  | 'TRANSPORT'
  | 'BLOCKED_DUPLICATE'
  | 'POLICY_BLOCKED'
  | 'UNKNOWN';

export interface SemanticError {
  category: ErrorCategory;
  retryable: boolean;
  /** Whether the operation itself is believed to still be valid. */
  operationValid: 'yes' | 'no' | 'unknown';
  suspectedCause: string[];
  status?: number;
  detail?: string;
}

const CATEGORY_BY_STATUS: Record<number, { category: ErrorCategory; retryable: boolean; operationValid: 'yes' | 'no' | 'unknown'; causes: string[] }> = {
  401: { category: 'AUTHENTICATION', retryable: true, operationValid: 'yes', causes: ['credential missing, expired, or revoked', 'credential recovery should run before any retry'] },
  403: { category: 'PERMISSION', retryable: false, operationValid: 'yes', causes: ['authenticated identity lacks the required scope or role', 'connection may need elevated permissions granted by the user'] },
  404: { category: 'NOT_FOUND', retryable: false, operationValid: 'unknown', causes: ['wrong operation path or stale discovered schema', 'missing parent resource prerequisite', 'resource already deleted'] },
  409: { category: 'CONFLICT', retryable: false, operationValid: 'yes', causes: ['resource may already exist — rediscover state before retrying', 'concurrent modification by another actor'] },
  422: { category: 'VALIDATION', retryable: false, operationValid: 'yes', causes: ['required parameter mapping is wrong or incomplete', 'parameter value format rejected by schema'] },
  429: { category: 'RATE_LIMITED', retryable: true, operationValid: 'yes', causes: ['rate limit exceeded — wait according to retry policy'] },
};

/** Normalize an HTTP failure status into deterministic recovery semantics. */
export function normalizeHttpFailure(status: number, bodyText?: string): SemanticError {
  const detail = bodyText ? bodyText.slice(0, 400) : undefined;
  const known = CATEGORY_BY_STATUS[status];
  if (known) return { ...known, suspectedCause: known.causes, status, detail };
  if (status >= 500 && status <= 599) {
    return { category: 'SERVER', retryable: true, operationValid: 'yes', status, detail, suspectedCause: ['provider-side failure — bounded retry allowed', 'if retries exhaust, surface to the user'] };
  }
  return { category: 'UNKNOWN', retryable: false, operationValid: 'unknown', status, detail, suspectedCause: ['unrecognized failure — inspect response before any retry'] };
}

/** Normalize a transport-level failure (timeout, DNS, socket). */
export function normalizeTransportError(message: string): SemanticError {
  const timeout = /timeout|timed?\s?out|etimedout|esockettimedout/i.test(message);
  return timeout
    ? { category: 'TIMEOUT', retryable: true, operationValid: 'yes', suspectedCause: ['transport timeout — bounded retry allowed', 'operation may have succeeded despite the timeout — verify before retrying a mutation'], detail: message.slice(0, 400) }
    : { category: 'TRANSPORT', retryable: true, operationValid: 'unknown', suspectedCause: ['network unreachable or DNS failure'], detail: message.slice(0, 400) };
}
