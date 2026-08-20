import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { LspClient } from './client.js';
import { DiagnosticsCache, formatDiagnostics, formatLocation } from './diagnostics.js';
import { detectLanguages, languageForUnknownFile, languageIdForPath } from './language-detector.js';
import { serverBinaryAvailable, ServerRegistry } from './server-registry.js';
import type { LspCall, LspDiagnostic, LspPosition, LspServerConfig, LspStatusView, LspSymbol } from './lsp-types.js';

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
  readonly registry: ServerRegistry;

  constructor(
    private readonly repoRoot: string,
    registry?: ServerRegistry,
  ) {
    this.registry = registry ?? new ServerRegistry(repoRoot);
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
    if (version === 1) {
      await client.openDocument(uri, languageId, text, version);
    } else {
      await client.changeDocument(uri, text, version);
    }
    this.versions.set(uri, version);
    return uri;
  }

  /** Run a query against the right server, restarting a crashed server once. */
  private async withServer<T>(languageId: string, file: string, fn: (client: LspClient, uri: string) => Promise<T>): Promise<T> {
    const config = this.registry.serverForLanguage(languageId);
    if (!config) throw new Error(`No LSP server configured for language "${languageId}"`);
    const client = this.clientFor(languageId)!;
    try {
      const uri = await this.syncDocument(client, file, languageId);
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

  private serverReadyFor(file: string): { languageId: string; config: LspServerConfig } | undefined {
    const languageId = this.languageIdFor(file);
    if (!languageId) return undefined;
    const config = this.registry.serverForLanguage(languageId);
    if (!config || !serverBinaryAvailable(config)) return undefined;
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
    return `LSP unavailable: ${hint}. Fall back to search_files / read_file.`;
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

  /** Whether any configured server binary is present on this machine. */
  hasServers(): boolean {
    return this.registry.serversList().some((s) => serverBinaryAvailable(s));
  }

  /** Languages detected from project markers (package.json, Cargo.toml, ...). */
  projectLanguages(): string[] {
    return detectLanguages(this.repoRoot);
  }

  // ---- queries -----------------------------------------------------------

  async diagnostics(file: string): Promise<LspCall> {
    const ready = this.serverReadyFor(file);
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
    const ready = this.serverReadyFor(file);
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
    const ready = this.serverReadyFor(file);
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
    const ready = this.serverReadyFor(file);
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
    const ready = this.serverReadyFor(file);
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
    await Promise.allSettled(clients.map((c) => c.shutdown()));
  }
}