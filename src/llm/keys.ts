import { execFileSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { ensureGituHome } from '../workspace/home.js';
import { readCredentialJson, updateCredentialJson } from './credential-file.js';
import { SecretVault } from '../connections/secret-vault.js';

const vaults = new Map<string, SecretVault>();
function keyVault(file: string): SecretVault {
  const root = path.join(path.dirname(file), 'KeyProtection');
  let vault = vaults.get(root);
  if (!vault) {
    vault = new SecretVault(root);
    vaults.set(root, vault);
  }
  return vault;
}
function decodeKeys(file: string, value: unknown): Record<string, unknown> {
  const raw = keyRecord(value);
  return raw['format'] === 'gitu-keys-v1' ? keyRecord(keyVault(file).open('keys', raw['payload'] as { iv: string; tag: string; data: string })) : raw;
}
function encodeKeys(file: string, value: Record<string, unknown>): Record<string, unknown> {
  return { format: 'gitu-keys-v1', payload: keyVault(file).seal('keys', value) };
}

function keyRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid credential record.');
  return value as Record<string, unknown>;
}

function keyFiles(): string[] {
  return [path.join(ensureGituHome().settings, 'keys.json'), path.join(os.homedir(), '.hermes', 'keys.json')];
}

export function loadStoredKeys(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const file of [...keyFiles()].reverse()) {
    let legacy=false;
    const data = readCredentialJson(file, (value) => {if(keyRecord(value)['format']!=='gitu-keys-v1')legacy=true;return decodeKeys(file,value);}) ?? {};
    if(legacy)updateCredentialJson(file,value=>decodeKeys(file,value),current=>encodeKeys(file,current??{}),previous=>JSON.stringify(encodeKeys(file,decodeKeys(file,JSON.parse(previous)))));
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
    const hives = ['HKEY_LOCAL_MACHINE\\SYSTEM\\CurrentControlSet\\Control\\Session Manager\\Environment', 'HKEY_CURRENT_USER\\Environment'];
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
  keyVault(file).encryptionKey();
  updateCredentialJson(
    file,
    (value) => decodeKeys(file, value),
    (current) => encodeKeys(file, { ...current, [envVar]: key }),
    previous=>JSON.stringify(encodeKeys(file,decodeKeys(file,JSON.parse(previous)))),
  );
}

export function removeStoredKey(envVar: string): void {
  for (const file of keyFiles()) {
    if (readCredentialJson(file, (value) => decodeKeys(file, value)) === undefined) continue;
    updateCredentialJson(
      file,
      (value) => decodeKeys(file, value),
      (current) => {
        if (!current || !(envVar in current)) return undefined;
        delete current[envVar];
        return encodeKeys(file, current);
      },
      previous=>JSON.stringify(encodeKeys(file,decodeKeys(file,JSON.parse(previous)))),
    );
  }
}
