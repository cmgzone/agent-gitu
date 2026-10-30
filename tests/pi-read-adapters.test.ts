import { afterEach, describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import * as piAgent from '@earendil-works/pi-coding-agent';
import { ProjectGuard } from '../src/guard/project-guard.js';
import type { ToolContext } from '../src/tools/tools.js';
import {
  piReadFile,
  piListFiles,
  piSearchFiles,
} from '../src/tools/adapters/pi-read-only.js';

const folders: string[] = [];
afterEach(() => {
  for (const folder of folders.splice(0)) rmSync(folder, { force: true, recursive: true });
});

function fixture(): { root: string; ctx: ToolContext } {
  const root = mkdtempSync(path.join(tmpdir(), 'gitu-pi-adapters-'));
  folders.push(root);
  writeFileSync(path.join(root, 'package.json'), JSON.stringify({ name: 'pi-adapters-test' }));
  const guard = ProjectGuard.detect(root);
  const ctx: ToolContext = { guard, cwd: root };
  return { root, ctx };
}

describe('pi read-only adapters', () => {
  describe('piReadFile', () => {
    it('reads a text file with numbered lines', async () => {
      const { root, ctx } = fixture();
      writeFileSync(path.join(root, 'hello.txt'), 'Hello world\nSecond line\nThird line');

      const result = await piReadFile(ctx, { path: 'hello.txt' });
      expect(result.ok).toBe(true);
      expect(result.output).toContain('1: Hello world');
      expect(result.output).toContain('2: Second line');
      expect(result.output).toContain('3: Third line');
    });

    it('honors offset and limit ranges', async () => {
      const { root, ctx } = fixture();
      writeFileSync(path.join(root, 'range.txt'), 'Line 1\nLine 2\nLine 3\nLine 4\nLine 5');

      const result = await piReadFile(ctx, { path: 'range.txt', offset: 2, limit: 2 });
      expect(result.ok).toBe(true);
      expect(result.output).toContain('2: Line 2');
      expect(result.output).toContain('3: Line 3');
      expect(result.output).not.toContain('1: Line 1');
      expect(result.output).not.toContain('4: Line 4');
    });

    it('blocks reading files outside the ProjectGuard boundary', async () => {
      const { ctx } = fixture();
      const outside = path.join(tmpdir(), 'outside-secret.txt');
      writeFileSync(outside, 'secret');
      folders.push(outside);

      await expect(piReadFile(ctx, { path: outside })).rejects.toThrow();
    });

    it('refuses directory targets cleanly', async () => {
      const { root, ctx } = fixture();
      mkdirSync(path.join(root, 'subdir'));

      const result = await piReadFile(ctx, { path: 'subdir' });
      expect(result.ok).toBe(false);
      expect(result.output).toContain('is a directory');
    });

    it('can fall back to native implementation when requested', async () => {
      const { root, ctx } = fixture();
      writeFileSync(path.join(root, 'native.txt'), 'Native content');

      const result = await piReadFile(ctx, { path: 'native.txt' }, undefined, { forceNative: true });
      expect(result.ok).toBe(true);
      expect(result.output).toContain('1: Native content');
    });

    it('fallback never bypasses a boundary denial', async () => {
      const { ctx } = fixture();
      const outside = path.join(tmpdir(), 'outside-secret.txt');
      writeFileSync(outside, 'secret');
      folders.push(outside);

      // Both normal execution and forceNative must strictly throw on unauthorized paths
      await expect(piReadFile(ctx, { path: outside })).rejects.toThrow();
      await expect(piReadFile(ctx, { path: outside }, undefined, { forceNative: true })).rejects.toThrow();
    });

    it('fallback never bypasses parameter validation', async () => {
      const { ctx } = fixture();
      const invalid = await piReadFile(ctx, {});
      expect(invalid.ok).toBe(false);
      expect(invalid.output).toContain('INVALID TOOL CALL');

      const invalidNative = await piReadFile(ctx, {}, undefined, { forceNative: true });
      expect(invalidNative.ok).toBe(false);
      expect(invalidNative.output).toContain('INVALID TOOL CALL');
    });

    it('recovers cleanly via native fallback when Pi execution throws an unexpected error', async () => {
      const { root, ctx } = fixture();
      writeFileSync(path.join(root, 'recoverable.txt'), 'Safe content to recover');

      const mockDef = {
        name: 'read',
        description: 'mock',
        parameters: { type: 'object' },
        execute: async () => {
          throw new Error('Simulated Pi engine failure');
        },
      } as unknown as ReturnType<typeof piAgent.createReadToolDefinition>;

      const result = await piReadFile(ctx, { path: 'recoverable.txt' }, undefined, { _readDef: mockDef });
      // The adapter should catch Pi's execution error and recover via Gitu's nativeReadFile
      expect(result.ok).toBe(true);
      expect(result.output).toContain('1: Safe content to recover');
    });
  });

  describe('piListFiles', () => {
    it('lists directory entries', async () => {
      const { root, ctx } = fixture();
      writeFileSync(path.join(root, 'a.ts'), '');
      writeFileSync(path.join(root, 'b.ts'), '');

      const result = await piListFiles(ctx, { path: '.' });
      expect(result.ok).toBe(true);
      expect(result.output).toContain('a.ts');
      expect(result.output).toContain('b.ts');
    });

    it('lists recursively when recursive: true', async () => {
      const { root, ctx } = fixture();
      mkdirSync(path.join(root, 'sub'));
      writeFileSync(path.join(root, 'sub', 'nested.ts'), '');

      const result = await piListFiles(ctx, { path: '.', recursive: true });
      expect(result.ok).toBe(true);
      expect(result.output).toMatch(/sub[\/\\]nested\.ts/);
    });

    it('blocks listing paths outside the ProjectGuard boundary', async () => {
      const { ctx } = fixture();
      await expect(piListFiles(ctx, { path: '../../..' })).rejects.toThrow();
      await expect(piListFiles(ctx, { path: '../../..' }, undefined, { forceNative: true })).rejects.toThrow();
    });

    it('recovers via native listing if Pi ls throws', async () => {
      const { root, ctx } = fixture();
      writeFileSync(path.join(root, 'fallback-entry.txt'), '');

      const mockDef = {
        name: 'ls',
        description: 'mock',
        parameters: { type: 'object' },
        execute: async () => {
          throw new Error('Simulated Pi ls crash');
        },
      } as unknown as ReturnType<typeof piAgent.createLsToolDefinition>;

      const result = await piListFiles(ctx, { path: '.' }, undefined, { _lsDef: mockDef });
      expect(result.ok).toBe(true);
      expect(result.output).toContain('fallback-entry.txt');
    });
  });

  describe('piSearchFiles', () => {
    it('searches pattern across files', async () => {
      const { root, ctx } = fixture();
      writeFileSync(path.join(root, 'code.ts'), 'export const TARGET_TOKEN = 42;');

      const result = await piSearchFiles(ctx, { pattern: 'TARGET_TOKEN' });
      expect(result.ok).toBe(true);
      expect(result.output).toContain('TARGET_TOKEN');
    });

    it('respects literal and case sensitivity modes', async () => {
      const { root, ctx } = fixture();
      writeFileSync(path.join(root, 'cases.ts'), 'MySpecialSymbol = true;');

      const insensitive = await piSearchFiles(ctx, { pattern: 'myspecialsymbol', caseSensitive: false });
      expect(insensitive.ok).toBe(true);
      expect(insensitive.output).toContain('MySpecialSymbol');
    });

    it('blocks search outside the ProjectGuard boundary', async () => {
      const { ctx } = fixture();
      await expect(piSearchFiles(ctx, { pattern: 'test', path: '../../..' })).rejects.toThrow();
      await expect(piSearchFiles(ctx, { pattern: 'test', path: '../../..' }, undefined, { forceNative: true })).rejects.toThrow();
    });

    it('recovers via native search if Pi grep throws', async () => {
      const { root, ctx } = fixture();
      writeFileSync(path.join(root, 'searchable.txt'), 'find-this-needle-in-native');

      const mockDef = {
        name: 'grep',
        description: 'mock',
        parameters: { type: 'object' },
        execute: async () => {
          throw new Error('Simulated Pi grep crash');
        },
      } as unknown as ReturnType<typeof piAgent.createGrepToolDefinition>;

      const result = await piSearchFiles(ctx, { pattern: 'find-this-needle-in-native' }, undefined, { _grepDef: mockDef });
      expect(result.ok).toBe(true);
      expect(result.output).toContain('searchable.txt');
      expect(result.output).toContain('find-this-needle-in-native');
    });
  });
});
