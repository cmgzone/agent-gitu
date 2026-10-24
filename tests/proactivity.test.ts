import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import { Proactivity, inQuietHours, assistantBrief } from '../src/cowork/proactivity.js';
import { CoworkStore } from '../src/cowork/store.js';
import { CronStore, CronScheduler } from '../src/cron/scheduler.js';
import type { LlmClient } from '../src/llm/llm.js';
const roots: string[] = [];
afterEach(() => {
  vi.useRealTimers();
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
});
function fixture() {
  const root = mkdtempSync(path.join(os.tmpdir(), 'pa-proactivity-'));
  roots.push(root);
  let now = Date.UTC(2026, 9, 23, 6);
  const ledger = new Proactivity(path.join(root, 'proactivity.json'), () => now),
    store = new CoworkStore(path.join(root, 'cowork.json'));
  return { root, ledger, store, setNow: (value: number) => (now = value), now };
}

it('provides one proactive P.A, adopts an existing assistant and preserves later owner preferences and deletion', () => {
  const f = fixture();
  const old = f.store.saveAgent({ name: 'P.A', systemPrompt: 'Remember my existing responsibilities.', allowShell: false });
  const assistant = f.ledger.ensureAssistant(f.store)!;
  expect(assistant.id).toBe(old.id);
  expect(assistant.chiefOfStaff).toBe(true);
  expect(assistant.personality?.proactivity).toBe('proactive');
  expect(assistant.allowShell).toBe(false);
  expect(assistant.systemPrompt).toContain('existing responsibilities');
  expect(f.ledger.ensureAssistant(f.store)?.id).toBe(assistant.id);
  expect(f.store.listAgents()).toHaveLength(1);
  f.store.saveAgent({ ...assistant, personality: { traits: [], communicationStyle: '', proactivity: 'reactive' } });
  expect(f.ledger.ensureAssistant(f.store)?.personality?.proactivity).toBe('reactive');
  f.store.deleteAgent(assistant.id);
  expect(f.ledger.ensureAssistant(f.store)).toBeUndefined();
});
it('new installations get a helpful chief without shell access or external account grants', () => {
  const f = fixture(),
    assistant = f.ledger.ensureAssistant(f.store)!;
  expect(assistant.name).toBe('P.A');
  expect(assistant.allowWrites).toBe(true);
  expect(assistant.allowConfig).toBe(true);
  expect(assistant.allowShell).toBe(false);
  expect(f.store.appConnections(assistant.id)).toEqual([]);
  expect(f.ledger.status().conversationId).toBeDefined();
});
it('respects local quiet hours, deduplicates notices after restart, and allows a critical decision through', () => {
  const f = fixture();
  f.ledger.configure({ timezone: 'Africa/Nairobi', dailyNotifications: 2 });
  const agent = f.ledger.ensureAssistant(f.store)!;
  const night = Date.UTC(2026, 9, 23, 21);
  expect(inQuietHours(night, f.ledger.settings())).toBe(true);
  expect(f.ledger.notify(f.store, agent, 'ordinary', 'A useful suggestion', false, night)).toBe(false);
  expect(f.ledger.notify(f.store, agent, 'critical', 'Your account needs reconnecting', true, night)).toBe(true);
  const restarted = new Proactivity(f.ledger.file, () => f.now);
  expect(restarted.notify(f.store, agent, 'critical', 'Your account needs reconnecting', true)).toBe(false);
  expect(restarted.notify(f.store, agent, 'other', 'A verified update', true)).toBe(true);
  expect(restarted.notify(f.store, agent, 'third', 'More updates', true)).toBe(false);
  expect(f.store.messages(f.ledger.status().conversationId!)).toHaveLength(2);
});
it('reserves a shared daily review allowance before concurrent calls and keeps unpriced usage visible', async () => {
  const f = fixture();
  f.ledger.configure({ dailyModelCalls: 1, dailyOutputTokens: 5000, quietStart: 0, quietEnd: 0 });
  let finish!: (value: string) => void;
  const complete = vi.fn(
    () =>
      new Promise<string>((resolve) => {
        finish = resolve;
      }),
  );
  const client = f.ledger.reviewClient({ name: 'fixture', complete } as unknown as LlmClient, () => undefined);
  const work = client.complete([{ role: 'user', content: 'Read permitted evidence' }]);
  await expect(client.complete([])).rejects.toThrow('Daily background review limit');
  expect(complete).toHaveBeenCalledOnce();
  finish('Verified');
  await work;
  expect(f.ledger.status().daily.unpricedCalls).toBe(1);
  f.setNow(f.now + 86400000);
  expect(f.ledger.status().daily.calls).toBe(0);
  expect(() => f.ledger.configure({ timezone: 'Invalid/Zone' })).toThrow('time zone');
});
it('does not exceed a priced review reservation', async () => {
  const f = fixture();
  f.ledger.configure({ dailyCostUsd: 0.1 });
  const complete = vi.fn(async () => 'Never called');
  const client = f.ledger.reviewClient({ name: 'fixture', complete } as unknown as LlmClient, () => 0.2);
  await expect(client.complete([])).rejects.toThrow('Daily background review limit');
  expect(complete).not.toHaveBeenCalled();
});
it('retains failed scheduled work, retries with backoff, recovers interrupted work and stops after three attempts', () => {
  const f = fixture(),
    input = { kind: 'followup' as const, sourceId: 'reminder', conversationId: 'chat', agentId: 'agent', instruction: 'Check delivery' };
  const job = f.ledger.enqueue(input, 'reminder');
  expect(f.ledger.enqueue(input, 'reminder').id).toBe(job.id);
  expect(f.ledger.status().jobs).toHaveLength(1);
  expect(f.ledger.claim(job.id)?.attempts).toBe(1);
  f.ledger.settle(job.id, 'Connection unavailable');
  expect(f.ledger.due()).toHaveLength(0);
  f.setNow(f.now + 60001);
  const restarted = new Proactivity(f.ledger.file, () => f.now + 60001);
  expect(restarted.claim(job.id)?.attempts).toBe(2);
  restarted.settle(job.id, 'Connection unavailable');
  f.setNow(f.now + 180001);
  expect(f.ledger.claim(job.id)?.attempts).toBe(3);
  f.ledger.settle(job.id, 'Connection unavailable');
  expect(f.ledger.status().jobs[0].status).toBe('failed');
  expect(f.ledger.due()).toHaveLength(0);
  f.ledger.retry(job.id);
  expect(f.ledger.claim(job.id)?.attempts).toBe(1);
  f.setNow(f.now + 180001 + 11 * 60000);
  expect(f.ledger.due()[0]?.id).toBe(job.id);
  expect(f.ledger.claim(job.id)?.attempts).toBe(2);
});
it('ranks important decisions above routine next steps', () => {
  const result = assistantBrief([
    { id: 'routine', priority: 10, text: 'Plan next week', next: 'Review goals' },
    { id: 'urgent', priority: 95, text: 'Account needs reconnecting', next: 'Use secure sign-in' },
  ]);
  expect(result.indexOf('Account needs')).toBeLessThan(result.indexOf('Plan next'));
  expect(result).toContain('Next: Use secure sign-in');
});
it('keeps maintenance out of coding when schedulers share a file, including legacy jobs and restart', async () => {
  const f = fixture(),
    store = CronStore.forProject(f.root);
  const job = store.add({ id: 'cowork_learn_apps', every: '5s', goal: 'Review permitted apps' });
  store.update(job.id, { lastRunAt: new Date(0).toISOString() });
  const coding = vi.fn(async () => 'coding-run'),
    maintenance = vi.fn(async () => 'review');
  const general = new CronScheduler(store, coding),
    learning = new CronScheduler(store, maintenance, 'maintenance');
  general.tick();
  learning.tick();
  await vi.waitFor(() => expect(maintenance).toHaveBeenCalledOnce());
  expect(coding).not.toHaveBeenCalled();
  store.update(job.id, { lastRunAt: new Date(0).toISOString() });
  await vi.waitFor(() => expect(store.jobs()[0].status).toBe('succeeded'));
  const restarted = new CronScheduler(CronStore.forProject(f.root), coding);
  restarted.tick();
  expect(coding).not.toHaveBeenCalled();
});
it('releases synchronous scheduler failures and records retry health', async () => {
  const f = fixture(),
    store = CronStore.forProject(f.root),
    job = store.add({ every: '5s', goal: 'Verify' });
  store.update(job.id, { lastRunAt: new Date(0).toISOString() });
  const onDue = vi.fn(() => {
      throw Error('Temporarily unavailable');
    }),
    scheduler = new CronScheduler(store, onDue);
  scheduler.tick();
  await vi.waitFor(() => expect(store.jobs()[0].status).toBe('failed'));
  expect(store.jobs()[0].nextRetryAt).toBeDefined();
  scheduler.tick();
  expect(onDue).toHaveBeenCalledOnce();
  store.update(job.id, { nextRetryAt: new Date(0).toISOString() });
  scheduler.tick();
  await vi.waitFor(() => expect(onDue).toHaveBeenCalledTimes(2));
});

it('queues each completed version once, requires review evidence and caps repairs across the original task',()=>{const f=fixture();f.ledger.ensureAssistant(f.store);const stamp=new Date(f.now).toISOString();expect(f.ledger.beginCodingReview('task',stamp,'root',true)).toMatchObject({status:'queued',needsUi:true});expect(f.ledger.beginCodingReview('task',stamp,'root',true)).toBeUndefined();expect(()=>f.ledger.recordCodingReview('task',stamp,'passed','Looks fine',[])).toThrow('evidence');f.ledger.recordCodingReview('task',stamp,'issues','Button does not submit',['src/form.tsx:12; reproduced in preview']);expect(f.ledger.reserveReviewRepair('root','Button does not submit').attempts).toBe(1);f.ledger.linkReviewRepair('task',stamp,'repair1');expect(f.ledger.reserveReviewRepair('root','Button does not submit')).toMatchObject({duplicate:true,runId:'repair1'});expect(f.ledger.reserveReviewRepair('root','Second verified defect').attempts).toBe(2);expect(()=>f.ledger.reserveReviewRepair('root','Still broken')).toThrow('Two review repair');expect(f.ledger.beginCodingReview('task',new Date(f.now+1000).toISOString(),'root2',false)).toBeDefined();const restarted=new Proactivity(f.ledger.file,()=>f.now);expect(restarted.codingReview('task',stamp)).toMatchObject({status:'issues',repairRunId:'repair1'});expect(restarted.beginCodingReview('ancient',new Date(f.now-2*86400000).toISOString(),'ancient',false)).toBeUndefined();});
