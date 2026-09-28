import { describe, expect, it, vi } from 'vitest';
import {
  OwnershipChallengeNotFoundError,
  OwnershipService,
  OwnershipValidationError,
  normalizeOwnershipHostname,
  type OwnershipDnsResolver,
  type OwnershipHttpsFetcher,
} from '../src/blackbox/ownership.js';

describe('Black Box ownership', () => {
  it('normalizes valid hostnames and rejects URLs, paths, credentials, ports, local names, and IP literals', () => {
    expect(normalizeOwnershipHostname('  App.Example.COM.  ')).toBe('app.example.com');

    for (const invalid of [
      '',
      'https://example.com',
      'example.com/path',
      'user@example.com',
      'example.com:443',
      'localhost',
      'internal',
      '127.0.0.1',
      '[::1]',
      '-bad.example.com',
      'bad-.example.com',
    ]) {
      expect(() => normalizeOwnershipHostname(invalid)).toThrow(OwnershipValidationError);
    }
  });

  it('generates target-bound, random, expiring DNS challenges', () => {
    const now = new Date('2026-09-21T10:00:00.000Z');
    const service = createService({ now: () => now, challengeTtlMs: 60_000 });
    const firstTarget = service.registerTarget('example.com');
    const secondTarget = service.registerTarget('api.example.com');

    const first = service.createChallenge(firstTarget.id, 'dns_txt');
    const replay = service.createChallenge(firstTarget.id, 'dns_txt');
    const otherTarget = service.createChallenge(secondTarget.id, 'dns_txt');

    expect(first.targetId).toBe(firstTarget.id);
    expect(first.method).toBe('dns_txt');
    expect(first.expectedValue).toMatch(/^gitu-site-verification=[A-Za-z0-9_-]+$/);
    expect(first.verificationLocation).toBe('_gitu-verification.example.com');
    expect(first.expiresAt.toISOString()).toBe('2026-09-21T10:01:00.000Z');
    expect(replay.token).not.toBe(first.token);
    expect(otherTarget.targetId).toBe(secondTarget.id);
    expect(otherTarget.verificationLocation).toBe('_gitu-verification.api.example.com');
  });

  it('verifies a matching DNS TXT record through the injected trusted resolver', async () => {
    const dnsResolver: OwnershipDnsResolver = {
      resolveTxt: vi.fn(async () => [['unrelated=value'], ['gitu-site-', 'verification=trusted-token']]),
    };
    const service = createService({ dnsResolver, tokenBytes: 16 });
    const target = service.registerTarget('example.com');
    const challenge = service.createChallenge(target.id, 'dns_txt');

    const resolver = vi.mocked(dnsResolver.resolveTxt);
    resolver.mockResolvedValueOnce([
      ['unrelated=value'],
      [challenge.expectedValue.slice(0, 12), challenge.expectedValue.slice(12)],
    ]);

    const verification = await service.verifyChallenge(challenge.id);

    expect(resolver).toHaveBeenCalledWith('_gitu-verification.example.com');
    expect(verification.verified).toBe(true);
    expect(verification.targetId).toBe(target.id);
    expect(service.getTarget(target.id)?.ownershipVerifiedAt).toBeInstanceOf(Date);
  });

  it('does not verify DNS ownership when the record is absent', async () => {
    const service = createService({
      dnsResolver: { resolveTxt: vi.fn(async () => [['gitu-site-verification=wrong-token']]) },
    });
    const target = service.registerTarget('example.com');
    const challenge = service.createChallenge(target.id, 'dns_txt');

    const verification = await service.verifyChallenge(challenge.id);

    expect(verification.verified).toBe(false);
    expect(service.getTarget(target.id)?.ownershipVerifiedAt).toBeUndefined();
  });

  it('verifies only the fixed HTTPS well-known URL and requests manual redirect handling', async () => {
    const httpsFetcher: OwnershipHttpsFetcher = {
      fetch: vi.fn(async () => ({ status: 404, body: 'not found' })),
    };
    const service = createService({ httpsFetcher });
    const target = service.registerTarget('example.com');
    const challenge = service.createChallenge(target.id, 'https_file');
    vi.mocked(httpsFetcher.fetch).mockResolvedValueOnce({ status: 200, body: `${challenge.expectedValue}\n` });

    const verification = await service.verifyChallenge(challenge.id);

    expect(verification.verified).toBe(true);
    expect(httpsFetcher.fetch).toHaveBeenCalledTimes(1);
    const [url, options] = vi.mocked(httpsFetcher.fetch).mock.calls[0]!;
    expect(url.href).toBe('https://example.com/.well-known/gitu-verification.txt');
    expect(options).toEqual({ redirect: 'manual' });
  });

  it('refuses HTTPS redirects instead of following an out-of-scope destination', async () => {
    const httpsFetcher: OwnershipHttpsFetcher = {
      fetch: vi.fn(async () => ({
        status: 302,
        body: '',
        location: 'https://attacker.example/.well-known/gitu-verification.txt',
      })),
    };
    const service = createService({ httpsFetcher });
    const target = service.registerTarget('example.com');
    const challenge = service.createChallenge(target.id, 'https_file');

    const verification = await service.verifyChallenge(challenge.id);

    expect(verification.verified).toBe(false);
    expect(httpsFetcher.fetch).toHaveBeenCalledTimes(1);
    expect(service.getTarget(target.id)?.ownershipVerifiedAt).toBeUndefined();
  });

  it('expires challenges deterministically and never performs network verification after expiry', async () => {
    let now = new Date('2026-09-21T10:00:00.000Z');
    const dnsResolver: OwnershipDnsResolver = { resolveTxt: vi.fn(async () => []) };
    const httpsFetcher: OwnershipHttpsFetcher = {
      fetch: vi.fn(async () => ({ status: 200, body: 'irrelevant' })),
    };
    const service = createService({
      dnsResolver,
      httpsFetcher,
      now: () => now,
      challengeTtlMs: 1_000,
    });
    const target = service.registerTarget('example.com');
    const challenge = service.createChallenge(target.id, 'dns_txt');
    now = new Date('2026-09-21T10:00:01.001Z');

    const verification = await service.verifyChallenge(challenge.id);

    expect(verification.verified).toBe(false);
    expect(verification.reason).toMatch(/expired/i);
    expect(dnsResolver.resolveTxt).not.toHaveBeenCalled();
    expect(httpsFetcher.fetch).not.toHaveBeenCalled();
  });

  it('treats an already verified challenge as idempotent without replaying network access', async () => {
    const dnsResolver: OwnershipDnsResolver = { resolveTxt: vi.fn(async () => []) };
    const service = createService({ dnsResolver });
    const target = service.registerTarget('example.com');
    const challenge = service.createChallenge(target.id, 'dns_txt');
    vi.mocked(dnsResolver.resolveTxt).mockResolvedValueOnce([[challenge.expectedValue]]);

    const first = await service.verifyChallenge(challenge.id);
    const second = await service.verifyChallenge(challenge.id);

    expect(first.verified).toBe(true);
    expect(second.verified).toBe(true);
    expect(dnsResolver.resolveTxt).toHaveBeenCalledTimes(1);
  });

  it('rejects unknown challenge identifiers', async () => {
    const service = createService();

    await expect(service.verifyChallenge('missing-challenge' as never)).rejects.toBeInstanceOf(
      OwnershipChallengeNotFoundError,
    );
  });

  it('records ownership only and does not mint or activate a Black Box session', async () => {
    const dnsResolver: OwnershipDnsResolver = { resolveTxt: vi.fn(async () => []) };
    const service = createService({ dnsResolver });
    const target = service.registerTarget('example.com');
    const challenge = service.createChallenge(target.id, 'dns_txt');
    vi.mocked(dnsResolver.resolveTxt).mockResolvedValueOnce([[challenge.expectedValue]]);

    await service.verifyChallenge(challenge.id);

    const verifiedTarget = service.getTarget(target.id)!;
    expect(verifiedTarget.ownershipVerifiedAt).toBeInstanceOf(Date);
    expect(verifiedTarget).not.toHaveProperty('authorization');
    expect(verifiedTarget).not.toHaveProperty('capability');
    expect(verifiedTarget).not.toHaveProperty('session');
  });
});

function createService(
  overrides: Partial<ConstructorParameters<typeof OwnershipService>[0]> = {},
): OwnershipService {
  return new OwnershipService({
    dnsResolver: { resolveTxt: async () => [] },
    httpsFetcher: { fetch: async () => ({ status: 404, body: '' }) },
    ...overrides,
  });
}
