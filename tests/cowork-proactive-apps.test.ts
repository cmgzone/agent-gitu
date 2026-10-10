import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { CoworkStore } from '../src/cowork/store.js';
import { APP_REVIEW_INTERVAL_MS, isBackgroundRead, reviewConnectedApps } from '../src/cowork/proactive-apps.js';
import type { ConnectedAppsProvider } from '../src/connections/provider.js';
import type { LlmClient } from '../src/llm/llm.js';

const root = mkdtempSync(path.join(tmpdir(), 'gitu-proactive-apps-'));
afterAll(() => rmSync(root, { recursive: true, force: true }));
let sequence = 0;
function fixture(allow = true) {
  const file = path.join(root, `${++sequence}.json`), store = new CoworkStore(file);
  const agent = store.saveAgent({ name: 'Mimi', systemPrompt: 'Help with useful offers.', allowWrites: true, allowConfig: true });
  const conversation = store.saveConversation({ kind: 'dm', memberIds: [agent.id] });
  store.assignAppAccount(agent.id, 'shop', 'own');
  if (allow) {
    const request = store.addRequest({ conversationId: conversation.id, agentId: agent.id, kind: 'recommendation', title: 'Allow offer reads', detail: 'Read offers.', appAction: { service: 'shop', accountId: 'own', tool: 'SHOP_LIST_OFFERS', args: {} } });
    store.allowAppActionForRequest(request.id);
  }
  const apps = { configured: true, setup: { canConfigure: true, keyStorage: 'test' }, accounts: vi.fn(async () => [{ id: 'own', toolkit: 'shop', status: 'ACTIVE', disabled: false }]), catalog: vi.fn(), tools: vi.fn(async () => [{ slug: 'SHOP_LIST_OFFERS', name: 'Offers', inputParameters: { type: 'object' } }]), execute: vi.fn(async () => ({ offer: 'Paper is $10 until Friday.' })) } as ConnectedAppsProvider;
  const complete = vi.fn(async messages => String(messages[0]?.content).includes('"reads"') ? JSON.stringify({ reads: [{ service: 'shop', accountId: 'own', tool: 'SHOP_LIST_OFFERS', args: {} }] }) : JSON.stringify({ findings: [{ key: 'paper-offer', title: 'Paper offer', detail: 'Your usual paper is $10 until Friday. Would you like to review it?', sourceIds: [1] }] }));
  return { file, store, agent, conversation, apps, llm: { complete } as unknown as LlmClient, userContext: 'The user regularly needs paper.', complete, now: Date.UTC(2026, 9, 9) };
}
describe('Connected-app heartbeat', () => {
  it('creates a widget and chat notice, deduplicates across restart, and respects dismissal', async () => {
    const f = fixture(); expect(await reviewConnectedApps(f)).toBe(1);
    const widget = f.store.widgets(f.conversation.id)[0]!;
    expect(widget.data.text).toContain('$10'); expect(f.store.messages(f.conversation.id)).toHaveLength(1);
    const store = new CoworkStore(f.file);
    expect(await reviewConnectedApps({ ...f, store, now: f.now + APP_REVIEW_INTERVAL_MS })).toBe(0);
    expect(store.widgets(f.conversation.id)).toHaveLength(1); expect(store.messages(f.conversation.id)).toHaveLength(1);
    store.archiveWidget(widget.id);
    f.complete.mockImplementation(async messages => String(messages[0]?.content).includes('"reads"') ? JSON.stringify({ reads: [{ service: 'shop', accountId: 'own', tool: 'SHOP_LIST_OFFERS', args: {} }] }) : JSON.stringify({ findings: [{ key: 'paper-offer', title: 'Paper offer updated', detail: 'New offer details.', sourceIds: [1] }] }));
    expect(await reviewConnectedApps({ ...f, store, now: f.now + 2 * APP_REVIEW_INTERVAL_MS })).toBe(0);
    expect(store.widgets(f.conversation.id)).toHaveLength(0);
  });
  it('does no model work without existing read permission or when the chat is busy', async () => {
    const f = fixture(false); expect(await reviewConnectedApps(f)).toBe(0); expect(f.complete).not.toHaveBeenCalled();
    const busy = fixture(); expect(await reviewConnectedApps({ ...busy, isBusy: () => true })).toBe(0); expect(busy.apps.accounts).not.toHaveBeenCalled();
  });
  it('updates its existing card for changed evidence and remains quiet when disabled mid-read', async () => {
    const f = fixture(); expect(await reviewConnectedApps(f)).toBe(1);
    const id = f.store.widgets(f.conversation.id)[0]!.id;
    vi.mocked(f.apps.execute).mockResolvedValue({ offer: 'Paper is now $8 until Friday.' });
    f.complete.mockImplementation(async messages => String(messages[0]?.content).includes('"reads"') ? JSON.stringify({ reads: [{ service: 'shop', accountId: 'own', tool: 'SHOP_LIST_OFFERS', args: {} }] }) : JSON.stringify({ findings: [{ key: 'paper-offer', title: 'Updated paper offer', detail: 'Paper is now $8 until Friday.', sourceIds: [1] }] }));
    const publish = vi.fn();
    expect(await reviewConnectedApps({ ...f, now: f.now + APP_REVIEW_INTERVAL_MS, publish })).toBe(1);
    expect(f.store.widgets(f.conversation.id).map(widget => widget.id)).toEqual([id]);
    expect(f.store.widgets(f.conversation.id)[0]!.data.text).toContain('$8');
    expect(f.store.messages(f.conversation.id)).toHaveLength(1);
    expect(publish).toHaveBeenCalledOnce();
    const store = new CoworkStore(f.file);
    expect(await reviewConnectedApps({ ...f, store, now: f.now + 2 * APP_REVIEW_INTERVAL_MS })).toBe(0);
    expect(store.messages(f.conversation.id)).toHaveLength(1);
    const other = fixture(); let enabled = true;
    vi.mocked(other.apps.execute).mockImplementation(async () => { enabled = false; return { offer: 'Useful offer' }; });
    expect(await reviewConnectedApps({ ...other, enabled: () => enabled })).toBe(0);
    expect(other.store.widgets(other.conversation.id)).toHaveLength(0);
  });
  it('ignores execution IDs and JSON property order but preserves changes to domain data', async () => {
    const f = fixture();
    vi.mocked(f.apps.execute).mockResolvedValue({ log_id: 'first', responseId: 'one', data: { id: 'offer-1', price: 10, date: '2026-10-09' } });
    expect(await reviewConnectedApps(f)).toBe(1);
    const id = f.store.widgets(f.conversation.id)[0]!.id;
    const publish = vi.fn();
    vi.mocked(f.apps.execute).mockResolvedValue({ data: { date: '2026-10-09', price: 10, id: 'offer-1' }, responseId: 'two', log_id: 'second' });
    expect(await reviewConnectedApps({ ...f, now: f.now + APP_REVIEW_INTERVAL_MS, publish })).toBe(0);
    expect(publish).not.toHaveBeenCalled();
    vi.mocked(f.apps.execute).mockResolvedValue({ logId: 'third', data: { id: 'offer-2', price: 10, date: '2026-10-10' } });
    expect(await reviewConnectedApps({ ...f, now: f.now + 2 * APP_REVIEW_INTERVAL_MS, publish })).toBe(1);
    expect(f.store.widgets(f.conversation.id).map(widget => widget.id)).toEqual([id]);
    expect(f.store.messages(f.conversation.id)).toHaveLength(1);
  });
  it('respects Follow my lead, including a preference changed during the review', async () => {
    const f = fixture();
    const personality = { traits: [], communicationStyle: '', proactivity: 'reactive' as const };
    f.store.saveAgent({ ...f.agent, personality });
    expect(await reviewConnectedApps(f)).toBe(0);
    expect(f.apps.accounts).not.toHaveBeenCalled();
    const other = fixture();
    vi.mocked(other.apps.execute).mockImplementation(async () => { other.store.saveAgent({ ...other.agent, personality }); return { offer: 'Paper offer' }; });
    expect(await reviewConnectedApps(other)).toBe(0);
    expect(other.store.widgets(other.conversation.id)).toHaveLength(0);
    expect(other.store.messages(other.conversation.id)).toHaveLength(0);
  });
  it('stops waiting for an unresponsive provider when cancelled', async () => {
    const f = fixture(), controller = new AbortController();
    vi.mocked(f.apps.accounts).mockImplementation(() => new Promise(() => {}));
    const review = reviewConnectedApps({ ...f, signal: controller.signal });
    controller.abort();
    expect(await review).toBe(0); expect(f.complete).not.toHaveBeenCalled();
  });
  it('rejects writes even when an app has allowed them, and skips unsupported claims', async () => {
    expect(isBackgroundRead('SHOP_LIST_OFFERS')).toBe(true);
    for (const name of ['SHOP_BUY', 'LIST_AND_DELETE', 'GMAIL_SEND_EMAIL', 'PAYMENT_CREATE', 'GET_AND_UPDATE']) expect(isBackgroundRead(name)).toBe(false);
    const f = fixture(); f.complete.mockResolvedValueOnce(JSON.stringify({ reads: [{ service: 'shop', accountId: 'own', tool: 'SHOP_BUY', args: {} }] }));
    expect(await reviewConnectedApps(f)).toBe(0); expect(f.apps.execute).not.toHaveBeenCalled();
    const other = fixture(); other.complete.mockResolvedValueOnce(JSON.stringify({ reads: [{ service: 'shop', accountId: 'own', tool: 'SHOP_LIST_OFFERS', args: {} }] })).mockResolvedValueOnce(JSON.stringify({ findings: [{ key: 'fake', title: 'Unverified offer', detail: 'Buy it.', sourceIds: [9] }] }));
    expect(await reviewConnectedApps(other)).toBe(0); expect(other.store.widgets(other.conversation.id)).toHaveLength(0);
  });
});
