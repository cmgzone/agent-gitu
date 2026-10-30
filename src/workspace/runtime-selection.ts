import { existsSync } from 'node:fs';
import path from 'node:path';
import { readJson, writeJson } from '../util.js';
import { ensureGituHome } from './home.js';
export interface RuntimeSelection {
  provider?: string;
  model?: string;
  projectPath?: string;
  updatedAt?: string;
}
const file = () => path.join(ensureGituHome().settings, 'runtime-selection.json');
export function readRuntimeSelection(): RuntimeSelection {
  const value = readJson<RuntimeSelection>(file());
  return value && typeof value === 'object' ? value : {};
}
export function saveRuntimeSelection(patch: RuntimeSelection): RuntimeSelection {
  const next = { ...readRuntimeSelection(), ...patch, updatedAt: new Date().toISOString() };
  if (
    ('provider' in patch || 'model' in patch) &&
    (!/^[a-zA-Z0-9_-]{1,100}$/.test(String(next.provider ?? '')) || typeof next.model !== 'string' || !next.model.trim() || next.model.length > 240)
  )
    throw Error('Choose a provider and model.');
  if (patch.projectPath !== undefined && (!path.isAbsolute(patch.projectPath) || !existsSync(patch.projectPath))) throw Error('Choose an existing project folder.');
  // Shares the hardened tmp → fsync → rename writer: a fixed temp name could
  // collide across concurrent writers, and an unsynced rename can publish a
  // NUL-filled file (see writeJson).
  writeJson(file(), next, { mode: 0o600 });
  return next;
}
