import { randomUUID } from 'node:crypto';
import type { CompanyJob, CompanyStore } from './store.js';

/** Durable, round-robin admission; actual work still runs through Cowork. */
export class CompanyCoordinator {
  private readonly owner = randomUUID();
  private active = new Map<string, CompanyJob>();
  private tasks = new Set<Promise<void>>();
  private timer?: ReturnType<typeof setInterval>;
  private cursor = 0;
  private stopped = false;
  constructor(
    private readonly store: CompanyStore,
    private readonly execute: (job: CompanyJob) => Promise<void>,
    private readonly onError: (error: unknown) => void = () => {},
    private readonly onLeaseLost: () => void = () => {},
  ) {}
  start(): void {
    if (this.timer) return;
    this.stopped = false;
    if (!this.store.acquireScheduler(this.owner)) throw new Error('Another company scheduler is using this data directory.');
    this.store.recover();
    this.tick();
    this.timer = setInterval(() => this.tick(), 5000);
    this.timer.unref();
  }
  stop(): void {
    this.stopped = true;
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
    if (!this.tasks.size) this.store.releaseScheduler(this.owner);
  }
  async drain(): Promise<void> {
    await Promise.allSettled([...this.tasks]);
    if (this.stopped) this.store.releaseScheduler(this.owner);
  }
  tick(): void {
    if (this.stopped) return;
    try {
      if (!this.store.acquireScheduler(this.owner)) {
        this.stop();
        this.onLeaseLost();
        this.onError(new Error('Company scheduler ownership was lost. Work has been interrupted.'));
        return;
      }
      const companies = this.store.companies().filter((c) => c.state === 'running');
      for (const c of companies)
        if (!c.nextReviewAt || Date.parse(c.nextReviewAt) <= Date.now()) {
          this.store.enqueue(c.id, 'review', {}, 'review');
          this.store.scheduleReview(c.id);
        }
      if (!companies.length) return;
      const ordered = [...companies.slice(this.cursor % companies.length), ...companies.slice(0, this.cursor % companies.length)];
      this.cursor++;
      for (const c of ordered) {
        let running = [...this.active.values()].filter((j) => j.companyId === c.id).length;
        for (const job of this.store.jobs(c.id).filter((j) => j.state === 'queued')) {
          if (this.active.size >= this.store.runtimeSettings().workers || running >= c.workers) break;
          if (job.version !== c.directionVersion && job.payload['delivery'] !== 'question') {
            this.store.finishJob(job, 'superseded');
            continue;
          }
          this.store.claim(job);
          this.active.set(job.id, job);
          running++;
          const task = this.execute(job)
            .then(() => this.store.finishJob(job, 'done'))
            .catch((error) => {
              const paused = this.store.get(job.companyId)?.state !== 'running';
              const deferred = error instanceof Error && error.message === 'Company lead is still working.';
              this.store.finishJob(job, paused || deferred ? 'queued' : 'failed', paused || deferred ? undefined : 'Company work failed. See the work transcript.');
              if (!deferred) this.onError(error);
            })
            .finally(() => {
              this.active.delete(job.id);
              this.tasks.delete(task);
            });
          this.tasks.add(task);
        }
      }
    } catch (error) {
      this.onError(error);
    }
  }
}
