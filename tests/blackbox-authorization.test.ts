import { describe, expect, it } from 'vitest';
import {
  AuthorizationService,
  AuthorizationValidationError,
  canonicalizeAuthorizationManifest,
} from '../src/blackbox/authorization.js';
import type {
  BlackBoxAuthorizationRequest,
  BlackBoxSessionId,
  BlackBoxTarget,
  BlackBoxTargetId,
  OwnershipChallenge,
  OwnershipChallengeId,
} from '../src/blackbox/types.js';

const NOW = new Date('2026-09-23T12:00:00.000Z');
const targetId = 'target-1' as BlackBoxTargetId;
const challengeId = 'challenge-1' as OwnershipChallengeId;
const sessionId = 'session-1' as BlackBoxSessionId;

function createOwnership(target: BlackBoxTarget, initial: OwnershipChallenge) {
  let challenge = initial;
  return {
    getTarget: () => target,
    getChallenge: () => challenge,
    setChallenge: (next: OwnershipChallenge) => { challenge = next; },
  };
}

function createRequest(): BlackBoxAuthorizationRequest {
  return {
    targetId,
    ownershipChallengeId: challengeId,
    target: 'app.example.com',
    scope: {
      urls: ['https://app.example.com/api/'],
      excludedHosts: [],
      excludedPaths: ['/admin'],
      allowedProtocols: ['https:'],
      allowedPorts: [443],
    },
    permissions: ['security_discovery', 'web_testing'],
    maximumRiskClass: 'L2',
    rateLimits: { maxRequestsPerSecond: 5, maxConcurrency: 2 },
    budget: {
      maxRequests: 100,
      maxResponseBytes: 1_000_000,
      maxExecutionSeconds: 300,
      maxFindings: 20,
    },
    startsAt: '2026-09-23T11:55:00.000Z',
    expiresAt: '2026-09-23T13:00:00.000Z',
  };
}

function createService(now = () => NOW, status: OwnershipChallenge['status'] = 'verified') {
  const target: BlackBoxTarget = {
    id: targetId,
    hostname: 'app.example.com',
    createdAt: new Date('2026-09-23T10:00:00.000Z'),
    ownershipVerifiedAt: NOW,
  };
  const challenge: OwnershipChallenge = {
    id: challengeId,
    targetId,
    hostname: target.hostname,
    method: 'dns_txt',
    token: 'token',
    expectedValue: 'gitu-site-verification=token',
    verificationLocation: 'https://app.example.com/.well-known/gitu-verification.txt',
    status,
    createdAt: new Date('2026-09-23T10:00:00.000Z'),
    expiresAt: new Date('2026-09-23T13:00:00.000Z'),
    verifiedAt: NOW,
  };
  const ownership = createOwnership(target, challenge);
  const service = new AuthorizationService({
    signingKey: new Uint8Array(32).fill(7),
    keyId: 'test-key-1',
    ownershipService: ownership,
    now,
  });
  return { service, ownership, challenge };
}

describe('Black Box authorization', () => {
  it('canonicalizes object key order without changing array order', () => {
    expect(canonicalizeAuthorizationManifest({ z: 1, a: { y: 2, x: [3, 1] } }))
      .toBe('{"a":{"x":[3,1],"y":2},"z":1}');
    expect(() => canonicalizeAuthorizationManifest({ invalid: new Date() })).toThrow(TypeError);
  });

  it('derives an opaque capability from a signed, target-bound manifest', () => {
    const { service } = createService();
    const signed = service.sign(createRequest(), 'operator-1');
    const capability = service.verify(signed, sessionId, 3);

    expect(signed.algorithm).toBe('hmac-sha256');
    expect(signed.keyId).toBe('test-key-1');
    expect(capability).toMatchObject({
      sessionId,
      manifestId: signed.manifest.id,
      targetId,
      permissions: ['security_discovery', 'web_testing'],
      maximumRiskClass: 'L2',
      generation: 3,
    });
    expect('signingKey' in capability).toBe(false);
    expect('signature' in capability).toBe(false);
  });

  it('rejects a manifest changed after signing', () => {
    const { service } = createService();
    const signed = service.sign(createRequest(), 'operator-1');
    const tampered = {
      ...signed,
      manifest: { ...signed.manifest, maximumRiskClass: 'L3' as const },
    };

    expect(() => service.verify(tampered, sessionId)).toThrow(AuthorizationValidationError);
  });

  it('rejects a capability after its ownership challenge is revoked', () => {
    const { service, ownership, challenge } = createService();
    const signed = service.sign(createRequest(), 'operator-1');
    ownership.setChallenge({ ...challenge, status: 'revoked', verifiedAt: undefined });

    expect(() => service.verify(signed, sessionId)).toThrow(/ownership is no longer verified/i);
  });

  it('rejects a capability after the signed validity window ends', () => {
    let currentTime = NOW;
    const { service } = createService(() => currentTime);
    const signed = service.sign(createRequest(), 'operator-1');
    currentTime = new Date('2026-09-23T13:00:00.000Z');

    expect(() => service.verify(signed, sessionId)).toThrow(/validity window/i);
  });

  it('does not sign a request unless ownership is currently verified', () => {
    const { service } = createService(undefined, 'pending');

    expect(() => service.sign(createRequest(), 'operator-1')).toThrow(/not currently verified/i);
  });
});
