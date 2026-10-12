import { createHash } from 'node:crypto';
import { createContext, runInContext } from 'node:vm';
import { describe, expect, it, vi } from 'vitest';
import { FILE_HASH_JS } from '../src/server/ui-file-hash.js';
import { FILE_UPLOAD_JS } from '../src/server/ui-files.js';

describe('bounded browser file checksums', () => {
  it('matches independent SHA-256 across block padding boundaries and incremental updates', () => {
    const context = createContext({}); runInContext(FILE_HASH_JS, context);
    for (const size of [0, 1, 55, 56, 63, 64, 65, 511, 1024 * 1024 + 17]) {
      const bytes = Buffer.alloc(size); for (let i = 0; i < size; i++) bytes[i] = i % 251;
      const hash = context['fileHashState']();
      for (let offset = 0; offset < size; offset += 37) hash.update(bytes.subarray(offset, offset + 37));
      expect(hash.digest()).toBe(createHash('sha256').update(bytes).digest('hex'));
    }
  });
  it('reads a file above 20 MB in one MiB slices and can cancel checksum work', async () => {
    const context = createContext({ setTimeout }); runInContext(FILE_HASH_JS, context);
    const size = 21 * 1024 * 1024 + 7, independent = createHash('sha256'), lengths: number[] = [];
    const file = { size, slice: (start: number, end: number) => ({ arrayBuffer: async () => { const bytes = new Uint8Array(end - start).fill(3); lengths.push(bytes.length); independent.update(bytes); return bytes.buffer; } }) };
    expect(await context['fileChecksum'](file)).toBe(independent.digest('hex'));
    expect(Math.max(...lengths)).toBe(1024 * 1024); expect(lengths).toHaveLength(22);
    const abort = new AbortController();
    await expect(context['fileChecksum'](new Blob([Buffer.alloc(2 * 1024 * 1024)]), abort.signal, () => abort.abort())).rejects.toMatchObject({ name: 'AbortError' });
  });
});

function uploaderFixture() {
  let remote: any, bytes = Buffer.alloc(0), loseAcknowledgement = false, failStatus = false, creates = 0;
  const local = new Map<string, string>(), calls: Array<{ method: string; path: string; length?: number }> = [];
  const fetcher = vi.fn(async (route: string, init: RequestInit = {}) => {
    const method = init.method ?? 'GET', url = new URL(route, 'http://fixture.invalid'); calls.push({ method, path: url.pathname });
    const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status });
    if (url.pathname.endsWith('/policy')) return json({ maxFileBytes: null });
    if (method === 'GET' && url.pathname.endsWith('/uploads')) return json({ files: remote ? [remote] : [] });
    if (method === 'GET') return failStatus ? json({}, 503) : remote ? json({ file: remote }) : json({}, 404);
    if (method === 'POST' && url.pathname.endsWith('/uploads')) {
      const input = JSON.parse(String(init.body)); creates++; remote = { id: 'file-fixture', ...input, state: 'uploading', offset: 0 }; bytes = Buffer.alloc(0); return json({ file: remote });
    }
    if (method === 'PATCH') {
      const data = Buffer.from(await (init.body as Blob).arrayBuffer()); calls.at(-1)!.length = data.length;
      expect(new Headers(init.headers).get('upload-offset')).toBe(String(bytes.length));
      bytes = Buffer.concat([bytes, data]); remote.offset = bytes.length;
      if (loseAcknowledgement) { loseAcknowledgement = false; throw new Error('Network interrupted'); } return json({ file: remote });
    }
    const checksum = JSON.parse(String(init.body)).checksum;
    expect(remote.offset).toBe(remote.size); expect(remote.checksum).toBe(checksum); expect(createHash('sha256').update(bytes).digest('hex')).toBe(checksum);
    remote.state = 'ready'; return json({ file: remote });
  });
  const context = createContext({ fetch: fetcher, api: async (url: string, init?: RequestInit) => {
    const response = await fetcher(url, init); if (!response.ok) throw new Error('HTTP ' + response.status); return response.json();
  }, $: () => null, humanBytes: String, setTimeout, localStorage: { getItem: (key: string) => local.get(key) ?? null, setItem: (key: string, value: string) => local.set(key, value), removeItem: (key: string) => local.delete(key) } });
  runInContext(FILE_UPLOAD_JS, context);
  return { context, local, calls, remote: () => remote, creates: () => creates, interrupt: () => { loseAcknowledgement = true; }, unavailable: () => { failStatus = true; } };
}

describe('browser resumable uploads', () => {
  it('submits client checksums and resumes at the server offset after a lost chunk response', async () => {
    const fixture = uploaderFixture(), blob = Object.assign(new Blob([Buffer.alloc(6 * 1024 * 1024, 7)]), { name: 'result.any', lastModified: 1 });
    fixture.interrupt();
    await expect(fixture.context['uploadBinary'](blob, 'company', 'fixture')).rejects.toThrow('Network interrupted');
    expect(fixture.remote().offset).toBe(5 * 1024 * 1024);
    const result = await fixture.context['uploadBinary'](blob, 'company', 'fixture');
    expect(result).toMatchObject({ artifactId: 'file-fixture', name: 'result.any' }); expect(fixture.creates()).toBe(1);
    expect(fixture.calls.filter(c => c.method === 'PATCH').map(c => c.length)).toEqual([5 * 1024 * 1024, 1024 * 1024]); expect(fixture.local.size).toBe(0);
  });
  it('finds the original upload by checksum after browser state is lost', async () => {
    const fixture = uploaderFixture(), blob = Object.assign(new Blob(['original']), { name: 'result', lastModified: 1 });
    fixture.interrupt(); await expect(fixture.context['uploadBinary'](blob, 'company', 'fixture')).rejects.toThrow('Network interrupted');
    fixture.local.clear();
    expect((await fixture.context['uploadBinary'](blob, 'company', 'fixture')).artifactId).toBe('file-fixture'); expect(fixture.creates()).toBe(1);
  });
  it('preserves saved state on status errors and rejects a different file with identical metadata', async () => {
    const fixture = uploaderFixture(), original = Object.assign(new Blob(['original']), { name: 'result', lastModified: 1 });
    fixture.interrupt(); await expect(fixture.context['uploadBinary'](original, 'company', 'fixture')).rejects.toThrow('Network interrupted');
    const changed = Object.assign(new Blob(['different'.slice(0, 8)]), { name: 'result', lastModified: 1 });
    await expect(fixture.context['uploadBinary'](changed, 'company', 'fixture')).rejects.toThrow('original file');
    fixture.unavailable(); await expect(fixture.context['uploadBinary'](original, 'company', 'fixture')).rejects.toThrow('saved upload');
    expect(fixture.creates()).toBe(1); expect(fixture.local.size).toBe(1);
  });
});
