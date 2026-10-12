import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync, existsSync, readFileSync, unlinkSync, chmodSync } from 'node:fs';
import { createHash } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ensureGituHome } from '../workspace/home.js';

export type ServiceAction = 'install' | 'start' | 'stop' | 'status' | 'uninstall';
const xml = (v: string) => v.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c]!);
const unit = (v: string) => '"' + v.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/%/g, '%%') + '"';
export function serviceConfiguration(
  platform: NodeJS.Platform,
  options: { node: string; cli: string; data: string; cwd: string; host: string; port: number; owner?: string; system?: boolean },
): string {
  const { node, cli, data, cwd, host, port, owner, system } = options;
  for (const v of [node, cli, data, cwd, host]) if (/[\r\n\0]/.test(v)) throw new Error('Invalid service option.');
  if (system && (!owner || !/^[a-zA-Z_][a-zA-Z0-9_-]{0,63}$/.test(owner))) throw new Error('A system service requires a dedicated owner account.');
  if (platform === 'linux')
    return `[Unit]\nDescription=Agent Gitu company runtime\nAfter=network-online.target\n\n[Service]\nType=simple\n${system ? 'User=' + owner + '\n' : ''}WorkingDirectory=${unit(cwd)}\nEnvironment=${unit('AGENT_GITU_HOME=' + data)}\nExecStart=${unit(node)} ${unit(cli)} serve --host ${unit(host)} --port ${port}\nRestart=on-failure\nRestartSec=10\nTimeoutStopSec=90\nUMask=0077\n\n[Install]\nWantedBy=${system ? 'multi-user.target' : 'default.target'}\n`;
  if (platform === 'darwin')
    return `<?xml version="1.0" encoding="UTF-8"?><!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd"><plist version="1.0"><dict><key>Label</key><string>dev.agentgitu.runtime</string>${system ? '<key>UserName</key><string>' + xml(owner!) + '</string>' : ''}<key>ProgramArguments</key><array>${[node, cli, 'serve', '--host', host, '--port', String(port)].map((v) => '<string>' + xml(v) + '</string>').join('')}</array><key>WorkingDirectory</key><string>${xml(cwd)}</string><key>EnvironmentVariables</key><dict><key>AGENT_GITU_HOME</key><string>${xml(data)}</string>${system ? '<key>HOME</key><string>' + xml(data) + '</string>' : ''}</dict><key>RunAtLoad</key><true/><key>KeepAlive</key><dict><key>SuccessfulExit</key><false/></dict><key>StandardOutPath</key><string>${xml(path.join(data, 'service.log'))}</string><key>StandardErrorPath</key><string>${xml(path.join(data, 'service-error.log'))}</string></dict></plist>`;
  if (platform === 'win32')
    return `<service><id>AgentGituRuntime</id><name>Agent Gitu Runtime</name><description>Company, Cowork and schedule runtime</description><executable>${xml(node)}</executable><arguments>${xml('"' + cli + '" serve --host "' + host + '" --port ' + port)}</arguments><workingdirectory>${xml(cwd)}</workingdirectory><env name="AGENT_GITU_HOME" value="${xml(data)}"/><logpath>${xml(path.join(data, 'service-logs'))}</logpath><log mode="roll"/><stoptimeout>90 sec</stoptimeout><onfailure action="restart" delay="10 sec"/><serviceaccount><username>NT AUTHORITY\LocalService</username></serviceaccount></service>`;
  throw new Error('Service management supports Windows, Linux and macOS.');
}
export async function manageService(action: ServiceAction, flags: Map<string, string | boolean>): Promise<string> {
  if (!['install', 'start', 'stop', 'status', 'uninstall'].includes(action)) throw new Error('Usage: gitu service install|start|stop|status|uninstall');
  const platform = process.platform,
    data = path.resolve(typeof flags.get('data-dir') === 'string' ? String(flags.get('data-dir')) : ensureGituHome().root),
    directory = path.join(data, 'Service'),
    host = String(flags.get('host') || '127.0.0.1'),
    port = Number(flags.get('port') || 8321);
  const system = flags.get('system') === true,
    owner = typeof flags.get('owner') === 'string' ? String(flags.get('owner')) : undefined;
  if (system && (!owner || !/^[a-zA-Z_][a-zA-Z0-9_-]{0,63}$/.test(owner))) throw new Error('Use --system --owner account --data-dir /path with a dedicated workspace owner.');
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid service port.');
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const exec = (command: string, args: string[]) => execFileSync(command, args, { encoding: 'utf8', windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  const linuxFile = system ? '/etc/systemd/system/agent-gitu.service' : path.join(os.homedir(), '.config', 'systemd', 'user', 'agent-gitu.service'),
    macFile = system ? '/Library/LaunchDaemons/dev.agentgitu.runtime.plist' : path.join(os.homedir(), 'Library', 'LaunchAgents', 'dev.agentgitu.runtime.plist'),
    windowsFile = path.join(directory, 'agent-gitu-service.xml');
  if (action === 'install') {
    const workspace = typeof flags.get('workspace') === 'string' ? path.resolve(String(flags.get('workspace'))) : path.join(data, 'Workspace');
    mkdirSync(workspace, { recursive: true, mode: 0o700 });
    const file = platform === 'linux' ? linuxFile : platform === 'darwin' ? macFile : windowsFile;
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(
      file,
      serviceConfiguration(platform, { node: process.execPath, cli: fileURLToPath(new URL('../cli.js', import.meta.url)), data, cwd: workspace, host, port, system, owner }),
      { mode: 0o600 },
    );
    if (platform === 'linux') {
      exec('systemctl', [...(system ? [] : ['--user']), 'daemon-reload']);
      exec('systemctl', [...(system ? [] : ['--user']), 'enable', 'agent-gitu.service']);
      if (system) return 'Installed system service for ' + owner + '. Ensure this owner can read the runtime, write its data directory and access its private computer server.';
      return 'Installed. Enable linger for this owner to run after logout: loginctl enable-linger ' + os.userInfo().username;
    }
    if (platform === 'darwin')
      return system
        ? 'Installed login-independent LaunchDaemon for ' +
            owner +
            '. Ensure its owner has write access to the data directory, then run gitu service start --system --owner ' +
            owner +
            '.'
        : 'Installed launchd agent. Start with gitu service start. For a login-independent server, install with --system --owner account.';
    if (platform === 'win32') {
      if (process.arch !== 'x64') throw new Error('The pinned Windows service wrapper supports x64.');
      const wrapper = path.join(directory, 'agent-gitu-service.exe');
      if (!existsSync(wrapper)) {
        const response = await fetch('https://github.com/winsw/winsw/releases/download/v2.12.0/WinSW-x64.exe');
        if (!response.ok) throw new Error('Service wrapper download failed.');
        const bytes = Buffer.from(await response.arrayBuffer());
        if (createHash('sha256').update(bytes).digest('hex') !== '05b82d46ad331cc16bdc00de5c6332c1ef818df8ceefcd49c726553209b3a0da')
          throw new Error('Service wrapper checksum mismatch.');
        writeFileSync(wrapper, bytes);
      }
      exec(wrapper, ['install']);
      return 'Installed. Configure this service to run as the workspace owner before starting it, so its protected credentials and Docker grants are available.';
    }
  }
  if (platform === 'linux') {
    const output = exec('systemctl', [...(system ? [] : ['--user']), action === 'uninstall' ? 'disable' : action, 'agent-gitu.service']);
    if (action === 'uninstall') {
      exec('systemctl', [...(system ? [] : ['--user']), 'stop', 'agent-gitu.service']);
      if (existsSync(linuxFile)) unlinkSync(linuxFile);
      exec('systemctl', [...(system ? [] : ['--user']), 'daemon-reload']);
    }
    return output || 'Service ' + action + ' completed.';
  }
  if (platform === 'darwin') {
    const domain = system ? 'system' : 'gui/' + process.getuid!(),
      label = domain + '/dev.agentgitu.runtime';
    if (action === 'start') return exec('launchctl', ['bootstrap', domain, macFile]);
    if (action === 'status') return exec('launchctl', ['print', label]);
    const output = exec('launchctl', ['bootout', label]);
    if (action === 'uninstall' && existsSync(macFile)) unlinkSync(macFile);
    return output;
  }
  if (platform === 'win32') {
    const wrapper = path.join(directory, 'agent-gitu-service.exe');
    if (!existsSync(wrapper)) throw new Error('Install the service first.');
    if (createHash('sha256').update(readFileSync(wrapper)).digest('hex') !== '05b82d46ad331cc16bdc00de5c6332c1ef818df8ceefcd49c726553209b3a0da')
      throw new Error('Service wrapper checksum mismatch.');
    return exec(wrapper, [action]);
  }
  throw new Error('Unsupported service platform.');
}
