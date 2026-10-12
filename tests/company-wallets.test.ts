import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { CompanyStore } from '../src/company/store.js';
import { saveWallet } from '../src/company/wallets.js';
import { companyPolicy } from '../src/company/policy.js';
const roots: string[] = [];
const stores: CompanyStore[] = [];
afterEach(() => {
  for (const s of stores.splice(0)) s.close();
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});
function fixture() {
  const root = mkdtempSync(path.join(os.tmpdir(), 'gitu-wallet-test-'));
  roots.push(root);
  const store = new CompanyStore(root);
  stores.push(store);
  const c = store.create({ name: 'Wallet company', purpose: 'Operate', monthlyBudgetUsd: null, maxFileBytes: null, access: 'full', connectionIds: ['wallet-provider'] });
  store.update(c.id, { leadId: 'lead' });
  store.transition(c.id, 'running');
  const grant = saveWallet(store, c.id, {
    name: 'Treasury',
    tool: 'connection_execute',
    resourceId: 'wallet-provider',
    operation: 'send',
    mode: 'automatic',
    amountPath: 'amount',
    assetPath: 'asset',
    networkPath: 'network',
    recipientPath: 'recipient',
    assets: ['USDC'],
    networks: ['test-network'],
    recipients: ['test-recipient'],
    transactionLimit: '0.3',
    monthlyLimit: '0.3',
    idempotencyHeader: 'Idempotency-Key',
    receiptPath: 'transactionId',
  });
  return { store, c, grant, policy: companyPolicy(store, c.id, 'lead', 0, async () => 'write') };
}
const params = (amount: string) => ({
  connectionId: 'wallet-provider',
  operationId: 'send',
  body: { amount, asset: 'USDC', network: 'test-network', recipient: 'test-recipient' },
});
describe('Wallet permissions and journal', () => {
  it('uses exact decimal limits and stable provider idempotency, independent of AI cost', async () => {
    const { store, c, policy } = fixture();
    const first = params('0.1');
    expect(await policy.authorize('connection_execute', first)).toBeUndefined();
    const headers = policy.headers('connection_execute', first);
    expect(headers['Idempotency-Key']).toBe(store.actions(c.id)[0]?.id);
    policy.settled('connection_execute', first, { ok: true, output: '{"transactionId":"mock-transaction"}' });
    expect(store.actions(c.id)[0]?.wallet?.reference).toBe('mock-transaction');
    const second = params('0.2');
    expect(await policy.authorize('connection_execute', second)).toBeUndefined();
    policy.settled('connection_execute', second, { ok: true, output: '{}' });
    await expect(policy.authorize('connection_execute', params('0.000000000000000001'))).rejects.toThrow('monthly');
    expect(store.usage(c.id)).toEqual([]);
  });
  it('requires reliable metadata and refuses ungranted recipients', async () => {
    const { policy } = fixture();
    await expect(policy.authorize('connection_execute', { ...params('0.1'), body: { amount: 0.1 } })).rejects.toThrow('reliable');
    await expect(policy.authorize('connection_execute', { ...params('0.1'), body: { ...params('0.1').body, recipient: 'other' } })).rejects.toThrow('grant');
  });
  it('does not retry uncertain transactions and preserves the original idempotency key', async () => {
    const { store, c, policy } = fixture();
    const input = params('0.1');
    await policy.authorize('connection_execute', input);
    const id = store.actions(c.id)[0]!.id;
    policy.settled('connection_execute', input, { ok: false, output: 'Network interrupted' });
    expect((await policy.authorize('connection_execute', input))?.output).toContain('uncertain');
    const action = store.actions(c.id)[0]!;
    store.actionState(action, 'approved', 'Provider confirms it was never submitted.');
    await policy.authorize('connection_execute', input);
    expect(policy.headers('connection_execute', input)['Idempotency-Key']).toBe(id);
  });
  it('combines supervised mode and wallet read-only restrictions', async () => {
    const { store, c, grant } = fixture();
    store.update(c.id, { access: 'supervised' });
    const policy = companyPolicy(store, c.id, 'lead', 0, async () => 'write');
    expect((await policy.authorize('connection_execute', params('0.1')))?.output).toContain('approval');
    saveWallet(store, c.id, { ...grant, mode: 'read' });
    await expect(policy.authorize('connection_execute', params('0.2'))).rejects.toThrow('read-only');
  });
});
