export const LOCAL_LINK_PROTOCOL = 1;
export const MAX_LOCAL_LINK_HOPS = 4;
export const MAX_LOCAL_LINK_FILE_BYTES = 5 * 1024 * 1024;
export const MAX_LOCAL_LINK_PAYLOAD_BYTES = 12 * 1024 * 1024;

export type LocalLinkAction =
  | 'status'
  | 'list_files'
  | 'read_file'
  | 'search_files'
  | 'write_file'
  | 'pull_file'
  | 'drop_file'
  | 'open_url'
  | 'run_command'
  | 'ask_local_agent';

export interface LocalLinkPolicy {
  allowReadFiles: boolean;
  allowWrites: boolean;
  allowCommands: boolean;
  allowOpenUrl: boolean;
  allowAgentChat: boolean;
  allowedFolders: string[];
}

export const DEFAULT_LOCAL_LINK_POLICY: LocalLinkPolicy = {
  allowReadFiles: true,
  allowWrites: false,
  allowCommands: false,
  allowOpenUrl: true,
  allowAgentChat: true,
  allowedFolders: [],
};

export interface LocalLinkAgentSummary {
  id: string;
  name: string;
  tagline?: string;
}

export interface LocalLinkPeerStatus {
  id: string;
  deviceName: string;
  online: boolean;
  createdAt: string;
  lastSeenAt?: string;
  connectedAt?: string;
  platform?: string;
  hostname?: string;
  policy?: LocalLinkPolicy;
  sharedFolders?: string[];
  agents?: LocalLinkAgentSummary[];
}

export interface LocalLinkClientStatus {
  configured: boolean;
  enabled: boolean;
  connected: boolean;
  cloudUrl?: string;
  peerId?: string;
  deviceName: string;
  lastConnectedAt?: string;
  lastError?: string;
  policy: LocalLinkPolicy;
  sharedFolders: string[];
}

export interface LocalLinkRpcResult {
  ok: boolean;
  output?: string;
  data?: Record<string, unknown>;
  error?: string;
}

export interface LocalLinkRequestOptions {
  peer?: string;
  fromAgent?: string;
  timeoutMs?: number;
  hopCount?: number;
  signal?: AbortSignal;
}

export interface LocalLinkBridge {
  hasPairedPeer(): boolean;
  hasOnlinePeer(): boolean;
  promptSummary(): string;
  request(
    action: LocalLinkAction,
    params: Record<string, unknown>,
    opts?: LocalLinkRequestOptions,
  ): Promise<LocalLinkRpcResult>;
}

export type LocalLinkHubFrame =
  | {
      type: 'welcome';
      protocol: number;
      peerId: string;
      deviceName: string;
    }
  | {
      type: 'ping';
      ts: number;
    }
  | {
      type: 'request';
      id: string;
      action: LocalLinkAction;
      params: Record<string, unknown>;
      fromAgent?: string;
      hopCount?: number;
    };

export type LocalLinkClientFrame =
  | {
      type: 'hello';
      protocol: number;
      deviceName: string;
      platform: string;
      hostname: string;
      policy: LocalLinkPolicy;
      sharedFolders: string[];
      agents: LocalLinkAgentSummary[];
    }
  | {
      type: 'pong';
      ts: number;
    }
  | {
      type: 'result';
      id: string;
      ok: boolean;
      output?: string;
      data?: Record<string, unknown>;
      error?: string;
    };

const LOCAL_HTTP_HOSTS = new Set(['127.0.0.1', 'localhost', '[::1]']);

export function normalizeLocalLinkPolicy(raw: unknown): LocalLinkPolicy {
  const obj = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const foldersRaw = Array.isArray(obj['allowedFolders']) ? obj['allowedFolders'] : [];
  const seen = new Set<string>();
  const allowedFolders: string[] = [];
  for (const item of foldersRaw) {
    if (typeof item !== 'string') continue;
    const trimmed = item.trim();
    if (!trimmed || trimmed.includes('\0') || trimmed.length > 1024) continue;
    const key = process.platform === 'win32' ? trimmed.toLowerCase() : trimmed;
    if (seen.has(key)) continue;
    seen.add(key);
    allowedFolders.push(trimmed);
    if (allowedFolders.length >= 32) break;
  }
  return {
    allowReadFiles:
      typeof obj['allowReadFiles'] === 'boolean' ? obj['allowReadFiles'] : DEFAULT_LOCAL_LINK_POLICY.allowReadFiles,
    allowWrites:
      typeof obj['allowWrites'] === 'boolean' ? obj['allowWrites'] : DEFAULT_LOCAL_LINK_POLICY.allowWrites,
    allowCommands:
      typeof obj['allowCommands'] === 'boolean' ? obj['allowCommands'] : DEFAULT_LOCAL_LINK_POLICY.allowCommands,
    allowOpenUrl:
      typeof obj['allowOpenUrl'] === 'boolean' ? obj['allowOpenUrl'] : DEFAULT_LOCAL_LINK_POLICY.allowOpenUrl,
    allowAgentChat:
      typeof obj['allowAgentChat'] === 'boolean' ? obj['allowAgentChat'] : DEFAULT_LOCAL_LINK_POLICY.allowAgentChat,
    allowedFolders,
  };
}

export function validateCloudLinkUrl(raw: string): { origin: string; href: string } | null {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed || trimmed.length > 2048 || /[\s\0]/.test(trimmed)) return null;
  try {
    const parsed = new URL(trimmed);
    if (parsed.username || parsed.password) return null;
    const isLocalHttp = parsed.protocol === 'http:' && LOCAL_HTTP_HOSTS.has(parsed.hostname.toLowerCase());
    if (parsed.protocol !== 'https:' && !isLocalHttp) return null;
    return { origin: parsed.origin, href: parsed.toString() };
  } catch {
    return null;
  }
}

export function toLocalLinkWsUrl(cloudOrigin: string): string {
  const validated = validateCloudLinkUrl(cloudOrigin);
  if (!validated) throw new Error('Invalid Cloud Agent URL.');
  const url = new URL(validated.origin);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  url.pathname = '/api/local-link/ws';
  url.search = '';
  url.hash = '';
  return url.toString();
}

export function encodePairBundle(cloudOrigin: string, code: string): string {
  const validated = validateCloudLinkUrl(cloudOrigin);
  if (!validated) throw new Error('Invalid Cloud Agent URL.');
  return `gitu-link://v1?url=${encodeURIComponent(validated.origin)}&code=${encodeURIComponent(code.trim())}`;
}

export function parsePairInput(input: {
  bundle?: string;
  cloudUrl?: string;
  code?: string;
}): { ok: true; cloudUrl: string; code: string } | { ok: false; error: string } {
  const candidateBundle =
    typeof input.bundle === 'string' && input.bundle.trim()
      ? input.bundle.trim()
      : typeof input.cloudUrl === 'string' && input.cloudUrl.trim().toLowerCase().startsWith('gitu-link://')
        ? input.cloudUrl.trim()
        : '';

  if (candidateBundle) {
    if (!candidateBundle.toLowerCase().startsWith('gitu-link://')) {
      return { ok: false, error: 'Link bundle must start with gitu-link://.' };
    }
    try {
      const parsed = new URL(candidateBundle);
      const rawUrl = parsed.searchParams.get('url') ?? '';
      const rawCode = parsed.searchParams.get('code') ?? '';
      const validated = validateCloudLinkUrl(rawUrl);
      if (!validated) {
        return { ok: false, error: 'Link bundle contains an invalid Cloud Agent URL.' };
      }
      const cleanCode = rawCode.trim();
      if (!cleanCode) {
        return { ok: false, error: 'Link bundle is missing its pairing code.' };
      }
      return { ok: true, cloudUrl: validated.origin, code: cleanCode };
    } catch {
      return { ok: false, error: 'Invalid gitu-link:// bundle format.' };
    }
  }

  const rawUrl = typeof input.cloudUrl === 'string' ? input.cloudUrl.trim() : '';
  const rawCode = typeof input.code === 'string' ? input.code.trim() : '';
  const validated = validateCloudLinkUrl(rawUrl);
  if (!validated) {
    return {
      ok: false,
      error: 'Enter a valid Cloud Agent HTTPS URL (or paste a gitu-link:// bundle).',
    };
  }
  if (!rawCode) {
    return { ok: false, error: 'Enter the pairing code generated on your Cloud Agent.' };
  }
  return { ok: true, cloudUrl: validated.origin, code: rawCode };
}
