import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { CoworkComputer, type ComputerExec } from '../src/cowork/computer.js';
import { GituServer } from '../src/server/server.js';

function dockerFixture(legacy = false) {
  const exec = vi.fn<ComputerExec>(async (args, input) => {
    if (args[0] === 'container') {
      if (legacy) return 'agent-gitu-cowork:1';
      throw new Error('not found');
    }
    if (args[0] === 'exec') {
      expect(JSON.parse(input!).tool).toBe('desktop_screenshot');
      return JSON.stringify({ ok: true, output: Buffer.from(args[2]).toString('base64') });
    }
    return '';
  });
  return exec;
}

describe('private desktop lifecycle', () => {
  it('keeps two agents isolated and never restarts a running desktop to refresh its screen', async () => {
    const exec = dockerFixture();
    const a = new CoworkComputer('agent-a', 'desktop-test', exec);
    const b = new CoworkComputer('agent-b', 'desktop-test', exec);
    expect((await a.desktopScreenshot()).ok).toBe(false);
    expect(exec).not.toHaveBeenCalled();
    await a.start(); await b.start();
    const starts = exec.mock.calls.filter(([args]) => args[0] === 'start').length;
    const first = await a.desktopScreenshot(), second = await b.desktopScreenshot();
    expect(first.output).not.toEqual(second.output);
    expect(Buffer.from(first.output, 'base64').toString()).toBe(a.name);
    expect(Buffer.from(second.output, 'base64').toString()).toBe(b.name);
    await a.start(); await a.desktopScreenshot();
    expect(exec.mock.calls.filter(([args]) => args[0] === 'start')).toHaveLength(starts);
    expect(exec.mock.calls.filter(([args]) => args[0] === 'create').every(([args]) => !args.includes('-p') && !args.includes('--publish'))).toBe(true);
    await a.stop();
    const calls = exec.mock.calls.length;
    expect((await a.desktopScreenshot()).ok).toBe(false);
    expect(exec.mock.calls).toHaveLength(calls);
    expect(b.status().state).toBe('running');
  });

  it('upgrades older computers with a recoverable container backup and the same data volumes', async () => {
    const exec = dockerFixture(true);
    const computer = new CoworkComputer('legacy-agent', 'desktop-test', exec);
    await computer.start();
    const commands = exec.mock.calls.map(([args]) => args);
    expect(commands.find(args => args[0] === 'rename')).toEqual(['rename', computer.name, expect.stringMatching(/-backup-\d+$/)]);
    const create = commands.find(args => args[0] === 'create')!;
    expect(create).toContain(`type=volume,src=${computer.name}-workspace,dst=/workspace`);
    expect(create).toContain(`type=volume,src=${computer.name}-home,dst=/home/agent`);
    expect(create.at(-1)).toBe('agent-gitu-cowork:2');
    expect(commands.some(args => args[0] === 'rm')).toBe(false);
  });

  it('reports unavailable Docker without claiming the desktop is running', async () => {
    const computer = new CoworkComputer('no-docker', 'desktop-test', async () => { throw new Error('docker not found'); });
    await expect(computer.start()).rejects.toThrow(/Install\/start Docker Desktop|private desktop runtime/);
    expect(computer.status().state).toBe('unavailable');
    expect((await computer.desktopScreenshot()).output).toContain('docker not found');
  });

  it('allows restarting a desktop after its container stops outside the app', async () => {
    const exec = dockerFixture();
    const computer = new CoworkComputer('crashed-agent', 'desktop-test', exec);
    await computer.start();
    exec.mockImplementation(async (args) => {
      if (args[0] === 'exec') throw new Error('Container is not running');
      if (args.includes('{{.State.Running}}')) return 'false';
      if (args.includes('{{.Config.Image}}')) return 'agent-gitu-cowork:2';
      return '';
    });
    await expect(computer.desktopScreenshot()).rejects.toThrow('Container is not running');
    expect(computer.status().state).toBe('stopped');
    await computer.start();
    expect(computer.status().state).toBe('running');
    expect(exec.mock.calls.filter(([args]) => args[0] === 'start')).toHaveLength(2);
  });
});

it('routes screen frames to the requested agent and requires an explicit switch from My computer', async () => {
  const home = mkdtempSync(path.join(tmpdir(), 'gitu-desktop-http-'));
  const previousHome = process.env.AGENT_GITU_HOME;
  process.env.AGENT_GITU_HOME = home;
  const start = vi.spyOn(CoworkComputer.prototype, 'start').mockResolvedValue();
  vi.spyOn(CoworkComputer.prototype, 'desktopScreenshot').mockImplementation(async function (this: CoworkComputer) {
    return { ok: true, output: Buffer.from(this.agentId).toString('base64') };
  });
  const server = new GituServer({ passwordRequired: false, cwd: home, port: 0 });
  try {
    const base = `http://127.0.0.1:${await server.start()}`;
    async function request(route: string, body?: unknown) {
      const response = await fetch(base + route, { method: body ? 'POST' : 'GET', headers: { 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
      return { status: response.status, data: await response.json() };
    }
    const a = (await request('/api/cowork/agents', { name: 'A', systemPrompt: 'A', useHostComputer: false })).data.agent;
    const b = (await request('/api/cowork/agents', { name: 'B', systemPrompt: 'B', useHostComputer: false })).data.agent;
    const host = (await request('/api/cowork/agents', { name: 'Host', systemPrompt: 'Keep my instructions.', useHostComputer: true, allowShell: false })).data.agent;
    for (const agent of [a, b]) {
      const screen = await request(`/api/cowork/agents/${agent.id}/computer`, { action: 'desktop' });
      expect(screen.status).toBe(200);
      expect(Buffer.from(screen.data.pngBase64, 'base64').toString()).toBe(agent.id);
      expect(screen.data.computer.agentId).toBe(agent.id);
    }
    expect((await request('/api/cowork/agents/missing/computer', { action: 'desktop' })).status).toBe(404);
    expect((await request(`/api/cowork/agents/${host.id}/computer`, { action: 'desktop' })).status).toBe(409);
    expect(start).not.toHaveBeenCalled();
    const switched = await request(`/api/cowork/agents/${host.id}/computer`, { action: 'use-private' });
    expect(switched.status).toBe(202);
    expect(switched.data.agent).toMatchObject({ id: host.id, useHostComputer: false, allowShell: false, systemPrompt: 'Keep my instructions.' });
    expect(start).toHaveBeenCalledOnce();
  } finally {
    await server.stop(); vi.restoreAllMocks();
    if (previousHome === undefined) delete process.env.AGENT_GITU_HOME; else process.env.AGENT_GITU_HOME = previousHome;
    rmSync(home, { recursive: true, force: true });
  }
});
