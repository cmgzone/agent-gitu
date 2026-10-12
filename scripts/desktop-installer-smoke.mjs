import { _electron } from 'playwright';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, existsSync, readFileSync, writeFileSync, createReadStream } from 'node:fs';
import { createHash } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';

if (process.platform !== 'win32' || process.env.CI !== 'true' || process.env.GITHUB_ACTIONS !== 'true')
  throw new Error('Desktop installer validation requires a disposable Windows GitHub Actions runner.');
const registered = execFileSync(
  'powershell.exe',
  [
    '-NoProfile',
    '-NonInteractive',
    '-Command',
    "Get-ChildItem 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall','HKLM:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall' -ErrorAction SilentlyContinue | Get-ItemProperty | Where-Object DisplayName -eq 'Agent Gitu' | Select-Object -ExpandProperty DisplayName",
  ],
  { encoding: 'utf8', windowsHide: true },
);
if (registered.trim()) throw new Error('Refusing to change an existing Agent Gitu desktop installation.');
const version = JSON.parse(readFileSync('package.json', 'utf8')).version;
const installer = path.resolve('release', `Agent-Gitu-Setup-${version}.exe`);
const root = mkdtempSync(path.join(os.tmpdir(), 'gitu-desktop-ci-')),
  installed = path.join(root, 'Application'),
  data = path.join(root, 'OwnerData'),
  profile = path.join(root, 'Profile'),
  temporary = path.join(root, 'Temp');
for (const directory of [data, profile, temporary, path.join(profile, 'AppData', 'Roaming'), path.join(profile, 'AppData', 'Local')]) mkdirSync(directory, { recursive: true });
const env = {
  ...process.env,
  AGENT_GITU_HOME: data,
  HERMES_HOME: data,
  HERMES_UI_PORT: '0',
  HERMES_CWD: data,
  USERPROFILE: profile,
  HOME: profile,
  APPDATA: path.join(profile, 'AppData', 'Roaming'),
  LOCALAPPDATA: path.join(profile, 'AppData', 'Local'),
  TEMP: temporary,
  TMP: temporary,
};
delete env.ELECTRON_RUN_AS_NODE;
const marker = path.join(data, 'preservation-marker');
writeFileSync(marker, 'preserve');
const install = () => execFileSync(installer, ['/S', '/currentuser', '/D=' + installed], { env, cwd: root, windowsHide: true, timeout: 180000, stdio: 'pipe' });
install();
const executable = path.join(installed, 'Agent Gitu.exe'),
  uninstaller = path.join(installed, 'Uninstall Agent Gitu.exe');
if (!existsSync(executable) || !existsSync(uninstaller)) throw new Error('Installer did not create the desktop and uninstaller in the selected directory.');
let electron;
try {
  electron = await _electron.launch({ executablePath: executable, env, cwd: data, timeout: 60000 });
  let runtimeUrl;
  const deadline = Date.now() + 60000;
  while (Date.now() < deadline) {
    runtimeUrl = await electron.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()
        .map((window) => window.webContents.getURL())
        .find((url) => /^http:\/\/127\.0\.0\.1:\d+\//.test(url)),
    );
    if (runtimeUrl) break;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  if (!runtimeUrl) throw new Error('Installed desktop did not open its own isolated runtime.');
  const origin = new URL(runtimeUrl).origin;
  const healthy = async () => (await fetch(origin + '/api/auth/status', { signal: AbortSignal.timeout(3000) })).ok;
  if (!(await healthy())) throw new Error('Installed desktop runtime is unhealthy.');
  const hidden = await electron.evaluate(({ BrowserWindow }) => {
    const window = BrowserWindow.getAllWindows().find((window) => /^http:\/\/127\.0\.0\.1:\d+\//.test(window.webContents.getURL()));
    window.close();
    return !window.isDestroyed() && !window.isVisible();
  });
  if (!hidden || !(await healthy())) throw new Error('Closing the window stopped the runtime instead of retaining it in the tray.');
  const reopened = await electron.evaluate(({ app, BrowserWindow }) => {
    app.emit('second-instance', {}, [], '', {});
    return BrowserWindow.getAllWindows().some((window) => /^http:\/\/127\.0\.0\.1:\d+\//.test(window.webContents.getURL()) && window.isVisible());
  });
  if (!reopened) throw new Error('The hidden desktop could not be reopened.');
  // Playwright closes Electron through app.quit(), exercising the application's
  // before-quit drain and tray teardown rather than killing its process.
  await electron.close();
  electron = undefined;
  let stopped = false;
  try {
    stopped = !(await healthy());
  } catch {
    stopped = true;
  }
  if (!stopped) throw new Error('Explicit Quit left the desktop runtime accepting requests.');
  install();
  if (readFileSync(marker, 'utf8') !== 'preserve') throw new Error('Installer update changed owner data.');
  execFileSync(uninstaller, ['/S'], { env, cwd: root, windowsHide: true, timeout: 180000, stdio: 'pipe' });
  if (readFileSync(marker, 'utf8') !== 'preserve') throw new Error('Uninstall changed owner data.');
  const hash = createHash('sha256');
  for await (const bytes of createReadStream(installer)) hash.update(bytes);
  writeFileSync(installer + '.sha256', hash.digest('hex') + '  ' + path.basename(installer) + '\n');
  console.log('Windows installer, isolated desktop startup, tray close/reopen, explicit Quit and data-preserving update/uninstall passed.');
} finally {
  if (electron) await electron.close();
}
