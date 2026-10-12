import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { describe, it, expect, vi } from 'vitest';
import { GituServer } from '../src/server/server.js';
import { ScriptedMockLlm } from '../src/llm/llm.js';
describe('company and file HTTP boundaries', () => {
  it('scopes companies and resumable binary uploads, serves video ranges and preserves history after restart', async () => {
    const root = mkdtempSync(path.join(os.tmpdir(), 'gitu-company-http-'));
    vi.stubEnv('AGENT_GITU_HOME', root);
    let server = new GituServer({ passwordRequired: false, port: 0, llm: new ScriptedMockLlm([]) });
    try {
      let origin = 'http://localhost:' + (await server.start());
      const request = async (url: string, method = 'GET', body?: unknown) => {
        const response = await fetch(origin + url, {
          method,
          headers: { origin, 'content-type': 'application/json' },
          body: body === undefined ? undefined : JSON.stringify(body),
        });
        return { status: response.status, data: (await response.json()) as any };
      };
      const a = (await request('/api/companies', 'POST', { name: 'Alpha', purpose: 'Build', monthlyBudgetUsd: null, maxFileBytes: null })).data.company,
        b = (await request('/api/companies', 'POST', { name: 'Beta' })).data.company;
      const lead = (await request('/api/companies/' + a.id + '/lead', 'POST', { name: 'Owner lead' })).data.agent;
      expect((await request('/api/companies/' + b.id + '/cowork/agents/' + lead.id + '/computer')).status).toBe(404);
      expect((await request('/api/cowork/agents')).data.agents).not.toContainEqual(expect.objectContaining({ id: lead.id }));
      const bytes = Buffer.alloc(21 * 1024 * 1024, 19),
        checksum = createHash('sha256').update(bytes).digest('hex'),
        base = '/api/companies/' + a.id + '/files/uploads';
      const created = await request(base, 'POST', { scope: 'company', name: 'movie.mp4', mime: 'video/mp4', size: bytes.length, checksum });
      expect(created.status).toBe(201);
      const id = created.data.file.id;
      for (let offset = 0; offset < bytes.length; offset += 5 * 1024 * 1024) {
        const response = await fetch(origin + base + '/' + id + '?scope=company', {
          method: 'PATCH',
          headers: { origin, 'upload-offset': String(offset) },
          body: bytes.subarray(offset, Math.min(bytes.length, offset + 5 * 1024 * 1024)),
        });
        expect(response.status).toBe(200);
      }
      expect((await request(base + '/' + id + '/complete?scope=company', 'POST')).data.file.checksum).toBe(checksum);
      const range = await fetch(origin + base + '/' + id + '/content?scope=company&inline=1', { headers: { range: 'bytes=1048576-1048583' } });
      expect(range.status).toBe(206);
      expect(Buffer.from(await range.arrayBuffer()).equals(bytes.subarray(1048576, 1048584))).toBe(true);
      expect((await request('/api/companies/' + b.id + '/files/uploads/' + id + '?scope=company')).status).toBe(404);
      await request('/api/companies/' + a.id + '/archive', 'POST');
      await request('/api/companies/' + a.id + '/restore', 'POST');
      expect((await request('/api/companies/' + a.id)).data.company.state).toBe('paused');
      await server.stop();
      server = new GituServer({ passwordRequired: false, port: 0, llm: new ScriptedMockLlm([]) });
      origin = 'http://localhost:' + (await server.start());
      expect((await request('/api/companies/' + a.id)).data.agents[0].id).toBe(lead.id);
      expect((await request(base + '/' + id + '?scope=company')).data.file.state).toBe('ready');
    } finally {
      await server.stop();
      vi.unstubAllEnvs();
      rmSync(root, { recursive: true, force: true });
    }
  }, 30000);
});
