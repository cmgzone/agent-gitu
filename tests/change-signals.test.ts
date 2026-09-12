import { describe, expect, it } from 'vitest';
import { scoreRecentChangePaths } from '../src/context/change-signals.js';

describe('change-history context signals', () => {
  it('prefers recently changed paths and gives dirty work an extra bounded boost', () => {
    const scores = scoreRecentChangePaths('src/current.ts\nsrc/shared.ts\n\nsrc/older.ts\nsrc/shared.ts\n', ' M src/older.ts\n?? src/new-file.ts\n');

    expect(scores.get('src/current.ts')).toBeGreaterThan(0.5);
    expect(scores.get('src/shared.ts')).toBeGreaterThan(scores.get('src/current.ts') ?? 1);
    expect(scores.get('src/older.ts')).toBe(1); // dirty work is strongest
    expect(scores.get('src/new-file.ts')).toBeGreaterThan(0.5);
  });

  it('drops empty and escaping paths', () => {
    const scores = scoreRecentChangePaths('\n../secret.txt\n./src/ok.ts\n');
    expect([...scores.keys()]).toEqual(['src/ok.ts']);
  });

  it('decays per commit in the real --format=%x01 output (marker + blank line per block)', () => {
    const marker = '\x01';
    const log = [marker, '', 'src/newest.ts', marker, '', 'src/middle.ts', marker, '', 'src/oldest.ts', ''].join('\n');
    const scores = scoreRecentChangePaths(log);
    // Exactly one decay per commit boundary: 1, 0.78, 0.6084.
    expect(scores.get('src/newest.ts')).toBeCloseTo(1, 5);
    expect(scores.get('src/middle.ts')).toBeCloseTo(0.78, 5);
    expect(scores.get('src/oldest.ts')).toBeCloseTo(0.78 * 0.78, 5);
  });
});
