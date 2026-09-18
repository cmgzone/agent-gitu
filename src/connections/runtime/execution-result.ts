/**
 * Universal execution result format returned by all external capability sources
 * (native connections, MCP tools, CLI tools, plugins, built-in tools).
 * Provides a single consistent contract for evidence, cache, streaming, and UI.
 */

export type CapabilitySource = 'connection' | 'mcp' | 'native' | 'cli' | 'plugin';

export type ExecutionStatus = 'ok' | 'failed' | 'rejected' | 'cached';

export interface MemoryPolicy {
  promotable: boolean;
  stability: 'stable' | 'session' | 'volatile';
}

export interface ExecutionResult {
  /** Unique correlation ID for the execution lifecycle (e.g. conn-exec-1725345678-abc123) */
  executionId: string;
  source: CapabilitySource;
  provider?: string;
  connectionId?: string;
  capability: string;
  operationId?: string;
  status: ExecutionStatus;
  httpStatus?: number;
  data?: unknown;
  message: string;
  /** Durable task evidence ID if recorded (e.g. pe-1) */
  evidenceId?: string;
  /** SHA-256 digest of normalized response data */
  resultDigest?: string;
  /** Remote-state epoch at time of observation */
  stateEpoch: number;
  /** True when the result was served from cache without an external network call */
  cacheHit: boolean;
  /** Semantic error class when status is 'failed' or 'rejected' */
  errorClass?: string;
  /** Memory policy governing promotion into long-term MemoryStore */
  memoryPolicy?: MemoryPolicy;
}
