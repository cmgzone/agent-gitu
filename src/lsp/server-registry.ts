import { existsSync } from 'node:fs';
import path from 'node:path';
import { readJson } from '../util.js';
import type { LspServerConfig } from './lsp-types.js';

/**
 * ServerRegistry — decides which LSP server serves a languageId.
 *
 * Built-in defaults cover common languages; users can override or extend them
 * with `.hermes/lsp.json` in the project root:
 *
 *   {
 *     "servers": [
 *       { "name": "typescript", "languageIds": ["typescript"], "command": "my-ts-lsp", "args": ["--stdio"] }
 *     ]
 *   }
 *
 * Custom servers replace defaults with the same `name`; extra names are added.
 */

export const DEFAULT_SERVERS: LspServerConfig[] = [
  {
    name: 'typescript',
    languageIds: ['typescript', 'typescriptreact', 'javascript', 'javascriptreact'],
    command: 'typescript-language-server',
    args: ['--stdio'],
  },
  {
    name: 'python',
    languageIds: ['python'],
    command: 'basedpyright-langserver',
    args: ['--stdio'],
  },
  {
    name: 'go',
    languageIds: ['go'],
    command: 'gopls',
    args: ['serve'],
  },
  {
    name: 'rust',
    languageIds: ['rust'],
    command: 'rust-analyzer',
  },
  {
    name: 'cpp',
    languageIds: ['c', 'cpp'],
    command: 'clangd',
    args: ['--background-index'],
  },
  {
    name: 'java',
    languageIds: ['java'],
    command: 'jdtls',
  },
  {
    name: 'csharp',
    languageIds: ['csharp'],
    command: 'csharp-ls',
  },
  {
    name: 'css',
    languageIds: ['css'],
    command: 'vscode-css-language-server',
    args: ['--stdio'],
  },
];

export interface ServerRegistryConfigFile {
  servers?: LspServerConfig[];
}

export class ServerRegistry {
  private readonly servers: LspServerConfig[];

  constructor(repoRoot?: string) {
    const custom = repoRoot ? loadCustomServers(repoRoot) : [];
    const byName = new Map<string, LspServerConfig>();
    for (const s of custom) byName.set(s.name, s);
    for (const s of DEFAULT_SERVERS) {
      if (!byName.has(s.name)) byName.set(s.name, s);
    }
    this.servers = [...byName.values()];
  }

  serversList(): LspServerConfig[] {
    return this.servers;
  }

  serverForLanguage(languageId: string): LspServerConfig | undefined {
    return this.servers.find((s) => s.languageIds.includes(languageId));
  }

  configuredCount(): number {
    return this.servers.length;
  }
}

function loadCustomServers(repoRoot: string): LspServerConfig[] {
  const file = path.join(repoRoot, '.hermes', 'lsp.json');
  if (!existsSync(file)) return [];
  const cfg = readJson<ServerRegistryConfigFile>(file);
  if (!cfg || !Array.isArray(cfg.servers)) return [];
  return cfg.servers.filter(
    (s): s is LspServerConfig =>
      Boolean(s && typeof s.name === 'string' && typeof s.command === 'string' && Array.isArray(s.languageIds)),
  );
}

/** Whether a server binary is likely on PATH (windows appends .cmd/.exe/.bat). */
export function serverBinaryAvailable(config: LspServerConfig): boolean {
  const cmd = config.command;
  if (cmd.includes('/') || cmd.includes('\\') || cmd.includes('.')) {
    return existsSync(path.resolve(cmd));
  }
  const exts = process.platform === 'win32' ? ['', '.cmd', '.exe', '.bat', '.ps1'] : [''];
  for (const dir of (process.env.PATH ?? '').split(path.delimiter)) {
    if (!dir) continue;
    for (const ext of exts) {
      if (existsSync(path.join(dir, cmd + ext))) return true;
    }
  }
  return false;
}

/**
 * Resolve how a server should be spawned. Real executables (.exe/.com or a
 * bare command resolving to one) spawn directly without a shell; only
 * .cmd/.bat/.ps1 shims (e.g. npm-global typescript-language-server) need a
 * shell on Windows. Direct spawn avoids Node's DEP0190 args-concatenation
 * warning and keeps control of the argument list.
 */
export function resolveSpawnCommand(config: LspServerConfig): { command: string; args: string[]; shell: boolean } {
  const args = config.args ?? [];
  if (process.platform !== 'win32') return { command: config.command, args, shell: false };
  if (/\.(cmd|bat|ps1)$/i.test(config.command)) return { command: config.command, args, shell: true };
  const looksLikePath = config.command.includes('/') || config.command.includes('\\') || config.command.includes('.');
  if (looksLikePath) return { command: config.command, args, shell: false };
  for (const dir of (process.env.PATH ?? '').split(path.delimiter)) {
    if (!dir) continue;
    for (const ext of ['.exe', '.com']) {
      if (existsSync(path.join(dir, config.command + ext))) {
        return { command: path.join(dir, config.command + ext), args, shell: false };
      }
    }
  }
  for (const dir of (process.env.PATH ?? '').split(path.delimiter)) {
    if (!dir) continue;
    for (const ext of ['.cmd', '.bat', '.ps1']) {
      if (existsSync(path.join(dir, config.command + ext))) {
        return { command: config.command, args, shell: true };
      }
    }
  }
  return { command: config.command, args, shell: false };
}