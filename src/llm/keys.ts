import os from 'node:os';
import path from 'node:path';
import { readJson, writeJson } from '../util.js';

const KEY_FILE = path.join(os.homedir(), '.hermes', 'keys.json');

export function loadStoredKeys(): Record<string, string> {
  const data = readJson<Record<string, unknown>>(KEY_FILE) ?? {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(data)) {
    if (typeof v === 'string' && v) out[k] = v;
  }
  return out;
}

export function storedKeyVars(): string[] {
  return Object.keys(loadStoredKeys());
}

export function mergedEnv(): NodeJS.ProcessEnv {
  return { ...loadStoredKeys(), ...process.env } as NodeJS.ProcessEnv;
}

export function setStoredKey(envVar: string, key: string): void {
  const data = loadStoredKeys();
  data[envVar] = key;
  writeJson(KEY_FILE, data);
}

export function removeStoredKey(envVar: string): void {
  const data = loadStoredKeys();
  delete data[envVar];
  writeJson(KEY_FILE, data);
}
