import { describe, expect, it } from 'vitest';
import { catalogOperation, catalogProvider } from '../src/connections/catalog.js';
import { coworkIdentityPrompt } from '../src/cowork/runner.js';
import type { CoworkAgent, CoworkConversation } from '../src/cowork/store.js';

describe('pikpam catalog provider', () => {
  it('exposes VPS reads, domain search, DNS writes, storage, backups, and custom-domain email operations', () => {
    const provider = catalogProvider('pikpam')!;
    expect(provider).toBeTruthy();
    expect(provider.baseUrl).toBe('https://pikpam.com');

    const search = catalogOperation('pikpam', 'pikpam-domains-search')!;
    expect(search.method).toBe('GET');
    expect(search.path).toBe('/api/cloud/domains/search');
    expect(search.risk).toBe('read');

    expect(catalogOperation('pikpam', 'pikpam-vps-instances')!.path).toBe('/api/cloud/vps/my-instances');
    expect(catalogOperation('pikpam', 'pikpam-vps-logs')!.path).toBe('/api/cloud/vps/:id/logs');
    expect(catalogOperation('pikpam', 'pikpam-vps-plans')!.path).toBe('/api/cloud/plans');
    expect(catalogOperation('pikpam', 'pikpam-vps-backups-list')!.path).toBe('/api/cloud/vps/:id/backups');
    expect(catalogOperation('pikpam', 'pikpam-domains-record-create')!.risk).toBe('reversible-write');
    expect(catalogOperation('pikpam', 'pikpam-domains-verify-ownership')!.path).toBe('/api/cloud/domains/:id/verify-ownership');
    expect(catalogOperation('pikpam', 'pikpam-domains-renewal-quote')!.path).toBe('/api/cloud/domains/:id/renewal-quote');
    expect(catalogOperation('pikpam', 'pikpam-storage-volumes')!.path).toBe('/api/cloud/storage/volumes');
    expect(catalogOperation('pikpam', 'pikpam-email-domains')!.path).toBe('/api/cloud/email/domains');
    expect(catalogOperation('pikpam', 'pikpam-email-domain-dns')!.path).toBe('/api/cloud/email/domains/:domain/dns-records');
    expect(catalogOperation('pikpam', 'pikpam-email-mailboxes-list')!.path).toBe('/api/cloud/email/mailboxes');
    expect(catalogOperation('pikpam', 'pikpam-agent-context')!.path).toBe('/api/cloud/agent/context');
  });

  it('never auto-chains a purchase, renewal, or email send', () => {
    for (const id of [
      'pikpam-vps-order',
      'pikpam-vps-renew',
      'pikpam-domains-order',
      'pikpam-domains-verify-order',
      'pikpam-domains-renew',
      'pikpam-storage-order',
      'pikpam-email-mailbox-send',
    ]) {
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

describe('Pikpam specialist agent prompt awareness', () => {
  const conv: CoworkConversation = { id: 'c1', kind: 'dm', title: 'Chat', memberIds: ['a1'], createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' };

  it('gives domain/cloud agents PIKPAM_PLATFORM_ACCESS and skill descriptions automatically', () => {
    const aegis: CoworkAgent = {
      id: 'a1',
      name: 'Aegis',
      tagline: 'Domains, SSL & Security Lead',
      systemPrompt: 'Manage domains and DNS.',
      avatar: { shape: 'dot-penta', color: '#f39b52' },
      skills: ['pikpam-ecosystem'],
      allowShell: true,
      allowWrites: false,
      allowConfig: false,
      useHostComputer: true,
      chiefOfStaff: false,
      createdAt: '2026-01-01T00:00:00.000Z',
    };
    const prompt = coworkIdentityPrompt(aegis, conv, [aegis]);
    expect(prompt).toContain('PIKPAM_PLATFORM_ACCESS');
    expect(prompt).toContain('list_connections, connection_read');
    expect(prompt).toContain('pikpam-ecosystem: Operate Pikpam Cloud');
    expect(prompt).toContain('Paystack checkout link');

    // Even a custom domains/DNS agent without pikpam-ecosystem manually selected still gets Pikpam guidance.
    const customDomainAgent: CoworkAgent = { ...aegis, name: 'DomainBot', skills: [] };
    const customPrompt = coworkIdentityPrompt(customDomainAgent, conv, [customDomainAgent]);
    expect(customPrompt).toContain('PIKPAM_PLATFORM_ACCESS');
    expect(customPrompt).toContain('- pikpam-ecosystem:');

    // Unrelated non-Pikpam agent does not get Pikpam routing noise.
    const genericWriter: CoworkAgent = {
      ...aegis,
      name: 'Writer',
      tagline: 'Copywriter',
      systemPrompt: 'Write blog posts.',
      skills: [],
    };
    expect(coworkIdentityPrompt(genericWriter, conv, [genericWriter])).not.toContain('PIKPAM_PLATFORM_ACCESS');
  });
});
