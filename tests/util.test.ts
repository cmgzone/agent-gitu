import { describe, expect, it } from 'vitest';
import { errorSignature, hashParams, normalizeErrorText } from '../src/util.js';

describe('normalizeErrorText', () => {
  it('strips paths, locations, timestamps, and long numbers', () => {
    const a = normalizeErrorText('Error at C:\\Users\\Admin\\repo\\src\\foo.ts:12:34 on 2026-08-15T10:00:00.123Z pid 47231');
    expect(a).not.toContain('c:\\users');
    expect(a).not.toContain('2026');
    expect(a).toContain('<path>');
    expect(a).toContain('<loc>');
  });

  it('produces identical signatures for the same error with different paths', () => {
    const sig1 = errorSignature('TypeError: x is not a function\n    at C:\\a\\b\\c.ts:10:5');
    const sig2 = errorSignature('TypeError: x is not a function\n    at D:\\other\\place.ts:99:1');
    expect(sig1).toBe(sig2);
  });

  it('produces different signatures for different errors', () => {
    const sig1 = errorSignature('TypeError: x is not a function');
    const sig2 = errorSignature('RangeError: stack overflow detected');
    expect(sig1).not.toBe(sig2);
  });
});

describe('hashParams', () => {
  it('is deterministic and key-order independent', () => {
    const h1 = hashParams('run_command', { command: 'npm test', timeoutMs: 100 });
    const h2 = hashParams('run_command', { timeoutMs: 100, command: 'npm test' });
    expect(h1).toBe(h2);
  });

  it('differs for different params', () => {
    const h1 = hashParams('run_command', { command: 'npm test' });
    const h2 = hashParams('run_command', { command: 'npm run build' });
    expect(h1).not.toBe(h2);
  });

  it('normalizes path and presentation knobs for the same read_file range', () => {
    const a = hashParams('read_file', { path: './src/game.ts', offset: 1, limit: 120, maxChars: 8000 });
    const b = hashParams('read_file', { path: 'src/game.ts', offset: 1, limit: 120, maxChars: 30000 });
    expect(a).toBe(b);
  });

  it('keeps different read_file line ranges distinct', () => {
    const a = hashParams('read_file', { path: 'src/game.ts', offset: 1, limit: 120 });
    const b = hashParams('read_file', { path: 'src/game.ts', offset: 150, limit: 40 });
    expect(a).not.toBe(b);
  });

  it('ignores search presentation knobs but preserves the actual search question', () => {
    const a = hashParams('search_files', {
      pattern: 'pipeSpeed',
      path: './src',
      mode: 'literal',
      flags: 'mi',
      include: ['**/*.ts', '**/*.tsx'],
      maxResults: 10,
      contextLines: 1,
    });
    const b = hashParams('search_files', {
      pattern: 'pipeSpeed',
      path: 'src',
      mode: 'literal',
      flags: 'im',
      include: ['**/*.tsx', '**/*.ts'],
      maxResults: 100,
      contextLines: 5,
    });
    const different = hashParams('search_files', {
      pattern: 'spawnEvery',
      path: 'src',
      mode: 'literal',
      flags: 'im',
      include: ['**/*.tsx', '**/*.ts'],
    });
    expect(a).toBe(b);
    expect(a).not.toBe(different);
  });
});
