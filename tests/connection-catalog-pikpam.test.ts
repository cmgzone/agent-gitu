import { describe, expect, it } from 'vitest';
import { catalogOperation, catalogProvider } from '../src/connections/catalog.js';

describe('pikpam catalog provider', () => {
  it('exposes VPS reads, domain search and DNS writes', () => {
    const provider = catalogProvider('pikpam')!;
    expect(provider).toBeTruthy();
    expect(provider.baseUrl).toBe('https://pikpam.com');

    const search = catalogOperation('pikpam', 'pikpam-domains-search')!;
    expect(search.method).toBe('GET');
    expect(search.path).toBe('/api/cloud/domains/search');
    expect(search.risk).toBe('read');

    expect(catalogOperation('pikpam', 'pikpam-vps-instances')!.path).toBe('/api/cloud/vps/my-instances');
    expect(catalogOperation('pikpam', 'pikpam-domains-record-create')!.risk).toBe('reversible-write');
  });

  it('never auto-chains a purchase, because checkout needs a human', () => {
    for (const id of ['pikpam-vps-order', 'pikpam-domains-order', 'pikpam-domains-verify-order']) {
      const operation = catalogOperation('pikpam', id)!;
      expect(operation).toBeTruthy();
      expect(operation.risk).toBe('destructive');
      // Discovery metadata opts an operation into automatic graph execution;
      // an order must never be reachable that way.
      expect(operation.discovery).toBeUndefined();
    }
  });

  it('uses static paths so operations stay inside the exact-path allowlist', () => {
    const provider = catalogProvider('pikpam')!;
    for (const operation of provider.operations) {
      expect(operation.path.startsWith('/')).toBe(true);
      // Query strings are forbidden in a catalog path; use the `query` object.
      expect(operation.path).not.toContain('?');
      expect(operation.path).not.toContain('#');
    }
  });
});
