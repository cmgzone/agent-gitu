import { canonicalJson, sha256 } from '../../util.js';
import type { Capability } from './model/capability.js';
import type { SemanticError } from './model/errors.js';
import type { VerifiedExecution } from './model/verification.js';
import { CapabilityCache } from './cache/capability-cache.js';
import { RemoteStateDiscoverer, type StateSnapshot } from './discovery/state-discovery.js';
import { UniversalExecutor, type ExecutorOptions, type McpTransport } from './execution/executor.js';
import { RetryGuard } from './execution/retry-guard.js';
import { SemanticCapabilityGraph } from './graph/capability-graph.js';
import { introspectGraphQl, type GraphQlIntrospection } from './interpreters/graphql.js';
import { introspectMcpTools, type McpToolDefinition } from './interpreters/mcp.js';
import { introspectOpenApi } from './interpreters/openapi.js';
import { normalizeOperations } from './semantics/inference.js';
import { PrerequisiteResolver } from './resolution/prerequisite-resolver.js';
import type { ResolutionPlan } from './resolution/resolution-plan.js';
import { ResultVerifier } from './verification/verifier.js';
import { VaultCredentialBroker, type CredentialBroker } from './credentials/credential-broker.js';

/**
 * The Universal Connection Runtime orchestrator.
 *
 * Phases: introspect → normalize → graph (cached by schema fingerprint) →
 * desired-state matching → safe state discovery → prerequisite resolution →
 * policy gate → retry guard → executor (broker-mediated credentials) →
 * independent verification.
 *
 * Architectural invariant: this file contains NO provider-name orchestration
 * and NO protocol branching — it only ever handles Capability objects.
 */

export type IntrospectionSource =
  | { kind: 'openapi'; document: unknown }
  | { kind: 'graphql'; introspection: GraphQlIntrospection }
  | { kind: 'mcp'; tools: McpToolDefinition[] };

export interface RuntimeOptions {
  connectionId: string;
  baseUrl: string;
  broker?: CredentialBroker;
  fetchImpl?: typeof fetch;
  graphqlEndpoint?: string;
  mcpTransport?: McpTransport;
}

export interface MutationPlan {
  capability: Capability;
  plan: ResolutionPlan;
}

export interface ExecuteOptions {
  /** Policy gate hook: destructive mutations require explicit approval. */
  approval?: (plan: MutationPlan) => Promise<boolean> | boolean;
}

const MUTATION_ACTIONS = new Set(['create', 'update', 'delete', 'attach', 'detach', 'execute']);

export interface IntrospectionResult {
  capabilityCount: number;
  fromCache: boolean;
  schemaFingerprint: string;
}

export class UniversalConnectionRuntime {
  private graph = new SemanticCapabilityGraph();
  private schemaFingerprint = '';
  private cache: CapabilityCache;
  private executor: UniversalExecutor;
  private discoverer!: RemoteStateDiscoverer;
  private retryGuard = new RetryGuard();
  private resolver!: PrerequisiteResolver;
  private verifier!: ResultVerifier;

  constructor(private options: RuntimeOptions) {
    this.cache = new CapabilityCache(options.connectionId);
    this.executor = new UniversalExecutor({
      connectionId: options.connectionId,
      baseUrl: options.baseUrl,
      broker: options.broker ?? new VaultCredentialBroker(),
      fetchImpl: options.fetchImpl,
      graphqlEndpoint: options.graphqlEndpoint,
      mcpTransport: options.mcpTransport,
    });
    this.rebindDerived();
  }

  private rebindDerived(): void {
    this.discoverer = new RemoteStateDiscoverer(this.executor, this.graph, this.options.connectionId, this.schemaFingerprint);
    this.resolver = new PrerequisiteResolver(this.graph);
    this.verifier = new ResultVerifier(this.executor, this.graph, this.options.connectionId, this.schemaFingerprint, () => this.discoverer.currentEpoch());
  }

  graphView(): SemanticCapabilityGraph {
    return this.graph;
  }

  /** Introspect a connection, or reuse the cached graph when unchanged. */
  async introspect(source: IntrospectionSource): Promise<IntrospectionResult> {
    const fingerprint = sha256(canonicalJson(source));
    const cached = this.cache.load(fingerprint);
    if (cached) {
      this.graph = SemanticCapabilityGraph.build(cached.capabilities);
      this.schemaFingerprint = fingerprint;
      this.rebindDerived();
      return { capabilityCount: this.graph.listCapabilities().length, fromCache: true, schemaFingerprint: fingerprint };
    }
    const raw = source.kind === 'openapi' ? introspectOpenApi(source.document) : source.kind === 'graphql' ? introspectGraphQl(source.introspection) : introspectMcpTools(source.tools);
    this.graph = SemanticCapabilityGraph.build(normalizeOperations(raw));
    this.schemaFingerprint = fingerprint;
    this.cache.store(this.graph, fingerprint, source.kind);
    this.rebindDerived();
    return { capabilityCount: this.graph.listCapabilities().length, fromCache: false, schemaFingerprint: fingerprint };
  }

  /** PHASE 2 — safe remote-state observation (reads only). */
  async discoverState(conceptHint?: string): Promise<StateSnapshot> {
    return this.discoverer.observe(conceptHint);
  }

  /** Capabilities that can satisfy a desired semantic target. */
  capabilitiesForIntent(conceptId: string, hints?: string[]): Capability[] {
    return this.graph.findForDesiredTarget(conceptId, hints).filter((c) => MUTATION_ACTIONS.has(c.action));
  }

  /** PHASE 3 — plan a mutation: desired state vs prerequisites, no execution. */
  planMutation(capabilityId: string, known: Record<string, unknown> = {}): MutationPlan {
    const capability = this.graph.capability(capabilityId);
    if (!capability) throw new Error(`Unknown capability "${capabilityId}".`);
    return { capability, plan: this.resolver.plan(capabilityId, known) };
  }

  /** PHASE 4/5 — policy gate → retry guard → executor → verification. */
  async executeCapability(capabilityId: string, params: Record<string, unknown> = {}, options: ExecuteOptions = {}): Promise<VerifiedExecution> {
    const capability = this.graph.capability(capabilityId);
    if (!capability) throw new Error(`Unknown capability "${capabilityId}".`);
    const blocked = (error: SemanticError, trace: string): VerifiedExecution => ({
      capabilityId,
      action: capability.action,
      execution: { ok: false, status: 0, executionConfidence: 0, fingerprint: '', trace, error },
      verification: { status: 'skipped', confidence: 0, strategy: 'none', detail: 'not executed' },
      summary: error.category,
    });

    // Policy gate: destructive actions need explicit approval; reversible
    // mutations pass through the approval hook when one is provided.
    if (capability.sideEffect !== 'none') {
      const approved = options.approval ? await options.approval({ capability, plan: this.resolver.plan(capabilityId, params) }) : capability.sideEffect !== 'destructive';
      if (!approved) return blocked({ category: 'POLICY_BLOCKED', retryable: false, operationValid: 'yes', suspectedCause: ['policy gate declined or withheld approval'] }, `capability ${capabilityId} blocked by policy gate`);
    }

    const ctx = { connectionId: this.options.connectionId, schemaFingerprint: this.schemaFingerprint, stateEpoch: this.discoverer.currentEpoch() };
    const assessment = this.retryGuard.assess(capability, params, ctx);
    if (!assessment.allowed) {
      return blocked({ category: 'BLOCKED_DUPLICATE', retryable: false, operationValid: 'yes', suspectedCause: ['identical operation, parameters, schema and state already failed'], detail: assessment.reason }, assessment.reason ?? 'duplicate blocked');
    }

    const outcome = await this.executor.execute(capability, params, ctx);
    if (!outcome.ok) {
      this.retryGuard.recordFailure(capability, params, ctx, outcome.error ?? { category: 'UNKNOWN', retryable: false, operationValid: 'unknown', suspectedCause: [] });
      return {
        capabilityId,
        action: capability.action,
        execution: outcome,
        verification: { status: 'skipped', confidence: 0, strategy: 'none', detail: 'execution failed — verification not attempted' },
        summary: `FAILED: ${outcome.error?.category ?? 'UNKNOWN'}`,
      };
    }
    this.discoverer.bumpEpoch();
    this.retryGuard.noteStateChange();
    const verification = await this.verifier.verify(capability, params, outcome);
    const summary = `EXECUTED, ${verification.status === 'verified' ? 'VERIFIED' : verification.status === 'partial' ? 'PARTIALLY VERIFIED' : verification.status.toUpperCase()}`;
    return { capabilityId, action: capability.action, execution: outcome, verification, summary };
  }
}

export type { ExecutorOptions, McpTransport };
