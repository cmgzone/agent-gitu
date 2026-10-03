import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { expect, it, vi } from 'vitest';
import { SshConnectionRegistry } from '../src/connections/ssh-connections.js';
import { CoworkComputer } from '../src/cowork/computer.js';
import { GituServer } from '../src/server/server.js';
import type { CoworkAgent } from '../src/cowork/store.js';
import type { LlmClient } from '../src/llm/llm.js';

it('protects cloud setup, persists the selected target, retains permissions, and rejects computer changes during work', async () => {
  const home = mkdtempSync(path.join(tmpdir(), 'cloud-computer-http-'));
  vi.stubEnv('AGENT_GITU_HOME', home);
  vi.stubEnv('AGENT_GITU_COMPUTER_BROKER_URL', 'http://private-broker.invalid');
  vi.stubEnv('AGENT_GITU_COMPUTER_BROKER_KEY', 'fixture-private-broker-key-32-chars');
  vi.spyOn(SshConnectionRegistry.prototype, 'list').mockReturnValue([{ id: 'ssh-fixture', label: 'My VPS', host: 'cloud.invalid', port: 22, username: 'fixture', hostFingerprint: 'SHA256:' + 'A'.repeat(43), createdAt: '', updatedAt: '', hasCredential: true }]);
  vi.spyOn(CoworkComputer.prototype, 'refreshStatus').mockImplementation(async function (this: CoworkComputer) { return this.status(); });
  let release!: (text: string) => void;
  let requested = false;
  const reply = new Promise<string>((resolve) => { release = resolve; });
  const llm: LlmClient = { name: 'fixture', complete: () => { requested = true; return reply; } };
  const server = new GituServer({ cwd: home, port: 0, llm, coworkCompletionProtocol: 'legacy' });
  try {
    const base = `http://127.0.0.1:${await server.start()}`;
    let cookie = '';
    const request = async (route: string, body?: unknown, origin = base) => {
      const response = await fetch(base + route, { method: body === undefined ? 'GET' : 'POST', headers: { cookie, origin, 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
      return { status: response.status, data: await response.json(), headers: response.headers };
    };
    expect((await request('/api/cowork/cloud-servers')).status).toBe(401);
    expect((await request('/api/cowork/cloud-servers', {})).status).toBe(401);
    const password = 'Disposable cloud setup fixture password';
    expect((await request('/api/auth/register', { name: 'Fixture', email: 'cloud-fixture@example.com', password })).status).toBe(201);
    const login = await request('/api/auth/login', { email: 'cloud-fixture@example.com', password });
    cookie = login.headers.get('set-cookie')!.split(';')[0]!;
    const servers = await request('/api/cowork/cloud-servers');
    expect(servers.data.servers).toEqual(expect.arrayContaining([expect.objectContaining({ id: 'hosted', label: 'Gitu cloud' }), expect.objectContaining({ id: 'ssh-fixture' })]));
    expect(JSON.stringify(servers.data)).not.toContain('fixture-private-broker-key');
    expect((await request('/api/cowork/cloud-servers/host-key', { baseUrl: 'ssh://fixture@cloud.invalid' }, 'https://evil.invalid')).status).toBe(403);
    expect((await request('/api/cowork/agents', { name: 'Invalid', systemPrompt: 'Help', useHostComputer: false, cloudConnectionId: 'not-saved' })).status).toBe(400);
    const created = await request('/api/cowork/agents', { name: 'Cloud', systemPrompt: 'Help', useHostComputer: false, cloudConnectionId: 'ssh-fixture', allowShell: true, allowWrites: true });
    expect(created.status).toBe(200);
    const agent = created.data.agent as CoworkAgent;
    const route = `/api/cowork/agents/${agent.id}/computer`;
    const cloudName = (await request(route)).data.computer.name;
    expect((await request('/api/cowork/agents')).data.agents.find((a: CoworkAgent) => a.id === agent.id)).toMatchObject({ cloudConnectionId: 'ssh-fixture', useHostComputer: false });
    const conversation = (await request('/api/cowork/conversations', { kind: 'dm', memberIds: [agent.id] })).data.conversation;
    expect((await request(`/api/cowork/conversations/${conversation.id}/messages`, { text: 'Investigate this task' })).status).toBe(202);
    await vi.waitFor(() => expect(requested).toBe(true));
    expect((await request('/api/cowork/agents', { ...agent, useHostComputer: true, cloudConnectionId: '' })).status).toBe(409);
    expect((await request('/api/cowork/agents')).data.agents.find((a: CoworkAgent) => a.id === agent.id).cloudConnectionId).toBe('ssh-fixture');
    release('Investigation complete.');
    await vi.waitFor(async () => expect((await request(`/api/cowork/conversations/${conversation.id}/messages`)).data.busy).toBe(false));
    const local = await request('/api/cowork/agents', { ...agent, useHostComputer: true, cloudConnectionId: '' });
    expect(local.status).toBe(200);
    expect(local.data.agent).toMatchObject({ useHostComputer: true, allowShell: true, allowWrites: true });
    expect(local.data.agent.cloudConnectionId).toBeUndefined();
    const privateName = (await request(route)).data.computer.name;
    expect(privateName).not.toBe(cloudName);
    const hosted = await request('/api/cowork/agents', { ...agent, cloudConnectionId: 'hosted' });
    expect(hosted.status).toBe(200);
    // Existing hosted private desktop volumes keep their identity.
    expect((await request(route)).data.computer.name).toBe(privateName);
    expect((await request('/api/cowork/agents', { ...agent })).status).toBe(200);
    expect((await request(route)).data.computer.name).toBe(cloudName);
  } finally {
    release('Done'); await server.stop();
    vi.restoreAllMocks(); vi.unstubAllEnvs(); rmSync(home, { recursive: true, force: true });
  }
}, 30_000);
