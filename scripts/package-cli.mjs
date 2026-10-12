import { cpSync, mkdirSync, readFileSync, writeFileSync, existsSync, chmodSync, rmSync, statfsSync, createReadStream, createWriteStream, renameSync } from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { execFileSync, spawn } from 'node:child_process';
import { pipeline } from 'node:stream/promises';
import { createGzip } from 'node:zlib';
import { unzipSync } from 'fflate';
const root = process.cwd(),
  pkg = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8')),
  version = pkg.version;
if (!/^\d+\.\d+\.\d+(?:-[\w.]+)?$/.test(version)) throw new Error('Invalid package version.');
const platform = process.platform,
  arch = process.arch;
if (!['linux', 'darwin', 'win32'].includes(platform) || !['x64', 'arm64'].includes(arch) || (platform === 'win32' && arch !== 'x64'))
  throw new Error('Unsupported release target.');
const label = `agent-gitu-${version}-${platform}-${arch}`,
  release = path.join(root, '.release'),
  stage = path.join(release, label);
const disk = statfsSync(root);
if (disk.bavail * disk.bsize < 3 * 1024 ** 3) throw new Error('CLI packaging needs at least 3 GiB of free workspace disk space for dependency staging and its archive. Source and owner data have not been changed.');
const resume = process.argv.includes('--resume');
if (existsSync(stage) && !resume) throw new Error('Release staging already exists. Use --resume to refresh a matching package.');
mkdirSync(stage, { recursive: true });
const app = path.join(stage, 'app');
mkdirSync(app, { recursive: true });
if (resume && existsSync(path.join(app, 'package-lock.json')) && !readFileSync(path.join(app, 'package-lock.json')).equals(readFileSync(path.join(root, 'package-lock.json'))))
  throw new Error('Dependency lock changed. Package in a fresh checkout.');
for (const file of ['dist', 'assets', 'package.json', 'package-lock.json', 'voice-worker', 'deploy', 'docs/company-mode.md'])
  if (existsSync(path.join(root, file))) cpSync(path.join(root, file), path.join(app, file), { recursive: true });
const npmCli = process.env.npm_execpath;
if (!npmCli || !existsSync(npmCli)) throw new Error('Run packaging with npm run package:cli.');
if (!resume || !existsSync(path.join(app, 'node_modules'))) execFileSync(process.execPath, [npmCli, 'ci', '--omit=dev', '--no-audit', '--no-fund'], {
  cwd: app,
  stdio: 'inherit',
  env: { ...process.env, ELECTRON_SKIP_BINARY_DOWNLOAD: '1' },
});
const nodeVersion = '22.22.3',
  nodePlatform = platform === 'win32' ? 'win' : platform,
  extension = platform === 'win32' ? 'zip' : 'tar.gz',
  nodeName = `node-v${nodeVersion}-${nodePlatform}-${arch}.${extension}`,
  nodeBase = `https://nodejs.org/dist/v${nodeVersion}/`;
async function download(url, cache) {
  if (cache && existsSync(cache)) return readFileSync(cache);
  if (platform === 'win32') {
    const temporary = cache ? cache + '.part' : path.join(release, 'download-' + randomUUID());
    try {
      execFileSync('curl.exe', ['--fail', '--location', '--silent', '--show-error', '--proto', '=https', '--max-time', cache ? '600' : '120', ...(cache ? ['--continue-at', '-'] : []), '--output', temporary, url], {
        windowsHide: true, timeout: cache ? 605000 : 125000, stdio: 'pipe',
      });
      return readFileSync(temporary);
    } finally { if (!cache) rmSync(temporary, { force: true }); }
  }
  const response = await fetch(url, { signal: AbortSignal.timeout(120000) });
  if (!response.ok) throw new Error('Release runtime download failed: ' + response.status);
  const result = Buffer.from(await response.arrayBuffer());
  if (cache) writeFileSync(cache + '.part', result);
  return result;
}
const sums = (await download(nodeBase + 'SHASUMS256.txt')).toString('utf8'),
  expected = sums
    .split('\n')
    .find((line) => line.endsWith('  ' + nodeName))
    ?.split(' ')[0];
if (!expected) throw new Error('No published runtime checksum for this platform.');
console.log('Verifying pinned Node runtime: ' + nodeVersion);
const runtimeCache = path.join(release, nodeName), bytes = await download(nodeBase + nodeName, runtimeCache);
if (createHash('sha256').update(bytes).digest('hex') !== expected) throw new Error('Runtime checksum mismatch.');
if (!existsSync(runtimeCache)) renameSync(runtimeCache + '.part', runtimeCache);
const runtime = path.join(stage, 'runtime');
mkdirSync(runtime, { recursive: true });
if (extension === 'zip') {
  for (const [name, content] of Object.entries(unzipSync(bytes))) {
    const relative = name.split('/').slice(1).join('/');
    if (!relative || name.endsWith('/')) continue;
    const target = path.resolve(runtime, relative);
    if (!target.startsWith(runtime + path.sep)) throw new Error('Unsafe runtime archive path.');
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, content);
  }
} else {
  const archive = path.join(release, nodeName);
  writeFileSync(archive, bytes);
  execFileSync('tar', ['-xzf', archive, '-C', runtime, '--strip-components=1']);
}
const launcher = platform === 'win32' ? 'gitu.cmd' : 'gitu';
writeFileSync(
  path.join(stage, launcher),
  platform === 'win32'
    ? '@echo off\r\nset "PATH=%~dp0runtime;%PATH%"\r\n"%~dp0runtime\\node.exe" "%~dp0app\\dist\\cli.js" %*\r\n'
    : '#!/bin/sh\nSOURCE=$0\nwhile [ -L "$SOURCE" ]; do\n  BASE=$(CDPATH= cd -- "$(dirname -- "$SOURCE")" && pwd)\n  SOURCE=$(readlink "$SOURCE")\n  case "$SOURCE" in /*) ;; *) SOURCE="$BASE/$SOURCE";; esac\ndone\nROOT=$(CDPATH= cd -- "$(dirname -- "$SOURCE")" && pwd)\nexport PATH="$ROOT/runtime/bin:$PATH"\nexec "$ROOT/runtime/bin/node" "$ROOT/app/dist/cli.js" "$@"\n',
);
if (platform !== 'win32') chmodSync(path.join(stage, launcher), 0o755);
writeFileSync(path.join(stage, 'release.json'), JSON.stringify({ version, platform, arch, nodeVersion, nodeChecksum: expected }, null, 2));
const archiveName = label + '.tar.gz',
  archive = path.join(release, archiveName);
const temporaryArchive = archive + '.' + randomUUID() + '.tmp';
console.log('Archiving staged runtime: ' + label);
const tar = spawn('tar', ['-cf', '-', '-C', release, label], { windowsHide: true, stdio: ['ignore','pipe','inherit'] });
const completed = new Promise((resolve, reject) => {
  tar.once('error', reject);
  tar.once('exit', code => code === 0 ? resolve() : reject(new Error('Runtime archive creation failed.')));
});
try {
  // Stream compression and hashing; a release must not require an archive-sized buffer.
  await Promise.all([completed, pipeline(tar.stdout, createGzip({ level: 1 }), createWriteStream(temporaryArchive, { flags: 'wx' }))]);
  renameSync(temporaryArchive, archive);
} catch (error) {
  tar.kill();
  rmSync(temporaryArchive, { force: true });
  throw error;
}
const digest = createHash('sha256');
for await (const chunk of createReadStream(archive)) digest.update(chunk);
const hash = digest.digest('hex');
writeFileSync(archive + '.sha256', hash + '  ' + archiveName + '\n');
console.log(archive);
