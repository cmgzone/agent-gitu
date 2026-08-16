import { type ChildProcess, spawn } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';

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
        try {
          this.proc = spawn(this.config.command, this.config.args ?? [], {
            cwd: this.cwd,
            stdio: ['pipe', 'pipe', 'pipe'],
            env: { ...process.env, ...this.config.env },
            shell: process.platform === 'win32',
          });
        } catch (err) {
          reject(err as Error);
          return;
        }
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
        this.proc.on('error', (err) => {
          for (const w of this.pending.values()) w.reject(err);
          this.pending.clear();
          reject(err);
        });
        this.proc.on('exit', () => {
          for (const w of this.pending.values()) w.reject(new Error('mcp server exited'));
          this.pending.clear();
        });
        this.request('initialize', {
          protocolVersion: '2024-11-05',
          capabilities: {},
          clientInfo: { name: 'hermes', version: '0.1.0' },
        })
          .then(() => {
            this.send({ jsonrpc: '2.0', method: 'notifications/initialized' });
            resolve();
          })
          .catch(reject);
      });
    }
    return this.ready;
  }

  private send(msg: unknown): void {
    this.proc?.stdin?.write(`${JSON.stringify(msg)}\n`);
  }

  private request(method: string, params: unknown, timeoutMs = 20000): Promise<unknown> {
    const id = this.nextId++;
    this.send({ jsonrpc: '2.0', id, method, params });
    return new Promise((resolve, reject) => {
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
    });
  }

  async listTools(): Promise<McpToolInfo[]> {
    await this.connect();
    const result = (await this.request('tools/list', {})) as { tools?: { name: string; description?: string }[] };
    return (result.tools ?? []).map((t) => ({ server: this.config.name, name: t.name, description: t.description }));
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
    this.proc?.kill();
    this.proc = undefined;
    this.ready = undefined;
  }
}

export class McpManager {
  private clients = new Map<string, McpClient>();

  constructor(private readonly configFile: string) {}

  static forProject(repoRoot: string): McpManager {
    return new McpManager(path.join(repoRoot, '.hermes', 'mcp.json'));
  }

  servers(): McpServerConfig[] {
    if (!existsSync(this.configFile)) return [];
    try {
      const data = JSON.parse(readFileSync(this.configFile, 'utf8')) as { servers?: McpServerConfig[] };
      return data.servers ?? [];
    } catch {
      return [];
    }
  }

  addServer(config: McpServerConfig): McpServerConfig[] {
    const servers = this.servers().filter((s) => s.name !== config.name);
    servers.push(config);
    mkdirSync(path.dirname(this.configFile), { recursive: true });
    writeFileSync(this.configFile, JSON.stringify({ servers }, null, 2));
    return servers;
  }

  removeServer(name: string): McpServerConfig[] {
    const client = this.clients.get(name);
    if (client) {
      client.kill();
      this.clients.delete(name);
    }
    const servers = this.servers().filter((s) => s.name !== name);
    writeFileSync(this.configFile, JSON.stringify({ servers }, null, 2));
    return servers;
  }

  private client(name: string): McpClient | undefined {
    let client = this.clients.get(name);
    if (!client) {
      const config = this.servers().find((s) => s.name === name);
      if (!config) return undefined;
      client = new McpClient(config, path.dirname(path.dirname(this.configFile)));
      this.clients.set(name, client);
    }
    return client;
  }

  async listAllTools(): Promise<McpToolInfo[]> {
    const all: McpToolInfo[] = [];
    for (const server of this.servers()) {
      try {
        const client = this.client(server.name);
        if (client) all.push(...(await client.listTools()));
      } catch {
        /* server unavailable */
      }
    }
    return all;
  }

  async call(qualifiedName: string, args: Record<string, unknown>): Promise<string> {
    const [, serverName, ...rest] = qualifiedName.split(':');
    const toolName = rest.join(':');
    const client = this.client(serverName ?? '');
    if (!client) throw new Error(`Unknown MCP server: ${serverName}`);
    return client.callTool(toolName, args);
  }

  killAll(): void {
    for (const client of this.clients.values()) client.kill();
    this.clients.clear();
  }
}
