import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import type { IncomingMessage } from 'node:http';
import path from 'node:path';
import type { Duplex } from 'node:stream';
import { WebSocket, WebSocketServer } from 'ws';
import { writeJson } from '../util.js';
import {
  encodePairBundle,
  LOCAL_LINK_PROTOCOL,
  MAX_LOCAL_LINK_HOPS,
  MAX_LOCAL_LINK_PAYLOAD_BYTES,
  normalizeLocalLinkPolicy,
  validateCloudLinkUrl,
  type LocalLinkAction,
  type LocalLinkAgentSummary,
  type LocalLinkBridge,
  type LocalLinkClientFrame,
  type LocalLinkHubFrame,
  type LocalLinkPeerStatus,
  type LocalLinkPolicy,
  type LocalLinkRequestOptions,
  type LocalLinkRpcResult,
} from './local-link-protocol.js';

const PAIR_CODE_TTL_MS = 5 * 60 * 1000;
const MAX_ACTIVE_PAIR_CODES = 5;
const PAIR_RATE_WINDOW_MS = 15 * 60 * 1000;
const PAIR_MAX_FAILURES = 10;
const HEARTBEAT_INTERVAL_MS = 25_000;
const DEFAULT_RPC_TIMEOUT_MS = 25_000;
const CHAT_RPC_TIMEOUT_MS = 90_000;

interface StoredPeerRecord {
  id: string;
  deviceName: string;
  tokenHash: string;
  createdAt: string;
  lastSeenAt?: string;
  platform?: string;
  hostname?: string;
}

interface HubStoreFile {
  version: 1;
  peers: StoredPeerRecord[];
}

interface PendingPairCode {
  code: string;
  expiresAt: number;
}

interface LivePeerSession {
  peerId: string;
  socket: WebSocket;
  connectedAt: string;
  missedPings: number;
  policy?: LocalLinkPolicy;
  sharedFolders?: string[];
  agents?: LocalLinkAgentSummary[];
  platform?: string;
  hostname?: string;
}

interface PendingRpc {
  peerId: string;
  socket: WebSocket;
  resolve: (result: LocalLinkRpcResult) => void;
  timer: NodeJS.Timeout;
  abortCleanup?: () => void;
}

function sha256Hex(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function formatPairCode(rawHex: string): string {
  const upper = rawHex.toUpperCase();
  const groups: string[] = [];
  for (let i = 0; i < upper.length; i += 4) {
    groups.push(upper.slice(i, i + 4));
  }
  return groups.join('-');
}

function normalizeCodeForCompare(code: string): string {
  return code.trim().toUpperCase();
}

function safeEqualStrings(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  return bufA.length === bufB.length && timingSafeEqual(bufA, bufB);
}

function sanitizeDeviceName(raw: unknown, fallback = 'Local PC'): string {
  if (typeof raw !== 'string') return fallback;
  const clean = raw.replace(/[\r\n\t\0]/g, ' ').trim().slice(0, 64);
  return clean || fallback;
}

export class LocalLinkHub {
  private readonly storePath: string;
  private peers: StoredPeerRecord[] = [];
  private readonly pairCodes: PendingPairCode[] = [];
  private readonly failedAttempts = new Map<string, { count: number; until: number }>();
  private readonly liveSessions = new Map<string, LivePeerSession>();
  private readonly pendingRpcs = new Map<string, PendingRpc>();
  private readonly wss: WebSocketServer;
  private heartbeatTimer?: NodeJS.Timeout;
  private closed = false;

  constructor(settingsDir: string) {
    this.storePath = path.join(settingsDir, 'local-link-hub.json');
    this.loadStore();
    this.wss = new WebSocketServer({
      noServer: true,
      maxPayload: MAX_LOCAL_LINK_PAYLOAD_BYTES,
      perMessageDeflate: false,
    });
    this.heartbeatTimer = setInterval(() => this.runHeartbeat(), HEARTBEAT_INTERVAL_MS);
    this.heartbeatTimer.unref?.();
  }

  private loadStore(): void {
    try {
      if (!existsSync(this.storePath)) return;
      const parsed = JSON.parse(readFileSync(this.storePath, 'utf8')) as Partial<HubStoreFile>;
      if (parsed.version !== 1 || !Array.isArray(parsed.peers)) return;
      this.peers = parsed.peers.filter(
        (peer): peer is StoredPeerRecord =>
          Boolean(
            peer &&
              typeof peer.id === 'string' &&
              peer.id &&
              typeof peer.deviceName === 'string' &&
              typeof peer.tokenHash === 'string' &&
              /^[a-f0-9]{64}$/i.test(peer.tokenHash) &&
              typeof peer.createdAt === 'string',
          ),
      );
    } catch {
      this.peers = [];
    }
  }

  private saveStore(): void {
    mkdirSync(path.dirname(this.storePath), { recursive: true, mode: 0o700 });
    const data: HubStoreFile = { version: 1, peers: this.peers };
    writeJson(this.storePath, data, { mode: 0o600 });
  }

  private pruneExpiredCodes(now = Date.now()): void {
    for (let i = this.pairCodes.length - 1; i >= 0; i--) {
      if (this.pairCodes[i]!.expiresAt <= now) {
        this.pairCodes.splice(i, 1);
      }
    }
  }

  createPairCode(cloudUrl: string): {
    code: string;
    expiresAt: string;
    cloudUrl: string;
    bundle: string;
  } {
    const validated = validateCloudLinkUrl(cloudUrl);
    if (!validated) {
      throw new Error('Cannot generate a link code without a valid HTTPS (or local) Cloud URL.');
    }
    const now = Date.now();
    this.pruneExpiredCodes(now);
    while (this.pairCodes.length >= MAX_ACTIVE_PAIR_CODES) {
      this.pairCodes.shift();
    }
    const code = formatPairCode(randomBytes(16).toString('hex'));
    const expiresAtMs = now + PAIR_CODE_TTL_MS;
    this.pairCodes.push({ code, expiresAt: expiresAtMs });
    return {
      code,
      expiresAt: new Date(expiresAtMs).toISOString(),
      cloudUrl: validated.origin,
      bundle: encodePairBundle(validated.origin, code),
    };
  }

  redeemPairCode(
    input: { code?: unknown; deviceName?: unknown; platform?: unknown; hostname?: unknown },
    remoteIp = 'unknown',
  ):
    | { ok: true; peerId: string; token: string; deviceName: string }
    | { ok: false; status: number; error: string } {
    const now = Date.now();
    const rate = this.failedAttempts.get(remoteIp);
    if (rate && rate.until > now && rate.count >= PAIR_MAX_FAILURES) {
      return {
        ok: false,
        status: 429,
        error: 'Too many invalid link attempts. Generate a fresh link code and try again later.',
      };
    }

    const rawCode = typeof input.code === 'string' ? normalizeCodeForCompare(input.code) : '';
    this.pruneExpiredCodes(now);

    let matchedIndex = -1;
    if (rawCode) {
      for (let i = 0; i < this.pairCodes.length; i++) {
        if (safeEqualStrings(rawCode, this.pairCodes[i]!.code)) {
          matchedIndex = i;
        }
      }
    }

    if (matchedIndex < 0) {
      const nextCount = rate && rate.until > now ? rate.count + 1 : 1;
      const until = rate && rate.until > now ? rate.until : now + PAIR_RATE_WINDOW_MS;
      this.failedAttempts.set(remoteIp, { count: nextCount, until });
      return { ok: false, status: 401, error: 'Invalid or expired link code.' };
    }

    // Single-use: consume the matched code immediately.
    this.pairCodes.splice(matchedIndex, 1);
    this.failedAttempts.delete(remoteIp);

    const peerId = `pc-${randomBytes(8).toString('hex')}`;
    const token = randomBytes(32).toString('hex');
    const hostname = typeof input.hostname === 'string' ? input.hostname.trim().slice(0, 64) : undefined;
    const platform = typeof input.platform === 'string' ? input.platform.trim().slice(0, 32) : undefined;
    const deviceName = sanitizeDeviceName(input.deviceName, hostname || 'Local PC');
    const nowIso = new Date().toISOString();

    this.peers.push({
      id: peerId,
      deviceName,
      tokenHash: sha256Hex(token),
      createdAt: nowIso,
      lastSeenAt: nowIso,
      ...(platform ? { platform } : {}),
      ...(hostname ? { hostname } : {}),
    });
    this.saveStore();

    return { ok: true, peerId, token, deviceName };
  }

  authenticateUpgrade(req: IncomingMessage): StoredPeerRecord | null {
    // Only native non-browser clients with Bearer credentials may connect here.
    if (req.headers.origin !== undefined) return null;
    const auth = req.headers.authorization;
    if (typeof auth !== 'string' || !auth.startsWith('Bearer ')) return null;
    const token = auth.slice(7).trim();
    if (!token || token.length < 32 || token.length > 256) return null;
    const presentedHash = Buffer.from(sha256Hex(token), 'hex');
    let matched: StoredPeerRecord | null = null;
    for (const peer of this.peers) {
      const storedHash = Buffer.from(peer.tokenHash, 'hex');
      if (storedHash.length === presentedHash.length && timingSafeEqual(presentedHash, storedHash)) {
        matched = peer;
      }
    }
    return matched;
  }

  handleUpgrade(req: IncomingMessage, socket: Duplex, head: Buffer, peer: StoredPeerRecord): void {
    if (this.closed) {
      socket.end('HTTP/1.1 503 Service Unavailable\r\nConnection: close\r\n\r\n');
      return;
    }
    this.wss.handleUpgrade(req, socket, head, (client) => {
      const existing = this.liveSessions.get(peer.id);
      if (existing) {
        this.rejectSocketRpcs(existing.socket, 'Local PC reconnected on a new session.');
        this.liveSessions.delete(peer.id);
        try {
          existing.socket.close(1000, 'Replaced by new connection');
        } catch {
          existing.socket.terminate();
        }
      }

      const session: LivePeerSession = {
        peerId: peer.id,
        socket: client,
        connectedAt: new Date().toISOString(),
        missedPings: 0,
        platform: peer.platform,
        hostname: peer.hostname,
      };
      this.liveSessions.set(peer.id, session);
      peer.lastSeenAt = session.connectedAt;
      this.saveStore();

      const welcome: LocalLinkHubFrame = {
        type: 'welcome',
        protocol: LOCAL_LINK_PROTOCOL,
        peerId: peer.id,
        deviceName: peer.deviceName,
      };
      this.sendFrame(client, welcome);

      client.on('pong', () => {
        session.missedPings = 0;
      });
      client.on('error', () => {
        this.cleanupSocket(peer.id, client);
      });
      client.on('close', () => {
        this.cleanupSocket(peer.id, client);
      });
      client.on('message', (raw) => {
        this.handleClientMessage(peer.id, session, raw);
      });
    });
  }

  private sendFrame(socket: WebSocket, frame: LocalLinkHubFrame): boolean {
    if (socket.readyState !== WebSocket.OPEN) return false;
    try {
      socket.send(JSON.stringify(frame));
      return true;
    } catch {
      return false;
    }
  }

  private handleClientMessage(peerId: string, session: LivePeerSession, raw: unknown): void {
    const active = this.liveSessions.get(peerId);
    if (!active || active.socket !== session.socket) return;

    let frame: LocalLinkClientFrame;
    try {
      frame = JSON.parse(String(raw)) as LocalLinkClientFrame;
    } catch {
      return;
    }
    if (!frame || typeof frame !== 'object') return;

    session.missedPings = 0;
    const peer = this.peers.find((item) => item.id === peerId);

    if (frame.type === 'pong') {
      if (peer) peer.lastSeenAt = new Date().toISOString();
      return;
    }

    if (frame.type === 'hello') {
      session.policy = normalizeLocalLinkPolicy(frame.policy);
      session.sharedFolders = Array.isArray(frame.sharedFolders)
        ? frame.sharedFolders.filter((item): item is string => typeof item === 'string').slice(0, 32)
        : [];
      session.agents = Array.isArray(frame.agents)
        ? frame.agents
            .filter(
              (item): item is LocalLinkAgentSummary =>
                Boolean(item && typeof item.id === 'string' && typeof item.name === 'string'),
            )
            .slice(0, 32)
            .map((item) => ({
              id: item.id,
              name: item.name,
              ...(typeof item.tagline === 'string' ? { tagline: item.tagline } : {}),
            }))
        : [];
      if (typeof frame.platform === 'string') session.platform = frame.platform.slice(0, 32);
      if (typeof frame.hostname === 'string') session.hostname = frame.hostname.slice(0, 64);
      if (peer) {
        if (typeof frame.deviceName === 'string' && frame.deviceName.trim()) {
          peer.deviceName = sanitizeDeviceName(frame.deviceName, peer.deviceName);
        }
        if (session.platform) peer.platform = session.platform;
        if (session.hostname) peer.hostname = session.hostname;
        peer.lastSeenAt = new Date().toISOString();
        this.saveStore();
      }
      return;
    }

    if (frame.type === 'result' && typeof frame.id === 'string') {
      const pending = this.pendingRpcs.get(frame.id);
      if (!pending || pending.socket !== session.socket) return;
      this.pendingRpcs.delete(frame.id);
      clearTimeout(pending.timer);
      pending.abortCleanup?.();
      pending.resolve({
        ok: Boolean(frame.ok),
        ...(typeof frame.output === 'string' ? { output: frame.output } : {}),
        ...(frame.data && typeof frame.data === 'object' && !Array.isArray(frame.data) ? { data: frame.data } : {}),
        ...(typeof frame.error === 'string' ? { error: frame.error } : {}),
      });
    }
  }

  private runHeartbeat(): void {
    const now = Date.now();
    for (const [peerId, session] of this.liveSessions) {
      if (session.socket.readyState !== WebSocket.OPEN) {
        this.cleanupSocket(peerId, session.socket);
        continue;
      }
      if (session.missedPings >= 2) {
        this.cleanupSocket(peerId, session.socket);
        try {
          session.socket.terminate();
        } catch {}
        continue;
      }
      session.missedPings += 1;
      try {
        session.socket.ping();
      } catch {}
      this.sendFrame(session.socket, { type: 'ping', ts: now });
    }
  }

  private cleanupSocket(peerId: string, socket: WebSocket): void {
    this.rejectSocketRpcs(socket, 'Local PC disconnected before finishing the request.');
    const current = this.liveSessions.get(peerId);
    if (current?.socket === socket) {
      this.liveSessions.delete(peerId);
    }
  }

  private rejectSocketRpcs(socket: WebSocket, error: string): void {
    for (const [id, pending] of this.pendingRpcs) {
      if (pending.socket !== socket) continue;
      this.pendingRpcs.delete(id);
      clearTimeout(pending.timer);
      pending.abortCleanup?.();
      pending.resolve({ ok: false, error });
    }
  }

  hasPairedPeer(): boolean {
    return this.peers.length > 0;
  }

  hasOnlinePeer(): boolean {
    for (const session of this.liveSessions.values()) {
      if (session.socket.readyState === WebSocket.OPEN) return true;
    }
    return false;
  }

  status(): { peers: LocalLinkPeerStatus[] } {
    return {
      peers: this.peers.map((peer) => {
        const live = this.liveSessions.get(peer.id);
        const online = Boolean(live && live.socket.readyState === WebSocket.OPEN);
        return {
          id: peer.id,
          deviceName: peer.deviceName,
          online,
          createdAt: peer.createdAt,
          ...(peer.lastSeenAt ? { lastSeenAt: peer.lastSeenAt } : {}),
          ...(online && live ? { connectedAt: live.connectedAt } : {}),
          ...(live?.platform ?? peer.platform ? { platform: live?.platform ?? peer.platform } : {}),
          ...(live?.hostname ?? peer.hostname ? { hostname: live?.hostname ?? peer.hostname } : {}),
          ...(online && live?.policy ? { policy: live.policy } : {}),
          ...(online && live?.sharedFolders ? { sharedFolders: live.sharedFolders } : {}),
          ...(online && live?.agents ? { agents: live.agents } : {}),
        };
      }),
    };
  }

  promptSummary(): string {
    if (this.peers.length === 0) return '';
    const lines = this.status().peers.map((peer) => {
      const state = peer.online ? 'ONLINE' : 'OFFLINE';
      const caps: string[] = [];
      if (peer.policy) {
        if (peer.policy.allowReadFiles) caps.push('read/search/pull files');
        if (peer.policy.allowWrites) caps.push('write/drop files');
        if (peer.policy.allowOpenUrl) caps.push('open URLs');
        if (peer.policy.allowCommands) caps.push('run commands');
        if (peer.policy.allowAgentChat) caps.push('ask local agent');
      }
      const folders = peer.sharedFolders?.length ? ` | folders: ${peer.sharedFolders.join(', ')}` : '';
      const agents = peer.agents?.length ? ` | local agents: ${peer.agents.map((a) => a.name).join(', ')}` : '';
      return `- ${peer.deviceName} (${peer.id}): ${state}${caps.length ? ` | allowed: ${caps.join(', ')}` : ''}${folders}${agents}`;
    });
    return (
      'DIRECT LOCAL PC LINK (lightweight direct link — use local_pc for fast file/status/URL/command actions without spinning up a local LLM, or ask_local_agent when local agent reasoning or browser context is needed):\n' +
      lines.join('\n')
    );
  }

  private resolveTargetPeer(selector?: string): { peer?: StoredPeerRecord; session?: LivePeerSession; error?: string } {
    if (this.peers.length === 0) {
      return { error: 'No Local PC is linked yet. Link one in Settings -> Local PC Link.' };
    }
    const clean = selector?.trim();
    if (clean) {
      const matched =
        this.peers.find((peer) => peer.id === clean) ??
        this.peers.find((peer) => peer.deviceName.toLowerCase() === clean.toLowerCase());
      if (!matched) {
        const names = this.peers.map((p) => `${p.deviceName} (${p.id})`).join(', ');
        return { error: `No linked Local PC matched "${clean}". Linked PCs: ${names}.` };
      }
      const session = this.liveSessions.get(matched.id);
      if (!session || session.socket.readyState !== WebSocket.OPEN) {
        return { error: `Local PC "${matched.deviceName}" is currently offline.` };
      }
      return { peer: matched, session };
    }

    // Default to any currently online peer (preferring the most recently seen).
    const onlinePeers = this.peers
      .map((peer) => ({ peer, session: this.liveSessions.get(peer.id) }))
      .filter((entry): entry is { peer: StoredPeerRecord; session: LivePeerSession } =>
        Boolean(entry.session && entry.session.socket.readyState === WebSocket.OPEN),
      )
      .sort((a, b) => (b.peer.lastSeenAt ?? '').localeCompare(a.peer.lastSeenAt ?? ''));

    if (onlinePeers.length === 0) {
      const names = this.peers.map((p) => p.deviceName).join(', ');
      return { error: `Linked Local PC (${names}) is currently offline.` };
    }
    return onlinePeers[0]!;
  }

  request(
    action: LocalLinkAction,
    params: Record<string, unknown>,
    opts?: LocalLinkRequestOptions,
  ): Promise<LocalLinkRpcResult> {
    if (this.closed) {
      return Promise.resolve({ ok: false, error: 'Local link hub is closed.' });
    }
    const hopCount = typeof opts?.hopCount === 'number' && Number.isFinite(opts.hopCount) ? opts.hopCount : 0;
    if (hopCount >= MAX_LOCAL_LINK_HOPS) {
      return Promise.resolve({ ok: false, error: 'Local link hop limit reached.' });
    }
    if (opts?.signal?.aborted) {
      return Promise.resolve({ ok: false, error: 'Local link request was cancelled.' });
    }
    const resolved = this.resolveTargetPeer(opts?.peer);
    if (!resolved.session || !resolved.peer) {
      return Promise.resolve({ ok: false, error: resolved.error ?? 'No online Local PC available.' });
    }

    const session = resolved.session;
    const id = randomUUID();
    const defaultTimeout = action === 'ask_local_agent' ? CHAT_RPC_TIMEOUT_MS : DEFAULT_RPC_TIMEOUT_MS;
    const timeoutMs =
      typeof opts?.timeoutMs === 'number' && Number.isFinite(opts.timeoutMs) && opts.timeoutMs > 0
        ? Math.min(opts.timeoutMs, 180_000)
        : defaultTimeout;

    return new Promise<LocalLinkRpcResult>((resolve) => {
      const cleanup = () => {
        clearTimeout(timer);
        if (opts?.signal && onAbort) {
          opts.signal.removeEventListener('abort', onAbort);
        }
      };

      const finish = (result: LocalLinkRpcResult) => {
        if (!this.pendingRpcs.delete(id)) return;
        cleanup();
        resolve(result);
      };

      const timer = setTimeout(() => {
        finish({ ok: false, error: `Local PC "${resolved.peer!.deviceName}" timed out after ${Math.round(timeoutMs / 1000)}s.` });
      }, timeoutMs);
      timer.unref?.();

      const onAbort = opts?.signal
        ? () => finish({ ok: false, error: 'Local link request was cancelled.' })
        : undefined;
      if (opts?.signal && onAbort) {
        opts.signal.addEventListener('abort', onAbort, { once: true });
      }

      this.pendingRpcs.set(id, {
        peerId: resolved.peer!.id,
        socket: session.socket,
        resolve,
        timer,
        abortCleanup: () => {
          if (opts?.signal && onAbort) {
            opts.signal.removeEventListener('abort', onAbort);
          }
        },
      });

      const frame: LocalLinkHubFrame = {
        type: 'request',
        id,
        action,
        params,
        ...(opts?.fromAgent ? { fromAgent: opts.fromAgent } : {}),
        hopCount: hopCount + 1,
      };

      if (!this.sendFrame(session.socket, frame)) {
        finish({ ok: false, error: `Could not send request to Local PC "${resolved.peer!.deviceName}".` });
      }
    });
  }

  async testPeer(peerId?: string): Promise<{ ok: boolean; latencyMs: number; output?: string; data?: Record<string, unknown>; error?: string }> {
    const start = Date.now();
    const res = await this.request('status', {}, { peer: peerId, timeoutMs: 10_000 });
    return {
      ...res,
      latencyMs: Date.now() - start,
    };
  }

  revokePeer(peerId: string): { ok: boolean; removed: boolean } {
    const idx = this.peers.findIndex((p) => p.id === peerId);
    if (idx < 0) return { ok: false, removed: false };
    this.peers.splice(idx, 1);
    this.saveStore();

    const session = this.liveSessions.get(peerId);
    if (session) {
      this.rejectSocketRpcs(session.socket, 'Local PC link was revoked.');
      this.liveSessions.delete(peerId);
      try {
        session.socket.close(4001, 'Revoked');
      } catch {
        session.socket.terminate();
      }
    }
    return { ok: true, removed: true };
  }

  asBridge(): LocalLinkBridge {
    return {
      hasPairedPeer: () => this.hasPairedPeer(),
      hasOnlinePeer: () => this.hasOnlinePeer(),
      promptSummary: () => this.promptSummary(),
      request: (action, params, opts) => this.request(action, params, opts),
    };
  }

  close(): void {
    this.closed = true;
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = undefined;
    }
    for (const [id, pending] of this.pendingRpcs) {
      this.pendingRpcs.delete(id);
      clearTimeout(pending.timer);
      pending.abortCleanup?.();
      pending.resolve({ ok: false, error: 'Cloud server is stopping.' });
    }
    for (const session of this.liveSessions.values()) {
      try {
        session.socket.terminate();
      } catch {}
    }
    this.liveSessions.clear();
    try {
      this.wss.close();
    } catch {}
  }
}
