import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, realpathSync, readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { CoworkComputer, dockerExec } from '../dist/cowork/computer.js';

if (process.platform !== 'linux' || process.getuid() !== 0 || process.env.CI !== 'true' || process.env.GITHUB_ACTIONS !== 'true')
  throw new Error('Kernel quota validation requires a disposable Linux CI runner and its quota administrator.');
const root = mkdtempSync(path.join(os.tmpdir(), 'gitu-kernel-quota-ci-')),
  disk = path.join(root, 'quota.img'),
  mount = path.join(root, 'Quota');
mkdirSync(mount);
if (realpathSync(root) !== root || !root.startsWith(path.join(os.tmpdir(), 'gitu-kernel-quota-ci-'))) throw new Error('Invalid quota fixture path.');
const command = (program, args) => execFileSync(program, args, { encoding: 'utf8', timeout: 120000, stdio: ['ignore', 'pipe', 'pipe'] });
command('truncate', ['-s', '1G', disk]);
command('mkfs.xfs', ['-f', disk]);
command('mount', ['-o', 'loop,prjquota', disk, mount]);
process.env.AGENT_GITU_COMPUTER_QUOTA_ROOT = mount;
process.env.AGENT_GITU_HOME = path.join(root, 'OwnerData');
const computer = new CoworkComputer('quota-fixture', path.join(root, 'Company'), dockerExec, { key: 'quota-ci', limits: () => ({ cpu: 1, memoryMb: 1024, diskMb: 256 }) });
const run = async (program) => JSON.parse(await dockerExec(['exec', computer.name, 'node', '-e', program]));
let started = false;
try {
  await computer.start();
  started = true;
  await run(
    `(async()=>{for(let i=0;i<300;i++){try{await fetch('http://127.0.0.1:8765',{signal:AbortSignal.timeout(1000)});console.log('true');return;}catch{await new Promise(resolve=>setTimeout(resolve,100));}}throw Error('Private desktop service did not start.');})().catch(error=>{console.error(error.message);process.exitCode=1;});`,
  );
  // The node entry point is guarded just like agent tool execution; these are
  // actual filesystem writes, not the application's file admission checks.
  const filled = await run(
    `const fs=require('node:fs'); const chunk=Buffer.alloc(1048576,1); let bytes=0,code; const fd=fs.openSync('/workspace/quota-test','w'); try{while(bytes<300*1048576){bytes+=fs.writeSync(fd,chunk);}}catch(e){code=e.code;}finally{fs.closeSync(fd);}console.log(JSON.stringify({bytes,code}));`,
  );
  if (!['EDQUOT', 'ENOSPC'].includes(filled.code) || filled.bytes >= 300 * 1048576) throw new Error('An arbitrary process exceeded the private disk quota.');
  const shared = await run(
    `const fs=require('node:fs');let code;try{fs.writeFileSync('/home/agent/also-limited',Buffer.alloc(16*1048576,2));}catch(e){code=e.code;}console.log(JSON.stringify({code}));`,
  );
  if (!['EDQUOT', 'ENOSPC'].includes(shared.code)) throw new Error('Home and workspace did not share one disk quota.');
  await run(
    `const fs=require('node:fs');fs.rmSync('/workspace/quota-test');fs.rmSync('/home/agent/also-limited',{force:true});fs.writeFileSync('/workspace/preserve','saved');console.log('{}');`,
  );
  const guarded = await run(
    `const {execFileSync}=require('node:child_process'); const result=execFileSync('python3',['-c',"import errno,fcntl,os,struct,json; fd=os.open('/workspace/preserve',os.O_RDONLY); errors=[]\nfor cmd,data in [(0x401c5820,struct.pack('IIIII8s',0,0,0,0,0,b'')),(0x40086602,struct.pack('Q',0))]:\n try: fcntl.ioctl(fd,cmd,data); errors.append(None)\n except OSError as e: errors.append(e.errno)\nprint(json.dumps(errors))"]).toString(); console.log(result);`,
  );
  if (guarded.length !== 2 || guarded.some((value) => value !== 1)) throw new Error('A private process could change project quota attributes.');
  await computer.stop();
  started = false;
  await computer.start();
  started = true;
  if ((await run(`console.log(JSON.stringify(require('node:fs').readFileSync('/workspace/preserve','utf8')))`)) !== 'saved')
    throw new Error('Private computer restart lost its persistent files.');
  const hostConfig = JSON.parse(command('docker', ['inspect', '--format', '{{json .HostConfig}}', computer.name]));
  if (!hostConfig.ReadonlyRootfs || !hostConfig.Tmpfs?.['/tmp'] || hostConfig.CapAdd?.length)
    throw new Error('The private desktop has an unbounded writable root or quota administration privileges.');
  console.log('Kernel disk enforcement, shared home/workspace quota, process attribute guards and persistent restart passed.');
} finally {
  if (started) await computer.stop();
  // Remove only the exact container created by this fixture. Never prune Docker
  // or remove persistent owner volumes; CI disposes the isolated runner itself.
  try {
    command('docker', ['rm', computer.name]);
  } catch {}
  // Confirm this is still our mounted image before unmounting its own fixture.
  const mounted = JSON.parse(command('findmnt', ['--json', '--target', mount, '--output', 'TARGET,SOURCE']));
  if (mounted.filesystems?.[0]?.target !== mount || !readFileSync(path.join(mount, 'quota-ownership.sqlite')).length)
    throw new Error('Quota fixture mount ownership could not be verified.');
  command('umount', [mount]);
}
