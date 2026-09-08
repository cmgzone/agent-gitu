import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { McpManager } from '../src/mcp/client.js';
import { toolConfigureMcp } from '../src/tools/tools.js';

const roots: string[] = [];

function fixture(): { root: string; server: string; project: string; global: string } {
  const root = mkdtempSync(path.join(tmpdir(), 'gitu-mcp-refresh-'));
  roots.push(root);
  const server = path.join(root, 'fake-mcp.mjs');
  const project = path.join(root, 'project', '.hermes', 'mcp.json');
  const global = path.join(root, 'global', 'mcp.json');
  mkdirSync(path.dirname(project), { recursive: true });
  mkdirSync(path.dirname(global), { recursive: true });
  writeFileSync(server, `
import readline from 'node:readline';
const variant = process.argv[2] || 'default';
const lines = readline.createInterface({ input: process.stdin });
lines.on('line', (line) => {
  const msg = JSON.parse(line);
  if (msg.id == null) return;
  let result = {};
  if (msg.method === 'tools/list') {
    result = msg.params && msg.params.cursor
      ? { tools: [{ name: variant + '_second', description: 'second page', inputSchema: { type: 'object', required: ['id'] } }] }
      : { tools: [{ name: variant + '_first', description: 'first page', inputSchema: { type: 'object', properties: { id: { type: 'string' } } } }], nextCursor: 'next' };
  } else if (msg.method === 'tools/call') {
    result = { content: [{ type: 'text', text: variant + ':' + msg.params.name }] };
  }
  process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: msg.id, result }) + '\\n');
});
`);
  return { root, server, project, global };
}

afterEach(async () => {
  // Windows releases a killed child process' cwd asynchronously.
  await new Promise((resolve) => setTimeout(resolve, 100));
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
});

describe('MCP tool discovery refresh', () => {
  it('executes the project override, keeps input schemas and follows pagination', async () => {
    const f = fixture();
    writeFileSync(f.global, JSON.stringify({ servers: [{ name: 'shared', command: process.execPath, args: [f.server, 'global'] }] }));
    writeFileSync(f.project, JSON.stringify({ servers: [{ name: 'shared', command: process.execPath, args: [f.server, 'project'] }] }));
    const manager = new McpManager(f.project, f.global);
    try {
      const tools = await manager.listAllTools();
      expect(tools.map((tool) => tool.name)).toEqual(['project_first', 'project_second']);
      expect(tools[0]?.inputSchema).toMatchObject({ type: 'object', properties: { id: { type: 'string' } } });
      expect(await manager.call('mcp:shared:project_first', { id: 'x' })).toBe('project:project_first');
    } finally {
      manager.killAll();
    }
  });

  it('restarts a cached client when its registered configuration changes', async () => {
    const f = fixture();
    const manager = new McpManager(f.project, f.global);
    try {
      manager.addServer({ name: 'changing', command: process.execPath, args: [f.server, 'before'] });
      expect((await manager.listAllTools())[0]?.name).toBe('before_first');
      manager.addServer({ name: 'changing', command: process.execPath, args: [f.server, 'after'] });
      expect((await manager.listAllTools())[0]?.name).toBe('after_first');
      expect(await manager.call('mcp:changing:after_first', {})).toBe('after:after_first');
    } finally {
      manager.killAll();
    }
  });

  it('reports unavailable registered servers while returning healthy tools', async () => {
    const f = fixture();
    writeFileSync(f.project, JSON.stringify({ servers: [
      { name: 'healthy', command: process.execPath, args: [f.server, 'healthy'] },
      { name: 'offline', command: path.join(f.root, 'missing-executable') },
    ] }));
    const manager = new McpManager(f.project, f.global);
    try {
      const tools = await manager.listAllTools();
      expect(tools.map((tool) => tool.name)).toContain('healthy_first');
      expect(manager.discoveryFailures()).toEqual([{ server: 'offline', error: expect.stringContaining('unavailable') }]);
    } finally {
      manager.killAll();
    }
  });

  it('does not copy a registered MCP credential into another settings scope', () => {
    const f = fixture();
    writeFileSync(f.global, JSON.stringify({ servers: [
      { name: 'secure', command: process.execPath, args: [f.server], env: { SERVICE_TOKEN: 'secret' } },
    ] }));
    const manager = new McpManager(f.project, f.global);

    const result = toolConfigureMcp({ mcp: manager } as never, { name: 'secure', global: false });

    expect(result.ok).toBe(false);
    expect(result.output).toContain('saved credentials');
    expect(existsSync(f.project)).toBe(false);
    expect(readFileSync(f.global, 'utf8')).toContain('SERVICE_TOKEN');
  });
});
