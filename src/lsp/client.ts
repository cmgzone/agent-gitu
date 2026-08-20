import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { resolveSpawnCommand } from './server-registry.js';
import type { LspDiagnostic, LspPosition, LspServerConfig } from './lsp-types.js';

/**
 * Minimal Language Server Protocol client over stdio.
 *
 * LSP uses JSON-RPC 2.0 framed with `Content-Length` headers (unlike the MCP
 * newline-delimited transport). This client covers the subset the agent needs:
 * initialize handshake, document lifecycle (open/change/close), request/response
 * with timeouts, and graceful handling of server-initiated requests (we answer
 * with `null`, which the protocol allows for optional capabilities).
 */
interface PendingWaiter {
  resolve: (v: unknown) => void;
  reject: (e: Error) => void;
  timer: NodeJS.Timeout;
}

export class LspClient {
  private proc?: ChildProcess;
  private buffer = '';
  private nextId = 1;
  private pending = new Map<number, PendingWaiter>();
  private ready?: Promise<void>;
  private shuttingDown = false;
  private capabilities: Record<string, unknown> = {};
  /** Method -> handler for server-to-client notifications (publishDiagnostics, logMessage, ...). */
  onNotification?: (method: string, params: unknown) => void;

  constructor(
    private readonly config: LspServerConfig,
    private readonly cwd: string,
  ) {}

  /** Spawn the server and complete the LSP initialize handshake (lazy, once). */
  private connect(): Promise<void> {
    if (!this.ready) {
      this.ready = new Promise<void>((resolve, reject) => {
        try {
          const resolved = resolveSpawnCommand(this.config);
          this.proc = spawn(resolved.command, resolved.args, {
            cwd: this.cwd,
            stdio: ['pipe', 'pipe', 'pipe'],
            env: { ...process.env, ...this.config.env },
            shell: resolved.shell,
          });
        } catch (err) {
          reject(err as Error);
          return;
        }
        this.proc.stdout?.on('data', (chunk: Buffer) => this.onData(chunk.toString('utf8')));
        this.proc.stderr?.on('data', (chunk: Buffer) => {
          this.onNotification?.('_stderr', chunk.toString('utf8'));
        });
        this.proc.on('error', (err) => {
          for (const w of this.pending.values()) {
            clearTimeout(w.timer);
            w.reject(err);
          }
          this.pending.clear();
          reject(err);
        });
        this.proc.on('exit', (code) => {
          if (!this.shuttingDown) {
            const err = new Error(`LSP server "${this.config.name}" exited with code ${code ?? 'unknown'}`);
            for (const w of this.pending.values()) {
              clearTimeout(w.timer);
              w.reject(err);
            }
            this.pending.clear();
            this.ready = undefined;
          }
        });
        this.dispatch('initialize', {
          processId: process.pid,
          rootUri: pathToFileURL(this.cwd).href,
          capabilities: {
            workspace: { workspaceFolders: true },
            textDocument: {
              publishDiagnostics: { relatedInformation: true },
            },
          },
          clientInfo: { name: 'agent-gitu', version: '0.2.0' },
          workspaceFolders: [
            { uri: pathToFileURL(this.cwd).href, name: this.cwd.split(/[\\/]/).filter(Boolean).pop() ?? 'workspace' },
          ],
        }, 15000)
          .then((serverCapabilities) => {
            const result = (serverCapabilities ?? {}) as { capabilities?: Record<string, unknown> };
            this.capabilities = result.capabilities ?? {};
            this.send({ jsonrpc: '2.0', method: 'initialized', params: {} });
            resolve();
          })
          .catch((err) => {
            this.ready = undefined;
            reject(err as Error);
          });
      });
    }
    return this.ready;
  }

  /** Whether the server advertises pull (3.17) diagnostics support. */
  supportsPullDiagnostics(): boolean {
    const provider = this.capabilities['diagnosticProvider'];
    return Boolean(provider && typeof provider === 'object' && !Array.isArray(provider));
  }

  private onData(chunk: string): void {
    this.buffer += chunk;
    for (;;) {
      const headerEnd = this.buffer.indexOf('\r\n\r\n');
      if (headerEnd < 0) return;
      const header = this.buffer.slice(0, headerEnd);
      const m = /Content-Length:\s*(\d+)/i.exec(header);
      if (!m) {
        this.buffer = this.buffer.slice(headerEnd + 4);
        continue;
      }
      const length = Number(m[1]);
      if (this.buffer.length < headerEnd + 4 + length) return;
      const body = this.buffer.slice(headerEnd + 4, headerEnd + 4 + length);
      this.buffer = this.buffer.slice(headerEnd + 4 + length);
      try {
        this.handleMessage(JSON.parse(body));
      } catch {
        /* non-JSON body — ignore */
      }
    }
  }

  private handleMessage(msg: {
    jsonrpc?: string;
    id?: number;
    method?: string;
    params?: unknown;
    result?: unknown;
    error?: { code?: number; message?: string };
  }): void {
    if (typeof msg.id === 'number' && this.pending.has(msg.id)) {
      const waiter = this.pending.get(msg.id)!;
      this.pending.delete(msg.id);
      clearTimeout(waiter.timer);
      if (msg.error) {
        waiter.reject(new Error(msg.error.message ?? `lsp error ${msg.error.code ?? ''}`.trim()));
      } else {
        waiter.resolve(msg.result);
      }
      return;
    }
    if (typeof msg.id === 'number' && msg.method) {
      // Server-initiated request. Answer null for optional capabilities.
      const result = msg.method === 'workspace/configuration' ? { items: [] } : null;
      this.send({ jsonrpc: '2.0', id: msg.id, result });
      return;
    }
    if (msg.method) {
      this.onNotification?.(msg.method, msg.params);
    }
  }

  private send(msg: unknown): void {
    const body = JSON.stringify(msg);
    const header = `Content-Length: ${Buffer.byteLength(body)}\r\n\r\n`;
    this.proc?.stdin?.write(header + body);
  }

  request(method: string, params: unknown, timeoutMs = 15000): Promise<unknown> {
    return this.connect().then(() => this.dispatch(method, params, timeoutMs));
  }

  private dispatch(method: string, params: unknown, timeoutMs: number): Promise<unknown> {
    const id = this.nextId++;
    this.send({ jsonrpc: '2.0', id, method, params });
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`LSP request timed out: ${method}`));
      }, timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
    });
  }

  /** Fire-and-forget notification. */
  notify(method: string, params: unknown): void {
    this.send({ jsonrpc: '2.0', method, params });
  }

  async openDocument(uri: string, languageId: string, text: string, version = 1): Promise<void> {
    await this.connect();
    this.notify('textDocument/didOpen', {
      textDocument: { uri, languageId, version, text },
    });
  }

  async changeDocument(uri: string, text: string, version: number): Promise<void> {
    await this.connect();
    this.notify('textDocument/didChange', {
      textDocument: { uri, version },
      contentChanges: [{ text }],
    });
  }

  async closeDocument(uri: string): Promise<void> {
    this.notify('textDocument/didClose', { textDocument: { uri } });
  }

  /** Pull-model diagnostics (LSP 3.17). */
  async pullDiagnostics(uri: string): Promise<LspDiagnostic[]> {
    const result = (await this.dispatch('textDocument/diagnostic', { textDocument: { uri }, previousResultId: null }, 15000)) as
      | { kind?: string; items?: LspDiagnostic[] }
      | LspDiagnostic[]
      | null;
    if (!result) return [];
    if (Array.isArray(result)) return result;
    return result.items ?? [];
  }

  async hover(uri: string, position: LspPosition): Promise<unknown> {
    return this.dispatch('textDocument/hover', { textDocument: { uri }, position }, 10000);
  }

  async definition(uri: string, position: LspPosition): Promise<unknown> {
    return this.dispatch('textDocument/definition', { textDocument: { uri }, position }, 10000);
  }

  async documentSymbols(uri: string): Promise<unknown> {
    return this.dispatch('textDocument/documentSymbol', { textDocument: { uri } }, 10000);
  }

  async references(uri: string, position: LspPosition): Promise<unknown> {
    return this.dispatch('textDocument/references', { textDocument: { uri }, position, context: { includeDeclaration: true } }, 10000);
  }

  isRunning(): boolean {
    return Boolean(this.proc && this.ready);
  }

  /** Cleanly shut down then force-kill the whole process tree. */
  async shutdown(): Promise<void> {
    this.shuttingDown = true;
    if (this.proc && this.ready) {
      try {
        await this.ready;
        await this.dispatch('shutdown', null, 3000);
      } catch {
        /* server may already be gone */
      }
      try {
        this.send({ jsonrpc: '2.0', method: 'exit' });
      } catch {
        /* ignore */
      }
    }
    await this.killTree();
    this.pending.clear();
  }

  /** Wait for the child to exit; on Windows kill the whole tree (cmd + node). */
  private killTree(): Promise<void> {
    const proc = this.proc;
    this.proc = undefined;
    this.ready = undefined;
    if (!proc || proc.pid === undefined) return Promise.resolve();
    return new Promise<void>((resolve) => {
      const done = (): void => resolve();
      if (proc.exitCode !== null || proc.signalCode !== null) return done();
      proc.once('exit', done);
      try {
        if (process.platform === 'win32') {
          spawnSync('taskkill', ['/pid', String(proc.pid), '/T', '/F'], { stdio: 'ignore' });
        } else {
          proc.kill('SIGKILL');
        }
      } catch {
        proc.kill('SIGKILL');
      }
      setTimeout(() => {
        proc.removeListener('exit', done);
        resolve();
      }, 2000);
    });
  }

  get serverName(): string {
    return this.config.name;
  }
}