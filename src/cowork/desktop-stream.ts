import { spawn } from 'node:child_process';
import { Duplex } from 'node:stream';
import WebSocket, { createWebSocketStream } from 'ws';

// Fixed loopback destination inside the unprivileged desktop. No caller can
// choose a host, port, executable, Docker flags or user for this tunnel.
export const DESKTOP_BRIDGE = "const s=require('node:net').connect(5900,'127.0.0.1');s.setNoDelay(true);s.on('error',()=>process.exit(1));s.on('close',()=>process.exit(0));process.stdin.pipe(s);s.pipe(process.stdout);process.stdin.on('end',()=>s.end());";
export function localDesktopStream(name: string): Duplex {
  if (!/^gitu-cowork-[a-f0-9]{24}$/.test(name)) throw new Error('Invalid desktop container.');
  const child = spawn('docker', ['exec', '-i', name, 'node', '-e', DESKTOP_BRIDGE], { windowsHide: true, stdio: ['pipe', 'pipe', 'ignore'] });
  const stream = Duplex.from({ readable: child.stdout, writable: child.stdin });
  child.once('error', (error) => stream.destroy(error));
  child.once('close', () => stream.destroy());
  stream.once('close', () => child.kill());
  return stream;
}

export function connectDesktopStream(name: string): Duplex {
  const broker = process.env['AGENT_GITU_COMPUTER_BROKER_URL'];
  if (!broker) return localDesktopStream(name);
  const key = process.env['AGENT_GITU_COMPUTER_BROKER_KEY'];
  if (!key || key.length < 32) throw new Error('Private desktop authentication is missing.');
  const url = new URL(broker);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) throw new Error('Invalid private desktop address.');
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  url.pathname = '/desktop/' + name;
  const socket = new WebSocket(url, { headers: { authorization: `Bearer ${key}` }, perMessageDeflate: false, maxPayload: 8 * 1024 * 1024, handshakeTimeout: 15_000 });
  return createWebSocketStream(socket);
}

/** Binary streams provide backpressure without buffering complete screenshots. */
export function bridgeDesktop(socket: WebSocket, desktop: Duplex): void {
  const client = createWebSocketStream(socket);
  const close = () => { desktop.destroy(); client.destroy(); };
  desktop.on('error', close); client.on('error', close);
  desktop.once('close', close); client.once('close', close);
  desktop.pipe(client); client.pipe(desktop);
  let alive = true;
  socket.on('pong', () => { alive = true; });
  const timer = setInterval(() => {
    if (!alive) { socket.terminate(); return; }
    alive = false; if (socket.readyState === WebSocket.OPEN) socket.ping();
  }, 30_000);
  timer.unref(); socket.once('close', () => clearInterval(timer));
}
