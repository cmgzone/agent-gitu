import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it, expect, vi } from 'vitest';
import { CompanyStore } from '../src/company/store.js';
import { GituServer } from '../src/server/server.js';
import { CoworkComputer, COWORK_COMPUTER_IMAGE } from '../src/cowork/computer.js';

function fixture() {
  const root = mkdtempSync(path.join(os.tmpdir(), 'gitu-computer-recovery-')), store = new CompanyStore(root), company = store.create();
  const server = Object.create(GituServer.prototype) as any;
  Object.assign(server, {
    companies: () => store, cowork: () => ({ listAgents: () => [], getAgent: () => undefined }),
    companyScope: { run: (_scope: unknown, work: () => unknown) => work(), getStore: () => ({ id: company.id, version: 0 }) },
    coworkComputers: new Map(), coworkComputerTargets: new Map(), desktopAgents: new Map(),
  });
  return { root, store, company, server, close: () => { store.close(); rmSync(root, { recursive: true, force: true }); } };
}
describe('company private computer recovery', () => {
  it('keeps durable desktop slots separate when the same Cowork agent belongs to two companies', () => {
    const f = fixture();
    try {
      const other = f.store.create({ name: 'Other workspace' });
      f.store.setRuntimeSettings({ computers: 2 });
      f.store.reserveComputer(f.company.id, 'shared-agent', 'alpha-server');
      f.store.computerState(f.company.id, 'shared-agent', 'running');
      f.store.reserveComputer(other.id, 'shared-agent', 'beta-server');
      expect(f.store.read('computer', 'shared-agent', f.company.id)).toMatchObject({ state: 'running', computerServerId: 'alpha-server', heldSlot: true });
      expect(f.store.read('computer', 'shared-agent', other.id)).toMatchObject({ state: 'starting', computerServerId: 'beta-server', heldSlot: true });
      expect(() => f.store.read('computer', 'shared-agent')).toThrow('company scope');
      f.store.computerState(other.id, 'shared-agent', 'stopped');
      expect(f.store.read('computer', 'shared-agent', f.company.id)).toMatchObject({ state: 'running', heldSlot: true });
      expect(f.store.list('computer')).toHaveLength(2);
    } finally { f.close(); }
  });
  it('waits before provisioning or executing work when kernel quotas are unavailable', async () => {
    const f = fixture();
    try {
      const execute = vi.fn(async (args: string[]) => {
        if (args[0] === 'gitu-quota') throw new Error('Private computer disk quotas require an XFS computer server.');
        return '';
      });
      const computer = new CoworkComputer('lead', f.root, execute, { key: 'fixture', limits: () => ({ cpu: 2, memoryMb: 2048, diskMb: 10240 }) });
      await expect(computer.start()).rejects.toThrow('XFS');
      expect(computer.status()).toMatchObject({ state: 'unavailable', reason: 'disk_quota_unavailable' });
      expect(execute.mock.calls.some(([args]) => ['create','start','exec'].includes(args[0]))).toBe(false);
    } finally { f.close(); }
  });
  it('recreates an existing desktop when CPU or memory limits change while preserving its named volumes', async () => {
    const f = fixture();
    try {
      const execute = vi.fn(async (args: string[]) => {
        if (args[0] === 'gitu-quota') return 'quota-ready';
        if (args.includes('{{.Config.Image}}')) return COWORK_COMPUTER_IMAGE;
        if (args.includes('{{json .HostConfig}}')) return JSON.stringify({ NanoCpus: 1_000_000_000, Memory: 512 * 1024 * 1024 });
        if (args.includes('{{.State.Status}}')) return 'exited';
        return '';
      });
      const computer = new CoworkComputer('lead', f.root, execute, { key: 'fixture', limits: () => ({ cpu: 2, memoryMb: 2048, diskMb: 10240 }) });
      await computer.start();
      const create = execute.mock.calls.find(([args]) => args[0] === 'create')![0];
      expect(create[create.indexOf('--cpus') + 1]).toBe('2');
      expect(create[create.indexOf('--memory') + 1]).toBe('2048m');
      expect(create).toContain('type=volume,src=' + computer.name + '-workspace,dst=/workspace');
      expect(create).toContain('type=volume,src=' + computer.name + '-home,dst=/home/agent');
      expect(create).toContain('--read-only');
      expect(execute.mock.calls.some(([args]) => args[0] === 'cp')).toBe(false);
      expect(execute.mock.calls.some(([args]) => args[0] === 'rename' && args[1] === computer.name)).toBe(true);
    } finally { f.close(); }
  });
  it('stops a removed helper on its saved remote server before releasing capacity', async () => {
    const f = fixture();
    try {
      f.store.reserveComputer(f.company.id, 'temporary-helper', 'previous-server');
      f.store.computerState(f.company.id, 'temporary-helper', 'running');
      const execute = vi.fn(async (args: string[]) => args.includes('{{.State.Status}}') ? 'running' : args.includes('{{.Config.Image}}') ? COWORK_COMPUTER_IMAGE : '');
      f.server.cloudComputer = vi.fn(() => ({ execute }));
      await f.server.reconcileCompanyComputers();
      expect(f.server.cloudComputer).toHaveBeenCalledWith('previous-server');
      expect(execute.mock.calls.some(([args]) => args[0] === 'stop')).toBe(true);
      expect(f.store.read('computer', 'temporary-helper')).toMatchObject({ state: 'stopped', heldSlot: false, computerServerId: 'previous-server' });
    } finally { f.close(); }
  });
  it('retains unavailable helper capacity and avoids guessing an unknown legacy target', async () => {
    const f = fixture();
    try {
      f.store.reserveComputer(f.company.id, 'offline-helper', 'offline-server');
      f.store.saveResource('computer', 'legacy-helper', f.company.id, { id: 'legacy-helper', state: 'running', heldSlot: true });
      const execute = vi.fn(async () => { throw new Error('Connection unavailable'); });
      f.server.cloudComputer = vi.fn(() => ({ execute }));
      await f.server.reconcileCompanyComputers();
      expect(f.server.cloudComputer).toHaveBeenCalledOnce();
      for (const id of ['offline-helper', 'legacy-helper']) expect(f.store.read('computer', id)).toMatchObject({ state: 'unavailable', heldSlot: true });
    } finally { f.close(); }
  });
  it('keeps the old computer cached when stopping it cannot be confirmed', async () => {
    const f = fixture();
    try {
      const computer = { stop: vi.fn(async () => { throw new Error('Cannot confirm stop'); }) };
      f.server.coworkComputers.set(f.company.id+':lead', computer); f.server.coworkComputerTargets.set(f.company.id+':lead', 'old-server');
      await expect(f.server.resetCoworkComputer('lead')).rejects.toThrow('Cannot confirm');
      expect(f.server.coworkComputers.get(f.company.id+':lead')).toBe(computer);
      expect(f.server.coworkComputerTargets.get(f.company.id+':lead')).toBe('old-server');
    } finally { f.close(); }
  });
  it('refuses to replace a running hosted computer with a local computer', () => {
    const f = fixture();
    try {
      f.server.cowork = () => ({ getAgent: () => ({ id: 'lead', companyId: f.company.id, cloudConnectionId: undefined }) });
      const computer = { status: () => ({ state: 'running' }) };
      f.server.coworkComputers.set(f.company.id+':lead', computer); f.server.coworkComputerTargets.set(f.company.id+':lead', 'hosted');
      expect(() => f.server.coworkComputer('lead')).toThrow('Stop the previous');
      expect(f.server.coworkComputers.get(f.company.id+':lead')).toBe(computer);
    } finally { f.close(); }
  });
});
