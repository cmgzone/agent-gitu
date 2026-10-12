import { describe, it, expect } from 'vitest';
import { CompanyWorkers } from '../src/company/workers.js';
describe('company worker admission', () => {
  it('lets parallel helpers share one worker without reacquiring or leaking the parent slot twice', async () => {
    const pool = new CompanyWorkers(() => 1, 1), order: string[] = [];
    await pool.run('company', 'lead', undefined, async () => {
      const results = await Promise.all(['first', 'second', 'third'].map(id => pool.child('company', id, undefined, async () => {
        expect(pool.snapshot().active).toBe(1); order.push(id); return id;
      })));
      expect(results).toEqual(['first', 'second', 'third']); expect(pool.snapshot()).toEqual({ active: 1, queued: 0 }); order.push('verified');
    });
    expect(order).toEqual(['first', 'second', 'third', 'verified']); expect(pool.snapshot()).toEqual({ active: 0, queued: 0 });
  });
  it('releases a waiting parent and reacquires its slot after a helper', async () => {
    const pool = new CompanyWorkers(() => 1, 1);
    const order: string[] = [];
    await pool.run('company', 'lead', undefined, async () => {
      order.push('lead');
      await pool.child('company', 'helper', undefined, async () => {
        expect(pool.snapshot().active).toBe(1);
        order.push('helper');
      });
      order.push('verified');
    });
    expect(order).toEqual(['lead', 'helper', 'verified']);
    expect(pool.snapshot()).toEqual({ active: 0, queued: 0 });
  });
  it('enforces global and company bounds and cancels queued work', async () => {
    const pool = new CompanyWorkers(() => 1, 2),
      cancel = new AbortController();
    let done!: () => void;
    const waiting = new Promise<void>((r) => (done = r));
    const first = pool.run('a', 'one', undefined, () => waiting),
      second = pool.run('b', 'two', undefined, () => waiting);
    await Promise.resolve();
    const queued = pool.run('a', 'three', cancel.signal, async () => {
      throw new Error('must not run');
    });
    expect(pool.snapshot()).toEqual({ active: 2, queued: 1 });
    cancel.abort();
    await expect(queued).rejects.toThrow('stopped');
    done();
    await Promise.all([first, second]);
    expect(pool.snapshot().active).toBe(0);
  });
});
