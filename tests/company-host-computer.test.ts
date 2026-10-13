import { mkdtempSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it, expect, vi } from 'vitest';
import { ProjectGuard } from '../src/guard/project-guard.js';
import { CoworkStore } from '../src/cowork/store.js';
import { executeCoworkTool } from '../src/cowork/tools.js';
import { buildCoworkMessages } from '../src/cowork/runner.js';
import type { ToolContext } from '../src/tools/tools.js';

function fixture() {
  const root = mkdtempSync(path.join(os.tmpdir(), 'gitu-host-grant-'));
  writeFileSync(path.join(root, 'package.json'), '{"name":"host-fixture"}');
  writeFileSync(path.join(root, 'answer.txt'), 'owner workspace content');
  const store = new CoworkStore(path.join(root, 'cowork.json'));
  const agent = { ...store.saveAgent({ name: 'Lead', systemPrompt: 'Work', useHostComputer: false }), companyId: 'company-fixture' };
  let grant = false;
  const locations: string[] = [];
  const context: ToolContext = { cwd: root, guard: ProjectGuard.detect(root), companyHostComputer: () => grant, onComputerLocation: (location) => locations.push(location) };
  const computer = { execute: vi.fn(async () => ({ ok: false, output: 'Private desktop unavailable' })), status: () => ({ state: 'unavailable' }) };
  const scope = { agent, store, memory: {} as never, computerFor: () => computer as any };
  const perms = { allowShell: true, allowWrites: true, allowConfig: true, browser: true, chief: true };
  return {
    root,
    context,
    scope,
    agent,
    computer,
    locations,
    perms,
    setGrant: (enabled: boolean) => {
      grant = enabled;
    },
    close: () => rmSync(root, { recursive: true, force: true }),
  };
}
describe('optional Company Use my computer grant', () => {
  it('defaults to private-only and permits workspace fallback only after an owner grant', async () => {
    const f = fixture();
    try {
      const refused = await executeCoworkTool(f.context, 'read_file', { path: '/workspace/answer.txt' }, f.perms, f.scope);
      expect(refused).toMatchObject({ ok: false, output: 'Private desktop unavailable' });
      expect(f.locations).toEqual([]);
      f.setGrant(true);
      const result = await executeCoworkTool(f.context, 'read_file', { path: '/workspace/answer.txt' }, f.perms, f.scope);
      expect(result.ok).toBe(true);
      expect(result.output).toContain('owner workspace content');
      expect(result.output).toContain('tools now run on the user');
      expect(f.locations).toEqual(['host']);
      const prompt = buildCoworkMessages(f.agent, { id: 'chat', kind: 'dm', memberIds: [f.agent.id] } as never, [f.agent], [], {
        computerFor: f.scope.computerFor,
        hostComputerAllowed: () => true,
      } as never)[0]!.content;
      expect(prompt).toContain('The owner granted Use my computer');
    } finally {
      f.close();
    }
  });
  it('checks revocation again after the private-computer attempt', async () => {
    const f = fixture();
    try {
      f.setGrant(true);
      f.computer.execute.mockImplementation(async () => {
        f.setGrant(false);
        return { ok: false, output: 'Private desktop unavailable' };
      });
      expect((await executeCoworkTool(f.context, 'read_file', { path: 'answer.txt' }, f.perms, f.scope)).ok).toBe(false);
      expect(f.locations).toEqual([]);
      f.scope.agent.useHostComputer = true;
      expect((await executeCoworkTool(f.context, 'read_file', { path: 'answer.txt' }, f.perms, f.scope)).output).toContain('not granted');
    } finally {
      f.close();
    }
  });
  it('preserves agent write restrictions and does not bypass human control or desktop-only tools', async () => {
    const f = fixture();
    try {
      f.setGrant(true);
      const result = await executeCoworkTool(f.context, 'write_file', { path: 'new.txt', content: 'no' }, { ...f.perms, allowWrites: false }, f.scope);
      expect(result.ok).toBe(false);
      expect(existsSync(path.join(f.root, 'new.txt'))).toBe(false);
      f.locations.length = 0;
      f.computer.status = () => ({ state: 'running' });
      expect((await executeCoworkTool(f.context, 'read_file', { path: 'answer.txt' }, f.perms, f.scope)).ok).toBe(false);
      f.computer.status = () => ({ state: 'unavailable' });
      expect((await executeCoworkTool(f.context, 'desktop_screenshot', {}, f.perms, f.scope)).ok).toBe(false);
      expect(f.locations).toEqual([]);
    } finally {
      f.close();
    }
  });
  it('does not grant shell permission merely because the company command policy allows a command', async () => {
    const f = fixture();
    try {
      f.setGrant(true);
      f.context.authorizeTool = async () => undefined;
      const result = await executeCoworkTool(f.context, 'run_command', { command: 'node check.cjs' }, { ...f.perms, allowShell: false }, f.scope);
      expect(result.ok).toBe(false);
      expect(f.computer.execute).not.toHaveBeenCalled();
      expect(f.locations).toEqual([]);
    } finally {
      f.close();
    }
  });
});
