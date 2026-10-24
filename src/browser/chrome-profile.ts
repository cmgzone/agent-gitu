import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { Duplex } from 'node:stream';
import { CoworkComputer, type ComputerExec, type ComputerStatus } from '../cowork/computer.js';

export interface ChromeProfileLocation {
  id: string;
  label: string;
}
export interface ChromeProfileTarget extends ChromeProfileLocation {
  execute: ComputerExec;
  stream(name: string, signal?: AbortSignal): Duplex | Promise<Duplex>;
}
type ProfileComputer = Pick<CoworkComputer, 'name' | 'status' | 'setControl' | 'start' | 'stop' | 'refreshStatus' | 'desktopInput'>;
export interface ChromeProfileSnapshot {
  state: ComputerStatus['state'];
  locationId: string;
  locations: ChromeProfileLocation[];
  error?: string;
  reason?: string;
}

/** A human-only full Chrome desktop. Never registered as an agent computer,
 * browser bridge or tool. No DevTools connection to the signed-in profile. */
export class ChromeProfileSession {
  private computer?: ProfileComputer;
  private target?: ChromeProfileTarget;
  private selected?: string;
  private opening?: Promise<void>;
  private abort?: AbortController;
  private revision = 0;
  private error?: string;
  private restored = false;
  private lastRefresh = 0;
  private readonly file: string;
  constructor(
    private readonly root: string,
    private readonly ownerId: string,
    private readonly locations: () => ChromeProfileLocation[],
    private readonly resolve: (id: string) => ChromeProfileTarget,
    private readonly factory: (id: string, root: string, target: ChromeProfileTarget) => ProfileComputer = (id, root, target) =>
      new CoworkComputer(id, root, target.execute, { key: 'chrome-profile:' + target.id, cloud: target.id !== 'local' }),
  ) {
    this.file = path.join(root, 'location.json');
    if (existsSync(this.file)) {
      try {
        const saved = JSON.parse(readFileSync(this.file, 'utf8')) as { locationId?: string };
        if (typeof saved.locationId === 'string' && saved.locationId.length <= 150) this.selected = saved.locationId;
      } catch {
        this.error = 'Chrome profile settings could not be read. Choose a computer server to continue.';
      }
    }
  }
  private bind(id: string): ProfileComputer {
    if (!this.locations().some((location) => location.id === id)) throw new Error('Choose an available Chrome computer server.');
    if (this.computer && this.target?.id === id) return this.computer;
    if (this.computer && !['stopped', 'unavailable'].includes(this.computer.status().state))
      throw new Error('Stop Chrome before changing computer servers. Your profile stays on its original server.');
    const target = this.resolve(id);
    const scope = createHash('sha256')
      .update(this.ownerId + ':' + id)
      .digest('hex')
      .slice(0, 24);
    const computer = this.factory('owner-chrome-' + scope, path.join(this.root, scope), target);
    computer.setControl('user', 'Private Chrome profile. Only the workspace owner can use this browser.');
    this.computer = computer;
    this.target = target;
    this.selected = id;
    return computer;
  }
  snapshot(): ChromeProfileSnapshot {
    const locations = this.locations(),
      status = this.computer?.status();
    return {
      state: this.error ? 'unavailable' : this.opening ? 'starting' : (status?.state ?? 'stopped'),
      locationId: this.selected ?? locations[0]?.id ?? '',
      locations,
      ...(this.error || status?.error ? { error: this.error ?? status?.error } : {}),
      ...(status?.reason ? { reason: status.reason } : {}),
    };
  }
  async refresh(): Promise<ChromeProfileSnapshot> {
    if (!this.restored) {
      this.restored = true;
      // GET never provisions a desktop. Only reconcile a previously selected one.
      if (this.selected) {
        try {
          this.bind(this.selected);
        } catch (error) {
          this.error = (error as Error).message;
        }
      }
    }
    if (this.computer && !this.opening && Date.now() - this.lastRefresh > 10000) {
      this.lastRefresh = Date.now();
      await this.computer.refreshStatus();
    }
    return this.snapshot();
  }
  start(locationId?: unknown): void {
    const id = locationId === undefined ? (this.selected ?? this.locations()[0]?.id) : locationId;
    if (typeof id !== 'string') throw new Error('Choose a Chrome computer server.');
    if (this.opening) {
      if (id !== this.selected) throw new Error('Stop Chrome before changing computer servers.');
      return;
    }
    const computer = this.bind(id);
    mkdirSync(this.root, { recursive: true, mode: 0o700 });
    writeFileSync(this.file + '.tmp', JSON.stringify({ version: 1, locationId: id }), { mode: 0o600 });
    renameSync(this.file + '.tmp', this.file);
    this.error = undefined;
    const revision = ++this.revision,
      abort = (this.abort = new AbortController());
    this.opening = (async () => {
      await computer.start(abort.signal);
      abort.signal.throwIfAborted();
      if (revision !== this.revision) return;
      const result = await computer.desktopInput({ action: 'launch', app: 'browser', requireGoogleChrome: true }, abort.signal);
      if (!result.ok) throw new Error(result.output);
    })()
      .catch(async (error) => {
        if (revision !== this.revision) return;
        this.error = (error as Error).message;
        // Never present Chromium/Edge as Google Chrome when Chrome is unavailable.
        await computer.stop().catch(() => {});
      })
      .finally(() => {
        if (revision === this.revision) {
          this.opening = undefined;
          this.abort = undefined;
        }
      });
  }
  async stop(): Promise<void> {
    this.revision++;
    this.abort?.abort(new Error('Chrome stopped by its owner.'));
    await this.computer?.stop();
    await this.opening;
    this.opening = undefined;
    this.abort = undefined;
    this.error = undefined;
  }
  async input(input: Record<string, unknown>): Promise<void> {
    if (!this.computer || this.snapshot().state !== 'running' || this.opening) throw new Error('Start Chrome before typing.');
    if (input['action'] !== 'type' && input['action'] !== 'key') throw new Error('Unsupported Chrome keyboard input.');
    if (input['action'] === 'type' && (typeof input['text'] !== 'string' || input['text'].length > 2000)) throw new Error('Type up to 2000 characters at a time.');
    if (input['action'] === 'key' && !['Tab', 'Return', 'BackSpace', 'Escape', 'ctrl+l', 'alt+Left'].includes(String(input['key']))) throw new Error('Unsupported Chrome key.');
    const result = await this.computer.desktopInput(input);
    if (!result.ok) throw new Error(result.output);
  }
  async stream(signal?: AbortSignal): Promise<Duplex> {
    if (!this.target || !this.computer || this.snapshot().state !== 'running' || this.opening) throw new Error('Start Chrome before opening its screen.');
    return this.target.stream(this.computer.name, signal);
  }
}
