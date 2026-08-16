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

export function parseEvery(every: string): number {
  const m = every.trim().match(/^(\d+)\s*(s|sec|seconds?|m|min|minutes?|h|hours?)$/i);
  if (!m) throw new Error(`Invalid schedule "${every}". Use e.g. 30s, 5m, 1h.`);
  const n = Number(m[1]);
  const unit = m[2]!.toLowerCase();
  if (unit.startsWith('s')) return n * 1000;
  if (unit.startsWith('m')) return n * 60 * 1000;
  return n * 60 * 60 * 1000;
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

  constructor(
    private readonly store: CronStore,
    private readonly onDue: (job: CronJob) => string | undefined,
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
      if (!job.enabled) continue;
      let interval: number;
      try {
        interval = parseEvery(job.every);
      } catch {
        continue;
      }
      const last = job.lastRunAt ? new Date(job.lastRunAt).getTime() : 0;
      if (now - last >= interval) {
        const runId = this.onDue(job);
        this.store.update(job.id, { lastRunAt: new Date().toISOString(), lastRunId: runId });
      }
    }
  }
}
