import { type ChildProcess, spawn } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { resolveSpawn } from '../lsp/server-registry.js';
import { ensureGituHome } from '../workspace/home.js';

export interface McpServerConfig {
  name: string;
  command: string;
  args?: string[];
  env?: Record<string, string>;
}

export interface McpToolInfo {
  server: string;
  name: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
}

interface JsonRpcResponse {
  id?: number;
  result?: unknown;
  error?: { message?: string };
}

export class McpClient {
  private proc?: ChildProcess;
  private buffer = '';
  private nextId = 1;
  private pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();
  private ready?: Promise<void>;

  constructor(
    private readonly config: McpServerConfig,
    private readonly cwd: string,
  ) {}

  private connect(): Promise<void> {
    if (!this.ready) {
      this.ready = new Promise<void>((resolve, reject) => {
        let settled = false;
        try {
          const resolved = resolveSpawn(this.config.command, this.config.args);
          this.proc = spawn(resolved.command, resolved.args, {
            cwd: this.cwd,
            stdio: ['pipe', 'pipe', 'pipe'],
            env: { ...process.env, ...this.config.env },
            shell: resolved.shell,
            windowsHide: true,
          });
        } catch (err) {
          reject(err as Error);
          return;
        }
        // A dead child's stdin emits EPIPE asynchronously; without a handler
        // that becomes an uncaught exception crashing the agent process.
        this.proc.stdin?.on('error', () => {});
        this.proc.stdout?.on('data', (chunk: Buffer) => {
          this.buffer += chunk.toString('utf8');
          let idx: number;
          while ((idx = this.buffer.indexOf('\n')) >= 0) {
            const line = this.buffer.slice(0, idx).trim();
            this.buffer = this.buffer.slice(idx + 1);
            if (!line) continue;
            try {
              const msg = JSON.parse(line) as JsonRpcResponse;
              if (typeof msg.id === 'number' && this.pending.has(msg.id)) {
                const waiter = this.pending.get(msg.id)!;
                this.pending.delete(msg.id);
                if (msg.error) waiter.reject(new Error(msg.error.message ?? 'mcp error'));
                else waiter.resolve(msg.result);
              }
            } catch {
              /* non-JSON line */
            }
          }
        });
        const connectedProcess = this.proc;
        this.proc.on('error', (err) => {
          if (this.proc !== connectedProcess) return;
          for (const w of this.pending.values()) w.reject(err);
          this.pending.clear();
          if (this.proc === connectedProcess) {
            this.ready = undefined;
            this.proc = undefined;
          }
          if (!settled) {
            settled = true;
            reject(err);
          }
        });
        this.proc.on('exit', () => {
          if (this.proc !== connectedProcess) return;
          for (const w of this.pending.values()) w.reject(new Error('mcp server exited'));
          this.pending.clear();
          // Allow a future call to reconnect instead of returning the stale
          // (resolved) ready promise of a dead server forever.
          if (this.proc === connectedProcess) {
            this.ready = undefined;
            this.proc = undefined;
            this.buffer = '';
          }
        });
        this.request('initialize', {
          protocolVersion: '2024-11-05',
          capabilities: {},
          clientInfo: { name: 'hermes', version: '0.1.0' },
        })
          .then(() => {
            settled = true;
            this.send({ jsonrpc: '2.0', method: 'notifications/initialized' });
            resolve();
          })
          .catch((err) => {
            // Reset the cached handshake AND reap the process: otherwise one
            // failed init bricks this client permanently and leaks the child.
            if (this.proc !== connectedProcess) {
              if (!settled) reject(err as Error);
              return;
            }
            this.ready = undefined;
            try {
              this.proc?.kill();
            } catch {
              /* already gone */
            }
            this.proc = undefined;
            if (!settled) {
              settled = true;
              reject(err as Error);
            }
          });
      });
      const handshake = this.ready;
      void handshake.catch(() => {
        if (this.ready === handshake) this.ready = undefined;
      });
    }
    return this.ready;
  }

  private send(msg: unknown): void {
    const stdin = this.proc?.stdin;
    if (!stdin || stdin.destroyed || !stdin.writable) return;
    stdin.write(`${JSON.stringify(msg)}\n`);
  }

  private request(method: string, params: unknown, timeoutMs = 20000): Promise<unknown> {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const stdin = this.proc?.stdin;
      if (!stdin || stdin.destroyed || !stdin.writable) {
        reject(new Error('MCP server is not connected. Retry discovery to reconnect.'));
        return;
      }
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`mcp request timed out: ${method}`));
      }, timeoutMs);
      this.pending.set(id, {
        resolve: (v) => {
          clearTimeout(timer);
          resolve(v);
        },
        reject: (e) => {
          clearTimeout(timer);
          reject(e);
        },
      });
      // Install the waiter before writing: a fast server can reply immediately.
      stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`, (error) => {
        if (!error) return;
        this.pending.get(id)?.reject(error);
        this.pending.delete(id);
      });
    });
  }

  async listTools(): Promise<McpToolInfo[]> {
    await this.connect();
    const tools = new Map<string, McpToolInfo>();
    const cursors = new Set<string>();
    let cursor: string | undefined;
    do {
      const result = (await this.request('tools/list', cursor ? { cursor } : {})) as {
        tools?: Omit<McpToolInfo, 'server'>[]; nextCursor?: string;
      };
      if (!result || !Array.isArray(result.tools)) throw new Error('MCP server returned an invalid tools/list response.');
      for (const tool of result.tools) {
        if (!tool || typeof tool.name !== 'string' || !tool.name.trim()) continue;
        tools.set(tool.name, { server: this.config.name, name: tool.name, description: tool.description, inputSchema: tool.inputSchema });
      }
      cursor = typeof result.nextCursor === 'string' && result.nextCursor ? result.nextCursor : undefined;
      if (cursor && cursors.has(cursor)) throw new Error('MCP server repeated its tool-list cursor.');
      if (cursor) cursors.add(cursor);
    } while (cursor);
    return [...tools.values()];
  }

  async callTool(toolName: string, args: Record<string, unknown>): Promise<string> {
    await this.connect();
    const result = (await this.request('tools/call', { name: toolName, arguments: args })) as {
      content?: { type?: string; text?: string }[];
      isError?: boolean;
    };
    const text = (result.content ?? [])
      .map((c) => c.text ?? '')
      .filter(Boolean)
      .join('\n');
    if (result.isError) throw new Error(text || 'mcp tool error');
    return text || '(no output)';
  }

  kill(): void {
    for (const waiter of this.pending.values()) waiter.reject(new Error('MCP server configuration changed or connection closed. Retry discovery.'));
    this.pending.clear();
    this.proc?.kill();
    this.proc = undefined;
    this.ready = undefined;
    this.buffer = '';
  }
}

export class McpManager {
  private clients = new Map<string, McpClient>();
  private clientConfigs = new Map<string, string>();
  private discoveryErrors = new Map<string, string>();

  discoveryFailures(): { server: string; error: string }[] {
    return [...this.discoveryErrors].map(([server, error]) => ({ server, error }));
  }

  constructor(
    private readonly configFile: string,
    /** Optional workspace-level layer merged under the project config (project wins on name clashes). */
    private readonly globalFile?: string,
  ) {}

  static forProject(repoRoot: string): McpManager {
    return new McpManager(path.join(repoRoot, '.hermes', 'mcp.json'), McpManager.globalConfigFile());
  }

  /** Workspace-wide MCP layer shared by every project. */
  static globalConfigFile(): string {
    return path.join(ensureGituHome().root, 'Mcp', 'mcp.json');
  }

  private readLayered(): { config: McpServerConfig; global: boolean }[] | undefined {
    const layered: { config: McpServerConfig; global: boolean }[] = [];
    const push = (file: string | undefined, isGlobal: boolean): boolean => {
      if (!file || !existsSync(file)) return true;
      try {
        const data = JSON.parse(readFileSync(file, 'utf8')) as { servers?: McpServerConfig[] };
        if (Array.isArray(data.servers)) {
          for (const s of data.servers) layered.push({ config: s, global: isGlobal });
        }
        return true;
      } catch {
        return false;
      }
    };
    // Global layer first so the project file (read second) wins on clashes.
    if (!push(this.globalFile, true)) return undefined;
    if (!push(this.configFile, false)) return undefined;
    return layered;
  }

  /** Which layer holds each server, for the UI/agent to display. */
  serverScopes(): Record<string, 'global' | 'project'> {
    const scopes: Record<string, 'global' | 'project'> = {};
    for (const l of this.readLayered() ?? []) scopes[l.config.name] = l.global ? 'global' : 'project';
    return scopes;
  }

  /**
   * Read the config files (merged). Returns undefined when EITHER file EXISTS
   * but cannot be parsed — callers must treat that as fatal instead of writing
   * an empty server list over the user's configuration.
   */
  private readConfigFile(): McpServerConfig[] | undefined {
    const layered = this.readLayered();
    if (layered === undefined) return undefined;
    const byName = new Map<string, McpServerConfig>();
    for (const l of layered) byName.set(l.config.name, l.config);
    return [...byName.values()];
  }

  servers(): McpServerConfig[] {
    return this.readConfigFile() ?? [];
  }

  addServer(config: McpServerConfig, scope: 'global' | 'project' = 'project'): McpServerConfig[] {
    if (!config.name?.trim() || !/^[a-zA-Z0-9_-]+$/.test(config.name) || !config.command?.trim()) {
      throw new Error('MCP server needs a name (letters, digits, hyphens or underscores) and a command.');
    }
    if (config.args !== undefined && (!Array.isArray(config.args) || config.args.some((arg) => typeof arg !== 'string'))) {
      throw new Error('MCP server args must be an array of strings.');
    }
    const layered = this.readLayered();
    const targetFile = scope === 'global' ? (this.globalFile ?? this.configFile) : this.configFile;
    if (layered === undefined) {
      throw new Error(`Cannot update MCP config: ${targetFile} contains invalid JSON. Fix or delete it first.`);
    }
    const targetIsGlobal = scope === 'global' && Boolean(this.globalFile);
    const servers = layered
      .filter((l) => l.global === targetIsGlobal && l.config.name !== config.name)
      .map((l) => l.config);
    servers.push(config);
    mkdirSync(path.dirname(targetFile), { recursive: true });
    writeFileSync(targetFile, JSON.stringify({ servers }, null, 2));
    return this.servers();
  }

  removeServer(name: string): McpServerConfig[] {
    const client = this.clients.get(name);
    if (client) {
      client.kill();
      this.clients.delete(name);
    }
    const layered = this.readLayered();
    if (layered === undefined) {
      throw new Error(`Cannot remove server "${name}": an MCP config contains invalid JSON and rewriting it would wipe every configured server.`);
    }
    // Prefer the PROJECT copy: layered is global-first, so a same-name
    // project shadow must be removed before the global entry is touched.
    const entry = [...layered].reverse().find((l) => l.config.name === name);
    if (!entry) return this.servers();
    const file = entry.global ? (this.globalFile ?? this.configFile) : this.configFile;
    const servers = layered
      .filter((l) => l.global === entry.global && l.config.name !== name)
      .map((l) => l.config);
    writeFileSync(file, JSON.stringify({ servers }, null, 2));
    return this.servers();
  }

  private client(name: string): McpClient | undefined {
    const layered = this.readLayered();
    const entry = layered ? [...layered].reverse().find((l) => l.config.name === name) : undefined;
    const fingerprint = entry ? JSON.stringify(entry) : undefined;
    let client = this.clients.get(name);
    if (client && this.clientConfigs.get(name) !== fingerprint) {
      client.kill();
      this.clients.delete(name);
      this.clientConfigs.delete(name);
      client = undefined;
    }
    if (!entry) return undefined;
    if (!client) {
      // Project servers run with the project as cwd; global servers run from
      // the workspace home so relative paths stay stable across projects.
      const baseFile = entry.global && this.globalFile ? this.globalFile : this.configFile;
      client = new McpClient(entry.config, path.dirname(path.dirname(baseFile)));
      this.clients.set(name, client);
      this.clientConfigs.set(name, fingerprint!);
    }
    return client;
  }

  async listAllTools(): Promise<McpToolInfo[]> {
    this.discoveryErrors.clear();
    if (this.readConfigFile() === undefined) {
      this.discoveryErrors.set('configuration', 'MCP configuration contains invalid JSON. Repair it to discover registered tools.');
      return [];
    }
    const results = await Promise.all(this.servers().map(async (server) => {
      try {
        const client = this.client(server.name);
        return client ? await client.listTools() : [];
      } catch {
        // Do not echo server stderr/configuration: either can contain credentials.
        this.discoveryErrors.set(server.name, 'Registered server is unavailable. Check its command and environment, then retry list_mcp; no new connection is needed.');
        return [];
      }
    }));
    return results.flat();
  }

  async call(qualifiedName: string, args: Record<string, unknown>): Promise<string> {
    if (!/^mcp:[^:]+:.+/.test(qualifiedName)) throw new Error('Use the complete MCP tool name returned by list_mcp: mcp:server:tool.');
    const [, serverName, ...rest] = qualifiedName.split(':');
    const toolName = rest.join(':');
    const client = this.client(serverName ?? '');
    if (!client) throw new Error(`Unknown MCP server: ${serverName}`);
    return client.callTool(toolName, args);
  }

  killAll(): void {
    for (const client of this.clients.values()) client.kill();
    this.clients.clear();
    this.clientConfigs.clear();
  }
}
