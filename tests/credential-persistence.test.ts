import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadStoredKeys, removeStoredKey, setStoredKey } from '../src/llm/keys.js';
import { ConnectionRegistry } from '../src/connections/connections.js';
import { ensureGituHome } from '../src/workspace/home.js';

const previousHome = process.env.AGENT_GITU_HOME;
const homes: string[] = [];
function home(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gitu-credential-'));
  homes.push(root);
  process.env.AGENT_GITU_HOME = root;
  ensureGituHome();
  return root;
}
afterEach(() => {
  vi.restoreAllMocks();
  if (previousHome === undefined) delete process.env.AGENT_GITU_HOME;
  else process.env.AGENT_GITU_HOME = previousHome;
  for (const root of homes.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

function child(script: string, root: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn(process.execPath, ['--import', 'tsx', '--input-type=module', '-e', script], {
      cwd: process.cwd(), env: { ...process.env, AGENT_GITU_HOME: root }, windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'],
    });
    let errors = '';
    proc.stderr.on('data', (chunk) => { errors += String(chunk); });
    proc.on('error', reject);
    proc.on('exit', (code) => code === 0 ? resolve() : reject(new Error(`Test writer failed: ${errors}`)));
  });
}

describe('saved credential durability', () => {
  it('keeps separate servers and accounts for the same provider instead of silently replacing their keys', () => {
    home();
    const registry = new ConnectionRegistry();
    const draft = { provider: 'test', label: 'Test', baseUrl: 'https://first.example.test', token: 'first-fixture',
      capabilities: ['items.read'], operations: [{ id: 'list', label: 'List', capability: 'items.read', method: 'GET' as const, path: '/items', risk: 'read' as const }] };
    const first = registry.save(draft);
    const second = registry.save({ ...draft, baseUrl: 'https://second.example.test', token: 'second-fixture' });
    const third = registry.save({ ...draft, label: 'Another account', token: 'third-fixture' });
    expect(new Set([first.id, second.id, third.id]).size).toBe(3);
    expect(new ConnectionRegistry().list()).toHaveLength(3);
    const keys = loadStoredKeys();
    for (const [profile, token] of [[first, 'first-fixture'], [second, 'second-fixture'], [third, 'third-fixture']] as const) {
      expect(keys[`GITU_CONNECTION_${profile.id.toUpperCase().replace(/-/g, '_')}`]).toBe(token);
    }
    expect(() => registry.save({ ...draft, baseUrl: 'https://third.example.test', token: undefined })).toThrow('API key or token is required');
    expect(registry.list()).toHaveLength(3);
  });

  it('retains every connection and key when separate processes save simultaneously, then reloads them', async () => {
    const root = home();
    await Promise.all(Array.from({ length: 4 }, (_, writer) => child(`
      import fs from 'node:fs';
      import { ConnectionRegistry } from './src/connections/connections.ts';
      const original = fs.readFileSync;
      const pause = new Int32Array(new SharedArrayBuffer(4));
      fs.readFileSync = function(file, ...args) {
        const value = original.call(fs, file, ...args);
        if (String(file).endsWith('keys.json') || String(file).endsWith('connections.json')) Atomics.wait(pause, 0, 0, 10);
        return value;
      };
      const registry = new ConnectionRegistry();
      for (let item = 0; item < 6; item++) registry.save({
        id: 'writer-${writer}-' + item, label: 'Test connection', provider: 'test',
        baseUrl: 'https://example.test', token: 'fixture-${writer}-' + item,
        capabilities: ['items.read'], operations: [{ id: 'list', label: 'List', capability: 'items.read', method: 'GET', path: '/items', risk: 'read' }],
      });
    `, root)));
    const reloaded = new ConnectionRegistry().list();
    expect(reloaded).toHaveLength(24);
    expect(reloaded.every((profile) => profile.hasCredential)).toBe(true);
    expect(Object.keys(loadStoredKeys()).filter((key) => key.startsWith('GITU_CONNECTION_WRITER_'))).toHaveLength(24);
  }, 30000);

  it('recovers the latest keys and connection metadata from protected backups after an interrupted write', () => {
    const root = home();
    const registry = new ConnectionRegistry();
    registry.save({ id: 'test', provider: 'test', label: 'Test', baseUrl: 'https://example.test', token: 'fixture-key',
      capabilities: ['items.read'], operations: [{ id: 'list', label: 'List', capability: 'items.read', method: 'GET', path: '/items', risk: 'read' }] });
    setStoredKey('TEST_OTHER_KEY', 'another-fixture');
    for (const file of ['keys.json', 'connections.json']) fs.writeFileSync(path.join(root, 'Settings', file), '{broken');
    expect(new ConnectionRegistry().list()[0]?.hasCredential).toBe(true);
    expect(loadStoredKeys().TEST_OTHER_KEY).toBe('another-fixture');
    setStoredKey('TEST_NEW_KEY', 'new-fixture');
    expect(loadStoredKeys().TEST_OTHER_KEY).toBe('another-fixture');
    expect(loadStoredKeys().TEST_NEW_KEY).toBe('new-fixture');
    if (process.platform !== 'win32') {
      expect(fs.statSync(path.join(root, 'Settings', 'keys.json')).mode & 0o777).toBe(0o600);
      expect(fs.statSync(path.join(root, 'Settings', 'keys.json.bak')).mode & 0o777).toBe(0o600);
    }
  });

  it('preserves unreadable files and never replaces them with an empty store or exposes parse errors', () => {
    const root = home();
    const file = path.join(root, 'Settings', 'keys.json');
    const broken = '{ "SECRET": "private-parser-fixture", broken';
    fs.writeFileSync(file, broken);
    fs.writeFileSync(`${file}.bak`, broken);
    const warn = vi.spyOn(console, 'warn');
    expect(() => setStoredKey('TEST_NEW_KEY', 'new')).toThrow('Existing files were preserved');
    expect(() => loadStoredKeys()).toThrow('Saved connection storage');
    expect(fs.readFileSync(file, 'utf8')).toBe(broken);
    expect(warn).not.toHaveBeenCalled();
  });

  it('leaves previous keys intact and reports failure if atomic replacement cannot complete', () => {
    const root = home();
    setStoredKey('TEST_OLD_KEY', 'old-fixture');
    const file = path.join(root, 'Settings', 'keys.json');
    const originalRename = fs.renameSync;
    const copy = vi.spyOn(fs, 'copyFileSync');
    vi.spyOn(fs, 'renameSync').mockImplementation((source, destination) => {
      if (destination === file) throw Object.assign(new Error('blocked'), { code: 'EACCES' });
      originalRename(source, destination);
    });
    expect(() => setStoredKey('TEST_NEW_KEY', 'new-fixture')).toThrow('Existing files were preserved');
    expect(loadStoredKeys().TEST_OLD_KEY).toBe('old-fixture');
    expect(loadStoredKeys().TEST_NEW_KEY).toBeUndefined();
    expect(copy).not.toHaveBeenCalled();
    expect(fs.readdirSync(path.dirname(file)).filter((name) => name.endsWith('.tmp'))).toEqual([]);
  });

  it('does not publish a configured connection after a failed key save', () => {
    const root = home();
    const file = path.join(root, 'Settings', 'keys.json');
    const originalRename = fs.renameSync;
    vi.spyOn(fs, 'renameSync').mockImplementation((source, destination) => {
      if (destination === file) throw Object.assign(new Error('full'), { code: 'ENOSPC' });
      originalRename(source, destination);
    });
    const registry = new ConnectionRegistry();
    expect(() => registry.save({ id: 'failed', provider: 'test', label: 'Failed', baseUrl: 'https://example.test', token: 'fixture',
      capabilities: ['items.read'], operations: [{ id: 'list', label: 'List', capability: 'items.read', method: 'GET', path: '/items', risk: 'read' }] })).toThrow('Existing files were preserved');
    expect(registry.list()).toEqual([]);
  });

  it('removes only the selected key and never resurrects it from the recovery backup', () => {
    const root = home();
    setStoredKey('TEST_REMOVE_KEY', 'removed-fixture');
    setStoredKey('TEST_KEEP_KEY', 'retained-fixture');
    removeStoredKey('TEST_REMOVE_KEY');
    fs.writeFileSync(path.join(root, 'Settings', 'keys.json'), '{broken');
    expect(loadStoredKeys().TEST_REMOVE_KEY).toBeUndefined();
    expect(loadStoredKeys().TEST_KEEP_KEY).toBe('retained-fixture');
  });
});
