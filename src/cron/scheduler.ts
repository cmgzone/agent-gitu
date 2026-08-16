import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

export interface CronJob {
  id: string;
  every: string;
  goal: string;
  enabled: boolean;
  lastRunAt?: string;
  lastRunId?: string;
  createdAt: string;
}

export const MIN_CRON_INTERVAL_MS = 5_000;

export function parseEvery(every: string): number {
  const trimmed = every.trim();
  let ms: number;
  if (/^\d+$/.test(trimmed)) {
    ms = Number(trimmed) * 60 * 1000;
  } else {
    const m = trimmed.match(/^(\d+)\s*(s|sec|seconds?|m|min|minutes?|h|hours?)$/i);
    if (!m) throw new Error(`Invalid schedule "${every}". Use e.g. 30, 30s, 5m, 1h (bare numbers are minutes).`);
    const n = Number(m[1]);
    const unit = m[2]!.toLowerCase();
    if (unit.startsWith('s')) ms = n * 1000;
    else if (unit.startsWith('m')) ms = n * 60 * 1000;
    else ms = n * 60 * 60 * 1000;
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

  add(input: { every: string; goal: string }): CronJob {
    parseEvery(input.every);
    const job: CronJob = {
      id: `cron-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e4)}`,
      every: input.every.trim(),
      goal: input.goal.trim(),
      enabled: true,
      lastRunAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
    };
    const jobs = this.jobs();
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
    const now = Date.now();
    for (const job of this.store.jobs()) {
      if (!job.enabled || this.running.has(job.id)) continue;
      let interval: number;
      try {
        interval = parseEvery(job.every);
      } catch {
        continue;
      }
      const last = job.lastRunAt ? new Date(job.lastRunAt).getTime() : 0;
      if (now - last < interval) continue;
      this.running.add(job.id);
      this.store.update(job.id, { lastRunAt: new Date().toISOString() });
      Promise.resolve(this.onDue(job))
        .then((runId) => {
          if (runId) this.store.update(job.id, { lastRunId: runId });
        })
        .catch(() => undefined)
        .finally(() => this.running.delete(job.id));
    }
  }
}
