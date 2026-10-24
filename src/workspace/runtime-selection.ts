import { existsSync, readFileSync, mkdirSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { ensureGituHome } from './home.js';
export interface RuntimeSelection {
  provider?: string;
  model?: string;
  projectPath?: string;
  updatedAt?: string;
}
const file = () => path.join(ensureGituHome().settings, 'runtime-selection.json');
export function readRuntimeSelection(): RuntimeSelection {
  try {
    const value = JSON.parse(readFileSync(file(), 'utf8'));
    return value && typeof value === 'object' ? value : {};
  } catch {
    return {};
  }
}
export function saveRuntimeSelection(patch: RuntimeSelection): RuntimeSelection {
  const next = { ...readRuntimeSelection(), ...patch, updatedAt: new Date().toISOString() };
  if (
    ('provider' in patch || 'model' in patch) &&
    (!/^[a-zA-Z0-9_-]{1,100}$/.test(String(next.provider ?? '')) || typeof next.model !== 'string' || !next.model.trim() || next.model.length > 240)
  )
    throw Error('Choose a provider and model.');
  if (patch.projectPath !== undefined && (!path.isAbsolute(patch.projectPath) || !existsSync(patch.projectPath))) throw Error('Choose an existing project folder.');
  const target = file(),
    temporary = target + '.' + process.pid + '.tmp';
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(temporary, JSON.stringify(next, null, 2), { mode: 0o600 });
  renameSync(temporary, target);
  return next;
}
