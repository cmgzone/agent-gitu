const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { randomBytes } = require('node:crypto');
const { execFile } = require('node:child_process');

/** Desktop phone access starts with the engine; no second workspace server. */
function preparePhoneAccess(settings, env = process.env) {
  if (env.AGENT_GITU_DESKTOP_PHONE_ACCESS === '0') return { host: '127.0.0.1' };
  fs.mkdirSync(settings, { recursive: true });
  const file = path.join(settings, 'mobile-access.key');
  let key = env.AGENT_GITU_ACCESS_KEY;
  if (!key) {
    try { fs.writeFileSync(file, randomBytes(32).toString('hex'), { flag: 'wx', mode: 0o600 }); }
    catch (error) { if (error.code !== 'EEXIST') throw error; }
    key = fs.readFileSync(file, 'utf8').trim();
  }
  if (key.length < 32) throw new Error('The saved phone access key is invalid. Restore Settings/mobile-access.key.');
  env.AGENT_GITU_ACCESS_KEY = key;
  env.AGENT_GITU_ALLOW_LAN_LOGIN = '1';
  return { host: '0.0.0.0', accessKey: key };
}

function phoneAddresses(port, interfaces = os.networkInterfaces()) {
  if (!Number.isInteger(port) || port < 1 || port > 65535) return [];
  const addresses = new Set();
  for (const entries of Object.values(interfaces)) for (const entry of entries || []) {
    if (entry.internal || !['IPv4', 4].includes(entry.family)) continue;
    const parts = entry.address.split('.').map(Number);
    if (parts.length !== 4 || parts.some(value => !Number.isInteger(value) || value < 0 || value > 255)) continue;
    const [a, b] = parts;
    if (a === 10 || (a === 192 && b === 168) || (a === 172 && b >= 16 && b <= 31)) addresses.add(`http://${entry.address}:${port}`);
  }
  return [...addresses];
}

function registerPhoneAccess(contents, origin, status, allow) {
  const trusted = event => {
    try { return !contents.isDestroyed() && event.senderFrame === contents.mainFrame && new URL(event.senderFrame.url).origin === origin; }
    catch { return false; }
  };
  contents.ipc.handle('gitu:phone-access', event => trusted(event) ? status() : undefined);
  contents.ipc.handle('gitu:allow-phone-access', event => trusted(event) ? allow() : undefined);
}

let firewallPending;
function ensurePhoneFirewall({ home, port, executablePath = process.execPath, force = false }) {
  if (process.platform !== 'win32') return Promise.resolve({ allowed: true });
  const marker = path.join(home, 'Settings', 'phone-firewall.json');
  try {
    const saved = JSON.parse(fs.readFileSync(marker, 'utf8'));
    if (!force && saved.port === port && saved.executablePath === executablePath) return Promise.resolve({ allowed: true });
  } catch {}
  if (firewallPending) return firewallPending;
  // Windows asks once for administrator permission. Only this executable's
  // TCP port is allowed, with incoming peers confined to the local subnet.
  const quote = value => "'" + String(value).replace(/'/g, "''") + "'";
  const installer = path.join(__dirname, 'phone-firewall.ps1');
  const args = ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', installer, '-ProgramPath', executablePath, '-Port', String(port)];
  const argumentString = args.map(value => '"' + value.replace(/"/g, '\\"') + '"').join(' ');
  const command = `$ErrorActionPreference='Stop';try{$p=Start-Process -FilePath powershell.exe -Verb RunAs -WindowStyle Hidden -ArgumentList ${quote(argumentString)} -Wait -PassThru;exit $p.ExitCode}catch{exit 1}`;
  firewallPending = new Promise(resolve => {
    execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', command], { windowsHide: true, timeout: 180_000 }, error => {
      if (error) { resolve({ allowed: false, message: 'Allow the Windows permission request to connect your phone on Wi-Fi.' }); return; }
      try { fs.mkdirSync(path.dirname(marker), { recursive: true }); fs.writeFileSync(marker, JSON.stringify({ port, executablePath }), { mode: 0o600 }); }
      catch { /* Access works; retrying setup after a future launch is harmless. */ }
      resolve({ allowed: true });
    });
  }).finally(() => { firewallPending = undefined; });
  return firewallPending;
}

module.exports = { preparePhoneAccess, phoneAddresses, registerPhoneAccess, ensurePhoneFirewall };
