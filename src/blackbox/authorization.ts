import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import type { OwnershipService } from './ownership.js';
import type {
  AuthorizationManifestId,
  BlackBoxAuthorizationManifest,
  BlackBoxAuthorizationRequest,
  BlackBoxCapability,
  BlackBoxCapabilityId,
  BlackBoxPermission,
  BlackBoxRiskClass,
  BlackBoxSessionId,
  BlackBoxTargetId,
  SignedBlackBoxAuthorization,
} from './types.js';

// A signature must cover one unambiguous representation of the approved manifest.
// This function accepts JSON data only and sorts object keys recursively; array order
// remains significant because it is part of the approved document.
export function canonicalizeAuthorizationManifest(manifest: unknown): string {
  const canonicalize = (value: unknown): string => {
    if (value === null) return 'null';

    if (typeof value === 'string' || typeof value === 'boolean') {
      return JSON.stringify(value);
    }

    if (typeof value === 'number') {
      if (!Number.isFinite(value)) throw new TypeError('Authorization manifest must contain finite numbers');
      return JSON.stringify(value);
    }

    if (Array.isArray(value)) {
      return `[${value.map(canonicalize).join(',')}]`;
    }

    if (typeof value === 'object') {
      const prototype = Object.getPrototypeOf(value);
      if (prototype !== Object.prototype && prototype !== null) {
        throw new TypeError('Authorization manifest must contain plain JSON objects');
      }
      const entries = Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)
        .map(([key, entry]) => `${JSON.stringify(key)}:${canonicalize(entry)}`);
      return `{${entries.join(',')}}`;
    }

    throw new TypeError('Authorization manifest must contain JSON values only');
  };

  return canonicalize(manifest);
}

export interface AuthorizationServiceOptions {
  readonly signingKey: Uint8Array;
  readonly keyId: string;
  readonly ownershipService: Pick<OwnershipService, 'getTarget' | 'getChallenge'>;
  readonly now?: () => Date;
}

export class AuthorizationValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AuthorizationValidationError';
  }
}

function requireNonEmpty(value: string, label: string): void {
  if (value.trim().length === 0) throw new AuthorizationValidationError(`${label} must not be empty`);
}

function requirePositiveInteger(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new AuthorizationValidationError(`${label} must be a positive integer`);
  }
}

function requireTime(value: string, label: string): number {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) throw new AuthorizationValidationError(`${label} must be an ISO timestamp`);
  return timestamp;
}

function validateRequest(request: BlackBoxAuthorizationRequest): void {
  requireNonEmpty(request.targetId, 'targetId');
  requireNonEmpty(request.ownershipChallengeId, 'ownershipChallengeId');
  requireNonEmpty(request.target, 'target');
  if (request.permissions.length === 0) throw new AuthorizationValidationError('At least one permission is required');
  for (const permission of request.permissions) {
    if (!['security_discovery', 'web_testing', 'vulnerability_validation'].includes(permission)) {
      throw new AuthorizationValidationError(`Unsupported permission: ${String(permission)}`);
    }
  }
  if (!['L0', 'L1', 'L2', 'L3'].includes(request.maximumRiskClass)) {
    throw new AuthorizationValidationError(`Unsupported risk class: ${String(request.maximumRiskClass)}`);
  }
  requirePositiveInteger(request.rateLimits.maxRequestsPerSecond, 'maxRequestsPerSecond');
  requirePositiveInteger(request.rateLimits.maxConcurrency, 'maxConcurrency');
  requirePositiveInteger(request.budget.maxRequests, 'budget.maxRequests');
  requirePositiveInteger(request.budget.maxResponseBytes, 'budget.maxResponseBytes');
  requirePositiveInteger(request.budget.maxExecutionSeconds, 'budget.maxExecutionSeconds');
  requirePositiveInteger(request.budget.maxFindings, 'budget.maxFindings');
  if (!Array.isArray(request.scope.urls) || request.scope.urls.length === 0) {
    throw new AuthorizationValidationError('scope.urls must not be empty');
  }
  for (const url of request.scope.urls) {
    let parsed: URL;
    try { parsed = new URL(url); } catch { throw new AuthorizationValidationError(`Invalid scope URL: ${url}`); }
    if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) {
      throw new AuthorizationValidationError(`Invalid scope URL: ${url}`);
    }
  }
  for (const protocol of request.scope.allowedProtocols) {
    if (protocol !== 'http:' && protocol !== 'https:') throw new AuthorizationValidationError(`Unsupported protocol: ${protocol}`);
  }
  for (const port of request.scope.allowedPorts) {
    if (!Number.isSafeInteger(port) || port < 1 || port > 65535) throw new AuthorizationValidationError(`Invalid allowed port: ${port}`);
  }
  const startsAt = requireTime(request.startsAt, 'startsAt');
  const expiresAt = requireTime(request.expiresAt, 'expiresAt');
  if (expiresAt <= startsAt) throw new AuthorizationValidationError('expiresAt must be after startsAt');
}

function signatureFor(manifest: BlackBoxAuthorizationManifest, key: Uint8Array): Buffer {
  return createHmac('sha256', key).update(canonicalizeAuthorizationManifest(manifest), 'utf8').digest();
}

export class AuthorizationService {
  readonly #key: Uint8Array;
  readonly #keyId: string;
  readonly #ownershipService: Pick<OwnershipService, 'getTarget' | 'getChallenge'>;
  readonly #now: () => Date;

  constructor(options: AuthorizationServiceOptions) {
    if (options.signingKey.byteLength < 32) throw new AuthorizationValidationError('signingKey must be at least 256 bits');
    requireNonEmpty(options.keyId, 'keyId');
    this.#key = new Uint8Array(options.signingKey);
    this.#keyId = options.keyId;
    this.#ownershipService = options.ownershipService;
    this.#now = options.now ?? (() => new Date());
  }

  sign(request: BlackBoxAuthorizationRequest, authorizedBy: string): SignedBlackBoxAuthorization {
    validateRequest(request);
    requireNonEmpty(authorizedBy, 'authorizedBy');
    const target = this.#ownershipService.getTarget(request.targetId);
    const challenge = this.#ownershipService.getChallenge(request.ownershipChallengeId);
    if (!target) throw new AuthorizationValidationError('Unknown authorization target');
    if (!challenge || challenge.targetId !== request.targetId || challenge.hostname !== target.hostname) {
      throw new AuthorizationValidationError('Ownership challenge is not bound to the authorization target');
    }
    if (challenge.status !== 'verified') throw new AuthorizationValidationError('Ownership challenge is not currently verified');
    if (request.target !== target.hostname) throw new AuthorizationValidationError('Authorization target does not match the verified hostname');

    const issuedAt = this.#now().toISOString();
    if (issuedAt < request.startsAt || issuedAt >= request.expiresAt) throw new AuthorizationValidationError('Authorization request is outside its validity window');
    const manifest: BlackBoxAuthorizationManifest = {
      ...request,
      id: randomUUID() as AuthorizationManifestId,
      issuedAt,
      authorizedBy,
      nonce: randomUUID(),
      version: 1,
    };
    return { manifest, algorithm: 'hmac-sha256', keyId: this.#keyId, signature: signatureFor(manifest, this.#key).toString('base64url') };
  }

  verify(signed: SignedBlackBoxAuthorization, sessionId: BlackBoxSessionId, generation = 0): BlackBoxCapability {
    if (signed.algorithm !== 'hmac-sha256' || signed.keyId !== this.#keyId) throw new AuthorizationValidationError('Unknown authorization signature');
    validateRequest(signed.manifest);
    const expected = signatureFor(signed.manifest, this.#key);
    let provided: Buffer;
    try { provided = Buffer.from(signed.signature, 'base64url'); } catch { throw new AuthorizationValidationError('Invalid authorization signature'); }
    if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) throw new AuthorizationValidationError('Invalid authorization signature');
    const now = this.#now().getTime();
    if (now < Date.parse(signed.manifest.startsAt) || now >= Date.parse(signed.manifest.expiresAt)) throw new AuthorizationValidationError('Authorization is outside its validity window');
    const target = this.#ownershipService.getTarget(signed.manifest.targetId);
    const challenge = this.#ownershipService.getChallenge(signed.manifest.ownershipChallengeId);
    if (!target || !challenge || challenge.targetId !== signed.manifest.targetId || challenge.hostname !== target.hostname) throw new AuthorizationValidationError('Authorization target ownership binding is invalid');
    if (challenge.status !== 'verified') throw new AuthorizationValidationError('Authorization ownership is no longer verified');
    if (signed.manifest.target !== target.hostname) throw new AuthorizationValidationError('Authorization target does not match the verified hostname');
    return {
      id: randomUUID() as BlackBoxCapabilityId,
      sessionId,
      manifestId: signed.manifest.id,
      targetId: signed.manifest.targetId,
      scope: signed.manifest.scope,
      permissions: signed.manifest.permissions,
      maximumRiskClass: signed.manifest.maximumRiskClass,
      rateLimits: signed.manifest.rateLimits,
      budget: signed.manifest.budget,
      issuedAt: signed.manifest.issuedAt,
      expiresAt: signed.manifest.expiresAt,
      generation,
    };
  }
}
