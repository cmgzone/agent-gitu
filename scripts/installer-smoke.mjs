import { readFileSync, mkdtempSync, existsSync, writeFileSync, createReadStream, statfsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync, spawn } from 'node:child_process';
import path from 'node:path';
import os from 'node:os';
const version = JSON.parse(readFileSync('package.json', 'utf8')).version,
  label = `agent-gitu-${version}-${process.platform}-${process.arch}`,
  archive = path.resolve('.release', label + '.tar.gz'),
  expected = readFileSync(archive + '.sha256', 'utf8').split(' ')[0];
const digest = createHash('sha256');
for await (const chunk of createReadStream(archive)) digest.update(chunk);
if (digest.digest('hex') !== expected) throw new Error('CLI package checksum mismatch.');
const disk = statfsSync(os.tmpdir());
if (disk.bavail * disk.bsize < 3 * 1024 ** 3) throw new Error('Installer smoke validation needs at least 3 GiB of free temporary disk space.');
const root = mkdtempSync(path.join(os.tmpdir(), 'gitu-installer-smoke-'));
execFileSync('tar', ['-xzf', archive, '-C', root]);
const installed = path.join(root, label),
  node = path.join(installed, 'runtime', process.platform === 'win32' ? 'node.exe' : 'bin/node'),
  cli = path.join(installed, 'app', 'dist', 'cli.js'),
  data = path.join(root, 'owner-data');
const env = { ...process.env, AGENT_GITU_HOME: data };
execFileSync(node, [cli, '--help'], { env, stdio: 'pipe' });
const sentinel = path.join(installed, 'release.json');
if (!existsSync(sentinel)) throw new Error('Release manifest is missing.');
let port;
const
  proc = spawn(node, [cli, 'serve', '--host', '127.0.0.1', '--port', '0'], { env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
let output='';proc.stdout.on('data',chunk=>{output+=chunk.toString();const match=output.match(/headless server running: http:\/\/localhost:(\d+)/);if(match)port=Number(match[1]);});proc.stderr.on('data',()=>{});
let ready = false;
try {
  for (let i = 0; i < 60; i++) {
    if (proc.exitCode !== null) throw new Error('Packaged runtime exited before becoming healthy.');
    try {
      if(!port)throw new Error('Runtime has not announced its port.');const response = await fetch(`http://127.0.0.1:${port}/api/auth/status`);
      if (response.ok) {
        ready = true;
        break;
      }
    } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
  if (!ready) throw new Error('Packaged runtime health check timed out.');
  writeFileSync(path.join(data, 'upgrade-preservation-marker'), 'preserve');
  // Windows cannot replace its running Node executable during an update.
  const stopped = new Promise(resolve => proc.once('exit', resolve));
  proc.kill('SIGTERM');
  await stopped;
  execFileSync('tar', ['-xzf', archive, '-C', root]);
  if (readFileSync(path.join(data, 'upgrade-preservation-marker'), 'utf8') !== 'preserve') throw new Error('Upgrade changed user data.');
  console.log('Packaged CLI startup, archive extraction and data preservation passed. Service installation is validated separately.');
} finally {
  proc.kill('SIGTERM');
}
