import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { PassThrough } from 'node:stream';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ChromeProfileSession, type ChromeProfileTarget } from '../src/browser/chrome-profile.js';
import type { ComputerStatus } from '../src/cowork/computer.js';

const roots: string[] = [];
afterEach(() => {
  roots.splice(0).forEach((root) => rmSync(root, { recursive: true, force: true }));
});
function fixture() {
  const root = mkdtempSync(path.join(tmpdir(), 'gitu-chrome-profile-'));
  roots.push(root);
  const locations = [
    { id: 'hosted', label: 'Hosted server' },
    { id: 'ssh-fixture', label: 'My cloud' },
  ];
  let state: ComputerStatus['state'] = 'stopped';
  const socket = new PassThrough();
  const target: ChromeProfileTarget = { ...locations[0]!, execute: vi.fn(), stream: vi.fn(async () => socket) };
  const computer = {
    name: 'gitu-cowork-' + 'c'.repeat(24),
    status: vi.fn(() => ({ agentId: 'owner', name: 'fixture', state, control: 'user' as const, workspace: '/workspace' })),
    setControl: vi.fn(),
    start: vi.fn(async () => {
      state = 'running';
    }),
    stop: vi.fn(async () => {
      state = 'stopped';
    }),
    refreshStatus: vi.fn(async () => computer.status()),
    desktopInput: vi.fn(async () => ({ ok: true, output: 'Opened.' })),
  };
  const factory = vi.fn(() => computer),
    resolve = vi.fn((id: string) => ({ ...target, id }));
  const profile = new ChromeProfileSession(root, 'owner-id', () => locations, resolve, factory);
  return { root, profile, computer, factory, resolve, target, socket, locations };
}
describe('private owner Chrome profiles', () => {
  it('does not provision on read; launches regular Google Chrome in a separate persistent scope', async () => {
    const f = fixture();
    expect((await f.profile.refresh()).state).toBe('stopped');
    expect(f.computer.start).not.toHaveBeenCalled();
    expect(f.factory).not.toHaveBeenCalled();
    f.profile.start('hosted');
    await vi.waitFor(() => expect(f.profile.snapshot().state).toBe('running'));
    expect(f.computer.setControl).toHaveBeenCalledWith('user', expect.stringContaining('Only the workspace owner'));
    expect(f.computer.desktopInput).toHaveBeenCalledWith({ action: 'launch', app: 'browser', requireGoogleChrome: true }, expect.any(AbortSignal));
    const scope = createHash('sha256').update('owner-id:hosted').digest('hex').slice(0, 24);
    expect(f.factory).toHaveBeenCalledWith('owner-chrome-' + scope, path.join(f.root, scope), expect.objectContaining({ id: 'hosted' }));
    expect(await f.profile.stream()).toBe(f.socket);
    expect(f.target.stream).toHaveBeenCalledWith(f.computer.name, undefined);
    await f.profile.input({ action: 'type', text: 'private-owner-input' });
    expect(f.computer.desktopInput).toHaveBeenLastCalledWith({ action: 'type', text: 'private-owner-input' });
    await expect(f.profile.input({ action: 'launch', app: 'terminal' })).rejects.toThrow('Unsupported');
    await expect(f.profile.input({ action: 'key', key: 'exec evil' })).rejects.toThrow('Unsupported');
    expect(readFileSync(path.join(f.root, 'location.json'), 'utf8')).not.toContain('private-owner-input');
    await f.profile.stop();
    await expect(f.profile.stream()).rejects.toThrow('Start Chrome');
  });
  it('restores the same location/profile after restart and never falls back from a missing cloud server', async () => {
    const f = fixture();
    f.profile.start('ssh-fixture');
    await vi.waitFor(() => expect(f.profile.snapshot().state).toBe('running'));
    expect(() => f.profile.start('hosted')).toThrow('Stop Chrome');
    await f.profile.stop();
    const originalScope = f.factory.mock.calls[0];
    const restored = new ChromeProfileSession(f.root, 'owner-id', () => f.locations, f.resolve, f.factory);
    await restored.refresh();
    expect(f.factory.mock.calls.at(-1)).toEqual(originalScope);
    expect(restored.snapshot().locationId).toBe('ssh-fixture');
    const missing = new ChromeProfileSession(f.root, 'owner-id', () => [f.locations[0]!], f.resolve, f.factory);
    expect((await missing.refresh()).state).toBe('unavailable');
    expect(missing.snapshot().locationId).toBe('ssh-fixture');
    expect(() => missing.start('unknown')).toThrow('available');
  });
  it('reports missing native Chrome instead of silently substituting Chromium', async () => {
    const f = fixture();
    f.computer.desktopInput.mockResolvedValueOnce({ ok: false, output: 'Google Chrome requires an AMD64 server.' });
    f.profile.start('hosted');
    await vi.waitFor(() => expect(f.profile.snapshot()).toMatchObject({ state: 'unavailable', error: expect.stringContaining('AMD64') }));
    expect(f.computer.stop).toHaveBeenCalled();
    await expect(f.profile.stream()).rejects.toThrow('Start Chrome');
  });
  it('cancels startup and rejects keyboard input until the owner browser is ready', async () => {
    const f = fixture();
    let finish: () => void = () => {};
    f.computer.start.mockImplementationOnce(
      async () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    f.profile.start('hosted');
    expect(f.profile.snapshot().state).toBe('starting');
    await expect(f.profile.input({ action: 'type', text: 'private' })).rejects.toThrow('Start Chrome');
    const stopped = f.profile.stop();
    finish();
    await stopped;
    expect(f.computer.desktopInput).not.toHaveBeenCalled();
    expect(f.profile.snapshot().state).toBe('stopped');
  });
});
