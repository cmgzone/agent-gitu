import { runInNewContext } from 'node:vm';
import { describe, expect, it, vi } from 'vitest';
import { desktopView } from '../src/server/desktop-view.js';

function viewer(search = '') {
  const intervals = new Map<number, () => void>();
  const retries = new Map<number, () => void>();
  const pageEvents: Record<string, (event?: unknown) => void> = {};
  const parent = { postMessage: vi.fn() };
  const canvas = { width: 1280, height: 800 };
  const monitor = { style: {}, setAttribute: vi.fn(), textContent: '' };
  const document = { hidden: false, getElementById: (id: string) => id === 'screen' ? { querySelector: () => canvas, addEventListener: vi.fn() } : { hidden: false, textContent: '' }, createElement: () => monitor, body: { appendChild: vi.fn() } };
  const sockets: Channel[] = [], connections: Client[] = [];
  class Channel {
    static OPEN = 1;
    readyState = 1;
    bufferedAmount = 0;
    sent = vi.fn();
    send = this.sent;
    addEventListener = vi.fn();
    constructor(readonly url: string) { sockets.push(this); }
  }
  class Client {
    events: Record<string, () => void> = {};
    focus = vi.fn();
    sendKey = vi.fn();
    disconnect = vi.fn(() => this.events.disconnect?.());
    constructor(_screen: unknown, readonly channel: Channel) { connections.push(this); }
    addEventListener(event: string, callback: () => void) { this.events[event] = callback; }
  }
  let sequence = 0;
  const script = desktopView('shared-agent').match(/<script type="module">([\s\S]*?)<\/script>/)![1]!.replace(/^import RFB from .*;$/m, '');
  runInNewContext(script, {
    RFB: Client, WebSocket: Channel, Uint8Array, DataView, URLSearchParams, document,
    location: { protocol: 'https:', host: 'gitu.example', origin: 'https://gitu.example', search },
    parent,
    addEventListener: (event: string, callback: (event?: unknown) => void) => { pageEvents[event] = callback; },
    setInterval: (callback: () => void) => { const id = ++sequence; intervals.set(id, callback); return id; },
    clearInterval: (id: number) => intervals.delete(id),
    setTimeout: (callback: () => void) => { const id = ++sequence; retries.set(id, callback); return id; },
    clearTimeout: (id: number) => retries.delete(id),
    performance: { now: () => 0 },
  });
  return { intervals, retries, document, sockets, connections, canvas, pageEvents, parent, monitor };
}

describe('live desktop update pipeline', () => {
  it('keeps an inline preview read-only without taking focus or sending modifier keys', () => {
    const v=viewer('?preview=1');v.connections[0]!.events.connect!();
    const client=v.connections[0]! as Client & {viewOnly:boolean};
    expect(client.viewOnly).toBe(true);expect(client.focus).not.toHaveBeenCalled();
    v.pageEvents.message!({origin:'https://gitu.example',source:v.parent,data:{type:'gitu-desktop-control',action:'focus'}});
    expect(client.focus).not.toHaveBeenCalled();expect(client.sendKey).not.toHaveBeenCalled();
    v.pageEvents.pagehide!();expect(client.disconnect).toHaveBeenCalledOnce();
  });
  it('uses the native RFB update loop without extra requests outside diagnostic experiments', () => {
    for (const search of ['', '?pipeline=1', '?pipeline=0']) {
      const v = viewer(search); v.connections[0]!.events.connect!();
      expect(v.intervals.size).toBe(0);
      expect(v.sockets).toHaveLength(1);
      expect(v.sockets[0]!.sent).not.toHaveBeenCalled();
    }
  });
  it('counts transported input without recording typed text or changing wire bytes', () => {
    const v = viewer('?diagnostic'); v.connections[0]!.events.connect!();
    const channel = v.sockets[0]!;
    const packets = [new Uint8Array([4, 1, 0, 0, 0, 0, 0, 65]), new Uint8Array([5, 1, 0, 60, 0, 15]), new Uint8Array([5, 0, 0, 60, 0, 15])];
    packets.forEach(packet => channel.send(packet));
    channel.bufferedAmount = 42;
    [...v.intervals.values()][0]!();
    expect(channel.sent.mock.calls.map(([packet]) => packet)).toEqual(packets);
    expect(v.monitor.textContent).toContain('Sent: 1 keys / 2 pointers / 1 clicks');
    expect(v.monitor.textContent).toContain('Queued: 42 bytes / Pipeline: false');
    expect(v.monitor.textContent).not.toContain('65');
  });
  it('focuses the existing viewer and releases modifiers only for its same-origin parent', () => {
    const v = viewer(); v.connections[0]!.events.connect!();
    const client = v.connections[0]!;
    client.focus.mockClear();
    const data = { type: 'gitu-desktop-control', action: 'focus' };
    v.pageEvents.message!({ origin: 'https://evil.example', source: v.parent, data });
    v.pageEvents.message!({ origin: 'https://gitu.example', source: {}, data });
    expect(client.sendKey).not.toHaveBeenCalled(); expect(client.focus).not.toHaveBeenCalled();
    v.pageEvents.message!({ origin: 'https://gitu.example', source: v.parent, data });
    expect(client.focus).toHaveBeenCalledWith({ preventScroll: true });
    expect(client.sendKey).toHaveBeenCalledWith(0xffe3, 'ControlLeft', false);
    expect(client.sendKey).toHaveBeenCalledTimes(8);
    expect(v.sockets).toHaveLength(1); expect(client.disconnect).not.toHaveBeenCalled();
  });
  it('waits for authentication and RFB negotiation, then sends only incremental requests for the negotiated canvas', () => {
    const v = viewer('?diagnostic&pipeline=1');
    const monitor = [...v.intervals.keys()][0]!;
    expect(v.sockets[0]!.url).toBe('wss://gitu.example/api/cowork/agents/shared-agent/computer/vnc');
    expect(v.connections[0]!.channel).toBe(v.sockets[0]);
    v.connections[0]!.events.connect!();
    const tick = [...v.intervals.entries()].find(([id]) => id !== monitor)![1];
    tick();
    expect(Buffer.from(v.sockets[0]!.sent.mock.calls[0]![0])).toEqual(Buffer.from([3, 1, 0, 0, 0, 0, 5, 0, 3, 32]));
    v.canvas.width = 1024; v.canvas.height = 640;
    tick();
    const packet = Buffer.from(v.sockets[0]!.sent.mock.calls[1]![0]);
    expect(packet.readUInt16BE(6)).toBe(1024); expect(packet.readUInt16BE(8)).toBe(640);
  });

  it('pauses requests for background pages, closed channels and input backpressure', () => {
    const v = viewer('?diagnostic&pipeline=1'); v.connections[0]!.events.connect!();
    const tick = [...v.intervals.values()].at(-1)!;
    v.document.hidden = true; tick();
    v.document.hidden = false; v.sockets[0]!.bufferedAmount = 9000; tick();
    v.sockets[0]!.bufferedAmount = 0; v.sockets[0]!.readyState = 3; tick();
    v.sockets[0]!.readyState = 1; v.canvas.width = 0; tick();
    expect(v.sockets[0]!.sent).not.toHaveBeenCalled();
  });

  it('cleans up requests before reconnect and stops all work when the view closes', () => {
    const v = viewer(); v.connections[0]!.events.connect!();
    v.connections[0]!.events.disconnect!();
    expect(v.intervals.size).toBe(0); expect(v.retries.size).toBe(1);
    const retry = [...v.retries.values()][0]!; v.retries.clear(); retry();
    expect(v.sockets).toHaveLength(2);
    v.connections[1]!.events.connect!();
    expect(v.sockets[0]!.send).not.toHaveBeenCalled(); expect(v.sockets[1]!.send).not.toHaveBeenCalled();
    v.pageEvents.pagehide!();
    expect(v.intervals.size).toBe(0); expect(v.retries.size).toBe(0);
    expect(v.connections[1]!.disconnect).toHaveBeenCalledOnce();
  });
});
