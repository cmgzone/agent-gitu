import { mkdtempSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { expect, it } from 'vitest';
import { CoworkStore } from '../src/cowork/store.js';
import { executeCoworkTool } from '../src/cowork/tools.js';
import { CoworkMemory } from '../src/cowork/memory.js';
import { computeNextCalendarRunIso, isCalendarScheduleDue } from '../src/cron/calendar-schedule.js';
import { parseEvery } from '../src/cron/scheduler.js';
import { GituServer } from '../src/server/server.js';
import { ScriptedMockLlm } from '../src/llm/llm.js';
import type { ToolContext } from '../src/tools/tools.js';

it('exposes pending tool-created reminders with recurring schedules and removes reminders with their session', async () => {
  const home = mkdtempSync(path.join(tmpdir(), 'cowork-schedules-'));
  const previousHome = process.env['AGENT_GITU_HOME'];
  process.env['AGENT_GITU_HOME'] = home;
  const store = new CoworkStore();
  const agent = store.saveAgent({ name: 'Planner', systemPrompt: 'Help with scheduled work.' });
  const conversation = store.saveConversation({ kind: 'dm', title: 'Launch review', memberIds: [agent.id],
    schedule: { every: '1d', goal: 'Review the launch', enabled: false } });
  const other = store.saveConversation({ kind: 'dm', title: 'Other work', memberIds: [agent.id] });
  const scope = { store, agent, memory: CoworkMemory.forWorkspace(), conversationId: conversation.id };
  const scheduled = await executeCoworkTool({ cwd: home } as ToolContext, 'schedule_followup', { inMinutes: 30, note: 'Verify the launch results' },
    { allowShell: false, allowWrites: false, allowConfig: false, chief: false, browser: false }, scope);
  expect(scheduled.ok).toBe(true);
  const otherReminder = store.addFollowUp({ conversationId: other.id, agentId: agent.id, note: 'Review the other result', dueAt: new Date(Date.now() + 3600_000).toISOString() });
  expect(store.dueFollowUps()).toEqual([]);
  expect(new CoworkStore().listFollowUps()).toHaveLength(2);
  const server = new GituServer({ passwordRequired: false, cwd: path.join(home, 'Workspace'), port: 0, llm: new ScriptedMockLlm([() => 'Preview response.']) });
  try {
    const base = `http://127.0.0.1:${await server.start()}`;
    const response = await fetch(base + '/api/cowork/conversations');
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.conversations.find((item: any) => item.id === conversation.id).schedule).toMatchObject({ every: '1d', enabled: false });
    expect(data.followUps).toHaveLength(2);
    expect(data.followUps.find((item: any) => item.conversationId === conversation.id)).toMatchObject({ note: 'Verify the launch results', agentId: agent.id });
    expect((await fetch(base + '/api/cowork/conversations/' + conversation.id, { method: 'DELETE' })).status).toBe(200);
    const after = await fetch(base + '/api/cowork/conversations').then(response => response.json());
    expect(after.followUps).toEqual([otherReminder]);
    const reloaded = new CoworkStore();
    expect(reloaded.listFollowUps()).toEqual([otherReminder]);
    reloaded.takeFollowUp(otherReminder.id); expect(reloaded.listFollowUps()).toEqual([]);
  } finally {
    await server.stop();
    if (previousHome === undefined) delete process.env['AGENT_GITU_HOME']; else process.env['AGENT_GITU_HOME'] = previousHome;
    await rm(home, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  }
}, 20000);

it('evaluates calendar-aware recurrence rules (daily, weekdays, weekly, once) and computes next run timestamps', () => {
  // Friday 2026-11-27 09:05 local time
  const friMorning = new Date(2026, 10, 27, 9, 5, 0, 0).getTime();
  const friBefore = new Date(2026, 10, 27, 8, 55, 0, 0).getTime();
  const satMorning = new Date(2026, 10, 28, 9, 5, 0, 0).getTime();

  // Weekdays at 09:00: not due before 09:00, due after 09:00 on Friday, not due on Saturday
  expect(isCalendarScheduleDue({ recurrence: 'weekdays', atTime: '09:00' }, { createdAt: new Date(2026, 10, 26, 8, 0).toISOString(), nowMs: friBefore })).toBe(false);
  expect(isCalendarScheduleDue({ recurrence: 'weekdays', atTime: '09:00' }, { createdAt: new Date(2026, 10, 26, 8, 0).toISOString(), nowMs: friMorning })).toBe(true);
  expect(isCalendarScheduleDue({ recurrence: 'weekdays', atTime: '09:00' }, { createdAt: new Date(2026, 10, 26, 8, 0).toISOString(), nowMs: satMorning })).toBe(false);

  // Already ran today after 09:00 -> not due again today
  expect(
    isCalendarScheduleDue(
      { recurrence: 'weekdays', atTime: '09:00' },
      { lastRunAt: new Date(2026, 10, 27, 9, 1).toISOString(), nowMs: friMorning },
    ),
  ).toBe(false);

  // Newly created at 09:04 for 09:00 -> waits until next matching weekday instead of firing immediately
  expect(
    isCalendarScheduleDue(
      { recurrence: 'weekdays', atTime: '09:00' },
      { createdAt: new Date(2026, 10, 27, 9, 4).toISOString(), nowMs: friMorning },
    ),
  ).toBe(false);

  // Next run calculation on Saturday 09:05 for weekdays 09:00 -> Monday 2026-11-30 09:00
  const nextWeekday = computeNextCalendarRunIso({ recurrence: 'weekdays', atTime: '09:00', enabled: true }, parseEvery, satMorning);
  expect(nextWeekday).toBeDefined();
  const nextDt = new Date(nextWeekday!);
  expect(nextDt.getDay()).toBe(1); // Monday
  expect(nextDt.getHours()).toBe(9);
  expect(nextDt.getMinutes()).toBe(0);

  // One-shot calendar schedule fires once when target time passes
  const targetIso = new Date(2026, 10, 27, 9, 0).toISOString();
  expect(isCalendarScheduleDue({ recurrence: 'once', runAt: targetIso }, { nowMs: friBefore })).toBe(false);
  expect(isCalendarScheduleDue({ recurrence: 'once', runAt: targetIso }, { nowMs: friMorning })).toBe(true);
  expect(isCalendarScheduleDue({ recurrence: 'once', runAt: targetIso }, { lastRunAt: new Date(friMorning).toISOString(), nowMs: friMorning + 60_000 })).toBe(false);
});

it('supports unified /api/schedules CRUD, calendar fields, toggle, and manual run across cowork, followup, and cron', async () => {
  const home = mkdtempSync(path.join(tmpdir(), 'cowork-unified-schedules-'));
  const previousHome = process.env['AGENT_GITU_HOME'];
  process.env['AGENT_GITU_HOME'] = home;
  const projectDir = path.join(home, 'Workspace');
  const store = new CoworkStore();
  const nova = store.saveAgent({ name: 'Nova', systemPrompt: 'Helpful assistant.' });
  const server = new GituServer({
    passwordRequired: false,
    autoInstallLsp: false,
    cwd: projectDir,
    port: 0,
    llm: new ScriptedMockLlm([() => 'Scheduled check complete.']),
  });
  try {
    const base = `http://127.0.0.1:${await server.start()}`;

    // 1. Create a calendar weekdays cowork routine via POST /api/schedules
    const createCowork = await fetch(`${base}/api/schedules`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        source: 'cowork',
        agentId: nova.id,
        goal: 'Send morning brief',
        recurrence: 'weekdays',
        atTime: '08:30',
      }),
    });
    expect(createCowork.status).toBe(201);
    const coworkPayload = (await createCowork.json()) as { id: string; items: Array<Record<string, unknown>> };
    const coworkItem = coworkPayload.items.find((i) => i['id'] === coworkPayload.id);
    expect(coworkItem).toMatchObject({
      source: 'cowork',
      agentId: nova.id,
      recurrence: 'weekdays',
      atTime: '08:30',
      enabled: true,
    });
    expect(typeof coworkItem?.['nextRunAt']).toBe('string');

    // 2. Create a dated one-time reminder (followup)
    const futureDate = new Date(Date.now() + 24 * 3600_000).toISOString();
    const createFu = await fetch(`${base}/api/schedules`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        source: 'followup',
        agentId: nova.id,
        goal: 'Check client feedback',
        recurrence: 'once',
        runAt: futureDate,
      }),
    });
    expect(createFu.status).toBe(201);
    const fuPayload = (await createFu.json()) as { id: string; items: Array<Record<string, unknown>> };
    expect(fuPayload.items.some((i) => i['id'] === fuPayload.id && i['source'] === 'followup')).toBe(true);

    // 3. Create a weekly coding cron job
    const createCron = await fetch(`${base}/api/schedules`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        source: 'cron',
        title: 'Weekly audit',
        goal: 'Run full typecheck and unit tests',
        recurrence: 'weekly',
        atTime: '17:00',
        daysOfWeek: [1, 5],
      }),
    });
    expect(createCron.status).toBe(201);
    const cronPayload = (await createCron.json()) as { id: string; items: Array<Record<string, unknown>> };
    const cronItem = cronPayload.items.find((i) => i['id'] === cronPayload.id);
    expect(cronItem).toMatchObject({
      source: 'cron',
      title: 'Weekly audit',
      recurrence: 'weekly',
      atTime: '17:00',
      daysOfWeek: [1, 5],
      enabled: true,
    });

    // 4. Pause & resume the cowork schedule via PATCH
    const coworkSourceId = String(coworkItem?.['sourceId']);
    const pauseRes = await fetch(`${base}/api/schedules/cowork/${coworkSourceId}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ enabled: false }),
    });
    expect(pauseRes.status).toBe(200);
    const pausedData = (await pauseRes.json()) as { items: Array<Record<string, unknown>> };
    expect(pausedData.items.find((i) => i['id'] === coworkPayload.id)?.['enabled']).toBe(false);

    // 5. Delete the reminder & cron job cleanly
    const fuSourceId = String(fuPayload.items.find((i) => i['id'] === fuPayload.id)?.['sourceId']);
    const delFu = await fetch(`${base}/api/schedules/followup/${fuSourceId}`, { method: 'DELETE' });
    expect(delFu.status).toBe(200);
    const cronSourceId = String(cronItem?.['sourceId']);
    const delCron = await fetch(`${base}/api/schedules/cron/${cronSourceId}`, { method: 'DELETE' });
    expect(delCron.status).toBe(200);
    const afterAll = (await (await fetch(`${base}/api/schedules`)).json()) as { items: Array<Record<string, unknown>> };
    expect(afterAll.items.map((i) => i['id'])).toEqual([coworkPayload.id]);
  } finally {
    await server.stop();
    if (previousHome === undefined) delete process.env['AGENT_GITU_HOME']; else process.env['AGENT_GITU_HOME'] = previousHome;
    await rm(home, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  }
}, 25000);
