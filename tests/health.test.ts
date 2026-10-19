import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { GituServer } from '../src/server/server.js';
import { ScriptedMockLlm } from '../src/llm/llm.js';

const servers: GituServer[] = [],
  homes: string[] = [];
afterEach(async () => {
  for (const server of servers.splice(0)) await server.stop();
  vi.unstubAllEnvs();
  for (const home of homes.splice(0)) rmSync(home, { recursive: true, force: true });
});

async function start() {
  const home = mkdtempSync(path.join(os.tmpdir(), 'gitu-health-'));
  homes.push(home);
  vi.stubEnv('AGENT_GITU_HOME', home);
  const server = new GituServer({ cwd: home, port: 0, llm: new ScriptedMockLlm([]), mailInboxWatching: false });
  servers.push(server);
  return 'http://127.0.0.1:' + (await server.start());
}

describe('public liveness probe', () => {
  it('answers while the app is locked without disclosing account data or opening APIs', async () => {
    const base = await start(),
      response = await fetch(base + '/healthz');
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.get('content-type')).toContain('application/json');
    const body = await response.json();
    expect(Object.keys(body).sort()).toEqual(['status', 'uptime']);
    expect(body.status).toBe('ok');
    expect(body.uptime).toBeGreaterThanOrEqual(0);
    expect(Number.isFinite(body.uptime)).toBe(true);
    expect((await fetch(base + '/api/cowork/agents')).status).toBe(401);
  });

  it('supports HEAD and rejects writes without changing authentication state', async () => {
    const base = await start();
    const head = await fetch(base + '/healthz', { method: 'HEAD' });
    expect(head.status).toBe(200);
    expect(await head.text()).toBe('');
    const post = await fetch(base + '/healthz', { method: 'POST' });
    expect(post.status).toBe(405);
    expect(post.headers.get('allow')).toBe('GET, HEAD');
    expect((await fetch(base + '/api/auth/status').then((response) => response.json())).configured).toBe(false);
  });
});
