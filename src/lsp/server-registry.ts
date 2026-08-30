import { existsSync } from 'node:fs';
import path from 'node:path';
import { readJson } from '../util.js';
import type { LspInstallSpec, LspServerConfig } from './lsp-types.js';

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

/**
 * Only these built-in servers may be bootstrapped automatically. A custom
 * `.hermes/lsp.json` command is deliberately not treated as an installer: it
 * could otherwise turn a read-only LSP lookup into arbitrary code execution.
 */
const DEFAULT_INSTALLERS: Record<string, LspInstallSpec> = {
  typescript: {
    program: 'npm',
    args: ['install', '--global', '--ignore-scripts', '--no-fund', '--no-audit', 'typescript-language-server', 'typescript'],
    label: 'npm install --global typescript-language-server typescript',
    pathHint: 'npm-global',
  },
  python: {
    program: 'python',
    args: ['-m', 'pip', 'install', '--user', 'basedpyright'],
    label: 'python -m pip install --user basedpyright',
    pathHint: 'python-user',
  },
  go: {
    program: 'go',
    args: ['install', 'golang.org/x/tools/gopls@latest'],
    label: 'go install golang.org/x/tools/gopls@latest',
    pathHint: 'go-bin',
  },
  rust: {
    program: 'rustup',
    args: ['component', 'add', 'rust-analyzer'],
    label: 'rustup component add rust-analyzer',
    pathHint: 'cargo-bin',
  },
  csharp: {
    program: 'dotnet',
    args: ['tool', 'install', '--global', 'csharp-ls'],
    label: 'dotnet tool install --global csharp-ls',
    pathHint: 'dotnet-tools',
  },
  css: {
    program: 'npm',
    args: ['install', '--global', '--ignore-scripts', '--no-fund', '--no-audit', 'vscode-langservers-extracted'],
    label: 'npm install --global vscode-langservers-extracted',
    pathHint: 'npm-global',
  },
};

/**
 * Return an installer only for an unchanged built-in server definition.
 * Matching the command as well as the name prevents a custom registry entry
 * from inheriting an install command accidentally.
 */
export function installSpecFor(config: LspServerConfig): LspInstallSpec | undefined {
  const builtin = DEFAULT_SERVERS.find(
    (server) =>
      server.name === config.name &&
      server.command === config.command &&
      JSON.stringify(server.args ?? []) === JSON.stringify(config.args ?? []),
  );
  if (!builtin) return undefined;
  const spec = DEFAULT_INSTALLERS[builtin.name];
  return spec ? { ...spec, args: [...spec.args] } : undefined;
}

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
 * Quote one argument per Microsoft's CommandLineToArgvW rules so it survives
 * being joined into a single cmd.exe command line. Needed because spawning
 * .cmd/.bat shims requires a shell, and with a shell Node concatenates
 * command+args WITHOUT escaping — args containing spaces or metacharacters
 * would break out of their positions (DEP0190).
 */
export function windowsQuote(arg: string): string {
  if (arg !== '' && !/[\s"]/.test(arg)) return arg;
  let out = '"';
  let backslashes = 0;
  for (const ch of arg) {
    if (ch === '\\') {
      backslashes += 1;
    } else if (ch === '"') {
      out += '\\'.repeat(backslashes * 2 + 1) + '"';
      backslashes = 0;
    } else {
      out += '\\'.repeat(backslashes) + ch;
      backslashes = 0;
    }
  }
  return `${out}${'\\'.repeat(backslashes * 2)}"`;
}

/**
 * Resolve how a command+args pair should be spawned. Real executables
 * (.exe/.com or a bare command resolving to one) spawn directly without a
 * shell; only .cmd/.bat/.ps1 shims (e.g. npm-global typescript-language-server)
 * need a shell on Windows. For those we return ONE pre-quoted command string
 * with empty args — never raw `shell:true` + args array, which lets args break
 * out of their positions.
 */
export function resolveSpawn(
  command: string,
  configArgs: string[] | undefined,
): { command: string; args: string[]; shell: boolean } {
  const args = configArgs ?? [];
  if (process.platform !== 'win32') return { command, args, shell: false };
  const needsShell = /\.(cmd|bat|ps1)$/i.test(command);
  const looksLikePath = !needsShell && (command.includes('/') || command.includes('\\') || command.includes('.'));
  if (needsShell || !looksLikePath) {
    for (const dir of (process.env.PATH ?? '').split(path.delimiter)) {
      if (!dir) continue;
      if (!looksLikePath || needsShell) {
        for (const ext of ['.exe', '.com']) {
          if (existsSync(path.join(dir, command + ext))) {
            return { command: path.join(dir, command + ext), args, shell: false };
          }
        }
      }
      for (const ext of ['.cmd', '.bat', '.ps1']) {
        if (existsSync(path.join(dir, command + ext))) {
          // Pre-quoted full cmdline; empty args array keeps Node from doing its
          // own (unsafe) concatenation under a shell.
          const cmdline = [command + ext, ...args].map(windowsQuote).join(' ');
          return { command: cmdline, args: [], shell: true };
        }
      }
    }
    if (needsShell) {
      const cmdline = [command, ...args].map(windowsQuote).join(' ');
      return { command: cmdline, args: [], shell: true };
    }
  }
  return { command, args, shell: false };
}

/**
 * Resolve how a server should be spawned. Real executables (.exe/.com or a
 * bare command resolving to one) spawn directly without a shell; only
 * .cmd/.bat/.ps1 shims (e.g. npm-global typescript-language-server) need a
 * shell on Windows.
 */
export function resolveSpawnCommand(config: LspServerConfig): { command: string; args: string[]; shell: boolean } {
  return resolveSpawn(config.command, config.args);
}
