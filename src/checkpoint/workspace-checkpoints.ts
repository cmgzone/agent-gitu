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
  type Entry = { hash?: string; mode: number; link?: string; size?: number; mtimeMs?: number };
  type Record = WorkspaceCheckpoint & { before: { [name: string]: Entry }; after?: { [name: string]: Entry } };
  const root = await fs.realpath(options.root);
  const storage = path.resolve(options.storage);
  const folder = path.join(storage, crypto.createHash('sha256').update(root).digest('hex'));
  const blobs = path.join(folder, 'blobs');
  // Embedded-browser profiles are live runtime state, not project source. They
  // contain locked databases and must never be copied into rollback snapshots.
  // Common dependency, cache and generated build directories across Node, Python,
  // Android, Flutter, Rust, iOS, and Web frameworks are excluded by default.
  const skipped = new Set([
    // Version control
    '.git', '.svn', '.hg',
    // Agent Gitu / Hermes runtime state & caches
    '.hermes', '.qa', '.release', 'browser-profiles',
    // Node / Web dependencies & caches
    'node_modules', '.next', '.turbo', '.nuxt', '.svelte-kit', '.output', '.cache', 'coverage', '.parcel-cache', '.rollup.cache',
    // Python
    '.venv', 'venv', 'env', '__pycache__', '.pytest_cache', '.mypy_cache', '.ruff_cache', '.tox', 'htmlcov',
    // Android & Java
    '.gradle', '.cxx', 'captures',
    // Flutter & Dart
    '.dart_tool', '.flutter-plugins', '.flutter-plugins-dependencies', 'ephemeral',
    // Build artifacts & compiled targets
    'target', 'DerivedData', 'Pods',
    // OS caches
    '.DS_Store'
  ]);
  type GitignoreRule = {
    negated: boolean;
    dirOnly: boolean;
    regex: RegExp;
    prefix: string;
  };
  const gitignoreRules: GitignoreRule[] = [];
  const parseGitignoreContent = (content: string, dirRel: string) => {
    for (let line of content.split(/\r?\n/)) {
      line = line.trim();
      if (!line || line.startsWith('#')) continue;
      let negated = false;
      if (line.startsWith('!')) {
        negated = true;
        line = line.slice(1).trim();
      }
      const dirOnly = line.endsWith('/');
      if (dirOnly) line = line.slice(0, -1);
      const anchored = line.startsWith('/') || line.includes('/');
      if (line.startsWith('/')) line = line.slice(1);
      let re = '';
      for (let i = 0; i < line.length; i++) {
        const c = line.charAt(i);
        if (c === '*') {
          if (line.charAt(i + 1) === '*') {
            if (line.charAt(i + 2) === '/') { re += '(?:.*/)?'; i += 2; }
            else { re += '.*'; i++; }
          } else { re += '[^/]*'; }
        } else if (c === '?') { re += '[^/]'; }
        else if ('.+()[]{}^$|\\'.includes(c)) { re += '\\' + c; }
        else { re += c; }
      }
      const regex = new RegExp(anchored ? '^' + re + '$' : '(?:^|/)' + re + '$');
      gitignoreRules.push({
        negated,
        dirOnly,
        regex,
        prefix: dirRel ? dirRel + '/' : '',
      });
    }
  };
  const isIgnored = (relPath: string, isDirectory: boolean): boolean => {
    let ignored = false;
    for (const rule of gitignoreRules) {
      if (rule.prefix && !relPath.startsWith(rule.prefix)) continue;
      if (rule.dirOnly && !isDirectory) continue;
      const testPath = rule.prefix ? relPath.slice(rule.prefix.length) : relPath;
      if (rule.regex.test(testPath)) {
        ignored = !rule.negated;
      }
    }
    return ignored;
  };
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
  const records = async (): Promise<Record[]> => {
    let files: string[];
    try { files = await fs.readdir(folder); } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []; throw error; }
    const result: Record[] = [];
    for (const file of files.filter(file => /^cp_[a-f0-9-]+\.json$/.test(file))) {
      try {
        const record = JSON.parse(await fs.readFile(path.join(folder, file), 'utf8')) as Record;
        if (record.root === root && record.key === options.key) result.push(record);
      } catch {
        /* ignore unreadable or damaged checkpoint record */
      }
    }
    return result.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  };
  const scan = async (copy: boolean) => {
    const entries: { [name: string]: Entry } = {};
    let bytes = 0, count = 0;
    const priorRecords = await records();
    const priorEntries = priorRecords[0]?.before ?? {};
    try {
      const rootGitignore = path.join(root, '.gitignore');
      const content = await fs.readFile(rootGitignore, 'utf8');
      parseGitignoreContent(content, '');
    } catch {
      /* no root .gitignore */
    }
    const visit = async (directory: string) => {
      let dirChildren;
      try {
        dirChildren = await fs.readdir(directory, { withFileTypes: true });
      } catch {
        return; // directory unreadable or disappeared - skip gracefully
      }
      // If directory contains a nested .gitignore, parse it first before filtering other files
      for (const child of dirChildren) {
        if (child.name === '.gitignore' && directory !== root) {
          try {
            const rel = path.relative(root, directory).split(path.sep).join('/');
            const content = await fs.readFile(path.join(directory, child.name), 'utf8');
            parseGitignoreContent(content, rel);
          } catch {
            /* ignore unreadable nested .gitignore */
          }
        }
      }
      for (const child of dirChildren) {
        if (skipped.has(child.name)) continue;
        const file = path.join(directory, child.name);
        if (file === storage || file === folder) continue;
        const name = path.relative(root, file).split(path.sep).join('/');
        let stat;
        try {
          stat = await fs.lstat(file);
        } catch {
          continue; // unreadable/locked/transient file, skip gracefully
        }
        if (isIgnored(name, stat.isDirectory())) continue;
        if (stat.isSymbolicLink()) {
          try {
            entries[name] = { link: await fs.readlink(file), mode: stat.mode & 0o777 };
          } catch {
            continue;
          }
        }
        else if (stat.isDirectory()) await visit(file);
        else if (stat.isFile()) {
          count++;
          bytes += stat.size;
          let hash: string;
          const prior = priorEntries[name];
          if (prior?.hash && prior.size === stat.size && prior.mtimeMs === stat.mtimeMs) {
            // Intelligent incremental reuse: unchanged mtime + size reuses sha256
            hash = prior.hash;
          } else {
            try {
              hash = await digest(file);
            } catch {
              continue; // file unreadable or disappeared during digest
            }
          }
          if (copy) {
            const blob = path.join(blobs, hash);
            try { await fs.access(blob); } catch {
              try {
                await fs.copyFile(file, blob);
                await fs.chmod(blob, 0o600);
                if (await digest(blob) !== hash) continue;
              } catch {
                continue;
              }
            }
          }
          entries[name] = { hash, mode: stat.mode & 0o777, size: stat.size, mtimeMs: stat.mtimeMs };
        }
      }
    };
    await visit(root);
    return entries;
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
