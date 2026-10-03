import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { Duplex } from 'node:stream';
import { fileURLToPath } from 'node:url';
import type { Client, ClientChannel, SFTPWrapper } from 'ssh2';
import { SshConnectionRegistry } from '../connections/ssh-connections.js';
import { deadline } from '../tools/command-timeout.js';
import { ComputerBroker } from './computer-broker.js';
import { MAX_COMPUTER_MESSAGE_BYTES, type ComputerExec } from './computer.js';
import { DESKTOP_BRIDGE } from './desktop-stream.js';

const ASSETS = fileURLToPath(new URL('../../assets/cowork-computer/', import.meta.url));
const ASSET_NAMES = ['Dockerfile', 'server.cjs', 'start-desktop.sh', 'open-browser.cjs', 'open-agent-browser.cjs', 'gitu-wallpaper.svg'];
type CloudRegistry = Pick<SshConnectionRegistry, 'get' | 'openClient'>;

function abortable<T>(operation: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) { void operation.catch(() => {}); return Promise.reject(signal.reason ?? new Error('Cloud desktop operation stopped.')); }
  return new Promise<T>((resolve, reject) => {
    const abort = () => reject(signal.reason ?? new Error('Cloud desktop operation stopped.'));
    signal.addEventListener('abort', abort, { once: true });
    operation.then(resolve, reject).finally(() => signal.removeEventListener('abort', abort));
  });
}

/** Every argument is a literal on the remote POSIX shell. Agent commands and
 *  file contents travel over stdin into the private container, never the host. */
export function cloudDockerCommand(args: string[]): string {
  if (args.some((arg) => arg.includes('\0'))) throw new Error('Invalid cloud computer argument.');
  return 'docker ' + args.map((arg) => "'" + arg.replaceAll("'", "'\\''") + "'").join(' ');
}

/** A saved SSH connection supplies authenticated, encrypted desktop transport.
 *  Docker/VNC stay private and lifecycle operations use the broker's existing
 *  whitelist and workspace ownership checks. One SSH session multiplexes calls
 *  and live screen/input streams to avoid repeated handshakes. */
export class CloudComputerTransport {
  private client?: Client;
  private opening?: Promise<Client>;
  private assets?: Promise<string>;
  private readonly broker: ComputerBroker;
  readonly owner: string;

  constructor(
    readonly connectionId: string,
    root: string,
    private readonly registry: CloudRegistry = new SshConnectionRegistry(),
  ) {
    this.owner = 'gitu-cloud-' + createHash('sha256').update(path.resolve(root) + ':' + connectionId).digest('hex').slice(0, 24);
    this.broker = new ComputerBroker(this.owner, this.remoteExec);
  }

  readonly execute: ComputerExec = (args, input, signal, timeoutMs = 120_000) => this.broker.execute(args, input, timeoutMs, signal);

  private async connected(): Promise<Client> {
    const profile = this.registry.get(this.connectionId);
    if (!profile?.hasCredential) throw new Error('The cloud server connection is missing. Add or reconnect it in the computer settings.');
    if (this.client) return this.client;
    if (!this.opening) {
      this.opening = this.registry.openClient(this.connectionId).then((client) => {
        this.client = client;
        const closed = () => { if (this.client === client) { this.client = undefined; this.assets = undefined; } };
        client.on('error', closed);
        client.once('close', closed);
        return client;
      }).finally(() => { this.opening = undefined; });
    }
    return this.opening;
  }

  /** Upload only the bundled, immutable build context into our own cache. */
  private prepareAssets(): Promise<string> {
    if (!this.assets) this.assets = this.uploadAssets().catch((error: unknown) => { this.assets = undefined; throw error; });
    return this.assets;
  }

  private async uploadAssets(): Promise<string> {
    const client = await this.connected();
    const files = ASSET_NAMES.map((name) => ({ name, contents: readFileSync(path.join(ASSETS, name)) }));
    const hash = createHash('sha256');
    for (const file of files) hash.update(file.name).update(file.contents);
    const digest = hash.digest('hex');
    const sftp = await new Promise<SFTPWrapper>((resolve, reject) => client.sftp((error, stream) => error ? reject(error) : resolve(stream)));
    try {
      const home = await new Promise<string>((resolve, reject) => sftp.realpath('.', (error, remotePath) => error ? reject(error) : resolve(remotePath)));
      if (!home.startsWith('/') || home.includes('\0')) throw new Error('Cloud server returned an invalid home directory.');
      let directory = home;
      for (const part of ['.cache', 'agent-gitu', this.owner, digest]) {
        directory = path.posix.join(directory, part);
        await new Promise<void>((resolve, reject) => sftp.mkdir(directory, { mode: 0o700 }, (error) => {
          if (!error) { resolve(); return; }
          sftp.lstat(directory, (statError, stat) => statError || !stat.isDirectory() ? reject(error) : resolve());
        }));
      }
      // These bundled files contain no credentials. COPY must leave them
      // readable by the container's unprivileged agent user.
      for (const file of files) await new Promise<void>((resolve, reject) => sftp.writeFile(path.posix.join(directory, file.name), file.contents, { mode: 0o644 }, (error) => error ? reject(error) : resolve()));
      return directory;
    } finally { sftp.end(); }
  }

  private readonly remoteExec: ComputerExec = async (args, input, signal, timeoutMs = 120_000) => {
    const timeout = new AbortController();
    const combined = signal ? AbortSignal.any([signal, timeout.signal]) : timeout.signal;
    const cancel = deadline(timeoutMs, () => timeout.abort(new Error('Cloud desktop operation timed out.')));
    try { return await abortable(this.runDocker(args, input, combined, timeoutMs), combined); }
    finally { cancel(); }
  };

  private readonly runDocker: ComputerExec = async (args, input, signal, timeoutMs = 120_000) => {
    signal?.throwIfAborted();
    const argv = [...args];
    if (argv[0] === 'build') argv[argv.length - 1] = await this.prepareAssets();
    if (argv[0] === 'cp') argv[1] = path.posix.join(await this.prepareAssets(), 'server.cjs');
    signal?.throwIfAborted();
    const channel = await this.channel(cloudDockerCommand(argv), signal);
    return new Promise<string>((resolve, reject) => {
      let output = '';
      let bytes = 0;
      let error = '';
      let settled = false;
      const finish = (failure?: Error, code?: number | null) => {
        if (settled) return;
        settled = true;
        cancelDeadline(); signal?.removeEventListener('abort', abort);
        if (failure) { channel.destroy(); reject(failure); }
        else if (code === 0) resolve(output);
        else reject(new Error(error.trim() || `Cloud desktop operation exited with code ${code ?? 'unknown'}.`));
      };
      const abort = () => finish(new Error('Cloud desktop operation stopped.'));
      const cancelDeadline = deadline(timeoutMs, () => finish(new Error('Cloud desktop operation timed out.')));
      signal?.addEventListener('abort', abort, { once: true });
      channel.setEncoding('utf8'); channel.stderr.setEncoding('utf8');
      channel.on('data', (chunk: string) => {
        bytes += Buffer.byteLength(chunk);
        if (bytes > MAX_COMPUTER_MESSAGE_BYTES) { finish(new Error('Cloud desktop transfer exceeded its size limit.')); return; }
        output += chunk;
      });
      channel.stderr.on('data', (chunk: string) => { error = (error + chunk).slice(-8_000); });
      channel.once('error', () => finish(new Error('Cloud desktop connection was interrupted.')));
      channel.once('close', (code: number | null) => finish(undefined, code));
      if (signal?.aborted) abort(); else channel.end(input ?? '');
    });
  };

  private async channel(command: string, signal?: AbortSignal): Promise<ClientChannel> {
    signal?.throwIfAborted();
    const client = await this.connected();
    signal?.throwIfAborted();
    return new Promise<ClientChannel>((resolve, reject) => {
      let settled = false;
      const cleanup = () => { client.removeListener('close', closed); signal?.removeEventListener('abort', aborted); };
      const fail = (error: Error) => { if (settled) return; settled = true; cleanup(); reject(error); };
      const closed = () => fail(new Error('Cloud desktop connection was interrupted.'));
      const aborted = () => fail(new Error('Cloud desktop operation stopped.'));
      client.once('close', closed); signal?.addEventListener('abort', aborted, { once: true });
      client.exec(command, (error, channel) => {
        if (error) { fail(new Error('Cloud server could not start the desktop operation.')); return; }
        if (settled || signal?.aborted) { channel.destroy(); aborted(); return; }
        settled = true; cleanup(); resolve(channel);
      });
    });
  }

  async desktopStream(name: string, signal?: AbortSignal): Promise<Duplex> {
    if (!/^gitu-cowork-[a-f0-9]{24}$/.test(name)) throw new Error('Invalid cloud desktop container.');
    const timeout = new AbortController();
    const combined = signal ? AbortSignal.any([signal, timeout.signal]) : timeout.signal;
    const cancel = deadline(15_000, () => timeout.abort(new Error('Cloud desktop connection timed out.')));
    const opening = async () => {
      await this.broker.owned(name, combined);
      const channel = await this.channel(cloudDockerCommand(['exec', '-i', name, 'node', '-e', DESKTOP_BRIDGE]), combined);
      channel.stderr.resume();
      return channel;
    };
    try { return await abortable(opening(), combined); }
    finally { cancel(); }
  }

  close(): void {
    const client = this.client;
    this.client = undefined; this.assets = undefined;
    client?.end();
    void this.opening?.then((connected) => connected.end()).catch(() => {});
  }
}
