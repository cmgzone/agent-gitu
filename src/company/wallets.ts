import { randomUUID } from 'node:crypto';
import type { CompanyStore, CompanyAction } from './store.js';
export interface WalletGrant {
  id: string;
  companyId: string;
  name: string;
  tool: 'connection_execute' | 'mcp_call';
  resourceId: string;
  operation: string;
  mode: 'read' | 'approval' | 'automatic';
  amountPath: string;
  assetPath: string;
  networkPath: string;
  recipientPath: string;
  assets: string[];
  networks: string[];
  recipients: string[];
  transactionLimit?: string;
  monthlyLimit?: string;
  idempotencyHeader?: string;
  idempotencyArgument?: string;
  receiptPath?: string;
}
export interface WalletTransaction {
  grantId: string;
  amount: string;
  asset: string;
  network: string;
  recipient: string;
  reference?: string;
}
function decimal(value: unknown): bigint {
  const text = String(value);
  if (!/^\d{1,38}(\.\d{1,18})?$/.test(text)) throw new Error('Wallet amounts must be exact positive decimal strings.');
  const [whole, fraction = ''] = text.split('.');
  return BigInt(whole!) * 10n ** 18n + BigInt(fraction.padEnd(18, '0'));
}
export function walletField(value: unknown, selector: string): unknown {
  let result = value;
  for (const key of selector.split('.')) {
    if (!key || ['__proto__', 'constructor', 'prototype'].includes(key)) return undefined;
    result = result && typeof result === 'object' ? (result as Record<string, unknown>)[key] : undefined;
  }
  return result;
}
export function saveWallet(store: CompanyStore, companyId: string, input: Partial<WalletGrant>): WalletGrant {
  const old = input.id ? store.list<WalletGrant>('wallet', companyId).find((w) => w.id === input.id) : undefined;
  if (input.id && !old) throw new Error('Wallet grant not found.');
  const grant = { ...old, ...input, id: old?.id ?? 'wallet-' + randomUUID(), companyId } as WalletGrant;
  if (!['connection_execute', 'mcp_call'].includes(grant.tool) || !['read', 'approval', 'automatic'].includes(grant.mode) || !grant.name || !grant.resourceId || !grant.operation)
    throw new Error('Choose a wallet resource, operation and execution mode.');
  for (const key of ['assets', 'networks', 'recipients'] as const) {
    grant[key] = Array.isArray(grant[key]) ? [...new Set(grant[key].map(String).filter(Boolean))] : [];
  }
  if (grant.mode !== 'read' && (!grant.amountPath || !grant.assetPath || !grant.networkPath || !grant.recipientPath))
    throw new Error('Map reliable amount, asset, network and recipient fields before granting wallet writes.');
  for (const limit of [grant.transactionLimit, grant.monthlyLimit]) if (limit !== undefined && decimal(limit) <= 0n) throw new Error('Choose positive wallet spending limits.');
  if ((grant.transactionLimit || grant.monthlyLimit) && grant.assets.length !== 1)
    throw new Error('A wallet spending limit must apply to one selected asset. Create separate grants for other assets.');
  if (grant.idempotencyHeader && (!/^[a-zA-Z0-9-]{1,80}$/.test(grant.idempotencyHeader) || /^(authorization|cookie|host|content-.+|transfer-.+)$/i.test(grant.idempotencyHeader)))
    throw new Error('Invalid provider idempotency header.');
  if (grant.idempotencyArgument && !/^[a-zA-Z][a-zA-Z0-9_]{0,79}$/.test(grant.idempotencyArgument)) throw new Error('Invalid provider idempotency argument.');
  store.saveResource('wallet', grant.id, companyId, grant);
  return grant;
}
export function walletFor(store: CompanyStore, companyId: string, tool: string, args: Record<string, unknown>): WalletGrant | undefined {
  return store
    .list<WalletGrant>('wallet', companyId)
    .find((w) => w.tool === tool && (tool === 'connection_execute' ? w.resourceId === args['connectionId'] && w.operation === args['operationId'] : w.operation === args['tool']));
}
export function walletTransaction(store: CompanyStore, grant: WalletGrant, args: Record<string, unknown>, action: CompanyAction): WalletTransaction {
  if (grant.mode === 'read') throw new Error('This wallet grant is read-only.');
  const value = grant.tool === 'connection_execute' ? args['body'] : args['args'];
  const amount = walletField(value, grant.amountPath),
    asset = String(walletField(value, grant.assetPath) ?? ''),
    network = String(walletField(value, grant.networkPath) ?? ''),
    recipient = String(walletField(value, grant.recipientPath) ?? '');
  if (typeof amount !== 'string' || decimal(amount) <= 0n || !asset || !network || !recipient)
    throw new Error('Wallet action requires reliable amount, asset, network and recipient information.');
  for (const [allowed, current] of [
    [grant.assets, asset],
    [grant.networks, network],
    [grant.recipients, recipient],
  ] as const)
    if (allowed.length && !allowed.includes(current)) throw new Error('Wallet transaction exceeds its resource grant.');
  if (grant.transactionLimit && decimal(amount) > decimal(grant.transactionLimit)) throw new Error('Wallet transaction limit reached.');
  if (grant.monthlyLimit) {
    const c = store.get(grant.companyId)!,
      month = store.month(c);
    let spent = 0n;
    for (const prior of store.actions(grant.companyId)) {
      if (
        prior.id !== action.id &&
        prior.wallet?.grantId === grant.id &&
        prior.wallet.asset === asset &&
        prior.state !== 'rejected' &&
        store.month(c, new Date(prior.createdAt)) === month
      )
        spent += decimal(prior.wallet.amount);
    }
    if (spent + decimal(amount) > decimal(grant.monthlyLimit)) throw new Error('Wallet monthly spending limit reached.');
  }
  return { grantId: grant.id, amount, asset, network, recipient };
}
