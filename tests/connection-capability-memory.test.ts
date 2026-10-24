import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { expect, it, vi } from 'vitest';
import { ConnectionRegistry } from '../src/connections/connections.js';

it('remembers the complete documented Mailcow catalog across tasks without invoking writes or exposing credentials', async () => {
  const previous = process.env.AGENT_GITU_HOME;
  const home = mkdtempSync(path.join(tmpdir(), 'connection-memory-'));
  process.env.AGENT_GITU_HOME = home;
  const network = vi.spyOn(globalThis, 'fetch');
  try {
    const registry = new ConnectionRegistry();
    const saved = registry.save({ label: 'Mailcow', provider: 'mailcow', baseUrl: 'https://mail.example.test', token: 'private-fixture-key', capabilities: ['domains.read'], operations: [{ id: 'validate', label: 'List domains', capability: 'domains.read', method: 'GET', path: '/api/v1/get/domain/all', risk: 'read' }] });
    const remembered = registry.rememberCapabilities(saved.id);
    expect(remembered.operations.some(op => op.path === '/api/v1/add/mailbox' && op.risk === 'reversible-write')).toBe(true);
    expect(remembered.operations.some(op => op.path === '/api/v1/delete/mailbox' && op.risk === 'destructive')).toBe(true);
    expect(remembered.operations.some(op => /:\w|\{/.test(op.path))).toBe(false);
    expect(remembered.operations.filter(op => op.risk !== 'read')).toHaveLength(56);
    expect(new ConnectionRegistry().get(saved.id)?.operations).toEqual(remembered.operations);
    expect(JSON.stringify(remembered)).not.toContain('private-fixture-key');
    expect(readFileSync(path.join(home, 'Settings', 'connections.json'), 'utf8')).not.toContain('private-fixture-key');
    expect(network).not.toHaveBeenCalled();
    network.mockImplementation(async (_url, options) => {
      const headers = new Headers(options?.headers);
      expect(headers.get('X-API-Key')).toBe('private-fixture-key');
      expect(headers.has('authorization')).toBe(false);
      return new Response(JSON.stringify([{ type: 'success', msg: 'fixture' }]), { status: 200 });
    });
    const operation = remembered.operations.find(op => op.path === '/api/v1/edit/alias')!;
    expect((await registry.invoke(saved.id, operation.id, { items: ['fixture'], attr: { active: 1 } })).data).toEqual([{ type: 'success', msg: 'fixture' }]);
    expect(network).toHaveBeenCalledOnce();
  } finally {
    network.mockRestore();
    if (previous === undefined) delete process.env.AGENT_GITU_HOME;
    else process.env.AGENT_GITU_HOME = previous;
    rmSync(home, { recursive: true, force: true });
  }
});
