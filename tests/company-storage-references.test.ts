import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it, expect, vi } from 'vitest';
import { GituServer } from '../src/server/server.js';
import { ScriptedMockLlm } from '../src/llm/llm.js';

describe('company external file references', () => {
  it('checks current read grants, keeps provider files on removal and scopes references to their company', async () => {
    const root = mkdtempSync(path.join(os.tmpdir(), 'gitu-references-'));
    const folder = path.join(root, 'provider');
    mkdirSync(folder);
    writeFileSync(path.join(folder, 'notes.txt'), 'Provider original');
    vi.stubEnv('AGENT_GITU_HOME', root);
    vi.stubEnv('AGENT_GITU_SECRETS_KEY', 'ef'.repeat(32));
    const server = new GituServer({ passwordRequired: false, port: 0, cwd: root, llm: new ScriptedMockLlm([]), autoInstallLsp: false });
    try {
      const origin = `http://127.0.0.1:${await server.start()}`;
      const request = async (route: string, method = 'GET', body?: unknown) => {
        const response = await fetch(origin + route, { method, headers: { origin, 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
        return { status: response.status, data: await response.json() as any };
      };
      const a = (await request('/api/companies', 'POST', { name: 'Alpha' })).data.company;
      const b = (await request('/api/companies', 'POST', { name: 'Beta' })).data.company;
      const base = `/api/companies/${a.id}/storage`;
      const connection = (await request(base, 'POST', { name: 'Provider files', provider: 'local', config: { folder }, permissions: ['list', 'read'] })).data.connection;
      const created = await request(`${base}/${connection.id}/reference`, 'POST', { id: 'notes.txt' });
      expect(created.status).toBe(201);
      const reference = created.data.reference;
      expect((await request(base)).data.references).toContainEqual(expect.objectContaining({ id: reference.id, connected: true, readable: true, connectionName: 'Provider files' }));
      expect((await request(`/api/companies/${b.id}/storage/references/${reference.id}`, 'DELETE')).status).toBe(404);
      expect((await request(`/api/companies/${b.id}/storage/references/${reference.id}/import`, 'POST')).status).toBe(404);
      await request(`${base}/${connection.id}`, 'PATCH', { permissions: ['list'] });
      expect((await request(base)).data.references[0].readable).toBe(false);
      expect((await request(`${base}/references/${reference.id}/import`, 'POST')).data.error).toContain('not granted');
      expect((await request(`/api/companies/${a.id}/files/uploads?scope=company`)).data.files).toEqual([]);
      await request(`${base}/${connection.id}`, 'PATCH', { permissions: ['read'] });
      const imported = await request(`${base}/references/${reference.id}/import`, 'POST');
      expect(imported.status).toBe(201);
      expect(imported.data.file.state).toBe('ready');
      expect((await request(`${base}/${connection.id}`, 'DELETE')).status).toBe(200);
      expect((await request(base)).data.references[0]).toMatchObject({ connected: false, readable: false });
      expect((await request(`${base}/references/${reference.id}`, 'DELETE')).status).toBe(200);
      expect((await request(base)).data.references).toEqual([]);
      expect(readFileSync(path.join(folder, 'notes.txt'), 'utf8')).toBe('Provider original');
      expect((await request(`/api/companies/${a.id}/files/uploads?scope=company`)).data.files).toHaveLength(1);
    } finally {
      await server.stop();
      vi.unstubAllEnvs();
      rmSync(root, { recursive: true, force: true });
    }
  }, 30000);
});
