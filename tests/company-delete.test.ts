import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, existsSync, rmSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { expect, it, vi } from 'vitest';
import { GituServer } from '../src/server/server.js';
import { ScriptedMockLlm } from '../src/llm/llm.js';
it('requires the exact company name, removes only that company and keeps project files, shared agents and a recovery snapshot', async () => {
  const home = mkdtempSync(path.join(os.tmpdir(), 'company-delete-'));
  vi.stubEnv('AGENT_GITU_HOME', home);
  const cwd = path.join(home, 'Workspace');
  mkdirSync(cwd);
  writeFileSync(path.join(cwd, 'package.json'), '{}');
  const server = new GituServer({ cwd, port: 0, passwordRequired: false, llm: new ScriptedMockLlm([]) });
  try {
    const origin = 'http://127.0.0.1:' + (await server.start()),
      call = async (route: string, method = 'GET', body?: unknown) => {
        const r = await fetch(origin + route, { method, headers: { 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
        return { status: r.status, data: (await r.json()) as any };
      };
    const alpha = (await call('/api/companies', 'POST', { name: 'Alpha' })).data.company,
      beta = (await call('/api/companies', 'POST', { name: 'Beta' })).data.company,
      lead = (await call('/api/companies/' + alpha.id + '/lead', 'POST', { name: 'Lead' })).data.agent;
    const internal = server as any,
      workspace = internal.companies().workspace(alpha.id);
    mkdirSync(workspace, { recursive: true });
    writeFileSync(path.join(workspace, 'keep.txt'), 'Project files are retained.');
    expect((await call('/api/companies/' + alpha.id, 'DELETE')).status).toBe(400);
    expect((await call('/api/companies/' + alpha.id, 'DELETE', { confirmName: 'Wrong' })).status).toBe(400);
    expect((await call('/api/companies/' + alpha.id)).status).toBe(200);
    const result = await call('/api/companies/' + alpha.id, 'DELETE', { confirmName: 'Alpha' });
    expect(result.status).toBe(200);
    expect(result.data).toMatchObject({ removed: true, companyId: alpha.id, projectFilesRetained: true, recoverySnapshotSaved: true });
    expect((await call('/api/companies/' + alpha.id)).status).toBe(404);
    expect((await call('/api/companies/' + beta.id)).status).toBe(200);
    expect(existsSync(path.join(workspace, 'keep.txt'))).toBe(true);
    expect(internal.cowork().getAgent(lead.id)).toBeDefined();
    const deleted = path.join(internal.companies().root, 'Deleted'),
      saved = readdirSync(deleted).find((file) => file.startsWith(alpha.id + '-'))!;
    expect(JSON.parse(readFileSync(path.join(deleted, saved), 'utf8')).company.id).toBe(alpha.id);
  } finally {
    await server.stop();
    vi.unstubAllEnvs();
    rmSync(home, { recursive: true, force: true });
  }
}, 30000);
it('stops only the selected company coding task before removing its records', async () => {
  const home = mkdtempSync(path.join(os.tmpdir(), 'company-stop-delete-'));
  vi.stubEnv('AGENT_GITU_HOME', home);
  const server = new GituServer({ port: 0, passwordRequired: false, llm: new ScriptedMockLlm([]) }),
    internal = server as any;
  try {
    const origin = 'http://127.0.0.1:' + (await server.start()),
      store = internal.companies(),
      a = store.create({ name: 'Delete me' }),
      b = store.create({ name: 'Keep me' });
    const task = {
        runId: 'own-task',
        goal: 'Company work',
        status: 'running',
        startedAt: new Date().toISOString(),
        events: [],
        coworkTask: { companyId: a.id, agentId: 'a', conversationId: 'a' },
      },
      other = { ...task, runId: 'other-task', coworkTask: { companyId: b.id, agentId: 'b', conversationId: 'b' } };
    internal.sessions.set(task.runId, task);
    internal.sessions.set(other.runId, other);
    const stopped = vi.spyOn(internal, 'detachRun').mockImplementation(() => undefined);
    vi.spyOn(internal, 'persistSession').mockImplementation(() => undefined);
    const response = await fetch(origin + '/api/companies/' + a.id, {
      method: 'DELETE',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ confirmName: 'Delete me' }),
    });
    expect(response.status).toBe(200);
    expect(task.status).toBe('aborted');
    expect(other.status).toBe('running');
    expect(stopped).toHaveBeenCalledOnce();
    expect(store.get(b.id)).toBeDefined();
  } finally {
    internal.sessions.delete('own-task');
    internal.sessions.delete('other-task');
    await server.stop();
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    rmSync(home, { recursive: true, force: true });
  }
}, 30000);
