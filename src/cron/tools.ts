import { CronStore, parseEvery } from './scheduler.js';
import type { ToolContext } from '../tools/tools.js';
import type { ToolResult } from '../types.js';

export const SCHEDULE_TOOL_DOC = 'Manage recurring work. {action:"list"|"create"|"update"|"pause"|"resume"|"delete", id?:string, every?:"30m"|"1h"|"1d"|"1w", goal?:string}. Uses interval schedules, not cron expressions. Jobs run while Agent Gitu is open. Inspect existing jobs before creating; reuse the same job when changing it.';

export function toolScheduleManage(ctx: ToolContext, params: Record<string, unknown>): ToolResult {
  try {
    const store = CronStore.forProject(ctx.guard.lock.repoRoot);
    const action = String(params['action'] ?? 'list');
    if (action === 'list') return { ok: true, output: JSON.stringify(store.jobs()) };
    const id = String(params['id'] ?? '');
    const existing = store.jobs().find(j => j.id === id);
    if (action !== 'create' && !existing) throw new Error('Schedule id not found; call list first.');
    if (action === 'delete') { store.remove(id); return { ok: true, output: `Deleted schedule ${id}.` }; }
    if (action === 'pause' || action === 'resume') {
      store.update(id, { enabled: action === 'resume', lastRunAt: new Date().toISOString() });
      return { ok: true, output: `${action === 'resume' ? 'Resumed' : 'Paused'} schedule ${id}.` };
    }
    if (!['create', 'update'].includes(action)) throw new Error('Unknown schedule action.');
    const every = String(params['every'] ?? existing?.every ?? '').trim();
    const goal = String(params['goal'] ?? existing?.goal ?? '').trim();
    parseEvery(every);
    if (!goal) throw new Error('A goal is required.');
    if (action === 'update') { store.update(id, { every, goal }); return { ok: true, output: `Updated schedule ${id}.` }; }
    const duplicate = store.jobs().find(j => j.goal.toLowerCase() === goal.toLowerCase() && j.every === every);
    const job = duplicate ?? store.add({ every, goal });
    return { ok: true, output: `${duplicate ? 'Reused' : 'Created'} schedule ${job.id}: every ${job.every}. ${job.enabled ? 'Enabled' : 'Paused'}. Runs while Agent Gitu is open.` };
  } catch (err) { return { ok: false, output: `schedule_manage: ${(err as Error).message}` }; }
}
