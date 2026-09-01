import { execFileSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { ensureGituHome } from '../workspace/home.js';
import { readJson, writeJson } from '../util.js';

function keyFiles(): string[] {
  return [path.join(ensureGituHome().settings, 'keys.json'), path.join(os.homedir(), '.hermes', 'keys.json')];
}

export function loadStoredKeys(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const file of [...keyFiles()].reverse()) {
    const data = readJson<Record<string, unknown>>(file) ?? {};
    for (const [k, v] of Object.entries(data)) {
      if (typeof v === 'string' && v) out[k] = v;
    }
  }
  return out;
}

export function storedKeyVars(): string[] {
  return Object.keys(loadStoredKeys());
}

let registryEnvCache: Record<string, string> | undefined;

export function registryEnv(): Record<string, string> {
  if (registryEnvCache) return registryEnvCache;
  const out: Record<string, string> = {};
  if (process.platform === 'win32') {
    const hives = [
      'HKEY_LOCAL_MACHINE\\SYSTEM\\CurrentControlSet\\Control\\Session Manager\\Environment',
      'HKEY_CURRENT_USER\\Environment',
    ];
    for (const hive of hives) {
      let raw = '';
      try {
        raw = execFileSync('reg', ['query', hive], { encoding: 'utf8', windowsHide: true, timeout: 5000 });
      } catch {
        continue;
      }
      for (const line of raw.split(/\r?\n/)) {
        const m = line.match(/^\s+(\S+)\s+REG_(SZ|EXPAND_SZ)\s+(.*)$/i);
        if (!m) continue;
        const name = m[1]!;
        let value = (m[3] ?? '').trim();
        if (/^expand_sz$/i.test(m[2]!)) {
          value = value.replace(/%([^%]+)%/g, (all, v: string) => process.env[v] ?? out[v] ?? '');
        }
        out[name] = value;
      }
    }
  }
  registryEnvCache = out;
  return out;
}

export function mergedEnv(): NodeJS.ProcessEnv {
  return { ...registryEnv(), ...loadStoredKeys(), ...process.env } as NodeJS.ProcessEnv;
}

export function setStoredKey(envVar: string, key: string): void {
  const file = keyFiles()[0]!;
  const data = readJson<Record<string, unknown>>(file) ?? {};
  data[envVar] = key;
  writeJson(file, data);
}

export function removeStoredKey(envVar: string): void {
  for (const file of keyFiles()) {
    const data = readJson<Record<string, unknown>>(file);
    if (data && envVar in data) {
      delete data[envVar];
      writeJson(file, data);
    }
  }
}
