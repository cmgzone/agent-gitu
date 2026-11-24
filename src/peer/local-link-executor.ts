import { exec, execFile } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ProjectGuard } from '../guard/project-guard.js';
import { toolListFiles, toolReadFile, toolSearchFiles, toolWriteFile, type ToolContext } from '../tools/tools.js';
import {
  MAX_LOCAL_LINK_FILE_BYTES,
  MAX_LOCAL_LINK_HOPS,
  type LocalLinkAction,
  type LocalLinkAgentSummary,
  type LocalLinkPolicy,
  type LocalLinkRpcResult,
} from './local-link-protocol.js';

const MAX_COMMAND_OUTPUT_CHARS = 32_768;

const MIME_BY_EXT: Record<string, string> = {
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.ts': 'text/typescript; charset=utf-8',
  '.tsx': 'text/typescript; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.jsx': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.cjs': 'text/javascript; charset=utf-8',
  '.py': 'text/x-python; charset=utf-8',
  '.csv': 'text/csv; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.pdf': 'application/pdf',
  '.yaml': 'text/yaml; charset=utf-8',
  '.yml': 'text/yaml; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
};

const TEXT_EXTENSIONS = new Set([
  '.txt',
  '.md',
  '.json',
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
  '.py',
  '.csv',
  '.html',
  '.css',
  '.svg',
  '.yaml',
  '.yml',
  '.xml',
  '.sql',
  '.sh',
  '.ps1',
  '.go',
  '.rs',
  '.toml',
  '.log',
]);

export interface LocalLinkExecutorDeps {
  getPolicy: () => LocalLinkPolicy;
  getDeviceName: () => string;
  getDefaultWorkspace: () => string;
  getForbiddenDirs: () => string[];
  getActiveProjectPath?: () => string | undefined;
  listAgents: () => LocalLinkAgentSummary[];
  askLocalAgent: (params: {
    prompt: string;
    agent?: string;
    fromAgent?: string;
    hopCount: number;
    signal?: AbortSignal;
  }) => Promise<LocalLinkRpcResult>;
  openUrlImpl?: (url: string) => Promise<void>;
}

function foldPath(value: string): string {
  return process.platform === 'win32' ? value.toLowerCase() : value;
}

function isWithin(root: string, candidate: string): boolean {
  const rel = path.relative(foldPath(root), foldPath(candidate));
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

function hasHermesSegment(absPath: string): boolean {
  return absPath
    .split(path.sep)
    .some((segment) => segment.toLowerCase() === '.hermes');
}

function canonicalExistingOrResolved(targetPath: string): string {
  const abs = path.resolve(targetPath);
  if (existsSync(abs)) {
    try {
      return realpathSync(abs);
    } catch {
      return abs;
    }
  }
  return abs;
}

function canonicalProspective(targetPath: string): string {
  let probe = path.resolve(targetPath);
  const tail: string[] = [];
  for (;;) {
    if (existsSync(probe)) {
      let realBase = probe;
      try {
        realBase = realpathSync(probe);
      } catch {
        realBase = path.resolve(probe);
      }
      return tail.length > 0 ? path.join(realBase, ...tail.reverse()) : realBase;
    }
    const parent = path.dirname(probe);
    if (parent === probe) return path.resolve(targetPath);
    tail.push(path.basename(probe));
    probe = parent;
  }
}

function defaultOpenUrl(url: string): Promise<void> {
  return new Promise((resolve, reject) => {
    let command = 'xdg-open';
    let args = [url];
    if (process.platform === 'win32') {
      command = 'rundll32.exe';
      args = ['url.dll,FileProtocolHandler', url];
    } else if (process.platform === 'darwin') {
      command = 'open';
      args = [url];
    }
    execFile(command, args, { windowsHide: true }, (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

function capOutput(text: string): string {
  if (text.length <= MAX_COMMAND_OUTPUT_CHARS) return text;
  return `${text.slice(0, MAX_COMMAND_OUTPUT_CHARS)}\n[... output truncated at ${MAX_COMMAND_OUTPUT_CHARS} chars]`;
}

export class LocalLinkExecutor {
  constructor(private readonly deps: LocalLinkExecutorDeps) {}

  private forbiddenRoots(): string[] {
    return this.deps
      .getForbiddenDirs()
      .filter((dir) => typeof dir === 'string' && dir.trim())
      .map((dir) => canonicalExistingOrResolved(dir));
  }

  private defaultWorkspaceRoot(): string {
    const raw = this.deps.getDefaultWorkspace();
    mkdirSync(raw, { recursive: true });
    return canonicalExistingOrResolved(raw);
  }

  sharedFolders(): string[] {
    const forbidden = this.forbiddenRoots();
    const candidates = [
      this.defaultWorkspaceRoot(),
      this.deps.getActiveProjectPath?.(),
      ...this.deps.getPolicy().allowedFolders,
    ];
    const seen = new Set<string>();
    const out: string[] = [];
    for (const raw of candidates) {
      if (typeof raw !== 'string' || !raw.trim()) continue;
      const abs = path.resolve(raw.trim());
      if (!existsSync(abs)) continue;
      let st;
      try {
        st = statSync(abs);
      } catch {
        continue;
      }
      if (!st.isDirectory()) continue;
      let real: string;
      try {
        real = realpathSync(abs);
      } catch {
        continue;
      }
      if (hasHermesSegment(real) || forbidden.some((f) => isWithin(f, real))) continue;
      const key = foldPath(real);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(real);
    }
    return out;
  }

  private resolveSafePath(rawPath: string, forWrite: boolean): { path: string; matchedRoot: string; allowedRoots: string[] } {
    if (typeof rawPath !== 'string' || !rawPath.trim() || rawPath.includes('\0')) {
      throw new Error('A valid non-empty file or folder path is required.');
    }
    const allowedRoots = this.sharedFolders();
    const defaultRoot = this.defaultWorkspaceRoot();
    const trimmed = rawPath.trim();
    const candidate = path.isAbsolute(trimmed) ? path.resolve(trimmed) : path.resolve(defaultRoot, trimmed);
    const forbidden = this.forbiddenRoots();

    if (hasHermesSegment(candidate) || forbidden.some((f) => isWithin(f, candidate))) {
      throw new Error(`Access denied: "${rawPath}" points to protected Agent Gitu state.`);
    }

    const realTarget = forWrite ? canonicalProspective(candidate) : canonicalProspective(candidate);
    if (hasHermesSegment(realTarget) || forbidden.some((f) => isWithin(f, realTarget))) {
      throw new Error(`Access denied: "${rawPath}" resolves into protected Agent Gitu state.`);
    }

    const matchedRoot = allowedRoots.find((root) => isWithin(root, realTarget));
    if (!matchedRoot) {
      throw new Error(
        `Access denied: "${rawPath}" is outside your shared local folders. Add the folder in Settings -> Local PC Link if you want to share it.`,
      );
    }
    return { path: realTarget, matchedRoot, allowedRoots };
  }

  private createToolContext(matchedRoot: string, allowedRoots: string[]): ToolContext {
    const baseGuard = ProjectGuard.detect(matchedRoot, { allowUnmarked: true });
    baseGuard.setTaggedReadFolders(() => allowedRoots);
    baseGuard.setTaggedWriteFolders(() => allowedRoots);
    const guard = Object.create(baseGuard) as ProjectGuard;
    guard.assertReadable = (absPath: string) => {
      this.resolveSafePath(absPath, false);
      baseGuard.assertReadable(absPath);
    };
    guard.assertReadableAsync = async (absPath: string) => {
      this.resolveSafePath(absPath, false);
      await baseGuard.assertReadableAsync(absPath);
    };
    guard.assertInside = (absPath: string) => {
      this.resolveSafePath(absPath, true);
      baseGuard.assertInside(absPath);
    };
    return {
      cwd: matchedRoot,
      guard,
    };
  }

  async execute(
    action: LocalLinkAction,
    params: Record<string, unknown>,
    meta: { fromAgent?: string; hopCount?: number; signal?: AbortSignal } = {},
  ): Promise<LocalLinkRpcResult> {
    const policy = this.deps.getPolicy();

    try {
      switch (action) {
        case 'status': {
          const sharedFolders = this.sharedFolders();
          const agents = this.deps.listAgents();
          const data: Record<string, unknown> = {
            deviceName: this.deps.getDeviceName(),
            platform: process.platform,
            hostname: os.hostname(),
            uptimeSec: Math.round(os.uptime()),
            policy,
            sharedFolders,
            agents,
          };
          return {
            ok: true,
            output: `Online: ${this.deps.getDeviceName()} (${process.platform}/${os.hostname()}). Shared folders: ${sharedFolders.join(', ')}.`,
            data,
          };
        }

        case 'list_files': {
          if (!policy.allowReadFiles) {
            return { ok: false, error: 'Reading local files is disabled on this PC (allowReadFiles = false).' };
          }
          const rawPath = typeof params['path'] === 'string' ? params['path'].trim() : '';
          if (!rawPath) {
            const folders = this.sharedFolders();
            const defaultRoot = this.defaultWorkspaceRoot();
            const activeProject = this.deps.getActiveProjectPath?.();
            const lines = folders.map((folder) => {
              const label =
                foldPath(folder) === foldPath(defaultRoot)
                  ? 'workspace'
                  : activeProject && foldPath(folder) === foldPath(canonicalExistingOrResolved(activeProject))
                    ? 'active-project'
                    : 'shared-folder';
              return `- [${label}] ${folder}`;
            });
            return {
              ok: true,
              output: lines.join('\n') || '(no shared local folders)',
              data: { sharedFolders: folders },
            };
          }
          const safe = this.resolveSafePath(rawPath, false);
          const ctx = this.createToolContext(safe.matchedRoot, safe.allowedRoots);
          const result = toolListFiles(ctx, { ...params, path: safe.path });
          return { ok: result.ok, output: result.output, ...(result.ok ? {} : { error: result.output }) };
        }

        case 'read_file': {
          if (!policy.allowReadFiles) {
            return { ok: false, error: 'Reading local files is disabled on this PC (allowReadFiles = false).' };
          }
          const rawPath = typeof params['path'] === 'string' ? params['path'] : '';
          const safe = this.resolveSafePath(rawPath, false);
          const ctx = this.createToolContext(safe.matchedRoot, safe.allowedRoots);
          const result = toolReadFile(ctx, { ...params, path: safe.path });
          return { ok: result.ok, output: result.output, ...(result.ok ? {} : { error: result.output }) };
        }

        case 'search_files': {
          if (!policy.allowReadFiles) {
            return { ok: false, error: 'Searching local files is disabled on this PC (allowReadFiles = false).' };
          }
          const rawPath = typeof params['path'] === 'string' && params['path'].trim() ? params['path'].trim() : '.';
          const safe = this.resolveSafePath(rawPath, false);
          const ctx = this.createToolContext(safe.matchedRoot, safe.allowedRoots);
          const result = await toolSearchFiles(ctx, { ...params, path: safe.path });
          return { ok: result.ok, output: result.output, ...(result.ok ? {} : { error: result.output }) };
        }

        case 'pull_file': {
          if (!policy.allowReadFiles) {
            return { ok: false, error: 'Pulling local files is disabled on this PC (allowReadFiles = false).' };
          }
          const rawPath = typeof params['path'] === 'string' ? params['path'] : '';
          const safe = this.resolveSafePath(rawPath, false);
          if (!existsSync(safe.path)) {
            return { ok: false, error: `File not found: ${rawPath}` };
          }
          const st = statSync(safe.path);
          if (!st.isFile()) {
            return { ok: false, error: `Not a file: ${rawPath}` };
          }
          if (st.size > MAX_LOCAL_LINK_FILE_BYTES) {
            return {
              ok: false,
              error: `File "${path.basename(safe.path)}" is ${st.size} bytes, exceeding the ${MAX_LOCAL_LINK_FILE_BYTES} byte direct-link limit.`,
            };
          }
          const buf = readFileSync(safe.path);
          const name = path.basename(safe.path);
          const ext = path.extname(name).toLowerCase();
          const mime = MIME_BY_EXT[ext] ?? 'application/octet-stream';
          const isText = TEXT_EXTENSIONS.has(ext) && !buf.includes(0);
          const textPreview = isText ? buf.slice(0, 16_384).toString('utf8') : undefined;
          return {
            ok: true,
            output: `Fetched ${name} (${st.size} bytes)`,
            data: {
              name,
              mime,
              size: st.size,
              dataBase64: buf.toString('base64'),
              ...(textPreview !== undefined ? { textPreview } : {}),
            },
          };
        }

        case 'write_file': {
          if (!policy.allowWrites) {
            return { ok: false, error: 'Writing local files is disabled on this PC (allowWrites = false).' };
          }
          const rawPath = typeof params['path'] === 'string' ? params['path'] : '';
          const safe = this.resolveSafePath(rawPath, true);
          const ctx = this.createToolContext(safe.matchedRoot, safe.allowedRoots);
          const result = toolWriteFile(ctx, { ...params, path: safe.path });
          return { ok: result.ok, output: result.output, ...(result.ok ? {} : { error: result.output }) };
        }

        case 'drop_file': {
          if (!policy.allowWrites) {
            return { ok: false, error: 'Writing local files is disabled on this PC (allowWrites = false).' };
          }
          const rawPath = typeof params['path'] === 'string' ? params['path'] : '';
          const safe = this.resolveSafePath(rawPath, true);
          let buf: Buffer;
          if (typeof params['dataBase64'] === 'string') {
            buf = Buffer.from(params['dataBase64'], 'base64');
          } else if (typeof params['content'] === 'string') {
            buf = Buffer.from(params['content'], 'utf8');
          } else {
            return { ok: false, error: 'drop_file requires either "dataBase64" or "content".' };
          }
          if (buf.length > MAX_LOCAL_LINK_FILE_BYTES) {
            return {
              ok: false,
              error: `Payload exceeds the ${MAX_LOCAL_LINK_FILE_BYTES} byte direct-link limit (${buf.length} bytes).`,
            };
          }
          mkdirSync(path.dirname(safe.path), { recursive: true });
          const tmp = `${safe.path}.${process.pid}.${Date.now()}.tmp`;
          try {
            writeFileSync(tmp, buf);
            renameSync(tmp, safe.path);
          } catch (err) {
            try {
              unlinkSync(tmp);
            } catch {}
            throw err;
          }
          return {
            ok: true,
            output: `Saved ${safe.path} (${buf.length} bytes)`,
            data: { path: safe.path, size: buf.length },
          };
        }

        case 'open_url': {
          if (!policy.allowOpenUrl) {
            return { ok: false, error: 'Opening URLs is disabled on this PC (allowOpenUrl = false).' };
          }
          const rawUrl = typeof params['url'] === 'string' ? params['url'].trim() : '';
          if (!rawUrl || rawUrl.length > 2048 || /[\s\0-\x1f\x7f]/.test(rawUrl)) {
            return { ok: false, error: 'Invalid URL for open_url.' };
          }
          let parsed: URL;
          try {
            parsed = new URL(rawUrl);
          } catch {
            return { ok: false, error: 'Invalid URL for open_url.' };
          }
          if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
            return { ok: false, error: 'open_url only allows http:// and https:// URLs.' };
          }
          const openFn = this.deps.openUrlImpl ?? defaultOpenUrl;
          await openFn(parsed.href);
          return {
            ok: true,
            output: `Opened ${parsed.href} on ${this.deps.getDeviceName()}.`,
            data: { url: parsed.href },
          };
        }

        case 'run_command': {
          if (!policy.allowCommands) {
            return { ok: false, error: 'Running local commands is disabled on this PC (allowCommands = false).' };
          }
          const command = typeof params['command'] === 'string' ? params['command'].trim() : '';
          if (!command || command.length > 4000) {
            return { ok: false, error: 'run_command requires a non-empty "command" (max 4000 chars).' };
          }
          let runCwd = this.defaultWorkspaceRoot();
          if (typeof params['cwd'] === 'string' && params['cwd'].trim()) {
            const safeCwd = this.resolveSafePath(params['cwd'].trim(), false);
            if (!existsSync(safeCwd.path) || !statSync(safeCwd.path).isDirectory()) {
              return { ok: false, error: `Invalid cwd: "${params['cwd']}" is not an existing directory.` };
            }
            runCwd = safeCwd.path;
          }
          const requestedTimeout = Number(params['timeoutMs']);
          const timeoutMs =
            Number.isFinite(requestedTimeout) && requestedTimeout > 0
              ? Math.max(1000, Math.min(30_000, Math.floor(requestedTimeout)))
              : 15_000;

          return await new Promise<LocalLinkRpcResult>((resolve) => {
            exec(
              command,
              {
                cwd: runCwd,
                timeout: timeoutMs,
                maxBuffer: 512 * 1024,
                windowsHide: true,
                ...(meta.signal ? { signal: meta.signal } : {}),
              },
              (err, stdout, stderr) => {
                const out = capOutput([stdout?.trimEnd(), stderr?.trimEnd()].filter(Boolean).join('\n'));
                if (!err) {
                  resolve({
                    ok: true,
                    output: out || '(command exited with code 0)',
                    data: { exitCode: 0, cwd: runCwd },
                  });
                  return;
                }
                const exitCode = typeof (err as { code?: unknown }).code === 'number' ? (err as { code: number }).code : 1;
                const detail = out || err.message || `Command exited with code ${exitCode}`;
                resolve({
                  ok: false,
                  output: detail,
                  error: detail,
                  data: { exitCode, cwd: runCwd },
                });
              },
            );
          });
        }

        case 'ask_local_agent': {
          if (!policy.allowAgentChat) {
            return { ok: false, error: 'Chat handoff to the local agent is disabled on this PC (allowAgentChat = false).' };
          }
          const hopCount = typeof meta.hopCount === 'number' && Number.isFinite(meta.hopCount) ? meta.hopCount : 0;
          if (hopCount >= MAX_LOCAL_LINK_HOPS) {
            return { ok: false, error: 'Local link hop limit exceeded.' };
          }
          const prompt = typeof params['prompt'] === 'string' ? params['prompt'].trim() : '';
          if (!prompt) {
            return { ok: false, error: 'ask_local_agent requires a non-empty "prompt".' };
          }
          const agent = typeof params['agent'] === 'string' && params['agent'].trim() ? params['agent'].trim() : undefined;
          return await this.deps.askLocalAgent({
            prompt,
            ...(agent ? { agent } : {}),
            ...(meta.fromAgent ? { fromAgent: meta.fromAgent } : {}),
            hopCount,
            ...(meta.signal ? { signal: meta.signal } : {}),
          });
        }

        default: {
          return { ok: false, error: `Unsupported local-link action: ${String(action)}` };
        }
      }
    } catch (err) {
      const msg = (err as Error).message || 'Local execution failed.';
      return { ok: false, output: msg, error: msg };
    }
  }
}
