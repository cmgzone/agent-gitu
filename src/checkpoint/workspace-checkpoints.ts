export interface WorkspaceCheckpoint {
  id: string;
  key: string;
  root: string;
  label: string;
  createdAt: string;
  sealedAt?: string;
  restoredAt?: string;
  files: number;
  changedFiles?: number;
}

/** Self-contained so the same implementation runs on a private/cloud computer.
 * Never changes Git's HEAD, index, branches or the user's existing commits. */
export async function workspaceCheckpoint(
  operation: 'create' | 'seal' | 'list' | 'restore',
  options: { root: string; storage: string; key: string; id?: string; label?: string },
): Promise<{ checkpoints?: WorkspaceCheckpoint[]; checkpoint?: WorkspaceCheckpoint; recoveryId?: string }> {
  const fs = await import('node:fs/promises');
  const path = await import('node:path');
  const crypto = await import('node:crypto');
  const { createReadStream } = await import('node:fs');
  type Entry = { hash?: string; mode: number; link?: string };
  type Record = WorkspaceCheckpoint & { before: { [name: string]: Entry }; after?: { [name: string]: Entry } };
  const root = await fs.realpath(options.root);
  const storage = path.resolve(options.storage);
  const folder = path.join(storage, crypto.createHash('sha256').update(root).digest('hex'));
  const blobs = path.join(folder, 'blobs');
  // Embedded-browser profiles are live runtime state, not project source. They
  // contain locked databases and must never be copied into rollback snapshots.
  const skipped = new Set(['.git', '.hermes', '.qa', 'node_modules', '.venv', 'venv', '__pycache__', '.next', '.turbo', '.gradle', 'target', 'browser-profiles']);
  const same = (a?: Entry, b?: Entry) => a?.hash === b?.hash && a?.link === b?.link && a?.mode === b?.mode;
  const digest = async (file: string) => {
    const hash = crypto.createHash('sha256');
    try {
      for await (const chunk of createReadStream(file)) hash.update(chunk);
    } catch (error) {
      throw new Error('Checkpoint could not read ' + JSON.stringify(path.relative(root, file)) + ': ' + (error as Error).message + '. Close the program locking this project file and retry.', { cause: error });
    }
    return hash.digest('hex');
  };
  const save = async (record: Record) => {
    const target = path.join(folder, record.id + '.json'), temporary = target + '.' + crypto.randomUUID() + '.tmp';
    await fs.writeFile(temporary, JSON.stringify(record), { mode: 0o600 });
    await fs.rename(temporary, target);
  };
  const view = ({ before: _before, after: _after, ...record }: Record): WorkspaceCheckpoint => record;
  const scan = async (copy: boolean) => {
    const entries: { [name: string]: Entry } = {};
    let bytes = 0, count = 0;
    const visit = async (directory: string) => {
      for (const child of await fs.readdir(directory, { withFileTypes: true })) {
        if (skipped.has(child.name)) continue;
        const file = path.join(directory, child.name);
        if (file === storage || file === folder) continue;
        const name = path.relative(root, file).split(path.sep).join('/');
        const stat = await fs.lstat(file);
        if (stat.isSymbolicLink()) entries[name] = { link: await fs.readlink(file), mode: stat.mode & 0o777 };
        else if (stat.isDirectory()) await visit(file);
        else if (stat.isFile()) {
          bytes += stat.size;
          if (++count > 100_000 || bytes > 2 * 1024 ** 3) throw Error('Checkpoint exceeds 2 GB or 100,000 project files. Select a smaller project folder before coding.');
          const hash = await digest(file);
          if (copy) {
            const blob = path.join(blobs, hash);
            try { await fs.access(blob); } catch {
              await fs.copyFile(file, blob);
              await fs.chmod(blob, 0o600);
              if (await digest(blob) !== hash) throw Error('A project file changed while saving its checkpoint. Retry when file writes finish.');
            }
          }
          entries[name] = { hash, mode: stat.mode & 0o777 };
        }
      }
    };
    await visit(root);
    return entries;
  };
  const records = async (): Promise<Record[]> => {
    let files: string[];
    try { files = await fs.readdir(folder); } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []; throw error; }
    const result: Record[] = [];
    for (const file of files.filter(file => /^cp_[a-f0-9-]+\.json$/.test(file))) {
      const record = JSON.parse(await fs.readFile(path.join(folder, file), 'utf8')) as Record;
      if (record.root === root && record.key === options.key) result.push(record);
    }
    return result.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  };
  if (operation === 'list') return { checkpoints: (await records()).map(view) };
  await fs.mkdir(blobs, { recursive: true, mode: 0o700 });
  if (operation === 'create') {
    const before = await scan(true);
    const checkpoint: Record = { id: 'cp_' + crypto.randomUUID(), key: options.key, root, label: (options.label || 'Before coding').slice(0, 160), createdAt: new Date().toISOString(), files: Object.keys(before).length, before };
    await save(checkpoint);
    return { checkpoint: view(checkpoint) };
  }
  if (!options.id || !/^cp_[a-f0-9-]+$/.test(options.id)) throw Error('Choose a saved checkpoint.');
  const record = (await records()).find(record => record.id === options.id);
  if (!record) throw Error('Checkpoint not found for this task and project.');
  if (operation === 'seal') {
    if (!record.sealedAt) {
      record.after = await scan(false);
      record.changedFiles = [...new Set([...Object.keys(record.before), ...Object.keys(record.after)])].filter(name => !same(record.before[name], record.after![name])).length;
      record.sealedAt = new Date().toISOString();
      await save(record);
    }
    return { checkpoint: view(record) };
  }
  if (!record.after || !record.sealedAt) throw Error('Stop the coding task before rolling back its checkpoint.');
  if (record.restoredAt) throw Error('This checkpoint has already been restored. Use its recovery checkpoint to undo the rollback.');
  const changed = [...new Set([...Object.keys(record.before), ...Object.keys(record.after)])].filter(name => !same(record.before[name], record.after![name]));
  const current = await scan(false);
  const conflicts = changed.filter(name => !same(current[name], record.after![name]));
  const changing = new Set(changed);
  for (const name of changed) if (record.before[name] && Object.keys(current).some(file => file.startsWith(name + '/') && !changing.has(file))) conflicts.push(name);
  if (conflicts.length) throw Error('Later edits would be overwritten. Rollback stopped for: ' + conflicts.slice(0, 8).join(', '));
  // Verify paths, ancestor links and recovery blobs before changing any project file.
  const target = async (name: string) => {
    const file = path.resolve(root, ...name.split('/')), relative = path.relative(root, file);
    if (!relative || relative === '..' || relative.startsWith('..' + path.sep) || path.isAbsolute(relative)) throw Error('Checkpoint path escaped its project.');
    let parent = path.dirname(file);
    while (parent !== root) {
      try { if ((await fs.lstat(parent)).isSymbolicLink()) throw Error('A checkpoint folder was replaced with a symbolic link.'); }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
      parent = path.dirname(parent);
    }
    return file;
  };
  for (const name of changed) {
    await target(name);
    const hash = record.before[name]?.hash;
    if (hash && (!/^[a-f0-9]{64}$/.test(hash) || await digest(path.join(blobs, hash)) !== hash)) throw Error('Checkpoint recovery file is missing or damaged. Project files were preserved.');
  }
  const recovery = await workspaceCheckpoint('create', { ...options, label: 'Before rollback · ' + record.label });
  try {
  const directories = new Set<string>();
  // Remove only files changed by this task. Never recursively delete a project folder.
  for (const name of changed.sort((a, b) => b.split('/').length - a.split('/').length)) {
    const file = await target(name);
    try { const stat = await fs.lstat(file); if (stat.isDirectory()) await fs.rmdir(file); else await fs.unlink(file); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
    let parent = path.dirname(file);
    while (parent !== root) { directories.add(parent); parent = path.dirname(parent); }
  }
  for (const directory of [...directories].sort((a, b) => b.length - a.length)) {
    try { await fs.rmdir(directory); } catch (error) { if (!['ENOENT', 'ENOTDIR', 'ENOTEMPTY', 'EEXIST'].includes((error as NodeJS.ErrnoException).code || '')) throw error; }
  }
  for (const name of changed) {
    const entry = record.before[name];
    if (!entry) continue;
    const file = await target(name);
    await fs.mkdir(path.dirname(file), { recursive: true });
    if (entry.link !== undefined) await fs.symlink(entry.link, file);
    else { await fs.copyFile(path.join(blobs, entry.hash!), file); await fs.chmod(file, entry.mode); }
  }
  record.restoredAt = new Date().toISOString();
  await save(record);
  return { checkpoint: view(record), recoveryId: recovery.checkpoint!.id };
  } finally {
    await workspaceCheckpoint('seal', { ...options, id: recovery.checkpoint!.id });
  }
}
