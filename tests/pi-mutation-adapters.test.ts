import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { ProjectGuard } from '../src/guard/project-guard.js';
import type { ToolContext } from '../src/tools/tools.js';
import { piWriteFile, piApplyEdit } from '../src/tools/adapters/pi-mutations.js';

const folders: string[] = [];
afterEach(() => {
  for (const folder of folders.splice(0)) rmSync(folder, { force: true, recursive: true });
});

function fixture(): { root: string; ctx: ToolContext } {
  const root = mkdtempSync(path.join(tmpdir(), 'gitu-pi-mutations-'));
  folders.push(root);
  writeFileSync(path.join(root, 'package.json'), JSON.stringify({ name: 'pi-mutations-test' }));
  const guard = ProjectGuard.detect(root);
  const ctx: ToolContext = { guard, cwd: root };
  return { root, ctx };
}

describe('pi mutation adapters', () => {
  describe('piWriteFile', () => {
    it('writes content and verifies persisted file', async () => {
      const { root, ctx } = fixture();
      const result = await piWriteFile(ctx, { path: 'created.txt', content: 'New content here' });
      expect(result.ok).toBe(true);
      expect(result.output).toContain('Wrote 16 chars to created.txt');
      expect(readFileSync(path.join(root, 'created.txt'), 'utf8')).toBe('New content here');
      expect(result.filesTouched).toContain('created.txt');
    });

    it('blocks writes outside the ProjectGuard boundary', async () => {
      const { ctx } = fixture();
      const outside = path.join(tmpdir(), 'forbidden.txt');
      await expect(piWriteFile(ctx, { path: outside, content: 'bad' })).rejects.toThrow();
      await expect(piWriteFile(ctx, { path: outside, content: 'bad' }, undefined, { forceNative: true })).rejects.toThrow();
    });

    it('rejects invalid parameters without queueing or mutating', async () => {
      const { ctx } = fixture();
      const invalid = await piWriteFile(ctx, {});
      expect(invalid.ok).toBe(false);
      expect(invalid.output).toContain('write_file: missing "path"');

      const invalidNative = await piWriteFile(ctx, {}, undefined, { forceNative: true });
      expect(invalidNative.ok).toBe(false);
      expect(invalidNative.output).toContain('write_file: missing "path"');
    });

    it('queues and safely completes sequential writes to the same file', async () => {
      const { root, ctx } = fixture();
      const p1 = piWriteFile(ctx, { path: 'race.txt', content: 'First' });
      const p2 = piWriteFile(ctx, { path: 'race.txt', content: 'Second' });
      await Promise.all([p1, p2]);
      expect(readFileSync(path.join(root, 'race.txt'), 'utf8')).toBe('Second');
    });
  });

  describe('piApplyEdit', () => {
    it('replaces exact text and returns diff payload', async () => {
      const { root, ctx } = fixture();
      writeFileSync(path.join(root, 'edit.txt'), 'Line 1\nTarget text\nLine 3');

      const result = await piApplyEdit(ctx, {
        path: 'edit.txt',
        oldString: 'Target text',
        newString: 'Replacement text',
      });

      expect(result.ok).toBe(true);
      expect(result.output).toContain('Edited edit.txt');
      expect(readFileSync(path.join(root, 'edit.txt'), 'utf8')).toBe('Line 1\nReplacement text\nLine 3');
      expect(result.filesTouched).toContain('edit.txt');
    });

    it('normalizes Pi-style edits array argument', async () => {
      const { root, ctx } = fixture();
      writeFileSync(path.join(root, 'pi-style.txt'), 'alpha beta gamma');

      const result = await piApplyEdit(ctx, {
        path: 'pi-style.txt',
        edits: [{ oldText: 'beta', newText: 'omega' }],
      });

      expect(result.ok).toBe(true);
      expect(readFileSync(path.join(root, 'pi-style.txt'), 'utf8')).toBe('alpha omega gamma');
    });

    it('blocks edits outside the ProjectGuard boundary', async () => {
      const { ctx } = fixture();
      await expect(
        piApplyEdit(ctx, { path: '../../outside.txt', oldString: 'a', newString: 'b' }),
      ).rejects.toThrow();
      await expect(
        piApplyEdit(ctx, { path: '../../outside.txt', oldString: 'a', newString: 'b' }, undefined, { forceNative: true }),
      ).rejects.toThrow();
    });

    it('rejects invalid edit parameters without queueing or mutating', async () => {
      const { ctx } = fixture();
      const invalid = await piApplyEdit(ctx, {});
      expect(invalid.ok).toBe(false);
      expect(invalid.output).toContain('apply_edit: missing "path"');

      const invalidNative = await piApplyEdit(ctx, {}, undefined, { forceNative: true });
      expect(invalidNative.ok).toBe(false);
      expect(invalidNative.output).toContain('apply_edit: missing "path"');
    });
  });
});
