import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadEnvironment } from '../src/config/environment.js';

describe('local development environment', () => {
  it('loads optional .env values without overriding deployment configuration', () => {
    const home = mkdtempSync(path.join(os.tmpdir(), 'gitu-environment-'));
    const names = ['GITU_FIXTURE_FROM_FILE', 'GITU_FIXTURE_FROM_SHELL'];
    const previous = names.map((name) => process.env[name]);
    try {
      delete process.env[names[0]!];
      process.env[names[1]!] = 'shell-value';
      const file = path.join(home, '.env');
      writeFileSync(file, 'GITU_FIXTURE_FROM_FILE=file-value\nGITU_FIXTURE_FROM_SHELL=do-not-override\n');
      loadEnvironment(file);
      expect(process.env[names[0]!]).toBe('file-value');
      expect(process.env[names[1]!]).toBe('shell-value');
      expect(() => loadEnvironment(path.join(home, 'absent.env'))).not.toThrow();
      expect(() => loadEnvironment(home)).toThrow('Could not load the environment file');
    } finally {
      names.forEach((name, index) => {
        if (previous[index] === undefined) delete process.env[name];
        else process.env[name] = previous[index];
      });
      rmSync(home, { recursive: true, force: true });
    }
  });
});
