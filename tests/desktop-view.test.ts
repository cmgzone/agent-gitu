import { runInNewContext } from 'node:vm';
import { describe, expect, it, vi } from 'vitest';
import { desktopView } from '../src/server/desktop-view.js';

function viewer() {
  const intervals = new Map<number, () => void>();
  const retries = new Map<number, () => void>();
  const pageEvents: Record<string, () => void> = {};
  const canvas = { width: 1280, height: 800 };
  const document = { hidden: false, getElementById: (id: string) => id === 'screen' ? { querySelector: () => canvas } : { hidden: false, textContent: '' } };
  const sockets: Channel[] = [], connections: Client[] = [];
  class Channel {
    static OPEN = 1;
    readyState = 1;
    bufferedAmount = 0;
    send = vi.fn();
    constructor(readonly url: string) { sockets.push(this); }
  }
  class Client {
    events: Record<string, () => void> = {};
    focus = vi.fn();
    disconnect = vi.fn(() => this.events.disconnect?.());
    constructor(_screen: unknown, readonly channel: Channel) { connections.push(this); }
    addEventListener(event: string, callback: () => void) { this.events[event] = callback; }
  }
  let sequence = 0;
  const script = desktopView('shared-agent').match(/<script type="module">([\s\S]*?)<\/script>/)![1]!.replace(/^import RFB from .*;$/m, '');
  runInNewContext(script, {
    RFB: Client, WebSocket: Channel, Uint8Array, DataView, document,
    location: { protocol: 'https:', host: 'gitu.example', origin: 'https://gitu.example' },
    parent: { postMessage: vi.fn() },
    addEventListener: (event: string, callback: () => void) => { pageEvents[event] = callback; },
    setInterval: (callback: () => void) => { const id = ++sequence; intervals.set(id, callback); return id; },
    clearInterval: (id: number) => intervals.delete(id),
    setTimeout: (callback: () => void) => { const id = ++sequence; retries.set(id, callback); return id; },
    clearTimeout: (id: number) => retries.delete(id),
  });
  return { intervals, retries, document, sockets, connections, canvas, pageEvents };
}

describe('live desktop update pipeline', () => {
  it('waits for authentication and RFB negotiation, then sends only incremental requests for the negotiated canvas', () => {
    const v = viewer();
    expect(v.intervals.size).toBe(0);
    expect(v.sockets[0]!.url).toBe('wss://gitu.example/api/cowork/agents/shared-agent/computer/vnc');
    expect(v.connections[0]!.channel).toBe(v.sockets[0]);
    v.connections[0]!.events.connect!();
    const tick = [...v.intervals.values()][0]!;
    tick();
    expect(Buffer.from(v.sockets[0]!.send.mock.calls[0]![0])).toEqual(Buffer.from([3, 1, 0, 0, 0, 0, 5, 0, 3, 32]));
    v.canvas.width = 1024; v.canvas.height = 640;
    tick();
    const packet = Buffer.from(v.sockets[0]!.send.mock.calls[1]![0]);
    expect(packet.readUInt16BE(6)).toBe(1024); expect(packet.readUInt16BE(8)).toBe(640);
  });

  it('pauses requests for background pages, closed channels and input backpressure', () => {
    const v = viewer(); v.connections[0]!.events.connect!();
    const tick = [...v.intervals.values()][0]!;
    v.document.hidden = true; tick();
    v.document.hidden = false; v.sockets[0]!.bufferedAmount = 9000; tick();
    v.sockets[0]!.bufferedAmount = 0; v.sockets[0]!.readyState = 3; tick();
    v.sockets[0]!.readyState = 1; v.canvas.width = 0; tick();
    expect(v.sockets[0]!.send).not.toHaveBeenCalled();
  });

  it('cleans up requests before reconnect and stops all work when the view closes', () => {
    const v = viewer(); v.connections[0]!.events.connect!();
    v.connections[0]!.events.disconnect!();
    expect(v.intervals.size).toBe(0); expect(v.retries.size).toBe(1);
    const retry = [...v.retries.values()][0]!; v.retries.clear(); retry();
    expect(v.sockets).toHaveLength(2);
    v.connections[1]!.events.connect!();
    [...v.intervals.values()][0]!();
    expect(v.sockets[0]!.send).not.toHaveBeenCalled(); expect(v.sockets[1]!.send).toHaveBeenCalledOnce();
    v.pageEvents.pagehide!();
    expect(v.intervals.size).toBe(0); expect(v.retries.size).toBe(0);
    expect(v.connections[1]!.disconnect).toHaveBeenCalledOnce();
  });
});
