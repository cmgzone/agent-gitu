import { existsSync, mkdirSync, readFileSync, unlinkSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { WebSocket } from 'ws';
import { writeJson } from '../util.js';
import type { LocalLinkExecutor } from './local-link-executor.js';
import {
  DEFAULT_LOCAL_LINK_POLICY,
  LOCAL_LINK_PROTOCOL,
  MAX_LOCAL_LINK_PAYLOAD_BYTES,
  normalizeLocalLinkPolicy,
  parsePairInput,
  toLocalLinkWsUrl,
  validateCloudLinkUrl,
  type LocalLinkAgentSummary,
  type LocalLinkClientFrame,
  type LocalLinkClientStatus,
  type LocalLinkHubFrame,
  type LocalLinkPolicy,
} from './local-link-protocol.js';

const RECONNECT_DELAYS_MS = [1000, 2000, 5000, 10_000, 30_000];

interface StoredClientConfig {
  version: 1;
  enabled: boolean;
  cloudUrl: string;
  peerId: string;
  token: string;
  deviceName: string;
  policy: LocalLinkPolicy;
}

export interface LocalLinkClientDeps {
  settingsDir: string;
  executor: LocalLinkExecutor;
  listAgents: () => LocalLinkAgentSummary[];
  fetchImpl?: typeof globalThis.fetch;
}

function sanitizeDeviceName(raw: unknown, fallback: string): string {
  if (typeof raw !== 'string') return fallback;
  const clean = raw.replace(/[\r\n\t\0]/g, ' ').trim().slice(0, 64);
  return clean || fallback;
}

export class LocalLinkClient {
  private readonly configPath: string;
  private config: StoredClientConfig | null = null;
  private socket: WebSocket | null = null;
  private reconnectTimer?: NodeJS.Timeout;
  private reconnectAttempt = 0;
  private connected = false;
  private lastConnectedAt?: string;
  private lastError?: string;
  private lastHelloSignature = '';
  private closed = false;
  private connectWaiters: Array<(connected: boolean) => void> = [];

  constructor(private readonly deps: LocalLinkClientDeps) {
    this.configPath = path.join(deps.settingsDir, 'local-link-client.json');
    this.loadConfig();
  }

  private loadConfig(): void {
    try {
      if (!existsSync(this.configPath)) return;
      const parsed = JSON.parse(readFileSync(this.configPath, 'utf8')) as Partial<StoredClientConfig>;
      const validated = typeof parsed.cloudUrl === 'string' ? validateCloudLinkUrl(parsed.cloudUrl) : null;
      if (
        parsed.version !== 1 ||
        !validated ||
        typeof parsed.peerId !== 'string' ||
        !parsed.peerId ||
        typeof parsed.token !== 'string' ||
        parsed.token.length < 32
      ) {
        return;
      }
      this.config = {
        version: 1,
        enabled: parsed.enabled !== false,
        cloudUrl: validated.origin,
        peerId: parsed.peerId,
        token: parsed.token,
        deviceName: sanitizeDeviceName(parsed.deviceName, os.hostname() || 'Local PC'),
        policy: normalizeLocalLinkPolicy(parsed.policy),
      };
    } catch {
      this.config = null;
    }
  }

  private saveConfig(): void {
    if (!this.config) return;
    mkdirSync(path.dirname(this.configPath), { recursive: true, mode: 0o700 });
    writeJson(this.configPath, this.config, { mode: 0o600 });
  }

  getPolicy(): LocalLinkPolicy {
    return this.config?.policy ?? { ...DEFAULT_LOCAL_LINK_POLICY, allowedFolders: [] };
  }

  getDeviceName(): string {
    return this.config?.deviceName ?? (os.hostname() || 'Local PC');
  }

  status(): LocalLinkClientStatus {
    const policy = this.getPolicy();
    const sharedFolders = this.deps.executor.sharedFolders();
    if (!this.config) {
      return {
        configured: false,
        enabled: false,
        connected: false,
        deviceName: this.getDeviceName(),
        ...(this.lastError ? { lastError: this.lastError } : {}),
        policy,
        sharedFolders,
      };
    }
    return {
      configured: true,
      enabled: this.config.enabled,
      connected: this.connected,
      cloudUrl: this.config.cloudUrl,
      peerId: this.config.peerId,
      deviceName: this.config.deviceName,
      ...(this.lastConnectedAt ? { lastConnectedAt: this.lastConnectedAt } : {}),
      ...(this.lastError ? { lastError: this.lastError } : {}),
      policy,
      sharedFolders,
    };
  }

  async pairAndConnect(input: {
    bundle?: string;
    cloudUrl?: string;
    code?: string;
    deviceName?: string;
    policy?: Partial<LocalLinkPolicy>;
  }): Promise<{ ok: boolean; error?: string; client: LocalLinkClientStatus }> {
    const parsed = parsePairInput(input);
    if (!parsed.ok) {
      return { ok: false, error: parsed.error, client: this.status() };
    }
    const validated = validateCloudLinkUrl(parsed.cloudUrl);
    if (!validated) {
      return { ok: false, error: 'Invalid Cloud Agent URL.', client: this.status() };
    }

    const hostname = os.hostname() || 'Local PC';
    const deviceName = sanitizeDeviceName(input.deviceName, hostname);
    const fetchFn = this.deps.fetchImpl ?? globalThis.fetch;

    let response: Response;
    try {
      response = await fetchFn(`${validated.origin}/api/local-link/pair`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          code: parsed.code,
          deviceName,
          platform: process.platform,
          hostname,
        }),
        signal: AbortSignal.timeout(15_000),
      });
    } catch (err) {
      const msg = `Could not reach Cloud Agent at ${validated.origin}: ${(err as Error).message}`;
      this.lastError = msg;
      return { ok: false, error: msg, client: this.status() };
    }

    const data = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    if (!response.ok || data['ok'] === false || typeof data['token'] !== 'string' || typeof data['peerId'] !== 'string') {
      const msg = typeof data['error'] === 'string' ? data['error'] : `Pairing failed (HTTP ${response.status}).`;
      this.lastError = msg;
      return { ok: false, error: msg, client: this.status() };
    }

    this.closeSocketOnly();
    this.clearReconnectTimer();
    this.reconnectAttempt = 0;
    this.lastError = undefined;
    this.config = {
      version: 1,
      enabled: true,
      cloudUrl: validated.origin,
      peerId: data['peerId'],
      token: data['token'],
      deviceName: sanitizeDeviceName(data['deviceName'], deviceName),
      policy: normalizeLocalLinkPolicy(input.policy ?? this.config?.policy),
    };
    this.saveConfig();

    const waitConnect = this.waitForNextConnection(3000);
    this.start();
    await waitConnect;
    return { ok: true, client: this.status() };
  }

  start(): void {
    if (this.closed || !this.config || !this.config.enabled) return;
    if (this.socket && (this.socket.readyState === WebSocket.OPEN || this.socket.readyState === WebSocket.CONNECTING)) {
      return;
    }
    this.clearReconnectTimer();
    this.connectNow();
  }

  private connectNow(): void {
    if (this.closed || !this.config || !this.config.enabled) return;
    let wsUrl: string;
    try {
      wsUrl = toLocalLinkWsUrl(this.config.cloudUrl);
    } catch (err) {
      this.lastError = (err as Error).message;
      this.resolveConnectWaiters(false);
      return;
    }

    const activeConfig = this.config;
    const ws = new WebSocket(wsUrl, {
      headers: {
        Authorization: `Bearer ${activeConfig.token}`,
      },
      maxPayload: MAX_LOCAL_LINK_PAYLOAD_BYTES,
      perMessageDeflate: false,
    });
    this.socket = ws;

    ws.on('open', () => {
      if (this.socket !== ws || this.closed) {
        try {
          ws.close();
        } catch {}
        return;
      }
      this.reconnectAttempt = 0;
      this.connected = true;
      this.lastConnectedAt = new Date().toISOString();
      this.lastError = undefined;
      this.sendHello(ws, true);
      this.resolveConnectWaiters(true);
    });

    ws.on('message', (raw) => {
      if (this.socket !== ws || this.closed) return;
      void this.handleMessage(ws, raw);
    });

    ws.on('error', (err) => {
      if (this.socket !== ws) return;
      this.lastError = err.message || 'WebSocket connection error.';
    });

    ws.on('close', (code) => {
      if (this.socket !== ws) return;
      this.socket = null;
      this.connected = false;
      this.lastHelloSignature = '';
      this.resolveConnectWaiters(false);

      if (this.closed) return;
      if (code === 4001) {
        this.lastError = 'Link was revoked on the Cloud Agent. Pair again to reconnect.';
        if (this.config) this.config.enabled = false;
        return;
      }
      this.scheduleReconnect();
    });
  }

  private scheduleReconnect(): void {
    if (this.closed || !this.config || !this.config.enabled || this.reconnectTimer) return;
    const idx = Math.min(this.reconnectAttempt, RECONNECT_DELAYS_MS.length - 1);
    const delayMs = RECONNECT_DELAYS_MS[idx] ?? 30_000;
    this.reconnectAttempt += 1;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = undefined;
      this.connectNow();
    }, delayMs);
    this.reconnectTimer.unref?.();
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = undefined;
    }
  }

  private waitForNextConnection(timeoutMs: number): Promise<boolean> {
    if (this.connected) return Promise.resolve(true);
    return new Promise((resolve) => {
      let settled = false;
      const done = (ok: boolean) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(ok);
      };
      const timer = setTimeout(() => done(this.connected), timeoutMs);
      timer.unref?.();
      this.connectWaiters.push(done);
    });
  }

  private resolveConnectWaiters(connected: boolean): void {
    if (this.connectWaiters.length === 0) return;
    const waiters = this.connectWaiters.splice(0);
    for (const resolve of waiters) resolve(connected);
  }

  private buildHelloFrame(): LocalLinkClientFrame {
    return {
      type: 'hello',
      protocol: LOCAL_LINK_PROTOCOL,
      deviceName: this.getDeviceName(),
      platform: process.platform,
      hostname: os.hostname(),
      policy: this.getPolicy(),
      sharedFolders: this.deps.executor.sharedFolders(),
      agents: this.deps.listAgents().slice(0, 32),
    };
  }

  private sendHello(ws: WebSocket, force = false): void {
    if (ws.readyState !== WebSocket.OPEN) return;
    const frame = this.buildHelloFrame();
    const signature = JSON.stringify(frame);
    if (!force && signature === this.lastHelloSignature) return;
    this.lastHelloSignature = signature;
    this.sendFrame(ws, frame);
  }

  private sendFrame(ws: WebSocket, frame: LocalLinkClientFrame): void {
    if (ws.readyState !== WebSocket.OPEN) return;
    try {
      ws.send(JSON.stringify(frame));
    } catch {}
  }

  private async handleMessage(ws: WebSocket, raw: unknown): Promise<void> {
    let frame: LocalLinkHubFrame;
    try {
      frame = JSON.parse(String(raw)) as LocalLinkHubFrame;
    } catch {
      return;
    }
    if (!frame || typeof frame !== 'object') return;

    if (frame.type === 'welcome') {
      this.connected = true;
      return;
    }

    if (frame.type === 'ping') {
      this.sendFrame(ws, { type: 'pong', ts: frame.ts });
      this.sendHello(ws, false);
      return;
    }

    if (frame.type === 'request' && typeof frame.id === 'string') {
      try {
        const result = await this.deps.executor.execute(frame.action, frame.params ?? {}, {
          ...(typeof frame.fromAgent === 'string' ? { fromAgent: frame.fromAgent } : {}),
          ...(typeof frame.hopCount === 'number' ? { hopCount: frame.hopCount } : {}),
        });
        this.sendFrame(ws, {
          type: 'result',
          id: frame.id,
          ok: result.ok,
          ...(result.output !== undefined ? { output: result.output } : {}),
          ...(result.data !== undefined ? { data: result.data } : {}),
          ...(result.error !== undefined ? { error: result.error } : {}),
        });
      } catch (err) {
        const msg = (err as Error).message || 'Local execution crashed.';
        this.sendFrame(ws, {
          type: 'result',
          id: frame.id,
          ok: false,
          output: msg,
          error: msg,
        });
      }
    }
  }

  updatePolicy(patch: {
    enabled?: unknown;
    deviceName?: unknown;
    allowReadFiles?: unknown;
    allowWrites?: unknown;
    allowCommands?: unknown;
    allowOpenUrl?: unknown;
    allowAgentChat?: unknown;
    allowedFolders?: unknown;
  }): LocalLinkClientStatus {
    if (!this.config) {
      throw new Error('Connect this PC to a Cloud Agent first before changing link settings.');
    }
    const prevEnabled = this.config.enabled;
    if (typeof patch.enabled === 'boolean') {
      this.config.enabled = patch.enabled;
    }
    if (typeof patch.deviceName === 'string' && patch.deviceName.trim()) {
      this.config.deviceName = sanitizeDeviceName(patch.deviceName, this.config.deviceName);
    }
    this.config.policy = normalizeLocalLinkPolicy({
      ...this.config.policy,
      ...(typeof patch.allowReadFiles === 'boolean' ? { allowReadFiles: patch.allowReadFiles } : {}),
      ...(typeof patch.allowWrites === 'boolean' ? { allowWrites: patch.allowWrites } : {}),
      ...(typeof patch.allowCommands === 'boolean' ? { allowCommands: patch.allowCommands } : {}),
      ...(typeof patch.allowOpenUrl === 'boolean' ? { allowOpenUrl: patch.allowOpenUrl } : {}),
      ...(typeof patch.allowAgentChat === 'boolean' ? { allowAgentChat: patch.allowAgentChat } : {}),
      ...(patch.allowedFolders !== undefined ? { allowedFolders: patch.allowedFolders } : {}),
    });
    this.saveConfig();

    if (!this.config.enabled) {
      this.clearReconnectTimer();
      this.closeSocketOnly();
      this.connected = false;
    } else if (!prevEnabled || !this.socket || this.socket.readyState !== WebSocket.OPEN) {
      this.reconnectAttempt = 0;
      this.lastError = undefined;
      this.start();
    } else {
      this.sendHello(this.socket, true);
    }
    return this.status();
  }

  disconnect(clearConfig = true): LocalLinkClientStatus {
    this.clearReconnectTimer();
    this.closeSocketOnly();
    this.connected = false;
    this.lastHelloSignature = '';
    if (clearConfig) {
      this.config = null;
      this.lastConnectedAt = undefined;
      this.lastError = undefined;
      for (const file of [this.configPath, `${this.configPath}.bak`]) {
        try {
          if (existsSync(file)) unlinkSync(file);
        } catch {}
      }
    } else if (this.config) {
      this.config.enabled = false;
      this.saveConfig();
    }
    return this.status();
  }

  private closeSocketOnly(): void {
    const ws = this.socket;
    this.socket = null;
    this.connected = false;
    this.lastHelloSignature = '';
    if (!ws) return;
    try {
      ws.close(1000, 'Disconnecting');
    } catch {
      try {
        ws.terminate();
      } catch {}
    }
  }

  close(): void {
    this.closed = true;
    this.clearReconnectTimer();
    this.resolveConnectWaiters(false);
    const ws = this.socket;
    this.socket = null;
    this.connected = false;
    if (ws) {
      try {
        ws.terminate();
      } catch {}
    }
  }
}
