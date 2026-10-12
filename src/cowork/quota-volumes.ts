import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdirSync, realpathSync, lstatSync, existsSync, readFileSync, writeFileSync, chmodSync } from 'node:fs';
import { randomInt } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';

export type QuotaCommand = (command: string, args: string[], signal?: AbortSignal) => Promise<string>;
const execute: QuotaCommand = async (command, args, signal) =>
  (await promisify(execFile)(command, args, { encoding: 'utf8', timeout: 120000, maxBuffer: 1048576, signal, windowsHide: true })).stdout;
const unavailable =
  'Private computer disk quotas require a Linux computer server with an XFS volume mounted with project quotas, xfsprogs, and a quota administrator. Set AGENT_GITU_COMPUTER_QUOTA_ROOT on that computer server.';
const queues = new Map<string, Promise<unknown>>();

/** Kernel project quotas cover both persistent directories, including writes
 * made by arbitrary programs. Only this trusted provisioner uses host tools;
 * the desktop container never receives quota administration capabilities. */
export class QuotaVolumes {
  constructor(
    private readonly root: string | undefined,
    private readonly owner: string,
    private readonly command: QuotaCommand = execute,
    private readonly platform: NodeJS.Platform = process.platform,
  ) {}
  prepare(name: string, diskMb: number, signal?: AbortSignal): Promise<void> {
    if (!/^gitu-cowork-[a-f0-9]{24}$/.test(name) || !Number.isInteger(diskMb) || diskMb < 256 || diskMb > 1048576)
      return Promise.reject(new Error('Invalid private computer disk quota.'));
    if (this.platform !== 'linux' || !this.root) return Promise.reject(new Error(unavailable));
    if (!/^[a-zA-Z0-9_.:/\\-]+$/.test(this.root) || /\s/.test(this.owner) || !this.owner) return Promise.reject(new Error('Invalid quota server configuration.'));
    const key = path.resolve(this.root),
      prior = queues.get(key) ?? Promise.resolve();
    const task = prior.catch(() => {}).then(() => this.provision(name, diskMb, signal));
    queues.set(key, task);
    void task
      .finally(() => {
        if (queues.get(key) === task) queues.delete(key);
      })
      .catch(() => {});
    return task;
  }
  private async provision(name: string, diskMb: number, signal?: AbortSignal): Promise<void> {
    signal?.throwIfAborted();
    const root = path.resolve(this.root!);
    if (!existsSync(root) || realpathSync(root) !== root || !lstatSync(root).isDirectory()) throw new Error('Configure an existing, direct quota directory. ' + unavailable);
    const mounted = JSON.parse(await this.command('findmnt', ['--json', '--target', root, '--output', 'TARGET,FSTYPE,OPTIONS'], signal)) as {
      filesystems?: Array<{ target: string; fstype: string; options: string }>;
    };
    const filesystem = mounted.filesystems?.[0];
    if (
      !filesystem ||
      filesystem.fstype !== 'xfs' ||
      !filesystem.options.split(',').some((option) => ['prjquota', 'pquota'].includes(option)) ||
      !/^\/[a-zA-Z0-9_./-]+$/.test(filesystem.target)
    )
      throw new Error(unavailable);
    const state = await this.command('xfs_quota', ['-x', '-c', 'state -p', filesystem.target], signal);
    if (!/Enforcement:\s+ON/i.test(state)) throw new Error(unavailable);
    chmodSync(root, 0o700);
    const dbFile = path.join(root, 'quota-ownership.sqlite'),
      db = new DatabaseSync(dbFile);
    chmodSync(dbFile, 0o600);
    try {
      db.exec(
        'PRAGMA busy_timeout=5000; CREATE TABLE IF NOT EXISTS owner (value TEXT NOT NULL); CREATE TABLE IF NOT EXISTS desktops (name TEXT PRIMARY KEY, project INTEGER UNIQUE NOT NULL);',
      );
      db.exec('BEGIN IMMEDIATE');
      try {
        const current = db.prepare('SELECT value FROM owner LIMIT 1').get() as { value: string } | undefined;
        if (current && current.value !== this.owner) throw new Error('This quota directory belongs to another workspace.');
        if (!current) db.prepare('INSERT INTO owner(value) VALUES (?)').run(this.owner);
        let record = db.prepare('SELECT project FROM desktops WHERE name=?').get(name) as { project: number } | undefined;
        if (!record) {
          const report = await this.command('xfs_quota', ['-x', '-c', 'report -p -n -b', filesystem.target], signal);
          const occupied = new Set([...report.matchAll(/^\s*#?(\d+)\s+/gm)].map((match) => Number(match[1])));
          for (let attempt = 0; attempt < 32; attempt++) {
            const project = randomInt(100000, 2147483647);
            if (occupied.has(project) || db.prepare('SELECT name FROM desktops WHERE project=?').get(project)) continue;
            db.prepare('INSERT INTO desktops(name,project) VALUES (?,?)').run(name, project);
            record = { project };
            break;
          }
          if (!record) throw new Error('Could not allocate a private disk quota.');
        }
        db.exec('COMMIT');
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      }
      const project = (db.prepare('SELECT project FROM desktops WHERE name=?').get(name) as { project: number }).project;
      const directory = path.join(root, name),
        marker = path.join(directory, '.gitu-owner');
      const identity = JSON.stringify({ owner: this.owner, name, project });
      if (existsSync(directory)) {
        if (realpathSync(directory) !== directory || !lstatSync(directory).isDirectory() || !existsSync(marker) || readFileSync(marker, 'utf8') !== identity)
          throw new Error('The private disk directory needs ownership reconciliation.');
      } else {
        mkdirSync(directory, { mode: 0o700 });
        writeFileSync(marker, identity, { mode: 0o600, flag: 'wx' });
      }
      for (const role of ['workspace', 'home']) {
        const folder = path.join(directory, role),
          volume = name + '-' + role;
        if (existsSync(folder) && (realpathSync(folder) !== folder || !lstatSync(folder).isDirectory())) throw new Error('Unsafe private disk directory.');
        mkdirSync(folder, { recursive: true, mode: 0o700 });
        await this.command('chown', ['--no-dereference', '1001:1001', folder], signal);
        let existing: { Driver?: string; Options?: Record<string, string>; Labels?: Record<string, string> } | undefined;
        try {
          existing = JSON.parse(await this.command('docker', ['volume', 'inspect', '--format', '{{json .}}', volume], signal));
        } catch (error) {
          if (!/no such volume|not found/i.test((error as Error).message)) throw error;
        }
        if (
          existing &&
          (existing.Driver !== 'local' ||
            existing.Options?.['device'] !== folder ||
            existing.Options?.['type'] !== 'none' ||
            existing.Options?.['o'] !== 'bind' ||
            existing.Labels?.['dev.agentgitu.quota'] !== this.owner)
        )
          throw new Error('Existing private files need migration to quota-backed storage. They have been preserved.');
      }
      await this.command('xfs_quota', ['-x', '-c', 'project -s -p ' + directory + ' ' + project, filesystem.target], signal);
      await this.command('xfs_quota', ['-x', '-c', 'limit -p bsoft=' + diskMb + 'm bhard=' + diskMb + 'm ' + project, filesystem.target], signal);
      const quota = await this.command('xfs_quota', ['-x', '-c', 'quota -p -b -N ' + project, filesystem.target], signal);
      const numbers = quota.match(/^\s*\S+\s+(\d+)\s+(\d+)\s+(\d+)\s/m);
      if (!numbers || Number(numbers[3]) !== diskMb * 1024 || Number(numbers[1]) > diskMb * 1024)
        throw new Error('The kernel disk quota could not be verified or is smaller than the saved files.');
      for (const role of ['workspace', 'home']) {
        const folder = path.join(directory, role),
          volume = name + '-' + role;
        let present = false;
        try {
          await this.command('docker', ['volume', 'inspect', volume], signal);
          present = true;
        } catch (error) {
          if (!/no such volume|not found/i.test((error as Error).message)) throw error;
        }
        if (!present)
          await this.command(
            'docker',
            ['volume', 'create', '--driver', 'local', '--label', 'dev.agentgitu.quota=' + this.owner, '--opt', 'type=none', '--opt', 'o=bind', '--opt', 'device=' + folder, volume],
            signal,
          );
      }
    } finally {
      db.close();
    }
  }
}
