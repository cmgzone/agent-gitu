import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { Hermes } from '../src/agent/gitu.js';
import { ScriptedMockLlm, type LlmMessage } from '../src/llm/llm.js';
import { LspManager } from '../src/lsp/manager.js';
import { formatDiagnostics, flattenDiagnostics } from '../src/lsp/diagnostics.js';
import { detectLanguages, languageForUnknownFile, languageIdForPath } from '../src/lsp/language-detector.js';
import { DEFAULT_SERVERS, installSpecFor, ServerRegistry, resolveSpawnCommand } from '../src/lsp/server-registry.js';
import { PolicyEngine } from '../src/policy/policy.js';

const FAKE_SERVER = fileURLToPath(new URL('./helpers/fake-lsp-server.mjs', import.meta.url));
const managers: LspManager[] = [];
const tmpDirs: string[] = [];

function tmpRepo(): string {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'gitu-lsp-'));
  tmpDirs.push(dir);
  mkdirSync(path.join(dir, '.hermes'), { recursive: true });
  mkdirSync(path.join(dir, 'src'), { recursive: true });
  return dir;
}

async function shutdownAll(): Promise<void> {
  await Promise.allSettled(managers.splice(0).map((m) => m.shutdown()));
}

function rmrf(dir: string): void {
  const deadline = Date.now() + 3000;
  for (;;) {
    try {
      rmSync(dir, { recursive: true, force: true });
      return;
    } catch {
      if (Date.now() > deadline) {
        rmSync(dir, { recursive: true, force: true });
        return;
      }
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 100);
    }
  }
}

afterEach(async () => {
  await shutdownAll();
  for (const dir of tmpDirs.splice(0)) {
    rmrf(dir);
  }
});

function spawnCount(logFile: string): number {
  if (!existsSync(logFile)) return 0;
  return readFileSync(logFile, 'utf8').split('\n').filter((l) => l.startsWith('spawn:')).length;
}

function waitForPidGone(pid: number, timeoutMs = 3000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve) => {
    const poll = (): void => {
      try {
        process.kill(pid, 0);
        if (Date.now() < deadline) setTimeout(poll, 100);
        else resolve();
      } catch {
        resolve();
      }
    };
    poll();
  });
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------------------
// unit: language detection
// ---------------------------------------------------------------------------

describe('language detection', () => {
  it('maps extensions to languageIds', () => {
    expect(languageIdForPath('src/auth.ts')).toBe('typescript');
    expect(languageIdForPath('src/App.tsx')).toBe('typescriptreact');
    expect(languageIdForPath('a.js')).toBe('javascript');
    expect(languageIdForPath('a.py')).toBe('python');
    expect(languageIdForPath('a.rs')).toBe('rust');
    expect(languageIdForPath('a.go')).toBe('go');
    expect(languageIdForPath('a.java')).toBe('java');
    expect(languageIdForPath('a.cs')).toBe('csharp');
    expect(languageIdForPath('a.unknown')).toBeUndefined();
  });

  it('detects project languages from markers', () => {
    const dir = tmpRepo();
    writeFileSync(path.join(dir, 'tsconfig.json'), '{}');
    writeFileSync(path.join(dir, 'package.json'), '{}');
    const langs = detectLanguages(dir);
    expect(langs).toContain('typescript');
    expect(langs).toContain('javascript');
  });

  it('detects rust from Cargo.toml', () => {
    const dir = tmpRepo();
    writeFileSync(path.join(dir, 'Cargo.toml'), '[package]\n');
    expect(detectLanguages(dir)).toContain('rust');
  });

  it('does not infer a project language for unsupported file extensions', () => {
    const dir = tmpRepo();
    writeFileSync(path.join(dir, 'package.json'), '{}');
    expect(languageForUnknownFile(dir, 'generated.txt')).toBeUndefined();
    expect(languageForUnknownFile(dir, 'tool-without-extension')).toBe('javascript');
  });
});

// ---------------------------------------------------------------------------
// unit: server registry + config overrides
// ---------------------------------------------------------------------------

describe('server registry', () => {
  it('has defaults for common languages', () => {
    const reg = new ServerRegistry();
    expect(reg.serverForLanguage('typescript')?.command).toBe('typescript-language-server');
    expect(reg.serverForLanguage('rust')?.command).toBe('rust-analyzer');
    expect(reg.serverForLanguage('wat')).toBeUndefined();
  });

  it('lets .hermes/lsp.json override a default server by name', () => {
    const dir = tmpRepo();
    writeFileSync(
      path.join(dir, '.hermes', 'lsp.json'),
      JSON.stringify({
        servers: [{ name: 'rust', languageIds: ['rust'], command: 'node', args: [FAKE_SERVER] }],
      }),
    );
    const reg = new ServerRegistry(dir);
    const rust = reg.serverForLanguage('rust');
    expect(rust?.command).toBe('node');
    // Unrelated defaults survive.
    expect(reg.serverForLanguage('typescript')?.command).toBe('typescript-language-server');
  });

  it('ignores a malformed config file', () => {
    const dir = tmpRepo();
    writeFileSync(path.join(dir, '.hermes', 'lsp.json'), '{ not json');
    const reg = new ServerRegistry(dir);
    expect(reg.serverForLanguage('typescript')?.command).toBe('typescript-language-server');
  });

  it('resolves spawn mode: shims use a shell, real executables spawn directly', () => {
    const shim = resolveSpawnCommand({ name: 'x', languageIds: ['x'], command: 'ts-ls.cmd', args: ['--stdio'] });
    expect(shim.shell).toBe(true);
    const direct = resolveSpawnCommand({ name: 'x', languageIds: ['x'], command: 'C:\\tools\\lsp.exe' });
    expect(direct.shell).toBe(false);
    const node = resolveSpawnCommand({ name: 'x', languageIds: ['x'], command: 'node' });
    expect(node.shell).toBe(false);
    expect(node.command).toMatch(/node\.exe$/i);
    const missing = resolveSpawnCommand({ name: 'x', languageIds: ['x'], command: 'definitely-not-a-real-binary-xyz' });
    expect(missing.shell).toBe(false);
  });

  it('exposes installers only for unchanged built-in server definitions', () => {
    const typescript = DEFAULT_SERVERS.find((server) => server.name === 'typescript')!;
    expect(installSpecFor(typescript)?.label).toContain('typescript-language-server');
    expect(installSpecFor({ ...typescript, command: 'my-project-server' })).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// unit: diagnostics formatting
// ---------------------------------------------------------------------------

describe('diagnostics formatting', () => {
  it('renders a compact error line with a summary', () => {
    const out = formatDiagnostics(
      [
        { range: { start: { line: 41, character: 16 }, end: { line: 41, character: 21 } }, severity: 1, message: 'Property does not exist', code: 'TS2339' },
        { range: { start: { line: 2, character: 0 }, end: { line: 2, character: 5 } }, severity: 2, message: 'unused var' },
      ],
      'src/auth.ts',
    );
    expect(out).toContain('[ERROR] src/auth.ts:42:17 — TS2339 Property does not exist');
    expect(out).toContain('[WARNING] src/auth.ts:3:1 — unused var');
    expect(out).toContain('1 error(s), 1 warning(s)');
  });

  it('flattens preserving order; formatting sorts by line', () => {
    const flat = flattenDiagnostics(
      [
        { range: { start: { line: 5, character: 0 }, end: { line: 5, character: 1 } }, severity: 2, message: 'later' },
        { range: { start: { line: 1, character: 0 }, end: { line: 1, character: 1 } }, severity: 1, message: 'earlier' },
      ],
      'a.ts',
    );
    expect(flat.map((d) => d.line)).toEqual([6, 2]);
    const sorted = formatDiagnostics(
      [
        { range: { start: { line: 5, character: 0 }, end: { line: 5, character: 1 } }, severity: 2, message: 'later' },
        { range: { start: { line: 1, character: 0 }, end: { line: 1, character: 1 } }, severity: 1, message: 'earlier' },
      ],
      'a.ts',
    );
    expect(sorted.indexOf('a.ts:2:1')).toBeLessThan(sorted.indexOf('a.ts:6:1'));
  });
});

// ---------------------------------------------------------------------------
// unit: policy treats LSP tools as read-only
// ---------------------------------------------------------------------------

describe('LSP policy', () => {
  it('allows lsp_* tools without approval', async () => {
    const engine = new PolicyEngine(false);
    for (const tool of ['lsp_diagnostics', 'lsp_definition', 'lsp_references', 'lsp_hover', 'lsp_symbols']) {
      const decision = await engine.evaluate(tool, { path: 'a.ts', line: 1, column: 1 });
      expect(decision.allowed, tool).toBe(true);
      expect(decision.tier).toBe('safe');
    }
  });
});

// ---------------------------------------------------------------------------
// integration: manager lifecycle against a real (fake) LSP server
// ---------------------------------------------------------------------------

interface FakeCfg {
  repoRoot: string;
  logFile: string;
  pidFile: string;
  manager: LspManager;
}

function fakeSetup(opts: { crashOnFirstTd?: boolean; command?: string } = {}): FakeCfg {
  const repoRoot = tmpRepo();
  const logFile = path.join(repoRoot, '.hermes', 'spawn.log');
  const pidFile = path.join(repoRoot, '.hermes', 'pid');
  const env: Record<string, string> = { FAKE_LSP_LOG: logFile, FAKE_LSP_PID: pidFile };
  if (opts.crashOnFirstTd) env['CRASH_ON_FIRST_TD'] = '1';
  const config = {
    servers: [
      {
        name: 'rust',
        languageIds: ['rust'],
        command: opts.command ?? 'node',
        args: [FAKE_SERVER],
        env,
      },
    ],
  };
  writeFileSync(path.join(repoRoot, '.hermes', 'lsp.json'), JSON.stringify(config));
  writeFileSync(path.join(repoRoot, 'src', 'main.rs'), 'pub fn main() {}\n');
  const manager = new LspManager(repoRoot);
  managers.push(manager);
  return { repoRoot, logFile, pidFile, manager };
}

describe('LSP manager lifecycle (fake server)', () => {
  it('auto-installs a missing built-in server once for concurrent lookups', async () => {
    const repoRoot = tmpRepo();
    writeFileSync(path.join(repoRoot, 'src', 'main.ts'), 'export const answer = 42;\n');
    const bin = path.join(repoRoot, '.hermes', 'bin');
    mkdirSync(bin, { recursive: true });
    const commandPath = process.platform === 'win32' ? path.join(bin, 'typescript-language-server.cmd') : path.join(bin, 'typescript-language-server');
    const originalPath = process.env.PATH;
    const events: string[] = [];
    let installs = 0;
    try {
      // The test must start without the global TypeScript LSP, regardless of
      // which developer tools happen to be installed on this machine.
      process.env.PATH = bin;
      const manager = new LspManager(repoRoot, undefined, {
        autoInstall: true,
        onEvent: (event) => events.push(event),
        runInstaller: async () => {
          installs += 1;
          if (process.platform === 'win32') writeFileSync(commandPath, '@echo off\r\nexit /b 0\r\n');
          else {
            writeFileSync(commandPath, '#!/bin/sh\nexit 0\n');
            chmodSync(commandPath, 0o755);
          }
          return { ok: true, pathEntries: [bin] };
        },
      });
      managers.push(manager);
      const ready = (manager as unknown as { serverReadyFor(file: string): Promise<unknown> }).serverReadyFor.bind(manager);
      const [first, second] = await Promise.all([ready('src/main.ts'), ready('src/main.ts')]);
      expect(first).toBeDefined();
      expect(second).toBeDefined();
      expect(installs).toBe(1);
      expect(events.some((event) => event.includes('lsp installing typescript'))).toBe(true);
      expect(events.some((event) => event.includes('lsp ready'))).toBe(true);
    } finally {
      if (originalPath === undefined) delete process.env.PATH;
      else process.env.PATH = originalPath;
    }
  });

  it('does not execute an automatic installer for custom registry commands', async () => {
    const repoRoot = tmpRepo();
    writeFileSync(path.join(repoRoot, 'src', 'main.rs'), 'fn main() {}\n');
    writeFileSync(
      path.join(repoRoot, '.hermes', 'lsp.json'),
      JSON.stringify({ servers: [{ name: 'rust', languageIds: ['rust'], command: 'custom-rust-lsp', args: ['--stdio'] }] }),
    );
    let installs = 0;
    const manager = new LspManager(repoRoot, undefined, {
      autoInstall: true,
      runInstaller: async () => {
        installs += 1;
        return { ok: true };
      },
    });
    managers.push(manager);
    const result = await manager.diagnostics('src/main.rs');
    expect(result.ok).toBe(false);
    expect(installs).toBe(0);
    expect(result.output).toContain('LSP unavailable');
  });

  it('spawns lazily, reuses the server across requests, and shuts down cleanly', async () => {
    const { repoRoot, logFile, manager } = fakeSetup();
    const file = 'src/main.rs';
    // No process before the first request.
    expect(spawnCount(logFile)).toBe(0);

    const sym = await manager.symbols(file);
    expect(sym.ok).toBe(true);
    expect(sym.output).toContain('Function main');
    expect(spawnCount(logFile)).toBe(1);

    // Second request reuses the same server.
    const hover = await manager.hover(file, 1, 1);
    expect(hover.ok).toBe(true);
    expect(hover.output).toContain('Fake hover docs');
    expect(spawnCount(logFile)).toBe(1);

    const def = await manager.definition(file, 3, 1);
    expect(def.ok).toBe(true);
    expect(def.output).toContain('main.rs:3:1');

    const refs = await manager.references(file, 5, 1);
    expect(refs.ok).toBe(true);
    expect(refs.output).toContain('1 reference(s)');
    expect(refs.output).toContain('main.rs:5:1');

    const diag = await manager.diagnostics(file);
    expect(diag.ok).toBe(true);
    expect(diag.output).toContain('[ERROR]');
    expect(diag.output).toContain('E0001');
    expect(diag.output).toContain('1 error(s)');

    // Still one server alive after all five query types.
    expect(spawnCount(logFile)).toBe(1);

    await manager.shutdown();
    const pid = Number(readFileSync(path.join(repoRoot, '.hermes', 'pid'), 'utf8'));
    await waitForPidGone(pid);
    expect(spawnCount(logFile)).toBe(1);
  });

  it('recovers when the server process is killed: next request re-spawns and succeeds', async () => {
    const { repoRoot, logFile, pidFile, manager } = fakeSetup();
    const file = 'src/main.rs';

    const first = await manager.symbols(file);
    expect(first.ok).toBe(true);
    expect(spawnCount(logFile)).toBe(1);

    // Kill the server out from under the client.
    const pid = Number(readFileSync(pidFile, 'utf8'));
    try {
      process.kill(pid);
    } catch {
      /* already gone */
    }
    await waitForPidGone(pid);
    await sleep(300);

    // The next request must transparently recover on a fresh server.
    const second = await manager.hover(file, 1, 1);
    expect(second.ok).toBe(true);
    expect(second.output).toContain('Fake hover docs');
    expect(spawnCount(logFile)).toBe(2);
  });

  it('restarts once on a crash mid-request, then fails cleanly instead of looping forever', async () => {
    const { logFile, manager } = fakeSetup({ crashOnFirstTd: true });
    const file = 'src/main.rs';

    const diag = await manager.diagnostics(file);
    // Server #1 crashed on the request; manager restarted once; server #2
    // crashed again -> clean error, no unbounded retry, no hang.
    expect(diag.ok).toBe(false);
    expect(diag.output).toContain('exited with code');
    expect(spawnCount(logFile)).toBe(2);
  });

  it('reports unavailability with a fallback hint when the server binary is missing', async () => {
    const { manager } = fakeSetup({ command: 'definitely-not-a-real-binary-xyz' });
    const diag = await manager.diagnostics('src/main.rs');
    expect(diag.ok).toBe(false);
    expect(diag.output).toContain('LSP unavailable');
    expect(diag.output.toLowerCase()).toContain('search_files');
  });

  it('reports unavailability for unsupported file types', async () => {
    const { repoRoot, manager } = fakeSetup();
    writeFileSync(path.join(repoRoot, 'src', 'blob.wat'), '(module)');
    const diag = await manager.diagnostics('src/blob.wat');
    expect(diag.ok).toBe(false);
    expect(diag.output).toContain('LSP unavailable');
  });
});

// ---------------------------------------------------------------------------
// integration: real-world project detection wiring
// ---------------------------------------------------------------------------

describe('LSP manager — project wiring', () => {
  it('detects the project language set for a TypeScript repo', () => {
    const repoRoot = tmpRepo();
    writeFileSync(path.join(repoRoot, 'package.json'), '{"name":"x","devDependencies":{"typescript":"^5"}}');
    writeFileSync(path.join(repoRoot, 'tsconfig.json'), '{}');
    const manager = new LspManager(repoRoot);
    managers.push(manager);
    const langs = manager.projectLanguages();
    expect(langs).toContain('typescript');
    expect(langs).toContain('javascript');
  });
});

// ---------------------------------------------------------------------------
// integration: Hermes LSP post-edit diagnostics gate
// ---------------------------------------------------------------------------

function makeHermesProject(name: string, withFakeLsp: boolean): string {
  const dir = mkdtempSync(path.join(os.tmpdir(), `hermes-lsp-${name}-`));
  tmpDirs.push(dir);
  writeFileSync(
    path.join(dir, 'package.json'),
    JSON.stringify({ name: `e2e-${name}`, scripts: { test: 'node --version' } }, null, 2),
  );
  mkdirSync(path.join(dir, 'src'), { recursive: true });
  if (withFakeLsp) {
    mkdirSync(path.join(dir, '.hermes'), { recursive: true });
    writeFileSync(
      path.join(dir, '.hermes', 'lsp.json'),
      JSON.stringify({
        servers: [{ name: 'rust', languageIds: ['rust'], command: 'node', args: [FAKE_SERVER] }],
      }),
    );
  }
  return dir;
}

function lastUserText(messages: LlmMessage[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i]!;
    if (m.role === 'user' && typeof m.content === 'string') return m.content;
  }
  return '';
}

function findEvidenceId(messages: LlmMessage[]): string {
  const match = lastUserText(messages).match(/(ev-\d{8}-[0-9a-f]{6})/);
  return match?.[1] ?? 'ev-missing';
}

function editTaskLlm(seen: string[], writePath: string, writeContent: string): ScriptedMockLlm {
  const capture = (fn: (n: number, messages: LlmMessage[]) => string) => (n: number, messages: LlmMessage[]) => {
    for (const m of messages) {
      if (m.role === 'user' && typeof m.content === 'string') seen.push(m.content);
    }
    return fn(n, messages);
  };
  return new ScriptedMockLlm([
    capture(() =>
      JSON.stringify({ thought: 'criteria', action: { type: 'set_criteria', criteria: ['file exists', 'verification command passes'] } }),
    ),
    capture(() =>
      JSON.stringify({ thought: 'plan', action: { type: 'set_plan', steps: [{ description: 'write file', verification: 'node --version' }] } }),
    ),
    capture(() =>
      JSON.stringify({
        thought: 'write the file',
        action: { type: 'tool_call', stepId: 'step-1', tool: 'write_file', params: { path: writePath, content: writeContent }, reason: 'criterion requires it', expected: 'file created' },
      }),
    ),
    capture(() =>
      JSON.stringify({
        thought: 'verify',
        action: { type: 'tool_call', stepId: 'step-1', tool: 'run_command', params: { command: 'node --version' }, reason: 'verification', expected: 'exit 0' },
      }),
    ),
    capture((_n, messages) =>
      JSON.stringify({ thought: 'claim', action: { type: 'claim_criterion', criterionId: 'ac-1', evidenceId: findEvidenceId(messages) } }),
    ),
    capture((_n, messages) =>
      JSON.stringify({ thought: 'claim', action: { type: 'claim_criterion', criterionId: 'ac-2', evidenceId: findEvidenceId(messages) } }),
    ),
    capture(() => JSON.stringify({ thought: 'done', action: { type: 'complete', summary: 'done', risks: [], followUps: [] } })),
  ]);
}

describe('Hermes LSP post-edit diagnostics gate', () => {
  it('surfaces diagnostics for the edited file when a language server is available', async () => {
    const dir = makeHermesProject('gate', true);
    const events: string[] = [];
    const seen: string[] = [];
    const llm = editTaskLlm(seen, 'src/main.rs', 'pub fn greet() {}\n');
    const hermes = new Hermes({ cwd: dir, llm, mode: 'fast', onEvent: (e) => events.push(e) });
    const { report } = await hermes.run('Create a rust module');

    expect(report.status).toBe('complete');
    expect(events.some((e) => e.includes('post-edit diagnostics'))).toBe(true);
    const note = seen.find((s) => s.includes('LSP DIAGNOSTICS (post-edit check)'));
    expect(note).toBeDefined();
    expect(note).toContain('[ERROR] src/main.rs:1:1');
    expect(note).toContain('E0001 fake error');
  }, 30000);

  it('stays silent for files with no language server (LSP remains optional)', async () => {
    const dir = makeHermesProject('nogate', false);
    const events: string[] = [];
    const seen: string[] = [];
    const llm = editTaskLlm(seen, 'src/blob.xyz', 'not code');
    const hermes = new Hermes({ cwd: dir, llm, mode: 'fast', onEvent: (e) => events.push(e) });
    const { report } = await hermes.run('Create a blob file');

    expect(report.status).toBe('complete');
    expect(events.some((e) => e.includes('post-edit diagnostics'))).toBe(false);
    expect(seen.some((s) => s.includes('LSP DIAGNOSTICS (post-edit check)'))).toBe(false);
  }, 30000);
});
