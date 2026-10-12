import { mkdtempSync, rmSync, existsSync, symlinkSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { QuotaVolumes } from '../src/cowork/quota-volumes.js';
const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});
const name = 'gitu-cowork-' + 'a'.repeat(24);
function fixture() {
  const root = mkdtempSync(path.join(os.tmpdir(), 'gitu-quota-volumes-'));
  roots.push(root);
  let filesystem = 'xfs',
    enforcement = true,
    verified = true,
    diskMb = 256;
  const volumes = new Map<string, unknown>();
  const command = vi.fn(async (command: string, args: string[]) => {
    if (command === 'findmnt') return JSON.stringify({ filesystems: [{ target: '/fixture-quota', fstype: filesystem, options: 'rw,prjquota' }] });
    if (command === 'chown') return '';
    if (command === 'xfs_quota') {
      const text = args[args.indexOf('-c') + 1]!;
      if (text === 'state -p') return 'Project quota state\n Enforcement: ' + (enforcement ? 'ON' : 'OFF');
      if (text.startsWith('report')) return '';
      if (text.startsWith('limit')) {
        diskMb = Number(text.match(/bhard=(\d+)m/)![1]);
        return '';
      }
      if (text.startsWith('quota')) return '/dev/mock 0 0 ' + (verified ? diskMb * 1024 : 0) + ' 00 [--------] /fixture-quota';
      return '';
    }
    if (command === 'docker') {
      const volume = args.at(-1)!;
      if (args[1] === 'inspect') {
        if (!volumes.has(volume)) throw new Error('No such volume');
        return JSON.stringify(volumes.get(volume));
      }
      if (args[1] === 'create') {
        const options = Object.fromEntries(args.flatMap((arg, i) => (arg === '--opt' ? [args[i + 1]!.split(/=(.*)/s).slice(0, 2)] : [])));
        volumes.set(volume, { Driver: 'local', Options: options, Labels: { 'dev.agentgitu.quota': 'fixture-owner' } });
        return volume;
      }
    }
    throw new Error('Unexpected native command');
  });
  return {
    root,
    command,
    volumes,
    setFilesystem: (value: string) => (filesystem = value),
    disableEnforcement: () => (enforcement = false),
    invalidateQuota: () => (verified = false),
    manager: () => new QuotaVolumes(root, 'fixture-owner', command, 'linux'),
  };
}
describe('persistent private computer kernel quotas', () => {
  it('requires an explicit supported computer server and validates resource identifiers', async () => {
    const command = vi.fn(async () => '');
    await expect(new QuotaVolumes(undefined, 'owner', command, 'linux').prepare(name, 256)).rejects.toThrow('XFS');
    await expect(new QuotaVolumes('/quota', 'owner', command, 'win32').prepare(name, 256)).rejects.toThrow('Linux');
    await expect(new QuotaVolumes('/quota', 'owner', command, 'linux').prepare('../outside', 256)).rejects.toThrow('Invalid');
    await expect(new QuotaVolumes('/quota', 'owner', command, 'linux').prepare(name, 0)).rejects.toThrow('Invalid');
    expect(command).not.toHaveBeenCalled();
  });
  it('requires active kernel enforcement before creating metadata or volumes', async () => {
    const f = fixture();
    f.setFilesystem('ext4');
    await expect(f.manager().prepare(name, 256)).rejects.toThrow('XFS');
    expect(existsSync(path.join(f.root, 'quota-ownership.sqlite'))).toBe(false);
    f.setFilesystem('xfs');
    f.disableEnforcement();
    await expect(f.manager().prepare(name, 256)).rejects.toThrow('quotas');
    expect(f.volumes.size).toBe(0);
  });
  it('binds both saved directories to one verified quota and preserves their project across restarts', async () => {
    const f = fixture();
    await f.manager().prepare(name, 256);
    const project = f.command.mock.calls
      .find(([command, args]) => command === 'xfs_quota' && args.some((value) => value.startsWith('project -s')))![1][2]
      .split(' ')
      .at(-1);
    const firstCreate = f.command.mock.calls.findIndex(([command, args]) => command === 'docker' && args[1] === 'create');
    const verification = f.command.mock.calls.findIndex(([command, args]) => command === 'xfs_quota' && args.some((value) => value.startsWith('quota -p')));
    expect(firstCreate).toBeGreaterThan(verification);
    expect(f.volumes.size).toBe(2);
    expect(f.volumes.get(name + '-home')).toMatchObject({ Options: { device: path.join(f.root, name, 'home'), type: 'none', o: 'bind' } });
    await f.manager().prepare(name, 512);
    const projects = f.command.mock.calls
      .filter(([command, args]) => command === 'xfs_quota' && args.some((value) => value.startsWith('project -s')))
      .map(([, args]) => args[2].split(' ').at(-1));
    expect(projects).toEqual([project, project]);
    expect(f.command.mock.calls.filter(([command, args]) => command === 'docker' && args[1] === 'create')).toHaveLength(2);
    await expect(new QuotaVolumes(f.root, 'another-owner', f.command, 'linux').prepare(name, 256)).rejects.toThrow('another workspace');
  });
  it('retains legacy volume data and refuses adoption until migration is reconciled', async () => {
    const f = fixture(),
      legacy = { Driver: 'local', Options: {}, Labels: {} };
    f.volumes.set(name + '-workspace', legacy);
    await expect(f.manager().prepare(name, 256)).rejects.toThrow('migration');
    expect(f.volumes.get(name + '-workspace')).toBe(legacy);
    expect(f.command.mock.calls.some(([command, args]) => command === 'docker' && ['create', 'rm'].includes(args[1]))).toBe(false);
  });
  it('does not attach volumes if the native quota acknowledgement cannot be verified', async () => {
    const f = fixture();
    f.invalidateQuota();
    await expect(f.manager().prepare(name, 256)).rejects.toThrow('could not be verified');
    expect(f.volumes.size).toBe(0);
  });
  it('rejects a redirected root before any quota or Docker command', async () => {
    const f = fixture(),
      parent = mkdtempSync(path.join(os.tmpdir(), 'gitu-quota-alias-'));
    roots.push(parent);
    const alias = path.join(parent, 'alias');
    symlinkSync(f.root, alias, process.platform === 'win32' ? 'junction' : 'dir');
    await expect(new QuotaVolumes(alias, 'fixture-owner', f.command, 'linux').prepare(name, 256)).rejects.toThrow('direct quota directory');
    expect(f.command).not.toHaveBeenCalled();
  });
});
