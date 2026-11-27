import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import {
  defaultEveryForRecurrence,
  isCalendarScheduleDue,
  sanitizeCalendarFields,
  type CalendarScheduleFields,
} from './calendar-schedule.js';

export interface CronJob extends CalendarScheduleFields {
  id: string;
  title?: string;
  every: string;
  goal: string;
  enabled: boolean;
  lastRunAt?: string;
  lastRunId?: string;
  createdAt: string;
  owner?: 'coding' | 'maintenance';
  status?: 'running' | 'succeeded' | 'failed';
  lastSuccessAt?: string;
  nextRetryAt?: string;
  failures?: number;
  error?: string;
}

/** Legacy maintenance IDs retain their owner before the first migration runs. */
export function cronOwner(job: CronJob): 'coding' | 'maintenance' {
  return job.id.startsWith('cowork_learn_') ? 'maintenance' : (job.owner ?? 'coding');
}

export const MIN_CRON_INTERVAL_MS = 5_000;

export function parseEvery(every: string): number {
  const trimmed = every.trim();
  let ms: number;
  if (/^\d+$/.test(trimmed)) {
    ms = Number(trimmed) * 60 * 1000;
  } else {
    const m = trimmed.match(/^(\d+)\s*(s|sec|seconds?|m|min|minutes?|h|hours?|d|days?|w|weeks?)$/i);
    if (!m) throw new Error(`Invalid schedule "${every}". Use e.g. 30, 30s, 5m, 1h, 1d, 1w (bare numbers are minutes).`);
    const n = Number(m[1]);
    const unit = m[2]!.toLowerCase();
    if (unit.startsWith('s')) ms = n * 1000;
    else if (unit.startsWith('m')) ms = n * 60 * 1000;
    else if (unit.startsWith('h')) ms = n * 60 * 60 * 1000;
    else ms = n * 24 * 60 * 60 * 1000 * (unit.startsWith('w') ? 7 : 1);
  }
  if (!Number.isFinite(ms) || ms < MIN_CRON_INTERVAL_MS) {
    throw new Error(`Schedule "${every}" is too frequent (minimum ${MIN_CRON_INTERVAL_MS / 1000}s).`);
  }
  return ms;
}

export class CronStore {
  constructor(private readonly file: string) {}

  static forProject(repoRoot: string): CronStore {
    return new CronStore(path.join(repoRoot, '.hermes', 'cron.json'));
  }

  jobs(): CronJob[] {
    if (!existsSync(this.file)) return [];
    try {
      const data = JSON.parse(readFileSync(this.file, 'utf8')) as { jobs?: CronJob[] };
      return data.jobs ?? [];
    } catch {
      return [];
    }
  }

  private save(jobs: CronJob[]): void {
    mkdirSync(path.dirname(this.file), { recursive: true });
    writeFileSync(this.file, JSON.stringify({ jobs }, null, 2));
  }

  add(input: {
    every?: string;
    goal: string;
    title?: string;
    owner?: CronJob['owner'];
    id?: string;
    enabled?: boolean;
  } & CalendarScheduleFields): CronJob {
    const calendarFields = sanitizeCalendarFields(input as unknown as Record<string, unknown>);
    const effectiveEvery = defaultEveryForRecurrence(calendarFields, input.every);
    parseEvery(effectiveEvery);
    const nowIso = new Date().toISOString();
    const isCalendar = Boolean(calendarFields.recurrence && calendarFields.recurrence !== 'interval');
    const job: CronJob = {
      id: input.id ?? `cron-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e4)}`,
      ...(input.title?.trim() ? { title: input.title.trim().slice(0, 120) } : {}),
      owner: input.owner ?? 'coding',
      every: effectiveEvery,
      goal: input.goal.trim(),
      enabled: input.enabled !== false,
      ...(isCalendar ? {} : { lastRunAt: nowIso }),
      createdAt: nowIso,
      ...calendarFields,
    };
    const jobs = this.jobs();
    if (jobs.some((existing) => existing.id === job.id)) throw Error('Schedule already exists.');
    jobs.push(job);
    this.save(jobs);
    return job;
  }

  update(id: string, patch: Partial<CronJob>): CronJob[] {
    const jobs = this.jobs().map((j) => (j.id === id ? { ...j, ...patch, id: j.id } : j));
    this.save(jobs);
    return jobs;
  }

  remove(id: string): CronJob[] {
    const jobs = this.jobs().filter((j) => j.id !== id);
    this.save(jobs);
    return jobs;
  }
}

export class CronScheduler {
  private timer?: ReturnType<typeof setInterval>;
  private readonly running = new Set<string>();

  constructor(
    private readonly store: CronStore,
    private readonly onDue: (job: CronJob) => Promise<string | undefined> | string | undefined,
    private readonly owner: 'coding' | 'maintenance' = 'coding',
  ) {}

  start(tickMs = 15000): void {
    if (this.timer) return;
    this.timer = setInterval(() => this.tick(), tickMs);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
  }

  tick(): void {
    // This runs inside a bare setInterval callback: any throw would be an
    // uncaught exception (there is no global uncaughtException handler) and
    // kill the whole server. A filesystem error on the jobs file (AV lock,
    // EACCES, ENOSPC) must only skip a tick, never take the process down.
    try {
      const now = Date.now();
      for (const job of this.store.jobs()) {
        if (cronOwner(job) !== this.owner || !job.enabled || this.running.has(job.id)) continue;
        const last = job.lastRunAt ? new Date(job.lastRunAt).getTime() : 0;
        if (job.status === 'running' && now - last < 120_000) continue;

        if (job.nextRetryAt) {
          if (now < Date.parse(job.nextRetryAt)) continue;
        } else {
          const calendarDue = isCalendarScheduleDue(job, {
            lastRunAt: job.lastRunAt,
            createdAt: job.createdAt,
            nowMs: now,
          });
          if (calendarDue === false) continue;
          if (calendarDue === null) {
            let interval: number;
            try {
              interval = parseEvery(job.every);
            } catch {
              continue;
            }
            if (now - last < interval) continue;
          }
        }
        this.running.add(job.id);
        try {
          this.store.update(job.id, { lastRunAt: new Date(now).toISOString(), status: 'running', error: undefined });
        } catch (err) {
          // The job was marked in-flight before the write failed — release it
          // so a later tick can still dispatch it.
          this.running.delete(job.id);
          console.error(`[hermes] cron update failed for ${job.id}: ${(err as Error).message}`);
          continue;
        }
        Promise.resolve()
          .then(() => this.onDue(job))
          .then((runId) => {
            this.store.update(job.id, {
              ...(runId ? { lastRunId: runId } : {}),
              ...(job.recurrence === 'once' ? { enabled: false } : {}),
              status: 'succeeded',
              lastSuccessAt: new Date().toISOString(),
              failures: 0,
              nextRetryAt: undefined,
              error: undefined,
            });
          })
          .catch((error: unknown) => {
            const failures = (job.failures ?? 0) + 1;
            this.store.update(job.id, {
              status: 'failed',
              failures,
              error: error instanceof Error ? error.message.slice(0, 300) : 'Background job failed',
              nextRetryAt: new Date(Date.now() + Math.min(30 * 60_000, 60_000 * 2 ** Math.min(failures - 1, 5))).toISOString(),
            });
          })
          .catch(() => undefined)
          .finally(() => this.running.delete(job.id));
      }
    } catch (err) {
      console.error(`[hermes] cron tick failed: ${(err as Error).message}`);
    }
  }
}
