/**
 * Trusted-runtime contracts for authorized Black Box security assessments.
 *
 * These types describe authority; they do not grant it. Only backend-owned
 * ownership verification, manifest signing, and session services may mint an
 * active BlackBoxCapability.
 */

type Brand<Value, Name extends string> = Value & { readonly __brand: Name };

export type BlackBoxTargetId = Brand<string, 'BlackBoxTargetId'>;
export type OwnershipChallengeId = Brand<string, 'OwnershipChallengeId'>;
export type AuthorizationManifestId = Brand<string, 'AuthorizationManifestId'>;
export type BlackBoxSessionId = Brand<string, 'BlackBoxSessionId'>;
export type BlackBoxCapabilityId = Brand<string, 'BlackBoxCapabilityId'>;
export type BlackBoxActivityId = Brand<string, 'BlackBoxActivityId'>;
export type BlackBoxFindingId = Brand<string, 'BlackBoxFindingId'>;
export type BlackBoxEvidenceId = Brand<string, 'BlackBoxEvidenceId'>;
export type BlackBoxRemediationId = Brand<string, 'BlackBoxRemediationId'>;
export type BlackBoxRetestId = Brand<string, 'BlackBoxRetestId'>;

export type BlackBoxPermission =
  | 'security_discovery'
  | 'web_testing'
  | 'vulnerability_validation';

export type BlackBoxRiskClass = 'L0' | 'L1' | 'L2' | 'L3';

export type OwnershipMethod = 'dns_txt' | 'https_file' | 'connector';

export type OwnershipChallengeStatus =
  | 'pending'
  | 'verified'
  | 'expired'
  | 'failed'
  | 'revoked';

export type BlackBoxSessionStatus =
  | 'pending_authorization'
  | 'active'
  | 'stopping'
  | 'stopped'
  | 'expired'
  | 'revoked'
  | 'completed';

export type BlackBoxActivityStatus =
  | 'queued'
  | 'running'
  | 'allowed'
  | 'denied'
  | 'completed'
  | 'failed'
  | 'cancelled';

export type BlackBoxFindingStatus =
  | 'suspected'
  | 'evidence_collected'
  | 'independently_validated'
  | 'confirmed'
  | 'reported'
  | 'fixed'
  | 'retested';

export type BlackBoxFindingSeverity =
  | 'informational'
  | 'low'
  | 'medium'
  | 'high'
  | 'critical';

export type BlackBoxRetestOutcome =
  | 'pending'
  | 'fixed'
  | 'still_vulnerable'
  | 'inconclusive'
  | 'cancelled';

export interface BlackBoxTarget {
  readonly id: BlackBoxTargetId;
  readonly hostname: string;
  readonly createdAt: Date;
  readonly ownershipVerifiedAt?: Date;
}

export interface OwnershipChallenge {
  readonly id: OwnershipChallengeId;
  readonly targetId: BlackBoxTargetId;
  readonly hostname: string;
  readonly method: OwnershipMethod;
  readonly token: string;
  readonly expectedValue: string;
  readonly verificationLocation: string;
  readonly status: OwnershipChallengeStatus;
  readonly createdAt: Date;
  readonly expiresAt: Date;
  readonly verifiedAt?: Date;
  readonly failureReason?: string;
}

/**
 * Durable proof that the backend verified control of a target. This proof does
 * not authorize testing and cannot be used as a session capability.
 */
export interface OwnershipVerification {
  readonly challengeId: OwnershipChallengeId;
  readonly targetId: BlackBoxTargetId;
  readonly hostname: string;
  readonly method: OwnershipMethod;
  readonly verified: boolean;
  readonly checkedAt: Date;
  readonly reason?: string;
}

export interface BlackBoxResourceBudget {
  readonly maxRequests: number;
  readonly maxResponseBytes: number;
  readonly maxExecutionSeconds: number;
  readonly maxFindings: number;
}

export interface BlackBoxRateLimits {
  readonly maxRequestsPerSecond: number;
  readonly maxConcurrency: number;
}

export interface BlackBoxNetworkScope {
  readonly urls: readonly string[];
  readonly excludedHosts: readonly string[];
  readonly excludedPaths: readonly string[];
  readonly allowedProtocols: readonly ('https:' | 'http:')[];
  readonly allowedPorts: readonly number[];
}

/** User-reviewed authorization data before it is signed by the backend. */
export interface BlackBoxAuthorizationRequest {
  readonly targetId: BlackBoxTargetId;
  readonly ownershipChallengeId: OwnershipChallengeId;
  readonly target: string;
  readonly scope: BlackBoxNetworkScope;
  readonly permissions: readonly BlackBoxPermission[];
  readonly maximumRiskClass: BlackBoxRiskClass;
  readonly rateLimits: BlackBoxRateLimits;
  readonly budget: BlackBoxResourceBudget;
  readonly startsAt: string;
  readonly expiresAt: string;
}

/** Canonical authorization payload covered by the server signature. */
export interface BlackBoxAuthorizationManifest extends BlackBoxAuthorizationRequest {
  readonly id: AuthorizationManifestId;
  readonly issuedAt: string;
  readonly authorizedBy: string;
  readonly nonce: string;
  readonly version: 1;
}

export interface SignedBlackBoxAuthorization {
  readonly manifest: BlackBoxAuthorizationManifest;
  readonly algorithm: 'hmac-sha256' | 'ed25519';
  readonly keyId: string;
  readonly signature: string;
}

/**
 * Opaque authority derived by trusted runtime code from a verified signature.
 * It contains no signing key and is invalid after expiry or revocation.
 */
export interface BlackBoxCapability {
  readonly id: BlackBoxCapabilityId;
  readonly sessionId: BlackBoxSessionId;
  readonly manifestId: AuthorizationManifestId;
  readonly targetId: BlackBoxTargetId;
  readonly scope: BlackBoxNetworkScope;
  readonly permissions: readonly BlackBoxPermission[];
  readonly maximumRiskClass: BlackBoxRiskClass;
  readonly rateLimits: BlackBoxRateLimits;
  readonly budget: BlackBoxResourceBudget;
  readonly issuedAt: string;
  readonly expiresAt: string;
  readonly generation: number;
}

export interface BlackBoxBudgetUsage {
  readonly requestCount: number;
  readonly responseBytes: number;
  readonly executionSeconds: number;
  readonly findingCount: number;
  readonly activeOperations: number;
}

export interface BlackBoxSession {
  readonly id: BlackBoxSessionId;
  readonly targetId: BlackBoxTargetId;
  readonly manifestId: AuthorizationManifestId;
  readonly capabilityId?: BlackBoxCapabilityId;
  readonly target: string;
  readonly scope: BlackBoxNetworkScope;
  readonly permissions: readonly BlackBoxPermission[];
  readonly maximumRiskClass: BlackBoxRiskClass;
  readonly status: BlackBoxSessionStatus;
  readonly usage: BlackBoxBudgetUsage;
  readonly createdAt: string;
  readonly activatedAt?: string;
  readonly expiresAt: string;
  readonly stoppedAt?: string;
  readonly stopReason?: string;
}

export interface BlackBoxOperationRequest {
  readonly capabilityId: BlackBoxCapabilityId;
  readonly sessionId: BlackBoxSessionId;
  readonly permission: BlackBoxPermission;
  readonly riskClass: BlackBoxRiskClass;
  readonly method: string;
  readonly url: string;
  readonly estimatedResponseBytes?: number;
}

export type BlackBoxPolicyDenialCode =
  | 'capability_invalid'
  | 'session_inactive'
  | 'session_expired'
  | 'session_revoked'
  | 'permission_denied'
  | 'risk_class_denied'
  | 'protocol_denied'
  | 'host_denied'
  | 'port_denied'
  | 'path_denied'
  | 'redirect_denied'
  | 'rate_limit_exceeded'
  | 'concurrency_limit_exceeded'
  | 'budget_exceeded';

export type BlackBoxPolicyDecision =
  | {
      readonly allowed: true;
      readonly capabilityId: BlackBoxCapabilityId;
      readonly normalizedUrl: string;
      readonly checkedAt: string;
    }
  | {
      readonly allowed: false;
      readonly code: BlackBoxPolicyDenialCode;
      readonly reason: string;
      readonly checkedAt: string;
    };

export interface BlackBoxActivity {
  readonly id: BlackBoxActivityId;
  readonly sessionId: BlackBoxSessionId;
  readonly actor: string;
  readonly summary: string;
  readonly targetUrl?: string;
  readonly permission?: BlackBoxPermission;
  readonly riskClass?: BlackBoxRiskClass;
  readonly status: BlackBoxActivityStatus;
  readonly startedAt: string;
  readonly finishedAt?: string;
}

export interface RedactedHeader {
  readonly name: string;
  readonly value: string;
  readonly redacted: boolean;
}

export interface RedactedBlackBoxEvidence {
  readonly id: BlackBoxEvidenceId;
  readonly findingId: BlackBoxFindingId;
  readonly sessionId: BlackBoxSessionId;
  readonly affectedComponent: string;
  readonly endpoint?: string;
  readonly method?: string;
  readonly requestHeaders: readonly RedactedHeader[];
  readonly responseHeaders: readonly RedactedHeader[];
  readonly requestSummary?: string;
  readonly responseSummary?: string;
  readonly validationMethod: string;
  readonly collectedAt: string;
  readonly confidence: number;
  readonly redactions: readonly string[];
  readonly artifactRefs: readonly string[];
}

export interface BlackBoxFinding {
  readonly id: BlackBoxFindingId;
  readonly sessionId: BlackBoxSessionId;
  readonly title: string;
  readonly description: string;
  readonly severity: BlackBoxFindingSeverity;
  readonly status: BlackBoxFindingStatus;
  readonly affectedComponent: string;
  readonly evidenceIds: readonly BlackBoxEvidenceId[];
  readonly remediationSummary: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly independentlyValidatedAt?: string;
  readonly confirmedAt?: string;
  readonly fixedAt?: string;
  readonly retestedAt?: string;
}

export interface BlackBoxRemediation {
  readonly id: BlackBoxRemediationId;
  readonly findingId: BlackBoxFindingId;
  readonly explanation: string;
  readonly proposedChanges: readonly string[];
  readonly relatedFiles: readonly string[];
  readonly verificationCommands: readonly string[];
  readonly deploymentRequiresUserApproval: true;
  readonly createdAt: string;
  readonly appliedAt?: string;
}

export interface BlackBoxRetest {
  readonly id: BlackBoxRetestId;
  readonly findingId: BlackBoxFindingId;
  readonly sessionId: BlackBoxSessionId;
  readonly evidenceIds: readonly BlackBoxEvidenceId[];
  readonly outcome: BlackBoxRetestOutcome;
  readonly requestedAt: string;
  readonly completedAt?: string;
  readonly notes?: string;
}

export interface BlackBoxSessionSnapshot {
  readonly session: BlackBoxSession;
  readonly activities: readonly BlackBoxActivity[];
  readonly findings: readonly BlackBoxFinding[];
}
