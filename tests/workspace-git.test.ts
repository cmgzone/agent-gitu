import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createServer, type Server } from 'node:http';
import { execFile, execFileSync } from 'node:child_process';
import { promisify } from 'node:util';
import { afterEach, expect, it, vi } from 'vitest';
import { WorkspaceGitBridge } from '../src/cowork/workspace-git.js';
import { COWORK_COMPUTER_IMAGE, CoworkComputer, type ComputerExec } from '../src/cowork/computer.js';
import { ConnectionRegistry } from '../src/connections/connections.js';
import { ensureGituHome } from '../src/workspace/home.js';

const run = promisify(execFile), roots: string[] = [], servers: Server[] = [];
const previousHome = process.env.AGENT_GITU_HOME;
function folder() { const root = mkdtempSync(path.join(tmpdir(), 'gitu-git-')); roots.push(root); return root; }
afterEach(async () => {
  vi.restoreAllMocks();
  for (const server of servers.splice(0)) { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); }
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
  if (previousHome === undefined) delete process.env.AGENT_GITU_HOME; else process.env.AGENT_GITU_HOME = previousHome;
});

async function setup() {
  const bridge = new WorkspaceGitBridge(), computer = new CoworkComputer('fixture', folder());
  const configure = vi.spyOn(computer, 'configureGit').mockResolvedValue();
  const repositories = vi.fn(() => ['owner/repository']);
  const request = vi.fn(async () => new Response('fixture', { headers: { 'content-type': 'application/x-git-upload-pack-advertisement' } }));
  const connections = { githubGitRepositories: repositories, githubGitRequest: request } as unknown as ConnectionRegistry;
  let enabled = true, write = true;
  await bridge.prepare(computer, 'https://gitu.example', () => enabled ? { connections, write } : undefined);
  const config = configure.mock.calls[0]![0], token = /Bearer ([a-f0-9]+)/.exec(config)![1]!;
  const server = createServer((req, res) => { void bridge.route(req, res).then(handled => { if (!handled) { res.writeHead(404); res.end(); } }); });
  servers.push(server); await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  const base = origin + '/api/workspace-git/' + computer.name + '/';
  return { bridge, computer, configure, config, token, server, origin, base, repositories, request, setEnabled: (value: boolean) => { enabled = value; }, setWrite: (value: boolean) => { write = value; } };
}

it('requires the workspace capability and rejects unassigned repositories and arbitrary proxy routes', async () => {
  const s = await setup(), route = s.base + 'owner/repository.git/info/refs?service=git-upload-pack';
  expect((await fetch(route)).status).toBe(401);
  expect((await fetch(route, { headers: { authorization: 'Bearer incorrect' } })).status).toBe(401);
  const headers = { authorization: 'Bearer ' + s.token };
  expect((await fetch(route, { headers })).status).toBe(200);
  expect(s.request).toHaveBeenCalledWith('owner/repository', 'info/refs?service=git-upload-pack', expect.anything());
  expect((await fetch(s.base + 'other/repository.git/info/refs?service=git-upload-pack', { headers })).status).toBe(403);
  expect((await fetch(s.base + 'owner/repository.git/../api/user', { headers })).status).toBe(404);
  expect(s.request).toHaveBeenCalledTimes(1);
});

it('rechecks access, writes, and repository grants on every request', async () => {
  const s = await setup(), headers = { authorization: 'Bearer ' + s.token };
  s.setWrite(false);
  expect((await fetch(s.base + 'owner/repository.git/info/refs?service=git-receive-pack', { headers })).status).toBe(403);
  s.repositories.mockReturnValue([]);
  expect((await fetch(s.base + 'owner/repository/info/refs?service=git-upload-pack', { headers })).status).toBe(403);
  s.repositories.mockReturnValue(['owner/repository']); s.setEnabled(false);
  expect((await fetch(s.base + 'owner/repository/info/refs?service=git-upload-pack', { headers })).status).toBe(403);
  expect(s.request).not.toHaveBeenCalled();
});

it('does not forward redirects, cookies, or provider error text', async () => {
  const s = await setup(), headers = { authorization: 'Bearer ' + s.token };
  s.request.mockResolvedValue(new Response('secret provider text', { status: 302, headers: { location: 'https://evil.example', 'set-cookie': 'secret=provider' } }));
  const result = await fetch(s.base + 'owner/repository.git/info/refs?service=git-upload-pack', { headers, redirect: 'manual' });
  expect(result.status).toBe(502); expect(result.headers.get('location')).toBeNull(); expect(result.headers.get('set-cookie')).toBeNull();
  expect(await result.text()).not.toContain('secret');
});

it('uses only saved repository grants, keeps credentials on the host, and respects registry scopes', async () => {
  process.env.AGENT_GITU_HOME = folder(); ensureGituHome();
  const connections = new ConnectionRegistry();
  const profile = connections.save({ id: 'github', provider: 'github', label: 'GitHub', baseUrl: 'https://api.github.com', token: 'provider-secret-fixture', capabilities: ['repositories.read'],
    operations: [{ id: 'read-repo', label: 'Read repo', capability: 'repositories.read', method: 'GET', path: '/repos/Owner/Repository', risk: 'read' }] });
  expect(connections.githubGitRepositories()).toEqual(['owner/repository']);
  expect(connections.scoped(() => false).githubGitRepositories()).toEqual([]);
  const mock = vi.fn(async () => new Response('git', { headers: { 'content-type': 'application/x-git-upload-pack-result' } }));
  vi.stubGlobal('fetch', mock);
  try {
    await connections.githubGitRequest('owner/repository', 'git-upload-pack', { method: 'POST' });
    expect(mock.mock.calls[0]![0]).toBe('https://github.com/owner/repository.git/git-upload-pack');
    const init = mock.mock.calls[0]![1] as RequestInit;
    expect(new Headers(init.headers).get('authorization')).toBe('Basic ' + Buffer.from('x-access-token:provider-secret-fixture').toString('base64'));
    expect(init.redirect).toBe('manual');
    await expect(connections.scoped(id => id !== profile.id).githubGitRequest('owner/repository', 'git-upload-pack', {})).rejects.toThrow('not assigned');
    await expect(connections.githubGitRequest('owner/repository', '../api', {})).rejects.toThrow('not assigned');
  } finally { vi.unstubAllGlobals(); }
});

it('real Git clones, fetches and pushes through the bridge without placing a provider token in the workspace', async () => {
  const s = await setup(), root = folder(), bare = path.join(root, 'remote.git'), seed = path.join(root, 'seed'), clone = path.join(root, 'clone');
  execFileSync('git', ['init', '--bare', bare], { windowsHide: true, stdio: 'ignore' });
  mkdirSync(seed); execFileSync('git', ['init', seed], { windowsHide: true, stdio: 'ignore' });
  writeFileSync(path.join(seed, 'hello.txt'), 'hello\n');
  const gitEnv = { ...process.env, GIT_CONFIG_GLOBAL: path.join(root, 'gitconfig'), GIT_CONFIG_NOSYSTEM: '1', GIT_TERMINAL_PROMPT: '0', GIT_AUTHOR_NAME: 'Fixture', GIT_AUTHOR_EMAIL: 'fixture@example.test', GIT_COMMITTER_NAME: 'Fixture', GIT_COMMITTER_EMAIL: 'fixture@example.test' };
  execFileSync('git', ['-C', seed, 'add', '.'], { env: gitEnv, windowsHide: true });
  execFileSync('git', ['-C', seed, 'commit', '-m', 'fixture'], { env: gitEnv, windowsHide: true, stdio: 'ignore' });
  execFileSync('git', ['-C', seed, 'push', bare, 'HEAD:refs/heads/main'], { env: gitEnv, windowsHide: true, stdio: 'ignore' });
  execFileSync('git', ['--git-dir', bare, 'symbolic-ref', 'HEAD', 'refs/heads/main'], { windowsHide: true });
  writeFileSync(gitEnv.GIT_CONFIG_GLOBAL, s.config.replaceAll('https://gitu.example', s.origin));
  s.request.mockImplementation(async (_repository: string, suffix: string, init: RequestInit) => {
    const discovery = suffix.startsWith('info/refs'), service = suffix.includes('receive') ? 'receive' : 'upload';
    const chunks: Buffer[] = []; if (init.body) for await (const chunk of init.body as unknown as AsyncIterable<Buffer>) chunks.push(chunk);
    const output = execFileSync('git', [service + '-pack', '--stateless-rpc', ...(discovery ? ['--advertise-refs'] : []), bare], { input: Buffer.concat(chunks), windowsHide: true });
    const text = '# service=git-' + service + '-pack\n';
    const data = discovery ? Buffer.concat([Buffer.from((Buffer.byteLength(text) + 4).toString(16).padStart(4, '0') + text + '0000'), output]) : output;
    return new Response(data, { headers: { 'content-type': `application/x-git-${service}-pack-${discovery ? 'advertisement' : 'result'}` } });
  });
  const git = (args: string[]) => run('git', args, { env: gitEnv, windowsHide: true });
  await git(['clone', 'https://github.com/owner/repository.git', clone]);
  expect(readFileSync(path.join(clone, 'hello.txt'), 'utf8')).toBe('hello\n');
  await git(['-C', clone, 'fetch', 'origin']);
  writeFileSync(path.join(clone, 'hello.txt'), 'updated\n');
  await git(['-C', clone, 'commit', '-am', 'update']); await git(['-C', clone, 'push', 'origin', 'HEAD:main']);
  expect(execFileSync('git', ['--git-dir', bare, 'show', 'main:hello.txt'], { encoding: 'utf8', windowsHide: true })).toBe('updated\n');
  expect(s.config).not.toContain('provider-secret');
  s.setWrite(false); await expect(git(['-C', clone, 'push', '--dry-run', 'origin', 'HEAD:main'])).rejects.toThrow();
}, 30_000);

it('passes configuration through stdin and does not embed workspace capability data in process arguments', async () => {
  const exec = vi.fn<ComputerExec>().mockResolvedValue('');
  const computer = new CoworkComputer('fresh', folder(), exec);
  await computer.configureGit('private capability');
  expect(exec.mock.calls[0]![0].join(' ')).not.toContain('private capability');
  expect(exec.mock.calls[0]![1]).toBe('private capability');
});

it('prepares Git on new workspace startup and before commands, including after restart', async () => {
  let exists = false;
  const events: string[] = [];
  const exec = vi.fn<ComputerExec>(async (args, input) => {
    if (args.includes('{{.Config.Image}}')) { if (!exists) throw Error('No container'); return COWORK_COMPUTER_IMAGE; }
    if (args.includes('{{.State.Status}}')) return 'exited';
    if (args[0] === 'create') exists = true;
    if (args[0] === 'exec') { events.push('command'); return JSON.stringify({ ok: true, output: JSON.parse(input!).tool }); }
    return '';
  });
  const prepareGit = vi.fn(async () => { events.push('prepare'); });
  const computer = new CoworkComputer('brand-new', folder(), exec, { key: 'fixture', prepareGit });
  expect((await computer.execute('run_command', { command: 'git fetch' })).ok).toBe(true);
  expect(exec.mock.calls.some(([args]) => args[0] === 'create')).toBe(true);
  expect(events).toEqual(['prepare', 'prepare', 'command']);
  expect(computer.runtimeGeneration).toBe(1);
  await computer.stop(); await computer.start();
  expect(computer.runtimeGeneration).toBe(2); expect(prepareGit).toHaveBeenCalledTimes(3);
});
