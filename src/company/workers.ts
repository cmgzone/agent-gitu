import { AsyncLocalStorage } from 'node:async_hooks';
interface Lease {
  companyId: string;
  agentId: string;
  release?: () => void;
  signal?: AbortSignal;
  children?: { pending: number; finished: Promise<void>; finish: () => void; resume?: Promise<void> };
}
interface Waiter {
  companyId: string;
  resolve: (release: () => void) => void;
  reject: (error: Error) => void;
  signal?: AbortSignal;
  abort?: () => void;
}
/** Shared admission for lead, team and helpers. A waiting parent lends its slot. */
export class CompanyWorkers {
  private active = new Map<string, number>();
  private count = 0;
  private queue: Waiter[] = [];
  private scope = new AsyncLocalStorage<Lease>();
  private lastCompany = '';
  constructor(
    private readonly limit: (companyId: string) => number,
    private readonly globalLimit: number | (() => number) = 4,
  ) {}
  snapshot(): { active: number; queued: number } {
    return { active: this.count, queued: this.queue.length };
  }
  private acquire(companyId: string, signal?: AbortSignal): Promise<() => void> {
    signal?.throwIfAborted();
    return new Promise((resolve, reject) => {
      const waiter: Waiter = { companyId, resolve, reject, signal };
      waiter.abort = () => {
        this.queue = this.queue.filter((w) => w !== waiter);
        reject(new Error('Company worker stopped.'));
      };
      signal?.addEventListener('abort', waiter.abort, { once: true });
      this.queue.push(waiter);
      this.pump();
    });
  }
  private pump(): void {
    while (this.count < (typeof this.globalLimit === 'function' ? this.globalLimit() : this.globalLimit)) {
      const eligible = (w: Waiter) => (this.active.get(w.companyId) ?? 0) < this.limit(w.companyId);
      let index = this.queue.findIndex((w) => eligible(w) && w.companyId !== this.lastCompany);
      if (index < 0) index = this.queue.findIndex(eligible);
      if (index < 0) return;
      const w = this.queue.splice(index, 1)[0]!;
      w.signal?.removeEventListener('abort', w.abort!);
      if (w.signal?.aborted) {
        w.reject(new Error('Company worker stopped.'));
        continue;
      }
      this.lastCompany = w.companyId;
      this.count++;
      this.active.set(w.companyId, (this.active.get(w.companyId) ?? 0) + 1);
      let released = false;
      w.resolve(() => {
        if (released) return;
        released = true;
        this.count--;
        this.active.set(w.companyId, (this.active.get(w.companyId) ?? 1) - 1);
        this.pump();
      });
    }
  }
  async run<T>(companyId: string, agentId: string, signal: AbortSignal | undefined, work: () => Promise<T>): Promise<T> {
    const lease: Lease = { companyId, agentId, signal, release: await this.acquire(companyId, signal) };
    try {
      return await this.scope.run(lease, work);
    } finally {
      lease.release?.();
      lease.release = undefined;
    }
  }
  async child<T>(companyId: string, agentId: string, signal: AbortSignal | undefined, work: () => Promise<T>): Promise<T> {
    const parent = this.scope.getStore();
    if (!parent) return this.run(companyId, agentId, signal, work);
    if (!parent.children) {
      let finish!: () => void;
      parent.children = { pending: 0, finished: new Promise<void>(resolve => { finish = resolve; }), finish: () => finish() };
      parent.release?.(); parent.release = undefined;
    }
    const children = parent.children;
    children.pending++;
    try {
      return await this.run(companyId, agentId, signal, work);
    } finally {
      if (--children.pending === 0) children.finish();
      await children.finished;
      if (!parent.signal?.aborted) {
        children.resume ??= this.acquire(parent.companyId, parent.signal).then(release => { parent.release = release; });
        await children.resume;
      }
      if (parent.children === children) parent.children = undefined;
    }
  }
}
