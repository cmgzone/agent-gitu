import { afterEach, describe, expect, it, vi } from 'vitest';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { readJson, sweepStaleTempFiles, writeJson } from '../src/util.js';
import { ensureGituHome } from '../src/workspace/home.js';
import { readRuntimeSelection, saveRuntimeSelection } from '../src/workspace/runtime-selection.js';

const folders: string[] = [];
const previousHome = process.env['AGENT_GITU_HOME'];
afterEach(() => {
  for (const folder of folders.splice(0)) rmSync(folder, { force: true, recursive: true });
  if (previousHome === undefined) delete process.env['AGENT_GITU_HOME'];
  else process.env['AGENT_GITU_HOME'] = previousHome;
  vi.restoreAllMocks();
});

function folder(): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'gitu-config-'));
  folders.push(dir);
  return dir;
}

/** Exactly the artifact found in the field: 105 NUL bytes, no readable data. */
function nulFile(file: string, bytes = 105): void {
  writeFileSync(file, Buffer.alloc(bytes));
}

describe('atomic configuration writes', () => {
  it('publishes complete JSON and keeps one recoverable backup', () => {
    const dir = folder();
    const file = path.join(dir, 'settings.json');
    writeJson(file, { a: 1 });
    writeJson(file, { a: 2 });
    expect(JSON.parse(readFileSync(file, 'utf8'))).toEqual({ a: 2 });
    // The backup mirrors the last good write, so a torn next write restores it.
    expect(JSON.parse(readFileSync(`${file}.bak`, 'utf8'))).toEqual({ a: 2 });
    // No temporary file survives a successful write.
    expect(readdirSync(dir).filter((name) => name.endsWith('.tmp'))).toEqual([]);
  });

  it('flushes the temporary file before renaming it into place', () => {
    // Without fsync the filesystem can publish a preallocated, unwritten file
    // that reads back as NUL bytes. Assert the flush happens before the rename.
    const dir = folder();
    const file = path.join(dir, 'settings.json');
    const order: string[] = [];
    const fs = require('node:fs') as typeof import('node:fs');
    const realFsync = fs.fsyncSync;
    const realRename = fs.renameSync;
    vi.spyOn(fs, 'fsyncSync').mockImplementation((fd: number) => {
      order.push('fsync');
      return realFsync(fd);
    });
    vi.spyOn(fs, 'renameSync').mockImplementation((from: string, to: string) => {
      order.push('rename');
      return realRename(from, to);
    });
    writeJson(file, { value: true });
    expect(order).toEqual(['fsync', 'rename']);
  });

  it('reclaims abandoned temporaries but never a live one', () => {
    const dir = folder();
    const stale = path.join(dir, 'proactivity.json.17852.1792962997839.603914.tmp');
    const live = path.join(dir, 'proactivity.json.99999.1.1.tmp');
    const keeper = path.join(dir, 'proactivity.json');
    nulFile(stale, 0);
    nulFile(live, 0);
    writeJson(keeper, { ok: true });
    const old = new Date(Date.now() - 6 * 60 * 60 * 1000);
    utimesSync(stale, old, old);

    expect(sweepStaleTempFiles(dir)).toBe(1);
    expect(existsSync(stale)).toBe(false);
    expect(existsSync(live)).toBe(true);
    expect(existsSync(keeper)).toBe(true);
  });
});

describe('corrupt configuration files', () => {
  it('treats a missing file as absent state without a warning', () => {
    const warn = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(readJson(path.join(folder(), 'never-written.json'))).toBeUndefined();
    expect(warn).not.toHaveBeenCalled();
  });

  it('quarantines a NUL-filled file and restores the known-good backup', () => {
    const warn = vi.spyOn(console, 'error').mockImplementation(() => {});
    const dir = folder();
    const file = path.join(dir, 'cowork.json');
    writeJson(file, { conversations: 3 });
    nulFile(file);

    expect(readJson<{ conversations: number }>(file)).toEqual({ conversations: 3 });
    // The damaged bytes are preserved for diagnosis, not deleted.
    expect(readdirSync(dir).some((name) => name.startsWith('cowork.json.corrupt-'))).toBe(true);
    expect(JSON.parse(readFileSync(file, 'utf8'))).toEqual({ conversations: 3 });
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('restored the previous known-good backup'));
  });

  it('never reads a NUL-filled file as "no saved state" without reporting it', () => {
    const warn = vi.spyOn(console, 'error').mockImplementation(() => {});
    const dir = folder();
    const file = path.join(dir, 'ledger.json');
    nulFile(file);
    expect(readJson(file)).toBeUndefined();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('moved aside as .corrupt'));
  });

  it('quarantines a truncated (unparseable) file instead of silently ignoring it', () => {
    const warn = vi.spyOn(console, 'error').mockImplementation(() => {});
    const dir = folder();
    const file = path.join(dir, 'tasks.json');
    writeFileSync(file, '{"schemaVersion": 1, "tas');
    expect(readJson(file)).toBeUndefined();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('could not be parsed'));
    expect(readdirSync(dir).some((name) => name.startsWith('tasks.json.corrupt-'))).toBe(true);
  });
});

describe('workspace project marker', () => {
  it('repairs a NUL-filled Workspace/package.json on boot', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const home = folder();
    process.env['AGENT_GITU_HOME'] = home;
    const marker = path.join(home, 'Workspace', 'package.json');
    require('node:fs').mkdirSync(path.dirname(marker), { recursive: true });
    nulFile(marker);

    const resolved = ensureGituHome();
    expect(resolved.workspace).toBe(path.join(home, 'Workspace'));
    // The 105-NUL file must come back as parseable project metadata: the
    // project guard depends on this marker to detect the workspace at all.
    expect(JSON.parse(readFileSync(marker, 'utf8'))).toMatchObject({ name: 'agent-gitu-workspace' });
  });

  it('sweeps abandoned temporaries from the settings directory on boot', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const home = folder();
    process.env['AGENT_GITU_HOME'] = home;
    const settings = path.join(home, 'Settings');
    require('node:fs').mkdirSync(settings, { recursive: true });
    const stale = path.join(settings, 'proactivity.json.17852.1792962997839.603914.tmp');
    nulFile(stale, 0);
    const old = new Date(Date.now() - 6 * 60 * 60 * 1000);
    utimesSync(stale, old, old);

    ensureGituHome();
    expect(existsSync(stale)).toBe(false);
  });
});

describe('runtime selection', () => {
  it('keeps working when its own file is corrupt', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const home = folder();
    process.env['AGENT_GITU_HOME'] = home;
    writeJson(path.join(home, 'Settings', 'runtime-selection.json'), { provider: 'deepseek', model: 'deepseek-flash', updatedAt: 'x' });
    nulFile(path.join(home, 'Settings', 'runtime-selection.json'));

    // A torn write must not erase the user's provider choice: the backup wins.
    expect(readRuntimeSelection()).toMatchObject({ provider: 'deepseek', model: 'deepseek-flash' });
  });

  it('refuses to persist an unusable provider selection', () => {
    process.env['AGENT_GITU_HOME'] = folder();
    expect(() => saveRuntimeSelection({ provider: 'bad provider!', model: 'm' })).toThrow('Choose a provider and model.');
  });
});
