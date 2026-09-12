import * as fs from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import { EventEmitter } from 'node:events';
import { afterAll, describe, expect, it, vi } from 'vitest';

const root = fs.mkdtempSync(path.join(tmpdir(), 'computer-service-'));
const source = fs.readFileSync(new URL('../assets/cowork-computer/server.cjs', import.meta.url), 'utf8');
const nodeRequire = createRequire(import.meta.url);
afterAll(() => fs.rmSync(root, { recursive: true, force: true }));

/** Run the actual container service against temporary files and a browser
 * double. Docker integration is tested separately when Docker is available. */
function service(name: string, processMock?: { spawn: (...args: any[]) => any; kill: (...args: any[]) => any }) {
  const workspace = path.join(root, name);
  fs.mkdirSync(workspace);
  const translate = (p: string) => (p.startsWith('/workspace') ? path.join(workspace, p.slice('/workspace'.length)) : path.join(root, name + '-key'));
  const files = {
    ...fs,
    existsSync: (p: string) => fs.existsSync(translate(p)),
    readFileSync: (p: string, ...args: any[]) => (fs.readFileSync as any)(translate(p), ...args),
    writeFileSync: (p: string, ...args: any[]) => (fs.writeFileSync as any)(translate(p), ...args),
    statSync: (p: string) => fs.statSync(translate(p)),
    mkdirSync: (p: string, options: any) => fs.mkdirSync(translate(p), options),
    readdirSync: (p: string, options: any) => fs.readdirSync(translate(p), options),
    realpathSync: (p: string) => {
      const real = fs.realpathSync(translate(p));
      const relative = path.relative(workspace, real);
      return !relative.startsWith('..') && !path.isAbsolute(relative) ? '/workspace' + (relative ? '/' + relative.replaceAll('\\', '/') : '') : real;
    },
  };
  let url = 'about:blank';
  const page = {
    setDefaultTimeout: vi.fn(),
    goto: vi.fn(async (next: string) => {
      url = next;
    }),
    url: () => url,
    title: async () => 'Private page',
    locator: () => ({ innerText: async () => 'Visible page content' }),
  };
  const launch = vi.fn(async () => ({ pages: () => [page], close: async () => {} }));
  let handler: any;
  const context: any = {
    require: (name: string) =>
      name === 'node:fs'
        ? files
        : name === 'node:path'
          ? path.posix
          : name === 'node:child_process' && processMock
            ? { spawn: processMock.spawn }
          : name === 'playwright'
            ? { chromium: { launchPersistentContext: launch } }
            : name === 'node:http'
              ? {
                  createServer: (callback: any) => {
                    handler = callback;
                    return { listen: () => {} };
                  },
                }
              : nodeRequire(name),
    Buffer,
    URL,
    setTimeout,
    clearTimeout,
    process: processMock ? { kill: processMock.kill } : process,
  };
  runInNewContext(source + '\nglobalThis.executeTool = execute;', context);
  return {
    workspace,
    launch,
    page,
    handler,
    execute: (tool: string, params: Record<string, unknown>) => context.executeTool({ id: 'test-id', tool, params }) as Promise<{ ok: boolean; output: string }>,
  };
}

describe('virtual computer service', () => {
  it('keeps an explicit background process available for logs and stop', async () => {
    const child = Object.assign(new EventEmitter(), { pid: 123, stdout: new EventEmitter(), stderr: new EventEmitter() });
    const kill = vi.fn();
    const a = service('background', { spawn: () => { queueMicrotask(() => child.emit('spawn')); return child; }, kill });
    const started = await a.execute('run_command', { command: 'npm run dev', background: true });
    expect(started.output).toContain('Background process started: test-id');
    child.stdout.emit('data', Buffer.from('Listening on port 3000'));
    const status = await a.execute('computer_process', { action: 'status', id: 'test-id' });
    expect(JSON.parse(status.output)).toMatchObject({ running: true, output: 'Listening on port 3000' });
    expect(kill).not.toHaveBeenCalled();
    await a.execute('computer_process', { action: 'stop', id: 'test-id' });
    expect(kill).toHaveBeenCalledWith(-123, 'SIGKILL');
    child.emit('close', 0);
    expect(JSON.parse((await a.execute('computer_process', { action: 'status', id: 'test-id' })).output).running).toBe(false);
  });

  it('uses private files, literal replacements and binary artifact round trips', async () => {
    const a = service('files-a');
    const b = service('files-b');
    await a.execute('write_file', { path: 'notes/report.txt', content: 'old text' });
    await a.execute('apply_edit', { path: 'notes/report.txt', oldString: 'old', newString: '$& literal' });
    expect((await a.execute('read_file', { path: 'notes/report.txt' })).output).toBe('$& literal text');
    await expect(b.execute('read_file', { path: 'notes/report.txt' })).rejects.toThrow();
    const binary = Buffer.from([0, 255, 128, 1]).toString('base64');
    await a.execute('import_file', { path: 'binary.bin', data: binary });
    expect((await a.execute('export_file', { path: 'binary.bin' })).output).toBe(binary);
    expect((await a.execute('list_files', { path: '.' })).output).toContain('notes/');
  });

  it('rejects path traversal and symlink escapes for reads and writes', async () => {
    const a = service('guard');
    const outside = path.join(root, 'outside');
    fs.mkdirSync(outside);
    fs.writeFileSync(path.join(outside, 'secret'), 'private');
    fs.symlinkSync(outside, path.join(a.workspace, 'escape'), process.platform === 'win32' ? 'junction' : 'dir');
    for (const tool of ['read_file', 'write_file', 'export_file']) {
      for (const target of ['../secret', '/etc/passwd', 'escape/secret']) {
        await expect(a.execute(tool, { path: target, content: 'changed' })).rejects.toThrow(/workspace/);
      }
    }
    expect(fs.readFileSync(path.join(outside, 'secret'), 'utf8')).toBe('private');
  });

  it('keeps separate persistent browser contexts and rejects file URLs', async () => {
    const a = service('browser-a');
    const b = service('browser-b');
    await a.execute('browse', { action: 'navigate', url: 'https://example.com/a' });
    await a.execute('browse', { action: 'navigate', url: 'https://example.com/a2' });
    await b.execute('browse', { action: 'navigate', url: 'https://example.com/b' });
    expect(a.launch).toHaveBeenCalledTimes(1);
    expect(a.page.url()).toBe('https://example.com/a2');
    expect(b.page.url()).toBe('https://example.com/b');
    await expect(a.execute('browse', { action: 'navigate', url: 'file:///etc/passwd' })).rejects.toThrow('HTTP(S)');
  });

  it('rejects unauthenticated requests before reading their body', async () => {
    const a = service('auth');
    const request = { method: 'POST', headers: {}, on: vi.fn() };
    const response = { writeHead: vi.fn(), end: vi.fn() };
    await a.handler(request, response);
    expect(response.writeHead).toHaveBeenCalledWith(403);
    expect(request.on).not.toHaveBeenCalled();
  });
});
