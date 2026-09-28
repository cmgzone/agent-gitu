import { randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import type {
  BlackBoxTarget,
  BlackBoxTargetId,
  OwnershipChallenge,
  OwnershipChallengeId,
  OwnershipMethod,
  OwnershipVerification,
} from './types.js';

const VERIFICATION_PREFIX = 'gitu-site-verification=';
const WELL_KNOWN_PATH = '/.well-known/gitu-verification.txt';
const DEFAULT_CHALLENGE_TTL_MS = 15 * 60 * 1000;
const HOSTNAME_LABEL = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

export interface OwnershipDnsResolver {
  resolveTxt(hostname: string): Promise<readonly (readonly string[])[]>;
}

export interface OwnershipHttpsResponse {
  readonly status: number;
  readonly body: string;
  readonly location?: string;
}

export interface OwnershipHttpsFetcher {
  fetch(url: URL, options: { readonly redirect: 'manual' }): Promise<OwnershipHttpsResponse>;
}

export interface OwnershipServiceOptions {
  readonly dnsResolver: OwnershipDnsResolver;
  readonly httpsFetcher: OwnershipHttpsFetcher;
  readonly now?: () => Date;
  readonly challengeTtlMs?: number;
  readonly tokenBytes?: number;
}

export class OwnershipValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OwnershipValidationError';
  }
}

export class OwnershipChallengeNotFoundError extends Error {
  constructor(challengeId: OwnershipChallengeId) {
    super(`Ownership challenge not found: ${String(challengeId)}`);
    this.name = 'OwnershipChallengeNotFoundError';
  }
}

export class OwnershipService {
  readonly #dnsResolver: OwnershipDnsResolver;
  readonly #httpsFetcher: OwnershipHttpsFetcher;
  readonly #now: () => Date;
  readonly #challengeTtlMs: number;
  readonly #tokenBytes: number;
  readonly #targets = new Map<BlackBoxTargetId, BlackBoxTarget>();
  readonly #challenges = new Map<OwnershipChallengeId, OwnershipChallenge>();
  readonly #verifications = new Map<OwnershipChallengeId, OwnershipVerification>();

  constructor(options: OwnershipServiceOptions) {
    if (!Number.isSafeInteger(options.challengeTtlMs ?? DEFAULT_CHALLENGE_TTL_MS) ||
        (options.challengeTtlMs ?? DEFAULT_CHALLENGE_TTL_MS) <= 0) {
      throw new OwnershipValidationError('challengeTtlMs must be a positive safe integer');
    }
    if (!Number.isSafeInteger(options.tokenBytes ?? 32) || (options.tokenBytes ?? 32) < 16) {
      throw new OwnershipValidationError('tokenBytes must be a safe integer of at least 16');
    }

    this.#dnsResolver = options.dnsResolver;
    this.#httpsFetcher = options.httpsFetcher;
    this.#now = options.now ?? (() => new Date());
    this.#challengeTtlMs = options.challengeTtlMs ?? DEFAULT_CHALLENGE_TTL_MS;
    this.#tokenBytes = options.tokenBytes ?? 32;
  }

  registerTarget(input: string): BlackBoxTarget {
    const hostname = normalizeOwnershipHostname(input);
    const existing = [...this.#targets.values()].find((target) => target.hostname === hostname);
    if (existing) return existing;

    const target: BlackBoxTarget = {
      id: randomUUID() as BlackBoxTargetId,
      hostname,
      createdAt: this.#now(),
    };
    this.#targets.set(target.id, target);
    return target;
  }

  getTarget(targetId: BlackBoxTargetId): BlackBoxTarget | undefined {
    return this.#targets.get(targetId);
  }

  createChallenge(targetId: BlackBoxTargetId, method: OwnershipMethod): OwnershipChallenge {
    const target = this.#targets.get(targetId);
    if (!target) throw new OwnershipValidationError(`Unknown ownership target: ${String(targetId)}`);
    if (method === 'connector') {
      throw new OwnershipValidationError('Connector ownership verification requires a trusted connector adapter');
    }

    const createdAt = this.#now();
    const token = randomBytes(this.#tokenBytes).toString('base64url');
    const challenge: OwnershipChallenge = {
      id: randomUUID() as OwnershipChallengeId,
      targetId,
      hostname: target.hostname,
      method,
      token,
      expectedValue: `${VERIFICATION_PREFIX}${token}`,
      verificationLocation: method === 'dns_txt'
        ? `_gitu-verification.${target.hostname}`
        : `https://${target.hostname}${WELL_KNOWN_PATH}`,
      status: 'pending',
      createdAt,
      expiresAt: new Date(createdAt.getTime() + this.#challengeTtlMs),
    };
    this.#challenges.set(challenge.id, challenge);
    return challenge;
  }

  getChallenge(challengeId: OwnershipChallengeId): OwnershipChallenge | undefined {
    return this.#challenges.get(challengeId);
  }

  getVerification(challengeId: OwnershipChallengeId): OwnershipVerification | undefined {
    return this.#verifications.get(challengeId);
  }

  async verifyChallenge(challengeId: OwnershipChallengeId): Promise<OwnershipVerification> {
    const challenge = this.#challenges.get(challengeId);
    if (!challenge) throw new OwnershipChallengeNotFoundError(challengeId);

    if (challenge.status === 'verified') {
      const verification = this.#verifications.get(challengeId);
      if (!verification) throw new Error('Verified challenge is missing its ownership record');
      return verification;
    }
    if (challenge.status !== 'pending') {
      throw new OwnershipValidationError(`Ownership challenge is ${challenge.status}`);
    }

    const now = this.#now();
    if (now.getTime() >= challenge.expiresAt.getTime()) {
      const expiredChallenge = this.#replaceChallenge(challenge, { status: 'expired' });
      return this.#recordVerification(expiredChallenge, false, now, 'Challenge expired');
    }

    let matched = false;
    let failureReason: string | undefined;
    try {
      matched = challenge.method === 'dns_txt'
        ? await this.#verifyDns(challenge)
        : await this.#verifyHttps(challenge);
      if (!matched) failureReason = 'Expected ownership token was not found';
    } catch (error) {
      failureReason = error instanceof Error ? error.message : 'Ownership verification failed';
    }

    const completedChallenge = this.#replaceChallenge(challenge, {
      status: matched ? 'verified' : 'failed',
      ...(matched ? { verifiedAt: now } : {}),
    });
    if (matched) {
      const target = this.#targets.get(challenge.targetId);
      if (target) this.#targets.set(target.id, { ...target, ownershipVerifiedAt: now });
    }
    return this.#recordVerification(completedChallenge, matched, now, failureReason);
  }

  revokeChallenge(challengeId: OwnershipChallengeId): OwnershipChallenge {
    const challenge = this.#challenges.get(challengeId);
    if (!challenge) throw new OwnershipChallengeNotFoundError(challengeId);
    if (challenge.status === 'revoked') return challenge;
    if (challenge.status === 'expired') {
      throw new OwnershipValidationError('An expired ownership challenge cannot be revoked');
    }
    return this.#replaceChallenge(challenge, { status: 'revoked' });
  }

  async #verifyDns(challenge: OwnershipChallenge): Promise<boolean> {
    const records = await this.#dnsResolver.resolveTxt(challenge.verificationLocation);
    return records.some((parts) => secureEqual(parts.join(''), challenge.expectedValue));
  }

  async #verifyHttps(challenge: OwnershipChallenge): Promise<boolean> {
    const url = new URL(challenge.verificationLocation);
    if (url.protocol !== 'https:' || url.hostname !== challenge.hostname ||
        url.pathname !== WELL_KNOWN_PATH || url.port || url.username || url.password) {
      throw new OwnershipValidationError('Invalid HTTPS ownership verification location');
    }

    const response = await this.#httpsFetcher.fetch(url, { redirect: 'manual' });
    if (response.status >= 300 && response.status < 400) {
      throw new OwnershipValidationError('Ownership verification redirects are not followed');
    }
    return response.status === 200 && secureEqual(response.body.trim(), challenge.expectedValue);
  }

  #replaceChallenge(
    challenge: OwnershipChallenge,
    patch: Partial<OwnershipChallenge>,
  ): OwnershipChallenge {
    const updated = { ...challenge, ...patch };
    this.#challenges.set(challenge.id, updated);
    return updated;
  }

  #recordVerification(
    challenge: OwnershipChallenge,
    verified: boolean,
    checkedAt: Date,
    failureReason?: string,
  ): OwnershipVerification {
    const verification: OwnershipVerification = {
      challengeId: challenge.id,
      targetId: challenge.targetId,
      hostname: challenge.hostname,
      method: challenge.method,
      verified,
      checkedAt,
      ...(failureReason ? { reason: failureReason } : {}),
    };
    this.#verifications.set(challenge.id, verification);
    return verification;
  }
}

export function normalizeOwnershipHostname(input: string): string {
  const normalized = input.trim().toLowerCase();
  if (!normalized) throw new OwnershipValidationError('Target hostname is required');
  if (normalized.includes('://') || /[/?#@\\]/.test(normalized) || normalized.includes(':')) {
    throw new OwnershipValidationError('Target must be a bare DNS hostname without scheme, credentials, port, path, query, or fragment');
  }

  // A single trailing dot is the DNS root label and is equivalent to the
  // same fully-qualified hostname without it. Multiple trailing dots remain
  // invalid rather than being silently normalized.
  const value = normalized.endsWith('.') && !normalized.endsWith('..')
    ? normalized.slice(0, -1)
    : normalized;

  if (value === 'localhost' || value.endsWith('.localhost') || value.endsWith('.local')) {
    throw new OwnershipValidationError('Local hostnames are not valid ownership targets');
  }
  if (value.length > 253 || value.startsWith('.') || value.endsWith('.')) {
    throw new OwnershipValidationError('Target hostname is invalid');
  }

  const labels = value.split('.');
  if (labels.length < 2 || labels.some((label) => !HOSTNAME_LABEL.test(label))) {
    throw new OwnershipValidationError('Target must be a valid fully-qualified DNS hostname');
  }
  if (/^\d+$/.test(labels.at(-1) ?? '')) {
    throw new OwnershipValidationError('IP addresses are not valid ownership targets');
  }
  return value;
}

function secureEqual(actual: string, expected: string): boolean {
  const actualBytes = Buffer.from(actual, 'utf8');
  const expectedBytes = Buffer.from(expected, 'utf8');
  return actualBytes.length === expectedBytes.length && timingSafeEqual(actualBytes, expectedBytes);
}
