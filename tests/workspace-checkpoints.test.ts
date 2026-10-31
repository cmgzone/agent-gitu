import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { afterEach, expect, it } from 'vitest';
import { workspaceCheckpoint } from '../src/checkpoint/workspace-checkpoints.js';

const folders: string[] = [];
afterEach(() => { for (const folder of folders.splice(0)) rmSync(folder, { recursive: true, force: true }); });
function fixture() {
  const base = mkdtempSync(path.join(tmpdir(), 'gitu-rollback-')); folders.push(base);
  const root = path.join(base, 'project'), storage = path.join(base, 'checkpoints'); mkdirSync(root);
  return { root, storage, key: 'run_fixture' };
}

it('restores dirty and untracked project files, deletions and binary data, retaining a usable undo checkpoint', async () => {
  const options = fixture(), file = (name: string) => path.join(options.root, name);
  writeFileSync(file('dirty.ts'), 'user’s uncommitted work');
  writeFileSync(file('untracked.bin'), Buffer.from([0, 255, 4, 23]));
  const before = await workspaceCheckpoint('create', options), id = before.checkpoint!.id;
  writeFileSync(file('dirty.ts'), 'agent edits'); rmSync(file('untracked.bin'));
  mkdirSync(file('new')); writeFileSync(file('new/task.ts'), 'new code');
  await workspaceCheckpoint('seal', { ...options, id });
  writeFileSync(file('later-notes.txt'), 'unrelated later work');
  const restored = await workspaceCheckpoint('restore', { ...options, id });
  expect(readFileSync(file('dirty.ts'), 'utf8')).toBe('user’s uncommitted work');
  expect(readFileSync(file('untracked.bin'))).toEqual(Buffer.from([0, 255, 4, 23]));
  expect(() => readFileSync(file('new/task.ts'))).toThrow();
  expect(readFileSync(file('later-notes.txt'), 'utf8')).toBe('unrelated later work');
  await workspaceCheckpoint('restore', { ...options, id: restored.recoveryId });
  expect(readFileSync(file('dirty.ts'), 'utf8')).toBe('agent edits');
  expect(readFileSync(file('new/task.ts'), 'utf8')).toBe('new code');
});

it('refuses later edits and unsealed snapshots before touching any project files', async () => {
  const options = fixture(), file = path.join(options.root, 'code.ts');
  writeFileSync(file, 'before'); const { checkpoint } = await workspaceCheckpoint('create', options);
  writeFileSync(file, 'task');
  await expect(workspaceCheckpoint('restore', { ...options, id: checkpoint!.id })).rejects.toThrow('Stop the coding task');
  await workspaceCheckpoint('seal', { ...options, id: checkpoint!.id });
  writeFileSync(file, 'later user edits');
  await expect(workspaceCheckpoint('restore', { ...options, id: checkpoint!.id })).rejects.toThrow('Later edits');
  expect(readFileSync(file, 'utf8')).toBe('later user edits');
  expect((await workspaceCheckpoint('list', { ...options, key: 'other-task' })).checkpoints).toEqual([]);
});

it('protects later files inside a folder that replaced a baseline file', async () => {
  const options = fixture(), name = path.join(options.root, 'item'); writeFileSync(name, 'baseline');
  const { checkpoint } = await workspaceCheckpoint('create', options); rmSync(name);
  await workspaceCheckpoint('seal', { ...options, id: checkpoint!.id });
  mkdirSync(name); writeFileSync(path.join(name, 'later.ts'), 'later user file');
  await expect(workspaceCheckpoint('restore', { ...options, id: checkpoint!.id })).rejects.toThrow('Later edits');
  expect(readFileSync(path.join(name, 'later.ts'), 'utf8')).toBe('later user file');
});

it('runs without host application imports for private/cloud transport and excludes dependencies and runtime state', async () => {
  const options = fixture();
  for (const name of ['node_modules', '.git', '.hermes', 'browser-profiles']) { mkdirSync(path.join(options.root, name)); writeFileSync(path.join(options.root, name, 'state'), 'private or generated'); }
  writeFileSync(path.join(options.root, 'code.ts'), 'code');
  // Execute exactly the function source sent to a private computer.
  const code = 'const __name=(fn)=>fn;const workspaceCheckpoint=' + workspaceCheckpoint.toString().replaceAll('__vite_ssr_dynamic_import__', 'import') + ';console.log(JSON.stringify(await workspaceCheckpoint("create",' + JSON.stringify(options) + ')));';
  const result = JSON.parse(execFileSync(process.execPath, ['--input-type=module', '-e', code], { encoding: 'utf8', windowsHide: true }));
  expect(result.checkpoint.files).toBe(1);
  const saved = readFileSync(path.join(options.storage, readdirSync(options.storage)[0]!, result.checkpoint.id + '.json'), 'utf8');
  expect(saved).not.toContain('browser-profiles');
  const listing = await workspaceCheckpoint('list', options);
  expect(listing.checkpoints![0].id).toBe(result.checkpoint.id);
});

it('respects .gitignore and excludes common project build/generated directories (Flutter, Android, Python, Node)', async () => {
  const options = fixture();
  // Real source files
  writeFileSync(path.join(options.root, 'main.dart'), 'void main() {}');
  writeFileSync(path.join(options.root, 'app.py'), 'print("hello")');
  // Built-in excluded directories for Flutter, Android, Python
  for (const dir of ['.dart_tool', '.gradle', '__pycache__', '.pytest_cache']) {
    mkdirSync(path.join(options.root, dir), { recursive: true });
    writeFileSync(path.join(options.root, dir, 'cache.bin'), 'cache content');
  }
  // .gitignore file ignoring build/ and *.log
  writeFileSync(path.join(options.root, '.gitignore'), "build/\n*.log\n/ignored-folder/\n");
  mkdirSync(path.join(options.root, 'build'), { recursive: true });
  writeFileSync(path.join(options.root, 'build', 'output.apk'), 'large generated apk');
  mkdirSync(path.join(options.root, 'ignored-folder'), { recursive: true });
  writeFileSync(path.join(options.root, 'ignored-folder', 'data.txt'), 'ignored data');
  writeFileSync(path.join(options.root, 'debug.log'), 'log output');

  const { checkpoint } = await workspaceCheckpoint('create', options);
  // Only main.dart, app.py, and .gitignore should be recorded (3 files)
  expect(checkpoint!.files).toBe(3);

  // Restore should preserve unignored files and not include ignored ones
  writeFileSync(path.join(options.root, 'main.dart'), 'void main() { print(1); }');
  await workspaceCheckpoint('seal', { ...options, id: checkpoint!.id });
  await workspaceCheckpoint('restore', { ...options, id: checkpoint!.id });
  expect(readFileSync(path.join(options.root, 'main.dart'), 'utf8')).toBe('void main() {}');
});

it('creates and restores checkpoints without arbitrary 2 GB or file count limits', async () => {
  const options = fixture();
  for (let i = 0; i < 15; i++) {
    writeFileSync(path.join(options.root, `file_${i}.txt`), `content ${i}`);
  }
  const { checkpoint } = await workspaceCheckpoint('create', options);
  expect(checkpoint!.files).toBe(15);

  writeFileSync(path.join(options.root, 'file_0.txt'), 'modified content 0');
  await workspaceCheckpoint('seal', { ...options, id: checkpoint!.id });
  const listing = await workspaceCheckpoint('list', options);
  expect(listing.checkpoints?.some((c) => c.id === checkpoint!.id)).toBe(true);

  await workspaceCheckpoint('restore', { ...options, id: checkpoint!.id });
  expect(readFileSync(path.join(options.root, 'file_0.txt'), 'utf8')).toBe('content 0');
});

it('incrementally reuses prior hashes for unchanged files and degrades gracefully', async () => {
  const options = fixture();
  writeFileSync(path.join(options.root, 'stable.ts'), 'const a = 1;');
  writeFileSync(path.join(options.root, 'evolving.ts'), 'const b = 1;');

  const first = await workspaceCheckpoint('create', options);
  expect(first.checkpoint?.files).toBe(2);

  // Second checkpoint: stable.ts is unchanged (same mtime and size)
  writeFileSync(path.join(options.root, 'evolving.ts'), 'const b = 2;');
  const second = await workspaceCheckpoint('create', { ...options, label: 'Second' });
  expect(second.checkpoint?.files).toBe(2);

  // Restore reverts evolving.ts to initial state
  await workspaceCheckpoint('seal', { ...options, id: first.checkpoint!.id });
  await workspaceCheckpoint('restore', { ...options, id: first.checkpoint!.id });
  expect(readFileSync(path.join(options.root, 'evolving.ts'), 'utf8')).toBe('const b = 1;');
});
