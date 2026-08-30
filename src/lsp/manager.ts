import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { LspClient } from './client.js';
import { DiagnosticsCache, formatDiagnostics, formatLocation } from './diagnostics.js';
import { detectLanguages, languageForUnknownFile, languageIdForPath } from './language-detector.js';
import { installSpecFor, resolveSpawn, serverBinaryAvailable, ServerRegistry } from './server-registry.js';
import type { LspCall, LspDiagnostic, LspInstallSpec, LspPosition, LspServerConfig, LspStatusView, LspSymbol } from './lsp-types.js';

export interface LspInstallRequest {
  server: LspServerConfig;
  spec: LspInstallSpec;
  command: string;
}

export interface LspInstallResult {
  ok: boolean;
  output?: string;
  /** Optional executable directories supplied by a test/custom installer. */
  pathEntries?: string[];
}

export interface LspManagerOptions {
  /** Attempt a trusted built-in installer when a default server is missing. */
  autoInstall?: boolean;
  /** Optional approval hook. Returning false leaves the normal fallback path. */
  approveInstall?: (request: LspInstallRequest) => Promise<boolean> | boolean;
  /** Injectable installer for tests or an application-specific package manager. */
  runInstaller?: (request: LspInstallRequest) => Promise<LspInstallResult>;
  /** Receives short progress messages suitable for the run event stream. */
  onEvent?: (text: string) => void;
  /** Maximum time allowed for one package-manager invocation. */
  installTimeoutMs?: number;
}

/**
 * LspManager — language-server lifecycle + agent-facing intelligence queries.
 *
 * Spawns one LSP client per configured server (lazily, on first use), keeps the
 * server alive for the whole session, maps a file to its languageId, syncs the
 * document contents, and answers the queries the agent actually needs to plan
 * and verify edits:
 *
 *   - diagnostics: compiler/type errors for a file (pull model with a
 *     push-notification fallback for older servers)
 *   - definition / references / symbols / hover: navigation + outline + docs
 *
 * Reliability contract (LSP is an optional intelligence service):
 *   - a dead/crashed server is restarted once and the request retried
 *   - a missing built-in server can be installed once on first use when enabled
 *   - if no server is configured or installed, tools report unavailability so
 *     the agent falls back to search_files / read_file
 *   - every request carries a timeout; malformed frames are ignored
 *
 * Servers are configured in `.hermes/lsp.json`; without it, built-in defaults
 * are used whenever the binary is on PATH.
 */

interface NormalizedLocation {
  uri: string;
  range: { start: LspPosition; end: LspPosition } | undefined;
}

const CONNECTION_ERROR_RE = /exited with code|ENOENT|timed out|ECONN|EPIPE|socket closed|write after end|spawn .* ENOENT/i;
const MAX_INSTALL_OUTPUT = 12_000;

interface ProcessResult {
  ok: boolean;
  output: string;
  stdout: string;
}

function runProcess(program: string, args: string[], cwd: string, timeoutMs: number): Promise<ProcessResult> {
  return new Promise((resolve) => {
    const resolved = resolveSpawn(program, args);
    let output = '';
    let stdout = '';
    let settled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const finish = (result: ProcessResult): void => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      resolve(result);
    };
    let child: ReturnType<typeof spawn>;
    try {
      child = spawn(resolved.command, resolved.args, {
        cwd,
        stdio: ['ignore', 'pipe', 'pipe'],
        env: process.env,
        shell: resolved.shell,
        windowsHide: true,
      });
    } catch (err) {
      finish({ ok: false, output: (err as Error).message, stdout: '' });
      return;
    }
    const append = (chunk: Buffer | string, isStdout: boolean): void => {
      const text = String(chunk);
      output = (output + text).slice(-MAX_INSTALL_OUTPUT);
      if (isStdout) stdout = (stdout + text).slice(-MAX_INSTALL_OUTPUT);
    };
    child.stdout?.on('data', (chunk: Buffer | string) => append(chunk, true));
    child.stderr?.on('data', (chunk: Buffer | string) => append(chunk, false));
    child.once('error', (err) => finish({ ok: false, output: `${output}\n${err.message}`.trim(), stdout }));
    child.once('close', (code, signal) =>
      finish({
        ok: code === 0,
        output: `${output}${signal ? `\nterminated by ${signal}` : ''}`.trim(),
        stdout,
      }),
    );
    timer = setTimeout(() => {
      try {
        child.kill();
      } catch {
        /* already exited */
      }
      finish({ ok: false, output: `${output}\ninstaller timed out after ${timeoutMs}ms`.trim(), stdout });
    }, timeoutMs);
  });
}

function isConnectionError(err: Error): boolean {
  return CONNECTION_ERROR_RE.test(err.message) || (err as { code?: string }).code === 'ENOENT';
}

function normalizeLocations(result: unknown): NormalizedLocation[] {
  if (!result) return [];
  const arr = Array.isArray(result) ? result : [result];
  const out: NormalizedLocation[] = [];
  for (const raw of arr) {
    const item = raw as {
      uri?: string;
      targetUri?: string;
      range?: { start: LspPosition; end: LspPosition };
      targetSelectionRange?: { start: LspPosition; end: LspPosition };
    };
    const uri = item.targetUri ?? item.uri ?? '';
    if (!uri) continue;
    out.push({ uri, range: item.targetSelectionRange ?? item.range });
  }
  return out;
}

function formatHoverContents(contents: unknown): string {
  if (typeof contents === 'string') return contents;
  if (Array.isArray(contents)) return contents.map((c) => formatHoverContents(c)).join('\n');
  if (contents && typeof contents === 'object') {
    const c = contents as { value?: unknown; language?: unknown; kind?: unknown };
    if (typeof c.value === 'string') {
      return typeof c.language === 'string' && c.language ? `\`\`\`${c.language}\n${c.value}\n\`\`\`` : c.value;
    }
  }
  return JSON.stringify(contents, null, 2);
}

function normalizeSymbols(result: unknown): LspSymbol[] {
  if (!Array.isArray(result)) return [];
  return result.map((raw) => {
    const item = raw as {
      name?: string;
      kind?: number;
      range?: LspSymbol['range'];
      selectionRange?: LspSymbol['selectionRange'];
      location?: { range: LspSymbol['range'] };
      children?: LspSymbol[];
    };
    return {
      name: item.name ?? '?',
      kind: item.kind ?? 0,
      range: item.range ?? item.location?.range ?? { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } },
      selectionRange: item.selectionRange ?? item.range ?? item.location?.range ?? { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } },
      children: item.children,
    };
  });
}

const SYMBOL_KIND: Record<number, string> = {
  1: 'File',
  2: 'Module',
  3: 'Namespace',
  4: 'Package',
  5: 'Class',
  6: 'Method',
  7: 'Property',
  8: 'Field',
  9: 'Constructor',
  10: 'Enum',
  11: 'Interface',
  12: 'Function',
  13: 'Variable',
  14: 'Constant',
  15: 'String',
  16: 'Number',
  17: 'Boolean',
  18: 'Array',
  19: 'Object',
  20: 'Key',
  21: 'Null',
  22: 'EnumMember',
  23: 'Struct',
  24: 'Event',
  25: 'Operator',
  26: 'TypeParameter',
};

function renderSymbolTree(symbols: LspSymbol[], indent = 0): string {
  const out: string[] = [];
  for (const s of symbols) {
    const label = SYMBOL_KIND[s.kind] ?? 'Symbol';
    out.push(`${'  '.repeat(indent)}${label} ${s.name} (line ${s.range.start.line + 1})`);
    if (s.children?.length) out.push(renderSymbolTree(s.children, indent + 1));
  }
  return out.join('\n');
}

export class LspManager {
  private readonly clients = new Map<string, LspClient>();
  private readonly diags = new DiagnosticsCache();
  private readonly versions = new Map<string, number>();
  /** Per-URI serialization chains for document syncs. */
  private readonly syncChains = new Map<string, Promise<string>>();
  /** A missing server is installed at most once, even when queries run in parallel. */
  private readonly installPromises = new Map<string, Promise<boolean>>();
  readonly registry: ServerRegistry;

  constructor(
    private readonly repoRoot: string,
    registry?: ServerRegistry,
    private readonly options: LspManagerOptions = {},
  ) {
    this.registry = registry ?? new ServerRegistry(repoRoot);
  }

  private emit(text: string): void {
    try {
      this.options.onEvent?.(text);
    } catch {
      /* progress reporting must never break an LSP request */
    }
  }

  private async pathEntriesAfterInstall(spec: LspInstallSpec): Promise<string[]> {
    const entries: string[] = [];
    const home = os.homedir();
    const add = (entry: string | undefined): void => {
      const normalized = entry?.trim();
      if (normalized && !entries.includes(normalized)) entries.push(normalized);
    };
    if (spec.pathHint === 'npm-global') {
      add(path.join(process.env.APPDATA ?? path.join(home, 'AppData', 'Roaming'), 'npm'));
      const prefix = await runProcess('npm', ['prefix', '--global'], this.repoRoot, 10_000);
      if (prefix.ok) add(process.platform === 'win32' ? prefix.stdout.trim() : path.join(prefix.stdout.trim(), 'bin'));
    } else if (spec.pathHint === 'python-user') {
      const scripts = await runProcess(
        'python',
        ['-c', "import os,sysconfig; print(sysconfig.get_path('scripts', scheme='nt_user' if os.name == 'nt' else 'posix_user'))"],
        this.repoRoot,
        10_000,
      );
      if (scripts.ok) add(scripts.stdout.trim());
    } else if (spec.pathHint === 'go-bin') {
      const goEnv = await runProcess('go', ['env', 'GOBIN', 'GOPATH'], this.repoRoot, 10_000);
      if (goEnv.ok) {
        const [gobin, gopath] = goEnv.stdout.split(/\r?\n/).map((value) => value.trim());
        add(gobin);
        if (gopath) add(path.join(gopath, 'bin'));
      }
    } else if (spec.pathHint === 'cargo-bin') {
      add(path.join(home, '.cargo', 'bin'));
    } else if (spec.pathHint === 'dotnet-tools') {
      add(path.join(home, '.dotnet', 'tools'));
    }
    return entries;
  }

  private addPathEntries(entries: string[]): void {
    if (entries.length === 0) return;
    const current = process.env.PATH ?? process.env.Path ?? '';
    const parts = current.split(path.delimiter).filter(Boolean);
    const merged = [...entries, ...parts.filter((entry) => !entries.includes(entry))];
    process.env.PATH = merged.join(path.delimiter);
  }

  private async installServer(config: LspServerConfig): Promise<boolean> {
    const spec = installSpecFor(config);
    if (!spec) return false;
    const request: LspInstallRequest = { server: config, spec, command: spec.label };
    if (this.options.approveInstall && !(await this.options.approveInstall(request))) {
      this.emit(`lsp install denied for ${config.name}`);
      return false;
    }
    this.emit(`lsp installing ${config.name} — ${spec.label}`);
    let result: LspInstallResult;
    if (this.options.runInstaller) {
      try {
        result = await this.options.runInstaller(request);
      } catch (err) {
        result = { ok: false, output: (err as Error).message };
      }
    } else {
      const processResult = await runProcess(spec.program, spec.args, this.repoRoot, this.options.installTimeoutMs ?? 180_000);
      result = { ok: processResult.ok, output: processResult.output };
      if (processResult.ok) this.addPathEntries(await this.pathEntriesAfterInstall(spec));
    }
    if (!result.ok) {
      const detail = result.output ? `: ${result.output.split(/\r?\n/).filter(Boolean).slice(-2).join(' | ')}` : '';
      this.emit(`lsp install failed for ${config.name}${detail}`);
      return false;
    }
    this.addPathEntries(result.pathEntries ?? []);
    const available = serverBinaryAvailable(config);
    if (available) this.emit(`lsp ready — ${config.name} (${config.command})`);
    else this.emit(`lsp installed ${config.name}, but ${config.command} is still not on PATH`);
    return available;
  }

  private ensureInstalled(config: LspServerConfig): Promise<boolean> {
    const previous = this.installPromises.get(config.name);
    if (previous) return previous;
    const current = this.installServer(config).catch(() => false);
    this.installPromises.set(config.name, current);
    return current;
  }

  // ---- lifecycle ---------------------------------------------------------

  private makeClient(config: LspServerConfig): LspClient {
    const client = new LspClient(config, this.repoRoot);
    client.onNotification = (method, params) => {
      if (method === 'textDocument/publishDiagnostics') {
        const p = params as { uri?: string; diagnostics?: LspDiagnostic[] };
        if (p.uri) this.diags.set(p.uri, p.diagnostics ?? []);
      }
    };
    return client;
  }

  private clientFor(languageId: string): LspClient | undefined {
    const config = this.registry.serverForLanguage(languageId);
    if (!config) return undefined;
    let client = this.clients.get(config.name);
    if (!client) {
      client = this.makeClient(config);
      this.clients.set(config.name, client);
    }
    return client;
  }

  private async restart(serverName: string): Promise<LspClient> {
    const old = this.clients.get(serverName);
    if (old) {
      try {
        await old.shutdown();
      } catch {
        /* already gone */
      }
      this.clients.delete(serverName);
    }
    const config = this.registry.serversList().find((s) => s.name === serverName);
    if (!config) throw new Error(`LSP server "${serverName}" is no longer registered`);
    const client = this.makeClient(config);
    this.clients.set(serverName, client);
    return client;
  }

  private async syncDocument(client: LspClient, file: string, languageId: string): Promise<string> {
    const abs = path.join(this.repoRoot, file);
    const uri = pathToFileURL(abs).href;
    const text = existsSync(abs) ? readFileSync(abs, 'utf8') : '';
    const version = (this.versions.get(uri) ?? 0) + 1;
    // The document is about to change server-side: any cached push-model
    // diagnostics are for a pre-edit version and must not be served again.
    this.diags.invalidate(uri);
    if (version === 1) {
      await client.openDocument(uri, languageId, text, version);
    } else {
      await client.changeDocument(uri, text, version);
    }
    this.versions.set(uri, version);
    return uri;
  }

  /**
   * Serialize document syncs per URI. Two concurrent queries on one file would
   * otherwise both compute version N+1 and send duplicate didOpen
   * notifications (a protocol violation) or out-of-order didChange versions.
   */
  private syncDocumentSerialized(client: LspClient, file: string, languageId: string): Promise<string> {
    const abs = path.join(this.repoRoot, file);
    const uri = pathToFileURL(abs).href;
    const prev = this.syncChains.get(uri) ?? Promise.resolve();
    const next = prev.catch(() => {}).then(() => this.syncDocument(client, file, languageId));
    this.syncChains.set(uri, next);
    if (this.syncChains.size > 128) {
      const oldest = this.syncChains.keys().next().value;
      if (oldest && oldest !== uri) this.syncChains.delete(oldest);
    }
    return next;
  }

  /** Run a query against the right server, restarting a crashed server once. */
  private async withServer<T>(languageId: string, file: string, fn: (client: LspClient, uri: string) => Promise<T>): Promise<T> {
    const config = this.registry.serverForLanguage(languageId);
    if (!config) throw new Error(`No LSP server configured for language "${languageId}"`);
    const client = this.clientFor(languageId)!;
    try {
      const uri = await this.syncDocumentSerialized(client, file, languageId);
      return await fn(client, uri);
    } catch (err) {
      if (!isConnectionError(err as Error)) throw err;
      const fresh = await this.restart(config.name);
      const uri = await this.syncDocument(fresh, file, languageId);
      return fn(fresh, uri);
    }
  }

  private languageIdFor(file: string): string | undefined {
    return languageIdForPath(file) ?? languageForUnknownFile(this.repoRoot, file);
  }

  private async serverReadyFor(file: string): Promise<{ languageId: string; config: LspServerConfig } | undefined> {
    const languageId = this.languageIdFor(file);
    if (!languageId) return undefined;
    const config = this.registry.serverForLanguage(languageId);
    if (!config) return undefined;
    if (!serverBinaryAvailable(config) && this.options.autoInstall) await this.ensureInstalled(config);
    if (!serverBinaryAvailable(config)) return undefined;
    return { languageId, config };
  }

  private unavailable(file: string): string {
    const languageId = this.languageIdFor(file);
    const config = languageId ? this.registry.serverForLanguage(languageId) : undefined;
    const hint = languageId
      ? config
        ? `server "${config.command}" is not installed on PATH`
        : `no server is configured for language "${languageId}"`
      : `language for "${file}" is not supported`;
    const installHint = config && installSpecFor(config) && !this.options.autoInstall ? ' Enable automatic LSP installation to bootstrap it.' : '';
    return `LSP unavailable: ${hint}.${installHint} Fall back to search_files / read_file.`;
  }

  // ---- status ------------------------------------------------------------

  /** One row per registered server. */
  status(): LspStatusView[] {
    return this.registry.serversList().map((s) => ({
      server: s.name,
      languageIds: s.languageIds,
      configured: serverBinaryAvailable(s),
      running: Boolean(this.clients.get(s.name)?.isRunning()),
    }));
  }

  /** Whether LSP is usable now or can be bootstrapped on first request. */
  hasServers(): boolean {
    return this.registry.serversList().some((s) => serverBinaryAvailable(s) || (this.options.autoInstall === true && Boolean(installSpecFor(s))));
  }

  /** Languages detected from project markers (package.json, Cargo.toml, ...). */
  projectLanguages(): string[] {
    return detectLanguages(this.repoRoot);
  }

  // ---- queries -----------------------------------------------------------

  async diagnostics(file: string): Promise<LspCall> {
    const ready = await this.serverReadyFor(file);
    if (!ready) return { ok: false, output: this.unavailable(file), errorSignature: 'lsp-unavailable' };
    try {
      const items = await this.withServer(ready.languageId, file, async (client, uri) => {
        if (client.supportsPullDiagnostics()) {
          return client.pullDiagnostics(uri);
        }
        // Push-model fallback: wait briefly for publishDiagnostics after open.
        const deadline = Date.now() + 2000;
        for (;;) {
          const cached = this.diags.get(uri);
          if (cached) return cached;
          if (Date.now() >= deadline) return this.diags.get(uri) ?? [];
          await new Promise((r) => setTimeout(r, 100));
        }
      });
      return { ok: true, output: formatDiagnostics(items, file), payload: items };
    } catch (err) {
      return { ok: false, output: `LSP diagnostics failed: ${(err as Error).message}. Use read_file/search_files instead.`, errorSignature: 'lsp-error' };
    }
  }

  async definition(file: string, line: number, column: number): Promise<LspCall> {
    const ready = await this.serverReadyFor(file);
    if (!ready) return { ok: false, output: this.unavailable(file), errorSignature: 'lsp-unavailable' };
    try {
      const position: LspPosition = { line: Math.max(0, line - 1), character: Math.max(0, column - 1) };
      const result = await this.withServer(ready.languageId, file, (client, uri) => client.definition(uri, position));
      const locs = normalizeLocations(result);
      if (locs.length === 0) return { ok: true, output: `No definition found at ${file}:${line}:${column}.` };
      const output = locs.map((l) => formatLocation(l.uri, l.range, l.uri)).join('\n');
      return { ok: true, output, payload: locs };
    } catch (err) {
      return { ok: false, output: `LSP definition failed: ${(err as Error).message}. Use search_files instead.`, errorSignature: 'lsp-error' };
    }
  }

  async references(file: string, line: number, column: number): Promise<LspCall> {
    const ready = await this.serverReadyFor(file);
    if (!ready) return { ok: false, output: this.unavailable(file), errorSignature: 'lsp-unavailable' };
    try {
      const position: LspPosition = { line: Math.max(0, line - 1), character: Math.max(0, column - 1) };
      const result = await this.withServer(ready.languageId, file, (client, uri) => client.references(uri, position));
      const locs = normalizeLocations(result);
      if (locs.length === 0) return { ok: true, output: `No references found for the symbol at ${file}:${line}:${column}.` };
      const output = `${locs.length} reference(s):\n` + locs.map((l) => formatLocation(l.uri, l.range, l.uri)).join('\n');
      return { ok: true, output, payload: locs };
    } catch (err) {
      return { ok: false, output: `LSP references failed: ${(err as Error).message}. Use search_files instead.`, errorSignature: 'lsp-error' };
    }
  }

  async hover(file: string, line: number, column: number): Promise<LspCall> {
    const ready = await this.serverReadyFor(file);
    if (!ready) return { ok: false, output: this.unavailable(file), errorSignature: 'lsp-unavailable' };
    try {
      const position: LspPosition = { line: Math.max(0, line - 1), character: Math.max(0, column - 1) };
      const result = await this.withServer(ready.languageId, file, (client, uri) => client.hover(uri, position));
      const contents = (result as { contents?: unknown } | null)?.contents;
      if (!contents) return { ok: true, output: `No hover info at ${file}:${line}:${column}.` };
      return { ok: true, output: formatHoverContents(contents), payload: result };
    } catch (err) {
      return { ok: false, output: `LSP hover failed: ${(err as Error).message}. Use read_file instead.`, errorSignature: 'lsp-error' };
    }
  }

  async symbols(file: string): Promise<LspCall> {
    const ready = await this.serverReadyFor(file);
    if (!ready) return { ok: false, output: this.unavailable(file), errorSignature: 'lsp-unavailable' };
    try {
      const result = await this.withServer(ready.languageId, file, (client, uri) => client.documentSymbols(uri));
      const symbols = normalizeSymbols(result);
      if (symbols.length === 0) return { ok: true, output: `No symbols found in ${file}.` };
      return { ok: true, output: `Symbols in ${file}:\n${renderSymbolTree(symbols)}`, payload: symbols };
    } catch (err) {
      return { ok: false, output: `LSP symbols failed: ${(err as Error).message}. Use search_files instead.`, errorSignature: 'lsp-error' };
    }
  }

  /** Cleanly shut down every live server (call at session end). */
  async shutdown(): Promise<void> {
    const clients = [...this.clients.values()];
    this.clients.clear();
    this.diags.clear();
    this.versions.clear();
    this.syncChains.clear();
    this.installPromises.clear();
    await Promise.allSettled(clients.map((c) => c.shutdown()));
  }
}
