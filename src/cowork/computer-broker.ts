import { createServer, type IncomingMessage } from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { WebSocketServer } from 'ws';
import { bridgeDesktop, localDesktopStream } from './desktop-stream.js';
import { COWORK_COMPUTER_IMAGE as IMAGE, MAX_COMPUTER_MESSAGE_BYTES, computerCreateArgs, dockerExec, type ComputerExec } from './computer.js';

const ASSETS = fileURLToPath(new URL('../../assets/cowork-computer/', import.meta.url));
const namePattern = /^gitu-cowork-[a-f0-9]{24}(?:-backup-\d{10,16})?$/;
const same = (a: string[], b: string[]) => JSON.stringify(a) === JSON.stringify(b);

/** A private, authenticated lifecycle gateway; never exposes the Docker API. */
export class ComputerBroker {
  constructor(
    private readonly owner: string,
    private readonly exec: ComputerExec = dockerExec,
  ) {
    if (!/^[a-zA-Z0-9_-]{8,100}$/.test(owner)) throw new Error('Set a valid desktop broker owner.');
  }
  async owned(name: string, signal?: AbortSignal): Promise<void> {
    signal?.throwIfAborted();
    if (!namePattern.test(name)) throw new Error('Invalid desktop container.');
    const label = await this.exec(['container', 'inspect', '--format', '{{index .Config.Labels "dev.agentgitu.broker"}}', name], undefined, signal, 15_000);
    if (label.trim() !== this.owner) throw new Error('This desktop does not belong to this workspace.');
  }
  async execute(args: unknown, input?: unknown, timeoutMs: unknown = 120_000, signal?: AbortSignal): Promise<string> {
    if (!Array.isArray(args) || args.length > 60 || args.some((a) => typeof a !== 'string' || a.length > 20_000)) throw new Error('Invalid desktop operation.');
    const argv = args as string[];
    if (input !== undefined && (typeof input !== 'string' || input.length > MAX_COMPUTER_MESSAGE_BYTES)) throw new Error('Invalid desktop input.');
    if (typeof timeoutMs !== 'number' || !Number.isSafeInteger(timeoutMs) || timeoutMs < 0 || (argv[0] !== 'exec' && (timeoutMs > 900_000 || timeoutMs === 0)))
      throw new Error('Invalid desktop deadline.');
    if (same(argv, ['info', '--format', '{{.ServerVersion}}']) || same(argv, ['image', 'inspect', IMAGE])) {
      return this.exec(argv, undefined, signal, 15_000);
    }
    if (same(argv, ['build', '-t', IMAGE, ASSETS])) return this.exec(argv, undefined, signal, 900_000);
    if (argv[0] === 'create') {
      const name = argv[2] ?? '';
      if (!/^gitu-cowork-[a-f0-9]{24}$/.test(name) || !same(argv, computerCreateArgs(name))) throw new Error('Unsafe desktop creation rejected.');
      return this.exec([...argv.slice(0, -1), '--label', `dev.agentgitu.broker=${this.owner}`, IMAGE], undefined, signal, 120_000);
    }
    if (argv[0] === 'container' && argv[1] === 'inspect' && argv[2] === '--format' && ['{{.Config.Image}}', '{{.State.Running}}', '{{.State.Status}}'].includes(argv[3]!) && argv.length === 5) {
      await this.owned(argv[4]!, signal);
      return this.exec(argv, undefined, signal, 15_000);
    }
    if (argv[0] === 'start' && argv.length === 2) {
      await this.owned(argv[1]!, signal);
      return this.exec(argv, undefined, signal, 120_000);
    }
    if (['pause', 'unpause'].includes(argv[0]!) && argv.length === 2) {
      await this.owned(argv[1]!, signal);
      return this.exec(argv, undefined, signal, 15_000);
    }
    if (argv[0] === 'stop' && argv.length === 4 && argv[1] === '--time' && argv[2] === '2') {
      await this.owned(argv[3]!, signal);
      return this.exec(argv, undefined, signal, 15_000);
    }
    if (argv[0] === 'rename' && argv.length === 3 && argv[2]!.startsWith(argv[1]! + '-backup-') && namePattern.test(argv[2]!)) {
      await this.owned(argv[1]!, signal);
      return this.exec(argv, undefined, signal, 15_000);
    }
    if (argv[0] === 'cp' && argv.length === 3 && argv[1] === path.join(ASSETS, 'server.cjs') && argv[2]!.endsWith(':/computer/server.cjs')) {
      await this.owned(argv[2]!.split(':')[0]!, signal);
      return this.exec(argv, undefined, signal, 15_000);
    }
    // The program runs as the image's unprivileged agent user in an owned sandbox.
    // No user, mount, network, capability, privilege or image flags can be supplied.
    const offset = argv[1] === '-i' ? 2 : 1;
    if (argv[0] === 'exec' && argv[offset + 1] === 'node' && argv[offset + 2] === '-e' && argv.length >= offset + 4 && argv.length <= offset + 5) {
      await this.owned(argv[offset]!, signal);
      return this.exec(argv, input as string | undefined, signal, timeoutMs);
    }
    throw new Error(`Unsupported desktop operation: ${argv.join(' ')}`);
  }
}

export function createComputerBrokerServer(key: string, owner: string, exec: ComputerExec = dockerExec) {
  if (key.length < 32 || key.length > 256) throw new Error('Set a strong desktop broker key.');
  const broker = new ComputerBroker(owner, exec);
  let active = 0;
  const authorized = (req: IncomingMessage) => {
    const header = req.headers.authorization ?? '';
    const expected = Buffer.from(`Bearer ${key}`);
    const supplied = Buffer.from(header);
    return expected.length === supplied.length && timingSafeEqual(expected, supplied);
  };
  const server = createServer(async (req, res) => {
    const send = (status: number, data: unknown) => {
      if (!res.destroyed) {
        res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' });
        res.end(JSON.stringify(data));
      }
    };
    if (req.url === '/healthz' && req.method === 'GET') {
      try {
        await broker.execute(['info', '--format', '{{.ServerVersion}}']);
        send(200, { ok: true });
      } catch {
        send(503, { ok: false });
      }
      return;
    }
    if (!authorized(req)) {
      send(401, { error: 'Private desktop authentication required.' });
      return;
    }
    if (req.url !== '/execute' || req.method !== 'POST') {
      send(404, { error: 'Route not found.' });
      return;
    }
    if (active >= 32) {
      send(429, { error: 'Private desktop runtime is busy.' });
      return;
    }
    const abort = new AbortController();
    res.once('close', () => {
      if (!res.writableEnded) abort.abort();
    });
    active++;
    try {
      let size = 0;
      const chunks: Buffer[] = [];
      for await (const chunk of req) {
        size += chunk.length;
        if (size > MAX_COMPUTER_MESSAGE_BYTES) throw new Error('Desktop request too large.');
        chunks.push(chunk);
      }
      const body = JSON.parse(Buffer.concat(chunks).toString('utf8')) as Record<string, unknown>;
      const output = await broker.execute(body['args'], body['input'], body['timeoutMs'], abort.signal);
      send(200, { output });
    } catch (error) {
      send(400, { error: (error as Error).message.slice(0, 8_000).replaceAll(key, '[redacted]') });
    } finally {
      active--;
    }
  });
  const sockets = new WebSocketServer({ noServer: true, perMessageDeflate: false, maxPayload: 1024 * 1024 });
  let pendingSockets = 0;
  server.on('upgrade', (req, socket, head) => {
    void (async () => {
      const reject = (code: number) => { socket.end(`HTTP/1.1 ${code} Rejected\r\nConnection: close\r\n\r\n`); };
      if (!authorized(req)) { reject(401); return; }
      const match = req.url?.match(/^\/desktop\/(gitu-cowork-[a-f0-9]{24})$/);
      if (!match) { reject(404); return; }
      if (sockets.clients.size + pendingSockets >= 16) { reject(429); return; }
      pendingSockets++;
      try {
        try { await broker.owned(match[1]!); } catch { reject(403); return; }
        if (socket.destroyed) return;
        sockets.handleUpgrade(req, socket, head, (client) => bridgeDesktop(client, localDesktopStream(match[1]!)));
      } finally { pendingSockets--; }
    })().catch(() => socket.destroy());
  });
  server.on('close', () => { for (const socket of sockets.clients) socket.terminate(); sockets.close(); });
  return server;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const server = createComputerBrokerServer(process.env['AGENT_GITU_COMPUTER_BROKER_KEY'] ?? '', process.env['AGENT_GITU_COMPUTER_BROKER_OWNER'] ?? '');
  server.listen(8787, '0.0.0.0', () => console.log('Private Gitu desktop runtime listening on 8787.'));
  process.on('SIGTERM', () => server.close(() => process.exit(0)));
}
