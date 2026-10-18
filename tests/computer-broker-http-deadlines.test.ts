import { createServer, type Server, type RequestListener } from 'node:http';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Agent, Dispatcher, getGlobalDispatcher, setGlobalDispatcher } from 'undici';
import { computerExec } from '../src/cowork/computer.js';

let server: Server | undefined;
let agent: Agent | undefined;
const originalDispatcher = getGlobalDispatcher();
afterEach(async () => {
  vi.unstubAllEnvs();
  setGlobalDispatcher(originalDispatcher);
  await agent?.destroy();
  agent = undefined;
  server?.closeAllConnections();
  if (server) await new Promise<void>(resolve => server!.close(() => resolve()));
  server = undefined;
});

async function listen(handler: RequestListener): Promise<void> {
  server = createServer(handler);
  await new Promise<void>(resolve => server!.listen(0, '127.0.0.1', resolve));
  vi.stubEnv('AGENT_GITU_COMPUTER_BROKER_URL', `http://127.0.0.1:${(server.address() as { port: number }).port}`);
  vi.stubEnv('AGENT_GITU_COMPUTER_BROKER_KEY', 'disposable-broker-deadline-test-key');
}

describe('hosted desktop HTTP deadlines', () => {
  it('waits for slow response headers and body within the operation deadline', async () => {
    agent = new Agent();
    // Compress the transport's default five-minute cap to 25 ms. Explicitly
    // disabled transport caps remain disabled; the real operation lasts 150 ms.
    class ShortDefaultTimeout extends Dispatcher {
      override dispatch(options: Dispatcher.DispatchOptions, handler: Dispatcher.DispatchHandler): boolean {
        return agent!.dispatch({ ...options, headersTimeout: options.headersTimeout === 0 ? 0 : 25, bodyTimeout: options.bodyTimeout === 0 ? 0 : 25 }, handler);
      }
    }
    setGlobalDispatcher(new ShortDefaultTimeout());
    await listen((req, res) => {
      req.resume();
      setTimeout(() => {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.write('{"output":');
        setTimeout(() => res.end('"ready"}'), 75);
      }, 75);
    });
    expect(await computerExec(['info', '--format', '{{.ServerVersion}}'], undefined, undefined, 5000)).toBe('ready');
  });

  it.each(['deadline', 'caller'] as const)('still cancels an unfinished operation on %s', async kind => {
    let closed = false;
    let received!: () => void;
    const incoming = new Promise<void>(resolve => { received = resolve; });
    await listen((req, res) => { req.resume(); res.once('close', () => { closed = true; }); received(); });
    const controller = new AbortController();
    const work = computerExec(['info', '--format', '{{.ServerVersion}}'], undefined, controller.signal, kind === 'deadline' ? 150 : 5000);
    const failed = expect(work).rejects.toThrow();
    await incoming;
    if (kind === 'caller') controller.abort();
    await failed;
    await vi.waitFor(() => expect(closed).toBe(true));
  });

  it('does not follow a broker redirect with the private credential', async () => {
    let redirected = false;
    await listen((req, res) => {
      req.resume();
      if (req.url === '/execute') { res.writeHead(302, { location: '/other' }); res.end('{"error":"redirect refused"}'); }
      else { redirected = true; res.end('{"output":"unexpected"}'); }
    });
    await expect(computerExec(['info', '--format', '{{.ServerVersion}}'])).rejects.toThrow('redirect refused');
    expect(redirected).toBe(false);
  });
});
