import { fork } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { MemoryStore } from '../src/memory/memory-store.js';
import { withMemoryFileLock } from '../src/memory/file-lock.js';
import { hashingEmbedder } from '../src/memory/semantic.js';

const directories: string[] = [];
function memoryFile() {
  const dir = mkdtempSync(path.join(tmpdir(), 'gitu-memory-integrity-'));
  directories.push(dir);
  return path.join(dir, 'memory.json');
}
afterEach(() => {
  for (const dir of directories.splice(0)) rmSync(dir, { recursive: true, force: true });
});
const finding = { type: 'observation' as const, scope: 'project', claim: 'Checkout retry investigation found timeout' };

describe('memory persistence across sessions', () => {
  it('preserves writes and audit events from independent store instances', () => {
    const file = memoryFile();
    const a = new MemoryStore(file), b = new MemoryStore(file);
    const first = a.add(finding).entry;
    const second = b.add({ ...finding, claim: 'Build pipeline completed successfully' }).entry;
    expect(a.query().map((e) => e.id)).toEqual(expect.arrayContaining([first.id, second.id]));
    expect(b.explain(first.id).audit.some((e) => e.event === 'created')).toBe(true);
    expect(a.explain(second.id).audit.some((e) => e.event === 'created')).toBe(true);
  });

  it('a stale reader cannot revive archived memory or erase a new finding', () => {
    const file = memoryFile();
    const a = new MemoryStore(file);
    const first = a.add(finding).entry;
    const b = new MemoryStore(file);
    a.archive(first.id);
    const second = a.add({ ...finding, claim: 'Checkout retry now succeeds' }).entry;
    const retrieved = b.retrieve('Checkout retry', 'project');
    expect(retrieved.map((e) => e.id)).toEqual([second.id]);
    expect(new MemoryStore(file).explain(first.id).entry?.status).toBe('archived');
  });

  it('serializes real concurrent processes, including duplicate claims', async () => {
    const file = memoryFile();
    const workers = Array.from({ length: 3 }, (_, index) => {
      const child = fork(path.resolve('tests/fixtures/memory-writer.ts'), [file, String(index)], {
        execArgv: ['--import', 'tsx'], stdio: ['ignore', 'ignore', 'pipe', 'ipc'],
      });
      let stderr = '';
      child.stderr?.on('data', (data) => { stderr += String(data); });
      const done = new Promise<void>((resolve, reject) => {
        child.once('error', reject);
        child.once('exit', (code) => code === 0 ? resolve() : reject(new Error(stderr || `worker exited ${code}`)));
      });
      const ready = new Promise<void>((resolve, reject) => {
        child.once('message', () => resolve());
        child.once('error', reject);
        child.once('exit', (code) => reject(new Error(`worker exited before ready: ${code}`)));
      });
      return { child, done, ready };
    });
    try {
      await Promise.all(workers.map((w) => w.ready));
      for (const { child } of workers) child.send('start');
      await Promise.all(workers.map((w) => w.done));
      const store = new MemoryStore(file);
      expect(store.query({ limit: 100 })).toHaveLength(31);
      expect(store.query({ text: 'Shared checkout finding' })).toHaveLength(1);
      expect(store.query({ text: 'Shared checkout finding' })[0]?.accessCount).toBe(30);
      const audit = JSON.parse(readFileSync(path.join(path.dirname(file), 'memory-audit.json'), 'utf8'));
      expect(audit.filter((e: { event: string }) => e.event === 'created')).toHaveLength(31);
    } finally {
      for (const { child } of workers) if (child.exitCode === null) child.kill();
      await Promise.allSettled(workers.map((w) => w.done));
    }
  }, 20_000);

  it('refuses to overwrite a corrupted memory file', () => {
    const file = memoryFile();
    const store = new MemoryStore(file);
    store.add(finding);
    writeFileSync(file, '{broken');
    expect(() => store.add({ ...finding, claim: 'Another finding' })).toThrow();
    expect(readFileSync(file, 'utf8')).toBe('{broken');
  });

  it('refreshes protected constraints and search for an already-open session', async () => {
    const file = memoryFile();
    const reader = new MemoryStore(file), writer = new MemoryStore(file);
    const constraint = writer.add({ type: 'constraint', scope: 'project', claim: 'Checkout must preserve keyboard navigation' }).entry;
    expect(reader.retrieveProtected('project').map((e) => e.id)).toContain(constraint.id);
    writer.archive(constraint.id);
    expect(reader.retrieveProtected('project')).toHaveLength(0);
    // Explicit search includes history, but must report its current status.
    expect((await reader.search('keyboard navigation'))[0]?.status).toBe('archived');
  });

  it('does not revive memories archived while semantic embedding is in flight', async () => {
    const file = memoryFile();
    const store = new MemoryStore(file), writer = new MemoryStore(file);
    const first = store.add(finding).entry;
    store.add({ ...finding, claim: `${finding.claim} again` });
    const underlying = hashingEmbedder(96);
    const result = await store.consolidateSemantic({ embedder: {
      ...underlying,
      async embed(text) {
        writer.archive(first.id);
        return underlying.embed(text);
      },
    } });
    expect(result.merged).toHaveLength(0);
    expect(new MemoryStore(file).explain(first.id).entry?.status).toBe('archived');
  });
});

describe.each(['lexical', 'semantic'] as const)('%s consolidation privacy', (mode) => {
  it('retains private ownership and keeps another agent from retrieving the merge', async () => {
    const store = new MemoryStore(memoryFile());
    store.add({ ...finding, visibility: 'agent', agentId: 'alice', missionId: 'one', pinned: true });
    store.add({ ...finding, claim: `${finding.claim} again`, visibility: 'agent', agentId: 'alice', missionId: 'one' });
    const result = mode === 'lexical' ? store.consolidate('project')
      : await store.consolidateSemantic({ scope: 'project', embedder: hashingEmbedder(96) });
    expect(result.merged).toHaveLength(1);
    expect(result.merged[0]).toMatchObject({ visibility: 'agent', agentId: 'alice', missionId: 'one', projectId: 'project', pinned: true });
    expect(store.retrieve('checkout', 'project', 8, { requestingAgentId: 'bob', missionId: 'one', projectId: 'project' })).toHaveLength(0);
    expect(store.retrieve('checkout', 'project', 8, { requestingAgentId: 'alice', missionId: 'one', projectId: 'project' })).toHaveLength(1);
  });

  it('never combines different agents, missions, projects, or visibility scopes', async () => {
    const store = new MemoryStore(memoryFile());
    const boundaries = [
      { visibility: 'agent' as const, agentId: 'alice', missionId: 'one' },
      { visibility: 'agent' as const, agentId: 'bob', missionId: 'one' },
      { visibility: 'agent' as const, agentId: 'alice', missionId: 'two' },
      { visibility: 'mission' as const, missionId: 'one' },
      { visibility: 'mission' as const, missionId: 'two' },
      { visibility: 'project' as const, projectId: 'project' },
      { visibility: 'project' as const, projectId: 'another-project' },
    ];
    boundaries.forEach((boundary, i) => store.add({ ...finding, ...boundary, claim: `${finding.claim} occurrence ${i}` }));
    const result = mode === 'lexical' ? store.consolidate()
      : await store.consolidateSemantic({ embedder: hashingEmbedder(96) });
    expect(result.merged).toHaveLength(0);
    expect(store.query()).toHaveLength(boundaries.length);
    expect(store.query().every((e) => e.status !== 'superseded')).toBe(true);
  });
});

describe('memory identity and replacement', () => {
  it('keeps identical mission findings separate while deduplicating within a mission', () => {
    const store = new MemoryStore(memoryFile());
    const input = { agentId: 'alice', scope: 'project', type: 'observation' as const, content: finding.claim, evidence: 'dummy test evidence' };
    const first = store.publishFinding({ ...input, missionId: 'one' });
    const second = store.publishFinding({ ...input, missionId: 'two' });
    expect(first.id).not.toBe(second.id);
    expect(store.publishFinding({ ...input, missionId: 'two', agentId: 'bob' }).id).toBe(second.id);
    expect(second.status).toBe('candidate');
    expect(store.retrieve('checkout', 'project', 8, { missionId: 'two', projectId: 'project' }).map((e) => e.id)).toEqual([second.id]);
  });

  it('keeps identical private claims separate for different owners', () => {
    const store = new MemoryStore(memoryFile());
    const a = store.add({ ...finding, visibility: 'agent', agentId: 'alice' }).entry;
    const b = store.add({ ...finding, visibility: 'agent', agentId: 'bob' }).entry;
    expect(a.id).not.toBe(b.id);
    expect(store.retrieve('checkout', 'project', 8, { requestingAgentId: 'bob' }).map((e) => e.id)).toEqual([b.id]);
  });

  it('retains compatible facts with similar wording', () => {
    const store = new MemoryStore(memoryFile());
    const visa = store.recordVerified({ type: 'fact', scope: 'project', claim: 'Checkout accepts Visa cards', sourceType: 'test' }).entry;
    const mastercard = store.recordVerified({ type: 'fact', scope: 'project', claim: 'Checkout accepts Mastercard cards', sourceType: 'test' });
    expect(mastercard.supersededIds).toEqual([]);
    expect(visa.status).toBe('verified');
    expect(store.retrieve('Checkout accepts cards', 'project')).toHaveLength(2);
  });

  it('requires evidence and matching ownership for an explicit replacement', () => {
    const store = new MemoryStore(memoryFile());
    const original = store.add({ ...finding, type: 'fact' }).entry;
    const replacement = { type: 'fact' as const, scope: 'project', claim: 'Checkout retries now succeed', replaces: [original.id] };
    expect(() => store.recordVerified(replacement)).toThrow(/verification support/);
    const privateEntry = store.add({ ...finding, type: 'fact', visibility: 'agent', agentId: 'alice' }).entry;
    expect(() => store.recordVerified({ ...replacement, sourceType: 'test', replaces: [privateEntry.id] })).toThrow(/ownership scope/);
    const verified = store.recordVerified({ ...replacement, sourceType: 'test' });
    expect(verified.supersededIds).toEqual([original.id]);
    expect(original.status).toBe('superseded');
    expect(privateEntry.status).toBe('candidate');
  });

  it('withMemoryFileLock serializes concurrent async critical sections without blocking event loop', async () => {
    const file = memoryFile();
    const order: number[] = [];
    const runTask = async (id: number, delayMs: number) => {
      return withMemoryFileLock(file, async () => {
        order.push(id);
        await new Promise((r) => setTimeout(r, delayMs));
        order.push(id);
      });
    };
    await Promise.all([runTask(1, 40), runTask(2, 20), runTask(3, 10)]);
    expect(order).toEqual([1, 1, 2, 2, 3, 3]);
  });

  it('allows timers to fire while waiting for memory file lock (event loop responsiveness)', async () => {
    const file = memoryFile();
    let timerFired = false;

    // Acquire lock and hold it for 60ms
    const holdLockPromise = withMemoryFileLock(file, async () => {
      await new Promise((r) => setTimeout(r, 60));
    });

    // Schedule timer to fire in 20ms
    setTimeout(() => {
      timerFired = true;
    }, 20);

    // Give the first lock acquisition 5ms to create the lock file
    await new Promise((r) => setTimeout(r, 5));

    // This operation must wait asynchronously for the lock
    await withMemoryFileLock(file, async () => {
      // By the time the second lock is acquired, the 20ms timer MUST have fired
      // because waiting for the lock did not block the Node.js event loop.
      expect(timerFired).toBe(true);
    });

    await holdLockPromise;
    expect(timerFired).toBe(true);
  });
});

